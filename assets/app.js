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

const TXW=1024, TXH=512;
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
  const w=TXW,h=TXH,c=newCanvas(w,h),ctx=c.getContext('2d');
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
   Three.js scene
   ============================================================ */
const APP = {};
let scene,camera,renderer,controls,clock;
let playing=true, timeScale=1.0, sizeMult=1.0, showOrbits=true, showLabels=true, showTails=true;
let elapsedYears=0, _clockT=0;    // accumulated sim-time + throttle timer for the clock readout
let USE_VERBATIM = !!window.USE_VERBATIM;   // true = show only the author's own text
const bodies=[];           // every animated body
const pickables=[];        // meshes for raycasting
let selected=null;

// --- impact lab state (💥 button; module lives before the Animation section) ---
let impacting=false, impWeapon='asteroid', impDiaKm=10, impSpdKms=30, impRho=3000, impPowW=1e18;

// --- free-roam flight state ---
let flying=false, flyModel='flycam', flyAutoSpeed=true, throttleFrac=0, throttleKms=0, autoOrient=false, flyThrust=0;
const flyVel=new THREE.Vector3();              // current velocity (scene units/s), shared by all models
const flyEuler=new THREE.Euler(0,0,0,'YXZ');   // look orientation: y=yaw, x=pitch, z=roll
let flyTarget=null, flyFollow=null, flyGoto=null;
const _flyPrevTarget=new THREE.Vector3();
const flyKeys={};

const labelLayer=document.getElementById('labels');

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
  let mat, emap=null;
  let tex;
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
  const map=new THREE.CanvasTexture(tex); map.anisotropy=4;
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
    new THREE.TextureLoader().load(
      'assets/img/textures/'+data.key+'.webp',
      function(t){
        t.anisotropy=4; t.wrapS=map.wrapS; t.wrapT=map.wrapT;
        if(map.encoding!==undefined) t.encoding=map.encoding;
        mat.map=t; mat.needsUpdate=true;
        // the AI lava map already reads hot — ease the procedural emissive glow
        if(data.kind==='lava' && mat.emissiveIntensity!==undefined) mat.emissiveIntensity*=0.55;
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

function build(){
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
  controls.minDistance=realScale?0.004:0.8; controls.maxDistance=40000;   // real mode: fly right up to a world
  controls.zoomSpeed=2.4;                  // wheel zooms further per notch
  controls.target.set(0,0,0);

  clock=new THREE.Clock();

  // lights
  scene.add(new THREE.AmbientLight(0x4a5a7a, aiTex?0.6:0.85));
  sunLight=new THREE.PointLight(0xfff3e0, aiTex?1.9:2.4, 0, 0.0);  // no attenuation -> all worlds lit
  scene.add(sunLight);

  buildStarfield();

  // ---- Ra ---- (star visuals live in starGroup so they can be scaled per mode)
  sunHolder=new THREE.Object3D(); scene.add(sunHolder);
  starGroup=new THREE.Object3D(); sunHolder.add(starGroup);
  sunMesh=buildBodyMesh(STAR, STAR_R_COMPRESS); starGroup.add(sunMesh); pickables.push(sunMesh);
  addStarGlow(starGroup, STAR_R_COMPRESS, '#fffaf0', '#ffdf9a', 5.4);
  bodies.push({data:STAR, holder:sunHolder, mesh:sunMesh, orbitLine:null, radius:STAR_R_COMPRESS,
    aDisp:0, e:0, q:new THREE.Quaternion(), period:1, M:0, spin:0.35/STAR.rotationPeriod,
    parentHolder:scene, helio:false});

  // ---- planets ----
  for(const p of PLANETS){
    addBody(p, sunHolder, { aDisp:distDisp(p.dist), incl:inclFor(p.key), node:nodeFor(p.key), orbitOpacity:0.34 });
  }
  // ---- moons of planets ----
  for(const m of MOONS){
    const parent=bodies.find(b=>b.data.key===m.parent);
    if(!parent) continue;
    addMoon(m, parent);
  }

  // ---- Horus + its moons ----
  horusRec=addBody(HORUS, sunHolder, { aDisp:distDisp(HORUS.dist), incl:inclFor('horus'), node:nodeFor('horus'),
                    radius:sizeDisp(HORUS.radiusKm), orbitOpacity:0.28 });
  horusHolder=horusRec.holder;
  addStarGlow(horusRec.mesh, horusRec.radius, '#ff7a44', '#7a1c08', 2.4);  // glow scales with mesh
  const hLight=new THREE.PointLight(0xff5a2a, aiTex?0.55:0.9, horusRec.radius*70, 1.2);
  horusRec.mesh.add(hLight);
  for(const m of HORUS_MOONS){ addMoon(m, horusRec); }

  // evaporation tails (bodies flagged evapTail in data.js — planets and moons)
  for(const rec of bodies) if(rec.data.evapTail) makeEvapTail(rec);

  buildNav(); buildGlossary();
  window.addEventListener('resize', onResize);
  setupInteraction();

  applyScaleMode();   // sets star size, body sizes, orbit radii for the current mode
  frameSystem();      // place the camera for the current mode

  // hide loader
  setTimeout(()=>{ const l=document.getElementById('loader'); l.style.opacity=0;
    setTimeout(()=>l.style.display='none',800); }, 150);

  // optional deep-link: index.html#satis focuses a body on load
  const hk=(location.hash||'').replace('#','').toLowerCase();
  if(hk && bodies.some(b=>b.data.key===hk)) setTimeout(()=>focusBody(hk,true), 400);
  window.addEventListener('hashchange',()=>{ const k=location.hash.replace('#','').toLowerCase();
    if(bodies.some(b=>b.data.key===k)) focusBody(k,true); });

  animate();
}

function addMoon(m, parentRec){
  // per-subsystem display distance
  const sysMoons = (parentRec.data.key==='horus')?HORUS_MOONS:MOONS.filter(x=>x.parent===parentRec.data.key);
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
    rec.mesh.scale.setScalar(sizeMult*bodyF()); }
}
function applyScaleMode(){
  starGroup.scale.setScalar(starVisR()/STAR_R_COMPRESS);
  for(const rec of bodies){
    if(rec.helio){ rec.aDisp=distDisp(rec.data.dist); rebuildOrbitLine(rec); }
    else if(rec.isMoon){ rec.aDisp = realScale?rec.aDispReal:rec.aDispCompressed; rebuildOrbitLine(rec); }
  }
  applySizes();
  controls.maxDistance = realScale?20000:4000;
  controls.minDistance = realScale?0.004:0.8;
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
  if(b){ b.classList.toggle('on', realScale); b.innerHTML = realScale?'📏 Real scale':'📐 Compressed'; }
}
function updateTextUI(){
  const b=document.getElementById('t-text');
  if(b){ b.classList.toggle('on', USE_VERBATIM);
    b.innerHTML = USE_VERBATIM ? "📖 Author's text" : "📖 Summary + source"; }
}
function setScaleMode(real){
  if(!real && flying) exitFly();     // Compressed is the overview map — leave free-roam
  realScale=real;
  applyScaleMode();
  frameSystem();
}

function addStarGlow(holder, r, inner, outer, scale){
  // depthTest:true so planets in front of the star occlude its glow (no see-through wash)
  const c=texGlow(rgbaStr(inner,1), rgbaStr(outer,0.55));
  const map=new THREE.CanvasTexture(c);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map, color:0xffffff, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true}));
  sp.scale.set(r*scale, r*scale, 1);
  holder.add(sp);
  // soft inner corona
  const c2=texGlow(rgbaStr(inner,0.9), rgbaStr(inner,0.0));
  const sp2=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c2), transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true}));
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
  scene.add(new THREE.Points(g,m));
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

function makeEvapTail(rec){
  // per-body config: evapTail:true = Amunet-strength defaults; or {alpha,rate,len} to soften.
  // data.tail (hex) tints the plume — e.g. Sekhmet's sulfur-orange.
  const cfg=(typeof rec.data.evapTail==='object')?rec.data.evapTail:{};
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

function updateEvapTails(simDt){   // simDt = sim-years advanced this frame (0 while paused)
  if(!showTails) return;
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
      const dispR=rec.radius*rec.mesh.scale.x;             // current on-screen radius
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
      for(let k=0;k<n;k++){
        const i=t.head; t.head=(t.head+1)%EVAP_N;
        const f=(k+1)/n;
        // planet position at this sub-step (same Kepler math as positionBody)
        const M=(t.prevM+dM*f)%(Math.PI*2);
        const E=kepler(M,rec.e), a=rec.aDisp, b=a*Math.sqrt(1-rec.e*rec.e);
        _evP.set(a*(Math.cos(E)-rec.e),0,b*Math.sin(E)).applyQuaternion(rec.q).add(bp);
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
   remnant. Ra and Horus are immune (flare visual only).
   ============================================================ */
const IMP_CHICXULUB_J=4.2e23, IMP_MT_TNT_J=4.184e15, IMP_G=6.674e-11;
const IMP_MATS=[['🧊 Ice',920],['🪨 Rock',3000],['⛓ Iron',7870]];
const impDensityByKind={ star:1400, browndwarf:8e4, gasgiant:1300, terran:5200, rocky:4500,
                         lava:4800, ocean:3500, iceworld:2000, icemoon:1900 };
let impMatI=1;
const impAsteroids=[], impFx=[], impScarred=[];
let impBeam=null, impShake=0, impPool=null, impPoolActiveT=0;
let _impFlashTex=null, _impRingTex=null;
const impRC=new THREE.Raycaster();
const _impV1=new THREE.Vector3(), _impV2=new THREE.Vector3(), _impV3=new THREE.Vector3();

function impBodyMassKg(rec){ const R=(rec.data.radiusKm||1000)*1000;
  return (impDensityByKind[rec.data.kind]||3500)*(4/3)*Math.PI*R*R*R; }
function impBindingJ(rec){ const R=(rec.data.radiusKm||1000)*1000, M=impBodyMassKg(rec);
  return 3*IMP_G*M*M/(5*R); }
function impImmune(rec){ return rec.data.kind==='star'||rec.data.kind==='browndwarf'; }
function impKE(){ return 0.5*impRho*(Math.PI/6)*Math.pow(impDiaKm*1000,3)*Math.pow(impSpdKms*1000,2); }

/* Three's SphereGeometry: phi=u·2π, theta=(1−uv.y)·π (see its source) —
   lets us convert a raycast uv to the exact point on the (spinning) mesh. */
function uvToLocal(rec, u, v, out){
  const phi=u*Math.PI*2, theta=(1-v)*Math.PI, st=Math.sin(theta);
  return out.set(-Math.cos(phi)*st, Math.cos(theta), Math.sin(phi)*st).multiplyScalar(rec.radius);
}
function uvToWorld(rec, u, v){ return rec.mesh.localToWorld(uvToLocal(rec,u,v,new THREE.Vector3())); }

/* ---- persistent scars: two canvas-textured overlay spheres per body (lazy).
   Children of rec.mesh, so they inherit spin and the per-frame size scaling
   (same pattern as the atmospheres). char = permanent dark marks; glow =
   additive heat that cools via destination-out fades. ---- */
function getScars(rec){
  if(rec.scar) return rec.scar;
  const charC=newCanvas(1024,512), glowC=newCanvas(1024,512);
  const charT=new THREE.CanvasTexture(charC), glowT=new THREE.CanvasTexture(glowC);
  const mC=new THREE.Mesh(new THREE.SphereGeometry(rec.radius*1.004,64,48),
    new THREE.MeshBasicMaterial({map:charT,transparent:true,depthWrite:false}));
  const mG=new THREE.Mesh(new THREE.SphereGeometry(rec.radius*1.008,64,48),
    new THREE.MeshBasicMaterial({map:glowT,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  mC.renderOrder=1; mG.renderOrder=2;
  rec.mesh.add(mC); rec.mesh.add(mG);
  rec.scar={charC,glowC,charT,glowT,mC,mG,coolT:0,hot:0};
  rec.dmgJ=rec.dmgJ||0;
  impScarred.push(rec);
  return rec.scar;
}
const IMP_CHAR=[[0,'rgba(10,6,5,0.88)'],[0.5,'rgba(14,9,7,0.60)'],[0.8,'rgba(22,13,9,0.28)'],[1,'rgba(22,13,9,0)']];
const IMP_CHAR_SOFT=[[0,'rgba(10,6,5,0.16)'],[0.7,'rgba(14,9,7,0.08)'],[1,'rgba(14,9,7,0)']];
const IMP_GLOW=[[0,'rgba(255,244,214,0.95)'],[0.3,'rgba(255,150,60,0.75)'],[0.7,'rgba(190,45,12,0.35)'],[1,'rgba(190,45,12,0)']];
const IMP_GLOW_SOFT=[[0,'rgba(255,220,150,0.50)'],[0.6,'rgba(255,120,45,0.22)'],[1,'rgba(255,120,45,0)']];
/* splat at canvas-space (u,v): longitude-stretched near the poles, drawn
   thrice (u−1,u,u+1) so it wraps the 0°/360° seam */
function impSplat(ctx, u, v, rPx, style){
  const W=1024,H=512, stretch=1/Math.max(Math.sin(v*Math.PI),0.20), rx=rPx*stretch;
  for(const du of [-1,0,1]){
    const cx=(u+du)*W, cy=v*H;
    if(cx+rx<0||cx-rx>W) continue;
    ctx.save(); ctx.translate(cx,cy); ctx.scale(rx/rPx,1);
    const g=ctx.createRadialGradient(0,0,0,0,0,rPx);
    for(const s of style) g.addColorStop(s[0],s[1]);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,rPx,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function impFlashTexture(){ if(!_impFlashTex) _impFlashTex=new THREE.CanvasTexture(
  texGlow('rgba(255,250,232,1)','rgba(255,160,60,0.55)')); return _impFlashTex; }
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
  const sc=R*(0.9+0.6*Math.min(4, Math.max(0,Math.log10(Math.max(1,E/IMP_CHICXULUB_J)))+1));
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:impFlashTexture(),transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  sp.position.copy(wp); scene.add(sp);
  impFx.push({o:sp,t:0,T:0.7,kind:'flash',sc});
}
function spawnShock(wp, R, E){
  const sc=R*(1.1+0.5*Math.min(4, Math.max(0,Math.log10(Math.max(1,E/IMP_CHICXULUB_J)))+1));
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:impRingTexture(),transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  sp.position.copy(wp); scene.add(sp);
  impFx.push({o:sp,t:0,T:1.2,kind:'shock',sc});
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

/* ---- the strike itself: flash + shockwave + ejecta + painted crater + damage ---- */
function applyStrike(rec, u, v, E){
  const wp=uvToWorld(rec,u,v);
  const R=rec.radius*rec.mesh.scale.x;
  const normal=_impV1.copy(wp).sub(worldPosOf(rec)).normalize().clone();
  const fxP=wp.clone().addScaledVector(normal,R*0.04);
  spawnFlash(fxP,R,E); spawnShock(fxP,R,E);
  if(!impImmune(rec) && !rec.destroyed){
    emitBurst(fxP, Math.min(500, 120+Math.round(60*Math.log10(Math.max(1,E/1e21)))),
      impConeDir(normal,0.75), R*1.1, R*0.11, 1.9);
    const s=getScars(rec);
    const th=Math.min(55, Math.max(1.2, 3*Math.cbrt(E/IMP_CHICXULUB_J)));   // angular radius, deg
    const rPx=th/180*512;
    const gasy=(rec.data.kind==='gasgiant');
    if(!gasy) impSplat(s.charC.getContext('2d'), u, 1-v, rPx, IMP_CHAR);
    impSplat(s.glowC.getContext('2d'), u, 1-v, rPx*(gasy?1.7:1.15), IMP_GLOW);
    s.charT.needsUpdate=true; s.glowT.needsUpdate=true; s.hot=7;
    rec.dmgJ=(rec.dmgJ||0)+E;
    if(rec.dmgJ>=impBindingJ(rec) && !rec.shattered) shatterBody(rec);
  }
  const dist=camera.position.distanceTo(wp);
  const ref=camera.position.distanceTo(controls.target)+1e-6;
  impShake=Math.min(0.045, impShake+0.008*Math.max(0,Math.log10(Math.max(1,E/IMP_CHICXULUB_J))+1)*Math.max(0,1-dist/(ref*4)));
}

/* crust shattered: the world actually comes apart. The planet mesh is hidden
   and replaced (in place, still on its orbit) by a debris field — tumbling
   rock chunks drifting apart plus a hot dust haze that expands and fades.
   The info panel switches to "A debris field." until 🧽 Heal resurrects it. */
const debrisFields=[];
function shatterBody(rec){
  rec.shattered=true; rec.destroyed=true;
  const wp=worldPosOf(rec), R=rec.radius*rec.mesh.scale.x;
  spawnFlash(wp,R*2.6,impBindingJ(rec));
  spawnShock(wp,R*2.0,impBindingJ(rec));
  emitBurst(wp, 800, function(){ return _impV3.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize().clone(); },
    R*1.8, R*0.15, 2.8);
  // hide the world + everything stuck to it (atmosphere, scar overlays)
  for(const ch of rec.mesh.children) ch.visible=false;
  rec.mesh.material.visible=false;      // mesh object stays: keeps orbiting, pickable, scalable
  makeDebrisField(rec);
  const el=labelEls[rec.data.key]; if(el) el.textContent=rec.data.name+' ☠';
  if(APP.currentData && APP.currentData.key===rec.data.key &&
     document.getElementById('info').classList.contains('open')) openInfo(rec.data);
  impShake=Math.min(0.06, impShake+0.03);
}

function makeDebrisField(rec){
  const group=new THREE.Object3D();
  rec.mesh.add(group);                  // inherits spin + the per-frame dot-floor scaling
  const R=rec.radius;                   // mesh-local units
  const base=new THREE.Color(rec.data.color||0x9a8877);
  const chunkMat=new THREE.MeshStandardMaterial({color:base.multiplyScalar(0.8),
    roughness:0.95, emissive:0xff6a30, emissiveIntensity:0.6});
  const geos=[];
  for(let gi=0; gi<3; gi++){            // three jittered rock shapes, reused
    const g=new THREE.SphereGeometry(1,7,5), pa=g.attributes.position;
    for(let i=0;i<pa.count;i++){ const f=0.62+Math.random()*0.7;
      pa.setXYZ(i, pa.getX(i)*f, pa.getY(i)*f, pa.getZ(i)*f); }
    g.computeVertexNormals(); geos.push(g);
  }
  const chunks=[];
  for(let i=0;i<46;i++){
    const m=new THREE.Mesh(geos[i%3], chunkMat);
    const dir=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
    m.position.copy(dir).multiplyScalar(R*(0.35+0.6*Math.random()));
    m.scale.setScalar(R*(0.05+0.13*Math.random()));
    m.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    const tang=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).cross(dir).normalize();
    const vel=dir.multiplyScalar(R*(0.02+0.05*Math.random())).addScaledVector(tang,R*0.015*Math.random());
    chunks.push({m,vel,rot:new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1)});
    group.add(m);
  }
  // hot dust haze: additive glow points that expand outward and fade away
  const HN=700, hp=new Float32Array(HN*3);
  for(let i=0;i<HN;i++){
    const d=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize()
      .multiplyScalar(R*(0.5+1.0*Math.random()));
    hp[i*3]=d.x; hp[i*3+1]=d.y; hp[i*3+2]=d.z;
  }
  const hg=new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp,3).setUsage(THREE.DynamicDrawUsage));
  // NB: PointsMaterial.size is WORLD units — it ignores the mesh's per-frame
  // dot-floor scaling, so the update loop re-syncs it to mesh.scale each frame.
  const hazeMat=new THREE.PointsMaterial({map:new THREE.CanvasTexture(texGlow('rgba(255,225,190,0.85)','rgba(160,110,75,0.28)')),
    color:0xffd9b0, size:R*0.35*rec.mesh.scale.x, sizeAttenuation:true, transparent:true, opacity:0.55,
    blending:THREE.AdditiveBlending, depthWrite:false});
  const haze=new THREE.Points(hg,hazeMat); haze.frustumCulled=false;
  group.add(haze);
  debrisFields.push({rec,group,chunks,chunkMat,geos,haze,hazeMat,t:0});
}

function removeDebrisField(rec){
  for(let i=debrisFields.length-1;i>=0;i--){
    const D=debrisFields[i]; if(D.rec!==rec) continue;
    rec.mesh.remove(D.group);
    for(const g of D.geos) g.dispose();
    D.chunkMat.dispose();
    if(D.haze){ D.haze.geometry.dispose(); D.hazeMat.map.dispose(); D.hazeMat.dispose(); }
    debrisFields.splice(i,1);
  }
  rec.mesh.material.visible=true;
  for(const ch of rec.mesh.children) ch.visible=true;
  rec.destroyed=false;
  const el=labelEls[rec.data.key]; if(el) el.textContent=rec.data.name;
}

function impHeal(){
  for(const rec of impScarred){
    const s=rec.scar;
    s.charC.getContext('2d').clearRect(0,0,1024,512);
    s.glowC.getContext('2d').clearRect(0,0,1024,512);
    s.charT.needsUpdate=true; s.glowT.needsUpdate=true;
    rec.dmgJ=0; rec.shattered=false;
    if(rec.destroyed) removeDebrisField(rec);   // resurrect the world
  }
  for(const t of evapTails) t.points.visible=showTails;
  if(APP.currentData && document.getElementById('info').classList.contains('open'))
    openInfo(APP.currentData);
}

/* ---- asteroid projectiles: jittered rock + glow, homing at the chosen surface point ---- */
function launchAsteroid(rec, hit){
  const u=hit.uv?hit.uv.x:0.5, v=hit.uv?hit.uv.y:0.5;
  const E=impKE();
  const tgtR=rec.radius*rec.mesh.scale.x;
  const size=Math.max(tgtR*0.05, Math.min(tgtR*0.45, tgtR*0.45*Math.cbrt(impDiaKm/1000)));
  const geo=new THREE.SphereGeometry(1,10,7);
  const pa=geo.attributes.position;
  for(let i=0;i<pa.count;i++){ const f=0.72+Math.random()*0.5;
    pa.setXYZ(i, pa.getX(i)*f, pa.getY(i)*f, pa.getZ(i)*f); }
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:0x8a7767,roughness:0.95,emissive:0x1c0e06}));
  mesh.scale.setScalar(size);
  const glowMap=new THREE.CanvasTexture(texGlow('rgba(255,190,120,0.9)','rgba(255,110,40,0.32)'));
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  sp.scale.setScalar(5); mesh.add(sp);
  const spMat=sp.material;
  scene.add(mesh);
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
  impAsteroids.push({rec,u,v,mesh,glowMap,spMat,start,t:0,T,E,
    spin:new THREE.Vector3(Math.random()*4-2,Math.random()*4-2,Math.random()*4-2)});
}

/* ---- laser: frozen world-space ray; the body orbits/rotates through it ---- */
function startBeam(rec, e){
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
  impBeam={rec, origin:impRC.ray.origin.clone(), dir:impRC.ray.direction.clone(),
    core, sheath, hitGlow, missT:0, sparkT:0, firedJ:0};
  controls.enabled=false;
}
function stopBeam(){
  if(!impBeam) return;
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
  // asteroids (iterate backwards: strikes splice)
  for(let i=impAsteroids.length-1;i>=0;i--){
    const a=impAsteroids[i];
    a.t+=dt;
    const tgt=uvToWorld(a.rec,a.u,a.v);
    const k=a.t/a.T;
    if(k>=1){
      applyStrike(a.rec,a.u,a.v,a.E);
      scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose();
      a.spMat.dispose(); a.glowMap.dispose();
      impAsteroids.splice(i,1); continue;
    }
    const e=k*k*(3-2*k);
    a.mesh.position.lerpVectors(a.start,tgt,e);
    a.mesh.rotation.x+=a.spin.x*dt; a.mesh.rotation.y+=a.spin.y*dt; a.mesh.rotation.z+=a.spin.z*dt;
  }
  // laser
  if(impBeam){
    impRC.ray.origin.copy(impBeam.origin); impRC.ray.direction.copy(impBeam.dir);
    const hits=impRC.intersectObject(impBeam.rec.mesh,false);
    if(hits.length){
      impBeam.missT=0;
      const hit=hits[0], EJ=impPowW*dt;
      impBeam.firedJ+=EJ;
      const rec=impBeam.rec, R=rec.radius*rec.mesh.scale.x;
      if(!impImmune(rec) && !rec.destroyed){
        const s=getScars(rec);
        const th=Math.min(20, Math.max(0.5, 1.2*Math.cbrt(impPowW/1e18)));
        const rPx=th/180*512;
        const gasy=(rec.data.kind==='gasgiant');
        if(hit.uv){
          if(!gasy) impSplat(s.charC.getContext('2d'), hit.uv.x, 1-hit.uv.y, rPx*0.55, IMP_CHAR_SOFT);
          impSplat(s.glowC.getContext('2d'), hit.uv.x, 1-hit.uv.y, rPx, IMP_GLOW_SOFT);
          s.charT.needsUpdate=true; s.glowT.needsUpdate=true; s.hot=7;
        }
        rec.dmgJ=(rec.dmgJ||0)+EJ;
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
      if(impBeam.missT>0.4) stopBeam();
    }
  }
  // one-shot fx sprites
  for(let i=impFx.length-1;i>=0;i--){
    const f=impFx[i]; f.t+=dt;
    const k=f.t/f.T;
    if(k>=1){ scene.remove(f.o); f.o.material.dispose(); impFx.splice(i,1); continue; }
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
  // debris fields: chunks drift apart and tumble; the dust haze expands and fades
  for(const D of debrisFields){
    D.t+=dt;
    for(const c of D.chunks){
      c.m.position.addScaledVector(c.vel,dt);
      c.m.rotation.x+=c.rot.x*dt; c.m.rotation.y+=c.rot.y*dt; c.m.rotation.z+=c.rot.z*dt;
    }
    D.chunkMat.emissiveIntensity=0.08+0.55*Math.exp(-D.t/30);   // embers cool
    if(D.haze){
      const fade=1/(1+D.t/40);
      if(fade<0.05){ D.group.remove(D.haze); D.haze.geometry.dispose();
        D.hazeMat.map.dispose(); D.hazeMat.dispose(); D.haze=null; }
      else{
        D.hazeMat.opacity=0.55*fade;
        D.hazeMat.size=D.rec.radius*0.35*D.rec.mesh.scale.x;   // track the dot-floor scaling
        const hp=D.haze.geometry.attributes.position, k=1+dt*0.05;   // slow expansion
        for(let i=0;i<hp.count;i++) hp.setXYZ(i, hp.getX(i)*k, hp.getY(i)*k, hp.getZ(i)*k);
        hp.needsUpdate=true;
      }
    }
  }
  // heat glow cools (shattered worlds are gone); batched, and only while hot —
  // once faded, no more full-canvas ops or texture re-uploads
  for(const rec of impScarred){
    if(rec.shattered || rec.scar.hot<=0) continue;
    const s=rec.scar; s.coolT+=dt; s.hot-=dt;
    if(s.coolT>0.12){
      const g=s.glowC.getContext('2d');
      g.save(); g.globalCompositeOperation='destination-out';
      g.globalAlpha=Math.min(0.9,0.28*s.coolT); g.fillRect(0,0,1024,512); g.restore();
      s.glowT.needsUpdate=true; s.coolT=0;
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
  impacting=true;
  document.getElementById('implab').classList.add('on');
  const b=document.getElementById('t-impact'); if(b) b.classList.add('on');
  updateImpactUI();
}
function exitImpact(){
  impacting=false; stopBeam();
  document.getElementById('implab').classList.remove('on');
  const b=document.getElementById('t-impact'); if(b) b.classList.remove('on');
  renderer.domElement.style.cursor='grab';
}
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
  impDiaKm=0.1*Math.pow(10,(+dia.value)/25);                 // 0.1 – 1,000 km, log
  impSpdKms=11*Math.pow(30000/11,(+spd.value)/100);          // 11 – 30,000 km/s, log
  impPowW=1e12*Math.pow(10,(+pow.value)*0.18);               // 1e12 – 1e30 W, log
  impRho=IMP_MATS[impMatI][1];
  document.getElementById('imp-dia-v').textContent = impDiaKm<10?(+impDiaKm.toPrecision(2)+' km'):(Math.round(impDiaKm).toLocaleString()+' km');
  document.getElementById('imp-spd-v').textContent = impSpdKms<100?(+impSpdKms.toPrecision(2)+' km/s'):(Math.round(impSpdKms).toLocaleString()+' km/s');
  document.getElementById('imp-pow-v').textContent = fmtW(impPowW);
  document.getElementById('imp-mat').textContent = IMP_MATS[impMatI][0];
  document.getElementById('imp-mass').textContent = fmtKg(impRho*(Math.PI/6)*Math.pow(impDiaKm*1000,3));
  document.querySelectorAll('#implab .imp-a').forEach(el=>{ el.style.display=impWeapon==='asteroid'?'flex':'none'; });
  document.querySelectorAll('#implab .imp-l').forEach(el=>{ el.style.display=impWeapon==='laser'?'flex':'none'; });
  const wb=document.getElementById('imp-weapon');
  if(wb) wb.textContent = impWeapon==='asteroid'?'☄ Asteroid':'🔆 Laser';
  const en=document.getElementById('imp-energy');
  if(en) en.textContent = impWeapon==='asteroid' ? ('💣 '+fmtBigJ(impKE())) : ('🔥 '+fmtBigJ(impPowW)+' / s');
  const hint=document.getElementById('imp-hint');
  if(hint) hint.textContent = impWeapon==='asteroid'
    ? 'Click a world to strike it · scars persist · enough total energy shatters a crust'
    : 'Press & hold on a world to fire · it rotates under your beam · release to stop';
}

/* ============================================================
   Animation
   ============================================================ */
let follow=null;            // body rec being followed
const tween={active:false,t:0,fromCam:new THREE.Vector3(),fromTarget:new THREE.Vector3(),dist:0,body:null};

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);

  if(playing){
    for(const rec of bodies){
      if(rec.aDisp>0){ rec.M += (Math.PI*2/rec.period)*YEARS_PER_SEC*timeScale*dt; positionBody(rec); }
      rec.mesh.rotation.y += rec.spin*dt*timeScale*SPIN_GAIN;   // rotation slows/freezes with the time rate
    }
    elapsedYears += YEARS_PER_SEC*timeScale*dt;          // real sim-time elapsed
    _clockT += dt; if(_clockT>=0.25){ _clockT=0; updateClock(); }
  }
  updateEvapTails(playing ? YEARS_PER_SEC*timeScale*dt : 0);
  updateImpacts(dt);                          // wall-clock: strikes land even while paused

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
    rec.mesh.getWorldPosition(_szPos);
    const d = camera.position.distanceTo(_szPos);
    const target = Math.max(realRadiusScene(rec.data.radiusKm)*sizeMult, d*f);   // max(real, dot-floor)
    if(rec.data.kind==='star') starGroup.scale.setScalar(target/STAR_R_COMPRESS);
    else rec.mesh.scale.setScalar(target/rec.radius);
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
    if(labelEls[rec.data.key]) continue;
    const el=document.createElement('div');
    el.className='lbl '+(rec.data.parent==='ra'||rec.data.kind==='star'?'major':'');
    if(rec.data.kind==='star') el.className='lbl star';
    el.textContent=rec.data.name;
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
    // declutter: hide minor moons when far
    const minor = !(rec.data.parent==='ra'||rec.data.kind==='star');
    let show = onscreen;
    if(minor && dist>(realScale?1100:620)) show=false;
    if(!show){ el.style.display='none'; continue; }
    el.style.display='block';
    const x=(c2.x*0.5+0.5)*innerWidth, y=(-c2.y*0.5+0.5)*innerHeight;
    el.style.left=x+'px'; el.style.top=y+'px';
    el.style.opacity = minor ? Math.max(0.25, 1-(dist-120)/600) : 0.95;
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
    if(!flying && impacting && impWeapon==='laser'){                     // press-and-hold on a world = burn
      const h=pickHit(e);
      if(h){ const rec=bodies.find(b=>b.data.key===h.object.userData.bodyKey); if(rec) startBeam(rec,e); }
    }
    document.getElementById('nav').classList.remove('open');});
  dom.addEventListener('pointermove',e=>{
    if(Math.abs(e.clientX-downX)>4||Math.abs(e.clientY-downY)>4) moved=true;
    if(flying){ if(pdown) flyLook(e.clientX-lastX, e.clientY-lastY); lastX=e.clientX; lastY=e.clientY; }
    else hover(e);
  });
  dom.addEventListener('pointerup',e=>{ pdown=false;
    if(impBeam){ stopBeam(); return; }         // release = stop the burn (don't also focus/fire)
    if(moved) return;
    if(flying){ setFlyTarget(pickNear(e)); }   // tap a world (tiny dots too) to target it
    else if(impacting){                        // impact mode: a click strikes instead of focusing
      if(impWeapon==='asteroid'){
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
  document.getElementById('t-orbits').onclick=function(){ showOrbits=!showOrbits; this.classList.toggle('on',showOrbits);
    for(const b of bodies) if(b.orbitLine) b.orbitLine.visible=showOrbits; };
  document.getElementById('t-labels').onclick=function(){ showLabels=!showLabels; this.classList.toggle('on',showLabels);
    labelLayer.style.display=showLabels?'block':'none'; };
  document.getElementById('reset').onclick=resetView;
  document.getElementById('close').onclick=closeInfo;
  document.getElementById('helpbtn').onclick=()=>document.getElementById('help').classList.toggle('open');
  const navbtn=document.getElementById('navbtn');
  if(navbtn) navbtn.onclick=()=>document.getElementById('nav').classList.toggle('open');

  // --- impact lab controls ---
  const impBtn=document.getElementById('t-impact'); if(impBtn) impBtn.onclick=toggleImpact;
  const impW=document.getElementById('imp-weapon');
  if(impW) impW.onclick=()=>{ impWeapon=impWeapon==='asteroid'?'laser':'asteroid'; stopBeam(); updateImpactUI(); };
  const impM=document.getElementById('imp-mat');
  if(impM) impM.onclick=()=>{ impMatI=(impMatI+1)%IMP_MATS.length; updateImpactUI(); };
  for(const id of ['imp-dia','imp-spd','imp-pow']){
    const el=document.getElementById(id); if(el) el.oninput=updateImpactUI;
  }
  const impH=document.getElementById('imp-heal'); if(impH) impH.onclick=impHeal;
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
function hover(e){
  const k=pick(e);
  renderer.domElement.style.cursor = impacting ? 'crosshair' : (k?'pointer':'grab');
  if(k){ const rec=bodies.find(b=>b.data.key===k);
    let txt=rec.data.name;
    if(impacting && rec){
      if(impImmune(rec)) txt+=' · immune to your weapons';
      else if(rec.destroyed) txt+=' · ☠ destroyed — a debris field';
      else{
        const E=impWeapon==='asteroid'?impKE():impPowW;
        const pct=E/impBindingJ(rec)*100;
        const lbl=impWeapon==='asteroid'?'strike':'beam/s';
        txt+=' · '+lbl+' ≈ '+(pct>=100?'≥100% of binding ☠':(pct<0.01?'<0.01%':(+pct.toPrecision(2))+'%')+' of binding');
      }
    }
    tip.textContent=txt; tip.style.left=e.clientX+'px'; tip.style.top=e.clientY+'px'; tip.style.opacity=1;
  } else tip.style.opacity=0;
}

function togglePlay(){ playing=!playing; document.getElementById('play').innerHTML=playing?'⏸ Pause':'▶ Play'; }
function setSpeed(v){ // 0..100 -> real time-rate (sim years advanced per real second), logarithmic
  const yps = Math.exp( Math.log(RATE_MIN_YPS) + (Math.log(RATE_MAX_YPS)-Math.log(RATE_MIN_YPS))*(v/100) );
  timeScale = yps / YEARS_PER_SEC;          // motion advances exactly `yps` sim-years per real second
  document.getElementById('speedval').textContent = fmtRate(yps);
}
/* speed readout in real time units: "real-time", "45 s/s", "12 min/s", "6 hr/s", "3 days/s", "2 mo/s", "1.4 yr/s" */
function fmtRate(yps){
  const s = yps*SEC_PER_YEAR;               // sim seconds advanced per real second
  if(s>0.7 && s<1.5) return 'real-time';
  if(yps>=1)            return (yps<10?yps.toFixed(2):yps.toFixed(0))+' yr/s';
  const mo=yps*12;     if(mo>=1) return mo.toFixed(1)+' mo/s';
  const d=yps*365.25;  if(d>=1)  return (d<10?d.toFixed(1):d.toFixed(0))+' days/s';
  const h=d*24;        if(h>=1)  return (h<10?h.toFixed(1):h.toFixed(0))+' hr/s';
  const mi=h*60;       if(mi>=1) return mi.toFixed(0)+' min/s';
  return (mi*60).toFixed(0)+' s/s';
}
function fmtElapsed(yr){
  if(yr>=1)            return (yr<100?yr.toFixed(1):yr.toFixed(0))+' yr';
  const d=yr*365.25;   if(d>=1)  return (d<10?d.toFixed(1):d.toFixed(0))+' days';
  const h=d*24;        if(h>=1)  return h.toFixed(1)+' hr';
  const mi=h*60;       if(mi>=1) return mi.toFixed(0)+' min';
  return (mi*60).toFixed(0)+' s';
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
  if(openPanel!==false) openInfo(rec.data);
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
    if(tg) tg.textContent='◎ '+flyTarget.data.name+' · '+fmtDist(rangeKm);
    _fa.copy(tp).sub(camera.position).normalize();
    const closeKms=flyVel.dot(_fa)*KM_PER_UNIT;
    if(eta) eta.textContent = 'ETA '+(closeKms>1?fmtTime(rangeKm/closeKms):'—');
  } else { if(tg) tg.textContent='◎ no target — tap a world'; if(eta) eta.textContent=''; }
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
  el.innerHTML=`<span class="dot" style="color:${col}"></span><span>${data.name}</span>`+
    (data.life?`<span class="tag" title="harbours life">✦&nbsp;${data.life}</span>`:'');
  el.onclick=()=>focusBody(data.key,true);
  return el;
}
function buildNav(){
  const nav=document.getElementById('nav');
  const h=document.createElement('h3'); h.textContent='Ra System'; nav.appendChild(h);
  nav.appendChild(navItem(STAR));
  for(const p of PLANETS){
    nav.appendChild(navItem(p));
    for(const m of MOONS.filter(x=>x.parent===p.key)) nav.appendChild(navItem(m,true));
  }
  const h2=document.createElement('h3'); h2.textContent='Horus subsystem'; nav.appendChild(h2);
  nav.appendChild(navItem(HORUS));
  for(const m of HORUS_MOONS) nav.appendChild(navItem(m,true));
}
function setActiveNav(key){
  document.querySelectorAll('.navitem').forEach(el=>el.classList.toggle('active', el.dataset.key===key));
}

function typeLabelFor(d){
  if(d.kind==='star') return 'Star';
  if(d.kind==='browndwarf') return 'Brown dwarf';
  if(d.parent && d.parent!=='ra') return 'Moon';
  return 'Planet';
}
function openInfo(d){
  APP.currentData=d;
  // a destroyed world (impact lab) shows its debris-field epitaph instead
  const drec=bodies.find(b=>b.data.key===d.key);
  if(drec && drec.destroyed) return openInfoDestroyed(drec);
  // the author's word-for-word text, where the source document has it
  const verbatim = (typeof DESCRIPTIONS_VERBATIM!=='undefined') ? DESCRIPTIONS_VERBATIM[d.key] : null;
  // author's-text edition shows only the author's words, so hide my own tagline there
  const authorOnly = USE_VERBATIM && !!verbatim;
  document.getElementById('i-type').textContent=typeLabelFor(d);
  document.getElementById('i-name').innerHTML=d.name+(d.alt?`<span>${d.alt}</span>`:'');
  // tagline is my own line — hide it only when showing the author's own words alone
  const tagEl=document.getElementById('i-tag');
  tagEl.textContent = authorOnly ? '' : (d.tagline||'');
  tagEl.style.display = authorOnly ? 'none' : 'block';
  // gallery
  const g=document.getElementById('i-gallery'); g.innerHTML='';
  (d.images||[]).forEach(([file,cap])=>{
    const fig=document.createElement('figure');
    const img=new Image(); img.src='assets/img/'+file; img.alt=cap; img.loading='lazy';
    img.onclick=()=>APP.openLightbox(img.src);
    const fc=document.createElement('figcaption'); fc.textContent=cap;
    fig.appendChild(img); fig.appendChild(fc); g.appendChild(fig);
  });
  // stats
  const t=document.getElementById('i-stats'); t.innerHTML='';
  (d.stats||[]).forEach(([k,v])=>{ const tr=document.createElement('tr');
    tr.innerHTML=`<td>${k}</td><td>${v}</td>`; t.appendChild(tr); });
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
      note.textContent='(No description in the source document yet — summary shown.)';
      ds.appendChild(note);
      addParas(d.desc);
    }
  } else {
    // default edition: my short summary, then the author's verbatim text beneath it
    addParas(d.desc);
    if(verbatim){ addSource("From the source — author's text"); addParas(verbatim); }
  }
  document.getElementById('info').classList.add('open');
}
/* info panel for a world destroyed in the impact lab */
function openInfoDestroyed(rec){
  const d=rec.data;
  document.getElementById('i-type').textContent='Debris field';
  document.getElementById('i-name').innerHTML=d.name+'<span>destroyed</span>';
  const tagEl=document.getElementById('i-tag');
  tagEl.textContent='A debris field.'; tagEl.style.display='block';
  document.getElementById('i-gallery').innerHTML='';
  const t=document.getElementById('i-stats'); t.innerHTML='';
  [['Status','☠ Destroyed'],
   ['Cause','Bombardment (impact lab)'],
   ['Energy absorbed', (rec.dmgJ||0).toExponential(2).replace('e+','e')+' J'],
   ['Binding energy', impBindingJ(rec).toExponential(2).replace('e+','e')+' J']
  ].forEach(([k,v])=>{ const tr=document.createElement('tr');
    tr.innerHTML=`<td>${k}</td><td>${v}</td>`; t.appendChild(tr); });
  const ds=document.getElementById('i-desc'); ds.innerHTML='';
  const p=document.createElement('p');
  p.textContent=d.name+' is gone. Its accumulated bombardment exceeded its gravitational '+
    'binding energy and the world came apart. Where '+d.name+' once was, an expanding cloud of '+
    'shattered crust, mantle fragments and still-cooling ejecta now drifts along the old orbit, '+
    'slowly dissipating into space.';
  ds.appendChild(p);
  const hint=document.createElement('p');
  hint.style.cssText='font-style:italic;color:#8ea2c0;font-size:12px';
  hint.textContent='(🧽 Heal in the impact lab restores the planet.)';
  ds.appendChild(hint);
  document.getElementById('info').classList.add('open');
}

function closeInfo(){ document.getElementById('info').classList.remove('open'); setActiveNav(selected); }

function buildGlossary(){
  const el=document.getElementById('gloss');
  el.innerHTML=GLOSSARY.map(([k,v])=>`<b>${k}</b> — ${v}`).join('<br>');
}

function onResize(){
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}

/* go */
window.addEventListener('DOMContentLoaded', build);
