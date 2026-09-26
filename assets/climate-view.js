/* ============================================================
   Climate view — the orrery's end of the climate.

   Each frame this measures how much starlight every terrestrial
   world actually received over the time that just went by — from
   the live Kepler elements, the N-body integrator, or a free
   flight after a supernova — and hands it to the climate engine
   (climate-bridge.js → a Web Worker running the planet-climate-
   sandbox model). What comes back is drawn on the orrery's own
   maps: seas that rise and drain, ice that advances and retreats,
   forests that wither, lava, steam, cloud, and a false-colour
   temperature view. Impacts, lasers and supernova fronts are
   heat; icy impactors are water.

   The maps stay the artist's until the climate moves: every
   change is drawn relative to the state the world opened in, so
   a planet that has not been touched looks exactly as it did in
   the orrery before any of this existed.
   ============================================================ */
(function(){
'use strict';
const CL=window.RAClimate;
if(!CL) return;

// Mirrors of assets/climate/profiles.js — the main thread cannot import it.
const LUMINOUS={ sun:{L:1,T:5772}, ra:{L:3.042,T:6050}, horus:{L:3.53e-6,T:832} };
const CLIMATE_KINDS=new Set(['rocky','terran','ocean','lava','iceworld','icemoon']);
const MIN_KG=1e20, MAX_KG=20*5.9722e24;
const PROFILE_MASS={ satismoon:3.67e22 };
// The share of each map that is painted sea, where the climate's own number
// is not the right one: Nephtys's acid seas are scenery (this model has one
// solvent, water), Satis's and Uat-Ur's sea follow the climate.
const SRC_OCEAN={ nephtys:0.80 };
const DEM={ earth:'earth', mars:'mars' };
const S_EARTH=1361, TWO_PI=Math.PI*2, LN2000=Math.log(2000);
const ICE_EASE=1.5;               // full swing of a band's ice in ~0.7 s of wall clock

const V={ bodies:new Map(), tempView:false, lumScale:{}, pending:[], pendingW:new Map(),
  started:false, available:true, unavailableWhy:null, navT:0, panelKey:null, analysisBusy:false,
  demImg:{}, stats:null };
window.RAClimateView=V;

/* ---------------- small helpers ---------------- */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const L=(en,sk)=>(typeof LANG!=='undefined'&&LANG==='sk')?sk:en;
function parentRec(rec){ return bodies.find(b=>b.holder===rec.parentHolder)||null; }
function massOf(rec){
  const m=rec.data.massKg!=null?rec.data.massKg:PROFILE_MASS[rec.data.key];
  return m!=null?m+(rec._accretedKg||0):undefined;
}
function capable(rec){
  if(!rec||!rec.data||rec.destroyed||rec._generated||rec.external||rec._absorbedGone) return false;
  if(!CLIMATE_KINDS.has(rec.data.kind)) return false;
  const m=massOf(rec);
  if(m==null) return !!PROFILE_MASS[rec.data.key];
  return m>=MIN_KG && m<=MAX_KG;
}
function bodyData(rec){
  const d=rec.data;
  return { key:d.key, kind:d.kind, massKg:massOf(rec), radiusKm:d.radiusKm, rotationPeriod:d.rotationPeriod,
    comp:d.comp||null, custom:!!rec._custom, life:d.life||null };
}

/* ---------------- light sources ---------------- */
function luminous(){
  const out=[];
  for(const b of bodies){
    if(b.destroyed) continue;
    const k=b.data.kind;
    if(k!=='star' && k!=='browndwarf') continue;
    const base=LUMINOUS[b.data.key] || (k==='star'
      ? {L:Math.pow((b.data.massKg||1.989e30)/1.989e30,3.5), T:5772}
      : {L:3e-6, T:900});
    const s=V.lumScale[b.data.key]; const Lx=base.L*(s!=null?s:1);
    if(Lx>0) out.push({rec:b, L:Lx, T:base.T});
  }
  return out;
}

/* ---------------- starlight over an interval ---------------- */
function trueAnom(M,e){
  M=((M%TWO_PI)+TWO_PI)%TWO_PI;
  const E=kepler(M,e);
  return 2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2), Math.sqrt(1-e)*Math.cos(E/2));
}
// Mean of 1/r^2 (AU^-2) over the mean-anomaly interval [M2-dM, M2]. Exact for
// any interval: dν/dt = h/r², so ∫dt/r² over the arc is Δν/h.
function meanInvR2(a,e,M2,dM){
  if(!(a>0) || !(e>=0 && e<0.999)) return null;
  if(!(dM>1e-9)){
    const nu=trueAnom(M2,e), r=a*(1-e*e)/(1+e*Math.cos(nu));
    return 1/(r*r);
  }
  const full=Math.floor(dM/TWO_PI), rem=dM-full*TWO_PI;
  let dnu=0;
  if(rem>1e-9){ dnu=trueAnom(M2,e)-trueAnom(M2-rem,e); dnu=((dnu%TWO_PI)+TWO_PI)%TWO_PI; }
  return (full*TWO_PI+dnu)/(dM*a*a*Math.sqrt(1-e*e));
}
function keplerA(rec){
  if(rec.helio) return rec.helioA!=null?rec.helioA:rec.data.dist;
  if(rec.isMoon) return rec._physA!=null?rec._physA:rec.data.dist;
  return null;
}
// The body whose Kepler orbit carries `rec` round `src`: itself, its planet,
// or its planet's planet. Null if the chain does not reach the source.
function carrierAbout(rec, src){
  let cur=rec;
  for(let i=0;i<3 && cur;i++){
    if(cur.freeState || cur.nb) return null;
    const par=parentRec(cur);
    if(!par) return null;
    if(par===src) return (cur.helio||cur.isMoon) && cur.aDisp>0 ? cur : null;
    cur=par;
  }
  return null;
}
function instInvR2(rec, src){
  const a=raStateOf(rec).r, b=raStateOf(src).r;
  const d2=a.distanceToSquared(b);
  return d2>1e-12 ? 1/d2 : 0;
}
function fluxOver(rec, dtYears, lums){
  let F=0, domF=-1, domT=5772;
  const nbF = (nbodyOn && rec.nb && rec._climNbFlux!=null) ? rec._climNbFlux : null;
  if(nbF!=null){
    // accumulated by nbStep over the substeps of this frame, per source
    for(let i=0;i<lums.length;i++){
      const f=nbF[lums[i].rec.data.key]||0;
      F+=f; if(f>domF){ domF=f; domT=lums[i].T; }
    }
    return {flux:F, starTemp:domT};
  }
  for(const s of lums){
    if(s.rec===rec) continue;
    let inv=null;
    const car=(!nbodyOn)?carrierAbout(rec, s.rec):null;
    if(car){
      const n=TWO_PI/Math.max(car.period||1,1e-9);
      inv=meanInvR2(keplerA(car), car.e||0, car.M, n*dtYears);
    }
    if(inv==null) inv=instInvR2(rec, s.rec);
    const f=S_EARTH*s.L*inv;
    F+=f; if(f>domF){ domF=f; domT=s.T; }
  }
  return {flux:F, starTemp:domT};
}

// Called from the N-body step: per-substep accumulation of flux from each light
// source, so the climate sees the average over the frame rather than its last
// instant. `at` (tier A) gives the slot each body's position is read from: a
// moon reads its planet group's barycentre, and a source in the world's own
// group is left to the orbit average (nbOrbitLight in app.js).
V.nbPrepare=function(list, at){
  const lums=luminous();
  const cl=[], cf=[], li=[], lL=[], lk=[];
  for(let i=0;i<list.length;i++){
    const r=list[i], f=at?at[i]:i;
    if(V.bodies.has(r.data.key)){ cl.push(i); cf.push(f); }
    for(const s of lums) if(s.rec===r){ li.push(f); lL.push(s.L); lk.push(s.rec.data.key); }
  }
  if(!cl.length || !li.length) return null;
  return {cl, cf, li, lL, lk, acc:new Float64Array(cl.length*li.length), t:0};
};
V.nbAccumulate=function(ctx, F, h){
  const {cf, li, lL, acc}=ctx, nl=li.length;
  for(let a=0;a<cf.length;a++){
    const i=cf[a];
    for(let b=0;b<nl;b++){
      const j=li[b];
      if(i===j) continue;
      const dx=F.x[i]-F.x[j], dy=F.y[i]-F.y[j], dz=F.z[i]-F.z[j];
      const d2=dx*dx+dy*dy+dz*dz;
      acc[a*nl+b]+= d2>1e-12 ? lL[b]/d2*h : 0;
    }
  }
  ctx.t+=h;
};
V.nbFinish=function(ctx, list){
  if(!ctx || !(ctx.t>0)) return;
  const nl=ctx.li.length;
  for(let a=0;a<ctx.cl.length;a++){
    const rec=list[ctx.cl[a]], o={};
    for(let b=0;b<nl;b++) o[ctx.lk[b]]=S_EARTH*ctx.acc[a*nl+b]/ctx.t;
    rec._climNbFlux=o;
  }
};
// The fast tiers' starlight: `inv` is a mean 1/r² (AU⁻²) over the frame along an
// orbit, or an end-of-frame one, from source `s` (an entry of V.luminous()).
V.luminous=luminous;
V.meanInvR2=meanInvR2;
V.nbAddInvR2=function(rec, s, inv){
  if(!V.bodies.has(rec.data.key) || !(inv>=0)) return;
  const o=rec._climNbFlux||(rec._climNbFlux={}), k=s.rec.data.key;
  o[k]=(o[k]||0)+S_EARTH*s.L*inv;
};

/* ---------------- worlds ---------------- */
function addWorld(rec){
  const key=rec.data.key;
  if(V.bodies.has(key) || !capable(rec)) return;
  const f=fluxOver(rec, 0, luminous());
  const cv={ rec, key, u:null, bandTex:null, bandBytes:new Uint8Array(18*2*4), iceEase:new Float32Array(18),
    iceSeeded:false, surfTex:null, cdf:null, s0:0, token:null, requested:0, on:0, onTarget:0,
    atmo:null, atmoBase:null, rs0:null, stateSeen:false, addedAt:performance.now() };
  V.bodies.set(key, cv);
  CL.add(key, SYS, bodyData(rec), f.flux, f.starTemp);
  hookMaterial(cv);
}
function removeWorld(key){
  const cv=V.bodies.get(key); if(!cv) return;
  V.bodies.delete(key);
  CL.remove(key);
  if(V.panelKey===key){                      // its panel goes with it
    const box=document.getElementById('i-climate'); if(box) box.remove();
    V.panelKey=null; CL.focus(null);
  }
  if(cv.u){ cv.u.uClimOn.value=0; }
  const el=document.querySelector('.navitem[data-key="'+key+'"] .ctemp'); if(el) el.textContent='';
}
V.addWorld=addWorld; V.removeWorld=removeWorld;

V.init=function(){
  if(V.started) return; V.started=true;
  CL.on('unavailable', e=>{ V.available=false; V.unavailableWhy=e.reason; showBanner(); });
  CL.on('added', m=>{
    const cv=V.bodies.get(m.key); if(!cv) return;
    const was=cv.rs0?startSig(cv.rs0):null;
    cv.rs0=m.rs0; cv.iceSeeded=false; cv.stateSeen=false; cv.dirty=true;
    writeInitialRow(cv);
    // a reset reads the map again only if what the reading takes from the
    // start moved; the map itself changing is caught by its token
    if(m.reset && startSig(m.rs0)!==was){ cv.token=null; }
  });
  CL.on('analysis', onAnalysis);
  CL.on('analysis-failed', m=>{
    V.analysisBusy=false;
    // The worker could not fetch or decode it: read the pixels here instead.
    const cv=V.bodies.get(m.key);
    if(cv && m.needPixels && !cv.needPixels){ cv.needPixels=true; cv.token=null; }
  });
  CL.on('state', keys=>{ for(const k of keys){ const cv=V.bodies.get(k); if(cv) cv.dirty=true; } });
  CL.on('detail', d=>{ if(d && d.key===V.panelKey) renderPanel(d); });
  CL.on('stats', s=>{ V.stats=s; });
  CL.start();
  for(const rec of bodies) addWorld(rec);
  V.applySaved();                       // any saved climate for this system
  buildTempLegend();
  const tb=document.getElementById('t-temp'); if(tb) tb.onclick=V.toggleTempView;
};
function climKey(){ return 'ra-climate-clim:'+(typeof SYS!=='undefined'?SYS:'ra'); }
// The saved climate for this system, onto the worlds as they are now.
V.applySaved=function(){
  // worlds rebuilt or re-created by a Load re-register on the next nav tick;
  // make sure they exist before their saved climates arrive
  for(const rec of bodies) addWorld(rec);
  try{
    const saved=JSON.parse(localStorage.getItem(climKey())||'null');
    if(saved && saved.worlds){
      for(const k of Object.keys(saved.worlds)) if(!V.bodies.has(k)) delete saved.worlds[k];
      if(saved.lum) V.lumScale=saved.lum;
      CL.restore(saved.worlds);
    }
  }catch(_){}
};
// ♻ Reset: every climate back to the one its world opened with. Worlds whose
// record was replaced (rebuilt after a deletion) are dropped and re-added fresh.
V.resetAll=function(){
  V.pending.length=0; V.pendingW.clear();
  V.lumScale={};
  for(const [k,cv] of [...V.bodies]){
    if(bodies.indexOf(cv.rec)<0 || !capable(cv.rec)) removeWorld(k);
    else CL.reset(k);
  }
  for(const rec of bodies) addWorld(rec);
};

/* ---------------- per frame ---------------- */
let _accReal=0;
V.frame=function(dtReal, simDt, rateYps){
  if(!V.started || !V.available) return;
  // bodies can appear (custom, healed) and vanish (shattered, deleted)
  for(const [k,cv] of V.bodies){
    if(bodies.indexOf(cv.rec)<0 || !capable(cv.rec)) removeWorld(k);
  }
  if(simDt>0){
    const lums=luminous(), forcing={};
    for(const [k,cv] of V.bodies) forcing[k]=fluxOver(cv.rec, simDt, lums);
    CL.tick(simDt, rateYps, forcing);
  }
  V.flush();
  if(CL.mode==='local') CL.frame(Math.min(8, 4+2*dtReal*60));
  _accReal+=dtReal;
  const t=performance.now()/1000;
  const p0=V.prof?performance.now():0;
  for(const cv of V.bodies.values()) applyState(cv, dtReal, t);
  for(const cv of V.bodies.values()){ lifeOf(cv); damageOf(cv); }
  const p1=V.prof?performance.now():0;
  maybeAnalyse();
  if(V.prof){ const p2=performance.now(); if(p2-p0>15) V.prof.push({apply:+(p1-p0).toFixed(1), analyse:+(p2-p1).toFixed(1)}); }
  V.navT+=dtReal;
  if(V.navT>0.5){
    V.navT=0;
    // worlds that became climate-capable since last time: a custom body, a
    // world healed back from debris, a wreck un-swallowed
    for(const rec of bodies) if(!V.bodies.has(rec.data.key) && capable(rec)) addWorld(rec);
    updateNavTemps(); updateHud();
  }
};

/* ---------------- life ---------------- */
// What lives on a world is the climate's to say (the ledger, system.js): the
// orrery's tags, panel and vegetation hear of a change the frame it arrives.
// Compared with what the orrery shows now, not with what was last sent: a Heal
// resets the orrery's side itself, and a heal, a Reset and a Load's restored
// ledger can all land within one frame.
function lifeOf(cv){
  const RS=CL.RS, rec=cv.rec; if(!RS || RS.LIFE==null || !rec.data.life || rec.destroyed) return;
  const r=CL.state(cv.key); if(!r) return;
  const lv=r[RS.LIFE], cause=CL.LIFE_CAUSES[r[RS.LIFECAUSE]]||null;
  if(lv===rec.lifeLevel && cause===(rec.lifeCause||null)) return;
  if(typeof impLifeFromClimate==='function') impLifeFromClimate(rec, lv, cause);
}
// A struck world's melt and steam follow its climate the frame they change:
// the lava cools as the magma drains, and the orrery's readouts with it.
function damageOf(cv){
  const rec=cv.rec, s=rec.scar; if(!s || !(rec.dmgJ>0) || rec.destroyed) return;
  const RS=CL.RS, r=CL.state(cv.key); if(!r || !RS || RS.BOILED==null) return;
  const m=r[RS.MAGMA], b=Math.round(r[RS.BOILED]*100);
  if(m===s._climM && b===s._climB) return;       // on the scar: a healed world's new one starts blank
  s._climM=m; s._climB=b;
  if(typeof impUpdateMelt==='function') impUpdateMelt(rec);
}
// True where the climate keeps this world's life (the orrery's joule thresholds
// then stand aside).
V.ownsLife=function(rec){
  const cv=rec && rec.data && V.bodies.get(rec.data.key);
  return !!(cv && cv.rec===rec && CL.state(cv.key) && CL.RS && CL.RS.LIFE!=null);
};
// Simulated years since the life on this world last changed, or null.
V.lifeAgo=function(rec){
  const cv=rec && rec.data && V.bodies.get(rec.data.key), RS=CL.RS;
  const r=cv && CL.state(cv.key); if(!r || !RS || RS.LIFESINCE==null) return null;
  return Math.max(0, r[RS.TIME]-r[RS.LIFESINCE]);
};

// What the climate says a strike did to the surface -- the share of its bands
// molten, the share of its water in the sky, how much water it has -- for the
// orrery's damage readouts and shells, so the lab, the hover text and this
// panel tell one story. Null where the climate does not run the world.
V.surfaceState=function(rec){
  const cv=rec && rec.data && V.bodies.get(rec.data.key), RS=CL.RS;
  const r=cv && cv.rec===rec ? CL.state(cv.key) : null;
  if(!r || !RS || RS.BOILED==null) return null;
  return { magma:r[RS.MAGMA]||0, boiled:r[RS.BOILED]||0, waterKg:(r[RS.TOTALWATER]||0)*1.4e21 };
};

/* ---------------- deposits ---------------- */
// Energy arriving now. opts: {kind: 'asteroid'|'laser'|'blast'|'collision',
// point: the struck spot (world), or dir: the direction the energy comes from
// (world), mKg, vKms}. Where it lands is handed over in both of the climate's
// band schemes -- sin(latitude) for a spinning world, cos(angle from the star)
// for a locked one -- and the climate picks its own.
const _dv=new THREE.Vector3(), _ax=new THREE.Vector3(), _dq=new THREE.Quaternion();
function bandCoords(rec, n){
  rec.mesh.updateWorldMatrix(true, false);
  _ax.set(0,1,0).applyQuaternion(rec.mesh.getWorldQuaternion(_dq)).normalize();
  // the star a locked world faces is the one its globe is drawn facing (starDir)
  const star=luminous().find(s=>s.rec!==rec);
  const toStar=star ? worldPos(star.rec).sub(worldPos(rec)).normalize() : _ax;
  return { x:n.dot(_ax), xl:n.dot(toStar) };
}
V.deposit=function(rec, joules, opts){
  if(!rec || !V.bodies.has(rec.data.key) || !(joules>0)) return;
  const o=opts||{}, kind=o.kind||'asteroid';
  let x=0, xl=1;
  if(o.point) ({x, xl}=bandCoords(rec, _dv.copy(o.point).sub(worldPos(rec)).normalize()));
  else if(o.dir) ({x, xl}=bandCoords(rec, _dv.copy(o.dir).normalize()));
  V.pending.push({key:rec.data.key, o:{J:joules, kind, x, xl, mKg:o.mKg||0, vKms:o.vKms||0}});
};
// Send what has arrived, in the frame it arrived in.
V.flush=function(){
  if(!V.pending.length && !V.pendingW.size) return;
  for(const d of V.pending){ const w=V.pendingW.get(d.key); if(w){ d.o.waterKg=w; V.pendingW.delete(d.key); } CL.impact(d.key, d.o); }
  V.pending.length=0;
  for(const [k,w] of V.pendingW) CL.impact(k, {J:0, waterKg:w});
  V.pendingW.clear();
};
V.water=function(rec, kg){
  if(!rec || !V.bodies.has(rec.data.key) || !(kg>0)) return;
  V.pendingW.set(rec.data.key, (V.pendingW.get(rec.data.key)||0)+kg);
};
// 🧽 Heal: a world that had been hurt gets its climate back from the start.
V.beforeHeal=function(){
  V._healKeys=[];
  for(const rec of bodies) if((rec.dmgJ>0 || rec.destroyed) && rec.data) V._healKeys.push(rec.data.key);
};
V.afterHeal=function(){
  // Heat or water banked this frame but not yet sent belongs to the damage
  // being healed; sending it after the reset would re-damage the healed world.
  V.pending.length=0; V.pendingW.clear();
  for(const k of (V._healKeys||[])){
    const rec=bodies.find(b=>b.data.key===k); if(!rec) continue;
    if(V.bodies.has(k)) CL.reset(k); else addWorld(rec);
  }
  V._healKeys=[];
};

/* ---------------- the shader ---------------- */
const VERT_DECL='varying vec3 vClimN;\n';
const FRAG_DECL=`
varying vec3 vClimN;
uniform sampler2D uClimBands;
uniform sampler2D uClimSurf;
uniform vec4 uClimA;   // x sea threshold, y (unused), z water cap, w glaciated share
uniform vec4 uClimB;   // x bio, y bio at start, z steam, w steam at start
uniform vec4 uClimC;   // x locked, y bare rock, z glow gate, w temperature view
uniform vec4 uClimD;   // x cloud mode (0 none, 1 change only, 2 full), y time, z haze, w co2 share
uniform vec3 uClimStar;
uniform sampler2D uClimCloud;
uniform vec2 uClimCloudOff;
uniform vec3 uClimSea;
uniform vec3 uClimLand;
uniform float uClimOn;
vec3 climTempColor(float T){
  float c=T-273.15;
  vec3 k=vec3(0.18,0.0,0.30);
  k=mix(k, vec3(0.23,0.30,0.75), smoothstep(-150.0,-75.0,c));
  k=mix(k, vec3(0.37,0.66,1.0), smoothstep(-75.0,-25.0,c));
  k=mix(k, vec3(0.87,0.96,1.0), smoothstep(-25.0,0.0,c));
  k=mix(k, vec3(0.50,0.86,0.44), smoothstep(0.0,15.0,c));
  k=mix(k, vec3(0.96,0.84,0.26), smoothstep(15.0,30.0,c));
  k=mix(k, vec3(0.96,0.54,0.16), smoothstep(30.0,60.0,c));
  k=mix(k, vec3(0.84,0.19,0.12), smoothstep(60.0,150.0,c));
  k=mix(k, vec3(0.55,0.0,0.0), smoothstep(150.0,500.0,c));
  k=mix(k, vec3(1.0,0.94,0.75), smoothstep(500.0,1500.0,c));
  return k;
}
`;
const FRAG_SURF=`
float climT=288.0, climMelt=0.0, climTview=0.0, climCrust=0.0;
vec3 climLavaGlow=vec3(0.0);
if(uClimOn>0.001){
  vec3 cn=normalize(vClimN);
  float bx=mix(cn.y, dot(cn, uClimStar), uClimC.x);
  float bu=clamp((bx+1.0)*0.5, 0.0, 1.0);
  vec4 bNow=texture2D(uClimBands, vec2(bu, 0.25));
  vec4 b0=texture2D(uClimBands, vec2(bu, 0.75));
  float T=2.0*exp(bNow.r*7.6009), T0=2.0*exp(b0.r*7.6009);
  climT=T;
  vec4 sf=texture2D(uClimSurf, vUv);
  float h=sf.r, veg=sf.g, pIce=sf.b, nz=sf.a;
  vec3 col=diffuseColor.rgb;
  // seas: drown the land the sea has risen over, bare the bed it has left
  float seaNow=1.0-smoothstep(uClimA.x-0.004, uClimA.x+0.004, h);
  float seaSrc=1.0-smoothstep(0.494, 0.506, h);
  float depth=smoothstep(0.0, 0.3, uClimA.x-h);
  vec3 seaCol=uClimSea*mix(1.1, 0.55, depth);
  float drown=max(seaNow-seaSrc, 0.0);
  float dry=max(seaSrc-seaNow, 0.0);
  vec3 bed=mix(uClimLand*0.62, vec3(0.30,0.27,0.24), 0.45);
  // a drying sea goes briny and pale before it goes
  seaCol=mix(mix(bed, vec3(0.85,0.82,0.74), 0.35), seaCol, smoothstep(0.02, 0.25, uClimA.z));
  col=mix(col, seaCol, drown);
  col=mix(col, bed, dry);
  // ice, as the change from the map: grown where the world is colder than it
  // started, melted off the painted ice where it is warmer
  float amtNow=clamp(bNow.g*1.05-0.16*nz, 0.0, 1.0), amt0=clamp(b0.g*1.05-0.16*nz, 0.0, 1.0);
  float mNow=smoothstep(0.06, 0.52, amtNow), m0=smoothstep(0.06, 0.52, amt0);
  float grow=max(mNow-m0, 0.0), melt=max(m0-mNow, 0.0);
  // Where the sea is where it always was, only the CHANGE in ice is drawn --
  // the map already shows the ice it started with. Where the sea has moved
  // (a new coast, a drained basin) the map shows nothing true, so the ice
  // there is drawn in full.
  float kept=1.0-max(drown, dry);
  float keptSea=kept*seaNow, keptLand=kept*(1.0-seaNow);
  float thaw=clamp(melt*1.6, 0.0, 1.0);
  // a thawed sea is open water, whatever the map painted over it; a thawed
  // land shows ground only where the map painted ice
  col=mix(col, seaCol, keptSea*thaw);
  col=mix(col, uClimLand*0.85, keptLand*pIce*thaw);
  float addIce=(grow*(keptSea+keptLand*uClimA.w) + mNow*(drown+dry*uClimA.w))*mix(0.35, 1.0, uClimA.z);
  vec3 iceCol=mix(vec3(0.74,0.83,0.91), vec3(0.93,0.96,0.99), nz);
  col=mix(col, iceCol, clamp(addIce, 0.0, 1.0));
  // forests wither where the climate stops carrying them
  float warm=smoothstep(266.0,284.0,T)*(1.0-smoothstep(303.0,322.0,T));
  float warm0=smoothstep(266.0,284.0,T0)*(1.0-smoothstep(303.0,322.0,T0));
  float life=warm*smoothstep(0.02,0.55,uClimB.x), life0=warm0*smoothstep(0.02,0.55,uClimB.y);
  float wither=veg*clamp((life0-life)/max(life0,0.05), 0.0, 1.0)*(1.0-seaNow);
  vec3 dead=mix(col, vec3(dot(col, vec3(0.38,0.44,0.18)))*vec3(1.12,0.98,0.76), 0.85);
  col=mix(col, dead, wither);
  // molten rock, only where there is rock to see: a skin of dark crust over a
  // molten sea, the plates shrinking as it heats and the seams between them
  // glowing. The map's own ground is gone under it early -- lava resurfaces.
  climMelt=smoothstep(1150.0,1500.0,T)*uClimC.y;
  if(climMelt>0.001){
    float cover=smoothstep(0.0, 0.3, climMelt);
    float thr=mix(0.30, 0.70, climMelt);
    float liquid=1.0-smoothstep(thr-0.015, thr+0.015, nz);
    float seam=(1.0-smoothstep(0.0, 0.035, abs(nz-thr)))*(1.0-0.5*liquid);
    vec3 magma=mix(vec3(0.80,0.14,0.02), vec3(1.0,0.60,0.16), smoothstep(1400.0, 2400.0, T));
    vec3 lava=mix(vec3(0.075,0.06,0.055), magma, liquid);
    lava=mix(lava, vec3(1.0,0.72,0.30), seam*0.7);
    col=mix(col, lava, cover);
    climLavaGlow=(magma*liquid+vec3(1.0,0.55,0.18)*seam*0.8)*cover;
    climCrust=(1.0-liquid)*cover;
  }
  // cloud: the deck the climate computes, or only its change where the
  // artist already painted one
  if(uClimD.x>0.5){
    float cov=uClimD.x>1.5 ? bNow.b : max(bNow.b-b0.b, 0.0)*1.3;
    // two layers drifting at different speeds over a slower field of weather
    // systems, so the deck shears and churns instead of sliding as one sheet
    float tt=uClimD.y;
    vec2 base=vUv+uClimCloudOff;
    vec4 sys=texture2D(uClimCloud, base+vec2(tt*0.0011, 0.0));
    vec2 warp=(sys.bb-0.5)*vec2(0.05,0.025);
    float c1=texture2D(uClimCloud, base+vec2(tt*0.0036, 0.0)+warp).r;
    float c2=texture2D(uClimCloud, base+vec2(-tt*0.0057, 0.0)-warp).g;
    float band=0.5+0.5*sin(cn.y*13.0+sys.b*6.0);
    float cl=mix(c1*0.7+c2*0.3, (c1*0.7+c2*0.3)*0.6+band*0.4, 0.35*(1.0-uClimC.x));
    cl=mix(cl, sys.b, 0.25);
    float cm=smoothstep(1.0-cov, 1.0-cov+0.18, cl);
    float thick=smoothstep(1.0-cov+0.05, 1.0-cov+0.45, cl);
    vec3 cc=mix(vec3(0.82,0.85,0.9), vec3(0.97,0.97,0.98), thick);
    cc=mix(cc, vec3(0.98,0.88,0.74), uClimD.w*0.5);
    col*=1.0-0.15*cm*(1.0-thick);
    col=mix(col, cc, cm*(0.55+0.4*thick));
  }
  // steam: the sea in the sky
  float st=max(uClimB.z-(uClimD.x<1.5 ? uClimB.w : 0.0), 0.0);
  col=mix(col, vec3(0.97,0.96,0.94), clamp(st,0.0,1.0));
  // organic haze tints what it hides
  col=mix(col, col*vec3(1.1,0.82,0.5), uClimD.z*0.5);
  climTview=uClimC.w;
  if(climTview>0.5) col=climTempColor(T);
  diffuseColor.rgb=mix(diffuseColor.rgb, col, uClimOn);
}
`;
const FRAG_EMIT=`
if(uClimOn>0.001){
  // the crust is the cool part of a lava world: it glows least
  float glow=uClimC.z*min(exp(11.68-17520.0/max(climT,1.0)), 1.4)*(1.0-0.75*climCrust);
  totalEmissiveRadiance+=uClimOn*(vec3(1.0,0.30,0.08)*glow*0.9+climLavaGlow*0.8);
  if(climTview>0.5) totalEmissiveRadiance+=diffuseColor.rgb*0.55;
}
`;
function makeBandTex(bytes){
  const t=new THREE.DataTexture(bytes, 18, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearFilter;
  t.wrapS=THREE.ClampToEdgeWrapping; t.wrapT=THREE.ClampToEdgeWrapping;
  t.generateMipmaps=false; t.needsUpdate=true;
  return t;
}
let _blankSurf=null;
function blankSurf(){
  if(_blankSurf) return _blankSurf;
  const t=new THREE.DataTexture(new Uint8Array([160,0,0,128]),1,1,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.needsUpdate=true; _blankSurf=t; return t;
}
function hookMaterial(cv){
  const mat=cv.rec.mesh&&cv.rec.mesh.material;
  if(!mat || !mat.isMeshStandardMaterial) return;
  cv.bandTex=makeBandTex(cv.bandBytes);
  cv.u={
    uClimBands:{value:cv.bandTex}, uClimSurf:{value:blankSurf()},
    uClimA:{value:new THREE.Vector4(0.5,0,1,0)}, uClimB:{value:new THREE.Vector4(0,0,0,0)},
    uClimC:{value:new THREE.Vector4(0,1,0,0)}, uClimD:{value:new THREE.Vector4(0,0,0,0)},
    uClimStar:{value:new THREE.Vector3(1,0,0)}, uClimSea:{value:new THREE.Color(0.05,0.16,0.34)},
    uClimCloud:{value:V.cloudTex||blankSurf()},
    uClimCloudOff:{value:new THREE.Vector2((seedOf(cv.key)%997)/997, 0)},
    uClimLand:{value:new THREE.Color(0.42,0.36,0.30)}, uClimOn:{value:0},
  };
  const u=cv.u;
  mat.onBeforeCompile=function(shader){
    Object.assign(shader.uniforms, u);
    shader.vertexShader=VERT_DECL+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vClimN = normal;');
    shader.fragmentShader=FRAG_DECL+shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n'+FRAG_SURF)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n'+FRAG_EMIT);
  };
  mat.customProgramCacheKey=function(){ return 'ra-climate-1'; };
  mat.needsUpdate=true;
  // the orrery's atmosphere shell, if it has one
  for(const ch of cv.rec.mesh.children){
    const m=ch.material;
    if(m && m.uniforms && m.uniforms.c && m.uniforms.p && m.side===THREE.BackSide){
      cv.atmo=ch; cv.atmoBase={c:m.uniforms.c.value.clone(), p:m.uniforms.p.value}; break;
    }
  }
}
// A map swap (the baked WebP arriving, a vegetation kill) replaces the material's
// map; the hook survives because it lives on the material, but the analysis
// has to be redone for the new picture.

/* ---------------- render state -> uniforms ---------------- */
function logT(T){ return clamp(Math.round(Math.log(Math.max(T,2)/2)/LN2000*255),0,255); }
function cloudVis(r, RS){
  let m=0; for(let i=0;i<18;i++) m+=r[RS.CLOUD+i]/18;
  return m>1e-4 ? 0.8*r[RS.CLOUDMEAN]/m : 0.8;
}
function writeInitialRow(cv){
  const RS=CL.RS, r=cv.rs0; if(!RS || !r) return;
  const b=cv.bandBytes, cvis=cloudVis(r, RS);
  for(let i=0;i<18;i++){
    const o=(18+i)*4;
    b[o]=logT(r[RS.T+i]); b[o+1]=Math.round(clamp(r[RS.ICE+i],0,1)*255);
    b[o+2]=Math.round(clamp(r[RS.CLOUD+i]*cvis,0,1)*255); b[o+3]=255;
  }
  if(cv.bandTex) cv.bandTex.needsUpdate=true;
}
function heightForShare(cdf, share){
  const q=clamp(share,0,1);
  if(q<=0) return 0; if(q>=1) return 1;
  const eps=1e-6;
  let t0=0; while(t0<256 && cdf[t0]<q-eps) t0++;
  let t1=256; while(t1>0 && cdf[t1]>q+eps) t1--;
  if(t1>=t0) return (t0+t1)/2/255;
  const k=t1, f=(q-cdf[k])/Math.max(cdf[k+1]-cdf[k],1e-12);
  return (k+f)/255;
}
function seaShare(cv, f){
  const RS=CL.RS, f0=cv.rs0?cv.rs0[RS.FLOOD]:f, s0=cv.s0;
  if(!(f0>0.005)) return s0+(1-s0)*clamp(f,0,1);   // painted sea that is not water
  if(f<=f0) return s0*f/f0;
  return s0+(1-s0)*(f-f0)/Math.max(1-f0,1e-6);
}
const _sd=new THREE.Vector3(), _sp=new THREE.Vector3(), _q=new THREE.Quaternion();
function applyState(cv, dtReal, t){
  const RS=CL.RS; if(!RS || !cv.u) return;
  const r=CL.state(cv.key), r0=cv.rs0;
  if(!r || !r0) return;
  const u=cv.u, b=cv.bandBytes;
  // The star direction and the fade run every frame; the rest only when the
  // worker has posted a new state or the ice is still easing towards one.
  cv.on+=clamp(((cv.cdf && !V.forceOff)?1:0)-cv.on, -2*dtReal, 2*dtReal);
  if(V.forceOff) cv.on=0;
  u.uClimOn.value=cv.on;
  u.uClimD.value.y=t;
  if(r[RS.LAM]>0.01) starDir(cv);
  if(!cv.dirty && !cv.easing) return;
  cv.dirty=false;
  // What the deck hides rather than what it covers (the climate sandbox's
  // cloudLook): thin cloud is most of any deck, and drawing all of it opaque
  // turned Earth into a snowball.
  const cvis=cloudVis(r, RS);
  // band ice eases in wall-clock time so a freeze that the physics did inside
  // one frame still reads as a freeze rather than a cut
  cv.easing=false;
  for(let i=0;i<18;i++){
    const target=clamp(r[RS.ICE+i],0,1);
    if(!cv.iceSeeded) cv.iceEase[i]=target;
    else cv.iceEase[i]+=clamp(target-cv.iceEase[i], -ICE_EASE*dtReal, ICE_EASE*dtReal);
    if(Math.abs(target-cv.iceEase[i])>1e-3) cv.easing=true;
    const o=i*4;
    b[o]=logT(r[RS.T+i]); b[o+1]=Math.round(cv.iceEase[i]*255);
    b[o+2]=Math.round(clamp(r[RS.CLOUD+i]*cvis,0,1)*255); b[o+3]=255;
  }
  cv.iceSeeded=true;
  cv.bandTex.needsUpdate=true;
  const f=r[RS.FLOOD];
  u.uClimA.value.set(cv.cdf?heightForShare(cv.cdf, seaShare(cv, f)):0.5, 0, r[RS.WATERCAP], r[RS.GLAC]);
  u.uClimB.value.set(r[RS.BIO], r0[RS.BIO], r[RS.STEAM], r0[RS.STEAM]);
  u.uClimC.value.set(r[RS.LAM], r[RS.BARE], r[RS.GLOW], V.tempView?1:0);
  const mode=(CL.meta(cv.key)||{}).clouds;
  u.uClimD.value.set(mode==='none'?0:mode==='delta'?1:2, t, r[RS.HAZE], r[RS.CO2F]);
  applyAtmosphere(cv, r, r0);
}
// the star, in the planet's own frame, for a locked world's eyeball
function starDir(cv){
  const lums=luminous(); if(!lums.length) return;
  cv.rec.mesh.getWorldPosition(_sp);
  lums[0].rec.mesh.getWorldPosition(_sd);
  _sd.sub(_sp).normalize();
  cv.rec.mesh.getWorldQuaternion(_q).invert();
  cv.u.uClimStar.value.copy(_sd.applyQuaternion(_q));
}
function airTint(co2f, steam, haze){
  let c=[0.35+(1.0-0.35)*co2f, 0.60+(0.72-0.60)*co2f, 1.0+(0.34-1.0)*co2f];
  c=c.map((v,i)=>v+([1.0,0.96,0.92][i]-v)*steam);
  c=c.map((v,i)=>v+([0.93,0.62,0.26][i]-v)*haze);
  return c;
}
function applyAtmosphere(cv, r, r0){
  const RS=CL.RS;
  const p=r[RS.PTOT], p0=r0[RS.PTOT];
  const k=(Math.log10(1+10*p)+0.01)/(Math.log10(1+10*p0)+0.01);
  const now=airTint(r[RS.CO2F], r[RS.STEAM], r[RS.HAZE]), was=airTint(r0[RS.CO2F], r0[RS.STEAM], r0[RS.HAZE]);
  if(!cv.atmo && p>0.03 && typeof makeAtmosphere==='function'){
    // a world that has grown an atmosphere it never had gets a sky to show it
    cv.atmo=makeAtmosphere(cv.rec.radius*1.045, new THREE.Color(now[0],now[1],now[2]), 0.0);
    cv.rec.mesh.add(cv.atmo);
    cv.atmoBase={c:new THREE.Color(now[0],now[1],now[2]), p:0, grown:true};
  }
  if(!cv.atmo) return;
  const m=cv.atmo.material, B=cv.atmoBase;
  if(B.grown){
    m.uniforms.p.value=0.9*clamp(Math.log10(1+10*p)/1.0,0,1.2);
    m.uniforms.c.value.setRGB(now[0],now[1],now[2]);
  } else {
    m.uniforms.p.value=B.p*clamp(k,0,2.5);
    m.uniforms.c.value.setRGB(clamp(B.c.r+now[0]-was[0],0,1), clamp(B.c.g+now[1]-was[1],0,1), clamp(B.c.b+now[2]-was[2],0,1));
  }
}

/* ---------------- reading the maps ---------------- */
function mapImage(cv){
  const mat=cv.rec.mesh&&cv.rec.mesh.material; if(!mat||!mat.map) return null;
  const img=mat.map.image;
  if(!img) return null;
  const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
  if(!(w>0&&h>0)) return null;
  return {img, w, h, token:mat.map.uuid, isCanvas:(typeof HTMLCanvasElement!=='undefined'&&img instanceof HTMLCanvasElement),
    url:(img.currentSrc||img.src||null)};
}
function loadDem(name){
  if(V.demImg[name]) return V.demImg[name];
  const p=new Promise((res)=>{
    const im=new Image();
    im.onload=()=>res(im); im.onerror=()=>res(null);
    im.src='assets/climate/dem/'+name+'_height.png';
  });
  V.demImg[name]=p; return p;
}
function pixelsOf(img, W, H){
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(img,0,0,W,H);
  return x.getImageData(0,0,W,H).data;
}
// Where the browser can, the map is shrunk by createImageBitmap (off the main
// thread) and read back in the worker (OffscreenCanvas), so reading a 2048 px
// map never stalls a frame. Otherwise the main thread reads it, smaller.
const CAN_BITMAP=typeof createImageBitmap==='function' && typeof OffscreenCanvas!=='undefined';
function bitmapOf(img, W, H){
  return createImageBitmap(img, {resizeWidth:W, resizeHeight:H, resizeQuality:'medium'});
}
// What a map reading takes from the world's start: its sea and whether it is frozen over.
function startHints(rs0){
  const RS=CL.RS, f0=rs0[RS.FLOOD];
  let ice0=0; for(let i=0;i<18;i++) ice0+=rs0[RS.ICE+i]/18;
  return { flood:f0>0.005?f0:0, frozen:ice0>0.5 };
}
function startSig(rs0){ const h=startHints(rs0); return h.flood+'|'+h.frozen; }
function seedOf(key){ let s=7; for(const ch of key) s=(s*31+ch.charCodeAt(0))|0; return Math.abs(s)%100000; }
function maybeAnalyse(){
  if(V.analysisBusy || !CL.ready) return;
  const now=performance.now();
  if(now<(V.nextAnalysis||0)) return;
  for(const cv of V.bodies.values()){
    if(!cv.rs0) continue;
    const m=mapImage(cv); if(!m) continue;
    if(m.token===cv.token) continue;
    // a map this world has shown before (healed back from a repaint) is read
    // from memory, not fetched and analysed again
    const sig=m.token+'|'+startSig(cv.rs0), seen=cv.readings&&cv.readings.get(sig);
    if(seen){ cv.readings.delete(sig); cv.readings.set(sig, seen); cv.token=m.token; applyReading(cv, seen); continue; }
    // give the baked WebP a moment to replace the procedural first paint
    if(m.isCanvas && now-cv.addedAt<2500 && !cv.rec._vegKilled) continue;
    V.analysisBusy=true;
    cv.token=m.token; cv.readingSig=sig;
    // Planets get a finer field than moons: they are the ones seen close up.
    const big=m.w>=2048 && !cv.rec.isMoon;
    const viaUrl=!m.isCanvas && m.url && !/^data:|^blob:/.test(m.url) && !cv.needPixels;
    const W=(viaUrl||CAN_BITMAP)?(big?1024:512):512, H=W>>1;
    const d=cv.rec.data, meta=CL.meta(cv.key)||{};
    const st=startHints(cv.rs0);
    const hints={ srcOcean: SRC_OCEAN[d.key]!=null?SRC_OCEAN[d.key]:st.flood,
      frozen: SRC_OCEAN[d.key]==null && st.frozen,
      oceanRef: d.terran?d.terran.ocean:null, landRef: d.terran?(d.terran.land):null,
      veg: meta.veg || (d.vegKill==='purple'?'purple':d.vegKill==='green'?'green':null), seed: seedOf(cv.key) };
    const demName=(!d.custom && SYS==='sol')?DEM[d.key]:null;
    const fail=()=>{ V.analysisBusy=false; };
    if(viaUrl){
      const demUrl=demName?new URL('assets/climate/dem/'+demName+'_height.png', document.baseURI).href:null;
      CL.analyzeUrl(cv.key, W, H, m.url, demUrl, hints, m.token);
      return;
    }
    const go=(demImg)=>{
      if(CAN_BITMAP){
        Promise.all([bitmapOf(m.img, W, H), demImg?bitmapOf(demImg, W, H):null]).then(([bm, dm])=>{
          CL.analyzeBitmap(cv.key, W, H, bm, dm, hints, m.token);
        }).catch(fail);
      } else {
        let rgba, dem=null;
        try{ rgba=pixelsOf(m.img, W, H); if(demImg) dem=pixelsOf(demImg, W, H); }catch(_){ fail(); return; }
        CL.analyze(cv.key, W, H, new Uint8ClampedArray(rgba), dem, hints, m.token);
      }
    };
    if(demName) loadDem(demName).then(go); else go(null);
    return;                                   // one at a time
  }
}
function onAnalysis(a){
  V.analysisBusy=false;
  V.nextAnalysis=performance.now()+150;   // spread the texture uploads out
  if(a.clouds){
    const ct=new THREE.DataTexture(a.clouds, a.CW, a.CH, THREE.RGBAFormat, THREE.UnsignedByteType);
    ct.wrapS=THREE.RepeatWrapping; ct.wrapT=THREE.ClampToEdgeWrapping;
    ct.magFilter=THREE.LinearFilter; ct.minFilter=THREE.LinearMipmapLinearFilter;
    ct.anisotropy=4;
    ct.generateMipmaps=true; ct.needsUpdate=true;
    V.cloudTex=ct;
    for(const cv of V.bodies.values()) if(cv.u) cv.u.uClimCloud.value=ct;
  }
  const cv=V.bodies.get(a.key); if(!cv || !cv.u) return;
  if(a.token!==cv.token) return;
  // the three readings used last are kept: the map a heal or a Reset puts
  // back is the one shown before the repaint
  if(cv.readingSig){
    cv.readings=cv.readings||new Map();
    cv.readings.delete(cv.readingSig); cv.readings.set(cv.readingSig, a);
    while(cv.readings.size>3) cv.readings.delete(cv.readings.keys().next().value);
  }
  applyReading(cv, a);
}
function applyReading(cv, a){
  const t=new THREE.DataTexture(a.bytes, a.W, a.H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping;
  t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearMipmapLinearFilter;
  // as the maps have: without it the squeezed rows near a pole read a mip
  // level that averages the height over half the hemisphere, and a polar sea
  // shows as a dry ring round the cap
  t.anisotropy=4;
  t.generateMipmaps=true; t.needsUpdate=true;
  if(cv.surfTex) cv.surfTex.dispose();
  cv.surfTex=t; cv.cdf=a.cdf; cv.s0=a.s0;
  cv.u.uClimSurf.value=t;
  cv.u.uClimLand.value.setRGB(a.landAvg[0],a.landAvg[1],a.landAvg[2]);
  // A new sea takes the colour of the map's own sea only where the map has
  // one worth the name; a basin on Mars is the colour of Mars, not of water.
  if(a.s0>0.1) cv.u.uClimSea.value.setRGB(a.seaAvg[0],a.seaAvg[1],a.seaAvg[2]);
  else cv.u.uClimSea.value.setRGB(0.04,0.14,0.32);
}

/* ---------------- nav + hud ---------------- */
function fmtT(K){
  if(!(K>0)) return '—';
  const c=K-273.15;
  return (Math.abs(c)<1000?Math.round(c):Math.round(c/100)*100)+' °C';
}
function updateNavTemps(){
  const RS=CL.RS; if(!RS) return;
  for(const [k,cv] of V.bodies){
    const r=CL.state(k); if(!r) continue;
    const el=document.querySelector('.navitem[data-key="'+k+'"]'); if(!el) continue;
    let s=el.querySelector('.ctemp');
    if(!s){ s=document.createElement('span'); s.className='ctemp'; const tag=el.querySelector('.tag');
      if(tag) el.insertBefore(s, tag); else el.appendChild(s); }
    // the mean, as the sandbox heads its own readout: after a boil the model's
    // "surface" is the top of the ocean buried under the steam, still 16 °C
    // under a 470 °C sky, and the list is no place for that distinction
    const txt=fmtT(r[RS.TMEAN]);
    if(s.textContent!==txt) s.textContent=txt;
    const st=CL.STATE_IDS[r[RS.STATE]|0], S=st&&CL.STATES[st];
    if(S){ s.style.color=S.color; s.title=stateName(st, S.name); }
  }
}
function stateName(id, en){
  if(typeof LANG!=='undefined' && LANG==='sk' && SK_STATES[id]) return SK_STATES[id];
  return en;
}
function updateHud(){
  const el=document.getElementById('clim-hud'); if(!el) return;
  if(!V.available){ el.textContent=''; return; }
  const s=V.stats;
  let lagMin=1;
  const RS=CL.RS;
  if(RS) for(const k of V.bodies.keys()){ const r=CL.state(k); if(r) lagMin=Math.min(lagMin, r[RS.LAG]); }
  const n=V.bodies.size;
  el.textContent = CL.ready ? ('🌡 '+n+(lagMin<0.9?' ⏳':'')) : '🌡 …';
  el.title = L('Climate worlds simulated','Počet svetov so simulovanou klímou')+': '+n
    +(s?' · '+Math.round(s.steps)+' '+L('steps/s','krokov/s')+' · '+Math.round(s.busy*100)+'% '+L('of a core','jadra'):'')
    +(lagMin<0.9?' · '+L('some climates are running behind the clock','niektoré klímy zaostávajú za časom'):'')
    +(CL.mode==='local'?' · '+L('main thread','hlavné vlákno'):'');
}
function showBanner(){
  const el=document.getElementById('clim-hud');
  if(el){ el.textContent='🌡 ✕'; el.title=V.unavailableWhy==='file'
    ? L('Climate needs the page served over http(s) — open the online version or run a local server.',
        'Klíma potrebuje stránku cez http(s) — otvorte online verziu alebo spustite lokálny server.')
    : L('Climate engine unavailable in this browser.','Klimatický model v tomto prehliadači nie je dostupný.'); }
}

/* ---------------- temperature view ---------------- */
V.toggleTempView=function(){
  V.tempView=!V.tempView;
  const b=document.getElementById('t-temp'); if(b) b.classList.toggle('on', V.tempView);
  placeLegend();
  for(const cv of V.bodies.values()) if(cv.u){ cv.u.uClimC.value.w=V.tempView?1:0; cv.dirty=true; }
};
// Above the control bar, whatever height the bar has wrapped to.
function placeLegend(){
  const lg=document.getElementById('temp-legend'); if(!lg) return;
  lg.style.display=V.tempView?'block':'none';
  if(!V.tempView) return;
  const bar=document.getElementById('controls');
  const top=bar?bar.getBoundingClientRect().top:innerHeight-80;
  lg.style.bottom=Math.max(8, innerHeight-top+8)+'px';
}
window.addEventListener('resize', ()=>placeLegend());
function buildTempLegend(){
  const lg=document.getElementById('temp-legend'); if(!lg) return;
  const stops=[[-150,'#2e004d'],[-75,'#3b4cc0'],[-25,'#5fa8ff'],[0,'#def4ff'],[15,'#80db70'],
    [30,'#f5d742'],[60,'#f58a29'],[150,'#d7301f'],[500,'#8b0000'],[1500,'#fff0c0']];
  const n=stops.length-1;
  lg.innerHTML='<div class="tl-bar" style="background:linear-gradient(90deg,'
    +stops.map((s,i)=>s[1]+' '+(i/n*100).toFixed(1)+'%').join(',')+')"></div>'
    +'<div class="tl-ticks">'+stops.map((s,i)=>'<i style="left:'+(i/n*100).toFixed(1)+'%">'+s[0]+'</i>').join('')+'</div>'
    +'<div class="tl-unit">°C</div>';
}

/* ---------------- info panel ---------------- */
V.afterOpenInfo=function(d){
  // First in the panel body: in this edition the climate is the point.
  const old=document.getElementById('i-climate'); if(old) old.remove();
  const host=document.getElementById('i-gallery')||document.getElementById('i-desc'); if(!host) return;
  const star=d.kind==='star'||d.kind==='browndwarf';
  const cv=V.bodies.get(d.key);
  if(star){ V.panelKey=null; CL.focus(null); insertLumPanel(d); return; }
  // a shattered, swallowed or otherwise gone world has no climate left to show
  // or change, even in the frame before the climate lets go of it
  if(!cv || !capable(cv.rec)){ V.panelKey=null; CL.focus(null); return; }
  const box=document.createElement('div'); box.id='i-climate'; box.className='clim';
  box.innerHTML=panelSkeleton(d);
  host.parentNode.insertBefore(box, host);
  V.panelKey=d.key;
  wirePanel(box, d);
  CL.focus(d.key);
  if(CL.detail && CL.detail.key===d.key) renderPanel(CL.detail);
};
V.afterCloseInfo=function(){ V.panelKey=null; CL.focus(null); };

const CTL=[
  // key, label EN, label SK, unit kind, min, max
  ['co2Bar','CO₂','CO₂','gas'],
  ['n2Bar','N₂ + Ar','N₂ + Ar','gas'],
  ['o2Bar','O₂','O₂','gas'],
  ['ch4Bar','CH₄','CH₄','gas'],
  ['h2Bar','H₂ envelope','H₂ obal','gas'],
  ['water','Water (Earth oceans)','Voda (zemské oceány)','ocean'],
  ['landAlbedo','Ground albedo (0–1)','Albedo povrchu (0–1)','frac'],
  ['obliquity','Axial tilt (°)','Sklon osi (°)','num'],
  ['internalHeat','Interior heat (W/m²)','Vnútorné teplo (W/m²)','num'],
  ['biosphere','Biosphere (× Earth)','Biosféra (× Zem)','num'],
];
function panelSkeleton(d){
  const t=(en,sk)=>L(en,sk);
  let rows='';
  for(const c of CTL){
    if(c[3]==='gas' && c===CTL.find(x=>x[3]==='gas'))
      rows+='<div class="clim-hint clim-gas-note">'+t('Gases: partial pressure at the surface. Type a pressure (0.5 bar, 3 mbar, 2 atm, 10 Pa) or a share of the air (21 %, 420 ppm).',
        'Plyny: parciálny tlak pri povrchu. Zadajte tlak (0,5 bar, 3 mbar, 2 atm, 10 Pa) alebo podiel vo vzduchu (21 %, 420 ppm).')+'</div>';
    rows+='<div class="clim-row"><label>'+t(c[1],c[2])+'</label><input type="text" inputmode="decimal" data-k="'+c[0]+'" data-u="'+c[3]+'" spellcheck="false"></div>';
  }
  rows+='<div class="clim-row"><label>'+t('Tidally locked to the star','Viazaná rotácia voči hviezde')+'</label><input type="checkbox" data-k="tidallyLocked"></div>';
  return '<div class="clim-hd"><span class="clim-title">🌡 '+t('Climate','Klíma')+'</span>'
    +'<span class="clim-state"></span><span class="clim-lag"></span></div>'
    +'<div class="clim-big"><b class="clim-T">…</b><span class="clim-range"></span></div>'
    +'<div class="clim-blurb"></div>'
    +'<canvas class="clim-bands" width="400" height="92"></canvas>'
    +'<canvas class="clim-hist" width="400" height="46"></canvas>'
    +'<table class="clim-tab"></table>'
    +'<details class="clim-ctl"><summary>⚙ '+t('Change this world','Upraviť tento svet')+'</summary>'
    +'<div class="clim-quick">'
    +'<button class="btn sm" data-q="co2x10">CO₂ ×10</button><button class="btn sm" data-q="co2d10">CO₂ ÷10</button>'
    +'<button class="btn sm" data-q="water+1">+1 '+t('ocean','oceán')+'</button><button class="btn sm" data-q="dry">'+t('Remove water','Odstrániť vodu')+'</button>'
    +'<button class="btn sm" data-q="terra">🌍 '+t('Earth-like air','Vzduch ako na Zemi')+'</button>'
    +'<button class="btn sm" data-q="reset">↺ '+t('Reset climate','Obnoviť klímu')+'</button></div>'
    +rows+'<div class="clim-hint">'+t('Click a value to type it; units work.',
      'Hodnotu môžete napísať aj s jednotkou.')+'</div></details>'
    +'<p class="clim-note"></p>';
}
function parseQty(s, kind){
  if(s==null) return NaN;
  s=String(s).trim().replace(',', '.').toLowerCase();
  const m=s.match(/^([-+]?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?)\s*([a-zµ%]*)$/i);
  if(!m) return NaN;
  let v=parseFloat(m[1]); const u=m[2];
  if(kind==='frac' && u==='%') v*=0.01;
  return v;
}
// A typed gas amount, in bar of partial pressure. A pressure unit gives the
// partial pressure itself. A share of the air (%, ppm, ppb) is read against the
// rest of the air as it is now, so "420 ppm" of CO2 is 420 ppm of the air it ends
// up in -- not 420 millionths of a bar, which is what it means only on a world
// whose air happens to weigh one bar.
const P_UNITS={'':1, bar:1, bars:1, mbar:1e-3, hpa:1e-3, ubar:1e-6, pa:1e-5, kpa:1e-2,
  atm:1.01325, torr:1.01325/760, mmhg:1.01325/760};
const SHARE_UNITS={'%':1e-2, ppm:1e-6, ppb:1e-9};
function parseGas(s, own, pTot){
  if(s==null) return NaN;
  s=String(s).trim().replace(',', '.').toLowerCase().replace(/[µμ]/g, 'u');
  const m=s.match(/^([-+]?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?)\s*([a-z%]*)$/);
  if(!m) return NaN;
  const v=parseFloat(m[1]), u=m[2];
  if(u in P_UNITS) return v*P_UNITS[u];
  if(u in SHARE_UNITS){
    const f=v*SHARE_UNITS[u], others=Math.max((pTot||0)-(own||0), 0);
    if(!(f>=0 && f<1) || !(others>0)) return NaN;   // a share of nothing, or all of it
    return f*others/(1-f);
  }
  return NaN;
}
// Pressures are pressures: bar, mbar, µbar, then pascals. Never ppm -- that is a
// share of the air, and a total pressure is not a share of anything.
function fmtPressure(bar){
  if(!(bar===bar)) return '—';
  if(!(bar>1e-14)) return '0 bar';
  const sig=(x)=>String(+x.toPrecision(3));
  if(bar>=0.1) return sig(bar)+' bar';
  if(bar>=1e-3) return sig(bar*1e3)+' mbar';
  if(bar>=1e-6) return sig(bar*1e6)+' µbar';
  const pa=bar*1e5;
  return (pa>=1e-3 ? sig(pa) : pa.toExponential(1))+' Pa';
}
// A share of the air: percent, then ppm (down to 0.01 ppm, so methane reads as
// the familiar 0.8 ppm), then ppb.
function fmtShare(f){
  if(f>=0.01) return String(+(f*100).toPrecision(3))+' %';
  if(f>=1e-8) return String(+(f*1e6).toPrecision(3))+' ppm';
  return String(+(f*1e9).toPrecision(2))+' ppb';
}
// "1 Earth ocean", "0.627 Earth oceans"; Slovak counts in four forms
function oceansWord(n){
  if(!(typeof LANG!=='undefined' && LANG==='sk')) return n==='1'?'Earth ocean':'Earth oceans';
  if(/[.e]/.test(n)) return 'zemského oceánu';
  const k=+n;
  return k===1?'zemský oceán':(k>=2&&k<=4)?'zemské oceány':'zemských oceánov';
}
function fmtNum(v){ if(!(v===v)) return '—'; const a=Math.abs(v);
  if(a===0) return '0'; if(a>=1e4||a<1e-3) return v.toExponential(2); return String(+v.toPrecision(3)); }
const GAS_OF={co2Bar:'co2', n2Bar:'n2', o2Bar:'o2', ch4Bar:'ch4', h2Bar:'h2'};
function wirePanel(box, d){
  box.querySelectorAll('input[data-k]').forEach(inp=>{
    if(inp.type==='checkbox'){
      inp.onchange=()=>CL.set(d.key, {tidallyLocked: inp.checked});
      return;
    }
    inp.addEventListener('focus', ()=>{ inp.dataset.editing='1'; });
    inp.addEventListener('blur', ()=>{ inp.dataset.editing=''; });
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ inp.blur(); } e.stopPropagation(); });
    inp.addEventListener('change', ()=>{
      const k=inp.dataset.k, det=CL.detail&&CL.detail.key===d.key?CL.detail:null;
      const own=det&&det.gas?det.gas[GAS_OF[k]]:0;
      const v=inp.dataset.u==='gas' ? parseGas(inp.value, own, det?det.pTot:0) : parseQty(inp.value, inp.dataset.u);
      if(!(v>=0) && !(k==='obliquity' && v===v)) { inp.classList.add('bad'); return; }
      inp.classList.remove('bad');
      CL.set(d.key, {[k]: v});
    });
  });
  box.querySelectorAll('[data-q]').forEach(btn=>{
    btn.onclick=()=>{
      const q=btn.dataset.q, det=CL.detail&&CL.detail.key===d.key?CL.detail:null;
      if(q==='reset'){ CL.reset(d.key); return; }
      if(!det) return;
      if(q==='co2x10') CL.set(d.key,{co2Bar:Math.max(det.gas.co2*10, 1e-6)});
      if(q==='co2d10') CL.set(d.key,{co2Bar:det.gas.co2/10});
      if(q==='water+1') CL.set(d.key,{water:(det.water.total||0)+1});
      if(q==='dry') CL.set(d.key,{water:0});
      if(q==='terra'){
        const g=det.g||9.8, colFactor=9.807/g;          // same column of air as Earth's, per unit area
        CL.set(d.key,{n2Bar:0.78/colFactor, o2Bar:0.21/colFactor, co2Bar:280e-6/colFactor, ch4Bar:0.8e-6/colFactor,
          water:Math.max(det.water.total||0, 1*(det.params.mass||1)), biosphere:1});
      }
    };
  });
}
function renderPanel(det){
  const box=document.getElementById('i-climate'); if(!box || !det) return;
  const t=(en,sk)=>L(en,sk);
  const st=det.state;
  const stEl=box.querySelector('.clim-state');
  if(st){ stEl.textContent=stateName(st.id, st.name); stEl.style.setProperty('--c', st.color); stEl.title=stateBlurb(st.id, st.blurb); }
  box.querySelector('.clim-blurb').textContent=st?stateBlurb(st.id, st.blurb):'';
  const lag=box.querySelector('.clim-lag');
  lag.textContent=det.lag<0.9?('⏳ '+Math.round(det.lag*100)+'%'):'';
  lag.title=t('This climate is running slower than the clock: the physics is taking small steps through a fast change.',
    'Táto klíma beží pomalšie než čas: model prechádza rýchlou zmenou po malých krokoch.');
  // the mean heads the card, as in the sandbox; an ocean buried under a steam
  // lid gets its own row below rather than posing as the planet's temperature
  box.querySelector('.clim-T').textContent=fmtT(det.Tmean)+'  ·  '+Math.round(det.Tmean)+' K';
  const buried=det.surface && det.surface.surfaceKind==='buried ocean' && det.surface.surfaceT>0 ? det.surface.surfaceT : null;
  box.querySelector('.clim-range').textContent=t('range ','rozsah ')+fmtT(det.Tmin)+' … '+fmtT(det.Tmax);
  drawBands(box.querySelector('.clim-bands'), det);
  drawHist(box.querySelector('.clim-hist'), det);
  const g=det.gas;
  // the air as shares of itself, which is what "426 ppm" has always meant
  const gsum=(g.n2||0)+(g.o2||0)+(g.co2||0)+(g.ch4||0)+(g.h2||0)+(g.h2o||0);
  const comp=gsum>1e-14 ? [['N₂',g.n2],['O₂',g.o2],['CO₂',g.co2],['CH₄',g.ch4],['H₂+He',g.h2],['H₂O',g.h2o]]
    .map(x=>[x[0],(x[1]||0)/gsum]).filter(x=>x[1]>1e-9).sort((a,b)=>b[1]-a[1])
    .map(x=>x[0]+' '+fmtShare(x[1])).join(' · ') : '';
  const w=det.water;
  const rows=[
    [t('Starlight','Žiarenie hviezdy'), (+(det.flux/S_EARTH).toPrecision(3))+' S⊕ · '+Math.round(det.flux)+' W/m²'],
    [t('Surface pressure','Tlak pri povrchu'), fmtPressure(det.pTot)],
    ...(buried ? [[t('Buried ocean, top','Pochovaný oceán, vrch'), fmtT(buried)+' '+t('under the steam','pod parou')]] : []),
    [t('Air','Vzduch'), comp||t('none','žiadny')],
    [t('Reflects (albedo)','Odráža (albedo)'), Math.round(det.albedo*100)+' %'+' · '+t('cloud','oblačnosť')+' '+Math.round(det.cloud*100)+' %'],
    [t('Water','Voda'), w.total>0 ? (fmtNum(w.total)+' '+oceansWord(fmtNum(w.total))+' — '+t('sea','more')+' '+fmtNum(w.ocean)+', '+t('ice','ľad')+' '+fmtNum((w.seaIce||0)+(w.landIce||0))+', '+t('air','vzduch')+' '+fmtNum(w.vapour)+(w.lost>1e-4?', '+t('lost','stratené')+' '+fmtNum(w.lost):'')) : t('none','žiadna')],
    // open water and ice, never "sea" for a sea that is frozen solid
    [t('Open sea · ice','Voľné more · ľad'), Math.round((det.openOcean!=null?det.openOcean:(det.flooded||0))*100)+' % · '+Math.round((det.iceArea||0)*100)+' %'],
    [t('Energy in − out','Energia dnu − von'), (det.imbalance>=0?'+':'')+det.imbalance.toFixed(2)+' W/m²'+(det.pulse>1?' · 💥 '+t('impact heat','teplo z dopadu'):'')],
  ];
  // heat the world's parent raises in it by flexing it round its orbit
  if(det.meta && det.meta.heat==='tidal'){
    const cv=V.bodies.get(det.key), pk=cv && cv.rec.data.parent, par=pk && bodies.find(b=>b.data.key===pk);
    rows.push([t('Tidal heat','Slapové teplo'), fmtNum(det.params.internalHeat)+' W/m²'+(par?t(', from ',' · spôsobuje ')+locName(par.data):'')]);
  }
  if(det.bio>0.001 || det.params.biosphere>0) rows.push([t('Living biosphere','Živá biosféra'), Math.round(det.bio*100)+' % '+t('of Earth\'s','zemskej')]);
  rows.push([t('Climate clock','Čas klímy'), fmtElapsed(det.time)]);
  const tab=box.querySelector('.clim-tab');
  tab.innerHTML=rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  // live control values (not while someone is typing in them)
  const live={co2Bar:g.co2, n2Bar:g.n2, o2Bar:g.o2, ch4Bar:g.ch4, h2Bar:g.h2, water:w.total,
    landAlbedo:det.params.landAlbedo, obliquity:det.params.obliquity, internalHeat:det.params.internalHeat,
    biosphere:det.params.biosphere};
  box.querySelectorAll('input[data-k]').forEach(inp=>{
    const k=inp.dataset.k;
    if(inp.type==='checkbox'){ inp.checked=!!det.params.tidallyLocked; return; }
    if(inp.dataset.editing==='1') return;
    const v=live[k];
    inp.value = inp.dataset.u==='gas' ? fmtPressure(v) : fmtNum(v);
  });
  const note=box.querySelector('.clim-note');
  const mt=det.meta||{};
  note.textContent = mt.note==='acid'
    ? t('Nephtys\'s seas are sulphuric acid; this model has one solvent, water, so the acid sea is scenery and the climate under it is a dry CO₂ greenhouse at the documented 231 °C.',
        'Moria Nephtys sú z kyseliny sírovej; model pozná len vodu, takže kyslé more je kulisa a klíma pod ním je suchý skleník CO₂ pri uvádzaných 231 °C.')
    : '';
}
function stateBlurb(id, en){
  if(typeof LANG!=='undefined' && LANG==='sk' && SK_BLURBS[id]) return SK_BLURBS[id];
  return en;
}
function tempColorCss(K){
  const c=K-273.15;
  const st=[[-150,[46,0,77]],[-75,[59,76,192]],[-25,[95,168,255]],[0,[222,244,255]],[15,[128,219,112]],
    [30,[245,215,66]],[60,[245,138,41]],[150,[215,48,31]],[500,[139,0,0]],[1500,[255,240,192]]];
  if(c<=st[0][0]) return 'rgb('+st[0][1].join(',')+')';
  for(let i=1;i<st.length;i++) if(c<=st[i][0]){
    const f=(c-st[i-1][0])/(st[i][0]-st[i-1][0]), a=st[i-1][1], b=st[i][1];
    return 'rgb('+a.map((v,j)=>Math.round(v+(b[j]-v)*f)).join(',')+')';
  }
  return 'rgb('+st[st.length-1][1].join(',')+')';
}
function drawBands(cv, det){
  if(!cv) return;
  const W=cv.width, H=cv.height, x=cv.getContext('2d');
  x.clearRect(0,0,W,H);
  const T=det.bands, n=T.length;
  let lo=Math.min(...T, 273.15)-5, hi=Math.max(...T, 273.15)+5;
  const pad=16, bw=(W-pad*2)/n;
  const y=(v)=>H-12-(v-lo)/(hi-lo)*(H-22);
  for(let i=0;i<n;i++){
    x.fillStyle=tempColorCss(T[i]);
    const yy=y(T[i]);
    x.fillRect(pad+i*bw+1, yy, bw-2, H-12-yy);
    if(det.ice[i]>0.05){ x.fillStyle='rgba(235,245,255,'+(0.25+0.6*det.ice[i]).toFixed(2)+')'; x.fillRect(pad+i*bw+1, yy-3, bw-2, 3); }
  }
  // freezing line
  const yf=y(273.15);
  x.strokeStyle='rgba(180,220,255,.55)'; x.setLineDash([3,3]); x.beginPath(); x.moveTo(pad,yf); x.lineTo(W-pad,yf); x.stroke(); x.setLineDash([]);
  x.fillStyle='#8ea2c0'; x.font='10px system-ui,sans-serif';
  const locked=det.params.tidallyLocked;
  x.fillText(locked?L('night','noc'):L('S pole','J pól'), pad, H-1);
  x.textAlign='right'; x.fillText(locked?L('under the star','pod hviezdou'):L('N pole','S pól'), W-pad, H-1);
  x.textAlign='center'; x.fillText(locked?L('terminator','terminátor'):L('equator','rovník'), W/2, H-1);
  x.textAlign='left'; x.fillText('0 °C', 2, yf-2);
}
function drawHist(cv, det){
  if(!cv) return;
  const W=cv.width, H=cv.height, x=cv.getContext('2d');
  x.clearRect(0,0,W,H);
  const h=det.history; if(!h || h.length<2) return;
  const t0=h[0][0], t1=h[h.length-1][0];
  let lo=Infinity, hi=-Infinity; for(const p of h){ lo=Math.min(lo,p[1]); hi=Math.max(hi,p[1]); }
  if(hi-lo<2){ lo-=1; hi+=1; }
  x.strokeStyle='#ffcf7a'; x.lineWidth=1.5; x.beginPath();
  h.forEach((p,i)=>{ const px=4+(p[0]-t0)/Math.max(t1-t0,1e-9)*(W-8), py=H-6-(p[1]-lo)/(hi-lo)*(H-14);
    if(i) x.lineTo(px,py); else x.moveTo(px,py); });
  x.stroke();
  x.fillStyle='#8ea2c0'; x.font='10px system-ui,sans-serif';
  x.fillText(fmtT(hi), 4, 10); x.fillText(fmtT(lo), 4, H-1);
  x.textAlign='right'; x.fillText(L('last ','posledných ')+fmtElapsed(t1-t0), W-4, 10); x.textAlign='left';
}
function insertLumPanel(d){
  const host=document.getElementById('i-gallery')||document.getElementById('i-desc'); if(!host) return;
  const base=LUMINOUS[d.key]; if(!base) return;
  const box=document.createElement('div'); box.id='i-climate'; box.className='clim';
  const sc=V.lumScale[d.key]!=null?V.lumScale[d.key]:1;
  box.innerHTML='<div class="clim-hd"><span class="clim-title">☀ '+L('Light','Svetlo')+'</span></div>'
    +'<div class="clim-row"><label>'+L('Luminosity (× Sun)','Svietivosť (× Slnko)')+'</label><input type="text" inputmode="decimal" id="clim-lum" value="'+fmtNum(base.L*sc)+'"></div>'
    +'<div class="clim-hint">'+L('Every world\'s climate follows: brighten the star and watch the oceans go; dim it and watch them freeze.',
      'Klíma všetkých svetov sa prispôsobí: zjasnite hviezdu a oceány sa vyparia, stlmte ju a zamrznú.')+'</div>';
  host.parentNode.insertBefore(box, host);
  const inp=box.querySelector('#clim-lum');
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); e.stopPropagation(); });
  inp.addEventListener('change', ()=>{
    const v=parseQty(inp.value,'num');
    if(!(v>=0)){ inp.classList.add('bad'); return; }
    inp.classList.remove('bad');
    V.lumScale[d.key]=v/base.L;
  });
}

/* ---------------- saving ---------------- */
V.save=function(){
  return CL.snapshot().then(worlds=>{
    try{ localStorage.setItem(climKey(), JSON.stringify({v:1, worlds, lum:V.lumScale})); return true; }
    catch(_){ return false; }
  });
};
V.bundle=function(){ return CL.snapshot().then(worlds=>({v:1, worlds, lum:V.lumScale})); };
V.clearSaved=function(){ try{ localStorage.removeItem(climKey()); }catch(_){} };

/* ---------------- Slovak ---------------- */
const SK_STATES={smallWaterworld:'Malý vodný svet',evaporatingWaterworld:'Vyparujúci sa vodný svet',magma:'Magmatický oceán',
  dryRunaway:'Suchý nekontrolovateľný skleníkový efekt',steamRunaway:'Parný nekontrolovateľný skleníkový efekt',
  moist:'Vlhký skleník',hothouse:'Skleník bez ľadu',temperate:'Mierny a obývateľný',dune:'Púštny svet',
  waterworld:'Oceánsky svet',eyeball:'Očná guľa',lobster:'Homár',twilight:'Súmračný svet',
  trapped:'Púšť s vodou na nočnej strane',waterbelt:'Vodný pás',subglacial:'Oceán pod ľadom',snowball:'Snehová guľa',
  marslike:'Kolaps atmosféry ako na Marse',nightfrost:'Čiastočné vymŕzanie na nočnej strane',nightfrozen:'Vymrznutá nočná strana',
  titan:'Svet ako Titan',frozen:'Zamrznutá púšť',thincold:'Riedka studená púšť',baked:'Vyprahnutá púšť',airless:'Holá skala',
  hycean:'Hyceánsky svet',lowSunHycean:'Hyceánsky svet so slabým svetlom',buriedOcean:'Pochovaný oceán',
  supercriticalEnvelope:'Nadkritický oceán'};
const SK_BLURBS=window.RA_CLIMATE_SK_BLURBS||{};
})();
