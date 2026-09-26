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
//   - Nutzer 2026-09-26: fehlt nur ein wenig Breite, schrumpfen Titel +
//     Unterzeile, statt dass die Knopfleiste in die naechste Zeile rutscht
//     (DEYIELD bei 1180 px: vorher 89 px tiefer, 5 px fehlten)
//   node check/kopfleiste.js [--gegenprobe]  (alte 13-px-Schrift + feste
//   Titelgroesse -> beide Befunde muessen rot sein)
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
  // Einzeilig bei knappem Platz: DEYIELD (laengste Unterzeile) bei 1180 px.
  // Gegenprobe: schmale 13-px-Knoepfe wieder weg (sonst passt es zufaellig),
  // dafuer die Titelgroesse festnageln.
  if (GEGENPROBE) await p.evaluate(() => { document.querySelectorAll('style').forEach(t => { if (t.textContent.includes('font-size:13px!important')) t.remove(); });
    const t = document.createElement('style'); t.textContent = '#detail .ahead .atitle{font-size:38px!important} #detail .ahead .afull{font-size:15px!important}'; document.head.appendChild(t); });
  await p.evaluate(() => gotoSym('DEYIELD')); await p.waitForTimeout(1200);
  const z = await p.evaluate(() => {
    const k = document.querySelector('#detail .ahead'); if (!k) return null;
    const l = k.querySelector('.ahead-l').getBoundingClientRect(), d = k.querySelector('.dmeta').getBoundingClientRect();
    return { unter: d.top >= l.bottom - 2, fs: getComputedStyle(k.querySelector('.atitle')).fontSize };
  });
  if (!z) fail('DEYIELD', 'kein Asset-Kopf');
  else if (z.unter) fail('DEYIELD EINZEILIG', `Knopfleiste rutscht unter den Titel (Titel ${z.fs})`);
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.some(f => f.includes('SCHRIFT')) && F.some(f => f.includes('EINZEILIG'))) { console.log(`kopfleiste --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('kopfleiste --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`kopfleiste: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log('kopfleiste: ok (GOLD + NZD: 17 px fett, mittig, rechtsbuendig, Zahnrad = Schrifthoehe, eine Mittellinie, Bild blasser; DEYIELD einzeilig)');
})().catch(e => { console.log('kopfleiste: ABBRUCH ' + e.message); process.exit(1); });
