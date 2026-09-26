// The physics copy's patches are inert when their parameters are unset.
//
//   node tools/patchcheck.mjs
//
// assets/climate/physics/ is altdev2's model with a few changes, each behind a
// parameter (assets/climate/PATCHES.md). This runs the patched model with those
// parameters unset beside the verbatim copy from the commit that brought the
// physics in, over the cases the patches touch -- a settled world, an ocean
// boiled away, a sterile planet, complex life lost, a hot wet runaway -- and
// requires every saved field of every world to agree to the bit. Needs that
// commit in the local history (a shallow clone says "skipping", and a skipped
// check is not a passed one).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '878b8d6';          // "Climate sandbox: every terrestrial world runs the Planet Climate Sandbox model"
// every parameter a patch reads; unset, each must leave altdev2 exactly as it was
const PATCH_PARAMS = ['weatherCapK', 'originWait', 'abiogenesis', 'heatKillsDry', 'heatDeathFastYears',
  'deepRefuge', 'lifeGatesBio', 'iceAlbedo'];

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${msg}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${msg}${extra ? '  ' + extra : ''}`); }
};

let dir;
try {
  execSync(`git -C "${ROOT}" cat-file -e ${BASE}^{commit}`, { stdio: 'ignore' });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'altdev2-'));
  execSync(`git -C "${ROOT}" archive ${BASE} assets/climate | tar -x -C "${dir}"`);
} catch (_) {
  console.log(`skipping: commit ${BASE} is not in the local history (a shallow clone?)`);
  process.exit(0);
}
const load = (tree, rel) => import(pathToFileURL(path.join(tree, 'assets/climate', rel)).href);
const [ours, theirs] = await Promise.all([ROOT, dir].map(async (t) => ({
  clock: await load(t, 'sim/clock.js'), presets: await load(t, 'game/presets.js'),
  snap: await load(t, 'game/snapshot.js'),
})));

// The patched tree's own profiles set the patch parameters; these runs must not.
function params(tree, name, extra = {}, set = null) {
  const p = { ...tree.presets.PRESETS[name].params, ...extra };
  for (const k of PATCH_PARAMS) delete p[k];
  return tree === ours && set ? { ...p, ...set } : p;
}
// One case, run in both trees from the same start, with the same pokes.
function run(name, extra, poke, years, step, set = null) {
  const out = [];
  for (const tree of [ours, theirs]) {
    const s = new tree.clock.Simulation(params(tree, name, extra, set));
    s.runYears(5, 1);
    if (poke) poke(s.world);
    for (let t = 0; t < years; t += step) s.stepOnce(Math.min(step, years - t));
    const c = tree.snap.captureWorld(s.world);
    delete c.params;                  // identical by construction, and holds functions of neither
    out.push(JSON.stringify(c));
  }
  const same = out[0] === out[1];
  let where = '';
  if (!same) {
    const a = JSON.parse(out[0]), b = JSON.parse(out[1]);
    where = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(', ');
  }
  return { same, where };
}

console.log(`\nthe patched physics, parameters unset, against altdev2 as copied in ${BASE}`);
const cases = [
  ['Earth, settled, 1 kyr', 'earth', {}, null, 1e3, 1],
  ['Earth with its ocean boiled into the sky (+400 K), 200 yr', 'earth', {},
    (w) => { for (let i = 0; i < w.T.length; i++) w.T[i] += 400; }, 200, 0.05],
  ['Earth sterilised on a habitable climate, 1 Myr', 'earth', {}, (w) => { w.life = { pro: 0, euk: 0 }; }, 1e6, 2e4],
  ['Earth with its complex life lost, 1 Myr', 'earth', {}, (w) => { w.life.euk = 0; }, 1e6, 2e4],
  ['Earth at 1.3 S+ (hot, wet, weathering hard), 1 Myr', 'earth', { insolation: 1.3 }, null, 1e6, 2e4],
  ['Mars, 1 Myr', 'mars', {}, null, 1e6, 2e4],
];
for (const [label, name, extra, poke, years, step] of cases) {
  if (!ours.presets.PRESETS[name]) { ok(false, label, `no preset ${name}`); continue; }
  const r = run(name, extra, poke, years, step);
  ok(r.same, label, r.same ? 'identical' : `differs in ${r.where}`);
}
// ...and the check can see a patch: set, the patches change these cases
const { STILL } = await import(pathToFileURL(path.join(ROOT, 'assets/climate/profiles.js')).href);
const set = Object.fromEntries(PATCH_PARAMS.filter((k) => k in STILL).map((k) => [k, STILL[k]]));
const seen = [cases[1], cases[2], cases[3]].map(([, name, extra, poke, years, step]) => run(name, extra, poke, years, step, set));
ok(seen.every((r) => !r.same), 'control: with the parameters set as this edition sets them, the same cases differ',
  seen.map((r) => r.where).join(' | '));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
