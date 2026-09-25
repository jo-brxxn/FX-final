// ── ASSET-KOPF: KNOEPFE GROSS, MITTIG, RECHTSBUENDIG ────────────────────
//
// Nutzer 2026-09-25: "oben rechts bei Assets die Knoepfe zu History und
// Backtester sind zu klein mach die perfekt mittig rechtsbuendig auf die
// Karte und mach das Zahnrad so hoch wie die Schrift ... kraeftiger und
// groessere Schrift ... Bild blasser". Gemessen vorher: 13 px Schrift,
// 12 px Luecke rechts, Zahnrad 5 px und Regler 6,5 px ueber der Schriftmitte.
// Geprueft bei 1180 px (GOLD mit Zahnrad, NZD mit Flagge):
//   - Schrift >= 17 px, fett
//   - Knopfgruppe vertikal mittig auf der Karte (±2 px)
//   - rechtsbuendig zum Karteninhalt (<= 2 px)
//   - Zahnrad so hoch wie die Schrift (±1 px), Schrift/Zahnrad/Regler auf
//     einer Mittellinie (±1,5 px)
//   - Flaggenbild blasser als vorher (Deckkraft <= 0,7)
//   node check/kopfleiste.js [--gegenprobe]  (alte 13-px-Schrift -> rot)
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
  if (GEGENPROBE) await p.addStyleTag({ content: '.dmeta-controls .dmeta-hist-btn{font-size:13px!important;padding:8px 0 6px!important}' });
  for (const id of ['GOLD', 'NZD']) {
    await p.evaluate(id => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); gotoSym(id); }, id);
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => {
      const kopf = document.querySelector('#detail .ahead'); if (!kopf) return null;
      const a = kopf.getBoundingClientRect(), cs = getComputedStyle(kopf);
      const els = [...document.querySelectorAll('#detail .dmeta-controls .dmeta-hist-btn, #detail .dmeta-controls .cfg-gear, #detail .dmeta-controls .compact-sw')];
      const bs = els.map(e => e.getBoundingClientRect());
      const t = document.querySelector('#detail .dmeta-hist-btn'), rg = document.createRange(); rg.selectNodeContents(t); const tr = rg.getBoundingClientRect();
      const g = document.querySelector('#detail .cfg-gear svg'), gr = g && g.getBoundingClientRect();
      const sw = document.querySelector('#detail .compact-sw').getBoundingClientRect();
      const band = document.querySelector('#detail .ahead-motif-band');
      const top = Math.min(...bs.map(r => r.top)), bot = Math.max(...bs.map(r => r.bottom)), right = Math.max(...bs.map(r => r.right));
      return { font: parseFloat(getComputedStyle(t).fontSize), gew: +getComputedStyle(t).fontWeight,
        mitte: (top + bot) / 2 - (a.top + a.height / 2), rechts: a.right - parseFloat(cs.paddingRight) - right,
        textM: (tr.top + tr.bottom) / 2, gearM: gr ? (gr.top + gr.bottom) / 2 : null, gearH: gr ? gr.height : null, swM: (sw.top + sw.bottom) / 2,
        deck: band ? +getComputedStyle(band).opacity : null };
    });
    if (!m) { fail(id, 'kein Asset-Kopf'); continue; }
    if (m.font < 17 || m.gew < 700) fail(id + ' SCHRIFT', `${m.font}px / ${m.gew}`);
    if (Math.abs(m.mitte) > 2) fail(id + ' NICHT MITTIG', `${m.mitte.toFixed(1)}px neben der Kartenmitte`);
    if (Math.abs(m.rechts) > 2) fail(id + ' NICHT RECHTSBUENDIG', `${m.rechts.toFixed(1)}px Luecke`);
    if (m.gearH != null && Math.abs(m.gearH - m.font) > 1) fail(id + ' ZAHNRAD', `${m.gearH}px hoch bei ${m.font}px Schrift`);
    [['Zahnrad', m.gearM], ['Regler', m.swM]].forEach(([n, v]) => { if (v != null && Math.abs(v - m.textM) > 1.5) fail(id + ' MITTELLINIE', `${n} ${(v - m.textM).toFixed(1)}px neben der Schriftmitte`); });
    if (m.deck != null && m.deck > 0.7) fail(id + ' BILD', `Deckkraft ${m.deck}`);
  }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`kopfleiste --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('kopfleiste --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`kopfleiste: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log('kopfleiste: ok (GOLD + NZD: 17 px fett, mittig, rechtsbuendig, Zahnrad = Schrifthoehe, eine Mittellinie, Bild blasser)');
})().catch(e => { console.log('kopfleiste: ABBRUCH ' + e.message); process.exit(1); });
