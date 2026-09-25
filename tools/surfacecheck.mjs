// ▣ Surface in a real browser: the view holds a world still while time runs on.
//
//   node tools/surfacecheck.mjs
//
// Needs Playwright with a Chromium (npm i --no-save playwright); without it the
// check prints "skipping", and a skipped check is not a passed one. Serves the
// repo itself on a free port.
//
// Checks: the toolbar has the Surface button and it and the impact lab's stay in
// step; in Surface view the clock, the orbits (and the climate, where there is
// one) keep running while the focused world's spin stops and the camera stays
// on it; an asteroid launched at a world moving on its orbit still lands on the
// spot it was aimed at, and an icy one delivers its water; leaving Surface view
// gives the spin back.
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

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().split('\n')[0]); });
  await page.addInitScript(() => { try { localStorage.setItem('ra-climate-system', 'sol'); localStorage.setItem('ra-system', 'sol'); } catch (_) {} });
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof bodies !== 'undefined' && bodies.some((b) => b.data.key === 'earth'), null, { timeout: 60000 });
  await page.waitForTimeout(4000);

  console.log('\nsol: ▣ Surface');
  const btn = await page.evaluate(() => ({ bar: !!document.getElementById('t-surface'), lab: !!document.getElementById('imp-surface') }));
  ok(btn.bar && btn.lab, 'the main toolbar has the Surface button, beside the impact lab\'s');
  await page.evaluate(() => { focusBody('earth', false); });
  await page.waitForTimeout(2500);                       // the camera arrives
  await page.evaluate(() => { const s = document.getElementById('speed'); s.value = 35; setSpeed(35); if (!playing) togglePlay(); });
  await page.evaluate(() => document.getElementById('t-surface').click());
  const on = await page.evaluate(() => ({ sv: surfaceView, key: surfaceRec && surfaceRec.data.key,
    bar: document.getElementById('t-surface').classList.contains('on'), lab: document.getElementById('imp-surface').classList.contains('on') }));
  ok(on.sv && on.key === 'earth' && on.bar && on.lab, 'the toolbar button turns Surface view on for the focused world, and both buttons show it', JSON.stringify(on));
  // over two seconds: time, orbits and climate run; Earth's spin holds; the camera stays on Earth
  const snap = () => page.evaluate(() => {
    const e = bodies.find((b) => b.data.key === 'earth'), m = bodies.find((b) => b.data.key === 'mars');
    const ep = new THREE.Vector3(), mp = new THREE.Vector3(); e.mesh.getWorldPosition(ep); m.mesh.getWorldPosition(mp);
    return { t: elapsedYears, e: ep.toArray(), m: mp.toArray(), spinE: e.mesh.rotation.y, spinM: m.mesh.rotation.y,
      cam: camera.position.distanceTo(ep), tgt: controls.target.distanceTo(ep),
      clim: window.RAClimate && RAClimate.state('earth') ? RAClimate.state('earth')[RAClimate.RS.TIME] : null };
  });
  const s0 = await snap();
  await page.waitForTimeout(2000);
  const s1 = await snap();
  const moved = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  ok(s1.t > s0.t, 'the clock runs', `${(s1.t - s0.t).toPrecision(3)} yr`);
  ok(moved(s0.e, s1.e) > 0 && moved(s0.m, s1.m) > 0, 'Earth and Mars move on their orbits');
  ok(s1.spinE === s0.spinE && s1.spinM !== s0.spinM, 'Earth\'s spin holds still while other worlds keep turning',
    `Earth Δ${(s1.spinE - s0.spinE).toExponential(1)}, Mars Δ${(s1.spinM - s0.spinM).toExponential(1)}`);
  ok(Math.abs(s1.cam - s0.cam) < 1e-3 * s0.cam && s1.tgt < 1e-3 * s0.cam, 'the camera stays on Earth as it goes round');
  if (s0.clim != null) ok(s1.clim > s0.clim, 'the climate keeps running', `${s0.clim.toPrecision(4)} → ${s1.clim.toPrecision(4)} yr`);
  // an asteroid at the moving Earth lands where it was aimed
  const hit = await page.evaluate(async () => {
    const e = bodies.find((b) => b.data.key === 'earth');
    const before = impScarred.indexOf(e) >= 0 ? (e.scar && e.scar.strikes || 0) : 0;
    const d0 = e.dmgJ || 0;
    launchAsteroid(e, { uv: { x: 0.3, y: 0.55 } });
    const a = impAsteroids[impAsteroids.length - 1];
    let worst = 0;
    // along the flight the rock stays on the line from its (moving) start to the (moving) spot
    for (let i = 0; i < 400 && impAsteroids.includes(a); i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!impAsteroids.includes(a)) break;
      const tgt = uvToWorld(e, a.u, a.v), dist = a.start.distanceTo(tgt);
      const along = a.mesh.position.clone().sub(a.start), dir = tgt.clone().sub(a.start).normalize();
      const off = along.clone().sub(dir.multiplyScalar(along.dot(dir))).length();
      worst = Math.max(worst, off / dist);
    }
    return { landed: !impAsteroids.includes(a), dmg: (e.dmgJ || 0) - d0, worst };
  });
  ok(hit.landed && hit.dmg > 0, 'an asteroid launched at the moving Earth lands on it', `${hit.dmg.toExponential(1)} J`);
  ok(hit.worst < 1e-6, 'and flies straight at its spot the whole way, carried along with Earth', hit.worst.toExponential(1));
  // an icy one brings its water down with it
  const wet = await page.evaluate(async () => {
    const e = bodies.find((b) => b.data.key === 'earth'), w0 = e._impWaterKg || 0, m0 = impMatI;
    impMatI = 0;
    launchAsteroid(e, { uv: { x: 0.6, y: 0.4 } });
    impMatI = m0;
    const a = impAsteroids[impAsteroids.length - 1];
    for (let i = 0; i < 400 && impAsteroids.includes(a); i++) await new Promise((r) => requestAnimationFrame(r));
    return { landed: !impAsteroids.includes(a), kg: (e._impWaterKg || 0) - w0 };
  });
  ok(wet.landed && wet.kg > 0, 'an icy asteroid delivers its water when it lands', `${wet.kg.toExponential(1)} kg`);
  await page.evaluate(() => document.getElementById('imp-surface').click());
  const off = await page.evaluate(() => ({ sv: surfaceView, bar: document.getElementById('t-surface').classList.contains('on') }));
  // a few drawn frames, however long they take
  const r0 = await page.evaluate(() => bodies.find((b) => b.data.key === 'earth').mesh.rotation.y);
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r)); });
  const r1 = await page.evaluate(() => bodies.find((b) => b.data.key === 'earth').mesh.rotation.y);
  ok(!off.sv && !off.bar && r1 !== r0, 'the lab\'s button turns it off, the toolbar shows it, and Earth turns again',
    `${JSON.stringify(off)}, Δspin ${(r1 - r0).toExponential(1)}`);
  await page.evaluate(() => document.getElementById('t-lang').click());
  const sk = await page.evaluate(() => document.getElementById('t-surface').textContent);
  await page.evaluate(() => document.getElementById('t-lang').click());
  ok(/Povrch/.test(sk), 'the button speaks Slovak', sk);
  ok(errors.length === 0, 'nothing throws', errors.slice(0, 3).join(' | '));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
