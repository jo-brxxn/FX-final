// ── HTML-UEBERLAGERUNG AUF SVG-CHARTS: BEZUGSBOX = SVG ───────────────────
//
// Bugreport 2026-09-25: "bei der Historie gibt es ja auf der Grafik diese
// Punkte, stell sicher dass die perfekt mittig auf der Linie sitzen und
// nicht darueber". Gemessen: die Punkte (HTML, %-Lage, weil ein <circle> im
// gestreckten SVG ein Ei waere) bezogen sich auf die gepolsterte Box .histl
// (469x110 px), die Linie auf das SVG darin (455x100 px) - bis 5,7 px neben
// dem Knick. Dieselbe Klasse im Backtester-Chart (.bt-pfad).
// Geprueft:
//   A) jede .cax-Box ist genau so gross wie ihr SVG (±0,5 px) - dann stimmt
//      jede %-Lage (Punkte UND Achsenbeschriftung)
//   B) Historie (Karte + Fenster): jeder Punkt sitzt auf einem Knick der
//      Linie (±0,5 px)
//   node check/chartpunkte.js [--gegenprobe]  (Polster zurueck in die Box -> rot)
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
  if (GEGENPROBE) await p.addStyleTag({ content: '.histl .cax{padding:4px 6px}' });
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); gotoSym('EUR'); });
  await p.waitForTimeout(1200);
  const mess = (ort) => p.evaluate(ort => {
    const o = { box: [], pkt: [], n: 0 };
    document.querySelectorAll('.cax').forEach(c => {
      const sv = c.querySelector(':scope>svg'); if (!sv) return;
      const a = c.getBoundingClientRect(), s = sv.getBoundingClientRect(); if (!a.width) return;
      const d = Math.max(Math.abs(a.left - s.left), Math.abs(a.top - s.top), Math.abs(a.right - s.right), Math.abs(a.bottom - s.bottom));
      if (d > 0.5) o.box.push(`${ort} ${c.parentElement.className}: Box weicht ${d.toFixed(1)}px vom SVG ab`);
    });
    document.querySelectorAll('.histl').forEach(h => {
      const sv = h.querySelector('svg'); const sr = sv.getBoundingClientRect(), vb = sv.viewBox.baseVal;
      const pts = []; sv.querySelectorAll('polyline').forEach(pl => pl.getAttribute('points').split(' ').forEach(q => { const [x, y] = q.split(',').map(Number); pts.push([sr.left + x / vb.width * sr.width, sr.top + y / vb.height * sr.height]); }));
      h.querySelectorAll('.cax-p').forEach(dt => { const r = dt.getBoundingClientRect(); if (!r.width) return; o.n++;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = 1e9; pts.forEach(q => { best = Math.min(best, Math.hypot(q[0] - cx, q[1] - cy)); });
        if (best > 0.5) o.pkt.push(`${ort}: Punkt ${best.toFixed(1)}px neben dem Knick`); });
    });
    return o;
  }, ort);
  const r1 = await mess('Asset-Seite');
  await p.evaluate(() => openHistModal('EUR')); await p.waitForTimeout(900);
  const r2 = await mess('History-Fenster');
  [r1, r2].forEach(r => { r.box.forEach(x => fail('BEZUGSBOX', x)); r.pkt.forEach(x => fail('PUNKT', x)); });
  if (!r1.n && !r2.n) fail('KEINE PUNKTE', 'Historie ohne Punkte - nichts geprueft');
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`chartpunkte --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('chartpunkte --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`chartpunkte: ${F.length} Befund(e)`); F.slice(0, 20).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`chartpunkte: ok (${r1.n + r2.n} Punkte auf dem Knick, jede .cax-Box = SVG)`);
})().catch(e => { console.log('chartpunkte: ABBRUCH ' + e.message); process.exit(1); });
