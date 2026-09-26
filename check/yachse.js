// ── Y-ACHSE AN JEDEM DATEN-CHART + GEMEINSAME SKALA IN DATA ─────────────
//
// Nutzer 2026-09-26: "immer wenn man sich Daten anschaut will ich eine y
// Achsenbeschriftung haben also egal wo in welchem Grafik oder Chart und in
// der Kategorie data wenn man vergleicht soll sie bei gleichem Indikator
// gleich sein die Beschriftung damit man besser sehen kann im Verhaeltnis wo
// was steht". Gemessen vorher: ohne Y-Beschriftung waren der Indikator-Chart
// (aufgeklappt + Data), Saisonalitaet (Seite + Indikator-Profil), Preis-
// Fenster, AAII Spread/100%/Verteilung und der Retail-Verlauf der Asset-Seite.
// Geprueft:
//   A) jeder sichtbare Chart (SVG >= 140x70) traegt links oder rechts
//      mindestens zwei Zahlen auf verschiedener Hoehe
//      Ausgenommen mit Absicht: Sparklines (< 140x70, kein Platz), der
//      Globus (Overview), Tacho-Anzeigen, Logos/Motive.
//   B) Data, gleicher Indikator in 4 Panels: identische Y-Beschriftung
//   node check/yachse.js [--gegenprobe]  (Y-Beschriftung ausgeblendet +
//   gemeinsame Skala aus -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const ZIELE = ['regime', 'dash', 'mx', 'trends', 'cot', 'sent:retail', 'sent:putcall', 'sent:netflow', 'sent:fg',
  'aaii:spread', 'aaii:shares', 'aaii:bars', 'aaii:stack', 'aaii:dist', 'aaii:price', 'seas', 'data', 'rate', 'carry',
  'A:EUR', 'A:GOLD', 'A:US10Y', 'PX:EUR', 'HIST:EUR', 'IND:EUR', 'SEASIND:EUR'];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 1400 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  if (GEGENPROBE) { await p.addStyleTag({ content: '.y-lbl,.ab-yax,.cax-y{display:none!important}' }); await p.evaluate(() => { window.__dataEigeneSkala = true; }); }
  let n = 0;
  for (const z of ZIELE) {
    await p.evaluate(z => {
      try { closeM('mPrice'); closeM('mHist'); } catch (e) {}
      const w = document.getElementById('yaxTest'); if (w) w.remove();
      const [a, v] = z.split(':');
      const probe = html => { const d = document.createElement('div'); d.id = 'yaxTest'; d.style.cssText = 'width:560px;position:relative'; d.innerHTML = html; document.getElementById('detail').prepend(d); };
      if (a === 'A') gotoSym(v);
      else if (a === 'PX') { gotoSym(v); openPriceChart(v); }
      else if (a === 'HIST') { gotoSym(v); openHistModal(v); }
      else if (a === 'IND') { gotoSym(v); const s = syms.find(x => x.id === v); let ind = null; s.rubrics.forEach(r => (r.indicators || []).forEach(i => { if (!ind && /CPI/.test(i.name) && indChartSeries(i, v).pts.length > 5) ind = i; })); probe(indHistChart(ind, v)); }
      else if (a === 'SEASIND') { gotoSym(v); probe(seasProfilHtml(v)); }
      else if (a === 'aaii') { showTab('sent'); setSentSub('aaii'); setAaiiView(v); }
      else { showTab(a); if (v) setSentSub(v); if (a === 'data') { dataAssets.length = 0; ['USD', 'EUR', 'JPY', 'CHF'].forEach(x => dataAssets.push(x)); dataIndBase = 'CPI (Headline)'; renderDataTab(); } }
    }, z);
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const vis = e => { const q = e.getBoundingClientRect(); if (!(q.width > 0 && q.height > 0)) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
      const zahl = t => /^[−\-+]?\$?[\d.,]+\s*(%|pp|w|k|K|M|B|bp)?$/.test(t.trim());
      const out = [];
      [...document.querySelectorAll('svg')].filter(s => vis(s) && !s.closest('button,.k-ic,.logo,.ahead-motif,.lg-loop,.lg-frei,.globe-host,.sent-gauge,.gauge,.fxlogo')).forEach(s => {
        const q = s.getBoundingClientRect(); if (q.width < 140 || q.height < 70) return;
        if (s.querySelector('text') && [...s.querySelectorAll('text')].length === 0) return;
        const box = s.closest('.ab-plot,.ab-rtv,.ab-k,.ind-hist-wrap,.histl,.bt-pfad,.cax,.px-chart') || s.parentElement.parentElement || s.parentElement;
        const suche = box.parentElement || box;
        const kand = [...suche.querySelectorAll('text,span,div')].filter(e => vis(e) && e.children.length === 0 && zahl(e.textContent));
        const rand = kand.filter(e => { const r = e.getBoundingClientRect(); if (r.top < q.top - 6 || r.bottom > q.bottom + 6) return false; return r.right <= q.left + Math.max(60, q.width * .1) || r.left >= q.right - Math.max(70, q.width * .1); });
        const hoehen = new Set(rand.map(e => Math.round(e.getBoundingClientRect().top / 6)));
        if (hoehen.size >= 2) { out.push({ ok: true }); return; }
        const karte = s.closest('.cot-card,.ab-ptile,.ab-ktile,.ab-htile,.ab-ntile,.dw,.mx-card,.data-panel,.modal,.ab-k,.rg-card,#yaxTest');
        const t = karte && karte.querySelector('.cot-card-title,.ab-tile-t,.ab-k-t,.dw-t-txt,.mx-card-title,.data-pt,h3');
        out.push({ ok: false, name: (t ? t.textContent : (karte ? karte.id || karte.className : '?')).trim().replace(/\s+/g, ' ').slice(0, 34), w: Math.round(q.width), h: Math.round(q.height) });
      });
      // B) Data: gleiche Beschriftung bei gleichem Indikator
      const data = [...document.querySelectorAll('#dataBody .data-pc')].filter(vis).map(bx => [...bx.querySelectorAll('.y-lbl')].map(t => t.textContent).join(' '));
      return { charts: out, data };
    });
    r.charts.forEach(c => { n++; if (!c.ok) fail(z, `Chart "${c.name}" (${c.w}x${c.h}) ohne Y-Beschriftung`); });
    if (z === 'data') {
      if (r.data.length !== 4) fail('DATA', `${r.data.length} Panels statt 4`);
      else if (new Set(r.data).size !== 1 || !r.data[0]) fail('DATA GEMEINSAME SKALA', `gleicher Indikator, verschiedene Y-Beschriftung: ${r.data.join(' | ')}`);
    }
  }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length > 5 && F.some(f => f.startsWith('DATA'))) { console.log(`yachse --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log(`yachse --gegenprobe: FEHLER - nur ${F.length} Befund(e)`); process.exit(1); }
  if (F.length) { console.log(`yachse: ${F.length} Befund(e) (${n} Charts)`); F.slice(0, 40).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`yachse: ok (${n} Charts auf ${ZIELE.length} Seiten/Fenstern mit Y-Beschriftung, Data: gleicher Indikator = gleiche Skala)`);
})().catch(e => { console.log('yachse: ABBRUCH ' + e.message); process.exit(1); });
