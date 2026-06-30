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
const DEFAULT_RATE_YPS = 0.0006;          // ≈ 6 hours / second — gentle default motion
const rateToSlider = (yps)=> 100*Math.log(yps/RATE_MIN_YPS)/Math.log(RATE_MAX_YPS/RATE_MIN_YPS);
const DEFAULT_SPEED_V = rateToSlider(DEFAULT_RATE_YPS);
const DEFAULT_SIZE_V  = 100;             // Size slider value for the default body size (sizeMult = 1.0)

let realScale = true;                     // default to REAL scale (per request)

function distDisp(au){ return realScale ? au*AU_UNIT : DIST_K*Math.pow(au, DIST_P); }
function sizeDisp(km){ return Math.max(0.55, SIZE_K*Math.pow(km, SIZE_P)); }
function starVisR(){ return realScale ? STAR_R_REAL : STAR_R_COMPRESS; }
function bodyF(){ return realScale ? 0.5 : 1.0; }   // body-size factor for current mode

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
let playing=true, timeScale=1.0, sizeMult=1.0, showOrbits=true, showLabels=true;
let elapsedYears=0, _clockT=0;    // accumulated sim-time + throttle timer for the clock readout
let USE_VERBATIM = !!window.USE_VERBATIM;   // true = show only the author's own text
const bodies=[];           // every animated body
const pickables=[];        // meshes for raycasting
let selected=null;

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
      'assets/img/textures/'+data.key+'.jpg',
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

  camera=new THREE.PerspectiveCamera(48, innerWidth/innerHeight, 0.1, 400000);
  camera.position.set(0, 95, 235);

  renderer=new THREE.WebGLRenderer({antialias:true, canvas:undefined});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  document.getElementById('app').appendChild(renderer.domElement);

  controls=new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.06;
  controls.minDistance=0.8; controls.maxDistance=40000;
  controls.zoomSpeed=2.4;                  // wheel zooms further per notch
  controls.target.set(0,0,0);

  clock=new THREE.Clock();

  // lights
  scene.add(new THREE.AmbientLight(0x4a5a7a, 0.85));
  sunLight=new THREE.PointLight(0xfff3e0, 2.4, 0, 0.0);  // no attenuation -> all worlds lit
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
  const hLight=new THREE.PointLight(0xff5a2a, 0.9, horusRec.radius*70, 1.2);
  horusRec.mesh.add(hLight);
  for(const m of HORUS_MOONS){ addMoon(m, horusRec); }

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
  const aDisp = parentRec.radius*1.7 + spacing*Math.pow(m.dist/refDist, 0.5);
  const idx = sysMoons.indexOf(sysMoons.find(x=>x.key===m.key));
  return addBody(m, parentRec.holder, {
    aDisp,
    incl: 1.5 + idx*4 + (m.parent==='horus'?2:0),
    node: nodeFor(m.key),
    orbitOpacity: 0.22
  });
}

/* ---- scale mode (compressed <-> real distances) ---- */
function applySizes(){
  for(const rec of bodies){ if(rec.data.kind==='star') continue;
    rec.mesh.scale.setScalar(sizeMult*bodyF()); }
}
function applyScaleMode(){
  starGroup.scale.setScalar(starVisR()/STAR_R_COMPRESS);
  for(const rec of bodies){ if(rec.helio){ rec.aDisp=distDisp(rec.data.dist); rebuildOrbitLine(rec); } }
  applySizes();
  controls.maxDistance = realScale?20000:4000;
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
      rec.mesh.rotation.y += rec.spin*dt*(0.4+timeScale*0.8);
    }
    elapsedYears += YEARS_PER_SEC*timeScale*dt;          // real sim-time elapsed
    _clockT += dt; if(_clockT>=0.25){ _clockT=0; updateClock(); }
  }

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
  renderer.render(scene,camera);
  if(showLabels) updateLabels();
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
  let downX=0,downY=0,moved=false;
  dom.addEventListener('pointerdown',e=>{downX=e.clientX;downY=e.clientY;moved=false;
    document.getElementById('nav').classList.remove('open');});
  dom.addEventListener('pointermove',e=>{
    if(Math.abs(e.clientX-downX)>4||Math.abs(e.clientY-downY)>4) moved=true;
    hover(e);
  });
  dom.addEventListener('pointerup',e=>{
    if(moved) return;
    const hit=pick(e);
    if(hit){ focusBody(hit,true); }
  });
  dom.addEventListener('pointerleave',()=>{tip.style.opacity=0;});

  document.getElementById('play').onclick=togglePlay;
  document.getElementById('speed').oninput=e=>setSpeed(+e.target.value);
  document.getElementById('size').oninput=e=>setSize(+e.target.value);
  document.getElementById('t-scale').onclick=function(){ setScaleMode(!realScale); };
  const tt=document.getElementById('t-text');
  if(tt){ tt.onclick=function(){ USE_VERBATIM=!USE_VERBATIM; updateTextUI();
    if(APP.currentData && document.getElementById('info').classList.contains('open')) openInfo(APP.currentData); }; }
  updateTextUI();
  document.getElementById('t-orbits').onclick=function(){ showOrbits=!showOrbits; this.classList.toggle('on',showOrbits);
    for(const b of bodies) if(b.orbitLine) b.orbitLine.visible=showOrbits; };
  document.getElementById('t-labels').onclick=function(){ showLabels=!showLabels; this.classList.toggle('on',showLabels);
    labelLayer.style.display=showLabels?'block':'none'; };
  document.getElementById('reset').onclick=resetView;
  document.getElementById('close').onclick=closeInfo;
  document.getElementById('helpbtn').onclick=()=>document.getElementById('help').classList.toggle('open');
  const navbtn=document.getElementById('navbtn');
  if(navbtn) navbtn.onclick=()=>document.getElementById('nav').classList.toggle('open');

  // lightbox
  const lb=document.getElementById('lightbox'), lbi=document.getElementById('lightbox-img');
  lb.onclick=()=>lb.classList.remove('open');
  APP.openLightbox=(src)=>{ lbi.src=src; lb.classList.add('open'); };

  document.getElementById('speed').value = DEFAULT_SPEED_V;
  setSpeed(DEFAULT_SPEED_V);
  updateClock();
}

function pick(e){
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1;
  mouse.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(mouse,camera);
  ray.params.Points={threshold:1};
  const hits=ray.intersectObjects(pickables,false);
  return hits.length? hits[0].object.userData.bodyKey : null;
}
function hover(e){
  const k=pick(e);
  renderer.domElement.style.cursor=k?'pointer':'grab';
  if(k){ const rec=bodies.find(b=>b.data.key===k);
    tip.textContent=rec.data.name; tip.style.left=e.clientX+'px'; tip.style.top=e.clientY+'px'; tip.style.opacity=1;
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
  const vr = (rec.data.kind==='star') ? starVisR() : rec.radius*bodyF()*Math.max(sizeMult,0.5);
  tween.dist = Math.max(vr*5.5, vr*4 + (realScale?2.5:8));
  if(rec.data.kind==='star') tween.dist = starVisR()*7;
  selected=key; setActiveNav(key);
  if(openPanel!==false) openInfo(rec.data);
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
