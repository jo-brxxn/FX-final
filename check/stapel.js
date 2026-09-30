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
//
// Seit 2026-09-30 zusaetzlich JEDES BILD DES AUFKLAPPENS (Nutzer, dritte
// Meldung: "dann klappt erst ein kleiner Teil zu viel aus der dann
// verschwindet"). Gemessen: das Panel startete mit translateX(-10px) bei
// x=66 statt 76 und lag ~150 ms ueber der Symbolleiste. Geprueft wird mit
// echtem Tippen, fuer den Asset-Stapel und jeden anderen Stapel: in keinem
// Bild liegt das Panel links von seiner Endkante, ist breiter als am Ende,
// oder gibt links mehr frei als sein eigenes Feld (clip-path).
//   node check/stapel.js --gegenprobe-aufklappen  (altes Einschieben -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_AUF = process.argv.includes('--gegenprobe-aufklappen');
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
  // ── Jedes Bild des Aufklappens ────────────────────────────────────────
  if (GP_AUF) await p.addStyleTag({ content: '#navSidebar .np-sub-wrap{clip-path:none!important;transform:translateX(-10px);transition:transform .18s cubic-bezier(.4,0,.2,1),opacity .14s ease,visibility .18s!important}#navSidebar .np-sub-wrap.open{transform:none}' });
  const stapel = await p.evaluate(() => [...document.querySelectorAll('#navSidebar .np-stack[data-stack]')].map(b => b.dataset.stack));
  let bilder = 0;
  for (const id of stapel) {
    // zu, kurz warten, dann echt antippen und jedes Bild mitschreiben
    await p.evaluate(() => { expandedStack = null; syncNavExpanded(); });
    await p.waitForTimeout(450);
    await p.evaluate(id => {
      window.__auf = []; const t0 = performance.now();
      const w = document.querySelector(`#navSidebar .np-sub-wrap[data-stack="${id}"]`);
      const tick = () => {
        const r = w.getBoundingClientRect(), cs = getComputedStyle(w);
        const m = /inset\(([^)]*)\)/.exec(cs.clipPath || '');
        const teile = m ? m[1].trim().split(/\s+(?![^(]*\))/) : [];
        const links = teile.length === 4 ? teile[3] : teile.length === 2 ? teile[1] : teile.length ? teile[teile.length > 1 ? 1 : 0] : '0px';
        __auf.push({ l: r.left, w: r.width, op: +cs.opacity, vis: cs.visibility, clipLinks: links });
        if (performance.now() - t0 < 700) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, id);
    await p.locator(`#navSidebar .np-stack[data-stack="${id}"]`).tap();
    await p.waitForTimeout(800);
    const fr = await p.evaluate(() => __auf);
    const end = fr[fr.length - 1];
    if (!end || end.op < 0.99) { fail('AUFKLAPPEN', `Stapel ${id}: nach 700 ms nicht offen (Deckkraft ${end && end.op})`); continue; }
    const sichtbar = fr.filter(f => f.vis === 'visible' && f.op > 0.01);
    bilder += sichtbar.length;
    const links = sichtbar.filter(f => f.l < end.l - 0.5);
    const breit = sichtbar.filter(f => f.w > end.w + 0.5);
    const clip = sichtbar.filter(f => /^-/.test(f.clipLinks));
    if (links.length) fail('ZU WEIT AUFGEKLAPPT', `Stapel ${id}: in ${links.length} Bildern liegt das Panel links von seiner Endkante (bis x=${Math.min(...links.map(f => f.l)).toFixed(1)} statt ${end.l.toFixed(1)}) - es ueberdeckt die Symbolleiste und verschwindet dann wieder`);
    if (breit.length) fail('ZU WEIT AUFGEKLAPPT', `Stapel ${id}: in ${breit.length} Bildern breiter als am Ende (bis ${Math.max(...breit.map(f => f.w)).toFixed(1)} statt ${end.w.toFixed(1)} px)`);
    if (clip.length) fail('ZU WEIT AUFGEKLAPPT', `Stapel ${id}: clip-path gibt links mehr frei als das Panel (${clip[0].clipLinks}) - der Teil laege ueber der Leiste`);
  }
  if (bilder < 5) fail('ZU WENIG GEPRUEFT', `nur ${bilder} sichtbare Bilder beim Aufklappen aufgezeichnet`);
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GP_AUF) { if (F.some(f => f.startsWith('ZU WEIT AUFGEKLAPPT'))) { console.log('stapel --gegenprobe-aufklappen: ok (altes Einschieben wird rot gemeldet)'); process.exit(0); } console.log('stapel --gegenprobe-aufklappen: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (GEGENPROBE) { if (F.length) { console.log(`stapel --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('stapel --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`stapel: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`stapel: ok (Panelbreite bei Scores 0 … -10.8 konstant: ${r[0][1]}px; ${stapel.length} Stapel Bild fuer Bild aufgeklappt, ${bilder} Bilder, keins groesser als das Endbild)`);
})().catch(e => { console.log('stapel: ABBRUCH ' + e.message); process.exit(1); });
