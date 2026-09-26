'use strict';
// ══ SCORE-JOURNAL: JEDE SCORE-AENDERUNG MIT IHRER URSACHE ═══════════════════
// Nutzer-Auftrag 2026-09-26, woertlich: "Mehrmals am Tag aendert sich der
// Score aber es werden keine Gruende dafuer aufgezeichnet ich moechte das
// alles was den Score aendert aufgezeichnet wird und in history gezeigt wird
// auch wenn es nur 0,1 ist ich will es sehen und immer den Grund daneben
// ausfuehrlich. Es soll gezeigt werden was ist der aktuelle Score dann wie hat
// er sich heute veraendert und dann wie also der Grund wie viel dadurch und
// warum kein Wert soll leer bleiben alles muss nachvollziehbar sein das hat
// oberste Prioritaet".
//
// ⚠ WARUM EIN NEUES JOURNAL UND NICHT DAS BESTEHENDE scoreLog: das 'auto'-
// Protokoll in recomputeAuto() schreibt nur, wenn GENAU EIN bekannter
// Ausloeser gesetzt ist (_flipCauseTag) UND sich seit dem letzten
// eingeschwungenen Stand kein fremder Feed geaendert hat. Gemessen (Playwright,
// 2026-09-26): ein Kurs-Update (10-Minuten-Takt) bewegte 11 von 23 Assets
// (CAD -0,3 -> +1,4, CHF +1 -> +2,6, SP500 -1,4 -> -2,6) - protokolliert:
// 0 Eintraege. Ein Tag Alterung ohne jede Veroeffentlichung bewegte 9 Assets
// um 0,1 - protokolliert: 0. Das ist keine Luecke, die man stopfen kann: der
// Ansatz "Ursache = Ausloeser" kann Zeit (Decay), Preise (Marktrelevanz,
// 1D-Trend), den Vergleichsfaktor und Modellwechsel prinzipiell nicht sehen.
//
// DER ANSATZ HIER: nicht den Ausloeser raten, sondern den ZUSTAND vergleichen.
// Je Asset wird ein Schnappschuss aller Indikator-Beitraege aufbewahrt (die
// "Basis"). Bei jeder Aufzeichnung (recordScoreHist) entsteht ein neuer; weicht
// der angezeigte Score ab (auch um 0,1) oder hat sich ein Eingang diskret
// geaendert, wird die Differenz INDIKATOR FUER INDIKATOR zerlegt und als
// Eintrag gespeichert. Die Zerlegung ist algebraisch exakt:
//
//   angezeigt = runde1(roh * faktor),  roh = Summe der Indikator-Beitraege
//   neu - alt = faktor_neu * Summe(Beitrag_neu - Beitrag_alt)     <- je Indikator
//             + roh_alt * (faktor_neu - faktor_alt)                <- Vergleichsfaktor
//             + Rundung der Anzeige auf eine Nachkommastelle       <- ausgewiesen
//
// Die Teile ergeben also IMMER genau die angezeigte Veraenderung. Warum sich
// ein Beitrag bewegt hat, folgt aus dem Vergleich der gespeicherten Eingaben
// (Datum, Wert, Bias, feste Punkte, Gewicht, Alters-/Markt-/Ueberraschungs-
// Faktor, Modell-Version) - gemessen, nicht geraten.
//
// ⚠ KEINE ZWEITE FORMEL: jeder Beitrag kommt aus indScore()/indScoreParts(),
// jeder Faktor aus indNormBreakdown() - dieselben Funktionen, die den Score
// rechnen. Das Journal rechnet keinen Score nach, es liest ihn ab.
//
// Speicherung wie scoreHist: eigener localStorage-Schluessel (nicht in snap(),
// sonst wuerde Undo das Protokoll mit zuruecknehmen), Cloud-Sync per Merge
// (Vereinigung der Eintraege, juengere Basis gewinnt), Export/Import.
import {indScoreParts,indScore,indNormBreakdown,symScore,symCmpFactor,symScoreCmp,symTrackedCount,fxRefCount,
  SCORE_MODEL_TAG,SCORE_MODEL_VERSION,IND_STALE_CYCLES,indCycleDays,BOND_HALF_PT,DECAY_HALFLIFE_CYCLES} from './score.js';
import {todayStr,dateAddStr,fmtDayShort} from './calendar.js';
import {BC,FX} from './constants.js';
import {syms,escH,scoreLog,trendAssets,indName,saveQuotaFail,isNonFx,macroCcyFor,effDeriveRules,MACRO_DERIVE_RUBS} from './main.js';

// ── Konstanten ─────────────────────────────────────────────────────────────
const JOURNAL_KEY='fxpro_scorejournal';
// Wie lange Eintraege aufbewahrt werden: so lange wie das Aenderungs-Log
// (scoreLog, HIST_MAX_RANGE+2) - die History bietet bis zu 3 Monate an.
const JR_TAGE=92;
// Obergrenze fuer den gespeicherten Text (Zeichen). Safari rechnet rund zwei
// Byte je Zeichen gegen ein Kontingent von etwa 5 MB je Herkunft; der
// Hauptzustand liegt bei ~0,5 Mio Zeichen. Wird die Grenze ueberschritten,
// fallen die AELTESTEN Laeufe weg - nie die juengsten, und nie die Basis.
const JR_MAX_ZEICHEN=650000;
// Ab welcher Groesse eine Einzelbewegung eines diskreten Eingangs (Release,
// Regel, Bias ...) auch dann einen Eintrag ausloest, wenn sich die angezeigte
// Zahl netto nicht bewegt (z.B. Trend +0,5 und COT -0,5 gleichzeitig).
const JR_DISKRET_MIN=0.05;
// Karten-Kuerzel fuer den Schluessel - der Name allein ist je Asset eindeutig,
// die Karte gehoert trotzdem dazu (sie steht in der Anzeige).
const JR_KARTE={'Inflation':'I','Labour Market':'L','Economic Growth':'G','Interest Rates':'R','COT Data':'C'};
const JR_KARTE_NAME=Object.fromEntries(Object.entries(JR_KARTE).map(([k,v])=>[v,k]));
// Was sich mit jeder Modell-Version geaendert hat - auf Englisch, weil es so
// in der History steht. ⚠ Bei JEDEM Bump von SCORE_MODEL_VERSION hier eine
// Zeile ergaenzen; check/journal.js prueft das (sonst stuende an einem
// Modellwechsel "changed" ohne Inhalt - genau die Leerstelle, die dieses
// Journal schliessen soll). Herleitung jeder Version: Kommentar bei
// SCORE_MODEL_VERSION in js/score.js.
const JR_MODELL_NOTIZ={
  13:'the market-relevance factor is re-measured on every price update instead of being frozen at start-up',
  14:'CB Tone removed from all assets (it scored 0 but counted in the divisor)',
  15:'score rebuild: COT and retail with fixed points, yield trends 0.75 each, new 2Y yield gap, commodities for AUD/NZD/CAD',
  16:'new driver Trend 1D + 4H: close of the last finished candle against EMA20, ±0.75 each',
  17:'Trend 4H weighs 0.5 instead of 0.75',
  18:'Trend 4H is measured against EMA38 instead of EMA20',
  19:'Trend 1D/4H of the eight currencies is measured on a basket against the other seven instead of against USD',
};

// ── Zustand ────────────────────────────────────────────────────────────────
// {v:1, base:{sym:Schnappschuss}, runs:[Lauf]} - Format siehe jrSchnappschuss
// und jrErfassen. Ein LAUF ist eine Aufzeichnung ueber alle Assets; er
// enthaelt nur die Assets, die sich bewegt haben, und die Texte einmal je
// Lauf (x), damit ein USD-Release nicht achtmal denselben Satz speichert
// (Gold, Silber, Oel, Indizes und US-Rendite spiegeln ihn).
let scoreJournal={v:1,base:{},runs:[]};
// Aufzeichnung erst, wenn der erste vollstaendige Feed-Durchlauf fertig ist,
// und nie WAEHREND einer laeuft - sonst landen Zwischenstaende im Protokoll,
// die niemand je auf dem Bildschirm hatte (dieselbe Lehre wie bei
// scoreHistAufzeichenbar(), dort viermal vom Nutzer gemeldet).
let _jrBootFertig=false,_jrSperre=0;
// Letzter bekannter Anlass (manuell, Sync, Feed ...) - nur zur Beschriftung,
// die Ursache selbst kommt IMMER aus dem Zustandsvergleich.
let _jrAnlass=null,_jrAnlassT=0;
// Zaehler jeder Aenderung am Journal - der Ketten-Cache (jrKette) haengt daran.
// ⚠ Dieselbe Lehre wie bei _mktWeightCache: ein Cache, der nicht weiss, wann
// seine Quelle sich aendert, zeigt irgendwann still Altes. Jede Stelle, die
// scoreJournal veraendert, zaehlt hier hoch (jrErfassen, jrKappen, Laden, Merge).
let _jrVersion=0;

function jrLeer(){return{v:1,base:{},offen:{},runs:[]};}
function jrGueltig(o){return o&&typeof o==='object'&&o.base&&typeof o.base==='object'&&Array.isArray(o.runs);}
function loadScoreJournal(){
  try{const o=JSON.parse(localStorage.getItem(JOURNAL_KEY)||'null');scoreJournal=jrGueltig(o)?o:jrLeer();}
  catch(e){scoreJournal=jrLeer();}
  _jrVersion++;
}
// Seit wann schreibt das Journal ueberhaupt (erster Schnappschuss je, ueber
// alle Geraete das frueheste Datum)? Nur damit laesst sich ein Tag, der
// VOR dem Journal liegt, von einem unterscheiden, dessen Einzelheiten nach
// der Aufbewahrungsfrist schon geloescht sind.
function jrSeit(){return scoreJournal.seit||null;}
function jrBootFertig(){_jrBootFertig=true;}
function jrSperren(){_jrSperre++;}
function jrFreigeben(){_jrSperre=Math.max(0,_jrSperre-1);}
// ⚠ IMMER ueberschreiben, auch mit null: sonst bleibt z.B. das 'sync' des
// Boot-Pulls haengen und beschriftet den ersten Eintrag nach den Feeds als
// "taken over from another device", obwohl ein Feed die Ursache war.
function jrAnlassMerken(tag){_jrAnlass=tag||null;_jrAnlassT=Date.now();}
function jrAktiv(){return _jrBootFertig&&_jrSperre===0;}

// ── Hilfen ─────────────────────────────────────────────────────────────────
const r2=v=>Math.round((+v||0)*100)/100;
const r4=v=>Math.round((+v||0)*1e4)/1e4;
const r5=v=>Math.round((+v||0)*1e5)/1e5;
function jrKey(rub,ind){return(JR_KARTE[rub.name]||rub.name)+'|'+ind.name;}
function jrKeyTeile(k){const i=String(k).indexOf('|');return i<0?{karte:'',name:k}:{karte:JR_KARTE_NAME[k.slice(0,i)]||k.slice(0,i),name:k.slice(i+1)};}
function jrZahl(v){const n=r2(v);return(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(2);}
function jrZahl3(v){const n=Math.round((+v||0)*1000)/1000;return(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(3);}
function jrScoreTxt(v){const n=Math.round((+v||0)*10)/10;return(n>0?'+':n<0?'−':'')+Math.abs(n);}
const JR_BIAS_TXT={sbull:'strongly bullish',bull:'bullish',neu:'neutral',bear:'bearish',sbear:'strongly bearish'};
function jrModellNr(tag){const m=/^(\d+)/.exec(String(tag||''));return m?+m[1]:null;}
function jrModellText(tagAlt,tagNeu){
  const a=jrModellNr(tagAlt),b=jrModellNr(tagNeu);
  if(a==null||b==null||a===b)return'';
  const notizen=[];
  for(let v=Math.min(a,b)+1;v<=Math.max(a,b);v++)if(JR_MODELL_NOTIZ[v])notizen.push('v'+v+': '+JR_MODELL_NOTIZ[v]);
  return'score model v'+a+' → v'+b+(notizen.length?' ('+notizen.join('; ')+')':'');
}
// Lokales Kalenderdatum eines ISO-Zeitpunkts - dieselbe Zeitzone wie todayStr().
function jrTagVon(iso){
  const d=new Date(iso);if(isNaN(d))return String(iso||'').slice(0,10);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function jrUhr(iso){const d=new Date(iso);return isNaN(d)?'':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});}

// ── Eingaben eines Indikators als lesbarer Text ────────────────────────────
// Das ist das "warum" in der History: welcher Wert zu welchem Beitrag gefuehrt
// hat. Liest ausschliesslich die Felder, die der jeweilige Feed setzt (dieselben
// wie das Score-Fenster, scoreInfoIndRow) - nichts wird hier neu bewertet.
function jrTyp(ind){
  const r=ind.research||{};
  if(r.trend)return't';
  if(r.zinsdiff)return'z';
  if(r.rohstoff)return'm';
  if(r.cot)return'c';
  if(r.bond)return'b';
  if(r.sent)return's';
  if(ind.name==='Retail Positioning')return'p';
  if(ind.name==='Seasonality')return'x';
  if(r.actual!=null&&r.actual!=='')return'r';
  return'h';
}
// Feed-Datumsangaben ("2026-09-25", "2026-09-25 20:00 UTC") im App-Format mit
// zweistelligem Jahr (Nutzer-Regel 2026-09-05/09-17, check/datum.js).
function jrDatum(s){
  const m=/^(\d{4}-\d{2}-\d{2})(.*)$/.exec(String(s||''));
  return m?fmtDayShort(m[1])+m[2]:String(s||'');
}
function jrEingabeText(ind){
  const r=ind.research||{};
  const v=x=>(x==null||x==='')?null:String(x);
  const a=v(r.actual),f=v(r.forecast),p=v(r.previous);
  switch(jrTyp(ind)){
    case't':return(a||'?')+(p?' ('+p+')':'')+(r.stand?' · '+(r.trend==='d'?'daily':'4-hour')+' candle '+jrDatum(r.stand):'');
    case'z':return'2Y gap '+(a||'?')+(p?' vs '+p+(r.prevDate?' on '+jrDatum(r.prevDate):''):'')+(r.bp!=null?' → '+(r.bp>0?'+':'')+r.bp+' bp':'');
    case'm':return'1-month change '+(a||'?')+' vs typical '+(v(r.mass)||p||'?')+(r.z!=null&&isFinite(r.z)?' = '+(+r.z).toFixed(2)+' typical moves':'')+(r.gewicht!=null?' · weight '+r.gewicht:'')+(r.frisch===false?' · data older than 7 days':'');
    case'c':return(a||'?')+(p?' (week before '+p+')':'')+(r.date?' · report '+jrDatum(r.date):'');
    case'b':return(a||'?')+(p?' vs '+p+' (21-day avg)':'')+(r.bondColor==='bond-up'?' · 5-day avg above 21-day avg':r.bondColor==='bond-down'?' · 5-day avg below 21-day avg':' · inside the dead band');
    case's':return(a||'?')+(p?' (before '+p+')':'')+(r.date?' · '+jrDatum(r.date):'');
    case'p':case'x':return a||'no reading';
    case'r':return f!=null?'actual '+a+' vs forecast '+f+(p?' (previous '+p+')':''):'actual '+a+(p?' vs previous '+p+' (no forecast)':' (no forecast)');
    default:return'set by hand';
  }
}

// ── Schnappschuss eines Assets ──────────────────────────────────────────────
// i[key] = [Beitrag, Status, Bias, Grundgewicht, Faktoren|0, Datum, Text, Typ, Anzeigename|0]
//   Status: n = normal gewichtet, k = feste Punkte (Regel), s = veraltet, z = nur Anzeige
//   Faktoren: [Ueberraschung, Alter, Marktrelevanz] - nur bei n (und nicht bei
//   den Renditen, die ohne Faktor zaehlen)
function jrSchnappschuss(sym,t,tag,ref,zahlen){
  const i={};
  // Nicht-FX-Assets spiegeln die Makro-Karten ihrer Waehrung (same/inverse,
  // deriveMacroBiasAll) - der Text nennt dann die Quelle und die Richtung,
  // sonst liest man bei Gold eine USD-Zahl ohne zu wissen, warum sie hier
  // bearish zaehlt.
  let quelle=null,regeln=null;
  try{if(isNonFx(sym.id)){quelle=macroCcyFor(sym.id);regeln=effDeriveRules(sym)||{};}}catch(e){quelle=null;}
  (sym.rubrics||[]).forEach(rub=>(rub.indicators||[]).forEach(ind=>{
    let ps=null;try{ps=indScoreParts(ind,rub);}catch(e){ps=null;}
    const c=(()=>{try{return indScore(ind,rub);}catch(e){return 0;}})();
    const st=!ps?'n':ps.zero?'z':ps.fest?'k':ps.stale?'s':'n';
    let f=0;
    if(st==='n'&&!BOND_HALF_PT.has(ind.name)){
      try{const nb=indNormBreakdown(ind,rub._symId||sym.id,rub);f=[r5(nb.mag),r5(nb.dec),r5(nb.mkt)];}catch(e){f=0;}
    }
    const nm=indName(ind);
    let text=jrEingabeText(ind);
    const regel=quelle&&regeln&&MACRO_DERIVE_RUBS.includes(rub.name)?regeln[rub.name]:null;
    if(regel==='same'||regel==='inverse')text=quelle+' data: '+text+(regel==='inverse'?' (read inversely for this asset)':' (same direction for this asset)');
    i[jrKey(rub,ind)]=[c,st,ind.bias||'neu',ps?r4(ps.w||0):0,f,String((ind.research&&ind.research.date)||''),text,jrTyp(ind),nm!==ind.name?nm:0];
  }));
  return{t,tag,d:symScoreCmp(sym),r:symScore(sym),c:symCmpFactor(sym),n:symTrackedCount(sym),ref:r4(ref),k:zahlen,i};
}

// ── Zwei Schnappschuesse vergleichen ────────────────────────────────────────
// Liefert den Eintrag (oder null, wenn nichts Aufzeichnungswertes passiert ist).
// txt(s) legt einen Text im Lauf-Woerterbuch ab und gibt seinen Index zurueck -
// auch Schluessel und Namen laufen darueber (ein USD-Release steht sonst
// achtmal woertlich im Lauf: USD, Gold, Silber, Oel, BTC, S&P, Nasdaq, US-Rendite).
//
// ⚠ SPEICHERFORMAT, gemessen und nicht geschaetzt: die erste Fassung legte
// jeden Teil als volles Objekt mit allen drei Faktoren ab - ein simuliertes
// Kurs-Update (11 Assets) kostete 7.645 Zeichen. Bei geschaetzt 30 Laeufen am
// Tag waeren das ueber drei Monate mehrere Megabyte gewesen, weit ueber dem,
// was Safari je Herkunft zulaesst (rund 5 MB, UTF-16). Deshalb:
//   - stetige Ursachen (Alter, Marktrelevanz, Ueberraschungs-Massstab) werden
//     je Art ZUSAMMENGEFASST: Summe, Anzahl, die fuenf groessten einzeln,
//   - nur der geaenderte Faktor wird gespeichert, nicht alle drei,
//   - Betraege auf drei Nachkommastellen (angezeigt werden zwei).
const JR_STETIG=new Set(['dec','mkt','mag','faktor']);
const JR_TOP=4,JR_TOP_MODELL=8;
const r3=v=>Math.round((+v||0)*1000)/1000;
function jrVergleich(alt,neu,txt){
  const teile=[],stetig={},modell={a:'modell',v:0,n:0,top:[]};
  const cN=+neu.c||1;
  let diskret=false;
  const keys=new Set([...Object.keys(alt.i||{}),...Object.keys(neu.i||{})]);
  keys.forEach(k=>{
    const o=(alt.i||{})[k],n=(neu.i||{})[k];
    const cO=o?+o[0]||0:0,cNeu=n?+n[0]||0:0;
    const dc=Math.round((cNeu-cO)*100)/100;
    if(!dc)return;
    const q=n||o;
    const v=dc*cN;
    let art=null;
    const teil={a:'',k:txt(k),v:r3(v),co:cO,cn:cNeu,y:q[7]||'h'};
    if(q[8])teil.nm=txt(q[8]);
    if(!o){art='neu';teil.n=txt(n[6]);}
    else if(!n){art='weg';teil.o=txt(o[6]);}
    else if(o[1]!==n[1]){
      if(n[1]==='s'){art='alt';teil.d=o[5];}
      else if(o[1]==='s'){art='frisch';if(o[5]!==n[5])teil.d=n[5];}
      else if(n[1]==='z'||o[1]==='z')art='anzeige';
      else art='regelwechsel';   // feste Punkte <-> Bias (z.B. Bias von Hand festgesetzt)
      teil.n=txt(n[6]);teil.o=txt(o[6]);
    }
    else if(o[5]!==n[5]&&n[1]!=='k'){art='rel';teil.d=n[5];teil.da=o[5];teil.n=txt(n[6]);teil.o=txt(o[6]);}
    else if(o[6]!==n[6]){art=n[1]==='k'?'regel':'wert';teil.n=txt(n[6]);teil.o=txt(o[6]);if(n[5])teil.d=n[5];}
    else if(o[2]!==n[2]){art='bias';teil.bo=o[2];teil.bn=n[2];teil.n=txt(n[6]);}
    else if(o[3]!==n[3]){art='gew';teil.wo=o[3];teil.wn=n[3];}
    else if(Array.isArray(o[4])&&Array.isArray(n[4])&&[0,1,2].some(j=>o[4][j]!==n[4][j])){
      // Stetige Ursache: gesammelt je Art.
      const geaendert=[0,1,2].filter(j=>o[4][j]!==n[4][j]);
      const sa=geaendert.length===1?['mag','dec','mkt'][geaendert[0]]:'faktor';
      const g=stetig[sa]||(stetig[sa]={a:sa,v:0,n:0,top:[]});
      g.v+=v;g.n++;
      const j=geaendert[0];
      g.top.push([teil.k,r3(v),n[5]||'',sa==='faktor'?o[4].map(r3):r3(o[4][j]),sa==='faktor'?n[4].map(r3):r3(n[4][j]),teil.nm!=null?teil.nm:-1]);
      return;
    }
    else if(alt.tag!==neu.tag){
      // Gleiche Eingaben, andere Rechnung: der Modellwechsel selbst.
      modell.v+=v;modell.n++;modell.top.push([teil.k,r3(v),teil.nm!=null?teil.nm:-1]);
      return;
    }
    else art='sonst';
    // Unter geaendertem Modell kann JEDE Zeile die neue Rechnung enthalten -
    // das wird gesagt statt verschwiegen.
    if(alt.tag!==neu.tag)teil.m=1;
    teil.a=art;
    if(Math.abs(v)>=JR_DISKRET_MIN)diskret=true;
    teile.push(teil);
  });
  Object.values(stetig).forEach(g=>{
    g.top.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    g.top=g.top.slice(0,JR_TOP);g.v=r3(g.v);
    teile.push(g);
  });
  if(modell.n){
    modell.top.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    modell.top=modell.top.slice(0,JR_TOP_MODELL);modell.v=r3(modell.v);
    if(Math.abs(modell.v)>=JR_DISKRET_MIN)diskret=true;
    teile.push(modell);
  }
  // Vergleichsfaktor: roh_alt * (faktor_neu - faktor_alt)
  const cO=+alt.c||1;
  if(cN!==cO){
    const v=r3((+alt.r||0)*(cN-cO));
    const wer=[];
    if(alt.k&&neu.k)Object.keys(neu.k).forEach(c=>{if(alt.k[c]!=null&&alt.k[c]!==neu.k[c])wer.push(c+' '+alt.k[c]+' → '+neu.k[c]);});
    if(v)teile.push({a:'cmp',v,roh:+alt.r||0,cfo:cO,cfn:cN,no:alt.n,nn:neu.n,ro:alt.ref,rn:neu.ref,w:wer.length?txt(wer.join(', ')):-1});
  }
  const dAlt=+alt.d||0,dNeu=+neu.d||0;
  const dDisp=Math.round((dNeu-dAlt)*10)/10;
  if(!dDisp&&!diskret)return null;
  // Rundung: was zwischen der exakten Rechnung und der angezeigten Zahl liegt.
  const summe=teile.reduce((s2,p)=>s2+p.v,0);
  const rund=r3(dDisp-summe);
  if(rund)teile.push({a:'rund',v:rund,xo:r3((+alt.r||0)*cO),xn:r3((+neu.r||0)*cN)});
  teile.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  const e={bt:alt.t,f:dAlt,o:dNeu,p:teile};
  if(alt.tag!==neu.tag){e.bg=alt.tag;}
  return e;
}

// ── Aufzeichnen ────────────────────────────────────────────────────────────
// Aufgerufen von recordScoreHist() - also genau dann, wenn auch der Tageswert
// fortgeschrieben wird. Damit stimmen Journal und Tageswert per Konstruktion
// ueberein (der letzte Eintrag eines Tages endet auf dem aufgezeichneten Wert).
// Rueckgabe: true, wenn sich am Journal etwas geaendert hat.
function jrErfassen(){
  if(!jrAktiv())return false;
  let geaendert=false;
  try{
    const jetzt=new Date().toISOString();
    const tag=SCORE_MODEL_TAG();
    const ref=fxRefCount();
    const zahlen={};
    (syms||[]).forEach(s=>{if(FX.includes(s.id))zahlen[s.id]=symTrackedCount(s);});
    const texte=[],textIdx=new Map();
    const txt=s=>{s=String(s==null?'':s);let i=textIdx.get(s);if(i==null){i=texte.length;texte.push(s);textIdx.set(s,i);}return i;};
    const lauf={id:Math.random().toString(36).slice(2,10),t:jetzt,tag,a:{}};
    if(_jrAnlass&&Date.now()-_jrAnlassT<120000){lauf.q=_jrAnlass;}
    trendAssets().forEach(id=>{
      const sym=(syms||[]).find(s=>s.id===id);if(!sym)return;
      const basis=scoreJournal.base[id];
      // ⚠ Die Zeit eines Eintrags ist nie frueher als seine Basis: zwei
      // Geraete haben verschiedene Uhren, und die Kette (jrKette) haengt an
      // "Ende des Vorgaengers <= Beginn des Nachfolgers".
      let t=jetzt;
      if(basis&&basis.t&&basis.t>=t)t=new Date(new Date(basis.t).getTime()+1).toISOString();
      const neu=jrSchnappschuss(sym,t,tag,ref,zahlen);
      if(!basis){scoreJournal.base[id]=neu;geaendert=true;if(!scoreJournal.seit||t<scoreJournal.seit)scoreJournal.seit=t;return;}
      const e=jrVergleich(basis,neu,txt);
      if(!e)return;
      // Zeit nur speichern, wenn sie von der des Laufs abweicht (Uhren-Schutz oben).
      if(t!==jetzt)e.t=t;
      lauf.a[id]=e;
      scoreJournal.base[id]=neu;
      geaendert=true;
    });
    // Anlass gilt nur fuer DIESE Erfassung - danach nie fuer einen spaeteren,
    // fremden Eintrag (sonst stuende "your change" an einem Kurs-Update).
    _jrAnlass=null;
    if(Object.keys(lauf.a).length){
      // Woerterbuch auf die wirklich benutzten Texte verdichten - jrVergleich
      // legt auch fuer Assets Texte an, die am Ende keinen Eintrag bekommen.
      const neuIdx=new Map(),x=[];
      const ref=i=>{if(i==null)return i;let j=neuIdx.get(i);if(j==null){j=x.length;x.push(texte[i]);neuIdx.set(i,j);}return j;};
      Object.values(lauf.a).forEach(e=>e.p.forEach(p=>{
        ['k','n','o','nm'].forEach(f=>{if(typeof p[f]==='number')p[f]=ref(p[f]);});
        if(typeof p.w==='number'&&p.w>=0)p.w=ref(p.w);
        (p.top||[]).forEach(t=>{t[0]=ref(t[0]);const ln=t.length-1;if(typeof t[ln]==='number'&&t[ln]>=0)t[ln]=ref(t[ln]);});
      }));
      lauf.x=x;
      scoreJournal.runs.push(lauf);
    }
    // Wann war die App an diesem Tag offen? Nur so kann die History an einem
    // Tag OHNE Eintrag unterscheiden zwischen "offen, nichts hat sich bewegt"
    // und "kein Geraet offen, der Wert ist der zuletzt synchronisierte".
    const heute=jrTagVon(jetzt),of=scoreJournal.offen||(scoreJournal.offen={});
    const bisher=of[heute];
    let nurLokal=false;
    if(!bisher){of[heute]=[jetzt,jetzt];nurLokal=true;}
    else{
      if(jetzt<bisher[0])bisher[0]=jetzt;
      if(jetzt>bisher[1]){
        // Nur alle 10 Minuten persistieren - das Journal ist gross, und ein
        // Schreibvorgang alle 15 s (save()-Takt) nur fuer eine Uhrzeit waere
        // reine Last. Einen Cloud-Push loest die Uhrzeit allein nie aus; sie
        // faehrt mit dem naechsten echten Eintrag mit.
        const alt=bisher[1];bisher[1]=jetzt;
        if(new Date(jetzt)-new Date(alt)>600000)nurLokal=true;
      }
    }
    if(geaendert||nurLokal){_jrVersion++;jrKappen();jrSchreiben();}
  }catch(e){
    // Ein Fehler im Journal darf die Aufzeichnung des Tageswerts nie
    // mitreissen - er wird aber sichtbar gemeldet (CLAUDE.md Regel 6).
    try{console.warn('Score journal: capture failed',e);}catch(_){}
  }
  return geaendert;
}
function jrKappen(){
  _jrVersion++;
  const grenze=dateAddStr(todayStr(),-JR_TAGE);
  scoreJournal.runs=(scoreJournal.runs||[]).filter(l=>l&&l.t&&jrTagVon(l.t)>=grenze)
    .sort((a,b)=>String(a.t).localeCompare(String(b.t)));
  const of=scoreJournal.offen||{};
  Object.keys(of).forEach(d=>{if(d<grenze||!Array.isArray(of[d]))delete of[d];});
  scoreJournal.offen=of;
  // Groessengrenze: aelteste Laeufe zuerst.
  let len=JSON.stringify(scoreJournal).length;
  while(len>JR_MAX_ZEICHEN&&scoreJournal.runs.length>1){
    const weg=scoreJournal.runs.shift();
    len-=JSON.stringify(weg).length+1;
  }
}
function jrSchreiben(){
  // ⚠ Zwei offene Tabs teilen sich localStorage: ohne diesen Merge gewinnt der
  // letzte Schreiber und die Eintraege des anderen Tabs sind weg (dieselbe
  // Klasse wie bei den Notizen, docs/state-sync.md). Vor dem Schreiben wird
  // deshalb mit dem vereinigt, was gerade auf der Platte steht.
  try{
    const platte=JSON.parse(localStorage.getItem(JOURNAL_KEY)||'null');
    if(jrGueltig(platte)&&platte.runs.length){
      const eigene=new Set(scoreJournal.runs.map(l=>l.id));
      if(platte.runs.some(l=>l&&l.id&&!eigene.has(l.id))){scoreJournal=mergeScoreJournal(platte,scoreJournal);_jrVersion++;jrKappen();}
    }
  }catch(e){}
  try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(scoreJournal));}
  catch(e){
    // Voller Speicher: einmal die aeltere Haelfte der Laeufe opfern und neu
    // versuchen, erst dann melden. Die Basis bleibt immer erhalten, sonst
    // waere der naechste Eintrag nicht mehr zerlegbar.
    try{
      const n=scoreJournal.runs.length;
      scoreJournal.runs=scoreJournal.runs.slice(Math.floor(n/2));
      localStorage.setItem(JOURNAL_KEY,JSON.stringify(scoreJournal));
    }catch(e2){try{saveQuotaFail(e2);}catch(_){}}
  }
}

// ── Geraete-Abgleich ───────────────────────────────────────────────────────
// Vereinigung der Laeufe (nach id), je Asset gewinnt die JUENGERE Basis. Zwei
// Geraete, die gleichzeitig offen waren, koennen dieselbe Bewegung je einmal
// aufgezeichnet haben - das loest die Anzeige ueber jrKette() auf (ueberlappende
// Eintraege werden nie doppelt gezaehlt), nicht der Merge.
function mergeScoreJournal(a,b){
  const A=jrGueltig(a)?a:jrLeer(),B=jrGueltig(b)?b:jrLeer();
  const runs=new Map();
  [...A.runs,...B.runs].forEach(l=>{if(l&&l.id&&l.t&&!runs.has(l.id))runs.set(l.id,l);});
  const base={};
  new Set([...Object.keys(A.base),...Object.keys(B.base)]).forEach(id=>{
    const x=A.base[id],y=B.base[id];
    base[id]=!x?y:!y?x:(String(y.t||'')>=String(x.t||'')?y:x);
  });
  const offen={};
  [A.offen||{},B.offen||{}].forEach(o=>Object.keys(o).forEach(d=>{
    const x=o[d];if(!Array.isArray(x)||x.length<2)return;
    const y=offen[d];
    offen[d]=!y?[x[0],x[1]]:[String(x[0])<String(y[0])?x[0]:y[0],String(x[1])>String(y[1])?x[1]:y[1]];
  }));
  const out={v:1,base,offen,runs:[...runs.values()].sort((p,q)=>String(p.t).localeCompare(String(q.t)))};
  const seit=[A.seit,B.seit].filter(Boolean).sort()[0];
  if(seit)out.seit=seit;
  return out;
}
function jrUebernehmen(fremd){
  if(!jrGueltig(fremd))return false;
  const vorher=JSON.stringify(scoreJournal);
  scoreJournal=mergeScoreJournal(fremd,scoreJournal);
  _jrVersion++;
  jrKappen();
  if(JSON.stringify(scoreJournal)===vorher)return false;
  jrSchreiben();
  return true;
}

// ── Lesen fuer die Anzeige ──────────────────────────────────────────────────
// Die Kette eines Assets: vom juengsten Eintrag rueckwaerts immer der naechste,
// der VOR dem Beginn des spaeteren endet. So kann keine Bewegung doppelt
// gezaehlt werden, auch wenn zwei Geraete dieselbe aufgezeichnet haben.
const _jrKettenCache=new Map();
function jrKette(symId,journal){
  // Nur das aktive Journal wird zwischengespeichert (ein uebergebenes, z.B.
  // im Waechter, nie) - die History ruft die Kette je Tageszeile auf.
  if(!journal){
    const c=_jrKettenCache.get(symId);
    if(c&&c.v===_jrVersion&&c.j===scoreJournal)return c.k;
    const k=jrKetteRoh(symId,scoreJournal);
    _jrKettenCache.set(symId,{v:_jrVersion,j:scoreJournal,k});
    return k;
  }
  return jrKetteRoh(symId,journal);
}
function jrKetteRoh(symId,journal){
  const alle=[];
  // Nur wohlgeformte Eintraege - das Journal kommt auch per Sync von einem
  // anderen Geraet, und ein kaputter Eintrag darf die History nie werfen lassen.
  (journal.runs||[]).forEach(l=>{
    const e=l&&l.a&&l.a[symId];
    if(!e||!Array.isArray(e.p)||!isFinite(+e.f)||!isFinite(+e.o))return;
    const t=e.t||l.t;if(t)alle.push({e,l,t:String(t)});
  });
  alle.sort((x,y)=>y.t.localeCompare(x.t));
  const kette=[];let grenze=null;
  alle.forEach(x=>{if(grenze==null||x.t<=grenze){kette.push(x);grenze=String(x.e.bt||'');}});
  return kette.reverse();
}
// Ab wann das Journal fuer dieses Asset lueckenlos mitschreibt (Zeitpunkt der
// aeltesten Basis in der Kette) - davor gibt es nur die Tageswerte.
function jrBeginn(symId){
  const k=jrKette(symId);
  if(k.length)return k[0].e.bt||k[0].t;
  const b=scoreJournal.base[symId];
  return b?b.t:null;
}
function jrEintraegeAm(symId,datum){
  return jrKette(symId).filter(x=>jrTagVon(x.t)===datum);
}

// ── Texte fuer die History ──────────────────────────────────────────────────
function jrT(l,i){return(i==null||i<0||!l||!Array.isArray(l.x))?'':(l.x[i]||'');}
function jrKeyVon(p,l){return jrT(l,p.k);}
function jrName(p,l){return(p.nm!=null&&p.nm>=0)?jrT(l,p.nm):jrKeyTeile(jrKeyVon(p,l)).name;}
function jrKarte(p,l){const k=jrKeyTeile(jrKeyVon(p,l)).karte;return k==='COT Data'?'Positioning & trend':k;}
function jrFaktorText(art,fo,fn){
  if(art==='faktor'&&Array.isArray(fo)&&Array.isArray(fn)){
    const nm=['surprise size','age','market relevance'];
    return[0,1,2].filter(j=>fo[j]!==fn[j]).map(j=>nm[j]+' ×'+(+fo[j]).toFixed(3)+' → ×'+(+fn[j]).toFixed(3)).join(', ');
  }
  const nm={dec:'age',mkt:'market relevance',mag:'surprise size'}[art]||'factor';
  return nm+' ×'+(+fo).toFixed(3)+' → ×'+(+fn).toFixed(3);
}
function jrRegelText(p){
  const W=typeof window!=='undefined'?window:{};
  try{
    if(p.y==='c'&&W.cotRegelText)return W.cotRegelText();
    if(p.y==='p'&&W.retailRegelText)return W.retailRegelText();
    if(p.y==='z'&&W.zinsdiffRegelText)return W.zinsdiffRegelText();
    if(p.y==='t'&&W.trendRegelText)return W.trendRegelText();
  }catch(e){}
  return'';
}
function jrManuellAm(symId,name,von,bis){
  // Hat der Nutzer diesen Indikator im Zeitfenster selbst umgestellt?
  return(scoreLog||[]).filter(x=>x&&x.sym===symId&&x.kind==='bias'&&String(x.t)>String(von||'')&&String(x.t)<=String(bis||'9')
    &&(x.ind===name))[0]||null;
}
// Ausfuehrliche Begruendung eines DISKRETEN Teils (und von Faktor/Rundung) -
// der Satz, der neben dem Betrag steht. Die gebuendelten stetigen Ursachen und
// der Modellwechsel werden in jrTagesBlock beschrieben, weil sie ueber mehrere
// Indikatoren gehen.
function jrWarum(p,l,e,symId){
  const alt=jrT(l,p.o),neu=jrT(l,p.n),name=p.k!=null?jrName(p,l):'';
  const ende=e.t||l.t;
  // Die Zeile steht auf der Skala des ANGEZEIGTEN Scores (roh x Vergleichs-
  // faktor). Ohne diesen Satz stuende "+0.75 statt -0.75" neben "+1.64" und
  // niemand koennte die Zahl nachrechnen.
  const dcRoh=r2((+p.cn||0)-(+p.co||0)),fak=dcRoh?Math.abs((+p.v||0)/dcRoh):null;
  const beitrag=' It now counts '+jrZahl(p.cn)+' in the score (before '+jrZahl(p.co)+')'
    +(fak&&Math.abs(fak-1)>0.005?'; times the comparability factor ×'+fak.toFixed(2)+' that is '+jrZahl(p.v)+' on the shown score':'')+'.';
  const modell=p.m?' The score model also changed in this interval ('+jrModellText(e.bg,l.tag)+'), so part of this can come from the new calculation.':'';
  switch(p.a){
    case'neu':return'Added to the card: '+neu+'.'+beitrag+modell;
    case'weg':return'Removed from the card (it was: '+alt+').'+beitrag+modell;
    case'alt':return'Aged out: its last release'+(p.d?' ('+fmtDayShort(p.d)+')':'')+' is now more than '+IND_STALE_CYCLES+' of its own release cycles old, so it stops counting until a new one arrives.'+beitrag+modell;
    case'frisch':return(p.d?'New release '+fmtDayShort(p.d)+' — ':'')+'counts again after being out of date: '+neu+'.'+beitrag+modell;
    case'anzeige':return'Switched between display-only and scored.'+beitrag+modell;
    case'regelwechsel':{
      const m=jrManuellAm(symId,name,e.bt,ende);
      return(m?'You set the rating by hand ('+m.from+' → '+m.to+'), which replaces the automatic rule points. ':'Switched between the automatic rule points and a hand-set rating. ')+'Now: '+neu+'.'+beitrag+modell;
    }
    case'rel':{
      const lbl={r:'New release',b:'New yield reading',c:'New COT report',s:'New reading',h:'New value'}[p.y]||'New reading';
      return lbl+(p.d?' ('+fmtDayShort(p.d)+')':'')+': '+neu+'. Before: '+alt+(p.da?' ('+fmtDayShort(p.da)+')':'')+'.'+beitrag+modell;
    }
    case'wert':return'Value updated'+(p.d?' for the '+fmtDayShort(p.d)+' reading':'')+': '+neu+'. Before: '+alt+'.'+beitrag+modell;
    case'regel':return'Rule input changed: '+neu+'. Before: '+alt+'.'+beitrag+modell;
    case'bias':{
      // Von Hand gesetzt? Bei einem gespiegelten Asset (Gold, Indizes, Renditen)
      // steht der Klick in der Quellwaehrung - dort wird mitgesucht.
      let m=jrManuellAm(symId,name,e.bt,ende),woanders='';
      if(!m){try{const q=isNonFx(symId)?macroCcyFor(symId):null;if(q){m=jrManuellAm(q,name,e.bt,ende);if(m)woanders=' on '+q+' (mirrored to this asset)';}}catch(_){}}
      return'Rating changed from '+(JR_BIAS_TXT[p.bo]||p.bo)+' to '+(JR_BIAS_TXT[p.bn]||p.bn)
        +(m?' — set by you'+woanders+' at '+jrUhr(m.t):l.q==='sync'?' — taken over from another device (sync)':l.q==='undo'?' — by undo/redo':'')+'.'
        +(neu&&neu!=='set by hand'?' Based on: '+neu+'.':'')+beitrag+modell;
    }
    case'gew':return'Base weight changed from '+p.wo+' to '+p.wn+' (half weight applies to indicators without a forecast, to core/headline pairs and to small weekly COT shifts).'+beitrag+modell;
    case'cmp':{
      const wer=jrT(l,p.w);
      return'Comparability factor ×'+(+p.cfo).toFixed(2)+' → ×'+(+p.cfn).toFixed(2)+'. Every score is scaled by the FX-major average of counting indicators ('
        +(+p.ro).toFixed(2)+' → '+(+p.rn).toFixed(2)+') divided by this asset’s own count ('+p.no+' → '+p.nn+')'
        +(wer?'; the count changed at '+wer:'')+'. The unscaled score of '+jrZahl(p.roh)+' times the change of the factor gives this amount.';
    }
    case'rund':return'The score is shown with one decimal. Exactly it went from '+jrZahl3(p.xo)+' to '+jrZahl3(p.xn)+', which displays as '+jrScoreTxt(e.f)+' → '+jrScoreTxt(e.o)+'.';
    default:return'Recalculated with unchanged inputs.'+beitrag;
  }
}
function jrTitel(p,l){
  switch(p.a){
    case'cmp':return'Comparability factor';
    case'rund':return'Rounding to one decimal';
    case'modell':return'Score model change';
    case'dec':return'Ageing of releases';
    case'mkt':return'Market relevance re-measured';
    case'mag':return'Surprise scale re-measured';
    case'faktor':return'Weighting factors changed';
    case'alt':return jrName(p,l)+' — aged out';
    default:return jrName(p,l);
  }
}

// ── Anzeige: ein Tag der History ────────────────────────────────────────────
// Gruppiert die Teile aller Eintraege eines Tages:
//   - diskrete Ursachen (Release, Regel, Bias, Alterungsgrenze ...) je Indikator,
//   - stetige Ursachen (Alter, Marktrelevanz, Ueberraschungs-Massstab) je Art,
//     weil sie meist viele Indikatoren um Hundertstel bewegen,
//   - Vergleichsfaktor, Modellwechsel und Rundung je als eigene Zeile.
// Die angezeigten Betraege (zwei Nachkommastellen) ergeben IMMER genau die
// angezeigte Tagesveraenderung - die Rundungszeile nimmt den Rest auf.
const JR_STETIG_TEXT={dec:'Every release loses weight as it gets older: after '+DECAY_HALFLIFE_CYCLES+' of its own release cycles it counts half. No new data is needed for this — time alone moves the score.',
  mkt:'How strongly an indicator counts also depends on how much the price moved on its past release days compared with all days. New prices shift this measurement slightly.',
  mag:'The size of a surprise is measured against the average miss of that indicator’s own history; a new release in the history shifts that yardstick.',
  faktor:'Several weighting factors of the same indicator moved at once.'};
function jrFarbe(v){return v>0.0049?BC.bull:v<-0.0049?BC.bear:'var(--t3)';}
function jrPfeil(v){return v>0.0049?'▲':v<-0.0049?'▼':'◆';}
function jrBetrag(v){const n=r2(v);return n===0?'±0.00':jrZahl(n);}
function jrKlein(v){return Math.abs(r2(v))>=0.01?jrZahl(v):(v>0?'+<0.01':v<0?'−<0.01':'±0.00');}
function jrZeileHtml(o){
  const col=jrFarbe(o.v);
  return`<div class="jr-z">
    <span class="jr-pf" style="color:${col}">${jrPfeil(o.v)}</span>
    <span class="jr-nm">${escH(o.titel)}${o.karte?` <span class="jr-kt">${escH(o.karte)}</span>`:''}</span>
    <span class="jr-v" style="color:${col};border-color:${col}">${escH(jrBetrag(o.v))}</span>
    <div class="jr-why">${escH(o.warum)}${o.regel?`<details class="jr-regel"><summary>How this rule scores</summary>${escH(o.regel)}</details>`:''}</div>
  </div>`;
}
function jrTagesBlock(symId,datum,info){
  const inf=info||{};
  const eintraege=jrEintraegeAm(symId,datum);
  const offen=((scoreJournal.offen||{})[datum])||null;
  const beginn=jrBeginn(symId);
  if(!eintraege.length)return{n:0,html:'',offen,beginn,delta:0};
  const erste=eintraege[0].e,letzte=eintraege[eintraege.length-1].e;
  const jrDelta=Math.round(((+letzte.o)-(+erste.f))*10)/10;
  const gruppen=new Map();
  eintraege.forEach(({e,l,t})=>e.p.forEach(p=>{
    const gk=(p.a==='rund'||p.a==='cmp'||p.a==='modell'||JR_STETIG.has(p.a))?p.a:'k:'+jrKeyVon(p,l);
    let g=gruppen.get(gk);if(!g){g={gk,v:0,teile:[]};gruppen.set(gk,g);}
    g.v+=p.v;g.teile.push({p,e,l,t});
  }));
  const zeilen=[];
  gruppen.forEach(g=>{
    if(g.gk==='rund')return;
    const t0=g.teile[0],mehrere=g.teile.length>1;
    if(g.gk.startsWith('k:')){
      const warum=mehrere
        ?g.teile.map(x=>jrUhr(x.t)+' ('+jrBetrag(x.p.v)+'): '+jrWarum(x.p,x.l,x.e,symId)).join(' · ')
        :jrWarum(t0.p,t0.l,t0.e,symId);
      const rg=(t0.p.a==='regel')?jrRegelText(t0.p):'';
      zeilen.push({v:g.v,titel:jrTitel(t0.p,t0.l),karte:jrKarte(t0.p,t0.l),warum,regel:rg});
    }else if(JR_STETIG.has(g.gk)||g.gk==='modell'){
      // Die groessten Einzelposten aller Eintraege des Tages je Indikator
      // zusammenfuehren; was darunter liegt, steht als Rest mit Summe da.
      const je=new Map();let nGes=0,summeTop=0;
      g.teile.forEach(x=>{
        nGes=Math.max(nGes,x.p.n||0);
        (x.p.top||[]).forEach(t=>{
          const key=jrT(x.l,t[0]);
          const nmIdx=g.gk==='modell'?t[2]:t[5];
          const y=je.get(key)||{v:0,key,name:(nmIdx!=null&&nmIdx>=0)?jrT(x.l,nmIdx):jrKeyTeile(key).name,d:g.gk==='modell'?'':t[2],fo:t[3],fn:t[4]};
          if(y.fo==null)y.fo=t[3];
          y.fn=t[4];y.v+=t[1];summeTop+=t[1];je.set(key,y);
        });
      });
      const liste=[...je.values()].sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
      const rest=g.v-summeTop;
      const auf=liste.map(y=>y.name+(y.d?' ('+fmtDayShort(y.d)+')':'')+' '+jrKlein(y.v)
        +(g.gk!=='modell'&&y.fo!=null?' ['+jrFaktorText(g.gk,y.fo,y.fn)+']':'')).join(', ')
        +(Math.abs(rest)>=0.0005?', other indicators together '+jrKlein(rest):'');
      const kopf=g.gk==='modell'
        ?'Same data, new calculation — '+jrModellText(t0.e.bg,t0.l.tag)+'.'
        :JR_STETIG_TEXT[g.gk];
      zeilen.push({v:g.v,titel:jrTitel(t0.p,t0.l)+(nGes?' ('+nGes+(nGes===1?' indicator':' indicators')+')':''),karte:'',
        warum:kopf+' By indicator: '+auf+'.'});
    }else if(g.gk==='cmp'){
      const erst=g.teile[0].p,letzt=g.teile[g.teile.length-1].p;
      const warum=mehrere?g.teile.map(x=>jrUhr(x.t)+' ('+jrBetrag(x.p.v)+'): '+jrWarum(x.p,x.l,x.e,symId)).join(' · '):jrWarum(erst,t0.l,t0.e,symId);
      zeilen.push({v:g.v,titel:'Comparability factor ×'+(+erst.cfo).toFixed(2)+' → ×'+(+letzt.cfn).toFixed(2),karte:'',warum});
    }
  });
  zeilen.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  // Rundung so bemessen, dass die ANGEZEIGTEN Betraege exakt aufgehen.
  const summeGezeigt=zeilen.reduce((s2,z)=>s2+r2(z.v),0);
  const rest=r2(jrDelta-summeGezeigt);
  const gr=gruppen.get('rund');
  if(rest){
    const p0=gr?gr.teile[0].p:null,p1=gr?gr.teile[gr.teile.length-1].p:null;
    zeilen.push({v:rest,titel:'Rounding to one decimal',karte:'',
      warum:'The score is shown with one decimal'+(p0?': exactly it went from '+jrZahl3(p0.xo)+' to '+jrZahl3(p1.xn)+', displayed as '+jrScoreTxt(erste.f)+' → '+jrScoreTxt(letzte.o):'')
        +'. This line is the difference between that rounding and the exact amounts above, so the lines add up to the change shown.'});
  }
  // Abgleich mit dem aufgezeichneten Tageswert: was davor lag, ohne Journal.
  let abgleich='';
  if(inf.histDelta!=null&&isFinite(inf.histDelta)){
    const lueck=Math.round((inf.histDelta-jrDelta)*10)/10;
    if(Math.abs(lueck)>=0.05)abgleich=jrZeileHtml({v:lueck,titel:'Not covered by the journal',karte:'',
      warum:'The day change is measured from the recorded value of the previous day ('+jrScoreTxt(inf.prevScore)+(inf.prevDatum?', '+fmtDayShort(inf.prevDatum):'')+'); the first journal entry of this day starts from '+jrScoreTxt(erste.f)
        +'. The difference happened while this asset was not yet recorded by the journal (it records from '+(beginn?fmtDayShort(jrTagVon(beginn))+' '+jrUhr(beginn):'—')+') or on a device without it, so its causes were not captured.'});
  }
  const zeitleiste=eintraege.map(({e,l,t})=>{
    const d=Math.round((e.o-e.f)*10)/10;
    const pr=e.p.find(p=>p.a==='rund');
    const top=e.p.filter(p=>p.a!=='rund').slice(0,3).map(p=>jrTitel(p,l)+' '+jrKlein(p.v)).join(', ')
      +(pr?' · exact '+jrZahl3(pr.xo)+' → '+jrZahl3(pr.xn):'');
    const spanne=e.bt&&jrTagVon(e.bt)!==jrTagVon(t)?' — covers everything since '+fmtDayShort(jrTagVon(e.bt))+' '+jrUhr(e.bt)+' (the app was closed in between)':'';
    const anlass=l.q==='sync'?' · taken over from another device':l.q==='manual'?' · your change':l.q==='undo'?' · undo/redo':'';
    return`<div class="jr-l"><span class="jr-lt">${escH(jrUhr(t))}</span><span class="jr-ld" style="color:${jrFarbe(d)}">${escH(jrScoreTxt(e.f))} → ${escH(jrScoreTxt(e.o))}${d?' ('+(d>0?'+':'')+d+')':' (composition only)'}</span><span class="jr-lw">${escH(top+spanne+anlass)}</span></div>`;
  }).join('');
  const html=`<div class="jr-tag">${zeilen.map(jrZeileHtml).join('')}${abgleich}
    <details class="jr-lauf"${inf.offenLauf?' open':''}><summary>${eintraege.length} recorded ${eintraege.length===1?'change':'changes'} on this day, with time</summary>${zeitleiste}</details></div>`;
  return{n:eintraege.length,html,offen,beginn,delta:jrDelta};
}
// Kopfzeile des Panels: aktueller Score, heutige Veraenderung, Zahl der
// heutigen Aenderungen - die drei Dinge, die der Nutzer zuerst sehen will.
function jrKopfHtml(symId,live,prevScore,prevDatum,nHeute){
  const d=prevScore!=null?Math.round((live-prevScore)*10)/10:null;
  const col=d==null?'var(--t3)':jrFarbe(d);
  const beginn=jrBeginn(symId);
  const heute=todayStr();
  let dritte;
  if(nHeute)dritte=nHeute+' recorded '+(nHeute===1?'change':'changes')+' today — every cause is listed in today\u2019s row';
  else if(!d)dritte='No change today';
  else if(beginn&&jrTagVon(beginn)===heute)dritte='The score journal started today at '+jrUhr(beginn)+'; today\u2019s change happened before that and is explained from the recorded values in today\u2019s row';
  else dritte='Today\u2019s change was recorded without the journal (another device or an older version) — see today\u2019s row';
  return`<div class="jr-kopf"><span class="jr-k1">Current score <b style="color:${jrFarbe(live)}">${escH(jrScoreTxt(live))}</b></span>`
    +`<span class="jr-k2">Today <b style="color:${col}">${d==null?'no earlier day recorded':escH((d>0?'+':d<0?'':'±')+d)}</b>${d!=null&&prevDatum?` <span class="jr-k3">vs ${escH(fmtDayShort(prevDatum))} (${escH(jrScoreTxt(prevScore))})</span>`:''}</span>`
    +`<span class="jr-k2">${escH(dritte)}</span></div>`;
}

export {JOURNAL_KEY,JR_MODELL_NOTIZ,JR_TAGE,scoreJournal,loadScoreJournal,jrSeit,jrErfassen,jrBootFertig,jrSperren,jrFreigeben,
  jrAnlassMerken,jrAktiv,mergeScoreJournal,jrUebernehmen,jrKette,jrBeginn,jrEintraegeAm,jrTagVon,jrUhr,jrWarum,jrTitel,
  jrName,jrKarte,jrZahl,jrScoreTxt,jrModellText,jrModellNr,jrKeyTeile,jrSchnappschuss,jrVergleich,JR_STETIG,
  jrTagesBlock,jrKopfHtml};
// Fuer die Waechter (check/journal.js) und die Konsole.
if(typeof window!=='undefined'){
  Object.defineProperty(window,'scoreJournal',{get:()=>scoreJournal,configurable:true});
  Object.assign(window,{jrErfassen,jrKette,jrEintraegeAm,jrVergleich,jrSchnappschuss,mergeScoreJournal,jrUebernehmen,JR_MODELL_NOTIZ,jrAktiv,jrTagesBlock,jrModellText,
    // Nur fuer die Gegenprobe in check/journal.js (Journal kuenstlich stilllegen).
    jrSperren,jrFreigeben});
}
