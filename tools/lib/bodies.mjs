// The orrery's two body tables, loaded under node the way the page loads them
// (classic scripts declaring globals), plus the one derived number every
// climate check needs: how much starlight each body gets on its book orbit.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadSystems() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  // `const` at the top of a classic script is not a property of the global
  // object, so expose the names explicitly after running each file.
  const run = (file, names) => {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(`${src}\n;globalThis.__out = {${names.join(',')}};`, ctx);
    return ctx.__out;
  };
  const ra = run('assets/data.js', ['STAR', 'PLANETS', 'MOONS', 'HORUS', 'HORUS_MOONS']);
  const sol = run('assets/data-sol.js', ['SOL_SYSTEM']).SOL_SYSTEM;
  return {
    ra: { star: ra.STAR, bodies: [ra.STAR, ...ra.PLANETS, ...ra.MOONS, ra.HORUS, ...ra.HORUS_MOONS] },
    sol: { star: sol.STAR, bodies: [sol.STAR, ...sol.PLANETS, ...sol.MOONS] },
  };
}

// Orbit-averaged flux in S⊕ from every luminous body, on the book orbits: a
// body's own orbit about its parent when the parent shines, otherwise its
// parent's orbit about the star (a moon sees the star from where its planet is).
export function bookInsolation(sysName, sys, LUMINOUS) {
  const byKey = new Map(sys.bodies.map((b) => [b.key, b]));
  const avg = (d) => 1 / (d.dist * d.dist * Math.sqrt(1 - Math.min(d.ecc || 0, 0.99) ** 2));
  const out = {};
  for (const b of sys.bodies) {
    if (!b || b.kind === 'star') continue;
    let S = 0, domT = 0, domS = -1;
    for (const [lk, lum] of Object.entries(LUMINOUS)) {
      const src = byKey.get(lk); if (!src) continue;
      let s = 0;
      if (b.key === lk) continue;
      if (b.parent === lk) s = lum.L * avg(b);
      else {
        const par = byKey.get(b.parent);
        if (par && par.parent === lk) s = lum.L * avg(par);
        else if (par && lk === sys.star.key && par.parent && byKey.get(par.parent)?.parent === lk) {
          s = lum.L * avg(byKey.get(par.parent));
        }
      }
      S += s;
      if (s > domS) { domS = s; domT = lum.T; }
    }
    out[b.key] = { S, starTemp: domT };
  }
  return out;
}
