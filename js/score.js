// ══ SCORE ════════════════════════════════════════════════════════════════
// Vierte ausgekoppelte Kategorie (Nutzer-Wunsch 2026-08-25: "generell das
// Projekt in Kategorien machen ich denke das nicht nur Score sehr wichtig
// ist"). Die eigentliche Rechenkette: Bias-Score, Normierung (Ueberraschung/
// Aktualitaet/Marktreaktion), Altersgrenze, Datenqualitaet/Gewichtung,
// eigene Historie/Staerke 1-10, Carry, Sidebar-Synchronisation. Bis
// VERSION-CHECK-450 gesperrt (siehe docs/module-split.md) - die
// Wächter-Skripte (check/rules.js/scoreSurface.js/scoreDiff.js/score.js)
// waren fest auf `index.html` verdrahtet und haetten sonst LAUTLOS
// aufgehoert, Score-Aenderungen zu erkennen. Erst nach deren Reparatur +
// bestandenem Regressionstest freigegeben.
// Bidirektional mit js/main.js verbunden (Muster: docs/module-split.md).
import {BC,FX} from './constants.js';
import {IND_DATA_FEED,priceSeriesFor} from './data-feeds.js';
import {IND_AUTO_RUBS,IND_EVENT_MATCHERS,calEvts,cloudAutoSync,escH,evtMatchesSym,getSym,macroCcyFor,markLsUpdatedSeen,markPrefEdit,openM,parseNumLike,parsePolicyRate,periodLabel,rateInfo,recomputeAuto,rerender,save,scoreHist,selId,setSuppressBiasFlipAlerts,stripPeriodSuffix,syms,todayStr} from './main.js';

function bCol(b){return(b==='bull'||b==='sbull')?'var(--green)':(b==='bear'||b==='sbear')?'var(--red)':'var(--amber)';}
function bRC(b){return(b==='bull'||b==='sbull')?'#0B5FCC20':(b==='bear'||b==='sbear')?'#C50F1A20':'#55617A20';}
function bClass(b){return b==='sbull'?'bb2':b==='bull'?'bb':b==='sbear'?'br2':b==='bear'?'br':'bn';}
function glowClass(b){return b==='sbull'?'glow-sbull':b==='bull'?'glow-bull':b==='sbear'?'glow-sbear':b==='bear'?'glow-bear':'glow-neu';}
// ── SCORE: Summe der Indikator-Bias (Bullish +1, Neutral 0, Bearish -1) ──
// Symbol-Score = ueber alle Rubriken; Karten-Score = nur die Indikatoren
// der jeweiligen Karte. Farbe: positiv blau, neutral orange, negativ rot.
// sbull/sbear zaehlen doppelt (+/-2) - kombiniert mit dem halben Gewicht von
// "Risk Correlation" (siehe indIsHalfWeight) ergibt das genau die gewuenschten
// +/-1 (strongly) bzw. +/-0.5 (normal) Score-Wirkung.
function biasScore(b){return b==='sbull'?2:b==='bull'?1:b==='sbear'?-2:b==='bear'?-1:0;}
// 2Y Bond Yield und 10Y Bond Yield zählen je nur 0,5 Punkte (zusammen max. ±1).
const BOND_HALF_PT=new Set(['2Y Bond Yield','10Y Bond Yield']);
// Indikator-Gruppen, die DENSELBEN Sachverhalt messen: stehen mehrere
// Mitglieder einer Gruppe zusammen in einer Rubrik, zählt jedes nur 0,5
// (die Gruppe teilt sich das Gewicht). Basisnamen (ohne y/y-/m/m-Suffix).
// Nutzer-Entscheid 2026-07-06: NUR die klassischen Headline/Core-Paare -
// "CPI m/m" existiert nicht als eigener Indikator (nur als Zweit-Link im
// CPI-Indikator), und NFP + ADP bleiben bewusst getrennte Indikatoren mit
// je voller +/-1-Score-Wirkung.
// ZEW und Ifo messen beide deutsche Wirtschaftsstimmung - zwei volle Punkte
// fuers selbe Thema waeren eine Doppelzaehlung, genau wie bei CPI+Core CPI.
const CORE_PAIRS=[['CPI (Headline)','Core CPI'],['PPI','Core PPI'],['PCE','Core PCE'],['ZEW Economic Sentiment','Ifo Business Climate']];
function indIsCorePaired(ind,rub){
  const base=stripPeriodSuffix(ind.name).base;
  const inds=(rub&&rub.indicators)||[];
  for(const group of CORE_PAIRS){
    if(!group.includes(base))continue;
    const hasPartner=inds.some(i=>{
      if(i===ind)return false;
      const b=stripPeriodSuffix(i.name).base;
      return b!==base&&group.includes(b);
    });
    if(hasPartner)return true;
  }
  return false;
}
// Liefert die anwesenden Gruppen-Partner eines Indikators in seiner Rubrik
// (Anzeigenamen) - fuers Score-Aufschluesselungs-Modal.
function indGroupPartners(ind,rub){
  const base=stripPeriodSuffix(ind.name).base;
  const inds=(rub&&rub.indicators)||[];
  for(const group of CORE_PAIRS){
    if(!group.includes(base))continue;
    const partners=inds.filter(i=>{
      if(i===ind)return false;
      const b=stripPeriodSuffix(i.name).base;
      return b!==base&&group.includes(b);
    }).map(i=>i.displayName||i.name);
    if(partners.length)return partners;
  }
  return null;
}
// Ist dieser Indikator grundsaetzlich ein Halbgewicht-Typ (Bond-Halbpunkt,
// COT-Netto, CB Tone, oder Teil eines Core-Paares)? Gemeinsame Pruefung fuer
// indBaseWeight UND indTrendAdjMag, damit die Bonus-Halbierung ueberall
// konsistent denselben Kreis von Indikatoren trifft.
function indIsHalfWeight(ind,rub){
  if(BOND_HALF_PT.has(ind.name))return true;
  if(COT_NET_HALF.has(stripPeriodSuffix(ind.name).base))return true;
  if(CB_TONE_HALF.has(ind.name))return true;
  if(cotWowIsSmall(ind))return true;
  if(typeof SENT_HALF!=='undefined'&&SENT_HALF.has(stripPeriodSuffix(ind.name).base))return true;
  // Risk Correlation: halbes Gewicht, damit sbull/sbear (biasScore +/-2) auf
  // genau +/-1 kommen und bull/bear (biasScore +/-1) auf +/-0.5 - siehe
  // biasScore()-Kommentar.
  if(ind.name==='Risk Correlation')return true;
  return indIsCorePaired(ind,rub);
}
// COT WoW-Aenderung: die volle +/-1-Score-Wirkung gibt es nur bei einer
// DEUTLICHEN Verschiebung der Netto-Positionierung (|Delta| >= 3 Prozent-
// punkte); kleinere Bewegungen zaehlen nur 0,5 (Nutzer-Entscheid
// 2026-07-07). Der Betrag kommt aus dem automatisch gesetzten
// research.actual ("+2.5%", cotPct-Format aus applyCotDataFeed); ohne
// parsebaren Wert (rein manuelle Karte) bleibt es beim vollen Gewicht.
const COT_WOW_BASE='WoW Change in Net Position (%)';
const COT_WOW_FULL_AT=3;
function cotWowIsSmall(ind){
  if(stripPeriodSuffix(ind.name).base!==COT_WOW_BASE)return false;
  const r=ind.research||{};
  const v=parseFloat(String(r.actual==null?'':r.actual).replace(',','.'));
  return isFinite(v)&&Math.abs(v)<COT_WOW_FULL_AT;
}
// Grundgewicht eines Indikators - Halbgewicht-Typen (s.o.) zaehlen immer 0,5;
// fehlt der Forecast, ist auch das schwaechere 1-Schritt-Basissignal
// (ind.stepDriven) immer 0,5 - unabhaengig von Core-Paarung, da es ohne
// Forecast kein staerkeres Vergleichssignal gibt, das ist schon die Basis.
function indBaseWeight(ind,rub){
  if(ind.stepDriven)return 0.5;
  return indIsHalfWeight(ind,rub)?0.5:1;
}
// "Wichtig" (★) erhöht den Betrag additiv um 0,5 (statt Multiplikation ×1,5):
// normaler Indikator 1 -> 1,5; halber Indikator 0,5 -> 1,0.
// Net Bullish/Bearish Positioning zaehlen mit halbem Gewicht in den Score:
// ihr Bias wird automatisch aus dem COT-Long%/Short% gesetzt und ist nur
// dann nicht-neutral, wenn eine Seite klar dominiert (>=60%, siehe
// applyCotDataFeed) - es kann also immer nur EINE der beiden Seiten
// gleichzeitig zaehlen (max. +/-0,5 aus der Netto-Positionierung).
const COT_NET_HALF=new Set(['Net Bullish Positioning','Net Bearish Positioning']);
// ── Markt-Sentiment: Datenkonstanten (frueh deklariert, weil die Rubrik-
// Migration migrateRubInds und indIsHalfWeight sie beim Boot bereits nutzen -
// die eigentlichen Feed-/Render-Funktionen stehen weiter unten bei renderCot).
const SENT_SOURCE={
  cryptoFng:'https://alternative.me/crypto/fear-and-greed-index/',
  stockFng:'https://www.cnn.com/markets/fear-and-greed',
  putCall:'https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/daily-volume-statistics',
  vix:'https://www.tradingview.com/symbols/CBOE-VIX/',
  aaii:'https://www.aaii.com/sentimentsurvey'
};
// Welches Symbol bekommt welche Sentiment-Indikatoren (Basisname -> Feed-Key).
// Nur Krypto (Fear&Greed) und Aktienindizes (Put/Call + Fear&Greed) - fuer
// FX gibt es keine vergleichbar zugaengliche Sentiment-Quelle.
// Nur die per Live-Lauf bestaetigt erreichbaren Quellen speisen den Score:
// Crypto Fear&Greed (alternative.me) fuer Krypto und VIX (TradingView) fuer
// die Aktienindizes. Stock Fear&Greed (CNN, HTTP-418-Bot-Block) und CBOE
// Put/Call (vom TradingView-Scanner nicht geliefert) bleiben Chart-only im
// Sentiment-Tab, sobald/falls sie doch mal Daten liefern - sie zaehlen dann
// bewusst NICHT zusaetzlich in den Score (kein Doppelzaehlen mit VIX, das
// ohnehin die groesste Komponente des Stock-F&G ist).
const SENT_MAP={
  BTC:[['Crypto Fear & Greed','cryptoFng']],
  ETH:[['Crypto Fear & Greed','cryptoFng']],
  // AAII misst die Erwartung US-amerikanischer PRIVATanleger fuer den
  // AKTIENMARKT auf Sicht von sechs Monaten - deshalb speist es nur die
  // Aktienindizes, genau wie VIX. Bewusst NICHT auf FX/Gold/Krypto
  // uebertragen: die Umfrage fragt ausschliesslich nach dem Aktienmarkt,
  // ein Risikoappetit-Signal daraus abzuleiten waere eine Interpretation,
  // keine Messung (Projekt-Grundsatz "nie schaetzen"). Doppelzaehlung mit
  // VIX ist vertretbar, weil beide voellig verschiedene Dinge messen:
  // VIX ist der GEZAHLTE Optionspreis am Terminmarkt, AAII die BEFRAGTE
  // Erwartung von Privatanlegern - halbes Gewicht haben ohnehin beide.
  SP500:[['VIX (Volatility)','vix'],['AAII Bull-Bear Spread','aaii']],
  NAS:[['VIX (Volatility)','vix'],['AAII Bull-Bear Spread','aaii']],
};
// Alle Sentiment-Indikator-Basisnamen (fuers Seeding + Halbgewicht).
const SENT_IND_NAMES=[...new Set(Object.values(SENT_MAP).flat().map(p=>p[0]))];
const SENT_HALF=new Set(SENT_IND_NAMES);
// Hoechstalter der AAII-Lesung in Tagen. Die Umfrage erscheint jede
// Woche; 21 Tage heisst drei verpasste Veroeffentlichungen.
const AAII_STALE_DAYS=21;
// "CB Tone" zaehlt mit halbem Gewicht (wie ein Bond-Halbpunkt) - "Next CB
// Move" bleibt normal gewichtet (1). Beide sind echte Indikatoren der
// Interest-Rates-Rubrik statt eines separaten Bolt-ons auf symScore:
// Ton bull=hawkish/bear=dovish (Standard-Bias-Buttons, manuell).
const CB_TONE_HALF=new Set(['CB Tone']);
// Anzeige-Indikatoren OHNE Score-Beitrag: der 2Y/10Y-Spread zaehlt 0, weil
// (a) eine 10Y-Bewegung sonst doppelt zaehlt (im 10Y-Indikator UND im Spread)
// und (b) eine Versteilerung kein sauberes bullish/bearish-Signal ist
// (Wachstumsoptimismus vs. Fiskalrisiko-Praemie). Bias bleibt einstellbar
// und wird weiter angezeigt/auto-gesetzt - er fliesst nur nicht in die Summe
// ein (auch nicht mit ★-Stern).
const SCORE_ZERO=new Set(['2Y/10Y Spread']);
// Rubriken OHNE Trend-Anteil (Nutzer-Entscheid 2026-07-05): in der Interest-
// Rates-Rubrik zaehlt KEIN Trend-Bonus in den Score und es erscheint kein
// Trend-Chip - weder fuer die Bond-Renditen (25-Tage-Vergleich) noch fuer
// den Leitzins. Das Bias selbst (z.B. Bond 15-Tage-Vergleich, Beat/Miss der
// Zinsentscheidung) bleibt unveraendert bestehen.
const NO_TREND_RUBS=new Set(['Interest Rates']);
// Zerlegt den Score-Beitrag EINES Indikators in seine Bestandteile - die
// einzige Quelle der Score-Arithmetik (indScore summiert nur noch total),
// damit die Aufschluesselung im Score-Modal nie von der echten Rechnung
// abweichen kann. Rueckgabe: {w, base, trend, total, zero, noTrend}.
// (Der fruehere ★-Wichtig-Bonus/+0.5 auf das Gewicht wurde 2026-07-28 auf
// Nutzer-Wunsch komplett entfernt - siehe tech-design-Skill-Session.)
// Score-Modus (Nutzer-Wunsch 2026-08-07): 'classic' = die bisherige,
// vollstaendig im Kopf nachrechenbare Punktlogik (Standard). 'normalized' =
// zusaetzliche Gewichtung nach Ueberraschungsgroesse, Aktualitaet und
// gemessener Marktreaktion (siehe indNormFactor). Bewusst eine PRAEFERENZ
// ausserhalb von snap()/Undo - der Modus ist eine Sicht auf dieselben Daten,
// kein Inhalt. Anbindung an den Cross-Device-Sync deshalb nach dem
// pinEnabled-Muster an allen vier Stellen (cloudPush/cloudPull/export/import)
// plus markPrefEdit() in der Save-Funktion.
let scoreMode=localStorage.getItem('fxpro_score_mode')==='normalized'?'normalized':'classic';
function saveScoreMode(){
  try{localStorage.setItem('fxpro_score_mode',scoreMode);}catch(e){}
  try{localStorage.setItem('fxpro_updated',new Date().toISOString());markLsUpdatedSeen();}catch(e){}
  markPrefEdit();cloudAutoSync();
}
function setScoreMode(m){
  const n=(m==='normalized')?'normalized':'classic';
  if(n===scoreMode)return;
  scoreMode=n;
  invalidateNormCache();invalidateCmpCache();
  saveScoreMode();
  // Nutzer-Bugreport 2026-08-22: ein Telegram-Bias-Flip-Alert kam ohne jede
  // erklaerende "Driven by"-Zeile an - Ursache war teils, dass der Flip gar
  // nicht von neuen Marktdaten kam, sondern vom classic/normalized-Wechsel
  // hier selbst (der Faktor aendert symScore genug, um die +/-3-Schwelle zu
  // kreuzen). recomputeAllSymBiases() unterschied das bisher nicht von einem
  // echten Flip - _suppressBiasFlipAlerts haelt lastNotifBias synchron, ohne
  // einen Alert einzureihen, waehrend genau dieser Recompute laeuft.
  setSuppressBiasFlipAlerts(true);
  try{recomputeAuto();}finally{setSuppressBiasFlipAlerts(false);}
  save();rerender();updScoreModeBtn();
}
function toggleScoreMode(){setScoreMode(scoreMode==='normalized'?'classic':'normalized');}
function updScoreModeBtn(){
  const b=document.getElementById('scoreModeBtn');
  if(b)b.checked=scoreMode==='normalized';
}

// ══ SCORE-V2: NORMIERUNGS-EBENE (Nutzer-Wunsch 2026-08-07) ═══════════════
// Bewusst eine ZUSAETZLICHE, abschaltbare Ebene ueber dem klassischen Score,
// kein Ersatz: `scoreMode==='classic'` (Standard) rechnet exakt wie bisher,
// jede Zahl bleibt im Kopf nachrechenbar. Erst `scoreMode==='normalized'`
// multipliziert den Basis-Anteil jedes Indikators mit einem Faktor aus drei
// Bausteinen, die Profi-Haeuser (Citi ESI) genauso verwenden:
//
//   1. UEBERRASCHUNGS-GROESSE  Ein CPI-Beat von 0,01 zaehlt heute wie einer
//      von 0,8. Citi teilt die Ueberraschung durch die STREUUNG der
//      historischen Prognosefehler DIESES Indikators - erst dadurch werden
//      NFP (Streuung ~37.000) und CPI (Streuung ~0,04) vergleichbar. Ab 5
//      historischen Beobachtungen (exakt Citis eigene Schwelle), sonst 1.
//   2. ZEIT-DECAY, ZYKLUS-RELATIV  Ein Wert altert - aber ein Quartalswert
//      langsamer als ein Wochenwert. Halbwertszeit ist deshalb NICHT fix,
//      sondern skaliert mit dem eigenen Release-Zyklus. Ein 60 Tage altes BIP
//      ist mitten im Zyklus (Gewicht ~0,73), ein 60 Tage alter Claims-Wert
//      ist 8 Zyklen alt und praktisch wertlos.
//   3. MARKTRELEVANZ  NFP bewegt den Markt um ein Vielfaches staerker als
//      Bauinvestitionen. GEMESSEN, nicht geschaetzt: durchschnittlicher
//      absoluter Tagesausschlag der Waehrung an den Release-Tagen dieses
//      Indikators, geteilt durch den Ausschlag an gewoehnlichen Tagen.
//
// ⚠️ Der Faktor ist bewusst um 1,0 ZENTRIERT und geklemmt (0,4..1,8), nicht
// frei skalierend. Die gesamte Downstream-Logik (Karten-Schwelle ±2,
// Symbol-Schwelle ±3, Farbstufen) ist auf ±1-Einheiten kalibriert - ein frei
// laufender Faktor haette diese Schwellen still bedeutungslos gemacht. So
// bleibt die Groessenordnung erhalten und nur die GEWICHTUNG untereinander
// verschiebt sich, was genau der gewuenschte Effekt ist.
const SCORE_NORM_MIN=0.4,SCORE_NORM_MAX=1.8;
const NORM_MIN_OBS=5;          // wie Citi: erst ab 5 Beobachtungen normieren
const DECAY_HALFLIFE_CYCLES=1.5; // Halbwertszeit = 1,5 eigene Release-Zyklen

// Release-Zyklus eines Indikators in Tagen. Bevorzugt aus dem tatsaechlichen
// Abstand seiner Releases gemessen (Median, robust gegen Ausreisser), sonst
// aus dem Intervall-Text, sonst 30 Tage als neutrale Annahme.
// Memoisiert (Perf 2026-08-08): die Funktion sortiert bis zu drei Jahre
// Chart-Historie. Seit der Altersgrenze wird sie ueber symTrackedCount fuer
// JEDEN Indikator bei JEDEM symScoreCmp aufgerufen - renderDash stieg dadurch
// von 27 auf 56ms. Das Ergebnis haengt ausschliesslich an chartHist, der
// Cache-Schluessel ist deshalb dessen Laenge (gleiches Muster wie _sigCache).
// Nicht-enumerierbar, damit die Felder nicht in snap()/Cloud-Sync landen.
function indCycleDays(ind){
  const h=Array.isArray(ind.chartHist)?ind.chartHist:[];
  if(ind._cycCache!==undefined&&ind._cycCacheLen===h.length)return ind._cycCache;
  const out=indCycleDaysCalc(ind,h);
  try{Object.defineProperty(ind,'_cycCache',{value:out,writable:true,enumerable:false,configurable:true});
      Object.defineProperty(ind,'_cycCacheLen',{value:h.length,writable:true,enumerable:false,configurable:true});}catch(e){}
  return out;
}
function indCycleTextDays(ind){
  const t=String(ind.interval||'').toLowerCase();
  if(/week/.test(t))return 7;
  if(/quarter/.test(t))return 90;
  if(/year|annual/.test(t))return 365;
  if(/month/.test(t))return 30;
  return null;
}
function indCycleDaysCalc(ind,h){
  const ds=h.map(e=>e&&e[0]).filter(Boolean).sort();
  const txt=indCycleTextDays(ind);
  if(ds.length>=4){
    const gaps=[];
    for(let i=1;i<ds.length;i++){
      const g=(new Date(ds[i])-new Date(ds[i-1]))/86400000;
      if(isFinite(g)&&g>0&&g<400)gaps.push(g);
    }
    if(gaps.length>=3){
      gaps.sort((a,b)=>a-b);
      const med=gaps[Math.floor(gaps.length/2)];
      // ⚠ Bugfix 2026-08-09: Reihen mit ZWEI Terminen je Periode (Vorab-
      // schaetzung und Endstand) haben abwechselnd kurze und lange
      // Abstaende - der Median landet dann auf dem KURZEN. Gemessen an EUR
      // Employment Change: Abstaende 21/70/21/68/23 Tage, Median 23, obwohl
      // die Reihe quartalsweise erscheint. Die Altersgrenze hat den
      // Indikator dadurch nach gut zwei Monaten faelschlich auf 0 gesetzt,
      // obwohl die Quelle schlicht noch nichts Neues hatte. Dasselbe bei
      // JPY GDP (gemessen 25 statt 90).
      //
      // Der angegebene Turnus dient deshalb als UNTERGRENZE - nur nach
      // unten korrigierend, die Grenze kann also nie strenger werden als
      // vorher. 0,6 laesst echte Abweichungen vom Turnus (Feiertags-
      // verschiebungen, unregelmaessige Termine) weiterhin durch.
      return txt?Math.max(med,txt*0.6):med;
    }
  }
  return txt||30;
}
// Streuung der historischen Prognosefehler (actual - forecast). null, wenn zu
// wenige Beobachtungen - dann wird NICHT normiert statt auf duenner Basis zu
// raten.
function indSurpriseSigma(ind){
  if(ind._sigCache!==undefined&&ind._sigCacheLen===(ind.chartHist||[]).length)return ind._sigCache;
  const h=Array.isArray(ind.chartHist)?ind.chartHist:[];
  const s=[];
  h.forEach(e=>{
    if(!Array.isArray(e)||e.length<3)return;
    const a=parseNumLike(e[1]),f=parseNumLike(e[2]);
    if(a==null||f==null)return;
    s.push(a-f);
  });
  let out=null;
  if(s.length>=NORM_MIN_OBS){
    const m=s.reduce((x,y)=>x+y,0)/s.length;
    const v=s.reduce((x,y)=>x+(y-m)*(y-m),0)/s.length;
    const sd=Math.sqrt(v);
    if(isFinite(sd)&&sd>0)out=sd;
  }
  try{Object.defineProperty(ind,'_sigCache',{value:out,writable:true,enumerable:false,configurable:true});
      Object.defineProperty(ind,'_sigCacheLen',{value:h.length,writable:true,enumerable:false,configurable:true});}catch(e){}
  return out;
}
// Wie gross war die AKTUELLE Ueberraschung, gemessen in eigenen
// Standardabweichungen? 1,0 = eine durchschnittlich grosse Ueberraschung.
function indSurpriseMag(ind){
  const r=ind.research||{};
  const a=parseNumLike(r.actual),f=parseNumLike(r.forecast);
  if(a==null||f==null)return 1;
  const sd=indSurpriseSigma(ind);
  if(sd==null)return 1;
  const z=Math.abs(a-f)/sd;
  // z=1 (durchschnittliche Ueberraschung) -> Faktor 1. Wurzel daempft
  // Extremwerte, damit ein 5-Sigma-Ausreisser nicht den halben Score traegt.
  return Math.sqrt(Math.max(0.05,z));
}
// Zyklus-relativer Zeit-Decay: 0,5^(Alter / (1,5 * eigener Zyklus)).
function indDecayWeight(ind){
  const r=ind.research||{};
  const d=r.date||ind.date;
  if(!d)return 1;
  const age=(Date.now()-new Date(d+'T00:00:00Z').getTime())/86400000;
  if(!isFinite(age)||age<=0)return 1;
  const half=DECAY_HALFLIFE_CYCLES*indCycleDays(ind);
  if(!(half>0))return 1;
  return Math.pow(0.5,age/half);
}
// Marktrelevanz: mittlerer absoluter Tagesausschlag der zugehoerigen Waehrung
// an den Release-Tagen dieses Indikators, relativ zum Ausschlag an allen
// Tagen. >1 = der Markt reagiert auf diesen Indikator ueberdurchschnittlich.
// Braucht ausreichend Preishistorie - sonst neutral 1 statt geraten.
function indMarketWeight(ind,symId){
  const key=symId+'|'+ind.name;
  if(_mktWeightCache[key]!==undefined)return _mktWeightCache[key];
  let out=1;
  const ser=priceSeriesFor(macroCcyFor(symId))||priceSeriesFor(symId);
  const h=Array.isArray(ind.chartHist)?ind.chartHist:[];
  if(ser&&ser.length>=60&&h.length>=NORM_MIN_OBS){
    const px={};ser.forEach(e=>{if(e&&e[0]!=null&&e[1]!=null)px[e[0]]=Number(e[1]);});
    const dates=Object.keys(px).sort();
    const moves={};
    for(let i=1;i<dates.length;i++){
      const p0=px[dates[i-1]],p1=px[dates[i]];
      if(p0>0&&isFinite(p1))moves[dates[i]]=Math.abs(p1/p0-1);
    }
    const all=Object.values(moves);
    if(all.length>=40){
      const baseline=all.reduce((a,b)=>a+b,0)/all.length;
      const hits=[];
      h.forEach(e=>{const d=e&&e[0];if(d&&moves[d]!=null)hits.push(moves[d]);});
      if(hits.length>=NORM_MIN_OBS&&baseline>0){
        const avg=hits.reduce((a,b)=>a+b,0)/hits.length;
        // Wurzel daempft auch hier - ein Indikator soll hoechstens etwa
        // doppelt so schwer wiegen, nicht zehnfach.
        out=Math.sqrt(Math.max(0.1,avg/baseline));
      }
    }
  }
  _mktWeightCache[key]=out;
  return out;
}
let _mktWeightCache={};
function invalidateNormCache(){_mktWeightCache={};}
// Gesamtfaktor, um 1,0 zentriert und geklemmt (siehe Kommentar oben).
function indNormFactor(ind,symId){
  if(scoreMode!=='normalized')return 1;
  const f=indSurpriseMag(ind)*indDecayWeight(ind)*indMarketWeight(ind,symId);
  if(!isFinite(f))return 1;
  return Math.min(SCORE_NORM_MAX,Math.max(SCORE_NORM_MIN,f));
}
// Aufschluesselung fuer das Score-Modal - damit die Ebene NICHT als Blackbox
// wirkt, sondern jeder Teilfaktor einzeln nachvollziehbar bleibt.
function indNormBreakdown(ind,symId){
  const mag=indSurpriseMag(ind),dec=indDecayWeight(ind),mkt=indMarketWeight(ind,symId);
  const sd=indSurpriseSigma(ind);
  const r=ind.research||{};
  const a=parseNumLike(r.actual),f=parseNumLike(r.forecast);
  const z=(a!=null&&f!=null&&sd)?Math.abs(a-f)/sd:null;
  return{mag,dec,mkt,sigma:sd,z,cycle:indCycleDays(ind),
         total:Math.min(SCORE_NORM_MAX,Math.max(SCORE_NORM_MIN,mag*dec*mkt))};
}

// ══ ALTERSGRENZE ("stale guard") ═════════════════════════════════════════
// Nutzer-Auftrag 2026-08-08 nach dem Audit. Gemessener Anlass: 25 der 102
// score-treibenden Werte waren aelter als 60 Tage, darunter AUD Retail Sales
// mit einem Release vom 31.07.2025 - 372 Tage alt, 14,9 eigene Zyklen
// ueberfaellig, und trotzdem mit vollem +1 im Score. Nachgesehen: die Reihe
// ist in ind_data.json komplett zu Ende, das australische Statistikamt hat
// sie 2025 durch einen anderen Indikator ersetzt. Ein toter Indikator scorte
// also unbefristet weiter.
//
// Sowohl Citi als auch Bloomberg loesen das mit einem HARTEN Schnitt statt
// mit Ausfaden: das CESI haelt ein rollierendes Fenster von rund drei
// Monaten, aeltere Beobachtungen sind draussen - nicht auf kleinem Gewicht,
// sondern weg. Bloomberg markiert eingestellte Reihen und nimmt sie aus den
// Berechnungen. Beides folgt derselben Ueberlegung: ein Wert ist entweder
// aktuell genug oder er ist es nicht, ein Zwischenzustand hilft niemandem.
//
// Umgesetzt relativ zum EIGENEN Zyklus des Indikators statt in festen Tagen -
// ein Quartalswert darf laenger gelten als ein Wochenwert, sonst waeren
// quartalsweise berichtende Volkswirtschaften strukturell benachteiligt
// (dieselbe Ueberlegung wie beim zyklus-relativen Decay im normalisierten
// Modus).
const IND_STALE_CYCLES=2;
// null = nicht bewertbar (kein Datum, kein echter Release-Indikator).
// Zahl = wie viele eigene Zyklen der Wert ueberfaellig ist.
function indOverdueCycles(ind){
  const r=ind&&ind.research;
  if(!r||!r.date)return null;
  // Rein manuelle/qualitative Indikatoren (CB Tone, Geopolitics, Risk
  // Correlation) haben bewusst kein Release-Konzept - sie altern nicht.
  if(r.bond||r.cot||r.sent)return null;
  const cyc=indCycleDays(ind);
  if(!isFinite(cyc)||cyc<=0)return null;
  const age=(new Date(todayStr())-new Date(String(r.date).slice(0,10)))/86400000;
  if(!isFinite(age)||age<0)return null;
  return age/cyc;
}
function indIsStale(ind){
  // Anzeigefehler 2026-08-09: der 2Y/10Y-Spread tauchte als "veraltet" auf.
  // Er ist aber SCORE_ZERO - er zaehlt per Definition immer 0, nicht wegen
  // seines Alters. Die Marke OUT OF DATE behauptet dort also einen Grund,
  // den es nicht gibt, und die Dashboard-Meldung zaehlt ihn mit, obwohl
  // sich am Score nichts aendert. Rechnerisch war nie etwas falsch
  // (indScoreParts prueft SCORE_ZERO ohnehin VOR der Altersgrenze) - es
  // ging allein um die Aussage.
  if(SCORE_ZERO.has(stripPeriodSuffix(ind.name).base))return false;
  const c=indOverdueCycles(ind);
  return c!=null&&c>IND_STALE_CYCLES;
}
// Alle veralteten Indikatoren fuer die Dashboard-Meldung (Projekt-Grundsatz:
// wenn ein echter Wert fehlt, wird er nicht geschaetzt, sondern gemeldet).
function staleIndicators(){
  const out=[];
  (syms||[]).forEach(s=>{
    if(!FX.includes(s.id))return;   // Non-FX spiegelt ohnehin nur
    (s.rubrics||[]).forEach(r=>(r.indicators||[]).forEach(i=>{
      if(!indIsStale(i))return;      // deckt auch den SCORE_ZERO-Ausschluss ab
      const c=indOverdueCycles(i);
      if(c==null)return;
      out.push({sym:s.id,name:i.displayName||i.name,date:i.research.date,
        cycles:Math.round(c*10)/10,cycle:Math.round(indCycleDays(i))});
    }));
  });
  out.sort((a,b)=>b.cycles-a.cycles);
  return out;
}
// ⚠ Nutzer 2026-08-08: "dann muss es auch bei dem automatischen Update bei
// neuen Releases einen Bug geben wenn die Quelle da nicht gefunden wird".
//
// Genau so ist es, und zwar als LUECKE, nicht als Fehlrechnung: der
// Kalender-Pfad (findIndEventHistory) verwirft jedes Event ohne Actual, der
// Feed-Pfad kennt den betroffenen Indikator teils gar nicht. Ein Release,
// das stattgefunden hat, dessen Zahl aber von keiner Quelle kam, ist damit
// fuer die App schlicht unsichtbar: die Karte zeigt unveraendert den ALTEN
// Wert mit dem ALTEN Datum, als waere er aktuell. Erst nach zwei eigenen
// Zyklen greift die Altersgrenze - bei einem monatlichen Indikator also
// erst nach rund zwei Monaten. Dazwischen gibt es kein einziges Signal.
//
// Gemessen am 2026-08-08: 82 bereits vergangene Kalender-Zeilen standen
// ohne Actual da, darunter die PMIs, fuer die TradingView grundsaetzlich
// keine Werte liefert.
//
// Diese Funktion schliesst die Luecke nach dem Projekt-Grundsatz "nie
// schaetzen, stattdessen melden": sie sucht je Indikator ein Kalender-Event,
// das (a) faellig war, (b) NEUER ist als der zuletzt erhaltene Wert und
// (c) immer noch keinen Actual hat. Sie erfindet dabei nichts - sie sagt
// nur, dass etwas fehlt.
const AWAIT_GRACE_H=6;      // Karenz nach dem Termin, bevor gemeldet wird
const AWAIT_MAX_DAYS=45;    // aelter faellt ohnehin in die Altersgrenze
function indAwaitingEvent(symId,ind){
  if(!ind||SCORE_ZERO.has(stripPeriodSuffix(ind.name).base))return null;
  const{base,period}=stripPeriodSuffix(ind.name);
  const matcher=IND_EVENT_MATCHERS[base];
  if(!matcher)return null;                       // rein manueller Indikator
  const ccy=macroCcyFor(symId);
  if(!ccy)return null;
  const have=(ind.research&&ind.research.date)||'';
  const now=Date.now();
  let best=null;
  (calEvts||[]).forEach(ev=>{
    if(ev.actual)return;                         // Wert ist da - kein Fall
    if(!evtMatchesSym(ev,ccy)||!matcher(ev.name,ccy))return;
    if(period){const evp=periodLabel(ev.name);if(evp&&evp!==period)return;}
    const t=new Date(ev.date+'T'+(ev.time&&/^\d/.test(ev.time)?ev.time:'12:00')).getTime();
    if(isNaN(t))return;
    if(now-t<AWAIT_GRACE_H*3600e3)return;        // noch nicht faellig/zu frisch
    if(now-t>AWAIT_MAX_DAYS*864e5)return;
    if(have&&ev.date<=have)return;               // wir haben schon Neueres
    if(!best||ev.date>best.date)best=ev;
  });
  return best;
}
// Alle Indikatoren, deren Release fällig war, aber ohne Wert blieb.
// BEWUSST NICHT memoisiert. Ein Versuch damit brachte gemessen nichts
// (renderDash 21,1ms mit Cache gegen 20,8ms ohne - die Funktion laeuft je
// Durchlauf ohnehin nur einmal), zeigte im Test aber sofort denselben
// Veraltungs-Fehler, der heute erst beim Fairness-Faktor gefixt wurde:
// nach einer Aenderung an calEvts lieferte sie den alten Stand. Kein
// Gewinn gegen ein echtes Risiko - deshalb rausgelassen.
function awaitingIndicators(){
  const out=[];
  (syms||[]).forEach(s=>{
    if(!FX.includes(s.id))return;               // Non-FX spiegelt nur
    (s.rubrics||[]).forEach(r=>{
      if(!IND_AUTO_RUBS.includes(r.name))return;
      (r.indicators||[]).forEach(i=>{
        const ev=indAwaitingEvent(s.id,i);
        if(!ev)return;
        out.push({sym:s.id,name:i.displayName||i.name,event:ev.name,date:ev.date,
          days:Math.max(0,Math.round((Date.now()-new Date(ev.date+'T12:00').getTime())/864e5)),
          had:(i.research&&i.research.date)||null});
      });
    });
  });
  out.sort((a,b)=>b.days-a.days);
  return out;
}
function indScoreParts(ind,rub,symId){
  if(SCORE_ZERO.has(stripPeriodSuffix(ind.name).base))return{w:0,base:0,trend:0,rev:0,total:0,zero:true,noTrend:false,norm:1};
  // Veralteter Wert: traegt 0, bleibt aber vollstaendig sichtbar (eigener
  // Hinweis an der Zeile + Dashboard-Meldung). Bewusst VOR jeder weiteren
  // Rechnung, damit auch Gewicht/Normierung gar nicht erst greifen.
  if(indIsStale(ind))return{w:0,base:0,trend:0,rev:0,total:0,zero:false,stale:true,noTrend:false,norm:1};
  const w=indBaseWeight(ind,rub);
  // norm ist im Standardmodus IMMER exakt 1 - der klassische Score bleibt
  // damit bitgenau unveraendert. Nur bei scoreMode==='normalized' greift die
  // zusaetzliche Gewichtung (siehe indNormFactor weiter oben).
  // Reihenfolge bewusst: ausdruecklich uebergebene ID, dann die
  // Zugehoerigkeit der Karte, und erst zuletzt das gewaehlte Asset. Der
  // letzte Fall greift nur noch fuer Karten, die (noch) keinen Stempel
  // haben - z.B. eine gerade neu angelegte, bevor recomputeAuto lief.
  const norm=indNormFactor(ind,symId||(rub&&rub._symId)||(typeof selId!=='undefined'?selId:null));
  const base=biasScore(ind.bias)*w*norm;
  // Revisions-Anteil (Nutzer-Wunsch 2026-07-21): wurde das Previous dieses
  // Release gegenueber dem urspruenglich gemeldeten Vor-Actual revidiert
  // (ind.revBias, gesetzt in applyIndDataFeed aus dem Workflow-Feld
  // revisedFrom), zaehlt die Revisions-RICHTUNG mit dem HALBEN Basisgewicht
  // additiv dazu: volles Gewicht ±0,5, Core-Paar/Halbgewicht ±0,25.
  // Begruendung halbes Gewicht: eine Revision ist echte, aber schwaechere
  // Information als der Headline-Beat/Miss (rueckwaertsgerichtet, teils
  // eingepreist) - konsistent zur bestehenden Halbgewicht-Systematik
  // (Step-Signal ohne Forecast 0,5, kleine COT-WoW-Bewegung 0,5). Gilt nur
  // fuer den aktuellen Release-Zyklus (verschwindet mit dem naechsten
  // Release automatisch, da der Feed revisedFrom dann nicht mehr traegt).
  // ⚠ Seit 2026-08-08 (Nutzer-Entscheid nach dem Audit) traegt die Revision
  // NICHT mehr zum Score bei. ind.revBias bleibt gesetzt und faerbt den
  // Previous-Wert auf der Karte weiterhin ein - nur der Score-Anteil ist 0.
  // Begruendung (gemessen, nicht vermutet):
  //  (1) Sie kommt unzuverlaessig an. TradingViews previous-Feld traegt die
  //      Revision nur ~3 Tage; ist der Workflow in dem Fenster geblockt
  //      (dokumentiert vorgekommen), ist sie fuer immer weg. Dasselbe
  //      Ereignis brachte damit mal ±0,5 und mal 0 - abhaengig vom
  //      Scraping-Glueck, nicht von der Wirtschaft.
  //  (2) Die Bonus-Dauer haengt an der Frequenz. Gemessen: NZD GDP trug den
  //      Bonus 91 Tage, GBP NFP 28 Tage - dreifache Score-Zeit fuer dasselbe
  //      Signal, nur weil das eine quartalsweise erscheint. Ursache: der
  //      Bonus klebte am ALTEN Release statt an seinem eigenen Datum.
  //  (3) Citi (CESI) und Bloomberg fuehren Revisionen aus genau diesen
  //      Gruenden nicht im Ueberraschungs-Index - dort zaehlt der Erstdruck
  //      gegen den Konsens, und eine Revision ist ein eigenes Ereignis an
  //      ihrem eigenen Tag.
  // Der Wert bleibt im Rueckgabe-Objekt (immer 0), damit das Score-Modal
  // weiterhin dieselbe Struktur bekommt und ein spaeteres Wieder-Anschalten
  // nur diese eine Zeile braucht.
  const rev=0;
  // Bond-Renditen bleiben ohne Trend-Anteil, auch nachdem sie (Nutzer-Wunsch
  // 2026-07-20) aus der Interest-Rates- in die Inflation-Karte umgezogen
  // sind - die Nutzer-Entscheidung "kein Trend-Bonus fuer Renditen" bezog
  // sich auf die INDIKATOREN selbst, nicht auf die Karte, in der sie
  // gerade angezeigt werden. Deshalb zusaetzlich zur Rubrik-Pruefung direkt
  // ueber BOND_HALF_PT geprueft (indikator-spezifisch, kartenunabhaengig).
  const noTrend=!!(rub&&NO_TREND_RUBS.has(rub.name))||BOND_HALF_PT.has(ind.name);
  if(noTrend)return{w,base,trend:0,rev:0,total:base,zero:false,noTrend:true,norm};
  // Trend-Bonus ist IMMER additiv obendrauf, nie ein Ersatz:
  // - Mit Forecast bleibt Beat/Miss die Basis (ind.bias/w oben), der
  //   (optionale) bestaetigte Trend kommt separat ueber ind.trendBias dazu.
  // - Ohne Forecast ist die Basis bereits das 1-Schritt-Vergleichssignal
  //   (ind.stepDriven, Gewicht 0,5 via indBaseWeight); bestaetigt sich der
  //   staerkere 2-Schritt-Trend zusaetzlich (ind.trendDriven), kommt der
  //   volle Bonus (1 normal/0,5 Core-Paar) OBENDRAUF - macht in Summe genau
  //   die vertrauten 1,5 (normal) bzw. 1 (Core-Paar).
  // Bonus-Betrag: 1 bei normalem, 0,5 bei einem Core-Paar-Indikator - die
  // Partner teilen sich die volle Veraenderung, bleiben aber unabhaengig
  // voneinander (jeder kann seinen Anteil einzeln ausloesen).
  // ⚠ Seit 2026-08-08 (Nutzer-Entscheid nach dem Audit) traegt auch der
  // 2-Schritt-Trend NICHT mehr zum Score bei. Der 📈-Chip an der Indikator-
  // Zeile bleibt vollstaendig erhalten (Fortschritt 0/2, 1/2, bestaetigt) -
  // er ist jetzt reine Zusatzinformation statt Score-Treiber.
  // Begruendung (gemessen): der Trend war als Bonus OBENDRAUF gedacht, war
  // aber faktisch ein gleichrangiger Treiber - bei USD 47% des Gesamtscores
  // (Basis -4,5 / Trend -4,5), bei AUD sogar 100% (Basis 0 / Trend +0,5).
  // Dieselbe Score-Zahl bedeutete dadurch bei zwei Assets voellig
  // Verschiedenes: bei GBP reine Ueberraschung, bei AUD reines Momentum.
  // Citis CESI hat aus genau diesem Grund gar keinen Trend-Term - Momentum
  // und Ueberraschung wirken auf verschiedenen Zeithorizonten (Minuten bis
  // Tage vs. Monate) und gehoeren nicht in dieselbe Zahl.
  // WICHTIG: ind.stepDriven bleibt unangetastet. Das ist NICHT der Trend,
  // sondern der Ersatz fuer Beat/Miss bei Indikatoren ohne Forecast (Actual
  // gegen Previous) - der bleibt die Basis, sonst koennten 38 Indikatoren
  // ohne Forecast-Abdeckung gar nichts mehr beitragen.
  const trendAdj=0;
  return{w,base,trend:trendAdj,rev,total:base+trendAdj+rev,zero:false,noTrend:false,norm};
}
// Score-Rundung auf 2 Nachkommastellen (Nutzer-Wunsch 2026-08-07: "durch die
// neue Rechnung gibt es viele Nachkommastellen, runde sodass es maximal 2
// gibt"). Bewusst an der QUELLE statt an den Anzeigestellen: der normalisierte
// Modus multipliziert jeden Indikator mit einem Faktor zwischen 0,4 und 1,8 -
// dabei entstehen Werte wie -0.6035497225634944, die roh in .rub-score und
// .ov2-score landeten. Wuerde man nur beim Anzeigen runden, muesste man JEDE
// Stelle einzeln erwischen (und jede kuenftige neue Stelle wieder), und die
// Summe der gerundeten Teile koennte von der gerundeten Summe abweichen.
// Rundet man dagegen den Indikator-Score selbst, stimmen Teil und Summe per
// Konstruktion ueberein - Voraussetzung dafuer, dass das Score-Modal nie von
// der echten Rechnung abweichen kann (Projekt-Grundsatz). Das EPSILON faengt
// die ueblichen Gleitkomma-Artefakte ab (0.1+0.2 = 0.30000000000000004).
function roundSc(n){return Math.round((n+(n>=0?1:-1)*Number.EPSILON)*100)/100;}
function indScore(ind,rub){return roundSc(indScoreParts(ind,rub).total);}
// ── Score-Aufschluesselung (Modal, Klick auf einen beliebigen Score) ──
function fmtScNum(v){v=Math.round(v*100)/100;return(v>0?'+':'')+v;}
// Kartenbasierte Score-Aufschluesselung (Nutzer-Wunsch 2026-08-11): zeigt
// jeden Indikator als eigene Karte mit Formel-Kette (Basis × Gewicht ×
// Alter × Marktrelevanz × Ueberraschung) statt einer flachen Zeile -
// aufklappbare Faktor-Tabellen (i-Knopf, natives <details>, kein JS noetig)
// legen offen, WORAUS jeder Faktor stammt. Reine Anzeige-Umstellung: liest
// ausschliesslich bereits bestehende Funktionen (indScoreParts,
// indNormBreakdown, indSurpriseStats, indHalfLifeDays) - keine neue
// Berechnung, damit das Modal nie von der echten Rechnung abweichen kann.
function scoreInfoIndRow(ind,rub){
  const p=indScoreParts(ind,rub);
  const nm=ind.displayName||ind.name;
  const r=ind.research||{};
  const biasCls=(ind.bias==='bull'||ind.bias==='sbull')?'bull':(ind.bias==='bear'||ind.bias==='sbear')?'bear':'';

  // ── Display-only / veraltet: schlanke Karte ohne Formel-Kette ──
  if(p.zero||p.stale){
    let sub;
    if(p.zero)sub='Display-only — excluded from the score by design.';
    else{
      const c=indOverdueCycles(ind);
      sub=`Last release ${escH(r.date||'?')}, ${c?c.toFixed(1):'?'}× its own cycle overdue — excluded from the score until a new one arrives.`;
    }
    return`<div class="si-card">
      <div class="si-top">
        <div style="min-width:0;flex:1"><span class="si-name">${escH(nm)}</span>${p.stale?'<span class="si-tag">OUT OF DATE</span>':''}</div>
        <div class="si-delta"><div class="si-delta-n" style="color:var(--t3)">0.00</div></div>
      </div>
      <div class="si-sub">${sub}</div>
    </div>`;
  }

  // ── Meta-Zeile: Actual vs. Forecast/Vorwert, Beat/Miss ──
  const bl=ind.bias==='sbull'?'Strongly bullish':ind.bias==='bull'?'Bullish':ind.bias==='sbear'?'Strongly bearish':ind.bias==='bear'?'Bearish':'Neutral';
  let meta='';
  if(r.bond)meta=`SMA5 ${r.bondColor==='bond-up'?'above':r.bondColor==='bond-down'?'below':'within 3bp of'} SMA21 &middot; ${escH(bl)}`;
  else if(r.cot||r.sent)meta=`${escH(r.actual||'?')}${r.previous!=null?' &middot; prev '+escH(r.previous):''}`;
  else if(r.actual!=null)meta=`${escH(r.actual)}${r.forecast!=null?' vs. '+escH(r.forecast)+' expected':(r.previous!=null?' &middot; prev '+escH(r.previous):'')}`;
  else meta=escH(bl);
  if(r.actual!=null&&r.forecast!=null&&ind.bias!=='neu')meta+=` &middot; <b style="color:${biasCls==='bull'?BC.bull:BC.bear}">${ind.bias==='bull'||ind.bias==='sbull'?'Beat':'Miss'}</b>`;

  // ── Formel-Kette ──
  const chips=[`<span class="si-chip">Base <span class="v">${biasScore(ind.bias)>0?'+':''}${biasScore(ind.bias)}</span></span>`,
               `<span class="si-chip">Weight <span class="v">${p.w}</span></span>`];
  const nb=(scoreMode==='normalized')?indNormBreakdown(ind,(rub&&rub._symId)||(typeof selId!=='undefined'?selId:null)):null;
  let factorPanels='';
  if(nb){
    if(nb.z!=null&&Math.abs(nb.mag-1)>0.005){
      chips.push(`<span class="si-chip">Surprise size <span class="v">×${nb.mag.toFixed(2)}</span><button type="button" class="si-info-btn" tabindex="-1">i</button></span>`);
      const st=indSurpriseStats(ind);
      factorPanels+=`<details class="si-factor"><summary>Beat/Miss im historischen Vergleich</summary><div class="si-factor-body"><table class="si-ftab">
        <tr><td>Abweichung jetzt</td><td>${nb.z.toFixed(2)}σ</td></tr>
        <tr><td>Eigene Streuung σ (Prognosefehler)</td><td>${st.sigma!=null?st.sigma.toFixed(3):'–'}</td></tr>
        <tr><td>Beobachtungen</td><td>${st.n||0} vergangene Releases</td></tr>
        <tr><td>Faktor (√, gedämpft auf 0,05–…)</td><td>×${nb.mag.toFixed(2)}</td></tr>
      </table></div></details>`;
    }
    if(Math.abs(nb.dec-1)>0.005){
      chips.push(`<span class="si-chip">Age <span class="v">×${nb.dec.toFixed(2)}</span><button type="button" class="si-info-btn" tabindex="-1">i</button></span>`);
      const hl=indHalfLifeDays(ind);
      factorPanels+=`<details class="si-factor"><summary>Veraltungsperiode &amp; Halbwertszeit</summary><div class="si-factor-body"><table class="si-ftab">
        <tr><td>Release-Datum</td><td>${escH(r.date||'?')}</td></tr>
        <tr><td>Eigener Zyklus</td><td>${Math.round(nb.cycle)} Tage</td></tr>
        <tr><td>Halbwertszeit (${DECAY_HALFLIFE_CYCLES}× Zyklus)</td><td>${hl!=null?Math.round(hl):'?'} Tage</td></tr>
        <tr><td>Altersgrenze (0 ab)</td><td>${IND_STALE_CYCLES} eigene Zyklen</td></tr>
        <tr><td>Gewicht jetzt</td><td>×${nb.dec.toFixed(2)}</td></tr>
      </table></div></details>`;
    }
    if(Math.abs(nb.mkt-1)>0.005){
      chips.push(`<span class="si-chip">Market impact <span class="v">×${nb.mkt.toFixed(2)}</span><button type="button" class="si-info-btn" tabindex="-1">i</button></span>`);
      factorPanels+=`<details class="si-factor"><summary>Marktrelevanz — Ø-Kursausschlag an Release-Tagen</summary><div class="si-factor-body"><table class="si-ftab">
        <tr><td>Ø-Bewegung an Release-Tagen ggü. sonst</td><td>×${nb.mkt.toFixed(2)}</td></tr>
        <tr><td>Beobachtungen</td><td>${(Array.isArray(ind.chartHist)?ind.chartHist.length:0)} Releases mit Kurs-Historie</td></tr>
      </table></div></details>`;
    }
  }

  // Bestehende Zusatz-Hinweise (Step-Signal, Trend/Revision nur-Anzeige,
  // Core-Paar-Partner, kleine WoW-Bewegung, Sentiment-Extrem) bleiben als
  // kompakte Fusszeile - andere Signalklasse als die Normierungsfaktoren
  // oben, die zaehlen ja unveraendert nicht in den Score.
  const extra=[];
  if(ind.stepDriven)extra.push('step signal (no forecast): actual vs previous');
  if(ind.trendDriven||ind.trendBias==='bull'||ind.trendBias==='bear')
    extra.push(`2-step trend ${ind.trendDriven?'confirmed':(ind.trendBias==='bull'?'bullish':'bearish')} — shown only, counts 0`);
  if(ind.revBias)extra.push(`prev revised${r.revisedFrom?' from '+r.revisedFrom:''} — shown only, counts 0`);
  if(cotWowIsSmall(ind))extra.push('small WoW shift (<3 pp), half weight');
  if(r.sent)extra.push('contrarian sentiment, half weight, only counts at extremes');
  const partners=indGroupPartners(ind,rub);
  if(partners)extra.push('shares weight with '+partners.join(' + '));

  const relDate=r.date||(Array.isArray(ind.valDates)?ind.valDates[ind.valDates.length-1]:null);
  let ageNote='';
  if(relDate){
    const days=Math.round((new Date(todayStr())-new Date(String(relDate).slice(0,10)))/86400000);
    if(isFinite(days)&&days>=0)ageNote=` &middot; release ${escH(String(relDate).slice(0,10))} (${days}d ago)`;
  }

  return`<div class="si-card ${biasCls}">
    <div class="si-top">
      <div style="min-width:0;flex:1">
        <span class="si-name">${escH(nm)}</span>
        <div class="si-meta">${meta}${ageNote}</div>
      </div>
      <div class="si-delta"><div class="si-delta-n" style="color:${scoreColor(p.total*3)}">${fmtScNum(p.total)}</div></div>
    </div>
    <div class="si-chain">${chips.join('<span class="si-chip-op">×</span>')}<span class="si-chip-op">=</span><b style="color:var(--t0)">${fmtScNum(p.total)}</b></div>
    ${extra.length?`<div class="si-sub">${escH(extra.join(' · '))}</div>`:''}
    ${factorPanels}
  </div>`;
}
function scoreInfoTotalRow(label,val){
  return`<div class="si-total"><span class="si-total-lbl">${escH(label)}</span><span class="si-total-v" style="color:${scoreColor(val)}">${fmtScNum(val)}</span></div>`;
}
// ══ DATENQUALITAET & GEWICHTUNG PRO ASSET ════════════════════════════════
// (Nutzer-Wunsch 2026-08-08) Die App RECHNET Streuung, Zyklus, Halbwertszeit
// und Marktrelevanz laengst - aber sie zeigte sie nur als winzige Klammer im
// Score-Modal, und auch das nur im normalisierten Modus. Wer wissen wollte,
// wie belastbar ein Indikator ueberhaupt ist, konnte es nirgends nachlesen.
// Dieses Fenster stellt die Groessen erstmals vollstaendig und pro Asset
// nebeneinander - alle aus denselben Funktionen, die auch der Score benutzt,
// nichts eigens fuer die Anzeige neu gerechnet.
//
// Median der Ueberraschungen: bewusst der MEDIAN und nicht der Mittelwert.
// Ein einzelner Ausreisser (etwa ein NFP-Sondereffekt) verschiebt den
// Mittelwert stark, den Median kaum - und die Frage lautet hier "wie weit
// liegt dieser Indikator UEBLICHERWEISE daneben", nicht "wie hoch ist die
// Summe der Abweichungen".
function indSurpriseStats(ind){
  const h=Array.isArray(ind.chartHist)?ind.chartHist:[];
  const s=[];
  h.forEach(e=>{
    if(!Array.isArray(e)||e.length<3)return;
    const a=parseNumLike(e[1]),f=parseNumLike(e[2]);
    if(a==null||f==null)return;
    s.push(a-f);
  });
  if(!s.length)return{n:0,median:null,medianAbs:null,sigma:indSurpriseSigma(ind)};
  const sorted=s.slice().sort((a,b)=>a-b);
  const mid=x=>{const k=Math.floor(x.length/2);return x.length%2?x[k]:(x[k-1]+x[k])/2;};
  const abs=s.map(Math.abs).sort((a,b)=>a-b);
  return{n:s.length,median:mid(sorted),medianAbs:mid(abs),sigma:indSurpriseSigma(ind)};
}
// Halbwertszeit in TAGEN. Der Score rechnet sie zyklus-relativ
// (DECAY_HALFLIFE_CYCLES eigene Release-Zyklen), damit ein Quartalswert
// langsamer altert als ein Wochenwert. Fuer die Anzeige wird daraus die
// konkrete Tageszahl - die kann man sich vorstellen, "1,5 Zyklen" nicht.
function indHalfLifeDays(ind){
  const c=indCycleDays(ind);
  return isFinite(c)&&c>0?c*DECAY_HALFLIFE_CYCLES:null;
}
function dqNum(v,dig){
  if(v==null||!isFinite(v))return'–';
  const a=Math.abs(v);
  if(a>=1e6)return(v/1e6).toFixed(2)+'M';
  if(a>=1e3)return(v/1e3).toFixed(1)+'K';
  return v.toFixed(dig==null?2:dig);
}
function openDataQuality(symId){
  const sym=syms.find(s=>s.id===symId);if(!sym)return;
  const rows=[];
  (sym.rubrics||[]).forEach(rub=>{
    (rub.indicators||[]).forEach(ind=>{
      const r=ind.research||{};
      // Rein qualitative und Nicht-Release-Indikatoren haben keine dieser
      // Groessen - sie hier mit Strichen aufzufuehren waere nur Rauschen.
      if(r.bond||r.cot||r.sent)return;
      if(SCORE_ZERO.has(stripPeriodSuffix(ind.name).base))return;
      if(!Array.isArray(ind.chartHist)||!ind.chartHist.length)return;
      const st=indSurpriseStats(ind);
      const cyc=indCycleDays(ind);
      const hl=indHalfLifeDays(ind);
      const mkt=indMarketWeight(ind,symId);
      const nb=indNormBreakdown(ind,symId);
      rows.push({rub:rub.name,name:ind.displayName||ind.name,
        n:st.n,median:st.median,medianAbs:st.medianAbs,sigma:st.sigma,
        cyc,hl,mkt,z:nb.z,norm:nb.total,
        stale:indIsStale(ind),over:indOverdueCycles(ind),
        date:r.date||null});
    });
  });
  rows.sort((a,b)=>b.mkt-a.mkt);
  const belastbar=rows.filter(r=>r.sigma!=null).length;
  const veraltet=rows.filter(r=>r.stale).length;
  const mktRange=rows.length?[Math.min(...rows.map(r=>r.mkt)),Math.max(...rows.map(r=>r.mkt))]:[1,1];

  const head=`<div class="dq-summary">
    <div class="dq-sum-item"><span class="dq-sum-v">${rows.length}</span><span class="dq-sum-l">indicators with history</span></div>
    <div class="dq-sum-item"><span class="dq-sum-v" style="color:${belastbar>=8?BC.bull:belastbar>=5?'var(--amber)':BC.bear}">${belastbar}</span><span class="dq-sum-l">with a usable spread<br><span style="color:var(--t3)">(at least ${NORM_MIN_OBS} past forecasts)</span></span></div>
    <div class="dq-sum-item"><span class="dq-sum-v" style="color:${veraltet?'var(--amber)':'var(--t2)'}">${veraltet}</span><span class="dq-sum-l">out of date<br><span style="color:var(--t3)">(over ${IND_STALE_CYCLES} own cycles overdue)</span></span></div>
  </div>`;

  const body=rows.length?`<div class="dq-scroll"><table class="dq-table">
    <thead><tr>
      <th class="dq-l">Indicator</th>
      <th title="How many past releases carry both an actual and a forecast — everything to the right rests on this number">n</th>
      <th title="Median surprise (actual minus forecast). Median, not mean: a single outlier barely moves it. Near zero = the forecasters are unbiased for this series.">Median</th>
      <th title="Standard deviation of the past forecast errors. This is the yardstick that makes NFP and CPI comparable — a surprise is measured in these units, not in raw points. Needs at least ${NORM_MIN_OBS} observations, otherwise it stays empty rather than being guessed.">Spread σ</th>
      <th title="Current surprise measured in those standard deviations. 1.0 = an averagely large surprise for this indicator.">Now</th>
      <th title="Typical gap between releases, taken as the median of the actual gaps in its own history.">Cycle</th>
      <th title="After this many days the age weighting has halved. Derived from the indicator's own cycle (${DECAY_HALFLIFE_CYCLES} cycles), so a quarterly series ages slower than a weekly one.">Half-life</th>
      <th title="Average price move on this indicator's release days, divided by the average move on all days. Above 1 = the market tends to move more than usual when this one prints. Measured, not assigned.">Impact</th>
      <th title="The three factors multiplied, clamped to ${SCORE_NORM_MIN}–${SCORE_NORM_MAX}. Only active while the score mode is set to normalised.">Weight</th>
    </tr></thead>
    <tbody>${rows.map(r=>`<tr${r.stale?' class="dq-stale"':''}>
      <td class="dq-l"><span class="dq-name">${escH(r.name)}</span><span class="dq-rub">${escH(r.rub)}</span>${r.stale?`<span class="ir-stale" title="Last release ${escH(r.date||'?')}">OUT OF DATE</span>`:''}</td>
      <td>${r.n||'–'}</td>
      <td>${dqNum(r.median)}</td>
      <td${r.sigma==null?' class="dq-dim" title="Fewer than '+NORM_MIN_OBS+' past forecasts — no spread is computed rather than one being guessed from thin data"':''}>${r.sigma==null?'too few':dqNum(r.sigma)}</td>
      <td>${r.z==null?'–':r.z.toFixed(2)+'σ'}</td>
      <td>${Math.round(r.cyc)}d</td>
      <td>${r.hl==null?'–':Math.round(r.hl)+'d'}</td>
      <td style="color:${r.mkt>1.15?BC.bull:r.mkt<0.85?'var(--t3)':'var(--t1)'}">${r.mkt.toFixed(2)}×</td>
      <td style="font-weight:800">${r.norm.toFixed(2)}×</td>
    </tr>`).join('')}</tbody>
  </table></div>` : `<div class="dq-empty">No indicator of this asset has enough release history yet. The values build up as the hourly job collects releases.</div>`;

  const note=`<div class="dq-note">
    <b>How to read this.</b> Every column is measured from this indicator's own past releases — nothing here is assigned by hand.
    <b>Spread σ</b> is the yardstick: NFP misses by tens of thousands, CPI by hundredths of a percent, so a surprise only becomes comparable once it is expressed in the indicator's own standard deviations. This follows Citi's construction for its Economic Surprise Index.
    <b>Impact</b> answers a different question — not "how far off was the forecast" but "does the market actually care". It compares the average price move on release days against the average move on all days, so it is observed behaviour rather than an opinion.
    <b>Half-life</b> is deliberately measured in the indicator's own cycles, not in fixed days: otherwise a quarterly series would always look stale next to a weekly one.
    Where the history is too thin, the cell stays empty instead of showing a number derived from too few observations.
    ${scoreMode==='normalized'?'':'<br><br><b>Note:</b> the score is currently in <b>classic</b> mode, so the Weight column is shown for information only and does not affect any score. Switch to normalised mode to activate it.'}
  </div>`;
  document.getElementById('dqTitle').textContent='Data quality & weighting — '+sym.id;
  document.getElementById('dqBody').innerHTML=head+body+note;
  openM('mDataQuality');
}

function openScoreInfoRub(symId,rubId){
  const sym=syms.find(s=>s.id===symId);if(!sym)return;
  const rub=(sym.rubrics||[]).find(r=>r.id===rubId);if(!rub)return;
  const inds=rub.indicators||[];
  // Veraltete Indikatoren tragen zwar 0 bei, duerfen aber NICHT in der
  // "N weitere bei 0 (neutral / kein Signal)"-Sammelzeile verschwinden -
  // sie sind eben NICHT neutral, sondern ausgeschlossen, und genau das
  // muss man hier sehen koennen (sonst sucht man vergeblich, warum ein
  // sichtbar bullisher Indikator nichts beitraegt).
  const active=inds.filter(i=>indScoreParts(i,rub).total!==0||indIsStale(i));
  const zero=inds.length-active.length;
  let html=active.map(i=>scoreInfoIndRow(i,rub)).join('');
  if(!active.length)html+='<div style="color:var(--t3)">No indicator currently contributes to this card\'s score.</div>';
  if(zero>0)html+=`<div style="color:var(--t3);font-size:11px;margin-top:3px">${zero} more indicator${zero===1?'':'s'} at 0 (neutral / no signal).</div>`;
  html+=scoreInfoTotalRow('Card score',rubScore(rub));
  document.getElementById('scoreInfoTitle').textContent='Score – '+(rub.name)+' ('+sym.id+')';
  document.getElementById('scoreInfoBody').innerHTML=html;
  openM('mScoreInfo');
}
function openScoreInfoSym(symId){
  const sym=syms.find(s=>s.id===symId);if(!sym)return;
  let html='';
  (sym.rubrics||[]).forEach(rub=>{
    const inds=rub.indicators||[];
    // Veraltete auch hier explizit listen (siehe Kommentar in openScoreInfoRub).
    const active=inds.filter(i=>indScoreParts(i,rub).total!==0||indIsStale(i));
    const sc=rubScore(rub);
    html+=`<div style="display:flex;justify-content:space-between;gap:10px;margin:9px 0 4px;font-weight:700;color:var(--t2)"><span>${escH(rub.name)}</span><span style="color:${scoreColor(sc)}">${fmtScNum(sc)}</span></div>`;
    if(active.length)html+=active.map(i=>scoreInfoIndRow(i,rub)).join('');
    else html+=`<div style="color:var(--t3);font-size:11px">all indicators at 0</div>`;
  });
  html+=scoreInfoTotalRow('Raw sum of all indicators',symScore(sym));
  // Der ANGEZEIGTE Symbol-Score ist seit 2026-07-07 ueberall der
  // Vergleichs-Score (raw x Normalisierungs-Faktor) - hier die Rechnung
  // dahinter offenlegen.
  const cnt=countActiveInds(sym);
  const f=symCmpFactor(sym);
  html+=`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 8px;margin-top:2px;border-top:1px solid var(--bd);font-weight:700;color:var(--t1)"><span>Displayed score: raw ${fmtScNum(symScore(sym))} × ${f}</span><span style="color:${scoreColor(symScoreCmp(sym))}">${fmtScNum(symScoreCmp(sym))}</span></div>`;
  html+=`<div style="color:var(--t3);font-size:11px;margin-top:4px">${cnt.active} of ${cnt.total} indicators currently contribute (${symTrackedCount(sym)} scoreable, Ø ${Math.round(fxRefCount()*10)/10} across FX). The displayed score is normalised to this common indicator base: raw sum × (Ø FX indicator count / own tracked count). Assets tracking fewer indicators (e.g. CHF) can therefore reach the same score heights as heavily tracked ones (e.g. USD) - the factor updates automatically whenever indicators are added or removed. The automatic ▲/▼ bias threshold (±3) still evaluates the raw sum.</div>`;
  html+=symStrengthSectionHtml(sym);
  document.getElementById('scoreInfoTitle').textContent='Score – '+sym.id+(sym.full?' ('+sym.full+')':'');
  document.getElementById('scoreInfoBody').innerHTML=html;
  openM('mScoreInfo');
}
// Mittelwert -> eigene Historie -> Note 1-10, mit offengelegter Rechnung UND
// offengelegter Grenze. Der Nutzer hat nach der Skala gefragt und im selben
// Satz nach ihrer Schwaeche - beides gehoert deshalb an dieselbe Stelle,
// nicht die Note allein.
function symStrengthSectionHtml(sym){
  if(scoreMode!=='normalized')
    return`<div style="color:var(--t3);font-size:11px;margin-top:10px;padding-top:8px;border-top:1px solid var(--bd)">Strength 1–10 (score measured against this asset's <b>own</b> history) is shown in <b>normalised</b> mode. Switch the weighting in the header to activate it.</div>`;
  const past=symOwnHistory(sym.id);
  const avg=symScoreAvg(sym);
  const row=(l,v,c)=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 8px"><span style="color:var(--t2)">${l}</span><span style="font-family:var(--ff-num)${c?';color:'+c:''}">${v}</span></div>`;
  let h=`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd)"><div style="font-weight:700;color:var(--t1);padding:0 8px 4px">Strength vs its own history</div>`;
  h+=row('Mean per tracked indicator',fmtScNum(avg)+' pts');
  const s=symStrength10(sym),z=symOwnZ(sym);
  if(s==null){
    const miss=symStrengthMissing(sym);
    const raw=((typeof scoreHist!=='undefined'&&scoreHist&&scoreHist[sym.id])||[]).length;
    h+=row('Comparable history',past.length+' day'+(past.length===1?'':'s')+(raw>past.length?' (of '+raw+' recorded)':''));
    h+=`<div style="color:var(--t3);font-size:11px;margin-top:4px">No grade yet. It needs ${STRENGTH_MIN_OBS} days recorded under the <b>current</b> score model and weighting mode${miss>0?` (${miss} more to go)`:''} — below that the average and the spread would be guessed rather than measured, and a guessed grade is worse than none. ${past.length>=STRENGTH_MIN_OBS?'The series so far shows no variation at all, so there is nothing to measure against.':''}</div>`;
    if(raw>past.length)h+=`<div style="color:var(--t3);font-size:11px;margin-top:4px"><b>Why the older days do not count:</b> the score formula itself changed (revisions and the trend bonus were removed, the staleness cut-off was added), and the two weighting modes produce different magnitudes. Measured on this asset, the old series averaged a different level from what the same situation yields today — comparing across that break would not have produced a weak grade, it would have produced a meaningless one. Those days are still kept and still show in Trends; they are only excluded from this one calculation.</div>`;
  }else{
    const m=past.reduce((a,b)=>a+b,0)/past.length;
    h+=row('Own average / spread',fmtScNum(Math.round(m*10)/10)+' ± '+fmtScNum(Math.round(Math.sqrt(past.reduce((a,b)=>a+(b-m)*(b-m),0)/past.length)*10)/10)+' ('+past.length+'d)');
    h+=row('Today in own std deviations',(z>0?'+':'')+z+' σ');
    h+=row('<b>Strength</b>','<b>'+s+' / 10</b>',scoreColor(symScoreCmp(sym)));
    h+=`<div style="color:var(--t3);font-size:11px;margin-top:4px">Read as: how unusual today's reading is <b>for this asset itself</b> — 1 = weakest it has been, 10 = strongest. Fixed σ bands, not a percentile rank.</div>`;
  }
  h+=`<div style="color:var(--t3);font-size:11px;margin-top:6px"><b>Its limit, deliberately not hidden:</b> a grade built on an asset's own history says nothing about absolute size. A currency that barely moves can reach a 9 on a small swing while a genuinely strong one sits at 5. Measured on the real history of 2026-08-08, a plain percentile rank put JPY at +7.3, CAD at −1.0 and NZD at −1.4 in the <b>same</b> decile — which is why the grade uses fixed σ bands and, more importantly, why it stands <b>next to</b> the points score instead of replacing it. For cross-asset comparison keep using the points; use the grade to judge whether that number is normal or extreme for this particular asset.</div></div>`;
  return h;
}
// Zaehlt beitragende (total != 0) und insgesamt vorhandene Indikatoren eines
// Symbols - fuer die Vergleichbarkeits-Fussnote der Score-Modale.
function countActiveInds(sym){
  let active=0,total=0;
  (sym.rubrics||[]).forEach(rub=>(rub.indicators||[]).forEach(i=>{total++;if(indScoreParts(i,rub).total!==0)active++;}));
  return{active,total};
}
function openScoreInfoPair(pairName){
  const parts=(pairName||'').split('/');
  const codeToId={XAU:'GOLD',XAG:'SILVER',WTI:'OIL',BTC:'BTC',ETH:'ETH'};
  const bSym=syms.find(s=>s.id===(codeToId[parts[0]]||parts[0]));
  const qSym=syms.find(s=>s.id===(codeToId[parts[1]]||parts[1]));
  const row=(l,v,sub)=>`<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:5px 8px;border:1px solid var(--bd2);border-radius:7px;margin-bottom:5px"><span><span style="font-weight:600">${escH(l)}</span>${sub?`<br><span style="color:var(--t3);font-size:11px">${escH(sub)}</span>`:''}</span><span style="font-weight:700">${fmtScNum(v)}</span></div>`;
  let html='';
  const sideSub=(s,neg)=>{
    const f=symCmpFactor(s),n=symTrackedCount(s);
    return`raw ${fmtScNum(neg?-symScore(s):symScore(s))} × ${f} (${n} tracked indicators vs Ø ${Math.round(fxRefCount()*10)/10} across FX) - tap the symbol score in its detail view for the full breakdown`;
  };
  if(bSym)html+=row(bSym.id+' (base)',symScoreCmp(bSym),sideSub(bSym,false));
  if(qSym)html+=row(qSym.id+' (quote, subtracted)',-symScoreCmp(qSym),sideSub(qSym,true));
  const carry=typeof pairCarryAdj==='function'?pairCarryAdj(pairName):0;
  if(carry)html+=row('Carry adjustment',carry,'policy-rate differential: ±0.5 from 0.5%, ±1 from 1.5%');
  html+=scoreInfoTotalRow('Pair score',pairScore(pairName));
  html+=`<div style="color:var(--t3);font-size:11px;margin-top:6px">Both sides are scaled to a common indicator base before subtracting, so a symbol that simply tracks more releases (e.g. USD) does not dominate the pair score structurally.</div>`;
  document.getElementById('scoreInfoTitle').textContent='Score – '+pairName;
  document.getElementById('scoreInfoBody').innerHTML=html;
  openM('mScoreInfo');
}
// Trend-Bonus-Betrag eines Indikators (fuer indScore UND den UI-Chip): 1 bei
// normalem, 0,5 bei einem Halbgewicht-Indikator (Core-Paar, Bond, COT-Netto,
// CB Tone) - unabhaengig davon, ob gerade ein Forecast vorliegt (die
// Halbierung gilt fuer den Bonus immer).
function indTrendAdjMag(ind,rub){return indIsHalfWeight(ind,rub)?0.5:1;}
function rubScore(rub){return roundSc((rub&&rub.indicators||[]).reduce((s,ind)=>s+indScore(ind,rub),0));}
function symScore(sym){return roundSc((sym&&sym.rubrics||[]).reduce((s,rub)=>s+rubScore(rub),0));}
// Farbe des Scores folgt der Bias-Einstufung (>=+3 bullish/blau, <=-3 bearish/rot,
// dazwischen neutral/orange) - so ist die Zahl z.B. bei einem neutralen Asset mit
// +1 oder -1 ebenfalls orange, passend zum Bias.
function scoreColor(n){return n>=3?'var(--blue)':n<=-3?'var(--red)':'var(--amber)';}
// Automatische Bias-Einstufung aus dem Score: >=+3 bullish, <=-3 bearish,
// dazwischen neutral. Gilt fuer Symbole (symScore) und Paare (pairScore).
function scoreBias(n){return n>=3?'bull':n<=-3?'bear':'neu';}
// Nutzer-Bugreport 2026-08-04 (Foto): die Score-Badge-Farbe folgte bis eben
// dem reinen VORZEICHEN des Scores (jede negative Zahl, egal wie klein,
// erschien bearish-rot) - das war ein Bug, kein gewuenschtes Verhalten mehr
// ("die -0.5 steht in bias Farbe bearish, muss aber in neutral stehen").
// Zurueckgesetzt auf die ±3-Auto-Bias-Schwelle (scoreBias(), dieselbe, die
// auch c.bias bestimmt) - ein Score wie -0.5 bleibt jetzt korrekt neutral-
// grau, erst ab ≥3/≤-3 kippt die Farbe auf bullish/bearish.
// ⚠ Zweiter Teil des Bugreports 2026-08-08 ("teilweise stimmen die bias
// Farben dann auch nicht ueberein"). Die Badge faerbte sich bis eben immer
// ueber scoreBias(n) - also ueber die ANGEZEIGTE Zahl, die bei Symbolen der
// Vergleichs-Score ist (roh × Fairness-Faktor). Die Leiste links faerbt
// dagegen ueber sym.bias, und der wird laut Score-Modell ausdruecklich aus
// der ROHEN Summe bestimmt. Beide Wege liegen um den Faktor auseinander:
// sobald der eine Wert die ±3-Schwelle reisst und der andere nicht, stand
// dasselbe Asset links grau und rechts blau. Gemessen an JPY: roh 3,9 gegen
// angezeigt 4,6 - schon ein Faktor von 1,15 genuegt fuer diesen Sprung.
// Deshalb kann die Aufrufstelle jetzt die massgebliche Einstufung direkt
// mitgeben (bias), statt sie aus der Anzeigezahl abzuleiten. Karten-Badges
// ohne eigenen Bias verhalten sich unveraendert.
function scoreBadge(n,title,key,oc,bias){
  const col=BC[bias||scoreBias(n)];
  return`<span class="score-badge"${key?` data-anim-score="${key}" data-sv="${n}"`:''}${oc?` onclick="${oc}" role="button"`:''} style="color:${col};border-color:${col}${oc?';cursor:pointer':''}" title="${escH(title||'Score = sum of the indicators (beat +1, miss −1, neutral 0; ★ important adds +0.5; an indicator with its own Core variant counts ±0.5 each; no forecast → scored against the previous value at ±0.5; a release more than 2 of its own cycles overdue counts 0)')}">${n>0?'+':''}${n}</span>`;
}
// Animiert Score-/Bias-Wechsel: Score-Zahlen zaehlen fließend hoch/runter mit
// Puls, Bias-Pfeile flippen. Vergleicht data-sv/data-bv mit dem zuletzt
// gesehenen Wert (pro Key). Wird nach Sidebar-/Detail-Render aufgerufen.
const _animPrev={};
function animChanges(){
  document.querySelectorAll('[data-anim-score]').forEach(el=>{
    const k='s:'+el.getAttribute('data-anim-score'),nv=parseFloat(el.getAttribute('data-sv'));
    const pv=_animPrev[k];_animPrev[k]=nv;
    if(pv===undefined||pv===nv||isNaN(nv)||isNaN(pv))return;
    el.classList.remove('score-pop');void el.offsetWidth;el.classList.add('score-pop');
    const fmt=v=>{v=Math.round(v*10)/10;return(v>0?'+':'')+v;};
    const t0=performance.now(),d=450;
    const step=now=>{const p=Math.min(1,(now-t0)/d);el.textContent=fmt(pv+(nv-pv)*p);if(p<1)requestAnimationFrame(step);else el.textContent=fmt(nv);};
    requestAnimationFrame(step);
  });
  document.querySelectorAll('[data-anim-bias]').forEach(el=>{
    const k='b:'+el.getAttribute('data-anim-bias'),nv=el.getAttribute('data-bv');
    const pv=_animPrev[k];_animPrev[k]=nv;
    if(pv===undefined||pv===nv)return;
    el.classList.remove('bias-flip');void el.offsetWidth;el.classList.add('bias-flip');
  });
}
// FLIP: verschobene Notes-Stichpunkte gleiten an ihre neue Position.
function flipNotes(mutate){
  const sel='#detail .nt-item[data-flip]',before={};
  document.querySelectorAll(sel).forEach(el=>{before[el.getAttribute('data-flip')]=el.getBoundingClientRect();});
  mutate();
  document.querySelectorAll(sel).forEach(el=>{
    const b=before[el.getAttribute('data-flip')];if(!b)return;
    const a=el.getBoundingClientRect(),dx=b.left-a.left,dy=b.top-a.top;
    if(!dx&&!dy)return;
    el.style.transition='none';el.style.transform=`translate(${dx}px,${dy}px)`;
    requestAnimationFrame(()=>{el.style.transition='transform .32s cubic-bezier(.2,.7,.3,1)';el.style.transform='';setTimeout(()=>{el.style.transition='';},340);});
  });
}
// FLIP fuer die Currency-Strength-Rangliste (.rank-row[data-flip], Dashboard):
// gleitet neu einsortierte Waehrungen sichtbar an ihre neue Rangposition,
// statt sie beim naechsten renderDash()-Rebuild kommentarlos springen zu
// lassen. `before` kommt aus der Vormessung direkt vor dem el.innerHTML=
// weiter oben in renderDash() - gleiches Zwei-Schritt-Prinzip wie flipNotes().
function flipRankRows(root,before){
  root.querySelectorAll('.rank-row[data-flip]').forEach(el=>{
    const b=before[el.getAttribute('data-flip')];if(!b)return;
    const a=el.getBoundingClientRect(),dy=b.top-a.top;
    if(!dy)return;
    el.style.transition='none';el.style.transform=`translateY(${dy}px)`;
    requestAnimationFrame(()=>{el.style.transition='transform .28s cubic-bezier(.2,.7,.3,1)';el.style.transform='';setTimeout(()=>{el.style.transition='';},300);});
  });
}
// Carry-Komponente des Paar-Scores: gestaffelter Bonus/Malus aus der
// Leitzins-Differenz (Basis minus Kurswaehrung, gleiche rateInfo-Quelle wie
// der Carry-Tab). Positiver Carry beguenstigt die Long-Seite des Paars:
//   Differenz >= +1,5% -> +1   |   >= +0,5% -> +0,5
//   Differenz <= -1,5% -> -1   |   <= -0,5% -> -0,5   |   sonst 0
// Nur fuer reine FX-Paare mit bekannten Leitzinsen beider Seiten. Zaehlt
// bewusst NUR auf Paar-/Set-ups-Ebene (nicht als Indikator pro Waehrung),
// weil Carry ein Paar-Konzept ist - Basis vs. Kurswaehrung, nicht Basis vs.
// FX-Durchschnitt.
// Die Staffel selbst - EINE Stelle, damit der Carry von heute und der
// rueckwirkend berechnete Carry der Historie nie auseinanderlaufen koennen.
function carryStufe(diff){
  if(diff==null||!isFinite(diff))return 0;
  return diff>=1.5?1:diff>=0.5?0.5:diff<=-1.5?-1:diff<=-0.5?-0.5:0;
}
function pairCarryAdj(pairName){
  const parts=(pairName||'').split('/');
  if(parts.length!==2||!FX.includes(parts[0])||!FX.includes(parts[1]))return 0;
  const rb=rateInfo(parts[0]),rq=rateInfo(parts[1]);
  if(!rb||!rq)return 0;
  return carryStufe(rb.rate-rq.rate);
}
// ── Leitzins an einem VERGANGENEN Tag ────────────────────────────────
// Anlass (Nutzer-Bugreport 2026-08-23): "Bei Trends ist der Carry bei den
// Scores von den Paaren nicht eingepreist korrigier das und auch die
// Historie rueckwirkend." Die Trends-Paar-Linie rechnete Basis minus
// Kurswaehrung OHNE pairCarryAdj und wich damit vom Paar-Score ab, den
// jede andere Seite der App zeigt.
//
// Rueckwirkend geht das EXAKT, weil ind_data.json je Waehrung die datierte
// Beschluss-Historie der Zentralbank mitliefert (historyFull des Indikators
// "Central Bank Rate"). Ein Leitzins ist eine Treppenfunktion: er gilt vom
// Beschlusstag bis zum naechsten Beschluss. Genau das bildet die Funktion ab.
//
// ⚠ Vor dem AELTESTEN bekannten Beschluss wird NICHT hochgerechnet und der
// heutige Zins NICHT rueckwaerts fortgeschrieben - dann gibt es fuer diesen
// Tag schlicht keinen Carry (Projekt-Grundsatz: nie schaetzen). Die
// Trends-Karte weist das aus, statt es zu verschweigen.
const _rateStufenCache={};
function rateSteps(ccy){
  if(_rateStufenCache[ccy]!==undefined)return _rateStufenCache[ccy];
  let out=null;
  const f=(typeof IND_DATA_FEED!=='undefined'&&IND_DATA_FEED)?IND_DATA_FEED[ccy]:null;
  const h=f&&f['Central Bank Rate']&&f['Central Bank Rate'].historyFull;
  if(Array.isArray(h)){
    // parsePolicyRate statt parseNumLike: die Fed nennt einen KORRIDOR
    // ("3.50%-3.75%"), daraus muss die Mitte werden - parseNumLike wuerde
    // die Untergrenze nehmen und den Carry damit um 0,125 verzerren.
    const pts=h.map(e=>[String((e&&e[0])||'').slice(0,10),parsePolicyRate(e&&e[1])])
      .filter(p=>p[0]&&p[1]!=null&&isFinite(p[1]))
      .sort((a,b)=>a[0].localeCompare(b[0]));
    if(pts.length)out=pts;
  }
  _rateStufenCache[ccy]=out;
  return out;
}
function invalidateRateStepCache(){Object.keys(_rateStufenCache).forEach(k=>delete _rateStufenCache[k]);}
function rateAtDate(ccy,datum){
  const pts=rateSteps(ccy);
  if(!pts)return null;
  let v=null;
  for(let i=0;i<pts.length;i++){if(pts[i][0]<=datum)v=pts[i][1];else break;}
  return v;   // null = der Tag liegt VOR dem aeltesten bekannten Beschluss
}
// Carry eines Paars an einem vergangenen Tag. null (nicht 0!), wenn fuer
// eine der beiden Seiten an dem Tag kein Zins bekannt ist - der Aufrufer
// muss den Unterschied zwischen "kein Carry" und "Carry unbekannt" sehen.
function pairCarryAdjAt(baseId,quoteId,datum){
  if(!FX.includes(baseId)||!FX.includes(quoteId))return 0;
  const rb=rateAtDate(baseId,datum),rq=rateAtDate(quoteId,datum);
  if(rb==null||rq==null)return null;
  return carryStufe(rb-rq);
}
// ── Faire Vergleichsbasis zwischen Symbolen ─────────────────────────
// Symbole tracken unterschiedlich viele wertbare Indikatoren (USD z.B.
// zusaetzlich ADP/JOLTS/Claims/AHE, die es fuer CHF & Co. nicht gibt) -
// die absolute Score-Amplitude ist dadurch strukturell verschieden gross.
// Ueberall dort, wo Symbole GEGENEINANDER gestellt werden (Paar-Score,
// Currency-Strength-Ranking), wird der Score deshalb auf eine gemeinsame
// Indikator-Basis skaliert: Faktor = (Durchschnitts-Anzahl der FX-Majors)
// geteilt durch die eigene Anzahl. Ein Symbol mit ueberdurchschnittlich
// vielen Indikatoren wird leicht herunterskaliert, eines mit wenigen
// leicht hochskaliert - "Signalstaerke pro getracktem Indikator" statt
// roher Summe. Der Symbol-Score selbst (Detailansicht, Karten, Heatmap,
// ±3-Schwellen) bleibt unveraendert die vertraute rohe Summe; der
// Umrechnungsschritt ist im Score-Modal je Seite offengelegt.
// Zaehlt die WERTBAREN Indikatoren, nicht die vorhandenen.
//
// Nutzer-Einwand 2026-08-08, und er war berechtigt: seit der Altersgrenze
// koennen Indikatoren 0 beitragen, ohne aus der Liste zu verschwinden. Stand
// so ein Indikator weiter im Nenner, wurde das Asset DOPPELT bestraft -
// einmal, weil das Signal fehlt, und noch einmal, weil der Divisor zu gross
// bleibt und den Rest kleiner rechnet.
//
// Gemessen: JPY hatte 23 getrackte Indikatoren, 6 davon veraltet. Der Faktor
// lag bei 0,97 statt 1,15, der angezeigte Score bei 3,9 statt 4,6 - 0,7
// Punkte Verlust allein dafuer, dass der Feed haengt.
//
// Die Absicht hinter symScoreCmp ist "Signalstaerke pro getracktem
// Indikator". Ein Indikator, der gar nicht mehr beitragen KANN, ist kein
// getracktes Signal - er gehoert weder in den Zaehler noch in den Nenner.
// SCORE_ZERO-Indikatoren (2Y/10Y Spread) waren aus demselben Grund schon
// immer ausgenommen.
function symTrackedCount(sym){
  let n=0;
  (sym&&sym.rubrics||[]).forEach(rub=>(rub.indicators||[]).forEach(i=>{
    if(SCORE_ZERO.has(stripPeriodSuffix(i.name).base))return;
    if(indIsStale(i))return;
    n++;
  }));
  return n;
}
// Memoisiert (Performance-Fix 2026-07-19): fxRefCount haengt AUSSCHLIESSLICH
// von der Anzahl getrackter Indikatoren der FX-Majors ab (NICHT von Bias-
// Werten/Scores) und liefert innerhalb eines Render-Durchlaufs immer denselben
// Wert - wurde aber pro symScoreCmp() neu berechnet (in renderDash 164x, dabei
// jedes Mal alle 8 Majors durchiteriert). Der Cache wird bei jeder moeglichen
// Strukturaenderung geleert: recomputeAuto() laeuft nach jedem Hinzufuegen/
// Entfernen von Indikatoren/Rubriken sowie nach applySnap() (Undo/Import/Load)
// und beim Boot; save() invalidiert zusaetzlich als Sicherheitsnetz. Ueber-
// Invalidierung ist harmlos (dann wird einmal neu gerechnet).
let _fxRefCountCache=null;
function invalidateCmpCache(){_fxRefCountCache=null;}
// ⚠ Bugfix 2026-08-08 (Nutzer-Bugreport "in der Leiste ein anderer Score als
// im Asset, und die Bias-Farben passen teils nicht zusammen").
//
// Der Cache oben war urspruenglich sicher: fxRefCount haengte NUR an der
// Anzahl der Indikatoren, und die aendert sich ausschliesslich ueber
// recomputeAuto()/save() - genau dort wurde invalidiert.
//
// Mit der Altersgrenze stimmt das nicht mehr. symTrackedCount ruft jetzt
// indIsStale() auf, und das haengt am HEUTIGEN DATUM sowie an research.date.
// Beides kann sich aendern, ohne dass irgendwer recomputeAuto() oder save()
// aufruft - um Mitternacht, oder wenn ein Feed ein Datum nachtraegt. Der
// Cache wurde dadurch still veraltet.
//
// Folge, per Test reproduziert: die Sidebar rendert mit Cache-Stand A, die
// Detailseite kurz darauf mit Stand B - GBP stand links auf +5,2 und rechts
// auf +5,9. Da die Farbe an der Score-Schwelle haengt, laufen damit auch die
// Bias-Farben auseinander. Gemessen: fxRefCount 19,5 (Cache) gegen 19,38
// (frisch).
//
// Fix: jeder Render-Durchlauf beginnt mit einer frischen Rechnung. Die
// Memoisierung bleibt damit genau dort erhalten, wofuer sie gedacht war -
// INNERHALB eines Durchlaufs (renderDash ruft symScoreCmp 164-mal auf) -
// verliert aber ihre Faehigkeit, ueber Durchlaeufe hinweg zu veralten.
function beginRenderPass(){_fxRefCountCache=null;}
// Zieht NUR die Score-Zahlen und Bias-Klassen der Sidebar nach.
//
// Bugfix 2026-08-08, zweiter Fall derselben Meldung: renderDetail() wird von
// rund 30 Stellen einzeln aufgerufen, und einige davon aendern den Score -
// per Test bestaetigt zum Beispiel delRub() (Karte loeschen): die
// Detailseite zeigte danach +5,6, die Sidebar stand weiter auf +5,2, und da
// die Farbe an der Score-Schwelle haengt, liefen auch die Bias-Farben
// auseinander.
//
// Statt jede dieser Aufrufstellen einzeln zu korrigieren - was beim naechsten
// neuen Aufrufer wieder brechen wuerde - wird die Invariante dort erzwungen,
// wo sie hingehoert: nach jedem Detail-Render stimmen die Sidebar-Zahlen. Ein
// vollstaendiges renderSidebar() kostet 4,3ms und wuerde ausserdem Fokus und
// Scrollposition anfassen; diese Fassung schreibt nur Text und Klassen und
// laesst den DOM sonst in Ruhe.
function syncSidebarScores(){
  // Auch die Zahl im Detail-Kopf nachziehen. Der Test zeigte, dass sie
  // ihrerseits veralten kann: delRub() ruft renderDetail() auf, waehrend der
  // Zustand noch nicht endgueltig ist - der Badge wurde mit +5,7 gebaut,
  // eine Millisekunde spaeter war der wahre Wert +6. Beide Anzeigen einen
  // Tick nach dem Render aus derselben Quelle zu schreiben, macht ein
  // Auseinanderlaufen unmoeglich, egal welche Aufrufstelle zu frueh war.
  const sym=typeof getSym==='function'?getSym():null;
  if(sym){
    const sc=symScoreCmp(sym);
    document.querySelectorAll('#detail .score-badge').forEach(el=>{
      const txt=(sc>0?'+':'')+sc;
      if(el.textContent!==txt)el.textContent=txt;
      // Dieselbe Quelle wie die Leiste links: sym.bias, nicht die
      // Anzeigezahl (siehe Kommentar bei scoreBadge).
      const col=BC[sym.bias]||BC[scoreBias(sym&&symScore(sym))];
      if(el.style.color!==col){el.style.color=col;el.style.borderColor=col;}
      el.setAttribute('data-sv',String(sc));
    });
  }
  // Die Asset-Liste in der Navigationsleiste braucht hier nichts mehr:
  // seit 2026-08-23 stehen dort NUR Namen, in den normalen Leisten-Farben.
  // Es gibt also weder eine Score-Zahl noch eine Bias-Faerbung, die
  // nachgezogen werden muesste - nur die Auswahl, und die haengt an
  // updateSidebarSelection().
}
function fxRefCount(){
  if(_fxRefCountCache!==null)return _fxRefCountCache;
  const cs=syms.filter(s=>FX.includes(s.id));
  _fxRefCountCache=cs.length?cs.reduce((a,s)=>a+symTrackedCount(s),0)/cs.length:1;
  return _fxRefCountCache;
}
function symCmpFactor(sym){
  const n=symTrackedCount(sym);
  if(!n)return 1;
  return Math.round(fxRefCount()/n*100)/100;
}
function symScoreCmp(sym){
  return Math.round(symScore(sym)*symCmpFactor(sym)*10)/10;
}
// ══ EIGENE HISTORIE / STAERKE 1-10 (Nutzer-Wunsch 2026-08-08) ═══════════
// "Der normalized Mode soll dann einfach auch machen das die Mittelwerte
// wieder raus kommen und das dann usd nur gegen seine Historie verglichen
// wird ... kann man nicht dann daraus das auf einer Skala von 1-10 bewerten"
//
// Drei Stufen, bewusst getrennt gehalten:
//   1. symScoreAvg   - der MITTELWERT: Punkte je getracktem Indikator.
//      symScoreCmp ist derselbe Mittelwert, nur mit der durchschnittlichen
//      FX-Indikatorzahl zurueckskaliert, damit die ±3-Schwellen weiter
//      passen. Hier kommt er unskaliert heraus, so wie gewuenscht.
//   2. symOwnZ       - dieser Mittelwert gemessen an der EIGENEN Historie
//      des Assets (z-Wert), NICHT an anderen Waehrungen. Genau das, was
//      Citis CESI je Land tut.
//   3. symStrength10 - der z-Wert auf 1-10 abgebildet.
//
// ⚠ WARUM FESTE z-BAENDER UND KEIN PERZENTIL-RANG: ein Dezil-Rang macht
// jede Waehrung per Konstruktion gleich (jede hat ihr eigenes Maximum), und
// genau dadurch geht die Groessenordnung verloren. An der echten Historie
// vom 2026-08-08 nachgerechnet: JPY +7,3 (mit Abstand am staerksten),
// CAD -1,0 und NZD -1,4 landeten ALLE DREI im selben Dezil 4. Feste Baender
// haben das Problem nicht: sie messen zwar auch in Einheiten der eigenen
// Streuung, aber ein Asset, das sich kaum bewegt, erreicht die aeusseren
// Stufen dann eben nicht.
// ⚠ Nutzer-Bugreport 2026-08-08 (Foto, normalisierter Modus): JPY bekam
// 1/10, obwohl es mit Abstand die staerkste Waehrung war. Kein Rechenfehler
// im z-Wert, sondern ein Vergleich von Aepfeln mit Birnen - und zwar aus
// ZWEI Richtungen gleichzeitig:
//
//   1. Das Score-MODELL hat sich geaendert. Revisionen und Trend sind seit
//      V327 draussen, die Altersgrenze kam in V329 dazu. Die aufgezeichnete
//      Historie stammt aber aus der Zeit davor: JPYs Reihe stand im Mittel
//      bei 7,6, heute liefert dieselbe Lage 3,0. Gemessen ergab das z=-6,55.
//   2. Der MODUS wird mitgeschrieben, aber nicht mitgedacht. classic und
//      normalized liefern verschiedene Groessenordnungen und landen beide in
//      derselben Reihe - ein Wechsel des Schalters vergiftet sie also.
//
// Beides ist dieselbe Grundfrage: ist ein historischer Wert ueberhaupt mit
// dem heutigen vergleichbar? Antwort ist nur dann ja, wenn er unter
// demselben Modell UND demselben Modus entstanden ist. Genau das haelt der
// Tag fest; symOwnHistory laesst alles andere aussen vor.
//
// Folge fuers Erste: alle bisherigen Eintraege tragen keinen Tag, fallen
// also raus, und die Note zeigt ehrlich "-/10 - noch N Tage" statt einer
// falschen 1. Das ist der Projekt-Grundsatz (nie schaetzen, stattdessen
// sagen was fehlt) und heilt sich taeglich von selbst.
//
// ⚠ BEI JEDER AENDERUNG AN DER SCORE-FORMEL diese Zahl hochzaehlen -
// dieselbe Pflicht wie bei SUMMARY_ENGINE_VERSION. Ohne den Bump vergleicht
// die Note wieder stillschweigend zwei verschiedene Rechnungen.
// V2 (2026-08-16): forecastlose Indikatoren behielten ihren Bias fuer immer und
// zaehlten mit vollem statt halbem Gewicht - die Korrektur hat die Scores
// deutlich verschoben (AUD -2,0 -> +0,4, GBP 5,2 -> 2,3, CHF 2,5 -> -0,1).
// Alles, was VOR diesem Bump aufgezeichnet wurde, ist damit eine andere
// Rechnung und darf nicht stillschweigend danebengestellt werden.
// V3 (2026-08-16): die AAII-Umfrage kam als zusaetzlicher Score-Beitrag fuer
// S&P 500 und Nasdaq dazu. Ein neuer Indikator veraendert die Zusammensetzung
// genauso wie eine geaenderte Formel - aufgezeichnete Tage davor sind mit der
// neuen Rechnung nicht vergleichbar.
// V4 (2026-08-19): AAII bekam eine Altersgrenze (AAII_STALE_DAYS) - eine
// Wochenumfrage, die drei Veroeffentlichungen verpasst hat, zaehlt nicht
// mehr. Das aendert den Score-Beitrag und damit die Zusammensetzung.
const SCORE_MODEL_VERSION=8;
function SCORE_MODEL_TAG(){return SCORE_MODEL_VERSION+':'+scoreMode;}
// Stammt ein scoreHist-Eintrag aus DIESER Rechnung? Eintraege ohne Tag sind
// alt (der Tag kam erst 2026-08-08 dazu) und zaehlen daher als fremd.
function scoreHistEntryCurrent(e){return Array.isArray(e)&&e[6]===SCORE_MODEL_TAG();}
const STRENGTH_MIN_OBS=10;     // darunter keine Note - zu duenn zum Messen
const STRENGTH_Z_BANDS=[-1.5,-1.0,-0.6,-0.2,0.2,0.6,1.0,1.5,2.0]; // 9 Grenzen -> 10 Stufen
function symScoreAvg(sym){
  const n=symTrackedCount(sym);
  if(!n)return 0;
  return Math.round(symScore(sym)/n*1000)/1000;
}
// Historie des Assets als Zahlenreihe. Quelle ist scoreHist - dieselbe, aus
// der auch der Trends-Chart und die History-Karte lesen; keine zweite,
// konkurrierende Aufzeichnung (siehe die Dual-Source-Lehren in der
// CLAUDE.md). Der heutige Eintrag wird ausgelassen und stattdessen der
// LIVE-Wert verwendet, sonst misst man den Tag gegen sich selbst.
// Nur Eintraege desselben Score-Modells UND desselben Modus - alles andere
// waere ein Vergleich zweier verschiedener Rechnungen (siehe den Merksatz
// bei SCORE_MODEL_VERSION). Der Trends-Chart liest bewusst weiter die volle
// Reihe: dort ist jeder Punkt fuer sich der Wert, der an dem Tag galt, und
// das bleibt richtig - nur ein z-Wert QUER ueber die Reihe braucht eine
// einheitliche Skala.
function symOwnHistory(id){
  const h=(typeof scoreHist!=='undefined'&&scoreHist&&scoreHist[id])||[];
  const today=new Date().toISOString().slice(0,10);
  const tag=SCORE_MODEL_TAG();
  return h.filter(e=>Array.isArray(e)&&e[0]!==today&&typeof e[1]==='number'&&e[6]===tag).map(e=>e[1]);
}
// z-Wert des heutigen Scores in der eigenen Historie. null = zu wenig Basis
// oder eine Reihe ohne jede Bewegung (dann waere jede Note geraten).
function symOwnZ(sym){
  if(!sym)return null;
  const past=symOwnHistory(sym.id);
  if(past.length<STRENGTH_MIN_OBS)return null;
  const m=past.reduce((a,b)=>a+b,0)/past.length;
  const sd=Math.sqrt(past.reduce((a,b)=>a+(b-m)*(b-m),0)/past.length);
  if(!isFinite(sd)||sd<1e-6)return null;
  return Math.round((symScoreCmp(sym)-m)/sd*100)/100;
}
function symStrength10(sym){
  const z=symOwnZ(sym);
  if(z==null)return null;
  let s=1;
  for(let i=0;i<STRENGTH_Z_BANDS.length;i++)if(z>=STRENGTH_Z_BANDS[i])s=i+2;
  return s;
}
// Wie viele Beobachtungen fehlen noch, damit eine Note entsteht - fuer eine
// ehrliche Anzeige statt eines stillen Nichts.
function symStrengthMissing(sym){
  if(!sym)return STRENGTH_MIN_OBS;
  return Math.max(0,STRENGTH_MIN_OBS-symOwnHistory(sym.id).length);
}
// Die Note ERSETZT den Punkte-Score nicht, sie steht daneben. Grund steht
// oben bei STRENGTH_Z_BANDS: eine Note allein wuerde die Groessenordnung
// verschlucken, die Punkte allein sagen nichts darueber, ob der Wert fuer
// DIESES Asset ungewoehnlich ist. Erst zusammen ergeben sie beides.
// Erscheint nur im normalisierten Modus - dort hat der Nutzer sie verlangt,
// und nur dort ist der zugrunde liegende Score selbst schon auf die eigene
// Streuung normiert.
// Paar-Score = VERGLEICHS-Score der Basiswaehrung minus dem der
// Kurswaehrung (auf gemeinsame Indikator-Basis skaliert, s.o.) plus
// Carry-Komponente.
function pairScore(pairName){
  const parts=(pairName||'').split('/');if(parts.length!==2)return 0;
  const codeToId={XAU:'GOLD',XAG:'SILVER',WTI:'OIL',BTC:'BTC',ETH:'ETH'};
  const bSym=syms.find(s=>s.id===(codeToId[parts[0]]||parts[0]));
  const qSym=syms.find(s=>s.id===(codeToId[parts[1]]||parts[1]));
  if(!bSym||!qSym)return 0;
  return Math.round((symScoreCmp(bSym)-symScoreCmp(qSym)+pairCarryAdj(pairName))*10)/10;
}
function rowScore(n,title,color,oc){return`<span class="row-score"${oc?` onclick="event.stopPropagation();${oc}" role="button"`:''} style="color:${color||scoreColor(n)}${oc?';cursor:pointer':''}" title="${escH(title||'Score')}">${n>0?'+':''}${n}</span>`;}
function fmtDate(s){try{const d=new Date(s+'T00:00:00');return{day:d.getDate(),mo:d.toLocaleString('en',{month:'short'}).toUpperCase()};}catch(e){return{day:'',mo:''};}}


export {
  bCol,bRC,bClass,glowClass,biasScore,BOND_HALF_PT,CORE_PAIRS,indIsCorePaired,
  indGroupPartners,indIsHalfWeight,COT_WOW_BASE,COT_WOW_FULL_AT,cotWowIsSmall,indBaseWeight,COT_NET_HALF,SENT_SOURCE,
  SENT_MAP,SENT_IND_NAMES,SENT_HALF,AAII_STALE_DAYS,CB_TONE_HALF,SCORE_ZERO,NO_TREND_RUBS,scoreMode,
  saveScoreMode,setScoreMode,toggleScoreMode,updScoreModeBtn,SCORE_NORM_MIN,SCORE_NORM_MAX,NORM_MIN_OBS,DECAY_HALFLIFE_CYCLES,
  indCycleDays,indCycleTextDays,indCycleDaysCalc,indSurpriseSigma,indSurpriseMag,indDecayWeight,indMarketWeight,_mktWeightCache,
  invalidateNormCache,indNormFactor,indNormBreakdown,IND_STALE_CYCLES,indOverdueCycles,indIsStale,staleIndicators,AWAIT_GRACE_H,
  AWAIT_MAX_DAYS,indAwaitingEvent,awaitingIndicators,indScoreParts,roundSc,indScore,fmtScNum,scoreInfoIndRow,
  scoreInfoTotalRow,indSurpriseStats,indHalfLifeDays,dqNum,openDataQuality,openScoreInfoRub,openScoreInfoSym,symStrengthSectionHtml,
  countActiveInds,openScoreInfoPair,indTrendAdjMag,rubScore,symScore,scoreColor,scoreBias,scoreBadge,
  _animPrev,animChanges,flipNotes,flipRankRows,carryStufe,pairCarryAdj,_rateStufenCache,rateSteps,
  invalidateRateStepCache,rateAtDate,pairCarryAdjAt,symTrackedCount,_fxRefCountCache,invalidateCmpCache,beginRenderPass,syncSidebarScores,
  fxRefCount,symCmpFactor,symScoreCmp,SCORE_MODEL_VERSION,SCORE_MODEL_TAG,scoreHistEntryCurrent,STRENGTH_MIN_OBS,STRENGTH_Z_BANDS,
  symScoreAvg,symOwnHistory,symOwnZ,symStrength10,symStrengthMissing,pairScore,rowScore,fmtDate,
};
// Kompatibilitaets-Bruecke: onclick-referenzierte Namen (toggleScoreMode,
// openDataQuality, openScoreInfo*) PLUS Namen, die check/score.js/
// check/display.js/check/runtime.js/check/scorediff.js direkt per
// page.evaluate() als globalen Bezeichner aufrufen (docs/module-split.md,
// Abschnitt "check/*.js selbst durchsuchen").
if(typeof window!=="undefined")Object.assign(window,{toggleScoreMode,openDataQuality,openScoreInfoRub,openScoreInfoSym,openScoreInfoPair,indScore,indScoreParts,pairScore,roundSc,rubScore,scoreMode,setScoreMode,symScore,symScoreCmp,pairCarryAdj,symStrength10});
