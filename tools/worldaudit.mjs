// Every described Ra world against its book, at the start and after it has
// been left alone -- a measurement, not a check (tools/climatecheck.mjs holds
// the worlds to it).
//
//   node tools/worldaudit.mjs [world ...]        (default: every Ra climate world)
//   YEARS=2e7 node tools/worldaudit.mjs          (how long to leave them; default 20 Myr)
//
// Per world: mean temperature, surface pressure, the air's make-up, water (Earth
// oceans), open sea and ice cover, the model's state -- as it opens and after
// YEARS -- beside what the book says.
import { loadSystems, bookInsolation } from './lib/bodies.mjs';
import { ClimateSystem, RS, STATE_IDS } from '../assets/climate/system.js';
import { climateCapable, LUMINOUS } from '../assets/climate/profiles.js';
import { SPINUP } from '../assets/climate/spinup.js';
import { S_EARTH } from '../assets/climate/physics/constants.js';

// What the book says, in the book's own numbers (stats rows and the text).
export const BOOK = {
  set:       { T: 120, p: 0.011 * 1.01325, note: 'bone-dry; thin air, twice Mars\'s' },
  nephtys:   { T: 231, note: 'a sea of nearly pure sulfuric acid; alien life' },
  satis:     { T: 24, p: 0.62 * 1.01325, o2: 0.66, n2: 0.29, sea: 0.60, note: '41 % O2 at Earth-like pressure; shallow seas; complex life' },
  uatur:     { T: 8, p: 5.51 * 1.01325, note: 'H2- and CH4-rich air, CO2 clouds; ~100 km ocean on high-pressure ice' },
  shu:       { T: -130 },
  yamm:      { T: -242, note: 'frozen oceans' },
  kauket:    { T: -263, note: 'its thin envelope frozen on the ice' },
  sekhmet:   { T: 450, note: 'near-vacuum; 450 C in its calmest spots' },
  satismoon: { note: 'airless moon' },
  nu:        { T: -93, note: 'global ocean a few degrees above freezing under ice metres thick; near-vacuum; life' },
  naunet:    { T: -100, pRange: [0.003, 0.004], note: '3-4 mbar air over a 2-14 km crust of water, NH3 and CO2 ice; sterile' },
  // "rich in free oxygen": at least the fifth of the air Earth's is
  anubis:    { T: 81.2, o2Min: 0.2, sea: 1, note: 'liquid-water oceans and free oxygen; abiotic; hazy blue' },
  khonsu:    { T: -99.5, note: 'mostly rock; 13.6 % water' },
  nut:       { T: -190, note: 'deeply frozen, water-rich (54 %)' },
};

// Worlds not yet made to match: reported by climatecheck on every run, never a
// failure, so a deviation cannot hide -- and each moves to a held world when it
// is reworked (plan Part 6). Why each one is out, measured by this tool.
export const GAPS = {
  nephtys: 'no acid sea yet: a dry CO2 greenhouse at the right temperature, warming 4 K in 20 Myr',
  uatur: 'no methane in the air, which the book has hydrogen- and methane-rich; opens at 5.88 bar, book 5.58',
};

const systems = loadSystems();
const want = process.argv.slice(2);
const MAIN = import.meta.url === `file://${process.argv[1]}`;
const YEARS = +(process.env.YEARS || 2e7);
const ins = bookInsolation('ra', systems.ra, LUMINOUS);
const f1 = (x) => (x == null || !isFinite(x) ? '-' : x.toFixed(1));
const bar = (p) => (p >= 0.1 ? p.toFixed(2) : p >= 1e-3 ? (p * 1e3).toFixed(2) + 'm' : p >= 1e-6 ? (p * 1e6).toFixed(1) + 'µ' : p.toExponential(0));
function row(r) {
  const w = r.sim.world, dg = w.diag, g = dg.g, pa = (x) => x * g / 1e5;
  const gas = { n2: pa(w.n2), o2: pa(w.o2), co2: pa(w.co2), ch4: pa(w.ch4), h2: pa(w.h2 + w.he) };
  const tot = Object.values(gas).reduce((a, b) => a + b, 0) || 1;
  const air = Object.entries(gas).filter(([, v]) => v / tot > 0.005).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.toUpperCase()} ${(100 * v / tot).toFixed(0)}%`).join(' ');
  const W = w.water;
  return `${f1(dg.Tmean - 273.15).padStart(7)} °C ${bar(dg.pTotMean).padStart(7)} bar  ${air.padEnd(26)} water ${(W.ocean + W.seaIce + W.landIce + W.vapour).toFixed(3)} `
    + `sea ${((dg.openOcean ?? dg.flooded ?? 0) * 100).toFixed(0)}% ice ${((dg.iceArea ?? 0) * 100).toFixed(0)}%  ${STATE_IDS[r.rs[RS.STATE]] || '?'}`;
}
for (const d of MAIN ? systems.ra.bodies : []) {
  if (!d || !climateCapable(d)) continue;
  if (want.length && !want.includes(d.key)) continue;
  const sys = new ClimateSystem();
  sys.add(d.key, 'ra', { key: d.key, kind: d.kind, massKg: d.massKg, radiusKm: d.radiusKm, rotationPeriod: d.rotationPeriod,
    comp: d.comp, custom: false, life: d.life || null }, { snapshot: SPINUP.ra[d.key], flux: ins[d.key].S * S_EARTH, starTemp: ins[d.key].starTemp });
  const r = sys.worlds.get(d.key), b = BOOK[d.key] || {};
  const start = row(r);
  r.sim.runYears(YEARS, 2e5);
  sys.fillRender(r);
  const end = row(r);
  const bk = [b.T != null ? `${b.T} °C` : null, b.p != null ? `${bar(b.p)} bar` : null,
    b.pRange ? `${bar(b.pRange[0])}-${bar(b.pRange[1])} bar` : null,
    b.o2 != null ? `O2 ${b.o2 * 100}% N2 ${b.n2 * 100}%` : null, b.o2Min != null ? `O2 ≥ ${b.o2Min * 100}%` : null,
    b.sea != null ? `sea ${b.sea * 100}%` : null].filter(Boolean).join(' · ');
  console.log(`\n${d.key}   book: ${bk}${b.note ? '  — ' + b.note : ''}`);
  console.log(`   start ${start}`);
  console.log(`   ${(YEARS / 1e6).toFixed(0).padStart(3)} Myr ${end}`);
}
