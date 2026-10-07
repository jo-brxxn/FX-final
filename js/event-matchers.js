'use strict';
// ── KALENDER-EVENT ↔ SCORE-INDIKATOR: die Namensmuster ──────────────────
// Am 2026-10-06 unveraendert aus js/main.js hierher verschoben. Anlass: der
// Kalender soll die kommenden 3 Monate tragen (Nutzer 2026-10-06, per
// Rueckfrage "High/Medium + Score-Indikatoren"). Welche Low-Events einen
// Score-Indikator betreffen, muss der Kalender-Workflow
// (.github/workflows/update-ff-calendar.yml) dafuer GENAU so entscheiden wie
// die App - eine abgeschriebene zweite Liste im Workflow liefe beim naechsten
// neuen Indikator still auseinander. Deshalb laden beide diese Datei.
//
// ⚠ Nichts aus dem Browser anfassen (kein window/document/localStorage, kein
// Import aus main.js): Node laedt die Datei im Workflow direkt.
//
// Verknüpft die manuell gepflegten Indikatoren in den Rubriken "Interest
// Rates"/"Inflation"/"Labour Market" automatisch mit dem jüngsten
// passenden Kalender-Event (Actual/Forecast/Previous) - die Verwendung
// steht in js/main.js (findIndEventHistory, findIndNextEvent,
// applyResearchToCal, fetchFF) und js/score.js.
function mkIndMatcher(include,exclude){
  return name=>{
    const n=(name||'').toLowerCase();
    if(exclude&&exclude.some(re=>re.test(n)))return false;
    return include.some(re=>re.test(n));
  };
}
// Manche Indikatoren werden unter EINER Währung (v.a. EUR) von mehreren,
// methodisch verschiedenen nationalen Umfragen gemeldet (z.B. EU-Kommission
// "Consumer Confidence (Flash)" vs. deutsches "GfK Consumer Confidence" -
// beide unter "EUR" getaggt). Ein generisches Muster würde da leicht das
// falsche Barometer ziehen. "overrides" liefert pro Währung ein striktes,
// eindeutiges Muster; alle anderen Währungen (nur 1 Land je Währung, daher
// unkritisch) nutzen weiterhin das breite "fallback"-Muster. Wird matcher()
// ohne ccy aufgerufen (z.B. für die generelle High-Impact-Einstufung), wird
// breit über alle Muster geprüft.
function mkCcyIndMatcher(overrides,fallback){
  const fb=Array.isArray(fallback)?fallback:[fallback];
  return (name,ccy)=>{
    const n=(name||'').toLowerCase();
    if(ccy)return overrides[ccy]?overrides[ccy].test(n):fb.some(re=>re.test(n));
    return fb.some(re=>re.test(n))||Object.values(overrides).some(re=>re.test(n));
  };
}
// Retail Sales: ueberall den m/m-Release matchen, y/y ausschliessen - ausser
// bei CHF, wo die Schweiz (BFS) den Detailhandelsumsatz nur als y/y meldet
// (keine m/m-Reihe existiert). Gemeinsam von IND_EVENT_MATCHERS (Live-Bias-
// Sync) und CAL_RESEARCH_MATCHERS (Seed-Daten-Matching) genutzt.
// ⚠ 2026-10-07: "Control Group", "Ex Gas/Autos", "ex Fuel" sind Teilreihen
// desselben Releases mit eigenem Wert - derselbe Ausschluss wie im
// Indikator-Feed (update-ff-calendar.yml, RULES "Retail Sales").
function RETAIL_SALES_MATCHER(name,ccy){
  const n=(name||'').toLowerCase();
  if(!/retail sales/.test(n))return false;
  if(/core|inventories|ex auto|control|\bex[\s-]|ex fuel/.test(n))return false;
  if(ccy==='CHF')return true;
  return !/y\/y|yoy/.test(n);
}
const IND_EVENT_MATCHERS={
  'Central Bank Rate':mkIndMatcher([/rate decision/,/interest rate decision/,/\bcash rate\b/,/bank rate/,/refinancing rate/,/overnight rate/,/policy rate/,/deposit facility/,/official cash rate/,/fed funds/]),
  // Der Headline-CPI heisst je nach Datenquelle "CPI" (Forex Factory) ODER
  // "Inflation Rate" (TradingView, z.B. bei CAD/EUR/CHF). Kern- und Teilmasse
  // (Core/Common/Median/Trimmed/Super, PPI/PCE, Inflationserwartungen, BoJ/
  // Tokyo, Services) werden ausgeschlossen, damit wirklich der Headline-Wert
  // gezogen wird und nicht versehentlich ein Kernmass.
  // "\bex[\s-]": JPY "Inflation Rate Ex-Food and Energy" ist ein Kernmass,
  // keine Headline (dieselbe Ausschlussregel wie EXCORE im Indikator-Feed).
  'CPI (Headline)':mkIndMatcher([/\bcpi\b/,/inflation rate/],[/core/,/common/,/median/,/trimmed/,/super/,/\bppi\b/,/\bpce\b/,/expectation/,/\bboj\b/,/tokyo/,/services/,/\bsppi\b/,/wage/,/rent/,/\bex[\s-]/]),
  // Kern-/Core-Inflation: "Core CPI", "Core Inflation Rate".
  // CAD: bewusst die BoC-Kennzahl "CPI-Median" statt der StatCan "Core
  // Inflation Rate" (CPIX) - nur die BoC-Masse liefern im Kalender einen
  // vollstaendigen Datensatz inkl. Forecast, sodass Actual/Forecast/Previous
  // alle drei aus dem Kalender kommen (CPIX hat dort keinen Forecast).
  // ⚠ JPY seit 2026-10-07 nur die LANDESWEITE Kernrate: der Indikator-Feed
  // fuehrt "National Core CPI" (Termine 21.05./18.06./23.07./20.08./17.09.),
  // das Muster traf aber auch "Tokyo Core CPI" (Monatsende) und die BoJ-
  // Kennzahl "BOJ Core CPI" (rund eine Woche spaeter) - an allen 6 gemessenen
  // Terminen dieser beiden lag kein Release der Reihe. Die Next-Spalte haette
  // nach jeder Landes-CPI den Tokioter Termin als bestaetigt gezeigt.
  // AUD: der Feed misst den Trimmed Mean (Trading Economics "Core CPI");
  // FXStreet fuehrt genau diese Reihe als "Trimmed Mean CPI (YoY)".
  'Core CPI':mkCcyIndMatcher(
    {CAD:/median cpi/,JPY:/^(national )?core (cpi|inflation rate)\b/,AUD:/trimmed mean cpi|core inflation rate/},
    [/core cpi/,/core inflation rate/,/super core/]
  ),
  'PPI':mkIndMatcher([/\bppi\b/,/producer price/],[/core/,/services/,/import/,/export/,/input/,/\bex[\s-]/,/\btrade\b/]),
  'Core PPI':mkIndMatcher([/core ppi/,/core producer price/]),
  'PCE':mkIndMatcher([/\bpce\b/],[/core/]),
  'Core PCE':mkIndMatcher([/core pce/]),
  // Services-Inflation = Dienstleistungs-ERZEUGERPREISE (JPY: SPPI / Corporate
  // Services Price Index) - bewusst NICHT der Services-PMI.
  'Services Inflation':mkIndMatcher([/\bsppi\b/,/corporate services price/,/services producer price/]),
  'Unemployment Claims':mkIndMatcher([/unemployment claims/,/jobless claims/,/claimant count/],[/continuing/,/4-week|average/]),
  // NFP / Beschaeftigungsaenderung: "Non Farm" MIT Leerzeichen korrekt erfassen
  // ("non-?farm" verfehlte das); Unemployment-/ADP-/Teilzeit-Varianten raus.
  // ⚠ 2026-10-07: "non farm" traf auch "Nonfarm Productivity QoQ Prel" - die
  // Next-Spalte zeigte NFP deshalb als BESTAETIGTEN Termin am 05.11. (der
  // Produktivitaets-Release) statt am 06.11. Ebenso die jaehrliche Benchmark-
  // Revision ("Non Farm Payrolls Annual Revision Prel" / "Prelim Benchmark
  // Payrolls Revision", 28.08.: -911K Vorwert) und Teilreihen desselben
  // Releases mit eigenem Wert (Private/Manufacturing/Government Payrolls,
  // GBP "HMRC Payrolls Change").
  'NFP / Employment Change':mkIndMatcher([/non[\s-]?farm/,/\bnfp\b/,/\bemployment change\b/,/payrolls/,/net employment/,/employment level/],[/adp/,/unemployment/,/full[\s-]?time/,/part[\s-]?time/,/change in/,/productivity/,/revision/,/benchmark/,/private/,/manufacturing payrolls/,/government payrolls/,/hmrc/]),
  'Unemployment Rate':mkIndMatcher([/unemployment rate/]),
  'ADP Employment':mkIndMatcher([/\badp\b/],[/weekly/]),
  'JOLTS Job Openings':mkIndMatcher([/jolts/,/job openings/,/job vacanc/],[/quits/]),
  // Lohnwachstum heisst in JEDEM Land anders - das Muster kannte bisher aber
  // faktisch nur die US-Reihe. Ergebnis (2026-08-08 an den echten
  // Kalendertiteln geprueft): GBP "Average Earnings incl. Bonus (3Mo/Yr)" und
  // JPY "Average Cash Earnings y/y" liefen ins Leere, obwohl beide Zeilen im
  // Kalender stehen - genau die zwei, die die App als veraltet meldet. Die
  // waehrungsspezifischen Muster spiegeln jetzt IND_DISPLAY_NAMES: GBP nimmt
  // ausdruecklich die Reihe INKLUSIVE Bonus (Forex Factory fuehrt beide, die
  // Headline ist incl.), CHF den Lohnindex, EUR die EZB-Tarifloehne, CAD die
  // Durchschnittsloehne aus der LFS. AUD (Wage Price Index) und NZD (Labour
  // Cost Index) waren ueber die generische Liste schon abgedeckt.
  'Avg Hourly Earnings':mkCcyIndMatcher(
    {GBP:/average earnings.*incl/,JPY:/average cash earnings/,CHF:/^wage index/,EUR:/negotiated wage/},
    [/average hourly earnings/,/avg hourly earnings/,/average hourly wages/,/wage price index/,/labou?r cost index/]
  ),
  // Economic Growth: GDP-Wachstum, Retail Sales, Manufacturing-/Services-PMI und
  // Consumer Confidence ziehen jetzt ebenfalls LIVE-Werte aus dem Kalender -
  // mit PRAEZISEN, ggf. waehrungsspezifischen Mustern, damit nicht ein falscher
  // Sub-Indikator erwischt wird (z.B. "GDP Price Index" statt GDP-Wachstum oder
  // eine nationale Teil-PMI statt der Eurozone-Aggregat-PMI).
  // ⚠ 2026-10-07: GBP "GDP 3-Month Avg" (monatlich, rollierend) ist nicht
  // die Quartalsreihe - 2 von 3 gemessenen Terminen lagen auf keinem
  // Release-Tag des Feeds. Ebenso Schaetzer/Teilgroessen (NIESR-Tracker,
  // US "GDP Sales").
  'GDP Growth QoQ':mkIndMatcher([/\bgdp\b/],[/price index/,/deflator/,/yoy/,/y\/y/,/\bmom\b/,/m\/m/,/3-month/,/niesr/,/tracker/,/sales/]),
  // Retail Sales: ueberall der m/m-Wert (monatliche Aenderung), NICHT y/y -
  // sonst wuerde bei Waehrungen, die im Kalender BEIDE Varianten melden, die
  // falsche (y/y) gezogen. Einzige Ausnahme: Schweiz (BFS) veroeffentlicht
  // Detailhandelsumsatz nur als y/y - dort gibt es gar keine m/m-Reihe, daher
  // bleibt y/y dort bewusst zugelassen.
  'Retail Sales':RETAIL_SALES_MATCHER,
  // PMI: USA = ISM (Headline) statt S&P-Global-Flash; Eurozone = das Aggregat
  // (kein deutsches/franzoesisches Flash, das ebenfalls als "EUR" getaggt ist).
  //
  // ⚠ Bugfix 2026-08-08 (Nutzer: die veralteten Indikatoren werden an der
  // Quelle sehr wohl aktualisiert): das EUR-Muster war so eng verankert, dass
  // es die Eurozone-Reihe selbst nicht mehr traf. Forex Factory nennt sie
  // "Final Manufacturing PMI" bzw. "Final Services PMI" - "final " stand
  // aber nicht in der Praefix-Liste, also matchte NICHTS: weder das Aggregat
  // (versehentlich) noch die nationalen Varianten (korrekt). Per Test gegen
  // die echten Kalendertitel bestaetigt - EUR war die EINZIGE Waehrung mit
  // null Treffern, alle anderen liefen ueber das generische Muster.
  // Die Verankerung bleibt, sie ist der eigentliche Zweck: "German Final
  // Manufacturing PMI" und die spanische/italienische/franzoesische Reihe
  // tragen alle ebenfalls die Kennung EUR und muessen draussen bleiben.
  'Manufacturing PMI':mkCcyIndMatcher(
    {USD:/ism manufacturing pmi/,EUR:/^(flash |final |s&p global |hcob )*manufacturing pmi( flash| final)?$/},
    [/manufacturing pmi/]
  ),
  'Services PMI':mkCcyIndMatcher(
    {USD:/ism (services|non-?manufacturing) pmi/,EUR:/^(flash |final |s&p global |hcob )*services pmi( flash| final)?$/,CAD:/ivey/},
    [/services pmi/,/non-?manufacturing pmi/]
  ),
  // ⚠ USD seit 2026-10-07 nur die Conference-Board-Reihe: der Indikator-Feed
  // fuehrt sie ausdruecklich (RULES "Consumer Confidence": nicht Michigan),
  // das breite Muster traf aber auch die fuenf Michigan-Titel ("Michigan
  // Consumer Sentiment Prel/Final", "Prelim/Revised UoM Consumer Sentiment",
  // FXStreet "UoM Consumer Sentiment") - 0 von 12 gemessenen Michigan-
  // Terminen lagen auf einem Release-Tag der Reihe. Die Next-Spalte zeigte
  // deshalb "2d" (Michigan am 09.10.) statt des CB-Termins.
  // AUD/NZD: die Westpac-Reihe wie im Feed (nicht ANZ-Roy Morgan); AUD ohne
  // die "Change"-Zeile, die TradingView zum selben Termin fuehrt (Prozent-
  // aenderung statt Indexstand).
  'Consumer Confidence':mkCcyIndMatcher(
    {EUR:/^consumer confidence(\s+flash)?$/,USD:/^(cb )?consumer confidence$|conference board/,
     AUD:/^westpac consumer (confidence|sentiment)( index)?$/,NZD:/westpac/},
    [/consumer confidence/,/consumer sentiment/,/consumer climate/]
  ),
  // Umfragen (2026-08-20). ZEW fuehrt der Kalender doppelt - als Eurozone-
  // Aggregat und als "German ZEW ..."; nach der bestehenden Regel gewinnt
  // das Aggregat, das German-Praefix bleibt draussen. Ifo gibt es nur
  // deutsch, das ist die Natur der Reihe.
  'ZEW Economic Sentiment':(n,c)=>c==='EUR'&&/zew economic sentiment/.test((n||'').toLowerCase())&&!/^german|current conditions/.test((n||'').toLowerCase()),
  'Ifo Business Climate':(n,c)=>c==='EUR'&&/ifo business climate/.test((n||'').toLowerCase()),
  // Michigan (FF "UoM"), 1 Jahr - wie im Indikator-Feed. Nicht die Cleveland-
  // Fed-Schaetzung und nicht die NY-Fed-Umfrage (eigene Reihen, eigene Tage).
  'Inflation Expectations':(n,c)=>c==='USD'&&/inflation expectation/.test((n||'').toLowerCase())&&/\buom\b|michigan/.test((n||'').toLowerCase())&&!/5|long/.test((n||'').toLowerCase()),
};

// Nationale Releases unter EUR ("German …", "French …"): die EUR-Indikatoren
// sind Eurozonen-Aggregate, die Muster treffen die nationalen Vorab-Zahlen
// aber mit (gemessen 2026-10-06: "CPI (Headline)" zeigte 24d - die Landes-
// Inflationszahlen am 30.10. - statt 29d, den Eurozonen-Flash am 04.11.). Ifo
// gibt es nur deutsch - dort IST der nationale Release der Indikator.
const EU_LAND_RE=/^(german|french|italian|spanish|dutch|belgian|austrian|irish|portuguese|greek|finnish)\b/i;
const EU_NUR_NATIONAL=new Set(['Ifo Business Climate']);
// ⚠ Seit 2026-10-07 gilt das fuer TERMIN UND WERT (Nutzer-Entscheidung auf
// Rueckfrage: "Ja, nur Eurozone"). Bis dahin filterte nur findIndNextEvent
// (js/main.js) die Landeszahlen heraus; findIndEventHistory (Wert),
// indAwaitingEvent (js/score.js), applyResearchToCal und die Lueckenfueller
// des Kalender-Workflows sahen sie weiter. Deshalb sitzt die Regel jetzt
// HIER, im Muster selbst - jeder Verbraucher bekommt sie, auch kuenftige.
// Aufgerufen ohne Waehrung (isScoreDrivingEvent) greift sie nicht.
function nurEurozone(base,m){
  if(EU_NUR_NATIONAL.has(base))return m;
  return (name,ccy)=>!(ccy==='EUR'&&EU_LAND_RE.test(name||''))&&m(name,ccy);
}
Object.keys(IND_EVENT_MATCHERS).forEach(k=>{IND_EVENT_MATCHERS[k]=nurEurozone(k,IND_EVENT_MATCHERS[k]);});

// Recherche-Daten → Kalender (applyResearchToCal in js/main.js) nutzt
// dieselben Muster, mit drei bewusst breiteren Ueberschreibungen.
const CAL_RESEARCH_MATCHERS={
  ...IND_EVENT_MATCHERS,
  'GDP Growth QoQ':nurEurozone('GDP Growth QoQ',mkIndMatcher([/\bgdp\b/])),
  'Manufacturing PMI':nurEurozone('Manufacturing PMI',mkIndMatcher([/manufacturing pmi/])),
  'Services PMI':nurEurozone('Services PMI',mkIndMatcher([/services pmi/,/non-manufacturing pmi/,/ivey/])),
  // Retail Sales: bewusst KEIN eigener, loserer Override hier - die geerbte
  // RETAIL_SALES_MATCHER-Regel (m/m bevorzugen, y/y ausschliessen ausser CHF)
  // aus IND_EVENT_MATCHERS soll auch beim Seed-Daten-Matching gelten.
};
// Ein Event "treibt den Score", wenn sein Name zu einem der getrackten
// Indikatoren passt (Zins/Inflation/Arbeitsmarkt/Wachstum). Solche Events
// werden ueberall als High-Impact behandelt - egal was die Quelle (FF) sagt.
function isScoreDrivingEvent(ev){
  if(!ev||!ev.name)return false;
  return Object.values(CAL_RESEARCH_MATCHERS).some(m=>m(ev.name));
}

// Zeitraum eines Kalendertitels ("CPI y/y" -> 'Y/Y'). Mit ihm filtert die App
// beim Suchen nach Wert und naechstem Termin auf die richtige Reihe
// (findIndEventHistory/findIndNextEvent); der Kalender-Workflow erkennt damit
// die m/m-/y/y-Geschwister desselben Releases (tools/kalender-vorschau.mjs).
function periodLabel(tag){
  const t=(tag||'').toLowerCase();
  if(/y\/y|yoy/.test(t))return'Y/Y';
  if(/m\/m|mom/.test(t))return'M/M';
  if(/q\/q|qoq/.test(t))return'Q/Q';
  return null;
}

export {mkIndMatcher,mkCcyIndMatcher,RETAIL_SALES_MATCHER,IND_EVENT_MATCHERS,CAL_RESEARCH_MATCHERS,isScoreDrivingEvent,periodLabel,EU_LAND_RE,EU_NUR_NATIONAL};
