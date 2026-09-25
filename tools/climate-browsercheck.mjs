// The climate edition in a real browser: the things Node cannot see.
//
//   node tools/climate-browsercheck.mjs
//
// Needs Playwright with a Chromium (npm i --no-save playwright). Without it the
// check prints "skipping" -- and a skipped check is not a passed one. Serves the
// repo itself on a free port, so nothing else has to be running.
//
// Checks: the worker starts and every climate world reports; the sidebar shows
// their temperatures; the surface field is the right way up on the real Earth
// (the Arctic sea is sea and Antarctica is land -- mirrored, it is the other way
// round); the panel's edits reach the model and Reset undoes them; the Slovak
// switch translates the edition badge without duplicating it; the temperature
// view shows its legend; and nothing throws.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch (_) { /* try the global install */ }
  try {
    const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return await import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
  } catch (_) { return null; }
}
const pw = await loadPlaywright();
if (!pw) { console.log('skipping: Playwright not installed (npm i --no-save playwright)'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${msg}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${msg}${extra ? '  ' + extra : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function openSystem(sys) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Errors inside event handlers are caught and logged, not thrown: count them too.
  // (A missing texture is a 404 the app recovers from, not an error in the code.)
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().split('\n')[0]); });
  await page.addInitScript((s) => { try { localStorage.setItem('ra-climate-system', s); } catch (_) {} }, sys);
  await page.goto(BASE, { waitUntil: 'load' });
  // every climate world reports a state
  await page.waitForFunction(() => window.RAClimate && RAClimate.ready && RAClimateView.bodies.size > 0 &&
    [...RAClimateView.bodies.keys()].every((k) => RAClimate.state(k)), null, { timeout: 60000 }).catch(() => {});
  return { page, errors };
}
const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

try {
  for (const sys of ['sol', 'ra']) {
    section(`${sys}: the climate starts`);
    const { page, errors } = await openSystem(sys);
    const s = await page.evaluate(() => ({ mode: RAClimate.mode, n: RAClimateView.bodies.size,
      live: [...RAClimateView.bodies.keys()].filter((k) => RAClimate.state(k)).length,
      temps: document.querySelectorAll('.navitem .ctemp').length }));
    ok(s.mode === 'worker', 'the physics runs in a worker', s.mode);
    ok(s.n >= 10 && s.live === s.n, 'every climate world reports a state', `${s.live}/${s.n}`);
    await until(page, (n) => document.querySelectorAll('.navitem .ctemp').length >= n, s.n, 5000);
    const temps = await page.evaluate(() => document.querySelectorAll('.navitem .ctemp').length);
    ok(temps >= s.n, 'the sidebar shows their temperatures', `${temps}`);

    if (sys === 'sol') {
      section('sol: the surface field is the right way up');
      await page.evaluate(() => focusBody('earth', 'force'));
      const got = await until(page, () => { const cv = RAClimateView.bodies.get('earth'); return cv && cv.surfTex; }, null, 45000);
      ok(got, 'Earth\'s surface map is analysed');
      if (got) {
        const at = await page.evaluate(() => {
          const { data, width: W, height: H } = RAClimateView.bodies.get('earth').surfTex.image;
          // texture row 0 is v = 0, the south pole; u = 0 is 180 W on a map centred on 0
          const h = (lat, lon) => {
            const y = Math.min(H - 1, Math.floor((lat + 90) / 180 * H)), x = Math.floor(((lon + 180) / 360) * W) % W;
            return data[(y * W + x) * 4];
          };
          return { arctic: h(86, 0), antarctica: h(-82, 0), pacific: h(0, -160), sahara: h(23, 13) };
        });
        ok(at.arctic < 128 && at.pacific < 128, 'the Arctic and the Pacific are sea', JSON.stringify(at));
        ok(at.antarctica >= 128 && at.sahara >= 128, 'Antarctica and the Sahara are land');
      }

      section('sol: the panel edits the world');
      const det = () => page.evaluate(() => { const d = RAClimate.detail; return d && d.key === 'earth' ? { co2: d.gas.co2, n2: d.gas.n2, water: d.water.total } : null; });
      await until(page, () => RAClimate.detail && RAClimate.detail.key === 'earth', null, 10000);
      const d0 = await det();
      ok(!!d0, 'the panel receives the world\'s detail');
      if (d0) {
        await page.evaluate(() => { document.querySelector('details.clim-ctl').open = true; });
        await page.click('[data-q="co2x10"]');
        await until(page, (c) => RAClimate.detail && RAClimate.detail.gas.co2 > c * 9, d0.co2, 5000);
        const d1 = await det();
        ok(Math.abs(d1.co2 / d0.co2 - 10) < 0.01, 'CO₂ ×10', `${(d0.co2 * 1e6).toFixed(0)} -> ${(d1.co2 * 1e6).toFixed(0)} ppm`);
        const n2 = page.locator('input[data-k="n2Bar"]');
        await n2.click(); await n2.fill('2 atm'); await n2.press('Enter');
        await until(page, () => RAClimate.detail && Math.abs(RAClimate.detail.gas.n2 - 2.0265) < 1e-3, null, 5000);
        ok(Math.abs((await det()).n2 - 2.0265) < 1e-3, 'a typed value with units: 2 atm of N₂');
        await page.click('[data-q="reset"]');
        await until(page, (c) => RAClimate.detail && Math.abs(RAClimate.detail.gas.co2 - c) < c * 1e-3, d0.co2, 5000);
        const d2 = await det();
        ok(Math.abs(d2.co2 - d0.co2) < d0.co2 * 1e-3 && Math.abs(d2.n2 - d0.n2) < 1e-3, 'Reset climate puts it back');
      }

      section('sol: every number says what it is');
      // An airless moon is where a bare "0" used to stand in for "0 bar".
      // (with the 0.627 oceans of water a player gave it in the report that found this)
      await page.evaluate(() => focusBody('moon', 'force'));
      await until(page, () => RAClimate.detail && RAClimate.detail.key === 'moon' &&
        document.querySelector('#i-climate .clim-tab tr'), null, 15000);
      await page.evaluate(() => RAClimate.set('moon', { water: 0.627 }));
      await until(page, () => RAClimate.detail && RAClimate.detail.key === 'moon' && RAClimate.detail.water.total > 0.6, null, 15000);
      await page.waitForTimeout(600);
      const u = await page.evaluate(() => {
        const box = document.getElementById('i-climate');
        const gas = [...box.querySelectorAll('input[data-u="gas"]')].map((i) => i.value);
        const row = [...box.querySelectorAll('.clim-tab tr')].map((r) => [...r.cells].map((c) => c.textContent));
        const p = (row.find((r) => /pressure|Tlak/i.test(r[0])) || [])[1];
        const water = (row.find((r) => /^Water|^Voda/.test(r[0])) || [])[1];
        const gasRows = box.querySelector('.clim-gas-note');
        return { gas, p, water, note: gasRows && gasRows.textContent };
      });
      // A pressure is in pressure units. ppm is a share of the air, never a pressure.
      const unit = /^[-+]?[0-9.]+(e[-+]?\d+)?\s*(bar|mbar|µbar|Pa)$/;
      ok(u.gas.length >= 5 && u.gas.every((v) => unit.test(v)), 'every gas value carries a pressure unit', JSON.stringify(u.gas));
      ok(unit.test(u.p || ''), 'the surface pressure carries a pressure unit', JSON.stringify(u.p));
      ok(/partial pressure/i.test(u.note || ''), 'the gas rows say what they measure', JSON.stringify(u.note));
      ok(/Earth ocean/.test(u.water || ''), 'the water readout names its unit', JSON.stringify(u.water));
      await page.evaluate(() => RAClimate.reset('moon'));

      // Pluto, as reported: "Surface pressure 11 ppm", "Air N₂ 11 ppm", "Sea / ice cover
      // 100 % / 100 %" for an ocean that is all ice.
      await page.evaluate(() => focusBody('pluto', 'force'));
      await until(page, () => RAClimate.detail && RAClimate.detail.key === 'pluto' &&
        document.querySelector('#i-climate .clim-tab tr'), null, 15000);
      await page.waitForTimeout(600);
      const pl = await page.evaluate(() => {
        const box = document.getElementById('i-climate');
        const row = [...box.querySelectorAll('.clim-tab tr')].map((r) => [...r.cells].map((c) => c.textContent));
        const get = (re) => (row.find((r) => re.test(r[0])) || [])[1] || '';
        return { p: get(/pressure|Tlak/i), air: get(/^Air|^Vzduch/), sea: get(/sea|more/i),
          gas: [...box.querySelectorAll('input[data-u="gas"]')].map((i) => i.value) };
      });
      ok(unit.test(pl.p) && /µbar|Pa/.test(pl.p), 'Pluto\'s surface pressure reads in µbar or Pa', JSON.stringify(pl.p));
      ok(/N₂ (99|100)/.test(pl.air) && /%/.test(pl.air), 'Pluto\'s air is given as shares of the air', JSON.stringify(pl.air));
      ok(pl.gas.every((v) => !/ppm/.test(v)), 'no gas field shows ppm', JSON.stringify(pl.gas));
      ok(/^0 %/.test(pl.sea) || /open sea 0 %/i.test(pl.sea), 'Pluto has no open sea', JSON.stringify(pl.sea));

      section('sol: the sidebar follows the orbits');
      // Reported: "even if you move Pluto closer to the Sun than Earth it STILL is
      // listed at the bottom".
      const order = () => page.evaluate(() => [...document.querySelectorAll('#nav .navitem:not(.sub)')].map((e) => e.dataset.key));
      await page.evaluate(() => applyOrbitEdit(bodies.find((b) => b.data.key === 'pluto'), 0.5, 0.01));
      await page.waitForTimeout(2500);
      const o1 = await order();
      ok(o1.indexOf('pluto') > o1.indexOf('mercury') && o1.indexOf('pluto') < o1.indexOf('venus'),
        'Pluto moved to 0.5 AU is listed between Mercury and Venus', o1.join(' '));
      const moonsAfter = await page.evaluate(() => { const all = [...document.querySelectorAll('#nav .navitem')].map((e) => e.dataset.key);
        return all.slice(all.indexOf('pluto') + 1, all.indexOf('pluto') + 2); });
      ok(moonsAfter[0] === 'charon', 'Charon still follows Pluto', moonsAfter.join(' '));
      // a life tag set by the damage model survives a rebuild of the list
      await page.evaluate(() => { const r = bodies.find((b) => b.data.key === 'earth'); impGoExtinct(r, false); });
      await page.evaluate(() => { document.getElementById('t-lang').click(); document.getElementById('t-lang').click(); });
      await page.waitForTimeout(300);
      const tag = await page.evaluate(() => { const el = document.querySelector('#nav .navitem[data-key="earth"] .tag'); return el ? el.textContent : ''; });
      ok(/unicellular/i.test(tag), 'Earth\'s "unicellular" tag survives a language switch', JSON.stringify(tag));
      await page.evaluate(() => impHeal());
      await page.waitForTimeout(300);
      // Under N-body the list asks what each body orbits. The Sun pulls the Moon
      // about twice as hard as Earth does, and the Moon still orbits Earth.
      await page.evaluate(() => { if (!nbodyOn) toggleNbody(); });
      await page.waitForTimeout(2500);
      const par = await page.evaluate(() => Object.fromEntries(['moon', 'charon', 'io', 'phobos', 'earth']
        .map((k) => { const p = nbDominantParent(bodies.find((b) => b.data.key === k)); return [k, p && p.data.key]; })));
      ok(par.moon === 'earth' && par.charon === 'pluto' && par.io === 'jupiter' && par.phobos === 'mars' && par.earth === 'sun',
        'under N-body each moon orbits its planet, each planet the Sun', JSON.stringify(par));
      const o2 = await order();
      const all2 = await page.evaluate(() => [...document.querySelectorAll('#nav .navitem')].map((e) => e.dataset.key));
      ok(o2.indexOf('moon') < 0 && all2[all2.indexOf('earth') + 1] === 'moon', 'under N-body the Moon stays under Earth in the list', o2.join(' '));
      const moonA = await page.evaluate(() => orbCurrent(bodies.find((b) => b.data.key === 'moon')).a * 1.495978707e8);
      ok(Math.abs(moonA - 384400) < 20000, 'the Moon\'s live orbit is about 384 400 km', Math.round(moonA) + ' km');
      await page.evaluate(() => { if (nbodyOn) toggleNbody(); });

      section('sol: Reset and Load stay in the page');
      // Reset used to reload the page: ~20 s on a slow link, all of it re-fetching,
      // re-decoding and re-analysing what the page already had.
      page.on('dialog', (d) => d.accept());
      const pos = () => page.evaluate(() => Object.fromEntries(['earth', 'moon', 'mars', 'phobos', 'pluto']
        .map((k) => { const r = bodies.find((b) => b.data.key === k); if (!r) return [k, null];
          const v = new THREE.Vector3(); r.mesh.getWorldPosition(v); return [k, [v.x, v.y, v.z, r.M]]; })));
      await page.evaluate(() => { const s = document.getElementById('speed'); s.value = 0; setSpeed(0); if (playing) togglePlay(); });
      // the pristine state is the one this page opened with: two Resets with
      // anything in between must land on exactly the same world
      await page.evaluate(() => { window.__stay = 1; document.getElementById('t-sysreset').click(); });
      await until(page, () => window.__stay === 1, null, 20000);
      await page.waitForTimeout(300);
      const p0 = await pos();
      await page.evaluate(() => { window.__stay = 1;
        applyOrbitEdit(bodies.find((b) => b.data.key === 'mars'), 2.2, 0.2);
        removeBody(bodies.find((b) => b.data.key === 'phobos'));
        impGoExtinct(bodies.find((b) => b.data.key === 'earth'), false);
        toggleNbody(); nbStep(0.5); toggleNbody(); elapsedYears += 3; });
      await page.evaluate(() => { saveSystemState(); window.__save = localStorage.getItem(stateKey()); });
      const t0 = Date.now();
      await page.evaluate(() => document.getElementById('t-sysreset').click());
      await until(page, () => window.__stay === 1 && !!bodies.find((b) => b.data.key === 'phobos'), null, 20000);
      const took = Date.now() - t0;
      const r1 = await page.evaluate(() => ({ stay: window.__stay, t: elapsedYears, phobos: !!bodies.find((b) => b.data.key === 'phobos'),
        marsA: orbCurrent(bodies.find((b) => b.data.key === 'mars')).a, earth: bodies.find((b) => b.data.key === 'earth').extinct,
        saved: !!localStorage.getItem(stateKey()) }));
      ok(r1.stay === 1 && took < 3000, 'Reset stays in the page', took + ' ms');
      ok(r1.t === 0 && r1.phobos && Math.abs(r1.marsA - 1.5237) < 0.01 && !r1.earth && !r1.saved,
        'Reset puts back time, a deleted moon, an edited orbit and a dead biosphere, and clears the save', JSON.stringify(r1));
      const p1 = await pos();
      const moved = Object.keys(p0).filter((k) => !p1[k] || p0[k].some((x, i) => Math.abs(x - p1[k][i]) > 1e-6 * Math.max(1, Math.abs(x))));
      ok(moved.length === 0, 'every world is back where the page opened with it', moved.join(' ') || 'all in place');
      // Load: the save made above, in place
      await page.evaluate(() => { localStorage.setItem(stateKey(), window.__save); window.__stay = 2; });
      await page.evaluate(() => document.getElementById('t-load').click());
      await until(page, () => window.__stay === 2 && !bodies.find((b) => b.data.key === 'phobos'), null, 20000);
      const r2 = await page.evaluate(() => ({ stay: window.__stay, t: elapsedYears, phobos: !!bodies.find((b) => b.data.key === 'phobos'),
        marsA: orbCurrent(bodies.find((b) => b.data.key === 'mars')).a }));
      ok(r2.stay === 2 && Math.abs(r2.t - 3) < 0.01 && !r2.phobos && Math.abs(r2.marsA - 2.2) < 0.02, 'Load restores the save in the page', JSON.stringify(r2));
      await page.evaluate(() => document.getElementById('t-sysreset').click());
      await page.waitForTimeout(500);
      // and after wrecking the place: a shattered planet, a custom world, N-body,
      // a supernova, flashes still in flight
      const world = () => page.evaluate(() => ({ keys: bodies.map((b) => b.data.key).sort().join(','),
        destroyed: bodies.filter((b) => b.destroyed).map((b) => b.data.key), customs: bodies.filter((b) => b._custom).length,
        fx: impFx.length, debris: debrisFields.length }));
      const w0 = await world();
      await page.evaluate(() => {
        const mars = bodies.find((b) => b.data.key === 'mars'); mars.dmgJ = impBindingJ(mars) * 1.2; shatterBody(mars);
        createCustomBody({ kind: CR_KINDS[0].kind, a: 1.3, e: 0.1, massKg: 5e24, radiusKm: 6000 });
        if (!nbodyOn) toggleNbody();
        const sun = bodies.find((b) => b.data.kind === 'star'); sun.dmgJ = impBindingJ(sun) * 1.1; shatterStellar(sun);
        if (!playing) togglePlay();
      });
      await page.waitForTimeout(2500);
      await page.evaluate(() => { if (playing) togglePlay(); document.getElementById('t-sysreset').click(); });
      await until(page, () => RAClimate.state('earth') && RAClimate.state('earth')[RAClimate.RS.TIME] === 0, null, 10000);
      const w1 = await world();
      ok(w1.keys === w0.keys && !w1.destroyed.length && !w1.customs && !w1.fx && !w1.debris,
        'Reset after a supernova, a shattered planet and a custom world gives back the same system', JSON.stringify(w1.destroyed));
      ok(await page.evaluate(() => RAClimate.state('earth')[RAClimate.RS.TIME] === 0 && elapsedYears === 0), 'with every clock at zero');

      section('sol: language and views');
      const badge = () => page.evaluate(() => [...document.querySelectorAll('#title-h1 .clim-badge')].map((e) => e.textContent));
      await page.evaluate(() => document.getElementById('t-lang').click());
      const sk = await badge();
      await page.evaluate(() => document.getElementById('t-lang').click());
      const en = await badge();
      ok(sk.length === 1 && sk[0] === 'KLÍMA' && en.length === 1 && en[0] === 'CLIMATE', 'the edition badge translates, once', `${sk} / ${en}`);
      await page.evaluate(() => RAClimateView.toggleTempView());
      const legend = await page.evaluate(() => { const l = document.getElementById('temp-legend'); return !!l && getComputedStyle(l).display !== 'none'; });
      ok(legend, 'the temperature view shows its legend');
      await page.evaluate(() => RAClimateView.toggleTempView());
    }
    ok(errors.length === 0, 'nothing throws', errors.slice(0, 3).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
