// ── ⓘ-KNOEPFE: GROESSE UND PLATZ ────────────────────────────────────────
//
// Nutzer-Regel 2026-09-25: "die kleinen Info i muessen sich der Schrift
// daneben anpassen das sie nicht zu gross sind ich will das die ein Drittel
// kleiner sind ... bei den Karten rechts oben in der Ecke aber auf Hoehe der
// Schrift und das ueberall so". Gemessen vorher: Kreis 15 px neben 17 px
// Titel; auf dem Dashboard 187 px vom rechten Kartenrand (direkt hinter dem
// Titel), im Kalender neben dem Monatsnamen.
// Geprueft auf Dashboard, Asset-Seite und den Insights-Tabs, je ⓘ in einem
// Kartenkopf:
//   - sichtbarer Kreis = 0,6 x Titelschrift (±1 px)
//   - rechtestes Element der Kopfzeile, Kreis <= 3 px vom Innenrand der Karte
//   - vertikal auf der Mitte der Titelschrift (±1,5 px)
//   node check/infoi.js [--gegenprobe]  (alte 15-px-Kreise -> rot)
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
  if (GEGENPROBE) await p.addStyleTag({ content: '.info-b::before,.rinfo::before{width:15px!important;height:15px!important}' });
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); });
  let n = 0;
  for (const tab of ['dash', 'cur', 'sent', 'seas', 'rate', 'carry', 'news', 'mx']) {
    await p.evaluate(t => { try { if (t === 'cur') gotoSym('EUR'); else showTab(t); } catch (e) {} }, tab); await p.waitForTimeout(700);
    const r = await p.evaluate(tab => {
      const o = [];
      document.querySelectorAll('.info-b, .dw-t .rinfo, .cot-card-title .rinfo, .rub-hdr .rinfo, .mx-card-title .rinfo').forEach(bt => {
        const br = bt.getBoundingClientRect(); if (!br.width || bt.closest('.modal')) return;
        const hd = bt.parentElement;
        const card = bt.closest('.ab-tile,.ab-ptile,.ab-htile,.rub-card,.cot-card,.dw,.abc-cal,.mx-card');
        if (!card) return;
        const titel = hd.querySelector('.ab-tile-t,.dw-t-txt,.rub-inp,.abc-mon,.mx-card-title-t') || [...hd.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
        let tr;
        if (titel && titel.nodeType === 3) { const rg = document.createRange(); rg.selectNodeContents(titel); tr = rg.getBoundingClientRect(); }
        else if (titel) { const rg = document.createRange(); rg.selectNodeContents(titel); tr = rg.getBoundingClientRect(); if (!tr.height) tr = titel.getBoundingClientRect(); }
        const fs = parseFloat(getComputedStyle(titel && titel.nodeType === 1 ? titel : hd).fontSize);
        const kreis = parseFloat(getComputedStyle(bt, '::before').width) || (br.width - 2 * parseFloat(getComputedStyle(bt, '::before').left));
        const kr = { left: br.left + (br.width - kreis) / 2, right: br.right - (br.width - kreis) / 2 };
        const cs = getComputedStyle(card), hcs = getComputedStyle(hd.classList.contains('dw-t') ? hd.parentElement : hd), hr = (hd.classList.contains('dw-t') ? hd.parentElement : hd).getBoundingClientRect();
        const kInnen = card.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
        const innen = parseFloat(cs.paddingRight) > 0 ? kInnen : Math.min(kInnen, hr.right - parseFloat(hcs.paddingRight));
        const zeile = hd.classList.contains('dw-t') ? hd.parentElement : hd;
        const rechter = [...zeile.querySelectorAll('*')].some(x => x !== bt && !bt.contains(x) && !x.closest('.dw-btns') && getComputedStyle(x).visibility !== 'hidden' && x.getBoundingClientRect().width && x.getBoundingClientRect().left > br.right - 2 && Math.abs((x.getBoundingClientRect().top + x.getBoundingClientRect().bottom) / 2 - (br.top + br.height / 2)) < 12);
        const name = (hd.textContent || '').trim().slice(0, 24);
        o.push({ tab, name, kreis, fs, dx: innen - kr.right, rechter, dy: tr ? (br.top + br.height / 2) - (tr.top + tr.height / 2) : 0 });
      });
      return o;
    }, tab);
    r.forEach(x => {
      n++;
      if (Math.abs(x.kreis - x.fs * 0.6) > 1) fail('GROESSE', `${x.tab} "${x.name}": Kreis ${x.kreis.toFixed(1)}px bei ${x.fs}px Schrift (soll ${(x.fs * 0.6).toFixed(1)})`);
      if (x.rechter) fail('NICHT GANZ RECHTS', `${x.tab} "${x.name}": ein Element steht rechts daneben`);
      if (x.dx > 3 || x.dx < -1) fail('ECKE', `${x.tab} "${x.name}": Kreis ${x.dx.toFixed(1)}px vom rechten Innenrand`);
      if (Math.abs(x.dy) > 2) fail('HOEHE', `${x.tab} "${x.name}": ${x.dy.toFixed(1)}px neben der Titelmitte`);
    });
  }
  if (!n) fail('KEINE ⓘ', 'nichts gefunden');
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`infoi --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('infoi --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`infoi: ${F.length} Befund(e)`); F.slice(0, 40).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`infoi: ok (${n} ⓘ: Kreis 0,6 x Titelschrift, rechts oben in der Ecke, auf Titelhoehe)`);
})().catch(e => { console.log('infoi: ABBRUCH ' + e.message); process.exit(1); });
