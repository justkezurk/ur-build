'use strict';
/* ================================================================ 
   DAW NODES, WIRING, BADGES, DRAG/RESIZE (pure extraction)
   ================================================================ */

const nodeEls = {};

function buildNodeEl(m){
  const el = document.createElement('div');
  el.className = 'node';
  el.style.left = m.x+'px'; el.style.top = m.y+'px';
  if(m.w) el.style.width = m.w+'px';
  if(m.h) el.style.height = m.h+'px';
  el.innerHTML =
    '<div class="nhead"><span class="dot"></span><span class="nname">'+esc(m.name)+'</span>'+
    '<button class="ndclose" title="remove module">'+icoClose()+'</button></div>'+
    '<div class="nbody"><button class="open">OPEN</button><span class="stat">…</span></div>'+
    '<span class="port in"></span><span class="port out"></span><div class="nresize"></div>';
  world.appendChild(el);
  nodeEls[m.id] = el;
  el.querySelector('.open').addEventListener('click', ev=>{
    ev.stopPropagation(); openModule(m);
  });
  el.querySelector('.ndclose').addEventListener('click', ev=>{
    ev.stopPropagation();
    confirmDialog('Close '+m.name+'?  This removes the module from the matrix and clears its connections.',
      ()=>removeNode(m));
  });
  /* wire-mode tap targets: whole node */
  el.addEventListener('click', ()=>{ if(wireMode) wireTap(m.id); });
  makeNodeDraggable(el, m);
  makeNodeResizable(el, m);
}

/* corner drag (bottom-right) to size a node to taste — does not open it */
function makeNodeResizable(el, m){
  const h = el.querySelector('.nresize');
  let rz=false, sx=0, sy=0, w0=0, h0=0;
  h.addEventListener('pointerdown', ev=>{
    ev.stopPropagation();
    rz=true; sx=ev.clientX; sy=ev.clientY; w0=el.offsetWidth; h0=el.offsetHeight;
    h.setPointerCapture(ev.pointerId);
  });
  h.addEventListener('pointermove', ev=>{
    if(!rz) return;
    m.w = Math.round(Math.max(150, Math.min(560, w0 + (ev.clientX-sx)/S)));
    m.h = Math.round(Math.max(70,  Math.min(560, h0 + (ev.clientY-sy)/S)));
    el.style.width = m.w+'px'; el.style.height = m.h+'px';
    drawWires(); renderBadges();
  });
  h.addEventListener('pointerup', ()=>{ if(rz){ rz=false; persist(); } });
  h.addEventListener('pointercancel', ()=>{ rz=false; });
  h.addEventListener('click', ev=>ev.stopPropagation());
}

function nodeStatus(m, cls, txt){
  const el = nodeEls[m.id];
  if(!el) return;
  el.classList.remove('live','offline');
  if(cls) el.classList.add(cls);
  el.querySelector('.stat').textContent = txt;
}

/* probe a placed node: LIVE if fetchable, OFFLINE if not */
function probeNode(m){
  if(m.builtin){ m.ok = true; nodeStatus(m,'live','BUILTIN'); return; }
  fetch(m.file, {method:'HEAD'}).then(r=>{
    m.ok = r.ok;
    nodeStatus(m, r.ok?'live':'offline', r.ok?'LIVE':'NOT PORTED');
  }).catch(()=>{ m.ok=false; nodeStatus(m,'offline','NOT PORTED'); });
}

/* add / remove a module node from the matrix (driven by the MOD menu) */
let spawnSeq = 0;
function addNode(m){
  if(placed.has(m.id)){ flashNode(m.id); return; }
  const r=fieldRect(), c=screenToWorld(r.width/2, r.height/2), off=(spawnSeq++ % 5)*22;
  m.x=Math.round(c[0]-86+off); m.y=Math.round(c[1]-50+off);
  placed.add(m.id);
  buildNodeEl(m); probeNode(m);
  applyTransform(); drawWires(); persist(); refreshMenu(); announceRoster();
  toast('ADDED: '+m.name);
}
function removeNode(m){
  if(!placed.has(m.id)) return;
  if(typeof openWins!=='undefined' && openWins[m.id]) closeWin(m.id);
  const el=nodeEls[m.id]; if(el) el.remove(); delete nodeEls[m.id];
  placed.delete(m.id);
  wiresList = wiresList.filter(w=> w.from!==m.id && w.to!==m.id);
  if(wireSrc===m.id) wireSrc=null;
  delete nodeItems[m.id]; delete nodeSend[m.id]; delete itemNames[m.id];
  drawWires(); renderBadges(); persist(); refreshMenu(); announceRoster();
  toast('REMOVED: '+m.name);
}
function flashNode(id){
  const el=nodeEls[id]; if(!el) return;
  el.classList.add('wiresrc'); setTimeout(()=>el.classList.remove('wiresrc'), 320);
}

function applyTransform(){
  world.style.transform = 'translate('+panX+'px,'+panY+'px) scale('+S+')';
  field.style.backgroundPosition = panX+'px '+panY+'px';
  field.style.backgroundSize = (60*S)+'px '+(60*S)+'px';
  updateZoomLbl();
}
function layoutWorld(){
  DPR = Math.min(2, devicePixelRatio||1);
  wiresCv.width  = field.clientWidth * DPR;
  wiresCv.height = field.clientHeight * DPR;
  applyTransform();
  placedList().forEach(m=>{
    const el = nodeEls[m.id];
    if(el){ el.style.left = m.x+'px'; el.style.top = m.y+'px'; }
  });
  drawWires();
  renderBadges();
}

function portPos(id, out){
  const m = catalogById(id);
  const el = nodeEls[id];
  if(!m || !el) return [panX, panY];
  return [ panX + (m.x + (out ? el.offsetWidth : 0))*S,
           panY + (m.y + el.offsetHeight/2)*S ];
}

function drawWires(){
  wctx.setTransform(DPR,0,0,DPR,0,0);
  wctx.clearRect(0,0,wiresCv.width,wiresCv.height);
  wctx.lineWidth = 1.5; wctx.lineCap='round';
  for(const w of wiresList){
    if(!placed.has(w.from) || !placed.has(w.to)) continue;
    const [x1,y1] = portPos(w.from,true);
    const [x2,y2] = portPos(w.to,false);
    const dx = Math.max(40, Math.abs(x2-x1)*0.5);
    const grad = wctx.createLinearGradient(x1,y1,x2,y2);
    grad.addColorStop(0,'#4fd8ff'); grad.addColorStop(1,'#a86bff');
    wctx.strokeStyle = grad;
    wctx.shadowColor = '#4fd8ff'; wctx.shadowBlur = 6;
    wctx.globalAlpha = 0.9;
    wctx.beginPath();
    wctx.moveTo(x1,y1);
    wctx.bezierCurveTo(x1+dx,y1, x2-dx,y2, x2,y2);
    wctx.stroke();
  }
  wctx.globalAlpha=1; wctx.shadowBlur=0;
  /* wire-source highlight */
  if(wireMode && wireSrc && placed.has(wireSrc)){
    const [x,y] = portPos(wireSrc,true);
    wctx.fillStyle='#4fd8ff'; wctx.shadowColor='#4fd8ff'; wctx.shadowBlur=12;
    wctx.beginPath(); wctx.arc(x,y,5,0,Math.PI*2); wctx.fill();
    wctx.shadowBlur=0;
  }
}

/* ================================================================ 
   CONNECTION ITEMS + BADGES
   modules report items via {type:'ur:items', from, items:[{id,label}]}.
   badges sit at the source out-port and show WHAT is being sent;
   the node settings dropdown chooses HOW (which items + their names).
   ================================================================ */
let badgeLayer = null, btip = null, lastTapKey = null, lastTapAt = 0, tapTimer = null;

function itemsOf(id){ return nodeItems[id] || []; }
function hasItems(id){ return itemsOf(id).length > 0; }
function itemExists(id, itemId){ return itemsOf(id).some(it=>it.id===itemId); }
function itemLabel(id, itemId){
  const ov = itemNames[id] && itemNames[id][itemId];
  if(ov) return ov;
  const it = itemsOf(id).find(x=>x.id===itemId);
  return (it && it.label) || itemId;
}
function sendSet(id){ return (nodeSend[id]||[]).filter(it=>itemExists(id,it)); }
function outgoing(id){ return wiresList.some(w=>w.from===id); }
function shortLabel(s){ s=String(s); return s.length>7 ? s.slice(0,7) : s; }

function ensureBadgeLayer(){
  if(!badgeLayer){ badgeLayer=document.createElement('div'); badgeLayer.id='badgeLayer'; world.appendChild(badgeLayer); }
  if(!btip){ btip=document.createElement('div'); btip.id='btip'; document.body.appendChild(btip); }
}
function renderBadges(){
  ensureBadgeLayer();
  badgeLayer.innerHTML='';
  placedList().forEach(m=>{
    if(!outgoing(m.id) || !hasItems(m.id)) return;
    const el=nodeEls[m.id]; if(!el) return;
    const ox=m.x + el.offsetWidth, oy=m.y + el.offsetHeight/2;
    const sel=sendSet(m.id);
    let badges;
    if(sel.length===0) badges=[{kind:'gear'}];
    else if(sel.length>3) badges=[{kind:'stack', n:sel.length}];
    else badges=sel.map(it=>({kind:'item', item:it}));
    badges.forEach((b,i)=>{
      const d=document.createElement('div'); d.className='badge';
      d.style.left=(ox+8+i*22)+'px'; d.style.top=(oy-8)+'px';
      let readout;
      if(b.kind==='gear'){ d.classList.add('gear'); d.textContent='+'; readout='pick what to send'; }
      else if(b.kind==='stack'){ d.classList.add('stack'); d.textContent=b.n+'x';
        readout=sel.map(it=>itemLabel(m.id,it)).join(', '); }
      else { d.style.background=m.color||'#4fd8ff'; d.textContent=shortLabel(itemLabel(m.id,b.item));
        readout=itemLabel(m.id,b.item); }
      d.addEventListener('mouseenter', ()=>showTip(d, readout));
      d.addEventListener('mouseleave', hideTip);
      d.addEventListener('click', ev=>{ ev.stopPropagation(); badgeTap(m.id, readout); });
      d.addEventListener('dblclick', ev=>{ ev.stopPropagation(); clearTimeout(tapTimer); hideTip(); openNodeSettings(m.id); });
      badgeLayer.appendChild(d);
    });
  });
}
function badgeTap(id, readout){
  const now=Date.now();
  if(id===lastTapKey && now-lastTapAt<300){      // double tap -> open settings
    clearTimeout(tapTimer); lastTapKey=null; lastTapAt=0; hideTip(); openNodeSettings(id);
  } else {                                        // single tap -> quick readout
    lastTapKey=id; lastTapAt=now; clearTimeout(tapTimer);
    tapTimer=setTimeout(()=>{ toast(readout); }, 300);
  }
}
function showTip(anchor, text){
  ensureBadgeLayer(); btip.textContent=text;
  const r=anchor.getBoundingClientRect();
  btip.style.left=(r.left+r.width/2)+'px'; btip.style.top=(r.top-6)+'px';
  btip.classList.add('show');
}
function hideTip(){ if(btip) btip.classList.remove('show'); }

function openNodeSettings(id){
  const m=catalogById(id); if(!m) return;
  const menu=document.getElementById('nodemenu');
  let html='<h5>'+esc(m.name)+' · SENDING</h5>';
  const items=itemsOf(id);
  if(!items.length){ html+='<div class="nmempty">No patterns reported yet</div>'; }
  else items.forEach(it=>{
    const on=(nodeSend[id]||[]).indexOf(it.id)>=0;
    html+='<div class="nmrow">'+
      '<button class="nmtog'+(on?' on':'')+'" data-item="'+esc(it.id)+'">'+(on?'ON':'OFF')+'</button>'+
      '<input class="nmname" data-item="'+esc(it.id)+'" value="'+esc(itemLabel(id,it.id))+'"></div>';
  });
  menu.innerHTML=html; menu.dataset.node=id; menu.classList.add('open');
  const el=nodeEls[id], r=fieldRect();
  const sx=r.left + panX + (m.x + (el?el.offsetWidth:0))*S + 12*S;
  const sy=r.top  + panY + m.y*S;
  menu.style.left=Math.max(8, Math.min(sx, innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top =Math.max(50, Math.min(sy, innerHeight-180))+'px';
  menu.querySelectorAll('.nmtog').forEach(b=>b.addEventListener('click', e=>{
    e.stopPropagation();
    const it=b.getAttribute('data-item'), arr=nodeSend[id]||(nodeSend[id]=[]), k=arr.indexOf(it);
    if(k>=0) arr.splice(k,1); else arr.push(it);
    const onNow=arr.indexOf(it)>=0; b.classList.toggle('on', onNow); b.textContent=onNow?'ON':'OFF';
    persist(); renderBadges();
  }));
  menu.querySelectorAll('.nmname').forEach(inp=>{
    inp.addEventListener('click', e=>e.stopPropagation());
    inp.addEventListener('change', ()=>{
      const it=inp.getAttribute('data-item');
      itemNames[id]=itemNames[id]||{}; itemNames[id][it]=inp.value.trim()||it;
      persist(); renderBadges();
    });
  });
}
function closeNodeSettings(){ const menu=document.getElementById('nodemenu'); if(menu) menu.classList.remove('open'); }
document.addEventListener('pointerdown', e=>{
  const nm=document.getElementById('nodemenu');
  if(nm && nm.classList.contains('open') && !nm.contains(e.target) && !e.target.classList.contains('badge'))
    closeNodeSettings();
});