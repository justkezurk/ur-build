'use strict';
/* ================================================================ 
   DAW MODULE WINDOWS + IFRAMES (pure extraction)
   ================================================================ */

const openWins = {};
let winOffset = 0;

/* custom window-control icons (outline-only, spectral gradient strokes) */
function icoMin(){
  return '<svg class="wico" viewBox="0 0 24 24" fill="none" stroke="url(#gMin)" '+
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
    '<rect x="3" y="7" width="18" height="10"/><rect x="8" y="10.5" width="8" height="3"/>'+
    '<path d="M3 7 L8 10.5 M21 7 L16 10.5 M3 17 L8 13.5 M21 17 L16 13.5"/></svg>';
}
function icoMax(){
  return '<svg class="wico" viewBox="0 0 24 24" fill="none" stroke="url(#gMax)" '+
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
    '<rect x="3" y="3" width="18" height="18"/><circle cx="12" cy="12" r="6.5"/>'+
    '<rect x="8.5" y="8.5" width="7" height="7"/></svg>';
}
function icoClose(){
  return '<svg class="wico" viewBox="0 0 24 24" fill="none" stroke="url(#gClose)" '+
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+
    '<path d="M6 6 L18 18"/><path d="M6 18 C 11 13, 14 9, 18 5"/></svg>';
}

function openModule(m){
  if(!m.ok){ toast(m.name+' — NOT PORTED YET'); return; }
  if(openWins[m.id]){ const w0=openWins[m.id]; w0.style.display=''; focusWin(w0); return; }

  const win = document.createElement('div');
  win.className = 'win';
  const w = Math.min(560, innerWidth-40), h = Math.min(440, innerHeight-120);
  win.style.width = w+'px'; win.style.height = h+'px';
  win.style.left = (30 + (winOffset%5)*26)+'px';
  win.style.top  = (66 + (winOffset%5)*26)+'px';
  winOffset++;
  win.innerHTML =
    '<div class="whead"><span class="wtitle">'+esc(m.name)+'</span>'+
    '<button class="wbtn wmin" title="minimize">'+icoMin()+'</button>'+
    '<button class="wbtn wmax" title="fullscreen">'+icoMax()+'</button>'+
    '<button class="wbtn wclose" title="close">'+icoClose()+'</button></div>';
  const iframe = document.createElement('iframe');
  iframe.name = m.id;                                /* identity contract */
  iframe.allow = 'microphone; autoplay';             /* same-origin srcdoc: lets Vocals record + play */
  win.appendChild(iframe);
  document.body.appendChild(win);
  openWins[m.id] = win;
  focusWin(win);

  if(m.builtin){
    iframe.srcdoc = BUILTINS[m.builtin];
  } else {
    fetch(m.file).then(r=>r.text()).then(html=>{ iframe.srcdoc = html; })
      .catch(()=>{
        iframe.srcdoc = '<!DOCTYPE html><meta name="viewport" content="width=device-width,initial-scale=1">'+
          '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;'+
          'text-align:center;padding:18px;background:#06090d;color:#5b7480;'+
          'font:11px/1.6 ui-monospace,monospace;letter-spacing:.06em">'+esc(m.name)+
          ' could not load.<br>loads once ported to /daw/modules/<br><br>'+
          'use the controls above to minimize or close.</body>';
        toast(m.name+' — LOAD FAILED (window kept open)');
      });
  }

  win.querySelector('.wmin').addEventListener('click', e=>{ e.stopPropagation();
    win.style.display='none'; toast(m.name+' — MINIMIZED (open again from its node)'); });
  win.querySelector('.wmax').addEventListener('click', e=>{ e.stopPropagation();
    win.classList.toggle('full'); focusWin(win); });
  win.querySelector('.wclose').addEventListener('click', e=>{ e.stopPropagation();
    confirmDialog('Close '+m.name+'?  This removes the module from the matrix and clears its connections.',
      ()=>removeNode(m)); });
  win.addEventListener('pointerdown', ()=>focusWin(win));

  /* window drag (desktop; mobile is fullscreen via CSS) */
  const head = win.querySelector('.whead');
  let drag=false, sx=0, sy=0, ox=0, oy=0;
  head.addEventListener('pointerdown', ev=>{
    if(ev.target.closest('.wbtn')) return;
    if(innerWidth <= 700) return;
    drag=true; sx=ev.clientX; sy=ev.clientY;
    ox=parseFloat(win.style.left); oy=parseFloat(win.style.top);
    head.setPointerCapture(ev.pointerId);
  });
  head.addEventListener('pointermove', ev=>{
    if(!drag) return;
    win.style.left = Math.max(0, ox + ev.clientX - sx)+'px';
    win.style.top  = Math.max(46, oy + ev.clientY - sy)+'px';
  });
  head.addEventListener('pointerup', ()=>{ drag=false; });

  announceRoster();
}
function focusWin(win){
  document.querySelectorAll('.win').forEach(w=>w.classList.remove('top'));
  win.classList.add('top');
}
function closeWin(id){
  const w = openWins[id];
  if(w){ w.remove(); delete openWins[id]; announceRoster(); }
}