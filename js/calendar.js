'use strict';
import {
  MACRO_DERIVE_RUBS,calCcyFilter,calHighOnly,calOpenDays,cloudAutoSync,compactView,curPage,
  effDeriveRules,escH,escJH,eventAlerts,evtDismissKey,evtNewsCount,evtNewsIds,icn,isNonFx,
  isScoreDrivingEvent,macroCcyFor,markLsUpdatedSeen,markPrefEdit,renderCalendar,renderDash,
  renderDetail,setCalCcyFilterVal,setCalHighOnlyVal,setCompactViewVal,stripPeriodSuffix,syms,
} from './main.js';

// ── CALENDAR ↔ SYMBOL MATCHING ──
const CAL_ALIASES={
  GOLD:['GOLD','XAU','XAUUSD'],
  SILVER:['SILVER','XAG','XAGUSD'],
  OIL:['OIL','WTI','CRUDE','USOIL','BRENT'],
  BTC:['BTC','BITCOIN','BTCUSD'],
  SP500:['SP500','SPX','S&P','S&P500','S&P 500','US500'],
  NAS:['NAS','NASDAQ','NDX','US100','NAS100'],
  DAX:['DAX','DAX40','GER40','DE40','GERMANY40'],
  GER100:['GER100','DE100','GERMANY100'],
};
function evtMatchesSym(ev,id){
  if(!ev.currencies||!id)return false;
  const tokens=ev.currencies.toUpperCase().split(/[,/&\s]+/).map(t=>t.trim()).filter(Boolean);
  const names=CAL_ALIASES[id]||[id];
  return tokens.some(t=>names.some(n=>n&&n.replace(/[^A-Z0-9]/g,'')===t.replace(/[^A-Z0-9]/g,'')));
}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function daysUntil(dateStr){const a=new Date(todayStr()+'T00:00:00');const b=new Date(dateStr+'T00:00:00');return Math.round((b-a)/86400000);}
// Aktuelle Uhrzeit als "HH:MM" (lokal) - fuer Vergleiche mit ev.time.
function nowHM(){const n=new Date();return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');}
function evtTimeValid(t){return /^\d{1,2}:\d{2}$/.test(t||'');}
// Ist ein Event bereits vergangen? Vergangene Tage komplett; heute nur, wenn die
// (gueltige) Uhrzeit schon erreicht/ueberschritten ist.
function isEvtPast(ev){
  const dl=daysUntil(ev.date);
  if(dl<0)return true;
  if(dl>0)return false;
  return evtTimeValid(ev.time)&&ev.time<=nowHM();
}
// Datum (YYYY-MM-DD) um n Tage verschieben, lokal gerechnet (kein UTC-Versatz).
function dateAddStr(dateStr,n){const d=new Date(dateStr+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function countdownLbl(dateStr){const n=daysUntil(dateStr);if(n===0)return'Today';if(n===1)return'Tomorrow';if(n===-1)return'Yesterday';return n>1?`in ${n}d`:`${-n}d ago`;}
// ⚠ IMMER MIT JAHR (Nutzer-Regel 2026-09-05): "mach bitte das ueberall wo
// ein Datum steht in zwei Zahlen immer auch da steht das Jahr also 26 fuer
// 2026 ... generell in der ganzen Webseite". Ohne Jahr ist "Mar 26" nicht
// unterscheidbar von "26. Maerz" - und die App zeigt bis zu drei Jahre
// Historie, in der genau diese Verwechslung staendig auftritt. fmtDayHdr ist
// der zentrale Tagesformatierer; wer hier das Jahr entfernt, entfernt es
// appweit.
function fmtDayHdr(dateStr){try{const d=new Date(dateStr+'T00:00:00');return d.toLocaleDateString('en',{weekday:'short',day:'numeric',month:'short',year:'2-digit'});}catch(e){return dateStr;}}

// ── ECONOMIC CALENDAR: FF-STYLE TABLE ROWS ──
// Vergleicht "Actual" ausschliesslich mit "Forecast" (kein Previous-Fallback
// mehr - ohne hinterlegten Forecast aus der Quelle gibt es nichts, womit der
// Wert verglichen werden könnte, und er bleibt neutral) und färbt grün/rot,
// je nachdem ob der Wert für die jeweilige Währung gut oder schlecht ist -
// oder lässt ihn neutral, wenn er dem Forecast entspricht.
// Bei Indikatoren wie Unemployment/Claims/Deficit ist "niedriger" besser.
// "claim" statt "claims" (Praefix-Match), damit auch GBPs Anzeigename
// "Claimant Count Change" erfasst wird - der interne kanonische Name des
// Indikators ("Unemployment Claims") matchte zwar schon vorher, aber Stellen,
// die den waehrungsspezifischen ANZEIGENAMEN fuer die Bias-Klassifikation
// nutzen (z.B. symScoreDrivingEventsByDate()'s synthetisches Event fuer die
// History-Karte, das bewusst ind.displayName fuers Label bevorzugt), gaben
// dadurch trotz identischer Daten das GEGENTEIL des korrekten Live-Scores
// aus (Nutzer-Bugreport 2026-07-21: Score-Modal zeigte "Claimant Count
// Change" korrekt bullish, History-Karte fuer denselben Tag/Release bearish).
const LOWER_IS_BETTER_RE=/unemployment|jobless|claim|deficit/i;
function parseNumLike(s){
  if(s==null||s==='')return null;
  const str=String(s).trim();
  const m=str.match(/-?\d[\d.,]*/);
  if(!m)return null;
  let v=parseFloat(m[0].replace(/,/g,''));
  if(isNaN(v))return null;
  // Skalierungssuffix (K/M/B/T) NUR anwenden, wenn es UNMITTELBAR auf die Zahl
  // folgt (z.B. "1.7M", "625B", "2.89 Mio."). Buchstaben weiter hinten im
  // String (z.B. "Monthly", "m/m", "revidiert") dürfen die Zahl NICHT
  // skalieren - sonst wurde z.B. "-0.1% (Monthly GDP m/m)" faelschlich als
  // -0.1 Millionen interpretiert und damit die Farbe verfaelscht. Ein direkt
  // folgendes "%" bedeutet Prozent -> ebenfalls keine Skalierung.
  const after=str.slice(m.index+m[0].length).match(/^\s*([%KMBT])/i);
  if(after){
    const suf=after[1].toUpperCase();
    if(suf==='B')v*=1e9;else if(suf==='M')v*=1e6;else if(suf==='K')v*=1e3;
  }
  return v;
}
// Steht die Karte dieses Indikators bei DIESEM Asset auf "Bearish"?
//
// Anlass (Nutzer-Wunsch 2026-08-23): in den Asset-Einstellungen laesst sich
// je Makro-Karte einstellen, ob starke Daten der verknuepften Waehrung fuer
// dieses Asset Bullish oder Bearish sind (setAssetDeriveRule, same/inverse).
// deriveMacroBiasAll() dreht daraufhin Karten- und Indikator-Bias korrekt um -
// die ACTUAL-FARBE kannte diese Einstellung aber nicht und faerbte weiter rein
// nach "actual gegen forecast". Bei GOLD mit Inflation auf "Bearish" stand ein
// heisser CPI-Wert damit gruen da, waehrend GOLDs eigener Bias fuer denselben
// Indikator bearish war.
//
// Gilt NUR fuer die vier echten Makro-Karten (MACRO_DERIVE_RUBS) und nur fuer
// Nicht-FX-Assets mit verknuepfter Waehrung - COT Data und Risk Environment
// sind asset-eigene Daten und werden nie gespiegelt.
function actualColorInverted(assetId,indName){
  if(!assetId||!indName)return false;
  const sym=syms.find(s=>s.id===assetId);
  if(!sym||!isNonFx(sym.id)||!macroCcyFor(sym.id))return false;
  const base=stripPeriodSuffix(indName).base;
  const rub=(sym.rubrics||[]).find(r=>MACRO_DERIVE_RUBS.includes(r.name)
    &&(r.indicators||[]).some(i=>stripPeriodSuffix(i.name).base===base||i.displayName===indName));
  if(!rub)return false;
  return effDeriveRules(sym)[rub.name]==='inverse';
}
// assetId ist optional. Ohne ihn (Haupt-Kalender, waehrungsweite Auswertungen)
// bleibt die Farbe die reine Datenrichtung - dort gibt es kein Asset, dessen
// Einstellung gelten koennte.
function actualColor(ev,assetId){
  const roh=actualColorRaw(ev);
  if(!roh||!assetId)return roh;
  // ev.bias tragen die synthetischen COT-/Sentiment-Events: deren Richtung IST
  // bereits der fertig berechnete ind.bias des Assets. Ein zweites Drehen wuerde
  // die Umkehr doppelt anwenden.
  if(ev&&ev.bias)return roh;
  if(!actualColorInverted(assetId,ev&&ev.name))return roh;
  return roh==='act-good'?'act-bad':'act-good';
}
function actualColorRaw(ev){
  // Explizite Bias-Vorgabe (COT/Sentiment-Synthetic-Events aus
  // symScoreDrivingEventsByDate: deren Richtung ist Schwellen-/Vorzeichen-
  // basiert, nicht "Actual vs Forecast" - kann hier nicht numerisch
  // hergeleitet werden, kommt daher direkt vom bereits berechneten ind.bias).
  if(ev.bias)return ev.bias==='bull'?'act-good':ev.bias==='bear'?'act-bad':'';
  if(!ev.actual)return'';
  const a=parseNumLike(ev.actual);
  if(a===null)return'';
  const lowerBetter=LOWER_IS_BETTER_RE.test(ev.name||'');
  if(ev.forecast!=null&&ev.forecast!==''){
    const f=parseNumLike(ev.forecast);
    if(f===null||a===f)return'';
    return(lowerBetter?a<f:a>f)?'act-good':'act-bad';
  }
  // Kein Forecast vorhanden (Nutzer-Wunsch 2026-08-03): Actual dann gegen
  // Previous vergleichen statt ungefaerbt zu lassen - dieselbe Richtungslogik
  // (lower-is-better) wie beim Forecast-Vergleich.
  if(ev.previous!=null&&ev.previous!==''){
    const p=parseNumLike(ev.previous);
    if(p===null||a===p)return'';
    return(lowerBetter?a<p:a>p)?'act-good':'act-bad';
  }
  return'';
}
// Rendert eine Kalender-Zeile im FF-Stil: Zeit | Symbol | Impact | Name | Actual | Forecast | Previous
// Im "compact"-Modus (z.B. Dashboard-Widget) entfallen die Impact-Text- und Lösch-Spalte
// zugunsten eines farbigen Rahmens, damit die Werte auf schmalen Karten nicht abgeschnitten werden.
// CNY-News werden in allen Kalendern immer als Medium-Impact behandelt.
function evtIsCNY(ev){return(ev.currencies||'').toUpperCase().split(/[,/&\s]+/).map(t=>t.trim()).includes('CNY');}
// Effektiver Impact eines Events (einzige Wahrheit fuer Anzeige UND Filter):
// CNY-News sind immer nur Medium, score-treibende Events (CPI, NFP, Zins,
// PMI, GDP ...) immer High - unabhaengig davon, was die rohe ev.impact sagt.
function evtImpact(ev){if(evtIsCNY(ev))return'medium';if(isScoreDrivingEvent(ev))return'high';return ev.impact;}
// Gemeinsame Kalender-Bedienleiste (Forex-Factory-Link, High-Impact-Filter,
// Refresh) - damit Haupt- und Asset-Kalender identische Buttons an gleicher
// Stelle haben. Ein Waehrungsfilter ist hier nicht enthalten: der Hauptkalender
// hat dafuer ein eigenes Select, der Asset-Kalender ist ohnehin schon auf sein
// Asset (inkl. verknuepfter Waehrung) gefiltert.
function calToolbarHtml(){
  const ff=`<a class="btn" href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener" title="Open the calendar on Forex Factory" style="text-decoration:none;display:inline-flex;align-items:center">🅵🅵 Forex Factory</a>`;
  const high=`<button class="btn${calHighOnly?' active':''}" onclick="toggleCalHighOnly()" title="${calHighOnly?'Show all impacts':'Hides medium-/low-impact events and shows only high-impact news'}"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> ${calHighOnly?'High-impact only':'All impacts'}</button>`;
  const alertBtn=`<button class="btn evt-alert-lp" onmousedown="evtAlertPressStart()" onmouseup="evtAlertPressEnd()" onmouseleave="evtAlertPressEnd()" ontouchstart="evtAlertPressStart()" ontouchend="evtAlertPressEnd()" ontouchcancel="evtAlertPressEnd()" onclick="onEvtAlertBtnClick()" oncontextmenu="return false" title="Tap: create a new Telegram alert · Press and hold: see all your alerts"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> New Alert</button>`;
  const refresh=`<button class="btn" style="border-color:rgba(var(--amber-rgb),.27);color:var(--amber)" onclick="fetchFF(false,this)" title="Reloads high/medium-impact news for the next 10 days from Forex Factory and checks the live feed for new actual values"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>`;
  return`<div class="cal-toolbar" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end;margin-bottom:9px">${ff}${high}${alertBtn}${refresh}</div>`;
}
function calRowHtml(ev,opts){
  opts=opts||{};
  const imp=evtImpact(ev);
  const ic=imp==='high'?'ih':imp==='medium'?'im':'il';
  const impLbl=imp==='high'?'High':imp==='medium'?'Medium':'Low';
  const ac=actualColor(ev,opts.symId);
  const val=(v,cls)=>v?`<div class="cal-val${cls?' '+cls:''}">${escH(v)}</div>`:'<div class="cal-val ph">–</div>';
  const isToday=ev.date===todayStr();
  const isPast=isEvtPast(ev);
  const past=isPast?' cal-past':'';
  const sub=[ev.expected,ev.notes].filter(Boolean).join(' · ');
  if(opts.compact){
    return`<div class="cal-row compact ${ic}${isToday?' today':''}${past}">
      <div class="cal-time">${ev.time||'—'}</div>
      <div class="cal-ccy">${escH(ev.currencies||'')}</div>
      <div class="cal-evname" title="${escH(ev.name)}">${escH(ev.name)}</div>
      ${val(ev.actual,ac)}
      ${val(ev.forecast)}
      ${val(ev.previous)}
      ${sub?`<div class="cal-evsub">${escH(sub)}</div>`:''}
    </div>`;
  }
  return`<div class="cal-row${isToday?' today':''}${past}">
    <div class="cal-time">${ev.time||'—'}</div>
    <div class="cal-ccy">${escH(ev.currencies||'')}</div>
    <div class="cal-imp ${ic}">${impLbl}</div>
    <div class="cal-evname" title="${escH(ev.name)}">${escH(ev.name)}</div>
    ${val(ev.actual,ac)}
    ${val(ev.forecast)}
    ${val(ev.previous)}
    ${(()=>{
      const ekey=evtDismissKey(ev);
      const hasAlert=eventAlerts.some(a=>a.evKey===ekey);
      const canAlert=!isPast&&evtTimeValid(ev.time);
      const alertBtn=canAlert?`<button class="cal-alert-btn${hasAlert?' on':''}" data-ekey="${escH(ekey)}" onclick="openEvtAlertM(this.dataset.ekey)" title="${hasAlert?'Telegram alert set — tap to edit or remove':'Set a Telegram alert for this event'}">${icn('bell',13)}</button>`:'';
      const other=opts.delAction?`<button class="cal-row-del" onclick="${opts.delAction}" title="Delete">×</button>`:'';
      // Schlagzeilen zu diesem Termin: gleiche Waehrung, gleicher Tag. Reine
      // Koinzidenz-Anzeige - der Knopf oeffnet den News-Tab auf dieses Asset
      // und diesen Tag, es wird kein inhaltlicher Zusammenhang behauptet.
      const nH=evtNewsCount(ev);
      const newsBtn=nH?`<button class="cal-news-btn" onclick="gotoNewsFor('${escJH(evtNewsIds(ev)[0]||'')}','${escJH(ev.date||'')}')" title="${escH(nH+' headline(s) on this day mentioning '+evtNewsIds(ev).join('/'))}">${icn('note',11)}<span>${nH}</span></button>`:'';
      return(alertBtn||other||newsBtn)?`<div class="cal-row-actions">${newsBtn}${alertBtn}${other}</div>`:'<div></div>';
    })()}
    ${sub?`<div class="cal-evsub">${escH(sub)}</div>`:''}
  </div>`;
}
// Rendert eine Liste von Events gruppiert nach Tag (mit Spalten-Header und Datums-Headern).
// opts.compact: kompaktere Spaltenbreiten ohne Impact-Text/Lösch-Spalte (z.B. Dashboard-Widget).
function calTableHtml(evts,opts){
  opts=opts||{};
  if(!evts.length&&!(opts.allDates&&opts.allDates.length))return'';
  const today=todayStr();
  let html=opts.skipHeader?'':opts.compact
    ?`<div class="cal-col-hdr compact"><span>Time</span><span>Sym</span><span>Event</span><span>Actual</span><span>Forecast</span><span>Prev</span></div>`
    :`<div class="cal-col-hdr"><span>Time</span><span>Sym</span><span>Impact</span><span>Event</span><span>Actual</span><span>Forecast</span><span>Previous</span><span></span></div>`;
  // Events nach Datum gruppieren (Reihenfolge innerhalb des Tages bleibt erhalten).
  const byDate={};
  evts.forEach(ev=>{(byDate[ev.date]=byDate[ev.date]||[]).push(ev);});
  // Welche Tage werden gerendert? Mit opts.allDates wird ein lückenloses Fenster
  // gezeichnet (auch Tage ganz ohne News), sonst nur Tage mit Events.
  const dates=(opts.allDates&&opts.allDates.length)?opts.allDates:Object.keys(byDate).sort();
  // ID-Präfix, damit Haupt- und Mini-Kalender keine doppelten Element-IDs
  // erzeugen (sonst würde toggleCalDay den falschen Tag auf-/zuklappen).
  const pfx=opts.idPrefix||'';
  const rows=ev=>calRowHtml(ev,{delAction:opts.delAction?opts.delAction(ev):null,compact:opts.compact,symId:opts.symId});
  // Dünne rote "Jetzt"-Linie mit aktueller Uhrzeit (linksbündig). Wird in der
  // heutigen Tagesgruppe zwischen vergangenen und anstehenden Events eingefügt.
  const nowMarker=`<div class="cal-now-line" title="Aktuelle Uhrzeit"><span class="cal-now-time">${nowHM()}</span><span class="cal-now-rule"></span></div>`;
  const renderToday=dayEvts=>{
    const now=nowHM();let out='',done=false;
    dayEvts.forEach(ev=>{
      if(!done&&evtTimeValid(ev.time)&&ev.time>now){out+=nowMarker;done=true;}
      out+=rows(ev);
    });
    if(!done)out+=nowMarker;
    return out;
  };
  dates.forEach(date=>{
    const dayEvts=byDate[date]||[];
    const n=dayEvts.length;
    const isToday=date===today;
    const nowHere=opts.showNowLine&&isToday;
    // Vergangene Tage (gestern / vorgestern) bleiben im Kalender, werden aber
    // eingeklappt dargestellt - erst per Klick auf den Tages-Header sichtbar.
    const isPast=opts.collapsePast&&daysUntil(date)<0;
    if(isPast){
      const open=calOpenDays.has(date);
      html+=`<div class="cal-day-hdr past${open?'':' collapsed'}" id="${pfx}calhdr-${date}" onclick="toggleCalDay('${date}','${pfx}')"><span><span class="cal-day-chev">▾</span>${fmtDayHdr(date)}<span class="cal-day-cnt">${n} Event${n===1?'':'s'}</span></span><span class="cal-day-cd">${countdownLbl(date)}</span></div>`;
      html+=`<div class="cal-day-body" id="${pfx}calbody-${date}"${open?'':' style="display:none"'}>`;
      html+=n?dayEvts.map(rows).join(''):`<div class="cal-empty-day">No events</div>`;
      html+=`</div>`;
    }else{
      html+=`<div class="cal-day-hdr${isToday?' today':''}"><span>${fmtDayHdr(date)}${isToday?' · 🔥 TODAY':''}</span><span class="cal-day-cd">${countdownLbl(date)}</span></div>`;
      html+=n?(nowHere?renderToday(dayEvts):dayEvts.map(rows).join('')):(nowHere?nowMarker+`<div class="cal-empty-day">No events</div>`:`<div class="cal-empty-day">No events</div>`);
    }
  });
  return`<div class="cal-table${opts.compact?' compact':''}">${html}</div>`;
}
// Lückenloses Tagesfenster (erstes bis letztes Event, mind. inkl. heute) für
// eine Eventliste - für die "leere Tage anzeigen"-Darstellung.
function calWindowDatesFor(evts){
  if(!evts||!evts.length)return[];
  const today=todayStr();let min=today,max=today;
  evts.forEach(ev=>{if(ev.date<min)min=ev.date;if(ev.date>max)max=ev.date;});
  const out=[];for(let d=min,g=0;d<=max&&g<400;d=dateAddStr(d,1),g++)out.push(d);
  return out;
}
// Klappt einen vergangenen Kalender-Tag auf/zu (ohne Re-Render, damit die
// Scroll-Position erhalten bleibt). pfx unterscheidet Haupt-/Mini-Kalender.
function toggleCalDay(date,pfx){
  pfx=pfx||'';
  if(calOpenDays.has(date))calOpenDays.delete(date);else calOpenDays.add(date);
  const open=calOpenDays.has(date);
  const body=document.getElementById(pfx+'calbody-'+date);
  const hdr=document.getElementById(pfx+'calhdr-'+date);
  if(body)body.style.display=open?'':'none';
  if(hdr)hdr.classList.toggle('collapsed',!open);
}
// Schaltet den "nur High-Impact"-Filter um (persistiert) und rendert neu.
function toggleCalHighOnly(){
  setCalHighOnlyVal(!calHighOnly);
  localStorage.setItem('fxpro_cal_highonly',calHighOnly?'1':'0');
  localStorage.setItem('fxpro_updated',new Date().toISOString());
  markLsUpdatedSeen();
  markPrefEdit();
  cloudAutoSync();
  updCalHighBtn();
  renderCalendar();

  if(curPage==='dash')renderDash();
  if(curPage==='cur')renderDetail();
}
function updCalHighBtn(){
  const b=document.getElementById('calHighBtn');if(!b)return;
  b.classList.toggle('active',calHighOnly);
  b.innerHTML=icn('filter')+(calHighOnly?' High-impact only':' All impacts');
}
// Kompaktansicht in 3 Stufen (0 = alles sichtbar, 1 = Stichpunkte/
// Zusammenfassungen UND die Perioden-Badge (wie oft ein Indikator
// veroeffentlicht wird) weg, 2 = zusaetzlich Datum-Badge, i-Knopf und
// Trend-Chip der Indikatoren weg). Alte Boolean-Werte (true/'1' bzw.
// false/'0') werden auf 1 bzw. 0 abgebildet.
function normCompactLevel(v){
  if(v===true)return 1;
  if(v===false)return 0;
  const n=Number(v);
  return n>=1?1:0;
}
// Nur noch 2 Stufen (Nutzer-Wunsch 2026-07-29, vorher 3): Stufe 1 zeigt alles
// inkl. der Rubrik-Zusammenfassungen, Stufe 2 blendet nur die Zusammenfassungen
// aus (die Stichpunkte-Funktion, die vorher bei Stufe 1 mitausgeblendet wurde,
// ist komplett entfernt - siehe removeAllPts-Merksatz weiter unten).
const COMPACT_TITLES=[
  'Summaries visible (stage 1 of 2) - tap to hide the rubric summaries',
  'Summaries hidden (stage 2 of 2) - tap to show them again'
];
function applyCompactView(){
  document.body.classList.toggle('compact-view',compactView>=1);
}
function updCompactSw(){
  const b=document.getElementById('compactSw');
  if(!b)return;
  b.classList.toggle('on',compactView===1);
  b.title=COMPACT_TITLES[compactView]||COMPACT_TITLES[0];
}
function toggleCompactView(){
  setCompactViewVal((compactView+1)%2);
  localStorage.setItem('fxpro_compactview',String(compactView));
  localStorage.setItem('fxpro_updated',new Date().toISOString());
  markLsUpdatedSeen();
  markPrefEdit();
  cloudAutoSync();
  applyCompactView();
  updCompactSw();
}
function setCalCcyFilter(v){
  setCalCcyFilterVal(v||'ALL');
  localStorage.setItem('fxpro_cal_ccy',calCcyFilter);
  localStorage.setItem('fxpro_updated',new Date().toISOString());
  markLsUpdatedSeen();
  markPrefEdit();
  cloudAutoSync();
  renderCalendar();
}
function updCalCcySel(){
  const sel=document.getElementById('calCcySel');if(!sel)return;
  sel.value=calCcyFilter;
}

export {
  evtMatchesSym,todayStr,daysUntil,evtTimeValid,isEvtPast,dateAddStr,countdownLbl,fmtDayHdr,
  LOWER_IS_BETTER_RE,parseNumLike,actualColor,evtIsCNY,evtImpact,calToolbarHtml,calRowHtml,
  calTableHtml,calWindowDatesFor,updCalHighBtn,normCompactLevel,COMPACT_TITLES,applyCompactView,
  updCompactSw,toggleCompactView,setCalCcyFilter,updCalCcySel,
};

// Bruecke fuer HTML-String-onclick-Handler (toggleCalHighOnly/toggleCalDay/
// toggleCompactView/setCalCcyFilter werden aus per innerHTML gerendertem
// Markup aufgerufen) und fuer check/score.js, das todayStr() im Browser-
// Kontext als globalen Bezeichner aufruft.
Object.assign(window,{toggleCalHighOnly,toggleCalDay,toggleCompactView,setCalCcyFilter,todayStr});
