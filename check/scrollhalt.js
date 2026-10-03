// ── SCROLLSTAND BEIM NEUZEICHNEN DER ASSET-SEITE ──────────────────────
//
// Nutzer 2026-09-23 (iPad): "Teilweise ist es so, dass wenn ich in einer
// Kategorie etwas anklicke und aender, ich weiter oben auf der Seite bugge,
// als ob ich einmal abrupt hochgescrollt habe" - per Rueckfrage: in einer
// Karte auf der Asset-Seite.
//
// Gemessen in WebKit (WebKitGTK 2.52, Pixeldichte 2): renderDetail tauscht
// #detail per innerHTML aus; WebKit kuerzt scrollTop SOFORT, weil der
// Scrollbereich im Moment des Austauschs leer ist (1500 -> 247/255, sogar
// bei identischem Inhalt). Die Zeitraum-Knoepfe eines Charts sprangen so von
// 4393 auf 247. Chromium kuerzt erst am Ende des Durchlaufs - hier sieht man
// den Fehler von selbst NIE. Dieser Waechter stellt das WebKit-Verhalten
// nach (innerHTML erst leeren, Layout lesen, dann fuellen) und klickt jedes
// Bedienelement der Asset-Seite, das auf ihr bleibt: der Scrollstand darf
// sich nicht verschieben.
//   node check/scrollhalt.js [--gegenprobe]   (Zuruecksetzen blockiert -> muss rot werden)
// Dazu die "Back"-Pille nach einem Quick-Link: zurueck an die alte Scrollposition.
// Und (seit 2026-09-30): nach renderDetail aendert sich im naechsten Frame
// keine Kopfhoehe mehr (sonst springt der Inhalt auf dem iPad trotz Halten).
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 695 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  p.on('dialog', d => d.dismiss().catch(() => {}));
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  let geklickt = 0;
  for (const sym of ['USD', 'GOLD']) {
    await p.evaluate(s => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); gotoSym(s); }, sym);
    await p.waitForTimeout(600);
    const r = await p.evaluate(async ([sym, gp]) => {
      const det = document.getElementById('detail'), sleep = ms => new Promise(r => setTimeout(r, ms));
      // WebKit nachstellen
      const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get() { return ih.get.call(this); }, set(v) {
        ih.set.call(this, ''); for (let x = this; x && x.nodeType === 1; x = x.parentElement) void x.scrollTop; ih.set.call(this, v); } });
      const st = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      const kand = [...det.querySelectorAll('[onclick],[onchange],select,button')].filter(e => e.offsetParent)
        .map(e => { const pfad = []; let x = e; while (x && x.id !== 'detail') { pfad.unshift([...x.parentElement.children].indexOf(x)); x = x.parentElement; } return pfad; });
      const hol = pfad => { let x = det; for (const k of pfad) { if (!x) return null; x = x.children[k]; } return x; };
      const funde = []; let n = 0;
      for (const pfad of kand) {
        const e = hol(pfad); if (!e || !e.offsetParent) continue;
        const oc = e.getAttribute('onclick') || '';
        // verlassen die Asset-Seite bzw. schalten die Unteransicht um
        if (/assetQuickGo|setSub|openM\(|window\.open|showTab|gotoSym/.test(oc)) continue;
        document.querySelectorAll('.ov').forEach(o => o.style.display = 'none');
        const er = e.getBoundingClientRect(), dr = det.getBoundingClientRect();
        det.scrollTop = Math.max(0, det.scrollTop + er.top - dr.top - det.clientHeight / 2);
        await sleep(30);
        const vor = det.scrollTop;
        if (vor < 150) continue;                      // oben ist nichts zu kuerzen
        // Gegenprobe: das Zuruecksetzen nach dem Neuzeichnen verhindern
        if (gp) Object.defineProperty(det, 'scrollTop', { configurable: true, get() { return st.get.call(this); }, set(v) {} });
        try {
          if (e.tagName === 'SELECT') { const o = e.options[(e.selectedIndex + 1) % e.options.length]; if (o) { e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); } }
          else e.click();
        } finally { if (gp) delete det.scrollTop; }
        n++;
        await sleep(60);
        const offen = [...document.querySelectorAll('.ov')].some(o => o.style.display && o.style.display !== 'none');
        if (curPage !== 'cur' || getSym().id !== sym) { gotoSym(sym); await sleep(300); continue; }
        if (offen) continue;
        const nach = det.scrollTop;
        if (Math.abs(nach - vor) > 20 && nach < det.scrollHeight - det.clientHeight - 2)
          funde.push(`${oc.slice(0, 50) || e.tagName} "${(e.textContent || '').trim().slice(0, 16)}": ${Math.round(vor)} -> ${Math.round(nach)}`);
      }
      Object.defineProperty(Element.prototype, 'innerHTML', ih);
      return { n, funde };
    }, [sym, GEGENPROBE]);
    geklickt += r.n;
    r.funde.forEach(f => fail('SPRUNG BEIM NEUZEICHNEN', `${sym}: ${f} - auf dem iPad springt die Seite dabei nach oben (WebKit kuerzt scrollTop beim innerHTML-Austausch; renderDetail muss den Stand mit scrollHalten() halten)`));
  }
  // Dieselbe Fehlerklasse auf anderen Seiten (gefunden 2026-09-23 mit genau
  // diesem Nachstellen): Matrix/Korrelation, Seasonality, Carry, Calendar.
  let seitenGeklickt = 0;
  for (const seite of ['mx', 'seas', 'carry', 'cal']) {
    const r = await p.evaluate(async ([seite, gp]) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      document.querySelectorAll('.ov').forEach(o => o.style.display = 'none'); showTab(seite); await sleep(500);
      const pg = document.getElementById(PAGE_IDS[seite]);
      const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get() { return ih.get.call(this); }, set(v) {
        ih.set.call(this, ''); for (let x = this; x && x.nodeType === 1; x = x.parentElement) void x.scrollTop; ih.set.call(this, v); } });
      const st = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      const kand = [...pg.querySelectorAll('[onclick],[onchange],select,button')].filter(e => e.offsetParent)
        .map(e => { const pfad = []; let x = e; while (x && x !== pg) { pfad.unshift([...x.parentElement.children].indexOf(x)); x = x.parentElement; } return pfad; });
      const hol = pfad => { let x = pg; for (const k of pfad) { if (!x) return null; x = x.children[k]; } return x; };
      const funde = []; let n = 0;
      for (const pfad of kand.slice(0, 160)) {
        const e = hol(pfad); if (!e || !e.offsetParent) continue;
        const oc = e.getAttribute('onclick') || '';
        if (/openM\(|window\.open|showTab|gotoSym|QuickGo|gotoPairOverview|gotoNewsFor|openPair/.test(oc)) continue;
        document.querySelectorAll('.ov').forEach(o => o.style.display = 'none');
        const er = e.getBoundingClientRect(), pr = pg.getBoundingClientRect();
        pg.scrollTop = Math.max(0, pg.scrollTop + er.top - pr.top - pg.clientHeight / 2);
        await sleep(30);
        const vor = pg.scrollTop; if (vor < 150) continue;
        if (gp) Object.defineProperty(pg, 'scrollTop', { configurable: true, get() { return st.get.call(this); }, set(v) {} });
        try {
          if (e.tagName === 'SELECT') { const o = e.options[(e.selectedIndex + 1) % e.options.length]; if (o) { e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); } }
          else e.click();
        } finally { if (gp) delete pg.scrollTop; }
        n++; await sleep(60);
        const offen = [...document.querySelectorAll('.ov')].some(o => o.style.display && o.style.display !== 'none');
        if (curPage !== seite) { showTab(seite); await sleep(300); continue; }
        if (offen) continue;
        const nach = pg.scrollTop;
        if (Math.abs(nach - vor) > 20 && nach < pg.scrollHeight - pg.clientHeight - 2)
          funde.push(`${oc.slice(0, 50) || e.getAttribute('onchange') || e.tagName}: ${Math.round(vor)} -> ${Math.round(nach)}`);
      }
      Object.defineProperty(Element.prototype, 'innerHTML', ih);
      return { n, funde };
    }, [seite, GEGENPROBE]);
    seitenGeklickt += r.n; geklickt += r.n;
    r.funde.forEach(f => fail('SPRUNG BEIM NEUZEICHNEN', `Seite ${seite}: ${f} - auf dem iPad springt die Seite dabei nach oben (Render-Funktion muss den Stand mit scrollHalten() halten)`));
  }
  // Neuzeichnen OHNE Klick (Datenupdates, Zeitgeber): jede Seiten-Render-
  // Funktion bei halb gescrollter Seite. Vorher sprangen 13 Seiten auf 0.
  const RF = { dash: 'renderDash', mx: 'renderMatrix', trends: 'renderTrends', cot: 'renderCot', sent: 'renderSentiment', seas: 'renderSeasonality', news: 'renderNewsTab', regime: 'renderRegime', data: 'renderDataTab', rate: 'renderRateProb', carry: 'renderCarry', pairs: 'renderPairs', watch: 'renderWatchlistTab', cal: 'renderCalendar', notes: 'rerenderNotesHost' };
  const rs = await p.evaluate(async ([RF, gp]) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), out = []; let n = 0;
    const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML'), st = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get() { return ih.get.call(this); }, set(v) {
      ih.set.call(this, ''); for (let x = this; x && x.nodeType === 1; x = x.parentElement) void x.scrollTop; ih.set.call(this, v); } });
    for (const [s, f] of Object.entries(RF)) {
      document.querySelectorAll('.ov').forEach(o => o.style.display = 'none'); showTab(s); await sleep(300);
      const pg = document.getElementById(PAGE_IDS[s]);
      pg.scrollTop = (pg.scrollHeight - pg.clientHeight) * 0.6; await sleep(30);
      const vor = pg.scrollTop; if (vor < 150) continue;
      if (gp) Object.defineProperty(pg, 'scrollTop', { configurable: true, get() { return st.get.call(this); }, set(v) {} });
      try { window[f](); } finally { if (gp) delete pg.scrollTop; }
      n++;
      if (Math.abs(pg.scrollTop - vor) > 20) out.push(`${f}: ${Math.round(vor)} -> ${Math.round(pg.scrollTop)}`);
    }
    Object.defineProperty(Element.prototype, 'innerHTML', ih);
    return { n, out };
  }, [RF, GEGENPROBE]);
  rs.out.forEach(f => fail('SPRUNG BEIM NEUZEICHNEN', `ohne Klick (Datenupdate): ${f} - Render-Funktion muss den Stand mit scrollHalten() halten`));
  if (rs.n < 8) fail('ZU WENIG GEPRUEFT', `nur ${rs.n} Seiten ohne Klick neu gezeichnet`);
  if (seitenGeklickt < 20) fail('ZU WENIG GEPRUEFT', `auf Matrix/Seasonality/Carry/Calendar nur ${seitenGeklickt} Bedienelemente geklickt`);
  // "Back"-Pille nach einem Quick-Link (Nutzer 2026-09-23: "wenn man back
  // drueckt soll man zur alten Position kommen") - vorher immer scrollTop 0.
  const back = await p.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), out = [];
    document.querySelectorAll('.ov').forEach(o => o.style.display = 'none');
    for (const ziel of ['trends', 'cal', 'data']) {
      gotoSym('USD'); await sleep(300); const d = document.getElementById('detail'); d.scrollTop = 1200; await sleep(30); const vor = d.scrollTop;
      assetQuickGo(ziel); await sleep(300); document.getElementById('resBackPill').click(); await sleep(300);
      out.push({ weg: 'USD -> ' + ziel, vor, nach: Math.round(document.getElementById('detail').scrollTop), ok: curPage === 'cur' && getSym().id === 'USD' });
    }
    showTab('watch'); await sleep(400); const w = document.getElementById('pgWatch');
    const id = (document.querySelector('#pgWatch [onclick*="watchQuickGo"]') || {}).getAttribute ? document.querySelector('#pgWatch [onclick*="watchQuickGo"]').getAttribute('onclick').match(/watchQuickGo\('([^']+)','([^']+)'/) : null;
    if (id && w.scrollHeight > w.clientHeight + 400) {
      w.scrollTop = 400; await sleep(30); const vor = w.scrollTop;
      watchQuickGo(id[1], id[2]); await sleep(300); document.getElementById('resBackPill').click(); await sleep(300);
      out.push({ weg: 'Watchlist -> ' + id[1], vor, nach: Math.round(w.scrollTop), ok: curPage === 'watch' });
    }
    return out; });
  back.forEach(r => { if (!r.ok || Math.abs(r.nach - r.vor) > 20) fail('ZURUECK NICHT AN DIE ALTE STELLE', `${r.weg}, dann "Back": scrollTop ${r.vor} -> ${r.nach} (Nutzer 2026-09-23: "wenn man back drueckt soll man zur alten Position kommen")`); });
  if (back.length < 3) fail('ZU WENIG GEPRUEFT', `nur ${back.length} Rueckwege geprueft`);
  if (geklickt < 60) fail('ZU WENIG GEPRUEFT', `nur ${geklickt} Bedienelemente geklickt - Selektoren veraltet?`);
  // NACHJUSTIERT NACH DEM ZURUECKSETZEN (gefunden 2026-09-30): renderDetail
  // setzt den Scrollstand synchron zurueck. Was danach erst im naechsten
  // Frame (rAF) noch Hoehen aendert - Asset-Kopf einpassen, i einordnen -,
  // verschiebt auf dem iPad den Inhalt (WebKit hat keinen Scroll-Anker;
  // Chromium gleicht es aus, deshalb sah man es nur an der Zahl: 1200 ->
  // 1147). Gemessen: Kopf 163 -> 110px, COT-Kopf 43 -> 51px. Ob der Kopf
  // umbricht, haengt an den Daten des Tages (am 2026-09-26 bei 1000px nicht,
  // am 2026-09-30 schon) - deshalb wird der Umbruch hier ERZWUNGEN: ein
  // mit der Schrift wachsender Platzhalter hinter dem Titel.
  // Gegenprobe: das synchrone Einpassen direkt nach renderDetail wieder
  // zuruecknehmen -> der naechste Frame aendert den Kopf -> rot.
  // ⚠ Seit 2026-10-03 auch ueber die Fensterbreite gesucht: bei 1000px brach
  // der Kopf mit dem Datenstand dieses Tages schon OHNE Platzhalter um und
  // liess sich auch mit 75 % Schrift nicht einpassen (laengere "Next event"-
  // Zeile) - der Waechter meldete "zu wenig geprueft", auch auf main. Er
  // probiert deshalb 1000/1180/1280px und Platzhalter bis 8em in 0,5er-Stufen.
  let nachj = { out: [], umgebrochen: 0 };
  for (const breite of [1000, 1180, 1280]) {
  await p.setViewportSize({ width: breite, height: 695 });
  const teil = await p.evaluate(async (gp) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(() => r()));
    const st = document.createElement('style');
    document.head.appendChild(st);
    document.querySelectorAll('.ov').forEach(o => o.style.display = 'none');
    const out = []; let umgebrochen = 0;
    for (const sym of ['USD', 'GOLD']) {
      gotoSym(sym); await sleep(300);
      const det = document.getElementById('detail');
      const mess = () => [...det.querySelectorAll('.ahead,.ab-tile-hd,.rub-hdr,.dw-hdr')].map(e => Math.round(e.getBoundingClientRect().height));
      // Platzhalterbreite suchen, bei der der Kopf umbricht UND sich durch
      // Verkleinern (bis 75%) wieder einpassen laesst - nur dann gibt es
      // eine Nachjustierung, die zu spaet kommen koennte.
      let t = null;
      for (const em of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]) {
        st.textContent = em ? `.ahead .atitle::after{content:"";display:inline-block;width:${em}em}` : '';
        renderDetail();
        t = det.querySelector('.ahead .atitle');
        if (t && t.style.fontSize) break;
      }
      if (t && t.style.fontSize) umgebrochen++;
      if (gp) det.querySelectorAll('.ahead .atitle,.ahead .afull').forEach(e => { e.style.fontSize = ''; });
      const sofort = mess();
      await raf(); await raf(); await sleep(100);
      const spaeter = mess();
      const d = sofort.map((h, i) => spaeter[i] - h).filter(x => Math.abs(x) > 1);
      if (d.length) out.push(`${sym}: ${d.length} Koepfe aendern ihre Hoehe erst im Frame NACH renderDetail (${d.slice(0, 4).join(', ')} px)`);
    }
    st.remove();
    return { out, umgebrochen };
  }, GEGENPROBE);
  nachj.out.push(...teil.out.map(x => `${breite}px ${x}`)); nachj.umgebrochen += teil.umgebrochen;
  if (teil.umgebrochen) break;
  }
  await p.setViewportSize({ width: 1000, height: 695 });
  nachj.out.forEach(f => fail('NACHJUSTIERT NACH DEM ZURUECKSETZEN', `${f} - auf dem iPad springt der Inhalt um diese Hoehe (scrollHalten muss infoKnoepfeEinordnen/kopfTitelEinpassen VOR dem Zuruecksetzen aufrufen)`));
  if (!nachj.umgebrochen) fail('ZU WENIG GEPRUEFT', 'erzwungener Kopfumbruch griff nicht - der Kopf wurde nirgends eingepasst');
  perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('SPRUNG BEIM NEUZEICHNEN')) && F.some(x => x.startsWith('NACHJUSTIERT NACH DEM ZURUECKSETZEN'));
    console.log(ok ? 'scrollhalt --gegenprobe: ok (fehlendes Zuruecksetzen und Nachjustieren im naechsten Frame werden gemeldet)' : 'scrollhalt --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`scrollhalt: ${F.length} Befund(e)\n  ` + F.slice(0, 30).join('\n  ')); process.exit(1); }
  console.log(`scrollhalt: ok (${geklickt} Bedienelemente auf USD, GOLD, Matrix, Seasonality, Carry und Calendar plus ${rs.n} Seiten ohne Klick neu gezeichnet, bei nachgestelltem WebKit-Verhalten - Scrollstand bleibt)`);
})();
