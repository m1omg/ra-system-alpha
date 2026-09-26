// A sea of sulfuric acid: Nephtys's, and any world given one. The model knows
// one liquid, water, and this is a second one kept beside it. It reaches the
// physics through one door, `params.overlay` (PATCHES.md), per band:
//
//   vapour  the acid in the air, in bar, radiatively taken as water vapour --
//           the model's only condensable greenhouse, and a stated stand-in:
//           the acid's own bands (S=O near 1150-1450, S-OH near 900 cm^-1) sit
//           partly in the window water leaves open, and there is no measured
//           opacity for its vapour at these pressures to put in its place
//   share   the ground the sea covers, and
//   albedo  what that cover reflects: the dark liquid, or its pale ice
//   C       the heat the sea holds: its mixed layer, and the latent heat of the
//           acid that evaporates as it warms (the model's cLat, for water)
//
// set before every step from the temperatures the last one left, the vapour
// re-read from the new ones after it. Nothing boils as a special case: the
// vapour follows the acid's Clausius-Clapeyron curve until the supply runs out,
// as the model's water does, and past the boiling point that is the whole sea,
// in the air, at the heat it took to put it there.
import { NBANDS, update, maxStep } from './physics/climate.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Nearly pure acid: the 98.3 % azeotrope a sea of it distils to.
export const ACID = {
  RHO: 1830,          // kg/m^3
  CP: 1400,           // J/kg/K
  TB1: 611,           // K: boils at 338 C under one atmosphere
  // ln p = -SLOPE/T + const over concentrated acid (Ayers, Gillett & Gras 1980,
  // GRL 7, 433), anchored on the boiling point above
  SLOPE: 10156,       // K
  L: 8.62e5,          // J/kg: the heat that slope is, R * SLOPE / M
  FREEZE: 276,        // K: +3 C
  ALB: 0.07,          // the liquid, dark as a sea is; the colour is the map's
  ICE_ALB: 0.5,       // frozen acid, pale
  MIX: 60,            // m: the mixed layer, the model's own depth for water
};

// Vapour pressure over the sea, in bar; and where it boils under `pBar` of air.
export function acidPsat(T) { return 1.01325 * Math.exp(ACID.SLOPE * (1 / ACID.TB1 - 1 / T)); }
export function acidBoil(pBar) {
  const inv = 1 / ACID.TB1 - Math.log(Math.max(pBar, 1e-12) / 1.01325) / ACID.SLOPE;
  return inv > 1e-5 ? 1 / inv : 1e5;
}
// Share of a band's sea that is frozen: a six-kelvin ramp about +3 C.
export function acidFrozen(T) { return clamp((ACID.FREEZE + 3 - T) / 6, 0, 1); }

// A world's acid, in kilograms per square metre of the whole planet: in its
// basins (`sea`, liquid or frozen) and in its air (`vap`). `M` is what it had
// to start with, which fixes how the basins fill: cover goes as the fourth root
// of how full they are, the model's own hypsometry for water.
export function freshAcid(spec) {
  const M = spec.cover * spec.depth * ACID.RHO;
  return { M, sea: M, vap: 0, cover0: spec.cover };
}
function coverOf(a) { return a.M > 0 ? a.cover0 * Math.pow(clamp(a.sea / a.M, 0, 1), 0.25) : 0; }

// Where the acid is, at the temperatures the world has now. Humidity as the
// model's: from the open sea and what is already in the air.
function reckon(a, w) {
  const g = w.diag.g, cover = coverOf(a), total = a.sea + a.vap;
  const fz = new Float64Array(NBANDS);
  let fzMean = 0;
  for (let i = 0; i < NBANDS; i++) { fz[i] = acidFrozen(w.T[i]); fzMean += fz[i] / NBANDS; }
  const airborne = total > 0 ? a.vap / total : 0;
  const RH = clamp(0.34 + 0.44 * clamp(cover * (1 - fzMean) + airborne, 0, 1), 0.15, 0.85);
  const demand = new Float64Array(NBANDS);
  let dMean = 0;
  for (let i = 0; i < NBANDS; i++) { demand[i] = RH * acidPsat(w.T[i]) * 1e5 / g; dMean += demand[i] / NBANDS; }
  const scale = dMean > total ? total / Math.max(dMean, 1e-30) : 1;
  return { g, cover, fz, fzMean, RH, demand, scale, vapMean: dMean * scale, total };
}

// Hand the physics what the acid does, for the step about to be taken, and
// bring its diagnostics up to date with it. `r` holds `sim` and `acid`.
export function acidOverlay(r) {
  const a = r.acid, w = r.sim.world, k = reckon(a, w);
  const depth = a.sea / Math.max(k.cover * ACID.RHO, 1e-9);
  const mix = Math.min(ACID.MIX, depth);
  // New arrays every time, never written into: a world loaded from a snapshot
  // shares the snapshot's, and writing into them rewrote the spin-up table for
  // every world loaded after it.
  const ov = { vapour: new Array(NBANDS), share: new Array(NBANDS), albedo: new Array(NBANDS), C: new Array(NBANDS) };
  for (let i = 0; i < NBANDS; i++) {
    const T = w.T[i];
    ov.vapour[i] = k.demand[i] * k.scale * k.g / 1e5;
    ov.share[i] = k.cover;
    ov.albedo[i] = ACID.ALB * (1 - k.fz[i]) + ACID.ICE_ALB * k.fz[i];
    // frozen over, the sea below is cut off from the air, as the model's sea ice does
    const cMix = k.cover * (1 - 0.92 * k.fz[i]) * mix * ACID.RHO * ACID.CP;
    // the acid each kelvin puts in the air, while there is sea left to give it
    const cLat = k.scale > 0.999 ? ACID.L * k.RH * acidPsat(T) * ACID.SLOPE / (T * T) * 1e5 / k.g : 0;
    ov.C[i] = cMix + cLat;
  }
  w.params.overlay = ov;
  update(w, 0);
}

// After a step: the air holds what the new temperatures ask for, as far as the
// sea can give it; the rest is sea. The heat that took was in the step's C.
export function partitionAcid(r) {
  const a = r.acid, k = reckon(a, r.sim.world);
  a.vap = Math.min(k.vapMean, k.total);
  a.sea = k.total - a.vap;
}

// What the panel and the checks read.
export function acidDetail(r) {
  const a = r.acid, w = r.sim.world, k = reckon(a, w);
  let vBar = 0, wBar = 0;   // bar of acid vapour, and of water vapour
  const ov = w.params.overlay, pw = w.diag.pH2O;
  for (let i = 0; i < NBANDS; i++) {
    if (ov && ov.vapour) vBar += ov.vapour[i] / NBANDS;
    if (pw) wBar += pw[i] / NBANDS;
  }
  // the pressure it boils under: the air over the sea, its own vapour included
  // (a trace at 231 C, the most of it once the sea is in the sky); not the
  // water's, which is a separate liquid's business
  const pAir = Math.max((w.diag.pTotMean ?? 0) - wBar, 0);
  return {
    cover: k.cover, frozen: k.fzMean,
    depthM: a.sea / Math.max(k.cover * ACID.RHO, 1e-9),
    vapourBar: vBar, airShare: k.total > 0 ? a.vap / k.total : 0,
    pAirBar: pAir, boilC: acidBoil(pAir) - 273.15,
    kgPerM2: k.total,
  };
}

// A bare simulation stepped with its acid, as ClimateSystem.stepWorld steps
// one: for the tuner, which runs the physics without the system.
export function runWithAcid(sim, acid, years, stepCap = 2e6) {
  const r = { sim, acid };
  let done = 0, guard = 0;
  while (done < years && guard++ < 400000) {
    acidOverlay(r);
    const dt = Math.min(maxStep(sim.world), years - done, stepCap);
    sim.stepOnce(dt);
    partitionAcid(r);
    done += dt;
  }
  acidOverlay(r);
  return done;
}
