// ── ZEITFILTER: FESTE STUFEN, NUR MIT DATEN, RECHTSBUENDIG ─────────────
//
// Nutzer 2026-09-25: Mini-Charts (aufgeklappte Indikatoren) "6m 1y 6y max",
// alle anderen Charts "3m 6m 1y 3y 6y 10y max"; per Rueckfrage: Custom
// behalten (jetzt per Monat, vorbelegt), History-Fenster umstellen, und "wo
// es nur begrenzt Historie gibt sollen auch nur begrenzt Zeitfilter stehen
// ... rechtsbuendig ... nicht eine Luecke". Geprueft an Price-Karte,
// History-Karte, Trends, Data und einem aufgeklappten Indikator:
//   - nur erlaubte Beschriftungen, in der Reihenfolge der Nutzer-Liste
//   - keine Stufe, die weiter zurueckreicht als die Daten (ausser Max)
//   - Custom = zwei Monatsfelder, vorbelegt
//   - Leiste rechtsbuendig (rechter Rand an der Werkzeugleiste)
//   - History-Karte reagiert auf den Klick (15D markiert, weniger Tage)
//   node check/zeitfilter.js [--gegenprobe]  (schiebt eine "2Y"-Stufe ein und
//   stellt das alte setHistRange nach -> beides rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const GROSS = ['3M', '6M', '1Y', '3Y', '6Y', '10Y', 'Max', 'MAX', 'Custom'];
// History-Karte zusaetzlich 15D/1M/2M (Nutzer 2026-09-26)
const HIST = ['15D', '1M', '2M', ...GROSS];
const MINI = ['6M', '1Y', '6Y', 'Max', 'Custom'];
const MON = { '1M': 1, '2M': 2, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '6Y': 72, '10Y': 120 };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); gotoSym('EUR'); });
  await p.waitForTimeout(1200);
  const lies = sel => p.evaluate(([sel, gp]) => {
    const bs = [...document.querySelectorAll(sel)];
    const l = bs.map(b => b.textContent.trim());
    if (gp && l.length) l.splice(1, 0, '2Y');
    return l;
  }, [sel, GEGENPROBE]);
  const pruefe = (ort, l, erlaubt, ab) => {
    if (!l.length) { fail(ort, 'keine Zeitfilter-Leiste gefunden'); return; }
    l.forEach(x => { if (!erlaubt.includes(x)) fail(ort, `Stufe "${x}" gehoert nicht in ${erlaubt.join('/')}`); });
    const pos = l.map(x => erlaubt.indexOf(x)).filter(i => i >= 0);
    if (pos.some((v, i) => i && v < pos[i - 1])) fail(ort, `Reihenfolge ${l.join(' ')}`);
    if (ab) l.forEach(x => { if (MON[x]) { const c = new Date(); c.setMonth(c.getMonth() - MON[x]); if (c.toISOString().slice(0, 10) <= ab) fail(ort, `${x} reicht hinter den Datenanfang ${ab} (Knopf ohne Wirkung)`); } });
  };
  // Price-Karte
  // Datenanfang inkl. Kurs-Archiv (price_hist_meta.json, seit 2026-09-25)
  const abP = await p.evaluate(() => preisAnfang('EUR'));
  pruefe('PRICE-KARTE', await lies('#detail .ab-ptile .ab-rgs .ab-rg'), GROSS, abP);
  // History
  const abH = await p.evaluate(() => { const h = scoreHist.EUR || []; return h.length ? h[0][0] : null; });
  pruefe('HISTORY', await lies('#detail .histp-rbtn'), HIST, abH);
  // Die History-KARTE muss auf den Klick reagieren (bis 2026-09-26 zeichnete
  // setHistRange nur das Fenster #histBody neu - in der Karte blieb "Max"
  // markiert und die Liste unveraendert). Gegenprobe: altes Verhalten.
  if (GEGENPROBE) await p.evaluate(() => { window.setHistRange = d => { window.histRange = d === 'MAX' ? 'MAX' : +d; }; });
  { const vor = await p.evaluate(() => document.querySelectorAll('#abHistBody .hw-day').length);
    await p.click('#detail .histp-rbtn:text-is("15D")'); await p.waitForTimeout(400);
    const n = await p.evaluate(() => ({ on: [...document.querySelectorAll('#abHistBody .histp-rbtn.on')].map(e => e.textContent.trim()).join(), tage: document.querySelectorAll('#abHistBody .hw-day').length }));
    if (n.on !== '15D' || !(n.tage < vor)) fail('HISTORY-KARTE', `Klick auf 15D wirkt nicht (markiert "${n.on}", ${vor} -> ${n.tage} Tage)`);
    await p.evaluate(() => { try { setHistRange('MAX'); } catch (e) {} }); await p.waitForTimeout(300); }
  { const l = await lies('#detail .histp-rbtn'); ['15D', '1M', '2M'].forEach(x => { if (!l.includes(x)) fail('HISTORY', `Stufe ${x} fehlt (Nutzer 2026-09-26)`); }); }
  // aufgeklappter Indikator (Mini)
  const mini = await p.evaluate(() => {
    const s = syms.find(x => x.id === 'EUR'); let ind = null;
    s.rubrics.forEach(r => (r.indicators || []).forEach(i => { if (!ind && /CPI/.test(i.name) && indChartSeries(i, 'EUR').pts.length > 20) ind = i; }));
    if (!ind) return null;
    const w = document.createElement('div'); w.innerHTML = indHistChart(ind, 'EUR'); document.body.appendChild(w); w.id = 'zfMini';
    return indChartSeries(ind, 'EUR').pts[0][0];
  });
  if (!mini) fail('MINI', 'kein EUR-CPI mit Historie gefunden');
  else pruefe('MINI-CHART', await lies('#zfMini .ind-hist-range-btn'), MINI, mini);
  // Trends + Data (+ Custom)
  await p.evaluate(() => showTab('trends')); await p.waitForTimeout(700);
  pruefe('TRENDS', await lies('#pgTrends .ind-hist-range-bar .ind-hist-range-btn'), GROSS, null);
  await p.evaluate(() => showTab('data')); await p.waitForTimeout(700);
  pruefe('DATA', await lies('#pgData .ind-hist-range-bar .ind-hist-range-btn'), GROSS, null);
  await p.evaluate(() => setDataRange('CUSTOM')); await p.waitForTimeout(400);
  const cu = await p.evaluate(() => [...document.querySelectorAll('#pgData .time-range-custom input')].map(i => [i.type, i.value]));
  if (cu.length !== 2 || cu.some(([t, v]) => t !== 'month' || !/^\d{4}-\d{2}$/.test(v))) fail('CUSTOM', `erwartet zwei vorbelegte Monatsfelder, gefunden ${JSON.stringify(cu)}`);
  // rechtsbuendig
  await p.evaluate(() => setDataRange('12')); await p.waitForTimeout(400);
  const rb = await p.evaluate(() => { const bar = document.querySelector('#pgData .ind-hist-toolbar .ind-hist-range-bar'); if (!bar) return null; const t = bar.parentElement.getBoundingClientRect(), r = bar.getBoundingClientRect(); return Math.round(t.right - r.right); });
  if (rb == null || rb > 2) fail('RECHTSBUENDIG', `Leiste endet ${rb}px vor dem rechten Rand`);
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.some(f => f.startsWith('HISTORY-KARTE')) && F.length > 1) { console.log(`zeitfilter --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('zeitfilter --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`zeitfilter: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log('zeitfilter: ok (Price-Karte, History, Mini-Chart, Trends, Data: erlaubte Stufen, nur mit Daten, Custom per Monat, rechtsbuendig)');
})().catch(e => { console.log('zeitfilter: ABBRUCH ' + e.message); process.exit(1); });
