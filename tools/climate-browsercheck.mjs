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
  // everything the page asks for, so a Reset can be held to asking for none of it again
  const asked = new Set();
  page.on('request', (q) => asked.add(q.url()));
  page.__asked = asked;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Errors inside event handlers are caught and logged, not thrown: count them too.
  // (A missing texture is a 404 the app recovers from, not an error in the code.)
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().split('\n')[0]); });
  await page.addInitScript((s) => { try { localStorage.setItem('ra-climate-system', s); } catch (_) {} }, sys);
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
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
        // ⚙ Advanced: what the orrery does not own, shown in its own units
        await page.evaluate(() => { document.querySelector('details.clim-adv').open = true; });
        await until(page, () => { const i = document.querySelector('input[data-k="xuvFraction"]'); return i && i.value && i.value !== '—'; }, null, 5000);
        const adv = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.clim-adv input[data-k]')]
          .map((i) => [i.dataset.k, i.type === 'checkbox' ? i.checked : i.value])));
        ok(adv.outgassing === '1' && adv.magneticField === '1' && adv.xuvFraction === '1' && adv.salinity === '35'
          && adv.realisticGeology === false, 'Advanced shows Earth\'s volcanism, field, salt and star as the sandbox does',
          JSON.stringify(adv));
        const own = await page.evaluate(() => document.querySelector('.clim-owned').textContent);
        ok(/1 M⊕/.test(own) && /S⊕/.test(own) && /5772 K/.test(own), 'and names what the orrery sets', own);
        const mf = page.locator('input[data-k="magneticField"]');
        await mf.click(); await mf.fill('0'); await mf.press('Enter');
        await page.click('input[data-k="realisticGeology"]');
        await until(page, () => RAClimate.detail && RAClimate.detail.params.magneticField === 0 && RAClimate.detail.params.realisticGeology, null, 5000);
        const xu = page.locator('input[data-k="xuvFraction"]');
        await xu.click(); await xu.fill('100'); await xu.press('Enter');
        await until(page, () => RAClimate.detail && Math.abs(RAClimate.detail.params.xuvFraction - 3.4e-4) < 1e-9, null, 5000);
        const p1 = await page.evaluate(() => RAClimate.detail.params);
        ok(p1.magneticField === 0 && p1.realisticGeology === true && Math.abs(p1.xuvFraction - 3.4e-4) < 1e-9,
          'its edits reach the model: no field, a cooling interior, a star 100× as active', `${p1.magneticField} ${p1.realisticGeology} ${p1.xuvFraction}`);
        const bad = page.locator('input[data-k="outgassing"]');
        await bad.click(); await bad.fill('50'); await bad.press('Enter');
        ok(await page.evaluate(() => document.querySelector('input[data-k="outgassing"]').classList.contains('bad')),
          'and a value past the sandbox\'s range is refused');
        await page.click('[data-q="reset"]');
        await until(page, (c) => RAClimate.detail && Math.abs(RAClimate.detail.gas.co2 - c) < c * 1e-3, d0.co2, 5000);
        const d2 = await det();
        ok(Math.abs(d2.co2 - d0.co2) < d0.co2 * 1e-3 && Math.abs(d2.n2 - d0.n2) < 1e-3, 'Reset climate puts it back');
        const p2 = await page.evaluate(() => RAClimate.detail.params);
        ok(p2.magneticField === 1 && !p2.realisticGeology && Math.abs(p2.xuvFraction - 3.4e-6) < 1e-12, '...the advanced ones too');
      }

      section('sol: ☁ Clouds off shows the ground');
      {
        const uni = () => page.evaluate(() => [...RAClimateView.bodies.values()].filter((cv) => cv.u)
          .map((cv) => [cv.key, cv.u.uClimD.value.x, cv.u.uClimB.value.z, cv.u.uClimD.value.z]));
        // time held still, the Moon and then Earth close up, each drawn with the
        // deck and without: the Moon has nothing to hide and must not change
        await page.evaluate(() => { if (typeof playing !== 'undefined' && playing) togglePlay(); });
        const shot = async (key) => {
          await page.evaluate((k) => focusBody(k, 'force'), key);
          await page.waitForTimeout(3500);
          return page.screenshot({ clip: { x: 340, y: 120, width: 460, height: 360 } });
        };
        const moonOn = await shot('moon');
        const earthOn = await shot('earth');
        const u0 = await uni();
        await page.click('#t-cloud');
        await until(page, () => [...RAClimateView.bodies.values()].every((cv) => !cv.u
          || (cv.u.uClimD.value.x === 0 && cv.u.uClimB.value.z === 0 && cv.u.uClimD.value.z === 0)), null, 5000);
        const u1 = await uni();
        ok(u1.every((r) => r[1] === 0 && r[2] === 0 && r[3] === 0) && u0.some((r) => r[1] > 0),
          'off, no world draws the climate\'s deck, steam or haze', `${u1.length} worlds`);
        const earthOff = await shot('earth');
        const moonOff = await shot('moon');
        ok(Buffer.compare(moonOn, moonOff) === 0, 'the Moon, with nothing to hide, draws the same either way');
        ok(Buffer.compare(earthOn, earthOff) !== 0, 'Earth loses its clouds');
        const stored = await page.evaluate(() => localStorage.getItem('ra-climate-clouds'));
        await page.click('#t-cloud');
        await until(page, () => { const cv = RAClimateView.bodies.get('earth'); return cv && cv.u.uClimD.value.x === 2; }, null, 5000);
        const back = await page.evaluate(() => RAClimateView.bodies.get('earth').u.uClimD.value.x);
        ok(stored === 'off' && back === 2, 'the choice is remembered, and on again the deck is back', `${stored}, mode ${back}`);
        await page.evaluate(() => { if (typeof playing !== 'undefined' && !playing) togglePlay(); });
      }

      section('sol: the world top to bottom');
      {
        await page.evaluate(() => focusBody('earth', 'force'));
        await until(page, () => RAClimate.detail && RAClimate.detail.key === 'earth' && RAClimate.detail.layers, null, 15000);
        await page.evaluate(() => { document.querySelector('details.clim-layers').open = true; });
        await until(page, () => document.querySelectorAll('.clim-col .layer').length >= 3, null, 5000);
        const en = await page.evaluate(() => [...document.querySelectorAll('.clim-col .layer b')].map((b) => b.textContent));
        ok(en.join('|') === 'atmosphere|liquid ocean|rock', 'Earth\'s layers open: its air, its sea, its rock', en.join(' · '));
        await page.evaluate(() => setLang('sk'));
        await until(page, () => /atmosféra/.test(document.querySelector('.clim-col')?.textContent || ''), null, 8000);
        const sk = await page.evaluate(() => [...document.querySelectorAll('.clim-col .layer b')].map((b) => b.textContent));
        ok(sk.join('|') === 'atmosféra|tekutý oceán|hornina', '...and in Slovak', sk.join(' · '));
        await page.evaluate(() => setLang('en'));
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
      // the list looks again about once a second of frame time, which on a
      // loaded machine at a few frames a second is several seconds of wall clock
      await until(page, () => { const k = [...document.querySelectorAll('#nav .navitem:not(.sub)')].map((e) => e.dataset.key);
        return k.indexOf('pluto') < k.indexOf('venus'); }, null, 30000);
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
      // The worker fetches each map itself for its first reading, one world at a
      // time; on a loaded machine the last are still to come a while after the
      // page is up, and those fetches are not the Reset's. Measure after them.
      const read = await until(page, () => !RAClimateView.analysisBusy && [...RAClimateView.bodies.values()].every((cv) => {
        const m = cv.rec.mesh && cv.rec.mesh.material && cv.rec.mesh.material.map; return !m || !m.image || cv.token === m.uuid; }), null, 90000);
      ok(read, 'every climate world\'s map has had its first reading');
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
      // a rebuilt world takes its images from memory: nothing the page already had
      // goes over the network again. (A map the page had not got round to asking
      // for yet -- on a loaded machine a few are still coming -- is its first load.)
      const before = new Set(page.__asked);
      const fetched = [], first = [];
      const onReq = (q) => (before.has(q.url()) ? fetched : first).push(q.url().replace(BASE, ''));
      page.on('request', onReq);
      const t0 = Date.now();
      await page.evaluate(() => document.getElementById('t-sysreset').click());
      await until(page, () => window.__stay === 1 && !!bodies.find((b) => b.data.key === 'phobos'), null, 20000);
      const took = Date.now() - t0;
      await page.waitForTimeout(4000);          // long enough for the map readings to queue up
      page.off('request', onReq);
      const r1 = await page.evaluate(() => ({ stay: window.__stay, t: elapsedYears, phobos: !!bodies.find((b) => b.data.key === 'phobos'),
        marsA: orbCurrent(bodies.find((b) => b.data.key === 'mars')).a, earth: bodies.find((b) => b.data.key === 'earth').extinct,
        saved: !!localStorage.getItem(stateKey()) }));
      ok(r1.stay === 1 && took < 3000, 'Reset stays in the page', took + ' ms');
      ok(fetched.length === 0, 'Reset fetches nothing again', (fetched.length ? fetched.slice(0, 4).join(' ') : '0 requests')
        + (first.length ? ` (${first.length} first load${first.length > 1 ? 's' : ''} still arriving: ${first.slice(0, 3).join(' ')})` : ''));
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

      section('sol: a destroyed world has no climate to change');
      const gone = await page.evaluate(async () => {
        focusBody('mars', 'force');
        await new Promise((r) => setTimeout(r, 1200));
        const before = !!document.getElementById('i-climate');
        const mars = bodies.find((b) => b.data.key === 'mars'); mars.dmgJ = impBindingJ(mars) * 1.2; shatterBody(mars);
        openInfo(mars.data);                                        // the panel as it is rebuilt at once
        const rebuilt = !!document.getElementById('i-climate');
        await new Promise((r) => setTimeout(r, 600));
        const later = !!document.getElementById('i-climate');
        openInfo(mars.data);
        return { before, rebuilt, later, reopened: !!document.getElementById('i-climate') };
      });
      ok(gone.before && !gone.rebuilt && !gone.later && !gone.reopened,
        'shattering Mars takes its climate panel away, and reopening it shows none', JSON.stringify(gone));
      await page.evaluate(() => { document.getElementById('t-sysreset').click(); });
      await page.waitForTimeout(600);

      section('sol: energy reaches the climate at once, where it lands');
      const hit = await page.evaluate(async () => {
        const RS = RAClimate.RS, earth = bodies.find((b) => b.data.key === 'earth');
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const sp = document.getElementById('speed'); sp.value = 0; setSpeed(0); if (!playing) togglePlay();
        for (let i = 0; i < 10; i++) await frame();
        // the lab's own asteroid: the frame it lands in, and the frame its heat shows in
        const Ta = RAClimate.state('earth')[RS.TMEAN];
        launchAsteroid(earth, { uv: { x: 0.7, y: 0.6 } });
        const a = impAsteroids[impAsteroids.length - 1];
        let landed = -1, seen = -1;
        for (let f = 1; f < 600 && (landed < 0 || seen < 0); f++) {
          await frame();
          if (landed < 0 && !impAsteroids.includes(a)) landed = f;
          if (seen < 0 && RAClimate.state('earth')[RS.TMEAN] !== Ta) seen = f;
        }
        const lab = { lag: seen - landed, dT: RAClimate.state('earth')[RS.TMEAN] - Ta };
        const s0 = RAClimate.state('earth').slice();
        // a Chicxulub-and-a-half at 30° south, as the lab lands it
        applyStrike(earth, 0.3, (Math.asin(-0.5) / Math.PI) + 0.5, 1e25,
          { mKg: 1e16, vKms: 20, matI: 1, dir: new THREE.Vector3(0, 0, 1) });
        let n = 0;
        while (n < 30 && RAClimate.state('earth')[RS.TMEAN] === s0[RS.TMEAN]) { await frame(); n++; }
        const s1 = RAClimate.state('earth').slice();
        // a laser held at 72° north: its heat stays in that band
        for (let i = 0; i < 3; i++) await frame();
        const s2 = RAClimate.state('earth').slice();
        RAClimateView.deposit(earth, 2e22, { kind: 'laser', point: uvToWorld(earth, 0.5, 0.9) });
        RAClimateView.flush();
        n2: for (var m = 0; m < 30; m++) { await frame(); if (RAClimate.state('earth')[RS.TMEAN] !== s2[RS.TMEAN]) break n2; }
        const s3 = RAClimate.state('earth').slice();
        const dT = (a, b) => Array.from({ length: 18 }, (_, i) => b[RS.T + i] - a[RS.T + i]);
        return { frames: n, dMean: s1[RS.TMEAN] - s0[RS.TMEAN], dt: (s1[RS.TIME] - s0[RS.TIME]) * 365.25 * 24,
          bands: dT(s0, s1), laser: dT(s2, s3), lframes: m, lab };
      });
      ok(hit.lab.lag === 1 && hit.lab.dT > 0, 'at real-time speed a lab asteroid\'s heat shows in the frame after it lands',
        `${hit.lab.lag} frame, +${hit.lab.dT.toFixed(2)} K`);
      const hot = hit.bands.indexOf(Math.max(...hit.bands));
      ok(hit.frames <= 2 && hit.dMean > 5, 'a 1e25 J strike warms Earth by tens of kelvin at once',
        `${hit.frames} frames, +${hit.dMean.toFixed(1)} K, ${hit.dt.toFixed(2)} h of climate time`);
      // 30° S is band 4 of 18 (sin lat = -0.5); half the heat goes there and to its
      // neighbours, half round the globe. Evaporation takes up more and more of it
      // as a sea warms, so ten times the heat is not ten times the warming; the
      // struck band still warms most, and well past its mirror band at 30° N.
      ok(Math.abs(hot - 4) <= 1 && hit.bands[4] > hit.bands[13] + 10, 'the struck band (30° S) warms most',
        `band ${hot}: ${hit.bands.map((v) => v.toFixed(0)).join(' ')}`);
      const lhot = hit.laser.indexOf(Math.max(...hit.laser));
      ok(lhot === 17 && hit.laser.slice(0, 16).every((v) => Math.abs(v) < 1e-6), 'a laser heats only the band under the beam',
        `${hit.lframes} frames; ${hit.laser.map((v) => v.toFixed(1)).join(' ')}`);
      await page.evaluate(() => { document.getElementById('t-sysreset').click(); });
      await page.waitForTimeout(600);

      section('sol: life follows the climate');
      const life = await page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const earth = bodies.find((b) => b.data.key === 'earth');
        const sp = document.getElementById('speed'); sp.value = 0; setSpeed(0); if (!playing) togglePlay();
        focusBody('earth', 'force');
        for (let i = 0; i < 20; i++) await frame();
        const tag = () => (document.querySelector('.navitem[data-key="earth"] .tag.life') || {}).textContent || '';
        const row = () => { const r = [...document.querySelectorAll('#info tr')].find((tr) => /Biosphere|Biosféra/.test(tr.textContent)); return r ? r.textContent : ''; };
        const before = { tag: tag(), owned: RAClimateView.ownsLife(earth) };
        // a 1e28 J strike at real time: the verdict cannot wait a day of wall clock for the next step
        applyStrike(earth, 0.5, 0.5, 1e28, { mKg: 1e20, vKms: 20, matI: 1, dir: new THREE.Vector3(0, 0, 1) });
        let n = 0; while (n < 30 && !/unicellular/.test(tag())) { await frame(); n++; }
        await new Promise((r) => setTimeout(r, 300));
        const after = { frames: n, tag: tag(), row: row(), veg: !!earth._vegKilled, extinct: earth.extinct, level: earth.lifeLevel, cause: earth.lifeCause };
        document.getElementById('t-lang').click();
        await new Promise((r) => setTimeout(r, 300));
        const sk = { tag: tag(), row: row() };
        document.getElementById('t-lang').click();
        await new Promise((r) => setTimeout(r, 300));
        if (playing) togglePlay();
        // 💾 saved (the worker hands the climate over), healed back to the book's
        // Earth, 📂 loaded: the ledger comes back with the save
        const ck = 'ra-climate-clim:' + SYS; localStorage.removeItem(ck);
        const upTo = async (fn, ms) => { const t = performance.now(); while (!fn() && performance.now() - t < ms) await frame(); return fn(); };
        window.__stay = 3; document.getElementById('t-save').click();
        const wrote = await upTo(() => !!localStorage.getItem(ck), 60000);
        const savedLevel = wrote ? (JSON.parse(localStorage.getItem(ck)).worlds.earth || {}).ledger : null;
        impHeal();
        await upTo(() => /intelligent/.test(tag()), 30000);
        const reset = tag();
        document.getElementById('t-load').click();
        await upTo(() => /unicellular/.test(tag()), 60000);
        const loaded = { reset, tag: tag(), stay: window.__stay, extinct: bodies.find((b) => b.data.key === 'earth').extinct,
          wrote, savedLevel: savedLevel ? savedLevel.level : null };
        try { localStorage.removeItem(stateKey()); localStorage.removeItem(ck); } catch (_) {}
        impHeal();
        for (let i = 0; i < 40 && !/intelligent/.test(tag()); i++) await frame();
        const healed = { tag: tag(), veg: !!earth._vegKilled, extinct: earth.extinct };
        return { before, after, sk, loaded, healed };
      });
      ok(life.before.owned && /intelligent/.test(life.before.tag), 'Earth opens intelligent, its life kept by the climate', JSON.stringify(life.before));
      ok(life.after.frames <= 3 && /unicellular/.test(life.after.tag) && life.after.extinct && life.after.veg,
        'a 1e28 J strike at real time: complex life gone within frames, the tag says so and the forests are gone from the map',
        `${life.after.frames} frames, "${life.after.tag}", level ${life.after.level}, ${life.after.cause}`);
      ok(/boiled away/.test(life.after.row) && /just now| ago/.test(life.after.row), 'the panel says what did it and when', JSON.stringify(life.after.row));
      ok(/jednobunkový/.test(life.sk.tag) && /vyvarili/.test(life.sk.row), '...in Slovak too, and the tag survives the switch', JSON.stringify(life.sk));
      ok(/intelligent/.test(life.loaded.reset) && /unicellular/.test(life.loaded.tag) && life.loaded.stay === 3 && life.loaded.extinct,
        'saved, healed and loaded in the page: the extinction comes back with the save', JSON.stringify(life.loaded));
      ok(/intelligent/.test(life.healed.tag) && !life.healed.veg && !life.healed.extinct, '🧽 Heal gives the biosphere back, forests and all', JSON.stringify(life.healed));
      await page.evaluate(() => { document.getElementById('t-sysreset').click(); });
      await page.waitForTimeout(600);

      section('sol: one story of the damage');
      const dmg = await page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const wait = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) await frame(); };
        const earth = bodies.find((b) => b.data.key === 'earth');
        const sp = document.getElementById('speed'); sp.value = 0; setSpeed(0); if (!playing) togglePlay();
        await wait(500);
        const read = () => ({ tier: impTierTxt(earth), stage: impDamageStageTxt(earth), steam: earth.scar ? earth.scar.steamTarget : null,
          melt: earth.scar ? earth.scar.meltTarget : null, cs: RAClimateView.surfaceState(earth), W: impWaterFrac(earth) });
        const until = async (fn, ms) => { const t = performance.now(); while (!fn() && performance.now() - t < ms) await frame(); await frame(); await frame(); };
        applyStrike(earth, 0.5, 0.5, 1e28, { mKg: 1e20, vKms: 20, matI: 1, dir: new THREE.Vector3(0, 0, 1) });
        await until(() => RAClimateView.surfaceState(earth).boiled > 0.5, 5000);
        const boiled = read();
        impHeal(); await wait(800);
        applyStrike(earth, 0.5, 0.5, 1e29, { mKg: 1e21, vKms: 20, matI: 1, dir: new THREE.Vector3(0, 0, 1) });
        await until(() => RAClimateView.surfaceState(earth).magma > 0.5, 5000);
        const molten = read();
        // fast: the magma gives its heat up and crusts over (the climate may run
        // behind so fast a clock; wait for it, not for the clock)
        sp.value = 80; setSpeed(80);
        const t0 = elapsedYears;
        await until(() => RAClimateView.surfaceState(earth).magma === 0, 90000);
        const cooled = read(); cooled.years = Math.round(elapsedYears - t0);
        if (playing) togglePlay(); impHeal(); await wait(500);
        return { boiled, molten, cooled };
      });
      ok(Math.abs(dmg.boiled.W * 5.97e24 / 1.4e21 - 1) < 0.25, 'the lab weighs Earth\'s water as the climate does: about one ocean, not 3 % of the planet',
        `${(dmg.boiled.W * 100).toExponential(1)} % of its mass`);
      ok(/oceans boiling — steam atmosphere \((9\d|100)%\)/.test(dmg.boiled.tier) && /boiled/.test(dmg.boiled.stage) && dmg.boiled.steam === 0 && dmg.boiled.melt === 0,
        '1e28 J: the lab and the hover text both say the oceans boiled, and the climate draws the steam', JSON.stringify(dmg.boiled));
      ok(/magma ocean \(100% molten\)/.test(dmg.molten.tier) && /molten/.test(dmg.molten.stage) && dmg.molten.melt === 1,
        '1e29 J: a global magma ocean, in the lab, the hover text and the lava', JSON.stringify(dmg.molten));
      ok(dmg.cooled.melt === 0 && !/magma|molten/.test(dmg.cooled.tier), '...which cools: as the climate\'s magma drains, the lava and the words go',
        `${dmg.cooled.years} yr: ${JSON.stringify(dmg.cooled)}`);

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
