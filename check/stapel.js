// ── ASSET-STAPEL: BREITE HAENGT NICHT AN DEN SCORES ─────────────────────
//
// Bugreport 2026-09-25 (zwei iPad-Bilder, rechte Panelkante 418 vs 425 px
// bei unveraendertem Inhalt; Nutzer: "klappt er mehr auf aber nur ganz
// wenig aber faellt auf"). Ursache gemessen: das Panel ist max-content
// breit, die Score-Zahl steckte in der breitesten Zeile - jede neue
// Score-Lieferung bei offenem Panel verschob die Kante (Chromium 163,9 ->
// 164,6 px, "-2.3" -> "+5").
// Geprueft: Panel offen, alle Scores nacheinander auf kurze ("0") und lange
// ("-10.8") Werte gesetzt - die Breite bleibt auf 0,5 px gleich.
//   node check/stapel.js [--gegenprobe]  (Score-Spalte ohne feste Breite -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  if (GEGENPROBE) await p.addStyleTag({ content: '#navSidebar .np-assets .np .np-score{min-width:0!important;font-variant-numeric:normal!important}' });
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); document.querySelector('.np-assetstack').click(); });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const w = document.querySelector('#navSidebar .np-sub-wrap.np-assets');
    if (!w || !w.classList.contains('open')) return null;
    const sc = [...w.querySelectorAll('.np-score')];
    const mess = () => +w.getBoundingClientRect().width.toFixed(2);
    const out = [];
    for (const v of ['0', '+1', '-4.6', '+10.2', '-10.8']) { sc.forEach(s => { s.textContent = v; }); out.push([v, mess()]); }
    return out;
  });
  if (!r) fail('PANEL', 'Asset-Stapel ging nicht auf');
  else { const ws = r.map(x => x[1]); const d = Math.max(...ws) - Math.min(...ws); if (d > 0.5) fail('BREITE SPRINGT', r.map(x => `${x[0]}→${x[1]}px`).join(', ')); }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`stapel --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('stapel --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`stapel: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`stapel: ok (Panelbreite bei Scores 0 … -10.8 konstant: ${r[0][1]}px)`);
})().catch(e => { console.log('stapel: ABBRUCH ' + e.message); process.exit(1); });
