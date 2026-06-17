'use strict';
/* ================================================================ 
   ur.space — DAW NODE MATRIX HUB
   Refactored multi-file version (behavior & UI unchanged)

   ============ MODULE CONTRACT (for all ported modules) ===========
   Identity : your module id is  window.name
   Bus      : const bus = new BroadcastChannel('ur.bus')
   Emit     : bus.postMessage({type:'ur:emit', from:window.name,
                               channel:'<channel>', payload:<any JSON>})
   Receive  : bus.onmessage → handle msgs where
              m.data.type==='ur:data' && m.data.to===window.name
   Routing  : the hub re-emits your 'ur:emit' as 'ur:data' along every
              wire whose source is your node. Modules never address
              each other directly — wires define the graph.
   Mic      : const stream = await window.parent.URMedia.requestMic()
              (one shared permission prompt, hub-owned)
   Roster   : hub broadcasts {type:'ur:roster', nodes:[ids]} on changes
   Items    : OPTIONAL. report selectable patterns so the hub can show
              send-badges + a settings dropdown on your node:
              bus.postMessage({type:'ur:items', from:window.name,
                               items:[{id:'p1',label:'Pattern 1'}, ...]})
              re-emit whenever your list changes. the hub adds the chosen
              items[] to every 'ur:data' it routes from you.
   ================================================================ */

/* ---------- session adapter stub (same spine as the wheel) ---------- */
const URSession = {
  get id(){
    let g = localStorage.getItem('ur.session.guest');
    if(!g){ g = 'guest-' + Math.random().toString(36).slice(2,10);
            localStorage.setItem('ur.session.guest', g); }
    return g;
  },
  authed:false,
  gate(){ return true; }
};
window.URSession = URSession;

/* ---------- URMedia broker: one mic prompt, shared stream ---------- */
window.URMedia = {
  _mic:null, _pending:null,
  requestMic(){
    if(this._mic) return Promise.resolve(this._mic);
    if(!this._pending){
      this._pending = navigator.mediaDevices.getUserMedia({audio:true})
        .then(s=>{ this._mic=s; this._pending=null; return s; });
    }
    return this._pending;
  }
};

/* ---------- MODULE CATALOG ----------
   the menu of available modules. nothing is placed by default —
   the user adds modules into the matrix from the MOD dropdown.
   Port a file module = drop its HTML into /daw/modules/ — node goes LIVE. */
const CATALOG = [
  { id:'wavseq', name:'WAVE SEQUENCER', file:'modules/wave-sequencer.html', color:'#4fd8ff', x:80,  y:80  },
  { id:'drums',  name:'DRUM MACHINE',   file:'modules/drum-machine.html',   color:'#a86bff', x:80,  y:230 },
  { id:'proll',  name:'PIANO ROLL',     file:'modules/piano-roll.html',     color:'#41ffb0', x:80,  y:380 },
  { id:'warp',   name:'WARP LAB',       file:'modules/warp-lab.html',       color:'#ffae3b', x:80,  y:530 },
  { id:'vocals', name:'VOCALS / SAMPLING', file:'modules/vocals.html',       color:'#ffb454', x:80,  y:680 },
  { id:'arrangement', name:'ARRANGEMENT', file:'modules/arrangement.html',   color:'#a86bff', x:80,  y:830 },
  { id:'pulse',  name:'PULSE TEST',     builtin:'pulse',                    color:'#41ffb0', x:330, y:130 },
  { id:'busmon', name:'BUS MONITOR',    builtin:'busmon',                   color:'#4fd8ff', x:330, y:330 },
];
function catalogById(id){ return CATALOG.find(m=>m.id===id); }
function placedList(){ return CATALOG.filter(m=>placed.has(m.id)); }

/* ---------- built-in modules (prove the bus before any port) ---------- */
const BUILTINS = {
  pulse: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;background:#050507;color:#9aa3b2;font-family:ui-monospace,Menlo,monospace;
display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:18px}
button{background:none;border:1px solid #41ffb0;color:#41ffb0;font:inherit;letter-spacing:.2em;
padding:14px 26px;cursor:pointer;font-size:12px}button:active{background:rgba(65,255,176,.12)}
small{letter-spacing:.16em;color:#4a5260;font-size:9px}</style></head><body>
<button id="b">EMIT PULSE</button><small id="s">channel: pulse</small>
<script>
const bus=new BroadcastChannel('ur.bus');let n=0;
bus.postMessage({type:'ur:items',from:window.name,items:[{id:'a',label:'Pulse A'},{id:'b',label:'Pulse B'}]});
document.getElementById('b').onclick=()=>{n++;
bus.postMessage({type:'ur:emit',from:window.name,channel:'pulse',payload:{n,t:Date.now()}});
document.getElementById('s').textContent='emitted #'+n;};
</scr${''}ipt></body></html>`,

  busmon: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;background:#050507;color:#9aa3b2;font-family:ui-monospace,Menlo,monospace;
font-size:10px;line-height:1.8;padding:12px;overflow-y:auto;height:100vh;box-sizing:border-box}
.r{border-bottom:1px solid #161a22;padding:3px 0}.f{color:#a86bff}.c{color:#4fd8ff}
h3{font-size:10px;letter-spacing:.22em;color:#41ffb0;margin:0 0 10px}</style></head><body>
<h3>ADDRESSED TO ME</h3><div id="o"></div>
<script>
const bus=new BroadcastChannel('ur.bus');const o=document.getElementById('o');
bus.onmessage=m=>{const d=m.data;
if(d.type==='ur:data'&&d.to===window.name){
const r=document.createElement('div');r.className='r';
r.innerHTML='<span class="f">'+d.from+'</span> › <span class="c">'+d.channel+
'</span> '+JSON.stringify(d.payload);o.prepend(r);
while(o.children.length>40)o.lastChild.remove();}};
</scr${''}ipt></body></html>`
};

/* ================================================================ 
   STATE + PERSISTENCE
   ================================================================ */
const SAVE_KEY = 'ur.daw.matrix.' + URSession.id;
let wiresList = [];                      // [{from,to}]
const placed = new Set();                // ids currently placed in the matrix
let nodeItems = {};                      // id -> [{id,label}]  (live from modules, not persisted)
let nodeSend  = {};                      // id -> [itemId,...]  (what the module is sending)
let itemNames = {};                      // id -> {itemId: userName}  (rename overrides)
const saved = (()=>{ try{ return JSON.parse(localStorage.getItem(SAVE_KEY))||{}; }
                     catch(e){ return {}; } })();
if(Array.isArray(saved.placed)) saved.placed.forEach(id=>{ if(catalogById(id)) placed.add(id); });
if(saved.pos) CATALOG.forEach(m=>{ const p=saved.pos[m.id]; if(p){m.x=p[0];m.y=p[1];} });
if(saved.size) CATALOG.forEach(m=>{ const s=saved.size[m.id]; if(s){ if(s[0])m.w=s[0]; if(s[1])m.h=s[1]; } });
if(saved.send && typeof saved.send==='object') nodeSend = saved.send;
if(saved.itemNames && typeof saved.itemNames==='object') itemNames = saved.itemNames;
if(Array.isArray(saved.wires)) wiresList = saved.wires
  .map(w=> (w && typeof w.from==='object') ? {from:w.from.node, to:w.to.node} : w)
  .filter(w=> w && placed.has(w.from) && placed.has(w.to));

function persist(){
  const pos={}, size={};
  CATALOG.forEach(m=>{ pos[m.id]=[Math.round(m.x),Math.round(m.y)];
    if(m.w||m.h) size[m.id]=[m.w||0, m.h||0]; });
  localStorage.setItem(SAVE_KEY, JSON.stringify({pos, size, wires:wiresList,
    placed:[...placed], send:nodeSend, itemNames:itemNames,
    pan:[Math.round(panX),Math.round(panY)], scale:S}));
}

/* ================================================================ 
   BUS + ROUTER + LOG
   ================================================================ */
const bus = new BroadcastChannel('ur.bus');
const logEl = document.getElementById('log');
const busStat = document.getElementById('busStat');
let msgCount = 0;

function logLine(html){
  msgCount++;
  busStat.textContent = msgCount + ' MSG';
  const d = document.createElement('div');
  d.innerHTML = html;
  logEl.prepend(d);
  while(logEl.children.length > 80) logEl.lastChild.remove();
}

bus.onmessage = m=>{
  const d = m.data;
  if(d && d.type === 'ur:items'){            // module reports its selectable items
    nodeItems[d.from] = Array.isArray(d.items) ? d.items.slice() : [];
    renderBadges();
    return;
  }
  if(d && d.type === 'ur:open' && d.module){   // drill-in: a module asks the hub to open/focus another (e.g. Arrangement clip OPEN)
    const m = catalogById(d.module);
    if(m){ openModule(m); logLine('<span class="f">'+esc(d.from||'?')+'</span> › open <span class="c">'+esc(d.module)+'</span>'); }
    else { toast('open: unknown module ' + esc(d.module)); }
    return;
  }
  if(d && d.type === 'ur:emit'){
    let routed = 0;
    for(const w of wiresList){
      if(w.from === d.from){
        bus.postMessage({type:'ur:data', to:w.to, from:d.from,
                         channel:d.channel, items:sendSet(d.from), payload:d.payload});
        routed++;
      }
    }
    logLine('<span class="f">'+esc(d.from)+'</span> › <span class="c">'+
      esc(d.channel)+'</span> → '+routed+' wire'+(routed===1?'':'s'));
  }
};

function esc(s){ var amp=String.fromCharCode(38);
  return String(s).replace(/&/g, amp+'amp;').replace(/</g, amp+'lt;').replace(/>/g, amp+'gt;'); }

function announceRoster(){
  bus.postMessage({type:'ur:roster', nodes:placedList().map(m=>m.id)});
}

/* ================================================================ 
   CHROME (toast + drawer + confirm)
   ================================================================ */
const toastEl = document.getElementById('toast');
let toastT = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>toastEl.classList.remove('show'), 2400);
}

function confirmDialog(msg, onOk){
  const ov = document.getElementById('confirm');
  ov.querySelector('.cmsg').textContent = msg;
  ov.classList.add('open');
  const ok = document.getElementById('cOk'), cancel = document.getElementById('cCancel');
  function cleanup(){ ov.classList.remove('open');
    ok.removeEventListener('click', okFn); cancel.removeEventListener('click', caFn);
    ov.removeEventListener('click', bgFn); }
  function okFn(){ cleanup(); onOk(); }
  function caFn(){ cleanup(); }
  function bgFn(e){ if(e.target===ov) cleanup(); }
  ok.addEventListener('click', okFn); cancel.addEventListener('click', caFn);
  ov.addEventListener('click', bgFn);
}

document.getElementById('drawerHead').addEventListener('click', ()=>{
  document.getElementById('drawer').classList.toggle('open');
});
document.addEventListener('touchmove', ev=>{
  if(!ev.target.closest('#log')) ev.preventDefault();
}, {passive:false});