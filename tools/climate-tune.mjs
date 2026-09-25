// Tunes the described worlds to their documented temperatures, then spins every
// climate body up to equilibrium on its book orbit.
//
//   node tools/climate-tune.mjs            # tune + spin up, write both tables
//   node tools/climate-tune.mjs --check    # report only, write nothing
//
// Writes assets/climate/tuned.js (one knob per world that has a target) and
// assets/climate/spinup.js (the captured equilibrium of every climate body, so
// the sandbox opens on planets that are already where they belong instead of
// relaxing in front of the player).
//
// The knob moves the temperature; the carbon cycle is then balanced at that
// temperature by setting the volcanic outgassing equal to the weathering the
// settled world does, so the tuned CO2 is the one it keeps over geological
// time rather than the one it starts with and drifts away from.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, bookInsolation } from './lib/bodies.mjs';
import { paramsFor, profileOf, climateCapable, LUMINOUS } from '../assets/climate/profiles.js';
import { Simulation } from '../assets/climate/sim/clock.js';
import { captureWorld } from '../assets/climate/game/snapshot.js';
import { classify } from '../assets/climate/physics/classify.js';
import { TUNED } from '../assets/climate/tuned.js';
import { SPINUP } from '../assets/climate/spinup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const LOG_KNOBS = new Set(['co2Bar', 'h2Bar', 'internalHeat', 'n2Bar', 'ch4Bar']);
const RANGE = { landAlbedo: [0.02, 0.95], co2Bar: [1e-6, 300], h2Bar: [1e-3, 300],
  internalHeat: [1e-5, 500], n2Bar: [1e-4, 50], ch4Bar: [1e-7, 1] };

// Run until the energy budget closes, in chunks of growing length.
function settle(params, maxYears = 3e7) {
  const sim = new Simulation(params);
  const w = sim.world;
  let done = 0;
  for (const chunk of [1e3, 1e4, 1e5, 1e6, 1e7, 3e7]) {
    if (done >= maxYears) break;
    const y = Math.min(chunk, maxYears - done);
    sim.runYears(y);
    done += y;
    const dg = w.diag;
    const tol = Math.max(0.03, 1e-3 * (dg.absorbed + dg.Fint));
    if (Math.abs(dg.imbalance) < tol && done >= 1e4) break;
  }
  return sim;
}

function tuneOne(sysName, d, S, starTemp) {
  const prof = profileOf(sysName, d);
  const knob = prof.knob, target = prof.target;
  const base = paramsFor(sysName, d);
  // Tune from the profile's own hand-set values, not from a previous result.
  const hand = { ...base, ...(prof.base[knob] != null ? { [knob]: prof.base[knob] } : {}) };
  const make = (v) => ({ ...hand, [knob]: v, insolation: S, starTemp,
    startT: target, outgassing: hand.outgassing });
  const temp = (v) => settle(make(v), 3e7).world.diag.Tmean;
  let [lo, hi] = RANGE[knob];
  const log = LOG_KNOBS.has(knob);
  // Albedo cools, everything else warms.
  const dir = knob === 'landAlbedo' ? -1 : 1;
  let tLo = temp(lo), tHi = temp(hi);
  if ((tLo - target) * (tHi - target) > 0) {
    return { knob, value: Math.abs(tLo - target) < Math.abs(tHi - target) ? lo : hi,
             T: Math.abs(tLo - target) < Math.abs(tHi - target) ? tLo : tHi, bracketed: false };
  }
  let best = null;
  for (let i = 0; i < 26; i++) {
    const mid = log ? Math.sqrt(lo * hi) : (lo + hi) / 2;
    const t = temp(mid);
    if (!best || Math.abs(t - target) < Math.abs(best.T - target)) best = { value: mid, T: t };
    if (Math.abs(t - target) < 0.15) break;
    if ((t - target) * dir < 0) lo = mid; else hi = mid;
    if (log ? hi / lo < 1.0005 : hi - lo < 1e-5) break;
  }
  return { knob, ...best, bracketed: true };
}

// Outgassing that holds CO2 where it is: weathering / supply-per-unit-outgassing.
function balanceCarbon(sim) {
  const w = sim.world;
  const wt = w.weathering;
  if (!wt || !(wt.W > 0) || !(wt.V > 0) || !(w.params.outgassing > 0)) return null;
  return w.params.outgassing * wt.W / wt.V;
}

const systems = loadSystems();
// Tune from the hand-set profiles, not from the previous run's results: clear
// the imported table (paramsFor reads it at call time) and keep a copy for
// bodies this run does not touch.
const previous = JSON.parse(JSON.stringify(TUNED));
for (const s of Object.keys(TUNED)) for (const k of Object.keys(TUNED[s])) delete TUNED[s][k];
const tunedOut = { ra: {}, sol: {} };
const spin = { ra: {}, sol: {} };
const rows = [];
for (const sysName of ['sol', 'ra']) {
  const sys = systems[sysName];
  const ins = bookInsolation(sysName, sys, LUMINOUS);
  for (const d of sys.bodies) {
    if (!climateCapable(d)) continue;
    if (ONLY.length && !ONLY.includes(d.key)) continue;
    const prof = profileOf(sysName, d);
    const { S, starTemp } = ins[d.key];
    const t0 = Date.now();
    let tune = null;
    if (prof.target != null && prof.knob) {
      tune = tuneOne(sysName, d, S, starTemp);
      tunedOut[sysName][d.key] = { [tune.knob]: +tune.value.toPrecision(6) };
    }
    // Spin up with the tuned knob, then balance the carbon cycle and settle again.
    const p0 = { ...paramsFor(sysName, d), ...(tunedOut[sysName][d.key] || {}) };
    let sim = settle({ ...p0, insolation: S, starTemp }, prof.target != null ? 3e7 : 1e5);
    const og = prof.target != null ? balanceCarbon(sim) : null;
    if (og != null) {
      const ogR = +og.toPrecision(6);
      tunedOut[sysName][d.key] = { ...(tunedOut[sysName][d.key] || {}), outgassing: ogR };
      sim = settle({ ...p0, outgassing: ogR, insolation: S, starTemp }, 3e7);
    }
    const w = sim.world, dg = w.diag;
    const snap = captureWorld(w);
    snap.params = { ...snap.params };
    // The sandbox's own clock starts at zero; the spin-up is not part of the
    // world's history.
    snap.time = 0;
    spin[sysName][d.key] = snap;
    let st = '?';
    try { st = classify(w).id; } catch (_) {}
    rows.push({ sys: sysName, key: d.key, S, T: dg.Tmean, target: prof.target, imb: dg.imbalance,
      pTot: dg.pTotMean, state: st, tune, og, secs: (Date.now() - t0) / 1000 });
    const r = rows.at(-1);
    console.log(`${r.sys.padEnd(3)} ${r.key.padEnd(10)} S=${S.toPrecision(3).padStart(9)}`
      + ` T=${r.T.toFixed(1).padStart(7)}${r.target != null ? ` (target ${r.target}${tune && !tune.bracketed ? ', NOT BRACKETED' : ''})` : ''}`
      + ` imb=${r.imb.toFixed(3)} p=${r.pTot.toPrecision(3)} bar ${st}`
      + (tune ? ` ${tune.knob}=${tune.value.toPrecision(4)}` : '')
      + (og != null ? ` outgassing=${og.toPrecision(3)}` : '')
      + ` [${r.secs.toFixed(1)} s]`);
  }
}

if (!CHECK) {
  // With --only, the bodies not re-run keep their entries, in their places, so
  // a partial run changes only the rows it re-ran.
  if (ONLY.length) {
    for (const s of ['ra', 'sol']) {
      const merged = {};
      for (const [k, v] of Object.entries(previous[s] || {})) merged[k] = k in tunedOut[s] ? tunedOut[s][k] : v;
      for (const [k, v] of Object.entries(tunedOut[s])) if (!(k in merged)) merged[k] = v;
      tunedOut[s] = merged;
    }
  }
  const head = '// Written by tools/climate-tune.mjs -- one knob per described world, set so it\n'
    + '// holds its documented temperature at its documented orbit, and the outgassing\n'
    + '// that keeps its carbon cycle balanced there. Do not edit by hand; re-run the\n'
    + '// tool after changing a profile.\n';
  writeFileSync(path.join(ROOT, 'assets/climate/tuned.js'),
    `${head}export const TUNED = ${JSON.stringify(tunedOut, null, 1)};\n`);
  {
    const out = ONLY.length ? { ra: { ...SPINUP.ra }, sol: { ...SPINUP.sol } } : spin;
    if (ONLY.length) for (const s of ['ra', 'sol']) for (const [k, v] of Object.entries(spin[s])) out[s][k] = v;
    const sh = '// Written by tools/climate-tune.mjs: every climate body settled on its book\n'
      + '// orbit, captured with game/snapshot.js. The sandbox opens on these.\n';
    writeFileSync(path.join(ROOT, 'assets/climate/spinup.js'),
      `${sh}export const SPINUP = ${JSON.stringify(out)};\n`);
  }
  console.log('wrote tuned.js and spinup.js' + (ONLY.length ? ' (' + ONLY.join(', ') + ' re-run)' : ''));
}
