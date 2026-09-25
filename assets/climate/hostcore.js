// The message protocol between the orrery and the climate, independent of
// where the climate runs. worker.js wraps it in a Web Worker; bridge.js wraps it
// on the main thread when a worker cannot be had. Both call work() to spend a
// slice of wall clock on physics and flush() to post what changed.
//
// In (from the orrery):
//   add      {key, sys, data, flux, starTemp, snapshot?}   a body gets a climate
//   remove   {key}
//   reset    {key}                   back to its profile's settled start
//   tick     {dt, rate, forcing}     dt simulated years; forcing {key:{flux,starTemp}}
//   set      {key, patch}            a control edit
//   impulse  {key, joules, waterKg}  an impact, a laser, a supernova front
//   focus    {key}                   stream detail for this world
//   snapshot {id}                    reply with every world's saved state
//   restore  {worlds}                {key: snapshot}
//   analyze  {key, W, H, rgba, dem, hints}
// Out:
//   ready    {RS, STATE_IDS, STATES}
//   added    {key, ok, meta, rs0}
//   state    {keys, data}            data: Float32Array, RS.SIZE per key
//   detail   {...}                   for the focused world
//   snapshot {id, worlds}
//   analysis {key, W, H, bytes, cdf, s0, landAvg, seaAvg}
//   stats    {steps, busyMs, worlds}
import { ClimateSystem, RS, STATE_IDS } from './system.js';
import { STATES } from './physics/classify.js';
import { SPINUP } from './spinup.js';
import { analyseSurface, cloudField, CLOUD_W, CLOUD_H } from './analysis.js';

export function createHost(post, onAsync = null) {
  const sys = new ClimateSystem();
  let focus = null, dirty = false, lastState = 0, lastDetail = 0, lastStats = 0, cloudsSent = false;
  let stepsAtStats = 0, busyAtStats = 0;
  const clock = (typeof performance !== 'undefined') ? () => performance.now() : () => Date.now();

  const spinupFor = (sysName, key) => (SPINUP[sysName] && SPINUP[sysName][key]) || null;

  function handle(m) {
    switch (m.type) {
      case 'add': {
        const snap = m.snapshot || (m.data && !m.data.custom ? spinupFor(m.sys, m.data.key) : null);
        let ok = false;
        try {
          ok = sys.add(m.key, m.sys, m.data, { snapshot: snap, flux: m.flux, starTemp: m.starTemp });
        } catch (err) {
          post({ type: 'error', where: 'add', key: m.key, message: String(err && err.message || err) });
        }
        const r = sys.worlds.get(m.key);
        post({ type: 'added', key: m.key, ok, meta: r ? r.meta : null,
               rs0: r ? Float32Array.from(r.rs) : null });
        dirty = true;
        break;
      }
      case 'remove': sys.remove(m.key); dirty = true; break;
      case 'reset': {
        const r = sys.worlds.get(m.key);
        if (r) sys.reset(m.key, r.data.custom ? null : spinupFor(r.sys, r.data.key));
        const r2 = sys.worlds.get(m.key);
        if (r2) post({ type: 'added', key: m.key, ok: true, meta: r2.meta, rs0: Float32Array.from(r2.rs), reset: true });
        dirty = true;
        break;
      }
      case 'tick': sys.tick(m.dt, m.rate, m.forcing); break;
      case 'set': sys.set(m.key, m.patch); dirty = true; lastDetail = 0; break;
      case 'impulse': sys.impulse(m.key, m.joules, m.waterKg); dirty = true; break;
      case 'focus': focus = m.key; lastDetail = 0; break;
      case 'snapshot': post({ type: 'snapshot', id: m.id, worlds: sys.snapshot() }); break;
      case 'restore':
        for (const [k, s] of Object.entries(m.worlds || {})) {
          try { sys.restore(k, s); } catch (err) {
            post({ type: 'error', where: 'restore', key: k, message: String(err && err.message || err) });
          }
        }
        dirty = true;
        break;
      case 'analyzeUrl': {
        // Fetch the map (from the browser's cache) and decode + shrink it here,
        // so the page's thread never touches the pixels at all.
        const load = async (url) => {
          if (!url) return null;
          const res = await fetch(url);
          const blob = await res.blob();
          const bm = await createImageBitmap(blob, { resizeWidth: m.W, resizeHeight: m.H, resizeQuality: 'medium' });
          const c = new OffscreenCanvas(m.W, m.H), x = c.getContext('2d');
          x.drawImage(bm, 0, 0);
          const d = x.getImageData(0, 0, m.W, m.H).data;
          if (bm.close) bm.close();
          return d;
        };
        const ok = typeof fetch === 'function' && typeof createImageBitmap === 'function'
          && typeof OffscreenCanvas !== 'undefined';
        if (!ok) { post({ type: 'analysis-failed', key: m.key, token: m.token, needPixels: true }); break; }
        Promise.all([load(m.url), load(m.demUrl)]).then(([rgba, dem]) => {
          handle({ type: 'analyze', key: m.key, W: m.W, H: m.H, rgba, dem, hints: m.hints, token: m.token });
          if (onAsync) onAsync();
        }).catch((err) => {
          post({ type: 'analysis-failed', key: m.key, token: m.token, needPixels: true,
                 message: String(err && err.message || err) });
        });
        break;
      }
      case 'analyzeBitmap': {
        // The map arrives already shrunk; read it back here, off the page's thread.
        const read = (bm) => {
          if (!bm) return null;
          const c = new OffscreenCanvas(m.W, m.H), x = c.getContext('2d');
          x.drawImage(bm, 0, 0);
          const d = x.getImageData(0, 0, m.W, m.H).data;
          if (bm.close) bm.close();
          return d;
        };
        try {
          handle({ type: 'analyze', key: m.key, W: m.W, H: m.H, rgba: read(m.bitmap), dem: read(m.demBitmap),
                   hints: m.hints, token: m.token });
        } catch (err) {
          post({ type: 'error', where: 'analyzeBitmap', key: m.key, message: String(err && err.message || err) });
          post({ type: 'analysis-failed', key: m.key, token: m.token });
        }
        break;
      }
      case 'analyze': {
        try {
          const a = analyseSurface(m.W, m.H, m.rgba, m.dem, m.hints);
          // One cloud texture serves every world (each samples it at its own
          // offset), so it is built once, with the first map.
          const clouds = cloudsSent ? null : cloudField(4242);
          cloudsSent = true;
          const tr = [a.bytes.buffer];
          if (clouds) tr.push(clouds.buffer);
          post({ type: 'analysis', key: m.key, W: a.W, H: a.H, bytes: a.bytes, cdf: a.cdf, s0: a.s0,
                 landAvg: a.landAvg, seaAvg: a.seaAvg, clouds, CW: CLOUD_W, CH: CLOUD_H, token: m.token }, tr);
        } catch (err) {
          post({ type: 'error', where: 'analyze', key: m.key, message: String(err && err.message || err) });
          post({ type: 'analysis-failed', key: m.key, token: m.token });
        }
        break;
      }
      default: break;
    }
  }

  // Spend up to `budgetMs` on physics. True if there is more to do.
  function work(budgetMs) {
    const before = sys.stepsTaken;
    let pending = false;
    try { pending = sys.run(budgetMs); } catch (err) {
      post({ type: 'error', where: 'run', message: String(err && err.stack || err) });
    }
    if (sys.stepsTaken !== before) dirty = true;
    return pending;
  }

  // Post the render records (at most ~30 Hz), the focused world's detail (~4
  // Hz) and the throughput (1 Hz).
  function flush(force = false) {
    const t = clock();
    if ((dirty && t - lastState > 33) || force) {
      const keys = [...sys.worlds.keys()];
      const data = new Float32Array(keys.length * RS.SIZE);
      keys.forEach((k, i) => data.set(sys.worlds.get(k).rs, i * RS.SIZE));
      post({ type: 'state', keys, data }, [data.buffer]);
      dirty = false; lastState = t;
    }
    if (focus && sys.worlds.has(focus) && t - lastDetail > 250) {
      post({ type: 'detail', detail: sys.detail(focus) });
      lastDetail = t;
    }
    if (t - lastStats > 1000) {
      const dt = (t - lastStats) / 1000;
      post({ type: 'stats', steps: (sys.stepsTaken - stepsAtStats) / dt,
             busy: (sys.busyMs - busyAtStats) / (dt * 1000), worlds: sys.worlds.size });
      stepsAtStats = sys.stepsTaken; busyAtStats = sys.busyMs; lastStats = t;
    }
  }

  function ready() {
    const states = {};
    for (const [k, s] of Object.entries(STATES)) states[k] = { name: s.name, color: s.color, blurb: s.blurb };
    post({ type: 'ready', RS, STATE_IDS, STATES: states });
  }

  return { handle, work, flush, ready, sys, isDirty: () => dirty };
}
