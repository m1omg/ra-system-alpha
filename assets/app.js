/* ============================================================
   The Ra System — interactive 3D simulation engine
   Pure Three.js (r132 UMD). Procedural textures, Keplerian
   orbits, click-to-focus, info panels. Works from file://.
   ============================================================ */
'use strict';

/* show fatal errors on screen instead of failing silently */
window.addEventListener('error', e=>{
  let b=document.getElementById('errbar');
  if(!b){ b=document.createElement('div'); b.id='errbar';
    b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:999;background:#3a0c0c;color:#ffd0d0;'+
      'font:13px monospace;padding:10px 14px;border-top:1px solid #ff6a6a;white-space:pre-wrap';
    document.body.appendChild(b); }
  b.textContent='⚠ '+(e.message||e.error)+ (e.filename?('  ['+e.filename.split('/').pop()+':'+e.lineno+']'):'');
});

/* ---------- scaling: two modes ----------
   COMPRESSED — non-linear, the whole system visible at once.
   REAL       — orbital distances exactly proportional to AU (true architecture).
   Body sizes stay exaggerated in both modes (true sizes would be invisible dots);
   in real mode they're scaled down so close-in worlds don't swamp their orbit.    */
const DIST_K = 80, DIST_P = 0.58;        // compressed: orbit radius = DIST_K * AU^0.58
const AU_UNIT = 110;                      // real: scene units per AU (linear)
const SIZE_K = 0.0586, SIZE_P = 0.40;     // body radius = SIZE_K * km^0.40 (shared base)
const STAR_R_COMPRESS = 7.6, STAR_R_REAL = 1.9;
const YEARS_PER_SEC = 0.030;              // sim years per real second when timeScale = 1
// Speed slider (0..100) maps logarithmically to a real time-RATE (sim time advanced per real
// second): the low end is true real-time (1 s = 1 s), the high end ≈ 2 years/second.
const SEC_PER_YEAR  = 31557600;           // 365.25 days
const RATE_MIN_YPS  = 1/SEC_PER_YEAR;     // slider min = real-time (1 sim-second per real-second)
const RATE_MAX_YPS  = 2.0;                // slider max ≈ 2 years / second
const DEFAULT_RATE_YPS = RATE_MIN_YPS;    // default = true real-time (1 s/s; planets ~frozen)
const rateToSlider = (yps)=> 100*Math.log(yps/RATE_MIN_YPS)/Math.log(RATE_MAX_YPS/RATE_MIN_YPS);
const DEFAULT_SPEED_V = rateToSlider(DEFAULT_RATE_YPS);
const DEFAULT_SIZE_V  = 100;             // Size slider value for the default body size (sizeMult = 1.0)
const SPIN_GAIN = 20;                     // rotation now scales with the time rate; this keeps the
                                          // default speed's spin ≈ the old look (0.02 timeScale × 20 = 0.4)

let realScale = true;                     // default to REAL scale (per request)

function distDisp(au){ return realScale ? au*AU_UNIT : DIST_K*Math.pow(au, DIST_P); }
function sizeDisp(km){ return Math.max(0.55, SIZE_K*Math.pow(km, SIZE_P)); }
function starVisR(){ return realScale ? STAR_R_REAL : STAR_R_COMPRESS; }
function bodyF(){ return realScale ? 0.5 : 1.0; }   // body-size factor for current mode
// Real-scale mode: bodies render at TRUE size, but never smaller than ~MIN_PIXELS on screen
// (a visible dot when far; real geometry takes over once you zoom close — see updateBodySizes).
const KM_PER_AU = 1.495978707e8;          // km per astronomical unit
const MIN_PIXELS = 3;                      // smallest on-screen body radius (px) in real mode
function realRadiusScene(km){ return (km||1)/KM_PER_AU*AU_UNIT; }   // true radius in real-mode scene units
// --- free-roam flight: real km <-> scene units, speed of light, throttle range (FTL) ---
const KM_PER_UNIT = KM_PER_AU/AU_UNIT;     // real km per scene unit (≈ 1.36e6)
const C_KMS = 299792.458;                  // speed of light, km/s
const kmsToUnits = kms => kms/KM_PER_UNIT; // km/s -> scene units/s
// Space-Engine-style CONTEXT-RELATIVE speed: full throttle scales with the distance to the
// nearest body, so one slider flies well everywhere — gentle beside a planet, fast (FTL) in
// deep space. The readout still shows real km/s (and flips to fractions of c past 30,000 km/s).
const REACH_RATE   = 1.0;                  // full throttle crosses ~1× the nearest-body gap / sec
const FLY_FLOOR_KMS = 2;                   // never totally stuck at a surface
const FLY_CAP_KMS   = 5000*C_KMS;          // absolute speed ceiling (deep-space FTL cruise, AUTO mode)
const FLY_KEY_FLOOR = 0.02;                // pressing a move key always gives ≥2% of full throttle
// MANUAL speed mode (auto-scale off): slider maps to an absolute km/s over a huge, uncapped range
const FLY_MANUAL_MIN = 1;                  // km/s at the low end of the slider
const FLY_MANUAL_MAX = 100000*C_KMS;       // effectively unlimited — user's choice is not capped

/* ============================================================
   Seeded value-noise / fbm for procedural planet textures
   ============================================================ */
function makeNoise3(seed){
  const perm = new Uint8Array(512);
  const tmp = []; for(let i=0;i<256;i++) tmp[i]=i;
  let s = (seed>>>0)||1;
  const rnd = ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  for(let i=255;i>0;i--){ const j=(rnd()*(i+1))|0; const t=tmp[i]; tmp[i]=tmp[j]; tmp[j]=t; }
  for(let i=0;i<512;i++) perm[i]=tmp[i&255];
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  const lerp=(a,b,t)=>a+(b-a)*t;
  const val=(x,y,z)=>(perm[(perm[(perm[x&255]+(y&255))&255]+(z&255))&255]/255)*2-1;
  function n3(x,y,z){
    const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
    const xf=x-xi,yf=y-yi,zf=z-zi;
    const u=fade(xf),v=fade(yf),w=fade(zf);
    const c000=val(xi,yi,zi),c100=val(xi+1,yi,zi),c010=val(xi,yi+1,zi),c110=val(xi+1,yi+1,zi);
    const c001=val(xi,yi,zi+1),c101=val(xi+1,yi,zi+1),c011=val(xi,yi+1,zi+1),c111=val(xi+1,yi+1,zi+1);
    return lerp( lerp(lerp(c000,c100,u),lerp(c010,c110,u),v),
                 lerp(lerp(c001,c101,u),lerp(c011,c111,u),v), w);
  }
  return function fbm(x,y,z,oct){
    oct=oct||5; let amp=1,freq=1,sum=0,norm=0;
    for(let i=0;i<oct;i++){ sum+=amp*n3(x*freq,y*freq,z*freq); norm+=amp; amp*=0.5; freq*=2; }
    return sum/norm;
  };
}
/* Seamless longitude sampling: wrap longitude onto a circle in noise space so
   there is no visible seam at the 0°/360° meridian. ang = u*2π, v = latitude 0..1.
   `lon` ~ number of features around the equator; `lat` ~ features pole-to-pole. */
function ring(fbm, ang, v, lon, lat, oct, ph){
  const r = lon/(Math.PI*2);
  return fbm(Math.cos(ang)*r, Math.sin(ang)*r, v*lat + (ph||0), oct);
}

/* color helpers */
function hex2rgb(h){ if(typeof h==='number'){return [(h>>16)&255,(h>>8)&255,h&255];}
  h=h.replace('#',''); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function ramp(stops,t){ // stops = array of rgb
  t=Math.max(0,Math.min(0.99999,t)); const f=t*(stops.length-1); const i=Math.floor(f);
  return mix(stops[i], stops[Math.min(i+1,stops.length-1)], f-i);
}
function clamp01(x){return x<0?0:x>1?1:x;}
function smooth(e0,e1,x){ const t=clamp01((x-e0)/(e1-e0)); return t*t*(3-2*t); }

// procedural body textures: on touch devices halve the resolution — this is the
// biggest synchronous cost at load (multi-octave noise per body), and a real/baked
// map swaps in over it anyway, so the placeholder can be lighter on phones/tablets
const _COARSE = !!(typeof window!=='undefined' && window.matchMedia && matchMedia('(pointer: coarse)').matches);
const TXW=_COARSE?512:1024, TXH=_COARSE?256:512;
function newCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

/* ---- gas giant / brown dwarf bands (seamless) ---- */
function texGas(palette, seed, opts){
  opts=opts||{};
  const w=TXW,h=TXH, c=newCanvas(w,h), ctx=c.getContext('2d');
  const img=ctx.createImageData(w,h), d=img.data;
  const fbm=makeNoise3(seed);
  const stops=palette.map(hex2rgb);
  const turb=opts.turb!=null?opts.turb:0.05;
  const streak=opts.streak!=null?opts.streak:0.16;
  for(let y=0;y<h;y++){
    const v=y/h;
    const pole = 1 - 0.32*Math.pow(Math.abs(v-0.5)*2, 3);
    for(let x=0;x<w;x++){
      const u=x/w, ang=u*Math.PI*2;
      // wavy latitude warp + a touch of swirl
      const warp = turb*ring(fbm, ang, v, 5, 7, 4, 0);
      let t = v + warp;
      let col = ramp(stops, t*0.999);
      // fine horizontal streaks (many features around, fine in latitude)
      const sN = ring(fbm, ang, v, 14, 48, 5, 30);
      const b = 1 + streak*sN;
      const o=(y*w+x)*4;
      d[o]  = clamp01(col[0]*b*pole/255)*255;
      d[o+1]= clamp01(col[1]*b*pole/255)*255;
      d[o+2]= clamp01(col[2]*b*pole/255)*255;
      d[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return c;
}

/* ---- rocky / lava / icy mottled (seamless, height-ramp shading) ---- */
function texRocky(p, seed, opts){
  opts=opts||{};
  const w=opts.w||TXW,h=opts.h||TXH,c=newCanvas(w,h),ctx=c.getContext('2d');
  const img=ctx.createImageData(w,h),d=img.data;
  const fbm=makeNoise3(seed);
  // height ramp: dark lowlands -> base -> mid -> bright highlands
  const stops=[hex2rgb(p.b), hex2rgb(p.base), hex2rgb(p.a), hex2rgb(p.c)];
  const glow = opts.glow ? hex2rgb(opts.glow) : null;
  const emiss = opts.emissData;
  let ec=null,ed=null;
  if(emiss){ ec=newCanvas(w,h); ed=ec.getContext('2d').createImageData(w,h); }
  for(let y=0;y<h;y++){
    const v=y/h, lat=Math.abs(v-0.5)*2;
    for(let x=0;x<w;x++){
      const u=x/w, ang=u*Math.PI*2;
      const n  = ring(fbm, ang, v, 6, 6, 6, 0);          // elevation -1..1
      const n2 = ring(fbm, ang, v, 18, 18, 5, 40);       // fine detail
      let t = clamp01(n*0.5 + 0.5 + n2*0.10);
      let col = ramp(stops, t);
      // neutral mottle (darken AND lighten — no constant brightening)
      const m = 1 + 0.14*n2;
      col = [col[0]*m, col[1]*m, col[2]*m];
      let g=0;
      if(glow){
        // glowing lava in low / fractured areas
        g = clamp01( smooth(-0.05,-0.6,n)*0.8 + Math.pow(clamp01(0.4-Math.abs(n2*0.9)),1.4)*1.8 );
        col = mix(col, glow, g*0.92);
      }
      if(opts.ice){
        const ic = smooth(0.66,0.92, lat);
        col = mix(col, [224,234,244], ic*0.8);
      }
      const o=(y*w+x)*4;
      d[o]=clamp01(col[0]/255)*255; d[o+1]=clamp01(col[1]/255)*255; d[o+2]=clamp01(col[2]/255)*255; d[o+3]=255;
      if(emiss){ ed.data[o]=glow?glow[0]*g:0; ed.data[o+1]=glow?glow[1]*g:0; ed.data[o+2]=glow?glow[2]*g:0; ed.data[o+3]=255; }
    }
  }
  ctx.putImageData(img,0,0);
  if(emiss){ ec.getContext('2d').putImageData(ed,0,0); return {map:c,emap:ec}; }
  return c;
}

/* ---- terran: ocean + land + wispy clouds + gentle ice caps (seamless) ---- */
function texTerran(t, seed){
  const w=TXW,h=TXH,c=newCanvas(w,h),ctx=c.getContext('2d');
  const img=ctx.createImageData(w,h),d=img.data;
  const fbm=makeNoise3(seed);
  const ocean=hex2rgb(t.ocean), ocean2=hex2rgb(t.ocean2||t.ocean);
  const land=hex2rgb(t.land), land2=hex2rgb(t.land2||t.land);
  const cloudC=hex2rgb(t.cloud||"#ffffff");
  const sea = 0.5 - (t.landAmt!=null?t.landAmt:0.3);
  for(let y=0;y<h;y++){
    const v=y/h, lat=Math.abs(v-0.5)*2;
    for(let x=0;x<w;x++){
      const u=x/w, ang=u*Math.PI*2;
      const e = ring(fbm,ang,v,6,5,6,0)*0.5 + ring(fbm,ang,v,15,13,4,50)*0.18; // elevation
      let col;
      if(e > sea){
        const hh = smooth(sea, sea+0.45, e);
        const veg = ring(fbm,ang,v,22,20,3,90)*0.5+0.5;
        col = mix(land, land2, clamp01(hh*0.55 + veg*0.45));
      }else{
        const depth = smooth(sea, sea-0.55, e);
        col = mix(ocean2, ocean, depth);
      }
      if(t.ice){
        const ic = smooth(0.72,0.96,lat) + (e>sea?smooth(0.6,0.92,lat):0);
        col = mix(col,[228,238,248], clamp01(ic)*0.85);
      }
      // wispy clouds: two octaves of high-freq, soft threshold, thinner near poles
      const cl  = ring(fbm,ang,v,10,8,5,200)*0.5+0.5;
      const cl2 = ring(fbm,ang,v,20,16,4,260)*0.5+0.5;
      let cover = smooth(0.50,0.80, cl*0.62 + cl2*0.38);
      cover *= 1 - 0.55*smooth(0.7,1.0,lat);
      col = mix(col, cloudC, clamp01(cover)*0.7);
      const o=(y*w+x)*4;
      d[o]=clamp01(col[0]/255)*255; d[o+1]=clamp01(col[1]/255)*255; d[o+2]=clamp01(col[2]/255)*255; d[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return c;
}

/* ---- star surface: warm granulation (seamless) ---- */
function texStar(palette, seed){
  const w=TXW,h=TXH,c=newCanvas(w,h),ctx=c.getContext('2d');
  const img=ctx.createImageData(w,h),d=img.data;
  const fbm=makeNoise3(seed);
  const stops=palette.map(hex2rgb);
  for(let y=0;y<h;y++){ const v=y/h;
    for(let x=0;x<w;x++){ const u=x/w, ang=u*Math.PI*2;
      const n =ring(fbm,ang,v,16,16,5,0)*0.5+0.5;
      const n2=ring(fbm,ang,v,40,40,4,30)*0.5+0.5;
      let col=ramp(stops, n*0.7+n2*0.3);
      const o=(y*w+x)*4; d[o]=col[0]; d[o+1]=col[1]; d[o+2]=col[2]; d[o+3]=255;
    }}
  ctx.putImageData(img,0,0); return c;
}

/* ---- radial glow sprite ---- */
function texGlow(inner, outer){
  const s=256, c=newCanvas(s,s), ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,inner); g.addColorStop(0.25,outer);
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  return c;
}

/* ============================================================
   Canvas-texture survival (Android): backgrounded tabs can have their
   2D-canvas backing stores DISCARDED — image-based textures (the baked
   .webp maps) reload fine, but every canvas-based texture (magma oceans,
   scars, glow sprites…) comes back blank. A tiny sentinel canvas detects
   the wipe on return and registered repainters restore the content.
   ============================================================ */
const _cvRepaint=[];
let _cvSentinel=null;
function regCanvasTex(tex, fn){ _cvRepaint.push({tex, fn}); return tex; }
function unregCanvasTex(tex){
  for(let i=_cvRepaint.length-1;i>=0;i--) if(_cvRepaint[i].tex===tex) _cvRepaint.splice(i,1);
}
function cvArmSentinel(){
  if(!_cvSentinel) _cvSentinel=newCanvas(4,4);
  const c=_cvSentinel.getContext('2d'); c.fillStyle='#fff'; c.fillRect(0,0,4,4);
}
function cvCheckRestore(){
  if(!_cvSentinel) return;
  let lost=false;
  try{ lost=_cvSentinel.getContext('2d').getImageData(0,0,1,1).data[3]===0; }catch(_){ lost=true; }
  if(!lost) return;
  cvArmSentinel();
  for(const r of _cvRepaint){ try{ r.fn(); r.tex.needsUpdate=true; }catch(_){ } }
}
document.addEventListener('visibilitychange',function(){
  if(document.hidden){ if(typeof impBeam!=='undefined' && impBeam) stopBeam(); }  // don't let a held laser survive a tab-switch
  else setTimeout(cvCheckRestore,60);
});
// a lost pointerup (clicking away from the window mid-hold) would otherwise leave the beam stuck on
window.addEventListener('blur',function(){ if(typeof impBeam!=='undefined' && impBeam) stopBeam(); });
/* glow-sprite texture that repaints itself after a canvas wipe */
function glowCanvasTex(inner, outer){
  const c=texGlow(inner,outer), t=new THREE.CanvasTexture(c);
  regCanvasTex(t, function(){ c.getContext('2d').drawImage(texGlow(inner,outer),0,0); });
  return t;
}

/* ============================================================
   Three.js scene
   ============================================================ */
const APP = {};

/* ---- which system? Ra (fictional) or our real Solar System (data-sol.js).
   Chosen on the first-visit selection screen; the choice persists in
   localStorage['ra-system'] and is applied here before build() runs. ---- */
let SYS='ra', DS=null;
function applySystem(sys){
  SYS = (sys==='sol' && typeof SOL_SYSTEM!=='undefined') ? 'sol' : 'ra';
  DS = SYS==='sol'
    ? {STAR:SOL_SYSTEM.STAR, PLANETS:SOL_SYSTEM.PLANETS, MOONS:SOL_SYSTEM.MOONS,
       HORUS:null, HORUS_MOONS:[], GLOSSARY:SOL_SYSTEM.GLOSSARY, BELT:null}
    : {STAR:STAR, PLANETS:PLANETS, MOONS:MOONS, HORUS:HORUS, HORUS_MOONS:HORUS_MOONS, GLOSSARY:GLOSSARY,
       BELT:(typeof BELT!=='undefined'?BELT:null)};
  // heliocentric Kepler mu follows the chosen star (Sol is 1.0 M☉, not Ra's 1.139)
  STAR_MSUN=(DS.STAR.massKg||2.266e30)/1.989e30;
  MU_RA=4*Math.PI*Math.PI*STAR_MSUN;
}
let scene,camera,renderer,controls,clock,starfieldPts=null;
let playing=true, timeScale=1.0, sizeMult=1.0, showOrbits=true, showLabels=true, showTails=true;
let elapsedYears=0, _clockT=0;    // accumulated sim-time + throttle timer for the clock readout
let USE_VERBATIM = !!window.USE_VERBATIM;   // true = show only the author's own text

/* ---- language: English default, Slovak via the 🌐 toggle (persisted).
   All Slovak content lives in assets/lang-sk.js (LANG_SK); English strings
   used from JS live in UI_EN below; static English HTML is cached from the
   DOM on first switch so toggling back restores it. ---- */
let LANG='en';
try{ if(localStorage.getItem('ra-lang')==='sk') LANG='sk'; }catch(_){}
const UI_EN={
  'play':'▶ Play','pause':'⏸ Pause',
  'rt':'real-time','u-yr':'yr/s','u-mo':'mo/s','u-day':'days/s','u-hr':'hr/s','u-min':'min/s','u-s':'s/s',
  'e-yr':'yr','e-day':'days','e-hr':'hr','e-min':'min','e-s':'s',
  'real-scale':'📏 Real scale','compressed':'📐 Compressed',
  'authors-text':"📖 Author's text",'summary-source':'📖 Summary + source',
  'type-star':'Star','type-bd':'Brown dwarf','type-moon':'Moon','type-planet':'Planet','type-remnant':'Planetary remnant',
  'nav-ra':'Ra System','nav-horus':'Horus subsystem',
  'nav-sol':'The Solar System',
  'title-sol-h1':'The <b>Solar</b> System',
  'doc-title-sol':'The Solar System — Interactive 3D Simulation',
  'sys-to-sol':'⇄ 🌍 Solar System','sys-to-ra':'⇄ ✨ Ra System','sys-change':'⇄ Change system',
  'choose-title':'Choose a planetary system',
  'choose-ra':'✨ The Ra System','choose-ra-sub':'A fictional world — “Satis v10”',
  'choose-sol':'🌍 The Solar System','choose-sol-sub':'Our home — real planets &amp; moons',
  'life-title':'harbours life','life-intelligent':'intelligent','life-alien':'alien','life-seeded':'seeded','life-native':'native',
  'life-unicellular':'unicellular','life-sterile':'sterile',
  'st-bio-now':'Biosphere (current)',
  'bio-extinct-val':'multicellular life extinct — microbes only',
  'bio-sterile-val':'ALL life extinct — the world is sterile',
  'ext-note':'The bombardment sterilized the surface: every animal, plant and fungus is gone. Only single-celled life clings on in the deep rock and what remains of the seas. (🧽 Heal in the impact lab restores the biosphere.)',
  'ext-note-sterile':'The bombardment exceeded an exaton of TNT: nothing survived, not even microbes. The world is completely sterile. (🧽 Heal in the impact lab restores the biosphere.)',
  'from-source':"From the source — author's text",
  'no-desc':'(No description in the source document yet — summary shown.)',
  'debris-type':'Debris field','debris-name-span':'destroyed','debris-tag':'A debris field.',
  'st-status':'Status','st-destroyed':'☠ Destroyed','st-cause':'Cause','st-cause-v':'Bombardment (impact lab)',
  'st-cause-col':'Collision with {name}','st-cause-sn':'Supernova of {name}',
  'orb-edit':'Orbit (a · e)','orb-apply':'Set',
  'st-eabs':'Energy absorbed','st-ebind':'Binding energy',
  'debris-epitaph':'{name} is gone. Its accumulated bombardment exceeded its gravitational binding energy and the world came apart. Where {name} once was, incandescent fragments and still-cooling ejecta drift apart — and Kepler shear is smearing them along the old orbit into a glittering debris ring. Speed up time to watch the arc close into a full ring.',
  'debris-overkill':'The final energy input was far above the re-accretion window: the debris is expanding too fast to settle into a new spherical remnant or moonlets.',
  'stellar-epitaph':'{name} has been unbound. Its absorbed weapon energy exceeded its gravitational binding energy, driving a supernova-like blast that scorched nearby worlds by inverse-square exposure and threw surviving orbiters onto unbound or newly liberated paths.',
  'heal-hint':'(🧽 Heal in the impact lab restores the planet.)',
  'nav-destroyed':'destroyed',
  'st-orbit-now':'Orbit (current)',
  'st-mass-now':'Mass (current)',
  'st-water-now':'Delivered water',
  'tier-massloss':' · mass −{p} %',
  'st-ring':'Debris ring','st-ring-v':'☄ shearing along the old orbit',
  'st-blast':'Blast aftermath','st-blast-v':'radiative shock and orbital ejection',
  'tier-puff-1':' · envelope: superheated, glowing',
  'tier-puff-2':' · envelope: inflated like a hot Jupiter — gas escaping',
  'tier-puff-3':' · envelope: streaming away — breakup imminent',
  'imp-immune':' · immune to your weapons','imp-destroyed':' · ☠ destroyed — a debris field',
  'imp-strike':'strike','imp-beam':'beam/s','imp-binding-over':'≥100% of binding ☠','imp-binding-of':'% of binding',
  'dmg-scarred':'scarred','dmg-heavy':'heavily damaged','dmg-boiled':'oceans boiled off',
  'dmg-molten':'surface molten','dmg-critical':'near breakup',
  'imp-melts-sea':' · melts a ~{km} km lava sea',
  'tier-crater':' · surface: cratered','tier-seas':' · surface: scattered lava pools',
  'tier-thaw':' · thawing — seas of liquid water ({p}%)',
  'tier-thaw-polar':' · thawing — polar seas ({p}%)',
  'tier-steam':' · oceans boiling — steam atmosphere ({p}%)',
  'tier-regional':' · surface: regional melting ({p}% molten)','tier-ocean':' · surface: global magma ocean ({p}% molten)',
  'tier-molten':' · surface: fully molten, superheated','tier-white':' · surface: white-hot — breakup imminent',
  'imp-w-ast':'☄ Asteroid','imp-w-las':'🔆 Laser',
  'imp-surface':'▣ Surface','imp-surface-on':'▣ Surface on',
  'imp-hint-ast':'Click a world to strike it · scars persist · enough total energy shatters a crust',
  'imp-hint-las':'Press & hold to fire · drag to sweep the beam across worlds · release to stop',
  'mat-0':'🧊 Ice','mat-1':'🪨 Rock','mat-2':'⛓ Iron',
  'fly-notarget':'◎ no target — tap a world',
  // ➕ Create a body / 🌌 N-body — dynamic strings written from app.js
  'nb-on':'ON','nb-off':'OFF',
  'k-rocky':'Rocky','k-terran':'Terran','k-iceworld':'Ice world','k-gasgiant':'Gas giant',
  'm-still':'Still','m-orbit':'Orbit','m-launch':'Launch',
  'cr-name-ph':'New world',
  'cr-orbits':'Orbits','cr-dominant':'Dominant body','cr-orbitparent':'Orbit parent',
  'cr-target':'Target','cr-ref':'Reference body',
  'cr-parent-t':'Which body the new world orbits — click to cycle through the star and every planet; the distance scale adapts to the choice',
  'cr-parent-still-t':'Default local gravity frame. The actual drop uses whatever dominates the click point.',
  'cr-parent-orbit-t':'Default orbit parent. Clicking on/near a world makes that world the orbit parent.',
  'cr-parent-aim-t':'Auto-aim target. Launch velocity is relative to this body.',
  'cr-parent-ref-t':'Default launch reference. Clicking on/near a world uses that world as the reference body.',
  'cr-mode-t':'Cycle placement mode',
  'cr-mode-off-t':'Still & Launch need 🌌 N-body ON',
  'cr-autoaim-t':'Auto-aim toward the selected/followed body; launch speed is relative to that target',
  'doc-title':'The Ra System — Interactive 3D Simulation'
};
function T(k){
  if(LANG==='sk' && typeof LANG_SK!=='undefined' && LANG_SK.ui[k]!=null) return LANG_SK.ui[k];
  return UI_EN[k]!=null?UI_EN[k]:k;
}
function locData(d){ return (LANG==='sk' && typeof LANG_SK!=='undefined' && LANG_SK.data[d.key])||null; }
function locTagline(d){ const l=locData(d); return (l&&l.tagline)||d.tagline; }
function locDesc(d){ const l=locData(d); return (l&&l.desc)||d.desc; }
function locStats(d){ const l=locData(d); return (l&&l.stats)||d.stats; }
function locCaption(d,i,cap){ const l=locData(d); return (l&&l.images&&l.images[i])||cap; }
function locVerbatim(key){
  if(LANG==='sk' && typeof LANG_SK!=='undefined' && LANG_SK.verbatim[key]) return LANG_SK.verbatim[key];
  return (typeof DESCRIPTIONS_VERBATIM!=='undefined')?DESCRIPTIONS_VERBATIM[key]:null;
}
function locName(d){
  if(LANG==='sk' && typeof LANG_SK!=='undefined'){
    const l=LANG_SK.data[d.key]; if(l && l.name) return l.name;
  }
  return d.name;
}
const _staticEn={};
function applyStaticLang(){
  if(typeof LANG_SK==='undefined') return;
  for(const id in LANG_SK.html){
    const el=document.getElementById(id); if(!el) continue;
    if(!(id in _staticEn)) _staticEn[id]=el.innerHTML;
    el.innerHTML = LANG==='sk' ? LANG_SK.html[id] : _staticEn[id];
  }
  for(const id in (LANG_SK.titles||{})){
    const el=document.getElementById(id); if(!el) continue;
    const k='t:'+id; if(!(k in _staticEn)) _staticEn[k]=el.getAttribute('title')||'';
    el.setAttribute('title', LANG==='sk'?LANG_SK.titles[id]:_staticEn[k]);
  }
  document.title=T('doc-title');
  applySysTitles();
}
function applySysTitles(){
  const h=document.getElementById('title-h1');
  if(SYS==='sol'){
    if(h) h.innerHTML=T('title-sol-h1');
    document.title=T('doc-title-sol');
  }
  // Alpha edition badge — survives language switches and the Sol retitle
  if(h && h.innerHTML.indexOf('ALPHA')<0)
    h.innerHTML+=' <small style="opacity:.65;font-size:.55em">ALPHA</small>';
  if(document.title.indexOf('Alpha')<0) document.title+=' · Alpha';
}
function updateLangBtn(){ const b=document.getElementById('t-lang'); if(b) b.textContent = LANG==='sk'?'🌐 EN':'🌐 SK'; }
function setLang(l){
  LANG = (l==='sk' && typeof LANG_SK!=='undefined') ? 'sk' : 'en';
  try{ localStorage.setItem('ra-lang',LANG); }catch(_){}
  applyStaticLang(); updateLangBtn();
  const nav=document.getElementById('nav');
  if(nav){ nav.innerHTML=''; buildNav(); setActiveNav(selected);
    for(const r of bodies) if(r.destroyed) updateNavStatus(r); }
  buildGlossary();
  const pb=document.getElementById('play'); if(pb) pb.innerHTML=playing?T('pause'):T('play');
  const sb=document.getElementById('t-scale'); if(sb) sb.innerHTML=realScale?T('real-scale'):T('compressed');
  const tb=document.getElementById('t-text'); if(tb) tb.innerHTML=USE_VERBATIM?T('authors-text'):T('summary-source');
  updateSurfaceUI();
  const sp=document.getElementById('speed'); if(sp) setSpeed(+sp.value);
  const sysb=document.getElementById('t-system');
  if(sysb) sysb.innerHTML = T('sys-change');
  for(const r of bodies){ const el=labelEls[r.data.key];
    if(el) el.textContent=locName(r.data)+(r.destroyed?' ☠':''); }
  if(typeof updateImpactUI==='function') updateImpactUI();
  if(typeof nbBtnState==='function') nbBtnState();
  if(typeof crUpdateUI==='function') crUpdateUI();
  if(APP.currentData && document.getElementById('info').classList.contains('open')) openInfo(APP.currentData);
}
const bodies=[];           // every animated body
const pickables=[];        // meshes for raycasting
let selected=null;

// Touch devices: tapping a world focuses it but does NOT auto-open the big info
// sheet — the ⓘ button (top-right) toggles it. Desktop keeps click-to-read.
const MOBILE_UI = _COARSE;   // touch device (see _COARSE near the texture-size constants)

// --- impact lab state (💥 button; module lives before the Animation section) ---
let impacting=false, impWeapon='asteroid', impDiaKm=10, impSpdKms=30, impRho=3000, impPowW=1e18, impInfoT=0;
let surfaceView=false, surfaceRec=null;
const IMP_SURFACE_RATE_MAX=86400;       // one surface day per real second; faster rates stay visual, not wasteful
const IMP_HEAT_MAX_STEPS=24;

// --- free-roam flight state ---
let flying=false, flyModel='flycam', flyAutoSpeed=true, throttleFrac=0, throttleKms=0, autoOrient=false, flyThrust=0;
const flyVel=new THREE.Vector3();              // current velocity (scene units/s), shared by all models
const flyEuler=new THREE.Euler(0,0,0,'YXZ');   // look orientation: y=yaw, x=pitch, z=roll
let flyTarget=null, flyFollow=null, flyGoto=null;
const _flyPrevTarget=new THREE.Vector3();
const flyKeys={};

const labelLayer=document.getElementById('labels');

// file:// + WebGL texture uploads are fragile in Chromium-family browsers. Local runs
// load small per-texture data-url scripts asynchronously; HTTP(S) uses normal WebP URLs.
const localTextureWait={};
function bakedTextureKey(url){
  const m=/(?:^|\/)([^\/]+)\.webp$/.exec(url);
  return m&&m[1];
}
function loadTextureURL(url, onLoad, onProgress, onError, fileNoCors){
  const loader=new THREE.TextureLoader();
  if(fileNoCors) loader.setCrossOrigin(undefined);
  return loader.load(url, onLoad, onProgress, onError);
}
function loadBakedTexture(url, onLoad, onProgress, onError){
  if(typeof location!=='undefined' && location.protocol==='file:'){
    const key=bakedTextureKey(url);
    if(key){
      window.RA_LOCAL_TEXTURES=window.RA_LOCAL_TEXTURES||{};
      if(window.RA_LOCAL_TEXTURES[key]) return loadTextureURL(window.RA_LOCAL_TEXTURES[key], onLoad, onProgress, onError, false);
      if(!localTextureWait[key]){
        localTextureWait[key]=[];
        const s=document.createElement('script');
        s.async=true;
        s.src='assets/img/textures/local-data/'+key+'.js';
        s.onload=function(){
          const q=localTextureWait[key]||[]; delete localTextureWait[key];
          const data=window.RA_LOCAL_TEXTURES&&window.RA_LOCAL_TEXTURES[key];
          q.forEach(fn=>fn(data));
        };
        s.onerror=function(){
          const q=localTextureWait[key]||[]; delete localTextureWait[key];
          q.forEach(fn=>fn(null));
        };
        document.head.appendChild(s);
      }
      localTextureWait[key].push(function(data){
        loadTextureURL(data||url, onLoad, onProgress, onError, !data);
      });
      return null;
    }
    return loadTextureURL(url, onLoad, onProgress, onError, true);
  }
  return loadTextureURL(url, onLoad, onProgress, onError, false);
}

/* flat banded annulus in the planet's equator plane (Saturn). The band
   strip is a seeded 1D canvas (registered for Android canvas-wipe replay);
   UVs are remapped radially so the strip reads as concentric rings. */
function makeBodyRings(rec){
  const cfg=rec.data.rings;
  const inner=rec.radius*cfg.inner, outer=rec.radius*cfg.outer;
  const geo=new THREE.RingGeometry(inner,outer,96,1);
  const pos=geo.attributes.position, uv=geo.attributes.uv;
  for(let i=0;i<pos.count;i++){
    const r=Math.hypot(pos.getX(i),pos.getY(i));
    uv.setXY(i,(r-inner)/(outer-inner),0.5);
  }
  const cv=newCanvas(512,4);
  const paint=()=>{
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,512,4);
    let sd=1234567;
    const rnd=()=>{ sd=(sd*1103515245+12345)>>>0; return sd/4294967296; };
    for(let x=0;x<512;x++){
      const f=x/512;
      let a=0.55+0.45*Math.sin(f*40+rnd()*2)*rnd();         // fine ringlets
      a*=0.35+0.65*Math.min(1,f*6)*(1-Math.pow(f,3)*0.35);  // dim inner edge, soft outer
      if(f>0.66 && f<0.74) a*=0.10;                          // Cassini division
      if(f<0.06) a*=0.3;
      ctx.fillStyle=cfg.color||'#d8c9a6';
      ctx.globalAlpha=Math.max(0,Math.min(1,a))*0.9;
      ctx.fillRect(x,0,1,4);
    }
  };
  paint();
  const t=new THREE.CanvasTexture(cv);
  const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide,
    transparent:true,depthWrite:false,opacity:0.95}));
  // only repaint the procedural strip while it's still the live map (a real photo
  // may swap in below) — mirrors buildBodyMesh's guarded canvas-wipe repaint
  regCanvasTex(t, function(){ if(m.material.map!==t) return; paint(); });
  m.rotation.x=Math.PI/2;
  m.renderOrder=1;
  rec.mesh.add(m);
  rec.ringsMesh=m;
  // opt-in real ring photo (assets/img/textures/<key>_rings.webp: RGBA strip,
  // inner edge at u=0 — the radial UVs above sample it by radius). Falls back
  // to the procedural strip on any miss, just like the body maps.
  if(typeof window!=='undefined' && window.USE_AI_TEXTURES){
    loadBakedTexture('assets/img/textures/'+rec.data.key+'_rings.webp',
      function(rt){ rt.anisotropy=4; m.material.map=rt; m.material.opacity=1; m.material.needsUpdate=true; t.dispose(); },
      undefined, function(){ /* keep procedural rings */ });
  }
  return m;
}

function makeAtmosphere(radius, color, strength){
  const mat=new THREE.ShaderMaterial({
    uniforms:{ c:{value:new THREE.Color(color)}, p:{value:strength} },
    vertexShader:`varying vec3 vN; varying vec3 vV;
      void main(){ vN=normalize(normalMatrix*normal);
        vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 c; uniform float p; varying vec3 vN; varying vec3 vV;
      void main(){ float i=pow(1.0-abs(dot(vN,vV)),2.6); gl_FragColor=vec4(c, i*p); }`,
    side:THREE.BackSide, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false
  });
  const m=new THREE.Mesh(new THREE.SphereGeometry(radius,48,48), mat);
  return m;
}

function buildBodyMesh(data, radius){
  const seed = (data.key||'x').split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)>>>0;
  const geo=new THREE.SphereGeometry(radius, 64, 48);
  let mat;
  const gen=()=>{                          // deterministic — reused to repaint after a canvas wipe
    let tex, emap=null;
    if(data.kind==='star'){
      tex=texStar(["#ffb347","#ffe9b0","#fff8ee","#ffdf9a"], seed);
    }else if(data.kind==='gasgiant'||data.kind==='browndwarf'){
      tex=texGas(data.palette||["#888","#bbb","#666"], seed, {turb:0.06,streak:0.18});
    }else if(data.kind==='lava'){
      const r=texRocky(data.rocky, seed, {glow:'#ffb84a', emissData:true});
      tex=r.map; emap=r.emap;
    }else if(data.terran){
      tex=texTerran(data.terran, seed);
    }else if(data.rocky){
      tex=texRocky(data.rocky, seed, {ice:data.terran&&data.terran.ice});
    }else{ // iceworld with palette
      tex=texGas(data.palette||["#9ab","#cde","#8aa"], seed, {turb:0.08,streak:0.10});
    }
    return {tex, emap};
  };
  const g0=gen();
  const tex=g0.tex, emap=g0.emap;
  const map=new THREE.CanvasTexture(tex); map.anisotropy=4;
  regCanvasTex(map, function(){            // only if the procedural map is still the live one
    if(!mat || mat.map!==map) return;
    const g=gen(); tex.getContext('2d').drawImage(g.tex,0,0);
    if(emap && mat.emissiveMap && mat.emissiveMap.image===emap){
      emap.getContext('2d').drawImage(g.emap,0,0); mat.emissiveMap.needsUpdate=true; }
  });
  if(data.kind==='star'){
    mat=new THREE.MeshBasicMaterial({map});
  }else{
    mat=new THREE.MeshStandardMaterial({ map, roughness:1.0, metalness:0.0 });
    if(data.emissive!==undefined){
      mat.emissive=new THREE.Color(data.emissive);
      mat.emissiveIntensity=data.emissiveScale||0.4;
    }
    if(emap){ mat.emissiveMap=new THREE.CanvasTexture(emap); mat.emissive=new THREE.Color(0xffffff);
      mat.emissiveIntensity=data.emissiveScale||0.5; }
  }
  // Experimental: opt-in AI textures (index-ai.html sets window.USE_AI_TEXTURES).
  // The procedural map above shows instantly; if a baked image exists we swap it in,
  // and on any miss/error we silently keep the procedural texture.
  if(typeof window!=='undefined' && window.USE_AI_TEXTURES){
    loadBakedTexture(
      'assets/img/textures/'+data.key+'.webp',
      function(t){
        t.anisotropy=4; t.wrapS=map.wrapS; t.wrapT=map.wrapT;
        if(map.encoding!==undefined) t.encoding=map.encoding;
        mat.map=t; mat.needsUpdate=true;
        // the AI lava map already reads hot — ease the procedural emissive glow
        if(data.kind==='lava' && mat.emissiveIntensity!==undefined) mat.emissiveIntensity*=0.55;
        // extinction landed before the baked map did — scrub this one too
        const erec=bodies.find(function(b){ return b.data.key===data.key; });
        if(erec && erec.extinct && data.vegKill){ erec._vegKilled=false; impKillVegetation(erec); }
      },
      undefined,
      function(){ /* missing / failed → keep the procedural texture */ }
    );
  }
  const mesh=new THREE.Mesh(geo, mat);
  mesh.userData.bodyKey=data.key;
  return mesh;
}

/* Create one orbiting body. parentHolder = Object3D the orbit is relative to. */
function addBody(data, parentHolder, opts){
  opts=opts||{};
  const radius = (opts.radius!=null?opts.radius:sizeDisp(data.radiusKm))* (opts.noScaleMult?1:1);
  const holder=new THREE.Object3D();          // moves to orbital position (no spin)
  parentHolder.add(holder);
  const mesh=buildBodyMesh(data, radius);     // spins
  holder.add(mesh);
  pickables.push(mesh);

  // atmosphere (child of mesh so it scales with the size slider)
  if(data.atmo){
    const str = data.atmoThin?0.5:0.95;
    mesh.add(makeAtmosphere(radius*1.045, data.atmo, str));
  }
  // self glow for hot/star bodies handled separately

  // orbit geometry
  const aDisp = opts.aDisp;
  const e = data.ecc||0;
  const incl = (opts.incl||0)*Math.PI/180;
  const node = (opts.node||0)*Math.PI/180;
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(incl, node, 0,'YXZ'));

  let orbitLine=null;
  if(aDisp>0){
    const g=new THREE.BufferGeometry().setFromPoints(orbitPoints(aDisp,e));
    const m=new THREE.LineBasicMaterial({color:new THREE.Color(data.color||0x88aaff),
      transparent:true, opacity:opts.orbitOpacity||0.32});
    orbitLine=new THREE.Line(g,m); orbitLine.quaternion.copy(q); orbitLine.visible=showOrbits;
    parentHolder.add(orbitLine);
  }

  const rec={
    data, holder, mesh, orbitLine, radius,
    aDisp, e, q,
    period: data.period||1,
    M: Math.random()*Math.PI*2,
    spin: (0.35/(data.rotationPeriod||4)),
    parentHolder, helio: (parentHolder===sunHolder)
  };
  bodies.push(rec);
  return rec;
}

/* ellipse points with the parent at the focus (matches the Kepler motion) */
function orbitPoints(aDisp, e){
  const pts=[];
  for(let i=0;i<=180;i++){ const th=i/180*Math.PI*2;
    const r=aDisp*(1-e*e)/(1+e*Math.cos(th));
    pts.push(new THREE.Vector3(r*Math.cos(th),0,r*Math.sin(th)));
  }
  return pts;
}
function rebuildOrbitLine(rec){
  if(!rec.orbitLine) return;
  rec.orbitLine.geometry.dispose();
  rec.orbitLine.geometry=new THREE.BufferGeometry().setFromPoints(orbitPoints(rec.aDisp, rec.e));
}

/* solve Kepler's equation E - e sinE = M */
function kepler(M,e){
  let E=M; for(let i=0;i<6;i++){ E = E - (E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); } return E;
}

function positionBody(rec){
  if(rec.aDisp<=0) return;
  const E=kepler(rec.M, rec.e);
  const a=rec.aDisp, b=a*Math.sqrt(1-rec.e*rec.e);
  const x=a*(Math.cos(E)-rec.e);
  const z=b*Math.sin(E);
  const v=new THREE.Vector3(x,0,z).applyQuaternion(rec.q);
  rec.holder.position.copy(v);
}

/* ============================================================
   Build the whole system
   ============================================================ */
const _tmpV=new THREE.Vector3();
let sunHolder, sunMesh, starGroup, sunLight, horusRec, horusHolder;

function inclFor(key){ // small deterministic inclinations for a 3D look
  const map={amunet:1.4,wadjet:2.1,set:3.3,nephtys:1.1,satis:2.6,uatur:4.5,shu:6.0,horus:7.5};
  return map[key]!=null?map[key]:1.5;
}
function nodeFor(key){ let s=0; for(const ch of key) s+=ch.charCodeAt(0); return (s*53)%360; }

/* Hide the loading overlay. The critical part (opacity 0 + no pointer capture)
   is applied SYNCHRONOUSLY so it never waits on a setTimeout — mobile browsers
   throttle timers hard when you switch apps mid-load, which used to leave the
   loader stuck on screen even though the sim had finished building. */
function hideLoader(){
  const l=document.getElementById('loader'); if(!l) return;
  l.style.opacity='0'; l.style.pointerEvents='none';      // immediate: page is usable now
  const gone=()=>{ l.style.display='none'; };
  l.addEventListener('transitionend', gone, {once:true});
  setTimeout(gone, 1000);                                 // fallback cleanup (fade is 0.8s)
}
/* If build() ever throws, don't leave an eternal spinner — surface the error. */
function showLoadError(err){
  const l=document.getElementById('loader'); if(!l) return;
  const p=document.getElementById('loader-sub');
  if(p){ p.textContent='Load error — '+((err&&err.message)||err||'unknown'); p.style.color='#ff9d8a'; }
  const sp=l.querySelector('.spin'); if(sp) sp.style.display='none';
}
function build(){ try{ buildInner(); } catch(err){ showLoadError(err); throw err; } }
function buildInner(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x04060c);

  // near/far are adapted to zoom each frame (see animate) so you can fly right up to a
  // true-scale world (~2,500 km moons out to 46 AU orbits) without clipping.
  camera=new THREE.PerspectiveCamera(48, innerWidth/innerHeight, 0.01, 30000);
  camera.position.set(0, 95, 235);

  renderer=new THREE.WebGLRenderer({antialias:true, canvas:undefined});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  // AI textures are brighter than the procedural ones — roll off highlights so icy worlds
  // stop clipping to pure white. Procedural edition keeps its original (untone-mapped) look.
  const aiTex = (typeof window!=='undefined' && window.USE_AI_TEXTURES);
  if(aiTex){ renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0; }
  document.getElementById('app').appendChild(renderer.domElement);

  controls=new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.06;
  // right-drag orbits exactly like left-drag (pan moved to middle-drag)
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE, MIDDLE:THREE.MOUSE.PAN, RIGHT:THREE.MOUSE.ROTATE};
  controls.minDistance=realScale?0.004:0.8; controls.maxDistance=40000;   // real mode: fly right up to a world
  controls.zoomSpeed=2.4;                  // wheel zooms further per notch
  controls.target.set(0,0,0);

  clock=new THREE.Clock();

  // lights
  scene.add(new THREE.AmbientLight(0x4a5a7a, aiTex?0.6:0.85));
  sunLight=new THREE.PointLight(0xfff3e0, aiTex?1.9:2.4, 0, 0.0);  // no attenuation -> all worlds lit
  sunLight.userData.baseIntensity=sunLight.intensity;
  scene.add(sunLight);

  buildStarfield();

  // ---- Ra ---- (star visuals live in starGroup so they can be scaled per mode)
  sunHolder=new THREE.Object3D(); scene.add(sunHolder);
  starGroup=new THREE.Object3D(); sunHolder.add(starGroup);
  sunMesh=buildBodyMesh(DS.STAR, STAR_R_COMPRESS); starGroup.add(sunMesh); pickables.push(sunMesh);
  addStarGlow(starGroup, STAR_R_COMPRESS, '#fffaf0', '#ffdf9a', 5.4);
  bodies.push({data:DS.STAR, holder:sunHolder, mesh:sunMesh, orbitLine:null, radius:STAR_R_COMPRESS,
    aDisp:0, e:0, q:new THREE.Quaternion(), period:1, M:0, spin:0.35/DS.STAR.rotationPeriod,
    parentHolder:scene, helio:false});

  // ---- planets ----
  for(const p of DS.PLANETS){
    addBody(p, sunHolder, { aDisp:distDisp(p.dist), incl:(p.incl!=null?p.incl:inclFor(p.key)),
      node:nodeFor(p.key), orbitOpacity:0.34 });
  }
  // ---- moons of planets ----
  for(const m of DS.MOONS){
    const parent=bodies.find(b=>b.data.key===m.parent);
    if(!parent) continue;
    addMoon(m, parent);
  }

  // ---- Horus + its moons (Ra system only) ----
  if(DS.HORUS){
    horusRec=addBody(DS.HORUS, sunHolder, { aDisp:distDisp(DS.HORUS.dist), incl:inclFor('horus'), node:nodeFor('horus'),
                      radius:sizeDisp(DS.HORUS.radiusKm), orbitOpacity:0.28 });
    horusHolder=horusRec.holder;
    addStarGlow(horusRec.mesh, horusRec.radius, '#ff7a44', '#7a1c08', 2.4);  // glow scales with mesh
    const hLight=new THREE.PointLight(0xff5a2a, aiTex?0.55:0.9, horusRec.radius*70, 1.2);
    horusRec.mesh.add(hLight);
    for(const m of DS.HORUS_MOONS){ addMoon(m, horusRec); }
  }
  // ring systems (Saturn) — a flat banded annulus in the equator plane
  for(const rec of bodies) if(rec.data.rings) makeBodyRings(rec);

  // the Wadjet fragment swarm — a debris belt from the author's .ubox save
  if(DS.BELT) makeBelt();

  // evaporation tails (bodies flagged evapTail in data.js — planets and moons)
  for(const rec of bodies) if(rec.data.evapTail) makeEvapTail(rec);

  cvArmSentinel();                                        // Android canvas-wipe detector
  renderer.domElement.addEventListener('webglcontextrestored', ()=>setTimeout(cvCheckRestore,60));
  buildNav(); buildGlossary();
  applySysTitles();
  if(SYS==='sol'){ const tb=document.getElementById('t-text'); if(tb) tb.style.display='none'; }
  // language toggle (English default; Slovak from assets/lang-sk.js)
  const lb=document.getElementById('t-lang');
  if(lb) lb.onclick=function(){ setLang(LANG==='sk'?'en':'sk'); };
  if(LANG==='sk') setLang('sk'); else updateLangBtn();
  window.addEventListener('resize', onResize);
  setupInteraction();

  applyScaleMode();   // sets star size, body sizes, orbit radii for the current mode
  frameSystem();      // place the camera for the current mode

  setupCreateLab();   // Alpha: custom-body panel + N-body toggle
  restoreCustoms();   // Alpha: re-create this browser's saved custom worlds
  setupStateUI();     // Alpha: 💾/📂/⬇/⬆/♻ + 🗑 delete wiring
  restoreSystemState();  // Alpha: auto-resume the saved world, if any

  hideLoader();       // synchronous — never depends on a throttled timer (mobile app-switch)

  // optional deep-link: index.html#satis focuses a body on load
  const hk=(location.hash||'').replace('#','').toLowerCase();
  if(hk && bodies.some(b=>b.data.key===hk)) setTimeout(()=>focusBody(hk,'force'), 400);
  window.addEventListener('hashchange',()=>{ const k=location.hash.replace('#','').toLowerCase();
    if(bodies.some(b=>b.data.key===k)) focusBody(k,'force'); });

  animate();
}

function addMoon(m, parentRec){
  // per-subsystem display distance
  const sysMoons = (DS.HORUS && parentRec.data.key===DS.HORUS.key)?DS.HORUS_MOONS:DS.MOONS.filter(x=>x.parent===parentRec.data.key);
  const refDist = Math.min.apply(null, sysMoons.map(x=>x.dist));
  const spacing = Math.max(2.2, parentRec.radius*0.95);
  // compressed: tuned for visibility; real: the moon's TRUE distance from its parent
  // (moon dist is in AU) so apparent sizes within a subsystem are physically correct.
  const aDispCompressed = parentRec.radius*1.7 + spacing*Math.pow(m.dist/refDist, 0.5);
  const aDispReal = m.dist * AU_UNIT;
  const idx = sysMoons.indexOf(sysMoons.find(x=>x.key===m.key));
  const rec = addBody(m, parentRec.holder, {
    aDisp: realScale?aDispReal:aDispCompressed,
    incl: 1.5 + idx*4 + (m.parent==='horus'?2:0),
    node: nodeFor(m.key),
    orbitOpacity: 0.22
  });
  rec.isMoon = true; rec.aDispReal = aDispReal; rec.aDispCompressed = aDispCompressed;
  return rec;
}

/* ---- scale mode (compressed <-> real distances) ---- */
function applySizes(){
  for(const rec of bodies){ if(rec.data.kind==='star') continue;
    rec.mesh.scale.setScalar(sizeMult*bodyF()*(rec.puffK||1)); }
}
function applyScaleMode(){
  starGroup.scale.setScalar(starVisR()/STAR_R_COMPRESS);
  for(const rec of bodies){
    if(rec.freeState){ positionFreeBody(rec); continue; }
    if(rec.helio){ rec.aDisp=distDisp(rec.helioA!=null?rec.helioA:rec.data.dist); rebuildOrbitLine(rec); }
    else if(rec.isMoon){ rec.aDisp = realScale?rec.aDispReal:rec.aDispCompressed; rebuildOrbitLine(rec); }
  }
  applySizes();
  // outer wanderers: real → Yamm's whole orbit (~850 AU) fits; compressed → past Salibe/Yamm.
  // (Kauket at 10,934 AU is a click-to-visit destination in either mode, like Sedna.)
  controls.maxDistance = realScale?95000:6500;
  controls.minDistance = realScale?0.004:0.8;
  beltDirty=true;                        // re-map belt points through the new scale transform
  for(const rec of bodies) positionBody(rec);
  updateScaleUI();
}
function frameSystem(){
  follow=null; tween.active=false;
  controls.target.set(0,0,0);
  if(realScale) camera.position.set(0, 175, 440);   // frames star → ~Uat-Ur; zoom out for Shu/Horus
  else camera.position.set(0, 95, 235);
}
function updateScaleUI(){
  const b=document.getElementById('t-scale');
  if(b){ b.classList.toggle('on', realScale); b.innerHTML = realScale?T('real-scale'):T('compressed'); }
}
function updateTextUI(){
  const b=document.getElementById('t-text');
  if(b){ b.classList.toggle('on', USE_VERBATIM);
    b.innerHTML = USE_VERBATIM ? T('authors-text') : T('summary-source'); }
}
function setScaleMode(real){
  if(!real && flying) exitFly();     // Compressed is the overview map — leave free-roam
  realScale=real;
  applyScaleMode();
  frameSystem();
}

function addStarGlow(holder, r, inner, outer, scale){
  // depthTest:true so planets in front of the star occlude its glow (no see-through wash)
  const map=glowCanvasTex(rgbaStr(inner,1), rgbaStr(outer,0.55));
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map, color:0xffffff, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true}));
  sp.scale.set(r*scale, r*scale, 1);
  holder.add(sp);
  // soft inner corona
  const sp2=new THREE.Sprite(new THREE.SpriteMaterial({map:glowCanvasTex(rgbaStr(inner,0.9), rgbaStr(inner,0.0)),
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true}));
  sp2.scale.set(r*scale*0.55, r*scale*0.55,1); holder.add(sp2);
}
function rgbaStr(hex,a){ const [r,g,b]=hex2rgb(hex); return `rgba(${r|0},${g|0},${b|0},${a})`; }

function buildStarfield(){
  const N=4500, pos=new Float32Array(N*3), col=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    const r=3000+Math.random()*9000;
    const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
    pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=r*Math.cos(ph); pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
    const t=Math.random(); const c=t<0.15? [0.7,0.8,1] : t>0.85? [1,0.85,0.7] : [1,1,1];
    const b=0.5+Math.random()*0.5;
    col[i*3]=c[0]*b; col[i*3+1]=c[1]*b; col[i*3+2]=c[2]*b;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  const m=new THREE.PointsMaterial({size:7, sizeAttenuation:true, vertexColors:true, transparent:true, opacity:0.9, depthWrite:false});
  starfieldPts=new THREE.Points(g,m);
  scene.add(starfieldPts);
}

/* ============================================================
   The Wadjet fragment swarm (Ra only) — a debris belt seeded from the
   684 bound-orbit collision fragments in the author's Universe Sandbox
   save (element distribution in data.js BELT). Scenery, not bodies:
   one Points draw call; per-point Kepler elements advanced on SIM time
   (speed slider fast-forwards it, pause freezes it), positions mapped
   through the active scale transform so the belt is correct in both
   Real and Compressed views.
   ============================================================ */
let beltObj=null, beltDirty=false;
function makeBelt(){
  const B=DS.BELT; if(!B || beltObj) return;
  const N=MOBILE_UI?550:900;
  let s=1234567891;                                  // deterministic layout (xorshift32)
  const rnd=()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; };
  const g2=()=>{ const u=Math.max(1e-9,rnd()); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
  const aA=new Float32Array(N), eA=new Float32Array(N), nA=new Float64Array(N), MA=new Float64Array(N),
        PB=new Float32Array(N*3), QB=new Float32Array(N*3);
  const col=new Float32Array(N*3), base=new THREE.Color(B.color||0xb9a892);
  const e1=new THREE.Vector3(), e2=new THREE.Vector3(), q=new THREE.Quaternion(), eu=new THREE.Euler();
  for(let i=0;i<N;i++){
    let a,e,inc;
    if(rnd()<B.core.frac){                           // the tight core swarm
      a=B.core.a[0]+B.core.a[1]*g2();
      e=Math.max(0.01, B.core.e[0]+B.core.e[1]*g2());
      inc=Math.max(0.2, B.core.inc[0]+B.core.inc[1]*g2());
    }else{                                           // the scattered tail
      a=B.tail.aMin+(B.tail.aMax-B.tail.aMin)*Math.pow(rnd(),1.6);
      e=Math.min(B.tail.eMax, 0.05+0.9*Math.pow(rnd(),2.2));
      inc=B.core.inc[0]+(B.tail.incMax-B.core.inc[0])*Math.pow(rnd(),3.0);
    }
    a=Math.min(B.tail.aMax, Math.max(B.tail.aMin*0.6, a));
    e=Math.min(0.95, Math.max(0.01, e));
    const node=rnd()*Math.PI*2, argp=rnd()*Math.PI*2;
    eu.set(inc*Math.PI/180, node, 0, 'YXZ'); q.setFromEuler(eu);
    e1.set(Math.cos(argp),0,Math.sin(argp)).applyQuaternion(q);   // in-plane basis (P,Q)
    e2.set(-Math.sin(argp),0,Math.cos(argp)).applyQuaternion(q);
    PB[i*3]=e1.x; PB[i*3+1]=e1.y; PB[i*3+2]=e1.z;
    QB[i*3]=e2.x; QB[i*3+1]=e2.y; QB[i*3+2]=e2.z;
    aA[i]=a; eA[i]=e;
    nA[i]=2*Math.PI/(Math.pow(a,1.5)/1.067);         // rad per sim-year (Kepler, M* = 1.139 M☉)
    MA[i]=rnd()*Math.PI*2;
    const b=0.55+0.5*rnd(), t=rnd();
    col[i*3]=base.r*b*(0.9+0.2*t); col[i*3+1]=base.g*b; col[i*3+2]=base.b*b*(1.1-0.2*t);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N*3),3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aC', new THREE.BufferAttribute(col,3));
  // clamped point size: stays a glint up close (fly mode) and a visible dot from afar
  const m=new THREE.ShaderMaterial({
    uniforms:{uScaleH:{value:600}},
    vertexShader:
      'attribute vec3 aC; varying vec3 vC; uniform float uScaleH;\n'+
      'void main(){ vC=aC; vec4 mv=modelViewMatrix*vec4(position,1.0);\n'+
      '  gl_PointSize=clamp(0.55*uScaleH/max(0.0001,-mv.z),1.2,14.0);\n'+
      '  gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying vec3 vC;\n'+
      'void main(){ float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard;\n'+
      '  gl_FragColor=vec4(vC, exp(-3.0*r*r)*0.9); }',
    transparent:true, depthWrite:false});
  const pts=new THREE.Points(g,m); pts.frustumCulled=false;
  sunHolder.add(pts);
  beltObj={pts,g,N,aA,eA,nA,MA,PB,QB};
  beltDirty=true;
  updateBelt(0);
}
function updateBelt(dYears){
  const B=beltObj; if(!B || !B.pts.visible || (!dYears && !beltDirty)) return;
  const pos=B.g.attributes.position.array;
  for(let i=0;i<B.N;i++){
    let M=B.MA[i]+B.nA[i]*dYears; if(dYears) B.MA[i]=M;
    const e=B.eA[i];
    let E=M;                                          // Newton — 3 steps is plenty at belt e
    for(let k=0;k<3;k++) E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
    const a=B.aA[i], x=a*(Math.cos(E)-e), y=a*Math.sqrt(1-e*e)*Math.sin(E);
    const px=B.PB[i*3]*x+B.QB[i*3]*y,
          py=B.PB[i*3+1]*x+B.QB[i*3+1]*y,
          pz=B.PB[i*3+2]*x+B.QB[i*3+2]*y;
    const r=Math.sqrt(px*px+py*py+pz*pz)||1e-9;
    const k2=distDisp(r)/r;                           // Real (linear) or Compressed (power-law)
    pos[i*3]=px*k2; pos[i*3+1]=py*k2; pos[i*3+2]=pz*k2;
  }
  B.g.attributes.position.needsUpdate=true;
  beltDirty=false;
}

/* ============================================================
   Evaporation tail — a hot world shedding its envelope
   (bodies flagged evapTail in data.js, e.g. Amunet).
   A fixed ring buffer of additive point sprites, emitted along the
   orbit arc swept each frame and blown anti-starward. Runs on sim
   time, so pausing freezes it and extreme speeds smear it into the
   gas torus such planets really leave along their orbit.
   ============================================================ */
const evapTails=[];
const EVAP_N=3072;            // particles per tail (ring buffer, one draw call)
const EVAP_LIFE_ORB=0.16;     // particle lifetime as a fraction of the orbital period
const EVAP_LEN_FRAC=0.45;     // real mode: tail length as a fraction of the orbit radius
const EVAP_LEN_RADII=2.6;     // compressed mode: tail length in (exaggerated) planet radii
const EVAP_MAX_EMIT=256;      // per-frame emission cap (extreme time speeds recycle instead)
const _evP=new THREE.Vector3(), _evD=new THREE.Vector3(), _evR=new THREE.Vector3();

function makeEvapTail(rec, cfgOverride){
  // per-body config: evapTail:true = Amunet-strength defaults; or {alpha,rate,len} to soften.
  // data.tail (hex) tints the plume — e.g. Sekhmet's sulfur-orange.
  // cfgOverride: dynamically-created tails (impact-heated gas giants shedding envelope).
  const cfg=cfgOverride || ((typeof rec.data.evapTail==='object')?rec.data.evapTail:{});
  const tint=rec.data.tail!=null?new THREE.Color(rec.data.tail):null;
  const colA=tint?tint.clone().lerp(new THREE.Color(1,1,1),0.65):new THREE.Color(1.0,0.93,0.76);
  const colB=tint?tint.clone():new THREE.Color(0.95,0.62,0.30);
  const colC=tint?tint.clone().multiplyScalar(0.35):new THREE.Color(0.42,0.22,0.38);
  const pos=new Float32Array(EVAP_N*3);
  const age01=new Float32Array(EVAP_N).fill(1);          // 1 = dead/invisible
  const size=new Float32Array(EVAP_N);
  const seed=new Float32Array(EVAP_N);
  for(let i=0;i<EVAP_N;i++) seed[i]=Math.random();
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAge',     new THREE.BufferAttribute(age01,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize',    new THREE.BufferAttribute(size,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed',    new THREE.BufferAttribute(seed,1));
  const m=new THREE.ShaderMaterial({
    uniforms:{ uScaleH:{value:600}, uMaxPx:{value:110}, uAlpha:{value:cfg.alpha||1},
               uColA:{value:colA}, uColB:{value:colB}, uColC:{value:colC} },
    vertexShader:
      'attribute float aAge; attribute float aSize; attribute float aSeed;\n'+
      'varying float vAge; varying float vSeed;\n'+
      'uniform float uScaleH; uniform float uMaxPx;\n'+
      'void main(){\n'+
      '  vAge=aAge; vSeed=aSeed;\n'+
      '  vec4 mv=modelViewMatrix*vec4(position,1.0);\n'+
      '  float grow=1.0+4.8*aAge;\n'+                       // gas puffs expand as they age
      '  gl_PointSize=clamp(aSize*grow*uScaleH/max(0.0001,-mv.z), 1.0, uMaxPx);\n'+
      '  gl_Position=projectionMatrix*mv;\n'+
      '}',
    fragmentShader:
      'varying float vAge; varying float vSeed;\n'+
      'uniform float uAlpha; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC;\n'+
      'void main(){\n'+
      '  if(vAge>=1.0) discard;\n'+
      '  float r=length(gl_PointCoord-0.5)*2.0;\n'+
      '  float disc=exp(-4.5*r*r);\n'+                      // gaussian puff — no readable edges
      '  float fade=smoothstep(0.0,0.06,vAge)*(1.0-smoothstep(0.45,1.0,vAge));\n'+
      // hot escaping gas: bright head colour -> body -> dim wisps (default white-gold/bronze/violet)
      '  vec3 col = vAge<0.35 ? mix(uColA,uColB,vAge/0.35)\n'+
      '                       : mix(uColB,uColC,(vAge-0.35)/0.65);\n'+
      '  float a=disc*fade*(0.030+0.025*vSeed)*(1.0+2.2*(1.0-vAge))*uAlpha;\n'+  // dense bright head -> wispy end
      '  gl_FragColor=vec4(col,a);\n'+                      // additive: adds col*a
      '}',
    transparent:true, depthWrite:false, depthTest:true, blending:THREE.AdditiveBlending });
  const points=new THREE.Points(g,m);
  points.frustumCulled=false;      // particles outgrow the geometry's bounding sphere
  scene.add(points);
  const t={rec, points, g, pos, age01, size,
    velYr:new Float32Array(EVAP_N*3),          // scene units per sim-year
    ageYr:new Float32Array(EVAP_N).fill(1), lifeYr:new Float32Array(EVAP_N).fill(1),
    head:0, emitAcc:0, prevM:rec.M, lastADisp:rec.aDisp,
    rate:cfg.rate||1, len:cfg.len||1};
  evapTails.push(t);
  return t;
}

function toggleTails(){
  showTails=!showTails;
  for(const t of evapTails){
    t.points.visible=showTails;
    if(showTails){                    // regrow cleanly instead of showing stale puffs
      t.ageYr.fill(1); t.lifeYr.fill(1); t.age01.fill(1);
      t.g.attributes.aAge.needsUpdate=true; t.prevM=t.rec.M; t.emitAcc=0;
    }
  }
  const b=document.getElementById('t-tails');
  if(b) b.classList.toggle('on', showTails);
}

function updateEvapTails(simDt, substep){   // simDt = sim-years advanced this frame (0 while paused)
  if(!showTails) return;
  if(!substep && simDt>0){
    const maxStep=6/(24*365.25);             // keep hour-scale rates from emitting in visible chunks
    const nSub=Math.min(12, Math.ceil(simDt/maxStep));
    if(nSub>1){
      const h=simDt/nSub, finals=new Map(), starts=new Map();
      for(const t of evapTails){ finals.set(t.rec,t.rec.M); if(!starts.has(t.rec)) starts.set(t.rec,t.prevM); }
      for(let i=1;i<=nSub;i++){
        for(const [rec,fin] of finals){ const st=starts.get(rec); rec.M=st+(fin-st)*i/nSub; }
        updateEvapTails(h,true);
      }
      for(const [rec,fin] of finals) rec.M=fin;
      return;
    }
  }
  for(const t of evapTails){
    const rec=t.rec;
    if(rec.destroyed){ if(t.points.visible) t.points.visible=false; continue; }   // debris doesn't outgas
    if(!t.points.visible) t.points.visible=true;
    if(rec.aDisp!==t.lastADisp){   // scale mode flipped — old positions are meaningless
      t.ageYr.fill(1); t.lifeYr.fill(1); t.age01.fill(1);
      t.lastADisp=rec.aDisp; t.prevM=rec.M; t.emitAcc=0;
      t.g.attributes.aAge.needsUpdate=true;
      if(simDt<=0) continue;
    }
    if(simDt>0){
      const life=EVAP_LIFE_ORB*rec.period;
      const dispR=impRenderRadius(rec);                    // current on-screen radius
      // moons: tail spans ~1.5× their orbit so it sweeps across the parent (per the source doc)
      const tailLen=(realScale ? (rec.helio?EVAP_LEN_FRAC:1.5)*rec.aDisp
                               : EVAP_LEN_RADII*dispR)*t.len;
      const speed=tailLen/life;
      const bp=rec.parentHolder.position;                  // world offset: (0,0,0) for planets
      // advect living particles
      for(let i=0;i<EVAP_N;i++){
        if(t.ageYr[i]>=t.lifeYr[i]) continue;
        t.ageYr[i]+=simDt;
        t.pos[i*3]  +=t.velYr[i*3]  *simDt;
        t.pos[i*3+1]+=t.velYr[i*3+1]*simDt;
        t.pos[i*3+2]+=t.velYr[i*3+2]*simDt;
      }
      // emit along the orbit arc swept this frame (fractional accumulator keeps the
      // steady-state population matched to the lifetime at any time rate)
      t.emitAcc+=simDt/life*EVAP_N*t.rate;
      let n=Math.floor(t.emitAcc); t.emitAcc-=n;
      if(n>EVAP_MAX_EMIT){ n=EVAP_MAX_EMIT; t.emitAcc=0; }
      const dM=rec.M-t.prevM;
      // N-body / free bodies: Kepler elements are stale — emit along the segment the
      // holder actually travelled this frame instead of the element-predicted arc
      const live=!!(rec.nb||rec.freeState);
      if(!t.prevPos) t.prevPos=rec.holder.position.clone();
      for(let k=0;k<n;k++){
        const i=t.head; t.head=(t.head+1)%EVAP_N;
        const f=(k+1)/n;
        if(live){
          _evP.copy(t.prevPos).lerp(rec.holder.position,f).add(bp);
        }else{
        // planet position at this sub-step (same Kepler math as positionBody)
        const M=(t.prevM+dM*f)%(Math.PI*2);
        const E=kepler(M,rec.e), a=rec.aDisp, b=a*Math.sqrt(1-rec.e*rec.e);
        _evP.set(a*(Math.cos(E)-rec.e),0,b*Math.sin(E)).applyQuaternion(rec.q).add(bp);
        }
        _evD.copy(_evP).normalize();                       // anti-starward (star at origin)
        _evR.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
        _evR.addScaledVector(_evD,0.9).normalize();        // spawn biased to the night-side limb
        const j=i*3, spd=speed*(0.75+0.5*Math.random());
        t.pos[j]=_evP.x+_evR.x*dispR; t.pos[j+1]=_evP.y+_evR.y*dispR; t.pos[j+2]=_evP.z+_evR.z*dispR;
        _evD.x+=_evR.x*0.16; _evD.y+=_evR.y*0.16; _evD.z+=_evR.z*0.16; _evD.normalize();
        t.velYr[j]=_evD.x*spd; t.velYr[j+1]=_evD.y*spd; t.velYr[j+2]=_evD.z*spd;
        t.lifeYr[i]=life*(0.7+0.6*Math.random());
        const back=simDt*(1-f);                            // back-date along the sweep
        t.ageYr[i]=back;
        t.pos[j]+=t.velYr[j]*back; t.pos[j+1]+=t.velYr[j+1]*back; t.pos[j+2]+=t.velYr[j+2]*back;
        t.size[i]=tailLen*0.0125*(0.9+0.8*Math.random());  // ∝ tail length (matches Amunet's tuned look)
      }
      t.prevM=rec.M;
      if(t.prevPos) t.prevPos.copy(rec.holder.position);
      for(let i=0;i<EVAP_N;i++) t.age01[i]=Math.min(1, t.ageYr[i]/t.lifeYr[i]);
      t.g.attributes.position.needsUpdate=true;
      t.g.attributes.aAge.needsUpdate=true;
      t.g.attributes.aSize.needsUpdate=true;
    }
    // perspective point sizing (device px; canvas height already includes pixelRatio)
    t.points.material.uniforms.uScaleH.value =
      renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));
    t.points.material.uniforms.uMaxPx.value = realScale ? 110 : 36;  // compressed = overview map
  }
}

/* ============================================================
   Impact lab — customizable asteroid strikes + giant laser (💥).
   Direct fire: click a world = asteroid at that spot; press-and-
   hold = laser (the world rotates under the frozen beam, smearing
   a burn line). Wall-clock driven — works while the sim is paused.
   Damage persists as scars painted onto per-body overlay spheres;
   when a body's accumulated energy exceeds its gravitational
   binding energy (3GM²/5R), its crust shatters into a molten
   remnant. Ra and Horus use the same real binding-energy test,
   but fail as stellar/substellar blast events instead of rubble.
   ============================================================ */
const IMP_CHICXULUB_J=4.2e23, IMP_MT_TNT_J=4.184e15, IMP_G=6.674e-11;
const IMP_MATS=[
  ['🧊 Ice',920,0xdceeff,300],
  ['🪨 Rock',3000,0x8a7767,800],
  ['⛓ Iron',7870,0x5e5f63,800]
];
const impDensityByKind={ star:1400, browndwarf:8e4, gasgiant:1300, terran:5200, rocky:4500,
                         lava:4800, ocean:3500, iceworld:2000, icemoon:1900 };
let impMatI=1;
const impAsteroids=[], impFx=[], impScarred=[];
const stellarBlasts=[];
let impWaveShatter=false;    // true while a blast-wave arrival shatters a world (leaner debris)
let impShellBudget=1;        // first-time melt/water/steam shell bakes allowed this frame
const _heatPaintQ=[];        // heat-overlay repaint requests, budgeted per frame
let impBeam=null, impShake=0, impPool=null, impPoolActiveT=0;
let _impFlashTex=null, _impRingTex=null;
// baked rock albedo (gpt-image-2) for asteroids + debris chunks; falls back to
// flat colours if the file is missing. Preloaded on entering impact mode.
let _impRockTex=null, _impRockReq=false, _astGlowTex=null;
function impRockTex(){
  if(!_impRockReq){ _impRockReq=true;
    loadBakedTexture('assets/img/textures/debris.webp',
      function(t){ _impRockTex=t; if(_astMats[1]){ _astMats[1].map=t; _astMats[1].color.setHex(0xffffff); _astMats[1].needsUpdate=true; } },
      undefined, function(){});
  }
  return _impRockTex;
}
/* ---- asteroid render pools: geometry/material/sprites are reused across strikes
   instead of allocated + disposed per shot, which was causing GC/GPU hitches on
   tablets. Identical visuals (6 shape variants + random tumble/scale). ---- */
let _astRockGeos=null, _astRoundGeo=null, _astGlowMat=null;
const _astMats=[];
const _astRigPool=[], _flashPool=[], _shockPool=[];
function astRockGeos(){
  if(_astRockGeos) return _astRockGeos;
  _astRockGeos=[]; for(let i=0;i<6;i++) _astRockGeos.push(makeRockGeo(11,8,(0x9e37+i*0x61c88647)>>>0));
  return _astRockGeos;
}
function astRoundGeo(){ return _astRoundGeo || (_astRoundGeo=new THREE.SphereGeometry(1,32,24)); }
function astMaterialFor(i){
  if(_astMats[i]) return _astMats[i];
  if(i===0) _astMats[i]=new THREE.MeshStandardMaterial({color:0xdceeff, roughness:0.55, metalness:0,
    emissive:0x142236, emissiveIntensity:0.18});
  else if(i===2) _astMats[i]=new THREE.MeshStandardMaterial({color:0x5e5f63, roughness:0.72, metalness:0.72,
    emissive:0x120b08, emissiveIntensity:0.08});
  else {
    const t=impRockTex();
    _astMats[i]=new THREE.MeshStandardMaterial({map:t||null, color:t?0xffffff:0x8a7767, roughness:0.95, emissive:0x1c0e06});
  }
  return _astMats[i];
}
function astMaterial(){ return astMaterialFor(impMatI); }
function impAsteroidIsRound(){
  return impDiaKm >= (IMP_MATS[impMatI][3]||800);
}
function astGlowMat(){
  if(_astGlowMat) return _astGlowMat;
  const glowMap=_astGlowTex||(_astGlowTex=glowCanvasTex('rgba(255,190,120,0.9)','rgba(255,110,40,0.32)'));
  _astGlowMat=new THREE.SpriteMaterial({map:glowMap,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  return _astGlowMat;
}
function acquireAstRig(){
  let rig=_astRigPool.pop();
  if(!rig){ const mesh=new THREE.Mesh(astRockGeos()[0], astMaterial());
    const sp=new THREE.Sprite(astGlowMat()); sp.scale.setScalar(5); mesh.add(sp);
    rig={mesh}; scene.add(mesh); }
  const geos=astRockGeos();
  rig.mesh.geometry=impAsteroidIsRound()?astRoundGeo():geos[(Math.random()*geos.length)|0];   // large bodies round off
  rig.mesh.material=astMaterialFor(impMatI);
  rig.mesh.rotation.set(Math.random()*6.28,Math.random()*6.28,Math.random()*6.28);
  rig.mesh.visible=true;
  return rig;
}
function releaseAstRig(rig){ rig.mesh.visible=false; _astRigPool.push(rig); }
/* pooled one-shot fx sprite (flash/shock): grab an idle one, or make a new one */
function acquireFxSprite(pool, tex){
  let sp=pool.pop();
  if(!sp){ sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false})); scene.add(sp); }
  sp.visible=true; sp.material.opacity=1;
  return sp;
}
const impRC=new THREE.Raycaster();
const _impV1=new THREE.Vector3(), _impV2=new THREE.Vector3(), _impV3=new THREE.Vector3();

function impBaseMassKg(rec){                                // book/custom mass before damage or accretion
  if(rec.data.massKg) return rec.data.massKg;               // exact, from the author's .ubox
  const R=(rec.data.radiusKm||1000)*1000;
  return (impDensityByKind[rec.data.kind]||3500)*(4/3)*Math.PI*R*R*R; }
function impBodyMassKg0(rec){ return impBaseMassKg(rec)+(rec._accretedKg||0); }
/* ---- mass loss: once a world is superheated, further energy boils material
   off into space (the escaping tail). Stateless, from cumulative dmgJ:
   rocky worlds lose mass past the whole-body melt budget, paying vaporization
   + escape energy per kg; a puffed giant's envelope only has to be lifted. */
const IMP_VAP_EJKG={icemoon:3.2e6, iceworld:3.2e6, ocean:5e6};  // J/kg to heat + vaporize; rock default
function impVapEJkg(rec){
  const c=rec.data.comp;
  if(c) return Math.max(8e5, 1.4e7*((c.rock||0)+(c.iron||0)) + 3.1e6*(c.water||0) + 5e5*(c.gas||0));
  return IMP_VAP_EJKG[rec.data.kind]||1.4e7;
}
function impMassLostKg(rec){
  if(!(rec.dmgJ>0)||impImmune(rec)) return 0;
  const M0=impBodyMassKg0(rec), R=(rec.data.radiusKm||1000)*1000;
  const eEsc=IMP_G*M0/R;
  let over, eKg;
  if(rec.data.kind==='gasgiant'||impIsStellar(rec)){        // loss starts with the escaping-gas tail
    over=(rec.dmgJ||0)-0.05*(3*IMP_G*M0*M0/(5*R)); eKg=eEsc;
  } else {
    const U0=3*IMP_G*M0*M0/(5*R);
    const P=impMeltPhases(rec);
    let lost=0;
    if(P.W>0){                                              // water worlds shed STEAM first:
      const ov2=(rec.dmgJ||0)-P.E2;                         // once the oceans have boiled, ~35% of
      if(ov2>0) lost+=Math.min(0.8*P.W*M0, 0.35*ov2/eEsc);  // further energy lofts vapor to escape
    }
    // rock vapor only once superheated: fully molten, or (small cold moons) nearing breakup
    over=(rec.dmgJ||0)-Math.min(P.E3, 0.25*U0); eKg=impVapEJkg(rec)+eEsc;
    if(over>0) lost+=over/eKg;
    return Math.min(0.5*M0, lost);                          // ≥ that and breakup wins anyway
  }
  if(over<=0) return 0;
  return Math.min(0.5*M0, over/eKg);                        // ≥ that and breakup wins anyway
}
function impBodyMassKg(rec){ return impBodyMassKg0(rec)-impMassLostKg(rec); }
function impMassChangedFrac(rec){
  const M0=impBaseMassKg(rec), M=impBodyMassKg(rec);
  return M0>0 ? Math.abs(M/M0-1) : 0;
}
function impMassNowTxt(rec){                                // "1.98 M⊕ (+0.3 %)" for the info panel
  const M0=impBaseMassKg(rec), M=impBodyMassKg(rec), df=M0>0?M/M0-1:0;
  const me=M/5.972e24;
  const mtxt = me>=0.01 ? (+me.toPrecision(3))+' M⊕' : M.toExponential(2).replace('e+','e')+' kg';
  const p = Math.abs(df)<0.10 ? (Math.abs(df)*100).toFixed(1) : String(Math.round(Math.abs(df)*100));
  return mtxt+' ('+(df>=0?'+':'−')+p+' %)';
}
function impBodyRho(rec){ const R=(rec.data.radiusKm||1000)*1000;
  return impBodyMassKg0(rec)/((4/3)*Math.PI*R*R*R); }       // bulk density of the surviving body
function impIsStellar(rec){ return rec && (rec.data.kind==='star'||rec.data.kind==='browndwarf'); }
function impEscapeKms(rec){
  const R=(rec.data.radiusKm||1000)*1000;
  return Math.sqrt(2*IMP_G*impBodyMassKg0(rec)/R)/1000;
}
/* what fraction of a disrupted body flashes to gas: its H/He envelope plus
   its water (steam, at breakup temperatures) — from the .ubox depots */
function impGasFrac(rec){
  if(rec.data.comp) return Math.min(0.97,(rec.data.comp.gas||0)+(rec.data.comp.water||0));
  if(rec.data.debrisGas!=null) return rec.data.debrisGas;
  const GK={gasgiant:0.8, browndwarf:0.9, ocean:0.35, iceworld:0.3, icemoon:0.3, terran:0.22, lava:0.1, rocky:0.12};
  return GK[rec.data.kind]!=null?GK[rec.data.kind]:0.2;
}
function impBindingJ(rec){ const R=(rec.data.radiusKm||1000)*1000, M=impBodyMassKg(rec);
  return 3*IMP_G*M*M/(5*R); }
function impImmune(rec){ return rec.external&&!rec._generated; }
function impLocalRadius(rec){ return rec._impactLocalRadius||rec.radius; }
function impRenderRadius(rec){ return impLocalRadius(rec)*rec.mesh.getWorldScale(new THREE.Vector3()).x; }
function impKE(){ return 0.5*impRho*(Math.PI/6)*Math.pow(impDiaKm*1000,3)*Math.pow(impSpdKms*1000,2); }
function impWaterRetainedFrac(rec, imp){
  if(!imp || imp.matI!==0 || impImmune(rec) || impIsStellar(rec)) return 0;
  const vEsc=impEscapeKms(rec);
  const vImp=Math.max(1,imp.vKms||impSpdKms);
  const grav=(vEsc*vEsc)/(vEsc*vEsc+Math.pow(0.45*vImp,2));
  const kind=rec.data.kind;
  const bodyK = kind==='gasgiant' ? 0.85 :
    (kind==='ocean'||kind==='terran'||kind==='iceworld'||kind==='icemoon') ? 0.72 : 0.55;
  return Math.max(0, Math.min(0.9, grav*bodyK));
}
function impDeliverWater(rec, imp){
  const f=impWaterRetainedFrac(rec,imp);
  if(!(f>0)) return 0;
  const kg=(imp.mKg||0)*0.9*f;               // ice bodies are mostly water ice, not pure H2O by mass
  if(!(kg>0)) return 0;
  rec._impWaterKg=(rec._impWaterKg||0)+kg;
  return kg;
}
function impBlastAbsorption(rec){
  const k=rec.data.kind;
  if(k==='star'||k==='browndwarf'||k==='gasgiant') return 0.35;
  if(k==='ocean'||k==='iceworld'||k==='icemoon') return 0.72;
  return 0.62;
}
function impUvFromWorldDir(rec, dirWorld){
  const q=rec.mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
  const d=dirWorld.clone().applyQuaternion(q).normalize();
  const theta=Math.acos(Math.max(-1,Math.min(1,d.y)));
  let u=Math.atan2(d.z,-d.x)/(Math.PI*2); if(u<0) u+=1;
  return {u, v:1-theta/Math.PI};
}
function displayVectorFromAU(v){
  const r=v.length();
  if(r<1e-12) return new THREE.Vector3();
  const d=distDisp(r);
  return v.clone().multiplyScalar(d/r);
}
function positionFreeBody(rec){
  if(!rec.freeState) return;
  rec.holder.position.copy(displayVectorFromAU(rec.freeState.r));
}
function raStateOf(rec){
  if(!rec || rec.data.kind==='star') return {r:new THREE.Vector3(), v:new THREE.Vector3()};
  if(rec.nb){                       // N-body mode: true state, star-relative like everyone else
    const star=nbStar(), sr=star&&star.nb?star.nb:null;
    return sr ? {r:rec.nb.r.clone().sub(sr.r), v:rec.nb.v.clone().sub(sr.v)}
              : {r:rec.nb.r.clone(), v:rec.nb.v.clone()};
  }
  if(rec.freeState) return {r:rec.freeState.r.clone(), v:rec.freeState.v.clone()};
  if(rec.helio){
    const a=rec.helioA!=null?rec.helioA:rec.data.dist;
    return keplerStateAU(a, rec.e, rec.q, rec.M%(Math.PI*2), MU_RA);
  }
  if(rec.isMoon){
    const pRec=bodies.find(b=>b.holder===rec.parentHolder);
    const a=rec._physA!=null?rec._physA:rec.data.dist;
    const muP=4*Math.PI*Math.PI*(impBodyMassKg(pRec||rec)/SUN_KG);
    const ms=keplerStateAU(a, rec.e, rec.q, rec.M%(Math.PI*2), muP);
    const ps=raStateOf(pRec);
    return {r:ps.r.add(ms.r), v:ps.v.add(ms.v)};
  }
  return {r:new THREE.Vector3(), v:new THREE.Vector3()};
}

/* Lumpy-rock geometry: displace a sphere by smooth 3D noise of each vertex's
   DIRECTION. Seam/pole vertices are duplicated in SphereGeometry — noise keyed
   on position moves the duplicates identically, keeping the mesh watertight
   (per-vertex random jitter tore it open like crumpled paper). */
function makeRockGeo(wSeg,hSeg,seed){
  const g=new THREE.SphereGeometry(1,wSeg,hSeg), pa=g.attributes.position;
  const fbm=makeNoise3(seed>>>0), v=new THREE.Vector3();
  for(let i=0;i<pa.count;i++){
    v.set(pa.getX(i),pa.getY(i),pa.getZ(i)).normalize();
    const f=0.84 + 0.30*fbm(v.x*1.6+3.7, v.y*1.6+3.7, v.z*1.6+3.7, 4)
                 + 0.07*fbm(v.x*4.5, v.y*4.5, v.z*4.5, 3);
    pa.setXYZ(i, v.x*f, v.y*f, v.z*f);
  }
  g.computeVertexNormals();
  return g;
}

/* Three's SphereGeometry: phi=u·2π, theta=(1−uv.y)·π (see its source) —
   lets us convert a raycast uv to the exact point on the (spinning) mesh. */
function uvToLocal(rec, u, v, out){
  const phi=u*Math.PI*2, theta=(1-v)*Math.PI, st=Math.sin(theta);
  return out.set(-Math.cos(phi)*st, Math.cos(theta), Math.sin(phi)*st).multiplyScalar(impLocalRadius(rec));
}
function uvToWorld(rec, u, v){ return rec.mesh.localToWorld(uvToLocal(rec,u,v,new THREE.Vector3())); }

/* ---- persistent scars: two canvas-textured overlay spheres per body (lazy).
   Children of rec.mesh, so they inherit spin and the per-frame size scaling
   (same pattern as the atmospheres). char = permanent dark marks; glow =
   additive heat that cools via destination-out fades. ---- */
function getScars(rec){
  if(rec.scar) return rec.scar;
  // texture uploads are the mobile bottleneck: every needsUpdate re-sends the
  // whole canvas to the GPU. Half resolution on touch devices = 4× cheaper.
  const generated=!!rec._generated;
  const SW=(MOBILE_UI||generated)?512:1024, SH=SW/2;
  // overlay spheres are HIGH-poly (≥ the body's 64×48) so the high-contrast lava
  // texture doesn't warp across coarse triangles → that was the "mesh screen" grid
  const SEG=generated?64:(MOBILE_UI?96:128), SEGH=generated?48:(MOBILE_UI?64:96);
  // char (dark scars) + lava now SHARE one canvas — fewer stacked translucent overlay
  // passes → less mobile moiré. char is painted 'destination-over' so lava stays on top.
  const glowC=newCanvas(SW,SH), meltC=newCanvas(SW,SH), baseC=newCanvas(SW,SH);
  const glowT=new THREE.CanvasTexture(glowC), meltT=new THREE.CanvasTexture(meltC);
  // plain linear filtering, NO mipmaps — mipmapping a sparse high-contrast overlay moirés on mobile
  for(const t of [glowT,meltT]){ t.generateMipmaps=false; t.minFilter=THREE.LinearFilter; t.magFilter=THREE.LinearFilter; }
  const overlayMat=(map,extra)=>new THREE.MeshBasicMaterial(Object.assign(
    {map,transparent:true,depthWrite:false}, extra||{}));
  const lr=impLocalRadius(rec);
  const mM=new THREE.Mesh(new THREE.SphereGeometry(lr*1.008,SEG,SEGH), overlayMat(meltT));
  const mG=new THREE.Mesh(new THREE.SphereGeometry(lr*1.016,SEG,SEGH),
    overlayMat(glowT,{blending:THREE.AdditiveBlending}));
  mM.renderOrder=2; mG.renderOrder=4;
  rec.mesh.add(mM); rec.mesh.add(mG);
  const HW=(MOBILE_UI||generated)?64:192, HH=HW/2;   // finer grid = smoother heat fronts (desktop)
  rec.scar={glowC,meltC,baseC,glowT,meltT,mM,mG,coolT:0,hot:0,ocean:null,oceanM:0,log:[],dirty:false,upT:0,
    heatW:HW,heatH:HH,heat:new Float32Array(HW*HH),heatTmp:new Float32Array(HW*HH),
    heatT:0,heatPaintT:0,heatMax:0,heatActive:false,heatDirty:false,laserLogT:0};
  rec.dmgJ=rec.dmgJ||0;
  impScarred.push(rec);
  // Android canvas wipe: replay the permanent char + lava marks onto the one canvas
  regCanvasTex(meltT, function(){
    impReplayScarBase(rec.scar);
    impPaintHeat(rec, rec.scar, true);
  });
  return rec.scar;
}
function scarLog(s, l, u, v, r, style, a){
  s.log.push({l,u,v,r,s:style,a});
  if(s.log.length>2600) s.log.splice(0,600);            // cap: long laser burns
}
function impReplayScarBase(s){
  const bc=s.baseC||s.meltC, mc=bc.getContext('2d');
  mc.clearRect(0,0,bc.width,bc.height);
  for(const L of s.log){
    mc.globalCompositeOperation = L.l==='c' ? 'destination-over' : 'source-over';  // char behind lava
    if(L.a!=null){ mc.save(); mc.globalAlpha=L.a; impSplat(mc,L.u,L.v,L.r,L.s); mc.restore(); }
    else impSplat(mc,L.u,L.v,L.r,L.s);
  }
  mc.globalAlpha=1; mc.globalCompositeOperation='source-over';
  if(s.baseC){
    const out=s.meltC.getContext('2d');
    out.clearRect(0,0,s.meltC.width,s.meltC.height);
    out.drawImage(s.baseC,0,0);
  }
}
function impPersistentSplat(s, l, u, v, r, style, a){
  const draw=function(ctx){
    ctx.globalCompositeOperation = l==='c' ? 'destination-over' : 'source-over';
    if(a!=null){ ctx.save(); ctx.globalAlpha=a; impSplat(ctx,u,v,r,style); ctx.restore(); }
    else impSplat(ctx,u,v,r,style);
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  };
  if(s.baseC) draw(s.baseC.getContext('2d'));
  draw(s.meltC.getContext('2d'));
  scarLog(s,l,u,v,r,style,a); s.dirty=true;
}
function impResetHeat(s){
  if(!s || !s.heat) return;
  s.heat.fill(0); s.heatTmp.fill(0);
  s.heatT=0; s.heatPaintT=0; s.heatMax=0; s.heatMeltFrac=0; s.heatActive=false; s.heatDirty=false; s.hot=0;
}
/* ---- melting tiers, from the real energy budget. Heating rock to ~1700 K
   plus the latent heat of fusion costs ~1.7 MJ/kg (ice much less), so melting
   a WHOLE world costs mass·that — for an Earth-like planet only a few percent
   of its binding energy (global magma oceans come long before breakup), while
   a small moon costs MORE to melt than to shatter, so it cracks apart still
   cold. Per strike, ~25% of the kinetic energy ends up as impact melt:
   V = 0.25·E/(ρ·e_melt) — a lava sea painted at its true size. ---- */
const IMP_MELT_EJKG={icemoon:9e5, iceworld:9e5, ocean:1.2e6};   // J/kg to heat + melt; rock default
function impMeltEJkg(rec){
  const c=rec.data.comp;                                     // composition-weighted, when known
  if(c) return Math.max(4e5, 1.7e6*((c.rock||0)+(c.iron||0)) + 2.8e6*(c.water||0) + 1.0e6*(c.gas||0));
  return IMP_MELT_EJKG[rec.data.kind]||1.7e6;
}
function impMeltJ(rec){ return impBodyMassKg(rec)*impMeltEJkg(rec); }   // melt the whole body
/* ---- water-rich worlds melt in PHASES, each with its real energy cost:
   thaw the ice (~0.7 MJ/kg: heat from ~100 K + latent heat of fusion) →
   liquid oceans; keep pumping (~2.7 MJ/kg: heat to 373 K + vaporization) →
   the oceans boil into a global steam atmosphere; only then does the rock
   underneath melt (~1.7 MJ/kg) into the familiar magma ocean. ---- */
function impWaterFrac(rec){
  const c=rec.data.comp;
  let w = c ? (c.water||0) : ({icemoon:0.4, iceworld:0.4, ocean:0.5}[rec.data.kind]||0);
  if(rec._impWaterKg>0) w += rec._impWaterKg/impBodyMassKg0(rec);
  // surface-ocean worlds (terran/ocean) always have oceans to boil — the .ubox BULK
  // composition can read ~0 water (e.g. Satis) because oceans are a thin surface layer,
  // which otherwise made them skip the boiling stage entirely
  if(impLiquidSurface(rec)) w=Math.max(w, 0.03);
  return Math.min(0.95,w);
}
// worlds whose water is already LIQUID at the surface (Earth-likes, ocean worlds):
// they skip the thaw phase and boil directly, and their base texture already shows water
function impLiquidSurface(rec){ const k=rec.data.kind; return k==='ocean'||k==='terran'; }
// how THICK the boiled steam / thawed water should look: surface-ocean worlds
// (Earth) get a full shroud; everything else scales by bulk water fraction, so a
// world with only a trace of subsurface ice (Mars, 1%) gets a faint veil, not a flood.
function impWaterVis(rec){
  if(impLiquidSurface(rec)) return 1;
  return Math.min(1, impWaterFrac(rec)/0.12);
}
function impMeltPhases(rec){
  const M=impBodyMassKg0(rec), W=impWaterFrac(rec);
  const E3=M*impMeltEJkg(rec);
  let E1=impLiquidSurface(rec)?0:M*W*7e5;        // liquid-surface worlds start already liquid (no thaw)
  let E2=E1+M*W*2.7e6;
  E2=Math.min(E2,E3*0.92); E1=Math.min(E1,E2*0.7);
  return {W,E1,E2,E3};
}
function impMeltPoolDeg(rec,E){              // angular radius of the lava sea one strike leaves
  const rho=impBodyRho(rec);
  const V=0.25*E/(rho*impMeltEJkg(rec));                        // m³ of melt
  const r=Math.cbrt(V*3/(2*Math.PI));                           // hemispherical pool
  return Math.min(80, r/((rec.data.radiusKm||1000)*1000)*57.2958);
}
function impCraterDeg(rec,E){                // gravity-regime π-scaling D ∝ E^0.28, anchored at Chicxulub (180 km)
  const Dkm=180*Math.pow(E/IMP_CHICXULUB_J,0.28);
  return Math.min(80, Dkm*0.5/(rec.data.radiusKm||1000)*57.2958);
}
function getMagmaOcean(rec){                 // lazy: a self-luminous molten-surface shell
  const s=getScars(rec);
  if(s.ocean) return s.ocean;
  impShellBudget--;                          // heavy canvas bake — one per frame globally
  const seed=(rec.data.key||'x').split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)>>>0;
  // vivid orange lava — brighter than the old dark-brown palette so molten reads hot
  // during a blast-wave cascade a dozen worlds bake shells back-to-back —
  // half-res keeps each of those frames short (lava noise hides the difference)
  const SWo=(MOBILE_UI||impBlastQueue.length||stellarBlasts.length)?512:1024;
  const genO=()=>texRocky({b:'#5a1204', base:'#b83c0a', a:'#ff7a1e', c:'#ffd24a'},
    (seed^0x9e37)>>>0, {glow:'#fff0b0', w:SWo, h:SWo/2});
  const cv=genO();
  const t=new THREE.CanvasTexture(cv);
  t.generateMipmaps=false; t.minFilter=THREE.LinearFilter; t.magFilter=THREE.LinearFilter;  // no moiré
  t.wrapS=THREE.RepeatWrapping;                                 // wraps → the magma can churn
  regCanvasTex(t, function(){ cv.getContext('2d').drawImage(genO(),0,0); });  // Android canvas wipe
  const m=new THREE.Mesh(new THREE.SphereGeometry(impLocalRadius(rec)*1.016,MOBILE_UI?96:128,MOBILE_UI?64:96),
    new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:0, depthWrite:false}));
  m.renderOrder=3;
  rec.mesh.add(m);
  s.ocean=m;
  return m;
}
function getWaterOcean(rec){                 // thawed ice: a liquid-water shell
  const s=getScars(rec);
  if(s.wocean) return s.wocean;
  impShellBudget--;                          // heavy canvas bake — one per frame globally
  const seed=((rec.data.key||'x').split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)^0x51f7)>>>0;
  // coverage is BAKED per body: a water-rich world floods globally, a trace-water
  // world (Mars, 1%) only pools in polar basins → polar lakes, not a global flood
  const cov=impWaterVis(rec);
  const SW2=512, SH2=256;   // soft alpha-noise shell — 512 reads identically and bakes ~4x faster
  const cv=newCanvas(SW2,SH2);
  const paint=()=>{
    const ctx=cv.getContext('2d');
    const img=ctx.createImageData(SW2,SH2), d=img.data;
    const fbm=makeNoise3(seed);
    for(let y=0;y<SH2;y++){ const v=y/SH2, lat=Math.abs(v-0.5)*2;
      const polar=smooth(0.5,0.92,lat);                    // cold traps: water collects at the poles
      for(let x=0;x<SW2;x++){ const u=x/SW2, ang=u*Math.PI*2;
        const basin=ring(fbm,ang,v,8,7,5,0)*0.5+0.5;       // 0..1, low = deep basin
        const ripple=ring(fbm,ang,v,26,22,3,60)*0.5+0.5;
        const aff=(1-basin)*0.5 + polar*0.8;               // affinity for water: basins + poles
        const a=smooth((1-cov)-0.12,(1-cov)+0.12, aff);    // wet where affinity beats the fill level
        const t2=Math.max(0,Math.min(1, ripple*0.7 + basin*0.3));
        const o=(y*SW2+x)*4;
        d[o]  = Math.round(10 + 60*t2);                    // deep navy → lighter blue highlights
        d[o+1]= Math.round(50 + 100*t2);
        d[o+2]= Math.round(110 + 100*t2);
        d[o+3]= Math.round(a*255);
      }
    }
    ctx.putImageData(img,0,0);
  };
  paint();
  const t=new THREE.CanvasTexture(cv);
  t.generateMipmaps=false; t.minFilter=THREE.LinearFilter; t.magFilter=THREE.LinearFilter;
  t.wrapS=THREE.RepeatWrapping;
  regCanvasTex(t,paint);
  const m=new THREE.Mesh(new THREE.SphereGeometry(impLocalRadius(rec)*1.006,MOBILE_UI?96:128,MOBILE_UI?64:96),
    new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:0, depthWrite:false}));
  m.renderOrder=3;
  rec.mesh.add(m);
  s.wocean=m;
  return m;
}
function getSteamShroud(rec){                // boiled-off oceans: a global white cloud deck
  const s=getScars(rec);
  if(s.steam) return s.steam;
  impShellBudget--;                          // heavy canvas bake — one per frame globally
  const seed=((rec.data.key||'x').split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)^0xbead)>>>0;
  const SW2=512, SH2=256;   // soft alpha-noise shell — 512 reads identically and bakes ~4x faster
  const cv=newCanvas(SW2,SH2);
  const paint=()=>{
    const ctx=cv.getContext('2d');
    const img=ctx.createImageData(SW2,SH2), d=img.data;
    const fbm=makeNoise3(seed);
    for(let y=0;y<SH2;y++){ const v=y/SH2;
      for(let x=0;x<SW2;x++){ const u=x/SW2, ang=u*Math.PI*2;
        const n =ring(fbm,ang,v,7,6,5,0)*0.5+0.5;
        const n2=ring(fbm,ang,v,18,14,4,40)*0.5+0.5;
        // denser than a thin cloud deck: a boiled-ocean world should read as
        // solidly steam-shrouded (per-body opacity via wvis still thins Mars etc.)
        const a=Math.max(0,Math.min(1,(n*0.6+n2*0.4-0.04)*1.85));
        const o=(y*SW2+x)*4;
        d[o]=234; d[o+1]=239; d[o+2]=244; d[o+3]=a*255;
      }
    }
    ctx.putImageData(img,0,0);
  };
  paint();
  const t=new THREE.CanvasTexture(cv);
  t.generateMipmaps=false; t.minFilter=THREE.LinearFilter; t.magFilter=THREE.LinearFilter;
  t.wrapS=THREE.RepeatWrapping;
  regCanvasTex(t,paint);
  const m=new THREE.Mesh(new THREE.SphereGeometry(impLocalRadius(rec)*1.026,MOBILE_UI?96:128,MOBILE_UI?64:96),
    new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:0, depthWrite:false}));
  m.renderOrder=6;
  rec.mesh.add(m);
  s.steam=m;
  return m;
}
/* ONE adaptive limb-glow (fresnel rim) that recolours per state — orange when the
   surface is molten, pale blue-white when steaming — instead of two stacked shells
   (one fewer translucent overlay pass → less mobile moiré). */
const _MAGMA_HALO=new THREE.Color(0xff6a22), _STEAM_HALO=new THREE.Color(0xdfe9f2);
function getMeltHalo(rec){
  const s=getScars(rec);
  if(s.halo) return s.halo;
  s.halo=makeAtmosphere(impLocalRadius(rec)*1.055, 0xff6a22, 0);
  s.halo.renderOrder=5;
  rec.mesh.add(s.halo);
  return s.halo;
}
/* ---- gas/ice giants have no surface to melt: pumping energy into the
   envelope makes it PUFF UP like an inflated hot Jupiter — the radius swells,
   the envelope glows from the heat, and gas streams away in an escaping tail.
   At the binding energy it still comes apart completely. ---- */
function impUpdatePuff(rec){
  const f=Math.min(1,(rec.dmgJ||0)/impBindingJ(rec));
  rec.puffTarget=1+0.55*Math.pow(f,0.7);                    // up to +55% radius near breakup
  const m=rec.mesh.material;
  if(m && m.emissive){
    if(!rec._baseEmissive) rec._baseEmissive={c:m.emissive.clone(), i:m.emissiveIntensity||0};
    m.emissive.copy(rec._baseEmissive.c).lerp(new THREE.Color(0xff7733), Math.min(1,f*1.6));
    m.emissiveIntensity=rec._baseEmissive.i+1.3*f;          // heated envelope glows
  }
  if(f>0.05 && rec.data.kind!=='star') impBoostTail(rec,f);  // Ra itself has no orbiting tail at a=0
}
function impBoostTail(rec,f){                               // escaping-material tail (mass loss made visible)
  let t=rec._puffTail || evapTails.find(x=>x.rec===rec);    // Amunet already trails one — boost it
  if(!t){ t=makeEvapTail(rec,{alpha:0.3,rate:1}); t._created=true; t.points.visible=showTails; }
  if(!t._base) t._base={rate:t.rate, alpha:t.points.material.uniforms.uAlpha.value};
  t.rate=t._base.rate*(1+3.5*f);
  t.points.material.uniforms.uAlpha.value=Math.max(t._base.alpha, 0.3+1.1*f);
  rec._puffTail=t;
}
function impApplyMeltVisual(rec){
  const s=rec.scar; if(!s) return;
  const m=s.oceanM||0, hot=s.oceanHot||0, wat=s.waterM||0, stm=s.steamM||0;
  // each first-time shell is a ~full-res procedural bake; when a supernova wave
  // superheats a dozen worlds at once, budget the builds (existing shells are
  // free — a deferred one just eases in a frame or two later)
  if(wat>0.01 && (s.wocean || impShellBudget>0)) getWaterOcean(rec).material.opacity=Math.min(1,wat);
  else if(s.wocean) s.wocean.material.opacity=0;
  if(stm>0.01 && (s.steam || impShellBudget>0)) getSteamShroud(rec).material.opacity=Math.min(1,stm*1.25);
  else if(s.steam) s.steam.material.opacity=0;
  const magmaHalo=1.6*(0.5*m+0.7*hot), steamHalo=1.2*stm*(1-hot);
  if(magmaHalo>0.001 || steamHalo>0.001){
    const h=getMeltHalo(rec).material.uniforms;
    if(magmaHalo>=steamHalo){ h.c.value.copy(_MAGMA_HALO); h.p.value=magmaHalo; }
    else { h.c.value.copy(_STEAM_HALO); h.p.value=steamHalo; }
  } else if(s.halo) s.halo.material.uniforms.p.value=0;
  if(m<=0 && hot<=0){ if(s.ocean) s.ocean.material.opacity=0; return; }
  if(!s.ocean && impShellBudget<=0) return;    // defer the bake to a later frame
  const o=getMagmaOcean(rec);
  o.material.opacity=Math.min(1, m*(1.1+0.2*hot));
  o.material.color.setScalar(1.5+0.5*m+1.8*hot);
}
function impEaseMeltVisual(rec,dt){
  const s=rec.scar;
  if(!s || rec._generated || rec.data.kind==='gasgiant' || impIsStellar(rec)) return;
  const ease=(cur,t,rate)=>cur+(t-cur)*Math.min(1,dt*rate);
  const heatM=Math.min(1,s.heatMeltFrac||0);
  const mT=Math.max(s.meltTarget||0, heatM);
  s.oceanM=ease(s.oceanM||0, mT, mT>(s.oceanM||0)?0.55:0.10);
  s.oceanHot=ease(s.oceanHot||0, s.oceanHotTarget||0, 0.45);
  s.waterM=ease(s.waterM||0, s.waterTarget||0, 0.75);
  s.steamM=ease(s.steamM||0, s.steamTarget||0, 0.55);
  impApplyMeltVisual(rec);
}
/* ---- extinction tiers: life is more fragile than crust. A living world that
   absorbs ≥ IMP_EXTINCT_J (~239 petatons TNT) loses all MULTICELLULAR life —
   its vegetation is scrubbed from the surface map and the sidebar tag drops
   to "unicellular". Past IMP_STERILE_J (1 exaton TNT) ALL life dies: any
   life-tagged world (Satis, Earth, Nephtys, Uat-Ur, Nu) goes fully sterile.
   🧽 Heal resurrects the biosphere along with everything else. ---- */
const IMP_EXTINCT_J=1e27;                    // multicellular extinction (vegKill worlds)
const IMP_STERILE_J=4.184e27;                // 1 Et TNT: total sterilization (all life tags)
function impCheckExtinct(rec){
  if(!rec.data.life || rec.destroyed) return;
  const E=rec.dmgJ||0;
  if(!rec.sterile && E>=IMP_STERILE_J) impGoExtinct(rec,true);
  else if(!rec.extinct && rec.data.vegKill && E>=IMP_EXTINCT_J) impGoExtinct(rec,false);
}
function impGoExtinct(rec, sterile){
  rec.extinct=true;
  if(sterile) rec.sterile=true;
  if(rec.data.vegKill) impKillVegetation(rec);
  updateNavStatus(rec);
  if(APP.currentData && APP.currentData.key===rec.data.key &&
     document.getElementById('info').classList.contains('open')) openInfo(rec.data);
}
/* scrub the vegetation hue family from whatever map is live — the procedural
   canvas, the AI-baked webp or the real photo texture all expose a drawable
   .image. Veg pixels are blended toward a luminance-matched barren tan;
   oceans, ice and clouds are left alone. */
function impKillVegetation(rec){
  if(rec._vegKilled) return;
  const mat=rec.mesh&&rec.mesh.material; if(!mat||!mat.map) return;
  const img=mat.map.image;
  if(!img || !(img.width>0)){                // baked map still in flight — retry shortly
    setTimeout(function(){ if(rec.extinct) impKillVegetation(rec); }, 400);
    return;
  }
  const W=Math.min(2048,img.width), H=Math.round(W*(img.height/img.width));
  const cv=newCanvas(W,H), cx=cv.getContext('2d');
  const purple=rec.data.vegKill==='purple';
  const kill=function(){                     // draw the source map, scrub the veg hues
    cx.drawImage(img,0,0,W,H);
    try{
      const im=cx.getImageData(0,0,W,H), d=im.data;
      for(let i=0;i<d.length;i+=4){
        const r=d[i], g=d[i+1], b=d[i+2];
        const veg = purple ? (r>g*1.12 && b>g*1.12 && r+b>110)
                           : (g>r*1.04 && g>b*1.04 && g>34);
        if(!veg) continue;
        const lum=0.30*r+0.55*g+0.15*b;
        // barren regolith tinted by the original brightness
        d[i]  =Math.round(r*0.15 + (lum*0.72+58)*0.85);
        d[i+1]=Math.round(g*0.15 + (lum*0.66+44)*0.85);
        d[i+2]=Math.round(b*0.15 + (lum*0.55+30)*0.85);
      }
      cx.putImageData(im,0,0);
      return true;
    }catch(_){ return false; }               // tainted canvas (file:// photo) — keep the live map
  };
  if(!kill()) return;
  if(rec._extinctTex){ unregCanvasTex(rec._extinctTex); rec._extinctTex.dispose(); }  // re-kill after a late baked load
  const src=mat.map;
  const tex=new THREE.CanvasTexture(cv);
  tex.anisotropy=src.anisotropy||4; tex.wrapS=src.wrapS; tex.wrapT=src.wrapT;
  if(src.encoding!==undefined) tex.encoding=src.encoding;
  regCanvasTex(tex, function(){              // Android canvas-wipe survival
    if(!rec.extinct || mat.map!==tex) return;
    kill(); tex.needsUpdate=true;
  });
  rec._preExtinctMap=src;
  rec._extinctTex=tex;
  rec._vegKilled=true;
  mat.map=tex; mat.needsUpdate=true;
}
function impHealExtinct(rec){                // 🧽: the biosphere comes back too
  if(!rec.extinct && !rec.sterile) return;
  rec.extinct=false; rec.sterile=false;
  if(rec._vegKilled){
    const mat=rec.mesh&&rec.mesh.material;
    if(mat && rec._preExtinctMap){ mat.map=rec._preExtinctMap; mat.needsUpdate=true; }
    if(rec._extinctTex){ unregCanvasTex(rec._extinctTex); rec._extinctTex.dispose(); rec._extinctTex=null; }
    rec._preExtinctMap=null; rec._vegKilled=false;
  }
  updateNavStatus(rec);
}
function impUpdateMelt(rec){                 // cumulative surface state from the phase budgets
  impCheckExtinct(rec);                      // life dies long before crust does
  if(!rec.scar || impImmune(rec)) return;
  if(rec._generated) return;                 // remnants are already molten; avoid extra full-body overlays.
  if(rec.data.kind==='gasgiant'||impIsStellar(rec)){ impUpdatePuff(rec); return; }
  const s=rec.scar;
  const E=rec.dmgJ||0;
  const fU=E/impBindingJ(rec);
  const P=impMeltPhases(rec);
  const watery=P.W>0;                        // any water boils first (Earth's oceans are tiny in mass but real)
  // phase progress 0..1: thaw → boil → melt the rock
  const ph1 = watery&&P.E1>0 ? Math.min(1,E/P.E1) : 1;
  const ph2 = watery ? Math.max(0,Math.min(1,(E-P.E1)/(P.E2-P.E1))) : 1;
  const ph3 = Math.max(0,Math.min(1,(E-P.E2)/(P.E3-P.E2)));
  // rock-melt coverage (same shaping as before, over the post-steam budget)
  const m = ph3<=0.02 ? 0 : Math.min(1, Math.pow((ph3-0.02)/0.98, 0.6));
  // superheat: past the full budget — or nearing breakup — it runs white-hot
  const hot = Math.min(1, Math.max(ph3>1-1e-9?( E/P.E3-1)/2:0, fU>0.25?(fU-0.25)/0.75:0));
  // wvis scales how much water/steam actually SHOWS — a trace-water world (Mars)
  // gets a faint veil, an ocean world a full shroud
  const wvis = impWaterVis(rec);
  // liquid water: appears as the ice thaws, drowned out as the rock melts,
  // and boiled AWAY as the steam phase completes. Spatial coverage (global ocean
  // vs. polar lakes) is baked into the getWaterOcean texture per water abundance,
  // so opacity here is just the thaw-phase fade — no wvis factor (would double-thin)
  const wat = (watery && !impLiquidSurface(rec))      // liquid-surface worlds already show their water
    ? Math.min(1,Math.pow(ph1,0.7))*(1-ph2)*(1-m) : 0;
  // steam shroud: builds while the oceans boil, then thins away as the rock melts
  // through it (magma coverage m) and as the world superheats — so the glowing
  // surface shows instead of a permanent white ball
  const stm = watery ? Math.min(1,Math.pow(ph2,0.8))*(1-0.85*hot)*Math.max(0,1-1.1*m)*wvis : 0;
  s.meltTarget=m; s.oceanHotTarget=hot; s.waterTarget=wat; s.steamTarget=stm; s.ph={ph1,ph2,ph3};
  // superheated crust boils off as rock vapor — the mass actually leaves (impMassLostKg);
  // a boiling water world sheds its steam the same way (impMassLostKg counts water first)
  if(hot>0.05) impBoostTail(rec, 0.4*hot);
  else if(watery && ph2>0.15 && ph2<1) impBoostTail(rec, 0.25*ph2*wvis);
  impApplyMeltVisual(rec);
}
function impTierTxt(rec){                    // hover readout of the surface state (+ mass boiled off)
  const base=impTierBase(rec);
  if(!base) return base;
  const lf=impMassLostKg(rec)/impBodyMassKg0(rec);
  if(lf>0.001) return base+T('tier-massloss').replace('{p}', lf<0.10?(lf*100).toFixed(1):String(Math.round(lf*100)));
  return base;
}
function impTierBase(rec){
  if(!(rec.dmgJ>0)) return '';
  if(rec.data.kind==='gasgiant'||impIsStellar(rec)){        // no surface — the envelope inflates instead
    const f=rec.dmgJ/impBindingJ(rec);
    if(f>0.5)  return T('tier-puff-3');
    if(f>0.15) return T('tier-puff-2');
    if(f>0.01) return T('tier-puff-1');
    return '';
  }
  const E=rec.dmgJ, fU=E/impBindingJ(rec), P=impMeltPhases(rec);
  const s=rec.scar, visM=s?Math.max(s.oceanM||0,s.heatMeltFrac||0):0;
  if(fU>0.5 && visM>0.6)  return T('tier-white');
  if(E>=P.E3 && visM>0.95) return T('tier-molten');
  const ph3=Math.max(0,(E-P.E2)/(P.E3-P.E2));   // molten fraction of the surface (energy-based)
  const showM=Math.max(visM, Math.min(ph3, s?(s.meltTarget||0):ph3)*0.25);
  if(showM>0.3)  return T('tier-ocean').replace('{p}',Math.round(showM*100));
  if(showM>0.02) return T('tier-regional').replace('{p}',Math.round(showM*100));
  // water worlds show their thaw/boil phases before the rock underneath melts
  if(P.W>0 && ph3<=0.02){
    const ph2=(E-P.E1)/(P.E2-P.E1);
    if(ph2>0.02) return T('tier-steam').replace('{p}',Math.round(Math.min(1,ph2)*100));
    if(!impLiquidSurface(rec) && E>0.05*P.E1){ const ph1=E/P.E1;
      // a trace-water world only pools POLAR lakes — say so, so a player knows where to look
      const key=impWaterVis(rec)<0.5?'tier-thaw-polar':'tier-thaw';
      return T(key).replace('{p}',Math.round(Math.min(1,ph1)*100)); }
  }
  const mf=E/impMeltJ(rec);
  if(mf>1e-4) return T('tier-seas');
  return T('tier-crater');
}
const IMP_CHAR=[[0,'rgba(10,6,5,0.88)'],[0.5,'rgba(14,9,7,0.60)'],[0.8,'rgba(22,13,9,0.28)'],[1,'rgba(22,13,9,0)']];
const IMP_CHAR_SOFT=[[0,'rgba(10,6,5,0.16)'],[0.7,'rgba(14,9,7,0.08)'],[1,'rgba(14,9,7,0)']];
const IMP_GLOW=[[0,'rgba(255,244,214,0.95)'],[0.3,'rgba(255,150,60,0.75)'],[0.7,'rgba(190,45,12,0.35)'],[1,'rgba(190,45,12,0)']];
const IMP_GLOW_SOFT=[[0,'rgba(255,220,150,0.50)'],[0.6,'rgba(255,120,45,0.22)'],[1,'rgba(255,120,45,0)']];
const IMP_LAVA=[[0,'rgba(255,238,180,0.95)'],[0.25,'rgba(255,160,60,0.90)'],[0.55,'rgba(205,58,14,0.72)'],[0.8,'rgba(120,26,10,0.35)'],[1,'rgba(120,26,10,0)']];
const IMP_LAVA_SOFT=[[0,'rgba(255,190,90,0.55)'],[0.5,'rgba(200,60,16,0.30)'],[1,'rgba(200,60,16,0)']];
/* splat at canvas-space (u,v): longitude-stretched near the poles, drawn
   thrice (u−1,u,u+1) so it wraps the 0°/360° seam */
function impSplat(ctx, u, v, rPx, style){
  // rPx is in 512-canvas-height units; adapt to this canvas (mobile is 256-high)
  const W=ctx.canvas.width, H=ctx.canvas.height, r=rPx*(H/512);
  const stretch=1/Math.max(Math.sin(v*Math.PI),0.20), rx=r*stretch;
  for(const du of [-1,0,1]){
    const cx=(u+du)*W, cy=v*H;
    if(cx+rx<0||cx-rx>W) continue;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(rx/r,1);
    const g=ctx.createRadialGradient(0,0,0,0,0,r);
    for(const s of style) g.addColorStop(s[0],s[1]);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}
const IMP_HEAT_STEP=0.085, IMP_HEAT_DIFF=0.17, IMP_HEAT_COOL=0.105;
function impHeatCanvases(s){
  if(s.heatMeltC) return;
  s.heatMeltC=newCanvas(s.heatW,s.heatH); s.heatGlowC=newCanvas(s.heatW,s.heatH);
  const mc=s.heatMeltC.getContext('2d'), gc=s.heatGlowC.getContext('2d');
  s.heatMeltImg=mc.createImageData(s.heatW,s.heatH);
  s.heatGlowImg=gc.createImageData(s.heatW,s.heatH);
}
function impDepositHeat(rec, s, u, v, rPx, amount){
  if(!s.heat || !(amount>0)) return;
  const W=s.heatW, H=s.heatH, heat=s.heat;
  const cy=v*H;
  const ry=Math.max(1.25, rPx*(H/512));
  const stretch=1/Math.max(Math.sin(v*Math.PI),0.20);
  const rx=Math.max(1.25, Math.min(W*0.58, ry*stretch));
  const y0=Math.max(0, Math.floor(cy-ry-1)), y1=Math.min(H-1, Math.ceil(cy+ry+1));
  let max=s.heatMax||0;
  for(let y=y0;y<=y1;y++){
    const dy=(y+0.5-cy)/ry, dy2=dy*dy;
    if(dy2>=1) continue;
    const span=rx*Math.sqrt(1-dy2);
    for(const du of [-1,0,1]){
      const cx=(u+du)*W;
      const x0=Math.floor(cx-span-1), x1=Math.ceil(cx+span+1);
      if(x1<0 || x0>=W) continue;
      for(let x=x0;x<=x1;x++){
        const dx=(x+0.5-cx)/rx, d2=dx*dx+dy2;
        if(d2>=1) continue;
        const xx=((x%W)+W)%W, idx=y*W+xx;
        const k=1-d2, h=Math.min(3.2, heat[idx]+amount*k*k);
        heat[idx]=h; if(h>max) max=h;
      }
    }
  }
  s.heatMax=max; s.heatActive=true; s.heatDirty=true; s.hot=Math.max(s.hot||0, 4+10*Math.min(1,max));
}
function impStepHeat(s, dt){
  if(!s.heat || (!s.heatActive && !s.heatDirty)) return;
  s.heatT+=dt;
  let stepped=false, guard=0;
  while(s.heatT>=IMP_HEAT_STEP && guard<IMP_HEAT_MAX_STEPS){
    s.heatT-=IMP_HEAT_STEP; guard++; stepped=true;
    const W=s.heatW, H=s.heatH, src=s.heat, dst=s.heatTmp;
    let max=0;
    for(let y=0;y<H;y++){
      const row=y*W, up=y>0?row-W:row, dn=y<H-1?row+W:row;
      for(let x=0;x<W;x++){
        const i=row+x, h=src[i];
        const l=row+((x+W-1)%W), r=row+((x+1)%W);
        const lap=src[l]+src[r]+src[up+x]+src[dn+x]-4*h;
        let n=h + IMP_HEAT_DIFF*lap - h*(IMP_HEAT_COOL+0.075*h)*IMP_HEAT_STEP;
        if(n<0.006) n=0;
        dst[i]=n; if(n>max) max=n;
      }
    }
    s.heat=s.heatTmp; s.heatTmp=src; s.heatMax=max;
    if(max<0.012){
      s.heat.fill(0); s.heatTmp.fill(0); s.heatActive=false; s.hot=0; s.heatT=0;
      break;
    }
    s.hot=Math.max(0.5+max*5, (s.hot||0)-IMP_HEAT_STEP);
  }
  if(guard===IMP_HEAT_MAX_STEPS) s.heatT=Math.min(s.heatT, IMP_HEAT_STEP*2);
  if(stepped) s.heatDirty=true;
}
function impPaintHeat(rec, s, force){
  if(!s || !s.heat) return;
  if(!force && !s.heatDirty) return;
  impHeatCanvases(s);
  const W=s.heatW, H=s.heatH, heat=s.heat;
  const md=s.heatMeltImg.data, gd=s.heatGlowImg.data;
  let any=false, hotArea=0;
  for(let i=0;i<heat.length;i++){
    const h=heat[i], q=Math.min(1, Math.max(0,h/1.9));
    const p=i*4;
    if(q<=0.006){
      md[p]=md[p+1]=md[p+2]=md[p+3]=0;
      gd[p]=gd[p+1]=gd[p+2]=gd[p+3]=0;
      continue;
    }
    any=true;
    if(q>0.18) hotArea+=Math.min(1,(q-0.18)/0.82);
    const a=Math.pow(q,0.72), white=Math.pow(q,1.7);
    // alpha ramps run CONTINUOUSLY to 0 — the old constant floors (42/28) made
    // every cell above threshold snap on at once, drawing a hard jaggy front
    md[p]=255;
    md[p+1]=Math.round(64+142*q+38*white);
    md[p+2]=Math.round(12+32*q+140*white);
    md[p+3]=Math.round(212*a);
    gd[p]=255;
    gd[p+1]=Math.round(92+118*q+45*white);
    gd[p+2]=Math.round(22+34*q+160*white);
    gd[p+3]=Math.round(246*Math.pow(q,0.58));
  }
  s.heatMeltFrac=Math.min(1, hotArea/(W*H));
  const hmc=s.heatMeltC.getContext('2d'), hgc=s.heatGlowC.getContext('2d');
  hmc.putImageData(s.heatMeltImg,0,0); hgc.putImageData(s.heatGlowImg,0,0);
  const mc=s.meltC.getContext('2d'), gc=s.glowC.getContext('2d');
  if(s.baseC){
    mc.clearRect(0,0,s.meltC.width,s.meltC.height);
    mc.drawImage(s.baseC,0,0);
  } else impReplayScarBase(s);
  gc.clearRect(0,0,s.glowC.width,s.glowC.height);
  if(any){
    const oldMS=mc.imageSmoothingEnabled, oldGS=gc.imageSmoothingEnabled;
    mc.imageSmoothingEnabled=true; gc.imageSmoothingEnabled=true;
    // a slight blur on the upscale melts the grid cells into a smooth front
    // (GPU-accelerated canvas filter; harmless no-op where unsupported)
    const blur='blur('+(s.meltC.width/W*0.55).toFixed(1)+'px)';
    if(mc.filter!==undefined){ mc.filter=blur; gc.filter=blur; }
    if(rec.data.kind!=='gasgiant' && !impIsStellar(rec)) mc.drawImage(s.heatMeltC,0,0,s.meltC.width,s.meltC.height);
    gc.drawImage(s.heatGlowC,0,0,s.glowC.width,s.glowC.height);
    if(mc.filter!==undefined){ mc.filter='none'; gc.filter='none'; }
    mc.imageSmoothingEnabled=oldMS; gc.imageSmoothingEnabled=oldGS;
  }
  s.heatDirty=false; s.dirty=false; s.upT=0;
  s.meltT.needsUpdate=true; s.glowT.needsUpdate=true;
}

function impFlashTexture(){ if(!_impFlashTex) _impFlashTex=glowCanvasTex('rgba(255,250,232,1)','rgba(255,160,60,0.55)');
  return _impFlashTex; }
function impRingTexture(){
  if(_impRingTex) return _impRingTex;
  const s=256, c=newCanvas(s,s), ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(s/2,s/2,s*0.30,s/2,s/2,s*0.5);
  g.addColorStop(0,'rgba(255,190,110,0)'); g.addColorStop(0.75,'rgba(255,205,140,0.85)');
  g.addColorStop(1,'rgba(255,140,60,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  _impRingTex=new THREE.CanvasTexture(c); return _impRingTex;
}
function spawnFlash(wp, R, E){
  if(impRestoring) return;                    // state restore replays outcomes, not fireworks
  const sc=R*(0.9+0.6*Math.min(4, Math.max(0,Math.log10(Math.max(1,E/IMP_CHICXULUB_J)))+1));
  const sp=acquireFxSprite(_flashPool, impFlashTexture());
  sp.position.copy(wp);
  impFx.push({o:sp,t:0,T:0.7,kind:'flash',sc,pool:_flashPool});
}
function spawnShock(wp, R, E){
  if(impRestoring) return;
  const sc=R*(1.1+0.5*Math.min(4, Math.max(0,Math.log10(Math.max(1,E/IMP_CHICXULUB_J)))+1));
  const sp=acquireFxSprite(_shockPool, impRingTexture());
  sp.position.copy(wp);
  impFx.push({o:sp,t:0,T:1.2,kind:'shock',sc,pool:_shockPool});
}

/* ---- shared ejecta/spark pool: one Points draw, evap-tail-style shader ---- */
function getImpPool(){
  if(impPool) return impPool;
  const N=2048;
  const pos=new Float32Array(N*3), ageA=new Float32Array(N).fill(1), sizeA=new Float32Array(N), seed=new Float32Array(N);
  for(let i=0;i<N;i++) seed[i]=Math.random();
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAge',new THREE.BufferAttribute(ageA,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize',new THREE.BufferAttribute(sizeA,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  const m=new THREE.ShaderMaterial({
    uniforms:{uScaleH:{value:600}},
    vertexShader:
      'attribute float aAge; attribute float aSize; attribute float aSeed;\n'+
      'varying float vAge; varying float vSeed; uniform float uScaleH;\n'+
      'void main(){ vAge=aAge; vSeed=aSeed;\n'+
      '  vec4 mv=modelViewMatrix*vec4(position,1.0);\n'+
      '  gl_PointSize=clamp(aSize*(1.0+2.2*aAge)*uScaleH/max(0.0001,-mv.z),1.0,90.0);\n'+
      '  gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying float vAge; varying float vSeed;\n'+
      'void main(){ if(vAge>=1.0) discard;\n'+
      '  float r=length(gl_PointCoord-0.5)*2.0; float d=exp(-4.0*r*r);\n'+
      '  vec3 col = vAge<0.3 ? mix(vec3(1.0,0.97,0.88),vec3(1.0,0.55,0.2),vAge/0.3)\n'+
      '                      : mix(vec3(1.0,0.55,0.2),vec3(0.25,0.12,0.08),(vAge-0.3)/0.7);\n'+
      '  float a=d*(1.0-vAge)*(0.5+0.3*vSeed);\n'+
      '  gl_FragColor=vec4(col,a); }',
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
  const points=new THREE.Points(g,m); points.frustumCulled=false; scene.add(points);
  impPool={N,g,pos,ageA,sizeA,vel:new Float32Array(N*3),
    age:new Float32Array(N).fill(9),life:new Float32Array(N).fill(1),head:0,points,m};
  return impPool;
}
function emitBurst(wp, n, dirFn, speed, sizeBase, life){
  if(impRestoring) return;
  const P=getImpPool();
  for(let k=0;k<n;k++){
    const i=P.head; P.head=(P.head+1)%P.N;
    const d=dirFn(), s=speed*(0.4+Math.random());
    P.pos[i*3]=wp.x; P.pos[i*3+1]=wp.y; P.pos[i*3+2]=wp.z;
    P.vel[i*3]=d.x*s; P.vel[i*3+1]=d.y*s; P.vel[i*3+2]=d.z*s;
    P.age[i]=0; P.life[i]=life*(0.6+0.8*Math.random());
    P.sizeA[i]=sizeBase*(0.6+0.8*Math.random());
  }
  impPoolActiveT=Math.max(impPoolActiveT, life*1.6);
}
function impConeDir(normal, spread){
  return function(){
    return _impV3.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1)
      .normalize().multiplyScalar(spread).add(normal).normalize().clone();
  };
}

/* ---- the strike itself: flash + shockwave + ejecta + painted crater + damage.
   imp (optional, asteroids): {mKg, vKms, dir} — the momentum kick that nudges the orbit ---- */
function applyStrike(rec, u, v, E, imp){
  rec._lastHitBy=null;                       // a lab strike reclaims the default epitaph cause
  const wp=uvToWorld(rec,u,v);
  const R=impRenderRadius(rec);
  const normal=_impV1.copy(wp).sub(worldPosOf(rec)).normalize().clone();
  const fxP=wp.clone().addScaledVector(normal,R*0.04);
  const thM=impMeltPoolDeg(rec,E);           // lava sea, at its physical size on this world
  sfxImpact(rec,E);
  const meltish=Math.min(1, thM/12);         // 0 = cratering strike, 1 = region-melting monster
  spawnFlash(fxP,R*(1+1.2*meltish),E); spawnShock(fxP,R*(1+0.8*meltish),E);
  if(!impImmune(rec) && !rec.destroyed){
    emitBurst(fxP, Math.min(700, 120+Math.round(60*Math.log10(Math.max(1,E/1e21)))),
      impConeDir(normal,0.75), R*(1.1+0.8*meltish), R*0.11, 1.9+1.1*meltish);
    const s=getScars(rec);
    const U=impBindingJ(rec);
    const th=Math.max(0.8, impCraterDeg(rec,E), thM*1.15);      // char rim just beyond the melt
    const rPx=th/180*512;
    const gasy=(rec.data.kind==='gasgiant'||impIsStellar(rec));
    if(!gasy) impPersistentSplat(s,'c',u,1-v,rPx,IMP_CHAR,null);
    if(!gasy && thM>0.25){                   // big hits leave a permanent lava sea, not just char
      impPersistentSplat(s,'m',u,1-v,thM/180*512,IMP_LAVA,0.45+0.55*meltish);
    }
    impDepositHeat(rec,s,u,1-v,rPx*(gasy?1.7:1.15+0.9*meltish),0.85+2.15*meltish);
    impPaintHeat(rec,s,true);
    if(imp && imp.matI===0) impDeliverWater(rec,imp);
    rec.dmgJ=(rec.dmgJ||0)+E;
    rec._lastHit={u,v};                      // the killing blow shapes how the world breaks apart
    impUpdateMelt(rec);                      // craters → melt seas → global magma ocean
    if(rec.dmgJ>=U && !rec.shattered) shatterBody(rec);
    // momentum: the asteroid's m·v kicks the orbit — recomputed exactly
    if(imp && imp.mKg && !rec.destroyed){
      const dvKms=imp.mKg*imp.vKms/impBodyMassKg(rec);
      if(perturbOrbit(rec, imp.dir, dvKms) && APP.currentData && APP.currentData.key===rec.data.key &&
         document.getElementById('info').classList.contains('open')) openInfo(rec.data);
    }
  }
  const dist=camera.position.distanceTo(wp);
  const ref=camera.position.distanceTo(controls.target)+1e-6;
  impShake=Math.min(0.06, impShake+(0.008*Math.max(0,Math.log10(Math.max(1,E/IMP_CHICXULUB_J))+1)+0.02*meltish)*Math.max(0,1-dist/(ref*4)));
}

/* crust shattered: the world actually comes apart. The planet mesh is hidden
   and replaced (in place, still on its orbit) by a debris field — the fragments
   then evolve under the dead world's own SELF-GRAVITY: pieces launched below
   escape speed decelerate, fall back and re-accrete into a battered planetary
   remnant, while faster pieces disperse outward into the orbit. A barely-fatal
   blow reforms a lumpy dwarf; a massive overkill scatters almost everything.
   The info panel switches to "A debris field." until 🧽 Heal resurrects it. */
const debrisFields=[];
// self-gravity of the debris cloud, worked in the mesh-local frame (R = radius).
// escape speed at r=R is DEB_VESC_K*R, so GM = ½·(DEB_VESC_K·R)²·R. Fragment
// launch speeds scale with the overkill factor, so the fraction that re-accretes
// falls off smoothly as the strike gets more violent (see debris-field tuning).
const DEB_VESC_K=0.075, DEB_SOFT_K=0.22, DEB_RCORE0=0.10, DEB_RCORE_MAX=0.55, DEB_ESCAPE_R=8;
// once enough mass has re-accreted, part of it coalesces into moonlet(s) that
// orbit the remnant on a real (softened-Kepler) orbit instead of falling into it:
// the first at DEB_MOON_T1 of the mass re-accreted, another every DEB_MOON_STEP.
// Thresholds kept a touch low so moonlets form readily: reliably near the binding
// energy (often two there), still possible a few x past it, none once a strike is a
// big enough overkill to scatter almost everything.
const DEB_RUMP_T1=0.08, DEB_MOON_T1=0.30, DEB_MOON_STEP=0.20, DEB_MOON_MAX=2;
const DEB_REACCRETION_OVER_MAX=8;       // above this the escaping debris is too fast to make a rump or moonlets
let _debRemnantGeo=null;
function debRemnantGeo(){ return _debRemnantGeo || (_debRemnantGeo=new THREE.SphereGeometry(1,64,48)); }
const _ROMAN=['I','II','III','IV'];
const DEB_ORIGIN=new THREE.Vector3();
/* The scorched-skin bake (~200 ms of noise painting) is deterministic per
   (body, salt) — cache it. Cached textures are session-owned: material
   disposal skips them (userData.scorchCached), so a Heal → re-shatter, the
   rump, and the blast-wave prebuild all reuse the same bake. */
function impScorchedSkinCached(rec, salt){
  const k='s'+(salt||0);
  rec._scorch=rec._scorch||{};
  let sk=rec._scorch[k];
  if(!sk){
    sk=rec._scorch[k]=impScorchedSkin(rec, salt||0);
    sk.map.userData={scorchCached:true}; sk.emap.userData={scorchCached:true};   // r132 Texture has no userData
  }
  return sk;
}
function hotRemnantMat(rec, salt){
  const skin=impScorchedSkinCached(rec, salt||0);
  skin.map.wrapS=skin.emap.wrapS=THREE.RepeatWrapping;
  skin.map.anisotropy=4; skin.emap.anisotropy=4;
  const mat=new THREE.MeshStandardMaterial({map:skin.map, color:0xffc2a0, roughness:0.9,
    emissive:0xff5a22, emissiveMap:skin.emap, emissiveIntensity:2.8});
  mat.userData.emberBase=2.8;
  return mat;
}
function disposeHotRemnantMat(mat){
  if(!mat) return;
  if(mat.map && !(mat.map.userData&&mat.map.userData.scorchCached)){ unregCanvasTex(mat.map); mat.map.dispose(); }
  if(mat.emissiveMap && !(mat.emissiveMap.userData&&mat.emissiveMap.userData.scorchCached)) mat.emissiveMap.dispose();
  mat.dispose();
}
function finishReaccretionStep(D){
  if(!D.allowRemnant) return;
  if(D.rumpRec && D.rumpRec.destroyed) return;
  if(D.capMw/D.totMw>=DEB_RUMP_T1) ensureRump(D);
  const cf=D.capMw/D.totMw;
  if(cf>=DEB_MOON_T1){
    const want=Math.min(DEB_MOON_MAX, 1+Math.floor((cf-DEB_MOON_T1)/DEB_MOON_STEP));
    while(D.moonlets.length<want) spawnMoonlet(D);
  }
}
function dissolveChunk(D, c, center, radius, addsMass){
  if(c.cap) return;
  c.cap=true; c.dissT0=0.65+0.55*Math.random(); c.dissT=c.dissT0;
  c.baseScale=c.m.scale.x||1;
  if(addsMass){
    D.capMw+=c.mw;
    D.rCore=D.Rloc*(DEB_RCORE0+(DEB_RCORE_MAX-DEB_RCORE0)*Math.min(1,D.capMw/D.totMw));
    finishReaccretionStep(D);
  }
  const n=c.m.position.clone().sub(center);
  if(n.lengthSq()<1e-8) n.set(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1);
  n.normalize();
  const side=new THREE.Vector3().crossVectors(n, new THREE.Vector3(0.27,0.91,0.33));
  if(side.lengthSq()<1e-8) side.crossVectors(n, new THREE.Vector3(1,0,0));
  side.normalize();
  c.m.position.copy(center).addScaledVector(n, radius+(c.rad||D.Rloc*0.03)*(0.5+0.7*Math.random()));
  c.vel.copy(n).multiplyScalar(D.Rloc*(0.025+0.035*Math.random()))
    .addScaledVector(side, D.Rloc*(0.015+0.035*Math.random()));
}
function refreshNav(){
  const nav=document.getElementById('nav'); if(!nav) return;
  nav.innerHTML=''; buildNav(); setActiveNav(selected);
  for(const r of bodies) if(r.destroyed) updateNavStatus(r);
}
function updateRumpData(D){
  if(!D.rumpRec) return;
  const prec=D.rec, pName=locName(prec.data), sk=(LANG==='sk');
  const cf=Math.max(0, Math.min(1, D.capMw/D.totMw));
  const radiusKm=Math.max(50, Math.round((prec.data.radiusKm||1000)*(D.rCore/D.Rloc)));
  D.rumpRec.radius=D.rCore;
  D.rumpRec.data.radiusKm=radiusKm;
  const cfPct=Math.round(cf*100), dataKey=LANG+'|'+radiusKm+'|'+cfPct;
  if(D.rumpDataKey===dataKey) return;
  D.rumpDataKey=dataKey;
  D.rumpRec.data.desc = sk
    ? pName+' Rump je horúci, znovu zlepený zvyšok sveta '+pName+'. Pôvodná planéta bola roztrhaná impaktnou energiou, ale pomalšie trosky sa gravitačne vrátili, stlačili do guľového planetárneho telesa a stále žiaria červeno od tepla zničenia a akrécie.'
    : pName+' Rump is the red-hot reformed remnant of '+pName+'. The original planet was torn apart by impact energy, but the slower debris fell back under its own gravity, compacted into a spherical planetary body, and still glows from the heat of destruction and re-accretion.';
  D.rumpRec.data.stats = [
    [sk?'Stav':'Status', sk?'Znovu sformovaný planetárny zvyšok':'Re-formed planetary remnant'],
    [sk?'Polomer':'Radius', '≈ '+radiusKm.toLocaleString()+' km'],
    [sk?'Znovu nabalená hmota':'Re-accreted mass', cfPct+' % '+(sk?'sledovaných trosiek':'of tracked debris')],
    [sk?'Pôvod':'Origin', sk?'Gravitačne zlepené trosky zničenej planéty '+pName:'Gravitationally compacted debris from destroyed '+pName],
    [sk?'Teplota':'Thermal state', sk?'červenožeravý po rozpade a akrécii':'red-hot after breakup and accretion']
  ];
}
function ensureRump(D){
  if(D.rumpRec){ updateRumpData(D); return D.rumpRec; }
  const prec=D.rec, pName=locName(prec.data), sk=(LANG==='sk');
  const key=prec.data.key+'~rump';
  if(!D.rumpMat){
    D.rumpMat=hotRemnantMat(prec, 0x72756d70);
    (D.rumpMats||(D.rumpMats=[])).push(D.rumpMat);
  }
  const mesh=new THREE.Mesh(debRemnantGeo(), D.rumpMat);
  mesh.scale.setScalar(D.rCore);
  mesh.userData.bodyKey=key;
  D.group.add(mesh);
  D.remnant=mesh;
  pickables.push(mesh);
  const data={ key, name:pName+' Rump', color:0xff5a2a, parent:prec.data.parent||DS.STAR.key,
    kind:'planetremnant', radiusKm:prec.data.radiusKm||1000, navTag:sk?'zvyšok':'remnant',
    desc:'', stats:[] };
  const rec2={ data, holder:mesh, mesh, orbitLine:null, radius:D.rCore,
    aDisp:0, e:0, q:new THREE.Quaternion(), M:0, period:1, spin:0.18,
    parentHolder:prec.parentHolder, helio:prec.helio, isMoon:false, external:true,
    _parentMesh:prec.mesh, _generated:true, _originKey:prec.data.key, _navSub:true,
    _impactLocalRadius:1,
    _newUntil: performance.now()+2600 };
  D.rumpRec=rec2;
  bodies.push(rec2);
  updateRumpData(D);
  refreshNav();
  return rec2;
}
/* spin a moonlet off the re-accreting remnant: a round body on a near-circular
   orbit just outside the hot remnant, placed at the circular speed of the field's
   softened central potential (so it neither escapes nor plunges), with a slight
   ellipticity for life. Integrated each frame by the same self-gravity as the
   chunks; lives in the debris group, so 🧽 Heal tears it down with everything else.
   It is ALSO a first-class body: a synthetic bodies[] record (external=true, so the
   Kepler/size loops leave its self-gravity motion alone) makes it clickable, named,
   labelled and openable in the info panel, exactly like a real moon. */
function spawnMoonlet(D){
  const prec=D.rec, R=D.Rloc, soft2=D.soft*D.soft, sk=(LANG==='sk');
  const rump=ensureRump(D);
  const aM=D.rCore*(1.7+0.5*Math.random())+D.soft*1.2;              // orbit radius, clear of the remnant
  const rM=Math.max(R*0.05, D.rCore*(0.22+0.12*Math.random()));    // moonlet radius
  const dir=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
  const tan=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1));
  if(tan.lengthSq()<1e-6) tan.crossVectors(dir,new THREE.Vector3(0,1,0));
  tan.normalize();
  const aGrav=D.GM*aM/Math.pow(aM*aM+soft2,1.5);                    // softened accel at aM
  const vc=Math.sqrt(aGrav*aM)*(0.92+0.1*Math.random());           // ~circular, mild eccentricity
  const idx=D.moonlets.length, pName=locName(prec.data);
  const moonMat=hotRemnantMat(prec, 0x6d6f6f6e+idx*1319);
  (D.rumpMats||(D.rumpMats=[])).push(moonMat);
  const mesh=new THREE.Mesh(debRemnantGeo(), moonMat);
  mesh.scale.setScalar(rM); mesh.position.copy(dir).multiplyScalar(aM);
  // --- first-class body record ---
  const key=prec.data.key+'~moon'+idx;
  const radiusKm=Math.max(20, Math.round((prec.data.radiusKm||1000)*(rM/R)));
  const data={ key, name:pName+' '+(_ROMAN[idx]||(idx+1)), color:0xff6a2a,
    parent:rump.data.key, kind:'moon', radiusKm, navTag:sk?'mesiačik':'moonlet',
    desc: sk ? 'Červenožeravý mesiačik z trosiek planéty '+pName+', vyvrhnutý pri opätovnom naberaní hmoty. Teraz obieha okolo znovu sformovaného telesa '+rump.data.name+' a stále žiari teplom akrécie.'
             : 'A red-hot moonlet made from '+pName+"'s shattered debris. It spun off during re-accretion and now orbits "+rump.data.name+', still glowing with the heat of impact and assembly.',
    stats:[ [sk?'Polomer':'Radius', '≈ '+radiusKm.toLocaleString()+' km'],
            [sk?'Obieha okolo':'Orbits', rump.data.name],
            [sk?'Pôvod':'Origin', sk?'Horúce trosky zničenej planéty '+pName:'Hot debris from destroyed '+pName],
            [sk?'Teplota':'Thermal state', sk?'červenožeravý po akrécii':'red-hot after accretion'] ] };
  mesh.userData.bodyKey=key;
  pickables.push(mesh);
  const rec2={ data, holder:mesh, mesh, orbitLine:null, radius:rM,
    aDisp:0, e:0, q:new THREE.Quaternion(), M:0, period:1, spin:0,
    parentHolder:prec.holder, helio:false, isMoon:true, external:true, _parentMesh:prec.mesh,
    _generated:true, _originKey:prec.data.key, _navSub:true,
    _impactLocalRadius:1,
    _newUntil: performance.now()+2600 };   // its label pulses + ignores declutter for ~2.6 s
  bodies.push(rec2);
  D.group.add(mesh);
  refreshNav();
  // a little "moonlet formed" flash right where it coalesces
  spawnFlash(worldPosOf(rec2), rM*prec.mesh.scale.x*2.6, IMP_CHICXULUB_J);
  D.moonlets.push({m:mesh, rec:rec2, vel:tan.multiplyScalar(vc), mat:moonMat,
    spin:new THREE.Vector3((Math.random()-0.5)*1.2,(Math.random()-0.5)*1.2,(Math.random()-0.5)*1.2)});
}
function impApplyBlastEnergy(rec, E, source, states){
  if(!(E>0) || rec.destroyed || impImmune(rec)) return;
  const srcW=worldPosOf(source), recW=worldPosOf(rec);
  const toSource=srcW.clone().sub(recW);
  if(toSource.lengthSq()<1e-12){
    const st=states&&states.get(rec), ss=states&&states.get(source);
    if(st&&ss) toSource.copy(displayVectorFromAU(ss.r.clone().sub(st.r)));
  }
  const uv=toSource.lengthSq()>1e-12 ? impUvFromWorldDir(rec,toSource) : {u:0.5,v:0.5};
  const s=getScars(rec);
  const f=Math.max(0,Math.log10(E/IMP_CHICXULUB_J+1));
  const rPx=Math.min(210, 62+20*f);
  if(rec.data.kind!=='gasgiant' && !impIsStellar(rec))
    impPersistentSplat(s,'c',uv.u,1-uv.v,Math.min(170,rPx*0.78),IMP_CHAR_SOFT,null);
  impDepositHeat(rec,s,uv.u,1-uv.v,rPx,Math.min(3.1,0.55+0.32*f));
  impPaintHeat(rec,s,true);
  rec.dmgJ=(rec.dmgJ||0)+E;
  rec._lastHit={u:uv.u,v:uv.v};
  if(source && source.data) rec._lastHitBy={name:locName(source.data), sn:impIsStellar(source)};
  // rolling forensics log (console: impDmgLog) — every non-lab energy hit
  const L=(window.impDmgLog||(window.impDmgLog=[]));
  L.push({t:+elapsedYears.toFixed(4), to:rec.data.key, by:source&&source.data?source.data.key:null,
    E:+E.toExponential(2)});
  if(L.length>60) L.splice(0,20);
  impUpdateMelt(rec);
  if(rec.dmgJ>=impBindingJ(rec) && !rec.shattered) shatterBody(rec);
}
/* The blast sweeps the system at PHYSICAL speed on SIM time: every world gets
   TWO queued arrivals — the radiation front (light/heat/X-rays, travelling at
   c) and the matter shock (ejecta, at SN_SHOCK_C of c, ~10× slower). Queue
   times are sim-years, decremented by the frame's simDtYears, so the speed
   slider paces the sweep and pause freezes it (light needs 8.3 min per AU,
   the shock ~1.4 h per AU — run ~1 h/s–1 day/s to watch it march). Still at
   most one arrival lands per frame: that's the perf fix — scar canvases,
   heat fields and debris-field builds never pile into one giant frame hitch. */
const SN_LIGHT_S_PER_AU = KM_PER_AU/C_KMS;              // ≈ 499 s: light-travel time per AU
const SN_LIGHT_YR_PER_AU = SN_LIGHT_S_PER_AU/SEC_PER_YEAR;
const SN_SHOCK_C = 0.1;                                 // shock/ejecta front speed as fraction of c
const SN_SHOCK_YR_PER_AU = SN_LIGHT_YR_PER_AU/SN_SHOCK_C;
const SN_RAD_FRAC = 0.5;   // share of a body's absorbed energy delivered by the radiation flash
                           // (rest arrives with the shock, along with the orbit kick)
const impBlastQueue=[];
function impBlastDamage(source, blastE, states){
  const sourceState=states.get(source)||raStateOf(source);
  const kicks=new Map();
  for(const rec of bodies.slice()){
    if(rec===source || rec.destroyed || impImmune(rec)) continue;
    const st=states.get(rec)||raStateOf(rec);
    const dr=st.r.clone().sub(sourceState.r);
    const dAU=dr.length();
    const distM=Math.max(1, dAU*KM_PER_AU*1000);
    const Rm=(rec.data.radiusKm||1000)*1000;
    const eAbs=blastE*impBlastAbsorption(rec)*(Rm*Rm)/(4*distM*distM);
    if(!(eAbs>Math.max(1e18,impBindingJ(rec)*1e-8))) continue;
    const dirAU=dr.lengthSq()>1e-18 ? dr.normalize() : new THREE.Vector3(1,0,0);
    const dvKms=Math.min(C_KMS*0.25, Math.sqrt(Math.max(0,2*eAbs*0.012/impBodyMassKg0(rec)))/1000);
    kicks.set(rec,{dirAU:dirAU.clone(),dvKms});
    // radiation front: heat/char only, no momentum — arrives at light speed
    impBlastQueue.push({rec, source, eAbs:eAbs*SN_RAD_FRAC, dirAU:dirAU.clone(), dvKms:0,
      at: dAU*SN_LIGHT_YR_PER_AU});
    // matter shock: the rest of the energy + the orbit kick — arrives at SN_SHOCK_C·c
    impBlastQueue.push({rec, source, eAbs:eAbs*(1-SN_RAD_FRAC), dirAU:dirAU.clone(), dvKms,
      at: dAU*SN_SHOCK_YR_PER_AU});
  }
  impBlastQueue.sort((a,b)=>a.at-b.at);
  return kicks;
}
function impProcessBlastQueue(simDt){        // simDt = sim-years advanced this frame
  if(!impBlastQueue.length) return;
  for(const q of impBlastQueue) q.at-=simDt;
  // ONE wave arrival per frame (they're staggered anyway; a due sibling just
  // lands a frame later), so a frame never pays for two shatters
  let fired=0;
  while(impBlastQueue.length && impBlastQueue[0].at<=0 && fired<1){
    const q=impBlastQueue.shift();
    const rec=q.rec;
    if(rec.destroyed) continue;                    // died to something else meanwhile
    impWaveShatter=true;                           // wave kills spawn leaner debris fields
    impApplyBlastEnergy(rec,q.eAbs,q.source,null);
    impWaveShatter=false;
    fired++;
    if(rec.destroyed || !(q.dvKms>1e-6)) continue;
    if(rec.nb) rec.nb.v.addScaledVector(q.dirAU, q.dvKms/KMS_PER_AUYR);
    else if(rec.freeState) rec.freeState.v.addScaledVector(q.dirAU, q.dvKms/KMS_PER_AUYR);
    else{ const dirW=displayVectorFromAU(q.dirAU).normalize(); perturbOrbit(rec,dirW,q.dvKms); }
  }
  // on quiet frames, pre-bake ONE upcoming target's expensive assets (scar
  // canvases + the scorched-crust bake if it will shatter) so its actual
  // arrival costs almost nothing
  if(!fired) for(const q of impBlastQueue){
    if(q.pb) continue;
    q.pb=true;
    const r=q.rec;
    if(!r.destroyed && !impImmune(r)){
      getScars(r);
      if((r.dmgJ||0)+q.eAbs>=impBindingJ(r)) impScorchedSkinCached(r);
    }
    break;
  }
}
function freeRaSurvivors(source, states, kicks){
  for(const rec of bodies.slice()){
    if(rec===source || rec.destroyed || rec._generated || impImmune(rec)) continue;
    const st=states.get(rec)||raStateOf(rec);
    const kick=kicks&&kicks.get(rec);
    const v=st.v.clone();
    if(kick) v.addScaledVector(kick.dirAU,kick.dvKms/KMS_PER_AUYR);
    if(!rec._preFree) rec._preFree={parentHolder:rec.parentHolder, helio:rec.helio, isMoon:rec.isMoon,
      helioA:rec.helioA, _physA:rec._physA, aDisp:rec.aDisp, aDispReal:rec.aDispReal,
      aDispCompressed:rec.aDispCompressed, e:rec.e, q:rec.q.clone(), M:rec.M,
      period:rec.period, orbitLine:rec.orbitLine};
    if(rec.orbitLine) rec.orbitLine.visible=false;
    rec.parentHolder=sunHolder; sunHolder.add(rec.holder);
    rec.helio=false; rec.isMoon=false; rec.aDisp=0;
    rec.freeState={r:st.r.clone(), v};
    rec.orbitPerturbed=true;
    const le=labelEls[rec.data.key]; if(le) le.classList.add('major');
    positionFreeBody(rec);
  }
}
/* ---- supernova, rebuilt for looks AND for speed. Three cheap elements:
   a core flash sprite (seconds), ONE expanding fresnel shock shell (a thin
   luminous rim, not a screen-filling glow blob), and a shader-driven ejecta
   cloud whose expansion, colour evolution (white-gold → orange → brick →
   remnant-nebula teal) and fade all live in the vertex/fragment shaders —
   after creation the CPU only updates a couple of uniforms per frame, never
   the buffers. The whole show runs on SIM time at physical speed: the shock
   shell rides the true 0.1c front, a second faint shell rides the light
   front at c, and the show winds itself down once the shock leaves the
   system (SN_MAX_AU), freeing its GPU resources and leaving just a tiny
   collapsed-core ember until 🧽 Heal. ---- */
const SN_MAX_AU=55;          // shock front past the Wadjet belt (~46 AU) = show over
const _snRedTint=new THREE.Color(0xff7038);
function snShellMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{ c:{value:new THREE.Color(0xfff2dc)}, p:{value:1.0} },
    vertexShader:`varying vec3 vN; varying vec3 vV;
      void main(){ vN=normalize(normalMatrix*normal);
        vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 c; uniform float p; varying vec3 vN; varying vec3 vV;
      void main(){ float d=abs(dot(normalize(vN),normalize(vV)));
        float rim=pow(1.0-d,2.4)+0.22*pow(1.0-d,0.7);
        gl_FragColor=vec4(c, rim*p); }`,
    side:THREE.FrontSide, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false});
}
function snEjectaMaterial(R){
  return new THREE.ShaderMaterial({
    uniforms:{ uF:{value:0}, uK:{value:0}, uR:{value:R}, uScaleH:{value:600} },
    vertexShader:
      'attribute float aSpd; attribute float aSeed;\n'+
      'uniform float uF; uniform float uK; uniform float uR; uniform float uScaleH;\n'+
      'varying float vSeed;\n'+
      'void main(){ vSeed=aSeed;\n'+
      // uF = shock-front radius (scene units): the bulk rides behind it, fast filaments a bit ahead
      '  float rr=uR*0.35+uF*aSpd*0.8;\n'+
      '  vec4 mv=modelViewMatrix*vec4(position*rr,1.0);\n'+
      '  float sz=uR*(0.10+0.06*aSeed)*(1.0+2.5*uK*aSpd);\n'+
      '  gl_PointSize=clamp(sz*uScaleH/max(0.0001,-mv.z),1.0,64.0);\n'+
      '  gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'uniform float uK; varying float vSeed;\n'+
      'void main(){\n'+
      '  float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard;\n'+
      '  float d=exp(-3.5*r*r);\n'+
      '  vec3 cA=vec3(1.0,0.96,0.86);\n'+   // white-gold fireball
      '  vec3 cB=vec3(1.0,0.45,0.16);\n'+   // orange
      '  vec3 cC=vec3(0.46,0.20,0.13);\n'+  // cooling brick
      '  vec3 cD=vec3(0.28,0.42,0.52);\n'+  // remnant-nebula teal wisp
      '  vec3 col = uK<0.10 ? mix(cA,cB,uK/0.10)\n'+
      '           : uK<0.45 ? mix(cB,cC,(uK-0.10)/0.35)\n'+
      '                     : mix(cC,cD,(uK-0.45)/0.55);\n'+
      '  float a=d*(0.9-0.88*uK)*(0.55+0.45*vSeed);\n'+
      '  gl_FragColor=vec4(col*(0.7+0.6*vSeed), a); }',
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
}
/* compile the blast shaders ahead of time — otherwise the very first supernova
   pays the GLSL compile+link right in the middle of its opening frame */
function snPrewarm(){
  if(snPrewarm._done || !renderer) return; snPrewarm._done=true;
  const sc=new THREE.Scene();
  const sh=new THREE.Mesh(new THREE.SphereGeometry(1,4,3), snShellMaterial());
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0]),3));
  g.setAttribute('aSpd', new THREE.BufferAttribute(new Float32Array([1]),1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([1]),1));
  const pts=new THREE.Points(g, snEjectaMaterial(1));
  sc.add(sh); sc.add(pts);
  renderer.compile(sc,camera);
  sh.geometry.dispose(); sh.material.dispose(); g.dispose(); pts.material.dispose();
}
function makeStellarBlast(rec, blastE){
  const group=new THREE.Object3D();
  rec.holder.add(group);
  const R=impRenderRadius(rec)||rec.radius||1;
  const isStar=rec.data.kind==='star';
  // core flash — blinding for the first second, gone in a few
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:impFlashTexture(),transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  sp.scale.setScalar(R*3);
  group.add(sp);
  // collapsed remnant core — a dense ember that stays after the light show
  const core=new THREE.Sprite(new THREE.SpriteMaterial({
    map:glowCanvasTex(isStar?'rgba(215,232,255,1)':'rgba(255,150,80,1)',
                      isStar?'rgba(110,150,255,0)':'rgba(180,60,20,0)'),
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0}));
  core.scale.setScalar(R*(isStar?0.9:0.7));
  group.add(core);
  // shock shell — one fresnel-limb sphere: reads as a luminous expanding ring
  const shellMat=snShellMaterial();
  const shell=new THREE.Mesh(new THREE.SphereGeometry(1,48,32), shellMat);
  shell.scale.setScalar(R*1.2);
  group.add(shell);
  // radiation front — a second, fainter blue-white shell racing ahead at c
  const lightMat=snShellMaterial();
  lightMat.uniforms.c.value.set(0xcfe4ff);
  const lightShell=new THREE.Mesh(new THREE.SphereGeometry(1,48,32), lightMat);
  lightShell.scale.setScalar(R*1.2);
  group.add(lightShell);
  // ejecta cloud — static buffers, motion in the shader
  const N=isStar?(MOBILE_UI?800:1600):(MOBILE_UI?500:1000);
  const dir=new Float32Array(N*3), spd=new Float32Array(N), seed=new Float32Array(N);
  for(let i=0;i<N;i++){
    let x,y,z,l2;
    do{ x=Math.random()*2-1; y=Math.random()*2-1; z=Math.random()*2-1; l2=x*x+y*y+z*z; }while(l2<1e-4||l2>1);
    const l=Math.sqrt(l2);
    dir[i*3]=x/l; dir[i*3+1]=y/l; dir[i*3+2]=z/l;
    // a few percent race ahead as fast filaments; the bulk drifts behind the shell
    spd[i]=Math.random()<0.07 ? 1.05+Math.random()*0.75 : 0.25+0.75*Math.pow(Math.random(),0.7);
    seed[i]=Math.random();
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dir,3));  // unit dirs; true pos computed in-shader
  g.setAttribute('aSpd', new THREE.BufferAttribute(spd,1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed,1));
  const mat=snEjectaMaterial(R);
  const points=new THREE.Points(g,mat); points.frustumCulled=false;
  group.add(points);
  stellarBlasts.push({rec,group,sp,core,shell,shellMat,lightShell,lightMat,points,g,mat,
    tYears:0,R,blastE,done:false,
    c0:new THREE.Color(0xfff2dc), c1:new THREE.Color(0xb3341c)});
}
/* the show is over: free the flash/shell/ejecta GPU resources; keep the core */
function finishStellarBlast(B){
  if(B.done) return;
  B.done=true;
  B.group.remove(B.sp); B.sp.material.dispose();            // map is the SHARED flash tex — keep it
  B.group.remove(B.shell); B.shell.geometry.dispose(); B.shellMat.dispose();
  B.group.remove(B.lightShell); B.lightShell.geometry.dispose(); B.lightMat.dispose();
  B.group.remove(B.points); B.g.dispose(); B.mat.dispose(); // point map is shared too
  B.sp=B.shell=B.shellMat=B.lightShell=B.lightMat=B.points=B.g=B.mat=null;
}
function removeStellarBlast(rec){
  for(let i=stellarBlasts.length-1;i>=0;i--){
    const B=stellarBlasts[i]; if(B.rec!==rec) continue;
    finishStellarBlast(B);
    unregCanvasTex(B.core.material.map); B.core.material.map.dispose(); B.core.material.dispose();
    rec.holder.remove(B.group);
    stellarBlasts.splice(i,1);
  }
  if(rec.data.kind==='star' && starGroup) for(const ch of starGroup.children) ch.visible=true;
  for(const ch of rec.mesh.children) ch.visible=true;
  if(rec.mesh.material) rec.mesh.material.visible=true;
  if(rec.data.kind==='star' && sunLight){
    sunLight.intensity=sunLight.userData.baseIntensity||sunLight.intensity||1.9;
    if(sunLight.userData.baseColor) sunLight.color.copy(sunLight.userData.baseColor);
  }
  if(rec.data.kind==='star' && beltObj){ beltObj.pts.visible=true; beltDirty=true; }
}
function shatterStellar(rec){
  rec.shattered=true; rec.destroyed=true;
  sfxShatter(rec);
  const states=new Map(bodies.map(b=>[b,raStateOf(b)]));
  const blastE=Math.max(rec.dmgJ||0, impBindingJ(rec));
  const wp=worldPosOf(rec), R=impRenderRadius(rec)||rec.radius||1;
  spawnFlash(wp,R*5.0,blastE);
  spawnShock(wp,R*4.2,blastE);
  // the shader ejecta cloud carries the visual now — the pool burst is just close-in sparks
  emitBurst(wp, 260, function(){ return _impV3.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize().clone(); },
    R*3.0, R*0.20, 3.0);
  if(rec.data.kind==='star' && starGroup) for(const ch of starGroup.children) if(ch!==rec.mesh) ch.visible=false;
  for(const ch of rec.mesh.children) ch.visible=false;
  if(rec.mesh.material) rec.mesh.material.visible=false;
  if(rec.data.kind==='star' && sunLight){
    // stash the healthy light; the blast loop surges then extinguishes it
    sunLight.userData.baseIntensity=sunLight.userData.baseIntensity||sunLight.intensity;
    sunLight.userData.baseColor=sunLight.userData.baseColor||sunLight.color.clone();
  }
  if(rec.data.kind==='star' && beltObj) beltObj.pts.visible=false;   // the swarm is vaporized
  makeStellarBlast(rec,blastE);
  // queue the outward-sweeping damage wave (arrivals staggered by distance);
  // survivors of a star death are unbound NOW — their kick lands with the wave
  impBlastDamage(rec,blastE,states);
  if(nbodyOn){
    // real gravity: survivors unbind on their own once the star sheds its mass
    if(rec.nb) rec.nb.gm*=0.2;                 // supernova ejects ~80% of the star into the blast
  }
  else if(rec.data.kind==='star') freeRaSurvivors(rec,states,null);
  else liberateMoons(rec);
  updateNavStatus(rec);
  const el=labelEls[rec.data.key]; if(el) el.textContent=locName(rec.data)+' ☠';
  if(APP.currentData && APP.currentData.key===rec.data.key &&
     document.getElementById('info').classList.contains('open')) openInfo(rec.data);
  impShake=Math.min(0.08, impShake+0.05);
}
function shatterBody(rec){
  if(impIsStellar(rec)) return shatterStellar(rec);
  rec.shattered=true; rec.destroyed=true;
  sfxShatter(rec);
  const wp=worldPosOf(rec), R=impRenderRadius(rec);
  const U=impBindingJ(rec), shatterE=Math.max(U, rec.dmgJ||0);
  const over=Math.max(1, shatterE/U);
  const burstK=Math.min(9, Math.max(1, Math.pow(over,0.18)));
  spawnFlash(wp,R*(2.0+0.6*burstK),shatterE);
  spawnShock(wp,R*(1.7+0.45*burstK),shatterE);
  emitBurst(wp, impWaveShatter?300:800, function(){ return _impV3.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize().clone(); },
    R*(1.4+0.55*burstK), R*(0.12+0.025*burstK), 2.2+0.25*burstK);
  // hide the world + everything stuck to it (atmosphere, scar overlays)
  for(const ch of rec.mesh.children) ch.visible=false;
  rec.mesh.material.visible=false;      // mesh object stays: keeps orbiting, pickable, scalable
  makeDebrisField(rec);
  if(!rec._generated){
    if(!rec.nb) makeDebrisRing(rec);    // Kepler shear smears it into a ring along the old orbit
    if(!nbodyOn) liberateMoons(rec);    // (N-body: moons already fly free under real gravity)
  }
  updateNavStatus(rec);                 // sidebar: red ☠ destroyed badge
  const el=labelEls[rec.data.key]; if(el) el.textContent=locName(rec.data)+' ☠';
  if(APP.currentData && APP.currentData.key===rec.data.key &&
     document.getElementById('info').classList.contains('open')) openInfo(rec.data);
  impShake=Math.min(0.06, impShake+0.03);
}

/* ---- crustal shard: a curved cap of the planet's sphere with radial depth.
   Outer face keeps the planet's OWN texture (equirect UVs around the cap
   centre, unwrapped across the 0/1 seam); inner faces are ember rock.
   Built in a +Y-up local frame, oriented to `dir`, re-centred on its own
   centroid so tumbling spins the piece about itself. Returns {geo,center}. */
function makeShardGeo(dir, angR, k, depth, R){
  const pos=[], uv=[];
  const up=new THREE.Vector3(0,1,0);
  const q=new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  const ringO=[], ringM=[], ringI=[], uvO=[], uvM=[];
  const thJ=[];
  for(let j=0;j<k;j++) thJ.push(angR*(0.8+0.4*Math.random()));
  const cV=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const uvOf=(d,u0)=>{                       // Three's sphere mapping, seam-unwrapped near u0
    const vt=1-Math.acos(Math.max(-1,Math.min(1,d.y)))/Math.PI;
    let ut=Math.atan2(d.z,-d.x)/(2*Math.PI); if(ut<0) ut+=1;
    if(u0!=null){ while(ut-u0>0.5) ut-=1; while(u0-ut>0.5) ut+=1; }
    return [ut,vt];
  };
  const cUV=uvOf(cV,null);
  for(let j=0;j<k;j++){
    const ps=j/k*Math.PI*2 + (Math.random()-0.5)*0.5/k*Math.PI;
    const th=thJ[j], sm=Math.sin(th*0.55), so=Math.sin(th);
    ringM.push(new THREE.Vector3(sm*Math.cos(ps),Math.cos(th*0.55),sm*Math.sin(ps)).applyQuaternion(q));
    ringO.push(new THREE.Vector3(so*Math.cos(ps),Math.cos(th),so*Math.sin(ps)).applyQuaternion(q));
    ringI.push(ringO[j].clone().multiplyScalar(1-depth*(0.8+0.4*Math.random())));
    uvM.push(uvOf(ringM[j],cUV[0])); uvO.push(uvOf(ringO[j],cUV[0]));
  }
  const cI=cV.clone().multiplyScalar(1-depth);
  const push=(p,t)=>{ pos.push(p.x*R,p.y*R,p.z*R); uv.push(t[0],t[1]); };
  // outer cap (two rings, keeps the sphere's curve): material group 0
  for(let j=0;j<k;j++){ const n=(j+1)%k;
    push(cV,cUV);      push(ringM[n],uvM[n]); push(ringM[j],uvM[j]);
    push(ringM[j],uvM[j]); push(ringM[n],uvM[n]); push(ringO[j],uvO[j]);
    push(ringO[j],uvO[j]); push(ringM[n],uvM[n]); push(ringO[n],uvO[n]);
  }
  const outerCount=pos.length/3;
  // inner fan + side walls: material group 1 (rock), throwaway UVs
  const rockUV=(p)=>[p.x*0.5+0.5, p.z*0.5+0.5];
  for(let j=0;j<k;j++){ const n=(j+1)%k;
    push(cI,rockUV(cI));        push(ringI[j],rockUV(ringI[j])); push(ringI[n],rockUV(ringI[n]));
    push(ringO[j],rockUV(ringO[j])); push(ringI[n],rockUV(ringI[n])); push(ringI[j],rockUV(ringI[j]));
    push(ringO[j],rockUV(ringO[j])); push(ringO[n],rockUV(ringO[n])); push(ringI[n],rockUV(ringI[n]));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.addGroup(0,outerCount,0); g.addGroup(outerCount,pos.length/3-outerCount,1);
  // re-centre on the centroid so rotation tumbles the shard about itself
  g.computeBoundingBox();
  const c=new THREE.Vector3(); g.boundingBox.getCenter(c);
  g.translate(-c.x,-c.y,-c.z);
  g.computeVertexNormals();
  return {geo:g, center:c};
}

/* Fragments of a world-shattering impact are HOT: dumping a planet's binding
   energy into it melts and bakes everything. The shard skin is the planet's
   own map charred nearly black, with molten cracks glowing through it —
   no surviving oceans or forests. */
function impScorchedSkin(rec, salt){
  // 256×128 — shards are small tumbling rocks; the bake is the single biggest
  // shatter cost (was ~200 ms at 512², ~55 ms here) and the crack detail
  // still reads at shard scale
  const W=256,H=128, c=newCanvas(W,H), ec=newCanvas(W,H);
  const seed=(((rec.data.key||'x').split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)>>>0) ^ (salt||0))>>>0;
  const paint=function(){
    const ctx=c.getContext('2d');
    let drew=false;
    const img=rec.mesh.material.map && rec.mesh.material.map.image;
    if(img){
      try{                               // probe first: a tainted canvas would break the GL upload
        const pr=newCanvas(2,2); pr.getContext('2d').drawImage(img,0,0,2,2);
        pr.getContext('2d').getImageData(0,0,1,1);
        ctx.drawImage(img,0,0,W,H); drew=true;
      }catch(_){ drew=false; }
    }
    if(!drew){ ctx.fillStyle='#'+new THREE.Color(rec.data.color||0x887766).getHexString(); ctx.fillRect(0,0,W,H); }
    ctx.fillStyle='rgba(14,9,6,0.78)'; ctx.fillRect(0,0,W,H);      // baked to char
    const r=texRocky({b:'#140602', base:'#3a0e04', a:'#6a1a06', c:'#a03210'},
      (seed^0x51f3)>>>0, {glow:'#ffcf5e', emissData:true, w:W, h:H});
    ec.getContext('2d').drawImage(r.emap,0,0);                     // molten-crack emissive
  };
  paint();
  const map=new THREE.CanvasTexture(c), emap=new THREE.CanvasTexture(ec);
  regCanvasTex(map, function(){ paint(); emap.needsUpdate=true; });  // Android canvas wipe
  return {map, emap};
}

function makeDebrisField(rec){
  const group=new THREE.Object3D();
  rec.mesh.add(group);                  // inherits spin + the per-frame dot-floor scaling
  const R=impLocalRadius(rec);          // mesh-local units
  // composition: 0 = bare rock, 1 = almost all gas — the H/He envelope plus
  // water flashed to steam, from the .ubox depots (Amunet 0.48, Wadjet 0.27)
  const gas=impGasFrac(rec);
  const rockT=impRockTex();
  // emissiveMap = the rock albedo too: the ember glow follows the fracture
  // detail instead of flooding the chunks flat orange
  const chunkMat=rockT
    ? new THREE.MeshStandardMaterial({map:rockT, roughness:0.95,
        emissive:0xff6a30, emissiveMap:rockT, emissiveIntensity:1.4})
    : new THREE.MeshStandardMaterial({color:new THREE.Color(rec.data.color||0x9a8877).multiplyScalar(0.8),
        roughness:0.95, emissive:0xff6a30, emissiveIntensity:0.6});
  chunkMat.userData.emberBase = rockT?1.4:0.6;
  const geos=[];
  const seedBase=(rec.data.key||'x').split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)>>>0;
  for(let gi=0; gi<3; gi++) geos.push(makeRockGeo(11,8, seedBase+gi*7919));  // three rock shapes, reused
  const chunks=[];

  /* ---- the breakup is shaped by the killing blow ----
     hitDir = where the final strike landed; overshoot = how far past the
     binding energy the bombardment went. Fragments fly away from the hit
     point: a fast, finely-fragmented cone around it, slow heavy slabs on
     the far side — barely past U the world falls apart lazily, a massive
     overkill blasts it. */
  const hit=rec._lastHit||{u:0.5,v:0.5};
  const hitDir=uvToLocal(rec, hit.u, hit.v, new THREE.Vector3()).normalize();
  const over=Math.max(1,(rec.dmgJ||0)/impBindingJ(rec));
  const allowReaccretion=!rec._generated && over<=DEB_REACCRETION_OVER_MAX;
  const ovk=Math.min(4, Math.log10(over)+1);           // 1 @ U … 2 @ 10U … 3 @ 100U
  const violentBoost=allowReaccretion ? 1 : Math.min(9, Math.pow(over/DEB_REACCRETION_OVER_MAX,0.18));
  const sBase=R*(0.012+0.038*ovk)*violentBoost;
  const velOf=(dirFrom)=>{                              // impact-driven velocity field
    const cd=dirFrom.dot(hitDir), w=Math.pow(0.5+0.5*cd,1.6);
    const v=dirFrom.clone().addScaledVector(hitDir,-0.55).normalize()
      .multiplyScalar(sBase*(0.3+1.5*w+0.3*Math.random()));
    return v.addScaledVector(new THREE.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5), sBase*0.18);
  };

  // crustal shards — pieces of the planet ITSELF, its surface texture still
  // on their outer face. Gas-dominated worlds (gas ≥ 0.85, e.g. Amunet) have
  // no crust to shatter — the fraction, not the kind, decides: Wadjet is
  // kind 'gasgiant' but mostly rock (debrisGas 0.4) and breaks into slabs.
  const shardGeos=[]; let outerMat=null;
  if(gas<0.85){
    const skin=impScorchedSkinCached(rec);   // charred crust with molten cracks — not the living surface
    skin.map.wrapS=THREE.RepeatWrapping; skin.emap.wrapS=THREE.RepeatWrapping;
    outerMat=new THREE.MeshStandardMaterial({map:skin.map, roughness:1.0,
      emissive:0xffffff, emissiveMap:skin.emap, emissiveIntensity:2.2});
    outerMat.userData.emberBase=2.2;
    // fewer draw calls on tablets; leaner still when a supernova wave is felling
    // many worlds (a dozen debris fields would otherwise stack up their meshes)
    const NS=Math.round(30*(1-0.5*gas)*(MOBILE_UI?0.65:1)*(impWaveShatter?0.6:1));
    const GA=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<NS;i++){
      const y=1-2*(i+0.5)/NS, rr=Math.sqrt(Math.max(0,1-y*y)), a=GA*i;
      const dir=new THREE.Vector3(rr*Math.cos(a), y, rr*Math.sin(a));
      const dHit=Math.acos(Math.max(-1,Math.min(1,dir.dot(hitDir))));
      // finer fragmentation near the hit, big slabs on the far side
      const angR=(0.24+0.36*(dHit/Math.PI))*(0.85+0.3*Math.random());
      const sh=makeShardGeo(dir, angR, 8, 0.16+0.20*Math.random(), R);
      shardGeos.push(sh.geo);
      const m=new THREE.Mesh(sh.geo,[outerMat,chunkMat]);
      m.position.copy(sh.center);
      const vel=velOf(dir);
      const spin=vel.length()/R;
      chunks.push({m,vel,rot:new THREE.Vector3((Math.random()-0.5)*2.4*spin,(Math.random()-0.5)*2.4*spin,(Math.random()-0.5)*2.4*spin),mw:1.7,rad:R*angR*0.55,cap:false});
      group.add(m);
    }
  }
  // small rubble between the slabs (generic hot rocks, impact-driven too)
  const NCH=Math.round((shardGeos.length?18:46)*(1-0.72*gas)*(MOBILE_UI?0.65:1)*(impWaveShatter?0.6:1));
  const szF=1-0.35*gas;
  for(let i=0;i<NCH;i++){
    const m=new THREE.Mesh(geos[i%3], chunkMat);
    const dir=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
    m.position.copy(dir).multiplyScalar(R*(0.35+0.6*Math.random()));
    const sc=R*(0.04+0.09*Math.random())*szF;
    m.scale.setScalar(sc);
    m.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    const vel=velOf(dir).multiplyScalar(1.35);
    chunks.push({m,vel,rot:new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1),mw:0.5,rad:sc*1.2,cap:false});
    group.add(m);
  }
  // gas/dust haze: additive glow points that expand outward and dissipate.
  // Amount, spread, brightness and lifetime all scale with the gas fraction;
  // tinted by the body's own colour (Amunet bursts bronze, Wadjet teal).
  const HN=Math.round(500+1600*gas), hp=new Float32Array(HN*3);
  const hazeScale=rec.mesh.getWorldScale(new THREE.Vector3()).x;
  for(let i=0;i<HN;i++){
    const d=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize()
      .multiplyScalar(R*hazeScale*(0.5+(1.0+0.9*gas)*Math.random()));
    hp[i*3]=d.x; hp[i*3+1]=d.y; hp[i*3+2]=d.z;
  }
  const hg=new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp,3).setUsage(THREE.DynamicDrawUsage));
  const tint=new THREE.Color(rec.data.color||0xffd9b0).lerp(new THREE.Color(1,1,1),0.35);
  // NB: PointsMaterial.size is WORLD units — it ignores the mesh's per-frame
  // dot-floor scaling, so the update loop re-syncs it to mesh.scale each frame.
  // gassy worlds die in a luminous cloud of their own colour; rocky ones in
  // INCANDESCENT dust — small, dim-orange additive embers (big bright points
  // saturated the frame white; gray smoke hid the glowing fragments)
  const glowy = gas>=0.6;
  const hzSize=(glowy?R*(0.12+0.42*gas):R*0.09)*hazeScale*(allowReaccretion?1:Math.min(3.2,violentBoost*0.55));
  const hzOp=glowy?0.55*(0.45+0.85*gas):0.5;
  const hazeMat=new THREE.PointsMaterial({
    map:glowy?glowCanvasTex('rgba(255,235,205,0.85)','rgba(160,120,85,0.28)')
             :glowCanvasTex('rgba(255,150,70,0.75)','rgba(120,30,8,0.18)'),
    color:glowy?tint:new THREE.Color(0xff8542), size:hzSize,
    sizeAttenuation:true, transparent:true, opacity:hzOp,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false});
  const haze=new THREE.Points(hg,hazeMat); haze.frustumCulled=false;
  haze.renderOrder=3;
  rec.holder.add(haze);       // gas is world-sized; don't inherit mesh dot-floor scaling
  // self-gravity params, in the mesh-local frame (R units)
  const totMw=chunks.reduce((s,c)=>s+c.mw,0);
  debrisFields.push({rec,group,chunks,chunkMat,geos,shardGeos,outerMat,haze,hazeMat,t:0,
    gas, hazeSize:hzSize, hazeWorldSize:hzSize, hazeParent:rec.holder, op0:hzOp,
    fadeT:40*(0.6+1.3*gas)/(allowReaccretion?1:Math.min(3,violentBoost*0.5)),
    GM:(allowReaccretion?1:0.08)*0.5*DEB_VESC_K*DEB_VESC_K*R*R*R, soft:DEB_SOFT_K*R, Rloc:R,
    rCore:R*DEB_RCORE0, capMw:0, totMw, remnant:null, rumpMats:[], moonlets:[],
    allowRemnant:allowReaccretion, overkill:over});
}

/* ---- moon liberation: a destroyed planet no longer binds its moons ----
   Each moon keeps its instantaneous heliocentric state vector — the parent's
   true Kepler velocity plus the moon's physical orbital velocity around it
   (vis-viva with the parent's estimated mass) — converted into proper new
   Ra-centric orbital elements (a, e, plane, periapsis, phase). Runs once per
   destruction, so accuracy costs nothing per frame. Real units: AU and years,
   in Kepler form where mu = 4pi^2 * (M / M_sun). */
let STAR_MSUN=1.139;                      // stellar mass in suns — set per system in applySystem
let MU_RA=4*Math.PI*Math.PI*STAR_MSUN;    // AU^3/yr^2 heliocentric mu (Ra 1.139 M☉, Sol 1.0 M☉)
const SUN_KG=1.989e30;
function keplerStateAU(aAU,e,q,M,mu){     // -> instantaneous {r (AU), v (AU/yr)}
  const E=kepler(M,e), b=aAU*Math.sqrt(1-e*e);
  const n=Math.sqrt(mu/(aAU*aAU*aAU));    // mean motion, rad/yr
  const Edot=n/(1-e*Math.cos(E));
  return {
    r:new THREE.Vector3(aAU*(Math.cos(E)-e),0,b*Math.sin(E)).applyQuaternion(q),
    v:new THREE.Vector3(-aAU*Math.sin(E)*Edot,0,b*Math.cos(E)*Edot).applyQuaternion(q)
  };
}
/* ---- Kepler shear: the debris of a destroyed world doesn't stay put — each
   fragment keeps a slightly different orbital period, so over (sim) time the
   cloud smears along the dead planet's orbit into a glittering arc and finally
   a full ring. Driven by SIM time: crank the time warp to watch it spread. ---- */
const debrisRings=[];
let lastSimDtYears=0;                     // set each frame in animate()
function makeDebrisRing(rec){
  const N=MOBILE_UI?700:1400;               // half the sparkles on touch devices — indistinguishable
  const M0=rec.M%(Math.PI*2), n=Math.PI*2/rec.period;       // mean motion, rad per sim-year
  const Mi=new Float32Array(N), dn=new Float32Array(N), radJ=new Float32Array(N), vertJ=new Float32Array(N);
  const over=Math.max(1,(rec.dmgJ||0)/impBindingJ(rec));
  const ovk=Math.min(3, Math.log10(over)+1);
  const spread=0.004*(0.4+0.6*ovk);                          // fractional Δn → shear rate scales with overkill
  const pos=new Float32Array(N*3), col=new Float32Array(N*3);
  const tint=new THREE.Color(rec.data.color||0xffd9b0);
  for(let i=0;i<N;i++){
    Mi[i]=M0+(Math.random()-0.5)*0.06;
    dn[i]=n*spread*(Math.random()*2-1);
    radJ[i]=(Math.random()-0.5)*0.012;                       // fraction of the orbit radius
    vertJ[i]=(Math.random()-0.5)*0.006;
    const c=tint.clone().lerp(new THREE.Color(1,1,1),0.25+0.5*Math.random())
      .multiplyScalar(0.35+0.65*Math.random());              // varied brightness = glitter
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  const m=new THREE.PointsMaterial({map:glowCanvasTex('rgba(255,245,225,1)','rgba(255,210,150,0)'),
    vertexColors:true, size:1, sizeAttenuation:true, transparent:true, opacity:0.9,
    blending:THREE.AdditiveBlending, depthWrite:false});
  const points=new THREE.Points(g,m); points.frustumCulled=false;
  rec.parentHolder.add(points);                              // moons ring their parent planet
  debrisRings.push({rec,points,g,Mi,dn,radJ,vertJ,n,t:0});
  updateDebrisRings(0);                                      // place the points immediately
}
function updateDebrisRings(dtYears){
  for(const D of debrisRings){
    const rec=D.rec, a=rec.aDisp, e=rec.e;
    D.t+=dtYears;
    // lazy: accumulate sim-time and only recompute once the points would have
    // visibly moved (>~3e-4 rad along the orbit) or the display scale changed.
    // At real-time rates the ring costs nothing; at high warp it shears live.
    D.pend=(D.pend||0)+dtYears;
    if(D.init && a===D.lastA && e===D.lastE && D.pend*D.n*1.05<3e-4) continue;
    const step=D.pend; D.pend=0; D.init=true; D.lastA=a; D.lastE=e;
    const posA=D.g.attributes.position, b=a*Math.sqrt(1-e*e);
    for(let i=0;i<D.Mi.length;i++){
      D.Mi[i]+=(D.n+D.dn[i])*step;
      const E=kepler(D.Mi[i]%(Math.PI*2), e);
      const rj=1+D.radJ[i];
      _impV3.set(a*(Math.cos(E)-e)*rj, D.vertJ[i]*a, b*Math.sin(E)*rj).applyQuaternion(rec.q);
      posA.setXYZ(i,_impV3.x,_impV3.y,_impV3.z);
    }
    posA.needsUpdate=true;
    D.points.material.size=a*0.006;                          // tracks scale-mode changes
  }
}

/* state vector {r AU, v AU/yr} -> orbital elements, engine conventions
   (orbit normal = local -y; see positionBody). Shared by moon liberation
   and impact-momentum orbit perturbation. */
function stateToElements(r,v,mu){
  const rl=r.length(), v2=v.lengthSq();
  let a=1/(2/rl - v2/mu);
  const h=new THREE.Vector3().crossVectors(r,v);
  const ev=r.clone().multiplyScalar(v2-mu/rl).addScaledVector(v,-r.dot(v)).multiplyScalar(1/mu);
  let e=ev.length();
  if(!(a>0) || e>=0.985){ e=Math.min(e,0.985); a=rl/(1-0.9*e); }  // ejection edge case: keep it drawably bound
  const ph=e>1e-6 ? ev.normalize() : r.clone().normalize();       // periapsis direction
  const hn=h.lengthSq()>1e-12 ? h.normalize() : new THREE.Vector3(0,1,0);
  const Y=hn.clone().negate(), Z=new THREE.Vector3().crossVectors(ph,Y);
  const qn=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ph,Y,Z));
  let nu=Math.acos(Math.max(-1,Math.min(1, r.clone().normalize().dot(ph))));
  if(r.dot(v)<0) nu=Math.PI*2-nu;                                 // inbound half of the orbit
  const E2=2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2), Math.sqrt(1+e)*Math.cos(nu/2));
  return {a, e, q:qn, M:E2-e*Math.sin(E2)};
}

/* impact momentum: dv = m·v / M — recompute the struck body's orbit from its
   perturbed state vector, exactly. Planets get true new heliocentric elements;
   moons get exact new local elements with the display pacing scaled by Kepler. */
const KMS_PER_AUYR=4.74047;
function perturbOrbit(rec, dirWorld, dvKms){
  if(!(dvKms>1e-7) || rec.data.kind==='star' || rec.destroyed) return false;
  const dvA=dvKms/KMS_PER_AUYR;
  if(rec.nb){                                  // N-body mode: kicks are just Δv, gravity does the rest
    rec.nb.v.addScaledVector(_nbV.copy(dirWorld).normalize(), dvA);
    rec.orbitPerturbed=true;
    return true;
  }
  if(rec.helio){
    const aCur=rec.helioA!=null?rec.helioA:rec.data.dist;
    const st=keplerStateAU(aCur, rec.e, rec.q, rec.M%(Math.PI*2), MU_RA);
    st.v.addScaledVector(dirWorld, dvA);
    const el=stateToElements(st.r, st.v, MU_RA);
    if(!rec._origOrbit) rec._origOrbit={helio:true, helioA:rec.helioA, e:rec.e, q:rec.q.clone(), period:rec.period};
    rec.helioA=el.a; rec.e=el.e; rec.q=el.q; rec.M=el.M;
    rec.period=Math.sqrt(el.a*el.a*el.a/STAR_MSUN);
    rec.aDisp=distDisp(el.a);
  } else if(rec.isMoon){
    const pRec=bodies.find(b=>b.holder===rec.parentHolder);
    if(!pRec) return false;
    const muP=4*Math.PI*Math.PI*(impBodyMassKg(pRec)/SUN_KG);
    const aCur=rec._physA!=null?rec._physA:rec.data.dist;
    const st=keplerStateAU(aCur, rec.e, rec.q, rec.M%(Math.PI*2), muP);
    st.v.addScaledVector(dirWorld, dvA);
    const el=stateToElements(st.r, st.v, muP);
    if(!rec._origOrbit) rec._origOrbit={helio:false, _physA:rec._physA||null, e:rec.e, q:rec.q.clone(),
      period:rec.period, aDispReal:rec.aDispReal, aDispCompressed:rec.aDispCompressed};
    const ratio=el.a/aCur;
    rec._physA=el.a; rec.e=el.e; rec.q=el.q; rec.M=el.M;
    rec.period*=Math.pow(ratio,1.5);       // keep the tuned display pacing, scaled by Kepler's third law
    rec.aDispReal*=ratio; rec.aDispCompressed*=ratio;
    rec.aDisp=realScale?rec.aDispReal:rec.aDispCompressed;
  } else return false;
  if(rec.orbitLine){ rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q); }
  rec.orbitPerturbed=true;
  positionBody(rec);
  return true;
}

function liberateMoons(parentRec){
  const muP=4*Math.PI*Math.PI*(impBodyMassKg(parentRec)/SUN_KG);
  const ps=keplerStateAU(parentRec.helioA!=null?parentRec.helioA:parentRec.data.dist,
                         parentRec.e, parentRec.q, parentRec.M%(Math.PI*2), MU_RA);
  for(const m of bodies){
    if(m.parentHolder!==parentRec.holder || m===parentRec || m.destroyed) continue;
    const ms=keplerStateAU(m._physA!=null?m._physA:m.data.dist, m.e, m.q, m.M%(Math.PI*2), muP);
    const r=ps.r.clone().add(ms.r), v=ps.v.clone().add(ms.v);
    const el=stateToElements(r,v,MU_RA);
    const a=el.a, e=el.e, qn=el.q;
    // stash the pre-destruction orbit for 🧽 Heal, then rewire to Ra
    m._preLib={parentRec, isMoon:m.isMoon, aDispReal:m.aDispReal, aDispCompressed:m.aDispCompressed,
               e:m.e, q:m.q, M:m.M, period:m.period, orbitLine:m.orbitLine};
    if(m.orbitLine) m.orbitLine.visible=false;      // the old ellipse around the dead parent
    m.parentHolder=sunHolder; sunHolder.add(m.holder);
    m.helio=true; m.isMoon=false; m.helioA=a;
    m.e=e; m.q=qn; m.M=el.M;
    m.period=Math.sqrt(a*a*a/STAR_MSUN);                // real Kepler years, like every helio body
    m.aDisp=distDisp(a);
    const g=new THREE.BufferGeometry().setFromPoints(orbitPoints(m.aDisp,e));
    const lm=new THREE.LineBasicMaterial({color:new THREE.Color(m.data.color||0x88aaff),transparent:true,opacity:0.32});
    m.orbitLine=new THREE.Line(g,lm); m.orbitLine.quaternion.copy(qn); m.orbitLine.visible=showOrbits;
    sunHolder.add(m.orbitLine);
    const le=labelEls[m.data.key]; if(le) le.classList.add('major');   // labelled at system zoom, like a planet
    positionBody(m);
  }
}

function removeDebrisField(rec){
  // resurrecting the planet re-captures its liberated moons onto their old orbits
  for(const m of bodies){
    if(!m._preLib || m._preLib.parentRec!==rec) continue;
    if(m.orbitLine){ sunHolder.remove(m.orbitLine); m.orbitLine.geometry.dispose(); m.orbitLine.material.dispose(); }
    const P=m._preLib;
    m.orbitLine=P.orbitLine; if(m.orbitLine) m.orbitLine.visible=showOrbits;
    m.parentHolder=rec.holder; rec.holder.add(m.holder);
    m.helio=false; m.isMoon=P.isMoon; m.helioA=null;
    m._origOrbit=null; m.orbitPerturbed=false; m._physA=null;   // _preLib restore wins over any nudge
    m.e=P.e; m.q=P.q; m.M=P.M; m.period=P.period;
    m.aDispReal=P.aDispReal; m.aDispCompressed=P.aDispCompressed;
    m.aDisp=realScale?P.aDispReal:P.aDispCompressed;
    const le=labelEls[m.data.key]; if(le && m.data.parent!==DS.STAR.key) le.classList.remove('major');
    positionBody(m);
    m._preLib=null;
  }
  for(let i=debrisFields.length-1;i>=0;i--){
    const D=debrisFields[i]; if(D.rec!==rec) continue;
    const retireGenerated=function(r2){
      if(!r2) return;
      if(r2.destroyed) removeDebrisField(r2);
      const si=impScarred.indexOf(r2); if(si>=0) impScarred.splice(si,1);
      const bi=bodies.indexOf(r2); if(bi>=0) bodies.splice(bi,1);
      const pi=pickables.indexOf(r2.mesh); if(pi>=0) pickables.splice(pi,1);
      const le=labelEls[r2.data.key]; if(le){ le.remove(); delete labelEls[r2.data.key]; }
      if(selected===r2.data.key) selected=null;
      if(follow===r2) follow=null;
      if(tween.body===r2) tween.active=false;
      if(APP.currentData && APP.currentData.key===r2.data.key){
        document.getElementById('info').classList.remove('open'); syncInfoBtn(); APP.currentData=null;
      }
    };
    retireGenerated(D.rumpRec);
    // retire any first-class moonlet bodies this field spun off
    for(const ml of (D.moonlets||[])) retireGenerated(ml.rec);
    rec.mesh.remove(D.group);
    for(const g of D.geos) g.dispose();
    for(const g of (D.shardGeos||[])) g.dispose();
    if(D.outerMat){
      if(D.outerMat.map && !(D.outerMat.map.userData&&D.outerMat.map.userData.scorchCached)){ unregCanvasTex(D.outerMat.map); D.outerMat.map.dispose(); }
      if(D.outerMat.emissiveMap && !(D.outerMat.emissiveMap.userData&&D.outerMat.emissiveMap.userData.scorchCached)) D.outerMat.emissiveMap.dispose();
      D.outerMat.dispose(); }
    if(D.rumpMats) for(const mat of D.rumpMats) disposeHotRemnantMat(mat);
    else if(D.rumpMat) disposeHotRemnantMat(D.rumpMat);
    D.chunkMat.dispose();
    if(D.haze){ (D.hazeParent||D.group).remove(D.haze); D.haze.geometry.dispose(); unregCanvasTex(D.hazeMat.map); D.hazeMat.map.dispose(); D.hazeMat.dispose(); }
    debrisFields.splice(i,1);
  }
  for(let i=debrisRings.length-1;i>=0;i--){
    const D=debrisRings[i]; if(D.rec!==rec) continue;
    rec.parentHolder.remove(D.points); D.g.dispose();
    unregCanvasTex(D.points.material.map); D.points.material.map.dispose(); D.points.material.dispose();
    debrisRings.splice(i,1);
  }
  rec.mesh.material.visible=true;
  for(const ch of rec.mesh.children) ch.visible=true;
  rec.destroyed=false;
  updateNavStatus(rec);
  const el=labelEls[rec.data.key]; if(el) el.textContent=locName(rec.data);
  refreshNav();
}

function impHeal(){
  impBlastQueue.length=0;                    // cancel any still-travelling blast wave
  for(const rec of bodies){
    if(!rec._preFree) continue;
    const P=rec._preFree;
    rec.freeState=null; rec.parentHolder=P.parentHolder; P.parentHolder.add(rec.holder);
    rec.helio=P.helio; rec.isMoon=P.isMoon; rec.helioA=P.helioA; rec._physA=P._physA;
    rec.aDisp=P.aDisp; rec.aDispReal=P.aDispReal; rec.aDispCompressed=P.aDispCompressed;
    rec.e=P.e; rec.q=P.q; rec.M=P.M; rec.period=P.period; rec.orbitLine=P.orbitLine;
    if(rec.orbitLine) rec.orbitLine.visible=showOrbits&&!rec.nb;
    rec.orbitPerturbed=false; rec._preFree=null;
    const le=labelEls[rec.data.key]; if(le && !(rec.data.parent===DS.STAR.key||rec.data.kind==='star')) le.classList.remove('major');
    positionBody(rec);
  }
  for(const rec of impScarred){
    const s=rec.scar;
    s.glowC.getContext('2d').clearRect(0,0,s.glowC.width,s.glowC.height);
    s.meltC.getContext('2d').clearRect(0,0,s.meltC.width,s.meltC.height);   // char + lava share this
    if(s.baseC) s.baseC.getContext('2d').clearRect(0,0,s.baseC.width,s.baseC.height);
    s.log.length=0; s.dirty=false;
    impResetHeat(s);
    s.glowT.needsUpdate=true; s.meltT.needsUpdate=true;
    if(s.ocean){ s.ocean.material.opacity=0; s.ocean.material.color.setScalar(1); }
    if(s.halo) s.halo.material.uniforms.p.value=0;
    if(s.wocean) s.wocean.material.opacity=0;
    if(s.steam) s.steam.material.opacity=0;
    s.oceanM=0; s.oceanHot=0; s.waterM=0; s.steamM=0;
    s.meltTarget=0; s.oceanHotTarget=0; s.waterTarget=0; s.steamTarget=0;
    rec._impWaterKg=0;
    const wasDestroyed=rec.destroyed;
    rec.dmgJ=0; rec.shattered=false; rec._accretedKg=0; rec._lastHitBy=null;
    // deflate a puffed-up giant and calm its boosted/created escape tail
    rec.puffTarget=1; rec.puffK=1;
    if(rec._baseEmissive && rec.mesh.material.emissive){
      rec.mesh.material.emissive.copy(rec._baseEmissive.c);
      rec.mesh.material.emissiveIntensity=rec._baseEmissive.i; rec._baseEmissive=null;
    }
    if(rec._puffTail){
      const t=rec._puffTail;
      if(t._created){ scene.remove(t.points); t.g.dispose(); t.points.material.dispose();
        const ti=evapTails.indexOf(t); if(ti>=0) evapTails.splice(ti,1); }
      else if(t._base){ t.rate=t._base.rate; t.points.material.uniforms.uAlpha.value=t._base.alpha; t._base=null; }
      rec._puffTail=null;
    }
    if(wasDestroyed){
      if(impIsStellar(rec)){
        removeStellarBlast(rec);
        rec.destroyed=false; updateNavStatus(rec);
        const el=labelEls[rec.data.key]; if(el) el.textContent=locName(rec.data);
      } else removeDebrisField(rec);   // resurrect the world
    }
    if(rec._absorbedImpact){           // un-glue a wreck that was accreted onto a survivor
      const A=rec._absorbedImpact; rec._absorbedImpact=null;
      if(rec._absorbedGone){           // fully swallowed: rejoin picking/nav (label re-grows via ensureLabels)
        rec._absorbedGone=false;
        if(pickables.indexOf(rec.mesh)<0) pickables.push(rec.mesh);
        refreshNav();
      }
      rec.parentHolder=A.parentHolder||sunHolder; rec.parentHolder.add(rec.holder);
      rec.holder.position.copy(A.holderPos);
      rec.helio=A.helio; rec.isMoon=A.isMoon; rec.helioA=A.helioA; rec._physA=A._physA;
      rec.aDispReal=A.aDispReal; rec.aDispCompressed=A.aDispCompressed;
      rec.aDisp=A.helio ? distDisp(A.helioA!=null?A.helioA:rec.data.dist)
              : A.isMoon ? (realScale?A.aDispReal:A.aDispCompressed) : A.aDisp;
      if(A.orbitLine){ rec.orbitLine=A.orbitLine; rec.parentHolder.add(rec.orbitLine);
        rec.orbitLine.visible=showOrbits&&!nbodyOn; }
      if(nbodyOn && A.nb) rec.nb={r:A.nb.r.clone(), v:A.nb.v.clone(), gm:A.nb.gm};
      if(!rec.nb) positionBody(rec);
    }
    impHealExtinct(rec);               // the biosphere comes back with the crust
    // N-body: healed mass gravitates at full strength again (undoes the
    // supernova's 80% mass shedding AND any boil-off mass loss)
    if(rec.nb) rec.nb.gm=NB_GMK*impBodyMassKg(rec);
  }
  if(!realScale) applySizes();                  // deflated giants: reapply compressed-mode scales
  // undo impact-momentum orbit changes (liberated moons were restored above)
  for(const rec of bodies){
    if(!rec._origOrbit || rec._preLib){ if(rec._preLib) rec._origOrbit=null; continue; }
    const O=rec._origOrbit;
    rec.e=O.e; rec.q=O.q; rec.period=O.period;
    if(O.helio){ rec.helioA=O.helioA; rec.aDisp=distDisp(rec.helioA!=null?rec.helioA:rec.data.dist); }
    else { rec._physA=O._physA; rec.aDispReal=O.aDispReal; rec.aDispCompressed=O.aDispCompressed;
           rec.aDisp=realScale?rec.aDispReal:rec.aDispCompressed; }
    if(rec.orbitLine){ rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q); }
    rec.orbitPerturbed=false; rec._origOrbit=null;
    positionBody(rec);
  }
  for(const t of evapTails) t.points.visible=showTails;
  if(bodies.some(r=>r._custom)) saveCustoms();
  if(APP.currentData && document.getElementById('info').classList.contains('open'))
    openInfo(APP.currentData);
  sfxChime();
}

/* ============================================================
   Sound effects — procedural Web Audio, no files (offline).
   Not realistic (space is silent) — rule of cool, off by default.
   Master bus: compressor glue + a synthesized 2.6 s hall reverb.
   ============================================================ */
let sfxOn=false, sfxAC=null, sfxMaster=null, sfxNoiseBuf=null, sfxBeamN=null;
function sfxCtx(){
  if(sfxAC) return sfxAC;
  const Ctor=window.AudioContext||window.webkitAudioContext; if(!Ctor) return null;
  sfxAC=new Ctor();
  const comp=sfxAC.createDynamicsCompressor();
  comp.threshold.value=-18; comp.knee.value=18; comp.ratio.value=6;
  comp.attack.value=0.004; comp.release.value=0.28;
  comp.connect(sfxAC.destination);
  sfxMaster=sfxAC.createGain(); sfxMaster.gain.value=0.9;
  sfxMaster.connect(comp);
  const sr=sfxAC.sampleRate, ir=sfxAC.createBuffer(2,2.6*sr|0,sr);   // exp-decaying noise = hall
  for(let ch=0;ch<2;ch++){ const d=ir.getChannelData(ch);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3.2); }
  const verb=sfxAC.createConvolver(); verb.buffer=ir;
  const wet=sfxAC.createGain(); wet.gain.value=0.35;
  sfxMaster.connect(verb); verb.connect(wet); wet.connect(comp);
  return sfxAC;
}
function sfxReady(){ if(!sfxOn||!sfxCtx()) return false;
  if(sfxAC.state==='suspended') sfxAC.resume();               // strikes ARE user gestures
  return sfxAC.state!=='closed';
}
function sfxNoiseSrc(){
  if(!sfxNoiseBuf){ sfxNoiseBuf=sfxAC.createBuffer(1,sfxAC.sampleRate*2,sfxAC.sampleRate);
    const d=sfxNoiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  const s=sfxAC.createBufferSource(); s.buffer=sfxNoiseBuf; s.loop=true; return s;
}
function sfxDistGain(rec){                                    // closer to the fireworks = louder
      const R=impRenderRadius(rec)||1;
  const d=camera.position.distanceTo(worldPosOf(rec));
  return Math.max(0.12, Math.min(1, Math.sqrt(8*R/Math.max(d,8*R))));
}
/* one boom: sine sub-drop + noise crack through a sweeping lowpass; k 0..1 sizes it */
function sfxBoom(g0,k,t){
  const o=sfxAC.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(120-60*k,t); o.frequency.exponentialRampToValueAtTime(24,t+0.5+1.2*k);
  const og=sfxAC.createGain(); og.gain.setValueAtTime(0.9*g0,t);
  og.gain.exponentialRampToValueAtTime(1e-4,t+0.9+1.6*k);
  o.connect(og); og.connect(sfxMaster); o.start(t); o.stop(t+1+1.7*k);
  const n=sfxNoiseSrc(), f=sfxAC.createBiquadFilter(); f.type='lowpass';
  f.frequency.setValueAtTime(6000,t); f.frequency.exponentialRampToValueAtTime(120,t+0.7+1.5*k);
  const ng=sfxAC.createGain(); ng.gain.setValueAtTime(0.7*g0,t);
  ng.gain.exponentialRampToValueAtTime(1e-4,t+0.8+1.8*k);
  n.connect(f); f.connect(ng); ng.connect(sfxMaster); n.start(t); n.stop(t+1+2*k);
}
function sfxImpact(rec,E){
  if(!sfxReady()) return;
  const k=Math.min(1,Math.max(0,(Math.log10(Math.max(1,E))-20)/14));   // 1e20..1e34 J → 0..1
  sfxBoom(sfxDistGain(rec)*(0.35+0.65*k), k, sfxAC.currentTime);
}
function sfxShatter(rec){
  if(impRestoring) return;
  if(!sfxReady()) return;
  const t=sfxAC.currentTime, g0=Math.max(0.5,sfxDistGain(rec));
  sfxBoom(g0*1.2, 1, t);
  const n=sfxNoiseSrc(), f=sfxAC.createBiquadFilter();       // long seismic rumble
  f.type='lowpass'; f.frequency.setValueAtTime(90,t); f.frequency.exponentialRampToValueAtTime(35,t+6);
  const ng=sfxAC.createGain(); ng.gain.setValueAtTime(0.8*g0,t+0.15);
  ng.gain.exponentialRampToValueAtTime(1e-4,t+7);
  n.connect(f); f.connect(ng); ng.connect(sfxMaster); n.start(t); n.stop(t+7.2);
  for(let i=0;i<14;i++){                                     // debris crackle
    const ct=t+0.15+Math.random()*2.2, cd=0.04+Math.random()*0.09;
    const c=sfxNoiseSrc(), cf=sfxAC.createBiquadFilter();
    cf.type='bandpass'; cf.frequency.value=400+Math.random()*2100; cf.Q.value=2.5;
    const cg=sfxAC.createGain(); cg.gain.setValueAtTime(0,ct);
    cg.gain.linearRampToValueAtTime((0.08+Math.random()*0.22)*g0,ct+0.008);
    cg.gain.exponentialRampToValueAtTime(1e-4,ct+cd);
    c.connect(cf); cf.connect(cg); cg.connect(sfxMaster); c.start(ct); c.stop(ct+cd+0.05);
  }
}
function sfxWhoosh(T){                                        // asteroid run-in, rises toward arrival
  if(!sfxReady()) return;
  const t=sfxAC.currentTime, d=Math.min(T,3.2);
  const n=sfxNoiseSrc(), f=sfxAC.createBiquadFilter();
  f.type='bandpass'; f.Q.value=1.1;
  f.frequency.setValueAtTime(260,t); f.frequency.exponentialRampToValueAtTime(1600,t+d);
  const g=sfxAC.createGain(); g.gain.setValueAtTime(1e-4,t);
  g.gain.exponentialRampToValueAtTime(0.16,t+d*0.85); g.gain.exponentialRampToValueAtTime(1e-4,t+d);
  n.connect(f); f.connect(g); g.connect(sfxMaster); n.start(t); n.stop(t+d+0.05);
}
function sfxBeamStart(){
  if(!sfxReady()||sfxBeamN) return;
  const t=sfxAC.currentTime, b=Math.min(1,Math.max(0,(Math.log10(impPowW)-12)/30));
  const g=sfxAC.createGain(); g.gain.setValueAtTime(1e-4,t);
  g.gain.exponentialRampToValueAtTime(0.20+0.14*b,t+0.12);
  g.connect(sfxMaster);
  const f=sfxAC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=320+520*b; f.Q.value=8;
  f.connect(g);
  const o1=sfxAC.createOscillator(); o1.type='sawtooth'; o1.frequency.value=64;
  const o2=sfxAC.createOscillator(); o2.type='sawtooth'; o2.frequency.value=64.7;   // slow beat
  o1.connect(f); o2.connect(f);
  const lfo=sfxAC.createOscillator(); lfo.frequency.value=5.5;                      // filter wobble
  const lg=sfxAC.createGain(); lg.gain.value=120+90*b; lfo.connect(lg); lg.connect(f.frequency);
  const sh=sfxAC.createOscillator(); sh.type='sine'; sh.frequency.value=1960;       // shimmer
  const vib=sfxAC.createOscillator(); vib.frequency.value=7;
  const vg=sfxAC.createGain(); vg.gain.value=26; vib.connect(vg); vg.connect(sh.frequency);
  const sg=sfxAC.createGain(); sg.gain.value=0.05; sh.connect(sg); sg.connect(g);
  const hiss=sfxNoiseSrc(), hf=sfxAC.createBiquadFilter();
  hf.type='bandpass'; hf.frequency.value=3000; hf.Q.value=1.2;
  const hg=sfxAC.createGain(); hg.gain.value=0.05; hiss.connect(hf); hf.connect(hg); hg.connect(g);
  for(const x of [o1,o2,lfo,sh,vib,hiss]) x.start(t);
  sfxBeamN={g, stops:[o1,o2,lfo,sh,vib,hiss]};
}
function sfxBeamStop(){
  if(!sfxBeamN||!sfxAC) return;
  const N=sfxBeamN, t=sfxAC.currentTime; sfxBeamN=null;
  N.g.gain.cancelScheduledValues(t); N.g.gain.setValueAtTime(N.g.gain.value,t);
  N.g.gain.exponentialRampToValueAtTime(1e-4,t+0.15);
  for(const x of N.stops){ try{ x.stop(t+0.2); }catch(_){} }
  setTimeout(()=>{ try{ N.g.disconnect(); }catch(_){} },400);
}
function sfxChime(){                                          // 🧽 Heal: a soft two-note bell
  if(!sfxReady()) return;
  const t=sfxAC.currentTime;
  [[880,0],[1318.5,0.09]].forEach(([hz,dt])=>{
    const o=sfxAC.createOscillator(); o.type='sine'; o.frequency.value=hz;
    const g=sfxAC.createGain(); g.gain.setValueAtTime(0,t+dt);
    g.gain.linearRampToValueAtTime(0.16,t+dt+0.012); g.gain.exponentialRampToValueAtTime(1e-4,t+dt+1.1);
    o.connect(g); g.connect(sfxMaster); o.start(t+dt); o.stop(t+dt+1.2);
  });
}
function toggleSfx(){
  sfxOn=!sfxOn;
  try{ localStorage.setItem('ra-sfx', sfxOn?'1':'0'); }catch(_){}
  const b=document.getElementById('t-sfx'); if(b) b.classList.toggle('on',sfxOn);
  if(sfxOn){ if(sfxReady()){ sfxChime(); if(impBeam) sfxBeamStart(); } }
  else { sfxBeamStop(); if(sfxAC&&sfxAC.state==='running') sfxAC.suspend(); }
}

/* ---- asteroid projectiles: jittered rock + glow, homing at the chosen surface point ---- */
function impSurfaceRate(){
  if(!surfaceView || !playing) return 1;
  return Math.max(1, Math.min(IMP_SURFACE_RATE_MAX, YEARS_PER_SEC*timeScale*SEC_PER_YEAR));
}
function impToolDt(dt){ return dt*impSurfaceRate(); }
/* heat diffusion/cooling ride the TIME WARP everywhere (not just surface view):
   at real-time (1 s/s, the default) this is exactly the old pace; crank the
   slider and the glow spreads and fades correspondingly faster, capped so the
   fixed-step diffusion stays stable and cheap. Pause freezes the surface. */
const IMP_HEAT_RATE_MAX=16;   // fast enough to read as time-warped, slow enough to still see the glow
function impHeatRate(){
  if(!playing) return 0;
  return Math.max(1, Math.min(IMP_HEAT_RATE_MAX, YEARS_PER_SEC*timeScale*SEC_PER_YEAR));
}

function launchAsteroid(rec, hit){
  const u=hit.uv?hit.uv.x:0.5, v=hit.uv?hit.uv.y:0.5;
  const E=impKE();
  const tgtR=impRenderRadius(rec);
  const size=Math.max(tgtR*0.05, Math.min(tgtR*0.45, tgtR*0.45*Math.cbrt(impDiaKm/1000)));
  // pooled rig (shared geometry + material + glow sprite) — no per-shot alloc/dispose
  const rig=acquireAstRig();
  const mesh=rig.mesh;
  mesh.scale.setScalar(size);
  // approach ~40° off the camera line so the run-in is visible
  const tgtW=uvToWorld(rec,u,v);
  const camDir=_impV1.copy(tgtW).sub(camera.position).normalize();
  const side=_impV2.set(0,1,0).cross(camDir);
  if(side.lengthSq()<1e-8) side.set(1,0,0).cross(camDir);   // looking straight down the pole
  side.normalize().applyAxisAngle(camDir,Math.random()*Math.PI*2);
  const A=camDir.multiplyScalar(Math.cos(0.7)).addScaledVector(side,Math.sin(0.7)).normalize();
  const dist=Math.max(tgtR*10, camera.position.distanceTo(tgtW)*0.35);
  const start=tgtW.clone().addScaledVector(A,-dist);
  const T=Math.min(3.6, Math.max(1.4, 3.6-0.55*Math.log10(impSpdKms/11)));
  impAsteroids.push({rec,u,v,rig,mesh,start,t:0,T,E,
    mKg:impRho*(Math.PI/6)*Math.pow(impDiaKm*1000,3), vKms:impSpdKms, matI:impMatI,   // for momentum + delivery
    spin:new THREE.Vector3(Math.random()*4-2,Math.random()*4-2,Math.random()*4-2)});
  sfxWhoosh(T);
}

/* ---- laser: surface-locked ray; dragging retargets to a new hit ---- */
function startBeam(rec, e, hit){
  if(impBeam) stopBeam();
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1;
  mouse.y=-((e.clientY-r.top)/r.height)*2+1;
  impRC.setFromCamera(mouse,camera);
  const geo=new THREE.CylinderGeometry(1,1,1,10,1,true);
  const core=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xfff6ea,transparent:true,opacity:0.85,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  const sheath=new THREE.Mesh(geo.clone(),new THREE.MeshBasicMaterial({color:0xff5030,transparent:true,opacity:0.26,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  const hitGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:impFlashTexture(),transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  scene.add(core); scene.add(sheath); scene.add(hitGlow);
  const uv=hit&&hit.uv ? hit.uv : {x:0.5,y:0.5};
  impBeam={rec, origin:impRC.ray.origin.clone(), dir:impRC.ray.direction.clone(),
    u:uv.x, v:uv.y, core, sheath, hitGlow, missT:0, sparkT:0, firedJ:0};
  controls.enabled=false;
  sfxBeamStart();
}
function retargetBeam(e){
  if(!impBeam) return;
  const h=pickHit(e);
  if(!h || !h.uv) return;
  const rec=bodies.find(b=>b.data.key===h.object.userData.bodyKey);
  if(rec && !rec.destroyed){ impBeam.rec=rec; impBeam.u=h.uv.x; impBeam.v=h.uv.y; impBeam.missT=0; }
}
function stopBeam(){
  if(!impBeam) return;
  sfxBeamStop();
  for(const o of [impBeam.core,impBeam.sheath,impBeam.hitGlow]){
    scene.remove(o); if(o.geometry) o.geometry.dispose(); o.material.dispose();
  }
  impBeam=null;
  if(!flying) controls.enabled=true;
}
const _cylUp=new THREE.Vector3(0,1,0), _cylD=new THREE.Vector3();
function placeCyl(mesh,a,b,r){
  _cylD.copy(b).sub(a); const len=_cylD.length()||1e-6;
  mesh.position.copy(a).addScaledVector(_cylD,0.5);
  mesh.quaternion.setFromUnitVectors(_cylUp,_cylD.multiplyScalar(1/len));
  mesh.scale.set(r,len,r);
}

/* ---- per-frame update (wall-clock dt) ---- */
function updateImpacts(dt){
  impShellBudget=1;                          // one first-time shell bake per frame
  impProcessBlastQueue(lastSimDtYears);      // supernova damage fronts sweep on SIM time
  // asteroids (iterate backwards: strikes splice)
  for(let i=impAsteroids.length-1;i>=0;i--){
    const a=impAsteroids[i];
    a.t+=dt;
    const tgt=uvToWorld(a.rec,a.u,a.v);
    const k=a.t/a.T;
    if(k>=1){
      applyStrike(a.rec,a.u,a.v,a.E,{mKg:a.mKg, vKms:a.vKms, dir:tgt.clone().sub(a.start).normalize()});
      releaseAstRig(a.rig);                  // back to the pool — no dispose (reused next shot)
      impAsteroids.splice(i,1); continue;
    }
    const e=k*k*(3-2*k);
    a.mesh.position.lerpVectors(a.start,tgt,e);
    a.mesh.rotation.x+=a.spin.x*dt; a.mesh.rotation.y+=a.spin.y*dt; a.mesh.rotation.z+=a.spin.z*dt;
  }
  // laser — follows the pointer; sweeping onto another world retargets it
  if(impBeam){
    let hit=null;
    if(impBeam.rec && !impBeam.rec.destroyed){
      hit={point:uvToWorld(impBeam.rec,impBeam.u,impBeam.v), uv:{x:impBeam.u,y:impBeam.v}};
    }
    if(hit){
      impBeam.missT=0;
      const toolDt=impToolDt(dt);
      const EJ=impPowW*toolDt;
      impBeam.firedJ+=EJ;
      const rec=impBeam.rec, R=impRenderRadius(rec);
      if(!impImmune(rec) && !rec.destroyed){
        const s=getScars(rec);
        const th=Math.min(20, Math.max(0.5, 1.2*Math.cbrt(impPowW/1e18)));
        const rPx=th/180*512;
        const gasy=(rec.data.kind==='gasgiant'||impIsStellar(rec));
        if(hit.uv){
          const cold=!(s.heatActive || s.heatMax>0.012);
          if(!gasy){                          // permanent scorch trail, throttled; heat grid carries the live molten spot
            s.laserLogT=(s.laserLogT||0)+dt;
            if(s.laserLogT>0.20){
              s.laserLogT=0;
              impPersistentSplat(s,'c',hit.uv.x,1-hit.uv.y,rPx*0.62,IMP_CHAR_SOFT,null);
              impPersistentSplat(s,'m',hit.uv.x,1-hit.uv.y,rPx*0.30,IMP_LAVA_SOFT,0.62);
            }
          }
          const heatAmt=Math.min(0.28,(0.055+0.030*Math.cbrt(impPowW/1e18))*Math.min(1.8,toolDt*30));
          impDepositHeat(rec,s,hit.uv.x,1-hit.uv.y,rPx*(gasy?1.35:0.95),heatAmt);
          if(cold) impPaintHeat(rec,s,true);
        }
        rec.dmgJ=(rec.dmgJ||0)+EJ;
        if(hit.uv) rec._lastHit={u:hit.uv.x, v:hit.uv.y};
        impUpdateMelt(rec);
        if(rec.dmgJ>=impBindingJ(rec) && !rec.shattered) shatterBody(rec);
      }
      const ref=camera.position.distanceTo(controls.target);
      const a=camera.localToWorld(_impV1.set(0.06*ref,-0.045*ref,-0.15*ref));
      const b=hit.point;
      const d=camera.position.distanceTo(b);
      placeCyl(impBeam.core,a,b,d*0.0012);
      placeCyl(impBeam.sheath,a,b,d*0.0046);
      impBeam.hitGlow.position.copy(b).addScaledVector(_impV2.copy(b).sub(worldPosOf(impBeam.rec)).normalize(),R*0.03);
      impBeam.hitGlow.scale.setScalar(R*(0.5+0.15*Math.sin(performance.now()*0.02)));
      impBeam.sparkT+=dt;
      if(impBeam.sparkT>0.06){
        impBeam.sparkT=0;
        const n=_impV2.copy(b).sub(worldPosOf(impBeam.rec)).normalize().clone();
        emitBurst(b,6,impConeDir(n,0.9),R*0.5,R*0.05,0.7);
      }
      impBeam.core.visible=impBeam.sheath.visible=impBeam.hitGlow.visible=true;
    } else {
      impBeam.missT+=dt;
      impBeam.core.visible=impBeam.sheath.visible=impBeam.hitGlow.visible=false;
      if(impBeam.missT>1.5) stopBeam();      // forgiving: sweeping between worlds keeps the beam alive
    }
  }
  // one-shot fx sprites
  for(let i=impFx.length-1;i>=0;i--){
    const f=impFx[i]; f.t+=dt;
    const k=f.t/f.T;
    if(k>=1){ f.o.visible=false; f.pool.push(f.o); impFx.splice(i,1); continue; }   // return to pool, no dispose
    if(f.kind==='flash'){ f.o.scale.setScalar(f.sc*(0.25+2.0*Math.sqrt(k))); f.o.material.opacity=Math.pow(1-k,1.6); }
    else { f.o.scale.setScalar(f.sc*(0.3+3.5*k)); f.o.material.opacity=0.55*(1-k); }
  }
  // ejecta pool
  if(impPool && impPoolActiveT>0){
    impPoolActiveT-=dt;
    const P=impPool;
    for(let i=0;i<P.N;i++){
      if(P.age[i]>=P.life[i]) continue;
      P.age[i]+=dt;
      P.pos[i*3]+=P.vel[i*3]*dt; P.pos[i*3+1]+=P.vel[i*3+1]*dt; P.pos[i*3+2]+=P.vel[i*3+2]*dt;
      P.ageA[i]=Math.min(1,P.age[i]/P.life[i]);
    }
    P.g.attributes.position.needsUpdate=true;
    P.g.attributes.aAge.needsUpdate=true;
    P.g.attributes.aSize.needsUpdate=true;
    P.m.uniforms.uScaleH.value=renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));
  }
  // debris fields: fragments evolve under the dead world's self-gravity — slow
  // pieces fall back and re-accrete into a hot remnant, fast ones disperse — and
  // the dust haze expands and fades. This aftermath now runs on SIM time, like the
  // debris ring, so the speed slider fast-forwards re-accretion (and pausing freezes
  // it); the gravity step is sub-stepped so the integrator stays stable at high warp.
  const debWarp=(playing&&!surfaceView)?timeScale:0, ddt=dt*debWarp;
  const nSub=Math.max(1, Math.min(64, Math.ceil(ddt/0.05))), hSub=ddt/nSub;
  for(const D of debrisFields){
    D.t+=ddt;
    const GM=D.GM, soft2=D.soft*D.soft, esc2=(DEB_ESCAPE_R*D.Rloc)*(DEB_ESCAPE_R*D.Rloc);
    for(let s=0;s<nSub;s++){
      for(const c of D.chunks){
        if(c.cap){
          if(c.dissT>0){
            c.dissT-=hSub;
            c.m.position.addScaledVector(c.vel,hSub);
            c.m.rotation.x+=c.rot.x*hSub; c.m.rotation.y+=c.rot.y*hSub; c.m.rotation.z+=c.rot.z*hSub;
            const k=Math.max(0,c.dissT/c.dissT0);
            c.m.scale.setScalar((c.baseScale||1)*k);
            if(c.dissT<=0){ c.m.visible=false; c.m.scale.setScalar(0.0001); }
          }
          continue;
        }
        const p=c.m.position, r2=p.lengthSq();
        if(r2<esc2){                                     // still bound: softened central gravity
          c.vel.addScaledVector(p, -GM/Math.pow(r2+soft2,1.5)*hSub);
        }
        p.addScaledVector(c.vel,hSub);
        c.m.rotation.x+=c.rot.x*hSub; c.m.rotation.y+=c.rot.y*hSub; c.m.rotation.z+=c.rot.z*hSub;
        // Re-accretion adds mass to the spherical remnant; the visible rock clears
        // away instead of freezing inside the new planet.
        const cr=(c.rad||D.Rloc*0.04), coreClear=D.rCore+cr*0.45;
        if(D.allowRemnant && (!D.rumpRec || !D.rumpRec.destroyed) && p.lengthSq()<coreClear*coreClear){
          dissolveChunk(D,c,DEB_ORIGIN,D.rCore,true);
          continue;
        }
        let cleared=false;
        for(const ml of D.moonlets){
          if(ml.rec.destroyed) continue;
          const mr=ml.rec.radius+cr*0.75;
          if(p.distanceToSquared(ml.m.position)<mr*mr){
            dissolveChunk(D,c,ml.m.position,ml.rec.radius*1.08,false);
            cleared=true; break;
          }
        }
        if(cleared) continue;
      }
      // moonlets orbit the remnant under the same softened self-gravity
      for(const ml of D.moonlets){
        const mp=ml.m.position;
        ml.vel.addScaledVector(mp, -GM/Math.pow(mp.lengthSq()+soft2,1.5)*hSub);
        mp.addScaledVector(ml.vel,hSub);
        ml.m.rotation.x+=ml.spin.x*hSub; ml.m.rotation.y+=ml.spin.y*hSub; ml.m.rotation.z+=ml.spin.z*hSub;
      }
    }
    if(D.remnant) D.remnant.scale.setScalar(D.rCore);
    // world-shattering fragments stay incandescent for a long time
    const cool=0.10+0.90*Math.exp(-D.t/75);
    if(D.rumpRec) updateRumpData(D);
    if(D.rumpMats) for(const mat of D.rumpMats) mat.emissiveIntensity=(mat.userData.emberBase||2.8)*(0.82+0.18*cool);
    D.chunkMat.emissiveIntensity=(D.chunkMat.userData.emberBase||0.6)*cool;
    if(D.outerMat) D.outerMat.emissiveIntensity=(D.outerMat.userData.emberBase||2.2)*cool;
    if(D.haze){
      const fade=1/(1+D.t/D.fadeT);
      if(fade<0.05){ (D.hazeParent||D.group).remove(D.haze); D.haze.geometry.dispose();
        unregCanvasTex(D.hazeMat.map); D.hazeMat.map.dispose(); D.hazeMat.dispose(); D.haze=null; }
      else{
        D.hazeMat.opacity+=(D.op0*fade-D.hazeMat.opacity)*Math.min(1,dt*10);
        D.hazeMat.size=D.hazeWorldSize||D.hazeSize*D.rec.mesh.scale.x;
        const hp=D.haze.geometry.attributes.position, k=1+Math.min(0.18,ddt*0.05);   // slow expansion
        for(let i=0;i<hp.count;i++) hp.setXYZ(i, hp.getX(i)*k, hp.getY(i)*k, hp.getZ(i)*k);
        hp.needsUpdate=true;
      }
    }
    // an absorbed wreck's shards have all sunk in: flag it for full teardown
    if(D.absorbed && !D._swallowDone && D.t>2.5 && D.chunks.every(c=>c.cap&&c.dissT<=0))
      D._swallowDone=true;
  }
  // teardown outside the iteration — retiring splices debrisFields
  for(let i=debrisFields.length-1;i>=0;i--)
    if(debrisFields[i]._swallowDone) retireAbsorbedWreck(debrisFields[i].rec);
  for(const B of stellarBlasts){
    if(B.done) continue;                       // only the tiny remnant core is left
    // the whole show runs on SIM time at physical speed: light front at c,
    // shock/ejecta front at 0.1c — the speed slider paces it, pause freezes it
    B.tYears+=lastSimDtYears;
    const tD=B.tYears*365.25;                              // sim-days since core collapse
    const shockAU=B.tYears/SN_SHOCK_YR_PER_AU;             // matter front position
    const lightAU=B.tYears/SN_LIGHT_YR_PER_AU;             // radiation front position
    const K=Math.min(1,shockAU/SN_MAX_AU);
    // core flash: a supernova light curve — blinding, decaying over sim-days
    const f=Math.exp(-tD/6);
    B.sp.material.opacity=Math.min(1,3*f);
    B.sp.scale.setScalar(B.R*(3+10*(1-f)));
    // shock shell rides the true 0.1c front; whitens → reddens → thins to nothing
    B.shell.scale.setScalar(Math.max(B.R*1.2, distDisp(shockAU)));
    B.shellMat.uniforms.c.value.copy(B.c0).lerp(B.c1, Math.min(1,K/0.27));
    B.shellMat.uniforms.p.value=1.15*(1-K)*(1-K);
    // radiation shell rides the light front, fading as it thins with distance
    const KL=Math.min(1,lightAU/SN_MAX_AU);
    B.lightShell.visible=KL<1;
    if(B.lightShell.visible){
      B.lightShell.scale.setScalar(Math.max(B.R*1.2, distDisp(lightAU)));
      B.lightMat.uniforms.p.value=0.7*(1-KL)*(1-KL);
    }
    // ejecta: two uniforms — the shaders do all the motion/colour work
    B.mat.uniforms.uF.value=Math.max(B.R*0.2, distDisp(shockAU)); B.mat.uniforms.uK.value=K;
    // the collapsed core fades in as the fireball clears (first sim-days)
    B.core.material.opacity=Math.min(0.85, Math.max(0,(tD-0.5)/10));
    // the dying star's light: a brief surge, then the lights go out, reddening
    if(B.rec.data.kind==='star' && sunLight){
      const base=sunLight.userData.baseIntensity||1.9;
      if(!sunLight.userData.baseColor) sunLight.userData.baseColor=sunLight.color.clone();
      sunLight.intensity=base*(tD<0.05 ? 1+2.4*(tD/0.05) : Math.max(0,3.4*Math.exp(-(tD-0.05)/5)));
      sunLight.color.copy(sunLight.userData.baseColor).lerp(_snRedTint, Math.min(1,tD/10));
    }
    if(K>=1) finishStellarBlast(B);            // shock left the system: free the fx, keep the ember
  }
  // debris rings shear along the orbit on SIM time (time warp spreads them)
  if(debrisRings.length) updateDebrisRings(lastSimDtYears);
  // heat glow cools (shattered worlds are gone); batched, and only while hot —
  // once faded, no more full-canvas ops or texture re-uploads
  const surfaceDt=impToolDt(dt);
  for(const rec of impScarred){
    // heated gas giants ease toward their inflated radius
    if(rec.puffTarget && Math.abs((rec.puffK||1)-rec.puffTarget)>1e-4){
      rec.puffK=(rec.puffK||1)+(rec.puffTarget-(rec.puffK||1))*Math.min(1,dt*0.9);
      if(!realScale && !rec.destroyed) rec.mesh.scale.setScalar(sizeMult*bodyF()*rec.puffK);
    }
    if(rec.shattered) continue;
    const s=rec.scar;
    if(s.wocean && s.waterM>0)
      s.wocean.material.map.offset.x=(s.wocean.material.map.offset.x+surfaceDt*0.006)%1;  // currents
    if(s.steam && s.steamM>0)
      s.steam.material.map.offset.x=(s.steam.material.map.offset.x+surfaceDt*0.010)%1;    // storm bands
    if(s.ocean && s.oceanM>0){
      s.ocean.material.map.offset.x=(s.ocean.material.map.offset.x+surfaceDt*0.0045)%1;  // magma churns
      s.emberT=(s.emberT||0)+Math.min(surfaceDt,0.5);
      // shed incandescent spray — but only when the surface is actually resolved:
      // a dot-floor-inflated far view would spray planet-sized blobs
      const R=impRenderRadius(rec);
      if(s.emberT>0.13 && (s.oceanM>0.5 || s.oceanHot>0) &&
         camera.position.distanceTo(worldPosOf(rec))<R*70){
        s.emberT=0;
        const n=2+Math.round(5*s.oceanM+9*s.oceanHot);
        for(let k=0;k<n;k++){
          const eu=Math.random(), ev2=0.08+0.84*Math.random();
          const ewp=uvToWorld(rec,eu,ev2);
          const enr=_impV1.copy(ewp).sub(worldPosOf(rec)).normalize().clone();
          emitBurst(ewp, 1, impConeDir(enr,0.5), R*(0.25+0.5*s.oceanHot), R*0.05, 0.9);
        }
      }
    }
    impStepHeat(s, surfaceView?surfaceDt:dt*impHeatRate());
    if(s.heat && (s.heatDirty || s.heatActive)){
      s.heatPaintT+=dt;
      if(s.heatDirty && (s.heatPaintT>0.12 || !s.heatActive)) _heatPaintQ.push(rec);
    }
    impEaseMeltVisual(rec,surfaceDt);
    // batched scar uploads: canvas paints are cheap, GPU re-uploads are not —
    // laser burns mark dirty and we flush at ~10 Hz instead of every frame
    if(s.dirty){
      s.upT+=dt;
      if(s.upT>0.09){ s.meltT.needsUpdate=true; s.glowT.needsUpdate=true;
        s.dirty=false; s.upT=0; }
    }
    if(s.heat && (s.heatActive || s.heatDirty || s.heatMax>0.012)) continue;
    if(s.hot<=0) continue;
    s.coolT+=surfaceDt; s.hot-=surfaceDt;
    if(s.coolT>0.25){                        // fade cadence: 4 uploads/s, imperceptible vs 8
      const g=s.glowC.getContext('2d');
      g.save(); g.globalCompositeOperation='destination-out';
      g.globalAlpha=Math.min(0.9,0.28*s.coolT); g.fillRect(0,0,s.glowC.width,s.glowC.height); g.restore();
      s.glowT.needsUpdate=true; s.coolT=0;
    }
  }
  // Heat overlays: the canvas repaint + 2 GPU texture uploads per body are the
  // real cost, and a supernova can leave a dozen worlds glowing at once. Budget:
  // only the longest-waiting few repaint per frame — the rest catch up next frames.
  if(_heatPaintQ.length){
    _heatPaintQ.sort((a,b)=>b.scar.heatPaintT-a.scar.heatPaintT);
    const n=Math.min(_heatPaintQ.length, MOBILE_UI?2:3);
    for(let i=0;i<n;i++){ const r=_heatPaintQ[i]; impPaintHeat(r,r.scar,false); r.scar.heatPaintT=0; }
    _heatPaintQ.length=0;
  }
  // keep an open info panel's live mass row current while material boils off or accretes
  impInfoT+=dt;
  if(impInfoT>0.5){
    impInfoT=0;
    if(APP.currentData && document.getElementById('info').classList.contains('open')){
      const rec=bodies.find(b=>b.data.key===APP.currentData.key);
      if(rec && !rec.destroyed){
        const cell=document.getElementById('i-mass-now');
        if(cell) cell.textContent=impMassNowTxt(rec);
        else if(impMassChangedFrac(rec)>0.001) openInfo(rec.data);  // first crossing: add the row
      }
    }
  }
  // camera shake (decaying)
  if(impShake>1e-4){
    const ref=camera.position.distanceTo(controls.target);
    camera.position.x+=(Math.random()-0.5)*impShake*ref*0.02;
    camera.position.y+=(Math.random()-0.5)*impShake*ref*0.02;
    camera.position.z+=(Math.random()-0.5)*impShake*ref*0.02;
    impShake*=Math.pow(0.01,dt);
  } else impShake=0;
}

/* ---- impact mode + panel UI ---- */
function toggleImpact(){ impacting?exitImpact():enterImpact(); }
function enterImpact(){
  if(flying) exitFly();
  impRockTex();                 // kick off the rock-texture load before anything fires
  astRockGeos(); astMaterial(); astGlowMat();   // warm the asteroid pools (no first-shot hitch)
  snPrewarm();                  // compile the supernova shaders before the first blast
  // warm the focused body's scar canvases now — the first strike on a body otherwise
  // builds 3 canvases + 3 textures + 3 overlay spheres in one frame (a visible hitch)
  const fr=bodies.find(b=>b.data.key===selected);
  if(fr && !impImmune(fr) && !fr.destroyed){
    getScars(fr);
    // bake the scorched crust off the click path — a first shatter otherwise pays ~200 ms
    setTimeout(function(){ if(!fr.destroyed && !impIsStellar(fr)) impScorchedSkinCached(fr); }, 250);
  }
  impacting=true;
  document.getElementById('implab').classList.add('on');
  const b=document.getElementById('t-impact'); if(b) b.classList.add('on');
  updateImpactUI();
}
function exitImpact(){
  impacting=false; stopBeam(); exitSurfaceView();
  document.getElementById('implab').classList.remove('on');
  const b=document.getElementById('t-impact'); if(b) b.classList.remove('on');
  renderer.domElement.style.cursor='grab';
}
function updateSurfaceUI(){
  const b=document.getElementById('imp-surface');
  if(b){ b.textContent=surfaceView?T('imp-surface-on'):T('imp-surface'); b.classList.toggle('on',surfaceView); }
}
function enterSurfaceView(){
  const rec=bodies.find(b=>b.data.key===selected) || (APP.currentData && bodies.find(b=>b.data.key===APP.currentData.key));
  if(!rec || rec.destroyed) return;
  if(flying) exitFly();
  surfaceView=true; surfaceRec=rec; follow=rec; tween.active=false;
  controls.target.copy(worldPosOf(rec));
  updateSurfaceUI();
}
function exitSurfaceView(){
  if(!surfaceView) return;
  surfaceView=false; surfaceRec=null;
  updateSurfaceUI();
}
function toggleSurfaceView(){ surfaceView?exitSurfaceView():enterSurfaceView(); }
function fmtBigJ(J){
  const tnt=J/IMP_MT_TNT_J; let t;
  if(tnt<1)        t=(tnt*1000).toPrecision(2)+' kt';
  else if(tnt<1e3) t=tnt.toPrecision(2)+' Mt';
  else if(tnt<1e6) t=(tnt/1e3).toPrecision(2)+' Gt';
  else if(tnt<1e9) t=(tnt/1e6).toPrecision(2)+' Tt';
  else             t=(tnt/1e9).toPrecision(2)+' Pt';
  const chx=J/IMP_CHICXULUB_J;
  let c=''; if(chx>=0.01) c=' · '+(chx>=100?Math.round(chx).toLocaleString():+chx.toPrecision(2))+'× Chicxulub';
  return J.toExponential(1).replace('e+','e')+' J · '+t+' TNT'+c;
}
function fmtW(W){
  if(W>=1e27) return W.toExponential(1).replace('e+','e')+' W';
  const u=[['YW',1e24],['ZW',1e21],['EW',1e18],['PW',1e15],['TW',1e12],['GW',1e9]];
  for(const p of u) if(W>=p[1]) return +(W/p[1]).toPrecision(3)+' '+p[0];
  return W.toExponential(1)+' W';
}
function fmtKg(kg){
  if(kg>=1e15) return kg.toExponential(1).replace('e+','e')+' kg';
  if(kg>=1e12) return +(kg/1e12).toPrecision(3)+' Gt';
  if(kg>=1e9)  return +(kg/1e9).toPrecision(3)+' Mt';
  if(kg>=1e6)  return +(kg/1e6).toPrecision(3)+' kt';
  return Math.round(kg).toLocaleString()+' kg';
}
function updateImpactUI(){
  const dia=document.getElementById('imp-dia'), spd=document.getElementById('imp-spd'), pow=document.getElementById('imp-pow');
  if(!dia) return;
  impDiaKm=0.1*Math.pow(20000,(+dia.value)/100);             // 0.1 – 2,000 km, log
  impSpdKms=11*Math.pow(30000/11,(+spd.value)/100);          // 11 – 30,000 km/s, log
  impPowW=1e12*Math.pow(10,(+pow.value)*0.30);               // 1e12 – 1e42 W, log — enough to unbind Ra
  impRho=IMP_MATS[impMatI][1];
  document.getElementById('imp-dia-v').textContent = impDiaKm<10?(+impDiaKm.toPrecision(2)+' km'):(Math.round(impDiaKm).toLocaleString()+' km');
  document.getElementById('imp-spd-v').textContent = impSpdKms<100?(+impSpdKms.toPrecision(2)+' km/s'):(Math.round(impSpdKms).toLocaleString()+' km/s');
  document.getElementById('imp-pow-v').textContent = fmtW(impPowW);
  document.getElementById('imp-mat').textContent = T('mat-'+impMatI);
  document.getElementById('imp-mass').textContent = fmtKg(impRho*(Math.PI/6)*Math.pow(impDiaKm*1000,3));
  document.querySelectorAll('#implab .imp-a').forEach(el=>{ el.style.display=impWeapon==='asteroid'?'flex':'none'; });
  document.querySelectorAll('#implab .imp-l').forEach(el=>{ el.style.display=impWeapon==='laser'?'flex':'none'; });
  const wb=document.getElementById('imp-weapon');
  if(wb) wb.textContent = impWeapon==='asteroid'?T('imp-w-ast'):T('imp-w-las');
  const en=document.getElementById('imp-energy');
  if(en) en.textContent = impWeapon==='asteroid' ? ('💣 '+fmtBigJ(impKE())) : ('🔥 '+fmtBigJ(impPowW)+' / s');
  const hint=document.getElementById('imp-hint');
  if(hint) hint.textContent = impWeapon==='asteroid' ? T('imp-hint-ast') : T('imp-hint-las');
  updateSurfaceUI();
}

/* ============================================================
   N-BODY GRAVITY (Alpha) — every world attracts every other with
   its true mass. States live in rec.nb = {r AU, v AU/yr, gm} in a
   near-barycentric frame (display stays star-relative). Integrator
   is leapfrog (KDK) with substeps sized so even the innermost moon
   stays stable across the whole speed-slider range. Toggling back
   to Kepler recomputes each planet's elements from its final state
   vector (perturbations carry over); moons snap back to their tuned
   display orbits (or sail off free if they were ejected).
   ============================================================ */
let nbodyOn=false;
const NB_GMK=4*Math.PI*Math.PI/SUN_KG;   // massKg -> GM in AU^3/yr^2 (GM_sun = 4π²)
let _nbH=1.2e-4;                         // substep (yr) — retuned at enable to min-period/45
const NB_MAXSTEPS=900;                   // per-frame cap; past it h grows (extreme warp only)
let _nbF=null;                           // flat scratch arrays for the integrator
const _nbV=new THREE.Vector3();
function nbStar(){ return bodies.find(b=>b.data.kind==='star'); }
function nbList(){ return bodies.filter(b=>b.nb); }
/* ---- Universe-Sandbox-style trails: under real gravity the Kepler ellipses
   are stale, so ◉ Orbits instead shows each body's actual recent path — a
   ring of its last ~360 sampled positions (star-relative), sampled every
   ~1/300th of its current orbit radius so one buffer ≈ one revolution. ---- */
const NB_TRAIL_N=360;
function nbTrailFor(rec){
  if(rec._trail) return rec._trail;
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(NB_TRAIL_N*3);
  g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0,0);
  const m=new THREE.LineBasicMaterial({color:new THREE.Color(rec.data.color||0x88aaff),
    transparent:true, opacity:0.45});
  const line=new THREE.Line(g,m);
  line.frustumCulled=false;
  sunHolder.add(line);
  rec._trail={line,g,pos,count:0,last:new THREE.Vector3(1e9,1e9,1e9)};
  return rec._trail;
}
function nbTrailSample(rec){
  const t=nbTrailFor(rec), p=rec.holder.position;
  const r=Math.max(1,p.length());
  if(t.last.distanceToSquared(p) < (0.02*r)*(0.02*r)) return;
  t.last.copy(p);
  if(t.count<NB_TRAIL_N) t.count++;
  else t.pos.copyWithin(0,3);                       // drop the oldest point
  const i=(t.count-1)*3;
  t.pos[i]=p.x; t.pos[i+1]=p.y; t.pos[i+2]=p.z;
  t.g.attributes.position.needsUpdate=true;
  t.g.setDrawRange(0,t.count);
}
function nbTrailsVisible(v){
  for(const rec of bodies) if(rec._trail) rec._trail.line.visible=v;
}
function nbTrailsDispose(){
  for(const rec of bodies){
    if(!rec._trail) continue;
    sunHolder.remove(rec._trail.line);
    rec._trail.g.dispose(); rec._trail.line.material.dispose();
    rec._trail=null;
  }
}
/* ---- live osculating elements for the info panel: under real gravity the
   book values are just initial conditions, so show what the body is doing
   NOW — dominant attractor (strongest pull wins: a captured moon reports its
   new parent), semi-major axis, eccentricity, period — refreshed every ½ s. */
function nbDominantParent(rec){
  // a heavy moon close-in out-PULLS the star, but Jupiter doesn't orbit its own
  // moon — the parent must out-weigh the child. Only if nothing heavier exists
  // (the custom out-masses the star itself) fall back to the strongest pull.
  let best=null, acc=0, anyBest=null, anyAcc=0;
  for(const b of nbList()){
    if(b===rec || b.destroyed) continue;
    const d2=b.nb.r.distanceToSquared(rec.nb.r)+1e-12;
    const a=b.nb.gm/d2;
    if(a>anyAcc){ anyAcc=a; anyBest=b; }
    if(b.nb.gm>rec.nb.gm && a>acc){ acc=a; best=b; }
  }
  return best||anyBest;
}
function nbLiveOrbitTxt(rec){
  const p=nbDominantParent(rec); if(!p) return null;
  const mu=p.nb.gm+rec.nb.gm;
  const r=rec.nb.r.clone().sub(p.nb.r), v=rec.nb.v.clone().sub(p.nb.v);
  const rl=r.length(), v2=v.lengthSq();
  const a=1/(2/rl - v2/mu);
  const ev=r.clone().multiplyScalar(v2-mu/rl).addScaledVector(v,-r.dot(v)).multiplyScalar(1/mu);
  const e=ev.length();
  const name=locName(p.data);
  if(!(a>0) || e>=1)
    return name+' · '+(LANG==='sk'?'neviazaná':'unbound')+' (e='+e.toFixed(2)+')';
  const P=2*Math.PI*Math.sqrt(a*a*a/mu);               // yr (Kepler III with this mu)
  const aTxt=a>=0.01 ? (+a.toPrecision(4))+' AU' : Math.round(a*KM_PER_AU).toLocaleString()+' km';
  const pTxt=P>=1 ? (+P.toPrecision(3))+' '+T('e-yr') : (+(P*365.25).toPrecision(3))+' d';
  return name+' · a='+aTxt+' · e='+e.toFixed(3)+' · P='+pTxt;
}
/* ---- ✎ orbit editing: current {a,e} of any body's orbit + apply new values.
   Kepler mode rewrites the elements (heal-able via _origOrbit); N-body mode
   rebuilds the state vector about the current dominant attractor, keeping the
   orbital plane and phase. ---- */
function orbCurrent(rec){
  if(!rec || rec.destroyed || rec.data.kind==='star' || rec._absorbedGone) return null;
  if(rec.external) return null;                  // re-accretion rump/moonlets ride the debris field's
                                                 // own softened self-gravity, not an editable Kepler
                                                 // ellipse — and their data carries no a to read.
  if(nbodyOn && rec.nb){
    const parent=nbDominantParent(rec);      // heavier-than-me rule: see above
    if(!parent) return null;
    const mu=parent.nb.gm+rec.nb.gm;
    const el=stateToElements(rec.nb.r.clone().sub(parent.nb.r),
                             rec.nb.v.clone().sub(parent.nb.v), mu);
    return {a:el.a, e:el.e, q:el.q, M:el.M, mu, parent};
  }
  if(rec.helio)  return {a:rec.helioA!=null?rec.helioA:rec.data.dist, e:rec.e};
  if(rec.isMoon) return {a:rec._physA!=null?rec._physA:rec.data.dist, e:rec.e};
  return null;                                   // free-drifting survivor: no ellipse to edit
}
function applyOrbitEdit(rec, a, e){
  if(!rec || rec.destroyed || rec.data.kind==='star') return false;
  if(!(a>0) || !(e>=0 && e<=0.95)) return false;
  if(nbodyOn && rec.nb){
    const cur=orbCurrent(rec); if(!cur || !cur.parent) return false;
    const st=keplerStateAU(a, e, cur.q, cur.M%(Math.PI*2), cur.mu);
    rec.nb.r.copy(cur.parent.nb.r).add(st.r);
    rec.nb.v.copy(cur.parent.nb.v).add(st.v);
    crAvoidOverlap(rec);                         // never rewrite INTO a body
    _nbH=Math.max(2e-5, Math.min(_nbH, 2*Math.PI*Math.sqrt(a*a*a/cur.mu)/45));
    nbSyncHolders();
  } else if(rec.helio || rec.isMoon){
    // snapshot the pristine orbit FIRST so 🧽 Heal can still undo the edit
    if(!rec._origOrbit) rec._origOrbit=rec.helio
      ? {helio:true, helioA:rec.helioA, e:rec.e, q:rec.q.clone(), period:rec.period}
      : {helio:false, _physA:rec._physA||null, e:rec.e, q:rec.q.clone(),
         period:rec.period, aDispReal:rec.aDispReal, aDispCompressed:rec.aDispCompressed};
    rec.e=e;
    if(rec.helio){
      const star=bodies.find(b=>b.data.kind==='star');
      const mu=4*Math.PI*Math.PI*(impBodyMassKg(star)/SUN_KG);
      rec.helioA=a; rec.aDisp=distDisp(a);
      rec.period=2*Math.PI*Math.sqrt(a*a*a/mu);
    } else {
      const p=bodies.find(b=>b.holder===rec.parentHolder);
      const ratio=a/(rec._physA!=null?rec._physA:rec.data.dist);
      rec._physA=a; rec.aDispReal=a*AU_UNIT;
      if(rec.aDispCompressed) rec.aDispCompressed*=ratio;
      rec.aDisp=realScale?rec.aDispReal:rec.aDispCompressed;
      const mu=4*Math.PI*Math.PI*(impBodyMassKg(p||rec)/SUN_KG);
      rec.period=2*Math.PI*Math.sqrt(a*a*a/mu);
    }
    rec.orbitPerturbed=true;                     // persists via 💾 Save's orb block
    if(rec.orbitLine){ rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q); }
    positionBody(rec);
  } else return false;
  if(rec._custom){ rec._crParams.a=a; rec._crParams.e=e;
    if(rec.nb) crSaveState(rec); else saveCustoms(); }
  return true;
}
let _nbInfoT=0;
function nbInfoTick(){
  if(!nbodyOn || !APP.currentData) return;
  if(!document.getElementById('info').classList.contains('open')) return;
  const rec=bodies.find(b=>b.data.key===APP.currentData.key);
  if(!rec || !rec.nb || rec.destroyed || rec.data.kind==='star') return;
  const t=document.getElementById('i-stats'); if(!t) return;
  let cell=document.getElementById('i-nb-orbit');
  if(!cell){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>🌌 '+(LANG==='sk'?'Dráha teraz':'Live orbit')+'</td><td id="i-nb-orbit"></td>';
    t.appendChild(tr);
    cell=document.getElementById('i-nb-orbit');
  }
  const txt=nbLiveOrbitTxt(rec);
  if(txt!=null) cell.textContent=txt;
}
function nbEnable(){
  if(nbodyOn) return;
  nbodyOn=true;
  if(!realScale) setScaleMode(true);     // compressed distances would warp the force geometry
  const star=nbStar();
  let pMin=Infinity;                     // shortest physical period present → substep size
  for(const rec of bodies){
    if(rec.external || rec._generated || rec.destroyed) continue;
    // a just-restored click-placed orbiter: its Kepler ellipse may be a CLAMPED
    // stand-in (hyperbolic heliocentric osculating state) — use the exact vector
    const exact = rec!==star && rec._nbStateSaved && rec._nbStateT===elapsedYears;
    const st = rec===star ? {r:new THREE.Vector3(), v:new THREE.Vector3()}
             : exact ? {r:rec._nbStateSaved.r.clone(), v:rec._nbStateSaved.v.clone()}
             : raStateOf(rec);
    if(rec!==star){
      let mu=MU_RA, a=rec.helioA!=null?rec.helioA:rec.data.dist;
      if(rec.isMoon){
        const pRec=bodies.find(b=>b.holder===rec.parentHolder);
        mu=4*Math.PI*Math.PI*(impBodyMassKg(pRec||rec)/SUN_KG);
        a=rec._physA!=null?rec._physA:rec.data.dist;
      }
      if(a>0&&mu>0) pMin=Math.min(pMin, 2*Math.PI*Math.sqrt(a*a*a/mu));
    }
    rec._preNb={parentHolder:rec.parentHolder, helio:rec.helio, isMoon:rec.isMoon,
      helioA:rec.helioA, _physA:rec._physA, aDisp:rec.aDisp, e:rec.e, q:rec.q.clone(),
      M:rec.M, period:rec.period, wasFree:!!rec.freeState};
    if(rec.freeState){ st.r=rec.freeState.r.clone(); st.v=rec.freeState.v.clone(); rec.freeState=null; }
    rec.nb={r:st.r.clone(), v:st.v.clone(), gm:NB_GMK*impBodyMassKg(rec)};
    if(rec!==star){ rec.parentHolder=sunHolder; sunHolder.add(rec.holder); }
    if(rec.orbitLine) rec.orbitLine.visible=false;
  }
  _nbH=Math.max(2e-5, Math.min(1.5e-4, (isFinite(pMin)?pMin:0.005)/45));
  // cancel barycentric drift so the system doesn't wander
  const list=nbList();
  let gmT=0; const pv=new THREE.Vector3();
  for(const b of list){ gmT+=b.nb.gm; pv.addScaledVector(b.nb.v, b.nb.gm); }
  if(gmT>0){ pv.multiplyScalar(1/gmT); for(const b of list) b.nb.v.sub(pv); }
  // a custom orbiting a PLANET hides a days-long true period behind years-long
  // heliocentric elements — the pMin scan above never saw it. Tighten from the
  // actual parent-relative orbits so the substep covers them too.
  for(const b of list){
    if(!b._custom || b===star) continue;
    const p=nbDominantParent(b); if(!p) continue;
    const mu=p.nb.gm+b.nb.gm;
    const rel=b.nb.r.clone().sub(p.nb.r), rv=b.nb.v.clone().sub(p.nb.v);
    const a=1/(2/Math.max(1e-9,rel.length()) - rv.lengthSq()/mu);
    if(a>0) _nbH=Math.max(2e-5, Math.min(_nbH, 2*Math.PI*Math.sqrt(a*a*a/mu)/45));
  }
  nbSyncHolders();
  refreshNav();                          // customs re-weave under their live parent
  nbBtnState();
}
function nbBtnState(){
  const btn=document.getElementById('t-nbody'); if(!btn) return;
  btn.classList.toggle('on', nbodyOn);
  btn.textContent='🌌 N-body: '+T(nbodyOn?'nb-on':'nb-off');
}
function nbDisable(){
  if(!nbodyOn) return;
  nbodyOn=false;
  const star=nbStar();
  // snapshot every state first — restoring moons needs their parent's final state
  const snap=new Map();
  const sR=star&&star.nb?star.nb.r.clone():new THREE.Vector3();
  const sV=star&&star.nb?star.nb.v.clone():new THREE.Vector3();
  for(const rec of nbList()) snap.set(rec,{r:rec.nb.r.clone().sub(sR), v:rec.nb.v.clone().sub(sV)});
  for(const rec of bodies){
    if(!rec.nb) continue;
    const P=rec._preNb||{}, st=snap.get(rec);
    rec.nb=null; rec._preNb=null;
    if(rec===star) continue;
    rec.parentHolder=P.parentHolder||sunHolder; rec.parentHolder.add(rec.holder);
    rec.helio=P.helio; rec.isMoon=P.isMoon;
    if(P.wasFree){ rec.freeState={r:st.r, v:st.v}; positionFreeBody(rec); continue; }
    // a custom that LIVES around a planet (click-placed orbiter, capture) can't
    // be a heliocentric ellipse — its osculating state may even be hyperbolic
    // and would get CLAMPED by stateToElements. Re-parent it as a real moon.
    if(rec._custom && !rec.destroyed){
      let p=null, acc=0;
      for(const [b,s] of snap){
        if(b===rec || b===star || b.destroyed || b._absorbedGone) continue;
        if(impBodyMassKg(b)<=impBodyMassKg(rec)) continue;
        const g=impBodyMassKg(b)/Math.max(1e-12, s.r.distanceToSquared(st.r));
        if(g>acc){ acc=g; p=b; }
      }
      const ps=p&&snap.get(p);
      if(ps){
        const lr=st.r.clone().sub(ps.r), lv=st.v.clone().sub(ps.v);
        const muP=4*Math.PI*Math.PI*(impBodyMassKg(p)/SUN_KG);
        const rDom=ps.r.length()*Math.sqrt(impBodyMassKg(p)/Math.max(1,impBodyMassKg(star)))*0.9;
        if(lr.length()<rDom && lv.lengthSq()/2 - muP/Math.max(1e-9,lr.length()) < 0){
          const el=stateToElements(lr, lv, muP);
          rec.helio=false; rec.isMoon=true;
          rec.parentHolder=p.holder; p.holder.add(rec.holder);
          rec._physA=el.a; rec.e=el.e; rec.q=el.q; rec.M=el.M;
          rec.period=2*Math.PI*Math.sqrt(el.a*el.a*el.a/muP);
          rec.aDispReal=el.a*AU_UNIT;
          rec.aDispCompressed=p.radius*1.7+Math.max(2.2,p.radius*0.95);
          rec.aDisp=realScale?rec.aDispReal:rec.aDispCompressed;
          rec.data.dist=el.a; rec.orbitPerturbed=true;
          rec._origOrbit=null;             // new baseline: 🧽 Heal must not rewind
          if(rec._crParams){ rec._crParams.parent=p.data.key; rec._crParams.a=el.a;
            rec._crParams.e=el.e; delete rec._crParams.nbState; }
          rec._nbStateSaved=null;
          if(rec.orbitLine){
            rec.orbitLine.parent && rec.orbitLine.parent.remove(rec.orbitLine);
            p.holder.add(rec.orbitLine);
            rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q);
            rec.orbitLine.visible=showOrbits;
          }
          positionBody(rec);
          continue;
        }
      }
    }
    if(rec.helio){
      // planets keep their perturbations: exact new elements from the state vector
      const el=stateToElements(st.r, st.v, MU_RA);
      rec.helioA=el.a; rec.e=el.e; rec.q=el.q; rec.M=el.M;
      rec.period=Math.sqrt(el.a*el.a*el.a/STAR_MSUN);
      rec.aDisp=distDisp(el.a);
      if(rec.orbitLine){ rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q); }
    } else if(rec.isMoon){
      const pRec=bodies.find(b=>b.holder===rec.parentHolder);
      const ps=pRec&&snap.get(pRec);
      const muP=pRec?4*Math.PI*Math.PI*(impBodyMassKg(pRec)/SUN_KG):MU_RA;
      const lr=ps?st.r.clone().sub(ps.r):st.r, lv=ps?st.v.clone().sub(ps.v):st.v;
      if(ps && lv.lengthSq()/2 - muP/Math.max(1e-9,lr.length()) < 0){
        // still bound: snap back to the tuned display orbit (phase kept via M below)
        rec.helioA=P.helioA; rec._physA=P._physA; rec.e=P.e; rec.q=P.q; rec.M=P.M;
        rec.period=P.period; rec.aDisp=P.aDisp;
      } else {
        // ejected from its parent: sail on heliocentric, unbound
        rec.helio=false; rec.isMoon=false;
        rec.parentHolder=sunHolder; sunHolder.add(rec.holder);
        rec.freeState={r:st.r, v:st.v}; rec.orbitPerturbed=true;
        positionFreeBody(rec); continue;
      }
    }
    if(rec.orbitLine) rec.orbitLine.visible=showOrbits;
    positionBody(rec);
  }
  nbTrailsDispose();
  nbBtnState();
  saveCustoms();                                     // re-parented orbiters persist as moons
  refreshNav();                                      // …and re-weave under their planet
  if(typeof crUpdateUI==='function') crUpdateUI();   // Still/Launch modes just lost their gravity
}
function toggleNbody(){ nbodyOn ? nbDisable() : nbEnable(); }
/* position holders star-relative so the scene stays centred on the star */
function nbSyncHolders(){
  const star=nbStar();
  const sr=star&&star.nb?star.nb.r:null;
  for(const rec of bodies){
    if(!rec.nb || rec===star) continue;
    _nbV.copy(rec.nb.r); if(sr) _nbV.sub(sr);
    rec.holder.position.copy(displayVectorFromAU(_nbV));
    if(showOrbits) nbTrailSample(rec);
  }
}
/* leapfrog (KDK) over flat arrays — no per-step allocation */
function nbStep(dt){
  const list=nbList(), n=list.length;
  if(!n){ return; }
  if(dt>0){
    if(!_nbF || _nbF.cap<n){
      _nbF={cap:n, x:new Float64Array(n),y:new Float64Array(n),z:new Float64Array(n),
        px:new Float64Array(n),py:new Float64Array(n),pz:new Float64Array(n),
        vx:new Float64Array(n),vy:new Float64Array(n),vz:new Float64Array(n),
        ax:new Float64Array(n),ay:new Float64Array(n),az:new Float64Array(n),
        gm:new Float64Array(n), rad:new Float64Array(n)};
    }
    const F=_nbF;
    for(let i=0;i<n;i++){ const b=list[i].nb;
      F.x[i]=b.r.x; F.y[i]=b.r.y; F.z[i]=b.r.z;
      F.vx[i]=b.v.x; F.vy[i]=b.v.y; F.vz[i]=b.v.z; F.gm[i]=b.gm;
      F.rad[i]=(list[i].data.radiusKm||1000)/KM_PER_AU; }
    const K=Math.max(1, Math.min(NB_MAXSTEPS, Math.ceil(dt/_nbH)));
    const h=dt/K, h2=h*0.5, EPS2=1e-12;
    const hits=[];                         // contact pairs caught INSIDE the substep loop (no tunnelling)
    const markHit=(i,j)=>{ const key=i*8192+j; if(hits.indexOf(key)<0) hits.push(key); };
    const accel=()=>{
      F.ax.fill(0,0,n); F.ay.fill(0,0,n); F.az.fill(0,0,n);
      for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
        const dx=F.x[j]-F.x[i], dy=F.y[j]-F.y[i], dz=F.z[j]-F.z[i];
        const d2=dx*dx+dy*dy+dz*dz+EPS2, inv=1/(d2*Math.sqrt(d2));
        const fi=F.gm[j]*inv, fj=F.gm[i]*inv;
        F.ax[i]+=dx*fi; F.ay[i]+=dy*fi; F.az[i]+=dz*fi;
        F.ax[j]-=dx*fj; F.ay[j]-=dy*fj; F.az[j]-=dz*fj;
      }
    };
    const sweptHits=()=>{
      for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
        if(list[i].destroyed || list[j].destroyed) continue;
        const s=(F.rad[i]+F.rad[j])*0.9;
        const s2=s*s;
        const dx0=F.px[j]-F.px[i], dy0=F.py[j]-F.py[i], dz0=F.pz[j]-F.pz[i];
        const dx1=F.x[j]-F.x[i], dy1=F.y[j]-F.y[i], dz1=F.z[j]-F.z[i];
        const mx=dx1-dx0, my=dy1-dy0, mz=dz1-dz0;
        const mm=mx*mx+my*my+mz*mz;
        let u=0;
        if(mm>1e-24) u=Math.max(0, Math.min(1, -(dx0*mx+dy0*my+dz0*mz)/mm));
        const cx=dx0+mx*u, cy=dy0+my*u, cz=dz0+mz*u;
        if(cx*cx+cy*cy+cz*cz < s2) markHit(i,j);
      }
    };
    accel();
    for(let s=0;s<K;s++){
      for(let i=0;i<n;i++){ F.px[i]=F.x[i]; F.py[i]=F.y[i]; F.pz[i]=F.z[i];
        F.vx[i]+=F.ax[i]*h2; F.vy[i]+=F.ay[i]*h2; F.vz[i]+=F.az[i]*h2;
        F.x[i]+=F.vx[i]*h; F.y[i]+=F.vy[i]*h; F.z[i]+=F.vz[i]*h; }
      sweptHits();
      accel();
      for(let i=0;i<n;i++){ F.vx[i]+=F.ax[i]*h2; F.vy[i]+=F.ay[i]*h2; F.vz[i]+=F.az[i]*h2; }
    }
    for(let i=0;i<n;i++){ const b=list[i].nb;
      b.r.set(F.x[i],F.y[i],F.z[i]); b.v.set(F.vx[i],F.vy[i],F.vz[i]); }
    for(const key of hits) nbCollidePair(list[(key/8192)|0], list[key%8192]);
  }
  nbSyncHolders();
}
function nbDisposeTrail(rec){
  if(!rec || !rec._trail) return;
  sunHolder.remove(rec._trail.line);
  rec._trail.g.dispose(); rec._trail.line.material.dispose();
  rec._trail=null;
}
function nbAccreteImpactMass(survivor, impactorMassKg, E){
  if(!survivor || survivor.destroyed || !(impactorMassKg>0)) return 0;
  const R=Math.max(1, (survivor.data.radiusKm||1000)*1000);
  const escJkg=IMP_G*Math.max(1, impBodyMassKg0(survivor))/R;
  const violent=E/Math.max(1, impactorMassKg*escJkg);
  const retained=Math.max(0, Math.min(0.98, 1/(1+0.22*violent)));
  const gain=impactorMassKg*retained;
  if(!(gain>0)) return 0;
  survivor._accretedKg=(survivor._accretedKg||0)+gain;
  if(survivor.nb) survivor.nb.gm=NB_GMK*impBodyMassKg(survivor);
  if(survivor._custom) saveCustoms();
  return gain;
}
function nbAbsorbDestroyedImpact(dead, survivor){
  if(!dead || !survivor || !dead.destroyed || survivor.destroyed) return;
  const D=debrisFields.find(x=>x.rec===dead);
  const oldNb=dead.nb?{r:dead.nb.r.clone(), v:dead.nb.v.clone(), gm:dead.nb.gm}:null;
  dead._absorbedImpact={survivorKey:survivor.data.key, holderParent:dead.holder.parent,
    parentHolder:dead.parentHolder, holderPos:dead.holder.position.clone(), nb:oldNb,
    helio:dead.helio, isMoon:dead.isMoon, helioA:dead.helioA, _physA:dead._physA,
    aDisp:dead.aDisp, aDispReal:dead.aDispReal, aDispCompressed:dead.aDispCompressed,
    orbitLine:dead.orbitLine};
  let dir=new THREE.Vector3(1,0,0);
  if(oldNb && survivor.nb) dir.copy(oldNb.r).sub(survivor.nb.r);
  else dir.copy(worldPosOf(dead)).sub(worldPosOf(survivor));
  if(dir.lengthSq()<1e-12) dir.set(1,0,0);
  dir.normalize();
  const surf=Math.max(realRadiusScene(survivor.data.radiusKm||1000)*1.02,
    survivor.radius*(survivor.mesh.scale.x||1)*0.92);
  survivor.holder.add(dead.holder);
  dead.holder.position.copy(dir.multiplyScalar(surf));
  dead.parentHolder=survivor.holder;
  dead.nb=null;                              // the wreck is accreted, not a second projectile
  // with nb gone the animate loop would fall through to the KEPLER branch and
  // resume the old heliocentric ellipse — relative to the SURVIVOR's holder now,
  // teleporting the wreck + its whole debris shell AU away. Kill the drive:
  dead.helio=false; dead.isMoon=false; dead.aDisp=0;
  if(dead.orbitLine){ if(dead.orbitLine.parent) dead.orbitLine.parent.remove(dead.orbitLine); dead.orbitLine=null; }
  nbDisposeTrail(dead);
  if(D){
    D.absorbed=true; D.allowRemnant=false; D.GM=0;
    D.fadeT=Math.min(D.fadeT||4, 4); D.op0=Math.min(D.op0||0.4, 0.22);
    if(D.hazeMat){ D.hazeMat.opacity=Math.min(D.hazeMat.opacity,0.20); D.hazeMat.depthTest=true; D.hazeMat.needsUpdate=true; }
    dead.holder.updateMatrixWorld(true);     // re-parent just happened: refresh before worldToLocal
    const ctr=dead.mesh.worldToLocal(worldPosOf(survivor));  // survivor centre, chunk-local frame
    for(const c of D.chunks){
      if(c.cap) continue;
      c.cap=true; c.dissT0=1.3+0.8*Math.random(); c.dissT=c.dissT0;
      c.baseScale=c.m.scale.x||1;
      // shards fall INTO the planet while they dissolve, not away from it
      const sink=ctr.clone().sub(c.m.position);
      if(sink.lengthSq()>1e-12) c.vel.copy(sink.normalize().multiplyScalar(D.Rloc*(0.3+0.25*Math.random())));
      else c.vel.multiplyScalar(0.15);
    }
  }
  if(dead._custom) saveCustoms();            // persist the swallow (sw flag) for reloads
}
/* the planet swallowed the wreck whole: once the shards finish sinking, dispose
   every polygon (debris, haze, ring) and drop the body from the nav, labels and
   picking. The rec stays in bodies[] — inert and invisible — purely so 🧽 Heal
   can still resurrect it onto its own orbit. */
function retireAbsorbedWreck(rec){
  if(!rec || !rec._absorbedImpact || rec._absorbedGone) return;
  removeDebrisField(rec);                    // disposes chunks/haze/ring — and "resurrects"…
  rec.destroyed=true;                        // …so put the corpse state back
  rec.mesh.material.visible=false;
  for(const ch of rec.mesh.children) ch.visible=false;
  rec._absorbedGone=true;
  const pi=pickables.indexOf(rec.mesh); if(pi>=0) pickables.splice(pi,1);
  const le=labelEls[rec.data.key]; if(le){ le.remove(); delete labelEls[rec.data.key]; }
  if(selected===rec.data.key) selected=null;
  if(follow===rec) follow=null;
  if(tween.body===rec) tween.active=false;
  if(APP.currentData && APP.currentData.key===rec.data.key){
    document.getElementById('info').classList.remove('open'); syncInfoBtn(); APP.currentData=null;
  }
  refreshNav();
}
/* restore-time twin of the absorb+retire pair: mark a body as swallowed inside
   a planet — pristine-orbit snapshot for 🧽 Heal, then vanish quietly (no
   shatter, no debris, no nav/label/pick presence). */
function stMarkSwallowed(rec){
  rec._absorbedImpact={survivorKey:null, parentHolder:rec.parentHolder,
    holderPos:rec.holder.position.clone(), nb:null,
    helio:rec.helio, isMoon:rec.isMoon, helioA:rec.helioA, _physA:rec._physA,
    aDisp:rec.aDisp, aDispReal:rec.aDispReal, aDispCompressed:rec.aDispCompressed,
    orbitLine:rec.orbitLine};
  if(rec.orbitLine){ if(rec.orbitLine.parent) rec.orbitLine.parent.remove(rec.orbitLine); rec.orbitLine=null; }
  rec.helio=false; rec.isMoon=false; rec.aDisp=0;
  rec.destroyed=true; rec.shattered=true;
  rec.mesh.material.visible=false;
  for(const ch of rec.mesh.children) ch.visible=false;
  rec._absorbedGone=true;
  const pi=pickables.indexOf(rec.mesh); if(pi>=0) pickables.splice(pi,1);
  const le=labelEls[rec.data.key]; if(le){ le.remove(); delete labelEls[rec.data.key]; }
  updateNavStatus(rec); refreshNav();
}
/* touching worlds collide: momentum-conserving merge of velocities + the
   full impact energy routed into the existing damage/shatter machinery */
function nbCollidePair(a,b){
  if(!a.nb || !b.nb || a.destroyed || b.destroyed) return;
  const rA=(a.data.radiusKm||1000)/KM_PER_AU, rB=(b.data.radiusKm||1000)/KM_PER_AU;
  const dr=_nbV.copy(b.nb.r).sub(a.nb.r); let d=dr.length();
  if(d<1e-12){ dr.set(1,0,0); d=1e-12; }
  const mA=impBodyMassKg(a), mB=impBodyMassKg(b);
  const vRel=b.nb.v.clone().sub(a.nb.v);
  const vRelMs=vRel.length()*KMS_PER_AUYR*1000;
  const E=0.5*(mA*mB/(mA+mB))*vRelMs*vRelMs;
  // inelastic: both take the centre-of-mass velocity, contact is separated
  const vcm=a.nb.v.clone().multiplyScalar(mA).addScaledVector(b.nb.v,mB).multiplyScalar(1/(mA+mB));
  a.nb.v.copy(vcm); b.nb.v.copy(vcm);
  dr.multiplyScalar(1/d);
  const push=Math.max(0,(rA+rB)-d);
  const small=mA<=mB?a:b, big=small===a?b:a;
  const mSmall=mA<=mB?mA:mB;
  small.nb.r.addScaledVector(dr, small===b?push:-push);
  if(!small.destroyed) impApplyBlastEnergy(small, E, big, null);
  if(!big.destroyed)   impApplyBlastEnergy(big, E*0.25, small, null);
  if(small.destroyed && !big.destroyed){
    nbAccreteImpactMass(big, mSmall, E);
    nbAbsorbDestroyedImpact(small, big);
  }
  impShake=Math.min(0.06, impShake+0.03);
}

/* ============================================================
   CUSTOM BODIES (Alpha) — user-created worlds. First-class
   bodies[] records around the star, persisted per system in
   localStorage so they survive reloads.
   ============================================================ */
const CR_KINDS=[
  {kind:'rocky',    icon:'🪨', label:'Rocky',     color:0xb59a7b,
    tex:{rocky:{base:"#8f7a5f", a:"#c2ab88", b:"#4e4335", c:"#e0cba4"}}},
  {kind:'terran',   icon:'🌍', label:'Terran',    color:0x7fb2d9,
    tex:{terran:{ocean:"#123c6e", ocean2:"#2c68a8", land:"#8f9a5a", cloud:"#eef3f8", landAmt:0.32}}},
  {kind:'iceworld', icon:'🧊', label:'Ice world', color:0xbfe0ef,
    tex:{palette:["#9fb6c6","#d8ecf6","#7d95a8","#eef7fd"]}},
  {kind:'gasgiant', icon:'🪐', label:'Gas giant', color:0xd9b98a,
    tex:{palette:["#c8a06a","#e8d0a8","#96703f","#f2e4c2"]}},
];
let crKindI=0, _crN=0;
const crMassKg=v=>1e20*Math.pow(10,v/100*10.3);          // 1e20 .. ~2e30 kg
const crRadKm =v=>Math.round(200*Math.pow(10,v/100*2.9)); // 200 .. ~159,000 km
const crAAU   =v=>0.02*Math.pow(10,v/100*3.6);           // 0.02 .. ~80 AU
/* ---- parent-aware distance scale: orbiting a planet, AU sliders are useless —
   the range runs from just above the surface to the edge of the planet's
   gravitational dominance instead ---- */
let crParentKey=null;                                    // null = the star
function crParentList(){                                 // star + every live planet-grade body
  const star=bodies.find(b=>b.data.kind==='star');
  return [star].concat(bodies.filter(b=>b!==star && !b.destroyed && !b._generated &&
    !b._absorbedGone && !b.isMoon && !b.freeState && b.data.kind!=='star')).filter(Boolean);
}
function crParentRec(){
  if(!crParentKey) return null;
  const rec=bodies.find(b=>b.data.key===crParentKey && !b.destroyed && !b._absorbedGone);
  if(!rec){ crParentKey=null; return null; }             // parent died: fall back to the star
  return rec;
}
/* the Orbits row FOLLOWS the focus: focus Jupiter (or Io) → parent = Jupiter.
   Cycling the row by hand still works until the next focus change. */
function crParentFollowFocus(){
  const lab=document.getElementById('createlab');
  if(!lab || !lab.classList.contains('on')) return;
  const rec=bodies.find(b=>b.data.key===selected && !b.destroyed && !b._absorbedGone);
  if(!rec || rec.external) return;
  let key;                                               // undefined = leave the row alone
  if(rec.data.kind==='star') key=null;
  else if(crParentList().indexOf(rec)>=0) key=rec.data.key;
  else if(nbodyOn && rec.nb){                            // a moon in N-body: its live parent
    const p=nbDominantParent(rec);
    if(p && p.data.kind!=='star' && crParentList().indexOf(p)>=0) key=p.data.key;
    else if(p && p.data.kind==='star') key=null;
  } else if(rec.isMoon){                                 // Kepler moon: its planet
    const p=bodies.find(b=>b.holder===rec.parentHolder && b.data.kind!=='star');
    if(p) key=p.data.key;
  }
  if(key!==undefined && key!==crParentKey){ crParentKey=key; crUpdateUI(); }
}
function crARange(){
  const p=crParentRec();
  if(!p) return {min:0.02, max:80};                      // heliocentric: the original range
  const el=document.getElementById('cr-rad');
  const rNew=el?crRadKm(+el.value):2000;
  const star=bodies.find(b=>b.data.kind==='star');
  const aP=p.helioA!=null?p.helioA:p.data.dist;
  const min=2.2*((p.data.radiusKm||1000)+rNew)/KM_PER_AU;
  const dom=aP*Math.sqrt(impBodyMassKg(p)/Math.max(1,impBodyMassKg(star)))*0.6;
  return {min, max:Math.max(dom, min*8)};
}
function crAOf(v){ const R=crARange(); return R.min*Math.pow(R.max/R.min, v/100); }
function crAInv(au){ const R=crARange();
  return Math.max(0, Math.min(100, 100*Math.log(au/R.min)/Math.log(R.max/R.min))); }
function fmtAAU(au){ return au<0.02 ? Math.round(au*KM_PER_AU).toLocaleString()+' km'
                                    : (+au.toPrecision(3))+' AU'; }
function crStoreKey(){ return 'ra-alpha-custom:'+(typeof SYS!=='undefined'?SYS:'ra'); }
function fmtMassE(kg){
  if(kg>=1.5e29) return (kg/1.989e30).toFixed(2)+' M☉';
  if(kg>=1e27)   return (kg/1.898e27).toFixed(2)+' M♃';
  return (kg/5.972e24>=0.01?(kg/5.972e24).toFixed(2):(kg/5.972e24).toExponential(1))+' M⊕';
}
const CR_PARENT_MIN_MASS_RATIO=3;             // Kepler moons need a clearly dominant primary.
function crCanOrbitParent(childMassKg, parentRec){
  if(!parentRec || parentRec.destroyed || parentRec._absorbedGone) return false;
  if(parentRec.data.kind==='star') return true;
  return impBodyMassKg(parentRec) >= Math.max(1, childMassKg)*CR_PARENT_MIN_MASS_RATIO;
}
function crParentRejectMsg(parentRec){
  const n=parentRec?locName(parentRec.data):(LANG==='sk'?'vybrané teleso':'the selected body');
  return LANG==='sk'
    ? n+' je príliš ľahké na taký masívny mesiac — teleso pôjde okolo hviezdy'
    : n+' is too light to be the primary for this body — placing it around the star';
}
function crStarFallbackA(parentRec, p){
  if(parentRec && parentRec.data.kind!=='star'){
    const st=raStateOf(parentRec);
    const a=st && st.r ? st.r.length() : (parentRec.helioA!=null?parentRec.helioA:parentRec.data.dist);
    if(isFinite(a) && a>0) return Math.max(0.005, Math.min(90, a));
  }
  const a=(p && isFinite(p.a)) ? p.a : 0.05;
  return Math.max(a,0.05);
}
function createCustomBody(p, fromSave){
  _crN++;
  const kd=CR_KINDS.find(k=>k.kind===p.kind)||CR_KINDS[0];
  const key=p.key||('custom'+Date.now().toString(36)+_crN);
  // orbiting a PLANET (p.parent): p.a is the relative distance, the period is
  // physical from the parent's true mass. Orbiting the star: real Kepler years.
  let parentRec=p.parent?bodies.find(b=>b.data.key===p.parent && !b.destroyed):null;
  if(p.parent && !parentRec){ p=Object.assign({},p); delete p.parent; p.a=Math.max(p.a,0.05); }
  if(parentRec && !crCanOrbitParent(p.massKg, parentRec)){
    const oldParent=parentRec;
    p=Object.assign({},p);
    delete p.parent;
    p.a=crStarFallbackA(oldParent, p);
    parentRec=null;
    if(!fromSave) crMissFeedback(crParentRejectMsg(oldParent));
  }
  const muP=parentRec?4*Math.PI*Math.PI*(impBodyMassKg(parentRec)/SUN_KG):MU_RA;
  const period=2*Math.PI*Math.sqrt(p.a*p.a*p.a/muP);
  const data=Object.assign({ key, name:p.name||('Custom '+_crN), kind:p.kind, custom:true,
    radiusKm:p.radiusKm, massKg:p.massKg, dist:p.a, ecc:p.e, period,
    rotationPeriod:18, color:kd.color, navTag:'custom' }, kd.tex);
  Object.assign(data, {
    desc:'A custom world created in the Alpha physics sandbox. It obeys the same rules as every other body — strike it, melt it, or let N-body gravity decide its fate.',
    stats:[ ['Radius', p.radiusKm.toLocaleString()+' km'],
            ['Mass', fmtMassE(p.massKg)],
            ['Semi-major axis', p.a.toFixed(p.a<0.1?4:2)+' AU'+(parentRec?' ('+locName(parentRec.data)+')':'')],
            ['Eccentricity', p.e.toFixed(2)],
            ['Orbital period', period<1?(period*365.25).toFixed(1)+' days':period.toFixed(2)+' yr'],
            ['Origin', 'created in the sandbox'] ] });
  let rec;
  if(parentRec){
    const aDispReal=p.a*AU_UNIT;
    const aDispCompressed=parentRec.radius*1.7+Math.max(2.2,parentRec.radius*0.95);
    rec=addBody(data, parentRec.holder, { aDisp:realScale?aDispReal:aDispCompressed,
      incl:p.incl||0, node:(p.node!=null?p.node:Math.random()*360), orbitOpacity:0.22 });
    rec.isMoon=true; rec.aDispReal=aDispReal; rec.aDispCompressed=aDispCompressed;
  } else {
    rec=addBody(data, sunHolder, { aDisp:distDisp(p.a), incl:p.incl||0,
      node:(p.node!=null?p.node:Math.random()*360) });
  }
  rec._custom=true; rec._crParams=Object.assign({}, p, {key, node:p.node});
  if(p.M!=null) rec.M=p.M;
  if(p.nbState){                              // mode-placed body: restore its exact state vector
    const r=new THREE.Vector3().fromArray(p.nbState.r), v=new THREE.Vector3().fromArray(p.nbState.v);
    if(!parentRec){                           // (a parented moon keeps its moon elements —
      const el=stateToElements(r,v,MU_RA);    //  helio elements of a moon state are garbage;
      rec.helioA=el.a; rec.e=el.e; rec.q=el.q; rec.M=el.M;   //  N-body uses the vector below)
      rec.period=Math.sqrt(el.a*el.a*el.a/STAR_MSUN);
      rec.aDisp=distDisp(el.a);
      if(rec.orbitLine){ rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q); }
      positionBody(rec);
    }
    rec._nbStateSaved={r,v};                  // exact vector for a running N-body sim (below)
    rec._nbStateT=elapsedYears;               // …trustworthy only until sim time advances
  }
  if(p.accretedKg>0) rec._accretedKg=p.accretedKg;
  rec._newUntil=performance.now()+2600;
  if(nbodyOn){
    // join the running N-body sim — with the SAVED exact vector when one
    // exists (a launched/hyperbolic body must not snap back to an ellipse),
    // otherwise with the exact state of its Kepler orbit
    const st=rec._nbStateSaved
      ? {r:rec._nbStateSaved.r.clone(), v:rec._nbStateSaved.v.clone()}
      : raStateOf(rec);                       // star-relative; moon-aware
    const star=nbStar(), sr=star&&star.nb?star.nb:null;
    if(sr){ st.r.add(sr.r); st.v.add(sr.v); }
    rec._preNb={parentHolder:rec.parentHolder, helio:rec.helio, isMoon:!!rec.isMoon, helioA:rec.helioA,
      _physA:rec._physA, aDisp:rec.aDisp, e:rec.e, q:rec.q.clone(), M:rec.M, period:rec.period, wasFree:false};
    rec.nb={r:st.r, v:st.v, gm:NB_GMK*impBodyMassKg(rec)};
    // a tight fast moon joining MID-SIM needs finer substeps than the enable-time
    // tuning — integrating a 0.4-day orbit at Io-tuned h pumps energy until the
    // body is flung across the system (the "unrelated worlds explode" bug)
    _nbH=Math.max(2e-5, Math.min(_nbH, (rec.period||1)/45));
    if(rec.orbitLine) rec.orbitLine.visible=false;
    nbSyncHolders();
  }
  refreshNav();
  if(fromSave && p.sw){                        // it ended inside a planet last session
    rec.dmgJ=p.dmgJ||impBindingJ(rec)*1.05;    // register with the scar/heal machinery
    getScars(rec);
    stMarkSwallowed(rec);
  }
  if(!fromSave){ saveCustoms();
    if(!p.noFocus){                          // focusing the newborn must NOT retarget the
      const pk=crParentKey;                  // Orbits row the user is creating around
      focusBody(key,true);
      if(crParentKey!==pk){ crParentKey=pk; crUpdateUI(); }
    } }
  return rec;
}
function saveCustoms(){
  try{
    const arr=bodies.filter(b=>b._custom).map(b=>{
      const out=Object.assign({}, b._crParams, {M:b.M});
      if(b._accretedKg>0) out.accretedKg=b._accretedKg; else delete out.accretedKg;
      if(b._absorbedImpact){ out.sw=1; out.dmgJ=b.dmgJ||0; }  // swallowed by a planet: restore as gone
      else { delete out.sw; delete out.dmgJ; }
      return out;
    });
    localStorage.setItem(crStoreKey(), JSON.stringify(arr));
  }catch(_){}
}
function restoreCustoms(){
  try{
    const arr=JSON.parse(localStorage.getItem(crStoreKey())||'[]');
    for(const p of arr) createCustomBody(p, true);
  }catch(_){}
}
function clearCustoms(){
  for(const rec of bodies.filter(b=>b._custom)){
    if(rec.destroyed) removeDebrisField(rec);
    if(rec._trail){ sunHolder.remove(rec._trail.line);     // N-body trail would orphan in the scene
      rec._trail.g.dispose(); rec._trail.line.material.dispose(); rec._trail=null; }
    if(rec.orbitLine){ rec.orbitLine.parent&&rec.orbitLine.parent.remove(rec.orbitLine);
      rec.orbitLine.geometry.dispose(); rec.orbitLine.material.dispose(); }
    rec.holder.parent&&rec.holder.parent.remove(rec.holder);
    const pi=pickables.indexOf(rec.mesh); if(pi>=0) pickables.splice(pi,1);
    const si=impScarred.indexOf(rec); if(si>=0) impScarred.splice(si,1);
    const le=labelEls[rec.data.key]; if(le){ le.remove(); delete labelEls[rec.data.key]; }
    const bi=bodies.indexOf(rec); if(bi>=0) bodies.splice(bi,1);
    if(selected===rec.data.key) selected=null;
    if(follow===rec) follow=null;
    if(tween.body===rec) tween.active=false;
    if(APP.currentData && APP.currentData.key===rec.data.key){
      document.getElementById('info').classList.remove('open'); syncInfoBtn(); APP.currentData=null;
    }
  }
  try{ localStorage.removeItem(crStoreKey()); }catch(_){}
  refreshNav();
}

/* ============================================================
   DELETE (Alpha) — cleanly REMOVE a body from the simulation.
   No explosion: the world simply ceases to exist. Everything
   except the star is fair game; a deleted planet's moons are
   liberated onto heliocentric orbits (the same physics as when
   their parent dies to bombardment). Deleting an authored body
   persists only via 💾 Save; ♻ Reset restores everything.
   ============================================================ */
let deletedKeys=[];
function removeBody(rec, fromRestore){
  if(!rec || rec.data.kind==='star') return false;   // scene/lighting/engines are star-centred
  // sever every live system that might be pointing at it
  if(impBeam && impBeam.rec===rec) stopBeam();
  if(surfaceView && surfaceRec===rec) exitSurfaceView();
  for(let i=impAsteroids.length-1;i>=0;i--) if(impAsteroids[i].rec===rec){
    releaseAstRig(impAsteroids[i].rig); impAsteroids.splice(i,1); }
  for(let i=impBlastQueue.length-1;i>=0;i--)
    if(impBlastQueue[i].rec===rec || impBlastQueue[i].source===rec) impBlastQueue.splice(i,1);
  // any wreck accreted onto THIS body goes down with it
  for(const b of bodies.slice())
    if(b!==rec && b._absorbedImpact && b.parentHolder===rec.holder) removeBody(b, true);
  // its moons sail on around Ra rather than orbiting a void
  if(rec.destroyed){
    // deleting a corpse: the moons were already liberated at shatter — cut
    // their re-capture snapshots so removeDebrisField doesn't re-attach them
    for(const m of bodies) if(m._preLib && m._preLib.parentRec===rec) m._preLib=null;
    removeDebrisField(rec);                          // retires debris, ring, rump, moonlets
  } else if(!nbodyOn) liberateMoons(rec);
  if(nbodyOn) for(const m of bodies){                // nb moons are independent; fix their restore snapshot
    if(m._preNb && m._preNb.parentHolder===rec.holder){
      m._preNb.parentHolder=sunHolder; m._preNb.helio=true; m._preNb.isMoon=false;
    }
  }
  // evaporation tails (Amunet, Sekhmet) + heat-driven tails
  for(let i=evapTails.length-1;i>=0;i--) if(evapTails[i].rec===rec){
    const t=evapTails[i];
    if(t.points.parent) t.points.parent.remove(t.points);
    t.g&&t.g.dispose&&t.g.dispose(); t.points.material.dispose();
    evapTails.splice(i,1);
  }
  rec._puffTail=null;                                // shared entry already removed above
  if(rec._trail){ sunHolder.remove(rec._trail.line);
    rec._trail.g.dispose(); rec._trail.line.material.dispose(); rec._trail=null; }
  if(rec.orbitLine){ rec.orbitLine.parent&&rec.orbitLine.parent.remove(rec.orbitLine);
    rec.orbitLine.geometry.dispose(); rec.orbitLine.material.dispose(); }
  rec.holder.parent&&rec.holder.parent.remove(rec.holder);
  const pi=pickables.indexOf(rec.mesh); if(pi>=0) pickables.splice(pi,1);
  const si=impScarred.indexOf(rec); if(si>=0) impScarred.splice(si,1);
  const le=labelEls[rec.data.key]; if(le){ le.remove(); delete labelEls[rec.data.key]; }
  const bi=bodies.indexOf(rec); if(bi>=0) bodies.splice(bi,1);
  if(selected===rec.data.key) selected=null;
  if(follow===rec) follow=null;
  if(tween.body===rec) tween.active=false;
  if(APP.currentData && APP.currentData.key===rec.data.key){
    document.getElementById('info').classList.remove('open'); syncInfoBtn(); APP.currentData=null;
  }
  if(rec._custom) saveCustoms();
  else if(!rec._generated && !fromRestore) deletedKeys.push(rec.data.key);
  refreshNav();
  return true;
}
function deleteSelected(){
  const rec=bodies.find(b=>b.data.key===selected);
  if(!rec || rec.data.kind==='star') return;         // star: refused (its 🗑 button is hidden too)
  removeBody(rec);
}

/* ============================================================
   SYSTEM STATE (Alpha) — 💾 Save / 📂 Load / ⬇⬆ file / ♻ Reset.
   Hybrid snapshot: scalars + orbital elements + state vectors are
   serialized; scars replay from scar.log via impReplayScarBase;
   melt/ocean/steam/puff/extinction all re-derive from dmgJ via
   impUpdateMelt. Saved per edition+system (localStorage is shared
   across the three GitHub Pages sites). Auto-restores on load.
   ============================================================ */
const ST_VER=1, ST_ED='alpha';
function stateKey(){ return 'ra-alpha-state:'+(typeof SYS!=='undefined'?SYS:'ra'); }
let impRestoring=false;
const _ST_STYLES=[['C',IMP_CHAR],['CS',IMP_CHAR_SOFT],['L',IMP_LAVA],['LS',IMP_LAVA_SOFT]];
function stStyleName(st){ const e=_ST_STYLES.find(x=>x[1]===st); return e?e[0]:st; }
function stStyleFromName(n){ const e=_ST_STYLES.find(x=>x[0]===n); return e?e[1]:n; }
function saveSystemState(){
  // customs live in their own store — refresh it NOW (exact N-body vectors +
  // current Kepler phases), else Load would rewind them to placement time
  for(const b of bodies){ if(b._custom && b.nb && !b.destroyed){
    const sv=nbStar(), so=sv&&sv.nb?sv.nb:{r:new THREE.Vector3(),v:new THREE.Vector3()};
    if(b._crParams) b._crParams.nbState={ r:b.nb.r.clone().sub(so.r).toArray(),
                                          v:b.nb.v.clone().sub(so.v).toArray() };
    b._nbStateSaved={r:b.nb.r.clone().sub(so.r), v:b.nb.v.clone().sub(so.v)};
    b._nbStateT=elapsedYears;
  } }
  saveCustoms();
  const out={v:ST_VER, ed:ST_ED, sys:SYS, t:Date.now(),
    elapsedYears:+elapsedYears.toFixed(6), nbodyOn:!!nbodyOn,
    deleted:deletedKeys.slice(), bodies:{}};
  for(const rec of bodies){
    if(rec._generated || rec._custom) continue;      // customs live in their own store; rumps re-evolve
    const b={M:+(rec.M%(Math.PI*2)).toFixed(6)};
    if(rec.dmgJ>0) b.dmg=rec.dmgJ;
    if(rec._accretedKg>0) b.accr=rec._accretedKg;
    if(rec.shattered) b.shat=1;
    if(rec.destroyed) b.dest=1;
    if(rec._absorbedImpact) b.swal=1;        // swallowed by a survivor: restore as gone, not as debris
    if(rec._impWaterKg>0) b.waterKg=rec._impWaterKg;
    if(rec.orbitPerturbed && !rec.freeState && !rec.destroyed)
      b.orb={helioA:rec.helioA, physA:rec._physA, e:rec.e, q:rec.q.toArray(), period:rec.period};
    if(rec.freeState) b.free={r:rec.freeState.r.toArray(), v:rec.freeState.v.toArray()};
    if(rec.nb) b.nb={r:rec.nb.r.toArray(), v:rec.nb.v.toArray(), gm:rec.nb.gm};
    if(rec.scar && rec.scar.log && rec.scar.log.length)
      b.log=rec.scar.log.map(L=>[L.l, +L.u.toFixed(4), +L.v.toFixed(4), Math.round(L.r),
        stStyleName(L.s), L.a==null?null:+L.a.toFixed(3)]);
    out.bodies[rec.data.key]=b;
  }
  try{ localStorage.setItem(stateKey(), JSON.stringify(out)); }catch(_){ return false; }
  return true;
}
function restoreSystemState(){
  let st=null;
  try{ st=JSON.parse(localStorage.getItem(stateKey())||'null'); }catch(_){}
  if(!st || st.v!==ST_VER || st.sys!==SYS) return;
  impRestoring=true;
  try{
    // 1. deletions (authored bodies removed cleanly, no liberation re-run needed
    //    beyond what removeBody does)
    deletedKeys=(st.deleted||[]).slice();
    for(const key of deletedKeys){
      const rec=bodies.find(b=>b.data.key===key);
      if(rec) removeBody(rec, true);
    }
    // 2. phases, perturbed orbits, damage scalars + scar replay
    const destroyed=[];
    for(const key in st.bodies){
      const rec=bodies.find(b=>b.data.key===key); if(!rec) continue;
      const b=st.bodies[key];
      if(b.M!=null) rec.M=b.M;
      if(b.accr>0) rec._accretedKg=b.accr;
      if(b.orb){
        // snapshot the pristine orbit FIRST so 🧽 Heal can still undo it
        if(!rec._origOrbit) rec._origOrbit=rec.helio
          ? {helio:true, helioA:rec.helioA, e:rec.e, q:rec.q.clone(), period:rec.period}
          : {helio:false, _physA:rec._physA||null, e:rec.e, q:rec.q.clone(),
             period:rec.period, aDispReal:rec.aDispReal, aDispCompressed:rec.aDispCompressed};
        rec.e=b.orb.e; rec.q=new THREE.Quaternion().fromArray(b.orb.q); rec.period=b.orb.period;
        if(rec.helio && b.orb.helioA!=null){ rec.helioA=b.orb.helioA; rec.aDisp=distDisp(b.orb.helioA); }
        else if(b.orb.physA!=null){
          const ratio=b.orb.physA/(rec._physA!=null?rec._physA:rec.data.dist);
          rec._physA=b.orb.physA;
          if(rec.aDispReal) rec.aDispReal*=ratio;
          if(rec.aDispCompressed) rec.aDispCompressed*=ratio;
          rec.aDisp=realScale?rec.aDispReal:rec.aDispCompressed;
        }
        rec.orbitPerturbed=true;
        if(rec.orbitLine){ rebuildOrbitLine(rec); rec.orbitLine.quaternion.copy(rec.q); }
      }
      if(b.dmg>0){
        rec.dmgJ=b.dmg;
        const s=getScars(rec);
        if(b.log){ s.log=b.log.map(L=>({l:L[0],u:L[1],v:L[2],r:L[3],s:stStyleFromName(L[4]),a:L[5]==null?undefined:L[5]}));
          impReplayScarBase(s);
          s.meltT.needsUpdate=true; s.glowT.needsUpdate=true; }
        impUpdateMelt(rec);        // regenerates melt/ocean/steam/puff/extinction from dmgJ
      }
      if(b.waterKg>0) rec._impWaterKg=b.waterKg;
      if(b.swal){ stMarkSwallowed(rec); continue; }   // it's inside a planet: no shatter, no debris
      if(b.dest) destroyed.push(rec);
      positionBody(rec);
    }
    // 3. shatter the dead quietly — planets first, then a dead star (its blast
    //    wave already did its work: every consequence is in the saved fields)
    destroyed.sort((a,b2)=>(a.data.kind==='star'?1:0)-(b2.data.kind==='star'?1:0));
    for(const rec of destroyed){ if(!rec.destroyed) shatterBody(rec); }
    impBlastQueue.length=0;
    for(const B of stellarBlasts){ finishStellarBlast(B); }
    if(destroyed.some(r=>r.data.kind==='star') && sunLight) sunLight.intensity=0;
    // 4. supernova survivors fly their saved straight lines, exactly
    for(const key in st.bodies){
      const rec=bodies.find(b2=>b2.data.key===key); if(!rec) continue;
      const b=st.bodies[key];
      if(!b.free || rec.destroyed) continue;
      if(!rec._preFree) rec._preFree={parentHolder:rec.parentHolder, helio:rec.helio, isMoon:rec.isMoon,
        helioA:rec.helioA, _physA:rec._physA, aDisp:rec.aDisp, aDispReal:rec.aDispReal,
        aDispCompressed:rec.aDispCompressed, e:rec.e, q:rec.q.clone(), M:rec.M,
        period:rec.period, orbitLine:rec.orbitLine};
      if(rec.orbitLine) rec.orbitLine.visible=false;
      rec.parentHolder=sunHolder; sunHolder.add(rec.holder);
      rec.helio=false; rec.isMoon=false; rec.aDisp=0;
      rec.freeState={r:new THREE.Vector3().fromArray(b.free.r), v:new THREE.Vector3().fromArray(b.free.v)};
      rec.orbitPerturbed=true;
      positionFreeBody(rec);
    }
    // 5. N-body resumes exactly where it was saved
    if(st.nbodyOn){
      nbEnable();
      for(const key in st.bodies){
        const rec=bodies.find(b2=>b2.data.key===key); if(!rec||!rec.nb) continue;
        const b=st.bodies[key];
        if(b.nb){ rec.nb.r.fromArray(b.nb.r); rec.nb.v.fromArray(b.nb.v); rec.nb.gm=b.nb.gm; }
      }
      // customs saved exact STAR-RELATIVE vectors, but nbEnable anchored them to
      // a star at the origin — authored bodies above just moved to their saved
      // ABSOLUTE frame (star wobble ≈ 0.005 AU: bigger than a close moon's whole
      // orbit). Re-anchor the customs to the star's restored state.
      const sr=nbStar();
      if(sr && sr.nb) for(const rec of bodies){
        if(!rec._custom || !rec.nb || !rec._nbStateSaved) continue;
        rec.nb.r.copy(sr.nb.r).add(rec._nbStateSaved.r);
        rec.nb.v.copy(sr.nb.v).add(rec._nbStateSaved.v);
      }
      nbSyncHolders();
      refreshNav();                      // weave customs by their NOW-correct live parent
    }
    if(st.elapsedYears>0){ elapsedYears=st.elapsedYears; updateClock(); }
  } finally { impRestoring=false; }
}
function exportSystemState(){
  saveSystemState();                                   // export exactly what Load would restore
  const bundle={ state:JSON.parse(localStorage.getItem(stateKey())||'null'),
                 customs:JSON.parse(localStorage.getItem(crStoreKey())||'[]') };
  const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=ST_ED+'-'+SYS+'-state.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function importSystemState(file){
  const rd=new FileReader();
  rd.onload=function(){
    try{
      const bundle=JSON.parse(rd.result);
      const s=bundle.state;
      if(!s || s.v!==ST_VER || s.ed!==ST_ED) throw new Error('wrong edition/version');
      localStorage.setItem('ra-system', s.sys);        // a sol save switches the app to sol
      localStorage.setItem('ra-alpha-state:'+s.sys, JSON.stringify(s));
      localStorage.setItem('ra-alpha-custom:'+s.sys, JSON.stringify(bundle.customs||[]));
      location.reload();
    }catch(err){ alert('Not a valid '+ST_ED+' state file ('+err.message+')'); }
  };
  rd.readAsText(file);
}
function resetSystem(){
  const sk=(LANG==='sk');
  if(!confirm(sk?'Obnoviť sústavu do pôvodného stavu? Odstráni VŠETKY poškodenia, vlastné telesá aj uložený stav.'
               :'Reset the system to its pristine original state? Removes ALL damage, custom bodies and the saved state.')) return;
  try{ localStorage.removeItem(crStoreKey()); localStorage.removeItem(stateKey()); }catch(_){}
  location.reload();
}
function setupStateUI(){
  const g=id=>document.getElementById(id);
  const flash=(btn,txt)=>{ const t0=btn.textContent; btn.textContent=txt;
    setTimeout(()=>{ btn.textContent=t0; },900); };
  if(g('t-save')) g('t-save').onclick=function(){ flash(this, saveSystemState()?'💾 ✓':'💾 ✗'); };
  if(g('t-load')) g('t-load').onclick=function(){
    if(localStorage.getItem(stateKey())) location.reload();
    else flash(this,'📂 —'); };
  if(g('t-export')) g('t-export').onclick=exportSystemState;
  if(g('t-import')) g('t-import').onclick=()=>g('t-import-file').click();
  if(g('t-import-file')) g('t-import-file').onchange=function(){
    if(this.files && this.files[0]) importSystemState(this.files[0]); this.value=''; };
  if(g('t-sysreset')) g('t-sysreset').onclick=resetSystem;
  if(g('i-del')) g('i-del').onclick=deleteSelected;
  window.addEventListener('keydown',e=>{
    if(e.key!=='Delete') return;
    const el=document.activeElement;
    if(el && (el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)) return;
    if(flying) return;
    deleteSelected();
  });
}
function crUpdateUI(){
  const kd=CR_KINDS[crKindI];
  const g=id=>document.getElementById(id);
  if(!g('createlab')) return;
  g('cr-kind').textContent=kd.icon+' '+T('k-'+kd.kind);
  { const nm=g('cr-name'); if(nm) nm.placeholder=T('cr-name-ph'); }
  g('cr-mass-v').textContent=fmtMassE(crMassKg(+g('cr-mass').value));
  g('cr-rad-v').textContent=crRadKm(+g('cr-rad').value).toLocaleString()+' km';
  g('cr-a-v').textContent=fmtAAU(crAOf(+g('cr-a').value));
  g('cr-e-v').textContent=(+g('cr-e').value/100).toFixed(2);
  g('cr-i-v').textContent=g('cr-i').value+'°';
  // placement-mode rows: only meaningful while 🎯 armed
  if(!nbodyOn && CR_MODES[crModeI].needsNb) crModeI=1;         // Still/Launch need real gravity
  const mode=CR_MODES[crModeI];
  const pbn=g('cr-parent'), plab=g('lbl-cr-parent');
  if(pbn){
    const target=(crPlaceArmed&&mode.id==='launch'&&crAutoAim)?crLaunchTargetRec():null;
    const pr=target||crParentRec();
    const childMass=crMassKg(+g('cr-mass').value);
    const parentTooLight=!target && pr && pr.data.kind!=='star' && !crCanOrbitParent(childMass, pr);
    if(plab) plab.textContent = !crPlaceArmed ? T('cr-orbits')
      : mode.id==='still' ? T('cr-dominant')
      : mode.id==='orbit' ? T('cr-orbitparent')
      : crAutoAim ? T('cr-target') : T('cr-ref');
    if(target) pbn.textContent='🎯 '+locName(target.data);
    else if(parentTooLight) pbn.textContent='⚠ '+locName(pr.data);
    else pbn.textContent=pr?'🪐 '+locName(pr.data):'☀ '+locName(DS.STAR);
    pbn.title = parentTooLight ? crParentRejectMsg(pr) : !crPlaceArmed
      ? T('cr-parent-t')
      : mode.id==='still' ? T('cr-parent-still-t')
      : mode.id==='orbit' ? T('cr-parent-orbit-t')
      : crAutoAim ? T('cr-parent-aim-t')
                  : T('cr-parent-ref-t');
  }
  const mrow=document.querySelector('#createlab .cr-placerow');
  const srow=document.querySelector('#createlab .cr-speedrow');
  const arow=document.querySelector('#createlab .cr-slider-a');
  const erow=g('cr-e')&&g('cr-e').closest('.improw');
  const irow=g('cr-i')&&g('cr-i').closest('.improw');
  if(mrow) mrow.style.display=crPlaceArmed?'flex':'none';
  if(srow) srow.style.display=(crPlaceArmed&&mode.id==='launch')?'flex':'none';
  if(arow) arow.style.display=crPlaceArmed?'none':'flex';      // radius comes from the click
  if(erow) erow.style.display=(!crPlaceArmed||mode.id==='orbit')?'flex':'none';
  if(irow) irow.style.display=crPlaceArmed?'none':'flex';
  const mb=g('cr-mode');
  if(mb){ mb.textContent=mode.icon+' '+T('m-'+mode.id);
    mb.title=nbodyOn?T('cr-mode-t'):T('cr-mode-off-t'); }
  const ab=g('cr-autoaim');
  if(ab){ ab.style.display=(crPlaceArmed&&mode.id==='launch')?'':'none';
    ab.classList.toggle('on',crAutoAim);
    ab.title=T('cr-autoaim-t'); }
  const sv=g('cr-spd-v');
  if(sv){ const k=crSpdKms(+g('cr-spd').value);
    sv.textContent=k<100?(+k.toPrecision(2))+' km/s':Math.round(k).toLocaleString()+' km/s'; }
  const hint=g('cr-hint');
  if(hint){
    hint.textContent = !crPlaceArmed
      ? (LANG==='sk'?'Vlastné svety ostávajú v prehliadači · kliknutím na hodnotu ju napíšeš · zapni 🌌 N-body, nech pôsobia gravitáciou'
                    :'Custom worlds persist in this browser · click any value to type it · turn on 🌌 N-body to let them pull on everything else')
      : mode.id==='still' ? (LANG==='sk'?'⏸ klikaj opakovane — padá voľným pádom na to, čo v mieste kliku dominuje':'⏸ click repeatedly — free-falls into whatever dominates the click point')
      : mode.id==='orbit' ? (LANG==='sk'?'🔄 klikaj opakovane · pri telese = jeho mesiac · prázdno = okolo hviezdy':'🔄 click repeatedly · near a body orbits it · empty space orbits the star')
      : (LANG==='sk'?'🚀 rýchlosť je relatívna k cieľu/referenčnému telesu':'🚀 speed is relative to the target/reference body');
  }
}
/* ---- 🎯 place-by-click, Universe-Sandbox style. Clicks near a world snap to
   TRUE 3D (ray's closest approach — off-plane, inclined orbits OK); empty-space
   clicks fall back to the ecliptic plane for depth. Three placement modes:
   ⏸ Still  — drops the body at 0 velocity relative to the LOCALLY dominant
              body (beside a giant → falls into the giant). N-body only.
   🔄 Orbit — orbits the gravitationally dominant body AT the click point
              (a click beside a gas giant orbits the giant), panel eccentricity
              applied at periapsis. In Kepler mode a click near a planet
              creates a real MOON of it; empty space orbits the star.
   🚀 Launch — the physical alternative to the Impact lab's scripted rocks:
              each click spawns a body at the click point and adds the Speed
              slider as a RELATIVE velocity on top of the target/reference body.
              N-body only — a launched world can miss, slingshot, or hit. ---- */
let crPlaceArmed=false, crModeI=1, crAutoAim=false;
const CR_MODES=[
  {id:'still',  icon:'⏸', label:'Still',  needsNb:true},
  {id:'orbit',  icon:'🔄', label:'Orbit',  needsNb:false},
  {id:'launch', icon:'🚀', label:'Launch', needsNb:true},
];
const crSpdKms=v=>0.1*Math.pow(10,v/100*4.5);        // 0.1 – ~3,160 km/s, log
function crSetPlaceArmed(v){
  crPlaceArmed=v;
  const b=document.getElementById('cr-place'); if(b) b.classList.toggle('on',v);
  if(renderer) renderer.domElement.style.cursor=v?'crosshair':'';
  crUpdateUI();
}
const _crPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function crMissFeedback(msg){                 // a failed click must SAY so, not silently eat the click
  const hint=document.getElementById('cr-hint');
  if(!hint) return;
  hint.textContent='⚠ '+msg;
  hint.style.color='#ffb08a';
  clearTimeout(crMissFeedback._t);
  crMissFeedback._t=setTimeout(function(){ hint.style.color=''; crUpdateUI(); }, 2200);
}
/* screen click -> {p: point in AU (star-relative), near: body rec|null, dir: view ray}.
   Clicking on/near a world places in TRUE 3D on the visible/nearest surface of
   that world — no ecliptic projection, works for inclined orbits and tilted cameras.
   The snap radius follows the body's apparent disk size, so far-away dots and
   close-up limbs both behave like the world you meant. Empty-space clicks still
   fall back to the ecliptic plane: a 2D mouse needs SOME depth cue, and the plane
   is the only honest one. */
function crClickPointAU(e){
  const rect=renderer.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-rect.left)/rect.width)*2-1;
  mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  ray.setFromCamera(mouse,camera);
  const dir=ray.ray.direction.clone();
  let near=null, exactPoint=null;
  const exact=pickHit(e);
  if(exact){
    const rec=bodies.find(b=>b.data.key===exact.object.userData.bodyKey);
    if(rec && !rec.destroyed && !rec.external && rec.data.kind!=='star'){
      near=rec; exactPoint=exact.point&&exact.point.clone?exact.point.clone():null;
    }
  }
  // nearest live body within its apparent radius + a label-sized pad. Rank by
  // normalized distance so a small nearby moon is not shadowed by a giant disk.
  if(!near){
    let bestScore=1; const _sp=new THREE.Vector3();
    const pxPerUnit=(rect.height*0.5)/Math.tan(camera.fov*Math.PI/360);
    const snapPad=70;
    for(const rec of bodies){
      if(rec.destroyed || rec.external || rec.data.kind==='star') continue;
      const wp=worldPosOf(rec);
      _sp.copy(wp).project(camera);
      if(_sp.z>1) continue;                     // behind the camera
      const sx=rect.left+(_sp.x*0.5+0.5)*rect.width, sy=rect.top+(-_sp.y*0.5+0.5)*rect.height;
      const dd=(sx-e.clientX)**2+(sy-e.clientY)**2;
      const dist=Math.max(1e-6, camera.position.distanceTo(wp));
      const rPx=(rec.radius*rec.mesh.scale.x/dist)*pxPerUnit;
      const snapR=rPx+snapPad;
      const score=dd/(snapR*snapR);
      if(score<bestScore){ bestScore=score; near=rec; }
    }
  }
  const hit=new THREE.Vector3();
  if(near){                                   // snap: front/near surface, not the centre-plane foot
    const cScene=worldPosOf(near), surf=exactPoint||new THREE.Vector3();
    if(!exactPoint){
      const rScene=Math.max(1e-9, near.radius*(near.mesh.scale.x||1));
      const sphere=new THREE.Sphere(cScene, rScene);
      if(!ray.ray.intersectSphere(sphere, surf)) ray.ray.closestPointToPoint(cScene, surf);
    }
    const n=surf.sub(cScene);
    if(n.lengthSq()<1e-12) n.copy(camera.position).sub(cScene);
    if(n.lengthSq()<1e-12) n.set(1,0,0);
    n.normalize();
    const nAU=raStateOf(near).r;
    const rAU=Math.max(1e-9, (near.data.radiusKm||1000)/KM_PER_AU);
    return { p:nAU.clone().addScaledVector(n,rAU), near, dir };
  } else if(!ray.ray.intersectPlane(_crPlane,hit)){  // edge-on / skyward view: the ray never meets the ecliptic
    crMissFeedback(LANG==='sk'?'klik minul rovinu dráh — klikni bližšie k telesu alebo pozri viac zhora'
                              :'click missed the orbital plane — click nearer a body or use a more top-down view');
    return null;
  }
  const dScene=hit.length();
  const au=realScale ? dScene/AU_UNIT : Math.pow(dScene/DIST_K, 1/DIST_P);
  if(!near && !(au>0.005 && au<90)){          // inside the star / deep interstellar
    const star=locName(DS.STAR);
    crMissFeedback((LANG==='sk'?'mimo rozsahu 0.005–90 AU od hviezdy '+star+' (klik: '
                               :'outside 0.005–90 AU from '+star+' (click: ')+
      (au<1?au.toFixed(3):Math.round(au))+' AU)');
    return null;
  }
  const p=hit.multiplyScalar(dScene>1e-12?au/dScene:0);
  if(near){
    // clicking near a world MEANS that world: keep the point inside its sphere of
    // gravitational dominance (from far away a few px is 0.1 AU — clamp it back)
    const nAU=raStateOf(near).r;
    const star=nbStar();
    const mStar=star?impBodyMassKg(star):SUN_KG;
    const rDom=Math.max(1e-6, nAU.length()*Math.sqrt(impBodyMassKg(near)/mStar)*0.6);
    const rel=p.clone().sub(nAU);
    if(rel.length()>rDom){
      if(rel.lengthSq()<1e-18) rel.set(1,0,0);
      p.copy(nAU).addScaledVector(rel.normalize(), rDom);
    }
  }
  return { p, near, dir };
}
/* never spawn INSIDE an existing world — the collision pass would vaporize the
   newborn on frame one ("it didn't spawn"). Nudge the point out to a safe gap. */
function crAvoidOverlap(rec){
  if(!rec.nb) return;
  for(const b of nbList()){
    if(b===rec || b.destroyed) continue;
    const rSum=((b.data.radiusKm||1000)+(rec.data.radiusKm||1000))/KM_PER_AU;
    const safe=rSum*2.2;
    const dr=rec.nb.r.clone().sub(b.nb.r), d=dr.length();
    if(d>=safe) continue;
    const dir=d>1e-9?dr.divideScalar(d):new THREE.Vector3(1,0,0);
    rec.nb.r.copy(b.nb.r).addScaledVector(dir,safe);
  }
}
/* dominant attractor at a star-relative AU point (Kepler mode — real masses) */
function crDomAttractor(pAU){
  let best=null, acc=0;
  for(const b of bodies){
    if(b.destroyed || b.freeState) continue;
    const r=b.data.kind==='star'?new THREE.Vector3():raStateOf(b).r;
    const d2=r.distanceToSquared(pAU)+1e-12;
    const g=impBodyMassKg(b)/d2;
    if(g>acc){ acc=g; best=b; }
  }
  return best;
}
function crPlaceAt(e){
  const mode=CR_MODES[crModeI];
  const ck=crClickPointAU(e);
  if(!ck) return;
  const pAU=ck.p;
  const g=id=>document.getElementById(id);
  const au=pAU.length(), theta=Math.atan2(pAU.z,pAU.x);
  const base={ name:g('cr-name').value.trim()||undefined, kind:CR_KINDS[crKindI].kind,
    massKg:crMassKg(+g('cr-mass').value), radiusKm:crRadKm(+g('cr-rad').value),
    a:au, e:+g('cr-e').value/100, incl:+g('cr-i').value, node:0, M:theta,
    noFocus:true };                           // don't yank the camera mid-placement
  if(!nbodyOn){
    // Kepler mode: Orbit only — around whatever body dominates the click point.
    // A click beside a giant makes a MOON of it; empty space orbits the star.
    const parent=ck.near||crDomAttractor(pAU);
    if(parent && parent.data.kind!=='star' && crCanOrbitParent(base.massKg, parent)){
      const rel=pAU.clone().sub(raStateOf(parent).r);
      const minR=((parent.data.radiusKm||1000)+base.radiusKm)*2.2/KM_PER_AU;
      base.parent=parent.data.key;
      base.a=Math.max(rel.length(), minR);
      base.M=Math.atan2(rel.z,rel.x);
    } else if(parent && parent.data.kind!=='star'){
      crMissFeedback(crParentRejectMsg(parent));
    }
    createCustomBody(base);
    g('cr-name').value='';
    crUpdateUI();
    return;
  }
  const rec=createCustomBody(base);
  g('cr-name').value='';
  if(!rec.nb) return;
  const star=nbStar(), sv=star&&star.nb?star.nb:{r:new THREE.Vector3(),v:new THREE.Vector3()};
  rec.nb.r.copy(pAU).add(sv.r);               // EXACT click point, no element roundtrip
  crAvoidOverlap(rec);                        // …but never inside a world (instant vaporization)
  if(mode.id==='still'){
    // 0 velocity relative to the LOCALLY dominant body — dropped beside a giant
    // it free-falls INTO the giant instead of watching it sweep past at 13 km/s
    let dom=(ck.near&&ck.near.nb&&!ck.near.destroyed)?ck.near:null, acc=0;
    if(!dom) for(const b of nbList()){
      if(b===rec || b.destroyed) continue;
      const d2=b.nb.r.distanceToSquared(rec.nb.r)+1e-12;
      if(b.nb.gm/d2>acc){ acc=b.nb.gm/d2; dom=b; }
    }
    rec.nb.v.copy(dom?dom.nb.v:sv.v);
  } else if(mode.id==='orbit'){
    // dominant attractor AT the click point decides who it orbits
    let parent=(ck.near&&ck.near.nb&&!ck.near.destroyed)?ck.near:null, acc=0;
    if(!parent) for(const b of nbList()){
      if(b===rec || b.destroyed) continue;
      const d2=b.nb.r.distanceToSquared(rec.nb.r)+1e-12;
      if(b.nb.gm/d2>acc){ acc=b.nb.gm/d2; parent=b; }
    }
    if(!parent) parent=star;
    const rel=rec.nb.r.clone().sub(parent.nb.r), r=Math.max(1e-9,rel.length());
    const mu=parent.nb.gm+rec.nb.gm, ecc=base.e;
    // the REAL orbit is parent-relative (its period can be a fraction of a day
    // beside a giant) — retune the substep for it, rec.period is heliocentric
    _nbH=Math.max(2e-5, Math.min(_nbH, 2*Math.PI*Math.sqrt(r*r*r/mu)/45));
    const vp=Math.sqrt(mu*(1+ecc)/r);         // placed at periapsis of the requested ellipse
    const tan=rel.clone().divideScalar(r).cross(new THREE.Vector3(0,1,0)).negate().normalize();
    // (rhat × ŷ negated ≡ ŷ-frame prograde: matches keplerStateAU's orbital sense)
    rec.nb.v.copy(parent.nb.v).addScaledVector(tan,vp);
  } else {                                    // 🚀 launch: relative to target/clicked body/star
    const tgt=crAutoAim?crLaunchTargetRec(rec):null;
    const frame=crLaunchFrameRec(ck,tgt);
    if(tgt) crLaunchAtTarget(rec, tgt, frame);
    else crLaunchDir(rec, ck.dir, frame);     // (🎯 with nothing selected falls back to aim-by-view)
  }
  crSaveState(rec);
  nbSyncHolders();
  crUpdateUI();
}
function crSaveState(rec){                    // persist the exact star-relative state vector
  if(!rec.nb || !rec._crParams) return;
  const star=nbStar(), sv=star&&star.nb?star.nb:{r:new THREE.Vector3(),v:new THREE.Vector3()};
  rec._crParams.nbState={ r:rec.nb.r.clone().sub(sv.r).toArray(),
                          v:rec.nb.v.clone().sub(sv.v).toArray() };
  saveCustoms();
}
function crLaunchTargetRec(exclude){
  const rec=bodies.find(b=>b.data.key===selected && b!==exclude && b.nb && !b.destroyed && !b._absorbedGone);
  if(rec) return rec;
  return (follow && follow!==exclude && follow.nb && !follow.destroyed && !follow._absorbedGone) ? follow : null;
}
function crLaunchFrameRec(ck, tgt){
  if(tgt && tgt.nb && !tgt.destroyed) return tgt;
  if(ck && ck.near && ck.near.nb && !ck.near.destroyed) return ck.near;
  const star=nbStar();
  return star&&star.nb?star:null;
}
function crLaunchBaseVelocity(frameRec){
  if(frameRec && frameRec.nb) return frameRec.nb.v;
  const star=nbStar();
  return star&&star.nb?star.nb.v:new THREE.Vector3();
}
function crLaunchDir(rec, dir, frameRec){     // velocity = frame velocity + direction × Speed slider
  if(!dir || dir.lengthSq()<1e-12) return;
  const baseV=crLaunchBaseVelocity(frameRec);
  const kms=crSpdKms(+document.getElementById('cr-spd').value);
  rec.nb.v.copy(baseV).addScaledVector(dir.clone().normalize(), kms/KMS_PER_AUYR);
  rec._newUntil=performance.now()+2600;
  spawnFlash(worldPosOf(rec), Math.max(1,rec.radius*rec.mesh.scale.x*3), IMP_CHICXULUB_J);
  sfxWhoosh(1.2);
}
function crLaunchAtTarget(rec, tgt, frameRec){
  if(!rec.nb || !tgt || !tgt.nb) return;
  frameRec=frameRec||tgt;
  const baseV=crLaunchBaseVelocity(frameRec);
  const speed=crSpdKms(+document.getElementById('cr-spd').value)/KMS_PER_AUYR;
  const rel=tgt.nb.r.clone().sub(rec.nb.r);
  const v=tgt.nb.v.clone().sub(baseV);
  const A=v.lengthSq()-speed*speed, B=2*rel.dot(v), C=rel.lengthSq();
  let t=0;
  if(Math.abs(A)<1e-12){
    if(Math.abs(B)>1e-12) t=-C/B;
  } else {
    const disc=B*B-4*A*C;
    if(disc>=0){
      const q=Math.sqrt(disc), t1=(-B-q)/(2*A), t2=(-B+q)/(2*A);
      t=Math.min(t1>0?t1:Infinity, t2>0?t2:Infinity);
      if(!isFinite(t)) t=0;
    }
  }
  const aim=rel.clone();
  if(t>0) aim.addScaledVector(v,t);
  crLaunchDir(rec, aim, frameRec);
}
/* ---- click a slider's value readout to TYPE the number instead ---- */
function makeTypable(valId, sliderId, invFn, refreshFn){
  const span=document.getElementById(valId), sl=document.getElementById(sliderId);
  if(!span||!sl) return;
  sl.step='any';                 // typed values must not snap to integer slider steps
  span.style.cursor='text';
  span.title='Click to type an exact value';
  span.addEventListener('click', function(){
    if(span.querySelector('input')) return;
    const cur=span.textContent;
    span.textContent='';
    const inp=document.createElement('input');
    inp.type='text'; inp.placeholder=cur;
    inp.style.cssText='width:100%;box-sizing:border-box;background:#0d1526;border:1px solid #2a3a5a;'+
      'border-radius:4px;color:#dce6ff;padding:1px 4px;font:inherit;text-align:right';
    span.appendChild(inp); inp.focus();
    let closed=false;
    const done=commit=>{
      if(closed) return; closed=true;
      const txt=inp.value.trim();
      span.removeChild(inp);
      if(commit && txt){
        const num=parseFloat(txt.replace(',','.'));
        if(isFinite(num)){
          sl.value=Math.max(+sl.min, Math.min(+sl.max, invFn(num)));
        }
      }
      refreshFn();
    };
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter') done(true);
      else if(e.key==='Escape') done(false);
      e.stopPropagation();
    });
    inp.addEventListener('blur',()=>done(true));
  });
}
function setupCreateLab(){
  const g=id=>document.getElementById(id);
  if(!g('createlab')) return;
  const tbtn=g('t-create');
  const toggle=()=>{ g('createlab').classList.toggle('on');
    const open=g('createlab').classList.contains('on');
    if(tbtn) tbtn.classList.toggle('on', open);
    if(!open) crSetPlaceArmed(false);
    if(open) crParentFollowFocus();          // default the Orbits row to the focused body
    crUpdateUI(); };
  if(tbtn) tbtn.onclick=toggle;
  g('cr-exit').onclick=toggle;
  g('cr-kind').onclick=()=>{ crKindI=(crKindI+1)%CR_KINDS.length; crUpdateUI(); };
  for(const id of ['cr-mass','cr-rad','cr-a','cr-e','cr-i']) g(id).oninput=crUpdateUI;
  g('cr-clear').onclick=clearCustoms;
  g('cr-add').onclick=()=>{
    createCustomBody({ name:g('cr-name').value.trim()||undefined, kind:CR_KINDS[crKindI].kind,
      massKg:crMassKg(+g('cr-mass').value), radiusKm:crRadKm(+g('cr-rad').value),
      a:crAOf(+g('cr-a').value), e:+g('cr-e').value/100, incl:+g('cr-i').value,
      parent:crParentKey||undefined });
    g('cr-name').value='';
  };
  const parB=g('cr-parent');
  if(parB) parB.onclick=()=>{
    const L=crParentList();
    const i=L.findIndex(b=>crParentKey ? b.data.key===crParentKey : b.data.kind==='star');
    const nxt=L[(i+1)%L.length];
    crParentKey=nxt.data.kind==='star'?null:nxt.data.key;
    crUpdateUI();
  };
  const pb=g('cr-place'); if(pb) pb.onclick=()=>crSetPlaceArmed(!crPlaceArmed);
  const mb=g('cr-mode');
  if(mb) mb.onclick=()=>{
    for(let i=1;i<=CR_MODES.length;i++){
      const j=(crModeI+i)%CR_MODES.length;
      if(!CR_MODES[j].needsNb || nbodyOn){ crModeI=j; break; }
    }
    crUpdateUI();
  };
  const ab=g('cr-autoaim'); if(ab) ab.onclick=()=>{ crAutoAim=!crAutoAim; crUpdateUI(); };
  const sp=g('cr-spd'); if(sp) sp.oninput=crUpdateUI;
  makeTypable('cr-spd-v','cr-spd', n=>100*Math.log10(n/0.1)/4.5, crUpdateUI);
  window.addEventListener('keydown',e=>{ if(e.code==='Escape'&&crPlaceArmed) crSetPlaceArmed(false); });
  // every value readout is typable — click it and enter the exact number
  makeTypable('cr-mass-v','cr-mass', n=>{           // plain numbers are Earth masses; huge ones are kg
    const kg=n>1e6?n:n*5.972e24; return 100*Math.log10(kg/1e20)/10.3; }, crUpdateUI);
  makeTypable('cr-rad-v','cr-rad', n=>100*Math.log10(n/200)/2.9, crUpdateUI);
  makeTypable('cr-a-v','cr-a',     n=>crAInv(n>500?n/KM_PER_AU:n), crUpdateUI);  // big numbers are km
  makeTypable('cr-e-v','cr-e',     n=>n*100, crUpdateUI);
  makeTypable('cr-i-v','cr-i',     n=>n, crUpdateUI);
  const nb=g('t-nbody'); if(nb) nb.onclick=toggleNbody;
  nbBtnState();
  crUpdateUI();
}

/* ============================================================
   Animation
   ============================================================ */
let follow=null;            // body rec being followed
const tween={active:false,t:0,fromCam:new THREE.Vector3(),fromTarget:new THREE.Vector3(),dist:0,body:null};

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  if(surfaceView && (!surfaceRec || bodies.indexOf(surfaceRec)<0 || surfaceRec.destroyed)) exitSurfaceView();
  let simDtYears = playing ? YEARS_PER_SEC*timeScale*dt : 0;
  // N-body can only integrate NB_MAXSTEPS substeps per frame — consuming more
  // sim time would silently stretch the substep past the stability limit and
  // moons would pump + grind into their planets (the high-warp "unrelated
  // worlds explode" bug: Enceladus ⇄ Saturn). Cap the frame's sim time instead:
  // an effective max time-warp while real gravity is on.
  if(nbodyOn && simDtYears>NB_MAXSTEPS*_nbH) simDtYears=NB_MAXSTEPS*_nbH;

  if(playing && !surfaceView){
    if(nbodyOn) nbStep(simDtYears);            // real gravity: integrates + positions rec.nb bodies
    for(const rec of bodies){
      if(rec.nb){ /* positioned by nbStep */ }
      else if(rec.freeState){ rec.freeState.r.addScaledVector(rec.freeState.v,simDtYears); positionFreeBody(rec); }
      else if(rec.aDisp>0){ rec.M += (Math.PI*2/rec.period)*simDtYears; positionBody(rec); }
      rec.mesh.rotation.y += rec.spin*dt*timeScale*SPIN_GAIN;   // rotation slows/freezes with the time rate
    }
  }
  if(playing){
    elapsedYears += simDtYears;          // real sim-time elapsed
    _clockT += dt; if(_clockT>=0.25){ _clockT=0; updateClock(); }
  }
  lastSimDtYears = (playing && !surfaceView) ? simDtYears : 0;
  _nbInfoT+=dt; if(_nbInfoT>=0.5){ _nbInfoT=0; nbInfoTick(); }   // live osculating elements
  updateEvapTails(lastSimDtYears);
  updateBelt(lastSimDtYears);                 // fragment swarm rides sim time
  updateImpacts(dt);                          // wall-clock: strikes land even while paused
  if(starfieldPts) starfieldPts.position.copy(camera.position);   // sky at any zoom depth

  if(flying){
    updateFly(dt);
  } else {
    // focus tween
    if(tween.active){
      tween.t=Math.min(1, tween.t + dt/0.9);
      const e=1-Math.pow(1-tween.t,3);
      const bp=worldPos(tween.body);
      const desiredTarget=bp.clone();
      const dir=tween.fromCam.clone().sub(tween.fromTarget).normalize();
      const desiredCam=bp.clone().add(dir.multiplyScalar(tween.dist));
      controls.target.lerpVectors(tween.fromTarget, desiredTarget, e);
      camera.position.lerpVectors(tween.fromCam, desiredCam, e);
      if(tween.t>=1){ tween.active=false; follow=tween.body; }
    } else if(follow){
      const bp=worldPos(follow);
      const delta=bp.clone().sub(controls.target);
      controls.target.add(delta);
      camera.position.add(delta);
    }
    controls.update();
  }
  if(realScale) updateBodySizes();        // true size, floored to a visible dot
  // adapt the depth range to zoom (nearest body while flying, orbit target otherwise)
  const refDist = flying ? nearestBodyDist() : camera.position.distanceTo(controls.target);
  const near=Math.max(refDist*0.002, 0.0002), far=refDist+30000;
  if(camera.near!==near || camera.far!==far){ camera.near=near; camera.far=far; camera.updateProjectionMatrix(); }
  renderer.render(scene,camera);
  if(showLabels) updateLabels();
}

/* Real-scale sizing: render each body at its true radius but never below ~MIN_PIXELS on
   screen, so distant worlds stay visible dots and reveal true scale as you zoom in. */
const _szPos=new THREE.Vector3();
function updateBodySizes(){
  const f = Math.tan(camera.fov*Math.PI/360) * 2*MIN_PIXELS / (renderer.domElement.clientHeight||innerHeight);
  for(const rec of bodies){
    if(rec.external) continue;               // debris moonlets are sized in the scaled debris frame
    rec.mesh.getWorldPosition(_szPos);
    const d = camera.position.distanceTo(_szPos);
    const target = Math.max(realRadiusScene(rec.data.radiusKm)*sizeMult, d*f);   // max(real, dot-floor)
    if(rec.data.kind==='star') starGroup.scale.setScalar(target/STAR_R_COMPRESS);
    else rec.mesh.scale.setScalar(target/rec.radius*(rec.puffK||1));
  }
}

function worldPosOf(rec){ const v=new THREE.Vector3(); rec.mesh.getWorldPosition(v); return v; }
function worldPos(rec){ return worldPosOf(rec); }

/* ============================================================
   Labels (HTML overlay projected from 3D)
   ============================================================ */
const labelEls={};
function ensureLabels(){
  for(const rec of bodies){
    if(rec._absorbedGone) continue;          // swallowed wreck: no label until healed
    if(labelEls[rec.data.key]) continue;
    const el=document.createElement('div');
    el.className='lbl '+(rec.data.parent===DS.STAR.key||rec.data.kind==='star'?'major':'');
    if(rec.data.kind==='star') el.className='lbl star';
    el.textContent=locName(rec.data);
    el.style.color = '#'+new THREE.Color(rec.data.color||0xcfe0ff).getHexString();
    if(rec.data.kind==='star') el.style.color='#ffd98a';
    el.addEventListener('click',()=>focusBody(rec.data.key,true));
    labelLayer.appendChild(el);
    labelEls[rec.data.key]=el;
  }
}
function updateLabels(){
  ensureLabels();
  const c2=new THREE.Vector3();
  const camPos=camera.position;
  for(const rec of bodies){
    const el=labelEls[rec.data.key]; if(!el) continue;
    const wp=worldPosOf(rec);
    const dist=camPos.distanceTo(wp);
    c2.copy(wp).project(camera);
    const onscreen = c2.z<1 && c2.x>-1.1 && c2.x<1.1 && c2.y>-1.1 && c2.y<1.1;
    // declutter: hide minor moons when far (a liberated moon is a planet now — keep its label)
    const minor = !(rec.data.parent===DS.STAR.key||rec.data.kind==='star'||rec.helio||rec.freeState);
    // a just-formed moonlet pulses and ignores declutter for a moment so you see it born
    const isNew = rec._newUntil && performance.now()<rec._newUntil;
    if(rec._newUntil && !isNew){ el.classList.remove('moonlet-new'); rec._newUntil=0; }
    let show = onscreen;
    if(minor && dist>(realScale?1100:620) && !isNew) show=false;
    if(!show){ el.style.display='none'; continue; }
    if(isNew) el.classList.add('moonlet-new');
    el.style.display='block';
    const x=(c2.x*0.5+0.5)*innerWidth, y=(-c2.y*0.5+0.5)*innerHeight;
    el.style.left=x+'px'; el.style.top=y+'px';
    el.style.opacity = isNew ? 1 : (minor ? Math.max(0.25, 1-(dist-120)/600) : 0.95);
  }
}

/* ============================================================
   Interaction: raycast hover + click, nav, controls
   ============================================================ */
const ray=new THREE.Raycaster(); const mouse=new THREE.Vector2();
const tip=document.getElementById('tip');

function setupInteraction(){
  const dom=renderer.domElement;
  let downX=0,downY=0,moved=false,pdown=false,lastX=0,lastY=0;
  dom.addEventListener('pointerdown',e=>{ pdown=true; downX=lastX=e.clientX; downY=lastY=e.clientY; moved=false;
    if(document.activeElement&&document.activeElement.tagName==='INPUT') document.activeElement.blur(); // free keys for flight
    if(flying){ try{ dom.setPointerCapture(e.pointerId); }catch(_){} }   // keep look-drag alive off-canvas
    if(!flying && impacting && impWeapon==='laser' && e.button===0){     // press-and-hold (left button) on a world = burn
      const h=pickHit(e);
      if(h){ const rec=bodies.find(b=>b.data.key===h.object.userData.bodyKey); if(rec) startBeam(rec,e,h); }
    }
    document.getElementById('nav').classList.remove('open');});
  dom.addEventListener('pointermove',e=>{
    if(Math.abs(e.clientX-downX)>4||Math.abs(e.clientY-downY)>4) moved=true;
    if(flying){ if(pdown) flyLook(e.clientX-lastX, e.clientY-lastY); lastX=e.clientX; lastY=e.clientY; }
    else {
      if(impBeam) retargetBeam(e);       // drag the beam Universe-Sandbox style: retarget surface hits
      hover(e);
    }
  });
  dom.addEventListener('pointerup',e=>{ pdown=false;
    if(impBeam){ stopBeam(); return; }         // release = stop the burn (don't also focus/fire)
    if(moved) return;
    if(crPlaceArmed && !flying && e.button===0){ crPlaceAt(e); return; }   // 🎯 place a custom body
    if(flying){ setFlyTarget(pickNear(e)); }   // tap a world (tiny dots too) to target it
    else if(impacting){                        // impact mode: a left-click strikes instead of focusing
      if(impWeapon==='asteroid' && e.button===0){
        const h=pickHit(e);
        if(h){ const rec=bodies.find(b=>b.data.key===h.object.userData.bodyKey); if(rec) launchAsteroid(rec,h); }
      }
    }
    else { const hit=pick(e); if(hit) focusBody(hit,true); }
  });
  dom.addEventListener('pointercancel',()=>{ pdown=false; stopBeam(); });
  dom.addEventListener('pointerleave',()=>{tip.style.opacity=0;});
  window.addEventListener('wheel',e=>{ if(flying){ e.preventDefault(); adjustThrottle(e.deltaY<0?4:-4); } },{passive:false});

  document.getElementById('play').onclick=togglePlay;
  document.getElementById('speed').oninput=e=>setSpeed(+e.target.value);
  document.getElementById('size').oninput=e=>setSize(+e.target.value);
  const szres=document.getElementById('size-reset');
  if(szres) szres.onclick=()=>{ const s=document.getElementById('size');
    if(s) s.value=DEFAULT_SIZE_V; setSize(DEFAULT_SIZE_V); };
  document.getElementById('t-scale').onclick=function(){ setScaleMode(!realScale); };
  const tt=document.getElementById('t-text');
  if(tt){ tt.onclick=function(){ USE_VERBATIM=!USE_VERBATIM; updateTextUI();
    if(APP.currentData && document.getElementById('info').classList.contains('open')) openInfo(APP.currentData); }; }
  updateTextUI();
  const tls=document.getElementById('t-tails'); if(tls) tls.onclick=toggleTails;
  const sysb=document.getElementById('t-system');
  if(sysb){
    sysb.innerHTML = T('sys-change');                 // reopens the selection screen
    sysb.onclick=()=>showChooser();
  }
  const sx=document.getElementById('t-sfx');
  if(sx){ sx.onclick=toggleSfx;
    try{ sfxOn=localStorage.getItem('ra-sfx')!=='0'; }catch(_){ sfxOn=true; }   // on by default
    sx.classList.toggle('on',sfxOn); }
  document.getElementById('t-orbits').onclick=function(){ showOrbits=!showOrbits; this.classList.toggle('on',showOrbits);
    for(const b of bodies) if(b.orbitLine) b.orbitLine.visible=showOrbits&&!b.nb;   // nb: Kepler ellipses are stale
    nbTrailsVisible(showOrbits); };                                                 // …trails carry the job instead
  document.getElementById('t-labels').onclick=function(){ showLabels=!showLabels; this.classList.toggle('on',showLabels);
    labelLayer.style.display=showLabels?'block':'none'; };
  document.getElementById('reset').onclick=resetView;
  document.getElementById('close').onclick=closeInfo;
  document.getElementById('helpbtn').onclick=()=>document.getElementById('help').classList.toggle('open');
  const ib=document.getElementById('infobtn');   // mobile: ⓘ toggles the info sheet
  if(ib) ib.onclick=()=>{
    if(document.getElementById('info').classList.contains('open')) closeInfo();
    else{ const rec=bodies.find(b=>b.data.key===selected); if(rec) openInfo(rec.data); }
  };
  const navbtn=document.getElementById('navbtn');
  if(navbtn) navbtn.onclick=()=>document.getElementById('nav').classList.toggle('open');
  const moreBtn=document.getElementById('ctl-more');   // phones: ⋯ expands the full toolbar
  if(moreBtn) moreBtn.onclick=function(){
    const open=document.getElementById('controls').classList.toggle('more-open');
    this.classList.toggle('on',open);
    this.setAttribute('aria-expanded',open?'true':'false');
  };

  // --- impact lab controls ---
  const impBtn=document.getElementById('t-impact'); if(impBtn) impBtn.onclick=toggleImpact;
  const impW=document.getElementById('imp-weapon');
  if(impW) impW.onclick=()=>{ impWeapon=impWeapon==='asteroid'?'laser':'asteroid'; stopBeam(); updateImpactUI(); };
  const impM=document.getElementById('imp-mat');
  if(impM) impM.onclick=()=>{ impMatI=(impMatI+1)%IMP_MATS.length; updateImpactUI(); };
  for(const id of ['imp-dia','imp-spd','imp-pow']){
    const el=document.getElementById(id); if(el) el.oninput=updateImpactUI;
  }
  // click a readout to type the exact figure (km, km/s, W — e-notation ok)
  makeTypable('imp-dia-v','imp-dia', n=>100*Math.log(n/0.1)/Math.log(20000), updateImpactUI);
  makeTypable('imp-spd-v','imp-spd', n=>100*Math.log(n/11)/Math.log(30000/11), updateImpactUI);
  makeTypable('imp-pow-v','imp-pow', n=>Math.log10(n/1e12)/0.30, updateImpactUI);
  const impH=document.getElementById('imp-heal'); if(impH) impH.onclick=impHeal;
  const impS=document.getElementById('imp-surface'); if(impS) impS.onclick=toggleSurfaceView;
  const impX=document.getElementById('imp-exit'); if(impX) impX.onclick=exitImpact;
  window.addEventListener('keydown',e=>{ if(e.code==='Escape'&&impacting&&!flying) exitImpact(); });

  // --- free-roam flight controls ---
  const flyBtn=document.getElementById('t-fly'); if(flyBtn) flyBtn.onclick=toggleFly;
  const fm=document.getElementById('fly-model'); if(fm) fm.onclick=cycleFlyModel;
  const fa=document.getElementById('fly-auto'); if(fa) fa.onclick=toggleAutoSpeed;
  const gt=document.getElementById('fly-goto'); if(gt) gt.onclick=flyGoToTarget;
  const fo=document.getElementById('fly-orient'); if(fo) fo.onclick=()=>{ autoOrient=!autoOrient; updateAutoOrientUI(); };
  const ff=document.getElementById('fly-follow'); if(ff) ff.onclick=toggleFollow;
  const fbk=document.getElementById('fly-brake'); if(fbk) fbk.onclick=flyBrake;
  const fex=document.getElementById('fly-exit'); if(fex) fex.onclick=exitFly;
  const thr=document.getElementById('throttle'); if(thr) thr.oninput=e=>setThrottleV(+e.target.value);
  setThrottleV(0);
  const holdBtn=(id,sign)=>{ const b=document.getElementById(id); if(!b) return;
    const dn=e=>{ e.preventDefault(); flyThrust=sign; }, up=()=>{ flyThrust=0; };
    b.addEventListener('pointerdown',dn); b.addEventListener('pointerup',up);
    b.addEventListener('pointerleave',up); b.addEventListener('pointercancel',up); };
  holdBtn('fly-fwd',1); holdBtn('fly-back',-1);   // touch/desktop thrust (hold)
  const MOVE=['KeyW','KeyA','KeyS','KeyD','KeyR','KeyC','KeyQ','KeyE','Space','BracketLeft','BracketRight',
              'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown'];
  window.addEventListener('keydown',e=>{
    if(!flying) return;                     // while flying, capture keys even if the slider has focus
    flyKeys[e.code]=true;
    if(e.code==='BracketRight') adjustThrottle(4);
    else if(e.code==='BracketLeft') adjustThrottle(-4);
    else if(e.code==='KeyG') flyGoToTarget();
    else if(e.code==='KeyF' && !e.repeat) toggleFollow();   // F = follow the target
    else if(e.code==='Escape') exitFly();
    if(MOVE.includes(e.code)) e.preventDefault();   // also stops arrows/Space from moving the slider/buttons
  });
  window.addEventListener('keyup',e=>{ flyKeys[e.code]=false; });

  // lightbox
  const lb=document.getElementById('lightbox'), lbi=document.getElementById('lightbox-img');
  lb.onclick=()=>lb.classList.remove('open');
  APP.openLightbox=(src)=>{ lbi.src=src; lb.classList.add('open'); };

  document.getElementById('speed').value = DEFAULT_SPEED_V;
  setSpeed(DEFAULT_SPEED_V);
  updateClock();
}

function pickHit(e){   // full first intersection (object, point, uv) — uv drives the scar painting
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1;
  mouse.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(mouse,camera);
  ray.params.Points={threshold:1};
  const hits=ray.intersectObjects(pickables,false);
  // a shattered world's mesh stays pickable (for the epitaph) but is INVISIBLE —
  // don't let that ghost sphere shadow the rump/moonlets living inside it:
  // prefer the nearest hit on a live body, fall back to the nearest hit at all
  for(const h of hits){
    const rec=bodies.find(b=>b.data.key===h.object.userData.bodyKey);
    if(rec && !rec.destroyed) return h;
  }
  return hits.length? hits[0] : null;
}
function pick(e){
  const h=pickHit(e);
  return h? h.object.userData.bodyKey : null;
}
/* forgiving pick: exact raycast first, else the nearest body within ~34px on screen
   (real-scale worlds are floored to a few px, so precise ray hits are nearly impossible). */
const _pp=new THREE.Vector3();
function pickNear(e){
  const exact=pick(e); if(exact) return exact;
  const r=renderer.domElement.getBoundingClientRect();
  let best=null, bd=34*34;
  for(const rec of bodies){
    _pp.copy(worldPosOf(rec)).project(camera);
    if(_pp.z>1) continue;                                   // behind the camera
    const sx=r.left+(_pp.x*0.5+0.5)*r.width, sy=r.top+(-_pp.y*0.5+0.5)*r.height;
    const dd=(sx-e.clientX)**2+(sy-e.clientY)**2;
    if(dd<bd){ bd=dd; best=rec.data.key; }
  }
  return best;
}
/* damage stage for the hover tooltip — shown for ANY damaged world, even
   with the impact lab closed: stage word, % of binding energy, biosphere */
function impDamageStageTxt(rec){
  if(rec.destroyed) return T('imp-destroyed');
  const E=rec.dmgJ||0; if(!(E>0)) return '';
  const fU=E/impBindingJ(rec);
  let st;
  if(fU>=0.5) st=T('dmg-critical');
  else if(rec.data.kind==='gasgiant'||impIsStellar(rec)) st=T('dmg-heavy');
  else{
    const P=impMeltPhases(rec);
    if(E>=P.E3) st=T('dmg-molten');
    else if(P.W>0 && E>=P.E2) st=T('dmg-boiled');
    else if(fU>=0.02 || E>=P.E2*0.3) st=T('dmg-heavy');
    else st=T('dmg-scarred');
  }
  const pct=fU*100;
  let t=' · 💥 '+st+' ('+(pct<0.01?'<0.01':''+(+pct.toPrecision(2)))+T('imp-binding-of')+')';
  if(rec.sterile) t+=' · ∅ '+T('life-sterile');
  else if(rec.extinct) t+=' · ✦ '+T('life-unicellular');
  return t;
}
function hover(e){
  const k=pick(e);
  renderer.domElement.style.cursor = impacting ? 'crosshair' : (k?'pointer':'grab');
  if(k){ const rec=bodies.find(b=>b.data.key===k);
    let txt=locName(rec.data);
    if(!impacting && rec) txt+=impDamageStageTxt(rec);
    if(impacting && rec){
      if(impImmune(rec)) txt+=T('imp-immune');
      else if(rec.destroyed) txt+=T('imp-destroyed');
      else{
        const E=impWeapon==='asteroid'?impKE():impPowW;
        const pct=E/impBindingJ(rec)*100;
        const lbl=impWeapon==='asteroid'?T('imp-strike'):T('imp-beam');
        txt+=' · '+lbl+' ≈ '+(pct>=100?T('imp-binding-over'):(pct<0.01?'<0.01':''+(+pct.toPrecision(2)))+T('imp-binding-of'));
        if(impWeapon==='asteroid'){
          const pd=impMeltPoolDeg(rec,E);    // preview the lava sea this rock would leave
          if(pd>0.5) txt+=T('imp-melts-sea').replace('{km}',Math.round(pd*2/57.2958*(rec.data.radiusKm||1000)).toLocaleString());
        }
        txt+=impTierTxt(rec);
      }
    }
    tip.textContent=txt; tip.style.left=e.clientX+'px'; tip.style.top=e.clientY+'px'; tip.style.opacity=1;
  } else tip.style.opacity=0;
}

function togglePlay(){ playing=!playing; document.getElementById('play').innerHTML=playing?T('pause'):T('play'); }
function setSpeed(v){ // 0..100 -> real time-rate (sim years advanced per real second), logarithmic
  const yps = Math.exp( Math.log(RATE_MIN_YPS) + (Math.log(RATE_MAX_YPS)-Math.log(RATE_MIN_YPS))*(v/100) );
  timeScale = yps / YEARS_PER_SEC;          // motion advances exactly `yps` sim-years per real second
  document.getElementById('speedval').textContent = fmtRate(yps);
}
/* speed readout in real time units: "real-time", "45 s/s", "12 min/s", "6 hr/s", "3 days/s", "2 mo/s", "1.4 yr/s" */
function fmtRate(yps){
  const s = yps*SEC_PER_YEAR;               // sim seconds advanced per real second
  if(s>0.7 && s<1.5) return T('rt');
  if(yps>=1)            return (yps<10?yps.toFixed(2):yps.toFixed(0))+' '+T('u-yr');
  const mo=yps*12;     if(mo>=1) return mo.toFixed(1)+' '+T('u-mo');
  const d=yps*365.25;  if(d>=1)  return (d<10?d.toFixed(1):d.toFixed(0))+' '+T('u-day');
  const h=d*24;        if(h>=1)  return (h<10?h.toFixed(1):h.toFixed(0))+' '+T('u-hr');
  const mi=h*60;       if(mi>=1) return mi.toFixed(0)+' '+T('u-min');
  return (mi*60).toFixed(0)+' '+T('u-s');
}
function fmtElapsed(yr){
  if(yr>=1)            return (yr<100?yr.toFixed(1):yr.toFixed(0))+' '+T('e-yr');
  const d=yr*365.25;   if(d>=1)  return (d<10?d.toFixed(1):d.toFixed(0))+' '+T('e-day');
  const h=d*24;        if(h>=1)  return h.toFixed(1)+' '+T('e-hr');
  const mi=h*60;       if(mi>=1) return mi.toFixed(0)+' '+T('e-min');
  return (mi*60).toFixed(0)+' '+T('e-s');
}
function updateClock(){ const el=document.getElementById('elapsed'); if(el) el.textContent='⏱ '+fmtElapsed(elapsedYears); }
function setSize(v){
  sizeMult=v/100;
  applySizes();
}
function resetView(){
  selected=null; closeInfo(); setActiveNav(null);
  // restore the Size slider to its default (real/baseline) size
  const sz=document.getElementById('size');
  if(sz){ sz.value=DEFAULT_SIZE_V; setSize(DEFAULT_SIZE_V); }
  elapsedYears=0; updateClock();   // restart the sim clock
  frameSystem();
  controls.update();   // apply the reset immediately (damping is on)
}

/* focus camera on a body */
function focusBody(key, openPanel){
  const rec=bodies.find(b=>b.data.key===key); if(!rec) return;
  document.getElementById('nav').classList.remove('open');   // close the mobile drawer
  follow=null;
  const bp=worldPosOf(rec);
  tween.active=true; tween.t=0; tween.body=rec;
  tween.fromCam.copy(camera.position); tween.fromTarget.copy(controls.target);
  if(rec.external){                          // debris moonlet: frame its true WORLD size
    const ws=rec.radius*(rec._parentMesh?rec._parentMesh.scale.x:1);
    tween.dist=Math.max(ws*6, controls.minDistance*1.5);
    selected=key; setActiveNav(key);
    if(surfaceView) surfaceRec=rec;
    if(openPanel==='force' || (openPanel!==false && !MOBILE_UI)) openInfo(rec.data);
    return;
  }
  if(realScale){
    // frame the body's TRUE size (fly close enough that real geometry shows, not the dot-floor)
    const er = realRadiusScene(rec.data.radiusKm)*Math.max(sizeMult,1);
    tween.dist = Math.max(er*4, controls.minDistance*1.5);
  } else {
    const vr = (rec.data.kind==='star') ? starVisR() : rec.radius*bodyF()*Math.max(sizeMult,0.5);
    tween.dist = Math.max(vr*5.5, vr*4 + 8);
    if(rec.data.kind==='star') tween.dist = starVisR()*7;
  }
  selected=key; setActiveNav(key);
  crParentFollowFocus();                     // Create panel's Orbits row tracks the focus
  if(surfaceView) surfaceRec=rec;
  // 'force' (deep links) always opens; plain true is suppressed on touch devices
  if(openPanel==='force' || (openPanel!==false && !MOBILE_UI)) openInfo(rec.data);
}

/* ============================================================
   Free-roam flight (Celestia / Space-Engine style) — you ARE the camera
   ============================================================ */
const FLY_LOOK_SENS = 0.0042;        // radians of look per pixel dragged
const _fa=new THREE.Vector3(), _fb=new THREE.Vector3(), _fc=new THREE.Vector3(), _fq=new THREE.Quaternion();

function toggleFly(){ flying ? exitFly() : enterFly(); }
function enterFly(){
  if(flying) return;
  if(impacting) exitImpact();                 // fly's drag-to-look conflicts with hold-to-lase
  if(!realScale) setScaleMode(true);          // flight is a real-scale experience
  flying=true; tween.active=false; follow=null; controls.enabled=false;
  flyEuler.setFromQuaternion(camera.quaternion,'YXZ'); flyEuler.z=0;
  flyVel.set(0,0,0);
  document.getElementById('flyhud').classList.add('on');
  const b=document.getElementById('t-fly'); if(b) b.classList.add('on');
  updateFlyModelUI(); updateAutoOrientUI(); updateAutoSpeedUI(); updateFollowUI(); updateFlyHUD();
}
function exitFly(){
  if(!flying) return;
  flying=false; flyFollow=null; flyGoto=null; controls.enabled=true;
  _fa.set(0,0,-1).applyQuaternion(camera.quaternion);     // park the orbit pivot ahead of view
  controls.target.copy(camera.position).addScaledVector(_fa, 20);
  document.getElementById('flyhud').classList.remove('on');
  const b=document.getElementById('t-fly'); if(b) b.classList.remove('on');
}
function flyLook(dx,dy){
  autoOrient=false; updateAutoOrientUI();
  flyEuler.y -= dx*FLY_LOOK_SENS; flyEuler.x -= dy*FLY_LOOK_SENS;
  const lim=Math.PI/2-0.01; flyEuler.x=Math.max(-lim,Math.min(lim,flyEuler.x));
}
function cycleFlyModel(){
  flyModel = flyModel==='cruise'?'newton':flyModel==='newton'?'flycam':'cruise';
  if(flyModel!=='newton') flyVel.set(0,0,0);
  updateFlyModelUI();
}
function updateFlyModelUI(){ const b=document.getElementById('fly-model');
  if(b) b.textContent = flyModel==='cruise'?'🛟 Cruise':flyModel==='newton'?'🚀 Newtonian':'🎮 Flycam'; }
function updateAutoOrientUI(){ const b=document.getElementById('fly-orient'); if(b) b.classList.toggle('on',autoOrient); }
function toggleFollow(){                       // F: lock onto the target and co-move as it orbits
  if(flyFollow) flyFollow=null;
  else if(flyTarget){ flyFollow=flyTarget; _flyPrevTarget.copy(worldPosOf(flyTarget)); }
  updateFollowUI(); updateFlyHUD();
}
function updateFollowUI(){ const b=document.getElementById('fly-follow'); if(b) b.classList.toggle('on',!!flyFollow); }
function toggleAutoSpeed(){ flyAutoSpeed=!flyAutoSpeed; updateAutoSpeedUI();
  const sl=document.getElementById('throttle'); setThrottleV(sl?+sl.value:0); }   // re-resolve speed for the new mode
function updateAutoSpeedUI(){ const b=document.getElementById('fly-auto');
  if(b){ b.classList.toggle('on',flyAutoSpeed); b.textContent = flyAutoSpeed?'⚡ Auto':'⚙ Manual';
    b.title = flyAutoSpeed?'Speed auto-scales to nearby bodies — click for manual (uncapped) speed'
                          :'Manual speed (any value) — click for auto-scaling'; } }
function flyBrake(){ flyVel.set(0,0,0); }
function setFlyTarget(key){
  const rec=key&&bodies.find(b=>b.data.key===key);
  if(rec){
    if(flyTarget===rec){ flyGoToTarget(); }   // tap the current target again = fly there
    else { flyTarget=rec; selected=key; setActiveNav(key); }
  }
  updateFlyHUD();
}
function flyGoToTarget(){
  if(!flyTarget) return;
  flyGoto={ rec:flyTarget, t:0, dur:1.8, fromPos:camera.position.clone(), fromQuat:camera.quaternion.clone() };
}
function gotoFrameDist(rec){ return Math.max(realRadiusScene(rec.data.radiusKm)*Math.max(sizeMult,1)*4, 0.01); }
function lookQuatAt(tp){ _fq.copy(camera.quaternion); camera.up.set(0,1,0); camera.lookAt(tp);
  const q=camera.quaternion.clone(); camera.quaternion.copy(_fq); return q; }

function setThrottleV(v){               // slider 0..100 -> throttle fraction; 0 = stopped
  v=Math.max(0,Math.min(100,v));
  throttleFrac = v/100;
  const sl=document.getElementById('throttle'); if(sl && +sl.value!==v) sl.value=v;
  throttleKms = flyTargetKms();          // resolve to a real km/s for the readout
  updateFlyHUD();
}
function adjustThrottle(d){ const sl=document.getElementById('throttle'); if(sl) setThrottleV(+sl.value+d); }
/* full-throttle speed for the CURRENT position: scales with the gap to the nearest body so one
   slider works from a low pass over a moon to a superluminal deep-space cruise. */
function flyFullKms(){
  let best=1e12;
  for(const rec of bodies){
    const r=realRadiusScene(rec.data.radiusKm)*Math.max(sizeMult,1);
    const d=camera.position.distanceTo(worldPosOf(rec))-r;
    if(d<best) best=d;
  }
  best=Math.max(best,1e-5);
  return Math.min(Math.max(best*REACH_RATE*KM_PER_UNIT, FLY_FLOOR_KMS), FLY_CAP_KMS);
}
/* throttle fraction -> real km/s. AUTO = context-relative, curved (f^2) for fine control;
   MANUAL = absolute log map over an uncapped range so the user can pick any speed. */
function flyTargetKms(){
  if(throttleFrac<=0) return 0;
  return flyAutoSpeed ? flyFullKms()*throttleFrac*throttleFrac
                      : FLY_MANUAL_MIN*Math.pow(FLY_MANUAL_MAX/FLY_MANUAL_MIN, throttleFrac);
}

function fmtSpeed(kms){
  if(kms<1) return '0 km/s';
  if(kms<30000) return Math.round(kms).toLocaleString()+' km/s';
  const c=kms/C_KMS; return (c<10?c.toFixed(2):c<100?c.toFixed(1):Math.round(c).toLocaleString())+' c';
}
function fmtTime(s){
  if(!isFinite(s)||s<0) return '—';
  if(s<90) return Math.round(s)+' s';
  if(s<5400) return (s/60).toFixed(1)+' min';
  if(s<172800) return (s/3600).toFixed(1)+' h';
  if(s<5256000) return (s/86400).toFixed(1)+' d';
  return (s/31557600).toFixed(1)+' yr';
}
function fmtDist(km){
  if(km<1e6) return Math.round(km).toLocaleString()+' km';
  const au=km/KM_PER_AU; return au<0.01?(km/1e6).toFixed(2)+' M km':au.toFixed(au<10?3:1)+' AU';
}
function updateFlyHUD(){
  if(!flying) return;
  // show the throttle set-speed (responds to the slider) with the live speed if it differs
  const sp=document.getElementById('fly-speed');
  if(sp){ const act=flyVel.length()*KM_PER_UNIT;
    sp.textContent = (Math.abs(act-throttleKms)/(throttleKms||1) > 0.15 && act>0)
      ? fmtSpeed(act) : fmtSpeed(throttleKms); }
  const tg=document.getElementById('fly-target'), eta=document.getElementById('fly-eta');
  if(flyTarget){
    const tp=worldPosOf(flyTarget), rangeKm=camera.position.distanceTo(tp)*KM_PER_UNIT;
    if(tg) tg.textContent='◎ '+locName(flyTarget.data)+' · '+fmtDist(rangeKm);
    _fa.copy(tp).sub(camera.position).normalize();
    const closeKms=flyVel.dot(_fa)*KM_PER_UNIT;
    if(eta) eta.textContent = 'ETA '+(closeKms>1?fmtTime(rangeKm/closeKms):'—');
  } else { if(tg) tg.textContent=T('fly-notarget'); if(eta) eta.textContent=''; }
}
function nearestBodyDist(){
  let d=1e12; for(const rec of bodies){ const dd=camera.position.distanceToSquared(worldPosOf(rec)); if(dd<d) d=dd; }
  return Math.max(Math.sqrt(d), 0.01);
}

/* per-frame flight update (called from animate while flying) */
function updateFly(dt){
  if(flyKeys['KeyQ']) flyEuler.z += dt*1.2;
  if(flyKeys['KeyE']) flyEuler.z -= dt*1.2;

  // cinematic Go-to auto-pilot
  if(flyGoto){
    flyGoto.t=Math.min(1, flyGoto.t+dt/flyGoto.dur); const e=1-Math.pow(1-flyGoto.t,3);
    const tp=worldPosOf(flyGoto.rec);
    _fa.copy(flyGoto.fromPos).sub(tp); if(_fa.lengthSq()<1e-9) _fa.set(0,0,1); _fa.normalize();
    _fb.copy(tp).addScaledVector(_fa, gotoFrameDist(flyGoto.rec));
    camera.position.lerpVectors(flyGoto.fromPos, _fb, e);
    camera.quaternion.slerpQuaternions(flyGoto.fromQuat, lookQuatAt(tp), e);
    if(flyGoto.t>=1){ flyFollow=flyGoto.rec; flyTarget=flyGoto.rec; _flyPrevTarget.copy(tp);
      flyEuler.setFromQuaternion(camera.quaternion,'YXZ'); flyGoto=null; }
    updateFlyHUD(); return;
  }

  // follow: co-move with a body as it orbits
  if(flyFollow){ const tp=worldPosOf(flyFollow); camera.position.add(_fa.copy(tp).sub(_flyPrevTarget)); _flyPrevTarget.copy(tp); }

  // orientation
  if(autoOrient && flyTarget){
    camera.quaternion.slerp(lookQuatAt(worldPosOf(flyTarget)), Math.min(1,dt*3));
    flyEuler.setFromQuaternion(camera.quaternion,'YXZ');
  } else camera.quaternion.setFromEuler(flyEuler);

  // movement: forward / right / up of current view
  _fa.set(0,0,-1).applyQuaternion(camera.quaternion);
  _fb.set(1,0,0).applyQuaternion(camera.quaternion);
  _fc.set(0,1,0).applyQuaternion(camera.quaternion);
  const fwd=(flyKeys['KeyW']||flyKeys['ArrowUp']?1:0)-(flyKeys['KeyS']||flyKeys['ArrowDown']?1:0)+flyThrust;       // W/S, ↑/↓, ▲/▼
  const str=(flyKeys['KeyD']||flyKeys['ArrowRight']?1:0)-(flyKeys['KeyA']||flyKeys['ArrowLeft']?1:0);             // A/D, ←/→ strafe
  const ver=((flyKeys['PageUp']||flyKeys['KeyR']||flyKeys['Space'])?1:0)-((flyKeys['PageDown']||flyKeys['KeyC'])?1:0); // up/down (F is now follow)
  // resolve slider -> real km/s (auto or manual); pressing a move key always yields motion
  throttleKms = flyTargetKms();
  if(fwd||str||ver) throttleKms=Math.max(throttleKms, flyFullKms()*FLY_KEY_FLOOR);
  const spd=kmsToUnits(throttleKms)*((flyKeys['ShiftLeft']||flyKeys['ShiftRight'])?6:1);
  if(flyModel==='cruise'){               // coast forward at throttle; ▲/W boost, ▼/S brake, A/D/R/F strafe
    flyVel.copy(_fa).multiplyScalar(spd*(1+fwd)).addScaledVector(_fb,str*spd).addScaledVector(_fc,ver*spd);
  } else if(flyModel==='flycam'){        // move only while thrust held (▲/▼ or keys)
    _fa.multiplyScalar(fwd).addScaledVector(_fb,str).addScaledVector(_fc,ver);
    if(_fa.lengthSq()>0) flyVel.copy(_fa.normalize()).multiplyScalar(spd); else flyVel.set(0,0,0);
  } else {                                // newton: thrust accelerates, then drift
    _fa.multiplyScalar(fwd).addScaledVector(_fb,str).addScaledVector(_fc,ver);
    if(_fa.lengthSq()>0) flyVel.addScaledVector(_fa.normalize(), spd*dt);
  }
  camera.position.addScaledVector(flyVel, dt);
  updateFlyHUD();
}

/* ============================================================
   Navigator + info panel
   ============================================================ */
function navItem(data, sub){
  const el=document.createElement('div');
  el.className='navitem'+(sub?' sub':'');
  el.dataset.key=data.key;
  const col='#'+new THREE.Color(data.color||0xcccccc).getHexString();
  el.innerHTML=`<span class="dot" style="color:${col}"></span><span>${locName(data)}</span>`+
    (data.life?`<span class="tag" title="${T('life-title')}">✦&nbsp;${T('life-'+data.life)}</span>`:'')+
    (data.navTag?`<span class="tag">${data.navTag}</span>`:'');
  el.onclick=()=>focusBody(data.key,true);
  return el;
}
function generatedFor(key){
  return bodies.filter(b=>b._generated && b._originKey===key);
}
function buildNav(){
  const nav=document.getElementById('nav');
  const alive=k=>bodies.some(b=>b.data.key===k && !b._absorbedGone);  // deleted/swallowed bodies vanish from the nav
  // custom worlds live under their gravitational parent, ordered by distance:
  // heliocentric ones woven into the planet list, moons into their planet's list
  const customs=bodies.filter(b=>b._custom && !b._absorbedGone);
  // under N-body the creation flags go stale — a click-placed orbiter is
  // heliocentric on paper but LIVES around Jupiter. Weave by the live
  // dominant attractor; in Kepler mode by the recorded parent.
  const starRec=bodies.find(b=>b.data.kind==='star');
  const custPar={};
  for(const b of customs){
    let pk=null;
    if(nbodyOn && b.nb && !b.destroyed && !b.freeState){
      const p=nbDominantParent(b);
      pk=(p && p.data.kind!=='star')?p.data.key:null;
    } else if(b.isMoon && b._crParams && b._crParams.parent) pk=b._crParams.parent;
    custPar[b.data.key]=pk;
  }
  const aHelio=b=>(nbodyOn && b.nb && starRec && starRec.nb)
    ? b.nb.r.distanceTo(starRec.nb.r)
    : (b.helioA!=null?b.helioA:(b.data.dist||0));
  const customPlanets=customs.filter(b=>!custPar[b.data.key]).sort((x,y)=>aHelio(x)-aHelio(y));
  const custD=(b,key)=>{                     // live separation for in-list ordering
    if(nbodyOn && b.nb){ const p=bodies.find(r=>r.data.key===key && r.nb); if(p) return b.nb.r.distanceTo(p.nb.r); }
    return b.data.dist||0;
  };
  const customMoonsOf=key=>customs.filter(b=>custPar[b.data.key]===key)
    .sort((x,y)=>custD(x,key)-custD(y,key));
  let cpi=0;
  const flushCustomPlanets=upTo=>{           // append customs closer than the next built-in planet
    while(cpi<customPlanets.length && (upTo==null || aHelio(customPlanets[cpi])<upTo)){
      const cp=customPlanets[cpi++];
      nav.appendChild(navItem(cp.data));
      for(const g of generatedFor(cp.data.key)) nav.appendChild(navItem(g.data, true));
      for(const cm of customMoonsOf(cp.data.key)) nav.appendChild(navItem(cm.data, true));
    }
  };
  const moonRows=key=>{                      // built-in + custom moons, sorted by distance
    const rows=DS.MOONS.filter(x=>x.parent===key && alive(x.key)).map(m=>({d:m.dist||0, data:m}));
    for(const c of customMoonsOf(key)) rows.push({d:custD(c,key), data:c.data});
    rows.sort((x,y)=>x.d-y.d);
    return rows;
  };
  const h=document.createElement('h3'); h.textContent=SYS==='sol'?T('nav-sol'):T('nav-ra'); nav.appendChild(h);
  nav.appendChild(navItem(DS.STAR));
  for(const p of DS.PLANETS){
    flushCustomPlanets(p.dist);
    if(alive(p.key)) nav.appendChild(navItem(p));
    for(const g of generatedFor(p.key)) nav.appendChild(navItem(g.data, true));
    for(const row of moonRows(p.key)){
      nav.appendChild(navItem(row.data,true));
      for(const g of generatedFor(row.data.key)) nav.appendChild(navItem(g.data, true));
      for(const cm of customMoonsOf(row.data.key)) nav.appendChild(navItem(cm.data, true));
    }
  }
  flushCustomPlanets(null);                  // customs beyond the last planet
  if(DS.HORUS){
    const h2=document.createElement('h3'); h2.textContent=T('nav-horus'); nav.appendChild(h2);
    if(alive(DS.HORUS.key)) nav.appendChild(navItem(DS.HORUS));
    for(const g of generatedFor(DS.HORUS.key)) nav.appendChild(navItem(g.data, true));
    const hRows=DS.HORUS_MOONS.filter(m=>alive(m.key)).map(m=>({d:m.dist||0, data:m}));
    for(const c of customMoonsOf(DS.HORUS.key)) hRows.push({d:custD(c,DS.HORUS.key), data:c.data});
    hRows.sort((x,y)=>x.d-y.d);
    for(const row of hRows){
      nav.appendChild(navItem(row.data,true));
      for(const g of generatedFor(row.data.key)) nav.appendChild(navItem(g.data, true));
      for(const cm of customMoonsOf(row.data.key)) nav.appendChild(navItem(cm.data, true));
    }
  }
  // safety net: a custom whose parent isn't a listed body (orbiting a remnant,
  // a deleted world's key, …) must still be reachable somewhere
  for(const c of customs)
    if(!nav.querySelector('.navitem[data-key="'+c.data.key+'"]'))
      nav.appendChild(navItem(c.data, true));
}
function setActiveNav(key){
  document.querySelectorAll('.navitem').forEach(el=>el.classList.toggle('active', el.dataset.key===key));
}
/* sidebar badge: a destroyed world swaps its ✦ life tag for a red ☠ one */
function updateNavStatus(rec){
  const el=document.querySelector('.navitem[data-key="'+rec.data.key+'"]'); if(!el) return;
  let tag=el.querySelector('.tag');
  if(rec.destroyed){
    if(!tag){ tag=document.createElement('span'); tag.className='tag'; el.appendChild(tag); }
    tag.className='tag dead'; tag.removeAttribute('title');
    tag.innerHTML='☠&nbsp;'+T('nav-destroyed');
  } else if(rec.sterile && rec.data.life){
    if(!tag){ tag=document.createElement('span'); el.appendChild(tag); }
    tag.className='tag ext'; tag.title=T('life-title');
    tag.innerHTML='∅&nbsp;'+T('life-sterile');
  } else if(rec.extinct && rec.data.life){
    if(!tag){ tag=document.createElement('span'); el.appendChild(tag); }
    tag.className='tag ext'; tag.title=T('life-title');
    tag.innerHTML='✦&nbsp;'+T('life-unicellular');
  } else if(rec.data.life){
    if(!tag){ tag=document.createElement('span'); el.appendChild(tag); }
    tag.className='tag'; tag.title=T('life-title');
    tag.innerHTML='✦&nbsp;'+T('life-'+rec.data.life);
  } else if(tag) tag.remove();
}

function typeLabelFor(d){
  if(d.kind==='star') return T('type-star');
  if(d.kind==='browndwarf') return T('type-bd');
  if(d.kind==='planetremnant') return T('type-remnant');
  if(d.parent && d.parent!==DS.STAR.key) return T('type-moon');
  return T('type-planet');
}
function openInfo(d){
  APP.currentData=d;
  // a destroyed world (impact lab) shows its debris-field epitaph instead
  const drec=bodies.find(b=>b.data.key===d.key);
  if(drec && drec.destroyed) return openInfoDestroyed(drec);
  // the author's word-for-word text, where the source document has it
  // (in Slovak mode a natural translation of that text)
  const verbatim = locVerbatim(d.key);
  // author's-text edition shows only the author's words, so hide my own tagline there
  const authorOnly = USE_VERBATIM && !!verbatim;
  document.getElementById('i-type').textContent=typeLabelFor(d);
  const delBtn=document.getElementById('i-del');
  if(delBtn) delBtn.style.display = d.kind==='star' ? 'none' : '';
  document.getElementById('i-name').innerHTML=locName(d)+(d.alt?`<span>${d.alt}</span>`:'');
  // tagline is my own line — hide it only when showing the author's own words alone
  const tagEl=document.getElementById('i-tag');
  tagEl.textContent = authorOnly ? '' : (locTagline(d)||'');
  tagEl.style.display = authorOnly ? 'none' : 'block';
  // gallery
  const g=document.getElementById('i-gallery'); g.innerHTML='';
  (d.images||[]).forEach(([file,cap],i)=>{
    const fig=document.createElement('figure');
    const img=new Image(); img.src='assets/img/'+file; img.alt=cap; img.loading='lazy';
    img.onclick=()=>APP.openLightbox(img.src);
    const fc=document.createElement('figcaption'); fc.textContent=locCaption(d,i,cap);
    fig.appendChild(img); fig.appendChild(fc); g.appendChild(fig);
  });
  // stats
  const t=document.getElementById('i-stats'); t.innerHTML='';
  (locStats(d)||[]).forEach(([k,v])=>{ const tr=document.createElement('tr');
    tr.innerHTML=`<td>${k}</td><td>${v}</td>`; t.appendChild(tr); });
  // an impact-nudged orbit overrides the book values — show the live elements
  // (skipped under N-body: the 🌌 Live orbit row supersedes these stale numbers)
  const prec=bodies.find(b=>b.data.key===d.key);
  if(prec && prec.orbitPerturbed && !prec.destroyed && !prec.nb){
    const aAU=prec.helio?(prec.helioA!=null?prec.helioA:prec.data.dist):(prec._physA!=null?prec._physA:prec.data.dist);
    const val=prec.helio
      ? (+aAU.toPrecision(4))+' AU · e='+(+prec.e.toPrecision(3))+' · '+(+prec.period.toPrecision(3))+' '+T('e-yr')
      : Math.round(aAU*1.496e8).toLocaleString()+' km · e='+(+prec.e.toPrecision(3));
    const tr=document.createElement('tr');
    tr.innerHTML='<td>⚠ '+T('st-orbit-now')+'</td><td>'+val+'</td>'; t.appendChild(tr);
  }
  // impacts can add retained material or boil it away — show the current mass
  if(prec && !prec.destroyed && impMassChangedFrac(prec)>0.001){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>⚠ '+T('st-mass-now')+'</td><td id="i-mass-now">'+impMassNowTxt(prec)+'</td>';
    t.appendChild(tr);
  }
  if(prec && !prec.destroyed && prec._impWaterKg>0){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>⚠ '+T('st-water-now')+'</td><td>'+fmtKg(prec._impWaterKg)+'</td>';
    t.appendChild(tr);
  }
  // ✎ every orbit is editable: semi-major axis (AU, or km for big numbers) + eccentricity
  const curOrb=prec?orbCurrent(prec):null;
  if(curOrb){
    const aTxt=curOrb.a<0.02 ? Math.round(curOrb.a*KM_PER_AU) : +curOrb.a.toPrecision(4);
    const tr=document.createElement('tr');
    tr.innerHTML='<td>✎ '+T('orb-edit')+'</td><td style="white-space:nowrap">'+
      'a <input id="i-orb-a" type="text" inputmode="decimal" value="'+aTxt+'" '+
        'title="Semi-major axis — plain numbers are AU, big numbers (>500) are km"> '+
      'e <input id="i-orb-e" type="text" inputmode="decimal" value="'+(+curOrb.e.toFixed(3))+'"> '+
      '<button id="i-orb-set">'+T('orb-apply')+'</button></td>';
    t.appendChild(tr);
    document.getElementById('i-orb-set').onclick=function(){
      const av=parseFloat(document.getElementById('i-orb-a').value);
      const evl=parseFloat(document.getElementById('i-orb-e').value);
      const btn=this;
      if(applyOrbitEdit(prec, av>500?av/KM_PER_AU:av, evl)){
        btn.textContent='✓'; setTimeout(()=>openInfo(d), 650);
      } else { btn.textContent='✗'; setTimeout(()=>{ btn.textContent=T('orb-apply'); }, 900); }
    };
  }
  // a sterilized biosphere overrides the book's life claims
  if(prec && !prec.destroyed && (prec.extinct||prec.sterile)){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>⚠ '+T('st-bio-now')+'</td><td>'+T(prec.sterile?'bio-sterile-val':'bio-extinct-val')+'</td>';
    t.appendChild(tr);
  }
  // description
  const ds=document.getElementById('i-desc'); ds.innerHTML='';
  const addParas=(text)=>{ (text||'').split('\n\n').forEach(par=>{ if(!par.trim())return;
    const p=document.createElement('p'); p.textContent=par.trim(); ds.appendChild(p); }); };
  const addSource=(label)=>{ const s=document.createElement('p'); s.className='src';
    s.textContent=label; ds.appendChild(s); };
  if(USE_VERBATIM){
    // author's-text edition: the author's own words, or a note + summary fallback
    if(verbatim){ addParas(verbatim); }
    else {
      const note=document.createElement('p');
      note.style.cssText='font-style:italic;color:#8ea2c0;font-size:12px';
      note.textContent=T('no-desc');
      ds.appendChild(note);
      addParas(locDesc(d));
    }
  } else {
    // default edition: my short summary, then the author's verbatim text beneath it
    addParas(locDesc(d));
    if(verbatim){ addSource(T('from-source')); addParas(verbatim); }
  }
  // extinction note — a separate element AFTER the (untouchable) source text
  if(prec && !prec.destroyed && (prec.extinct||prec.sterile)){
    const note=document.createElement('p');
    note.style.cssText='font-style:italic;color:#c08a8a;font-size:12px';
    note.textContent='⚠ '+T(prec.sterile?'ext-note-sterile':'ext-note');
    ds.insertBefore(note, ds.firstChild);
  }
  document.getElementById('info').classList.add('open');
  syncInfoBtn();
}
function syncInfoBtn(){ const ib=document.getElementById('infobtn');
  if(ib) ib.classList.toggle('on', document.getElementById('info').classList.contains('open')); }
/* info panel for a world destroyed in the impact lab */
function openInfoDestroyed(rec){
  const d=rec.data;
  const field=debrisFields.find(x=>x.rec===rec);
  const stellar=impIsStellar(rec);
  document.getElementById('i-type').textContent=T('debris-type');
  const delBtn2=document.getElementById('i-del');
  if(delBtn2) delBtn2.style.display = d.kind==='star' ? 'none' : '';   // deleting a corpse clears its debris
  document.getElementById('i-name').innerHTML=locName(d)+'<span>'+T('debris-name-span')+'</span>';
  const tagEl=document.getElementById('i-tag');
  tagEl.textContent=T('debris-tag'); tagEl.style.display='block';
  document.getElementById('i-gallery').innerHTML='';
  const t=document.getElementById('i-stats'); t.innerHTML='';
  const cause=rec._lastHitBy
    ? T(rec._lastHitBy.sn?'st-cause-sn':'st-cause-col').replace('{name}', rec._lastHitBy.name)
    : T('st-cause-v');
  const rows=[[T('st-status'),T('st-destroyed')],
   [T('st-cause'),cause],
   [T('st-eabs'), (rec.dmgJ||0).toExponential(2).replace('e+','e')+' J'],
   [T('st-ebind'), impBindingJ(rec).toExponential(2).replace('e+','e')+' J']];
  rows.push(stellar?[T('st-blast'),T('st-blast-v')]:[T('st-ring'), T('st-ring-v')]);
  rows.forEach(([k,v])=>{ const tr=document.createElement('tr');
    tr.innerHTML=`<td>${k}</td><td>${v}</td>`; t.appendChild(tr); });
  const ds=document.getElementById('i-desc'); ds.innerHTML='';
  const p=document.createElement('p');
  p.textContent=T(stellar?'stellar-epitaph':'debris-epitaph').replace(/\{name\}/g,locName(d));
  ds.appendChild(p);
  if(!stellar && field && field.rumpRec){
    const p2=document.createElement('p');
    p2.textContent=locName(d)+' has begun to re-form: enough bound debris has fallen back to make '+field.rumpRec.data.name+', a red-hot spherical planetary remnant. Any moonlets listed beneath it are also accreted from the same incandescent rubble.';
    ds.appendChild(p2);
  } else if(!stellar && field && !field.allowRemnant){
    const p2=document.createElement('p');
    p2.textContent=T('debris-overkill');
    ds.appendChild(p2);
  }
  const hint=document.createElement('p');
  hint.style.cssText='font-style:italic;color:#8ea2c0;font-size:12px';
  hint.textContent=T('heal-hint');
  ds.appendChild(hint);
  document.getElementById('info').classList.add('open');
  syncInfoBtn();
}

function closeInfo(){ document.getElementById('info').classList.remove('open'); setActiveNav(selected); syncInfoBtn(); }

function buildGlossary(){
  const el=document.getElementById('gloss');
  const gl=(LANG==='sk' && typeof LANG_SK!=='undefined' && (SYS==='sol'?LANG_SK.glossarySol:LANG_SK.glossary))||DS.GLOSSARY;
  el.innerHTML=gl.map(([k,v])=>`<b>${k}</b> — ${v}`).join('<br>');
}

function onResize(){
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}

/* ---- entry: first-visit shows the system chooser; returning visitors load
   straight into their saved system. The ⇄ toolbar button reopens the chooser. ---- */
let _built=false;
function initApp(){
  let saved=null; try{ saved=localStorage.getItem('ra-system'); }catch(_){}
  if(saved==='ra' || saved==='sol'){ applySystem(saved); build(); _built=true; }
  else showChooser();
}
function showChooser(){
  const ch=document.getElementById('chooser'); if(!ch){ applySystem('ra'); build(); _built=true; return; }
  // localize the chooser to the saved language before it's shown
  let lang='en'; try{ if(localStorage.getItem('ra-lang')==='sk') lang='sk'; }catch(_){}
  const L=(lang==='sk' && typeof LANG_SK!=='undefined') ? LANG_SK.ui : UI_EN;
  const setTxt=(id,k)=>{ const el=document.getElementById(id); if(el && L[k]!=null) el.innerHTML=L[k]; };
  setTxt('chooser-title','choose-title'); setTxt('choose-ra-h','choose-ra'); setTxt('choose-ra-sub','choose-ra-sub');
  setTxt('choose-sol-h','choose-sol'); setTxt('choose-sol-sub','choose-sol-sub');
  ch.querySelector('[data-sys="ra"]').onclick=()=>pickSystem('ra');
  ch.querySelector('[data-sys="sol"]').onclick=()=>pickSystem('sol');
  ch.style.display='flex'; ch.style.opacity='1';
}
function pickSystem(sys){
  try{ localStorage.setItem('ra-system', sys); }catch(_){}
  if(_built){ location.hash=''; location.reload(); return; }   // mid-session change → clean rebuild
  const ch=document.getElementById('chooser');
  if(ch){ ch.style.opacity='0'; setTimeout(()=>{ ch.style.display='none'; },500); }
  applySystem(sys); build(); _built=true;
}

/* go */
window.addEventListener('DOMContentLoaded', initApp);
