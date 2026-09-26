// ── KORB-INDEX JE WAEHRUNG ──────────────────────────────────────────────
//
// Nutzer 2026-09-26: "Bau das zum Korb-Index um". Eine Waehrung wird in
// Price-Karte, Price-Tab, Kontext-Band, Performance und Trend-Treiber als
// gleichgewichteter Korb gegen die sieben anderen gezeigt/gerechnet, nicht
// mehr als Kurs gegen USD (die TradingView-"Currency Indices" AXY/BXY/... sind
// nachgerechnet genau dieser Kurs x 100 - deshalb eigene Koerbe).
// Geprueft:
//   A) Invariante: Summe der ln(Korb/100) ueber alle acht = 0 (±1e-6)
//   B) Korb in Node unabhaengig aus price_data.json nachgebaut = App (±1e-5 rel.)
//   C) Price-Karte EUR: Beschriftung "EUR Basket", die Achse zeigt den Korb
//      (hoechster Wert im Fenster), nicht EUR/USD
//   D) Performance 1W EUR = Korb-Rendite
//   node check/korb.js [--gegenprobe]  (Erwartung = Kurs gegen USD -> rot)
const fs = require('fs'), path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const FXL = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD'];
const pd = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'price_data.json'), 'utf8'));
function korb(id) {
  const nu = FXL.filter(c => c !== 'USD'), wt = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };
  const m = {}; nu.forEach(c => { const p = pd[c]; m[c] = new Map((p.series || []).filter(e => e && +e[1] > 0).map(e => [e[0], Math.log(p.invert ? 1 / e[1] : +e[1]) + (c === 'JPY' ? Math.log(100) : 0)])); });
  return [...m.EUR.keys()].filter(d => nu.every(c => m[c].has(d)) && wt(d)).sort().map(d => { const ln = { USD: 0 }; nu.forEach(c => { ln[c] = m[c].get(d); }); return [d, 100 * Math.exp(ln[id] - FXL.filter(c => c !== id).reduce((a, c) => a + ln[c], 0) / 7)]; });
}
(async () => {
  const soll = {}; FXL.forEach(c => { soll[c] = korb(c); });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); localStorage.setItem('fxpro_ab_range', '3M'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  const app = await p.evaluate(fx => { const o = {}; fx.forEach(c => { o[c] = korbReihe(c, false); }); return o; }, FXL);
  // A
  const d = app.EUR[app.EUR.length - 1][0];
  const summe = FXL.reduce((a, c) => a + Math.log(app[c].find(e => e[0] === d)[1] / 100), 0);
  if (Math.abs(summe) > 1e-6) fail('INVARIANTE', `Summe ln(Korb/100) am ${d} = ${summe}`);
  // B
  FXL.forEach(c => { const a = app[c], s = soll[c]; if (!a || a.length !== s.length) { fail('LAENGE', `${c}: App ${a && a.length}, Node ${s.length}`); return; }
    const x = a[a.length - 1][1], y = s[s.length - 1][1]; if (Math.abs(x / y - 1) > 1e-5) fail('WERT', `${c}: App ${x}, Node ${y}`); });
  // C + D
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); gotoSym('EUR'); }); await p.waitForTimeout(1200);
  const k = await p.evaluate(() => ({ lbl: (document.querySelector('#detail .ab-ptile .ab-korb') || {}).textContent || '', hi: +(document.querySelector('#detail .ab-ptile .ab-yax span') || {}).textContent, w1: (perfReturn('EUR', 7) || {}).pct }));
  if (k.lbl !== 'EUR Basket') fail('BESCHRIFTUNG', `"${k.lbl}" statt "EUR Basket"`);
  const von = new Date(); von.setUTCDate(von.getUTCDate() - 90); const vonS = von.toISOString().slice(0, 10);
  const ref = GEGENPROBE ? pd.EUR.series.map(e => [e[0], +e[1]]) : soll.EUR;
  const hiSoll = Math.max(...ref.filter(e => e[0] >= vonS).map(e => e[1]));
  if (!(Math.abs(k.hi - hiSoll) / hiSoll < 0.002)) fail('ACHSE', `oberer Achsenwert ${k.hi}, Korb-Hoch im Fenster ${hiSoll.toFixed(3)}`);
  const s = GEGENPROBE ? ref : soll.EUR, last = s[s.length - 1]; const c7 = new Date(last[0] + 'T00:00:00Z'); c7.setUTCDate(c7.getUTCDate() - 7); const cs = c7.toISOString().slice(0, 10);
  let base = null; s.forEach(e => { if (e[0] <= cs) base = e; }); const w1 = (last[1] / base[1] - 1) * 100;
  if (!(Math.abs(k.w1 - w1) < 0.01)) fail('PERFORMANCE 1W', `App ${k.w1 && k.w1.toFixed(3)}%, Korb ${w1.toFixed(3)}%`);
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`korb --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('korb --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`korb: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`korb: ok (8 Koerbe = Node-Nachbau, Invariante ${summe.toExponential(1)}, Price-Karte EUR Basket, Performance 1W = Korb)`);
})().catch(e => { console.log('korb: ABBRUCH ' + e.message); process.exit(1); });
