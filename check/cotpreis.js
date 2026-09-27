// ── COT vs PRICE + JEDES ASSET HAT EINEN KURS ─────────────────────────────
//
// Nutzer 2026-09-27: "Ich will bei cot wenn man ein Asset ausgewaehlt hat ein
// vs Price einschalten koennen. Der muss zu den Balken passen. Und die ganze
// Historie und guck mal bei manchen Assets gibt es noch gar keinen Preis".
// Gemessen vorher: COT-Historie nur 26 Wochen; ohne Price-Chart waren GER100
// (entfernt) und alle 8 Renditen.
// Geprueft:
//   A) COT, EUR und JPY mit "vs Price": jeder Punkt der Kurslinie sitzt auf
//      der Mitte seines Balkens (±0,6 px) und traegt den Schluss am Report-
//      Tag in KONTRAKTRICHTUNG - unabhaengig in Node aus price_data.json
//      nachgerechnet (EUR = EUR/USD, JPY = 1/USDJPY; letzter Schluss <= Tag,
//      hoechstens 5 Tage alt). Die Achse ganz rechts traegt Preiswerte.
//   B) Jedes Asset der App zeigt in seiner Price-Karte einen Chart.
//   node check/cotpreis.js [--gegenprobe]  (Kurs aus dem Korb statt gegen USD
//   + Renditen ohne Anleihe-Feed -> rot)
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const PD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'price_data.json'), 'utf8'));
const COT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cot_data.json'), 'utf8'));
const erwartet = (id, datum) => {
  const f = PD[id]; if (!f) return null;
  let best = null; for (const e of f.series) { if (e[0] <= datum) best = e; else break; }
  if (!best || (Date.parse(datum) - Date.parse(best[0])) / 864e5 > 5) return null;
  return f.invert ? 1 / best[1] : +best[1];
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 1000 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); localStorage.setItem('fxpro_cot_vs_price', '1'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  if (GEGENPROBE) await p.route('**/bond_data.json*', r => r.fulfill({ status: 404, body: '' }));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  if (GEGENPROBE) await p.evaluate(() => { window.__cotKorbTest = true; });
  let punkte = 0;
  for (const id of ['EUR', 'JPY']) {
    await p.evaluate(id => { showTab('cot'); pickCotFilter(id); setCotHistRange(6); }, id);
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const svg = document.querySelector('#cotHistWrap svg'); const m = cotChartMeta;
      if (!svg || !m) return null;
      const pfad = [...svg.querySelectorAll('.cot-preis')].pop();
      const pts = pfad ? pfad.getAttribute('d').trim().split(/(?=[ML])/).map(t => t.trim().slice(1).trim().split(/\s+/).map(Number)) : [];
      return { pts, preis: m.preis, n: m.n, leftPad: m.leftPad, perBar: m.perBar, barW: m.barW, dates: m.history.map(e => e.date),
        achse: [...svg.querySelectorAll('.y-lbl')].map(t => t.textContent) };
    });
    if (!r) { fail(id, 'kein COT-Verlauf'); continue; }
    if (!r.pts.length) { fail(id, 'keine Kurslinie trotz vs Price'); continue; }
    if (r.achse.length < 2) fail(id, 'Preis-Achse ohne Beschriftung');
    let k = 0;
    r.dates.forEach((d, i) => {
      const soll = erwartet(id, d); const ist = r.preis && r.preis[i];
      if (soll == null) return;
      punkte++;
      if (ist == null || Math.abs(ist - soll) / soll > 1e-9) { if (F.length < 30) fail(id + ' WERT', `${d}: ${ist} statt ${soll} (Schluss am Report-Tag gegen USD)`); return; }
      const xSoll = r.leftPad + i * r.perBar + r.barW / 2, pkt = r.pts[k++];
      if (!pkt || Math.abs(pkt[0] - xSoll) > 0.6) fail(id + ' LAGE', `${d}: Linienpunkt x=${pkt && pkt[0]} statt Balkenmitte ${xSoll.toFixed(1)}`);
    });
  }
  // B) jedes Asset hat einen Kurs-Chart
  const ids = await p.evaluate(() => syms.map(s => s.id));
  const ohne = [];
  for (const id of ids) {
    await p.evaluate(id => gotoSym(id), id); await p.waitForTimeout(350);
    const ok = await p.evaluate(() => !!document.querySelector('#detail .ab-ptile svg.ab-chart'));
    if (!ok) ohne.push(id);
  }
  if (ohne.length) fail('OHNE KURS', ohne.join(', '));
  if (ids.includes('GER100')) fail('GER100', 'ist noch in der Asset-Liste (Nutzer: entfernen)');
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.some(f => f.startsWith('EUR WERT') || f.startsWith('JPY WERT')) && F.some(f => f.startsWith('OHNE KURS'))) { console.log(`cotpreis --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('cotpreis --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`cotpreis: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`cotpreis: ok (COT vs Price: ${punkte} Report-Tage EUR+JPY auf Balkenmitte, Kurs gegen USD nachgerechnet; ${ids.length} Assets mit Kurs-Chart)`);
})().catch(e => { console.log('cotpreis: ABBRUCH ' + e.message); process.exit(1); });
