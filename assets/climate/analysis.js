// Reading a planet's surface map so the climate can repaint it.
//
// The orrery's worlds are photographs and painted maps, not the climate
// sandbox's procedural terrain, and the point of the sandbox is that they stay
// themselves until something happens to them. So the climate is drawn as a
// *difference* from the map: where the sea has risen past today's coast, where
// the ice has grown beyond (or retreated inside) what the map shows, where the
// forest has withered. That needs four fields the map does not carry, and this
// derives them once per world:
//
//   R  height, with today's coastline at exactly 0.5 -- sea below, land above --
//      so a sea-level threshold of 0.5 reproduces the map and moving it floods
//      the lowlands first or drains the shallows first
//   G  how much of the pixel is vegetation, in the colour family the world's
//      biosphere paints (green, or Satis's violet)
//   B  how much of it is ice or snow the artist painted
//   A  a fixed noise field, for floe edges and cloud decks
//
// Where a real topography exists (Earth, Mars) it replaces the guessed height.
// Everywhere else the height is a distance from the coast plus noise: lowlands
// near the sea, highlands far inland, shallows near the shore. The CDF of the
// height over area is returned too, which is what turns "sixty per cent of the
// planet is flooded" into a threshold on that field.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function hash(i, j, k, seed) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, c2) => hash(xi + a, yi + b, zi + c2, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm(x, y, z, seed, oct, base) {
  let s = 0, a = 0.5, f = base, n = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f, y * f, z * f, seed + o * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// Box blur, wrapping in longitude and clamping at the poles; three passes of it
// is close enough to a Gaussian for a field nobody sees directly.
function blur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(src);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += out[row + ((k % W) + W) % W];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc / (2 * r + 1);
        acc += out[row + (x + r + 1) % W] - out[row + ((x - r) % W + W) % W];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = acc / (2 * r + 1);
        acc += tmp[clamp(y + r + 1, 0, H - 1) * W + x] - tmp[clamp(y - r, 0, H - 1) * W + x];
      }
    }
  }
  return out;
}

function hexToRgb(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#') return null;
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// `rgba`: the map, W*H*4 bytes. `dem`: optional W*H*4 bytes of a grey height map
// aligned with it. `hints`: { srcOcean, oceanRef, landRef, veg, seed }.
export function analyseSurface(W, H, rgba, dem, hints = {}) {
  const N = W * H;
  const seed = hints.seed | 0;
  const srcOcean = clamp(hints.srcOcean ?? 0, 0, 1);
  const oRef = hexToRgb(hints.oceanRef), lRef = hexToRgb(hints.landRef);
  const veg = new Float32Array(N), ice = new Float32Array(N), score = new Float32Array(N);
  const areaW = new Float32Array(H);
  for (let y = 0; y < H; y++) areaW[y] = Math.cos(((y + 0.5) / H - 0.5) * Math.PI);
  for (let i = 0; i < N; i++) {
    const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = (mx - mn) / (mx + 1e-4);
    ice[i] = smooth(0.60, 0.84, lum) * (1 - smooth(0.10, 0.30, sat));
    if (hints.veg === 'purple') veg[i] = clamp((Math.min(r, b) - g * 1.10) * 5, 0, 1) * smooth(0.18, 0.30, (r + b) / 2);
    else if (hints.veg === 'green') veg[i] = clamp((g - Math.max(r, b) * 1.02) * 7, 0, 1) * smooth(0.10, 0.18, g);
    if (oRef && lRef) {
      const dO = (r - oRef[0]) ** 2 + (g - oRef[1]) ** 2 + (b - oRef[2]) ** 2;
      const dL = (r - lRef[0]) ** 2 + (g - lRef[1]) ** 2 + (b - lRef[2]) ** 2;
      score[i] = dL - dO;
    } else {
      score[i] = (b - Math.max(r, g)) - 0.3 * lum;
    }
  }

  // Today's sea, as a mask: 1 sea, 0 land.
  const sea = new Float32Array(N);
  let heightRaw = null;
  if (dem) {
    heightRaw = new Float32Array(N);
    for (let i = 0; i < N; i++) heightRaw[i] = dem[i * 4] / 255;
  }
  // A coarse noise, for flood order where there is no topography.
  const nLow = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = ((y + 0.5) / H - 0.5) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5) / W * 2 * Math.PI;
      nLow[y * W + x] = fbm(cl * Math.cos(lon), sl, cl * Math.sin(lon), seed, 4, 2.2);
    }
  }
  if (srcOcean >= 0.98) {
    sea.fill(1);
  } else if (srcOcean > 0.003 && hints.frozen) {
    // The world's water starts frozen, so the map shows it as ice, not as sea:
    // today's "sea" is the painted ice first (Mars's caps), then the lowest
    // ground. Flooding later starts from the lowest ground, as it should.
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(i);
    const low = heightRaw ? (i) => heightRaw[i] : (i) => nLow[i];
    idx.sort((a, b) => (ice[b] - ice[a]) * 10 - (low(b) - low(a)));
    let tot = 0;
    for (let y = 0; y < H; y++) tot += areaW[y] * W;
    let acc = 0;
    for (const i of idx) {
      if (acc >= srcOcean * tot) break;
      sea[i] = 1; acc += areaW[(i / W) | 0];
    }
  } else if (srcOcean > 0.003) {
    // Rank by how sea-like each pixel is (by height where a real topography
    // exists), and call the most sea-like `srcOcean` of the AREA sea. Painted
    // ice is left out of the colour ranking and decided by its neighbours: a
    // polar cap over an ocean should melt into sea, not into a continent.
    const idx = [];
    for (let i = 0; i < N; i++) if (heightRaw || ice[i] < 0.5) idx.push(i);
    const key = heightRaw ? (i) => -heightRaw[i] : (i) => score[i];
    idx.sort((a, b) => key(b) - key(a));
    let tot = 0;
    for (const i of idx) tot += areaW[(i / W) | 0];
    let acc = 0;
    const known = new Float32Array(N);
    for (const i of idx) {
      const a = areaW[(i / W) | 0];
      if (acc < srcOcean * tot) { sea[i] = 1; acc += a; }
      known[i] = 1;
    }
    if (!heightRaw) {
      const num = blur(sea, W, H, Math.max(2, W >> 6)), den = blur(known, W, H, Math.max(2, W >> 6));
      for (let i = 0; i < N; i++) if (!known[i]) sea[i] = den[i] > 1e-6 && num[i] / den[i] > 0.5 ? 1 : 0;
    } else if (oRef && lRef) {
      // A topography and a photograph never agree to the pixel at a coast. Where
      // the photograph plainly shows water, it is water: otherwise a snowball
      // leaves a thread of blue sea along every shore that the height map
      // called land.
      for (let i = 0; i < N; i++) if (!sea[i] && ice[i] < 0.5 && score[i] > 0.02) sea[i] = 1;
    }
  }

  const h = new Float32Array(N);
  const nA = new Uint8Array(N);
  const b = blur(sea, W, H, Math.max(2, Math.round(W / 40)));
  for (let y = 0; y < H; y++) {
    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const lon = (x + 0.5) / W * 2 * Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const n1 = nLow[i];
      nA[i] = Math.round(clamp(fbm(px, py, pz, seed + 101, 4, 5.0), 0, 1) * 255);
      if (heightRaw) {
        // Monotonic in the real height, so the flood order is the planet's own.
        h[i] = heightRaw[i];
      } else if (srcOcean > 0.003) {
        if (sea[i] > 0.5) {
          const d = clamp((b[i] - 0.5) * 2, 0, 1);
          h[i] = 0.48 - 0.46 * (0.72 * d + 0.28 * n1);
        } else {
          const e = clamp((0.5 - b[i]) * 2, 0, 1);
          h[i] = 0.52 + 0.46 * (0.72 * e + 0.28 * n1);
        }
      } else {
        h[i] = 0.52 + 0.46 * clamp((n1 - 0.25) / 0.5, 0, 1);
      }
    }
  }
  if (heightRaw) {
    // Today's sea below 0.5 and today's land above it, each ordered by the real
    // height, so a rising sea drowns the lowest land first and a falling one
    // bares the shallowest sea first -- whatever decided which pixels are sea
    // (the photograph's water, or a frozen world's painted ice).
    let sLo = Infinity, sHi = -Infinity, lLo = Infinity, lHi = -Infinity;
    for (let i = 0; i < N; i++) {
      const v = heightRaw[i];
      if (sea[i] > 0.5) { if (v < sLo) sLo = v; if (v > sHi) sHi = v; }
      else { if (v < lLo) lLo = v; if (v > lHi) lHi = v; }
    }
    for (let i = 0; i < N; i++) {
      const v = heightRaw[i];
      h[i] = sea[i] > 0.5
        ? 0.48 - 0.46 * clamp((sHi - v) / Math.max(sHi - sLo, 1e-3), 0, 1)
        : 0.52 + 0.46 * clamp((v - lLo) / Math.max(lHi - lLo, 1e-3), 0, 1);
    }
  }

  // Area-weighted CDF over 256 bins of height.
  const hist = new Float64Array(256);
  let total = 0;
  // Written bottom row first: a DataTexture is not flipped on upload the way
  // an image is, so row 0 of the texture is the SOUTH pole (v = 0) while row 0
  // of the map is the north. Getting this backwards mirrors every sea, cap
  // and forest pole to pole -- invisible on an untouched world, where nothing
  // is drawn, and wrong the moment anything changes.
  const bytes = new Uint8Array(N * 4);
  const hbAt = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const a = areaW[y];
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = ((H - 1 - y) * W + x) * 4;
      const hb = clamp(Math.round(h[i] * 255), 0, 255);
      hist[hb] += a; total += a;
      hbAt[i] = hb;
      bytes[o] = hb;
      bytes[o + 1] = Math.round(clamp(veg[i], 0, 1) * 255);
      bytes[o + 2] = Math.round(clamp(ice[i], 0, 1) * 255);
      bytes[o + 3] = nA[i];
    }
  }
  const cdf = new Float32Array(257);
  let acc = 0;
  for (let k = 0; k < 256; k++) { cdf[k] = acc / total; acc += hist[k]; }
  cdf[256] = 1;
  // Area below the coast, measured on the quantised field the shader will see.
  const s0 = cdf[128];
  // The colours the renderer falls back on where the map has nothing to say:
  // the average land (for ground under melted ice) and the average sea.
  let lr = 0, lg = 0, lb = 0, ln = 0, or = 0, og = 0, ob = 0, on = 0;
  for (let i = 0; i < N; i += 7) {
    if (ice[i] > 0.3) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], bl = rgba[i * 4 + 2];
    if (hbAt[i] >= 128) { lr += r; lg += g; lb += bl; ln++; } else { or += r; og += g; ob += bl; on++; }
  }
  const landAvg = ln ? [lr / ln / 255, lg / ln / 255, lb / ln / 255] : [0.42, 0.36, 0.30];
  const seaAvg = on ? [or / on / 255, og / on / 255, ob / on / 255] : [0.05, 0.16, 0.34];
  return { W, H, bytes, cdf, s0, landAvg, seaAvg };
}

// The cloud deck's texture: three noise fields on the sphere, each flattened to
// a uniform distribution so that "cover the planet 60%" in the shader really
// covers 60% of it. R is the weather (warped, mid-scale), G the fine churn, B
// the large systems that the other two ride on.
export const CLOUD_W = 512, CLOUD_H = 256;
function equalise(v) {
  const n = v.length, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => v[a] - v[b]);
  const out = new Uint8Array(n);
  for (let r = 0; r < n; r++) out[idx[r]] = Math.round(r / (n - 1) * 255);
  return out;
}
export function cloudField(seed) {
  const W = CLOUD_W, H = CLOUD_H, N = W * H;
  const a = new Float32Array(N), b = new Float32Array(N), c = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5) / W * 2 * Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const i = y * W + x;
      const big = fbm(px, py, pz, seed + 301, 3, 1.6);
      const wx = fbm(px, py, pz, seed + 401, 2, 3.0) - 0.5, wz = fbm(pz, px, py, seed + 402, 2, 3.0) - 0.5;
      a[i] = fbm(px + 0.45 * wx, py * 1.35, pz + 0.45 * wz, seed + 201, 5, 4.2);
      b[i] = fbm(px, py * 1.2, pz, seed + 501, 4, 11.0);
      c[i] = big;
    }
  }
  const ea = equalise(a), eb = equalise(b), ec = equalise(c);
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { out[i * 4] = ea[i]; out[i * 4 + 1] = eb[i]; out[i * 4 + 2] = ec[i]; out[i * 4 + 3] = 255; }
  return out;
}

// The height below which this share of the planet's area lies.
//
// Where the share falls inside a run of empty bins -- and today's sea always
// does, because the analysis leaves a gap between the deepest land and the
// shallowest sea -- every threshold in the run floods the same pixels, so the
// middle of it is returned: that keeps the coast as far as possible from both
// sides once the texture is filtered.
export function heightForShare(cdf, share) {
  const q = clamp(share, 0, 1);
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  const eps = 1e-6;
  let t0 = 0;
  while (t0 < 256 && cdf[t0] < q - eps) t0++;
  let t1 = 256;
  while (t1 > 0 && cdf[t1] > q + eps) t1--;
  if (t1 >= t0) return (t0 + t1) / 2 / 255;
  const k = t1;                                    // cdf[k] < q < cdf[k + 1]
  const f = (q - cdf[k]) / Math.max(cdf[k + 1] - cdf[k], 1e-12);
  return (k + f) / 255;
}
