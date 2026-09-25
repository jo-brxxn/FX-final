// ── WERTE-ZELLEN DER INDIKATOR-TABELLEN ─────────────────────────────────
//
// Bugreport 2026-09-25 (NZD-Screenshot, Inflation-Karte): in der Zeile
// Core CPI stand als PREV der Satz "Non-tradables CPI ~3.4% y/y" und ragte
// 89 px ueber NEXT und TRD. Dieselbe Klasse gemessen bei den Rohstoff-Zeilen
// ("±10.6% typical" als PREV, bis 25 px) und CHF Employment ("5.537 Mio.",
// 7-8 px, dazu deutsch auf der englischen Oberflaeche).
// Wurzel: splitResearchVal() reichte Saetze ungekuerzt als Wert durch.
// Geprueft je Asset und Makro-Karte, ACT/FC/PREV:
//   - Text ragt nicht aus der Zelle und wird nicht abgeschnitten
//   - keine deutschen Kurzformen (Mio./Mrd.)
//   - kein Satz (mehr als ein Wort vor der Zahl)
//   node check/zellen.js [--gegenprobe]  (ueberlanger PREV bei NZD -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  if (GEGENPROBE) await p.evaluate(() => { const s = syms.find(x => x.id === 'NZD'); const r = s.rubrics.find(x => x.name === 'Inflation'); const i = r.indicators.find(x => /Core CPI/.test(x.name)); if (i && i.research) i.research.previous = '1234567.891234% y/y'; });
  const ids = await p.evaluate(() => syms.map(s => s.id));
  let n = 0;
  // Desktop und iPad hochkant (820 px) - die Spalten sind prozentual.
  for (const vw of [1180, 820]) {
  await p.setViewportSize({ width: vw, height: 900 });
  for (const id of ids) {
    await p.evaluate(id => gotoSym(id), id); await p.waitForTimeout(350);
    const r = await p.evaluate(id => {
      const o = []; let n = 0;
      document.querySelectorAll('#detail .rub-card td.ir-act, #detail .rub-card td.ir-fc, #detail .rub-card td.ir-prev').forEach(td => {
        n++;
        const t = td.textContent.trim(); if (!t || t === '–') return;
        const name = (td.parentElement.querySelector('.ir-name-txt') || {}).textContent || '?';
        const rg = document.createRange(); rg.selectNodeContents(td); const tb = rg.getBoundingClientRect(), cb = td.getBoundingClientRect();
        const cs = getComputedStyle(td), innen = cb.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (tb.right > cb.right + 1 || tb.left < cb.left - 1) o.push(['RAGT HERAUS', `${id} ${name}: "${t}" ${Math.round(Math.max(tb.right - cb.right, cb.left - tb.left))}px`]);
        else if (tb.width > innen + 1) o.push(['ABGESCHNITTEN', `${id} ${name}: "${t}"`]);
        if (/\b(Mio|Mrd)\b/.test(t)) o.push(['DEUTSCH', `${id} ${name}: "${t}"`]);
        if (/^[A-Za-z]+\s+[A-Za-z]+/.test(t)) o.push(['SATZ STATT WERT', `${id} ${name}: "${t}"`]);
      });
      return { o, n };
    }, id);
    n += r.n; r.o.forEach(([k, x]) => fail(k, x + ` @${vw}px`));
  }
  }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`zellen --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('zellen --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`zellen: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`zellen: ok (${ids.length} Assets, ${n} Werte-Zellen: nichts ragt heraus, nichts abgeschnitten, kein Satz, kein Deutsch)`);
})().catch(e => { console.log('zellen: ABBRUCH ' + e.message); process.exit(1); });
