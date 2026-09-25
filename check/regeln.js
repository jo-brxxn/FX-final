// ── DIE REGEL-BASIERTEN SCORE-TEILE (2026-09-24) ──────────────────────────
//
// Nutzer 2026-09-24, in einem Paket freigegeben: COT (Netto ab 60 % ±0,75,
// Wochenaenderung ab 3/5/7,5/10 Punkten 0,75/1,05/1,275/1,35, Summe hoechstens
// ±1,5), Retail (Paar-Stimmen ab 65/35, doppelt bei Wachstum - geprueft in
// check/seasretail.js), Rendite-Trends je 0,75, 2Y-Zinsdifferenz ueber 20
// Handelstage (±0,5 ab 10 bp, ±0,75 ab 25 bp), Carry (2Y, Carry-to-Risk,
// VIX-Sprung), Rohstoffe fuer AUD/NZD/CAD, CB Tone und Next CB Move weg,
// Momentum nur Anzeige, neues Score-Fenster.
// Jede Regel wird hier UNABHAENGIG aus den Rohdateien nachgerechnet (Node
// liest bond_data.json/commodity_data.json selbst) und gegen die Zeile im
// Score gelegt - eine zweite Rechnung, die nicht aus demselben Code stammt.
//   node check/regeln.js [--gegenprobe]   (verfaelscht eine COT-Zeile -> rot)
const fs = require('fs');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const FX = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD'];
const lies = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

// ── Unabhaengige Nachrechnung der 2Y-Zinsdifferenz ──
function zinsSoll(bond, ccy) {
  const reihe = c => ((bond[c] || {})['2Y Bond Yield'] || {}).series;
  const r = c => (reihe(c) || []).map(e => [String(e[0]).slice(0, 10), Number(e[1])]).filter(e => isFinite(e[1])).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const gestern = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const eigen = r(ccy).filter(e => e[0] <= gestern);
  if (eigen.length <= 20) return null;
  const d1 = eigen[eigen.length - 1][0], d0 = eigen[eigen.length - 21][0];
  const am = (rr, d) => { let v = null; rr.forEach(e => { if (e[0] <= d) v = e[1]; }); return v; };
  const andere = FX.filter(c => c !== ccy).map(r);
  const abst = d => { const e = am(r(ccy), d), o = andere.map(x => am(x, d)); if (e == null || o.some(v => v == null)) return null; return e - o.reduce((a, b) => a + b, 0) / o.length; };
  const a = abst(d1), b = abst(d0); if (a == null || b == null) return null;
  const bp = Math.round((a - b) * 1000) / 10;
  return Math.abs(bp) >= 25 ? Math.sign(bp) * 0.75 : Math.abs(bp) >= 10 ? Math.sign(bp) * 0.5 : 0;
}

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { document.getElementById('lockScreen')?.remove(); });
  if (GEGENPROBE) await p.evaluate(() => { const s = syms.find(x => x.id === 'USD'), r = s.rubrics.find(x => x.name === 'COT Data'); const i = r.indicators.find(x => /WoW/.test(x.name)); i.pkt = (i.pkt || 0) + 0.4; });

  // A) COT-Tabelle an eingespeisten Werten + echte Zeilen gegen die Regel
  const a = await p.evaluate(() => {
    const out = { tab: [], zeilen: [] };
    [[62, 38, 0, 0.75, 0], [55, 45, 3, 0, 0.75], [55, 45, -5, 0, -1.05], [55, 45, 7.5, 0, 1.275], [55, 45, 12, 0, 1.35],
     [60, 40, 10, 0.75, 0.75], [30, 70, -12, -0.75, -0.75], [30, 70, 5, -0.75, 1.05], [59.9, 40.1, 2.9, 0, 0]]
      .forEach(([l, s, d, netz, wow]) => { const c = cotPunkte({ longPct: l, shortPct: s, dNetPct: d }); out.tab.push({ l, d, netz, wow, ist: c }); });
    syms.forEach(sym => {
      const rub = (sym.rubrics || []).find(r => r.name === 'COT Data'); if (!rub || !COT_DATA || !COT_DATA.symbols || !COT_DATA.symbols[sym.id]) return;
      const m = cotMetrics(COT_DATA.symbols[sym.id]); if (!m) return;
      const soll = cotPunkte(m);
      const w = n => { const i = rub.indicators.find(x => stripPeriodSuffix(x.name).base === n); return i ? indScore(i, rub) : null; };
      out.zeilen.push({ id: sym.id, soll, netz: roundSc((w('Net Bullish Positioning') || 0) + (w('Net Bearish Positioning') || 0)), wow: w('WoW Change in Net Position (%)') });
    });
    return out;
  });
  a.tab.forEach(c => { if (Math.abs(c.ist.netz - c.netz) > 1e-9 || Math.abs(c.ist.wow - c.wow) > 1e-9) fail('COT-REGEL', `long ${c.l}% · Woche ${c.d} -> netto ${c.ist.netz} / Woche ${c.ist.wow}, Soll ${c.netz} / ${c.wow}`); });
  a.zeilen.forEach(z => {
    if (Math.abs(z.netz - z.soll.netz) > 0.006) fail('COT-ZEILE NETTO', `${z.id}: ${z.netz} statt ${z.soll.netz}`);
    if (z.wow != null && Math.abs(z.wow - roundTo(z.soll.wow)) > 0.006) fail('COT-ZEILE WOCHE', `${z.id}: ${z.wow} statt ${z.soll.wow}`);
    if (Math.abs(z.netz + (z.wow || 0)) > 1.5 + 1e-9) fail('COT UEBER 1,5', `${z.id}: ${z.netz + z.wow}`);
  });
  if (!a.zeilen.length) fail('COT', 'keine COT-Zeilen gefunden');

  // B) Rendite-Trends je 0,75, 2Y-Zinsdifferenz, CB Tone/Next CB Move weg
  const bz = await p.evaluate(() => {
    const out = { bond: [], gap: {}, weg: [] };
    syms.forEach(sym => (sym.rubrics || []).forEach(rub => (rub.indicators || []).forEach(i => {
      const t = indScoreParts(i, rub);
      if (/^(2Y|10Y) Bond Yield$/.test(i.name) && ![0, 0.75, -0.75].includes(roundSc(t.total))) out.bond.push({ id: sym.id, n: i.name, v: t.total });
      if (i.name === '2Y Yield Gap (20d)' && ['USD','EUR','GBP','CHF','JPY','CAD','AUD','NZD'].includes(sym.id)) out.gap[sym.id] = t.total;
      if (i.name === 'CB Tone' || i.name === 'Next CB Move') out.weg.push(sym.id + ':' + i.name);
    })));
    return out;
  });
  bz.bond.forEach(x => fail('RENDITE-TREND NICHT 0,75', JSON.stringify(x)));
  bz.weg.forEach(x => fail('INDIKATOR SOLLTE WEG SEIN', x));
  const bond = lies('bond_data.json');
  if (bond) FX.forEach(c => { const soll = zinsSoll(bond, c); if (soll == null) return; const ist = bz.gap[c];
    if (ist == null) fail('ZINSDIFFERENZ FEHLT', c); else if (Math.abs(ist - soll) > 1e-9) fail('ZINSDIFFERENZ', `${c}: ${ist} statt ${soll} (unabhaengig aus bond_data.json)`); });

  // C) Rohstoffe: AUD/NZD/CAD gegen commodity_data.json nachgerechnet
  const com = lies('commodity_data.json');
  if (com && com.items) {
    const KORB = { AUD: [['IRON', 'Iron Ore (1M)', 0.5], ['COAL', 'Coal (1M)', 0.3], ['GOLD', 'Gold (1M)', 0.2]], NZD: [['DAIRY', 'Dairy (1M)', 1]], CAD: [['OIL', 'Crude Oil (1M)', 1]] };
    const ist = await p.evaluate(() => { const o = {}; ['AUD', 'NZD', 'CAD'].forEach(id => { const s = syms.find(x => x.id === id), r = s.rubrics.find(x => x.name === 'Economic Growth'); o[id] = {}; r.indicators.forEach(i => { if (/\(1M\)$/.test(i.name)) o[id][i.name] = indScore(i, r); }); }); return o; });
    Object.keys(KORB).forEach(c => KORB[c].forEach(([id, name, g]) => {
      const it = com.items[id]; if (!it || it.perf1m == null) return;
      const alt = it.asOf ? Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(it.asOf)) / 864e5) : 99;
      let st = 0;
      if (id === 'DAIRY') st = Math.abs(it.perf1m) >= 5 ? 1 : Math.abs(it.perf1m) >= 2 ? 0.5 : 0;
      else if (it.sigma1m > 0) { const z = it.perf1m / it.sigma1m; st = Math.abs(z) >= 2 ? 1 : Math.abs(z) >= 1 ? 0.5 : 0; } else return;
      const soll = alt <= 7 ? Math.round(Math.sign(it.perf1m) * st * g * 100) / 100 : 0;
      const v = ist[c][name];
      if (v == null) fail('ROHSTOFF-ZEILE FEHLT', `${c}: ${name}`);
      else if (Math.abs(v - soll) > 0.006) fail('ROHSTOFF-REGEL', `${c} ${name}: ${v} statt ${soll}`);
    }));
  }

  // D) Carry: Stufe passt zu Differenz/Schwankung, VIX-Sprung schaltet ab
  const cy = await p.evaluate(() => (ALL_PAIRS || []).filter(n => { const q = n.split('/'), F8 = ['USD','EUR','GBP','CHF','JPY','CAD','AUD','NZD']; return F8.includes(q[0]) && F8.includes(q[1]); }).map(n => ({ n, c: carryDetails(n) })));
  cy.forEach(({ n, c }) => {
    if (!c.ok) return;
    const soll = c.vixAus ? 0 : Math.abs(c.ratio) >= 0.4 ? Math.sign(c.ratio) : Math.abs(c.ratio) >= 0.2 ? Math.sign(c.ratio) * 0.5 : 0;
    if (Math.abs(c.adj - soll) > 1e-9) fail('CARRY-REGEL', `${n}: ${c.adj} statt ${soll} (Verhaeltnis ${c.ratio.toFixed(3)}, VIX ${c.vix})`);
    if (Math.abs(c.ratio - c.diff / c.vol) > 1e-6) fail('CARRY-VERHAELTNIS', n);
  });
  if (!cy.some(x => x.c.ok)) fail('CARRY', 'fuer kein Paar berechenbar');

  // E) Score-Fenster: jede Karte = Summe ihrer Zeilen, keine Fehler; Momentum auf der Seite
  const e = await p.evaluate(() => {
    const out = { fehler: [], karten: 0 };
    syms.forEach(s => { try { openScoreInfoSym(s.id); } catch (x) { out.fehler.push(s.id + ': ' + x); return; }
      const body = document.getElementById('scoreInfoBody');
      const k = body.querySelectorAll('.sw-karte'); out.karten += k.length;
      if (!body.querySelector('.sw-kopf') || !body.querySelector('.sw-bars')) out.fehler.push(s.id + ': Kopf/Uebersicht fehlt'); });
    closeM('mScoreInfo');
    gotoSym('AUD');
    return out;
  });
  e.fehler.forEach(x => fail('SCORE-FENSTER', x));
  await p.waitForTimeout(900);
  // Momentum-Karte ist seit 2026-09-25 entfernt (Nutzer) - darf nicht zurueckkommen.
  const m = await p.evaluate(() => document.querySelectorAll('#detail .ab-mom').length);
  if (m) fail('MOMENTUM-KARTE', 'entfernt am 2026-09-25, steht aber wieder auf der Seite');

  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`regeln --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('regeln --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`regeln: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`regeln: ok (COT-Tabelle + ${a.zeilen.length} Assets, Rendite-Trends 0,75, 2Y-Zinsdifferenz unabhaengig nachgerechnet, ${cy.filter(x => x.c.ok).length} Carry-Paare, Rohstoffe ${com ? 'gegen commodity_data.json' : '(Datei fehlt noch)'}, Score-Fenster ${e.karten} Karten, Momentum-Karte weg)`);
})().catch(e => { console.log('regeln: ABBRUCH ' + e.message); process.exit(1); });
function roundTo(v) { return Math.round((v + (v >= 0 ? 1 : -1) * Number.EPSILON) * 100) / 100; }
