// A sea of sulfuric acid: Nephtys's, and any world given one. The model knows
// one liquid, water, and this is a second one kept beside it. It reaches the
// physics through one door, `params.overlay` (PATCHES.md), per band:
//
//   vapour  the water in the acid's vapour, in bar, which is water. Over ~98 %
//           acid the vapour is not the liquid's own mixture: it is H2SO4, SO3
//           and water in the shares their partial pressures have over it --
//           41/39/20 % water/H2SO4/SO3 at 500 K, wetter as it cools (water
//           fitted to Gmitro & Vermeulen 1964, H2SO4 Ayers, Gillett & Gras
//           1980, SO3 the JANAF equilibrium H2SO4(l) = SO3 + H2O)
//   gas     the H2SO4 and SO3, in bar: in the air's pressure and its cloud, in
//           neither of water's radiative terms
//   olr     the share of the band's outgoing longwave they let out. H2SO4 has
//           ~750 km/mol of bands inside the 770-1250 cm^-1 window (ab initio,
//           NIST CCCBDB; eleven times water's whole bending band) and closes the
//           gap a hot CO2 sky leaves near 1100-1300 cm^-1; SO3 absorbs outside
//           it. What that does was measured line by line (tools/acid-lbl.py:
//           HITRAN CO2, H2O, SO3, CO2-CO2 collision-induced absorption) and is
//           read here off its table: 0.931 at Nephtys, where 11 bar of CO2 at
//           500 K has closed most of the window already; 0.79 under 1 bar
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

// What the vapour over the sea is made of at T: shares of H2SO4, SO3 and water.
export function acidShares(T) {
  const t = Math.max(T, 150), lt = Math.log(t);
  const pw = Math.exp(46.674 - 10145.1 / t - 3.0333 * lt) / 1e5;               // bar
  const ph = Math.exp(16.259 - 10156 / t) * 1.01325;                             // bar
  const ps = 0.87 * Math.exp(98.609 - 24250.3 / t - 9.438 * lt) / pw;            // bar
  const s = pw + ph + ps;
  return { h2so4: ph / s, so3: ps / s, h2o: pw / s };
}

// The share of a band's outgoing longwave the acid's H2SO4 and SO3 let out,
// by its temperature, the CO2 over it and the acid's humidity (vapour over
// saturation): tools/acid-lbl.py's table, interpolated (ln CO2), no acid 1.
export const ACID_OLR = {
  // tools/acid-lbl.py, surface temperature (K) x CO2 (bar) x the acid's humidity
  Ts: [300, 350, 400, 450, 504, 575, 650, 725, 800],
  pco2: [0.3, 1, 3, 11.22, 30, 90],
  lnp: [-1.203973, 0.000000, 1.098612, 2.417698, 3.401197, 4.499810],
  RH: [0.02, 0.2, 1],
  ratio: [
    [[1.0000, 0.9999, 0.9998], [1.0000, 0.9999, 0.9999], [1.0000, 1.0000, 1.0000], [1.0000, 1.0000, 1.0000], [1.0000, 1.0000, 1.0000], [1.0000, 1.0000, 1.0000]],
    [[0.9942, 0.9790, 0.9739], [0.9965, 0.9875, 0.9840], [0.9984, 0.9941, 0.9924], [0.9999, 0.9997, 0.9996], [1.0000, 1.0000, 1.0000], [1.0000, 1.0000, 1.0000]],
    [[0.8827, 0.8717, 0.8727], [0.9150, 0.9020, 0.9024], [0.9525, 0.9423, 0.9422], [0.9943, 0.9929, 0.9929], [0.9999, 0.9999, 0.9999], [1.0000, 1.0000, 1.0000]],
    [[0.7904, 0.7968, 0.7986], [0.8275, 0.8303, 0.8315], [0.8823, 0.8818, 0.8823], [0.9707, 0.9701, 0.9701], [0.9982, 0.9982, 0.9982], [1.0000, 1.0000, 1.0000]],
    [[0.7319, 0.7522, 0.7557], [0.7667, 0.7828, 0.7859], [0.8202, 0.8298, 0.8316], [0.9307, 0.9311, 0.9311], [0.9873, 0.9873, 0.9873], [0.9999, 0.9999, 0.9999]],
    [[0.7168, 0.7395, 0.7402], [0.7410, 0.7626, 0.7634], [0.7807, 0.7965, 0.7971], [0.8738, 0.8755, 0.8755], [0.9528, 0.9528, 0.9528], [0.9967, 0.9967, 0.9967]],
    [[0.7277, 0.7320, 0.7320], [0.7447, 0.7497, 0.7497], [0.7702, 0.7755, 0.7755], [0.8284, 0.8298, 0.8298], [0.9039, 0.9039, 0.9039], [0.9794, 0.9794, 0.9794]],
    [[0.7245, 0.7244, 0.7244], [0.7394, 0.7397, 0.7397], [0.7586, 0.7591, 0.7591], [0.8004, 0.8008, 0.8008], [0.8577, 0.8578, 0.8578], [0.9464, 0.9464, 0.9464]],
    [[0.7170, 0.7170, 0.7170], [0.7313, 0.7313, 0.7313], [0.7468, 0.7468, 0.7468], [0.7804, 0.7804, 0.7804], [0.8235, 0.8235, 0.8235], [0.9064, 0.9064, 0.9064]]
  ],
};
export function acidOlrFactor(T, pCO2, RH) {
  const tb = ACID_OLR, h = clamp(RH, 0, 1);
  if (!(h > 0)) return 1;
  const at = (xs, x) => {
    if (x <= xs[0]) return [0, 0];
    for (let j = 0; j < xs.length - 1; j++) if (x <= xs[j + 1]) return [j, (x - xs[j]) / (xs[j + 1] - xs[j])];
    return [xs.length - 2, 1];
  };
  const [it, ft] = at(tb.Ts, T), [ic, fc] = at(tb.lnp, Math.log(Math.max(pCO2, 1e-6)));
  // humidity: from 1 at none to the table's first row, then across it
  const hs = [0, ...tb.RH];
  const [ih, fh] = at(hs, h);
  const val = (a, b, c) => (c === 0 ? 1 : tb.ratio[a][b][c - 1]);
  let v = 0;
  for (const [a, wa] of [[it, 1 - ft], [it + 1, ft]])
    for (const [b, wb] of [[ic, 1 - fc], [ic + 1, fc]])
      for (const [c, wc] of [[ih, 1 - fh], [ih + 1, fh]])
        v += wa * wb * wc * val(a, b, c);
  return clamp(v, 0, 1);
}

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
  const ov = { vapour: new Array(NBANDS), gas: new Array(NBANDS), olr: new Array(NBANDS),
    share: new Array(NBANDS), albedo: new Array(NBANDS), C: new Array(NBANDS) };
  const pCO2 = Math.max(w.co2, 0) * k.g / 1e5;
  for (let i = 0; i < NBANDS; i++) {
    const T = w.T[i], v = k.demand[i] * k.scale * k.g / 1e5, sh = acidShares(T);
    ov.vapour[i] = v * sh.h2o;
    ov.gas[i] = v * (sh.h2so4 + sh.so3);
    ov.olr[i] = acidOlrFactor(T, pCO2, v / Math.max(acidPsat(T), 1e-30));
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
  let vBar = 0, wBar = 0, hBar = 0, sBar = 0, aw = 0, olr = 0;   // bar of acid vapour, of water vapour
  const ov = w.params.overlay, pw = w.diag.pH2O;
  for (let i = 0; i < NBANDS; i++) {
    if (ov && ov.vapour) {
      const sh = acidShares(w.T[i]), g = ov.gas ? ov.gas[i] : 0;
      vBar += (ov.vapour[i] + g) / NBANDS;
      aw += ov.vapour[i] / NBANDS;
      hBar += g * sh.h2so4 / Math.max(sh.h2so4 + sh.so3, 1e-30) / NBANDS;
      sBar += g * sh.so3 / Math.max(sh.h2so4 + sh.so3, 1e-30) / NBANDS;
      olr += (ov.olr ? ov.olr[i] : 1) / NBANDS;
    }
    if (pw) wBar += pw[i] / NBANDS;
  }
  // the pressure it boils under: the air over the sea, its own vapour included
  // (a trace at 231 C, the most of it once the sea is in the sky); not the
  // water's, which is a separate liquid's business
  const pAir = Math.max((w.diag.pTotMean ?? 0) - wBar, 0);
  return {
    cover: k.cover, frozen: k.fzMean,
    depthM: a.sea / Math.max(k.cover * ACID.RHO, 1e-9),
    vapourBar: vBar, h2so4Bar: hBar, so3Bar: sBar, h2oBar: aw, olrFactor: olr,
    airShare: k.total > 0 ? a.vap / k.total : 0,
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
