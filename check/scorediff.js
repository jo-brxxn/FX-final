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
  return o;
};

(async () => {
  await new Promise(r => srv.listen(PORT_ALT, '127.0.0.1', r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1');localStorage.setItem('dmfx_app_choice', 'fx'); } catch (e) {} });
  const laden = async (url) => {
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.evaluate(() => { ['introOv','lockScreen','appChoiceOv'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
    await p.waitForTimeout(5000);
    return p.evaluate(ERFASSEN);
  };
  let alt, neu, fehler = null;
  try {
    alt = await laden(`http://127.0.0.1:${PORT_ALT}/index.html`);
    neu = await laden(URL_NEU);
  } catch (e) { fehler = String(e); }
  await b.close();
  srv.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

  if (fehler) {
    console.error('[scorediff] Vergleich nicht moeglich:', fehler);
    schreibe({ status: 'fehler', grund: fehler, basis: BASE });
    process.exit(1);
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
