// ── "GO TO RETAIL SENTIMENT" MIT PAAR-AUSWAHL ───────────────────────────
//
// Nutzer 2026-09-25: "wenn man bei der Karte Retail Sentiment auf Go to
// retail geht dann soll ein Fenster kommen wo man dann auswaehlen kann mit
// welcher Waehrung man es paaren moechte bzw. welchem Non-FX-Asset bei USD
// zumindest das steht dann aber auch separat die Waehrungen und Non-FX bei
// USD".
// Geprueft: EUR -> Fenster mit 7 Waehrungen, KEINE Non-FX-Gruppe; Klick auf
// ein Paar oeffnet Retail Sentiment mit genau diesem Buch, der Rueckweg zur
// Asset-Seite steht. USD -> zwei getrennte Gruppen (Waehrungen + Non-FX).
// GOLD -> kein Fenster, direkt das eine Buch.
//   node check/retailwahl.js [--gegenprobe]  (alter Direktsprung -> rot)
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
  if (GEGENPROBE) await p.evaluate(() => { window.retailGoTo = () => assetQuickGo('retail'); });
  const knopf = () => p.evaluate(() => { const bt = [...document.querySelectorAll('#detail .ab-goto-b')].find(x => /Retail/.test(x.textContent)); if (!bt) return false; bt.click(); return true; });
  const fenster = () => p.evaluate(() => { const m = document.getElementById('retailPartnerPicker'); if (!m) return null; return { gruppen: [...m.querySelectorAll('.rtp-grp')].map(g => g.textContent.trim()), grids: [...m.querySelectorAll('.rtp-grid')].map(g => g.querySelectorAll('.rtp-opt').length), aktiv: [...m.querySelectorAll('.rtp-opt:not(:disabled)')].map(x => x.getAttribute('onclick')) }; });
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); gotoSym('EUR'); }); await p.waitForTimeout(1200);
  if (!await knopf()) fail('EUR', 'kein "Go to Retail"-Knopf');
  await p.waitForTimeout(300);
  const e = await fenster();
  if (!e) fail('EUR', 'kein Auswahlfenster');
  else {
    if (e.gruppen.length !== 1 || e.grids[0] !== 7) fail('EUR', `erwartet 1 Gruppe mit 7 Waehrungen, gefunden ${JSON.stringify(e)}`);
    const ziel = await p.evaluate(() => { const bt = [...document.querySelectorAll('#retailPartnerPicker .rtp-opt:not(:disabled)')].find(x => /EUR\/USD/.test(x.textContent)); if (!bt) return null; bt.click(); return 'EURUSD'; });
    await p.waitForTimeout(800);
    const st = await p.evaluate(() => ({ tab: curPage, sym: typeof sentSym !== 'undefined' ? sentSym : window.sentSym, zurueck: document.body.classList.contains('res-return-active') }));
    if (!ziel) fail('EUR', 'EUR/USD nicht waehlbar');
    else if (st.tab !== 'sent' || st.sym !== 'EURUSD' || !st.zurueck) fail('EUR KLICK', JSON.stringify(st));
  }
  await p.evaluate(() => gotoSym('USD')); await p.waitForTimeout(1200);
  await knopf(); await p.waitForTimeout(300);
  const u = await fenster();
  if (!u) fail('USD', 'kein Auswahlfenster');
  else if (u.gruppen.length !== 2 || !/Currencies/.test(u.gruppen[0]) || !/Non-FX/.test(u.gruppen[1]) || u.grids[1] < 1) fail('USD', `erwartet Waehrungen + Non-FX getrennt, gefunden ${JSON.stringify(u)}`);
  await p.evaluate(() => closeRetailPartnerPicker());
  await p.evaluate(() => gotoSym('GOLD')); await p.waitForTimeout(1200);
  await knopf(); await p.waitForTimeout(600);
  const g = await p.evaluate(() => ({ fenster: !!document.getElementById('retailPartnerPicker'), tab: curPage }));
  if (g.fenster || g.tab !== 'sent') fail('GOLD', `soll direkt ins eine Buch: ${JSON.stringify(g)}`);
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`retailwahl --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('retailwahl --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`retailwahl: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log('retailwahl: ok (EUR: 7 Waehrungen, Klick -> EURUSD mit Rueckweg; USD: Waehrungen + Non-FX getrennt; GOLD direkt)');
})().catch(e => { console.log('retailwahl: ABBRUCH ' + e.message); process.exit(1); });
