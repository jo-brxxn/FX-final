// ══ DATEN-FEEDS ══════════════════════════════════════════════════════════
// Dritte ausgekoppelte Kategorie (Nutzer-Wunsch 2026-08-25: "generell das
// Projekt in Kategorien machen"). Indikator-/Anleiherenditen-/Preis-/News-/
// Risk-Index-Live-Abrufe (ind_data.json/bond_data.json/price_data.json/
// news_data.json/risk_index.json) inkl. der zugehoerigen apply*Feed()-
// Funktionen und der Ticker-/Movers-Aufbereitung, plus die Asset-Strength-
// Karten-Konfiguration (ccyAllOptions/openCcyCfgM/renderCcyCfgBody/
// toggleCcyAsset - thematisch benachbart, direkt im selben Abschnitt).
// Bidirektional mit js/main.js verbunden (siehe docs/module-split.md fuer
// das allgemeine Muster) - dieses Modul exportiert deshalb weiter unten
// die Namen, die main.js zurueck braucht.
import {BC,FX} from './constants.js';
import {DATA_BASE,DATA_LIVE_OK,IND_RESEARCH_DATA,LOWER_IS_BETTER_RE,SB_CATS,adoptChartHist,adoptFeedHistory,applyRevisionToValHist,applyTrendModel,checkPriceAlerts,curPage,escH,fmtDayHdr,indBiasInputSig,indBiasPinned,invalidateRateStepCache,isNonFx,macroCcyFor,openM,parseNumLike,pushU,renderDash,rerender,researchBias,resetNonFxIndBias,resolvePairPriceSeries,save,stripPeriodSuffix,syms,todayStr,trackIndValues,widgets} from './main.js';

// ── INDIKATOR-WERTE AUS ECHTER API-QUELLE (ind_data.json) ──
// ind_data.json wird stündlich per GitHub Action aus TradingViews
// Wirtschaftskalender (95-Tage-Fenster) erzeugt und enthält pro Indikator den
// zuletzt veröffentlichten Actual/Forecast/Previous - periodengenau (q/q/m/m/
// y/y). Diese echten Werte werden über die statisch hinterlegte Recherche
// gelegt. Der kuratierte Quellen-Link (z.B. investing.com-Seite) bleibt zur
// Überprüfung erhalten; nur die Zahlen + die daraus berechnete Farbe/Bias
// stammen jetzt aus der API. Indikatoren ohne API-Treffer (z.B. Anleihe-
// renditen, Swaps, länderspezifische Lohnmaße) behalten die Recherchewerte.
let IND_DATA_FEED=null;
async function fetchIndData(){
  DATA_LIVE_OK.ind=false;
  try{
    const res=await fetch(DATA_BASE+'ind_data.json?t='+Date.now(),{signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(res.ok){const d=await res.json();if(d&&typeof d==='object'&&!Array.isArray(d)){IND_DATA_FEED=d;invalidateRateStepCache();DATA_LIVE_OK.ind=true;}}
  }catch(e){}
}
// Kuratierter Quellen-Link (i.d.R. investing.com) eines Indikators aus der
// statischen Recherche - hat beim Feed-Overlay Vorrang, damit der Link nie
// auf den TradingView-Fallback "herunterfällt".
// Kuratierter (statischer) Research-Eintrag eines Indikators - Quelle fuer
// Felder, die der Live-Feed (TradingView) nicht immer liefert.
function indResearchEntry(ccy,base){
  const data=IND_RESEARCH_DATA[ccy];
  if(!data)return null;
  return data.entries.find(x=>x.indicator===base&&x.applicable)||null;
}
function indResearchSource(ccy,base){
  const e=indResearchEntry(ccy,base);
  return e&&e.source?e.source:null;
}
function applyIndDataFeed(){
  if(!IND_DATA_FEED)return false;
  let changed=false;
  syms.forEach(c=>{
    const feed=IND_DATA_FEED[macroCcyFor(c.id)];
    if(!feed)return;
    const fx=!isNonFx(c.id);
    (c.rubrics||[]).forEach(rub=>{
      if(!rub.indicators)return;
      rub.indicators.forEach(ind=>{
        const base=stripPeriodSuffix(ind.name).base;
        const f=feed[base];
        if(!f||f.actual==null)return;
        const r=ind.research||{};
        const na=f.actual;let nf=(f.forecast==null?null:f.forecast);const np=(f.previous==null?null:f.previous);
        // Liefert der Live-Feed (TradingView) KEINEN Forecast (z.B. CAD GDP),
        // den kuratierten Research-Forecast als Fallback uebernehmen - aber nur,
        // wenn er denselben Release meint (Datum max. ~4 Tage auseinander), damit
        // kein veralteter Forecast neben einem neueren Actual steht.
        // Gleichquellen-Regel (Nutzer-Wunsch 2026-07-23): KEIN Forecast mehr
        // aus den kuratierten Seed-Daten leihen, wenn der Feed selbst keinen
        // liefert - sonst stuenden Actual (Feed) und Forecast (Seed) aus
        // verschiedenen Quellen nebeneinander. Fehlt der Forecast, bleibt er
        // leer und der Score laeuft ueber den Step/Previous-Vergleich.
        // (Das serverseitige ind_data.json borgt ebenfalls nicht mehr.)
        // src = reiner Anzeige-Link ("Quelle ansehen"), NICHT die Datenherkunft;
        // die echte Datenherkunft steht in f.source (tv/ff/investing).
        const src=indResearchSource(macroCcyFor(c.id),base)||r.source||'https://www.tradingview.com/economic-calendar/';
        // Trend-System speist sich AUCH aus diesem Feed (deckt weit mehr
        // Indikatoren ab als der Kalender-Sync): Werte-Historie fortschreiben
        // und dasselbe Trend-Modell wie in syncIndicatorBiases anwenden -
        // VOR dem "nichts geaendert"-Return, damit auch Bestandsgeraete ohne
        // Feed-Aenderung ihr Erstkontakt-Seeding + die Trend-Anteile bekommen.
        if(fx){
          if(adoptFeedHistory(ind,f))changed=true;
          if(trackIndValues(ind,macroCcyFor(c.id),f.date,na,np))changed=true;
          // Revision NACH beiden Historien-Schritten einspielen: adoptFeedHistory
          // ueberschreibt valHist komplett aus der Feed-Reihe (die weiter den
          // Erstdruck traegt), eine vorher gesetzte Korrektur waere danach
          // wieder weg (siehe applyRevisionToValHist).
          if(applyRevisionToValHist(ind,f))changed=true;
          // allowBiasReplace=true (Bugreport 2026-08-16, gemessen an 14 echten
          // Indikatoren): OHNE Forecast gibt es KEINE zweite Instanz, die den
          // Bias je korrigiert - die Selbstheilung weiter unten haengt an
          // `nf!=null`. Mit `false` griff in applyTrendModel nur noch
          // `ind.bias==='neu'||ind.stepDriven`; ein Indikator mit einem alten,
          // nicht-neutralen Bias, der nie step-getrieben war, fiel durch JEDEN
          // Zweig und behielt seinen Wert fuer immer - bei VOLLEM Gewicht.
          // Gemessen: AUD Services PMI stand auf bear (-0,96), obwohl der Wert
          // von 50,5 auf 53,6 gestiegen war; AUD Retail Sales auf bear (-0,96)
          // ganz ohne Vergleichswert. Korrigiert bewegte sich AUD von -2,0 auf
          // +1,5, GBP von 5,4 auf 2,9, CHF von 2,7 auf 0,6.
          // Der Schutz fuer eine MANUELLE Wahl haengt nicht an diesem Flag,
          // sondern an indBiasPinned(ind,sig) - das wird in applyTrendModel
          // ZUERST geprueft und bleibt unveraendert wirksam (verifiziert).
          if(applyTrendModel(ind,nf==null,true,indBiasInputSig(na,nf,np,f.date)))changed=true;
        }
        // Verlaufschart-Historie unabhaengig von fx/non-fx (non-FX-Assets
        // zeigen dieselbe gespiegelte Makro-Karte wie ihre verbundene
        // Waehrung, siehe macroCcyFor - der Chart soll dort genauso stehen).
        if(adoptChartHist(ind,f,nf))changed=true;
        // Bias-Selbstheilung (Nutzer-Bugreport 2026-07-19: "CB Consumer
        // Confidence" (Actual 91.2, klar unter Forecast 94.7 UND Previous
        // 93.1) zeigte trotzdem bullish an). Ursache: der "nichts geaendert"-
        // Fruehausstieg direkt darunter uebersprang IMMER auch die
        // Bias-Neuberechnung, sobald sich die Feed-Werte seit dem letzten
        // Lauf nicht mehr aenderten - blieb ind.bias aus irgendeinem Grund
        // (Migrations-Bug, Race Condition, alter manueller Klick auf einem
        // Auto-Indikator) einmal falsch stehen, konnte sich das nie mehr von
        // selbst korrigieren. Jetzt wird der Bias bei JEDEM Lauf mit den
        // AKTUELLEN Feed-Werten neu berechnet, UNABHAENGIG davon, ob sich
        // sonst etwas geaendert hat - idempotent (stimmt er schon, passiert
        // nichts) und selbstheilend (stimmt er nicht, wird er repariert).
        if(fx&&nf!=null&&!indBiasPinned(ind,indBiasInputSig(na,nf,np,f.date))){
          const healedBias=researchBias(base,na,nf,np);
          if(ind.bias!==healedBias){ind.bias=healedBias;changed=true;}
        }
        // Revision uebernehmen (Nutzer-Wunsch 2026-07-21): der Workflow
        // markiert per f.revisedFrom, wenn das previous dieses Release vom
        // urspruenglich gemeldeten Actual des Vor-Release abweicht. Daraus
        // wird ind.revBias abgeleitet (Richtung ueber LOWER_IS_BETTER_RE auf
        // den KANONISCHEN Namen - Claimant-Lehre, siehe CLAUDE.md 2026-07-21:
        // nie den Anzeigenamen fuer Klassifikations-Regex verwenden), der in
        // indScoreParts() mit halbem Basisgewicht additiv in den Score
        // einfliesst. Wie die Bias-Selbstheilung oben VOR dem "nichts
        // geaendert"-Fruehausstieg und bei jedem Lauf neu berechnet -
        // idempotent + selbstheilend, und die Revision verschwindet
        // automatisch, sobald der Feed sie beim naechsten Release nicht mehr
        // mitliefert. Nur fuer FX (wie die Bias-Heilung): Non-FX-Spiegelkarten
        // scoren nicht ueber ihre eigenen Indikator-Biases.
        const nrev=(f.revisedFrom!=null&&f.revisedFrom!=='')?String(f.revisedFrom):null;
        let nRevBias=null;
        if(fx&&nrev!=null&&np!=null){
          const rvNew=parseNumLike(np),rvOld=parseNumLike(nrev);
          if(rvNew!=null&&rvOld!=null&&rvNew!==rvOld){
            const lower=LOWER_IS_BETTER_RE.test(base);
            nRevBias=(lower?rvNew<rvOld:rvNew>rvOld)?'bull':'bear';
          }
        }
        if((ind.revBias||null)!==nRevBias){ind.revBias=nRevBias;changed=true;}
        if((r.revisedFrom||null)!==nrev){r.revisedFrom=nrev;changed=true;}
        if(r.feed&&r.actual===na&&r.forecast===nf&&r.previous===np&&r.date===f.date&&r.source===src)return;
        // Previous = einfach der zuletzt gemeldete Actual-Wert der Vorperiode -
        // keine Faerbung, kein Vergleich mit irgendeinem anderen Wert.
        // (Ausnahme seit 2026-07-21: eine vom Workflow erkannte REVISION des
        // Previous wird angezeigt + gefaerbt, siehe revisedFrom/revBias oben.)
        ind.research={actual:na,forecast:nf,previous:np,date:f.date,source:src,dataSource:f.source||null,feed:true,event:f.event,revisedFrom:nrev};
        // Sekundär-Link (z.B. CPI m/m im ausgeklappten CPI-y/y-Indikator) aus den
        // Recherchedaten erhalten, da der Feed nur den Hauptwert (y/y) liefert.
        if(r.secondarySource){ind.research.secondarySource=r.secondarySource;ind.research.secondaryLabel=r.secondaryLabel;}
        if(r.unit)ind.research.unit=r.unit;
        if(r.interval)ind.research.interval=r.interval;
        ind.name=f.period?base+' '+f.period:base;
        changed=true;
      });
    });
  });
  if(changed)syms.forEach(c=>{if(isNonFx(c.id))resetNonFxIndBias(c);});
  return changed;
}

// ── ANLEIHERENDITEN (bond_data.json) ──────────────────────────────
// bond_data.json wird stuendlich per GitHub Action aus Stooq (taegliche
// Schlusskurse der Staatsanleiherenditen) erzeugt und enthaelt pro Waehrung
// und Laufzeit (2Y/10Y) eine Zeitreihe [Datum, Rendite]. Im Browser wird
// daraus berechnet:
//   actual   = letzter verfuegbarer Wert am/vor "gestern"
//              (Wochenende/Feiertag -> letzter Handelstag davor)
//   previous = letzter verfuegbarer Wert am/vor (actual-Datum minus 10 Tage)
// Faerbung: actual > previous -> blau + Bias bullish; actual < previous ->
// rot + bearish; gleich -> weiss + neutral. Aktualisiert sich taeglich.
const BOND_INDS=['2Y Bond Yield','10Y Bond Yield'];
let BOND_DATA_FEED=null;
async function fetchBondData(){
  DATA_LIVE_OK.bond=false;
  try{
    const res=await fetch(DATA_BASE+'bond_data.json?t='+Date.now(),{signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(res.ok){const d=await res.json();if(d&&typeof d==='object'&&!Array.isArray(d)){BOND_DATA_FEED=d;DATA_LIVE_OK.bond=true;}}
  }catch(e){}
}
function isoMinusDays(iso,days){
  const t=new Date(iso+'T00:00:00Z');if(isNaN(t))return iso;
  t.setUTCDate(t.getUTCDate()-days);
  return t.toISOString().slice(0,10);
}
// Bond-Signal-Parameter (siehe ausfuehrliche Begruendung in applyBondDataFeed).
// SMA-Laengen in HANDELSTAGEN (die Reihe enthaelt nur Handelstage), Totzone in
// Prozentpunkten: 0.03 = 3 Basispunkte.
const BOND_SMA_FAST=5,BOND_SMA_SLOW=21,BOND_DEAD_BAND=0.03;
// Einfacher gleitender Durchschnitt ueber die letzten n Punkte der Reihe.
// Gibt null zurueck, wenn die Historie dafuer noch nicht reicht oder ein Wert
// unbrauchbar ist - der Aufrufer bleibt dann bewusst neutral, statt auf einer
// zu duennen Basis ein Signal zu erfinden.
function bondSma(series,n){
  if(!Array.isArray(series)||series.length<n)return null;
  let sum=0;
  for(let i=series.length-n;i<series.length;i++){
    const v=Number(series[i][1]);
    if(!isFinite(v))return null;
    sum+=v;
  }
  return sum/n;
}
// Letzter Eintrag der (aufsteigend nach Datum sortierten) Reihe mit Datum <= target.
function bondPick(series,target){
  let pick=null;
  for(let i=0;i<series.length;i++){const d=series[i];if(d&&d[0]<=target)pick=d;else if(d&&d[0]>target)break;}
  return pick;
}
function fmtYield(v){
  const n=Number(v);if(!isFinite(n))return String(v);
  let s=n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
  if(!/\./.test(s))s+='.0';
  return s+'%';
}
function applyBondDataFeed(){
  if(!BOND_DATA_FEED)return false;
  const today=todayStr();
  const yesterday=isoMinusDays(today,1);
  let changed=false;
  syms.forEach(c=>{
    const bd=BOND_DATA_FEED[macroCcyFor(c.id)];
    if(!bd)return;
    const fx=!isNonFx(c.id);
    (c.rubrics||[]).forEach(rub=>{
      if(!rub.indicators)return;
      rub.indicators.forEach(ind=>{
        const base=stripPeriodSuffix(ind.name).base;
        if(!BOND_INDS.includes(base))return;
        const series=bd[base]&&bd[base].series;
        if(!Array.isArray(series)||!series.length)return;
        // Nur abgeschlossene Handelstage: der heutige (noch laufende) Wert
        // wuerde die kurze SMA sonst mit einem Teiltag verzerren.
        const hist=series.filter(e=>e&&e[0]<=yesterday);
        const use=hist.length>=BOND_SMA_SLOW?hist:series;
        const aEntry=use[use.length-1];
        if(!aEntry)return;
        const aDate=aEntry[0],aVal=Number(aEntry[1]);
        if(!isFinite(aVal))return;
        // ── Bond-Signal (Nutzer-Entscheid 2026-08-06) ──────────────────────
        // Vorher gab es ZWEI Fenster nebeneinander: ein 15-Tage-Punktvergleich
        // trieb den Bias, ein 25-Tage-Punktvergleich einen separaten Trend.
        // Das war doppelt problematisch: (1) beide Fenster ueberlappen stark
        // und massen faktisch dasselbe zweimal, (2) sie widersprachen sich
        // regelmaessig (auf den echten Daten 11 von 16 Indikatoren) - das
        // Trend-Modal zeigte das 25-Tage-Fenster und behauptete eine
        // Score-Wirkung, die indScoreParts fuer Bonds ueber `noTrend` ohnehin
        // verwarf. Jetzt gibt es nur noch EIN Signal.
        //
        // Verfahren: kurzer gegen langen gleitenden Durchschnitt (SMA5 vs
        // SMA21) mit einer Totzone von 3 Basispunkten. Zwei Durchschnitte
        // gegeneinander entfernen Rauschen auf BEIDEN Seiten des Vergleichs -
        // ein einzelner Ausreissertag kann weder das "Jetzt" noch die
        // Vergleichsbasis verfaelschen, anders als beim frueheren Vergleich
        // gegen einen einzelnen Stichtag. Die Totzone filtert zusaetzlich
        // Bewegungen heraus, die zu klein sind, um etwas zu bedeuten (vorher
        // kippte der Bias schon bei 0,001 Prozentpunkten Unterschied).
        // Empirisch auf der echten Bond-Historie gemessen (Fehlsignale =
        // Vorzeichenwechsel ueber alle 14 sauberen Indikatoren): 15-Tage-Punkt
        // 26, reine SMA21 30 (schlechter!), SMA5-vs-SMA21 15, mit Totzone 0.
        const fast=bondSma(use,BOND_SMA_FAST),slow=bondSma(use,BOND_SMA_SLOW);
        let bondColor='bond-flat',bias='neu',pStr=null,pDate=null;
        if(fast!=null&&slow!=null){
          const diff=fast-slow;
          if(diff>BOND_DEAD_BAND){bondColor='bond-up';bias='bull';}
          else if(diff<-BOND_DEAD_BAND){bondColor='bond-down';bias='bear';}
          // Vergleichsbasis fuer die Anzeige ist die lange SMA (nicht mehr ein
          // einzelner Stichtagswert), prevDate der Beginn ihres Fensters.
          pStr=fmtYield(slow);
          pDate=use[use.length-BOND_SMA_SLOW][0];
        }
        const src=indResearchSource(macroCcyFor(c.id),base)||bd[base].source||(ind.research&&ind.research.source);
        const aStr=fmtYield(aVal);
        const r=ind.research||{};
        if(!(r.bond&&r.actual===aStr&&r.previous===pStr&&r.date===aDate&&r.bondColor===bondColor&&r.prevDate===pDate&&r.source===src)){
          ind.research={actual:aStr,forecast:null,previous:pStr,date:aDate,prevDate:pDate,source:src,bond:true,bondColor:bondColor,sma:true};
          changed=true;
        }
        if(fx&&!indBiasPinned(ind,indBiasInputSig(aStr,null,pStr,aDate))&&ind.bias!==bias){ind.bias=bias;changed=true;}
        // Kein separater Trend mehr bei Anleihen - Altbestaende aktiv raeumen,
        // damit kein eingefrorener Wert aus der Vorversion haengen bleibt.
        if(ind.trendBias&&ind.trendBias!=='neu'){ind.trendBias='neu';changed=true;}
        if(ind.trendCmp){delete ind.trendCmp;changed=true;}
      });
    });
  });
  if(changed)syms.forEach(c=>{if(isNonFx(c.id))resetNonFxIndBias(c);});
  return changed;
}
// ── ASSET-PREISE (price_data.json) ────────────────────────────────
// Fuer den "Score vs Price"-Chart im Trends-Tab: pro Waehrung/Asset eine
// taegliche Kurs-Zeitreihe (TradingView, stuendlich per GitHub Action - siehe
// price_data.json-Schritt im Workflow). Waehrungen sind ueber ihr liquidestes
// USD-Paar abgebildet (invert=true bei USD/XXX-Notierungen wie JPY/CHF/CAD,
// damit "hoeher = staerker" konsistent mit der Score-Richtung ist).
let PRICE_DATA_FEED=null;
// Zeitpunkt des letzten (versuchten) Abrufs - unabhaengig vom Ergebnis, damit
// Ticker/Movers-Karte immer "zuletzt geprueft um HH:MM" zeigen koennen, auch
// wenn der stuendliche Workflow zwischen zwei Abrufen keine neuen Werte hatte.
let priceDataLastFetch=null;
async function fetchPriceData(){
  DATA_LIVE_OK.price=false;
  try{
    const res=await fetch(DATA_BASE+'price_data.json?t='+Date.now(),{signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(res.ok){const d=await res.json();if(d&&typeof d==='object'&&!Array.isArray(d)){PRICE_DATA_FEED=d;DATA_LIVE_OK.price=true;}}
  }catch(e){}
  priceDataLastFetch=Date.now();
}
function autoFetchPriceData(){fetchPriceData().then(()=>{checkPriceAlerts();rerender();});}
// ── FINANZ-SCHLAGZEILEN (news_data.json) ──────────────────────────
// Nutzer-Wunsch 2026-08-06: eigene Dashboard-Karte ganz rechts mit den
// neusten Finanz-Schlagzeilen (Fed-Reden, Geopolitik/Oel, Index-Ausblick,
// ...). Reine Anzeige, KEIN Score-Einfluss - wie price_data ein einfacher,
// eigenstaendiger JSON-Fetch (kein Teil von bootFetchScoreFeeds()). Quelle
// ist Marketaux (Workflow-Schritt "Fetch financial news headlines", nur
// Keyword-Suche auf die in der App gelisteten Assets/Makro-Themen zugeschnitten
// - Grundsatz "nur nuetzliche Daten ziehen"). Ohne konfigurierten
// MARKETAUX_API_KEY-Secret bleibt news_data.json leer/fehlt - die Karte zeigt
// dann ehrlich einen leeren Zustand statt erfundener Schlagzeilen (Grundsatz
// "nie schaetzen").
let NEWS_DATA=null;
function fetchNewsData(){
  return fetch(DATA_BASE+'news_data.json?t='+Date.now(),{signal:AbortSignal.timeout(8000),cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(d=>{
      if(d&&typeof d==='object'&&Array.isArray(d.headlines)){NEWS_DATA=d;DATA_LIVE_OK.news=true;}
      else DATA_LIVE_OK.news=false;
    }).catch(()=>{DATA_LIVE_OK.news=false;});
}
function autoFetchNewsData(){fetchNewsData().then(()=>{if(curPage==='dash')renderDash();});}
// Risk-On/Risk-Off-Index aus echten Marktpreisen (VIX, Gold, AUD/USD,
// USD/JPY - Workflow-Schritt "Build Risk-On/Risk-Off index from market data",
// dort steht die volle Methodik samt Begruendung). Nutzer-Wunsch
// 2026-08-12: ersetzt NUR die automatische RISK-ON/RISK-OFF/NEUTRAL-Einstufung
// in riskSentimentWidgetHtml() (Dashboard-Karte "Risk Sentiment"), nicht
// riskOnOffState() selbst (bleibt fuer Aurora-Faerbung/daily_bias-Widget die
// bestehende Quelle - CLAUDE.md-Dual-Source-Lehre: zwei Anzeigen duerfen sich
// nicht denselben Wert aus verschiedenen Quellen zuschreiben, ohne dass klar
// ist, welche fuehrt). Eigenstaendiger Fetch wie news_data.json, kein Teil von
// bootFetchScoreFeeds() (rein display-only, kein Score-Einfluss). Ohne
// erfolgreichen Workflow-Lauf bleibt risk_index.json leer/fehlt - die Karte
// zeigt dann ehrlich "kein Live-Wert" statt eines geratenen Ersatzes.
let RISK_INDEX_DATA=null;
function fetchRiskIndexData(){
  return fetch(DATA_BASE+'risk_index.json?t='+Date.now(),{signal:AbortSignal.timeout(8000),cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(d=>{
      if(d&&typeof d==='object'&&d.value!=null){RISK_INDEX_DATA=d;DATA_LIVE_OK.risk=true;}
      else DATA_LIVE_OK.risk=false;
    }).catch(()=>{DATA_LIVE_OK.risk=false;});
}
function autoFetchRiskIndex(){fetchRiskIndexData().then(()=>{if(curPage==='dash')renderDash();});}
// Kurze relative Zeitangabe ("12m"/"3h"/"2d") fuer Schlagzeilen-Zeitstempel -
// feiner als der bestehende daysUntil() (Tages-Granularitaet), da News-
// Zeitstempel minuten-/stundenaktuell sind.
function relTime(iso){
  const t=new Date(iso).getTime();if(!isFinite(t))return'';
  const m=Math.round((Date.now()-t)/60000);
  if(m<1)return'now';
  if(m<60)return m+'m';
  const h=Math.round(m/60);if(h<24)return h+'h';
  return Math.round(h/24)+'d';
}
// Letzter verfuegbarer Punkt einer Preis-Zeitreihe + %-Veraenderung zum
// letzten verfuegbaren Punkt DAVOR (nicht zwingend "gestern" im Kalendersinn -
// an Wochenenden/Feiertagen wird wie beim Bond-Feed der letzte verfuegbare
// Vortageswert genommen). bias folgt direkt dem Vorzeichen der Veraenderung
// (positiv = bullish, negativ = bearish, wie ueberall sonst in der App).
function priceChangeInfo(series){
  if(!Array.isArray(series)||!series.length)return null;
  const latestEntry=series[series.length-1];
  if(!latestEntry)return null;
  const price=Number(latestEntry[1]);
  if(!isFinite(price))return null;
  const prevEntry=bondPick(series.slice(0,-1),isoMinusDays(latestEntry[0],1));
  if(!prevEntry)return{price,date:latestEntry[0],prevDate:null,changePct:null,changeAbs:null,bias:'neu'};
  const prevPrice=Number(prevEntry[1]);
  if(!isFinite(prevPrice)||!prevPrice)return{price,date:latestEntry[0],prevDate:null,changePct:null,changeAbs:null,bias:'neu'};
  const changePct=(price-prevPrice)/prevPrice*100;
  const changeAbs=price-prevPrice;
  const bias=changePct>0.001?'bull':changePct<-0.001?'bear':'neu';
  return{price,date:latestEntry[0],prevDate:prevEntry[0],changePct,changeAbs,bias};
}
// Fuer eine Einzel-Waehrung/Non-FX-Asset (eigene Preisrichtung, invert schon
// angewandt) bzw. fuer ein FX-Paar (synthetischer Kreuzkurs).
function assetTickerInfo(id){return priceChangeInfo(priceSeriesFor(id));}
function pairTickerInfo(base,quote){return priceChangeInfo(resolvePairPriceSeries(base,quote));}
// Die 28 "kanonischen" FX-Kreuzpaare (8 ueber 2) in Marktkonvention - welche
// Waehrung Basis/Kurs ist, richtet sich nach dieser festen Prioritaet (z.B.
// EUR/USD statt USD/EUR, USD/JPY statt JPY/USD), damit nicht beide Richtungen
// (die nur spiegelverkehrt dieselbe Bewegung waeren) doppelt auftauchen.
const FX_PAIR_PRIORITY=['EUR','GBP','AUD','NZD','USD','CAD','CHF','JPY'];
function canonicalFxPairs(){
  const out=[];
  for(let i=0;i<FX_PAIR_PRIORITY.length;i++)for(let j=i+1;j<FX_PAIR_PRIORITY.length;j++)out.push([FX_PAIR_PRIORITY[i],FX_PAIR_PRIORITY[j]]);
  return out;
}
// Preis-Info fuer eine Set-ups-/Carry-/Watchlist-Zeile: "pair" parst den
// Namen ("EUR/USD" -> base/quote), "asset" nutzt die ID direkt.
function tickerInfoForItem(kind,idOrName){
  if(kind==='pair'){
    const parts=(idOrName||'').split('/');
    if(parts.length!==2)return null;
    return pairTickerInfo(parts[0],parts[1]);
  }
  return assetTickerInfo(idOrName);
}
// Wiederverwendbarer Live-Ticker-Chip: Preis + %-Veraenderung seit dem
// letzten verfuegbaren Vortageswert, eingefaerbt nach Vorzeichen (positiv =
// bullish, negativ = bearish - dieselben Bias-Farben wie ueberall sonst).
// Erscheint ueberall, wo ein FX-Paar oder ein Non-FX-Asset in einer Zeile/
// Karte steht (Set-ups, Carry, Dashboard-Watchlist, Non-FX-Detailkopf).
function tickerChipHtml(info){
  if(!info)return'';
  const col=BC[info.bias];
  const pctTxt=info.changePct==null?'':(info.changePct>0?'▲ +':info.changePct<0?'▼ ':'· ')+Math.abs(info.changePct).toFixed(2)+'%';
  return`<span class="ticker-chip" style="color:${col};border-color:${col}44;background:${col}14" title="Live price, updates every 10 min${info.prevDate?' · vs. '+fmtDayHdr(info.prevDate):''}">${fmtPriceTick(info.price)}${pctTxt?`<span class="ticker-chip-pct">${pctTxt}</span>`:''}</span>`;
}
// Die groessten FX-Gewinner/-Verlierer seit dem letzten verfuegbaren
// Vortageswert (fuer die "Biggest Movers FX"-Dashboard-Karte) - getrennt nach
// Vorzeichen statt einer gemischten Rangliste nach reinem Betrag, damit z.B.
// ein einzelner grosser Ausreisser nicht alle Verlierer aus der Liste drueckt.
function computeFxMovers(){
  const all=canonicalFxPairs().map(([base,quote])=>{
    const info=pairTickerInfo(base,quote);
    if(!info||info.changePct==null)return null;
    return{base,quote,name:base+'/'+quote,...info};
  }).filter(Boolean);
  // Auf Top 2 statt Top 4 gekuerzt (Nutzer-Wunsch 2026-07-28, tech-design-
  // Skill): dieses Widget fuellt jetzt eine schmale Luecke in der unteren
  // Zeile neben "Notifications" statt einer eigenen vollen Kartenzeile -
  // 2+2 echte Eintraege reichen dafuer und passen ohne das iPad-Layout zu
  // sprengen (kein erfundener Inhalt, nur weniger Zeilen derselben echten
  // Rangliste).
  const gainers=all.filter(m=>m.changePct>0).sort((a,b)=>b.changePct-a.changePct).slice(0,2);
  const losers=all.filter(m=>m.changePct<0).sort((a,b)=>a.changePct-b.changePct).slice(0,2);
  return{gainers,losers};
}
// Zeitreihe eines Assets in "eigener Richtung" (invert angewandt) - das ist
// direkt die Linie fuer den Einzel-Asset-Chart (Waehrung ODER Non-FX-Asset).
function priceSeriesFor(id){
  const p=PRICE_DATA_FEED&&PRICE_DATA_FEED[id];
  if(!p||!Array.isArray(p.series)||!p.series.length)return null;
  if(!p.invert)return p.series;
  return p.series.map(e=>[e[0],e[1]?1/e[1]:null]).filter(e=>e[1]!=null);
}
// Synthetischer Cross-Kurs zweier Waehrungen aus ihren (nicht invertierten)
// USD-Kursen: base_in_usd / quote_in_usd (exakt, da beide auf denselben
// Zeitpunkt/USD referenzieren) - nur fuer FX-Waehrungenpaare sinnvoll.
function pairPriceSeries(base,quote){
  const bp=PRICE_DATA_FEED&&PRICE_DATA_FEED[base],qp=PRICE_DATA_FEED&&PRICE_DATA_FEED[quote];
  if(!bp||!qp||!Array.isArray(bp.series)||!Array.isArray(qp.series))return null;
  const bInUsd=e=>bp.invert?(e?1/e:null):e;
  const qInUsd=e=>qp.invert?(e?1/e:null):e;
  const qMap={};qp.series.forEach(e=>{qMap[e[0]]=e[1];});
  const out=[];
  bp.series.forEach(e=>{
    const qv=qMap[e[0]];if(qv==null)return;
    const bU=bInUsd(e[1]),qU=qInUsd(qv);
    if(bU==null||qU==null||!qU)return;
    out.push([e[0],bU/qU]);
  });
  return out.length?out:null;
}
// Kompakte, kursgerechte Nachkommastellen: BTC/Indizes ohne Nachkommastellen,
// Rohstoffe mit 2, FX-Paare mit 4.
function fmtPriceTick(v){
  const a=Math.abs(v);
  if(a>=1000)return v.toFixed(0);
  if(a>=10)return v.toFixed(2);
  return v.toFixed(4);
}
// Rendite-Aenderung fuer die Market-Watch-Dashboard-Karte (Nutzer-Wunsch
// 2026-07-25) - dieselbe Quelle/Rechnung wie applyBondDataFeed() (bondPick,
// Vergleich zum letzten verfuegbaren Vortageswert), nur als reine Anzeige
// ohne Bias-/Score-Nebenwirkung. change ist in Prozentpunkten (pp), nicht
// Prozent-vom-Kurs - bei Renditen ist das die uebliche Angabe.
// ── Asset-Strength-Karte (frueher fest auf die 8 FX-Majors beschraenkt,
// Nutzer-Wunsch 2026-07-27: "soll jetzt eine Asset Karte werden") - frei
// waehlbare Assets statt hartcodiert FX, max. 9, Konfig ueber ein Zahnrad
// wie bei Market Watch (dasselbe Toggle-Grid-Muster, SB_CATS-gruppiert).
// w.ccyAssets leer/fehlend -> Fallback auf die 8 FX-Majors (unveraendertes
// Verhalten fuer alle bestehenden Dashboards ohne eigene Konfiguration).
const CCY_MAX_ASSETS=9;
function ccyAllOptions(){
  return SB_CATS.map(c=>({l:c.l,opts:c.ids.filter(id=>syms.some(s=>s.id===id)).map(id=>({key:id,label:(syms.find(s=>s.id===id)||{}).name||id}))})).filter(g=>g.opts.length);
}
let _ccyEditWidgetId=null;
function openCcyCfgM(widgetId){_ccyEditWidgetId=widgetId;renderCcyCfgBody();openM('mCcyCfg');}
function renderCcyCfgBody(){
  const w=widgets.find(x=>x.id===_ccyEditWidgetId);const body=document.getElementById('ccyCfgBody');
  if(!w||!body)return;
  const sel=new Set(w.ccyAssets&&w.ccyAssets.length?w.ccyAssets:FX);
  const groups=ccyAllOptions();
  const cnt=sel.size;
  body.innerHTML=`<div style="font-size:11.5px;color:var(--t3);margin-bottom:8px">${cnt}/${CCY_MAX_ASSETS} selected</div>`+groups.map(g=>`
    <div class="dw-notes-sub" style="margin-top:10px">${escH(g.l)}</div>
    <div class="mw-cfg-grid">${g.opts.map(o=>`<button class="btn mw-cfg-opt${sel.has(o.key)?' on':''}" onclick="toggleCcyAsset('${o.key}')" ${(!sel.has(o.key)&&cnt>=CCY_MAX_ASSETS)?'disabled title="Maximum 9 assets - remove one first"':''}>${sel.has(o.key)?'✓ ':''}${escH(o.label)}</button>`).join('')}</div>`).join('');
}
function toggleCcyAsset(id){
  const w=widgets.find(x=>x.id===_ccyEditWidgetId);if(!w)return;
  let list=w.ccyAssets&&w.ccyAssets.length?[...w.ccyAssets]:[...FX];
  if(list.includes(id))list=list.filter(k=>k!==id);
  else{if(list.length>=CCY_MAX_ASSETS)return;list=[...list,id];}
  pushU();w.ccyAssets=list;
  renderCcyCfgBody();save();renderDash();
}
// Zeigt sichtbar an, wann zuletzt versucht wurde, Actual-Werte von Forex
// Factory zu laden (bei jedem Seitenaufruf + jedem Refresh-Klick) - als
// Bestätigung, dass die Abfrage nicht nur stündlich passiert.
function updFFLastUpd(){
  const el=document.getElementById('ffLastUpd');if(!el)return;
  const last=localStorage.getItem('fxpro_ff_last');
  if(!last){el.textContent='';return;}
  const d=new Date(last);
  const time=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  const ok=localStorage.getItem('fxpro_ff_lastok')!=='0';
  el.textContent=(ok?'Last updated: ':'Last attempt (error): ')+time;
  DATA_LIVE_OK.calendar=ok;
}


export {
  IND_DATA_FEED,fetchIndData,indResearchEntry,indResearchSource,applyIndDataFeed,BOND_INDS,BOND_DATA_FEED,fetchBondData,
  isoMinusDays,BOND_SMA_FAST,BOND_SMA_SLOW,BOND_DEAD_BAND,bondSma,bondPick,fmtYield,applyBondDataFeed,
  PRICE_DATA_FEED,priceDataLastFetch,fetchPriceData,autoFetchPriceData,NEWS_DATA,fetchNewsData,autoFetchNewsData,RISK_INDEX_DATA,
  fetchRiskIndexData,autoFetchRiskIndex,relTime,priceChangeInfo,assetTickerInfo,pairTickerInfo,FX_PAIR_PRIORITY,canonicalFxPairs,
  tickerInfoForItem,tickerChipHtml,computeFxMovers,priceSeriesFor,pairPriceSeries,fmtPriceTick,CCY_MAX_ASSETS,ccyAllOptions,
  _ccyEditWidgetId,openCcyCfgM,renderCcyCfgBody,toggleCcyAsset,updFFLastUpd,
};
// Kompatibilitaets-Bruecke: openCcyCfgM/toggleCcyAsset per inline onclick=/
// onchange=/... im generierten HTML aufgerufen; applyIndDataFeed/
// applyBondDataFeed werden zusaetzlich von check/score.js direkt per
// page.evaluate() als globaler Name aufgerufen (siehe docs/module-split.md).
if(typeof window!=='undefined')Object.assign(window,{openCcyCfgM,toggleCcyAsset,applyIndDataFeed,applyBondDataFeed});
