// ── DATA-SEITE: BIS 8 PANELS, CHARTS FUELLEN DIE FLAECHE ─────────────────
//
// Nutzer 2026-09-26: "Mach das man in data bis zu 8 Assets oder halt
// Indikatoren gleichzeitig vergleichen kann ... desto mehr Assets man
// hinzufuegt das dann auch erst die Charts kleiner werden und nicht das wenn
// man nur 2 ausgewaehlt hat das schon klein ist ... Layout ... Platz sparen".
// Per Rueckfrage: "Bildschirm fuellen" + "Kompakt". Gemessen vorher bei
// 1180x820: 2 Panels je Chart ~150 px hoch, 290 px leer darunter, 230 px
// Kopf bis zum ersten Chart. Geprueft bei 1180x820, 1-8 Assets:
//   - bis 8 Panels moeglich, ein 9. wird abgelehnt
//   - kein Seiten-Scroll (alles auf einem Bildschirm)
//   - Charthoehe faellt nie mit weniger Panels; 2 Panels = volle Hoehe wie 1
//   - jeder Chart passt in seine Zelle (kein Ueberlauf), fuellt sie (>= 90 %)
//   - Kopf eine Zeile (<= 60 px), Panel-Kopf eine Zeile (<= 40 px)
//   - Datumsbeschriftung bleibt im Chart (nicht abgeschnitten)
//   node check/datalayout.js [--gegenprobe]  (festes 2-Spalten-Raster mit
//   200-px-Zeilen wie frueher -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const ALLE = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'GOLD'];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); showTab('data'); setDataMode('assets'); });
  await p.waitForTimeout(700);
  if (GEGENPROBE) await p.addStyleTag({ content: '#dataBody .data-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-rows:200px!important}' });
  const hoehe = {};
  for (const n of [1, 2, 3, 4, 6, 8]) {
    await p.evaluate(([ids, n]) => { dataAssets.length = 0; ids.slice(0, n).forEach(x => dataAssets.push(x)); if (!dataIndBase) dataIndBase = 'CPI (Headline)'; renderDataTab(); }, [ALLE, n]);
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const pg = document.getElementById('pgData'), kopf = document.querySelector('#dataBody .data-head');
      const boxen = [...document.querySelectorAll('#dataBody .data-pc')];
      return { scroll: pg.scrollHeight - pg.clientHeight, kopf: kopf ? kopf.offsetHeight : 0,
        ph: Math.max(0, ...[...document.querySelectorAll('#dataBody .data-ph')].map(e => e.offsetHeight)),
        panels: document.querySelectorAll('#dataBody .data-panel').length,
        boxen: boxen.map(bx => { const sv = bx.querySelector('.ind-hist-wrap svg'); const br = bx.getBoundingClientRect();
          if (!sv) return null; const sr = sv.getBoundingClientRect();
          const txt = [...sv.querySelectorAll('text')].map(t => t.getBoundingClientRect()).filter(r => r.width);
          const raus = txt.filter(r => r.left < sr.left - 1 || r.right > sr.right + 1).length;
          return { h: sr.height, fuell: sr.height / (br.height - 10), ueber: bx.scrollHeight > bx.clientHeight + 1, raus }; }) };
    });
    if (m.panels !== n) { fail(`${n} ASSETS`, `${m.panels} Panels`); continue; }
    if (m.scroll > 1) fail(`${n} ASSETS SCROLL`, `Seite scrollt ${m.scroll}px - soll auf einen Bildschirm passen`);
    if (m.kopf > 60) fail('KOPF', `${m.kopf}px hoch (eine Zeile <= 60)`);
    if (m.ph > 40) fail('PANEL-KOPF', `${m.ph}px hoch (eine Zeile <= 40)`);
    const bx = m.boxen.filter(Boolean);
    bx.forEach((x, i) => { if (x.ueber) fail(`${n} ASSETS UEBERLAUF`, `Panel ${i + 1}`); if (x.fuell < 0.9) fail(`${n} ASSETS FUELLT NICHT`, `Panel ${i + 1}: ${(x.fuell * 100).toFixed(0)} %`); if (x.raus) fail(`${n} ASSETS LABEL`, `Panel ${i + 1}: ${x.raus} Beschriftung(en) ragen aus dem Chart`); });
    hoehe[n] = Math.min(...bx.map(x => x.h));
  }
  const ns = Object.keys(hoehe).map(Number).sort((a, c) => a - c);
  ns.forEach((n, i) => { if (i && hoehe[n] > hoehe[ns[i - 1]] + 1) fail('GROESSE', `${n} Panels hoeher als ${ns[i - 1]} (${hoehe[n].toFixed(0)} > ${hoehe[ns[i - 1]].toFixed(0)})`); });
  if (hoehe[2] != null && hoehe[1] != null && hoehe[2] < hoehe[1] - 2) fail('2 PANELS', `Chart ${hoehe[2].toFixed(0)}px statt voller Hoehe ${hoehe[1].toFixed(0)}px`);
  // 9. Asset wird abgelehnt
  const neun = await p.evaluate(ids => { dataAssets.length = 0; ids.slice(0, 8).forEach(x => dataAssets.push(x)); addDataAsset && addDataAsset(ids[8]); renderDataTab(); return document.querySelectorAll('#dataBody .data-panel').length; }, ALLE).catch(e => 'Fehler ' + e.message);
  if (neun !== 8) fail('MAXIMUM', `nach 9. Asset ${neun} Panels (erwartet 8)`);
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`datalayout --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('datalayout --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`datalayout: ${F.length} Befund(e)`); F.slice(0, 30).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`datalayout: ok (1-8 Panels ohne Scroll, Chart ${ns.map(n => n + ':' + hoehe[n].toFixed(0)).join(' ')} px, Kopf eine Zeile, 9. abgelehnt)`);
})().catch(e => { console.log('datalayout: ABBRUCH ' + e.message); process.exit(1); });
