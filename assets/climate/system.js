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
import { NBANDS, maxStep, setWaterInventory } from './physics/climate.js';
import { derive } from './physics/planet.js';
import { clamp, smoothstep, steamOpacity, YEAR, S_EARTH } from './physics/constants.js';
import { atmosphereLook, cloudLook, surfaceHidden, volcanoLook } from './render/atmosphere.js';
import { vegetationColor } from './render/terrain.js';
import { surfaceTemperature } from './physics/surface.js';
import { paramsFor, profileMeta } from './profiles.js';

export const STATE_IDS = Object.keys(STATES);

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
  SURFT: 84, OBLQ: 85,
  SIZE: 88,
};

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
      lagReq: 0, lagDone: 0, lagDrop: 0, lag: 1,
      meta: profileMeta(sys, data),
      rs: new Float32Array(RS.SIZE),
    };
    if (opts.snapshot) this.applySnapshot(rec, opts.snapshot, params);
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
    w.params.internalHeat = r.baseHeat + pulseFlux;
    const room = Math.min(maxStep(w, 2.5), Math.max(this.rate * 0.3, MIN_STEP_YEARS), 5e6);
    const floor = Math.min(room, Math.max(this.rate * MIN_STEP_WALL, MIN_STEP_YEARS));
    if (r.credit < floor) return false;
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
    sim.stepOnce(dt);
    r.lagDone += dt;
    this.stepsTaken++;
    if (r.pulse <= 0 && w.params.internalHeat !== r.baseHeat) {
      w.params.internalHeat = r.baseHeat;
    }
    this.fillRender(r);
    return true;
  }

  // ---- things done to a world ---------------------------------------------------

  // Energy from an impact, a laser or a supernova front. Only a share of it is
  // ever global heat; the rest the orrery already spends on craters and melt.
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
    const pH2Omean = mean(dg.pH2O);
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
    let st = 0;
    try { st = STATE_IDS.indexOf(classify(w).id); } catch (_) { st = -1; }
    o[RS.STATE] = st;
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
    return o;
  }

  // Everything the info panel shows, for one world.
  detail(key) {
    const r = this.worlds.get(key); if (!r) return null;
    const w = r.sim.world, dg = w.diag, p = w.params;
    const g = dg.g;
    let state = null;
    try { state = classify(w); } catch (_) { state = null; }
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
      bio: dg.bio ?? 0,
      life: w.life ? { ...w.life } : null,
      g, R: dg.d ? dg.d.R : null,
      params: {
        landAlbedo: p.landAlbedo, obliquity: p.obliquity, rotationHours: p.rotationHours,
        tidallyLocked: !!p.tidallyLocked, internalHeat: r.baseHeat, biosphere: p.biosphere ?? 0,
        outgassing: p.outgassing ?? 0, landFraction: p.landFraction, mass: p.mass,
        salinity: p.salinity,
      },
      pulse: r.pulse,
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
    this.fillRender(r);
    return true;
  }
}

const now = (typeof performance !== 'undefined' && performance.now)
  ? () => performance.now() : () => Date.now();
