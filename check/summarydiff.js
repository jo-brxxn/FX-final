#!/usr/bin/env node
// ── TEXT-DIFF DER FORMULIERUNGS-LOGIK GEGEN DIE VERGLEICHSBASIS ───────
// Pendant zu check/scorediff.js, nur fuer die generierten Kartentexte statt
// Score-Zahlen. Rendert Basis und Arbeitsbaum im selben Browser mit
// denselben Daten und vergleicht summarizeRub() fuer jede Karte jedes
// Symbols Zeichen fuer Zeichen - eine belastbare Antwort auf die Frage, die
// rules.js bisher nur RATEN konnte: hat sich der generierte TEXT wirklich
// geaendert?
//
// Warum das noetig wurde (2026-08-25, docs/module-split.md): sobald
// summarizeRub()/summarizeGeneric()/... aus index.html in eine js/*.js-Datei
// UMZIEHEN (reine Ortsveraenderung, kein Verhaltensunterschied), taucht ihr
// kompletter Koerper im Diff auf - rules.js' Regel 3 (SUMMARY_ENGINE_VERSION)
// kann bisher nicht unterscheiden zwischen "umgezogen, Text identisch" und
// "die Formulierung wurde wirklich geaendert". Ohne diesen Waechter muesste
// SUMMARY_ENGINE_VERSION bei jeder Datei-Umsortierung hochgezaehlt werden -
// genau das waere aber SCHAEDLICH (markiert bereits synchronisierte Texte
// faelschlich als veraltet, exakt dieselbe Begruendung wie bei scorediff.js).
//
// Aufruf:  node check/summarydiff.js [<basis-ref>]
// Ausgabe: schreibt zusaetzlich check/.summarydiff.json, damit rules.js das
//          Ergebnis lesen kann, ohne selbst einen Browser zu starten.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);

const BASE = process.argv[2] || process.env.CHECK_BASE || 'origin/main';
const URL_NEU = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const ERGEBNIS = path.join(__dirname, '.summarydiff.json');

function schreibe(o) { try { fs.writeFileSync(ERGEBNIS, JSON.stringify(o, null, 1)); } catch (e) {} }

function basisVorhanden() {
  try { execSync('git rev-parse --verify ' + BASE, { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}
if (!basisVorhanden()) {
  console.log(`[summarydiff] Basis "${BASE}" nicht vorhanden - uebersprungen.`);
  schreibe({ status: 'uebersprungen', grund: 'Basis fehlt', basis: BASE });
  process.exit(0);
}

// Identischer Aufbau wie scorediff.js (siehe dort fuer die ausfuehrliche
// Begruendung jedes einzelnen Schritts) - Daten (*.json) bewusst aus dem
// Arbeitsbaum, CODE (index.html + js/*.js) aus der Vergleichsbasis.
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'summarydiff-'));
fs.writeFileSync(path.join(TMP, 'index.html'), execSync(`git show ${BASE}:index.html`,
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
try {
  const jsFiles = execSync(`git ls-tree -r --name-only ${BASE} -- js`, { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (jsFiles.length) fs.mkdirSync(path.join(TMP, 'js'), { recursive: true });
  jsFiles.forEach(f => {
    fs.writeFileSync(path.join(TMP, f), execSync(`git show ${BASE}:${f}`,
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  });
} catch (e) {}
fs.readdirSync('.').filter(f => f.endsWith('.json') || f === 'sw.js')
  .forEach(f => { try { fs.copyFileSync(f, path.join(TMP, f)); } catch (e) {} });

const PORT_ALT = +(process.env.CHECK_PORT || 8935) + 2;
const srv = http.createServer((req, res) => {
  const name = decodeURIComponent(String(req.url).split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const p = path.join(TMP, path.normalize(name).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ct = /\.json$/.test(p) ? 'application/json' : /\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(buf);
  });
});

const ERFASSEN = () => {
  const o = {};
  syms.forEach(s => {
    (s.rubrics || []).forEach(r => {
      try { o[s.id + '|' + r.name] = summarizeRub(s, r); }
      catch (e) { o[s.id + '|' + r.name] = 'ERR:' + e.message; }
    });
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
    console.error('[summarydiff] Vergleich nicht moeglich:', fehler);
    schreibe({ status: 'fehler', grund: fehler, basis: BASE });
    process.exit(1);
  }

  const k = new Set([...Object.keys(alt), ...Object.keys(neu)]);
  const diff = [...k].filter(x => String(alt[x]) !== String(neu[x])).map(x => ({ k: x, alt: alt[x], neu: neu[x] }));

  console.log(`[summarydiff] Arbeitsbaum gegen ${BASE}, gleiche Daten, gleicher Browser:`);
  console.log(`  Kartentext  ${String(diff.length).padStart(4)} von ${String(k.size).padStart(4)} veraendert`);
  diff.slice(0, 6).forEach(e => console.log(`      ${e.k}\n        alt: ${String(e.alt).slice(0, 140)}\n        neu: ${String(e.neu).slice(0, 140)}`));
  if (diff.length > 6) console.log(`      ... und ${diff.length - 6} weitere`);

  schreibe({
    status: 'ok', basis: BASE, zeit: new Date().toISOString(),
    textGeaendert: diff.length, textUnveraendert: diff.length === 0,
    beispiele: diff.slice(0, 8)
  });

  console.log(diff.length === 0
    ? '\n  ✓ Der generierte Kartentext ist unveraendert.'
    : `\n  ⚠ Der generierte Kartentext hat sich an ${diff.length} Stellen geaendert - SUMMARY_ENGINE_VERSION gehoert hochgezaehlt.`);
  process.exit(0);
})();
