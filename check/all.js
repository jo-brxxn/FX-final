#!/usr/bin/env node
// ── ALLE WAECHTER ─────────────────────────────────────────────────
// Ein Befehl, der vor jedem Push gruen sein muss:
//     node check/all.js                 (alles, startet selbst einen Server)
//     node check/all.js --static        (nur ohne Browser - schnell)
//     node check/all.js --base <ref>    (Vergleichsbasis fuer die Regeln)
//
// Jede Pruefung hier existiert, weil der zugehoerige Fehler schon einmal
// beim Nutzer angekommen ist. Neue Pruefung dazu = neuer Eintrag in PRUEFUNGEN.
const { spawnSync } = require('child_process');
const http = require('http');

const args = process.argv.slice(2);
const nurStatisch = args.includes('--static');
const basisIdx = args.indexOf('--base');
const basis = basisIdx >= 0 ? args[basisIdx + 1] : (process.env.CHECK_BASE || 'origin/main');
const PORT = process.env.CHECK_PORT || '8935';
const URL = `http://127.0.0.1:${PORT}/index.html`;

const PRUEFUNGEN = [
  { n: 'syntax',    d: 'JS der <script>-Bloecke, YAML und jeder run-Block',      f: 'check/syntax.js',    args: [],           browser: false },
  // ⚠ scorediff/summarydiff MUESSEN vor rules laufen: rules liest deren
  // Ergebnis, um zu entscheiden, ob ein SCORE_MODEL_VERSION-/
  // SUMMARY_ENGINE_VERSION-Bump wirklich noetig ist.
  { n: 'scorediff', d: 'rechnet jeden Score gegen die Basis nach',              f: 'check/scorediff.js', args: [basis],      browser: true },
  { n: 'summarydiff', d: 'vergleicht jeden Kartentext gegen die Basis',         f: 'check/summarydiff.js', args: [basis],    browser: true },
  { n: 'rules',     d: 'Versions-Bumps und Workflow-Ausgaben',                   f: 'check/rules.js',     args: [basis],      browser: false },
  { n: 'structure', d: 'doppelte ids und wiederholte HTML-Bloecke',              f: 'check/structure.js', args: ['index.html'], browser: false },
  { n: 'score',     d: 'Rechenkette, _symId, Bias gegen Rohdaten, Idempotenz',   f: 'check/score.js',     args: ['normalized'], browser: true },
  { n: 'score-cl',  d: 'dasselbe im Modus classic',                              f: 'check/score.js',     args: ['classic'],    browser: true },
  { n: 'display',   d: 'angezeigte Scores im DOM gegen den Sollwert',            f: 'check/display.js',   args: ['normalized'], browser: true },
  { n: 'runtime',   d: 'alle Tabs, Modals und Zustaende ohne JS-Fehler',         f: 'check/runtime.js',   args: [],           browser: true },
  { n: 'quickcap',  d: 'Schnellerfassung: Zerlegung an echten Beispielen',    f: 'check/quickcapture.js', args: [],     browser: false },
  { n: 'putcall',   d: 'Put/Call: eine Schwellen-Wahrheit, passend zur eigenen Reihe', f: 'check/putcall.js', args: [], browser: false },
  { n: 'datum',     d: 'Jedes Datum mit Jahr, und zwar zweistellig', f: 'check/datum.js', args: [], browser: true },
  { n: 'achsen',    d: 'Achsen: gleiche Abstaende, runde Zahlen, spiegelgleich um die Null', f: 'check/achsen.js', args: [], browser: true },
  { n: 'html',      d: 'Kein zerbrochenes HTML-Attribut (rohes " im Attributtext)', f: 'check/html.js', args: [], browser: true },
  { n: 'notizen',   d: 'Notizen ueberleben Sync/Undo/Import mit Text und Ordnern', f: 'check/notizen.js',  args: [],           browser: true },
  { n: 'layout',    d: 'Ueberlauf ueber Viewports und Karten',                   f: 'check/layout.js',    args: [],           browser: true },
  { n: 'dashboard', d: 'ueberlappende Karten und Zonen-Ueberlauf',               f: 'check/dashboard.js', args: [],           browser: true },
  { n: 'symbole',   d: 'Flaggen ein Stueck, Glanz begrenzt, jede Karte ein Symbol', f: 'check/symbole.js', args: [], browser: true },
  { n: 'uebergang', d: 'Wisch beim Seitenwechsel, Panel, History-Karte fest', f: 'check/uebergang.js', args: [], browser: true },
  { n: 'rahmen',    d: 'dunkle Koepfe/Bedienelemente: jeder Text lesbar (5 helle Vorlagen)', f: 'check/rahmen.js', args: [], browser: true },
  { n: 'cards',     d: 'Text/Elemente verlassen nie den Kartenrand (alle Tabs)', f: 'check/cards.js',     args: [],           browser: true },
  { n: 'nav',       d: 'Sidebar-Klickregel, mit Maus UND mit Touch',          f: 'check/nav.js',       args: [],           browser: true },
  // Design-Vorlagen des FX Analyst Pro: rechnet je Vorlage Kontrast und
  // Bedeutung nach. ⚠ Bedeutung wird ueber den FARBTON geprueft, nicht ueber
  // Helligkeit - Blau und Rot koennen gleich hell und trotzdem eindeutig sein.
  { n: 'typo',      d: 'Schrifthierarchie in allen 34 Fenstern',             f: 'check/typo.js',      args: [],           browser: true },
  { n: 'theme',     d: 'Design-Vorlagen: Kontrast, Bedeutungsfarben, Tokens',   f: 'check/theme.js',     args: [],           browser: true },
  { n: 'hintergrund',d:'Kontrast unter jedem waehlbaren Hintergrund (am Pixel)', f: 'check/hintergrund.js', args: [],        browser: true },
  { n: 'kerzen',    d: 'Kerzen: ein Tag, kein Wochenende, eigene Farben, keine erfundenen Dochte', f: 'check/kerzen.js', args: [], browser: true },
  { n: 'seasretail',d: 'Saisonalitaet/Retail: Schwellen, Deckel, Monats-Markierung', f: 'check/seasretail.js', args: [], browser: true },
  { n: 'feedgroesse',d: 'Live-Feeds: Groessendeckel, keine Einrueckung, eine Frist', f: 'check/feedgroesse.js', args: [], browser: false },
  // Beide 2026-09-19 neu, beide aus einem Fehler DIESER Sitzung: ein
  // CSS-Kommentar, der Regeln verschluckt hat, und ein Inline-style, der eine
  // Zustandsregel wirkungslos machte. Statisch, deshalb im schnellen Teil.
  { n: 'csskomm',   d: 'Kein CSS-Kommentar verschluckt Regeln',                  f: 'check/csskommentar.js', args: [], browser: false },
  { n: 'inlinest',  d: 'Kein Inline-style, der eine Zustandsregel aushebelt',    f: 'check/inlinestyle.js',  args: [], browser: false },
  { n: 'kartenlook',d: 'Kartenoptik und Kopfleiste der Asset-Seite', f: 'check/kartenlook.js', args: [], browser: true },
  { n: 'regime',     d: 'Regime Radar: Zahlen gegen die Rohdaten, Nenner, Kernbedingung',  f: 'check/regime.js',    args: [],           browser: true },
  { n: 'historie',   d: 'Historie: Score-Linie, Alterung nachgerechnet, jeder Tag einzeln', f: 'check/historie.js',  args: [],           browser: true },
  { n: 'backtester', d: 'Backtester: Sitzungen, Releases, Kursreaktion gegen die Rohdaten', f: 'check/backtester.js',args: [],           browser: true },
  { n: 'erklaerung',d: 'Erklaerungen hinter dem ⓘ, zentriert, nicht in der Karte', f: 'check/erklaerung.js',args: [],        browser: true },
];

function serverErreichbar() {
  return new Promise(ok => {
    const anf = http.get(URL, r => { r.resume(); ok(true); });
    anf.on('error', () => ok(false));
    anf.setTimeout(2500, () => { anf.destroy(); ok(false); });
  });
}

(async () => {
  const liste = PRUEFUNGEN.filter(p => !nurStatisch || !p.browser);
  // Der Testserver wird BEWUSST nicht von hier gestartet: ein Kindprozess,
  // der den Lauf ueberdauert, verhaelt sich je nach Umgebung unterschiedlich.
  // Lokal einmal pro Sitzung starten, in der CI als eigener Schritt:
  //   python3 -m http.server 8935 --directory . &
  if (liste.some(p => p.browser) && !(await serverErreichbar())) {
    console.error(`Kein Testserver auf ${URL}.\n` +
      `  Starten mit:  python3 -m http.server ${PORT} --directory . &\n` +
      `  Oder nur die statischen Pruefungen fahren:  node check/all.js --static`);
    process.exit(1);
  }
  const fehlgeschlagen = [];
  for (const p of liste) {
    const t0 = Date.now();
    const r = spawnSync('node', [p.f, ...p.args], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: Object.assign({}, process.env, { CHECK_URL: URL })
    });
    const s = Math.round((Date.now() - t0) / 100) / 10;
    const aus = (r.stdout || '') + (r.stderr || '');
    // Die Playwright-Skripte melden Befunde als JSON und beenden mit 0 -
    // deshalb zusaetzlich auf einen Befund-Zaehler groesser 0 pruefen.
    const zahl = (aus.match(/"(?:fehler|total)"\s*:\s*(\d+)/) || [])[1];
    const schlecht = r.status !== 0 || (zahl != null && Number(zahl) > 0);
    console.log(`${schlecht ? '✗' : '✓'} ${p.n.padEnd(10)} ${String(s + 's').padStart(6)}  ${p.d}`);
    if (schlecht) { fehlgeschlagen.push(p.n); console.log(aus.split('\n').slice(0, 40).map(l => '     ' + l).join('\n')); }
  }
  if (fehlgeschlagen.length) {
    console.error(`\nNICHT BESTANDEN: ${fehlgeschlagen.join(', ')} - nicht pushen.`);
    process.exit(1);
  }
  console.log('\nAlle Waechter gruen.');
})();
