// The climate half of the sandbox.
//
// One altdev2 Simulation per terrestrial body, each forced by the starlight the
// orrery measures from the live orbits rather than by a slider. Nothing in here
// knows about Three.js or the DOM: it runs in a Web Worker in the browser (so a
// dual-core laptop keeps one core for drawing), on the main thread as a
// fallback, and under node for the checks in tools/.
//
// Time is simulated years throughout. The orrery hands every world the same
// credit each frame; a world spends it in steps sized from its own state, the
// way the climate sandbox's clock does, so a quiet planet strides and a planet
// in the middle of a runaway takes the small steps it needs. When the budget
// runs out a world falls behind rather than the page freezing, and the lag is
// reported instead of hidden.
import { Simulation } from './sim/clock.js';
import { captureWorld, applyWorld } from './game/snapshot.js';
import { classify, STATES } from './physics/classify.js';
import { NBANDS, X, DX, maxStep, setWaterInventory, update } from './physics/climate.js';
import { partitionWater, sealFactor } from './physics/volatiles.js';
import { habitableShare, meltRefuge, initRefuge, heatShock, HEAT_FAST_AT, dieOffYears, LIFE_EXTINCT, LIFE_SPREAD, REFUGE_DEPTH, REFUGE_CEILING } from './physics/biosphere.js';
import { derive } from './physics/planet.js';
import { clamp, smoothstep, steamOpacity, YEAR, S_EARTH } from './physics/constants.js';
import { atmosphereLook, cloudLook, surfaceHidden, volcanoLook } from './render/atmosphere.js';
import { vegetationColor } from './render/terrain.js';
import { surfaceTemperature } from './physics/surface.js';
import { paramsFor, profileMeta } from './profiles.js';
import { freshAcid, acidOverlay, partitionAcid, acidDetail, acidFrozen } from './acid.js';

// The model's states, and readings of them that fit worlds its texts were not
// written for (stateOf below says when). A world with an acid sea (acid.js):
// the model knows one liquid, and its reading of a world with no water -- a
// dry runaway, "the ocean is gone" -- is the wrong one for a sea.
export const EXTRA_STATES = {
  acidSea: { name: 'Acid-Sea Greenhouse', color: '#c8895f', blurb: 'A sea of nearly pure sulfuric acid under a thick CO\u2082 sky. The acid boils far hotter than water \u2014 338 \u00b0C at one atmosphere, higher under this much air \u2014 so the sea stays liquid where water would have boiled away, and what it gives off warms the sky and condenses into acid cloud, as on Venus. There is no water to weather rock with, so no carbonate\u2013silicate thermostat: the volcanoes\u2019 CO\u2082 stays in the air.' },
  acidSky: { name: 'Acid-Steam Atmosphere', color: '#e0a05a', blurb: 'The acid sea has boiled into the sky. Its basins lie bare under an atmosphere thick with acid vapour, which holds the heat in until the planet cools enough for the acid to rain back and fill them again.' },
  acidFrozen: { name: 'Frozen Acid Sea', color: '#d8c8b0', blurb: 'The acid sea has frozen over. Nearly pure sulfuric acid freezes at about +3 \u00b0C, well above water\u2019s freezing point, and the pale ice seals the sea from the sky.' },
  // the Ice-Free Hothouse, past where "tropics near the limit of complex life,
  // like the Cretaceous" stops being true: a mean above 50 C (Anubis, 81 C)
  hotOcean: { name: 'Hot Ocean', color: '#f0a040', blurb: 'No ice anywhere, and a sea hotter than complex life can bear: animals and plants give out near 50 \u00b0C, and above that only microbes live, to the 122 \u00b0C record. Past about 67 \u00b0C the air is wet to the top and the sea can leak away to space as starlight splits it (Kasting 1988) \u2014 slowly here, because little of that light arrives.' },
  // a Waterworld whose floor is ice VII: its text's "seawater circulates
  // through fresh basalt at the ridges" is the one thing that cannot happen (Uat-Ur)
  sealedOcean: { name: 'Sealed Ocean', color: '#3a7cc0', blurb: 'A global ocean standing on high-pressure ice rather than rock, so deep that its floor has frozen under its own weight. The ice seals the sea from the rock below: little of the mantle\u2019s gas gets up through it and little of the air\u2019s CO\u2082 gets down to be weathered away, so the carbon thermostat that steadies an Earth barely turns over, and the sea is starved of the minerals rock would give it.' },
  // a Hard Snowball its text says will thaw "in 5-50 Myr" as CO2 builds up,
  // where that cannot happen: past the maximum-greenhouse limit (Pluto, Nut)
  deepFrozen: { name: 'Deep-Frozen World', color: '#b8d4e6', blurb: 'Ice from pole to pole, and too far from its star for anything to thaw it. A frozen Earth breaks out when its volcanoes\u2019 CO\u2082 builds up; out here that cannot work, since past the maximum-greenhouse limit, about a third of Earth\u2019s sunlight (Kopparapu et al. 2013), more CO\u2082 scatters away more light than it traps, or freezes out as frost.' },
};
export const ALL_STATES = { ...STATES, ...EXTRA_STATES };
// Where each reading takes over: a mean past the limit of complex life, a floor
// sealed more than half shut, and the maximum-greenhouse insolation.
const HOT_OCEAN_K = 323.15, SEALED_BELOW = 0.5, MAX_GREENHOUSE_S = 0.35;
export const STATE_IDS = Object.keys(ALL_STATES);

// The render record, one Float32Array per world, laid out once so the worker
// can post every world in a single transferable buffer. The main thread only
// reads these offsets; everything else it wants comes through detail().
export const RS = {
  T: 0, ICE: 18, CLOUD: 36,
  FLOOD: 54, WATERCAP: 55, GLAC: 56, BIO: 57, STEAM: 58, VEIL: 59, HAZE: 60,
  THICK: 61, PTOT: 62, CO2F: 63, BARE: 64, GLOW: 65, LAM: 66,
  VEGR: 67, VEGG: 68, VEGB: 69, VENTS: 70, ASH: 71,
  TMEAN: 72, TMIN: 73, TMAX: 74, STATE: 75, LAG: 76, TIME: 77,
  NOLIQ: 78, CLOUDMEAN: 79, INSOL: 80, AIR: 81, HASWATER: 82, TOTALWATER: 83,
  SURFT: 84, OBLQ: 85, MAGMA: 86,
  LIFE: 87, LIFECAUSE: 88, LIFESINCE: 89, BOILED: 90,
  SIZE: 91,
};

// ---- the life ledger ------------------------------------------------------------
// What lives on a world, as the book has it, and what the climate has since
// done to it. The book's level is where a world starts; after that the model's
// own populations decide (physics/biosphere.js: prokaryotes, eukaryotes and the
// deep crust's refuge), and the ledger only reads them: complex life while
// there are eukaryotes, microbes while there are prokaryotes at the surface or
// below it, nothing when neither. Intelligence is the book's, and once complex
// life has been lost it needs complex life back for INTELLIGENCE_YEARS before
// it counts again. The level never exceeds the book's: a world documented
// lifeless stays so, whatever the model could grow on it.
export const LIFE_CAUSES = ['heat', 'boiled', 'cooked', 'magma', 'frozen', 'dry', 'anoxia', 'starved'];
const LIFE_LEVEL = { intelligent: 3, complex: 2, alien: 1, seeded: 1, native: 1, microbial: 1 };
const INTELLIGENCE_YEARS = 5e8;
// A magma ocean melts the refuge where it reaches it: melt costs latent heat
// plus the warming to the solidus, about 1.8 MJ per kilogram of rock.
const ROCK_RHO = 3000;               // kg/m^3
const MELT_J_PER_KG = 1.8e6;
// Nephtys's life lives in its sea of sulfuric acid, not water (the book: acid
// as solvent, siloxane biomolecules). Nearly pure acid freezes at about +3 C
// and boils at 337 C at one atmosphere; the life is gated at 330 C. Where the
// acid is liquid it spreads as prokaryotes do, heat kills it by the same rule,
// and nothing originates it again.
const ACID_FREEZE = 276, ACID_GATE = 603;   // K
function acidRoom(w, acid = null) {
  let room = 0, over = 0;
  for (let i = 0; i < NBANDS; i++) {
    const T = w.T[i];
    room += smoothstep(ACID_FREEZE - 5, ACID_FREEZE, T) * (1 - smoothstep(ACID_GATE - 10, ACID_GATE, T)) / NBANDS;
    over += Math.max(0, T - ACID_GATE) / NBANDS;
  }
  // and a sea to live in, where the world keeps one (acid.js): boiled into the sky, there is none
  let sea = 1;
  if (acid) sea = smoothstep(0, 0.2, acid.sea / Math.max(acid.sea + acid.vap, 1e-30));
  return { room: room * sea, over, sea };
}

// Steps are never shorter than this unless the planet itself demands it. At a
// real-time clock a day of simulated time is a day of wall time, and stepping
// eighteen bands of radiative transfer sixty times a second to move a world by
// a second of climate buys nothing.
const MIN_STEP_YEARS = 1 / 365.25;
// ...and a step is not taken for less than this share of a wall-clock second's
// worth of simulated time, which caps a slow clock at about twenty steps a
// second per world instead of one per frame.
const MIN_STEP_WALL = 0.05;
// A strike's heat does not arrive all at once: the vapour plume and the ejecta
// re-entering spread it round the planet over weeks, and the ocean takes it up
// over months. One e-folding of about five weeks.
const PULSE_TAU_YEARS = 0.1;
// Share of the kinetic energy that ends up as heat spread over the whole
// globe, rather than as melt, crater rock and ejecta that escape.
export const IMPACT_GLOBAL_SHARE = 0.5;

// ---- energy arriving at once --------------------------------------------------
// Where on the planet a deposit lands, as the share of it each band takes. The
// bands are equal-area, in x = sin(latitude) on a spinning world and x = cos(the
// angle from the star) on a locked one; `x` is the struck spot's (or, for a
// blast, the source direction's) coordinate in that scheme.
//   asteroid   half spread round the globe (vapour plume, re-entering ejecta),
//              half into the struck band and its neighbours
//   laser      all into the beam's band
//   blast      the hemisphere facing the source, by how squarely each band faces it
//   collision  the whole globe
// Transport spreads it further from there, on the model's own terms.
function bandOf(x) { return Math.max(0, Math.min(NBANDS - 1, Math.floor((clamp(x, -1, 1) + 1) / DX))); }
// Mean over a band's ring of max(0, n·s) for a source at s·axis = sd: the
// daily-mean insolation formula, which is the same geometry.
function facing(x, sd) {
  const sp = clamp(x, -1, 1), cp = Math.sqrt(1 - sp * sp), cd = Math.sqrt(Math.max(0, 1 - sd * sd));
  const t = cp * cd > 1e-12 ? clamp(-(sp * sd) / (cp * cd), -1, 1) : (sp * sd >= 0 ? -1 : 1);
  const h0 = Math.acos(t);
  return Math.max(0, (h0 * sp * sd + cp * cd * Math.sin(h0)) / Math.PI);
}
export function impactShares(kind, x) {
  const w = new Float64Array(NBANDS);
  if (kind === 'collision') { w.fill(1 / NBANDS); return w; }
  if (kind === 'blast') {
    let s = 0;
    for (let i = 0; i < NBANDS; i++) { w[i] = facing(X[i], clamp(x ?? 0, -1, 1)); s += w[i]; }
    if (s > 0) for (let i = 0; i < NBANDS; i++) w[i] /= s; else w.fill(1 / NBANDS);
    return w;
  }
  const k = bandOf(x ?? 0);
  const local = kind === 'laser' ? [[k, 1]] : [[k - 1, 0.25], [k, 0.5], [k + 1, 0.25]];
  const localShare = kind === 'laser' ? 1 : 1 - IMPACT_GLOBAL_SHARE;
  if (kind !== 'laser') w.fill(IMPACT_GLOBAL_SHARE / NBANDS);
  let s = 0; for (const [i, f] of local) if (i >= 0 && i < NBANDS) s += f;
  for (const [i, f] of local) if (i >= 0 && i < NBANDS) w[i] += localShare * f / s;
  return w;
}

// Rock melts past this, and what melting it costs is then held as magma rather
// than as a hotter surface: the band stays at the solidus while the ledger
// drains, as fast as the air above lets it radiate (a steam lid keeps a magma
// ocean alive; bare rock crusts over in years).
export const T_SOLIDUS = 1400;      // K
// Between recomputations of the heat capacity, a band climbs at most this far.
const INJECT_STEP_K = 10;

// Heat delivered now, E[i] joules per square metre of band i. Each band climbs
// through the model's own heat capacity -- ocean mixed layer, air, the latent
// heat of the water that evaporates as it warms, the ice that melts --
// recomputed every INJECT_STEP_K, since it changes by orders of magnitude
// between a frozen and a boiling sea. Past the critical point of water the cold
// water still under a hot layer has to be converted too, at the model's own
// price (hotCapacity), and past the solidus the rest melts rock. Then the water
// follows the new temperatures (partitionWater), so a boiled sea is steam at once.
function injectHeat(r, E) {
  const w = r.sim.world;
  if (!r.magma) r.magma = new Float64Array(NBANDS);
  const left = Float64Array.from(E);
  let spent = 0;
  for (let it = 0; it < 2000; it++) {
    const dg = w.diag;
    let any = false, rest = 0;
    for (let i = 0; i < NBANDS; i++) rest += left[i] / NBANDS;
    if (!(rest > 0)) break;
    // the hot layer: water past its critical point is not a sea any more, and the
    // conversion is paid for before the surface climbs further
    const need = ((dg.hotTarget ?? 0) - (w.hotLayer ?? 0)) * (dg.hotCapacity ?? 0);
    if (need > 0) {
      const take = Math.min(need, rest), f = 1 - take / rest;
      w.hotLayer = (w.hotLayer ?? 0) + take / dg.hotCapacity;
      for (let i = 0; i < NBANDS; i++) left[i] *= f;
      spent += take;
    }
    const C = dg.C;
    for (let i = 0; i < NBANDS; i++) {
      if (!(left[i] > 0)) continue;
      const room = T_SOLIDUS - w.T[i];
      if (!(room > 1e-9)) { r.magma[i] += left[i]; spent += left[i] / NBANDS; left[i] = 0; continue; }
      const c = Math.max(C[i], 1e5), dT = Math.min(left[i] / c, INJECT_STEP_K, room);
      w.T[i] += dT; left[i] -= dT * c; spent += dT * c / NBANDS;
      if (left[i] > 1e-12 * E[i]) any = true; else left[i] = 0;
    }
    // an acid sea's heat capacity is its evaporation, and that follows the
    // temperature the bands have climbed to
    if (r.acid) { partitionAcid(r); acidOverlay(r); } else update(w, 0);
    if (!any && !(need > 0)) break;
  }
  // Melt deep enough to reach the life refuge takes it with it (biosphere.js).
  let newly = false;
  for (let i = 0; i < NBANDS; i++) {
    if (!(r.magma[i] / (ROCK_RHO * MELT_J_PER_KG) >= REFUGE_DEPTH)) continue;
    if (!r.melted) r.melted = new Uint8Array(NBANDS);
    if (!r.melted[i]) { r.melted[i] = 1; newly = true; }
  }
  if (newly) meltRefuge(w, sum(r.melted) / NBANDS);
  partitionWater(w, 0);
  update(w, 0);
  if (r.acid) { partitionAcid(r); acidOverlay(r); }
  return spent;
}
// A band with magma under it cannot be colder than the solidus: the melt gives
// up its heat to hold it there, and the ledger is what is left.
function drainMagma(r) {
  const m = r.magma; if (!m) return;
  const w = r.sim.world, C = w.diag.C;
  let touched = false, left = false;
  for (let i = 0; i < NBANDS; i++) {
    if (!(m[i] > 0)) continue;
    const deficit = T_SOLIDUS - w.T[i];
    if (deficit > 0) {
      const c = Math.max(C[i], 1e5), e = Math.min(m[i], deficit * c);
      w.T[i] += e / c; m[i] -= e; touched = true;
    }
    if (m[i] > 1e-3) left = true; else m[i] = 0;
  }
  if (touched) update(w, 0);
  if (!left) r.magma = null;
}

// The state a world is shown in: the model's, or its acid sea's (acid.js). A
// magma ocean is a magma ocean either way.
function stateOf(r) {
  const w = r.sim.world;
  let id = null;
  try { id = classify(w).id; } catch (_) { id = null; }
  if (r.acid && id !== 'magma') {
    const a = acidDetail(r);
    if (a.airShare > 0.5) return 'acidSky';
    if (a.cover > 0.02) return a.frozen > 0.9 ? 'acidFrozen' : 'acidSea';
  }
  if (id === 'hothouse' && w.diag.Tmean > HOT_OCEAN_K) return 'hotOcean';
  if (id === 'waterworld' && sealFactor(w) < SEALED_BELOW) return 'sealedOcean';
  if (id === 'snowball' && (w.params.insolation ?? 1) < MAX_GREENHOUSE_S) return 'deepFrozen';
  return id;
}
// An airless world's ground is not the zonal mean its bands carry. The day side
// stands at the radiative equilibrium of the star overhead; the night side cools
// through the night on the heat its regolith gives back: a half-space of the
// Moon's thermal inertia (55 J m^-2 K^-1 s^-1/2, Hayne et al. 2017) held at the
// band's mean below it, radiating εσT^4 = F + I (T_below - T) / sqrt(π t) at the
// end of a night t, half a solar day long. Where there is air to carry heat
// round, the bands' own range stands. Mercury's book: -173 C night, +427 C day.
const REGOLITH_I = 55, EMISSIVITY = 0.95, SIGMA = 5.670374e-8, AIRLESS_BAR = 1e-3;
function groundExtremes(r) {
  const w = r.sim.world, dg = w.diag;
  if (!(dg.pTotMean < AIRLESS_BAR) || !dg.alb) return null;
  const eq = NBANDS >> 1, F = Math.max(dg.Fint ?? 0, 0), Tbelow = w.T[eq];
  const dayK = Math.pow((r.flux * (1 - dg.alb[eq]) + F) / (EMISSIVITY * SIGMA), 0.25);
  const dayH = r.data && r.data.solarDayH, t = dayH > 0 ? dayH * 1800 : Infinity;
  const k = isFinite(t) ? REGOLITH_I / Math.sqrt(Math.PI * t) : 0;
  let lo = 2, hi = Math.max(Tbelow, 3);
  for (let i = 0; i < 60; i++) {
    const T = (lo + hi) / 2;
    if (EMISSIVITY * SIGMA * T * T * T * T > F + k * (Tbelow - T)) hi = T; else lo = T;
  }
  return { dayK, nightK: (lo + hi) / 2 };
}
function classifyHabitable(w) {
  try { return !!classify(w).habitable; } catch (_) { return false; }
}

function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
function mean(a) { return sum(a) / a.length; }

export class ClimateSystem {
  constructor() {
    this.worlds = new Map();
    this.order = [];
    this.cursor = 0;
    this.rate = 1;            // simulated years per wall-clock second, as the orrery runs
    this.stepsTaken = 0;
    this.busyMs = 0;
  }

  // ---- world lifecycle ------------------------------------------------------

  // `data` is the orrery's own body record, trimmed to what the physics needs.
  // `snapshot` is a captured world to resume, from a save or from the spin-up
  // table; without one the world starts from its profile's temperature.
  add(key, sys, data, opts = {}) {
    const params = opts.params || paramsFor(sys, data);
    if (!params) return false;
    const sim = new Simulation(params);
    sim.budgetMs = Infinity;
    const rec = {
      key, sys, data, sim,
      credit: 0,
      fluxAcc: 0, fluxTime: 0,
      flux: params.insolation * S_EARTH,
      starTemp: params.starTemp,
      baseHeat: params.internalHeat ?? 0,
      pulse: 0,                   // J/m^2 still to deliver
      magma: null,                // J/m^2 of melt per band, or null
      lagReq: 0, lagDone: 0, lagDrop: 0, lag: 1,
      meta: profileMeta(sys, data),
      rs: new Float32Array(RS.SIZE),
      ledger: null,
      melted: null,               // bands molten down past the life refuge
      acid: null,                 // a sea of sulfuric acid beside the water (acid.js)
    };
    if (opts.snapshot) this.applySnapshot(rec, opts.snapshot, params);
    // a sea of acid that is not in the snapshot is poured now; one that is, is
    // left as saved, overlay and all, so the world takes the same next step
    if (!rec.acid && rec.meta.acid) { rec.acid = freshAcid(rec.meta.acid); partitionAcid(rec); acidOverlay(rec); }
    if (!rec.ledger) rec.ledger = this.freshLedger(rec);
    if (opts.flux > 0 || opts.flux === 0) {
      this.setFlux(rec, opts.flux, opts.starTemp);
      // The diagnostics must describe this starlight before the first step
      // sizes itself from them.
      sim.setParams({});
    }
    this.worlds.set(key, rec);
    this.order = [...this.worlds.keys()];
    this.fillRender(rec);
    return true;
  }

  remove(key) {
    this.worlds.delete(key);
    this.order = [...this.worlds.keys()];
  }

  has(key) { return this.worlds.has(key); }

  // Start a world again from its profile -- what the orrery's Heal means for a
  // climate: the planet as it was before anyone did anything to it.
  reset(key, snapshot) {
    const r = this.worlds.get(key); if (!r) return false;
    const flux = r.flux, starTemp = r.starTemp;
    this.remove(key);
    this.add(key, r.sys, r.data, { snapshot, flux, starTemp });
    return true;
  }

  applySnapshot(rec, snap, params) {
    // A snapshot carries the params it was taken with; the profile's own set
    // wins for anything the snapshot lacks, so a save written before a new
    // parameter existed still restores.
    const p = { ...params, ...(snap.params || {}) };
    applyWorld(rec.sim, snap, p);
    rec.baseHeat = snap.baseHeat ?? p.internalHeat ?? 0;
    rec.pulse = snap.pulse ?? 0;
    rec.magma = Array.isArray(snap.magma) ? Float64Array.from(snap.magma) : null;
    rec.melted = Array.isArray(snap.melted) ? Uint8Array.from(snap.melted) : null;
    rec.acid = snap.acid ? { ...snap.acid } : null;
    // a save carries its ledger; a spin-up or an older save starts one afresh
    rec.ledger = snap.ledger ? { ...snap.ledger } : null;
    if (rec.ledger && p.deepRefuge) initRefuge(rec.sim.world);
    rec.sim.world.params.internalHeat = snap.liveHeat
      ?? rec.baseHeat + (rec.pulse > 0 ? rec.pulse / (PULSE_TAU_YEARS * YEAR) : 0);
    rec.credit = snap.credit ?? 0;
    rec.fluxAcc = snap.fluxAcc ?? 0;
    rec.fluxTime = snap.fluxTime ?? 0;
    // The starlight the world was saved under, until the orrery says otherwise.
    rec.flux = snap.flux > 0 ? snap.flux : (p.insolation ?? 1) * S_EARTH;
    rec.sim.world.params.insolation = rec.flux / S_EARTH;
    rec.sim.setParams({});
  }

  // ---- forcing ---------------------------------------------------------------

  setFlux(rec, flux, starTemp) {
    if (!(flux >= 0)) return;
    rec.flux = flux;
    const w = rec.sim.world;
    w.params.insolation = flux / S_EARTH;
    if (starTemp > 0) { rec.starTemp = starTemp; w.params.starTemp = starTemp; }
  }

  // One frame of the orrery: `dt` simulated years went by, and over them each
  // world received the average flux given (W/m^2). Worlds missing from
  // `forcing` keep the flux they had.
  tick(dt, rate, forcing) {
    if (rate > 0) this.rate = rate;
    if (!(dt > 0)) return;
    const cap = Math.max(this.rate * 2, MIN_STEP_YEARS * 4);
    for (const r of this.worlds.values()) {
      const f = forcing ? forcing[r.key] : undefined;
      if (f) {
        r.fluxAcc += f.flux * dt; r.fluxTime += dt;
        if (f.starTemp > 0) r.starTemp = f.starTemp;
      }
      r.credit += dt;
      r.lagReq += dt;
      // Unspent time is capped so that a world that cannot keep up drops the
      // excess instead of banking an unbounded debt it would then try to pay
      // off in one frame. What is dropped is the lag; credit merely banked for
      // the next step is not.
      if (r.credit > cap) { r.lagDrop += r.credit - cap; r.credit = cap; }
    }
  }

  // ---- stepping ----------------------------------------------------------------

  // Spend credit for up to `budgetMs` of wall clock, one step per world in turn
  // so that no planet starves the others. Returns true if credit remains that
  // the budget did not reach.
  run(budgetMs) {
    const t0 = now();
    const deadline = t0 + budgetMs;
    const n = this.order.length;
    if (!n) return false;
    let idle = 0, pending = false;
    // Round-robin over worlds; a world with nothing to do counts as idle, and a
    // full lap of idle worlds ends the slice early.
    while (idle < n) {
      if (now() > deadline) { pending = true; break; }
      const key = this.order[this.cursor % n];
      this.cursor = (this.cursor + 1) % n;
      const r = this.worlds.get(key);
      if (!r || !this.stepWorld(r)) idle++;
      else idle = 0;
    }
    this.busyMs += now() - t0;
    // `pending` is set only when the deadline cut the lap short. A world whose
    // credit is below its step floor is not pending: it is waiting for the next
    // frame's credit, and reporting it as work would spin the worker's loop on
    // nothing.
    for (const r of this.worlds.values()) {
      // Lag, as the share of the requested time this world actually covered.
      if (r.lagReq > this.rate * 2) {
        const got = 1 - r.lagDrop / r.lagReq;
        r.lag = clamp(r.lag + (got - r.lag) * 0.5, 0, 1);
        r.lagReq = 0; r.lagDone = 0; r.lagDrop = 0;
      }
    }
    return pending;
  }

  // Take at most one step. Returns true if a step was taken.
  stepWorld(r) {
    const sim = r.sim, w = sim.world;
    if (r.credit <= 0) return false;
    // The flux the planet received since its last step, as one number: over a
    // long step that is the orbit-average, over a short one the local value.
    if (r.fluxTime > 0) {
      this.setFlux(r, r.fluxAcc / r.fluxTime, r.starTemp);
      r.fluxAcc = 0; r.fluxTime = 0;
    }
    const pulseFlux = r.pulse > 0 ? r.pulse / (PULSE_TAU_YEARS * YEAR) : 0;
    const heat0 = w.params.internalHeat;
    w.params.internalHeat = r.baseHeat + pulseFlux;
    const room = Math.min(maxStep(w, 2.5), Math.max(this.rate * 0.3, MIN_STEP_YEARS), 5e6);
    const floor = Math.min(room, Math.max(this.rate * MIN_STEP_WALL, MIN_STEP_YEARS));
    // No step, no change: the interior heat stays the one the last step's
    // diagnostics were made with. Left at the new value, a save taken between
    // steps carried a heat its diagnostics did not match, and the restored
    // world ran on differently from the one saved.
    if (r.credit < floor) { w.params.internalHeat = heat0; return false; }
    const dt = Math.min(room, r.credit);
    if (r.pulse > 0) {
      // Deliver the share of the pulse that decays over this step, as a flux
      // averaged over the step. A pulse below a milliwatt is finished.
      const delivered = r.pulse * (1 - Math.exp(-dt / PULSE_TAU_YEARS));
      r.pulse -= delivered;
      w.params.internalHeat = r.baseHeat + delivered / (dt * YEAR);
      if (r.pulse / (PULSE_TAU_YEARS * YEAR) < 1e-3) r.pulse = 0;
    }
    r.credit -= dt;
    if (r.acid) acidOverlay(r);
    sim.stepOnce(dt);
    if (r.acid) partitionAcid(r);
    if (r.magma) drainMagma(r);
    if (!r.magma && r.melted) {          // a new crust, which the refuge can fill again
      r.melted = null;
      if (w.params.deepRefuge) meltRefuge(w, 0);
    }
    this.updateLife(r, dt);
    r.lagDone += dt;
    this.stepsTaken++;
    if (r.pulse <= 0 && w.params.internalHeat !== r.baseHeat) {
      w.params.internalHeat = r.baseHeat;
    }
    this.fillRender(r);
    return true;
  }

  // ---- things done to a world ---------------------------------------------------

  // Energy arriving at once: {J, kind, x, xl, mKg, vKms, waterKg}. `x` places it
  // on a spinning world (sin latitude), `xl` on a locked one (cos of the angle
  // from the star); see impactShares. The heat is in the bands before this
  // returns. An asteroid or a collision also raises dust and soot, frees CO2
  // from carbonate rock, and with enough momentum blows air away.
  impact(key, o = {}) {
    const r = this.worlds.get(key); if (!r) return false;
    const w = r.sim.world, d = derive(w.params);
    const J = Math.max(+o.J || 0, 0), kind = o.kind || 'asteroid';
    const x = w.params.tidallyLocked ? (o.xl ?? o.x ?? 0) : (o.x ?? 0);
    if (J > 0) {
      const sh = impactShares(kind, x), E = new Float64Array(NBANDS);
      for (let i = 0; i < NBANDS; i++) E[i] = J * sh[i] * NBANDS / d.area;
      r.lastInjected = injectHeat(r, E) * d.area;
      if (kind === 'asteroid' || kind === 'collision') this.aftermath(r, J, o, d);
      // what the heat has killed outright, now rather than at the next step
      heatShock(w);
      const g = r.ledger;
      if (g && g.kind === 'acid' && ((w.params.heatDeathFastYears > 0 && Math.min(...w.T) >= ACID_GATE + HEAT_FAST_AT)
        || acidRoom(w, r.acid).sea <= 0)) g.alien = 0;
      this.updateLife(r, 0);
    }
    if (o.waterKg > 0) {
      const eo = o.waterKg / 1.4e21;
      w.water.ocean += eo;
      w.waterInitial = (w.waterInitial ?? 0) + eo;
      update(w, 0); partitionWater(w, 0);
    }
    r.sim.setParams({});
    this.fillRender(r);
    return true;
  }

  // What a strike does besides heating.
  aftermath(r, J, o, d) {
    const w = r.sim.world, dg = w.diag;
    // Dust and soot: nothing below about 1e20 J, the model's darkest sky (+0.5
    // albedo, its own ceiling) from 1e23 J up (Toon et al. 1997), where there is
    // air to hold it up. The model relaxes w.aerosol towards its industrial
    // level on a five-year timescale, which is the winter lifting.
    const air = smoothstep(0.005, 0.1, dg.pTotMean);
    const f = clamp((Math.log10(Math.max(J, 1)) - 20) / 3, 0, 1);
    if (air > 0 && f > 0) {
      const full = 0.5 * mean(dg.S) * (dg.swTrans ?? 1);
      w.aerosol = Math.min(Math.max(w.aerosol ?? 0, 0) + f * air * full, Math.max(full, w.aerosol ?? 0));
    }
    // CO2 from the target rock, on a world with seas to have laid carbonate
    // down. Chicxulub's 4e23 J freed some 3e14 kg; carbonate is a platform a few
    // kilometres thick, so a bigger crater frees it by area, not by volume: the
    // diameter grows as E^0.22 (gravity regime), the area as E^0.44.
    if ((w.water.ocean + w.water.seaIce) > 0.01 && w.carbonDeep > 0 && J > 0) {
      const kg = 3e14 * Math.pow(J / 4e23, 0.44);
      const col = Math.min(kg / d.area, w.carbonDeep);
      w.co2 += col; w.carbonDeep -= col;
    }
    // Air blown off by the impactor's momentum (Schlichting et al. 2015): the
    // lost share of the atmosphere as a function of m v / (M vesc).
    if (o.mKg > 0 && o.vKms > 0) {
      const M = d.g * d.R * d.R / 6.674e-11, u = o.mKg * o.vKms * 1e3 / (M * d.vesc);
      const X = clamp(0.4 * u + 1.4 * u * u - 0.8 * u * u * u, 0, 1);
      if (X > 1e-9) {
        const k = 1 - X;
        w.n2 *= k; w.o2 *= k; w.co2 *= k; w.ch4 *= k; w.h2 *= k; w.he *= k;
        const gone = w.water.vapour * X;
        w.water.vapour -= gone; w.water.lost = (w.water.lost ?? 0) + gone;
        if (r.acid) r.acid.vap *= k;
      }
    }
    update(w, 0);
  }

  // ---- life -------------------------------------------------------------------

  // A world as the book has it: its documented life present, and nothing the
  // model grew where the book has none (the spin-up grew prokaryotes on Anubis,
  // Mars and Titan in one step each -- the origination the originWait patch
  // fixes). A world the model has no habitat for yet keeps its documented life
  // in the deep crust, which is where Nu's lives until its ocean is modelled.
  freshLedger(r) {
    const w = r.sim.world, d = r.data || {};
    const doc = LIFE_LEVEL[d.life] || 0, kind = d.life === 'alien' ? 'acid' : 'water';
    if (!w.diag) update(w, 0);
    const room = habitableShare(w);
    const L = w.life || (w.life = { pro: 0, euk: 0 });
    if (kind === 'water' && doc >= 1) {
      L.pro = Math.max(L.pro ?? 0, room.pro);
      L.euk = doc >= 2 ? Math.max(L.euk ?? 0, room.euk) : 0;
      L.deep = 1;
    } else if (!((w.params.biosphere ?? 0) > 0)) {
      w.life = { pro: 0, euk: 0, deep: 0 };
    }
    if (w.params.deepRefuge) initRefuge(w);
    return { doc, kind, level: doc, cause: -1, since: w.time,
      complexSince: doc >= 2 ? -1e12 : null, alien: kind === 'acid' ? 1 : 0 };
  }

  updateLife(r, dt) {
    const g = r.ledger; if (!g || !g.doc) return;
    const w = r.sim.world, L = w.life || {};
    let alive;
    if (g.kind === 'acid') {
      const { room, over } = acidRoom(w, r.acid);
      if (room < g.alien) g.alien += (room - g.alien) * (1 - Math.exp(-dt / dieOffYears(over, w.params.heatDeathFastYears)));
      else if (g.alien > LIFE_EXTINCT) g.alien += (room - g.alien) * (1 - Math.exp(-dt / LIFE_SPREAD));
      if (g.alien < LIFE_EXTINCT) g.alien = 0;
      alive = g.alien > 0 ? 1 : 0;
    } else {
      alive = L.euk > LIFE_EXTINCT ? 2 : (L.pro > LIFE_EXTINCT || (L.deep ?? 0) > LIFE_EXTINCT) ? 1 : 0;
    }
    if (alive >= 2) { if (g.complexSince == null) g.complexSince = w.time; } else g.complexSince = null;
    let level = Math.min(g.doc, alive);
    if (level === 2 && g.doc >= 3 && w.time - g.complexSince >= INTELLIGENCE_YEARS) level = 3;
    if (level !== g.level) {
      if (level < g.level) g.cause = LIFE_CAUSES.indexOf(this.lifeCause(r, level));
      else if (level >= g.doc) g.cause = -1;
      g.level = level; g.since = w.time;
    }
  }

  // What took a level away, read off the world as it is when it goes.
  lifeCause(r, level) {
    const w = r.sim.world, dg = w.diag, L = w.life || {}, room = habitableShare(w);
    // the melt is the cause where most of the surface is molten, or where it
    // reached the refuge; a few molten bands on a boiled world are the heat's
    let molten = 0;
    if (r.magma) for (let i = 0; i < NBANDS; i++) if (r.magma[i] > 0) molten += 1 / NBANDS;
    if (molten >= 0.5 || (level === 0 && r.melted)) return 'magma';
    if (r.ledger.kind === 'acid') {
      const a = acidRoom(w, r.acid);
      return a.sea < 0.5 ? 'boiled' : a.over > 0 ? 'heat' : 'frozen';
    }
    if (level === 0 && (L.Td ?? 0) > REFUGE_CEILING) return 'cooked';
    const liquid = w.water.ocean + w.water.seaIce;
    const hot = (level >= 1 ? room.hotEuk : room.hotPro) > 0;
    if (hot) return liquid < 0.1 * (liquid + w.water.vapour) ? 'boiled' : 'heat';
    if (!(liquid > 1e-4)) return 'dry';
    if (level >= 1 && (room.carbon ?? 1) < 0.5) return 'starved';
    if (level >= 1 && (dg.pO2 ?? 0) < 0.04 * 0.21) return 'anoxia';
    return 'frozen';
  }

  // The old protocol: global heat and delivered water.
  impulse(key, joules, waterKg = 0) {
    const r = this.worlds.get(key); if (!r) return false;
    const w = r.sim.world;
    const d = derive(w.params);
    if (joules > 0) {
      r.pulse += joules * IMPACT_GLOBAL_SHARE / d.area;
      // Refresh the diagnostics now, so the very next step sees the heating and
      // sizes itself for it rather than striding across the start of the pulse.
      w.params.internalHeat = r.baseHeat + r.pulse / (PULSE_TAU_YEARS * YEAR);
      r.sim.setParams({});
    }
    if (waterKg > 0) {
      const eo = waterKg / 1.4e21;
      w.water.ocean += eo;
      w.waterInitial = (w.waterInitial ?? 0) + eo;
      r.sim.setParams({});
    }
    this.fillRender(r);
    return true;
  }

  // A control edit. Composition controls rewrite the reservoir, forcing
  // controls just change the forcing, exactly as the climate sandbox does.
  set(key, patch) {
    const r = this.worlds.get(key); if (!r) return false;
    const sim = r.sim, w = sim.world;
    const d = derive(w.params);
    const p = { ...patch };
    if ('internalHeat' in p) { r.baseHeat = Math.max(0, +p.internalHeat || 0); delete p.internalHeat; }
    sim.setParams(p);
    const g = d.g;
    if ('n2Bar' in p) w.n2 = Math.max(0, p.n2Bar) * 1e5 / g;
    if ('o2Bar' in p) w.o2 = Math.max(0, p.o2Bar) * 1e5 / g;
    if ('co2Bar' in p) { w.co2 = Math.max(0, p.co2Bar) * 1e5 / g; w.co2Frozen = 0; }
    if ('ch4Bar' in p) w.ch4 = Math.max(0, p.ch4Bar) * 1e5 / g;
    if ('h2Bar' in p) {
      const pEnv = Math.max(p.h2Bar, 0), fHe = clamp(w.params.heliumFrac ?? 0, 0, 1);
      w.h2 = pEnv * (1 - fHe) * 1e5 / g; w.he = pEnv * fHe * 1e5 / g;
    }
    if ('water' in p) setWaterInventory(w, Math.max(0, p.water));
    w.params.internalHeat = r.baseHeat + (r.pulse > 0 ? r.pulse / (PULSE_TAU_YEARS * YEAR) : 0);
    sim.setParams({});
    this.fillRender(r);
    return true;
  }

  // ---- what the renderer and the panel read ----------------------------------------

  fillRender(r) {
    const w = r.sim.world, dg = w.diag, p = w.params, o = r.rs;
    if (!dg) return o;
    const acid = r.acid ? acidDetail(r) : null;
    for (let i = 0; i < NBANDS; i++) {
      o[RS.T + i] = w.T[i];
      o[RS.CLOUD + i] = dg.cloud ? dg.cloud[i] : 0;
    }
    // Sea ice per band, as the climate sandbox draws it: a 25 K ramp below 278
    // K, pinned frozen under a sky too thin for liquid water.
    let coldest = Infinity;
    for (let i = 0; i < NBANDS; i++) if (w.T[i] < coldest) coldest = w.T[i];
    const noLiquid = (1 - (dg.liquidAllowed ?? 1)) * clamp((273.16 - coldest) / 5, 0, 1);
    const shift = dg.freezeShift ?? 0;
    for (let i = 0; i < NBANDS; i++) {
      o[RS.ICE + i] = dg.hasWater
        ? Math.max(clamp(1 - (w.T[i] - 253 - shift) / 25, 0, 1), noLiquid) : 0;
    }
    // an acid sea's vapour veils the world as steam does
    const pH2Omean = mean(dg.pH2O) + (acid ? acid.vapourBar : 0);
    const steam = steamOpacity(pH2Omean);
    const atmo = atmosphereLook(w, steam, false);
    const hidden = surfaceHidden(dg, steam);
    const vc = vegetationColor(p.starTemp);
    const volc = volcanoLook(w);
    const molten = clamp((dg.Tmean - 1200) / 400, 0, 1) * (1 - hidden);
    o[RS.FLOOD] = dg.flooded ?? dg.oceanFrac ?? 0;
    o[RS.WATERCAP] = dg.waterCap ?? 0;
    o[RS.GLAC] = dg.glaciatedShare ?? 0;
    o[RS.BIO] = dg.bio ?? 0;
    o[RS.STEAM] = steam;
    o[RS.VEIL] = atmo.veil;
    o[RS.HAZE] = atmo.haze;
    o[RS.THICK] = atmo.thickness;
    o[RS.PTOT] = dg.pTotMean;
    o[RS.CO2F] = clamp(dg.pCO2 / Math.max(dg.pTotMean, 1e-6), 0, 1);
    o[RS.BARE] = 1 - hidden;
    o[RS.GLOW] = smoothstep(650, 750, dg.Tmax) * (1 - hidden);
    o[RS.LAM] = dg.lam ?? 0;
    o[RS.VEGR] = vc[0]; o[RS.VEGG] = vc[1]; o[RS.VEGB] = vc[2];
    o[RS.VENTS] = volc.vents * (1 - molten);
    o[RS.ASH] = volc.ash * (1 - molten);
    o[RS.TMEAN] = dg.Tmean; o[RS.TMIN] = dg.Tmin; o[RS.TMAX] = dg.Tmax;
    o[RS.STATE] = STATE_IDS.indexOf(stateOf(r));
    o[RS.LAG] = r.lag;
    o[RS.TIME] = w.time;
    o[RS.NOLIQ] = noLiquid;
    o[RS.CLOUDMEAN] = cloudLook(mean(dg.cloud || [0]), pH2Omean);
    o[RS.INSOL] = r.flux;
    o[RS.AIR] = smoothstep(0, 0.02, dg.pTotMean);
    o[RS.HASWATER] = dg.hasWater ? 1 : 0;
    o[RS.TOTALWATER] = dg.totalWater ?? 0;
    const sT = surfaceTemperature(dg).surfaceT;
    o[RS.SURFT] = sT == null ? NaN : sT;
    o[RS.OBLQ] = p.obliquity ?? 0;
    let meltShare = 0;
    if (r.magma) for (let i = 0; i < NBANDS; i++) if (r.magma[i] > 0) meltShare += 1 / NBANDS;
    o[RS.MAGMA] = meltShare;
    // the share of the world's water that is in the sky: what "the oceans
    // boiled" means, for the orrery's damage readouts
    const wt = w.water.ocean + w.water.seaIce + w.water.landIce + w.water.vapour;
    o[RS.BOILED] = wt > 0 ? clamp(w.water.vapour / wt, 0, 1) : 0;
    if (acid) {
      // the acid sea is the sea the globe draws and the damage readouts boil:
      // its cover, its pale ice, its share in the sky, its mass (as Earth oceans)
      o[RS.FLOOD] = acid.cover;
      for (let i = 0; i < NBANDS; i++) o[RS.ICE + i] = acidFrozen(w.T[i]);
      o[RS.BOILED] = acid.airShare;
      o[RS.TOTALWATER] = (dg.totalWater ?? 0) + acid.kgPerM2 * 4 * Math.PI * dg.d.R * dg.d.R / 1.4e21;
    }
    const g = r.ledger;
    o[RS.LIFE] = g ? g.level : 0;
    o[RS.LIFECAUSE] = g ? g.cause : -1;
    o[RS.LIFESINCE] = g ? g.since : 0;
    return o;
  }

  // Everything the info panel shows, for one world.
  detail(key) {
    const r = this.worlds.get(key); if (!r) return null;
    const w = r.sim.world, dg = w.diag, p = w.params;
    const g = dg.g;
    const sid = stateOf(r), S = sid ? ALL_STATES[sid] : null;
    const state = S ? { id: sid, ...S, habitable: sid in EXTRA_STATES ? false : !!(STATES[sid] && classifyHabitable(w)) } : null;
    const hist = w.history;
    // A few hundred points is plenty for a sparkline.
    const stride = Math.max(1, Math.ceil(hist.length / 240));
    const history = [];
    for (let i = 0; i < hist.length; i += stride) history.push([hist[i].t, hist[i].T]);
    if (hist.length) history.push([w.time, dg.Tmean]);
    const alb = mean(dg.alb);
    return {
      key,
      time: w.time,
      lag: r.lag,
      state: state ? { id: state.id, name: state.name, color: state.color, blurb: state.blurb,
                       habitable: !!state.habitable } : null,
      acid: r.acid ? acidDetail(r) : null,
      extremes: groundExtremes(r),
      Tmean: dg.Tmean, Tmin: dg.Tmin, Tmax: dg.Tmax,
      surface: surfaceTemperature(dg),
      flux: r.flux, insolation: p.insolation,
      absorbed: dg.absorbed, emitted: dg.emitted, imbalance: dg.imbalance,
      albedo: alb,
      cloud: mean(dg.cloud),
      pTot: dg.pTotMean,
      gas: {
        n2: w.n2 * g / 1e5, o2: w.o2 * g / 1e5, co2: w.co2 * g / 1e5, ch4: w.ch4 * g / 1e5,
        h2: (w.h2 + w.he) * g / 1e5, h2o: mean(dg.pH2O),
      },
      water: { ...w.water, total: dg.totalWater, initial: w.waterInitial },
      flooded: dg.flooded, iceMean: dg.iceMean, iceArea: dg.iceArea,
      openOcean: dg.openOcean ?? null, seaIce: dg.seaIceFrac ?? null, landIce: dg.landIceFrac ?? null,
      bio: dg.bio ?? 0,
      life: w.life ? { ...w.life } : null,
      ledger: r.ledger ? { ...r.ledger, causeId: LIFE_CAUSES[r.ledger.cause] || null } : null,
      g, R: dg.d ? dg.d.R : null,
      params: {
        landAlbedo: p.landAlbedo, obliquity: p.obliquity, rotationHours: p.rotationHours,
        tidallyLocked: !!p.tidallyLocked, internalHeat: r.baseHeat, biosphere: p.biosphere ?? 0,
        outgassing: p.outgassing ?? 0, landFraction: p.landFraction, mass: p.mass,
        salinity: p.salinity,
      },
      pulse: r.pulse,
      magma: r.magma ? Array.from(r.magma) : null,
      bands: Array.from(w.T),
      ice: Array.from(r.rs.subarray(RS.ICE, RS.ICE + NBANDS)),
      history,
      meta: r.meta,
    };
  }

  // ---- saving ------------------------------------------------------------------

  snapshotOne(r) {
    const s = captureWorld(r.sim.world);
    s.baseHeat = r.baseHeat;
    s.pulse = r.pulse;
    if (r.magma) s.magma = Array.from(r.magma);
    if (r.melted) s.melted = Array.from(r.melted);
    if (r.ledger) s.ledger = { ...r.ledger };
    if (r.acid) s.acid = { ...r.acid };
    s.flux = r.flux;
    // The clock's own state, so a restored world takes the same next step: the
    // credit it has not spent, the starlight banked since its last step, and
    // the interior heat the last step actually used (a pulse's step average).
    s.credit = r.credit; s.fluxAcc = r.fluxAcc; s.fluxTime = r.fluxTime;
    s.liveHeat = r.sim.world.params.internalHeat;
    // The live params carry the pulse inside internalHeat; save the base.
    s.params.internalHeat = r.baseHeat;
    return s;
  }

  snapshot() {
    const out = {};
    for (const [k, r] of this.worlds) out[k] = this.snapshotOne(r);
    return out;
  }

  restore(key, snap) {
    const r = this.worlds.get(key); if (!r) return false;
    this.applySnapshot(r, snap, r.sim.world.params);
    if (!r.acid && r.meta.acid) { r.acid = freshAcid(r.meta.acid); partitionAcid(r); acidOverlay(r); }
    if (!r.ledger) r.ledger = this.freshLedger(r);
    this.fillRender(r);
    return true;
  }
}

const now = (typeof performance !== 'undefined' && performance.now)
  ? () => performance.now() : () => Date.now();
