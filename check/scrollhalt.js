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
  perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('SPRUNG BEIM NEUZEICHNEN'));
    console.log(ok ? 'scrollhalt --gegenprobe: ok (fehlendes Zuruecksetzen wird gemeldet)' : 'scrollhalt --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`scrollhalt: ${F.length} Befund(e)\n  ` + F.slice(0, 30).join('\n  ')); process.exit(1); }
  console.log(`scrollhalt: ok (${geklickt} Bedienelemente auf USD, GOLD, Matrix, Seasonality, Carry und Calendar plus ${rs.n} Seiten ohne Klick neu gezeichnet, bei nachgestelltem WebKit-Verhalten - Scrollstand bleibt)`);
})();
