#!/usr/bin/env node
// ── SCORE-DIFF GEGEN DIE VERGLEICHSBASIS ──────────────────────────
// Rendert den Stand der Vergleichsbasis (origin/main) UND den Arbeitsbaum in
// demselben Browser mit denselben Daten und vergleicht jeden Score Zahl fuer
// Zahl. Ergebnis: eine belastbare Antwort auf die Frage, die `rules.js` bisher
// nur RATEN konnte - hat sich die Score-Rechnung wirklich geaendert?
//
// Warum das noetig wurde (2026-08-23): rules.js verlangt einen
// SCORE_MODEL_VERSION-Bump, sobald eine Funktion der Score-Flaeche im Diff
// auftaucht. Die Begruendung dort lautet "sonst vergleichen History, Trends
// und die Staerke-Note zwei verschiedene Rechnungen" - und die betreffen
// ALLE den SYMBOL-Score, denn nur der liegt in scoreHist. Beim Carry-Fix
// wurden pairCarryAdj/actualColor angefasst, die Symbol-Scores blieben aber
// nachweislich auf die Nachkommastelle identisch (0 von 16 veraendert, 0 von
// 96 Karten). Ein Bump haette dann 35 aufgezeichnete Tage faelschlich als
// "aus einem frueheren Modell" markiert - schlimmer als kein Bump.
//
// Der Waechter ist damit STRENGER als die alte Regel, nicht laxer: vorher
// konnte man die Nummer hochzaehlen, ohne dass sich etwas aendert, oder die
// Rechnung aendern und die Nummer mitziehen, ohne dass je jemand nachrechnet.
// Jetzt wird nachgerechnet.
//
// Aufruf:  node check/scorediff.js [<basis-ref>]
// Ausgabe: schreibt zusaetzlich check/.scorediff.json, damit rules.js das
//          Ergebnis lesen kann, ohne selbst einen Browser zu starten.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);
const { wartenBisDatenDa, FEEDS } = require('./warten.js');

const BASE = process.argv[2] || process.env.CHECK_BASE || 'origin/main';
const URL_NEU = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const ERGEBNIS = path.join(__dirname, '.scorediff.json');

function schreibe(o) { try { fs.writeFileSync(ERGEBNIS, JSON.stringify(o, null, 1)); } catch (e) {} }

function basisVorhanden() {
  try { execSync('git rev-parse --verify ' + BASE, { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}
if (!basisVorhanden()) {
  console.log(`[scorediff] Basis "${BASE}" nicht vorhanden - uebersprungen.`);
  schreibe({ status: 'uebersprungen', grund: 'Basis fehlt', basis: BASE });
  process.exit(0);
}

// Der Basis-Stand wird in ein eigenes Verzeichnis gelegt und dort ausgeliefert.
// Die DATEN (*.json) kommen bewusst aus dem Arbeitsbaum: verglichen werden
// soll die RECHNUNG, nicht der Datenstand - sonst faende der Vergleich nur
// den stuendlichen Bot-Commit.
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'scorediff-'));
fs.writeFileSync(path.join(TMP, 'index.html'), execSync(`git show ${BASE}:index.html`,
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
// Seit der Modul-Aufteilung (2026-08-25, docs/module-split.md) laedt
// index.html Kategorie-Dateien per <script type="module" src="js/*.js">
// bzw. import - fehlen die am BASIS-Stand, bricht das Modul-Laden dort
// komplett ab (ES-Module sind fail-fast: ein 404 auf einen Import wirft,
// KEIN Top-Level-Name wird je definiert). Deshalb js/ GENAU WIE index.html
// aus BASE auschecken (nicht aus dem Arbeitsbaum wie die *.json-Daten - hier
// soll ja der alte CODE verglichen werden, nicht der neue mit alten Daten).
// Faellt bewusst NICHT auf, wenn js/ bei BASE noch gar nicht existierte
// (aelterer Stand vor der Modul-Aufteilung) - git ls-tree liefert dann
// einfach nichts.
try {
  const jsFiles = execSync(`git ls-tree -r --name-only ${BASE} -- js`, { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  // ⚠ Verzeichnis JE DATEI anlegen, nicht nur ein flaches js/: seit der
  // zweiten App liegen Module auch in js/rezept/ (2026-09-01). Ohne das
  // wirft der erste Schreibversuch in den Unterordner, der umschliessende
  // catch verschluckt es - und die DANACH folgenden Dateien (u.a. score.js)
  // fehlen im Basis-Stand. ES-Module sind fail-fast: ein einziger 404 auf
  // einen Import laesst KEINEN Top-Level-Namen entstehen, der Vergleich
  // stirbt mit "syms is not defined" statt mit einer nuetzlichen Meldung.
  jsFiles.forEach(f => {
    const ziel = path.join(TMP, f);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, execSync(`git show ${BASE}:${f}`,
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  });
} catch (e) {}
fs.readdirSync('.').filter(f => f.endsWith('.json') || f === 'sw.js')
  .forEach(f => { try { fs.copyFileSync(f, path.join(TMP, f)); } catch (e) {} });

const PORT_ALT = +(process.env.CHECK_PORT || 8935) + 1;
const srv = http.createServer((req, res) => {
  // ⚠ Vorher path.basename(name) - das strippt Unterordner (js/main.js ->
  // main.js) und lieferte VOR dieser Korrektur beim erstenmal ein 404 auf
  // den js/constants.js-Import, wodurch das Modul fail-fast abbrach und JEDE
  // Top-Level-Variable (u.a. syms) undefiniert blieb - genau der Bug, der
  // diese ganze js/-Kopie hier erst noetig gemacht hat. path.normalize()
  // erhaelt die Unterordner, verhindert aber "..".
  const name = decodeURIComponent(String(req.url).split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const p = path.join(TMP, path.normalize(name).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    // ⚠ .js MUSS als JavaScript-MIME ausgeliefert werden - Chrome verweigert
    // <script type="module" src="..."> sonst hart ("Expected a JavaScript
    // module script but the server responded with a MIME type of
    // text/html"), das Modul laedt gar nicht erst.
    const ct = /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(buf);
  });
});

const ERFASSEN = () => {
  const o = { sym: {}, symRaw: {}, rub: {}, staerke: {}, pair: {}, carry: {} };
  syms.forEach(s => {
    o.sym[s.id] = symScoreCmp(s);
    o.symRaw[s.id] = symScore(s);
    try { o.staerke[s.id] = typeof symStrength10 === 'function' ? symStrength10(s.id) : null; } catch (e) { o.staerke[s.id] = 'ERR'; }
    (s.rubrics || []).forEach(r => { o.rub[s.id + '|' + r.name] = Math.round(rubScore(r) * 100) / 100; });
  });
  (typeof ALL_PAIRS !== 'undefined' ? ALL_PAIRS : []).forEach(n => {
    o.pair[n] = pairScore(n);
    o.carry[n] = typeof pairCarryAdj === 'function' ? pairCarryAdj(n) : 0;
  });
  // Welche Live-Feeds auf DIESER Seite wirklich Daten geliefert haben - siehe
  // die Begruendung an `feedSig` weiter unten.
  o.__feeds = (typeof DATA_LIVE_OK !== 'undefined') ? Object.assign({}, DATA_LIVE_OK) : null;
  return o;
};

(async () => {
  await new Promise(r => srv.listen(PORT_ALT, '127.0.0.1', r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {} });
  // ⚠ BEIDE Modi erfassen. Bis 2026-09-08 setzte dieser Waechter den Modus
  // gar nicht und mass damit nur den Standard - der normalisierte Modus
  // (indNormFactor mit Surprise/Age/Markt-Gewicht) war komplett blind.
  // Aufgefallen, als die Age-Ausnahme fuer COT/Risk/Renditen eingebaut wurde:
  // scorediff meldete "an keiner Stelle veraendert", obwohl die Rechnung fuer
  // 181 Indikator-Instanzen nachweislich eine andere ist - sie wirkt eben nur
  // im normalisierten Modus. Ein Diff-Waechter, der die Haelfte des Modells
  // nicht ansieht, beantwortet die Frage nicht, fuer die es ihn gibt.
  const ladenModus = async (url, modus) => {
    // ⚠ Der Modus muss im localStorage DERSELBEN Herkunft stehen, die ihn
    // liest. Hier stand das Setzen VOR dem goto - es lief damit noch auf der
    // zuvor geladenen Seite. Basis und Arbeitsbaum liegen auf verschiedenen
    // Ports und haben getrennte Speicher; in der alten Reihenfolge (zwei
    // Ladevorgaenge je Herkunft hintereinander) ging das zufaellig auf, bei
    // wechselnder Herkunft landet der Schalter zuverlaessig am falschen Ort.
    // Gemessen 2026-09-18: 113 gemeldete Unterschiede, alle im Modus
    // "normalized", bei voellig identischem Code auf beiden Seiten.
    // Deshalb: erst hin, dann setzen, dann neu laden.
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.evaluate(m => { try { localStorage.setItem('fxpro_score_mode', m); } catch (e) {} }, modus);
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.evaluate(() => { ['introOv','lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
    await wartenBisDatenDa(p);   // statt fester Frist - siehe check/warten.js
    return p.evaluate(ERFASSEN);
  };
  // ⚠ WARUM DER FEED-AUSGANG MITGEMESSEN WIRD (Messung 2026-09-18).
  // Die beiden Staende werden als ZWEI getrennte Seiten geladen und holen sich
  // die acht Live-Feeds JE FUER SICH. `wartenBisDatenDa` wartet nur darauf,
  // dass jeder Feed GEANTWORTET hat - ein Fehlschlag (false) zaehlt dabei
  // ausdruecklich als Antwort. Liefert ein Feed also auf der einen Seite Daten
  // und auf der anderen nicht, sind die Scores voellig zu Recht verschieden -
  // und dieser Waechter meldete das bis heute als "die Score-Formel wurde
  // geaendert". Gemessen: derselbe Arbeitsbaum ergab im vollen Lauf 5 von 48
  // veraenderten Symbol-Scores und einzeln dreimal hintereinander 0 von 48;
  // `check/rules.js` las dieses Ergebnis und verlangte einen
  // SCORE_MODEL_VERSION-Bump, der die gesamte aufgezeichnete Historie
  // faelschlich als "aus einem frueheren Modell" markiert haette.
  // Stimmen die Seiten im Feed-Ausgang nicht ueberein, ist der Vergleich
  // ungueltig - und ein ungueltiger Vergleich darf ueber die Formel gar nichts
  // sagen, weder "geaendert" noch "unveraendert".
  const feedSig = f => FEEDS.map(k => k + '=' + (f && f[k] === true ? 1 : 0)).join(' ');
  const leer = () => ({ sym:{}, symRaw:{}, rub:{}, staerke:{}, pair:{}, carry:{} });
  const BASIS_URL = `http://127.0.0.1:${PORT_ALT}/index.html`;
  let alt = leer(), neu = leer(), fehler = null, unvergleichbar = null;
  try {
    // Modus aussen, Seite innen, und bei der ERSTEN Abweichung ist Schluss.
    // ⚠ Hier stand zuerst eine Wiederholung (bis zu drei Anlaeufe je Modus).
    // Die Gegenprobe hat sie widerlegt: ein Ladevorgang schreibt Zustand in den
    // localStorage SEINER Herkunft, und der naechste Ladevorgang derselben
    // Herkunft liest ihn wieder. Der zweite Anlauf lief also auf einer von der
    // ersten, kaputten Runde verschmutzten Seite - gemessen 2026-09-18: Feeds
    // im zweiten Anlauf wieder einig, und trotzdem 113 gemeldete Unterschiede,
    // obwohl Basis und Arbeitsbaum derselbe Code waren. Eine Wiederholung auf
    // einer verschmutzten Seite beantwortet die Frage nicht, sie erfindet eine
    // neue Antwort.
    // Nur 'normalized': den einfachen Modus gibt es seit 2026-09-24 nicht mehr.
    // Die Basis (alter Stand) wird ebenfalls in 'normalized' geladen - so
    // vergleicht der Lauf dieselbe Rechnung auf beiden Seiten.
    for (const m of ['normalized']) {
      const a = await ladenModus(BASIS_URL, m);
      const n = await ladenModus(URL_NEU, m);
      if (feedSig(a.__feeds) !== feedSig(n.__feeds)) {
        unvergleichbar = `Modus ${m}: die Live-Feeds haben auf den beiden Staenden unterschiedlich geantwortet.\n` +
          `    Basis       : ${feedSig(a.__feeds)}\n` +
          `    Arbeitsbaum : ${feedSig(n.__feeds)}\n` +
          `    Damit vergleicht dieser Lauf nicht die RECHNUNG, sondern den Netzzugang - er sagt ueber die Formel nichts aus.\n` +
          `    Noch einmal laufen lassen (node check/scorediff.js); bleibt es dabei, ist ein Feed wirklich kaputt.`;
        break;
      }
      Object.keys(alt).forEach(k => Object.keys(a[k] || {}).forEach(id => {
        alt[k][m + ':' + id] = a[k][id];
        neu[k][m + ':' + id] = n[k][id];
      }));
    }
  } catch (e) { fehler = String(e); }
  await b.close();
  srv.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

  if (fehler) {
    console.error('[scorediff] Vergleich nicht moeglich:', fehler);
    schreibe({ status: 'fehler', grund: fehler, basis: BASE });
    process.exit(1);
  }
  if (unvergleichbar) {
    // Bewusst KEIN roter Lauf: ein Netz-Aussetzer ist kein Befund. Aber auch
    // kein "ok" - `check/rules.js` nimmt nur status:"ok" als Nachweis an und
    // faellt sonst auf die strenge Regel zurueck (fail-closed).
    console.error('[scorediff] Vergleich nicht aussagekraeftig:\n    ' + unvergleichbar);
    schreibe({ status: 'unvergleichbar', grund: unvergleichbar, basis: BASE, zeit: new Date().toISOString() });
    process.exit(0);
  }

  const vergleich = (a, c) => {
    const k = new Set([...Object.keys(a), ...Object.keys(c)]);
    return [...k].filter(x => String(a[x]) !== String(c[x])).map(x => ({ k: x, alt: a[x], neu: c[x] }));
  };
  const dSym = vergleich(alt.sym, neu.sym);
  const dRaw = vergleich(alt.symRaw, neu.symRaw);
  const dRub = vergleich(alt.rub, neu.rub);
  const dStk = vergleich(alt.staerke, neu.staerke);
  const dPair = vergleich(alt.pair, neu.pair);
  const dCarry = vergleich(alt.carry, neu.carry);

  // Nur DIESE vier bilden den Symbol-Score ab - genau das, was in scoreHist
  // landet und was History/Trends/Staerke-Note rueckblickend vergleichen.
  const symbolGeaendert = dSym.length + dRaw.length + dRub.length + dStk.length;

  const zeig = (nm, d, gesamt) => {
    console.log(`  ${nm.padEnd(26)} ${String(d.length).padStart(3)} von ${String(gesamt).padStart(3)} veraendert`);
    d.slice(0, 12).forEach(e => console.log(`      ${String(e.k).padEnd(24)} ${String(e.alt).padStart(9)}  ->  ${e.neu}`));
    if (d.length > 12) console.log(`      ... und ${d.length - 12} weitere`);
  };
  console.log(`[scorediff] Arbeitsbaum gegen ${BASE}, gleiche Daten, gleicher Browser:`);
  zeig('Symbol-Score (cmp)', dSym, Object.keys(neu.sym).length);
  zeig('Symbol-Score (roh)', dRaw, Object.keys(neu.symRaw).length);
  zeig('Karten-Score', dRub, Object.keys(neu.rub).length);
  zeig('Staerke 1-10', dStk, Object.keys(neu.staerke).length);
  zeig('Carry je Paar', dCarry, Object.keys(neu.carry).length);
  zeig('Paar-Score', dPair, Object.keys(neu.pair).length);

  schreibe({
    status: 'ok', basis: BASE, zeit: new Date().toISOString(),
    symbolGeaendert, symbolUnveraendert: symbolGeaendert === 0,
    zahlen: { sym: dSym.length, symRaw: dRaw.length, rub: dRub.length, staerke: dStk.length, carry: dCarry.length, pair: dPair.length },
    beispiele: { sym: dSym.slice(0, 8), rub: dRub.slice(0, 8), carry: dCarry.slice(0, 8), pair: dPair.slice(0, 8) }
  });

  console.log(symbolGeaendert === 0
    ? '\n  ✓ Der SYMBOL-Score ist unveraendert - scoreHist bleibt vergleichbar.'
    : `\n  ⚠ Der SYMBOL-Score hat sich an ${symbolGeaendert} Stellen geaendert - SCORE_MODEL_VERSION gehoert hochgezaehlt.`);
  // Der Waechter selbst faellt hier NICHT durch: eine Score-Aenderung kann
  // gewollt sein. Ueber den Bump entscheidet rules.js anhand dieser Datei.
  process.exit(0);
})();
