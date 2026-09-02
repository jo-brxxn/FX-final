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
// ⚠ Seit der Modul-Aufteilung (2026-08-25, docs/module-split.md) liegt der
// allergroesste Teil des Codes (inkl. der Score-/Formulierungs-Flaeche) in
// js/*.js statt inline in index.html - ein Diff, der nur index.html
// betrachtet, sieht Aenderungen dort NICHT und jede Regel unten, die auf
// diffText/den aktuellen bzw. Basis-Code aufbaut, wuerde lautlos blind.
// Bestaetigt per Regressionstest: biasScore() absichtlich kaputt gemacht,
// ohne diesen Zusatz meldete der Waechter trotzdem "ok".
const diff = git(`diff -U0 ${BASE} -- index.html js`);
// Nur die HINZUGEFUEGTEN/ENTFERNTEN Zeilen betrachten, nicht den Kontext.
const diffZeilen = diff.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l));
const diffText = diffZeilen.join('\n');
const indexGeaendert = geaendert.includes('index.html');
const codeGeaendert = geaendert.some(f => f === 'index.html' || f.startsWith('js/'));

// Aktueller Code (Arbeitsbaum): index.html + alle js/*.js, einmal
// eingelesen und zusammengehaengt - Regeln, die "den ganzen Code" nach
// einem Muster durchsuchen (Funktionskoerper, Konstanten...), suchen hier
// statt nur in index.html.
function aktuellerCode() {
  let s = fs.existsSync('index.html') ? fs.readFileSync('index.html', 'utf8') : '';
  try {
    s += '\n' + fs.readdirSync('js').filter(f => f.endsWith('.js'))
      .map(f => fs.readFileSync('js/' + f, 'utf8')).join('\n');
  } catch (e) {}
  return s;
}
// Dasselbe fuer den BASIS-Stand (git show), memoisiert - wird von mehreren
// Regeln gebraucht und `git show` pro js-Datei ist nicht gratis.
let _basisCodeCache = null;
function basisCode() {
  if (_basisCodeCache != null) return _basisCodeCache;
  let s = git(`show ${BASE}:index.html`);
  try {
    const jsDateien = execSync(`git ls-tree -r --name-only ${BASE} -- js`, { encoding: 'utf8' }).split('\n').filter(Boolean);
    s += '\n' + jsDateien.map(f => git(`show ${BASE}:${f}`)).join('\n');
  } catch (e) {}
  return _basisCodeCache = s;
}

function wert(regex) {
  const m = aktuellerCode().match(regex);
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

// ── Regel 1b: dasselbe fuer die ZWEITE App (Perfect Rezept) ──────────────
// rezept.html + js/rezept/* sind eine eigenstaendige App im selben Repo
// (siehe docs/rezept.md). Sie hat ein eigenes Banner (REZEPT-CHECK-<n>) und
// dieselbe Pflicht: der Nutzer soll an der Nummer erkennen, dass eine neue
// Fassung live ist. Ohne diese Regel waere die Rezept-App genau der blinde
// Fleck, den Regel 1 fuer den FX Analyst Pro schliesst.
const rezeptGeaendert = geaendert.some(f => f === 'rezept.html' || f.startsWith('js/rezept/'));
if (rezeptGeaendert && fs.existsSync('rezept.html')) {
  const jetztR = wertIn(fs.readFileSync('rezept.html', 'utf8'), /id="rezVerName">REZEPT-CHECK-(\d+)</);
  let vorherR = null;
  try { vorherR = wertIn(git(`show ${BASE}:rezept.html`), /id="rezVerName">REZEPT-CHECK-(\d+)</); }
  catch (e) { /* Datei gab es im Basis-Stand noch nicht - erste Fassung */ }
  if (jetztR == null) fail('REZEPT-CHECK', 'Banner-Nummer in rezept.html nicht gefunden.');
  else if (vorherR != null && Number(jetztR) <= Number(vorherR))
    fail('REZEPT-CHECK', `Nummer nicht hochgezaehlt (vorher ${vorherR}, jetzt ${jetztR}).`);
}

// ── Regel 2: Score-Formel geaendert -> SCORE_MODEL_VERSION hochzaehlen ──
// Grund (2026-08-16): die Formel wurde korrigiert, die Nummer blieb stehen -
// dadurch standen im History-Fenster Werte aus zwei verschiedenen Rechnungen
// unmarkiert nebeneinander und erzeugten einen Sprung, den es nie gab.
// ⚠ Die Menge der score-relevanten Stellen wird NICHT mehr von Hand
// gepflegt, sondern bei jedem Lauf aus dem Code abgeleitet (siehe
// check/scoreSurface.js): ausgehend von der Rechenkette und den fuenf
// Bias-Pfaden alle davon aufgerufenen Funktionen plus die dort verwendeten
// Konstanten. Dadurch verbessert sich der Waechter mit jedem Update von
// selbst - eine neue Hilfsfunktion in der Rechenkette ist ab dem naechsten
// Lauf automatisch geschuetzt, ohne dass jemand eine Liste ergaenzt.
const flaeche = require('./scoreSurface.js').ableiten('index.html');
const SCORE_FN = flaeche.funktionen.map(n => 'function ' + n)
  .concat(flaeche.konstanten.map(n => n + '='));
const formelBeruehrt = SCORE_FN.filter(s => diffText.includes(s));
// Das Beruehren einer Funktion der Score-Flaeche ist ein VERDACHT, kein
// Beweis. Ob sich die Rechnung wirklich geaendert hat, weiss nur, wer
// nachrechnet - genau das tut check/scorediff.js (rendert Basis und
// Arbeitsbaum mit denselben Daten und vergleicht jede Zahl). Liegt dessen
// Ergebnis vor und sagt es "Symbol-Score unveraendert", waere ein Bump sogar
// SCHAEDLICH: er markiert die gesamte aufgezeichnete Historie als "aus einem
// frueheren Modell", obwohl sie es nicht ist (Anlass 2026-08-23: der
// Carry-Fix fasste pairCarryAdj/actualColor an, liess aber 0 von 16
// Symbol-Scores und 0 von 96 Karten-Scores unveraendert).
//
// Fail-closed: fehlt das Ergebnis oder ist es aelter als der Arbeitsbaum,
// gilt weiter die strenge Regel.
function scorediffErgebnis() {
  try {
    const p = __dirname + '/.scorediff.json';
    if (!fs.existsSync(p)) return null;
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (o.status !== 'ok' || o.basis !== BASE) return null;
    // Aelter als index.html? Dann bezieht es sich auf einen anderen Stand.
    if (fs.statSync(p).mtimeMs < fs.statSync('index.html').mtimeMs) return null;
    return o;
  } catch (e) { return null; }
}
if (formelBeruehrt.length) {
  const jetzt = wert(/const SCORE_MODEL_VERSION=(\d+)/);
  const vorher = wertIn(basisCode(), /const SCORE_MODEL_VERSION=(\d+)/);
  const nachgerechnet = scorediffErgebnis();
  if (jetzt == null) fail('SCORE_MODEL_VERSION', 'Konstante nicht gefunden.');
  else if (nachgerechnet && nachgerechnet.symbolUnveraendert) {
    console.log('[rules] SCORE_MODEL_VERSION: Bump nicht noetig - check/scorediff.js hat nachgerechnet, ' +
      'der Symbol-Score ist an keiner Stelle veraendert (' + formelBeruehrt.length + ' Funktion(en) der Score-Flaeche im Diff).');
  }
  else if (vorher != null && Number(jetzt) <= Number(vorher))
    fail('SCORE_MODEL_VERSION',
      `Die Score-Formel wurde angefasst (${formelBeruehrt.slice(0, 4).join(', ')}` +
      `${formelBeruehrt.length > 4 ? ', ...' : ''}), aber SCORE_MODEL_VERSION steht weiter auf ${jetzt}. ` +
      `Ohne Bump vergleichen History, Trends und die Staerke-Note still zwei verschiedene Rechnungen.` +
      (nachgerechnet ? ` check/scorediff.js hat nachgerechnet: der Symbol-Score hat sich an ${nachgerechnet.symbolGeaendert} Stellen geaendert.`
                     : ` (Kein Ergebnis von check/scorediff.js - mit "node check/all.js" laeuft es automatisch mit und rechnet nach.)`));
}

// ── Regel 3: Formulierungs-Logik geaendert -> SUMMARY_ENGINE_VERSION hoch ──
// Grund: rubSummarySig() haengt nur an den Rohdaten. Aendert sich die
// TEXT-FORM, erkennt die Signatur das nie - alte Texte bleiben ewig stehen.
// Dasselbe Fail-closed-Prinzip wie bei Regel 2 (siehe scorediffErgebnis()):
// eine reine Datei-Umsortierung (Modul-Aufteilung) laesst diese Funktionen
// im Diff auftauchen, ohne dass sich der generierte TEXT aendert - ein
// Bump waere dann SCHAEDLICH (markiert synchronisierte Texte faelschlich
// als veraltet). check/summarydiff.js rechnet nach, genau wie scorediff.js
// es fuer die Score-Zahlen tut.
function summarydiffErgebnis() {
  try {
    const p = __dirname + '/.summarydiff.json';
    if (!fs.existsSync(p)) return null;
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (o.status !== 'ok' || o.basis !== BASE) return null;
    if (fs.statSync(p).mtimeMs < fs.statSync('index.html').mtimeMs) return null;
    return o;
  } catch (e) { return null; }
}
const SUM_FN = ['function summarizeRub', 'function summarizeGeneric', 'function summarizeInflation',
  'function summarizeLabour', 'function summarizeGrowth', 'function summarizeInterestRates',
  'function summarizeCot', 'function summarizeRiskEnv', 'function cameInPhrase',
  'function supportPhrase', 'function anchorClause', 'HOTCOLD_WORDS=', 'JOBS_WORDS=', 'TREND_WORDS='];
const sumBeruehrt = SUM_FN.filter(s => diffText.includes(s));
if (sumBeruehrt.length) {
  const jetzt = wert(/const SUMMARY_ENGINE_VERSION=(\d+)/);
  const vorher = wertIn(basisCode(), /const SUMMARY_ENGINE_VERSION=(\d+)/);
  const nachgerechnet = summarydiffErgebnis();
  if (nachgerechnet && nachgerechnet.textUnveraendert) {
    console.log('[rules] SUMMARY_ENGINE_VERSION: Bump nicht noetig - check/summarydiff.js hat nachgerechnet, ' +
      'der generierte Kartentext ist an keiner Stelle veraendert (' + sumBeruehrt.length + ' Funktion(en) der Formulierungs-Flaeche im Diff).');
  }
  else if (jetzt != null && vorher != null && Number(jetzt) <= Number(vorher))
    fail('SUMMARY_ENGINE_VERSION',
      `Die Formulierungs-Logik wurde angefasst (${sumBeruehrt.slice(0, 3).join(', ')}), ` +
      `aber SUMMARY_ENGINE_VERSION steht weiter auf ${jetzt}. Bestandsnutzer sehen sonst den alten Text.` +
      (nachgerechnet ? ` check/summarydiff.js hat nachgerechnet: der Text hat sich an ${nachgerechnet.textGeaendert} Stellen geaendert.`
                     : ` (Kein Ergebnis von check/summarydiff.js - mit "node check/all.js" laeuft es automatisch mit und rechnet nach.)`));
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

// ── Regel 5: neue Score-Groesse -> es MUSS eine Pruefung dazukommen ──
// Der Waechter soll mit jedem Update mitwachsen. Wer eine neue Funktion
// einfuehrt, die den Score berechnet, gewichtet oder klassifiziert, fuegt im
// selben Commit eine Pruefung dafuer hinzu - sonst ist sie ein blinder Fleck.
// Bewusst grob: lieber einmal zu oft nachfragen als eine Groesse ungeprueft
// lassen. Wer wirklich nichts zu pruefen hat, erweitert check/score.js um
// eine Zeile, die genau das festhaelt.
const neueScoreFnKandidaten = [...diffText.matchAll(/^\+.*\bfunction\s+(\w*(?:Score|Bias|Weight|Norm|Strength)\w*)\s*\(/gm)]
  .map(m => m[1]);
if (neueScoreFnKandidaten.length) {
  // Nur wirklich NEUE Funktionen zaehlen - eine bestehende EIN-ZEILEN-Funktion
  // erzeugt beim Bearbeiten (Edit ersetzt die ganze Zeile, git zeigt sie als
  // "-"+"+" desselben "function name(") eine "+"-Zeile, die wie eine neue
  // Funktion aussieht, obwohl nur ihr Koerper geaendert wurde. Ohne diesen
  // Filter meldet Regel 5 bei JEDER Aenderung an einer bestehenden
  // score-benannten Funktion faelschlich "neu eingefuehrt" (Fehlalarm-Fund
  // 2026-08-22, ausgeloest durch setRubBias - dieselbe Klasse Fehlalarm wie
  // scoreSurface.js' Backtick-Fund, siehe docs/score-model.md).
  const altHtmlFuerFn = codeGeaendert ? basisCode() : '';
  const neueScoreFn = [...new Set(neueScoreFnKandidaten)]
    .filter(n => !new RegExp('function\\s+' + n + '\\s*\\(').test(altHtmlFuerFn));
  if (neueScoreFn.length) {
    const checkBeruehrt = geaendert.some(f => f.startsWith('check/'));
    if (!checkBeruehrt)
      fail('Neue Score-Groesse ohne Pruefung',
        `Neu eingefuehrt: ${neueScoreFn.join(', ')}. ` +
        `In diesem Commit wurde aber keine Datei unter check/ angefasst. ` +
        `Eine neue Score-Groesse ohne Pruefung ist ein blinder Fleck - check/score.js erweitern.`);
  }
}

// ── Regel 6: neuer persistierter Zustand -> alle vier Ecken anbinden ──
// Die meistwiederholte Fehlerklasse dieses Projekts (tabStacks, scoreHist,
// setupCcyFilter, calHighOnly, cmpCols, pinEnabled ...): ein Feld landet nur
// im localStorage und kommt auf keinem anderen Geraet an. Pflicht sind:
// Save-Funktion, cloudPush, cloudPull (mit prefPending-Schutz), Export/Import.
const LOKAL_ERLAUBT = /(cloud|updated|seen|pending|cache|migrat|_v\d|intro|help|verbanner|score_mode|lastfetch)/i;
const altHtmlFuerKeys = codeGeaendert ? basisCode() : '';
const neueKeys = [...new Set([...diffText.matchAll(/^\+.*localStorage\.setItem\(\s*['"](fxpro_[\w]+)['"]/gm)]
  .map(m => m[1]))].filter(k => !LOKAL_ERLAUBT.test(k) && !altHtmlFuerKeys.includes(k));
// ⚠ Frueher wurde nur geprueft, ob die Namen "cloudPush"/"cloudPull"
// irgendwo im Diff-Text vorkommen. Das ist ein Fehlalarm-Generator: wer
// mitten in die Funktion schreibt, aendert deren Namenszeile nicht mit.
// Jetzt wird der KOERPER beider Funktionen aus dem aktuellen index.html
// geholt und geprueft, ob die aus dem Schluessel gelesene Variable dort
// wirklich auftaucht.
function fnKoerper(quelle, name) {
  const i = quelle.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let tiefe = 0, start = quelle.indexOf('{', i);
  if (start < 0) return '';
  for (let j = start; j < quelle.length; j++) {
    if (quelle[j] === '{') tiefe++;
    else if (quelle[j] === '}') { tiefe--; if (!tiefe) return quelle.slice(start, j + 1); }
  }
  return '';
}
function varsFuerKey(quelle, key) {
  const re = new RegExp('(?:let|const|var)\\s+(\\w+)\\s*=[^;\\n]*localStorage\\.getItem\\(\\s*[\'"]' + key + '[\'"]', 'g');
  const out = [];
  let m; while ((m = re.exec(quelle))) out.push(m[1]);
  return out;
}
if (neueKeys.length) {
  const jetztHtml = aktuellerCode();
  const push = fnKoerper(jetztHtml, 'cloudPush'), pull = fnKoerper(jetztHtml, 'cloudPull');
  const fehlt = [];
  neueKeys.forEach(k => {
    const vs = varsFuerKey(jetztHtml, k);
    const drin = (koerper) => koerper && (koerper.includes(k) || vs.some(v => new RegExp('\\b' + v + '\\b').test(koerper)));
    if (!drin(push)) fehlt.push('cloudPush');
    if (!drin(pull)) fehlt.push('cloudPull');
  });
  if (fehlt.length)
    fail('Neuer persistierter Zustand ohne Sync',
      `Neue Schluessel: ${neueKeys.join(', ')}. Im selben Commit fehlt: ${fehlt.join(' und ')}. ` +
      `Ohne Anbindung an cloudPush UND cloudPull (dort mit prefPending-Schutz) kommt der Wert ` +
      `auf keinem zweiten Geraet an - genau der Fehler, der in diesem Projekt am haeufigsten passiert ist. ` +
      `Gehoert der Schluessel bewusst nur auf dieses Geraet, den Namen in LOKAL_ERLAUBT aufnehmen.`);
}

if (F.length) {
  console.error('REGEL-VERSTOSS:\n');
  F.forEach(x => console.error(`  [${x.regel}] ${x.text}\n`));
  process.exit(1);
}
console.log(`[rules] ok (Basis ${BASE}, ${geaendert.length} geaenderte Dateien)`);
