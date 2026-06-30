/* ============================================================
   gen-refs.mjs — build the gpt-image-2 inputs for every body:
     - tools/_raw/ref/<key>.png   : the procedural texture as an edit reference
     - tools/prompts.json         : { key, name, kind, prompt } for each body

   No external deps: data.js is loaded with node:vm, PNGs are encoded with
   node:zlib. Run:  node tools/gen-refs.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { textureForBody, STAR_PALETTE } from './texture-core.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');
const REFDIR = join(__dir, '_raw', 'ref');
mkdirSync(REFDIR, { recursive: true });

/* ---- load data.js (bare browser globals) into a sandbox ---- */
function loadData(){
  const src = readFileSync(join(ROOT, 'assets', 'data.js'), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.__exp={STAR,PLANETS,MOONS,HORUS,HORUS_MOONS};', ctx);
  return ctx.__exp;
}

/* ---- every body, in catalogue order ---- */
function allBodies(){
  const { STAR, PLANETS, MOONS, HORUS, HORUS_MOONS } = loadData();
  const list = [STAR];
  for(const p of PLANETS){ list.push(p); for(const m of MOONS.filter(x=>x.parent===p.key)) list.push(m); }
  list.push(HORUS);
  for(const m of HORUS_MOONS) list.push(m);
  return list;
}

/* ---- minimal RGBA -> PNG (filter 0 scanlines, zlib deflate) ---- */
const CRC = (()=>{ const t=new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; t[n]=c>>>0; }
  return (buf)=>{ let c=0xffffffff; for(let i=0;i<buf.length;i++) c=t[(c^buf[i])&255]^(c>>>8); return (c^0xffffffff)>>>0; };
})();
function chunk(type, data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t=Buffer.from(type,'ascii');
  const crc=Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function encodePNG({width,height,data}){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;   // 8-bit RGBA
  const raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++){
    raw[y*(1+width*4)]=0;
    Buffer.from(data.buffer, y*width*4, width*4).copy(raw, y*(1+width*4)+1);
  }
  const idat=zlib.deflateSync(raw,{level:9});
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}

/* ---- prompt construction ---- */
const KIND_LINE = {
  star:       "the glowing photosphere of a warm yellow-white F-type star: fine convective granulation and subtle brighter/darker mottling. No planet, no limb, no corona — just the surface filling the frame.",
  gasgiant:   "a banded gas giant: smooth horizontal cloud belts and zones running straight across, turbulent swirls and oval storms, soft wind shear between bands.",
  browndwarf: "a dim brown dwarf: deep red banded atmosphere with faint glowing cloud layers and slow turbulent storms.",
  rocky:      "a rocky terrestrial world: cratered, weathered terrain, dry highlands and basins, dusty mineral surface with fine geological detail.",
  lava:       "a molten volcanic world: dark cracked basaltic crust threaded with networks of glowing orange lava in the fractures and low basins.",
  ocean:      "a living ocean world: liquid seas with continents and coastlines, with thin wispy cloud cover.",
  terran:     "an Earth-like world: oceans, continents and coastlines, vegetated land, thin wispy weather clouds, faint polar caps.",
  iceworld:   "a frozen ice world: cracked icy crust, frost plains, subtle bluish and tan tinting, fracture lineae.",
  icemoon:    "an icy moon: bright cracked ice shell, frost, fine fracture lineae and subtle mineral staining."
};

function colorsOf(d){
  if(d.kind==='star') return STAR_PALETTE.join(', ');
  if(d.terran){ const t=d.terran; return [t.ocean,t.ocean2,t.land,t.land2,t.cloud].filter(Boolean).join(', '); }
  if(d.rocky){ const r=d.rocky; return [r.b,r.base,r.a,r.c].filter(Boolean).join(', '); }
  if(d.palette) return d.palette.join(', ');
  return '';
}
function trim(s,n){ if(!s) return ''; s=String(s).replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1).trim()+'…':s; }

const HEADER = [
  "Equirectangular planetary surface texture MAP (albedo / colour map) for wrapping onto a 3D sphere.",
  "Strict requirements: 2:1 aspect ratio; the LEFT and RIGHT edges must tile seamlessly (continuous, no visible seam); content near the top and bottom edges is compressed toward the poles.",
  "This is a FLAT UNWRAPPED MAP ONLY — do NOT draw a globe or a sphere, no planet floating in space, no black background, no stars, no outer-space, no lighting, no day/night terminator, no drop shadows, no text or labels, no border. Fill the entire frame with surface."
];
/* per-body prompt overrides (the generic template gets the subject wrong) */
const PROMPT_OVERRIDE = {
  uatur: [
    ...HEADER,
    "Subject: Uat-Ur — a GLOBAL OCEAN world with ABSOLUTELY NO LAND: no continents, no islands, no coastlines, no rock or beaches — 100% open deep-blue water from edge to edge.",
    "The ONLY non-water features are bright pale blue-white polar ICE CAPS along the top and bottom edges.",
    "Scattered SPARSELY across the dark ocean, and faintly frosting the inner edges of the ice caps, are delicate blooms of BIOLUMINESCENT VIOLET / PURPLE phytoplankton — soft glowing magenta-violet wisps and swirls. Keep them SUBTLE and uncommon: the great majority of the map is deep blue ocean; the purple is a faint luminous accent, not dominant, not covering everything.",
    "Dominant colours (hex): #0e3a72 and #2f73bd for the deep ocean, #dfeefa for the ice caps, with sparse #8a3fb0 / #b86fd0 bioluminescent purple.",
    "Photoreal, crisp, high-resolution. No land anywhere — water and ice only."
  ].join('\n'),
  anubis: [
    ...HEADER,
    "Subject: Anubis — a lifeless, ABIOTIC 'blue marble' OCEAN world with ABSOLUTELY NO LAND: no continents, no islands, no coastlines, no rock — 100% open blue water from edge to edge.",
    "The ONLY non-water features are bright pale polar ICE CAPS along the top and bottom edges, plus thin hazy white weather clouds drifting over the water.",
    "This world has liquid-water oceans and free oxygen but ZERO life: NO vegetation, NO green, NO algae, NO bioluminescence — just clean, sterile, slightly hazy blue ocean.",
    "Dominant colours (hex): #2a5a7a and #4f86ad for the ocean, #dfeaf0 for the ice caps and clouds. No land, no green, no purple.",
    "Photoreal, crisp, high-resolution — water and ice only."
  ].join('\n')
};

function buildPrompt(d){
  if(PROMPT_OVERRIDE[d.key]) return PROMPT_OVERRIDE[d.key];
  const kindLine = KIND_LINE[d.kind] || KIND_LINE[d.terran?'terran':d.rocky?'rocky':'gasgiant'];
  const colors = colorsOf(d);
  const flavor = trim(d.desc, 360);
  return [
    "Equirectangular planetary surface texture MAP (albedo / colour map) for wrapping onto a 3D sphere.",
    "Strict requirements: 2:1 aspect ratio; the LEFT and RIGHT edges must tile seamlessly (continuous, no visible seam); content near the top and bottom edges is compressed toward the poles.",
    "This is a FLAT UNWRAPPED MAP ONLY — do NOT draw a globe or a sphere, no planet floating in space, no black background, no stars, no outer-space, no lighting, no day/night terminator, no drop shadows, no text or labels, no border. Fill the entire frame with surface.",
    `Subject: ${d.name} — ${kindLine}`,
    colors ? `Dominant colour palette (hex): ${colors}. Stay faithful to these colours.` : '',
    flavor ? `Character to evoke: ${flavor}` : '',
    "Use the provided reference image as the layout: keep the same overall arrangement of features, bands and landmasses, but render them photoreal, crisp and high-resolution."
  ].filter(Boolean).join('\n');
}

/* ---- run ---- */
const bodies = allBodies();
const prompts = [];
for(const d of bodies){
  const buf = textureForBody(d);
  writeFileSync(join(REFDIR, `${d.key}.png`), encodePNG(buf));
  prompts.push({ key:d.key, name:d.name, kind:d.kind, prompt:buildPrompt(d) });
  console.log(`ref  ${d.key.padEnd(10)} ${d.name}`);
}
writeFileSync(join(__dir, 'prompts.json'), JSON.stringify(prompts, null, 2));
console.log(`\n${bodies.length} references -> tools/_raw/ref/   prompts -> tools/prompts.json`);
