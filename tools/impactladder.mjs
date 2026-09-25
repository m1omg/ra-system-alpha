// What a strike of E joules does to a world's climate, from a day to a million
// years after -- a measurement, not a check. Prints one row per energy.
//
//   node tools/impactladder.mjs [world ...]      (default: earth satis)
//
// Each row: the energy, then the mean surface temperature (°C) and the state
// at a day, a month, a year, ten years, a century, a millennium, ten
// millennia, a hundred millennia and a million years after the hit, then
// where the water is at the end.
import { loadSystems, bookInsolation } from './lib/bodies.mjs';
import { ClimateSystem, RS, STATE_IDS } from '../assets/climate/system.js';
import { climateCapable, LUMINOUS } from '../assets/climate/profiles.js';
import { SPINUP } from '../assets/climate/spinup.js';
import { S_EARTH } from '../assets/climate/physics/constants.js';

const systems = loadSystems();
const trim = (d) => ({ key: d.key, kind: d.kind, massKg: d.massKg, radiusKm: d.radiusKm,
  rotationPeriod: d.rotationPeriod, comp: d.comp, custom: !!d.custom });
function sysOf(key) {
  for (const s of ['sol', 'ra']) if (systems[s].bodies.some((d) => d.key === key)) return s;
  throw new Error('no such world: ' + key);
}
function one(key) {
  const sysName = sysOf(key), d = systems[sysName].bodies.find((b) => b.key === key);
  if (!climateCapable(d)) throw new Error(key + ' has no climate');
  const ins = bookInsolation(sysName, systems[sysName], LUMINOUS);
  const sys = new ClimateSystem();
  sys.add(key, sysName, trim(d), { snapshot: SPINUP[sysName][key], flux: ins[key].S * S_EARTH, starTemp: ins[key].starTemp });
  return { sys, forcing: { [key]: { flux: ins[key].S * S_EARTH, starTemp: ins[key].starTemp } } };
}
// advance `years` at a clock of `rate` sim years per wall second, 30 frames a second
function advance(sys, years, rate, forcing) {
  const dt = rate / 30;
  for (let t = 0; t < years - 1e-12; t += dt) {
    sys.tick(Math.min(dt, years - t), rate, forcing);
    while (sys.run(1e9)) { /* spend everything */ }
  }
}
const STATE_ABBR = (id) => (id || '?').replace(/[a-z]/g, '').slice(0, 4) || id.slice(0, 4);
const marks = [[1 / 365.25, 'day'], [1 / 12, 'mo'], [1, 'yr'], [10, '10y'], [100, '100y'], [1e3, '1k'], [1e4, '10k'], [1e5, '100k'], [1e6, '1M']];
const worlds = process.argv.slice(2).length ? process.argv.slice(2) : ['earth', 'satis'];
const energies = (process.env.LADDER || '0,1e23,1e24,1e25,1e26,1e27,2e27,1e28,1e29,1e30').split(',').map(Number);
const impact = (sys, key, J) => (sys.impact ? sys.impact(key, { J, kind: 'asteroid', lat: 0 }) : sys.impulse(key, J, 0));
for (const key of worlds) {
  console.log(`\n${key}   ` + marks.map(([, n]) => n.padStart(11)).join(''));
  for (const J of energies) {
    const { sys, forcing } = one(key);
    const r = sys.worlds.get(key);
    const T0 = r.rs[RS.TMEAN];
    if (J > 0) impact(sys, key, J);
    const row = [];
    let t = 0;
    for (const [at] of marks) {
      // a clock that keeps about a hundred frames per interval
      const span = at - t, rate = Math.max(span / 3, 1e-4);
      advance(sys, span, rate, forcing);
      t = at;
      const st = STATE_IDS[r.rs[RS.STATE]] || '?';
      row.push(`${(r.rs[RS.TMEAN] - 273.15).toFixed(0)}°${STATE_ABBR(st)}`.padStart(11));
    }
    const w = r.sim.world.water;
    const dg = r.sim.world.diag;
    console.log(`${J ? J.toExponential(0) : '   none'}  ${row.join('')}   sea ${w.ocean.toFixed(3)} vap ${w.vapour.toFixed(3)} lost ${(w.lost || 0).toFixed(3)} CO2 ${(dg.pCO2 * 1e6).toFixed(0)}ppm-bar T0 ${(T0 - 273.15).toFixed(1)}°`);
  }
}
