#!/usr/bin/env node
// ── REGEL-WAECHTER ────────────────────────────────────────────────
// Prueft die Projekt-Konventionen, die bisher NUR als Prosa in der CLAUDE.md
// standen - und deshalb vergessen wurden. Jede Regel hier existiert, weil der
// Fehler schon einmal beim Nutzer angekommen ist.
//
// Aufruf:  node check/rules.js [<basis-ref>]
// Ohne Argument wird gegen origin/main geprueft, sonst gegen den angegebenen
// Ref (in der CI z.B. der Vorgaenger-Commit).
const { execSync } = require('child_process');
const fs = require('fs');

const BASE = process.argv[2] || 'origin/main';
const F = [];
const fail = (regel, text) => F.push({ regel, text });

function git(cmd) {
  // ⚠ maxBuffer MUSS gross sein: `git show HEAD:index.html` liefert ~1,5 MB,
  // der Node-Default liegt bei 1 MB. Ohne das wirft execSync, der catch
  // liefert '' - und JEDE Regel, die den Vorher-Stand braucht, wird still
  // uebersprungen. Genau so hat dieser Waechter beim ersten Test einen
  // echten Verstoss durchgelassen, ohne ein Wort zu sagen.
  try { return execSync('git ' + cmd, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); }
  catch (e) { throw new Error('git ' + cmd + ' fehlgeschlagen: ' + e.message.slice(0, 200)); }
}
function baseVorhanden() {
  try { execSync('git rev-parse --verify ' + BASE, { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}
if (!baseVorhanden()) {
  console.log(`[rules] Basis "${BASE}" nicht vorhanden - Regel-Pruefung uebersprungen.`);
  process.exit(0);
}

// Zwei-Punkt-Diff gegen den Arbeitsbaum: greift damit auch VOR dem Commit
// (lokaler Pre-Push-Lauf) und in der CI gleichermassen.
const geaendert = git(`diff --name-only ${BASE}`).split('\n').filter(Boolean);
const diff = git(`diff -U0 ${BASE} -- index.html`);
// Nur die HINZUGEFUEGTEN/ENTFERNTEN Zeilen betrachten, nicht den Kontext.
const diffZeilen = diff.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l));
const diffText = diffZeilen.join('\n');
const indexGeaendert = geaendert.includes('index.html');

function wert(regex) {
  const html = fs.readFileSync('index.html', 'utf8');
  const m = html.match(regex);
  return m ? m[1] : null;
}
function wertIn(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}

// ── Regel 1: jede Aenderung an index.html bumpt die VERSION-CHECK-Nummer ──
// Grund: der Nutzer erkennt an der Nummer, dass eine neue Fassung live ist.
// Zweimal in Folge vergessen -> seither ausdrueckliche Pflicht ohne Ausnahme.
if (indexGeaendert) {
  const jetzt = wert(/id="hlbName">VERSION-CHECK-(\d+)</);
  const altHtml = git(`show ${BASE}:index.html`);
  const vorher = wertIn(altHtml, /id="hlbName">VERSION-CHECK-(\d+)</);
  if (jetzt == null) fail('VERSION-CHECK', 'Banner-Nummer nicht gefunden.');
  else if (vorher != null && Number(jetzt) <= Number(vorher))
    fail('VERSION-CHECK', `Nummer nicht hochgezaehlt (vorher ${vorher}, jetzt ${jetzt}).`);
}

// ── Regel 2: Score-Formel geaendert -> SCORE_MODEL_VERSION hochzaehlen ──
// Grund (2026-08-16): die Formel wurde korrigiert, die Nummer blieb stehen -
// dadurch standen im History-Fenster Werte aus zwei verschiedenen Rechnungen
// unmarkiert nebeneinander und erzeugten einen Sprung, den es nie gab.
const SCORE_FN = [
  'function indScoreParts', 'function indScore', 'function rubScore', 'function symScore',
  'function symScoreCmp', 'function pairScore', 'function biasScore', 'function indIsHalfWeight',
  'function indBaseWeight', 'function applyTrendModel', 'function indStepBias', 'function indTrendBias',
  'function researchBias', 'function indSurpriseMag', 'function indDecayWeight', 'function indMarketWeight',
  'function symTrackedCount', 'function indIsStale', 'function symCmpFactor',
  'CORE_PAIRS=', 'SCORE_ZERO=', 'BOND_HALF_PT=', 'NO_TREND_RUBS=', 'IND_STALE_CYCLES=',
  'SCORE_NORM_MIN=', 'SCORE_NORM_MAX=', 'DECAY_HALFLIFE_CYCLES=', 'BOND_DEAD_BAND='
];
const formelBeruehrt = SCORE_FN.filter(s => diffText.includes(s));
if (formelBeruehrt.length) {
  const jetzt = wert(/const SCORE_MODEL_VERSION=(\d+)/);
  const vorher = wertIn(git(`show ${BASE}:index.html`), /const SCORE_MODEL_VERSION=(\d+)/);
  if (jetzt == null) fail('SCORE_MODEL_VERSION', 'Konstante nicht gefunden.');
  else if (vorher != null && Number(jetzt) <= Number(vorher))
    fail('SCORE_MODEL_VERSION',
      `Die Score-Formel wurde angefasst (${formelBeruehrt.slice(0, 4).join(', ')}` +
      `${formelBeruehrt.length > 4 ? ', ...' : ''}), aber SCORE_MODEL_VERSION steht weiter auf ${jetzt}. ` +
      `Ohne Bump vergleichen History, Trends und die Staerke-Note still zwei verschiedene Rechnungen.`);
}

// ── Regel 3: Formulierungs-Logik geaendert -> SUMMARY_ENGINE_VERSION hoch ──
// Grund: rubSummarySig() haengt nur an den Rohdaten. Aendert sich die
// TEXT-FORM, erkennt die Signatur das nie - alte Texte bleiben ewig stehen.
const SUM_FN = ['function summarizeRub', 'function summarizeGeneric', 'function summarizeInflation',
  'function summarizeLabour', 'function summarizeGrowth', 'function summarizeInterestRates',
  'function summarizeCot', 'function summarizeRiskEnv', 'function cameInPhrase',
  'function supportPhrase', 'function anchorClause', 'HOTCOLD_WORDS=', 'JOBS_WORDS=', 'TREND_WORDS='];
const sumBeruehrt = SUM_FN.filter(s => diffText.includes(s));
if (sumBeruehrt.length) {
  const jetzt = wert(/const SUMMARY_ENGINE_VERSION=(\d+)/);
  const vorher = wertIn(git(`show ${BASE}:index.html`), /const SUMMARY_ENGINE_VERSION=(\d+)/);
  if (jetzt != null && vorher != null && Number(jetzt) <= Number(vorher))
    fail('SUMMARY_ENGINE_VERSION',
      `Die Formulierungs-Logik wurde angefasst (${sumBeruehrt.slice(0, 3).join(', ')}), ` +
      `aber SUMMARY_ENGINE_VERSION steht weiter auf ${jetzt}. Bestandsnutzer sehen sonst den alten Text.`);
}

// ── Regel 4: neue Workflow-Ausgabedatei muss auch committet werden ──
// Grund: risk_index.json wurde erzeugt, aber nie in die git-add-Liste
// aufgenommen - der Schritt meldete "success", die Datei fehlte im Repo.
const wfDateien = fs.existsSync('.github/workflows')
  ? fs.readdirSync('.github/workflows').filter(f => f.endsWith('.yml')) : [];
wfDateien.forEach(f => {
  const p = '.github/workflows/' + f;
  const txt = fs.readFileSync(p, 'utf8');
  const geschrieben = new Set();
  // writeFileSync('name.json'  /  > name.json  /  writeFileSync("name.json"
  (txt.match(/writeFileSync\(\s*['"]([\w./-]+\.json)['"]/g) || [])
    .forEach(m => geschrieben.add(m.replace(/.*['"]([\w./-]+\.json)['"]/, '$1')));
  if (!geschrieben.size) return;
  const addBlock = (txt.match(/git add[^\n]*/g) || []).join(' ');
  if (!addBlock) return;                       // Workflow committet gar nichts
  // Zwischendateien, die derselbe Workflow wieder loescht, sollen NICHT
  // committet werden - sie sind Arbeitsmaterial, kein Ergebnis.
  const geloescht = (txt.match(/rm -[rf]+ [^\n]*/g) || []).join(' ');
  [...geschrieben].forEach(d => {
    const name = d.replace(/^\.\//, '');
    if (name.startsWith('/tmp') || name.includes('tmp/')) return;
    if (geloescht.includes(name)) return;
    // Sammel-Loeschung per Platzhalter (rm -f tv_hist_deep_*.json)
    const stamm = name.replace(/\.json$/, '');
    if (new RegExp('rm -[rf]+ [^\\n]*' + stamm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 8) + '[^\\n]*\\*').test(txt)) return;
    if (!addBlock.includes(name) && !addBlock.includes('-A') && !addBlock.includes('--all'))
      fail('Workflow-Ausgabe', `${p} erzeugt "${name}", aber die Datei steht in keinem "git add" dieses Workflows.`);
  });
});

if (F.length) {
  console.error('REGEL-VERSTOSS:\n');
  F.forEach(x => console.error(`  [${x.regel}] ${x.text}\n`));
  process.exit(1);
}
console.log(`[rules] ok (Basis ${BASE}, ${geaendert.length} geaenderte Dateien)`);
