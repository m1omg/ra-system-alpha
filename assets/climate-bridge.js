/* ============================================================
   Climate bridge — the main thread's end of the climate engine.

   The physics (assets/climate/, the planet-climate-sandbox model)
   runs in a module Web Worker, so a dual-core laptop draws the
   orrery on one core while the other carries the climate. Where a
   worker cannot be had (an old browser) the same host runs on the
   main thread instead, with a per-frame budget. Opened from disk
   (file://) neither can load ES modules, so the orrery runs without
   climate and says so.

   Everything here is transport: queueing until the worker is ready,
   keeping the latest render record per world, and handing replies
   to whoever asked. What the records MEAN lives in climate-view.js.
   ============================================================ */
(function(){
  'use strict';
  const listeners={};
  const states=new Map();              // key -> Float32Array render record
  const initial=new Map();             // key -> Float32Array record at creation
  const metas=new Map();               // key -> profile meta
  let worker=null, local=null, ready=false, failed=false, mode='none';
  let queue=[];
  let RS=null, STATE_IDS=[], STATES={};
  let snapId=0; const snapWaiters=new Map();
  let lastDetail=null, stats=null;

  function emit(type, payload){ (listeners[type]||[]).forEach(fn=>{ try{ fn(payload); }catch(err){ console.error(err); } }); }
  function on(type, fn){ (listeners[type]||(listeners[type]=[])).push(fn); }

  function onMessage(m){
    switch(m.type){
      case 'ready':
        RS=m.RS; STATE_IDS=m.STATE_IDS; STATES=m.STATES; ready=true;
        const q=queue; queue=[];
        q.forEach(x=>post(x.msg, x.transfer));
        emit('ready', {mode});
        break;
      case 'added':
        if(m.meta) metas.set(m.key, m.meta);
        if(m.rs0){ initial.set(m.key, m.rs0); states.set(m.key, Float32Array.from(m.rs0)); }
        emit('added', m);
        break;
      case 'state': {
        const n=m.keys.length, S=RS.SIZE;
        for(let i=0;i<n;i++){
          let rec=states.get(m.keys[i]);
          if(!rec || rec.length!==S){ rec=new Float32Array(S); states.set(m.keys[i], rec); }
          rec.set(m.data.subarray(i*S,(i+1)*S));
        }
        emit('state', m.keys);
        break;
      }
      case 'detail': lastDetail=m.detail; emit('detail', m.detail); break;
      case 'snapshot': { const fn=snapWaiters.get(m.id); snapWaiters.delete(m.id); if(fn) fn(m.worlds); break; }
      case 'analysis': emit('analysis', m); break;
      case 'analysis-failed': emit('analysis-failed', m); break;
      case 'stats': stats=m; emit('stats', m); break;
      case 'error': console.warn('[climate]', m.where, m.key||'', m.message); emit('error', m); break;
    }
  }

  function post(msg, transfer){
    if(failed) return;
    if(!ready && msg.type!=='__init'){ queue.push({msg, transfer}); return; }
    if(worker) worker.postMessage(msg, transfer||[]);
    else if(local) local.handle(msg);
  }

  // Captured while this script is executing: document.currentScript is null
  // by the time start() runs, and the worker must resolve against this file,
  // not against the page.
  const SCRIPT_SRC=(document.currentScript&&document.currentScript.src)||location.href;

  function startLocal(reason){
    if(local || failed) return;
    mode='local';
    console.warn('[climate] running on the main thread:', reason);
    import('./climate/hostcore.js').then(mod=>{
      local=mod.createHost((msg)=>onMessage(msg));
      local.ready();
    }).catch(err=>{
      failed=true; mode='none';
      console.warn('[climate] unavailable:', err && err.message);
      emit('unavailable', {reason: String(err && err.message || err)});
    });
  }

  function start(){
    if(worker || local || failed) return;
    if(typeof location!=='undefined' && location.protocol==='file:'){
      failed=true; mode='none';
      setTimeout(()=>emit('unavailable', {reason:'file'}), 0);
      return;
    }
    try{
      const url=new URL('climate/worker.js', SCRIPT_SRC);
      worker=new Worker(url, {type:'module'});
      mode='worker';
      worker.onmessage=e=>onMessage(e.data);
      worker.onerror=e=>{
        // A module worker that fails to load reports here before 'ready';
        // after 'ready' an error is a bug in the physics, not a missing worker.
        if(!ready){ worker.terminate(); worker=null; e.preventDefault&&e.preventDefault(); startLocal('worker failed: '+(e.message||'load error')); }
        else console.error('[climate worker]', e.message);
      };
    }catch(err){ worker=null; startLocal('no module workers ('+err.message+')'); }
  }
  // On the main-thread fallback there is nobody else to run the physics: the
  // orrery's frame loop calls this with what it can spare.
  function frame(budgetMs){
    if(!local) return;
    local.work(budgetMs);
    local.flush();
  }

  function snapshot(){
    return new Promise(res=>{
      if(!ready){ res({}); return; }
      const id=++snapId;
      snapWaiters.set(id, res);
      post({type:'snapshot', id});
      setTimeout(()=>{ if(snapWaiters.has(id)){ snapWaiters.delete(id); res({}); } }, 3000);
    });
  }

  window.RAClimate={
    start, on, frame, snapshot,
    get ready(){ return ready; }, get mode(){ return mode; }, get failed(){ return failed; },
    get RS(){ return RS; }, get STATE_IDS(){ return STATE_IDS; }, get STATES(){ return STATES; },
    get stats(){ return stats; }, get detail(){ return lastDetail; },
    state:(k)=>states.get(k)||null,
    initial:(k)=>initial.get(k)||null,
    meta:(k)=>metas.get(k)||null,
    has:(k)=>states.has(k),
    add:(key, sys, data, flux, starTemp, snapshot)=>post({type:'add', key, sys, data, flux, starTemp, snapshot}),
    remove:(key)=>{ states.delete(key); initial.delete(key); metas.delete(key); post({type:'remove', key}); },
    reset:(key)=>post({type:'reset', key}),
    tick:(dt, rate, forcing)=>post({type:'tick', dt, rate, forcing}),
    set:(key, patch)=>post({type:'set', key, patch}),
    impulse:(key, joules, waterKg)=>post({type:'impulse', key, joules, waterKg:waterKg||0}),
    impact:(key, o)=>post({type:'impact', key, o}),
    focus:(key)=>{ lastDetail=null; post({type:'focus', key}); },
    restore:(worlds)=>post({type:'restore', worlds}),
    analyzeUrl:(key, W, H, url, demUrl, hints, token)=>post({type:'analyzeUrl', key, W, H, url, demUrl, hints, token}),
    analyzeBitmap:(key, W, H, bitmap, demBitmap, hints, token)=>{
      const tr=[bitmap]; if(demBitmap) tr.push(demBitmap);
      if(worker) post({type:'analyzeBitmap', key, W, H, bitmap, demBitmap, hints, token}, tr);
      else {
        // no worker: read the bitmaps here
        const read=(bm)=>{ if(!bm) return null; const c=new OffscreenCanvas(W,H), x=c.getContext('2d');
          x.drawImage(bm,0,0); const d=x.getImageData(0,0,W,H).data; bm.close&&bm.close(); return d; };
        post({type:'analyze', key, W, H, rgba:read(bitmap), dem:read(demBitmap), hints, token});
      }
    },
    analyze:(key, W, H, rgba, dem, hints, token)=>{
      const tr=[rgba.buffer]; if(dem) tr.push(dem.buffer);
      post({type:'analyze', key, W, H, rgba, dem, hints, token}, tr);
    },
  };
})();
