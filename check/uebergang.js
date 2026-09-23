// ── WISCH-UEBERGANG, STAPEL-PANEL, HISTORY-KARTE ───────────────────────
//
// Nutzer 2026-09-23: Wisch beim Seitenwechsel ("das Bild des Assets ...
// einmal schnell von links nach ganz rechts ... waehrend sie laeuft
// verschwindet der Stapel"), per Rueckfrage: 0,5 s, laeuft bis zum Ende,
// Inhalt waehrenddessen bedienbar, bei JEDEM Seitenwechsel, nicht bei
// Fenstern. Dazu zwei gemessene Fehler:
//   - "die Stapel erscheinen zwar mit Animation aber das verschwinden ist
//     manchmal ohne": der Seitenaufbau blockierte 0,5-2,2 s, das Panel
//     schloss erst danach. Jetzt liegt es ab dem Tipp unter dem Vorhang.
//   - Bugreport 2026-09-23 "Wenn ich Kategorie umschalte sieht es so aus und
//     haengt sich auf": die erste Fassung KLONTE Seite + Panel in die
//     Wisch-Ebene; ohne ids/Vorfahren griff das CSS nicht (Panel als nacktes
//     Geruest, "FX" in 16px), ~+100 ms pro Tipp. Jetzt: nur Vorhang + Bild.
//   - History-Karte: Zahlen bis 29 px ausserhalb, waagerecht verschiebbar,
//     Scrollen lief an die Seite weiter.
// Die anderen Waechter fahren OHNE Wisch (navigator.webdriver); dieser
// schaltet ihn mit window.__wischTest ausdruecklich an.
//   node check/uebergang.js [--gegenprobe]        (Wisch-Ebene faengt Klicks)
//   node check/uebergang.js [--gegenprobe-kopie]  (Seitenkopie in der Ebene)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_KOPIE = process.argv.includes('--gegenprobe-kopie');
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

  // 1) Asset-Wechsel ueber das Panel: Vorhang in Seitenfarbe, KEINE Kopie,
  //    echtes Panel zu
  await p.tap('.np-assetstack'); await p.waitForTimeout(350);
  await p.evaluate(gp => { const panel = document.querySelector('#navSidebar .np-sub-wrap.open');
    document.querySelector('#sidebar .np-asset[data-sym="GBP"]').click();
    // Gegenprobe: das alte Verhalten (Panel-Klon in der Wisch-Ebene) nachstellen
    const o = document.querySelector('.wisch'); if (gp && o && panel) o.appendChild(panel.cloneNode(true)); }, GP_KOPIE);
  const w1 = await p.evaluate(() => { const o = document.querySelector('.wisch');
    if (!o) return { da: false, panelZu: !document.querySelector('#navSidebar .np-sub-wrap.open'), sym: (getSym() || {}).id };
    const fremd = [...o.children].filter(k => !/^wisch-(vorhang|bild)$/.test(k.className)).map(k => k.className || k.tagName);
    const v = o.querySelector('.wisch-vorhang'), r = v && v.getBoundingClientRect(), orr = o.getBoundingClientRect();
    return { da: true, fremd, vorhangBg: v ? getComputedStyle(v).backgroundColor : null, seiteBg: getComputedStyle(document.body).backgroundColor,
      deckt: !!r && r.left <= orr.left + 1 && r.right >= orr.right - 1 && r.height >= orr.height - 1,
      panelZu: !document.querySelector('#navSidebar .np-sub-wrap.open'), sym: (getSym() || {}).id }; });
  if (!w1.da) fail('KEIN WISCH', 'Asset-Wechsel USD -> GBP startet keinen Wisch-Uebergang');
  if (w1.da && w1.fremd.length) fail('KOPIE IN DER WISCH-EBENE', `neben Vorhang/Bild liegt: ${w1.fremd.join(', ')} - eine geklonte Seite verliert ausserhalb ihrer Vorfahren ihr CSS (Bugreport 2026-09-23)`);
  if (w1.da && w1.vorhangBg !== w1.seiteBg) fail('VORHANG NICHT IN SEITENFARBE', `Vorhang ${w1.vorhangBg}, Seite ${w1.seiteBg}`);
  if (w1.da && !w1.deckt) fail('VORHANG DECKT NICHT', 'vor dem Losfahren deckt der Vorhang die Flaeche nicht ganz - der halbfertige Aufbau waere sichtbar');
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
  await p.evaluate(() => { const m = document.getElementById('mHist'); if (m) m.style.display = 'none'; openPriceChart(getSym().id); });
  const beiFenster = await p.evaluate(() => document.querySelectorAll('.wisch').length);
  if (beiFenster) fail('WISCH BEI FENSTER', 'das Oeffnen von "Price chart" (ein Fenster, kein Seitenwechsel) loest den Wisch aus');
  await p.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.style.display = 'none'));
  // 4) Seitenwechsel ohne Asset wischt ebenfalls, mit Szene
  await p.evaluate(() => showTab('dash')); await p.waitForTimeout(120);
  const w4 = await p.evaluate(() => ({ da: !!document.querySelector('.wisch'), bild: !!document.querySelector('.wisch .wisch-motiv svg, .wisch .wisch-flagge') }));
  if (!w4.da) fail('KEIN WISCH BEI SEITENWECHSEL', 'Assets -> Dashboard ohne Wisch');
  await p.waitForTimeout(dauer + 400);
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
  if (GP_KOPIE) { const ok = F.some(x => x.startsWith('KOPIE IN DER WISCH-EBENE')); console.log(ok ? 'uebergang --gegenprobe-kopie: ok (Seitenkopie im Wisch wird gemeldet)' : 'uebergang --gegenprobe-kopie: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (GEGENPROBE) { const ok = F.some(x => x.startsWith('INHALT WAEHREND')); console.log(ok ? 'uebergang --gegenprobe: ok (klickfangende Kopie wird gemeldet)' : 'uebergang --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (F.length) { console.log(`uebergang: ${F.length} Befund(e)\n  ` + F.join('\n  ')); process.exit(1); }
  console.log('uebergang: ok (Wisch bei Asset- und Seitenwechsel, nur Vorhang + Bild ohne Seitenkopie, Panel zu, Inhalt bedienbar, kein Wisch bei Fenstern/ohne Animation, History-Karte fest)');
})();
