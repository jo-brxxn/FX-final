// ── WIE GROSS DARF EIN LIVE-FEED WERDEN? ──────────────────────────
// Anlass (Nutzer 2026-09-14, mit zwei Bildschirmfotos vom iPad): "da fehlen
// Charts". Die S&P-500-Kachel meldete "No daily series for this window yet"
// und der PRICE-Streifen zeigte vier Striche - beides, obwohl drei Jahre
// Historie in der Datei stehen.
//
// GEMESSENE URSACHE: mein eigener OHLC-Backfill vom 13.09. hat
// price_data.json von 512 auf 1299 KB gebracht, Faktor 2,53 - und damit die
// 8-Sekunden-Frist des Browsers gerissen. Per Playwright wortgleich
// reproduziert, indem der Abruf ueber die Frist hinaus verzoegert wurde:
// dieselbe Meldung, dieselben vier Striche.
//
// ⚠ DIE FEHLERKLASSE ist nicht "price_data.json ist zu gross", sondern:
// ein Datei-schreibender Workflow kann eine Datei jederzeit so aufblaehen,
// dass sie beim Nutzer nicht mehr ankommt - und das sieht nicht nach einem
// Fehler aus, sondern nach fehlenden Daten. Niemand merkt es am Code-Diff.
// Deshalb hier ein harter Deckel je Datei, und zwar SPUERBAR unter dem, was
// die Frist bei einer langsamen Leitung noch traegt.
//
// Rechnung fuer den Deckel: eine schlechte Mobilverbindung schafft rund
// 200 KB/s nutzbar. Bei FEED_TIMEOUT_MS (20 s) waeren das theoretisch 4 MB -
// aber die Feeds laufen PARALLEL (bootFetchScoreFeeds holt fuenf auf einmal),
// teilen sich die Leitung also. Der Deckel liegt deshalb bei 900 KB je Datei
// und 3500 KB fuer alles zusammen.
//
// Geprueft wird zusaetzlich:
//   • keine Einrueckung in den grossen Dateien (waren 400 KB Leerzeichen)
//   • kein Gleitkomma-Rauschen in Open/High/Low (waren 34400 Felder mit
//     17 Stellen fuer zwei sinnvolle)
//   • jeder Docht umschliesst seinen Koerper (Runden darf das nicht brechen)
//   • alle Abrufstellen nutzen DIESELBE Frist-Konstante statt eigener Zahlen
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const DECKEL_KB = 900;
const GESAMT_KB = 3500;
// Die Live-Dateien, die der Browser beim Start holt. Muss die DATA_BASE-
// Abrufe in js/main.js + js/data-feeds.js spiegeln.
const FEEDS = ['ind_data.json', 'bond_data.json', 'price_data.json', 'cot_data.json',
  'sentiment_data.json', 'news_data.json', 'news_ai.json', 'risk_index.json',
  'ff_calendar.json', 'score_hist.json', 'seasonality_data.json', 'rate_probabilities.json',
  // seit 2026-09-25: 4H-Trend, TradingView-Historien, lange Kurshistorie (bei Bedarf geladen)
  'trend_data.json', 'tvecon_data.json', 'price_hist.json'];

const F = [];
const fail = (t, x) => F.push(`${t}: ${x}`);

let gesamt = 0;
const zeilen = [];
FEEDS.forEach(n => {
  const p = path.join(ROOT, n);
  if (!fs.existsSync(p)) { zeilen.push(`${n}: fehlt`); return; }
  const kb = fs.statSync(p).size / 1024;
  gesamt += kb;
  zeilen.push(`${n} ${kb.toFixed(0)}KB`);
  if (kb > DECKEL_KB) fail('ZU GROSS',
    `${n} ist ${kb.toFixed(1)} KB, erlaubt sind ${DECKEL_KB}. Eine Datei, die beim Nutzer nicht mehr ankommt, sieht aus wie fehlende Daten, nicht wie ein Fehler - genau der am 2026-09-14 gemeldete Bug.`);
  // Einrueckung: die grossen Feeds werden von Workflows geschrieben und
  // gehoeren minifiziert. 5% Toleranz fuer die kleinen.
  if (kb > 200) {
    const roh = fs.readFileSync(p, 'utf8');
    const anteil = ((roh.match(/\n {2,}/g) || []).length) / Math.max(1, roh.length / 100);
    if (roh.split('\n').length > 50 && anteil > 0.05) {
      const min = JSON.stringify(JSON.parse(roh)).length;
      const spar = 100 - min / roh.length * 100;
      if (spar > 12) fail('EINGERUECKT GESCHRIEBEN',
        `${n} waere minifiziert ${spar.toFixed(1)}% kleiner (${(roh.length / 1024).toFixed(0)} -> ${(min / 1024).toFixed(0)} KB). Der schreibende Workflow gehoert auf JSON.stringify(obj) ohne Einrueckung umgestellt.`);
    }
  }
});
if (gesamt > GESAMT_KB) fail('ZUSAMMEN ZU GROSS',
  `alle Live-Feeds zusammen ${gesamt.toFixed(0)} KB, erlaubt sind ${GESAMT_KB}. Sie werden beim Start parallel geholt und teilen sich die Leitung.`);

// ── Gleitkomma-Rauschen und Docht-Geometrie in price_data.json ─────────
let kerzen = 0, dochte = 0;
try {
  const pd = JSON.parse(fs.readFileSync(path.join(ROOT, 'price_data.json'), 'utf8'));
  let lang = 0, kaputt = 0, beispielL = '', beispielK = '';
  Object.keys(pd).forEach(id => {
    const s = pd[id] && pd[id].series;
    if (!Array.isArray(s)) return;
    s.forEach(e => {
      if (!Array.isArray(e) || e.length < 5) return;
      kerzen++;
      const [d, c, o, h, l] = e;
      if (h > Math.max(o, c) || l < Math.min(o, c)) dochte++;
      // Mehr als 7 signifikante Stellen in O/H/L ist Quell-Rauschen, kein Kurs.
      // ⚠ AUSSER der Wert IST der Schlusskurs: Hoch und Tief werden auf den
      // Koerper geklemmt, und der Schluss wird bewusst nicht gerundet (er
      // haengt an Score, Performance und Korrelationen). Ein geklemmter Docht
      // erbt dann dessen Darstellung - gemessen 61 Faelle, alle harmlos. Ohne
      // diese Ausnahme meldet der Waechter einen Fehler, den es nicht gibt.
      [o, h, l].forEach(v => {
        if (typeof v !== 'number' || v === c) return;
        if (String(v).replace(/[-.]/g, '').replace(/^0+/, '').length > 8) {
          lang++; if (!beispielL) beispielL = `${id} ${d} ${v}`;
        }
      });
      if ((h < Math.max(o, c) - 1e-12 || l > Math.min(o, c) + 1e-12) && !beispielK) beispielK = `${id} ${d} o=${o} c=${c} h=${h} l=${l}`;
      if (h < Math.max(o, c) - 1e-12 || l > Math.min(o, c) + 1e-12) kaputt++;
    });
  });
  if (lang > 20) fail('GLEITKOMMA-RAUSCHEN',
    `${lang} Open/High/Low-Felder tragen mehr als 8 signifikante Stellen (z.B. ${beispielL}). Yahoo liefert 102.01000213623047 fuer einen Wert mit zwei sinnvollen Stellen - das hat die Datei am 13.09. verdoppelt. Der schreibende Workflow gehoert auf toPrecision(7) umgestellt.`);
  if (kaputt) fail('DOCHT AUSSERHALB DES KOERPERS',
    `${kaputt} Kerzen haben ein Hoch unter oder ein Tief ueber ihrem Koerper (z.B. ${beispielK}). Nach dem Runden von O/H/L muss wieder auf den Schluss geklemmt werden.`);
} catch (e) { fail('PRICE_DATA UNLESBAR', e.message); }

// ── Eine Frist, nicht zwoelf ───────────────────────────────────────────
// Vor dem 2026-09-14 stand an jeder Abrufstelle eine eigene 8000. Wer die
// Frist anpasst, uebersieht dann elf Stellen.
['js/main.js', 'js/data-feeds.js'].forEach(f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const treffer = [...s.matchAll(/DATA_BASE\s*\+\s*'([a-z_]+\.json)[\s\S]{0,140}?AbortSignal\.timeout\(([^)]+)\)/g)];
  treffer.forEach(m => {
    if (m[2].trim() !== 'FEED_TIMEOUT_MS') fail('EIGENE FRIST',
      `${f}: der Abruf von ${m[1]} benutzt AbortSignal.timeout(${m[2]}) statt der gemeinsamen Konstante FEED_TIMEOUT_MS.`);
  });
  if (f === 'js/main.js') {
    const m = s.match(/const FEED_TIMEOUT_MS\s*=\s*(\d+)/);
    if (!m) fail('KEINE FRIST-KONSTANTE', 'FEED_TIMEOUT_MS ist in js/main.js nicht definiert.');
    else if (Number(m[1]) < 12000) fail('FRIST ZU KNAPP',
      `FEED_TIMEOUT_MS steht auf ${m[1]} ms. Bei der groessten Datei (${(Math.max(...FEEDS.map(n => { const p = path.join(ROOT, n); return fs.existsSync(p) ? fs.statSync(p).size : 0; })) / 1024).toFixed(0)} KB) und einer langsamen Leitung sieht das wie ein Datenausfall aus.`);
  }
});

if (F.length) {
  console.error('FEED-GROESSE NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
  process.exit(1);
}
console.log(`[feedgroesse] ok (${FEEDS.length} Feeds, zusammen ${gesamt.toFixed(0)}/${GESAMT_KB} KB, groesste `
  + `${Math.max(...FEEDS.map(n => { const p = path.join(ROOT, n); return fs.existsSync(p) ? fs.statSync(p).size / 1024 : 0; })).toFixed(0)}/${DECKEL_KB} KB; `
  + `${kerzen} Kerzen mit O/H/L, ${dochte} mit echtem Docht, 0 ausserhalb des Koerpers; eine Frist fuer alle Abrufe)`);
