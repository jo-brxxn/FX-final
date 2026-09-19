// ── ACHSEN: GLEICHE ABSTAENDE, RUNDE ZAHLEN, SYMMETRISCH ────────────────
//
// Anlass (Nutzer-Bildvergleich 2026-09-19): die Balance-Karte sollte aussehen
// wie ein gezeigtes Vergleichsbild - "das aktuelle ist irgendwie schlecht und
// falsch". Die Achse stand dort auf +0.48 / +0.24 / 0.00 / -0.24 / -0.48,
// wo jede Finanzgrafik 0.1er-Schritte zeigt.
//
// ⚠ Beim Suchen nach der Fehlerklasse (CLAUDE.md Regel 8.4) kam heraus, dass
// dasselbe Muster - [maxA, maxA/2, 0, -maxA/2, -maxA] - an VIER Stellen
// stand. Gemessen im Browser, vor dem Fix:
//     Retail-Netto EURUSD   +67%  +33%  0%  -33%  -67%
//     Retail-Netto XAUUSD   +44%  +22%  0%  -22%  -44%
//     Retail-Netto GBPUSD   +81%  +40%  0%  -40%  -80%
// Die letzte Zeile ist der Beweis, dass es nicht nur haesslich ist: bei
// maxA = 80,5 rundet Math.round oben auf 81 und unten auf -80. Dieselbe
// Achse traegt zwei verschiedene Zahlen fuer denselben Abstand. Wer die
// Balkenhoehe ablesen will, liest falsch.
//
// Dieser Waechter prueft deshalb nicht EINE Stelle, sondern JEDE gerenderte
// Y-Achse der App auf drei Eigenschaften, die immer gelten muessen:
//   (1) gleiche Abstaende zwischen benachbarten Teilstrichen,
//   (2) keine zwei Striche mit derselben Beschriftung,
//   (3) bei einer Achse mit Nulllinie: oben und unten spiegelgleich.
// Damit faellt auch eine kuenftige neue Grafik auf, die das Muster kopiert.
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

// Die Ansichten, in denen Y-Achsen mit Zahlen vorkommen. Jede ist ein
// Zustand, den der Nutzer wirklich herstellen kann.
const ANSICHTEN = [
  { n: 'Balance marktweit',   f: () => { showTab('sent'); setSentSub('netflow'); setPcAsset(''); setPcRange('MAX'); } },
  { n: 'Balance Gold 3M',     f: () => { showTab('sent'); setSentSub('netflow'); setPcAsset('GOLD'); setPcRange(3); } },
  { n: 'Balance SP500',       f: () => { showTab('sent'); setSentSub('netflow'); setPcAsset('SP500'); setPcRange('MAX'); } },
  { n: 'Put/Call marktweit',  f: () => { showTab('sent'); setSentSub('putcall'); setPcAsset(''); setPcRange('MAX'); } },
  { n: 'Put/Call USD',        f: () => { showTab('sent'); setSentSub('putcall'); setPcAsset('USD'); setPcRange('MAX'); } },
  { n: 'Retail EURUSD',       f: () => { showTab('sent'); setSentSub('retail'); setSentSym('EURUSD'); } },
  { n: 'Retail GBPUSD',       f: () => { showTab('sent'); setSentSub('retail'); setSentSym('GBPUSD'); } },
  { n: 'Retail XAUUSD',       f: () => { showTab('sent'); setSentSub('retail'); setSentSym('XAUUSD'); } },
];

// ── DIE EINE PRUEFUNG ───────────────────────────────────────────────────
// ⚠ Bewusst eine Funktion fuer Hauptlauf UND Gegenprobe. Erste Fassung hatte
// zwei getrennte Toleranz-Rechnungen; als die eine nachgeschaerft wurde,
// pruefte die Gegenprobe weiter mit der alten und meldete die echten
// Altfehler als "nicht erkannt". Derselbe Fehler, den dieses Projekt beim
// Put/Call schon einmal hatte: zwei Stellen entscheiden dasselbe.
function achsenBefunde(werte) {
  const diffs = werte.slice(1).map((v, i) => +(werte[i] - v).toFixed(6));
  // Toleranz relativ zum ABSTAND, nicht zur Achsenspanne: die alte
  // GBPUSD-Achse (41,40,40,40) lag bei 2% der Spanne noch INNERHALB der
  // Toleranz und waere durchgewunken worden - genau der gesuchte Fehler.
  // Ein halbes Prozent des Abstands laesst Fliesskomma-Reste durch
  // (0.5-0.4 = 0.0999…) und faengt einen ganzen Zaehler wie 41-vs-40.
  const mittel = diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length;
  const tol = Math.max(1e-6, Math.abs(mittel) * 0.005);
  const mx = Math.max(...werte), mn = Math.min(...werte);
  return {
    diffs, tol,
    ungleich: diffs.some(d => Math.abs(d - diffs[0]) > tol),
    // Symmetrie nur bei einer ECHTEN beidseitigen Achse: die Put/Call-Ratio
    // ist nicht-negativ und laeuft von 0 aufwaerts (0…100) - dort ist
    // "unsymmetrisch" der richtige Zustand, kein Fehler.
    beidseitig: mn < -1e-9 && mx > 1e-9,
    unsymmetrisch: (mn < -1e-9 && mx > 1e-9) && Math.abs(mx + mn) > tol,
    oben: mx, unten: mn,
  };
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('dmfx_app_choice', 'fx'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => { ['introOv', 'lockScreen', 'appChoiceOv'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  await wartenBisDatenDa(p);

  const F = [], ok = [];
  let geprueft = 0;

  for (const a of ANSICHTEN) {
    try { await p.evaluate(fn => { (new Function(fn))(); }, '(' + a.f.toString() + ')()'); }
    catch (e) { F.push({ ansicht: a.n, was: 'Ansicht nicht herstellbar', detail: String(e).slice(0, 120) }); continue; }
    await p.waitForTimeout(700);

    const achse = await p.evaluate(() => {
      const svg = document.querySelector('#sentBody svg') || document.querySelector('.cot-card svg');
      if (!svg) return null;
      // Y-Achsen-Beschriftungen: linksbuendig am Rand ausgerichtete Zahlen.
      // Prozentzeichen und Vorzeichen abstreifen, Reihenfolge nach der
      // gezeichneten Position (oben -> unten), nicht nach dem DOM.
      const texte = [...svg.querySelectorAll('text')]
        .filter(t => t.getAttribute('text-anchor') === 'end')
        .map(t => ({ roh: t.textContent.trim(), y: +t.getAttribute('y') }))
        .filter(o => /^[+-]?\d+(\.\d+)?%?$/.test(o.roh));
      if (texte.length < 3) return { zuWenig: texte.length, labels: texte.map(t => t.roh) };
      texte.sort((x, y) => x.y - y.y);
      return { labels: texte.map(t => t.roh), werte: texte.map(t => parseFloat(t.roh)) };
    });

    if (!achse) { F.push({ ansicht: a.n, was: 'kein SVG gefunden' }); continue; }
    if (achse.zuWenig != null) { ok.push(`${a.n}: nur ${achse.zuWenig} Achsenzahlen - uebersprungen`); continue; }

    const { labels, werte } = achse;
    ok.push(`${a.n}: ${labels.join(' ')}`);

    // (1) Gleiche Abstaende  (2) keine doppelte Zahl  (3) Symmetrie
    const b = achsenBefunde(werte);
    geprueft += b.beidseitig ? 3 : 2;
    if (b.ungleich) F.push({ ansicht: a.n, was: 'ungleiche Abstaende zwischen den Teilstrichen', labels, diffs: b.diffs });
    if (new Set(labels).size !== labels.length)
      F.push({ ansicht: a.n, was: 'zwei Teilstriche tragen dieselbe Zahl', labels });
    if (b.unsymmetrisch)
      F.push({ ansicht: a.n, was: `Achse mit Nulllinie ist nicht spiegelgleich (oben ${b.oben}, unten ${b.unten})`, labels });
  }

  // ── GEGENPROBE ────────────────────────────────────────────────────────
  // Ein Waechter, der nur gruen kann, prueft nichts: die drei Regeln werden
  // gegen die GEMESSENEN Altwerte gefahren und muessen daran scheitern.
  const gegen = [
    { n: 'alt: Retail GBPUSD', labels: ['+81%', '+40%', '0%', '-40%', '-80%'], erwartet: ['ungleich', 'unsymmetrisch'] },
    { n: 'alt: Retail EURUSD', labels: ['+67%', '+33%', '0%', '-33%', '-67%'], erwartet: ['ungleich'] },
    { n: 'alt: Balance marktweit', labels: ['+0.13', '+0.10', '+0.07', '+0.05', '+0.03', '0.00', '-0.03', '-0.05', '-0.07', '-0.10', '-0.13'], erwartet: ['ungleich'] },
  ];
  const gegenFehler = [];
  for (const g of gegen) {
    const b = achsenBefunde(g.labels.map(parseFloat));
    geprueft++;
    if (g.erwartet.includes('ungleich') && !b.ungleich)
      gegenFehler.push(`${g.n}: ungleiche Abstaende NICHT erkannt (${b.diffs.join(',')}, Toleranz ${b.tol}) - die Pruefung waere blind`);
    if (g.erwartet.includes('unsymmetrisch') && !b.unsymmetrisch)
      gegenFehler.push(`${g.n}: Unsymmetrie NICHT erkannt (oben ${b.oben}, unten ${b.unten}) - die Pruefung waere blind`);
  }
  gegenFehler.forEach(t => F.push({ ansicht: 'GEGENPROBE', was: t }));

  console.log(ok.join('\n'));
  if (F.length) console.log('\n' + F.map(f => `  ✗ ${f.ansicht}: ${f.was}` + (f.labels ? `\n      ${f.labels.join(' ')}` : '') + (f.diffs ? `\n      Abstaende: ${f.diffs.join(', ')}` : '')).join('\n'));
  if (perr.length) console.log('\npageerrors: ' + perr.length + ' ' + perr.slice(0, 2).join(' | '));
  console.log(`\n"geprueft": ${geprueft}`);
  console.log(`"fehler": ${F.length + perr.length}`);
  await b.close();
  process.exit(F.length + perr.length ? 1 : 0);
})();
