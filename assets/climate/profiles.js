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
    // The brightest ice in the Solar System: Bond albedo 0.81 (Howett et al.
    // 2010), the quantity the energy balance wants -- the "0.99" of its data row
    // is the visual geometric albedo, which is not. At 0.60, the model's sea
    // ice, its noon was 103 K; at 0.81 it is 85 K, where Cassini saw about 80.
    enceladus: { base: { ...EARTH, ...icy(0.6), internalHeat: 0.02, iceAlbedo: 0.81, startT: 62 }, clouds: 'full' },
    // Nitrogen frost (volatileIces, PATCHES.md): the air of both is the vapour
    // over their ice, so each is held at the temperature its frost was measured
    // at -- which is what sets its air -- by the frost's albedo. Triton: 14
    // microbar over N2 ice at 38 K (Voyager 2); how much frost lies on it is
    // not known, and ten metres of it worldwide is taken here.
    triton:  { base: { ...EARTH, ...icy(0.35), n2Bar: 1.4e-5, internalHeat: 0.005, startT: 38,
                volatileIces: true, n2IceBar: 0.08, iceAlbedo: 0.7 },
               target: 38, knob: 'iceAlbedo', clouds: 'full' },
    // Pluto: 11.5 microbar over N2 ice at 37 K (New Horizons; the "-229 C" of its
    // data row is a mean over dark ground as well, which the frost does not
    // see, and at that the ice would hold forty times the air). Its frost is
    // Sputnik Planitia, some 3e18 kg of N2 (McKinnon et al. 2016), 1.1 bar if it
    // all rose; its methane the bladed deposits, hundreds of metres of CH4
    // over a million square kilometres (Moore et al. 2018), about 0.05 bar.
    pluto:   { base: { ...EARTH, ...icy(0.35), n2Bar: 1.1e-5, internalHeat: 0.003, obliquity: 57,
                startT: 37, volatileIces: true, n2IceBar: 1.1, ch4IceBar: 0.05, iceAlbedo: 0.6 },
               target: 37, knob: 'iceAlbedo', clouds: 'full' },
    charon:  { base: { ...EARTH, ...icy(0.4), internalHeat: 0.002, startT: 50 }, clouds: 'full' },
  },
  ra: {
    // A hot, bone-dry desert under 0.011 bar. Tuned: the albedo.
    // Set: 120 C, bone-dry, "thin air (twice Mars's)", 0.011 atm. Past the
    // cosmic shoreline at seven times Earth's light, the star strips that air in
    // about three megayears (thermal loss ~8 Myr, the wind ~5 Myr, no field),
    // so the air the book describes is air being resupplied: the volcanoes are
    // balanced against the escape, at half Earth's rate (0.51) -- the book's
    // "geology fell silent" read as no longer remaking the surface. Tuned: the
    // albedo for the temperature, the outgassing to hold the air.
    // Its nitrogen is stripped and nothing makes more, so the air it keeps is
    // the volcanoes' CO2 with a trace, as on Mars; it starts that way.
    set: { base: { ...EARTH, ...airless, n2Bar: 0.0002, co2Bar: 0.0108, outgassing: 0.02,
            internalHeat: 0.03, obliquity: 12, landAlbedo: 0.3, startT: 393 },
           target: 393, knob: 'landAlbedo', balance: ['air'], clouds: 'full' },
    // "Soaked in an ocean of sulfuric acid, with just a few transient volcanic
    // islands." Nearly pure acid, which this model does not have, kept beside
    // it in acid.js: 80 % of the map, 3 km deep ("a deep ocean", but "too
    // shallow" for high-pressure ice). It boils at 338 C under an atmosphere
    // and near 450 C under this air, so at 231 C it is a sea, giving off a few
    // hundredths of a bar that warm the sky and cloud it. (Water, at 1.45 S(+),
    // runs away however the sky is set up.)
    //
    // With no water there is no weathering, so the air is the sum of what the
    // volcanoes have given: its CO2 over Ra's 5.3 Gyr is 0.04 bar per 20 Myr,
    // a fiftieth of Earth's outgassing. At a fifth of Earth's it warmed 4 K in
    // 20 Myr on CO2 it could not have kept for long. Tuned: the CO2.
    nephtys: { base: { ...EARTH, ...airless, landFraction: 0.18, n2Bar: 2, co2Bar: 10,
            obliquity: 15, landAlbedo: 0.2, internalHeat: 0.1, outgassing: 0.02, startT: 504 },
           target: 504, knob: 'co2Bar', clouds: 'delta', acid: { cover: 0.8, depth: 3000 },
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
    // A 9 M⊕ world, 28% water by mass, 8 C at a quarter of Earth's light under
    // 5.51 atm, "warmed by ... a high hydrogen and methane content of its
    // atmosphere, CO2 clouds and the internal heat", its air "nitrogen,
    // methane, CO2 and nitric acid", and from space "a true blue marble": no
    // haze, which here means methane under a tenth of the CO2. So 1.5 bar of
    // CO2 and 0.12 of methane, the hydrogen for the temperature, and nitrogen
    // to make up the book's pressure.
    //
    // The methane is held by life. Photolysis at this light takes 4e-4
    // kg/m2/yr of it, a seafloor sealed under high-pressure ice supplies next
    // to none, and in 20 Myr it was gone; the biosphere -- Nu's seeded microbes
    // and the Satis colonies -- is balanced to make what the light breaks. Its
    // oxygen meets the hydrogen and becomes water (h2SinksO2, PATCHES.md).
    //
    // No ice caps, although the book has them: under 5.5 bar and a six-day day
    // the model carries so much heat poleward that the poles sit 3 K below the
    // equator, and at a mean of 8 C nothing freezes.
    // Tuned: the hydrogen; balanced: outgassing (CO2) and the biosphere (CH4).
    uatur: { base: { ...EARTH, landFraction: 0, heliumFrac: 0.1, h2Bar: 2.7, n2Bar: 1.26,
            co2Bar: 1.5, ch4Bar: 0.12, o2Bar: 0, biosphere: 0.33, obliquity: 10,
            internalHeat: 0.3, outgassing: 0.5, h2SinksO2: true, startT: 281 }, waterShare: 0.281,
           target: 281, knob: 'h2Bar', pressure: 5.58, fill: 'n2Bar', balance: ['methane'], clouds: 'delta' },
    // A low-density world 4% gas by mass, -130 C at 1.2% of Earth's light.
    // Tuned: the hydrogen.
    shu: { base: { ...EARTH, ...icy(0.375), heliumFrac: 0.1, h2Bar: 2, internalHeat: 0.2,
            obliquity: 18, startT: 143 }, target: 143, knob: 'h2Bar', clouds: 'delta' },
    // Frozen super-Earth 560 AU out. Tuned: the interior heat.
    yamm: { base: { ...EARTH, ...icy(0.151), landFraction: 0.3, internalHeat: 0.05,
            obliquity: 10, startT: 31 }, target: 31, knob: 'internalHeat', clouds: 'full' },
    // Sednoid at 11,000 AU: 10 K. "Even its thin envelope of gases lies frozen
    // on the ice": how thin the book does not say, and 10 mbar of nitrogen is
    // taken, as frost (volatileIces). Tuned: the interior heat.
    kauket: { base: { ...EARTH, ...icy(0.625), internalHeat: 5e-4, obliquity: 5, startT: 10,
                volatileIces: true, n2IceBar: 0.01 },
              target: 10, knob: 'internalHeat', clouds: 'full' },
    // Wadjet's lava moon at 49 times Earth's sunlight: "a hellish blend of Io
    // and Venus, leaning hard toward Io ... 450 C even in its calmest spots --
    // all under a near-vacuum sky", its tides "reignited" by a strike that made
    // its orbit eccentric again. Starlight alone gives it 428 C on average; the
    // book's 450 takes tidal heat from Wadjet of 1.6 kW/m2 -- hundreds of
    // Ios, a crust over magma. "Calmest spots" read as the ground away from the
    // volcanoes, so the mean: holding even its poles at 450 would take 15
    // kW/m2 and a 600 C world the book does not describe. Tuned: the tidal heat.
    sekhmet: { base: { ...EARTH, ...airless, internalHeat: 5, landAlbedo: 0.1, obliquity: 2,
            startT: 723 }, target: 723, knob: 'internalHeat', clouds: 'full', heat: 'tidal' },
    // Satis's moon: half the Moon's mass (the book says so; data.js has no figure).
    satismoon: { base: { ...EARTH, ...airless, internalHeat: 0.01, landAlbedo: 0.12,
            obliquity: 3, startT: 270 }, massKg: 3.67e22, clouds: 'full' },
    // Uat-Ur's moons: -93 C and -100 C, airless. Tuned: the albedo.
    // Nu: -93 C on its ice, "a global ocean a few degrees above freezing,
    // crusted by ice often only metres thick", 4.6 % water (3.4 of Earth's
    // oceans), a near-vacuum sky, "among the most tidally heated bodies in the
    // system". Ice metres thick over a sea at the freezing point conducts
    // 651 ln(273/180)/d W/m² (Ojakangas & Stevenson 1989) -- about 30 for ten
    // metres, tidal heat far past Io's 2. Tuned: that heat, for the temperature.
    nu: { base: { ...EARTH, ...icy(0.046), internalHeat: 30, obliquity: 3, startT: 180 },
          target: 180, knob: 'internalHeat', clouds: 'full', heat: 'tidal' },
    // Naunet: -100 C, "a 2-14 km crust of water, ammonia and CO2 ice, with a
    // thin (3-4 mbar) atmosphere". 0.3 % water is about 6 km of ice over its
    // rock. The air is not the CO2: at -100 C its frost holds it to half a
    // millibar on the cold poles. It is nitrogen, which is what ammonia ice
    // leaves when sunlight breaks it (Titan's air came the same way) and which
    // nothing here freezes out -- three millibars of it over the frost-held
    // CO2 make the book's 3-4. Its ice is not Earth's clean sea ice: at a
    // quarter of Earth's light, -100 C takes an albedo near Ganymede's.
    // Tuned: the ice's albedo.
    // It orbits inside Uat-Ur's magnetosphere, so the star's wind, which alone
    // would strip that air in 14 Myr, does not reach it: in this model, a field.
    naunet: { base: { ...EARTH, ...icy(0.003), co2Bar: 0.0005, n2Bar: 0.003, internalHeat: 0.03,
            magneticField: 1,
            iceAlbedo: 0.45, obliquity: 3, startT: 173 }, target: 173, knob: 'iceAlbedo', clouds: 'full' },
    // Horus's worlds, lit by a brown dwarf at 0.05 S⊕ and kneaded by it.
    // Anubis: "heated by the relentless tidal squeezing of its parent brown
    // dwarf ... true liquid water oceans and an atmosphere rich in free oxygen
    // ... the absolute lack of" life, 81.2 C, 45.9 % water. No hydrogen
    // blanket, then: tides from Horus hold the heat, and the oxygen is the
    // abiotic kind -- a warm, moist sky loses its hydrogen to space and leaves
    // the oxygen behind. The pressure is not given: 0.7 bar of nitrogen and 0.3
    // of oxygen, 30 % of the air.
    //
    // Held, not merely started: water escape under Ra's light brings 2.2e-5
    // kg/m2/yr of oxygen, and a seafloor sealed under ice VII takes up only a
    // fifteenth of what an open one would (sealOxidation, PATCHES.md), so the
    // most this sky can keep with no volcanic reductants at all is 0.34 bar.
    // Unsealed it was 0.004 bar and the oxygen was gone in 12 Myr. What the
    // volcanoes erupt then decides the level, and a mantle that soaked up the
    // oxygen of the oceans Anubis lost to young Horus is an oxidised one: the
    // reduced share of its gas is balanced to hold the 0.3 bar.
    //
    // The tides are its orbit's: 0.00852 AU, e 0.0158, a month of a day and a
    // third round 46.6 Jupiter masses. The eccentricity tide
    // (21/2)(k2/Q) G M^2 R^5 n e^2 / a^6 makes that 2.25 kW/m2 at Io's k2/Q of
    // 0.016; the 285 tuned here is a k2/Q of 0.0020, an interior an eighth as
    // yielding as Io's.
    // Tuned: the tidal heat; balanced: outgassing (CO2) and reducedGas (O2).
    anubis: { base: { ...EARTH, landFraction: 0, h2Bar: 0, n2Bar: 0.7, co2Bar: 0.01, ch4Bar: 0,
            o2Bar: 0.3, biosphere: 0, obliquity: 2, internalHeat: 285, outgassing: 0.07,
            sealOxidation: true, reducedGas: 0.08, tidallyLocked: false, startT: 354 },
              waterShare: 0.459, target: 354, knob: 'internalHeat', balance: ['oxygen'], oxygenBy: 'reducedGas',
              clouds: 'delta', heat: 'tidal' },
    // Khonsu: "a cold, predominantly rocky world" at -99.5 C, 13.6 % water.
    // Horus's light alone would leave it near -166 C; what holds it at -99.5 is
    // tidal heat. From its orbit -- 0.0125 AU, e 0.0066, a 2.4-day month round
    // 46.6 Jupiter masses -- the eccentricity tide (21/2)(k2/Q) G M^2 R^5 n e^2
    // / a^6 gives 25 W/m2 at Io's k2/Q of 0.016 (which reproduces Io's 2.2);
    // the heat tuned here is 48, a k2/Q of 0.031: an interior twice as
    // yielding as Io's. That much heat keeps its water a sea under ice metres
    // thick, which the book's "rocky" describes the inside of. Its sky is thin:
    // the book gives it none, and with no sea surface to weather it any
    // volcanic CO2 piled up, thickening it half again in 20 Myr. Tuned: the
    // interior heat.
    khonsu: { base: { ...EARTH, landFraction: 0.7, n2Bar: 1e-4, co2Bar: 1e-4, o2Bar: 0,
            ch4Bar: 0, biosphere: 0, obliquity: 3, internalHeat: 30, outgassing: 0,
            landAlbedo: 0.3, startT: 174 }, waterShare: 0.136,
              target: 174, knob: 'internalHeat', clouds: 'full', heat: 'tidal' },
    // Nut: "a deeply frozen, water-rich world at -190 C", 54.1 % water by its
    // stats (the composition row says 0 -- left for the author). Its orbit
    // would give it 42 W/m2 of tidal heat at Io's k2/Q; at -190 C it radiates
    // under 3 W/m2 in all, so its cold ice mantle takes almost none of the
    // flexing (k2/Q under 1e-5 at the 0.02 W/m2 here), and the water is ice to
    // some forty kilometres down. Tuned: the ice's albedo.
    nut: { base: { ...EARTH, ...icy(0.541), internalHeat: 0.02, iceAlbedo: 0.5, obliquity: 3,
            startT: 83 }, target: 83, knob: 'iceAlbedo', clouds: 'full' },
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
    heat: prof.heat || null,
    acid: prof.acid || null,
  };
}
