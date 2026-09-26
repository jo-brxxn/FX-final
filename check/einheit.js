// ── EINHEITLICHKEIT: FILTER, ZEITFILTER, ⓘ, CANDLES|LINE ─────────────────
//
// Nutzer 2026-09-26: "Ich will auf der gesamten Webseite Einheitlichkeit also
// Filter an den selben Stellen die i dann die Zeitfilterbutton"; per
// Rueckfrage festgelegt (Dauerregel, docs/design-system.md "Bedienelemente
// an festen Stellen"):
//   F) Auswahlfilter einer KARTE (Asset-/Indikator-Dropdown) stehen in ihrer
//      Titelzeile, rechtsbuendig - rechts davon nur noch Knoepfe und das ⓘ.
//      Seitenweite Filter stehen oben rechts auf der Seite.
//   Z) Zeitfilter stehen in einer eigenen Zeile UEBER dem Chart (nie in der
//      Titelzeile), rechtsbuendig.
//   C) Jeder Preis-Chart hat links in dieser Zeile den Umschalter
//      Candles | Line.
//   I) Ein ⓘ hinter einem rechtsbuendigen Element hat nur 6 px Abstand (sonst
//      teilen sich zwei auto-Raender die Zeile und der Filter steht mittig).
// Geprueft auf allen Seiten, drei Asset-Seiten und im Preis-Fenster.
//   node check/einheit.js [--gegenprobe]  (Filter mittig + Zeitfilter links
//   + Umschalter weg -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const ZIELE = ['over', 'regime', 'news', 'dash', 'cur', 'mx', 'trends', 'cot', 'sent:retail', 'sent:putcall', 'sent:netflow', 'sent:fg', 'sent:aaii', 'seas', 'data', 'rate', 'carry', 'pairs', 'watch', 'cal', 'notes', 'A:EUR', 'A:GOLD', 'A:US10Y', 'PX:EUR'];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  if (GEGENPROBE) await p.addStyleTag({ content: ':is(.cot-card-title,.mx-card-title,.dw-hdr,.ab-tile-hd)>.ii-nach.ii-nach{margin-left:auto!important} .chart-leiste-r{margin-left:0!important} .ctyp{display:none!important}' });
  let geprueft = { z: 0, f: 0, c: 0, i: 0 };
  for (const ziel of ZIELE) {
    await p.evaluate(z => {
      try { closeM('mPrice'); } catch (e) {}
      const [a, v] = z.split(':');
      if (a === 'A') gotoSym(v);
      else if (a === 'PX') { gotoSym(v); openPriceChart(v); }
      else { showTab(a); if (v) setSentSub(v); }
      if (a === 'data') { dataAssets.length = 0; ['USD', 'EUR'].forEach(x => dataAssets.push(x)); if (!dataIndBase) dataIndBase = 'CPI (Headline)'; renderDataTab(); }
    }, ziel);
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const RX = /^(15D|1M|2M|3M|6M|1Y|3Y|6Y|10Y|Max|MAX|All|Custom)$/;
      const vis = e => { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
      const KARTE = '.cot-card,.ab-ptile,.ab-ktile,.ab-htile,.ab-ntile,.dw,.rub-card,.mx-card,.modal,.data-panel';
      const TITEL = '.cot-card-title,.ab-tile-hd,.dw-hdr,.mx-card-title,.rub-hdr,.data-row,.data-ph,h3';
      const out = { z: [], f: [], c: [], i: [], n: { z: 0, f: 0, c: 0, i: 0 } };
      const name = k => { const t = k && k.querySelector(TITEL); return (t ? t.textContent : (k ? k.className : '?')).trim().replace(/\s+/g, ' ').slice(0, 30); };
      const innenRechts = k => { const q = k.getBoundingClientRect(), cs = getComputedStyle(k); return q.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight); };
      // Z) Zeitfilter
      const gruppen = new Map();
      [...document.querySelectorAll('button')].filter(x => vis(x) && RX.test(x.textContent.trim())).forEach(x => { const g = x.parentElement; if (!gruppen.has(g)) gruppen.set(g, []); gruppen.get(g).push(x); });
      gruppen.forEach((bs, g) => {
        if (bs.length < 2) return; out.n.z++;
        const k = g.closest(KARTE); const gr = g.getBoundingClientRect();
        const rechts = Math.max(...bs.map(x => x.getBoundingClientRect().right));
        if (k) {
          const t = k.querySelector(TITEL), tr = t && t.getBoundingClientRect();
          // Innenkante des Inhalts: naechster Block mit Innenabstand unterhalb der Karte
          let box = g.parentElement; while (box && box !== k && parseFloat(getComputedStyle(box).paddingRight) === 0) box = box.parentElement;
          const kante = innenRechts(box || k);
          if (tr && t.contains(g)) out.z.push(`${name(k)}: Zeitfilter in der Titelzeile`);
          if (kante - rechts > 4) out.z.push(`${name(k)}: Zeitfilter ${Math.round(kante - rechts)}px vom rechten Rand (nicht rechtsbuendig)`);
        } else {
          const pg = g.closest('.pc'); if (pg && innenRechts(pg) - rechts > 4) out.z.push(`${pg.id}: seitenweiter Zeitfilter ${Math.round(innenRechts(pg) - rechts)}px vom rechten Rand`);
        }
      });
      // F) Auswahlfilter (Dropdowns) in Karten
      [...document.querySelectorAll('select')].filter(vis).forEach(s => {
        if (s.closest('.ev-form,.chart-leiste,.time-range-custom,form,.modal .m-body,.data-row2')) return;
        const k = s.closest(KARTE);
        if (!k) return;
        out.n.f++;
        const t = k.querySelector(TITEL); if (!t) return;
        const tr = t.getBoundingClientRect(), sr = s.getBoundingClientRect();
        const mitte = (sr.top + sr.bottom) / 2;
        if (!t.contains(s) && (mitte < tr.top || mitte > tr.bottom)) { out.f.push(`${name(k)}: Filter nicht in der Titelzeile`); return; }
        // rechts davon nur Knoepfe/ⓘ/weitere Filter
        const rechtsDavon = [...t.querySelectorAll('*')].filter(e => vis(e) && e.children.length === 0 && e.textContent.trim() && !e.closest('button,select,.rinfo,.info-b,.px-panel-ctrls') && e.getBoundingClientRect().left > sr.right);
        if (rechtsDavon.length) out.f.push(`${name(k)}: Text rechts neben dem Filter ("${rechtsDavon[0].textContent.trim().slice(0, 20)}")`);
        const luecke = innenRechts(t.closest(KARTE) === k ? t : k) - sr.right;
        const knoepfe = [...t.querySelectorAll('button,select,.rinfo,.info-b')].filter(e => vis(e) && e.getBoundingClientRect().left >= sr.right - 1).reduce((a, e) => a + e.getBoundingClientRect().width + 10, 0);
        if (luecke - knoepfe > 24) out.f.push(`${name(k)}: Filter ${Math.round(luecke - knoepfe)}px vor dem rechten Rand (nicht rechtsbuendig)`);
      });
      // C) Preis-Charts: Candles|Line in der Werkzeugzeile
      [...document.querySelectorAll('.ab-ptile,.ab-ktile,#mPrice')].filter(vis).forEach(k => {
        if (!k.querySelector('svg.ab-chart,#pxChart svg')) return; out.n.c++;
        const c = k.querySelector('.chart-leiste .chart-leiste-l .ctyp');
        if (!c || !vis(c)) out.c.push(`${name(k)}: kein Candles|Line-Umschalter links in der Werkzeugzeile`);
        else if ([...c.querySelectorAll('button')].map(x => x.textContent.trim()).join('|') !== 'Candles|Line') out.c.push(`${name(k)}: Umschalter "${c.textContent.trim()}"`);
      });
      // I) ⓘ hinter rechtsbuendigem Element
      [...document.querySelectorAll('.ii-nach')].filter(vis).forEach(i => { out.n.i++; const m = parseFloat(getComputedStyle(i).marginLeft); if (m > 8) out.i.push(`${name(i.closest(KARTE))}: ⓘ margin-left ${Math.round(m)}px (auto statt 6)`); });
      return out;
    });
    ['z', 'f', 'c', 'i'].forEach(k => { geprueft[k] += r.n[k]; r[k].forEach(x => fail(`${ziel} ${k.toUpperCase()}`, x)); });
  }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  const sum = `${geprueft.z} Zeitfilter, ${geprueft.f} Filter, ${geprueft.c} Preis-Charts, ${geprueft.i} ⓘ`;
  if (GEGENPROBE) { const t = ['F', 'Z', 'C', 'I'].filter(k => F.some(f => f.includes(' ' + k + ':'))); if (t.length === 4) { console.log(`einheit --gegenprobe: ok (rot wie erwartet: ${F.length} Befund(e), alle vier Regeln)`); process.exit(0); } console.log(`einheit --gegenprobe: FEHLER - nur ${t.join(',') || 'keine'} rot`); process.exit(1); }
  if (F.length) { console.log(`einheit: ${F.length} Befund(e) (${sum})`); F.slice(0, 40).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`einheit: ok (${sum} auf ${ZIELE.length} Seiten/Fenstern an der festen Stelle)`);
})().catch(e => { console.log('einheit: ABBRUCH ' + e.message); process.exit(1); });
