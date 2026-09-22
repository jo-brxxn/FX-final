// ── LESBARKEIT IN KARTENKOPF UND BEDIENELEMENT ─────────────────────────
//
// Entstanden 2026-09-22 fuer die Navy-Koepfe (VERSION-CHECK-538). Die sind
// am selben Tag vom Bild-Design abgeloest worden (helle Koepfe, hellgraue
// Umschalter, aktiv = kraeftiges Blau mit weisser Schrift) - der Waechter
// bleibt, weil dieselbe Fehlerklasse weiterlebt: jeder Text, der seine Farbe
// selbst setzt, kann auf einer neu eingefaerbten Flaeche verschwinden (weiss
// auf hellem Aktiv-Ton, Bedeutungsfarbe auf Blau). Details:
// docs/design-system.md, "Bild-Design".
//
// Die Fehlerklasse beim Bau der Navy-Koepfe: alles, was vorher auf HELLEM Kopf
// stand und seine Farbe selbst setzt (Bias-Abzeichen, inline gefaerbte
// Prozentwerte, das ⓘ in --blue), steht ploetzlich auf Navy. Gemessen beim
// Bau: die Preisaenderung der Preiskarte (#C50F1A auf #2F3F69) und das ⓘ der
// Kalenderkarte waren praktisch unsichtbar - im Code fiel keins davon auf.
//
// Geprueft wird deshalb jeder sichtbare Text in diesen Zonen gegen seinen
// TATSAECHLICHEN Hintergrund (der erste nicht durchsichtige Vorfahr), auf
// allen Seiten und in allen FUENF hellen Vorlagen. Grenze: 4,5:1, fuer
// grosse/fette Schrift 3:1 (WCAG AA).
//   node check/rahmen.js               pruefen
//   node check/rahmen.js --gegenprobe  baut einen roten Wert in einen Kopf
//                                       und verlangt, dass er gemeldet wird
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

const GEGENPROBE = process.argv.includes('--gegenprobe');
const HELL = ['', 'linear', 'stripe', 'swiss', 'notion'];
const SEITEN = ['sym:USD', 'sym:GOLD', 'dash', 'cot', 'sent', 'seas', 'data', 'rate', 'news', 'trends'];
const ZONEN = ['.rub-hdr', '.ab-tile-hd', '.abc-cal>.abc-hd', '.dw-hdr', '.cot-card-title',
  '.ab-rg', '.histp-rbtn', '.ind-hist-range-btn', '.perf-win', '.hl-tab',
  'select.btn', '.cot-filterbar select', '.news-tools select', '.px-panel-sel'];

(async () => {
  const b = await chromium.launch();
  // ⚠ Service Worker blockieren (wie die anderen Waechter): sonst liefert er
  // die GECACHTE Seite, und der Waechter prueft den alten Stand - beim Bau
  // so passiert (ein behobener Befund blieb rot).
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const perr = [];
  p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });

  const F = [];
  let geprueft = 0, zonenGesehen = 0, tokenFehlt = [];
  for (const th of HELL) {
    // Die Vorlage wird direkt am <html> gesetzt - genau das tut auch die
    // Frueh-Weiche; der Speicherweg (setFxTheme) ist hier nicht Gegenstand.
    await p.evaluate(t => { t ? document.documentElement.setAttribute('data-fx-theme', t)
      : document.documentElement.removeAttribute('data-fx-theme'); }, th);
    const tk = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-act').trim());
    if (!tk) tokenFehlt.push(th || 'terminal');
    for (const s of SEITEN) {
      await p.evaluate(s => s.startsWith('sym:') ? gotoSym(s.slice(4)) : showTab(s), s);
      await p.waitForTimeout(450);
      if (GEGENPROBE) await p.evaluate(() => {
        const h = document.querySelector('.ab-tile-hd, .rub-hdr, .cot-card-title');
        if (h) { const x = document.createElement('span'); x.textContent = 'GEGENPROBE -1.23%';
          x.style.color = '#C50F1A'; h.appendChild(x); }
      });
      const r = await p.evaluate(ZONEN => {
        const rgba = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
        const lum = ([r, g, b]) => { const v = [r, g, b].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
          return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
        const bgOf = el => { for (let x = el; x; x = x.parentElement) {
          const cs = getComputedStyle(x);
          if (cs.backgroundImage && cs.backgroundImage !== 'none' && !cs.backgroundColor.startsWith('rgba(0, 0, 0, 0')) {}
          const c = rgba(cs.backgroundColor); if (c && (c.length < 4 || c[3] > .5)) return c; }
          return [255, 255, 255]; };
        const out = []; let n = 0, z = 0;
        for (const sel of ZONEN) document.querySelectorAll(sel).forEach(zone => {
          if (!zone.offsetParent) return; z++;
          const els = [zone, ...zone.querySelectorAll('*')];
          for (const el of els) {
            const txt = [...el.childNodes].filter(t => t.nodeType === 3).map(t => t.textContent).join('').trim();
            if (!txt || !el.offsetParent) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || +cs.opacity < .3) continue;
            // <select>: der Text ist die gewaehlte Option, gemalt in der
            // Schriftfarbe des <select> selbst.
            const fg = rgba(cs.color), bg = bgOf(el);
            const a = fg.length > 3 ? fg[3] : 1, mixed = fg.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a));
            const l1 = lum(mixed), l2 = lum(bg), k = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
            const gross = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
            n++;
            if (k < (gross ? 3 : 4.5)) out.push(`${sel} "${txt.slice(0, 28)}" ${k.toFixed(2)}:1 (${cs.color} auf rgb(${bg.slice(0, 3).join(',')}))`);
          }
        });
        return { out, n, z };
      }, ZONEN);
      geprueft += r.n; zonenGesehen += r.z;
      r.out.forEach(x => F.push(`[${th || 'terminal'} ${s}] ${x}`));
    }
  }
  await b.close();
  const uniq = [...new Set(F)];
  if (tokenFehlt.length) uniq.unshift(`Vorlage(n) ohne --ui-act: ${tokenFehlt.join(', ')}`);
  if (perr.length) uniq.push(...perr.map(e => 'PAGEERROR ' + e));
  if (!zonenGesehen) uniq.push('keine einzige Zone gefunden - Selektoren veraltet?');
  if (GEGENPROBE) {
    const ok = uniq.some(x => x.includes('GEGENPROBE'));
    console.log(ok ? 'rahmen --gegenprobe: ok (eingebauter roter Wert wurde gemeldet)' : 'rahmen --gegenprobe: FEHLER - eingebauter Wert NICHT gemeldet');
    process.exit(ok ? 0 : 1);
  }
  if (uniq.length) { console.log(`rahmen: ${uniq.length} Befund(e)\n  ` + uniq.slice(0, 60).join('\n  ')); process.exit(1); }
  console.log(`rahmen: ok (${geprueft} Texte in ${zonenGesehen} Zonen, ${HELL.length} helle Vorlagen)`);
})();
