// ── WISCH-UEBERGANG, STAPEL-PANEL, HISTORY-KARTE ───────────────────────
//
// Nutzer 2026-09-23: Wisch beim Seitenwechsel ("das Bild des Assets ...
// einmal schnell von links nach ganz rechts ... waehrend sie laeuft
// verschwindet der Stapel"), per Rueckfrage: 0,5 s, laeuft bis zum Ende,
// Inhalt waehrenddessen bedienbar, bei JEDEM Seitenwechsel, nicht bei
// Fenstern. Dazu zwei gemessene Fehler:
//   - "die Stapel erscheinen zwar mit Animation aber das verschwinden ist
//     manchmal ohne": der Seitenaufbau blockierte 0,5-2,2 s, das Panel
//     schloss erst danach. Jetzt schliesst es beim Tipp.
//   - Bugreport 2026-09-23 "Wenn ich Kategorie umschalte sieht es so aus und
//     haengt sich auf": die erste Fassung KLONTE Seite + Panel in die
//     Wisch-Ebene; ohne ids/Vorfahren griff das CSS nicht (Panel als nacktes
//     Geruest, "FX" in 16px), ~+100 ms pro Tipp. 2. Fassung: Vorhang in
//     Seitenfarbe - 340-514 ms nur Weiss, rechts der Flagge leer ("das ist
//     dann weiss"). Jetzt: die alte Seite SELBST bleibt 1 s obenauf.
//   - History-Karte: Zahlen bis 29 px ausserhalb, waagerecht verschiebbar,
//     Scrollen lief an die Seite weiter.
// Die anderen Waechter fahren OHNE Wisch (navigator.webdriver); dieser
// schaltet ihn mit window.__wischTest ausdruecklich an.
//   node check/uebergang.js [--gegenprobe]        (Wisch-Ebene faengt Klicks)
//   node check/uebergang.js [--gegenprobe-kopie]  (alte Seite ausserhalb ihrer Vorfahren)
//   node check/uebergang.js [--gegenprobe-flagge] (Inline-Flagge statt Bild)
//   node check/uebergang.js [--gegenprobe-hoehe]  (alte .dp in voller Inhaltshoehe)
// Nutzer 2026-09-23 (iPad): "alle Uebergaenge gehen ausser der zwischen den
// Waehrungen". Gemessener Unterschied zum funktionierenden Seitenwechsel: die
// alte .dp lag in VOLLER Inhaltshoehe (2594 px, ~9,5 Mio. Pixel bei
// Pixeldichte 2) als fixe clip-path-Ebene obenauf. Geprueft wird, dass die
// alte Seite nicht hoeher ist als die sichtbare Seitenflaeche.
// Nutzer 2026-09-23 (iPad): "Alle Animationen beim Wechseln klappen ausser die
// von fx also die Flaggen" - in Chromium sichtbar, nur WebKit zeichnete sie
// nicht. Die Wisch-Flagge ist deshalb ein eigenstaendiges <img>; geprueft wird,
// dass sie eines ist, dekodiert, und dass ihr SVG jeden url(#..)-Verweis selbst
// definiert und keinen Mischmodus traegt.
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_KOPIE = process.argv.includes('--gegenprobe-kopie');
const GP_FLAGGE = process.argv.includes('--gegenprobe-flagge');
const GP_HOEHE = process.argv.includes('--gegenprobe-hoehe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(g => { window.__wischTest = true; try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {}
    if (g) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.wisch{pointer-events:auto!important}'; document.head.appendChild(st); }); }, GEGENPROBE);
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); gotoSym('USD'); });
  await p.waitForTimeout(1800);

  // 1) Asset-Wechsel ueber das Panel: die ALTE Seite (dieselben Knoten, in
  //    #detail, mit vollem CSS) liegt im ersten Bild obenauf, keine Kopie,
  //    kein Vorhang, echtes Panel zu.
  const refFont = await p.evaluate(() => getComputedStyle(document.querySelector('#detail .atitle')).fontSize);
  await p.tap('.np-assetstack'); await p.waitForTimeout(350);
  const w1 = await p.evaluate(async ([gp, gpf, gph]) => {
    const altDp = document.querySelector('#detail>.dp');
    document.querySelector('#sidebar .np-asset[data-sym="GBP"]').click();
    await new Promise(r => requestAnimationFrame(r));      // erstes Bild nach dem Umbau
    if (gpf) { const im = document.querySelector('.wisch .wisch-flagge img'); if (im) im.outerHTML = assetIconHtml('GBP', 200, true); }
    const fim = document.querySelector('.wisch .wisch-flagge img');
    let flagge = { img: !!fim };
    if (fim) {
      try { await fim.decode(); } catch (e) {}
      const txt = decodeURIComponent(fim.src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
      const def = new Set([...txt.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
      const refs = [...txt.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map(m => m[1]);
      flagge = { img: true, ok: fim.complete && fim.naturalWidth > 0, fehlend: [...new Set(refs.filter(r => !def.has(r)))], blend: /mix-blend|class="ai-/.test(txt), bewegt: /<animate/.test(txt) };
    }
    const o = document.querySelector('.wisch'), alt = document.querySelector('.wisch-alt');
    if (gph && alt) { alt.style.height = ''; alt.style.overflow = ''; }
    // Gegenprobe: das Verhalten der 1. Fassung nachstellen (Seite ausserhalb
    // ihrer Vorfahren, ohne ids)
    if (gp && alt) { alt.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); document.body.appendChild(alt); }
    const res = { flagge, da: !!o, alt: !!alt, panelZu: !document.querySelector('#navSidebar .np-sub-wrap.open'), sym: (getSym() || {}).id };
    if (!o || !alt) return res;
    const area = document.getElementById('pageArea').getBoundingClientRect(), r = alt.getBoundingClientRect(), cs = getComputedStyle(alt);
    const t = alt.querySelector('.atitle');
    return Object.assign(res, {
      fremd: [...o.children].filter(k => k.className !== 'wisch-bild').map(k => k.className || k.tagName),
      original: alt === altDp, imDetail: !!alt.closest('#detail'),
      font: t ? getComputedStyle(t).fontSize : null,
      deckt: r.left <= area.left + 1 && r.right >= area.right - 1 && r.top <= area.top + 1 && r.bottom >= area.bottom - 1,
      grund: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none',
      neuVorn: document.querySelector('#detail>.dp') !== alt,
      hoehe: [Math.round(r.height), Math.round(area.height)] });
  }, [GP_KOPIE, GP_FLAGGE, GP_HOEHE]);
  if (!w1.da) fail('KEIN WISCH', 'Asset-Wechsel USD -> GBP startet keinen Wisch-Uebergang');
  if (w1.da) {
    const fl = w1.flagge;
    if (!fl.img) fail('WISCH-FLAGGE NICHT EIGENSTAENDIG', 'die FX-Flagge im Wisch ist kein <img> - als Inline-SVG mit Verweisen in die geteilten Defs zeichnete Safari/iPad sie nicht (2026-09-23)');
    else {
      if (!fl.ok) fail('WISCH-FLAGGE LAEDT NICHT', 'das Flaggenbild dekodiert nicht');
      if (fl.fehlend.length) fail('WISCH-FLAGGE VERWEIST NACH AUSSEN', `nicht im Bild definiert: ${fl.fehlend.join(', ')} - ein Bild sieht die Defs der Seite nicht`);
      if (fl.bewegt) fail('WISCH-FLAGGE BEWEGT SICH', 'SMIL-Animation im Flaggenbild - verlangt ist eine statische Zeichnung (Nutzer 2026-09-23)');
      if (fl.blend) fail('WISCH-FLAGGE BRAUCHT SEITEN-CSS', 'Mischmodus oder ai-Klassen im Bild - Seiten-CSS wirkt in einem <img> nicht');
    }
  }
  if (w1.da && !w1.alt) fail('ALTE SEITE FEHLT', 'im ersten Bild liegt die alte Seite nicht obenauf - rechts der Flagge waere es leer ("das ist dann weiss", 2026-09-23)');
  if (w1.alt) {
    if (w1.fremd && w1.fremd.length) fail('FREMDES IN DER WISCH-EBENE', `neben dem Bild liegt: ${w1.fremd.join(', ')}`);
    if (!w1.original || !w1.imDetail || w1.font !== refFont) fail('ALTE SEITE OHNE CSS', `alte Seite ist ${w1.original ? '' : 'NICHT '}der Originalknoten, ${w1.imDetail ? '' : 'NICHT '}in #detail, Titel ${w1.font} statt ${refFont} - eine Kopie ausserhalb ihrer Vorfahren verliert ihr CSS (Bugreport 2026-09-23)`);
    if (!w1.deckt) fail('ALTE SEITE DECKT NICHT', 'die alte Seite deckt die Seitenflaeche im ersten Bild nicht ganz');
    if (!w1.grund) fail('ALTE SEITE DURCHSICHTIG', 'die alte Seite hat keinen eigenen Hintergrund - die neue scheint durch');
    if (w1.hoehe[0] > w1.hoehe[1] + 1) fail('ALTE SEITE ZU HOCH', `die alte Seite liegt ${w1.hoehe[0]} px hoch obenauf, sichtbar sind ${w1.hoehe[1]} px - als volle Inhaltshoehe hing der Waehrungswechsel auf dem iPad (2026-09-23)`);
    if (!w1.neuVorn) fail('ALTE SEITE VOR DER NEUEN', 'die alte .dp steht in #detail VOR der neuen - getElementById/querySelector traefen die alte');
  }
  if (!w1.panelZu) fail('PANEL BLEIBT OFFEN', 'nach der Asset-Wahl steht das echte Panel noch offen');
  if (w1.sym !== 'GBP') fail('NEUER INHALT FEHLT', `unter dem Wisch steht nicht GBP, sondern ${w1.sym}`);
  // 2) Inhalt ist waehrend des Wischs bedienbar: echter Klick auf "History"
  await p.waitForTimeout(80);
  const nochDa = await p.evaluate(() => !!document.querySelector('.wisch'));
  // ⚠ ROHER Klick an die Koordinaten: p.click() wartet von selbst, bis nichts
  // mehr ueber dem Knopf liegt - eine klickfangende Kopie fiele so nie auf
  // (erste Fassung: Gegenprobe blieb gruen).
  const kn = await p.evaluate(() => { const e = [...document.querySelectorAll('.dmeta .dmeta-hist-btn')].find(x => x.textContent.trim() === 'History'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(kn.x, kn.y);
  await p.waitForTimeout(250);
  const hist = await p.evaluate(() => { const m = document.getElementById('mHist'); return !!m && m.style.display === 'flex'; });
  if (nochDa && !hist) fail('INHALT WAEHREND DES WISCHS NICHT BEDIENBAR', 'ein Klick auf "History" waehrend des Wischs oeffnet nichts - die Wisch-Ebene faengt Klicks ab');
  // 3) Fenster in der Seite: KEIN Wisch
  // Dauer aus der App lesen, nicht fest annehmen (0,5 s -> 1,0 s am 2026-09-23).
  const dauer = await p.evaluate(() => WISCH_MS);
  await p.waitForTimeout(dauer + 300);
  const offen = await p.evaluate(() => document.querySelectorAll('.wisch').length);
  if (offen) fail('WISCH ENDET NICHT', `${offen} Wisch-Ebene(n) ${dauer + 300} ms spaeter noch da`);
  const rest = await p.evaluate(() => ({ alt: document.querySelectorAll('.wisch-alt').length, dps: document.querySelectorAll('#detail>.dp').length, inert: document.querySelectorAll('#pageArea [inert]').length }));
  if (rest.alt || rest.dps !== 1 || rest.inert) fail('ALTE SEITE BLEIBT', `nach dem Wisch: ${rest.alt} .wisch-alt, ${rest.dps} .dp in #detail, ${rest.inert} inert-Reste`);
  await p.evaluate(() => { const m = document.getElementById('mHist'); if (m) m.style.display = 'none'; openPriceChart(getSym().id); });
  const beiFenster = await p.evaluate(() => document.querySelectorAll('.wisch').length);
  if (beiFenster) fail('WISCH BEI FENSTER', 'das Oeffnen von "Price chart" (ein Fenster, kein Seitenwechsel) loest den Wisch aus');
  await p.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.style.display = 'none'));
  // 4) Seitenwechsel ohne Asset wischt ebenfalls, mit Szene
  await p.evaluate(() => showTab('dash')); await p.waitForTimeout(120);
  const w4 = await p.evaluate(() => ({ da: !!document.querySelector('.wisch'), bild: !!document.querySelector('.wisch .wisch-motiv svg, .wisch .wisch-flagge'), alt: (document.querySelector('.wisch-alt') || {}).id }));
  if (!w4.da) fail('KEIN WISCH BEI SEITENWECHSEL', 'Assets -> Dashboard ohne Wisch');
  if (w4.da && w4.alt !== 'pgCur') fail('ALTE SEITE FEHLT', `Assets -> Dashboard: obenauf liegt ${w4.alt || 'nichts'} statt #pgCur`);
  const ein = await p.evaluate(() => { const pg = document.getElementById('pgDash'), dw = document.querySelector('#dashWidgets>.dash-zone>.dw');
    const d = e => e ? parseFloat(getComputedStyle(e).animationDuration) : null;
    return { seite: d(pg), karte: d(dw), wisch: WISCH_MS / 1000 }; });
  if (ein.seite !== 1 || (ein.karte !== null && ein.karte !== 1)) fail('EINBLENDUNG NICHT 1 S', `Seite ${ein.seite}s, Dashboard-Karte ${ein.karte}s - verlangt 1 s wie der Wisch (Nutzer 2026-09-23)`);
  if (ein.wisch !== 1) fail('WISCH NICHT 1 S', `WISCH_MS = ${ein.wisch * 1000}`);
  await p.waitForTimeout(dauer + 400);
  const w4b = await p.evaluate(() => ({ cur: document.getElementById('pgCur').style.display, dash: document.getElementById('pgDash').style.display, alt: document.querySelectorAll('.wisch-alt').length }));
  if (w4b.cur !== 'none' || w4b.dash !== 'block' || w4b.alt) fail('SEITEN NACH DEM WISCH FALSCH', `pgCur=${w4b.cur}, pgDash=${w4b.dash}, ${w4b.alt} .wisch-alt`);
  // 5) Animationen aus -> kein Wisch
  await p.evaluate(() => { document.body.classList.add('no-ui-anim'); gotoSym('EUR'); });
  const w5 = await p.evaluate(() => document.querySelectorAll('.wisch').length);
  if (w5) fail('WISCH TROTZ AUS', 'bei ausgeschalteten UI-Animationen laeuft der Wisch trotzdem');
  await p.evaluate(() => document.body.classList.remove('no-ui-anim'));

  // 6) History-Karte auf iPad-Breite
  await p.waitForTimeout(dauer + 200);
  const h = await p.evaluate(() => { const t = document.querySelector('.ab-htile'); if (!t) return null; const tr = t.getBoundingClientRect(), l = t.querySelector('.histp'), cs = getComputedStyle(l);
    const raus = [...t.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && !e.children.length && e.textContent.trim() && (r.right > tr.right + 1 || r.left < tr.left - 1); }).length;
    return { raus, ox: cs.overflowX, osb: cs.overscrollBehaviorY, breiter: l.scrollWidth > l.clientWidth + 1 }; });
  if (!h) fail('HISTORY-KARTE FEHLT', 'keine .ab-htile auf der Asset-Seite');
  else {
    if (h.raus) fail('HISTORY: TEXT AUSSERHALB', `${h.raus} Textelemente ragen aus der Karte`);
    if (h.ox !== 'hidden' || h.breiter) fail('HISTORY: WAAGERECHT VERSCHIEBBAR', `overflow-x=${h.ox}, Inhalt breiter als die Liste: ${h.breiter}`);
    if (h.osb !== 'none') fail('HISTORY: SCROLLEN LAEUFT AN DIE SEITE WEITER', `overscroll-behavior=${h.osb}`);
  }
  if (perr.length) perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GP_HOEHE) { const ok = F.some(x => x.startsWith('ALTE SEITE ZU HOCH')); console.log(ok ? 'uebergang --gegenprobe-hoehe: ok (alte .dp in voller Hoehe wird gemeldet)' : 'uebergang --gegenprobe-hoehe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (GP_FLAGGE) { const ok = F.some(x => x.startsWith('WISCH-FLAGGE NICHT EIGENSTAENDIG')); console.log(ok ? 'uebergang --gegenprobe-flagge: ok (Inline-Flagge wird gemeldet)' : 'uebergang --gegenprobe-flagge: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (GP_KOPIE) { const ok = F.some(x => x.startsWith('ALTE SEITE OHNE CSS')); console.log(ok ? 'uebergang --gegenprobe-kopie: ok (Seite ausserhalb ihrer Vorfahren wird gemeldet)' : 'uebergang --gegenprobe-kopie: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (GEGENPROBE) { const ok = F.some(x => x.startsWith('INHALT WAEHREND')); console.log(ok ? 'uebergang --gegenprobe: ok (klickfangende Kopie wird gemeldet)' : 'uebergang --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (F.length) { console.log(`uebergang: ${F.length} Befund(e)\n  ` + F.join('\n  ')); process.exit(1); }
  console.log('uebergang: ok (Wisch bei Asset- und Seitenwechsel, FX-Flagge als eigenstaendiges Bild, alte Seite als Originalknoten mit CSS obenauf und danach weg, Panel zu, Inhalt bedienbar, kein Wisch bei Fenstern/ohne Animation, History-Karte fest)');
})();
