'use strict';
// ══ REGIME RADAR ═══════════════════════════════════════════════════════
// Nutzer-Wunsch 2026-09-15: "Stell mir mal zusammen so Szenarien generell
// z.B. Crash was könnte man beobachten für Indikatoren z.B. Produktivität
// usw ... und wie könnte man das auf der Webseite hinzufügen".
// Abgestimmt per Rueckfrage: Stufe 1 (Regime Radar) als EIGENER TAB, nur
// aus Daten, die die App ohnehin schon holt - keine neue Quelle.
//
// ⚠ DIE DREI REGELN, DIE DIESES MODUL TRAGEN:
//
// 1. KEIN SCORE-EINGRIFF. Ein Regime ist Kontext fuer die Deutung, keine
//    dreizehnte Stimme in derselben Summe. Genau das war "Risk Environment",
//    und es ist am 2026-09-13 auf Nutzer-Wunsch wieder ausgebaut worden.
//    Dieses Modul liest nur; es schreibt nirgends einen Bias.
//
// 2. NICHTS WIRD GESCHAETZT (CLAUDE.md Grundsatz 4). Eine Bedingung ohne
//    echte Live-Quelle liefert null und erscheint als "Not measured" - sie
//    zaehlt weder als erfuellt noch als nicht erfuellt und faellt aus dem
//    Nenner. Sonst saehe ein halb belegtes Regime aus wie ein bestaetigtes.
//    Zwei Szenarien tragen solche Luecken bewusst sichtbar (Funding Squeeze
//    braucht Cross-Currency-Basis, Productivity braucht die BLS-Reihe) -
//    das ist die ehrliche Auskunft, was die App NICHT sehen kann.
//
// 3. JEDE SCHWELLE GEGEN DIE EIGENE HISTORIE, nicht gegen eine gemerkte
//    Zahl. "VIX ueber 20" altert; "VIX ueber seinem eigenen 80. Perzentil"
//    nicht. Wo eine absolute Schwelle steht (Kurve unter null, PMI unter
//    50), ist sie definitorisch und nicht kalibriert.
import {IND_DATA_FEED,RISK_INDEX_DATA,priceSeriesFor} from './data-feeds.js';
import {bondSeriesPts,bondSpreadPts,ohneWochenende,parseNumLike,SENTIMENT_DATA} from './main.js';

const RG_CCYS=['USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD'];
// Unter dieser Zahl messbarer Bedingungen wird KEIN Prozentwert gezeigt.
const REGIME_MIN_BED=3;

// ── Kleine Rechenhilfen ────────────────────────────────────────────────
/** Rang eines Werts in einer Zahlenreihe, in Prozent (0 = kleinster). */
function rgPerzentil(reihe,wert){
  const r=reihe.filter(x=>isFinite(x));
  if(r.length<20)return null;                 // unter 20 Punkten ist ein Perzentil eine Behauptung
  const kleiner=r.filter(x=>x<wert).length;
  return Math.round(kleiner/r.length*100);
}
/** Schlusskurse eines Assets ohne Wochenende, aelteste zuerst. */
function rgKurse(id){
  const s=priceSeriesFor(id);
  if(!Array.isArray(s)||s.length<30)return null;
  const ohne=ohneWochenende(s,id);
  const out=[];
  (ohne||[]).forEach(e=>{const d=String(e&&e[0]||'').slice(0,10),c=Number(e&&e[1]);if(d&&isFinite(c)&&c>0)out.push([d,c]);});
  return out.length>=30?out:null;
}
/** Rendite ueber n Handelstage, in Prozent. */
function rgRendite(id,n){
  const k=rgKurse(id);
  if(!k||k.length<=n)return null;
  const a=k[k.length-1-n][1],b=k[k.length-1][1];
  if(!a)return null;
  return (b/a-1)*100;
}
/** Annualisierte realisierte Vol ueber n Tage, plus ihr eigenes Perzentil. */
function rgVol(id,n){
  const k=rgKurse(id);
  if(!k||k.length<n+40)return null;
  const lr=[];
  for(let i=1;i<k.length;i++){const v=Math.log(k[i][1]/k[i-1][1]);if(isFinite(v))lr.push(v);}
  const fenster=i=>{
    const teil=lr.slice(i-n,i);
    if(teil.length<n)return null;
    const m=teil.reduce((a,b)=>a+b,0)/teil.length;
    const va=teil.reduce((a,b)=>a+(b-m)*(b-m),0)/(teil.length-1);
    return Math.sqrt(va*252)*100;
  };
  const alle=[];
  for(let i=n;i<=lr.length;i++){const v=fenster(i);if(v!=null&&isFinite(v))alle.push(v);}
  if(!alle.length)return null;
  const jetzt=alle[alle.length-1];
  return {wert:jetzt,pct:rgPerzentil(alle,jetzt)};
}
/** Abstand zum hoechsten Schluss der letzten n Tage, in Prozent (<=0). */
function rgDrawdown(id,n){
  const k=rgKurse(id);
  if(!k||k.length<30)return null;
  const teil=k.slice(-n);
  const hoch=Math.max(...teil.map(x=>x[1]));
  const jetzt=teil[teil.length-1][1];
  if(!hoch)return null;
  return (jetzt/hoch-1)*100;
}
/** Eine Sentiment-Reihe (vix/putCall) als Zahlen, aelteste zuerst. */
function rgSentReihe(schluessel){
  const d=SENTIMENT_DATA&&SENTIMENT_DATA[schluessel];
  const s=d&&Array.isArray(d.series)?d.series:null;
  if(!s||s.length<20)return null;
  const out=[];
  s.forEach(e=>{const v=Number(e&&e[1]);if(isFinite(v))out.push(v);});
  return out.length>=20?out:null;
}
/** Ein Indikator-Eintrag aus dem Feed. */
function rgInd(ccy,name){
  const f=IND_DATA_FEED&&IND_DATA_FEED[ccy];
  const e=f&&f[name];
  return (e&&typeof e==='object')?e:null;
}
/** [Datum, actual, forecast] eines Indikators als Zahlen. */
function rgIndHist(ccy,name){
  const e=rgInd(ccy,name);
  const h=e&&Array.isArray(e.historyFull)?e.historyFull:null;
  if(!h)return null;
  const out=[];
  h.forEach(r=>{
    const d=String(r&&r[0]||'').slice(0,10);
    const a=parseNumLike(r&&r[1]),f=parseNumLike(r&&r[2]);
    if(d&&a!=null&&isFinite(a))out.push([d,a,(f!=null&&isFinite(f))?f:null]);
  });
  return out.length?out:null;
}
/** Der zuletzt veroeffentlichte Wert eines Indikators als Zahl. */
function rgIndWert(ccy,name){
  const e=rgInd(ccy,name);
  const v=e?parseNumLike(e.actual):null;
  return (v!=null&&isFinite(v))?v:null;
}

// ── Die Bausteine ──────────────────────────────────────────────────────
// Jeder liefert ein Objekt mit `txt` (was dasteht) und den Rohzahlen -
// oder null, wenn es keinen echten Wert gibt.

/** Zinskurve 10Y-2Y in Prozentpunkten, mit Perzentil und 3-Monats-Aenderung. */
function rgKurve(ccy){
  const pts=bondSpreadPts(ccy);
  if(!Array.isArray(pts)||pts.length<40)return null;
  const werte=pts.map(p=>p[1]).filter(isFinite);
  const jetzt=werte[werte.length-1];
  const vor=werte.length>60?werte[werte.length-61]:null;
  return {wert:jetzt,pct:rgPerzentil(werte,jetzt),
    delta:vor!=null?jetzt-vor:null,
    txt:`${jetzt>0?'+':''}${jetzt.toFixed(2)}pp`};
}
/** Realzins: 10Y-Rendite minus CPI (Headline) y/y, in Prozentpunkten. */
function rgRealzins(ccy){
  const pts=bondSeriesPts(ccy,'10Y Bond Yield');
  const r=Array.isArray(pts)&&pts.length?pts[pts.length-1][1]:null;
  // ⚠ AUSDRUECKLICH "CPI (Headline)" - der Eintrag "CPI" ist in diesem Feed
  // die MONATSRATE (period m/m). Mit ihr gerechnet kaeme ein Realzins von
  // rund +4pp heraus, wo er in Wahrheit knapp ueber null liegt.
  const cpi=rgIndWert(ccy,'CPI (Headline)');
  if(r==null||cpi==null||!isFinite(r))return null;
  const v=r-cpi;
  return {wert:v,rendite:r,cpi,txt:`${v>0?'+':''}${v.toFixed(2)}pp`};
}
/** VIX: Stand, Perzentil und die 5-Tage-Veraenderung in Prozent. */
function rgVix(){
  const r=rgSentReihe('vix');
  if(!r)return null;
  const jetzt=r[r.length-1];
  const vor=r.length>5?r[r.length-6]:null;
  return {wert:jetzt,pct:rgPerzentil(r,jetzt),
    schub:vor?(jetzt/vor-1)*100:null,
    txt:jetzt.toFixed(1)};
}
/** Put/Call: Stand und Perzentil. */
function rgPutCall(){
  const r=rgSentReihe('putCall');
  if(!r)return null;
  const jetzt=r[r.length-1];
  return {wert:jetzt,pct:rgPerzentil(r,jetzt),txt:jetzt.toFixed(2)};
}
/** Der fertige Risk-Index aus risk_index.json. */
function rgRisk(){
  const d=RISK_INDEX_DATA;
  if(!d||d.value==null||!isFinite(Number(d.value)))return null;
  return {wert:Number(d.value),pct:(d.percentile!=null&&isFinite(Number(d.percentile)))?Number(d.percentile):null,
    label:String(d.label||''),txt:String(d.label||'')+' '+Number(d.value).toFixed(2)};
}
/** Sicherer-Hafen-Gleichlauf: (JPY+CHF+GOLD)/3 minus (AUD+NZD)/2 ueber 5 Tage. */
function rgHafen(){
  const h=['JPY','CHF','GOLD'].map(x=>rgRendite(x,5));
  const z=['AUD','NZD'].map(x=>rgRendite(x,5));
  if(h.some(x=>x==null)||z.some(x=>x==null))return null;
  const a=h.reduce((s,x)=>s+x,0)/h.length,b=z.reduce((s,x)=>s+x,0)/z.length;
  const v=a-b;
  return {wert:v,hafen:a,zyklisch:b,txt:`${v>0?'+':''}${v.toFixed(2)}pp`};
}
/** Gegen wie viele der sieben anderen Waehrungen hat der Dollar in 5 Tagen zugelegt? */
function rgDollarBreite(){
  const andere=RG_CCYS.filter(c=>c!=='USD');
  const r=andere.map(c=>({c,v:rgRendite(c,5)}));
  if(r.some(x=>x.v==null))return null;
  const fest=r.filter(x=>x.v<0);          // die andere Waehrung faellt = Dollar fest
  return {wert:fest.length,von:andere.length,
    gegenHafen:['JPY','CHF'].every(c=>{const x=r.find(y=>y.c===c);return x&&x.v<0;}),
    txt:`${fest.length}/${andere.length}`};
}
/** Wie viele der letzten drei Releases lagen ueber ihrem Forecast? */
function rgUeberraschung(ccy,name,n){
  const h=rgIndHist(ccy,name);
  if(!h)return null;
  const mitF=h.filter(r=>r[2]!=null).slice(-n);
  if(mitF.length<n)return null;
  const ueber=mitF.filter(r=>r[1]>r[2]).length;
  return {wert:ueber,von:n,txt:`${ueber}/${n}`};
}
/** Arbeitslosenquote minus ihr eigenes Tief der letzten 12 Meldungen (Sahm-Logik). */
function rgArbeitslos(ccy){
  const h=rgIndHist(ccy,'Unemployment Rate');
  if(!h||h.length<12)return null;
  const letzte=h.slice(-12).map(r=>r[1]);
  const tief=Math.min(...letzte);
  const jetzt=letzte[letzte.length-1];
  return {wert:jetzt-tief,jetzt,tief,txt:`+${(jetzt-tief).toFixed(2)}pp`};
}
/** Erstantraege: Schnitt der letzten 4 gegen den Schnitt der 4 davor. */
function rgClaims(ccy){
  const h=rgIndHist(ccy,'Unemployment Claims');
  if(!h||h.length<12)return null;
  const w=h.map(r=>r[1]);
  const m=(a)=>a.reduce((s,x)=>s+x,0)/a.length;
  const neu=m(w.slice(-4)),alt=m(w.slice(-12,-8));
  if(!alt)return null;
  return {wert:(neu/alt-1)*100,neu,alt,txt:`${neu>alt?'+':''}${((neu/alt-1)*100).toFixed(1)}%`};
}
/** Spannweite der 2-Jahres-Renditen ueber alle acht Waehrungen. */
function rgSpreizung(){
  const w=[];
  RG_CCYS.forEach(c=>{
    const p=bondSeriesPts(c,'2Y Bond Yield');
    if(Array.isArray(p)&&p.length)w.push({c,v:p[p.length-1][1]});
  });
  if(w.length<6)return null;
  const hoch=w.reduce((a,b)=>b.v>a.v?b:a),tief=w.reduce((a,b)=>b.v<a.v?b:a);
  return {wert:hoch.v-tief.v,hoch:hoch.c,tief:tief.c,
    txt:`${(hoch.v-tief.v).toFixed(2)}pp (${hoch.c} − ${tief.c})`};
}
/** Naeherung fuer Produktivitaet: BIP-Wachstum minus Beschaeftigungswachstum. */
// ⚠ AUSDRUECKLICH EINE NAEHERUNG, und sie steht auch so auf der Seite. Die
// echte Reihe (Nonfarm Business Productivity, Lohnstueckkosten) kommt vom
// BLS und ist in dieser App NICHT angebunden. Was hier gerechnet wird, ist
// die Differenz zweier VORHANDENER, echter Reihen - kein geschaetzter Wert,
// aber auch nicht dasselbe wie die amtliche Zahl.
function rgProduktivitaet(ccy){
  const g=rgIndHist(ccy,'GDP Growth QoQ');
  const b=rgIndHist(ccy,'NFP / Employment Change');
  if(!g||!b||g.length<2||b.length<8)return null;
  const gq=g[g.length-1][1];                       // Quartalswachstum in %
  // Beschaeftigung: die letzten drei Meldungen gegen die drei davor. Die
  // Einheit ist je Waehrung verschieden (USD in Tausend, EUR in Prozent) -
  // deshalb eine VERHAELTNISzahl, die ohne Einheit auskommt.
  const w=b.map(r=>r[1]);
  const m=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const neu=m(w.slice(-3)),alt=m(w.slice(-6,-3));
  if(!isFinite(gq)||!isFinite(neu)||!isFinite(alt))return null;
  return {wert:gq,bipQ:gq,beschNeu:neu,beschAlt:alt,
    beschSteigt:neu>alt,
    txt:`GDP ${gq>0?'+':''}${gq.toFixed(2)}% q/q`};
}
/** CPI (Headline) y/y jetzt gegen den Stand von vor sechs Meldungen. */
function rgCpiTrend(ccy){
  const h=rgIndHist(ccy,'CPI (Headline)');
  if(!h||h.length<7)return null;
  const jetzt=h[h.length-1][1],vor=h[h.length-7][1];
  const alle=h.map(r=>r[1]);
  return {wert:jetzt,delta:jetzt-vor,pct:rgPerzentil(alle.slice(-36),jetzt),
    txt:`${jetzt.toFixed(1)}% y/y`};
}

// ── Die Szenarien ──────────────────────────────────────────────────────
// Eine Bedingung ist {txt, pruef} - pruef() liefert {ok, wert} oder null
// fuer "Not measured". `warum` erklaert bei null, WAS fehlt.
const REGIME_SZENARIEN=[
  {
    id:'riskoff', name:'Risk-Off Shock',
    kurz:'Volatility spikes and everything moves the same way at once.',
    lang:'A crash is not "equities fall" — equities fall all the time. It is correlations collapsing into one direction: volatility jumps, havens bid, cyclicals sold, and the move is fast rather than deep. The condition that would separate a correction from systemic stress is credit, and that is the one this app cannot see.',
    bed:[
      {txt:'S&P 500 realised volatility (20d) in the top 20% of its own history',
       pruef:()=>{const v=rgVol('SP500',20);return v&&v.pct!=null?{ok:v.pct>=80,wert:`${v.wert.toFixed(1)}% · ${v.pct}th pct`}:null;},
       warum:'no price series long enough for a 20-day volatility window'},
      {txt:'VIX up 30% or more over five days (the speed, not the level)',
       pruef:()=>{const v=rgVix();return v&&v.schub!=null?{ok:v.schub>=30,wert:`${v.schub>0?'+':''}${v.schub.toFixed(1)}% · VIX ${v.txt}`}:null;},
       warum:'no VIX series in sentiment_data.json'},
      {txt:'S&P 500 at least 5% below its own one-year high',
       pruef:()=>{const d=rgDrawdown('SP500',252);return d!=null?{ok:d<=-5,wert:`${d.toFixed(1)}%`}:null;},
       warum:'no price series for the S&P 500'},
      {txt:'Havens beating cyclicals by 1.5pp over five days (JPY/CHF/Gold vs AUD/NZD)',
       pruef:()=>{const h=rgHafen();return h?{ok:h.wert>=1.5,wert:h.txt}:null;},
       warum:'one of the five price series is missing'},
      {txt:'Put/Call ratio in the top 30% of its own history',
       pruef:()=>{const p=rgPutCall();return p&&p.pct!=null?{ok:p.pct>=70,wert:`${p.txt} · ${p.pct}th pct`}:null;},
       warum:'no put/call series'},
      {txt:'Risk index in the risk-off quintile',
       pruef:()=>{const r=rgRisk();return r&&r.pct!=null?{ok:r.pct>=80,wert:`${r.txt} · ${r.pct}th pct`}:null;},
       warum:'risk_index.json has not loaded'},
      {txt:'US high-yield credit spreads widening',kern:true,
       pruef:()=>null,
       warum:'no credit-spread source is wired up. This is the condition that separates a correction from systemic stress — without it the rest measures equity mood, not solvency stress.'},
    ],
  },
  {
    id:'funding', name:'Funding Squeeze',
    kurz:'Dollar shortage — the dollar rises against everything, havens included.',
    lang:'The rare and most expensive variant, and the one FX reacts to hardest. What tells it apart from ordinary risk-off: the dollar gains even against the yen and the franc, and gold falls WITH equities because positions are being liquidated rather than rotated. Two of the cleanest tells sit behind sources this app does not carry.',
    bed:[
      {txt:'Dollar stronger against at least 6 of the other 7 currencies over five days',
       pruef:()=>{const d=rgDollarBreite();return d?{ok:d.wert>=6,wert:d.txt}:null;},
       warum:'not every currency has a five-day price history'},
      {txt:'Dollar stronger against BOTH the yen and the franc (the distinguishing leg)',
       pruef:()=>{const d=rgDollarBreite();return d?{ok:!!d.gegenHafen,wert:d.gegenHafen?'yes':'no'}:null;},
       warum:'not every currency has a five-day price history'},
      {txt:'Gold falling together with equities over five days (liquidation, not flight)',
       pruef:()=>{const g=rgRendite('GOLD',5),s=rgRendite('SP500',5);
         return (g!=null&&s!=null)?{ok:g<0&&s<0,wert:`Gold ${g>0?'+':''}${g.toFixed(1)}% · S&P ${s>0?'+':''}${s.toFixed(1)}%`}:null;},
       warum:'no price series for gold or the S&P 500'},
      {txt:'Cross-currency basis (EUR/USD, USD/JPY) turning sharply negative',kern:true,
       pruef:()=>null,
       warum:'no basis source is wired up — this is THE dollar-shortage indicator'},
      {txt:'SOFR–OIS spread widening',
       pruef:()=>null,
       warum:'no money-market source is wired up'},
    ],
  },
  {
    id:'inflation', name:'Inflation Shock',
    kurz:'Prices surprise upward and real yields go negative.',
    lang:'Not the level of inflation but its direction and its surprises. The decisive number is the real yield: as long as nominal yields stay below inflation, holding the currency costs purchasing power every day, and central banks are behind the curve rather than ahead of it.',
    bed:[
      {txt:'Headline CPI in the top 25% of its own three-year range',
       pruef:(ccy)=>{const c=rgCpiTrend(ccy);return c&&c.pct!=null?{ok:c.pct>=75,wert:`${c.txt} · ${c.pct}th pct`}:null;},
       warum:'not enough CPI history for this currency'},
      {txt:'At least 2 of the last 3 CPI releases above forecast',
       pruef:(ccy)=>{const u=rgUeberraschung(ccy,'CPI (Headline)',3);return u?{ok:u.wert>=2,wert:u.txt}:null;},
       warum:'the CPI history carries no forecasts for this currency'},
      {txt:'Real yield (10Y minus headline CPI) below zero',
       pruef:(ccy)=>{const r=rgRealzins(ccy);return r?{ok:r.wert<0,wert:`${r.txt} (10Y ${r.rendite.toFixed(2)}% − CPI ${r.cpi.toFixed(1)}%)`}:null;},
       warum:'no 10-year yield or no headline CPI for this currency'},
      {txt:'Oil up 15% or more over three months',
       pruef:()=>{const o=rgRendite('OIL',63);return o!=null?{ok:o>=15,wert:`${o>0?'+':''}${o.toFixed(1)}%`}:null;},
       warum:'no oil price series'},
      {txt:'Gold up 10% or more over three months',
       pruef:()=>{const g=rgRendite('GOLD',63);return g!=null?{ok:g>=10,wert:`${g>0?'+':''}${g.toFixed(1)}%`}:null;},
       warum:'no gold price series'},
    ],
  },
  {
    id:'slowdown', name:'Growth Slowdown',
    kurz:'The curve, the labour market and the surveys turn together.',
    lang:'⚠ The recession signal is not the inversion itself but the RE-STEEPENING out of it: historically the curve has already turned back up by the time a downturn starts, because the market is pricing cuts. Watching only "is it inverted" means watching the warning after it has been given.',
    bed:[
      {txt:'Yield curve (10Y minus 2Y) in the bottom 25% of its own history',
       pruef:(ccy)=>{const k=rgKurve(ccy);return k&&k.pct!=null?{ok:k.pct<=25,wert:`${k.txt} · ${k.pct}th pct`}:null;},
       warum:'no 2Y/10Y pair for this currency'},
      {txt:'Curve steepening by 0.25pp or more over three months',
       pruef:(ccy)=>{const k=rgKurve(ccy);return k&&k.delta!=null?{ok:k.delta>=0.25,wert:`${k.delta>0?'+':''}${k.delta.toFixed(2)}pp`}:null;},
       warum:'less than three months of curve history'},
      {txt:'Unemployment rate at least 0.3pp above its own 12-release low',
       pruef:(ccy)=>{const a=rgArbeitslos(ccy);return a?{ok:a.wert>=0.3,wert:`${a.txt} (${a.jetzt}% vs low ${a.tief}%)`}:null;},
       warum:'fewer than 12 unemployment releases on file'},
      {txt:'Jobless claims 4-week average above its level two months earlier',
       pruef:(ccy)=>{const c=rgClaims(ccy);return c?{ok:c.wert>0,wert:c.txt}:null;},
       warum:'this currency has no weekly claims series'},
      {txt:'Manufacturing PMI below 50',
       pruef:(ccy)=>{const v=rgIndWert(ccy,'Manufacturing PMI');return v!=null?{ok:v<50,wert:v.toFixed(1)}:null;},
       warum:'no manufacturing PMI for this currency'},
      {txt:'Services PMI below 50',
       pruef:(ccy)=>{const v=rgIndWert(ccy,'Services PMI');return v!=null?{ok:v<50,wert:v.toFixed(1)}:null;},
       warum:'no services PMI for this currency'},
    ],
  },
  {
    id:'divergence', name:'Policy Divergence',
    kurz:'Central banks pull apart — the core FX driver.',
    lang:'The two-year yield is the market\'s own guess at where policy goes, so the spread between two of them is the cleanest divergence measure available here. Rate-probability data exists in the app as well but is deliberately not used for this: its meaning per meeting would need to be verified first, and a wrong reading is worse than a narrower one.',
    bed:[
      {txt:'Spread of 2-year yields across the eight currencies above 2.5pp',
       pruef:()=>{const s=rgSpreizung();return s?{ok:s.wert>=2.5,wert:s.txt}:null;},
       warum:'fewer than six currencies carry a 2-year yield'},
      {txt:'This currency\'s curve differs from its own 3-month level by 0.25pp',
       pruef:(ccy)=>{const k=rgKurve(ccy);return k&&k.delta!=null?{ok:Math.abs(k.delta)>=0.25,wert:`${k.delta>0?'+':''}${k.delta.toFixed(2)}pp`}:null;},
       warum:'less than three months of curve history'},
      {txt:'Real yield positive — the currency pays to hold',
       pruef:(ccy)=>{const r=rgRealzins(ccy);return r?{ok:r.wert>0,wert:r.txt}:null;},
       warum:'no 10-year yield or no headline CPI for this currency'},
    ],
  },
  {
    id:'soft', name:'Soft Landing',
    kurz:'Growth holds, inflation falls, volatility stays low — carry works.',
    lang:'Deliberately its own scenario rather than "none of the others". It is the most common state by far, and naming it keeps the radar from reading a perfectly ordinary market as an absence of information.',
    bed:[
      {txt:'S&P 500 realised volatility (20d) in the bottom 40% of its own history',
       pruef:()=>{const v=rgVol('SP500',20);return v&&v.pct!=null?{ok:v.pct<=40,wert:`${v.wert.toFixed(1)}% · ${v.pct}th pct`}:null;},
       warum:'no price series long enough for a 20-day volatility window'},
      {txt:'Yield curve positive',
       pruef:(ccy)=>{const k=rgKurve(ccy);return k?{ok:k.wert>0,wert:k.txt}:null;},
       warum:'no 2Y/10Y pair for this currency'},
      {txt:'Headline CPI lower than six releases ago',
       pruef:(ccy)=>{const c=rgCpiTrend(ccy);return c&&c.delta!=null?{ok:c.delta<0,wert:`${c.delta>0?'+':''}${c.delta.toFixed(1)}pp → ${c.txt}`}:null;},
       warum:'fewer than seven CPI releases on file'},
      {txt:'Unemployment rate within 0.2pp of its own 12-release low',
       pruef:(ccy)=>{const a=rgArbeitslos(ccy);return a?{ok:a.wert<=0.2,wert:a.txt}:null;},
       warum:'fewer than 12 unemployment releases on file'},
      {txt:'Risk index in the lower half',
       pruef:()=>{const r=rgRisk();return r&&r.pct!=null?{ok:r.pct<=50,wert:`${r.txt} · ${r.pct}th pct`}:null;},
       warum:'risk_index.json has not loaded'},
    ],
  },
  {
    id:'productivity', name:'Productivity Upswing',
    kurz:'Growth without inflation pressure — a structural, multi-quarter story.',
    lang:'⚠ This is a structural scenario, not a trading one: it works over quarters, not days. That is exactly what makes it interesting — it explains why a currency can carry a premium for years. High productivity means output grows faster than employment, so wages can rise without feeding inflation and the central bank can wait. The official series (nonfarm business productivity, unit labour costs) comes from the BLS and is NOT wired up here; what stands below is a proxy built from two real series, clearly marked as such.',
    bed:[
      {txt:'GDP growth positive while employment growth slows (proxy: output per worker rising)',
       pruef:(ccy)=>{const p=rgProduktivitaet(ccy);return p?{ok:p.bipQ>0&&!p.beschSteigt,wert:`${p.txt} · employment ${p.beschSteigt?'accelerating':'slowing'}`}:null;},
       warum:'this currency lacks a GDP or an employment history long enough for the proxy'},
      {txt:'Headline CPI falling while GDP grows — the signature of the whole scenario',
       pruef:(ccy)=>{const c=rgCpiTrend(ccy),p=rgProduktivitaet(ccy);
         return (c&&c.delta!=null&&p)?{ok:c.delta<0&&p.bipQ>0,wert:`CPI ${c.delta>0?'+':''}${c.delta.toFixed(1)}pp · ${p.txt}`}:null;},
       warum:'no CPI history or no GDP history for this currency'},
      {txt:'Real yield positive AND above zero for the currency (a productivity boom lifts the neutral rate)',
       pruef:(ccy)=>{const r=rgRealzins(ccy);return r?{ok:r.wert>0.5,wert:r.txt}:null;},
       warum:'no 10-year yield or no headline CPI for this currency'},
      {txt:'Nonfarm business productivity (BLS, quarterly)',kern:true,
       pruef:()=>null,
       warum:'the official productivity series is not wired up — only the proxy above is available'},
      {txt:'Unit labour costs — the bridge between wages and inflation',
       pruef:()=>null,
       warum:'no unit-labour-cost source is wired up'},
    ],
  },
];

/** Ein Szenario auswerten: erfuellte, offene und nicht messbare Bedingungen. */
function regimeAuswerten(sz,ccy){
  const zeilen=sz.bed.map(b=>{
    let r=null;
    try{r=b.pruef(ccy);}catch(e){r=null;}
    if(!r||r.ok==null)return{txt:b.txt,zustand:'unbekannt',kern:!!b.kern,warum:b.warum||'no live source for this condition'};
    return{txt:b.txt,zustand:r.ok?'ja':'nein',kern:!!b.kern,wert:r.wert};
  });
  const messbar=zeilen.filter(z=>z.zustand!=='unbekannt');
  const erfuellt=zeilen.filter(z=>z.zustand==='ja');
  // ⚠ KERN-BEDINGUNGEN. Beim ersten Live-Lauf stand "Funding Squeeze" auf
  // 100% und damit an der Spitze des Radars - obwohl GENAU die zwei
  // Bedingungen fehlten, die dieses Szenario von gewoehnlichem Risk-off
  // unterscheiden (Cross-Currency-Basis, SOFR-OIS). Drei erfuellte
  // Nebenbedingungen ergaben eine glatte 100, und die las sich wie eine
  // Bestaetigung. Das ist dieselbe Fehlerklasse wie ein geschaetzter Wert:
  // eine Zahl, die mehr behauptet, als die Datenlage hergibt.
  // Deshalb tragen die entscheidenden Bedingungen `kern:true`. Fehlt eine
  // davon, bleibt der Grad stehen (er ist ja richtig gerechnet), aber das
  // Szenario kann NICHT das fuehrende Regime sein und sagt an der Karte,
  // woran es liegt.
  const kernOffen=zeilen.filter(z=>z.kern&&z.zustand==='unbekannt').length;
  // ⚠ MINDESTENS DREI MESSBARE BEDINGUNGEN, sonst gibt es keinen Prozentwert.
  // Auch das ist beim ersten Live-Lauf aufgefallen: "Productivity Upswing"
  // stand bei JPY auf 100% - weil genau EINE seiner fuenf Bedingungen
  // messbar war und die zufaellig zutraf. Ein Prozentwert aus einer einzigen
  // Bedingung ist kein Prozentwert, sondern eine als Zahl verkleidete
  // Einzelbeobachtung. Dann lieber ein Strich und der Grund daneben.
  const zuWenig=messbar.length<REGIME_MIN_BED;
  return{...sz,zeilen,kernOffen,zuWenig,
    messbar:messbar.length,erfuellt:erfuellt.length,
    offen:zeilen.length-messbar.length,
    // ⚠ Der Nenner ist MESSBAR, nicht die Gesamtzahl. Sonst sieht ein
    // Szenario, dessen halbe Bedingungen keine Quelle haben, automatisch
    // schwach aus - und das waere eine Aussage ueber unsere Datenlage,
    // nicht ueber den Markt.
    grad:(messbar.length&&!zuWenig)?Math.round(erfuellt.length/messbar.length*100):null};
}
/** Alle Szenarien, das am staerksten erfuellte zuerst. */
function regimeStand(ccy){
  const alle=REGIME_SZENARIEN.map(s=>regimeAuswerten(s,ccy||'USD'));
  return alle.slice().sort((a,b)=>{
    if(a.grad==null&&b.grad==null)return 0;
    if(a.grad==null)return 1;
    if(b.grad==null)return -1;
    // ⚠ ZUERST die Frage, ob das Szenario ueberhaupt vollstaendig belegt ist.
    // Ein Szenario mit fehlender Kernbedingung rutscht hinter jedes, das
    // seine hat - unabhaengig vom Grad. Sonst fuehrt eine 100, die auf drei
    // Nebenbedingungen steht, das Radar an.
    const ak=a.kernOffen>0?1:0,bk=b.kernOffen>0?1:0;
    if(ak!==bk)return ak-bk;
    if(b.grad!==a.grad)return b.grad-a.grad;
    return b.messbar-a.messbar;                 // gleicher Grad: der besser belegte zuerst
  });
}

export {RG_CCYS,REGIME_MIN_BED,REGIME_SZENARIEN,regimeStand,regimeAuswerten,
  rgPerzentil,rgKurse,rgRendite,rgVol,rgDrawdown,rgKurve,rgRealzins,rgVix,rgPutCall,
  rgRisk,rgHafen,rgDollarBreite,rgUeberraschung,rgArbeitslos,rgClaims,rgSpreizung,
  rgProduktivitaet,rgCpiTrend,rgInd,rgIndHist,rgIndWert};
