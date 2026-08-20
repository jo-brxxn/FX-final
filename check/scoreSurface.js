#!/usr/bin/env node
// ── SCORE-OBERFLAECHE, AUTOMATISCH AUS DEM CODE ABGELEITET ────────────
// Bisher stand in rules.js eine HANDGEPFLEGTE Liste score-relevanter
// Funktionen. Die veraltet zwangslaeufig: wer eine neue Hilfsfunktion in die
// Rechenkette einbaut und die Liste nicht ergaenzt, umgeht den
// SCORE_MODEL_VERSION-Zwang, ohne es zu merken.
//
// Stattdessen wird die Menge jetzt bei JEDEM Lauf neu aus index.html
// abgeleitet: ausgehend von festen WURZELN (die Rechenkette und die fuenf
// Bias-Pfade) werden alle Funktionen eingesammelt, die von dort aus
// aufgerufen werden - zwei Ebenen tief - plus die GROSSGESCHRIEBENEN
// Konstanten, die in diesen Koerpern vorkommen. Damit waechst die Abdeckung
// automatisch mit dem Code mit: eine neue Funktion, die von indScoreParts
// aufgerufen wird, ist ab dem naechsten Lauf ohne Zutun score-relevant.
const fs = require('fs');

const WURZELN = [
  'indScoreParts', 'indScore', 'rubScore', 'symScore', 'symScoreCmp', 'symScoreAvg',
  'pairScore', 'symTrackedCount', 'symOwnZ', 'symStrength10',
  'applyIndDataFeed', 'applyBondDataFeed', 'applyCotDataFeed', 'applySentimentFeed',
  'syncIndicatorBiases', 'applyTrendModel', 'recomputeRubricAutoBias',
  'deriveMacroBiasAll', 'recomputeRiskCorr', 'sentEval',
  // ⚠ Blinder Fleck, gefunden am 2026-08-20: eine Funktion, die die MENGE der
  // Indikatoren aendert, verschiebt JEDEN angezeigten Score - ohne dass eine
  // einzige Score-FORMEL angefasst wird. `symScoreCmp` teilt durch
  // `symTrackedCount`, also wirkt jeder hinzugefuegte oder entfernte
  // Indikator direkt auf die aufgezeichnete Reihe. Konkret: `addSurveyInds`
  // hat fuenf Umfragen bei ALLEN Assets angelegt, obwohl es sie nur fuer je
  // eine Waehrung gibt - sechs Waehrungen trugen dadurch je fuenf
  // Karteileichen im Divisor. Die Bereinigung verschob BTC von 3,8 auf 3,4.
  // Die Struktur-Migrationen gehoeren deshalb in die Score-Oberflaeche.
  'addSurveyInds', 'migrateRubInds', 'moveYieldIndsToInflation',
  'migrateRiskEnvRub', 'stripGeopoliticsRub', 'mkRubs'
];
const TIEFE = 2;
// Reine Darstellung/Bequemlichkeit - aendert nie einen Score-WERT.
const IGNORIEREN = new Set(['escH', 'escJs', 'escJH', 'icn', 'todayStr', 'fmtDayHdr',
  'uid', 'console', 'Math', 'Number', 'String', 'Object', 'Array', 'JSON', 'Date',
  'isFinite', 'parseFloat', 'parseInt', 'Set', 'Map', 'require', 'if', 'for', 'while',
  'switch', 'catch', 'return', 'function', 'typeof', 'new']);

function inlineJs(html) {
  return [...html.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/\ssrc=/.test(m[1])).map(m => m[2]).join('\n');
}

// Alle Top-Level-Funktionen mit ihrem Koerper (Klammer-Tiefe, damit auch
// mehrzeilige Funktionen sauber erfasst werden).
function funktionen(js) {
  const map = {};
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(js))) {
    const name = m[1];
    let i = js.indexOf('{', re.lastIndex);
    if (i < 0) continue;
    let tiefe = 0, j = i;
    for (; j < js.length; j++) {
      const c = js[j];
      if (c === '{') tiefe++;
      else if (c === '}') { tiefe--; if (!tiefe) break; }
    }
    if (!map[name]) map[name] = js.slice(i, j + 1);
  }
  return map;
}

function ableiten(datei) {
  const js = inlineJs(fs.readFileSync(datei || 'index.html', 'utf8'));
  const fn = funktionen(js);
  // Alle tatsaechlich deklarierten Konstantennamen (const/let/var GROSS...).
  const deklariert = new Set([...js.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=/g)].map(m => m[1]));
  const funktionsMenge = new Set(WURZELN.filter(w => fn[w]));
  const konstanten = new Set();
  let rand = [...funktionsMenge];
  for (let d = 0; d < TIEFE; d++) {
    const naechste = [];
    rand.forEach(n => {
      const koerper = fn[n]; if (!koerper) return;
      // Aufrufe: NAME(
      [...koerper.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].forEach(x => {
        const c = x[1];
        if (IGNORIEREN.has(c) || !fn[c] || funktionsMenge.has(c)) return;
        funktionsMenge.add(c); naechste.push(c);
      });
      // Konstanten: GROSS_GESCHRIEBEN - aber NUR, wenn der Name im File auch
      // wirklich als Konstante deklariert ist. Ohne diesen Abgleich landen
      // deutsche Kommentarwoerter (IMMER, KEIN, NICHT ...) in der Liste.
      [...koerper.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].forEach(x => {
        if (!IGNORIEREN.has(x[1]) && deklariert.has(x[1])) konstanten.add(x[1]);
      });
    });
    rand = naechste;
  }
  return { funktionen: [...funktionsMenge].sort(), konstanten: [...konstanten].sort() };
}

module.exports = { ableiten };

if (require.main === module) {
  const r = ableiten(process.argv[2] || 'index.html');
  console.log(`[scoreSurface] ${r.funktionen.length} Funktionen, ${r.konstanten.length} Konstanten`);
  console.log('Funktionen: ' + r.funktionen.join(', '));
  console.log('Konstanten: ' + r.konstanten.join(', '));
}
