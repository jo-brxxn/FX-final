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
  { n: 'rules',     d: 'Versions-Bumps und Workflow-Ausgaben',                   f: 'check/rules.js',     args: [basis],      browser: false },
  { n: 'structure', d: 'doppelte ids und wiederholte HTML-Bloecke',              f: 'check/structure.js', args: ['index.html'], browser: false },
  { n: 'score',     d: 'Rechenkette, _symId, Bias gegen Rohdaten, Idempotenz',   f: 'check/score.js',     args: ['normalized'], browser: true },
  { n: 'score-cl',  d: 'dasselbe im Modus classic',                              f: 'check/score.js',     args: ['classic'],    browser: true },
  { n: 'display',   d: 'angezeigte Scores im DOM gegen den Sollwert',            f: 'check/display.js',   args: ['normalized'], browser: true },
  { n: 'runtime',   d: 'alle Tabs, Modals und Zustaende ohne JS-Fehler',         f: 'check/runtime.js',   args: [],           browser: true },
  { n: 'layout',    d: 'Ueberlauf ueber Viewports und Karten',                   f: 'check/layout.js',    args: [],           browser: true },
  { n: 'dashboard', d: 'ueberlappende Karten und Zonen-Ueberlauf',               f: 'check/dashboard.js', args: [],           browser: true },
  { n: 'cards',     d: 'Text/Elemente verlassen nie den Kartenrand (alle Tabs)', f: 'check/cards.js',     args: [],           browser: true },
  { n: 'nav',       d: 'Sidebar-Klickregel, mit Maus UND mit Touch',          f: 'check/nav.js',       args: [],           browser: true },
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
