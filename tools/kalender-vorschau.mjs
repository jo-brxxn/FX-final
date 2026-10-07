// ── KALENDER-VORSCHAU: FXStreet-Termine hinter dem Ende von TradingView ──
// Nutzer 2026-10-06: "ich will das immer der Kalender schon fuer die
// kommenden 3 Monate geladen wird" (per Rueckfrage: High/Medium +
// Score-Indikatoren). Gemessen am 2026-10-06 mit
// .github/workflows/probe-calendar-horizon.yml (Laeufe 1-3):
//   - TradingView liefert nur bis rund heute+30 Tage (Anfrage bis +92,
//     letzte Zeit 2026-11-05 23:30 UTC; Abschnitte +60..+92 leer).
//   - FXStreets oeffentliche API liefert NUR High-Termine (295 von 295, auch
//     mit volatilities=NONE,LOW,MEDIUM,HIGH), die aber bis ueber +95 Tage:
//     Nov 86, Dez 101, Jan (bis zum 09.) 28.
//   - FF-Webseite (Monatsansicht) Cloudflare-gesperrt, Investing.com 3 Bytes,
//     Trading-Economics-Gastzugang eingestellt.
// Deshalb: TradingView (High + Medium) bis zu seinem Ende, dahinter nur
// FXStreet (High) bis heute+92 Tage. Medium-Termine fuer Monat 2-3 gibt es
// aus keiner erreichbaren Quelle.
//
// Diese Datei laedt der Kalender-Workflow (update-ff-calendar.yml) UND
// check/kalendervorschau.js - so prueft der Waechter genau den Code, der
// laeuft. Kein Browser-Bezug.
import {IND_EVENT_MATCHERS,isScoreDrivingEvent} from '../js/event-matchers.js';

// Waehrungen, die der Kalender fuehrt (wie TV2CCY im Workflow).
export const FXS_CCY = new Set(['USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF','CNY']);
// FXStreet nennt das Land im countryCode, nicht im Namen. Die Eurozone heisst
// "EMU"; nationale Releases bekommen das Adjektiv wie bei TradingView (sonst
// stuende die deutsche Inflation unter EUR als Eurozonen-Inflation).
const VORSATZ = {DE:'German ',FR:'French ',IT:'Italian ',ES:'Spanish '};

// FXStreet-Namen auf die Schreibweise des Forex-Factory-Feeds bringen. Zwei
// Gruende: (1) die Indikator-Muster der App (js/event-matchers.js) sind auf
// FF-/TradingView-Titel geschrieben - "Consumer Price Index (YoY)" trifft
// das CPI-Muster nicht, "CPI y/y" schon; (2) im Kalender soll derselbe
// Release nicht je nach Quelle anders heissen.
const ERSETZEN = [
  [/^Nonfarm Payrolls$/i,'Non-Farm Employment Change'],
  [/^ADP Employment Change$/i,'ADP Non-Farm Employment Change'],
  [/^Net Change in Employment$/i,'Employment Change'],
  [/^Employment Change s\.a\.$/i,'Employment Change'],
  [/^Unemployment Rate s\.a\.$/i,'Unemployment Rate'],
  [/^ILO Unemployment Rate \(3M\)$/i,'Unemployment Rate'],
  [/^Michigan Consumer Sentiment Index$/i,'UoM Consumer Sentiment'],
  [/^ECB Main Refinancing Operations Rate$/i,'Main Refinancing Rate'],
  [/^Tankan Large Manufacturing Index$/i,'Tankan Manufacturing Index'],
  [/^BoE MPC Vote Rate (?:Cut|Hike|Unchanged)$/i,'MPC Official Bank Rate Votes'],
  [/Consumer Price Index ex Food & Energy/i,'Core CPI'],
  [/^Core Consumer Price Index/i,'Core CPI'],
  [/^BoC Consumer Price Index Core/i,'BoC Core CPI'],
  [/Core Harmonized Index of Consumer Prices/i,'Core CPI'],
  [/Producer Price Index ex Food & Energy/i,'Core PPI'],
  [/Producer Price Index/i,'PPI'],
  [/Core Personal Consumption Expenditures - Price Index/i,'Core PCE Price Index'],
  [/Personal Consumption Expenditures - Price Index/i,'PCE Price Index'],
  [/^Gross Domestic Product Annualized$/i,'GDP q/q'],
  [/Gross Domestic Product Price Index/i,'GDP Price Index'],
  [/Gross Domestic Product(?: s\.a\.)?/i,'GDP'],
  [/Consumer Price Index/i,'CPI'],
  [/^Trade Balance \(MoM\)$/i,'Trade Balance'],
];
export function fxsTitel(e){
  let n = String((e && e.name) || '').trim();
  if (!n) return null;
  // Die fuenf "Interest Rate Projections - …"-Zeilen sind Unterzeilen der
  // FOMC-Projektionen (FF fuehrt nur "FOMC Economic Projections").
  if (/^interest rate projections\b/i.test(n)) return null;
  // Eurozonen-HICP ist bei FF schlicht "CPI"; die deutsche HICP-Reihe bleibt
  // HICP, sonst stuende sie doppelt neben der nationalen CPI desselben Tages.
  if (/^Harmonized Index of Consumer Prices/i.test(n)) n = n.replace(/^Harmonized Index of Consumer Prices/i, e.countryCode === 'EMU' ? 'CPI' : 'HICP');
  for (const [re, zu] of ERSETZEN) n = n.replace(re, zu);
  n = n.replace(/\s*\(MoM\)/i,' m/m').replace(/\s*\(YoY\)/i,' y/y').replace(/\s*\(QoQ\)/i,' q/q').replace(/\s*\(3M\)/i,' 3m/3m')
    .replace(/\s+/g,' ').trim();
  return (VORSATZ[e.countryCode] || '') + n;
}

// Kommt der FXStreet-Termin in den Kalender? Nur High (FXStreet liefert
// ohnehin nichts anderes), nur gefuehrte Waehrungen, keine Projektions-
// Unterzeilen. "Tentative" heisst bei FXStreet: die UHRZEIT steht nicht fest
// (BoJ-Entscheid um "03:00" UTC). Solche Termine nur, wenn sie einen
// Score-Indikator treffen - das Datum des BoJ-Entscheids ist veroeffentlicht,
// eine vorlaeufige Rede dagegen ist keine Auskunft (CLAUDE.md Regel 4).
export function fxsAufnehmen(e){
  if (!e || String(e.volatility || '').toUpperCase() !== 'HIGH') return false;
  if (!FXS_CCY.has(e.currencyCode)) return false;
  const titel = fxsTitel(e);
  if (!titel) return false;
  if (e.isTentative && !isScoreDrivingEvent({name: titel})) return false;
  return true;
}

// Fuer Log und Waechter: welche Score-Indikatoren trifft ein Titel in seiner
// Waehrung? (dieselben Muster, mit denen die App den naechsten Termin sucht)
export function indikatorTreffer(titel, ccy){
  return Object.keys(IND_EVENT_MATCHERS).filter(k => IND_EVENT_MATCHERS[k](titel, ccy));
}

// Lueckenfueller INNERHALB des TradingView-Fensters (2026-10-06): TradingView
// fuehrt manche Score-Releases nur als "Low", und Low-Termine nimmt der
// Workflow bewusst nicht auf. FXStreet fuehrt denselben Release als High.
// Gemessen: GBP Claimant Count Change (TV Low, kein High-/Medium-Termin
// desselben Releases) - ohne Lueckenfueller fand die Next-Spalte erst den
// FXStreet-Termin hinter dem TV-Ende, einen Monat zu spaet. (Der andere Fall,
// US Core PPI y/y mit "Core PPI MoM" als Medium am selben Tag, wird in der
// App geloest: findIndNextEvent zaehlt m/m und y/y als denselben Termin.)
// Aufgenommen wird ein FXStreet-Termin im TV-Fenster deshalb nur, wenn er
// einen Score-Indikator seiner Waehrung trifft UND kein vorhandener Termin
// derselben Waehrung im Abstand von hoechstens 36 Stunden denselben Indikator
// trifft (sonst stuende derselbe Release doppelt da, einmal mit FF-/TV- und
// einmal mit FXStreet-Namen).
export function fuelltLuecke(kandidat, vorhandene){
  const treffer = indikatorTreffer(kandidat.title, kandidat.country);
  if (!treffer.length) return false;
  const t = Date.parse(kandidat.date);
  // Ein nationaler Release ("French Inflation Rate …") deckt den Eurozonen-
  // Termin nicht ab: seit 2026-10-07 schliesst das Muster selbst die
  // Landeszahlen unter EUR aus (nurEurozone in js/event-matchers.js), sie
  // treffen den Indikator also gar nicht erst.
  return !vorhandene.some(ev => {
    if (ev.country !== kandidat.country) return false;
    const d = Math.abs(Date.parse(ev.date) - t);
    if (!(d <= 36 * 3600e3)) return false;
    return treffer.some(k => IND_EVENT_MATCHERS[k](ev.title, kandidat.country));
  });
}
