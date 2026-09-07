// ── WARTEN, BIS DIE LIVE-DATEN WIRKLICH DA SIND ───────────────────
// Gemeinsames Warte-Signal fuer alle Waechter, die ZAHLEN des FX Analyst Pro
// lesen (Scores im DOM, Score-Rechenkette, Diff gegen die Vergleichsbasis,
// Kartentexte).
//
// ⚠ Warum das noetig wurde (Messung 2026-09-07, VERSION-CHECK-485):
// `check/display.js` fiel im vollen Lauf mit EINEM Treffer aus
// (NAS dom=+0.2 soll=+0.1), war allein und wiederholt aber gruen. Nachgemessen
// wurde der Startverlauf im 250-ms-Raster:
//
//     t= 645ms : ALLE 24 Assets weichen ab (Nav dom=-1.1 / soll=+0.6 usw.)
//     t=1349ms : 0 Abweichungen - und ab da dauerhaft 0
//     alle acht Feeds in DATA_LIVE_OK beantwortet nach 2383ms (Leerlauf)
//
// Die Leiste wird also EINMAL vor den Live-Feeds gezeichnet und danach neu.
// Das ist kein App-Fehler - aber die Waechter warteten stur eine feste Zeit
// (display 5000ms, score 4500ms, scorediff/summarydiff je 5000ms). Laeuft der
// Browser unter Last (die Waechter laufen nacheinander auf derselben CPU),
// rutscht das Ende der Feeds ueber diese Frist hinaus, und der Waechter misst
// mitten in den Startvorgang hinein. Ergebnis: rote Laeufe ohne echten Fehler
// - genau die Sorte Rauschen, die dazu fuehrt, dass man rote Laeufe irgendwann
// nicht mehr ernst nimmt.
//
// Statt die feste Frist zu erhoehen (das verschiebt das Problem nur und macht
// jeden Lauf langsamer) wird hier auf das ECHTE Fertig-Signal gewartet: jeder
// der acht Feeds hat geantwortet - egal ob mit Daten (true) oder mit einem
// Fehlschlag (false) - und danach laeuft eine kurze Frist fuer das
// Neuzeichnen. Nach diesem Punkt ist eine abweichende Zahl ein echter Fund,
// der Waechter wird also SCHAERFER, nicht weicher.
//
// Faellt das Signal aus (alte Vergleichsbasis ohne DATA_LIVE_OK, kaputter
// Boot), wird nicht endlos gewartet: nach `timeout` geht es mit der alten
// festen Frist weiter, damit ein Waechter nie haengt.

// Muss die Feed-Schluessel aus js/main.js + js/data-feeds.js spiegeln.
const FEEDS = ['ind', 'bond', 'price', 'cot', 'sentiment', 'news', 'risk', 'calendar'];

async function wartenBisDatenDa(page, opt) {
  const o = opt || {};
  const timeout = o.timeout || 30000;
  const nachlauf = o.nachlauf == null ? 1500 : o.nachlauf;
  let signal = true;
  try {
    await page.waitForFunction(
      f => typeof DATA_LIVE_OK !== 'undefined' && f.every(k => k in DATA_LIVE_OK),
      FEEDS, { timeout });
  } catch (e) { signal = false; }
  await page.waitForTimeout(signal ? nachlauf : Math.max(nachlauf, 5000));
  return signal;
}

module.exports = { wartenBisDatenDa, FEEDS };
