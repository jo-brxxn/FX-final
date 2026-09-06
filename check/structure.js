// Struktur-Waechter fuer index.html. Faengt genau die Fehlerklasse, die
// VERSION-CHECK-375 ausgeliefert hat: ein doppelt eingefuegter HTML-Block.
// node --check sieht so etwas NICHT (das JS bleibt gueltig), und die
// Playwright-Audits sahen es nicht, weil sie den Sperrbildschirm beim Start
// entfernen. Ein doppeltes id ist der billigste zuverlaessige Indikator.
const fs=require('fs');
const path=require('path');
const h=fs.readFileSync(process.argv[2]||'index.html','utf8');
// Seit der Modul-Aufteilung (2026-08-25, docs/module-split.md) liegt der
// allergroesste Teil des JS in js/*.js statt inline in index.html - sowohl
// die FunktionsDEFINITIONEN als auch viele der onclick=/onchange=/...-
// Handler selbst (die HTML-Strings mit Handlern werden in js/main.js per
// Template-Literal gebaut, nicht in index.html). Fuer die Handler-Funktion-
// Pruefung (drittes Netz unten) MUESSEN deshalb alle js/*.js-Dateien mit
// durchsucht werden, sonst meldet dieser Waechter fast jeden Handler der
// App faelschlich als "ohne Funktion". Die id-/Block-Dopplungspruefungen
// (erstes/zweites Netz) bleiben bewusst auf index.html beschraenkt - das
// sind reine HTML-Markup-Pruefungen, js/*.js enthaelt kein statisches HTML.
const jsDir=path.join(path.dirname(process.argv[2]||'index.html'),'js');
let jsAlle='';
try{
  jsAlle=fs.readdirSync(jsDir).filter(f=>f.endsWith('.js'))
    .map(f=>fs.readFileSync(path.join(jsDir,f),'utf8')).join('\n');
}catch(e){}
const ids={};
for(const m of h.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)) ids[m[1]]=(ids[m[1]]||0)+1;
// Bekannte, unkritische Mehrfachtreffer: stehen in Template-Strings bzw. sind
// Alt-Bestand und waren schon vor dieser Pruefung so.
const ERLAUBT=new Set(['aiDefs','hudFuel']);
const doppelt=Object.entries(ids).filter(([k,v])=>v>1&&!ERLAUBT.has(k));
// Ein zweites Netz: kein 100-Zeilen-Block darf woertlich zweimal vorkommen.
const L=h.split('\n');
const seen=new Map(); let blockDup=null;
for(let i=0;i+40<L.length;i++){
  const key=L.slice(i,i+40).join('\n');
  if(key.trim().length<400) continue;
  if(seen.has(key)){blockDup={zeileA:seen.get(key)+1,zeileB:i+1};break;}
  seen.set(key,i);
}
// Drittes Netz: JEDER Name, der in einem inline-Handler steht, muss auch als
// Funktion existieren. node --check findet das nie - der Handler ist fuer den
// Parser nur ein Attributwert, der Fehler faellt erst beim Klick auf.
// Besonders heimtueckisch sind ZUSAMMENGESETZTE Namen: timeRangeCustomHtml
// baut "<setFnName>Custom" als String. Eine Suche nach dem fertigen Namen
// findet nichts, die Funktion sieht tot aus - so sind setIndHistRangeCustom
// (beim Aufraeumen geloescht) und setAaiiRangeCustom (nie angelegt) verloren
// gegangen. Beide Male liess sich "Custom" waehlen, die Datumsfelder kamen,
// und die Eingabe tat still nichts.
const alles=h+'\n'+jsAlle;
const def=new Set([...alles.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
for(const m of alles.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)) def.add(m[1]);
// Methodenaufrufe auf einem Objekt/Ereignis sind keine globalen Funktionen.
const METHODEN=/[.\]]\s*$/;
const EINGEBAUT=new Set(['alert','confirm','prompt','Number','String','Boolean','Date','Math','JSON','Object','Array','Set','Map','RegExp','parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent','setTimeout','requestAnimationFrame','fetch','open','if','for','while','return','typeof','function','catch','switch']);
const fehlend=new Set();
// ⚠ Kommentarzeilen ausschliessen: an zwei Stellen ERKLAERT ein Kommentar das
// Muster onclick="fn('${x.id}')" - ohne diesen Filter meldet der Waechter
// "fn" als fehlende Funktion und wird dadurch unglaubwuerdig.
const inKommentar=idx=>{
  const zeile=alles.slice(alles.lastIndexOf('\n',idx)+1, alles.indexOf('\n',idx));
  return /^\s*(\/\/|\*|\/\*)/.test(zeile);
};
const HANDLER=/\bon(?:click|change|input|toggle|submit|keydown|keyup|focus|blur|pointerdown|pointerup|pointerleave|pointercancel|contextmenu|mouseenter|mouseleave|error|load)\s*=\s*(["'`])([\s\S]*?)\1/g;
for(const m of alles.matchAll(HANDLER)){
  if(inKommentar(m.index)) continue;
  for(const c of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)){
    const vor=m[2].slice(0,c.index);
    if(METHODEN.test(vor)) continue;              // obj.methode(...)
    if(EINGEBAUT.has(c[1])||def.has(c[1])) continue;
    if(/^[A-Z]/.test(c[1])) continue;             // Konstruktor/Konstante
    fehlend.add(c[1]);
  }
}
// Zusammengesetzte Handlernamen: Praefix aus dem Aufruf + fester Suffix.
for(const m of alles.matchAll(/timeRange(?:Bar|Custom)Html\(([\s\S]{0,200}?)\)/g)){
  for(const q of m[1].matchAll(/['"](set[A-Za-z_$][\w$]*)['"]/g)){
    const basis=q[1].replace(/Custom$/,'');
    if(!def.has(basis)) fehlend.add(basis);
    if(!def.has(basis+'Custom')) fehlend.add(basis+'Custom');
  }
}
// Viertes Netz: ein Handler-Name, der NUR in js/*.js definiert ist, muss auch
// in der window-Bruecke stehen.
//
// ⚠ Genau diese Luecke hat 2026-09-06 zugeschlagen: setDataMode() war sauber
// definiert, das dritte Netz oben war deshalb zufrieden - aber der Name fehlte
// in Object.assign(window,{...}). Die Modus-Buttons im Data-Tab warfen beim
// Klick still einen ReferenceError. Ein inline-Handler wird im GLOBALEN Scope
// ausgewertet; eine Modul-Funktion ist dort nur sichtbar, wenn sie exportiert
// wurde. CLAUDE.md Regel 6 nennt die vergessene Bruecken-Zeile ausdruecklich
// als haeufigsten Grund fuer "der Button macht nichts" - jetzt faellt es rot
// auf statt erst beim Klicken.
const bruecke=(()=>{
  let out='';
  let dateien=[];
  try{dateien=fs.readdirSync(jsDir).filter(f=>f.endsWith('.js'));}catch(e){}
  dateien.forEach(f=>{
    const t=fs.readFileSync(path.join(jsDir,f),'utf8');
    const L=t.split('\n');
    for(let i=0;i<L.length;i++){
      if(!/Object\.assign\(\s*window\s*,\s*\{/.test(L[i]))continue;
      for(let k=i;k<L.length;k++){out+='\n'+L[k];if(/\}\s*\)\s*;?\s*$/.test(L[k]))break;}
    }
    for(const m of t.matchAll(/Object\.defineProperty\(\s*window\s*,\s*['"]([\w$]+)/g))out+='\n'+m[1];
  });
  return out;
})();
// Nur in js/*.js definiert = braucht den Export. In index.html selbst
// definierte Funktionen stehen ohnehin global.
const defNurJs=new Set();
for(const m of jsAlle.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g))defNurJs.add(m[1]);
const defImHtml=new Set();
for(const m of h.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g))defImHtml.add(m[1]);
const ohneExport=new Set();
for(const m of alles.matchAll(HANDLER)){
  if(inKommentar(m.index)) continue;
  for(const c of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)){
    const vor=m[2].slice(0,c.index);
    if(METHODEN.test(vor)) continue;
    const n=c[1];
    if(EINGEBAUT.has(n)||/^[A-Z]/.test(n)) continue;
    if(defImHtml.has(n)||!defNurJs.has(n)) continue;
    if(!new RegExp('\\b'+n+'\\b').test(bruecke)) ohneExport.add(n);
  }
}
const befunde=[];
if(doppelt.length) befunde.push('doppelte ids: '+doppelt.map(([k,v])=>k+' x'+v).join(', '));
if(blockDup) befunde.push('identischer 40-Zeilen-Block bei Zeile '+blockDup.zeileA+' und '+blockDup.zeileB);
if(fehlend.size) befunde.push('Handler ohne Funktion: '+[...fehlend].join(', '));
if(ohneExport.size) befunde.push('Handler nicht in der window-Bruecke (Klick wirft ReferenceError): '+[...ohneExport].join(', '));
if(befunde.length){console.log('STRUKTURFEHLER:\n  '+befunde.join('\n  '));process.exit(1);}
console.log('Struktur ok: keine doppelten ids, kein wiederholter Block, '+def.size+' Funktionen, alle Handler aufloesbar');
