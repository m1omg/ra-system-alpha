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
import { freshAcid, runWithAcid, partitionAcid, acidOverlay } from '../assets/climate/acid.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const LOG_KNOBS = new Set(['co2Bar', 'h2Bar', 'internalHeat', 'n2Bar', 'ch4Bar']);
const RANGE = { landAlbedo: [0.02, 0.95], iceAlbedo: [0.05, 0.99], co2Bar: [1e-6, 300], h2Bar: [1e-3, 300],
  internalHeat: [1e-5, 1e4], n2Bar: [1e-4, 50], ch4Bar: [1e-7, 1] };

// Run until the energy budget closes, in chunks of growing length. A world
// with an acid sea (profile `acid`) is stepped with it, as the system steps it,
// and keeps it on `sim.acid` for the spin-up.
function settle(params, maxYears = 3e7, acidSpec = null) {
  const sim = new Simulation(params);
  const w = sim.world;
  const acid = acidSpec ? freshAcid(acidSpec) : null;
  if (acid) { const r = { sim, acid }; partitionAcid(r); acidOverlay(r); }
  sim.acid = acid;
  let done = 0;
  for (const chunk of [1e3, 1e4, 1e5, 1e6, 1e7, 3e7]) {
    if (done >= maxYears) break;
    const y = Math.min(chunk, maxYears - done);
    if (acid) runWithAcid(sim, acid, y); else sim.runYears(y);
    done += y;
    const dg = w.diag;
    const tol = Math.max(0.03, 1e-3 * (dg.absorbed + dg.Fint));
    if (Math.abs(dg.imbalance) < tol && done >= 1e4) break;
  }
  return sim;
}

// A world whose book gives its pressure (profile `pressure`, bar) keeps it: one
// gas (`fill`) makes up whatever the others leave, so a knob that is itself a
// gas moves the make-up of the air and not how much of it there is.
const AIR = ['n2Bar', 'o2Bar', 'co2Bar', 'ch4Bar', 'h2Bar'];
function filled(prof, params) {
  if (!prof.fill || !(prof.pressure > 0)) return params;
  const rest = AIR.filter((k) => k !== prof.fill).reduce((a, k) => a + Math.max(params[k] ?? 0, 0), 0);
  return { ...params, [prof.fill]: Math.max(prof.pressure - rest, 0) };
}

function tuneOne(sysName, d, S, starTemp, fixed = null) {
  const prof = profileOf(sysName, d);
  const knob = prof.knob, target = prof.target;
  const base = paramsFor(sysName, d);
  // Tune from the profile's own hand-set values, not from a previous result --
  // except for what the balances have already set (`fixed`).
  const hand = { ...base, ...(prof.base[knob] != null ? { [knob]: prof.base[knob] } : {}),
    ...(fixed ? Object.fromEntries(Object.entries(fixed).filter(([k]) => k !== knob)) : {}) };
  const make = (v) => filled(prof, { ...hand, [knob]: v, insolation: S, starTemp,
    startT: target, outgassing: hand.outgassing });
  const temp = (v) => settle(make(v), 3e7, prof.acid).world.diag.Tmean;
  let [lo, hi] = RANGE[knob];
  // a gas under a fixed pressure has only what the other gases leave it
  if (prof.fill && prof.pressure > 0 && AIR.includes(knob)) {
    const others = AIR.filter((k) => k !== prof.fill && k !== knob).reduce((a, k) => a + Math.max(hand[k] ?? 0, 0), 0);
    hi = Math.min(hi, prof.pressure - others);
  }
  const log = LOG_KNOBS.has(knob);
  // Albedo cools, everything else warms.
  const dir = knob === 'landAlbedo' || knob === 'iceAlbedo' ? -1 : 1;
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

// Biosphere that holds O2 where it is. The source is photosynthesis and scales
// with the control; the sinks are the volcanic reductants and the weathering at
// this level: the control that makes them equal. Read once the living biosphere
// has grown to what the control asks (BIO_GROW, 5 kyr), which a settle is.
//
// A lifeless world (profile `oxygenBy: 'reducedGas'`) has only the oxygen water
// escape leaves behind, and what is unknown there is the sink: how reduced its
// volcanic gas is. That share is the control, set so the reductants take what
// the escape brings less what the seafloor takes. Zero when even that is too
// much -- the oxygen cannot be held at this level, and the check says so.
function balanceOxygen(sim, by = 'biosphere') {
  const w = sim.world, f = w.o2Flux;
  if (!f) return null;
  if (by === 'reducedGas') {
    const r = w.params.reducedGas ?? 1;
    if (!(r > 0) || !(f.reductant > 0)) return null;
    return Math.max(0, r * (f.source - f.weathering) / f.reductant);
  }
  const b = w.params.biosphere;
  if (!(b > 0) || !(f.source > 0)) return null;
  return b * (f.reductant + f.weathering) / f.source;
}

// Biosphere that holds CH4 where it is. Its methanogens are the source and
// photolysis the sink, which at steady state takes the column over its
// lifetime; the interior's share rides along in the ratio, and the rounds
// converge on it (by the interior's share of the total each time).
function balanceMethane(sim) {
  const w = sim.world, b = w.params.biosphere;
  if (!(b > 0) || !(w.ch4Source > 0) || !(w.ch4Tau > 0)) return null;
  return b * (w.ch4 / w.ch4Tau) / w.ch4Source;
}

// Outgassing that holds a dry world's air against escape. With no sea there
// is no weathering, and the supply answers only to what the star strips off:
// the loss is a rate, not a share of the column, so the air neither settles nor
// recovers -- it grows or goes linearly -- and the balance has to be the rate
// itself, read off the settled world.
function balanceAir(sim) {
  const w = sim.world, e = w.escape, V = w.weathering && w.weathering.V, og = w.params.outgassing;
  if (!e || !(V > 0) || !(og > 0)) return null;
  return og * ((e.background || 0) + (e.nonThermal || 0) + (e.bulkGas || 0)) / V;
}

// ...and then held to it over what the check holds it to. The escape grows with
// the pressure, so there is an equilibrium, but the rates read off one settled
// state put it a few per cent off; a secant on the air left after 20 Myr puts
// it on the documented column.
function holdAir(params, og0) {
  const colAfter = (og) => {
    const sim = settle({ ...params, outgassing: og }, 3e7), w = sim.world;
    const c0 = w.n2 + w.co2 + w.o2;
    sim.runYears(2e7, 2e5);
    return (w.n2 + w.co2 + w.o2) / c0;
  };
  let a = og0, fa = Math.log(colAfter(a));
  if (Math.abs(fa) < 0.005) return a;
  let b = og0 * (fa > 0 ? 0.95 : 1.05), fb = Math.log(colAfter(b));
  for (let i = 0; i < 12 && Math.abs(fb) > 0.005 && fb !== fa; i++) {
    const c = Math.exp(Math.log(b) - fb * (Math.log(b) - Math.log(a)) / (fb - fa));
    a = b; fa = fb; b = c; fb = Math.log(colAfter(b));
  }
  return b;
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
    // the gas that makes up the book's pressure, at the knob's value
    const fill = (t) => (prof.fill ? { ...t, [prof.fill]: +filled(prof, { ...paramsFor(sysName, d), ...t })[prof.fill].toPrecision(6) } : t);
    if (prof.target != null && prof.knob) {
      tune = tuneOne(sysName, d, S, starTemp);
      tunedOut[sysName][d.key] = fill({ [tune.knob]: +tune.value.toPrecision(6) });
    }
    // Spin up with the tuned knob, then balance the carbon cycle and settle again.
    // A world that balances more than its carbon (profile `balance`) goes round
    // the balances until they agree: the volcanoes that hold the CO2 also eat
    // the oxygen, and the biosphere that holds the oxygen warms the planet.
    const p0 = { ...paramsFor(sysName, d), ...(tunedOut[sysName][d.key] || {}) };
    let sim = settle({ ...p0, insolation: S, starTemp }, prof.target != null ? 3e7 : 1e5, prof.acid);
    let og = null;
    const rounds = (prof.balance || []).length ? 4 : 1;
    for (let round = 0; round < rounds && prof.target != null; round++) {
      const cur = () => ({ ...paramsFor(sysName, d), ...tunedOut[sysName][d.key] });
      og = (prof.balance || []).includes('air') ? balanceAir(sim) : balanceCarbon(sim);
      if (og != null && (prof.balance || []).includes('air')) og = holdAir({ ...cur(), insolation: S, starTemp }, og);
      if (og != null) tunedOut[sysName][d.key] = { ...tunedOut[sysName][d.key], outgassing: +og.toPrecision(6) };
      if ((prof.balance || []).includes('oxygen')) {
        sim = settle({ ...cur(), insolation: S, starTemp }, 3e7, prof.acid);
        const by = prof.oxygenBy || 'biosphere', v = balanceOxygen(sim, by);
        if (v != null) tunedOut[sysName][d.key] = { ...tunedOut[sysName][d.key], [by]: +v.toPrecision(6) };
      }
      if ((prof.balance || []).includes('methane')) {
        sim = settle({ ...cur(), insolation: S, starTemp }, 3e7, prof.acid);
        const bio = balanceMethane(sim);
        if (bio != null) tunedOut[sysName][d.key] = { ...tunedOut[sysName][d.key], biosphere: +bio.toPrecision(6) };
      }
      if (rounds > 1) {
        // the temperature again, under the balanced reservoirs
        const again = tuneOne(sysName, d, S, starTemp, tunedOut[sysName][d.key]);
        tunedOut[sysName][d.key] = fill({ ...tunedOut[sysName][d.key], [again.knob]: +again.value.toPrecision(6) });
        tune = again;
      }
      sim = settle({ ...cur(), insolation: S, starTemp }, 3e7, prof.acid);
    }
    const w = sim.world, dg = w.diag;
    const snap = captureWorld(w);
    snap.params = { ...snap.params };
    if (sim.acid) snap.acid = { ...sim.acid };
    // The sandbox's own clock starts at zero; the spin-up is not part of the
    // world's history.
    snap.time = 0;
    spin[sysName][d.key] = snap;
    let st = '?';
    try { st = classify(w).id; } catch (_) {}
    if (sim.acid) st = 'acid sea';      // what the system shows it as (system.js stateOf)
    rows.push({ sys: sysName, key: d.key, S, T: dg.Tmean, target: prof.target, imb: dg.imbalance,
      pTot: dg.pTotMean, state: st, tune, og, secs: (Date.now() - t0) / 1000 });
    const r = rows.at(-1);
    console.log(`${r.sys.padEnd(3)} ${r.key.padEnd(10)} S=${S.toPrecision(3).padStart(9)}`
      + ` T=${r.T.toFixed(1).padStart(7)}${r.target != null ? ` (target ${r.target}${tune && !tune.bracketed ? ', NOT BRACKETED' : ''})` : ''}`
      + ` imb=${r.imb.toFixed(3)} p=${r.pTot.toPrecision(3)} bar ${st}`
      + (tune ? ` ${tune.knob}=${tune.value.toPrecision(4)}` : '')
      + (og != null ? ` outgassing=${og.toPrecision(3)}` : '')
      + ['biosphere', 'reducedGas'].map((k) => tunedOut[sysName][d.key] && tunedOut[sysName][d.key][k] != null
        ? ` ${k}=${tunedOut[sysName][d.key][k].toPrecision(3)}` : '').join('')
      + ` [${r.secs.toFixed(1)} s]`);
  }
}

if (!CHECK) {
  // With --only, the bodies not re-run keep their entries, in their places, so
  // a partial run changes only the rows it re-ran.
  if (ONLY.length) {
    for (const s of ['ra', 'sol']) {
      const merged = {};
      // a body re-run with nothing left to tune loses its row, not keeps a stale one
      for (const [k, v] of Object.entries(previous[s] || {})) {
        if (k in tunedOut[s]) merged[k] = tunedOut[s][k];
        else if (!ONLY.includes(k)) merged[k] = v;
      }
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
