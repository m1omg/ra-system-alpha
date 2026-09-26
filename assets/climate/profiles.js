// Which bodies have a climate, and what their climate is made of.
//
// The real worlds start from the climate sandbox's own calibrated presets --
// Earth, Venus, Mars, the Moon and the Galilean moons are the same planets
// there as here, and a second set of numbers for them would only be a second
// chance to be wrong. The Ra worlds are fiction, so they are built from what
// "Satis v10" says about them: composition from the author's Universe Sandbox
// save (data.js `comp`), pressures and temperatures from each world's stats
// table. Each has one knob -- a greenhouse gas, an albedo or an interior heat
// flow -- set by tools/climate-tune.mjs so the world holds its documented
// temperature at its documented orbit. The tuned values live in TUNED below and
// are written by that tool; everything else is hand-set.
//
// Evolution is switched off on every world. The orrery's star is the star, and
// a planet in a sandbox should hold still until something is done to it: no
// Gough brightening, no radiogenic decay, no fossil-fuel industry.
import { EARTH, PRESETS, PREINDUSTRIAL } from './game/presets.js';
import { condensedRadius, waterForShareOfMass, maxWaterEO } from './physics/planet.js';
import { TUNED } from './tuned.js';

const M_EARTH_KG = 5.9722e24;

export const STILL = {
  brightening: 0, realisticGeology: false, xuvDecay: false, smoothInsolation: false,
  emissions: 0, fossilUsed: 0, fossilInfinite: false, resurfacingAge: 0,
  // silicate weathering stops speeding up above 320 K: erosion-limited (PATCHES.md)
  weatherCapK: 320,
  // life follows the climate (PATCHES.md): origins take their time, a
  // sterilised world stays sterile, heat kills fast and still kills on a world
  // boiled dry, the deep crust shelters microbes from a passing boil, and only
  // living things make oxygen and methane
  originWait: true, abiogenesis: false, heatKillsDry: true, heatDeathFastYears: 1 / 365.25,
  deepRefuge: true, lifeGatesBio: true,
};

// Kinds the orrery draws with a solid surface. Gas giants, brown dwarfs, stars
// and debris remnants have no climate here.
export const CLIMATE_KINDS = new Set(['rocky', 'terran', 'ocean', 'lava', 'iceworld', 'icemoon']);
// Below this the "planet" is a boulder: Phobos and Deimos are 1e16 kg, and a
// model built around gravity holding an atmosphere has nothing to say there.
export const MIN_CLIMATE_MASS_KG = 1e20;
// ...and above this a "rocky" body is a sandbox slider pushed to the end, not
// a terrestrial planet. The climate sandbox's own mass control stops at ten.
export const MAX_CLIMATE_MASS_KG = 20 * M_EARTH_KG;

// Light sources. Luminosity in solar units, effective temperature in kelvin.
// Horus is a brown dwarf: 4πR²σT⁴ with its documented 62,920 km and 559 °C
// gives 1.35e21 W, and that is what lights its four worlds -- Nut, the one of
// them with no atmosphere to speak of, comes out at its documented -190 °C on
// that number alone, which is the check that it is the right one.
export const LUMINOUS = {
  sun: { L: 1, T: 5772 },
  ra: { L: 3.042, T: 6050 },
  horus: { L: 3.53e-6, T: 832 },
};

const icy = (share) => ({ landFraction: 0, n2Bar: 0, o2Bar: 0, co2Bar: 0, ch4Bar: 0, h2Bar: 0,
  biosphere: 0, outgassing: 0, magneticField: 0, salinity: 0, tidallyLocked: false,
  waterShare: share });
const airless = { landFraction: 1, water: 0, n2Bar: 0, o2Bar: 0, co2Bar: 0, ch4Bar: 0, h2Bar: 0,
  biosphere: 0, outgassing: 0, magneticField: 0, tidallyLocked: false };

// `keepBody`: the preset's own mass and mass-radius relation are part of its
// calibration, so the orrery's figures are not written over them.
// `clouds`: how the renderer treats the cloud deck the climate computes --
// 'full' where the surface map is cloud-free, 'delta' where the artist already
// painted clouds (only the change from today is drawn), 'none' where the map is
// the cloud deck itself (Venus).
// `veg`: which colour family on the map is vegetation, for the biosphere to
// wither when the climate stops supporting it.
export const PROFILES = {
  sol: {
    earth:   { base: PRESETS.earth.params, keepBody: true, clouds: 'full', veg: 'green', dem: 'earth' },
    venus:   { base: PRESETS.venus.params, keepBody: true, clouds: 'none' },
    mars:    { base: PRESETS.mars.params, keepBody: true, clouds: 'full', dem: 'mars' },
    moon:    { base: PRESETS.moon.params, keepBody: true, clouds: 'full' },
    mercury: { base: { ...EARTH, ...airless, internalHeat: 0.02, landAlbedo: 0.088,
                obliquity: 0.03, startT: 440 }, clouds: 'full' },
    europa:  { base: PRESETS.europa.params, clouds: 'full' },
    ganymede:{ base: PRESETS.ganymede.params, clouds: 'full' },
    callisto:{ base: PRESETS.callisto.params, clouds: 'full' },
    // Io's volcanoes vent sulphur, which this model does not carry; a little
    // outgassing keeps its vents lit without inventing a CO2 atmosphere.
    io:      { base: { ...EARTH, ...airless, outgassing: 0.3, internalHeat: 2.5,
                landAlbedo: 0.63, obliquity: 0, startT: 110 }, clouds: 'full' },
    // Titan's 1.47 bar is nitrogen with five per cent methane at the ground,
    // over an ice crust; the rest of its bulk water is ice deep down.
    titan:   { base: { ...PRESETS.titan.params, n2Bar: 1.42, ch4Bar: 0.07, co2Bar: 1e-6,
                obliquity: 26.7, landFraction: 0.6, startT: 94 }, waterShare: 0.45,
                clouds: 'full' },
    enceladus: { base: { ...EARTH, ...icy(0.6), internalHeat: 0.02, startT: 75 }, clouds: 'full' },
    triton:  { base: { ...EARTH, ...icy(0.35), n2Bar: 1.4e-5, internalHeat: 0.005, startT: 38 },
               clouds: 'full' },
    pluto:   { base: { ...EARTH, ...icy(0.35), n2Bar: 1.1e-5, internalHeat: 0.003, obliquity: 57,
                startT: 44 }, clouds: 'full' },
    charon:  { base: { ...EARTH, ...icy(0.4), internalHeat: 0.002, startT: 50 }, clouds: 'full' },
  },
  ra: {
    // A hot, bone-dry desert under 0.011 bar. Tuned: the albedo.
    set: { base: { ...EARTH, ...airless, n2Bar: 0.002, co2Bar: 0.009, outgassing: 0.02,
            internalHeat: 0.03, obliquity: 12, landAlbedo: 0.3, startT: 393 },
           target: 393, knob: 'landAlbedo', clouds: 'full' },
    // The book's ocean is sulphuric acid, and this model has one solvent: water.
    // Water at 1.45 S(+) runs away however the sky is set up (measured: a
    // hundredth of an ocean already ends as a steam atmosphere), so the acid
    // sea stays what it can be here -- scenery on the map -- and the climate
    // under it is a dry CO2 greenhouse at the documented 231 C. Tuned: the CO2.
    nephtys: { base: { ...EARTH, ...airless, landFraction: 0.18, n2Bar: 2, co2Bar: 10,
            obliquity: 15, landAlbedo: 0.2, internalHeat: 0.1, outgassing: 0.2, startT: 504 },
           target: 504, knob: 'co2Bar', clouds: 'delta',
           note: 'acid' },
    // 0.62 atm, 66% oxygen and 29% nitrogen, violet forests. "Water covers 60
    // percent of Satis, but Satis has only a fraction of Earth's water ... its
    // seas being shallow on average": a fifth of an ocean in broad, shallow
    // basins (sea cover is (1 - landFraction) W^(1/4), so 0.2 oceans cover 60 %
    // at 0.10), about 2.4 km deep where Earth's are 3.7. Tuned: the CO2 for the
    // temperature, the volcanoes to hold the CO2, and the biosphere to hold the
    // oxygen -- the volcanic gases that balance the carbon eat oxygen seven
    // times Earth's rate, and an Earth-strength biosphere let it fall to a
    // tenth in 20 Myr and the planet cool to 7 C.
    satis: { base: { ...EARTH, landFraction: 0.10, water: 0.2, n2Bar: 0.18, o2Bar: 0.41,
            co2Bar: 1e-3, ch4Bar: 1e-6, biosphere: 1, obliquity: 20, landAlbedo: 0.22,
            internalHeat: 0.06, startT: 297 },
           target: 297, knob: 'co2Bar', balance: ['oxygen'], clouds: 'delta', veg: 'purple' },
    // A 9 M⊕ world, 28% water by mass, temperate at a quarter of Earth's
    // sunlight under 5.5 bar of hydrogen and methane. Tuned: the hydrogen.
    uatur: { base: { ...EARTH, landFraction: 0, heliumFrac: 0.1, h2Bar: 3, n2Bar: 0.7,
            co2Bar: 0.3, ch4Bar: 0.2, o2Bar: 0, biosphere: 0.05, obliquity: 10,
            internalHeat: 0.3, outgassing: 0.5, startT: 281 }, waterShare: 0.281,
           target: 281, knob: 'h2Bar', clouds: 'delta' },
    // A low-density world 4% gas by mass, -130 C at 1.2% of Earth's light.
    // Tuned: the hydrogen.
    shu: { base: { ...EARTH, ...icy(0.375), heliumFrac: 0.1, h2Bar: 2, internalHeat: 0.2,
            obliquity: 18, startT: 143 }, target: 143, knob: 'h2Bar', clouds: 'delta' },
    // Frozen super-Earth 560 AU out. Tuned: the interior heat.
    yamm: { base: { ...EARTH, ...icy(0.151), landFraction: 0.3, internalHeat: 0.05,
            obliquity: 10, startT: 31 }, target: 31, knob: 'internalHeat', clouds: 'full' },
    // Sednoid at 11,000 AU: 10 K. Tuned: the interior heat.
    kauket: { base: { ...EARTH, ...icy(0.625), internalHeat: 5e-4, obliquity: 5, startT: 10 },
              target: 10, knob: 'internalHeat', clouds: 'full' },
    // Wadjet's lava moon at 49 times Earth's sunlight, kneaded by its planet.
    sekhmet: { base: { ...EARTH, ...airless, internalHeat: 5, landAlbedo: 0.1, obliquity: 2,
            startT: 700 }, clouds: 'full' },
    // Satis's moon: half the Moon's mass (the book says so; data.js has no figure).
    satismoon: { base: { ...EARTH, ...airless, internalHeat: 0.01, landAlbedo: 0.12,
            obliquity: 3, startT: 270 }, massKg: 3.67e22, clouds: 'full' },
    // Uat-Ur's moons: -93 C and -100 C, airless. Tuned: the albedo.
    nu: { base: { ...EARTH, ...airless, water: 0, internalHeat: 0.05, landAlbedo: 0.3,
            obliquity: 3, startT: 180 }, target: 180, knob: 'landAlbedo', clouds: 'full' },
    naunet: { base: { ...EARTH, ...airless, internalHeat: 0.03, landAlbedo: 0.35,
            obliquity: 3, startT: 173 }, target: 173, knob: 'landAlbedo', clouds: 'full' },
    // Horus's worlds, lit by a brown dwarf at 0.05 S⊕ and kneaded by it.
    // Anubis: a hot ocean half its mass in water at 81 C -- a Hycean world with
    // tidal heat. Tuned: the hydrogen.
    anubis: { base: { ...EARTH, landFraction: 0, heliumFrac: 0.1, h2Bar: 5, n2Bar: 0.5,
            co2Bar: 0.1, ch4Bar: 0, o2Bar: 0, biosphere: 0, obliquity: 2,
            internalHeat: 1.0, outgassing: 1, tidallyLocked: false, startT: 354 },
              waterShare: 0.459, target: 354, knob: 'h2Bar', clouds: 'delta' },
    // Khonsu: -99.5 C under a thin CO2 sky. Tuned: the interior heat.
    khonsu: { base: { ...EARTH, landFraction: 0.7, n2Bar: 0.05, co2Bar: 0.1, o2Bar: 0,
            ch4Bar: 0, biosphere: 0, obliquity: 3, internalHeat: 30, outgassing: 1,
            landAlbedo: 0.3, startT: 174 }, waterShare: 0.136,
              target: 174, knob: 'internalHeat', clouds: 'full' },
    // Nut: -190 C, airless. Tuned: the albedo.
    nut: { base: { ...EARTH, ...airless, internalHeat: 0.02, landAlbedo: 0.4, obliquity: 3,
            startT: 83 }, target: 83, knob: 'landAlbedo', clouds: 'full' },
  },
};

// A body the book does not describe, or one created in the sandbox: a plain
// world of its kind, sized to its mass.
function kindProfile(kind) {
  switch (kind) {
    case 'terran':
      return { base: { ...PREINDUSTRIAL, emissions: 0, fossilUsed: 0 }, waterPerMass: 1,
               clouds: 'full', veg: 'green' };
    case 'ocean':
      return { base: { ...PREINDUSTRIAL, landFraction: 0, biosphere: 0.3, emissions: 0,
               fossilUsed: 0 }, waterShare: 0.1, clouds: 'full' };
    case 'iceworld': case 'icemoon':
      return { base: { ...EARTH, ...icy(0.4), internalHeat: 0.01, startT: 120 }, clouds: 'full' };
    case 'lava':
      return { base: { ...EARTH, ...airless, internalHeat: 2, landAlbedo: 0.12, startT: 600 },
               clouds: 'full' };
    case 'rocky': default:
      return { base: { ...EARTH, ...airless, n2Bar: 0.01, co2Bar: 0.005, outgassing: 0.1,
               internalHeat: 0.03, landAlbedo: 0.2, startT: 250 }, clouds: 'full' };
  }
}

export function climateCapable(d) {
  if (!d || !CLIMATE_KINDS.has(d.kind)) return false;
  const prof = PROFILES.ra[d.key] || PROFILES.sol[d.key];
  const m = d.massKg ?? prof?.massKg;
  if (!(m > 0)) return !!prof;           // a described world without a mass figure
  return m >= MIN_CLIMATE_MASS_KG && m <= MAX_CLIMATE_MASS_KG;
}

export function profileOf(sys, d) {
  const table = PROFILES[sys] || {};
  return (!d.custom && table[d.key]) || kindProfile(d.kind);
}

// The params a world starts with. `d` is the orrery's body record: key, kind,
// massKg, radiusKm, rotationPeriod (days), comp.
export function paramsFor(sys, d) {
  if (!climateCapable(d)) return null;
  const prof = profileOf(sys, d);
  const p = { ...prof.base, ...STILL };
  const tuned = !d.custom && TUNED[sys] && TUNED[sys][d.key];
  if (tuned) Object.assign(p, tuned);
  if (!prof.keepBody) {
    const kg = d.massKg ?? prof.massKg;
    if (kg > 0) p.mass = kg / M_EARTH_KG;
    // Water as a share of the planet's mass, where the profile gives one --
    // from the book's composition when it has one, else the profile's figure.
    const share = prof.waterShare ?? prof.base.waterShare;
    if (share > 0) p.water = Math.min(waterForShareOfMass(p.mass, share), maxWaterEO(p.mass));
    else if (prof.waterPerMass > 0) p.water = prof.waterPerMass * p.mass;
    delete p.waterShare;
    if (d.rotationPeriod > 0 && !(prof.base.rotationHours > 0 && prof.keepRotation)) {
      p.rotationHours = Math.abs(d.rotationPeriod) * 24;
    }
    p.radiusScale = 1;
    if (d.radiusKm > 0) p.radiusScale = d.radiusKm * 1000 / condensedRadius(p);
  }
  delete p.waterShare;
  if (tuned) Object.assign(p, tuned);
  return p;
}

// What the renderer needs to know that is not climate.
export function profileMeta(sys, d) {
  const prof = profileOf(sys, d);
  return {
    clouds: prof.clouds || 'full',
    veg: prof.veg || null,
    dem: prof.dem || null,
    target: prof.target ?? null,
    note: prof.note || null,
  };
}
