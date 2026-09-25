// N-body gravity in a real browser: the three tiers and the switches between them.
//
//   node tools/nbodycheck.mjs
//
// Needs Playwright with a Chromium (npm i --no-save playwright); without it the
// check prints "skipping", and a skipped check is not a passed one. Serves the
// repo itself on a free port.
//
// Full N-body (F) steps every body at a substep set by the fastest orbit in the
// system. Above what it can follow, tier A integrates the star, the planets and
// anything loose while each moon rides its planet on its exact two-body orbit;
// above that, tier K carries every body on its exact two-body orbit. Checked
// here, in both systems:
//   - the hierarchy: every book moon is bound to its book planet, planets are top level
//   - the clock picks F, A or K from the warp asked for, and comes back down
//   - what each tier achieves, in simulated years per second
//   - energy and angular momentum per tier; moons keep their orbits
//   - a switch in either direction is exact, and a F-A-K-A-F round trip keeps
//     every orbit
//   - a close approach hands the clock back to full N-body
//   - the climate's starlight: the orbit average in A and K matches what F
//     accumulates substep by substep
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch (_) { /* try the global install */ }
  try {
    const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return await import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
  } catch (_) { return null; }
}
const pw = await loadPlaywright();
if (!pw) { console.log('skipping: Playwright not installed (npm i --no-save playwright)'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${msg}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${msg}${extra ? '  ' + extra : ''}`); }
};
const info = (msg) => console.log(`  info ${msg}`);
const section = (s) => console.log(`\n${s}`);

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function openSystem(sys) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().split('\n')[0]); });
  // both editions: the climate one keeps its own key
  await page.addInitScript((s) => { try { localStorage.setItem('ra-climate-system', s); localStorage.setItem('ra-system', s); } catch (_) {} }, sys);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof bodies !== 'undefined' && bodies.length > 5, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // helpers inside the page: energy, angular momentum, orbits about a parent
  await page.evaluate(() => {
    window.__nb = {
      energy() {
        const L = nbList(); let T = 0, U = 0;
        for (const b of L) T += 0.5 * b.nb.gm * b.nb.v.lengthSq();
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++)
          U -= L[i].nb.gm * L[j].nb.gm / L[i].nb.r.distanceTo(L[j].nb.r);
        return T + U;
      },
      angmom() {
        const v = new THREE.Vector3();
        for (const b of nbList()) v.add(new THREE.Vector3().crossVectors(b.nb.r, b.nb.v).multiplyScalar(b.nb.gm));
        return v.length();
      },
      rel(key, pkey) {      // {a, e, bound} of key about pkey
        const b = bodies.find((x) => x.data.key === key), p = bodies.find((x) => x.data.key === pkey);
        const r = b.nb.r.clone().sub(p.nb.r), v = b.nb.v.clone().sub(p.nb.v), mu = b.nb.gm + p.nb.gm;
        const a = 1 / (2 / r.length() - v.lengthSq() / mu);
        const ev = r.clone().multiplyScalar(v.lengthSq() - mu / r.length()).addScaledVector(v, -r.dot(v)).multiplyScalar(1 / mu);
        return { a, e: ev.length(), bound: a > 0 && ev.length() < 1 };
      },
      jacobi() {            // {root key: a about the barycentre of the star and everything inside it}
        const H = nbHierarchy(), s = H.star, g = {}, T = [];
        for (const R of H.roots) { if (R === s) continue; nbGroup(H, R, g); T.push({ k: R.data.key, gm: g.gm, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz,
          d: Math.hypot(g.x - s.nb.r.x, g.y - s.nb.r.y, g.z - s.nb.r.z) }); }
        for (const q of T) { const mu = s.nb.gm + q.gm, r = Math.hypot(q.x - s.nb.r.x, q.y - s.nb.r.y, q.z - s.nb.r.z),
          v2 = (q.vx - s.nb.v.x) ** 2 + (q.vy - s.nb.v.y) ** 2 + (q.vz - s.nb.v.z) ** 2, a = 1 / (2 / r - v2 / mu); q.d = a > 0 ? a : 1e12 + r; }
        T.sort((p, q) => p.d - q.d);          // the order tier K uses: by semi-major axis
        let M = s.nb.gm, c = s.nb.r.clone(), cv = s.nb.v.clone(); const out = {};
        for (const q of T) { const r = new THREE.Vector3(q.x, q.y, q.z).sub(c), v = new THREE.Vector3(q.vx, q.vy, q.vz).sub(cv), Mn = M + q.gm;
          out[q.k] = 1 / (2 / r.length() - v.lengthSq() / Mn);
          c.addScaledVector(r, q.gm / Mn); cv.addScaledVector(v, q.gm / Mn); M = Mn; }
        return out;
      },
      treeA() {             // {key: a of its Jacobi orbit}: moons about their planet and the moons inside them
        const H = nbHierarchy(), T = nbTree(H), o = {};
        for (let c = 0; c < T.n; c++) { if (c === T.s) continue; const J = T.J;
          const r = Math.hypot(J.x[c], J.y[c], J.z[c]), v2 = J.vx[c] ** 2 + J.vy[c] ** 2 + J.vz[c] ** 2;
          o[T.list[c].data.key] = 1 / (2 / r - v2 / T.mu[c]); }
        return o;
      },
      bookMoons() { return (DS.MOONS || []).concat(DS.HORUS_MOONS || []).map((m) => [m.key, m.parent])
        .filter(([k, p]) => bodies.some((b) => b.data.key === k && b.nb) && bodies.some((b) => b.data.key === p && b.nb)); },
      planets() { const s = nbStar(); return nbList().filter((b) => b !== s && !(DS.MOONS || []).concat(DS.HORUS_MOONS || []).some((m) => m.key === b.data.key)).map((b) => b.data.key); },
      state() { return JSON.stringify(nbList().map((b) => [b.data.key, b.nb.r.toArray(), b.nb.v.toArray()])); },
      put(js) { for (const [k, r, v] of JSON.parse(js)) { const b = bodies.find((x) => x.data.key === k); b.nb.r.fromArray(r); b.nb.v.fromArray(v); } },
      maxDiff(js) { let m = 0; for (const [k, r, v] of JSON.parse(js)) { const b = bodies.find((x) => x.data.key === k);
        m = Math.max(m, b.nb.r.distanceTo(new THREE.Vector3().fromArray(r)), b.nb.v.distanceTo(new THREE.Vector3().fromArray(v))); } return m; },
    };
  });
  return { page, errors };
}
const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

try {
  for (const sys of ['sol', 'ra']) {
    section(`${sys}: the hierarchy`);
    const { page, errors } = await openSystem(sys);
    const has = await page.evaluate(() => typeof nbHierarchy === 'function' && typeof nbStepA === 'function' && typeof nbStepK === 'function');
    ok(has, 'the three tiers exist');
    if (!has) { await page.close(); continue; }
    await page.evaluate(() => { if (playing) togglePlay(); if (!nbodyOn) toggleNbody(); });
    const hz = await page.evaluate(() => {
      const H = nbHierarchy(), wrong = [];
      for (const [k, p] of __nb.bookMoons()) { const b = bodies.find((x) => x.data.key === k), q = H.par.get(b); if (!q || q.data.key !== p) wrong.push(k + '→' + (q ? q.data.key : 'top')); }
      const planetsTop = __nb.planets().every((k) => H.roots.includes(bodies.find((x) => x.data.key === k)));
      const T = H.ok ? nbTree(H) : null;
      return { ok: H.ok, roots: H.roots.length, n: H.list.length, wrong, planetsTop, hA: T ? T.hA : 0, hF: T ? T.hF : 0 };
    });
    ok(hz.ok && hz.wrong.length === 0, 'every book moon is bound to its book parent', hz.wrong.join(' ') || `${hz.n - hz.roots} moons`);
    ok(hz.planetsTop, 'every planet is top level, orbiting the star');
    ok(hz.hA > hz.hF, 'tier A steps at the fastest top-level orbit, full gravity at the fastest of all',
      `${(hz.hA * 365.25 * 24).toFixed(1)} h vs ${(hz.hF * 365.25 * 24).toFixed(2)} h (×${(hz.hA / hz.hF).toFixed(1)})`);

    section(`${sys}: each tier on its own`);
    const s0 = await page.evaluate(() => __nb.state());
    // a switch is exact: a zero-length step in any tier changes nothing
    const zero = await page.evaluate((js) => { const H = nbHierarchy(); nbStepA(0, H); const a = __nb.maxDiff(js); nbStepK(0, nbHierarchy()); return [a, __nb.maxDiff(js)]; }, s0);
    ok(zero[0] < 1e-15 && zero[1] < 1e-15, 'switching tier moves nothing', zero.map((x) => x.toExponential(1)).join(' / '));
    // F: one year in frame-sized steps
    const runF = await page.evaluate(() => {
      const E0 = __nb.energy(), L0 = __nb.angmom(), m0 = Object.fromEntries(__nb.bookMoons().map(([k, p]) => [k, __nb.rel(k, p).a]));
      const t0 = performance.now(); for (let i = 0; i < 100; i++) nbStepF(0.01, nbHierarchy()); const ms = performance.now() - t0;
      const lost = __nb.bookMoons().filter(([k, p]) => !__nb.rel(k, p).bound || Math.abs(__nb.rel(k, p).a / m0[k] - 1) > 0.05).map(([k]) => k);
      return { dE: Math.abs(__nb.energy() / E0 - 1), dL: Math.abs(__nb.angmom() / L0 - 1), lost, rate: 1 / (ms / 1000) };
    });
    ok(runF.dE < 1e-7 && runF.dL < 1e-10, 'F: energy and angular momentum over 1 yr', `dE ${runF.dE.toExponential(1)} dL ${runF.dL.toExponential(1)}`);
    ok(runF.lost.length === 0, 'F: every moon keeps its orbit', runF.lost.join(' '));
    info(`F integrates ${runF.rate.toPrecision(3)} yr per wall second here (no rendering)`);
    await page.evaluate((js) => __nb.put(js), s0);
    // A: a thousand years in frame-sized steps
    const runA = await page.evaluate(() => {
      const E0 = __nb.energy(), L0 = __nb.angmom(), moons = __nb.bookMoons(), m0 = __nb.treeA();
      const P0 = __nb.jacobi();
      let dEmax = 0; const t0 = performance.now(); let t = 0;
      for (let i = 0; i < 2000; i++) { const H = nbHierarchy(); H.hA = nbTierAStep(H); t += nbStepA(0.5, H); if (i % 50 === 0) dEmax = Math.max(dEmax, Math.abs(__nb.energy() / E0 - 1)); }
      const ms = performance.now() - t0;
      const m1 = __nb.treeA(), drift = moons.map(([k]) => [k, Math.abs(m1[k] / m0[k] - 1)]).filter(([, d]) => !(d < 1e-6));
      const P1 = __nb.jacobi(), pd = Object.entries(P0).map(([k, a]) => [k, Math.abs(P1[k] / a - 1)]).sort((x, y) => y[1] - x[1]);
      return { t, dE: dEmax, dL: Math.abs(__nb.angmom() / L0 - 1), drift, pd: pd[0], rate: t / (ms / 1000), enc: _nbEncounter };
    });
    // (phases are random per page load: Pluto may meet Neptune, and a close approach is F's to follow)
    ok(Math.abs(runA.t - 1000) < 1e-6 || runA.enc, 'A: a thousand years, or up to a close approach', runA.t.toFixed(3) + ' yr' + (runA.enc ? ' (encounter)' : ''));
    ok(runA.dE < 1e-3 && runA.dL < 1e-4, 'A: energy and angular momentum over 1 kyr', `dE ${runA.dE.toExponential(1)} dL ${runA.dL.toExponential(1)}`);
    ok(runA.drift.length === 0, 'A: every moon keeps its orbit exactly (about its planet and the moons inside it)', runA.drift.map(([k, d]) => k + ' ' + d.toExponential(1)).join(' '));
    info(`A over 1 kyr: largest change of a top-level orbit ${runA.pd[0]} ${(runA.pd[1] * 100).toFixed(3)} % (their own dynamics)`);
    info(`A integrates ${runA.rate.toPrecision(3)} yr per wall second here`);
    await page.evaluate((js) => __nb.put(js), s0);
    // A against full N-body at a step fine enough to be the truth (2e-7 yr, in
    // calls short enough that the 3000-substep cap per call never stretches it),
    // over 0.05 yr: the top-level bodies (planets with moons as barycentres)
    const vsF = await page.evaluate((js) => {
      const T = 0.05, bary = () => { const H = nbHierarchy(), g = {}, o = {};
        for (const R of H.roots) { if (R === H.star) continue; nbGroup(H, R, g); o[R.data.key] = [g.x - H.star.nb.r.x, g.y - H.star.nb.r.y, g.z - H.star.nb.r.z]; } return o; };
      const worst = (ref, x) => { let w = ['', 0]; for (const k of Object.keys(ref)) { const d = Math.hypot(ref[k][0] - x[k][0], ref[k][1] - x[k][1], ref[k][2] - x[k][2]) / Math.hypot(...ref[k]); if (d > w[1]) w = [k, d]; } return w; };
      const h0 = _nbH;
      // (the reference is the plain leapfrog at a tiny step: an independent method)
      __nb.put(js); _nbH = 2e-7; _nbSoft = 1e-20; for (let i = 0; i < 100; i++) nbStep(T / 100); _nbH = h0; _nbSoft = 1e-12;
      const ref = bary(), refAll = __nb.state();
      __nb.put(js); for (let i = 0; i < 10; i++) nbStep(T / 10); const lf = bary();
      __nb.put(js); for (let i = 0; i < 10; i++) nbStepF(T / 10, nbHierarchy()); const f = bary(), fAll = __nb.state();
      __nb.put(js); for (let i = 0; i < 10; i++) { const H = nbHierarchy(); H.hA = nbTierAStep(H); nbStepA(T / 10, H); } const a = bary();
      // every body, moons included, for full gravity: a hundredth of a year
      // against a leapfrog at 2.5e-8 yr (Phobos needs it: at 2e-7 the leapfrog
      // itself is 5e-5 off its orbit in that time)
      const Tm = 0.01, H0 = nbHierarchy(), parOf = Object.fromEntries(H0.list.map((b) => [b.data.key, H0.par.get(b) ? H0.par.get(b).data.key : null]));
      __nb.put(js); _nbH = 2.5e-8; _nbSoft = 1e-20; for (let i = 0; i < 200; i++) nbStep(Tm / 200); _nbH = h0; _nbSoft = 1e-12;
      const R = Object.fromEntries(JSON.parse(__nb.state()).map(([k, r]) => [k, r]));
      __nb.put(js); for (let i = 0; i < 5; i++) nbStepF(Tm / 5, nbHierarchy());
      const FA = Object.fromEntries(JSON.parse(__nb.state()).map(([k, r]) => [k, r]));
      const S = R[nbStar().data.key]; let wm = ['', 0];
      for (const k of Object.keys(R)) { if (k === nbStar().data.key) continue;
        const o = parOf[k] ? R[parOf[k]] : S;
        const d = Math.hypot(R[k][0] - FA[k][0], R[k][1] - FA[k][1], R[k][2] - FA[k][2]) / Math.hypot(R[k][0] - o[0], R[k][1] - o[1], R[k][2] - o[2]);
        if (d > wm[1]) wm = [k, d]; }
      return { T, A: worst(ref, a), F: worst(ref, f), LF: worst(ref, lf), Fall: wm };
    }, s0);
    ok(vsF.A[1] < 1e-5, `A follows the true motion: every planet within 1e-5 of its distance after ${vsF.T} yr`, `worst ${vsF.A[0]} ${vsF.A[1].toExponential(1)}`);
    ok(vsF.F[1] < 1e-6 && vsF.Fall[1] < 1e-4, `F follows it too, and every moon within 1e-4 of its orbit's size after 0.01 yr`,
      `planets ${vsF.F[1].toExponential(1)}, worst body ${vsF.Fall[0]} ${vsF.Fall[1].toExponential(1)}`);
    info(`the old leapfrog at its own step, same test: worst ${vsF.LF[0]} ${vsF.LF[1].toExponential(1)}`);
    await page.evaluate((js) => __nb.put(js), s0);
    // K: a million years
    const runK = await page.evaluate(() => {
      const L0 = __nb.angmom(), moons = __nb.bookMoons(), m0 = __nb.treeA();
      const P0 = __nb.jacobi();
      const t0 = performance.now(); for (let i = 0; i < 1000; i++) nbStepK(1000, nbHierarchy()); const ms = performance.now() - t0;
      const m1 = __nb.treeA(), P1 = __nb.jacobi(), md = moons.map(([k]) => Math.abs(m1[k] / m0[k] - 1)), pd = Object.keys(P0).map((k) => Math.abs(P1[k] / P0[k] - 1));
      return { md: Math.max(...md), pd: Math.max(...pd), dL: Math.abs(__nb.angmom() / L0 - 1), msPerStep: ms / 1000 };
    });
    ok(runK.md < 1e-8 && runK.pd < 1e-9, 'K: a million years on exactly the orbits gravity left (to rounding)', `moons ${runK.md.toExponential(1)}, planets ${runK.pd.toExponential(1)}`);
    ok(runK.dL < 1e-7, 'K: angular momentum over 1 Myr', runK.dL.toExponential(1));
    info(`K costs ${(runK.msPerStep * 1000).toFixed(0)} µs per frame`);
    await page.evaluate((js) => __nb.put(js), s0);

    section(`${sys}: the round trip`);
    const trip = await page.evaluate(() => {
      const P0 = __nb.jacobi(), moons = __nb.bookMoons();
      for (let i = 0; i < 5; i++) nbStepF(0.01, nbHierarchy());
      for (let i = 0; i < 20; i++) { const H = nbHierarchy(); H.hA = nbTierAStep(H); nbStepA(0.5, H); }
      for (let i = 0; i < 10; i++) nbStepK(100, nbHierarchy());
      for (let i = 0; i < 20; i++) { const H = nbHierarchy(); H.hA = nbTierAStep(H); nbStepA(0.5, H); }
      for (let i = 0; i < 5; i++) nbStepF(0.01, nbHierarchy());
      const P1 = __nb.jacobi(), pw = Object.keys(P0).map((k) => [k, Math.abs(P1[k] / P0[k] - 1)]).sort((x, y) => y[1] - x[1])[0];
      const lost = moons.filter(([k, p]) => !__nb.rel(k, p).bound).map(([k]) => k);
      return { pd: pw[1], pk: pw[0], lost };
    });
    // (a broken switch moves an orbit by tens of per cent; what is left is the
    // planets' own dynamics over the trip, Pluto meeting Neptune at random phases)
    ok(trip.pd < 5e-2 && trip.lost.length === 0, 'F → A → K → A → F keeps every planet on its orbit and every moon on its planet',
      `largest change ${trip.pk} ${(trip.pd * 100).toFixed(3)} %` + (trip.lost.length ? ' lost ' + trip.lost.join(' ') : ''));
    await page.evaluate((js) => __nb.put(js), s0);

    section(`${sys}: the clock picks the tier`);
    const plan = await page.evaluate(() => {
      // with the cost of a substep pinned, the choice is the caps' alone
      const ms0 = [_nbMsPerStep, _nbMsA], enc0 = _nbEncounter, out = []; _nbEncounter = false;
      const H0 = nbHierarchy(), nA = H0.roots.length, nF = H0.list.length;
      _nbMsPerStep = 0.001 * (nF * nF + 30 * nF); _nbMsA = 0.001 * (nA * nA + 30 * nA); nbPlan(1e-12, 1 / 30);
      const F = _nbCaps.F / 30, A = _nbCaps.A / 30;
      for (const w of [0.5 * F, Math.sqrt(F * A), 3 * A, 0.9 * A, 0.5 * A, 0.5 * F]) {
        nbPlan(w, 1 / 30); out.push(nbTier + (nbTier === 'A' ? ':' + document.getElementById('t-nbody').textContent.split('·')[1] : '')); }
      _nbEncounter = true; nbPlan(Math.sqrt(F * A), 1 / 30); const enc = [nbTier, _nbCapped]; _nbEncounter = false;
      _nbMsPerStep = ms0[0]; _nbMsA = ms0[1]; _nbEncounter = enc0;
      return { out, enc, ratio: A / F };
    });
    ok(plan.out.map((t) => t[0]).join('') === 'FAKKAF', 'the plan: slow F, between the caps A, past A\'s cap K, back down A then F',
      plan.out.join(' ') + ` (A's cap ${plan.ratio.toFixed(1)}× F's)`);
    ok(/fast|rýchl/i.test(plan.out[1]), 'the button says when tier A runs', plan.out[1]);
    ok(plan.enc[0] === 'F' && plan.enc[1], 'with bodies passing close, between the caps is F at its cap', plan.enc.join(' '));
    const tierAt = async (yps) => {
      await page.evaluate((w) => { if (!playing) togglePlay(); timeScale = w / YEARS_PER_SEC; updateSpeedCapUI(); }, yps);
      await page.waitForTimeout(1200);
      // both ends read inside a frame, right after the clock moved
      const inFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(() => r([elapsedYears, performance.now()]), 0))));
      const t0 = await inFrame();
      await page.waitForTimeout(2500);
      const t1 = await inFrame();
      return page.evaluate(([t0, t1]) => ({ tier: nbTier, rate: (t1[0] - t0[0]) / ((t1[1] - t0[1]) / 1000),
        btn: document.getElementById('t-nbody').textContent, speed: document.getElementById('speedval').textContent }), [t0, t1]);
    };
    await tierAt(0.002);
    const caps = await page.evaluate(() => ({ F: _nbCaps.F, A: _nbCaps.A }));
    const wantA = 0.4 * caps.A;                   // well past F, safely inside A
    info(`caps now: F ${caps.F.toPrecision(3)} yr/s, A ${caps.A.toPrecision(3)} yr/s; probing A at ${wantA.toPrecision(3)}`);
    const tF = await tierAt(0.002), tA = await tierAt(wantA), tK = await tierAt(1e5), tBack = await tierAt(0.002);
    ok(tF.tier === 'F' && tK.tier === 'K' && tBack.tier === 'F', 'running: slow → F, 100 kyr/s → K, and back to F',
      [tF, tA, tK, tBack].map((x) => x.tier).join(' ') + ' (the middle one follows this machine\'s live caps)');
    ok(Math.abs(tA.rate / wantA - 1) < 0.25 && Math.abs(tK.rate / 1e5 - 1) < 0.2, 'past full N-body\'s cap the clock still runs at the rate asked for',
      `${tA.rate.toPrecision(3)} (${tA.tier}) and ${tK.rate.toPrecision(3)} yr/s`);
    ok(/Kepler/i.test(tK.btn) && !/fast|Kepler/i.test(tF.btn), 'the button names the tier', `"${tF.btn}" / "${tK.btn}"`);
    info(`achieved: F ${tF.rate.toPrecision(3)} yr/s at 0.002 asked; A ${tA.rate.toPrecision(3)}; K ${tK.rate.toPrecision(3)}`);
    await page.evaluate(() => { if (playing) togglePlay(); });
    await page.evaluate((js) => __nb.put(js), s0);

    section(`${sys}: a close approach hands back to full N-body`);
    const enc = await page.evaluate(() => {
      // a Mars-mass body passing the first planet with moons, close enough that
      // its tide on them rivals the star's (inside 2·D·∛(m/M★)), sideways at 0.5 km/s
      const H0 = nbHierarchy(), s = H0.star; const P = H0.roots.find((b) => (H0.desc.get(b) || []).length > 0 && b !== s);
      const m = 6.4e23;
      createCustomBody({ kind: CR_KINDS[0].kind, a: 1.0, e: 0.0, massKg: m, radiusKm: 3390 });
      const c = bodies[bodies.length - 1];
      if (!c.nb) return { err: 'no nb state for the custom' };
      const D = P.nb.r.distanceTo(s.nb.r), lim = 2 * D * Math.cbrt(c.nb.gm / s.nb.gm);
      const out = P.nb.r.clone().sub(s.nb.r).normalize(), side = new THREE.Vector3(0, 1, 0).cross(out).normalize();
      const vesc = Math.sqrt(2 * (P.nb.gm + c.nb.gm) / (0.6 * lim));      // passing, not captured
      c.nb.r.copy(P.nb.r).addScaledVector(out, 0.6 * lim); c.nb.v.copy(P.nb.v).addScaledVector(side, 1.5 * vesc);
      const H = nbHierarchy(); H.hA = nbTierAStep(H);
      const before = nbEncounter(H, 2), clear = nbEncounter(H, 0.5);
      const t = nbStepA(0.5, H);
      // and the next frame, asked for tier A's speed, gets full N-body at its cap
      nbPlan(1e-12, 1 / 30);                      // the caps for a 30 fps frame
      const want = 1.5 * _nbCaps.F / 30, plan = nbPlan(want, 1 / 30);
      return { P: P.data.key, lim: +lim.toPrecision(3), before, clear, t: +t.toPrecision(3), enc: _nbEncounter,
        tier: nbTier, capped: _nbCapped && plan.dt < want, why: document.getElementById('speedval') ? (updateSpeedCapUI(), document.getElementById('speedval').title) : '' };
    });
    ok(enc.before && !enc.clear && enc.enc && enc.t < 0.5, 'a passer whose tide on a planet\'s moons rivals the star\'s stops tier A and flags the encounter', JSON.stringify(enc));
    ok(enc.tier === 'F' && enc.capped, 'while it passes, the clock runs full N-body at its cap', `${enc.tier} ${enc.why}`);
    await page.evaluate(() => { const c = bodies.filter((b) => b._custom).pop(); if (c) removeBody(c, true); });
    await page.evaluate((js) => __nb.put(js), s0);

    section(`${sys}: on by default`);
    // a fresh page, a save from before the default (its "off" was the old default),
    // and a save made with N-body switched off on purpose
    ok(await page.evaluate(() => { const k = stateKey(); return !localStorage.getItem(k); }) && errors.length === 0,
      'this page opened without a save');
    const fresh = await (async () => { const p2 = await openSystem(sys); const on = await p2.page.evaluate(() => nbodyOn);
      const old = await p2.page.evaluate(() => { if (!nbodyOn) toggleNbody(); saveSystemState(); const st = JSON.parse(localStorage.getItem(stateKey()));
        st.nbodyOn = false; delete st.nbDef; localStorage.setItem(stateKey(), JSON.stringify(st)); window.__stay = 1; document.getElementById('t-load').click(); return nbodyOn; });
      const off = await p2.page.evaluate(() => { toggleNbody(); saveSystemState(); window.__stay = 2; document.getElementById('t-load').click(); return [nbodyOn, window.__stay]; });
      await p2.page.evaluate(() => { try { localStorage.removeItem(stateKey()); } catch (_) {} });
      await p2.page.close(); return { on, old, off }; })();
    ok(fresh.on, 'a fresh page runs under N-body');
    ok(fresh.old, 'a save from before N-body was the default loads under N-body');
    ok(fresh.off[0] === false && fresh.off[1] === 2, 'a save made with N-body off keeps it off, loaded in place');

    if (await page.evaluate(() => !!window.RAClimateView)) {
      section(`${sys}: starlight in every tier`);
      const lit = await page.evaluate(() => {
        // over one year, the mean flux each world receives from each source, in F, A and K
        const keys = [...RAClimateView.bodies.keys()].filter((k) => bodies.find((b) => b.data.key === k && b.nb));
        const s0 = __nb.state();
        const mean = (step) => {
          __nb.put(s0); const acc = {};
          for (let i = 0; i < 50; i++) { step(0.02); for (const k of keys) { const r = bodies.find((b) => b.data.key === k), f = r._climNbFlux || {};
            for (const [s, v] of Object.entries(f)) acc[k + ':' + s] = (acc[k + ':' + s] || 0) + v / 50; } }
          return acc;
        };
        const F = mean((dt) => nbStepF(dt, nbHierarchy()));
        const A = mean((dt) => { const H = nbHierarchy(); H.hA = nbTierAStep(H); nbStepA(dt, H); });
        const K = mean((dt) => nbStepK(dt, nbHierarchy()));
        __nb.put(s0);
        const worst = (X) => { let w = ['', 0]; for (const [k, v] of Object.entries(F)) { if (!(v > 1e-3)) continue; const d = Math.abs((X[k] || 0) / v - 1); if (d > w[1]) w = [k, d]; } return w; };
        return { n: Object.keys(F).length, A: worst(A), K: worst(K) };
      });
      ok(lit.n > 5 && lit.A[1] < 0.02 && lit.K[1] < 0.02, 'each world\'s yearly starlight in A and K matches full N-body',
        `worst A ${lit.A[0]} ${(lit.A[1] * 100).toFixed(2)} %, K ${lit.K[0]} ${(lit.K[1] * 100).toFixed(2)} %`);
    }
    ok(errors.length === 0, 'nothing throws', errors.slice(0, 3).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
