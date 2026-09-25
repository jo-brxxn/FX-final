// ── TREND-TREIBER (EMA20 auf 1D und 4H) ──────────────────────────────────
//
// Nutzer 2026-09-25: "Neuer Score driver soll noch Trend mit 1,5 ... Haelfte
// 4h, Haelfte 1d ... letzte geschlossene Tageskerze ueber dem 20 EMA
// bullish, darunter bearish ... neutralzone" (per Rueckfrage +-0,25 x
// ATR14), Linien 4h/1d oben im Chart schaltbar, Flaeche zwischen EMA und
// Kurs leicht in Bias-Farbe.
// Geprueft:
//   A) 1D je Asset UNABHAENGIG in Node aus price_data.json nachgerechnet
//      (eigene EMA/ATR-Schleife, Kehrwert bei invert, ohne heutigen Tag)
//      und gegen die Score-Zeile "Trend 1D (EMA20)" gelegt.
//   B) 4H gegen trend_data.json (Schluss/EMA/ATR des letzten Blocks).
//   C) Price-Karte: beide Schalter, Linie + Band + Score-Zeile; ein Klick
//      nimmt die Linie weg, ein zweiter bringt sie zurueck.
//   D) Score-Fenster: eigene Gruppe "Price trend".
//   node check/trend.js [--gegenprobe]  (Neutralzone in der App verdoppelt -> rot)
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const lies = f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')); } catch (e) { return null; } };
const urteil = (c, ema, atr) => { const a = (c - ema) / atr; return Math.abs(a) <= 0.25 ? 0 : a > 0 ? 0.75 : -0.75; };

function soll1d(p, id, heute) {
  const z = x => x != null && x !== '' && isFinite(Number(x)) && Number(x) > 0;
  let s = (p.series || []).filter(e => e && e[0] < heute && z(e[1]));
  if (id !== 'BTC') s = s.filter(e => { const w = new Date(e[0] + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; });
  s = s.map(e => p.invert ? [e[0], 1 / e[1], z(e[4]) ? 1 / e[4] : null, z(e[3]) ? 1 / e[3] : null] : [e[0], +e[1], z(e[3]) ? +e[3] : null, z(e[4]) ? +e[4] : null]);
  if (s.length < 34) return null;
  let ema = 0, atr = null; const tr = [];
  for (let i = 0; i < s.length; i++) {
    if (i < 20) { ema += s[i][1] / 20; } else ema = (s[i][1] - ema) * 2 / 21 + ema;
    if (i > 0 && s[i][2] != null && s[i][3] != null) {
      const pc = s[i - 1][1], t = Math.max(s[i][2] - s[i][3], Math.abs(s[i][2] - pc), Math.abs(s[i][3] - pc));
      if (atr == null) { tr.push(t); if (tr.length === 14) atr = tr.reduce((a, b) => a + b) / 14; } else atr = (atr * 13 + t) / 14;
    }
  }
  if (atr == null) return null;
  const c = s[s.length - 1][1];
  return { pkt: urteil(c, ema, atr), c, ema, atr, d: s[s.length - 1][0] };
}

(async () => {
  const preise = lies('price_data.json'), vier = lies('trend_data.json');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); localStorage.removeItem('fxpro_ab_trendlines'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  if (GEGENPROBE) await p.evaluate(() => { const s = syms.find(x => x.id === 'EUR'), r = s.rubrics.find(x => x.name === 'COT Data'), i = r.indicators.find(x => x.name === 'Trend 1D (EMA20)'); if (i) i.pkt = i.pkt ? 0 : 0.75; });
  const ist = await p.evaluate(() => {
    const heute = todayStr(), o = { heute, a: {} };
    syms.forEach(s => { const r = (s.rubrics || []).find(x => x.name === 'COT Data'); if (!r) return;
      const z = n => { const i = r.indicators.find(x => x.name === n); return i ? i.pkt : null; };
      o.a[s.id] = { d: z('Trend 1D (EMA20)'), h: z('Trend 4H (EMA20)') }; });
    return o;
  });
  // A) 1D
  let n1 = 0;
  Object.keys(preise || {}).forEach(id => {
    const sl = soll1d(preise[id], id, ist.heute), i = ist.a[id];
    if (!i) return;
    if (!sl) { if (i.d != null) fail('1D OHNE GRUNDLAGE', `${id}: Zeile ${i.d}, Node findet keine 20+14 geschlossenen Tage`); return; }
    n1++;
    if (i.d !== sl.pkt) fail('1D FALSCH', `${id}: App ${i.d}, Node ${sl.pkt} (Schluss ${sl.c.toPrecision(6)} ${sl.d}, EMA ${sl.ema.toPrecision(6)}, ATR ${sl.atr.toPrecision(3)})`);
  });
  if (!n1) fail('1D', 'fuer kein Asset nachgerechnet - price_data.json fehlt?');
  // B) 4H
  let n4 = 0;
  if (vier && vier.assets) Object.keys(vier.assets).forEach(id => {
    const a = vier.assets[id], i = ist.a[id]; if (!i || !a.now) return;
    const alt = Date.now() - Date.parse(a.now.ende) > 4 * 864e5;
    const sl = alt ? null : urteil(a.now.c, a.now.ema, a.now.atr);
    n4++;
    if ((sl == null ? null : sl) !== i.h) fail('4H FALSCH', `${id}: App ${i.h}, Datei ${sl}${alt ? ' (Block aelter als 4 Tage)' : ''}`);
  });
  // C) Price-Karte
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); gotoSym('EUR'); });
  await p.waitForTimeout(1200);
  const zaehl = () => p.evaluate(() => ({ sw: document.querySelectorAll('#detail .ab-ptile .tr-sw').length, d: document.querySelectorAll('#detail .ab-ptile .tr-ema.tr-d').length, band: document.querySelectorAll('#detail .ab-ptile .tr-band-d').length, zeile: !!document.querySelector('#detail .ab-ptile .tr-line'), sch: document.querySelectorAll('#detail .ab-ptile .tr-schatten').length }));
  const c0 = await zaehl();
  if (c0.sw !== 2) fail('SCHALTER', `${c0.sw} statt 2 (1D/4H)`);
  if (c0.d !== 1 || c0.band !== 1) fail('1D-LINIE', JSON.stringify(c0));
  if (!c0.zeile) fail('SCORE-ZEILE', 'Trend score fehlt in der Price-Karte');
  if (!c0.sch) fail('SCHATTIERUNG', 'keine Flaeche zwischen Kurs und EMA');
  await p.click('#detail .ab-ptile .tr-sw-d'); await p.waitForTimeout(500);
  const c1 = await zaehl();
  const gespeichert = await p.evaluate(() => localStorage.getItem('fxpro_ab_trendlines'));
  if (c1.d !== 0) fail('SCHALTER 1D', 'Linie bleibt nach dem Ausschalten');
  if (gespeichert !== 'h') fail('SCHALTER GESPEICHERT', `localStorage=${gespeichert}`);
  await p.click('#detail .ab-ptile .tr-sw-d'); await p.waitForTimeout(500);
  if ((await zaehl()).d !== 1) fail('SCHALTER 1D', 'Linie kommt nicht zurueck');
  // D) Score-Fenster
  const g = await p.evaluate(() => { openScoreInfoSym('EUR'); const t = document.getElementById('scoreInfoBody').textContent; closeM('mScoreInfo'); return /Price trend 1D \+ 4H/.test(t); });
  if (!g) fail('SCORE-FENSTER', 'keine Gruppe "Price trend"');
  // E) Verlauf der Regel-Zeilen (Nutzer 2026-09-25: jeder aufgeklappte
  //    Indikator braucht eine Historie) - aus den Feeds ausgelesen.
  const h = await p.evaluate(() => { const s = syms.find(x => x.id === 'EUR'); const o = {};
    s.rubrics.forEach(r => (r.indicators || []).forEach(i => { if (['Trend 1D (EMA20)', '2Y Yield Gap (20d)', 'Retail Positioning'].includes(stripPeriodSuffix(i.name).base) || i.name === 'Trend 1D (EMA20)') o[i.name] = indChartSeries(i, 'EUR').pts.length; }));
    o.seas = seasProfilHtml('EUR').length; return o; });
  ['Trend 1D (EMA20)', '2Y Yield Gap (20d)', 'Retail Positioning'].forEach(n => { if (!(h[n] >= 20)) fail('VERLAUF FEHLT', `EUR ${n}: ${h[n]} Punkte`); });
  if (!h.seas) fail('VERLAUF FEHLT', 'EUR Seasonality: kein Monatsprofil');
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`trend --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('trend --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`trend: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`trend: ok (1D fuer ${n1} Assets unabhaengig nachgerechnet, 4H ${vier ? n4 + ' gegen trend_data.json' : '(Datei fehlt noch)'}, Schalter, Band, Schattierung, Score-Fenster)`);
})().catch(e => { console.log('trend: ABBRUCH ' + e.message); process.exit(1); });
