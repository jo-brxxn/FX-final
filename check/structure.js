// Struktur-Waechter fuer index.html. Faengt genau die Fehlerklasse, die
// VERSION-CHECK-375 ausgeliefert hat: ein doppelt eingefuegter HTML-Block.
// node --check sieht so etwas NICHT (das JS bleibt gueltig), und die
// Playwright-Audits sahen es nicht, weil sie den Sperrbildschirm beim Start
// entfernen. Ein doppeltes id ist der billigste zuverlaessige Indikator.
const fs=require('fs');
const h=fs.readFileSync(process.argv[2]||'index.html','utf8');
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
const befunde=[];
if(doppelt.length) befunde.push('doppelte ids: '+doppelt.map(([k,v])=>k+' x'+v).join(', '));
if(blockDup) befunde.push('identischer 40-Zeilen-Block bei Zeile '+blockDup.zeileA+' und '+blockDup.zeileB);
if(befunde.length){console.log('STRUKTURFEHLER:\n  '+befunde.join('\n  '));process.exit(1);}
console.log('Struktur ok: keine doppelten ids, kein wiederholter Block');
