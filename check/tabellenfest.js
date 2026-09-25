// ── FESTE TABELLEN: SCROLLEN NUR BIS ZU DEN RAENDERN ──────────────────
//
// Nutzer-Regel 2026-09-25 (Dauerregel): "der Kalender da ist auch so eine
// Tabelle die nicht fest ist das soll als Regel gemacht werden das alle
// losen Tabellen fest gemacht werden also schon scrollen aber nur zu den
// Grenzen nach oben und unten". Auf dem iPad federt ein innerer
// Scrollbereich sonst ueber seinen Rand hinaus (Gummiband) bzw. reicht den
// Wisch an die Seite weiter. Loesung an der Wurzel: `*{overscroll-behavior:
// none}` im Kopf von index.html, Ausnahme nur die Seiten-Scroller .pc/.detail.
// Geprueft wird jeder tatsaechlich scrollbare Bereich auf allen Tabs, auf der
// Asset-Seite und im Asset-Kalender-Fenster.
//   node check/tabellenfest.js [--gegenprobe]  (Wurzelregel entfernt -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(gp => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (gp) { const st = document.createElement('style'); st.textContent = '*{overscroll-behavior:auto!important}'; document.head.appendChild(st); } }, GEGENPROBE);
  const pruefen = ort => p.evaluate(ort => {
    const out = [];
    document.querySelectorAll('body *').forEach(e => {
      if (e.matches('.pc,.detail')) return;
      const cs = getComputedStyle(e);
      const y = /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1;
      const x = /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1;
      if (!y && !x) return;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      if ((y && cs.overscrollBehaviorY !== 'none') || (x && cs.overscrollBehaviorX !== 'none'))
        out.push(`${ort}: ${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')} (y=${cs.overscrollBehaviorY}, x=${cs.overscrollBehaviorX})`);
    });
    return out;
  }, ort);
  let n = 0;
  const tabs = await p.evaluate(() => TAB_ORDER.slice());
  for (const t of tabs) {
    await p.evaluate(t => { try { showTab(t); } catch (e) {} }, t); await p.waitForTimeout(400);
    (await pruefen('Tab ' + t)).forEach(x => fail('FEDERT', x)); n++;
  }
  await p.evaluate(() => gotoSym('AUD')); await p.waitForTimeout(1200);
  (await pruefen('Asset AUD')).forEach(x => fail('FEDERT', x));
  await p.evaluate(() => openAssetCal()); await p.waitForTimeout(600);
  const kal = await pruefen('Asset-Kalender');
  kal.forEach(x => fail('FEDERT', x));
  const kalDa = await p.evaluate(() => { const m = document.getElementById('mAssetCal'); return !!m && getComputedStyle(m).display !== 'none'; });
  if (!kalDa) fail('ASSET-KALENDER', 'Fenster ging nicht auf');
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`tabellenfest --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('tabellenfest --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`tabellenfest: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`tabellenfest: ok (${n} Tabs, Asset-Seite, Asset-Kalender - jeder Scrollbereich endet an seinen Raendern)`);
})().catch(e => { console.log('tabellenfest: ABBRUCH ' + e.message); process.exit(1); });
