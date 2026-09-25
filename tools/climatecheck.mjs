// The climate half of the sandbox, checked without a browser.
//
//   node tools/climatecheck.mjs
//
// Loads every climate body of both systems through the same message protocol
// the page uses (hostcore.js), then checks what a player would notice first if
// it were wrong: that worlds open where the book puts them and stay there, that
// the starlight the orrery hands over actually moves them, that an impact heats
// a planet and it cools again, that edits reach the reservoirs, that a save
// restores the same world, that the frame rate does not change the climate, and
// that the surface analysis finds the sea on a map that has one.
import { loadSystems, bookInsolation } from './lib/bodies.mjs';
import { createHost } from '../assets/climate/hostcore.js';
import { ClimateSystem, RS } from '../assets/climate/system.js';
import { paramsFor, climateCapable, profileOf, LUMINOUS, STILL } from '../assets/climate/profiles.js';
import { SPINUP } from '../assets/climate/spinup.js';
import { analyseSurface, heightForShare } from '../assets/climate/analysis.js';
import { S_EARTH } from '../assets/climate/physics/constants.js';

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${msg}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${msg}${extra ? '  ' + extra : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

const systems = loadSystems();
const trim = (d) => ({ key: d.key, kind: d.kind, massKg: d.massKg, radiusKm: d.radiusKm,
  rotationPeriod: d.rotationPeriod, comp: d.comp, custom: !!d.custom });

function build(sysName) {
  const sys = new ClimateSystem();
  const ins = bookInsolation(sysName, systems[sysName], LUMINOUS);
  const keys = [];
  for (const d of systems[sysName].bodies) {
    if (!climateCapable(d)) continue;
    sys.add(d.key, sysName, trim(d), { snapshot: SPINUP[sysName][d.key],
      flux: ins[d.key].S * S_EARTH, starTemp: ins[d.key].starTemp });
    keys.push(d.key);
  }
  return { sys, ins, keys };
}
const forcingOf = (ins, keys) => Object.fromEntries(keys.map((k) => [k, { flux: ins[k].S * S_EARTH, starTemp: ins[k].starTemp }]));
function advance(sys, years, rate, fps, forcing) {
  const dt = rate / fps;
  for (let t = 0; t < years - 1e-12; t += dt) {
    sys.tick(Math.min(dt, years - t), rate, forcing);
    while (sys.run(1e9)) { /* spend everything */ }
  }
}

section('Every described body loads, from its spin-up, where the book puts it');
for (const sysName of ['sol', 'ra']) {
  const { sys, keys } = build(sysName);
  const cap = systems[sysName].bodies.filter(climateCapable).length;
  ok(keys.length === cap && keys.length >= 13, `${sysName}: ${keys.length} climate worlds`);
  for (const k of keys) {
    const r = sys.worlds.get(k);
    const T = r.rs[RS.TMEAN], T0 = SPINUP[sysName][k] ? null : null;
    const prof = profileOf(sysName, { key: k, kind: r.data.kind });
    if (prof.target != null) {
      ok(Math.abs(T - prof.target) < 3, `${sysName}/${k} opens at its documented temperature`,
         `${T.toFixed(1)} K vs ${prof.target} K`);
    }
    // The spin-up was taken with exactly these params; a stale table would
    // restore a world that is not the one the profile describes.
    const snap = SPINUP[sysName][k];
    const now = paramsFor(sysName, r.data);
    const drift = Object.keys(now).filter((p) => typeof now[p] === 'number' && p !== 'insolation'
      && p !== 'starTemp' && Math.abs((snap.params[p] ?? NaN) - now[p]) > 1e-9 * Math.max(1, Math.abs(now[p])));
    ok(drift.length === 0, `${sysName}/${k} spin-up matches its profile`, drift.length ? `stale: ${drift.join(',')}` : '');
  }
}

section('Held on the book orbit, worlds stay put');
for (const sysName of ['sol', 'ra']) {
  const { sys, ins, keys } = build(sysName);
  const T0 = Object.fromEntries(keys.map((k) => [k, sys.worlds.get(k).rs[RS.TMEAN]]));
  advance(sys, 2000, 50, 30, forcingOf(ins, keys));
  let worst = 0, worstKey = '';
  for (const k of keys) {
    const d = Math.abs(sys.worlds.get(k).rs[RS.TMEAN] - T0[k]);
    if (d > worst) { worst = d; worstKey = k; }
  }
  ok(worst < 1.5, `${sysName}: largest drift over 2 kyr`, `${worst.toFixed(2)} K (${worstKey})`);
}

section('The frame rate does not change the climate');
{
  const run = (fps) => {
    const { sys, ins, keys } = build('sol');
    const f = forcingOf(ins, keys);
    f.earth = { flux: 1.25 * S_EARTH, starTemp: 5772 };     // something to respond to
    advance(sys, 50, 2, fps, f);
    return sys.worlds.get('earth').rs[RS.TMEAN];
  };
  const a = run(60), b = run(20), c = run(7);
  ok(Math.abs(a - b) < 0.15 && Math.abs(a - c) < 0.15, 'Earth at 1.25 S⊕ after 50 yr: 60 / 20 / 7 fps',
     `${a.toFixed(3)} / ${b.toFixed(3)} / ${c.toFixed(3)} K`);
}

section('Starlight moves the planet');
{
  const { sys, ins, keys } = build('sol');
  const f = forcingOf(ins, keys);
  const T0 = sys.worlds.get('earth').rs[RS.TMEAN];
  f.earth = { flux: 0.8 * S_EARTH, starTemp: 5772 };
  advance(sys, 3e4, 1000, 30, f);
  const cold = sys.worlds.get('earth').rs[RS.TMEAN];
  ok(cold < T0 - 20, 'Earth at 0.8 S⊕ freezes', `${T0.toFixed(1)} -> ${cold.toFixed(1)} K`);
  const { sys: s2, ins: i2, keys: k2 } = build('sol');
  const f2 = forcingOf(i2, k2);
  f2.earth = { flux: 1.6 * S_EARTH, starTemp: 5772 };
  advance(s2, 3e4, 1000, 30, f2);
  const hot = s2.worlds.get('earth').rs[RS.TMEAN];
  ok(hot > 400, 'Earth at 1.6 S⊕ runs away', `${hot.toFixed(1)} K`);
}

section('An impact heats a world, and it cools again');
{
  const { sys, ins, keys } = build('sol');
  const f = forcingOf(ins, keys);
  const T0 = sys.worlds.get('earth').rs[RS.TMEAN];
  sys.impulse('earth', 1e26, 0);
  let peak = T0;
  for (let i = 0; i < 40; i++) { advance(sys, 0.05, 0.5, 10, f); peak = Math.max(peak, sys.worlds.get('earth').rs[RS.TMEAN]); }
  ok(peak > T0 + 5, '1e26 J on Earth: global warming pulse', `+${(peak - T0).toFixed(1)} K peak`);
  advance(sys, 300, 20, 30, f);
  const after = sys.worlds.get('earth').rs[RS.TMEAN];
  ok(Math.abs(after - T0) < 2, '...and three centuries later it has cooled back', `${(after - T0).toFixed(2)} K`);
  const w0 = sys.worlds.get('earth').sim.world.water.ocean;
  sys.impulse('earth', 0, 1.4e21 * 0.1);
  ok(Math.abs(sys.worlds.get('earth').sim.world.water.ocean - w0 - 0.1) < 1e-9, 'delivered water reaches the ocean');
}

section('Edits reach the reservoirs');
{
  const { sys } = build('sol');
  sys.set('mars', { co2Bar: 1.0 });
  const d = sys.detail('mars');
  ok(Math.abs(d.gas.co2 - 1.0) < 1e-6, 'Mars CO2 set to 1 bar', `${d.gas.co2.toPrecision(5)} bar`);
  sys.set('mars', { water: 0.5 });
  ok(Math.abs(sys.detail('mars').water.total - 0.5) < 1e-6, 'Mars water set to 0.5 ocean');
  sys.set('mars', { internalHeat: 3 });
  ok(sys.detail('mars').params.internalHeat === 3, 'interior heat is a base the pulses ride on');
}

section('A save restores the same world');
{
  const { sys, ins, keys } = build('ra');
  const f = forcingOf(ins, keys);
  advance(sys, 500, 20, 30, f);
  sys.impulse('satis', 5e25, 0);
  advance(sys, 0.3, 1, 30, f);
  const snap = sys.snapshot();
  const { sys: s2 } = build('ra');
  for (const [k, s] of Object.entries(snap)) s2.restore(k, JSON.parse(JSON.stringify(s)));
  advance(sys, 20, 5, 30, f);
  advance(s2, 20, 5, 30, f);
  const a = sys.worlds.get('satis').rs[RS.TMEAN], b = s2.worlds.get('satis').rs[RS.TMEAN];
  ok(Math.abs(a - b) < 1e-6, 'Satis mid-pulse, saved and restored, runs on identically', `${a.toFixed(6)} vs ${b.toFixed(6)}`);
}

section('The host speaks the protocol');
{
  const out = [];
  const host = createHost((m) => out.push(m));
  host.ready();
  const d = systems.sol.bodies.find((b) => b.key === 'earth');
  host.handle({ type: 'add', key: 'earth', sys: 'sol', data: trim(d), flux: S_EARTH, starTemp: 5772 });
  host.handle({ type: 'focus', key: 'earth' });
  host.handle({ type: 'tick', dt: 1, rate: 1, forcing: { earth: { flux: S_EARTH, starTemp: 5772 } } });
  while (host.work(50)) { /* */ }
  host.flush(true);
  const types = out.map((m) => m.type);
  ok(types[0] === 'ready' && types.includes('added') && types.includes('state') && types.includes('detail'),
     'ready, added, state and detail are posted', types.join(' '));
  const st = out.find((m) => m.type === 'state');
  ok(st && st.keys[0] === 'earth' && st.data.length === RS.SIZE, 'one render record per world');
}

section('The surface analysis finds the sea');
{
  const W = 256, H = 128;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const sea = x < W * 0.6;
    const pole = y < 6 || y >= H - 6;
    const c = pole ? [240, 244, 248] : sea ? [20, 50, 120] : [60, 120, 40];
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }
  const a = analyseSurface(W, H, rgba, null, { srcOcean: 0.6, veg: 'green', seed: 3 });
  ok(Math.abs(a.s0 - 0.6) < 0.03, 'sea share below the coast', a.s0.toFixed(3));
  let vegLand = 0, vegSea = 0;
  for (let i = 0; i < W * H; i++) { if (a.bytes[i * 4] >= 128) vegLand += a.bytes[i * 4 + 1]; else vegSea += a.bytes[i * 4 + 1]; }
  ok(vegLand > 0 && vegSea < vegLand * 0.02, 'vegetation found on the land and not in the sea');
  let mono = true;
  for (let k = 0; k < 256; k++) if (a.cdf[k + 1] < a.cdf[k]) mono = false;
  ok(mono && a.cdf[256] === 1, 'height CDF is monotonic');
  const hs = heightForShare(a.cdf, 0.8);
  ok(hs > 0.52, 'a bigger sea puts the shore above today\'s', hs.toFixed(3));
  ok(heightForShare(a.cdf, a.s0) > 0.47 && heightForShare(a.cdf, a.s0) < 0.53, 'today\'s sea puts it at today\'s coast');
}

section('Throughput');
{
  const { sys, ins, keys } = build('ra');
  const f = forcingOf(ins, keys);
  const t0 = performance.now();
  const s0 = sys.stepsTaken;
  advance(sys, 200, 10, 30, f);
  const ms = performance.now() - t0;
  const steps = sys.stepsTaken - s0;
  console.log(`  info ${keys.length} Ra worlds, 20 s of play at 10 yr/s: ${steps} steps in ${ms.toFixed(0)} ms `
    + `(${(ms / steps * 1000).toFixed(0)} µs/step, ${(ms / 20).toFixed(1)} ms per wall second)`);
  ok(ms / 20 < 150, 'the climate costs a fraction of a core at 10 yr/s', `${(ms / 20).toFixed(1)} ms/s`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
