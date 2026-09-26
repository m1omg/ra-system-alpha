// The climate half of the sandbox, checked without a browser.
//
//   node tools/climatecheck.mjs
//
// Loads every climate body of both systems through the same message protocol
// the page uses (hostcore.js), then checks what a player would notice first if
// it were wrong: that worlds open where the book puts them and stay there, that
// the starlight the orrery hands over actually moves them, that an impact heats
// a planet and it cools again, that edits reach the reservoirs, that a save
// restores the same world, that the frame rate does not change the climate, and
// that the surface analysis finds the sea on a map that has one.
import { loadSystems, bookInsolation } from './lib/bodies.mjs';
import { createHost } from '../assets/climate/hostcore.js';
import * as SYSTEM from '../assets/climate/system.js';
import { paramsFor, climateCapable, profileOf, LUMINOUS, STILL } from '../assets/climate/profiles.js';
import { SPINUP } from '../assets/climate/spinup.js';
import { analyseSurface, heightForShare } from '../assets/climate/analysis.js';
import { BOOK, GAPS } from './worldaudit.mjs';
import { S_EARTH } from '../assets/climate/physics/constants.js';
import { sealFactor } from '../assets/climate/physics/volatiles.js';
import { readFileSync } from 'node:fs';

const { ClimateSystem, RS } = SYSTEM, LIFE_CAUSES = SYSTEM.LIFE_CAUSES || [];
let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${msg}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${msg}${extra ? '  ' + extra : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

const systems = loadSystems();
const trim = (d) => ({ key: d.key, kind: d.kind, massKg: d.massKg, radiusKm: d.radiusKm,
  rotationPeriod: d.rotationPeriod, comp: d.comp, custom: !!d.custom, life: d.life || null });

// Sunrise to sunrise, in hours, as the page works it out (climate-view.js
// solarDayHours): the spin against the orbit round the star, a moon's planet's.
function solarDayH(sysName, d) {
  const by = Object.fromEntries(systems[sysName].bodies.map((b) => [b.key, b]));
  const rot = Math.abs(d.rotationPeriod || 0) * 24;
  if (!(rot > 0)) return null;
  let top = d;
  for (let i = 0; i < 4; i++) { const p = by[top.parent]; if (!p || !by[p.parent]) break; top = p; }
  const orb = (top.period || 0) * 365.25 * 24;
  if (!(orb > 0)) return rot;
  const f = Math.abs(1 / rot - 1 / orb);
  return f > 1e-12 ? 1 / f : Infinity;
}

function build(sysName) {
  const sys = new ClimateSystem();
  const ins = bookInsolation(sysName, systems[sysName], LUMINOUS);
  const keys = [];
  for (const d of systems[sysName].bodies) {
    if (!climateCapable(d)) continue;
    sys.add(d.key, sysName, { ...trim(d), solarDayH: solarDayH(sysName, d) }, { snapshot: SPINUP[sysName][d.key],
      flux: ins[d.key].S * S_EARTH, starTemp: ins[d.key].starTemp });
    keys.push(d.key);
  }
  return { sys, ins, keys };
}
const forcingOf = (ins, keys) => Object.fromEntries(keys.map((k) => [k, { flux: ins[k].S * S_EARTH, starTemp: ins[k].starTemp }]));
function advance(sys, years, rate, fps, forcing) {
  const dt = rate / fps;
  for (let t = 0; t < years - 1e-12; t += dt) {
    sys.tick(Math.min(dt, years - t), rate, forcing);
    while (sys.run(1e9)) { /* spend everything */ }
  }
}

section('The numbers a panel quotes are the ones the physics runs on');
{
  // The stats rows quote "Satis v10"; mass, orbit and composition are what the
  // physics uses. Where they part, one of them is wrong: "145 % Earth" once
  // read as 145 times, a Set of 0.24 Earth masses under a row saying 0.37.
  const ME = 5.9722e24, UNIT = { '⊕': ME, 'Luna': 7.342e22, 'Jupiter': 1.898e27, '☉': 1.989e30 };
  const L = LUMINOUS.ra.L;
  const num = (t) => parseFloat(t.replace(/,/g, ''));
  const bad = { mass: [], insolation: [], composition: [] };
  let n = 0;
  for (const d of systems.ra.bodies) {
    const row = (name) => (d.stats || []).find((r) => r[0] === name)?.[1];
    const m = row('Mass');
    if (m && d.massKg > 0) {
      const u = Object.keys(UNIT).find((k) => m.includes(k));
      const said = num(m.replace(/^[~≈]/, '')) * UNIT[u];
      n++; if (!(Math.abs(said / d.massKg - 1) < 0.02)) bad.mass.push(`${d.key} says ${m}, runs on ${(d.massKg / ME).toPrecision(3)} M⊕`);
    }
    const s = row('Insolation');
    if (s && d.parent === 'ra' && d.dist > 0) {
      const said = s.includes('%') ? num(s) / 100 : num(s), is = L / (d.dist * d.dist);
      n++; if (!(Math.abs(said / is - 1) < 0.05)) bad.insolation.push(`${d.key} says ${s}, its orbit gives ${is.toPrecision(3)} × Earth`);
    }
    const c = row('Composition');
    if (c && d.comp) for (const [, v, what] of c.matchAll(/([\d.]+)% (water|rock|iron|H\/He)/g)) {
      const k = what === 'H/He' ? 'gas' : what;
      n++; if (!(Math.abs(parseFloat(v) - 100 * (d.comp[k] ?? 0)) < 0.5)) bad.composition.push(`${d.key} says ${v}% ${what}, runs on ${(100 * (d.comp[k] ?? 0)).toFixed(1)} %`);
    }
  }
  for (const [what, list] of Object.entries(bad))
    ok(list.length === 0, `every ${what} row agrees with the physics`, list.join('; ') || `${n} figures in all`);
}

section('Every described body loads, from its spin-up, where the book puts it');
for (const sysName of ['sol', 'ra']) {
  const { sys, keys } = build(sysName);
  const cap = systems[sysName].bodies.filter(climateCapable).length;
  ok(keys.length === cap && keys.length >= 13, `${sysName}: ${keys.length} climate worlds`);
  for (const k of keys) {
    const r = sys.worlds.get(k);
    const T = r.rs[RS.TMEAN], T0 = SPINUP[sysName][k] ? null : null;
    const prof = profileOf(sysName, { key: k, kind: r.data.kind });
    if (prof.target != null) {
      ok(Math.abs(T - prof.target) < 3, `${sysName}/${k} opens at its documented temperature`,
         `${T.toFixed(1)} K vs ${prof.target} K`);
    }
    // The spin-up was taken with exactly these params; a stale table would
    // restore a world that is not the one the profile describes.
    const snap = SPINUP[sysName][k];
    const now = paramsFor(sysName, r.data);
    const drift = Object.keys(now).filter((p) => typeof now[p] === 'number' && p !== 'insolation'
      && p !== 'starTemp' && Math.abs((snap.params[p] ?? NaN) - now[p]) > 1e-9 * Math.max(1, Math.abs(now[p])));
    ok(drift.length === 0, `${sysName}/${k} spin-up matches its profile`, drift.length ? `stale: ${drift.join(',')}` : '');
  }
}

section('Held on the book orbit, worlds stay put');
for (const sysName of ['sol', 'ra']) {
  const { sys, ins, keys } = build(sysName);
  const T0 = Object.fromEntries(keys.map((k) => [k, sys.worlds.get(k).rs[RS.TMEAN]]));
  advance(sys, 2000, 50, 30, forcingOf(ins, keys));
  let worst = 0, worstKey = '';
  for (const k of keys) {
    const d = Math.abs(sys.worlds.get(k).rs[RS.TMEAN] - T0[k]);
    if (d > worst) { worst = d; worstKey = k; }
  }
  ok(worst < 1.5, `${sysName}: largest drift over 2 kyr`, `${worst.toFixed(2)} K (${worstKey})`);
}

section('The frame rate does not change the climate');
{
  const run = (fps) => {
    const { sys, ins, keys } = build('sol');
    const f = forcingOf(ins, keys);
    f.earth = { flux: 1.25 * S_EARTH, starTemp: 5772 };     // something to respond to
    advance(sys, 50, 2, fps, f);
    return sys.worlds.get('earth').rs[RS.TMEAN];
  };
  const a = run(60), b = run(20), c = run(7);
  ok(Math.abs(a - b) < 0.15 && Math.abs(a - c) < 0.15, 'Earth at 1.25 S⊕ after 50 yr: 60 / 20 / 7 fps',
     `${a.toFixed(3)} / ${b.toFixed(3)} / ${c.toFixed(3)} K`);
}

section('Starlight moves the planet');
{
  const { sys, ins, keys } = build('sol');
  const f = forcingOf(ins, keys);
  const T0 = sys.worlds.get('earth').rs[RS.TMEAN];
  f.earth = { flux: 0.8 * S_EARTH, starTemp: 5772 };
  advance(sys, 3e4, 1000, 30, f);
  const cold = sys.worlds.get('earth').rs[RS.TMEAN];
  ok(cold < T0 - 20, 'Earth at 0.8 S⊕ freezes', `${T0.toFixed(1)} -> ${cold.toFixed(1)} K`);
  const { sys: s2, ins: i2, keys: k2 } = build('sol');
  const f2 = forcingOf(i2, k2);
  f2.earth = { flux: 1.6 * S_EARTH, starTemp: 5772 };
  advance(s2, 3e4, 1000, 30, f2);
  const hot = s2.worlds.get('earth').rs[RS.TMEAN];
  ok(hot > 400, 'Earth at 1.6 S⊕ runs away', `${hot.toFixed(1)} K`);
}

section('An impact heats a world, and it cools again');
{
  const { sys, ins, keys } = build('sol');
  const f = forcingOf(ins, keys);
  const T0 = sys.worlds.get('earth').rs[RS.TMEAN];
  sys.impulse('earth', 1e26, 0);
  let peak = T0;
  for (let i = 0; i < 40; i++) { advance(sys, 0.05, 0.5, 10, f); peak = Math.max(peak, sys.worlds.get('earth').rs[RS.TMEAN]); }
  ok(peak > T0 + 5, '1e26 J on Earth: global warming pulse', `+${(peak - T0).toFixed(1)} K peak`);
  advance(sys, 300, 20, 30, f);
  const after = sys.worlds.get('earth').rs[RS.TMEAN];
  ok(Math.abs(after - T0) < 2, '...and three centuries later it has cooled back', `${(after - T0).toFixed(2)} K`);
  const w0 = sys.worlds.get('earth').sim.world.water.ocean;
  sys.impulse('earth', 0, 1.4e21 * 0.1);
  ok(Math.abs(sys.worlds.get('earth').sim.world.water.ocean - w0 - 0.1) < 1e-9, 'delivered water reaches the ocean');
}

section('Energy goes into the climate at once, and where it lands');
{
  // a fresh Earth per case, so one strike does not colour the next
  const earth = () => { const b = build('sol'); return { sys: b.sys, f: forcingOf(b.ins, b.keys), r: b.sys.worlds.get('earth') }; };
  const band = (r, x) => Math.max(0, Math.min(17, Math.floor((x + 1) / (2 / 18))));
  {
    const { sys, r } = earth(), T0 = r.rs[RS.TMEAN];
    sys.impact('earth', { J: 1e25, kind: 'asteroid', x: 0.3 });
    ok(r.rs[RS.TMEAN] > T0 + 20, 'a 1e25 J strike is in the temperatures before the call returns', `+${(r.rs[RS.TMEAN] - T0).toFixed(1)} K`);
    ok(Math.abs(r.lastInjected / 1e25 - 1) < 1e-6, 'every joule of it is accounted for', `${(r.lastInjected / 1e25).toFixed(9)}`);
    ok(!(r.sim.world.params.internalHeat > r.baseHeat + 1e-9) && !(r.pulse > 0), 'and none of it poses as volcanism (no interior-heat pulse)');
  }
  {
    const { sys, r } = earth(), w = r.sim.world, north = band(r, 0.95), south = band(r, -0.95);
    const Tn = w.T[north], Ts = w.T[south];
    sys.impact('earth', { J: 3e23, kind: 'laser', x: 0.95 });
    ok(w.T[north] - Tn > 10 * Math.max(w.T[south] - Ts, 1e-3), 'a laser heats the band under the beam, not the planet', `north +${(w.T[north] - Tn).toFixed(2)} K, south +${(w.T[south] - Ts).toFixed(3)} K`);
  }
  {
    const { sys, f, r } = earth(), T0 = r.rs[RS.TMEAN], co2 = r.sim.world.co2;
    sys.impact('earth', { J: 4e23, kind: 'asteroid', x: 0.35, mKg: 1.4e15, vKms: 20 });
    const dCO2kg = (r.sim.world.co2 - co2) * 5.1e14;
    ok(dCO2kg > 1e14 && dCO2kg < 1e15, 'a Chicxulub frees CO2 from the carbonate it hits', `${dCO2kg.toExponential(1)} kg`);
    advance(sys, 5, 1, 30, f);
    const winter = r.rs[RS.TMEAN];
    advance(sys, 300, 20, 30, f);
    ok(winter < T0 - 5 && Math.abs(r.rs[RS.TMEAN] - T0) < 2, '...and brings an impact winter that lifts within centuries',
      `${(winter - T0).toFixed(1)} K at 5 yr, ${(r.rs[RS.TMEAN] - T0).toFixed(2)} K at 300 yr`);
  }
  {
    // a century of hot, wet runaway must not weather the air away into a snowball
    const { sys, f, r } = earth(), T0 = r.rs[RS.TMEAN];
    sys.impact('earth', { J: 5e26, kind: 'asteroid', x: 0 });
    advance(sys, 100, 5, 30, f); const hot = r.rs[RS.TMEAN];
    advance(sys, 1e4, 500, 30, f);
    ok(hot > 373 && r.rs[RS.TMEAN] > T0 - 5, 'a century of steam after 5e26 J, and no snowball after it',
      `${(hot - 273.15).toFixed(0)} °C at 100 yr, ${(r.rs[RS.TMEAN] - 273.15).toFixed(1)} °C at 10 kyr`);
  }
  {
    const { sys, f, r } = earth();
    sys.impact('earth', { J: 1e29, kind: 'collision' });
    advance(sys, 1, 0.5, 30, f);
    const molten = r.rs[RS.MAGMA], Tmax = r.rs[RS.TMAX];
    advance(sys, 3e4, 2000, 30, f);
    ok(molten > 0.99 && Math.abs(Tmax - 1400) < 1, 'a 1e29 J collision leaves a magma ocean held at the solidus', `${(molten * 100).toFixed(0)} % molten, ${Tmax.toFixed(0)} K`);
    ok(r.rs[RS.MAGMA] === 0 && !r.magma, '...which gives its heat up through the steam and crusts over', `${(r.rs[RS.TMEAN] - 273.15).toFixed(0)} °C at 30 kyr`);
  }
  {
    const { sys, r } = earth(), n2 = r.sim.world.n2;
    sys.impact('earth', { J: 7e31, kind: 'collision', mKg: 6.4e23, vKms: 15 });
    const lost = 1 - r.sim.world.n2 / n2;
    ok(lost > 0.03 && lost < 0.2, 'a Mars-sized body at 15 km/s blows away part of the air', `${(lost * 100).toFixed(1)} %`);
  }
}

section('Life follows the climate');
{
  const earth = () => { const b = build('sol'); return { sys: b.sys, f: forcingOf(b.ins, b.keys), r: b.sys.worlds.get('earth') }; };
  const lvl = (r) => r.rs[RS.LIFE];
  const why = (r) => LIFE_CAUSES[r.rs[RS.LIFECAUSE]] || null;
  const DAY = 1 / 365.25;
  {
    const s = build('sol'), q = build('ra');
    const L = (b, k) => b.sys.worlds.get(k).rs[RS.LIFE];
    // Uat-Ur: Nu's microbes, and the Satis colonists' "bioluminescent cloud-forests"
    ok(L(s, 'earth') === 3 && L(q, 'satis') === 3 && L(q, 'uatur') === 2 && L(q, 'nu') === 1 && L(q, 'nephtys') === 1,
      'documented life opens as documented: Earth and Satis intelligent; Uat-Ur complex; Nu and Nephtys microbial',
      ['earth', 'satis', 'uatur', 'nu', 'nephtys'].map((k) => `${k} ${L(k === 'earth' ? s : q, k)}`).join(', '));
    const none = [...s.keys.filter((k) => k !== 'earth').map((k) => [s, k]), ...q.keys.filter((k) => !['satis', 'uatur', 'nu', 'nephtys'].includes(k)).map((k) => [q, k])];
    const wrong = none.filter(([b, k]) => L(b, k) !== 0 || b.sys.worlds.get(k).sim.world.life.pro > 0).map(([, k]) => k);
    ok(wrong.length === 0, 'and every world without documented life opens without any', wrong.join(' ') || `${none.length} worlds`);
  }
  {
    const { sys, f, r } = earth();
    sys.impact('earth', { J: 1e24, kind: 'asteroid', x: 0.3, mKg: 3e16, vKms: 20 });
    advance(sys, 30, 2, 30, f);
    ok(lvl(r) === 3, '1e24 J: a winter, and the complex biosphere comes through it', `level ${lvl(r)}`);
  }
  {
    // an ocean boiled into the sky that rains back out within millennia
    const { sys, f, r } = earth(), w = r.sim.world;
    sys.impact('earth', { J: 5e26, kind: 'asteroid', x: 0 });
    advance(sys, 30 * DAY, 30 * DAY, 30, f);
    ok(lvl(r) === 1 && w.life.euk === 0, '5e26 J: complex life is dead within a month of the boil', `level ${lvl(r)}, euk ${w.life.euk}`);
    advance(sys, 1e4, 500, 30, f);
    ok(lvl(r) === 1 && (why(r) === 'heat' || why(r) === 'boiled'), '...microbes come through it in the deep crust, and the cause is the heat', `level ${lvl(r)}, ${why(r)}`);
    advance(sys, 3e6, 1e5, 30, f);
    ok(w.life.pro > 0.1 && w.life.euk === 0, '...recolonise the surface within megayears, and complex life has not re-evolved',
      `pro ${w.life.pro.toFixed(3)}, euk ${w.life.euk}`);
    ok((r.sim.world.diag.bio ?? w.bio) > 0.05, '...and photosynthesis comes back with them', `bio ${(w.bio ?? 0).toFixed(3)}`);
  }
  {
    // a supercritical envelope that never clears: the heat reaches the refuge
    const { sys, f, r } = earth(), w = r.sim.world;
    sys.impact('earth', { J: 1e28, kind: 'collision' });
    ok(lvl(r) === 1 && w.life.pro === 0 && why(r) === 'boiled', '1e28 J: complex life and surface microbes die the moment it lands, not at the next step',
      `level ${lvl(r)}, ${why(r)}, coolest band ${(Math.min(...w.T) - 273.15).toFixed(0)} °C`);
    advance(sys, 30 * DAY, 30 * DAY, 30, f);
    ok(lvl(r) === 1 && w.life.pro === 0 && w.life.deep > 0.5, '1e28 J: the surface is sterile within a month, the deep crust not yet',
      `level ${lvl(r)}, pro ${w.life.pro}, deep ${w.life.deep?.toFixed(3)}`);
    advance(sys, 1e5, 2000, 30, f);
    ok(lvl(r) === 0 && why(r) === 'cooked', '...and a hundred millennia of it cooks the crust sterile', `level ${lvl(r)}, ${why(r)}, deep ${w.life.deep}`);
    ok((w.bio ?? 0) < 1e-3, '...with nothing left photosynthesising', `bio ${w.bio}`);
    advance(sys, 3e6, 1e5, 30, f);
    ok(lvl(r) === 0 && w.life.pro === 0, 'a sterilised world stays sterile');
  }
  {
    const { sys, f, r } = earth();
    sys.impact('earth', { J: 1e29, kind: 'collision' });
    advance(sys, 30 * DAY, 30 * DAY, 30, f);
    ok(lvl(r) === 0 && why(r) === 'magma', '1e29 J: a magma ocean melts through the refuge; sterile within a month', `level ${lvl(r)}, ${why(r)}`);
  }
  {
    // complex life lost on a world that stays habitable: it waits the model's
    // own eight hundred million years to be reinvented, and intelligence waits
    // half a billion more
    const { sys, f, r } = earth(), w = r.sim.world;
    w.life.euk = 0;
    advance(sys, 1e6, 3e4, 30, f);
    ok(w.life.euk === 0 && lvl(r) === 1, 'complex life that is gone stays gone for a megayear, not a day (altdev2: 32 % back)', `euk ${w.life.euk}`);
    advance(sys, 7.8e8, 2e7, 30, f);
    const early = w.life.euk;
    advance(sys, 5e7, 2e6, 30, f);
    ok(early === 0 && w.life.euk > 0.1 && lvl(r) === 2, '...and re-evolves after 8e8 yr: complex, not yet intelligent',
      `euk ${early} at 7.8e8, ${w.life.euk.toFixed(3)} at 8.3e8, level ${lvl(r)}`);
    advance(sys, 5e8, 2e7, 30, f);
    ok(lvl(r) === 3, '...and intelligent again 5e8 yr after that', `level ${lvl(r)}`);
  }
  {
    // Nephtys's life lives in its acid sea: the gate is 330 °C
    const q = build('ra'), f = forcingOf(q.ins, q.keys), r = q.sys.worlds.get('nephtys');
    advance(q.sys, 100, 5, 30, f);
    ok(lvl(r) === 1, 'Nephtys\'s acid-sea life lives at its documented 231 °C', `${(r.rs[RS.TMEAN] - 273.15).toFixed(0)} °C, level ${lvl(r)}`);
    // The sea holds the heat of a strike (acid.js): 3e25 J takes its coldest
    // band 17 K past the gate for half a year, which the life comes through;
    // 6e25 J takes it past 400 °C, short of boiling the sea (450 °C under this
    // air) and far short of melting rock (then the cause would be magma)
    q.sys.impact('nephtys', { J: 3e25, kind: 'collision' });
    const brush = r.rs[RS.TMIN];
    advance(q.sys, 1, 0.1, 30, f);
    const lived = lvl(r);
    q.sys.impact('nephtys', { J: 6e25, kind: 'collision' });
    const peak = r.rs[RS.TMIN];
    advance(q.sys, 1, 0.1, 30, f);
    ok(lived === 1 && brush > 603 && lvl(r) === 0 && why(r) === 'heat', '...comes through a strike that brushes past 330 °C, and dies of one that holds it well past',
      `level ${lived} at ${(brush - 273.15).toFixed(0)} °C, then ${lvl(r)} at ${(peak - 273.15).toFixed(0)} °C, ${why(r)}`);
  }
  {
    // the ledger is part of the save
    const { sys, f, r } = earth();
    sys.impact('earth', { J: 5e26, kind: 'asteroid', x: 0 });
    advance(sys, 100, 5, 30, f);
    const snap = JSON.parse(JSON.stringify(sys.snapshot().earth));
    const b = build('sol'); b.sys.restore('earth', snap);
    const r2 = b.sys.worlds.get('earth');
    ok(lvl(r2) === lvl(r) && r2.rs[RS.LIFECAUSE] === r.rs[RS.LIFECAUSE] && r2.rs[RS.LIFESINCE] === r.rs[RS.LIFESINCE],
      'a save carries the life ledger: level, cause and when', `${lvl(r2)} ${why(r2)} at ${r2.rs[RS.LIFESINCE]?.toFixed(1)} yr`);
  }
}

section('What a strike did to the surface, as the orrery reads it');
{
  const earth = () => { const b = build('sol'); return { sys: b.sys, f: forcingOf(b.ins, b.keys), r: b.sys.worlds.get('earth') }; };
  const DAY = 1 / 365.25;
  {
    const { r } = earth();
    ok(r.rs[RS.BOILED] < 0.01, 'a settled Earth has boiled none of its water', `${r.rs[RS.BOILED]}`);
  }
  {
    const { sys, r } = earth();
    sys.impact('earth', { J: 1e24, kind: 'asteroid', x: 0.3 });
    ok(r.rs[RS.BOILED] < 0.02, '1e24 J boils next to nothing', `${(r.rs[RS.BOILED] * 100).toFixed(2)} %`);
  }
  {
    const { sys, f, r } = earth();
    sys.impact('earth', { J: 1e28, kind: 'collision' });
    ok(r.rs[RS.BOILED] > 0.9 && r.rs[RS.MAGMA] < 0.5, '1e28 J: the oceans boiled into the sky, the rock mostly not molten',
      `boiled ${(r.rs[RS.BOILED] * 100).toFixed(0)} %, molten ${(r.rs[RS.MAGMA] * 100).toFixed(0)} %`);
  }
  {
    const { sys, f, r } = earth();
    sys.impact('earth', { J: 1e29, kind: 'collision' });
    const m0 = r.rs[RS.MAGMA];
    advance(sys, 3e4, 2000, 30, f);
    ok(m0 > 0.99 && r.rs[RS.MAGMA] === 0, '1e29 J: molten everywhere, crusted over 30 kyr on', `${(m0 * 100).toFixed(0)} % → ${(r.rs[RS.MAGMA] * 100).toFixed(0)} %`);
  }
}

section('Documented worlds open as the book has them, and stay there for 20 Myr');
{
  // through the system, as the page steps them: what lives beside the physics
  // (the acid sea, the life ledger) moves with it
  const q = build('ra');
  const look = (k) => {
    const w = q.sys.worlds.get(k).sim.world;
    const dg = w.diag, g = dg.g, pa = (x) => x * g / 1e5;
    const gas = { n2: pa(w.n2), o2: pa(w.o2), co2: pa(w.co2), ch4: pa(w.ch4), h2: pa(w.h2 + w.he) };
    const tot = Object.values(gas).reduce((a, x) => a + x, 0) || 1;
    const det = q.sys.detail(k) || {}, acid = det.acid;
    // the ice lid over the sea, as the cross-section draws it
    const ice = (det.layers || []).filter((l) => l.kind === 'iceIh' || l.kind === 'seaice').reduce((m, l) => m + l.metres, 0);
    return { T: dg.Tmean - 273.15, p: dg.pTotMean, o2: gas.o2 / tot, n2: gas.n2 / tot,
      share: Object.fromEntries(Object.entries(gas).map(([g2, x]) => [g2, x / tot])),
      haze: dg.hazeTau ?? 0, cover: (dg.flooded ?? 0), acid: acid ? acid.cover * (1 - acid.frozen) : 0,
      heat: w.params.internalHeat, noon: det.extremes ? det.extremes.dayK - 273.15 : null, ice,
      mass: w.params.mass, g: dg.g / 9.80665, outgassing: w.params.outgassing ?? 0 };
  };
  const ks = q.keys.filter((k) => BOOK[k]);
  const start = Object.fromEntries(ks.map((k) => [k, look(k)]));
  advance(q.sys, 2e7, 2e6, 10, forcingOf(q.ins, q.keys));
  for (const k of ks) {
    const b = BOOK[k], a = start[k], z = look(k);
    const bad = [];
    if (b.T != null && Math.abs(a.T - b.T) > 2) bad.push(`opens at ${a.T.toFixed(1)} °C, book ${b.T}`);
    if (b.T != null && Math.abs(z.T - a.T) > 2) bad.push(`drifts ${(z.T - a.T).toFixed(1)} K in 20 Myr`);
    if (b.p != null && Math.abs(a.p / b.p - 1) > 0.05) bad.push(`opens at ${a.p.toPrecision(3)} bar, book ${b.p.toPrecision(3)}`);
    if (b.p != null && Math.abs(z.p / a.p - 1) > 0.05) bad.push(`pressure drifts ${((z.p / a.p - 1) * 100).toFixed(0)} % in 20 Myr`);
    // where the book gives a range, the world opens and stays inside it
    if (b.pRange) for (const [when, x] of [['opens', a.p], ['after 20 Myr', z.p]])
      if (!(x >= b.pRange[0] && x <= b.pRange[1])) bad.push(`${when} at ${(x * 1e3).toPrecision(3)} mbar, book ${b.pRange[0] * 1e3}-${b.pRange[1] * 1e3}`);
    for (const g of ['o2', 'n2']) if (b[g] != null) {
      if (Math.abs(a[g] - b[g]) > 0.05) bad.push(`${g.toUpperCase()} ${(a[g] * 100).toFixed(0)} %, book ${b[g] * 100} %`);
      if (Math.abs(z[g] - a[g]) > 0.05) bad.push(`${g.toUpperCase()} drifts to ${(z[g] * 100).toFixed(0)} %`);
    }
    // where the book gives only a floor, the world opens above it and stays there
    for (const [g, min] of Object.entries(b.mins || {}))
      for (const [when, x] of [['opens', a.share[g]], ['after 20 Myr', z.share[g]]])
        if (!(x >= min)) bad.push(`${when} with ${g.toUpperCase()} ${(x * 100).toPrecision(2)} % of the air, book at least ${min * 100} %`);
    if (b.hazeMax != null) for (const [when, x] of [['opens', a.haze], ['after 20 Myr', z.haze]])
      if (!(x <= b.hazeMax)) bad.push(`${when} under haze of optical depth ${x.toFixed(2)}, book a clear sky`);
    if (b.acid != null) for (const [when, x] of [['opens', a.acid], ['after 20 Myr', z.acid]])
      if (Math.abs(x - b.acid) > 0.05) bad.push(`${when} with liquid acid over ${(x * 100).toFixed(0)} %, book ${b.acid * 100} %`);
    if (b.sea != null && Math.abs(a.cover - b.sea) > 0.05) bad.push(`water covers ${(a.cover * 100).toFixed(0)} %, book ${b.sea * 100} %`);
    if (b.sea != null && Math.abs(z.cover - a.cover) > 0.05) bad.push(`cover drifts to ${(z.cover * 100).toFixed(0)} %`);
    if (b.mass != null && !(Math.abs(a.mass / b.mass - 1) < 0.02)) bad.push(`weighs ${a.mass.toPrecision(3)} M⊕, book ${b.mass}`);
    if (b.g != null && !(Math.abs(a.g / b.g - 1) < 0.03)) bad.push(`surface gravity ${a.g.toFixed(2)} g, book ${b.g}`);
    if (b.outgassingMax != null && !(a.outgassing <= b.outgassingMax))
      bad.push(`volcanoes at ${a.outgassing.toPrecision(2)} of Earth's, book at most ${b.outgassingMax}`);
    // the heat the tides give, where the book says how it compares with Io's
    if (b.tides && !(a.heat >= b.tides[0] && a.heat <= b.tides[1]))
      bad.push(`tidal heat ${a.heat.toPrecision(3)} W/m², book ${b.tides[0]}${isFinite(b.tides[1]) ? '-' + b.tides[1] : ' or more'}`);
    if (b.noonMin != null && !(a.noon >= b.noonMin)) bad.push(`its ground reaches ${a.noon == null ? 'no' : a.noon.toFixed(0) + ' °C'} at noon, book ${b.noonMin} °C`);
    if (b.iceM) for (const [when, x] of [['opens', a.ice], ['after 20 Myr', z.ice]])
      if (!(x >= b.iceM[0] && x <= b.iceM[1])) bad.push(`${when} under ${x.toPrecision(3)} m of ice, book ${b.iceM[0]}-${b.iceM[1]} m`);
    const what = `${k}: ${a.T.toFixed(1)} → ${z.T.toFixed(1)} °C, ${a.p.toPrecision(3)} → ${z.p.toPrecision(3)} bar`;
    if (GAPS[k]) { console.log(`  GAP  ${k}: ${GAPS[k]}${bad.length ? '  (' + bad.join('; ') + ')' : ''}`); continue; }
    ok(bad.length === 0, what, bad.join('; '));
  }
}

section('The state a world is shown in fits it');
{
  // three model texts that misfire on worlds they were not written for (system.js
  // EXTRA_STATES): "tropics near the limit of complex life" at a mean past 50 C,
  // seawater through "fresh basalt at the ridges" over a floor of ice VII, and
  // a snowball the volcanoes' CO2 "finally breaks" past the maximum greenhouse
  const bad = [], shown = {};
  for (const sysName of ['sol', 'ra']) {
    const { sys, keys } = build(sysName);
    for (const k of keys) {
      const r = sys.worlds.get(k), w = r.sim.world, id = SYSTEM.STATE_IDS[r.rs[RS.STATE]];
      shown[k] = id;
      if (id === 'hothouse' && w.diag.Tmean > 323.15) bad.push(`${k}: hothouse at ${(w.diag.Tmean - 273.15).toFixed(0)} °C`);
      if (id === 'waterworld' && sealFactor(w) < 0.5) bad.push(`${k}: waterworld on a floor sealed to ${sealFactor(w).toFixed(2)}`);
      if (id === 'snowball' && w.params.insolation < 0.35) bad.push(`${k}: snowball at ${w.params.insolation.toPrecision(2)} S⊕`);
    }
  }
  ok(bad.length === 0, 'no world is told what its own physics rules out',
    bad.length ? bad.join('; ') : `anubis ${shown.anubis}, uatur ${shown.uatur}, nut ${shown.nut}, pluto ${shown.pluto}`);
  // ...and every state the page can show has its Slovak name and text
  const win = {};
  new Function('window', readFileSync(new URL('../assets/climate-sk.js', import.meta.url), 'utf8'))(win);
  const view = readFileSync(new URL('../assets/climate-view.js', import.meta.url), 'utf8');
  const skNames = (view.match(/const SK_STATES=\{([\s\S]*?)\};/) || [, ''])[1];
  const missing = SYSTEM.STATE_IDS.filter((id) => !(id in (win.RA_CLIMATE_SK_BLURBS || {})) || !new RegExp(`\\b${id}:`).test(skNames));
  ok(missing.length === 0, 'every state has its Slovak name and text', missing.length ? `missing: ${missing.join(', ')}` : `${SYSTEM.STATE_IDS.length} states`);
}

section('Every control of the sandbox is in the panel, or is the orrery\'s');
{
  // altdev2 src/game/controls.js, its 23 SLIDERS and its switches. The orrery
  // owns the body and its star: mass, starlight, star temperature, rotation,
  // and the star's own brightening and its smoothing. Everything else is the
  // player's, in the panel or behind ⚙ Advanced (a source-level guard: the
  // panel is built in climate-view.js from CTL, ADV and ADV_SW).
  const SANDBOX = ['mass', 'water', 'landFraction', 'insolation', 'starTemp', 'xuvFraction', 'rotationHours',
    'obliquity', 'n2Bar', 'o2Bar', 'co2Bar', 'ch4Bar', 'h2Bar', 'salinity', 'landAlbedo', 'biosphere', 'emissions',
    'internalHeat', 'magneticField', 'resurfacingAge', 'resurfacingBoost', 'startAge', 'outgassing',
    'tidallyLocked', 'realisticGeology', 'xuvDecay', 'mantleInfinite', 'fossilInfinite', 'brightening', 'smoothInsolation'];
  const ORRERY = ['mass', 'insolation', 'starTemp', 'rotationHours', 'brightening', 'smoothInsolation'];
  const view = readFileSync(new URL('../assets/climate-view.js', import.meta.url), 'utf8');
  const listed = new Set();
  for (const name of ['CTL', 'ADV', 'ADV_SW']) {
    const body = (view.match(new RegExp(`const ${name}=\\[([\\s\\S]*?)\\n\\];`)) || [, ''])[1];
    for (const m of body.matchAll(/\[\s*'([A-Za-z0-9]+)'/g)) listed.add(m[1]);
  }
  if (/data-k="tidallyLocked"/.test(view)) listed.add('tidallyLocked');
  const missing = SANDBOX.filter((k) => !ORRERY.includes(k) && !listed.has(k));
  ok(missing.length === 0, 'every one the orrery does not own can be set', missing.length ? `missing: ${missing.join(', ')}` : `${listed.size} in the panel`);
  // what a state's text tells the player to reach for has to be there to reach
  const NAMES = [[/volcan/i, 'outgassing'], [/magnetic/i, 'magneticField'], [/salt|salin|brine/i, 'salinity'],
    [/biosphere|photosynth/i, 'biosphere'], [/internal heat|interior heat/i, 'internalHeat'],
    [/industr|fossil/i, 'emissions'], [/\bXUV\b|ultraviolet/i, 'xuvFraction'], [/tidally locked/i, 'tidallyLocked']];
  const unreachable = [];
  for (const [id, st] of Object.entries(SYSTEM.ALL_STATES))
    for (const [re, k] of NAMES) if (re.test(st.blurb) && !listed.has(k)) unreachable.push(`${id} names ${k}`);
  ok(unreachable.length === 0, 'every control a state\'s text points to is in the panel', unreachable.join('; '));
}

section('An airless world swings from night to noon');
{
  // the book's Mercury, Diviner's Moon (Williams et al. 2017) and Cassini's
  // Enceladus (Spencer et al. 2006), against system.js groundExtremes
  const { sys } = build('sol');
  const ex = (k) => sys.detail(k).extremes, C = (K) => (K - 273.15).toFixed(0);
  const m = sys.worlds.get('mercury'), q = 0.387 * (1 - 0.2056);
  sys.setFlux(m, S_EARTH / (q * q), m.starTemp); m.sim.setParams({});
  const me = ex('mercury');
  ok(me && Math.abs(me.dayK - 700) < 15 && Math.abs(me.nightK - 100) < 15,
    'Mercury: the book\'s +427 °C at noon at perihelion and −173 °C at night', me ? `${C(me.dayK)} / ${C(me.nightK)} °C` : 'no extremes');
  const mo = ex('moon');
  ok(mo && Math.abs(mo.dayK - 397) < 15 && Math.abs(mo.nightK - 95) < 15, 'the Moon: +124 °C at noon, −178 °C before dawn',
    mo ? `${C(mo.dayK)} / ${C(mo.nightK)} °C` : 'no extremes');
  const en = ex('enceladus');
  ok(en && Math.abs(en.dayK - 80) < 10, 'Enceladus: its noon near the 80 K Cassini saw, off ice of Bond albedo 0.81',
    en ? `${en.dayK.toFixed(0)} K at noon` : 'no extremes');
  const e = ex('earth');
  ok(!e, 'a world with air keeps its bands\' range');
}

section('Nitrogen and methane lie frozen where it is cold, and rise where it is not');
{
  // Pluto's air is the vapour over its nitrogen ice, 11.5 µbar at 37 K (New
  // Horizons), its frost the Sputnik Planitia glacier; Triton's 14 µbar at 38 K
  // (Voyager 2); Kauket's thin envelope frozen on the ice (the book)
  const sol = () => { const b = build('sol'); return { sys: b.sys, f: forcingOf(b.ins, b.keys) }; };
  const at = (sys, k) => { const w = sys.worlds.get(k).sim.world, g = w.diag.g;
    return { T: w.diag.Tmean, n2: w.n2 * g / 1e5, frost: (w.n2Frozen ?? 0) * g / 1e5, ch4: w.ch4 * g / 1e5, ch4frost: (w.ch4Frozen ?? 0) * g / 1e5 }; };
  const { sys, f } = sol(), pl = at(sys, 'pluto'), tr = at(sys, 'triton');
  ok(pl.frost > 1 && pl.n2 > 5e-6 && pl.n2 < 2e-5, 'Pluto: a bar of nitrogen lies frozen, and its air is the vapour over it',
    `${(pl.n2 * 1e6).toFixed(1)} µbar over ${pl.frost.toFixed(2)} bar of frost at ${pl.T.toFixed(1)} K`);
  ok(tr.frost > 0 && tr.n2 > 7e-6 && tr.n2 < 3e-5 && Math.abs(tr.T - 38) < 1.5, 'Triton: its 14 µbar over nitrogen frost at 38 K',
    `${(tr.n2 * 1e6).toFixed(1)} µbar at ${tr.T.toFixed(1)} K`);
  // moved to Earth's distance the frost holds the ground near its frost point
  // while it rises, and is a bar of air within decades
  const warm = { ...f, pluto: { flux: S_EARTH, starTemp: 5772 } };
  advance(sys, 5, 0.5, 10, warm);
  const early = at(sys, 'pluto');
  ok(early.frost > 0.1 && early.T < 90, 'moved to 1 AU, Pluto\'s frost holds its ground near the frost point while it rises',
    `${early.T.toFixed(0)} K after 5 yr with ${early.frost.toFixed(2)} bar of frost left (bare, it settles at 202 K)`);
  advance(sys, 25, 2.5, 10, warm);
  const hot = at(sys, 'pluto');
  ok(hot.n2 > 0.9 * (pl.n2 + pl.frost) && hot.ch4 > 0.01, '...and within thirty years it is a bar of nitrogen and methane air',
    `${hot.n2.toFixed(2)} bar N₂, ${(hot.ch4 * 1e3).toFixed(0)} mbar CH₄, ${hot.T.toFixed(0)} K`);
  // brought back then, it snows back onto the ice
  const { sys: s2, f: f2 } = sol();
  advance(s2, 30, 3, 10, { ...f2, pluto: { flux: S_EARTH, starTemp: 5772 } });
  advance(s2, 2e4, 2e3, 10, f2);
  const back = at(s2, 'pluto');
  ok(back.frost > 1 && back.n2 < 3e-5, '...taken back out then, it snows back onto the ice',
    `${(back.n2 * 1e6).toFixed(1)} µbar in the air, ${back.frost.toFixed(2)} bar of frost, ${back.T.toFixed(1)} K after 20 kyr`);
  // left there, it loses the lot to space
  advance(sys, 1e3, 100, 10, warm);
  const gone = at(sys, 'pluto');
  ok(gone.n2 + gone.frost < 0.01, '...and left there, escape takes all of it within a millennium',
    `${((gone.n2 + gone.frost) * 1e3).toFixed(2)} mbar of nitrogen left, ${gone.T.toFixed(0)} K`);
  const { sys: rs } = build('ra'), kw = rs.worlds.get('kauket').sim.world;
  ok((kw.n2Frozen ?? 0) > 0 && kw.n2 * kw.diag.g / 1e5 < 1e-9, 'Kauket: its thin envelope lies frozen on the ice',
    `${((kw.n2Frozen ?? 0) * kw.diag.g / 1e5 * 1e3).toFixed(1)} mbar of frost`);
}

section('The world top to bottom, as the readouts have it');
{
  // the panel's cross-section (system.js layersOf) is drawn from the numbers the
  // readouts print, never from its own: the sandbox's rule for its own column
  const { sys: ss } = build('sol'), { sys: rs } = build('ra');
  const kinds = (L) => (L || []).map((l) => l.kind).join(' ');
  const earth = ss.detail('earth').layers;
  ok(/^air ocean rock$/.test(kinds(earth)), 'Earth: air, a sea and rock', kinds(earth));
  const nd = rs.detail('nephtys'), acidL = (nd.layers || []).find((l) => l.kind === 'acidSea');
  ok(acidL && Math.abs(acidL.metres - nd.acid.depthM) < 1e-6 * nd.acid.depthM, 'Nephtys: its acid sea as deep as the readout says',
    acidL ? `${(acidL.metres / 1e3).toFixed(2)} km` : kinds(nd.layers));
  const pw = ss.worlds.get('pluto').sim.world, frostL = (ss.detail('pluto').layers || []).find((l) => l.kind === 'frost');
  const frostM = pw.n2Frozen / 1030 + pw.ch4Frozen / 500;
  ok(frostL && Math.abs(frostL.metres - frostM) < 1e-6 * frostM && frostL.metres > 100, 'Pluto: its frost, a layer as thick as its reservoir',
    frostL ? `${frostL.metres.toFixed(0)} m` : kinds(ss.detail('pluto').layers));
  ss.impact('earth', { J: 1e29, kind: 'collision' });
  const hot = ss.detail('earth'), magL = (hot.layers || []).find((l) => l.kind === 'magma');
  const r = ss.worlds.get('earth'), magM = r.magma ? r.magma.reduce((a, b) => a + b, 0) / r.magma.length / (3000 * 1.8e6) : 0;
  ok(magL && Math.abs(magL.metres - magM) < 1e-6 * magM, '1e29 J on Earth: a molten crust over the rock, as deep as the melt',
    magL ? `${(magL.metres / 1e3).toFixed(1)} km` : kinds(hot.layers));
  // and every layer the model or this edition can draw has its colour and both names
  const view = readFileSync(new URL('../assets/climate-view.js', import.meta.url), 'utf8');
  const style = (view.match(/const LAYER_STYLE=\{([\s\S]*?)\n\};/) || [, ''])[1];
  const { LAYER_KINDS } = await import('../assets/climate/physics/ocean.js');
  const unstyled = [...LAYER_KINDS, 'frost', 'acidSea', 'magma'].filter((k) => !new RegExp(`\\b${k}:\\['#[0-9a-f]{6}','[^']+','[^']+'\\]`).test(style));
  ok(unstyled.length === 0, 'every layer kind has a colour and its English and Slovak names', unstyled.join(', '));
}

section('Nephtys has a sea of sulfuric acid');
{
  const neph = () => { const b = build('ra'); return { sys: b.sys, f: forcingOf(b.ins, b.keys), r: b.sys.worlds.get('nephtys') }; };
  const acidOf = (sys) => (sys.detail('nephtys') || {}).acid || null;
  {
    const { sys, r } = neph(), a = acidOf(sys);
    ok(a && a.cover > 0.75 && a.frozen < 0.01, 'it opens with a liquid acid sea over most of the world',
      a ? `cover ${(a.cover * 100).toFixed(0)} %, ${(a.depthM / 1e3).toFixed(1)} km deep` : 'no acid sea');
    // 98 % acid boils at 338 C at an atmosphere; under Nephtys's air, on the same
    // Clausius-Clapeyron curve (slope 10156 K: Ayers, Gillett & Gras 1980)
    const pAir = a ? a.pAirBar : NaN, Tb = 1 / (1 / 611 - Math.log(pAir / 1.01325) / 10156) - 273.15;
    ok(a && Math.abs(a.boilC - Tb) < 1 && a.boilC > 400, 'it boils where the curve puts it under this air',
      a ? `${a.boilC.toFixed(0)} °C under ${pAir.toFixed(1)} bar` : '');
    ok(a && a.vapourBar > 0.005 && a.vapourBar < 0.05, 'and at 231 C gives off a few hundredths of a bar',
      a ? `${(a.vapourBar * 1e3).toFixed(1)} mbar` : '');
    // it holds heat like a sea: the same strike warms it less than the same world dry
    // (a custom body, so it gets Nephtys's params and not its profile's sea)
    const dry = new ClimateSystem(), d = { ...r.data, key: 'dry-nephtys', custom: true };
    const pDry = { ...r.sim.world.params }; delete pDry.overlay;
    dry.add('dry', 'ra', d, { params: pDry, flux: r.flux, starTemp: r.starTemp });
    const Cw = r.sim.world.diag.C.reduce((x, y) => x + y, 0), Cd = dry.worlds.get('dry').sim.world.diag.C.reduce((x, y) => x + y, 0);
    ok(Cw > 1.5 * Cd, 'it holds heat like a sea', `heat capacity ×${(Cw / Cd).toFixed(2)} of the same world dry`);
  }
  {
    // the latent heat is paid: a strike the size of what the sea costs to boil
    // leaves most of it liquid, and one several times that puts it in the sky
    const { sys, f, r } = neph(), a0 = acidOf(sys);
    sys.impact('nephtys', { J: 1e27, kind: 'collision' });
    const a1 = acidOf(sys);
    ok(a1 && a1.airShare > a0.airShare && a1.airShare < 0.5, '1e27 J boils some of the sea and no more than it pays for',
      a1 ? `${(a1.airShare * 100).toFixed(1)} % of the acid in the air (was ${(a0.airShare * 100).toFixed(2)} %)` : '');
    const { sys: s2, f: f2, r: r2 } = neph();
    s2.impact('nephtys', { J: 2e28, kind: 'collision' });
    const a2 = acidOf(s2);
    ok(a2 && a2.airShare > 0.9, '2e28 J puts the whole sea in the sky', a2 ? `${(a2.airShare * 100).toFixed(0)} % in the air, ${(r2.rs[RS.TMEAN] - 273.15).toFixed(0)} °C` : '');
    // a world loaded afterwards shares nothing with that one: the spin-up table
    // is read, never written (the first acid.js wrote the boiled sky into it)
    const { sys: s3 } = neph(), a4 = acidOf(s3);
    ok(a4 && a4.vapourBar < 0.05 && s3.detail('nephtys').pTot < 14, 'a Nephtys loaded while that one boils opens as the first did',
      a4 ? `${(a4.vapourBar * 1e3).toFixed(1)} mbar of acid, ${s3.detail('nephtys').pTot.toFixed(1)} bar` : '');
    advance(s2, 3e4, 3e3, 10, f2);
    const a3 = acidOf(s2);
    ok(a3 && a3.cover > 0.5, '...and it rains back into its basins as the world cools',
      a3 ? `cover ${(a3.cover * 100).toFixed(0)} % after 30 kyr, ${(r2.rs[RS.TMEAN] - 273.15).toFixed(0)} °C` : '');
  }
  {
    // moved out to a twentieth of its light, the sea freezes pale, and its life
    // fades on the model's own clock for a population with no room (~2 Myr)
    const { sys, r } = neph();
    const far = { nephtys: { flux: 0.05 * S_EARTH, starTemp: r.starTemp } };
    advance(sys, 3e5, 3e4, 10, far);
    const a = acidOf(sys);
    ok(a && a.frozen > 0.9, 'moved far out, the acid sea freezes', a ? `${(a.frozen * 100).toFixed(0)} % frozen at ${(r.rs[RS.TMEAN] - 273.15).toFixed(0)} °C` : '');
    advance(sys, 3e7, 3e6, 10, far);
    ok(r.ledger.level === 0 && LIFE_CAUSES[r.ledger.cause] === 'frozen', '...and in 30 Myr the life in it has died of the cold',
      `level ${r.ledger.level}, ${LIFE_CAUSES[r.ledger.cause]}`);
  }
}

section('Edits reach the reservoirs');
{
  const { sys } = build('sol');
  sys.set('mars', { co2Bar: 1.0 });
  const d = sys.detail('mars');
  ok(Math.abs(d.gas.co2 - 1.0) < 1e-6, 'Mars CO2 set to 1 bar', `${d.gas.co2.toPrecision(5)} bar`);
  sys.set('mars', { water: 0.5 });
  ok(Math.abs(sys.detail('mars').water.total - 0.5) < 1e-6, 'Mars water set to 0.5 ocean');
  sys.set('mars', { internalHeat: 3 });
  ok(sys.detail('mars').params.internalHeat === 3, 'interior heat is a base the pulses ride on');
}

section('A save restores the same world');
{
  const { sys, ins, keys } = build('ra');
  const f = forcingOf(ins, keys);
  advance(sys, 500, 20, 30, f);
  sys.impulse('satis', 5e25, 0);
  advance(sys, 0.3, 1, 30, f);
  const snap = sys.snapshot();
  const { sys: s2 } = build('ra');
  for (const [k, s] of Object.entries(snap)) s2.restore(k, JSON.parse(JSON.stringify(s)));
  advance(sys, 20, 5, 30, f);
  advance(s2, 20, 5, 30, f);
  const a = sys.worlds.get('satis').rs[RS.TMEAN], b = s2.worlds.get('satis').rs[RS.TMEAN];
  ok(Math.abs(a - b) < 1e-6, 'Satis mid-pulse, saved and restored, runs on identically', `${a.toFixed(6)} vs ${b.toFixed(6)}`);
}

section('The host speaks the protocol');
{
  const out = [];
  const host = createHost((m) => out.push(m));
  host.ready();
  const d = systems.sol.bodies.find((b) => b.key === 'earth');
  host.handle({ type: 'add', key: 'earth', sys: 'sol', data: trim(d), flux: S_EARTH, starTemp: 5772 });
  host.handle({ type: 'focus', key: 'earth' });
  host.handle({ type: 'tick', dt: 1, rate: 1, forcing: { earth: { flux: S_EARTH, starTemp: 5772 } } });
  while (host.work(50)) { /* */ }
  host.flush(true);
  const types = out.map((m) => m.type);
  ok(types[0] === 'ready' && types.includes('added') && types.includes('state') && types.includes('detail'),
     'ready, added, state and detail are posted', types.join(' '));
  const st = out.find((m) => m.type === 'state');
  ok(st && st.keys[0] === 'earth' && st.data.length === RS.SIZE, 'one render record per world');
}

section('The surface analysis finds the sea');
{
  const W = 256, H = 128;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const sea = x < W * 0.6;
    const pole = y < 6 || y >= H - 6;
    const c = pole ? [240, 244, 248] : sea ? [20, 50, 120] : [60, 120, 40];
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }
  const a = analyseSurface(W, H, rgba, null, { srcOcean: 0.6, veg: 'green', seed: 3 });
  ok(Math.abs(a.s0 - 0.6) < 0.03, 'sea share below the coast', a.s0.toFixed(3));
  let vegLand = 0, vegSea = 0;
  for (let i = 0; i < W * H; i++) { if (a.bytes[i * 4] >= 128) vegLand += a.bytes[i * 4 + 1]; else vegSea += a.bytes[i * 4 + 1]; }
  ok(vegLand > 0 && vegSea < vegLand * 0.02, 'vegetation found on the land and not in the sea');
  let mono = true;
  for (let k = 0; k < 256; k++) if (a.cdf[k + 1] < a.cdf[k]) mono = false;
  ok(mono && a.cdf[256] === 1, 'height CDF is monotonic');
  const hs = heightForShare(a.cdf, 0.8);
  ok(hs > 0.52, 'a bigger sea puts the shore above today\'s', hs.toFixed(3));
  ok(heightForShare(a.cdf, a.s0) > 0.47 && heightForShare(a.cdf, a.s0) < 0.53, 'today\'s sea puts it at today\'s coast');
}

section('The surface field is the right way up');
{
  // A DataTexture is not flipped on upload the way an image is: its row 0 is
  // the south pole (v = 0), where the map's row 0 is the north. Written the
  // map's way round, every sea, cap and forest came out mirrored pole to pole.
  const W = 128, H = 64;
  const rgba = new Uint8ClampedArray(W * H * 4), dem = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    // map row 0 is the north: a white cap, then sea down to the equator, land south of it
    const c = y < 4 ? [240, 244, 248] : y < H / 2 ? [20, 50, 120] : [60, 120, 40];
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    const v = Math.round(255 * y / (H - 1));             // and the ground lowest in the north
    dem[i] = dem[i + 1] = dem[i + 2] = v; dem[i + 3] = 255;
  }
  const rowMean = (a, y, ch) => { let s = 0; for (let x = 0; x < W; x++) s += a.bytes[(y * W + x) * 4 + ch]; return s / W; };
  const a = analyseSurface(W, H, rgba, null, { srcOcean: 0.45, seed: 5 });
  ok(rowMean(a, H - 12, 0) < 128 && rowMean(a, 12, 0) >= 128, 'the northern sea is in the top rows of the texture, the southern land in the bottom',
    `north ${rowMean(a, H - 12, 0).toFixed(0)}, south ${rowMean(a, 12, 0).toFixed(0)}`);
  ok(rowMean(a, H - 1, 2) > 128 && rowMean(a, 0, 2) < 64, 'the northern cap is in the last row');
  const d = analyseSurface(W, H, rgba, dem, { srcOcean: 0.45, seed: 5 });
  ok(rowMean(d, H - 1, 0) < rowMean(d, H / 2 - 2, 0) && rowMean(d, H / 2 + 2, 0) < rowMean(d, 0, 0),
    'on a height map, the low north floods first', `north ${rowMean(d, H - 1, 0).toFixed(0)}, south ${rowMean(d, 0, 0).toFixed(0)}`);
}

section('Throughput');
{
  const { sys, ins, keys } = build('ra');
  const f = forcingOf(ins, keys);
  const t0 = performance.now();
  const s0 = sys.stepsTaken;
  advance(sys, 200, 10, 30, f);
  const ms = performance.now() - t0;
  const steps = sys.stepsTaken - s0;
  console.log(`  info ${keys.length} Ra worlds, 20 s of play at 10 yr/s: ${steps} steps in ${ms.toFixed(0)} ms `
    + `(${(ms / steps * 1000).toFixed(0)} µs/step, ${(ms / 20).toFixed(1)} ms per wall second)`);
  ok(ms / 20 < 150, 'the climate costs a fraction of a core at 10 yr/s', `${(ms / 20).toFixed(1)} ms/s`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
