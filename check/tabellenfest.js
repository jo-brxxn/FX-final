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
// Zweite Regel (Nutzer 2026-10-06, iPad: "beim Scrollen im Kalender bei past
// verschwindet der Strich"): in einem senkrecht scrollenden Bereich endet
// jedes klebende Element (position:sticky) mindestens 6px vor dem inneren
// rechten Rand. iOS zeichnet die Scroll-Linie dort, klebende Ebenen liegen
// auf dem iPad darueber - gemessen reichten die Tageszeilen der Past-Liste
// und der History bis 0/1px an den Rand, die Linie war dort unterbrochen.
// Ausgenommen: Bereiche, die auch waagerecht scrollen (breite Tabelle - da
// hilft kein Rand).
//   node check/tabellenfest.js [--gegenprobe | --gegenprobe-linie]
//   (Wurzelregel entfernt -> rot | rechter Rand der Listen entfernt -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_LINIE = process.argv.includes('--gegenprobe-linie');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(gp => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (gp[0]) { const st = document.createElement('style'); st.textContent = '*{overscroll-behavior:auto!important}'; document.head.appendChild(st); }
    if (gp[1]) { const st = document.createElement('style'); st.textContent = '.calp-karte .calp,.calp.gross,.histp,.ab-htile .histp{padding-right:0!important}'; document.head.appendChild(st); } }, [GEGENPROBE, GP_LINIE]);
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
        out.push(`FEDERT|${ort}: ${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')} (y=${cs.overscrollBehaviorY}, x=${cs.overscrollBehaviorX})`);
      if (y && !x) {
        const innen = r.left + e.clientLeft + e.clientWidth;
        let knapp = null;
        e.querySelectorAll('*').forEach(k => {
          if (getComputedStyle(k).position !== 'sticky') return;
          let c = k.parentElement; while (c && c !== e) { const kc = getComputedStyle(c); if (/auto|scroll/.test(kc.overflowY) && c.scrollHeight > c.clientHeight + 1) return; c = c.parentElement; }
          const kr = k.getBoundingClientRect(); if (!kr.width) return;
          const abst = innen - kr.right; if (abst < 6 && (!knapp || abst < knapp.abst)) knapp = { abst, k };
        });
        if (knapp) out.push(`SCROLL-LINIE|${ort}: ${e.tagName.toLowerCase()}.${[...e.classList].join('.')} - klebende ${knapp.k.tagName.toLowerCase()}.${[...knapp.k.classList].join('.')} endet ${knapp.abst.toFixed(1)}px vor dem rechten Innenrand (verlangt >= 6)`);
      }
    });
    return out;
  }, ort);
  let n = 0;
  const tabs = await p.evaluate(() => TAB_ORDER.slice());
  for (const t of tabs) {
    await p.evaluate(t => { try { showTab(t); } catch (e) {} }, t); await p.waitForTimeout(400);
    (await pruefen('Tab ' + t)).forEach(x => fail(...x.split('|'))); n++;
  }
  await p.evaluate(() => gotoSym('AUD')); await p.waitForTimeout(1200);
  (await pruefen('Asset AUD')).forEach(x => fail(...x.split('|')));
  // Past-Liste in der Kalender-Karte (dort war der Strich unterbrochen)
  await p.evaluate(() => setAbCalSicht('past')); await p.waitForTimeout(600);
  const past = await pruefen('Asset AUD Past');
  past.forEach(x => fail(...x.split('|')));
  const pastDa = await p.evaluate(() => !!document.querySelector('#detail .calp-karte .calp .cal-day-hdr'));
  if (!pastDa) fail('PAST', 'Past-Liste ohne Tageszeilen - die Scroll-Linien-Pruefung waere leer');
  await p.evaluate(() => openAssetCal()); await p.waitForTimeout(600);
  const kal = await pruefen('Asset-Kalender');
  kal.forEach(x => fail(...x.split('|')));
  const kalDa = await p.evaluate(() => { const m = document.getElementById('mAssetCal'); return !!m && getComputedStyle(m).display !== 'none'; });
  if (!kalDa) fail('ASSET-KALENDER', 'Fenster ging nicht auf');
  await p.evaluate(() => { try { closeAssetCal(); } catch (e) {} setAbCalSicht('month'); });
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GP_LINIE) { const ok = F.some(f => f.startsWith('SCROLL-LINIE')); console.log(ok ? 'tabellenfest --gegenprobe-linie: ok (Listen ohne rechten Rand werden gemeldet)' : 'tabellenfest --gegenprobe-linie: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1); }
  if (GEGENPROBE) { if (F.length) { console.log(`tabellenfest --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('tabellenfest --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`tabellenfest: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`tabellenfest: ok (${n} Tabs, Asset-Seite mit Past-Liste, Asset-Kalender - jeder Scrollbereich endet an seinen Raendern, klebende Zeilen lassen die Scroll-Linie frei)`);
})().catch(e => { console.log('tabellenfest: ABBRUCH ' + e.message); process.exit(1); });
