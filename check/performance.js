// ══ WAECHTER: PERFORMANCE (ruckelfrei, ohne Leerlauf-Arbeit) ═══════════════
//
// Nutzer 2026-10-03: "Die Webseite hat Performance Probleme also es ruckelt
// manchmal und Animationen und so sind einfach nicht clean und es hakt und
// braucht teilweise laenger zu laden".
//
// GEMESSEN vorher (Chromium, 1180x820, ungedrosselt):
//   - Trends: 3292 Punkte mit je EIGENER Einblend-Animation -> 2,1 s PrePaint,
//     2,3 s Stillstand beim Seitenwechsel, danach ~250 ms je Bild.
//   - Dashboard im Leerlauf: box-shadow-Puls der COT-Hinweiskarte, 608 ms
//     Paint je 4 s.
//   - COT: der Countdown schrieb jede Sekunde innerHTML -> jede Sekunde eine
//     volle Karten-Vermessung (~250 getBoundingClientRect).
//   - Overview: der Globus schrieb jedes Bild seine Beschriftung neu -> die
//     Seiten-Beobachter liefen in JEDEM Bild (212 ms querySelectorAll +
//     146 ms Kartenvermessung je 4 s).
//   - Asset-Sprung vom Dashboard: die Asset-Seite wurde zweimal aufgebaut
//     (erst das alte, dann das neue Asset), beim ersten Asset der Sitzung ein
//     drittes Mal, als das Kalender-Archiv eintraf - mitten im Wisch.
//
// Geprueft wird ueber ZAEHLWERTE, nicht ueber Millisekunden: Zeiten schwanken
// mit der Last des Rechners (die Waechter laufen nacheinander auf derselben
// CPU), Zaehlwerte nicht. Ein roter Lauf ist dadurch immer ein echter Fund.
//
//   S) STATISCH: eine Endlos-Animation bewegt nur transform/opacity. Alles
//      andere (box-shadow, background-position, filter ...) malt in jedem
//      Bild neu. Ausnahmen stehen mit Grund in ERLAUBT_MALEND.
//   A) Je Seite hoechstens MAX_GLEICHZEITIG laufende Animationen direkt nach
//      dem Wechsel.
//   B) Fertige Einblendungen haengen nicht nach (fill-mode both/forwards haelt
//      den Effekt fest): hoechstens MAX_FERTIG je Seite nach 2,6 s.
//   C) Leerlauf: reine Textwechsel (Uhr, Countdown, Zahlen) loesen keine
//      Kartenvermessung aus - hoechstens MAX_MESSUNGEN getBoundingClientRect
//      in 2 s je Seite.
//   D) Ein Asset-Wechsel = EIN Aufbau der Asset-Seite (Dashboard -> Asset per
//      gotoSym und per Panel, Asset -> Asset), im Fenster liegt beim ersten
//      Asset auch die Ankunft des Kalender-Archivs.
//   E) Asset-Symbole (Flaggen-Welle, Glanz, Oel, Metall, Index) laufen als
//      FILMSTREIFEN auf der GPU: keine SMIL-Animation, keine live laufende
//      CSS-Animation auf Symbol-Teilen, jeder Film bewegt nur transform.
//      Vorher (gemessen 2026-10-03): Asset-Seite 28 %, Dashboard 33 %
//      Hauptthread im Leerlauf, selbst mit ALLEN Symbolen ausgeblendet noch
//      557 ms je 4 s - die Animationen liefen in den geteilten Vorlagen.
// Gegenproben (muessen ROT werden):
//   --gegenprobe-punkte    jeder Trend-Punkt bekommt wieder eine Animation -> A rot
//   --gegenprobe-fill      .list-in wieder mit fill-mode both            -> B rot
//   --gegenprobe-text      Textwechsel-Filter aus (window.__gpNurText)   -> C rot
//   --gegenprobe-doppelt   alter Ablauf showTab('cur') + selSym          -> D rot
//   --gegenprobe-smil      Wellen-SMIL wieder in den Vorlagen             -> E rot
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const GP_PUNKTE = process.argv.includes('--gegenprobe-punkte');
const GP_FILL = process.argv.includes('--gegenprobe-fill');
const GP_TEXT = process.argv.includes('--gegenprobe-text');
const GP_DOPPELT = process.argv.includes('--gegenprobe-doppelt');
const GP_SMIL = process.argv.includes('--gegenprobe-smil');
const GP = GP_PUNKTE || GP_FILL || GP_TEXT || GP_DOPPELT || GP_SMIL;

const MAX_GLEICHZEITIG = 400;   // Trends nachher ~110, vorher 3363
const MAX_FERTIG = 3;           // pageFadeIn/detailFadeIn halten bewusst (transform-Kontext), sonst 0
const MAX_MESSUNGEN = 20;       // nachher 0 auf allen Seiten, COT vorher ~500

// Endlos-Animationen, die etwas anderes als transform/opacity bewegen und das
// duerfen - jeweils mit Grund. Neue Eintraege nur mit Messung.
const ERLAUBT_MALEND = {
  aiTick: 'laeuft nur noch auf der pausierten Abtast-Probe (.ai-probe), die den Filmstreifen baut - E prueft, dass sie nirgends live laeuft',
  aiTickDot: 'wie aiTick',
  globePing: 'Overview-Globus: SVG, die Kugel wird ohnehin in jedem Bild neu gezeichnet',
  jetFlameFlicker: 'Overview-Globus: SVG-Jet, wie globePing',
  skelShimmer: 'laeuft nur, solange ein Platzhalter laedt',
};
const NUR_GPU = new Set(['transform', 'opacity', 'offset', 'animation-timing-function']);

let fehler = 0;
const rot = m => { console.log('  ✗ ' + m); fehler++; };
const gruen = m => console.log('  ✓ ' + m);

// ── S) statisch ──────────────────────────────────────────────────────────
function statisch() {
  const wurzel = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
  const js = fs.readdirSync(path.join(wurzel, 'js')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(wurzel, 'js', f), 'utf8')).join('\n');
  const kf = {};
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let d = 1, j = m.index + m[0].length;
    while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    const body = css.slice(m.index + m[0].length, j - 1).replace(/\d+(\.\d+)?%|from|to/g, '');
    kf[m[1]] = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]));
  }
  const endlos = new Set();
  for (const quelle of [css, js]) for (const m of quelle.matchAll(/animation(?:-name)?\s*:\s*([^;}`'"]+)/g)) {
    if (!/infinite/.test(m[1])) continue;
    for (const n of m[1].match(/[A-Za-z][\w-]*/g) || []) if (kf[n]) endlos.add(n);
  }
  const falsch = [...endlos].filter(n => [...kf[n]].some(p => !NUR_GPU.has(p)) && !ERLAUBT_MALEND[n]);
  falsch.forEach(n => rot(`Endlos-Animation "${n}" malt in jedem Bild neu (${[...kf[n]].filter(p => !NUR_GPU.has(p)).join(', ')}) - transform/opacity verwenden`));
  if (!falsch.length) gruen(`${endlos.size} Endlos-Animationen bewegen nur transform/opacity (${Object.keys(ERLAUBT_MALEND).length} begruendete Ausnahmen)`);
}

(async () => {
  console.log('S) Endlos-Animationen');
  statisch();

  const { chromium } = require(PW);
  const { wartenBisDatenDa } = require('./warten.js');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const perr = [];
  p.on('pageerror', e => perr.push(String(e.message || e)));
  await p.addInitScript(gp => {
    try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {}
    if (gp.text) window.__gpNurText = true;
    if (gp.css) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = gp.css; document.head.appendChild(s); });
  }, {
    text: GP_TEXT,
    css: (GP_PUNKTE ? '.tr-dots-in circle{animation:trFadeIn 1s ease both}' : '') + (GP_FILL ? '.list-in{animation-fill-mode:both!important}' : ''),
  });
  // Ankunft des Kalender-Archivs im Fenster von D nachweisen
  const archiv = [];
  p.on('requestfinished', r => { if (/cal_hist\//.test(r.url())) archiv.push(r.url().split('/').pop().split('?')[0]); });

  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); showTab('dash'); });
  await p.waitForTimeout(1200);

  // ── D) ein Aufbau je Asset-Wechsel ───────────────────────────────────────
  // Zuerst, damit der erste Asset-Besuch der Sitzung (Archiv kommt) dabei ist.
  console.log('D) Ein Asset-Wechsel = ein Aufbau');
  const aufbauten = async (wie, code) => p.evaluate(async ([code, doppelt]) => {
    const det = document.getElementById('detail'); let n = 0;
    const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(x => { if (x.nodeType === 1 && x.classList.contains('dp')) n++; })));
    mo.observe(det, { childList: true });
    if (doppelt) { const id = code.match(/'(\w+)'/)[1]; showTab('cur', null, 'fx'); selSym(id); }
    else (0, eval)(code);
    await new Promise(r => setTimeout(r, 2500));
    mo.disconnect();
    return n;
  }, [code, GP_DOPPELT && wie !== 'Asset -> Asset']);
  for (const [wie, vorher, code] of [
    ['Dashboard -> Asset (gotoSym, erstes Asset)', "showTab('dash')", "gotoSym('USD')"],
    ['Dashboard -> Asset (Panel)', "showTab('dash')", "sbClick('GBP')"],
    ['Asset -> Asset', "gotoSym('USD')", "sbClick('EUR')"],
  ]) {
    await p.evaluate(v => (0, eval)(v), vorher); await p.waitForTimeout(900);
    const n = await aufbauten(wie, code);
    if (n !== 1) rot(`${wie}: Asset-Seite ${n}x aufgebaut (soll 1)`); else gruen(`${wie}: 1 Aufbau`);
  }
  if (!archiv.length) rot('Kalender-Archiv kam im Pruef-Fenster nicht an - der Archiv-Fall war nicht abgedeckt');
  else gruen(`Archiv (${[...new Set(archiv)].join(', ')}) kam im Fenster an, ohne zweiten Aufbau`);

  // ── A/B/C je Seite ──────────────────────────────────────────────────────
  console.log('A) gleichzeitige Animationen / B) fertige Einblendungen / C) Leerlauf-Messungen');
  const SEITEN = [["showTab('dash')", 'Dashboard'], ["gotoSym('USD')", 'Asset USD'], ["showTab('trends')", 'Trends'], ["showTab('cal')", 'Calendar'],
    ["showTab('watch')", 'Watchlist'], ["showTab('cot')", 'COT'], ["showTab('pairs')", 'Set-ups'], ["showTab('over')", 'Overview'],
    ["showTab('carry')", 'Carry'], ["showTab('mx')", 'Matrix'], ["showTab('sent')", 'Sentiment'], ["showTab('news')", 'News']];
  for (const [code, name] of SEITEN) {
    const r = await p.evaluate(async code => {
      try { (0, eval)(code); } catch (e) { return { err: String(e) }; }
      await new Promise(r => setTimeout(r, 150));
      const laufend = document.getAnimations().filter(a => a.playState === 'running').length;
      const proName = {}; document.getAnimations().forEach(a => { const k = a.animationName || a.constructor.name; proName[k] = (proName[k] || 0) + 1; });
      await new Promise(r => setTimeout(r, 2450));
      const fertig = document.getAnimations().filter(a => a.playState === 'finished');
      const fertigNamen = {}; fertig.forEach(a => { const k = a.animationName || a.constructor.name; fertigNamen[k] = (fertigNamen[k] || 0) + 1; });
      // C: Leerlauf - wie oft wird in 2 s vermessen?
      let mess = 0; const g = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { mess++; return g.call(this); };
      await new Promise(r => setTimeout(r, 2000));
      Element.prototype.getBoundingClientRect = g;
      return { laufend, proName, fertig: fertig.length, fertigNamen, mess };
    }, code);
    if (r.err) { rot(`${name}: ${r.err}`); continue; }
    const top = m => Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ');
    const zeile = [];
    if (r.laufend > MAX_GLEICHZEITIG) rot(`${name}: ${r.laufend} Animationen gleichzeitig (max ${MAX_GLEICHZEITIG}) - ${top(r.proName)}`); else zeile.push(`${r.laufend} Animationen`);
    if (r.fertig > MAX_FERTIG) rot(`${name}: ${r.fertig} fertige Einblendungen haengen nach (max ${MAX_FERTIG}) - ${top(r.fertigNamen)}; fill-mode backwards verwenden`); else zeile.push(`${r.fertig} fertig`);
    if (r.mess > MAX_MESSUNGEN) rot(`${name}: ${r.mess} Layout-Messungen in 2 s Leerlauf (max ${MAX_MESSUNGEN})`); else zeile.push(`${r.mess} Messungen im Leerlauf`);
    if (zeile.length === 3) gruen(`${name.padEnd(10)} ${zeile.join(' · ')}`);
  }

  // ── E) Asset-Symbole nur als GPU-Film ────────────────────────────────────
  console.log('E) Asset-Symbole: Film statt Live-Animation');
  for (const [code, name] of [["showTab('dash')", 'Dashboard'], ["gotoSym('USD')", 'Asset USD'], ["gotoSym('GOLD')", 'Asset GOLD']]) {
    const r = await p.evaluate(async ([code, gp]) => {
      if (gp) { const w = document.querySelector('#aiWave path'); if (w && !w.querySelector('animate')) w.insertAdjacentHTML('beforeend', '<animate attributeName="d" dur="1.8s" repeatCount="indefinite" values="' + w.getAttribute('d') + ';' + w.getAttribute('d').replace(/,0\./g, ',0.5') + '"/>'); }
      (0, eval)(code);
      // Filme werden im Leerlauf nachgezogen
      for (let i = 0; i < 40 && document.querySelector('.ai-film-win[data-film]:empty'); i++) await new Promise(r => setTimeout(r, 100));
      const smil = document.querySelectorAll('animate, animateTransform, animateMotion').length;
      const live = document.getAnimations().filter(a => a.playState === 'running' && /^ai(Sheen|Drip|MetalSheen|Tick|TickDot)$/.test(a.animationName || '')).length;
      const filme = [...document.querySelectorAll('.ai-wrap.ai-film-on .ai-film')].filter(f => f.getClientRects().length);
      const fremd = filme.filter(f => f.getAnimations().some(a => a.animationName !== 'aiFilm')).length;
      const sichtbar = [...document.querySelectorAll('.ai-wrap')].filter(w => w.getClientRects().length && w.querySelector('.ai-film-win')).length;
      return { smil, live, filme: filme.length, fremd, sichtbar };
    }, [code, GP_SMIL]);
    const z = [];
    if (r.smil) rot(`${name}: ${r.smil} SMIL-Animationen im Dokument - laufen auch fuer unsichtbare Symbole und ziehen die ganze Seite mit`); else z.push('kein SMIL');
    if (r.live) rot(`${name}: ${r.live} CSS-Animationen auf Symbol-Teilen laufen live`); else z.push('nichts live');
    if (r.fremd) rot(`${name}: ${r.fremd} Filme mit anderer Animation als aiFilm (transform)`);
    if (r.filme < r.sichtbar) rot(`${name}: nur ${r.filme} von ${r.sichtbar} sichtbaren animierbaren Symbolen zeigen ihren Film`); else z.push(`${r.filme}/${r.sichtbar} Symbole als Film`);
    if (z.length === 3) gruen(`${name.padEnd(10)} ${z.join(' · ')}`);
  }

  if (perr.length) rot('JS-Fehler: ' + perr.slice(0, 3).join(' | '));
  await b.close();
  if (GP) { console.log(fehler ? `\nGegenprobe ok: ${fehler} Befund(e), wie erwartet rot.` : '\nGegenprobe FEHLGESCHLAGEN: Waechter bleibt gruen.'); process.exit(fehler ? 0 : 1); }
  console.log(fehler ? `\n${fehler} Befund(e).` : '\nPerformance-Waechter gruen.');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
