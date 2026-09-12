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

// ── Regel 7: kein Waechter liest Zahlen nach blosser Wartezeit ──────────
// ⚠ Messung 2026-09-07 (VERSION-CHECK-485): check/display.js fiel im vollen
// Lauf mit EINEM Treffer aus (NAS dom=+0.2 soll=+0.1) und war allein
// wiederholt gruen. Ursache war kein App-Fehler, sondern die feste Wartezeit
// im Waechter: die Navigationsleiste wird beim Start einmal VOR den
// Live-Feeds gezeichnet (bei t=645ms weichen alle 24 Assets ab, ab t=1349ms
// keines mehr; alle acht Feeds beantwortet nach 2383ms im Leerlauf). Unter
// Last rutscht dieses Fenster ueber die feste Frist hinaus - der Waechter
// misst dann mitten in den Startvorgang und meldet rot ohne echten Fund.
// Rote Laeufe ohne Fund sind das Gefaehrlichste, was einem Waechter
// passieren kann, weil man sie irgendwann wegklickt. Deshalb: wer im Browser
// Score-Zahlen liest, MUSS auf das echte Fertig-Signal warten
// (check/warten.js, wartenBisDatenDa) statt auf eine Uhr.
// Gegenprobe beim Einbau: in display.js wieder waitForTimeout(5000) gesetzt
// -> 1 Treffer; wartenBisDatenDa zurueck -> 0.
const ZAHLEN_WAECHTER = /\b(symScoreCmp|rubScore|pairScore)\s*\(/;
try {
  fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).forEach(f => {
    if (f === 'warten.js') return;
    const q = fs.readFileSync(__dirname + '/' + f, 'utf8');
    if (!ZAHLEN_WAECHTER.test(q)) return;              // liest keine Score-Zahlen
    if (!/waitForTimeout\s*\(\s*\d{4,}/.test(q)) return; // wartet nicht stur lange
    // ⚠ Auf den AUFRUF pruefen, nicht auf den Namen: die require-Zeile allein
    // wartet auf nichts (beim Gegenprobe-Einbau genau daran vorbeigelaufen).
    if (/wartenBisDatenDa\s*\(/.test(q)) return;       // wartet auf das Signal
    fail('Waechter misst nach Uhr statt nach Signal',
      `check/${f} liest Score-Zahlen aus der Seite, wartet davor aber nur eine feste Zeit. ` +
      `Unter Last sind die Live-Feeds dann noch nicht angewandt und der Lauf wird rot, ohne dass ` +
      `etwas kaputt ist. Stattdessen wartenBisDatenDa(p) aus check/warten.js benutzen.`);
  });
} catch (e) {}

// ── Regel 8: der angebotene Zeitraum muss auch eingesammelt werden ──────
// ⚠ Nutzer-Wunsch 2026-09-07: der Zeitfilter der Daten-Seite bekam 5Y/8Y/12Y
// und "max = 2007". Gemessen reichte die Rohhistorie zu dem Zeitpunkt nur bis
// 2023-09-12 (18 von 18 Haeppchen, 0 Punkte davor) - die vier laengsten
// Stufen haetten also alle dasselbe Bild gezeigt. Damit das nicht wieder
// auseinanderlaeuft, haengen drei Werte zusammen und werden hier zusammen
// geprueft:
//   IND_HIST_MAX_FROM (js/main.js)  - was die Leiste als "Max" ANBIETET
//   HIST_FULL_FROM    (Workflow)    - was beim Zusammenbauen BEHALTEN wird
//   TARGET_CHUNKS     (Workflow)    - wie weit ueberhaupt GEHOLT wird
// Der Chunk-Test rechnet gegen das HEUTIGE Datum: waechst der Abstand zu 2007
// mit den Jahren, meldet der Waechter von selbst, dass die Zahl steigen muss
// - statt still eine Luecke am aelteren Rand entstehen zu lassen.
try {
  const js = aktuellerCode();
  const wf = fs.readFileSync('.github/workflows/update-ff-calendar.yml', 'utf8');
  const ab = (js.match(/IND_HIST_MAX_FROM\s*=\s*'(\d{4}-\d{2}-\d{2})'/) || [])[1];
  const wfAb = (wf.match(/HIST_FULL_FROM\s*=\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1];
  const ziel = +(wf.match(/export TARGET_CHUNKS=(\d+)/) || [])[1];
  if (ab && wfAb && ab !== wfAb)
    fail('Zeitraum-Untergrenze laeuft auseinander',
      `Die Leiste bietet "Max" ab ${ab} an (IND_HIST_MAX_FROM), der Workflow behaelt aber erst ab ${wfAb} ` +
      `(HIST_FULL_FROM). Der frueheste angebotene Zeitraum waere damit dauerhaft leer.`);
  // ⚠ Nicht gegen IND_HIST_MAX_FROM pruefen, sondern gegen das, was WIRKLICH
  // abrufbar ist. Gemessen am 2026-09-07 (Workflow "Probe indicator history
  // depth"): die Quelle antwortet fuer 2006-2012 mit HTTP 200 und NULL
  // Events, ihr Kalender beginnt 2013. Die Leiste darf 2007 anbieten - die
  // App sagt daneben ehrlich, ab wann die Reihe wirklich beginnt -, aber
  // Haeppchen fuer 2007-2012 zu holen waere Stunde fuer Stunde ein
  // Leerabruf. Der Waechter verlangt deshalb: TARGET_CHUNKS deckt die
  // SPAETERE der beiden Grenzen ab (die bindende), nicht mehr und nicht
  // weniger als noetig.
  const quelleAb = (wf.match(/HIST_SOURCE_FROM\s*=\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1];
  const bindend = (ab && quelleAb) ? (ab > quelleAb ? ab : quelleAb) : (ab || quelleAb);
  if (bindend && ziel) {
    const tage = Math.ceil((Date.now() - new Date(bindend + 'T00:00:00Z').getTime()) / 86400000);
    const noetig = Math.ceil((tage - 95) / 60);
    if (ziel < noetig)
      fail('Abruf reicht nicht bis an die abrufbare Grenze',
        `Bindend ist ${bindend} (Leiste "Max" ${ab || '-'}, gemessene Quellgrenze ${quelleAb || '-'}), ` +
        `das sind heute ${tage} Tage. Ein Haeppchen deckt 60 Tage ab 95 Tagen Rueckstand ab, noetig waeren ` +
        `also ${noetig} - TARGET_CHUNKS steht auf ${ziel}. Der aelteste abrufbare Teil wird nie geholt.`);
    if (quelleAb && ziel > noetig + 1)
      fail('Abruf laeuft ins Leere',
        `TARGET_CHUNKS steht auf ${ziel}, noetig sind ${noetig} bis zur gemessenen Quellgrenze ${quelleAb}. ` +
        `Die ${ziel - noetig} ueberzaehligen Haeppchen liefern nachweislich nichts und werden trotzdem ` +
        `bei JEDEM stuendlichen Lauf angefragt. Entweder die Zahl senken oder eine tiefere Quelle ` +
        `anbinden und HIST_SOURCE_FROM mit einer neuen Messung belegen.`);
  }
} catch (e) {}

// ── Regel 9: ein Hintergrundlauf, der nichts liefert, muss auffallen ────
// ⚠ Messung 2026-09-10: die Routine "News-Einordnung" feuerte am 09.09. um
// 15:15 UTC, lief sechs Minuten, verbrauchte 25 500 Ausgabe-Tokens und
// meldete SUCCEEDED - auf main kam KEIN Commit an. Ursache: eine per Routine
// frisch gefeuerte Sitzung startet mit leerem `sources` und bekommt keine
// autorisierte Arbeitskopie ("Repo nicht in Session-Sources autorisiert,
// Push blockiert"). Aufgefallen ist das nicht dem Waechter, sondern dem
// Nutzer - zwei Tage spaeter, weil die Seite einfach nichts Neues zeigte.
// Genau das ist die gefaehrliche Klasse: ein Zulieferer, der still
// ausbleibt, sieht exakt aus wie "es gab halt nichts Neues".
// Der Waechter misst deshalb das ERGEBNIS statt der Absicht: `updated` in
// news_ai.json muss sich bewegen. Bei zwei Laeufen taeglich sind 40 Stunden
// grosszuegig - ein einzelner ausgefallener Lauf faellt noch nicht auf, zwei
// hintereinander schon.
// ⚠ Kein `fail` bei einer fehlenden Datei: sie liegt im Repo, und wenn
// jemand die Einordnung bewusst ausbaut, ist das kein Regelverstoss.
// Gegenprobe beim Einbau: `updated` auf 2026-09-01 gesetzt -> Treffer;
// zurueckgesetzt -> 0.
// ⚠⚠ NACHTRAG GLEICHEN TAGES - der Waechter hatte selbst einen Konstruktions-
// fehler. In der ersten Fassung war die Veralterung ein hartes `fail`. Damit
// haengt ein CODE-Push an der DATEN-Aktualitaet: solange die Routine nicht
// liefert, kommt niemand mehr an `node check/all.js` vorbei - auch nicht mit
// einer voellig unbeteiligten CSS-Korrektur, und nicht einmal mit dem Push
// der Reparatur dieses Wächters selbst. Genau das ist beim Einbau passiert.
// Ein kaputter Zulieferer darf laut sein, aber er darf nicht die Werkstatt
// abschliessen.
// Deshalb: eine BEKANNTE, offene Stoerung darf quittiert werden - aber nur
// befristet. Bis AI_STOERUNG_BIS meldet der Waechter die Veralterung laut auf
// stderr und laesst den Lauf durch; danach ist er wieder hart rot, egal was
// hier steht. Das Datum zu verlaengern ist eine bewusste Handlung, die im
// Diff sichtbar ist - im Gegensatz zu einem Waechter, den man irgendwann
// entnervt ganz herausnimmt.
// Unbekanntes Ausbleiben bleibt hart rot: ohne Quittung faellt der Lauf.
// ⚠⚠⚠ ERWEITERT 2026-09-11 auf ALLE Zulieferer, und zwar nach einem echten
// Ausfall, den der Waechter in seiner alten Fassung NICHT gesehen haette.
// Nutzer-Meldung: "der stuendliche Workflow gibt keine Daten mehr, das ist
// ueber 6 Tage alt" (Retail-Sentiment, letzter Balken Fr 04.09.). Gemessen:
//   news_data.json        4,5 h alt   <- Workflow lief also einwandfrei
//   sentiment_data.json 104,3 h alt   <- ein einzelner SCHRITT lieferte nicht
// Nur news_ai.json zu ueberwachen hat die Klasse also bloss zur Haelfte
// abgedeckt. Ueberwacht wird ab jetzt jede Datei mit `updated`-Feld gegen
// ihren eigenen Takt.
// ⚠ Grenzen bewusst grosszuegig (Lehre aus Regel 7): ein Waechter, der ohne
// echten Fund rot wird, wird weggeklickt. Die Schwelle liegt jeweils bei rund
// ZWEI ausgefallenen Laeufen, nicht bei einem.
const heuteStr = new Date().toISOString().slice(0, 10);
const FRISCHE = [
  // Datei,                Stunden, Takt,                                   quittiert bis
  ['news_ai.json',              40, 'zweimal taeglich (geplante Sitzung)',  '2026-09-17'],
  ['sentiment_data.json',       30, 'stuendlicher Workflow',                '2026-09-13'],
  ['news_data.json',            30, 'stuendlicher Workflow',                null],
  ['seasonality_data.json',     30, 'stuendlicher Workflow',                null],
  // COT erscheint freitags ~21:30 UTC fuer den Dienstag davor. Neun Tage
  // lassen einen ausgefallenen Freitag durchgehen, zwei nicht.
  ['cot_data.json',           9*24, 'woechentlich (CFTC, freitags)',        null],
];
FRISCHE.forEach(([datei, maxStd, takt, quittungBis]) => {
  let roh;
  try { roh = fs.readFileSync(datei, 'utf8'); } catch (e) { return; }  // bewusst ausgebaut: kein Verstoss
  let d;
  try { d = JSON.parse(roh); } catch (e) {
    fail('Datenfeed ist kein gueltiges JSON',
      `${datei} laesst sich nicht parsen (${e.message}). Die App faellt dann stumm auf einen ` +
      `Ersatzpfad zurueck - sichtbar nur daran, dass Werte fehlen.`);
    return;
  }
  const t = Date.parse(d && d.updated);
  if (!d || !d.updated || Number.isNaN(t)) {
    fail('Datenfeed ohne brauchbaren Zeitstempel',
      `${datei} hat kein lesbares Feld "updated" (gefunden: ${JSON.stringify(d && d.updated)}). ` +
      `Ohne Zeitstempel laesst sich nicht sagen, ob der Zulieferer noch laeuft - und ein Ausfall ` +
      `sieht dann aus wie "es gab halt nichts Neues".`);
    return;
  }
  const alt = (Date.now() - t) / 3600000;
  if (alt <= maxStd) return;
  const text =
    `${datei} wurde zuletzt vor ${alt.toFixed(1)} Stunden geschrieben (${d.updated}), erlaubt sind ` +
    `${maxStd} - Takt: ${takt}. ⚠ ZUERST "git pull" - eine alte Arbeitskopie sieht genauso aus wie ein Ausfall, und das ist der haeufigere Fall (2026-09-12 selbst erlebt: lokal 31,9 h, auf main 8 h). Bleibt es danach rot: ⚠ Ein GRUENER Workflow-Lauf ist KEIN Beleg: am 2026-09-11 war der ` +
    `Sentiment-Schritt fuenf Tage lang gruen und lieferte nichts, weil er unter "bash -e" in einer ` +
    `Debug-Zeile starb und continue-on-error das verdeckte. ⚠ Und die LAUFZEIT des Schritts taugt ` +
    `NICHT als Merkmal: der abgestuerzte Lauf brauchte eine Sekunde - der reparierte danach ebenfalls. ` +
    `Verlaesslich ist nur dieses Feld hier. Also im Protokoll nachsehen, ob die Ausgabe des Schritts ` +
    `VOLLSTAENDIG ist (bis zur letzten Zeile seines Node-Blocks), nicht wie lange er lief.`;
  // Eine BEKANNTE, offene Stoerung darf befristet quittiert werden - sonst
  // haengt jeder Code-Push an der Daten-Aktualitaet, und nicht einmal die
  // Reparatur selbst kaeme durch (genau das ist am 2026-09-10 passiert).
  // Ein kaputter Zulieferer darf laut sein, aber nicht die Werkstatt
  // abschliessen. Das Datum zu verlaengern ist eine bewusste Handlung und im
  // Diff sichtbar - anders als ein Waechter, den man entnervt ganz ausbaut.
  if (quittungBis && heuteStr <= quittungBis)
    console.error(`\n  [WARNUNG] Datenfeed kommt nicht mehr nach\n  ${text}\n` +
      `  Quittiert bis ${quittungBis} - danach faellt der Lauf hart. Nicht einfach verlaengern.\n`);
  else
    fail('Datenfeed kommt nicht mehr nach',
      text + (quittungBis ? ` Die Quittung lief am ${quittungBis} ab.` : ''));
});

// ── Regel 10: eine Debug-Zeile darf einen Workflow-Schritt nie beenden ──
// ⚠ GEMESSEN 2026-09-11 - das ist die URSACHE des Ausfalls oben, nicht bloss
// eine Vorsichtsmassnahme. Im Sentiment-Schritt stand als reine Diagnose:
//     head -c 200 sent_retail.json 2>/dev/null
// Die Datei entsteht NUR innerhalb des Myfxbook-Login-Zweigs. Ab dem
// 2026-09-06 scheiterte der Login, die Datei fehlte, `head` gab Exit 1 - und
// weil GitHub jeden run-Block mit `bash -e` startet, war der Schritt genau
// dort zu Ende. Der Node-Block darunter, der ALLE Sentiment-Quellen schreibt
// und `updated` setzt, lief nie wieder.
// Drei Dinge machten es unsichtbar: `2>/dev/null` verschluckte die Meldung,
// `continue-on-error` hielt den Lauf gruen, und spaetere Schritte fassten die
// Datei weiter an, sie sah also frisch aus. Der Schritt lief eine Sekunde.
// Regel: ein nacktes head/tail/cat/wc/stat auf eine Datei, die nicht
// garantiert existiert, MUSS abgesichert sein - per `|| ...`, per
// `if [ -s ... ]` oder ueber die Hilfsfunktion `zeig`.
// Gegenprobe beim Einbau: die alte Zeile wieder eingesetzt -> Treffer;
// zurueck auf zeig() -> 0.
// ⚠ Die Zaehlung steht bei `head -c 200 datei` als EIGENES Argument hinter
// dem Schalter. Die erste Fassung dieses Musters fing deshalb "200" als
// Dateinamen, fand keine Endung und liess die Zeile durch - der Waechter
// haette den Fehler, fuer den er gebaut wurde, nicht gemeldet. Aufgefallen
// nur durch die Gegenprobe. Deshalb sind reine Zahlen hier ausdruecklich
// Teil der Schalter-Gruppe.
const NACKT_RE = /(?:^|;|&&)\s*(head|tail|cat|wc|stat)\s+(?:(?:-[^\s]+|\d+)\s+)*("[^"]+"|'[^']+'|[^\s;|&<>]+)/;
try {
  fs.readdirSync('.github/workflows').filter(f => /\.ya?ml$/.test(f)).forEach(f => {
    const pfad = '.github/workflows/' + f;
    const zeilen = fs.readFileSync(pfad, 'utf8').split('\n');
    zeilen.forEach((z, i) => {
      if (/<</.test(z)) return;                          // Heredoc, kein Lesen
      if (/\|\|/.test(z)) return;                        // hat einen Auffangzweig
      if (/^\s*(if|elif|while|until)\s/.test(z)) return; // steht selbst in einer Bedingung
      if (/^\s*#/.test(z)) return;
      const m = z.match(NACKT_RE);
      if (!m) return;
      if (!/\.(json|xml|csv|html?|txt|xls[xm]?)\b/.test(m[2])) return;  // keine Datei-Leseoperation
      // ⚠ Die Existenzpruefung steht oft eine Zeile HOEHER:
      //     if [ -s invcal.json ]; then
      //       head -c 300 invcal.json; echo
      // Zeilenweise gelesen sieht das wie der Fehler aus, ist aber sauber.
      // Beim Einbau hat der Waechter genau hier einen Fehlalarm geworfen -
      // und ein Waechter, der ohne echten Fund rot wird, wird irgendwann
      // weggeklickt (Lehre aus Regel 7). Deshalb ein Blick auf die
      // vorangehenden Zeilen: wird DIESE Datei dort auf Existenz geprueft,
      // ist die Leseoperation abgesichert.
      const datei = m[2].replace(/^["']|["']$/g, '');
      const davor = zeilen.slice(Math.max(0, i - 6), i).join('\n');
      if (new RegExp('\\[\\s*-[sfe]\\s+[^\\]]*' + datei.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(davor)) return;
      fail('Debug-Zeile kann den Workflow-Schritt toeten',
        `${pfad}:${i + 1} liest ${m[2]} mit ${m[1]} ohne Absicherung. Fehlt die Datei, gibt der Befehl ` +
        `Exit 1 und beendet unter "bash -e" den GANZEN Schritt - alles darunter laeuft nie mehr. Genau so ` +
        `fielen ab dem 2026-09-06 fuenf Tage lang saemtliche Sentiment-Quellen aus, bei gruenem Lauf. ` +
        `Absichern mit "|| true", einem "if [ -s datei ]" oder der Funktion zeig().`);
    });
  });
} catch (e) {}

if (F.length) {
  console.error('REGEL-VERSTOSS:\n');
  F.forEach(x => console.error(`  [${x.regel}] ${x.text}\n`));
  process.exit(1);
}
console.log(`[rules] ok (Basis ${BASE}, ${geaendert.length} geaenderte Dateien)`);
