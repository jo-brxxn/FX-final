'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - KOCHMODUS, TIMER UND MENGEN-RECHNUNG
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).

// ══ MENGEN SKALIEREN (Portionen) ═════════════════════════════════════════
// Erkennt die Menge am Anfang einer Zutatenzeile und rechnet sie um.
// ⚠ Nichts erfinden: steht keine Zahl da ("Salz & Pfeffer", "etwas Öl"),
// bleibt die Zeile UNVERAENDERT stehen. Eine erfundene Menge waere schlimmer
// als gar keine.
const BRUCH={'½':0.5,'⅓':1/3,'⅔':2/3,'¼':0.25,'¾':0.75,'⅕':0.2,'⅙':1/6,'⅛':0.125};
export function parseAmount(text){
  const t=String(text||'').trimStart();
  // Unicode-Bruch direkt am Anfang, ggf. hinter einer ganzen Zahl ("1½")
  const uni=t.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅙⅛])/);
  if(uni)return{wert:(uni[1]?+uni[1]:0)+BRUCH[uni[2]],laenge:uni[0].length};
  // Schreibbruch "1/2" oder "1 1/2"
  const br=t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/)||t.match(/^(\d+)\s*\/\s*(\d+)/);
  if(br){
    const wert=br.length===4?(+br[1])+(+br[2]/+br[3]):(+br[1]/+br[2]);
    return{wert,laenge:br[0].length};
  }
  const z=t.match(/^(\d+(?:[.,]\d+)?)/);
  if(z)return{wert:parseFloat(z[1].replace(',','.')),laenge:z[0].length};
  return null;
}
// Zahl wieder lesbar machen. Halbe und Viertel als Bruch, sonst hoechstens
// eine Nachkommastelle - "0.6666666 Zwiebeln" hilft niemandem.
export function fmtAmount(n){
  if(!isFinite(n)||n<=0)return'';
  const ganz=Math.floor(n+1e-9),rest=n-ganz;
  const naeh=[[0.5,'½'],[1/3,'⅓'],[2/3,'⅔'],[0.25,'¼'],[0.75,'¾']].find(([v])=>Math.abs(rest-v)<0.02);
  if(naeh)return(ganz?ganz+' ':'')+naeh[1];
  if(Math.abs(rest)<0.02)return String(ganz);
  const g=Math.round(n*10)/10;
  return String(g).replace('.',',');
}
export function scaleIngredient(text,faktor){
  if(!faktor||faktor===1)return text;
  const a=parseAmount(text);
  if(!a)return text;                       // keine Zahl -> unveraendert
  const roh=String(text);
  const vorne=roh.length-roh.trimStart().length;
  const neu=fmtAmount(a.wert*faktor);
  if(!neu)return text;
  return roh.slice(0,vorne)+neu+roh.slice(vorne+a.laenge);
}

// ══ TIMER AUS EINEM SCHRITT LESEN ════════════════════════════════════════
// "10 Minuten koecheln" -> antippbarer Timer. Findet ALLE Zeitangaben eines
// Schrittes, damit "5 Minuten anbraten, dann 20 Minuten schmoren" zwei
// Knoepfe ergibt statt einem falschen.
const ZEIT=/(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(sekunden?|sek\b|s\b|minuten?|min\b|m\b|stunden?|std\b|h\b|hours?|hrs?|minutes?|mins?|seconds?|secs?)/gi;
export function findTimers(text){
  const out=[];
  const t=String(text||'');
  ZEIT.lastIndex=0;
  let m;
  while((m=ZEIT.exec(t))){
    const einheit=m[3].toLowerCase();
    // Bei einer Spanne ("15-20 Minuten") die OBERE Zahl nehmen: lieber
    // einmal nachsehen als etwas anbrennen lassen.
    const zahl=m[2]?+m[2]:+m[1];
    let sek;
    if(/^(s|sek|sekunden?|seconds?|secs?)$/.test(einheit))sek=zahl;
    else if(/^(h|std|stunden?|hours?|hrs?)$/.test(einheit))sek=zahl*3600;
    else sek=zahl*60;
    if(sek<5||sek>6*3600)continue;         // unplausibel -> ignorieren
    if(out.some(o=>o.sek===sek))continue;  // Dubletten im selben Schritt
    out.push({sek,label:m[0].trim()});
    if(out.length>=4)break;
  }
  return out;
}
export function fmtClock(sek){
  const s=Math.max(0,Math.round(sek));
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;
  const zz=n=>String(n).padStart(2,'0');
  return h?`${h}:${zz(m)}:${zz(r)}`:`${zz(m)}:${zz(r)}`;
}

// ══ TON ══════════════════════════════════════════════════════════════════
// ⚠ Der Ton wird im Browser ERZEUGT, nicht als Datei geladen: die App muss
// offline laufen (Service Worker), und eine fehlende mp3 waere genau beim
// Klingeln weg.
//
// ⚠ WAS NICHT GEHT: Es gibt KEINE Browser-Schnittstelle, die den
// Stummschalter eines iPhones abfragt. Kein Web-API liest den Ringer-Switch -
// weder WebAudio noch das Media-API. Was man ERKENNEN kann, ist, ob die
// Wiedergabe ueberhaupt erlaubt/gestartet wurde (AudioContext bleibt
// 'suspended', oder play() wird abgelehnt). Genau das wird hier geprueft,
// und NUR dann erscheint der Hinweis - so, wie der Nutzer es wollte
// ("wenn das Geraet auf stumm ist auch ein Hinweis, sonst nicht"). Bei einem
// stummgeschalteten iPhone laeuft der Kontext allerdings ganz normal weiter,
// nur hoert man nichts; deshalb klingelt der Timer IMMER zusaetzlich sichtbar
// und (wo unterstuetzt) per Vibration. Auf eine Erkennung, die es nicht gibt,
// wird sich nicht verlassen.
let _ctx=null;
export function audioReady(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return false;
    if(!_ctx)_ctx=new AC();
    if(_ctx.state==='suspended')_ctx.resume().catch(()=>{});
    return true;
  }catch(e){return false;}
}
export function audioBlocked(){
  return !_ctx||_ctx.state!=='running';
}
// Drei ansteigende Toene, zweimal - freundlich, aber nicht zu ueberhoeren.
export function chime(){
  if(!audioReady())return false;
  try{
    const t0=_ctx.currentTime;
    [0,1,2,3.2,4.2,5.2].forEach((i,k)=>{
      const start=t0+k*0.18+(k>=3?0.22:0);
      const osz=_ctx.createOscillator(),g=_ctx.createGain();
      osz.type='sine';
      osz.frequency.setValueAtTime([784,988,1319][k%3],start);
      g.gain.setValueAtTime(0.0001,start);
      g.gain.exponentialRampToValueAtTime(0.32,start+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,start+0.34);
      osz.connect(g);g.connect(_ctx.destination);
      osz.start(start);osz.stop(start+0.36);
    });
    return true;
  }catch(e){return false;}
}
export function buzz(){
  try{if(navigator.vibrate)navigator.vibrate([220,120,220,120,380]);}catch(e){}
}

// ══ TIMER-VERWALTUNG ═════════════════════════════════════════════════════
// Mehrere Timer gleichzeitig (Nudeln UND Sauce). Die Restzeit wird aus der
// ZIELZEIT gerechnet, nicht heruntergezaehlt: ein Intervall im Hintergrund-
// Tab wird gedrosselt, ein Zaehler waere danach falsch. Deshalb endAt.
const timers=[];
let _tick=null,_onChange=null;
export function onTimers(fn){_onChange=fn;}
function melde(){if(_onChange)try{_onChange(timers.slice());}catch(e){}}
function sicherstellenTick(){
  if(_tick)return;
  _tick=setInterval(()=>{
    let aendert=false;
    timers.forEach(t=>{
      if(t.state!=='run')return;
      if(Date.now()>=t.endAt){t.state='done';t.rest=0;feuere(t);aendert=true;}
      else{const r=Math.round((t.endAt-Date.now())/1000);if(r!==t.rest){t.rest=r;aendert=true;}}
    });
    if(aendert)melde();
    if(!timers.some(t=>t.state==='run')){clearInterval(_tick);_tick=null;}
  },250);
}
function feuere(t){
  const gespielt=chime();
  buzz();
  t.blocked=!gespielt||audioBlocked();
}
export function addTimer(sek,label){
  const t={id:'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    label:label||fmtClock(sek),total:sek,rest:sek,endAt:Date.now()+sek*1000,state:'run',blocked:false};
  audioReady();                 // im Nutzer-Gestus starten, sonst blockiert der Browser spaeter
  timers.push(t);
  sicherstellenTick();
  melde();
  return t.id;
}
export function pauseTimer(id){
  const t=timers.find(x=>x.id===id);if(!t||t.state!=='run')return;
  t.rest=Math.max(0,Math.round((t.endAt-Date.now())/1000));
  t.state='pause';melde();
}
export function resumeTimer(id){
  const t=timers.find(x=>x.id===id);if(!t||t.state!=='pause')return;
  t.endAt=Date.now()+t.rest*1000;t.state='run';
  audioReady();sicherstellenTick();melde();
}
export function addMinute(id,min){
  const t=timers.find(x=>x.id===id);if(!t)return;
  const plus=(min||1)*60;
  if(t.state==='done'){t.state='run';t.rest=plus;t.endAt=Date.now()+plus*1000;sicherstellenTick();}
  else if(t.state==='run'){t.endAt+=plus*1000;t.rest=Math.round((t.endAt-Date.now())/1000);}
  else t.rest+=plus;
  t.total=Math.max(t.total,t.rest);
  melde();
}
export function stopTimer(id){
  const i=timers.findIndex(x=>x.id===id);
  if(i>=0)timers.splice(i,1);
  melde();
}
export function activeTimers(){return timers.slice();}
export function anyRinging(){return timers.some(t=>t.state==='done');}

// ══ BILDSCHIRM WACH HALTEN ═══════════════════════════════════════════════
// Beim Kochen ist ein Geraet, das nach 30 Sekunden zusperrt, unbrauchbar.
// wakeLock gibt es nicht ueberall - fehlt es, laeuft alles andere weiter.
let _lock=null;
export async function keepAwake(an){
  try{
    if(an){
      if(_lock)return true;
      if(!navigator.wakeLock)return false;
      _lock=await navigator.wakeLock.request('screen');
      _lock.addEventListener('release',()=>{_lock=null;});
      return true;
    }
    if(_lock){await _lock.release();_lock=null;}
    return true;
  }catch(e){_lock=null;return false;}
}
// Nach dem Zurueckkommen aus dem Hintergrund gibt das System die Sperre frei -
// dann neu anfordern, sonst geht der Bildschirm mitten im Kochen aus.
if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&_lock===null&&document.body.classList.contains('cooking'))keepAwake(true);
  });
}
