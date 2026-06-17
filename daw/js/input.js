'use strict';
/* ================================================================ 
   DAW INPUT (pan, pinch, zoom, MOD menu, wire mode) - pure extraction
   ================================================================ */

/* ---------- pan + pinch-zoom (multi-touch, anchored, no-jump) ---------- */
const ptrs = new Map();
let panning=false, panArmed=false, panSX=0, panSY=0, panOX=0, panOY=0;
let pinch=null;
function isField(t){ return t===field || t===wiresCv || t===world; }
function twoPts(){ const a=[]; ptrs.forEach(v=>a.push(v)); return a; }

field.addEventListener('pointerdown', ev=>{
  if(!isField(ev.target)) return;
  const r=fieldRect();
  ptrs.set(ev.pointerId, {x:ev.clientX-r.left, y:ev.clientY-r.top});
  field.setPointerCapture(ev.pointerId);
  if(ptrs.size===1){
    panArmed=true; panning=false; panSX=ev.clientX; panSY=ev.clientY; panOX=panX; panOY=panY;
  } else if(ptrs.size===2){
    panArmed=false; panning=false; field.classList.remove('panning');
    startPinch();
  }
});
field.addEventListener('pointermove', ev=>{
  if(!ptrs.has(ev.pointerId)) return;
  const r=fieldRect();
  ptrs.set(ev.pointerId, {x:ev.clientX-r.left, y:ev.clientY-r.top});
  if(ptrs.size>=2){ doPinch(); return; }
  if(!panArmed) return;
  const dx=ev.clientX-panSX, dy=ev.clientY-panSY;
  if(!panning){
    if(Math.abs(dx)+Math.abs(dy) < 4) return;   // dead-zone: ignore micro-jitter
    panning=true; field.classList.add('panning');
  }
  panX = panOX + dx; panY = panOY + dy;
  applyTransform(); drawWires();
});
function startPinch(){
  const a=twoPts(); if(a.length<2){ pinch=null; return; }
  const mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
  const d=Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y)||1;
  const w=screenToWorld(mx,my);
  pinch={s0:S, d0:d, wx:w[0], wy:w[1]};
}
function doPinch(){
  if(!pinch){ startPinch(); return; }
  const a=twoPts(); if(a.length<2) return;
  const mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
  const d=Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y)||1;
  S=clampS(pinch.s0 * (d/pinch.d0));
  panX = mx - pinch.wx*S; panY = my - pinch.wy*S;   // anchor world point under the pinch midpoint
  applyTransform(); drawWires();
}
function endPtr(ev){
  if(ptrs.has(ev.pointerId)) ptrs.delete(ev.pointerId);
  if(ptrs.size===1){
    /* dropped from pinch to one finger: rebase pan, no jump */
    pinch=null;
    const only=twoPts()[0], r=fieldRect();
    panArmed=true; panning=false;
    panSX=only.x+r.left; panSY=only.y+r.top; panOX=panX; panOY=panY;
  } else if(ptrs.size===0){
    if(panning){ saved.pan=[panX,panY]; }
    panArmed=false; panning=false; pinch=null; field.classList.remove('panning');
    saved.scale=S; persist();
  }
}
field.addEventListener('pointerup', endPtr);
field.addEventListener('pointercancel', endPtr);

/* ---------- zoom buttons + fit ---------- */
function zoomAround(fx, fy, factor){
  const w=screenToWorld(fx,fy);
  S=clampS(S*factor);
  panX=fx-w[0]*S; panY=fy-w[1]*S;
  applyTransform(); drawWires(); saved.scale=S; persist();
}
function zoomBtn(factor){ const r=fieldRect(); zoomAround(r.width/2, r.height/2, factor); }
function fitView(){
  const list = placedList();
  if(!list.length){ toast('MATRIX EMPTY — ADD A MODULE'); return; }
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  list.forEach(m=>{ const el=nodeEls[m.id]; if(!el) return;
    minx=Math.min(minx,m.x); miny=Math.min(miny,m.y);
    maxx=Math.max(maxx,m.x+el.offsetWidth); maxy=Math.max(maxy,m.y+el.offsetHeight); });
  const r=fieldRect(), pad=40, bw=(maxx-minx)+pad*2, bh=(maxy-miny)+pad*2;
  S=clampS(Math.min(r.width/bw, r.height/bh));
  panX=(r.width-(maxx-minx)*S)/2 - minx*S;
  panY=(r.height-(maxy-miny)*S)/2 - miny*S;
  applyTransform(); drawWires(); saved.scale=S; saved.pan=[panX,panY]; persist();
}
document.getElementById('zoomIn').addEventListener('click', ()=>zoomBtn(1.2));
document.getElementById('zoomOut').addEventListener('click', ()=>zoomBtn(1/1.2));
document.getElementById('zoomFit').addEventListener('click', fitView);

/* ---------- node dragging ---------- */
function makeNodeDraggable(el, m){
  let drag=false, sx=0, sy=0, ox=0, oy=0, moved=false;
  el.addEventListener('pointerdown', ev=>{
    if(ev.target.closest('.open,.ndclose,.nresize')) return;
    drag=true; moved=false; sx=ev.clientX; sy=ev.clientY; ox=m.x; oy=m.y;
    el.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  });
  el.addEventListener('pointermove', ev=>{
    if(!drag) return;
    const dx=ev.clientX-sx, dy=ev.clientY-sy;
    if(!moved){ if(Math.abs(dx)+Math.abs(dy) < 5) return; moved=true; }
    m.x = ox+dx/S; m.y = oy+dy/S;
    el.style.left = m.x+'px'; el.style.top = m.y+'px';
    drawWires(); renderBadges();
  });
  el.addEventListener('pointerup', ev=>{
    if(drag){ drag=false; if(moved){ persist(); }
      /* suppress the click that follows a drag */
      if(moved){ const stop=e=>{e.stopPropagation();};
        el.addEventListener('click', stop, {capture:true, once:true}); } }
  });
  el.addEventListener('pointercancel', ()=>{ drag=false; });

/* ---------- wire mode ---------- */
let wireMode=false, wireSrc=null;
const wireBtn = document.getElementById('wireBtn');
wireBtn.addEventListener('click', ()=>{
  wireMode = !wireMode; wireSrc=null;
  wireBtn.classList.toggle('active', wireMode);
  Object.values(nodeEls).forEach(e=>e.classList.remove('wiresrc'));
  toast(wireMode ? 'WIRE MODE — TAP SOURCE NODE, THEN TARGET' : 'WIRE MODE OFF');
  drawWires();
});
function wireTap(id){
  if(!wireSrc){
    wireSrc = id;
    nodeEls[id].classList.add('wiresrc');
    toast('SOURCE: '+id.toUpperCase()+' — NOW TAP TARGET');
  } else if(wireSrc === id){
    wireSrc = null; nodeEls[id].classList.remove('wiresrc');
    toast('WIRE CANCELLED');
  } else {
    const exists = wiresList.findIndex(w=>w.from===wireSrc && w.to===id);
    if(exists >= 0){
      wiresList.splice(exists,1);
      toast('WIRE REMOVED: '+wireSrc.toUpperCase()+' → '+id.toUpperCase());
    } else {
      wiresList.push({from:wireSrc, to:id});
      toast('WIRED: '+wireSrc.toUpperCase()+' → '+id.toUpperCase());
    }
    nodeEls[wireSrc].classList.remove('wiresrc');
    wireSrc = null;
    persist(); announceRoster();
  }
  drawWires(); renderBadges();
}
document.getElementById('clearBtn').addEventListener('click', ()=>{
  if(!wiresList.length){ toast('NO WIRES'); return; }
  wiresList = []; persist(); drawWires(); renderBadges(); toast('ALL WIRES CLEARED');
});

/* ================================================================ 
   MOD DROPDOWN — add / remove modules from the matrix
   ================================================================ */
const modBtn  = document.getElementById('modBtn');
const modmenu = document.getElementById('modmenu');
const modlist = document.getElementById('modlist');
function buildMenu(){
  modlist.innerHTML = '';
  CATALOG.forEach(m=>{
    const it = document.createElement('div'); it.className = 'mitem';
    it.innerHTML = '<span class="sw" style="background:'+(m.color||'#4a5260')+'"></span>'+
      '<span class="mn">'+esc(m.name)+'</span><span class="mtag">ADD</span>';
    it.addEventListener('click', ()=>{ placed.has(m.id) ? removeNode(m) : addNode(m); });
    modlist.appendChild(it); m._mi = it;
  });
  refreshMenu();
}
function refreshMenu(){
  CATALOG.forEach(m=>{ const it = m._mi; if(!it) return;
    const on = placed.has(m.id);
    it.classList.toggle('on', on);
    it.querySelector('.mtag').textContent = on ? 'REMOVE' : 'ADD';
  });
}
function toggleMenu(open){
  const willOpen = (open===undefined) ? !modmenu.classList.contains('open') : open;
  modmenu.classList.toggle('open', willOpen);
  modBtn.classList.toggle('active', willOpen);
  if(willOpen){
    const r = modBtn.getBoundingClientRect();
    let left = Math.min(r.left, innerWidth - modmenu.offsetWidth - 8);
    modmenu.style.left = Math.max(8, left)+'px';
    modmenu.style.top  = (r.bottom + 6)+'px';
  }
}
modBtn.addEventListener('click', e=>{ e.stopPropagation(); toggleMenu(); });
document.addEventListener('pointerdown', e=>{
  if(modmenu.classList.contains('open') && !modmenu.contains(e.target) && e.target!==modBtn)
    toggleMenu(false);
});

addEventListener('resize', layoutWorld);