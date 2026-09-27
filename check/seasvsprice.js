// ── SEASONALITY-KACHEL: LAUFENDES JAHR FEST UEBER DEN BALKEN ──────────────
//
// Nutzer 2026-09-27: "Bei der seasonality Karte bei Assets fehlt der
// Umschaltbare vs Price mach das Fest darein ohne Button nicht abschaltbar".
// Geprueft fuer jedes Asset mit Saisonalitaet (Asset-Seite, 1280px):
//   A) je Monat mit Kursdaten des laufenden Jahres (seasCurYearReturns - die
//      Reihe des Seasonality-Tabs) genau ein Punkt, sonst keiner;
//   B) Punkt und Balken auf EINER Skala: Punkt-Hoehe = 50% - v/max*50% der
//      Balkenflaeche, Balkenhoehe = |avg|/max der halben Flaeche, max ueber
//      Balken UND Punkte (+-1px);
//   C) Punkt auf der Spaltenmitte, Strich endet auf der Mitte der Nachbarspalte;
//   D) kein Schalter in der Kachel (fest, nicht abschaltbar), Legende da.
//   node check/seasvsprice.js [--gegenprobe]   (Punkte per CSS ausgeblendet)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  const ids = await p.evaluate(gp => {
    ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (gp) { const st = document.createElement('style'); st.textContent = '.ab-sb-cy{display:none!important}'; document.head.appendChild(st); }
    return Object.keys((SEASONALITY_DATA && SEASONALITY_DATA.assets) || {}).filter(id => syms.some(s => s.id === id));
  }, GEGENPROBE);
  if (!ids.length) fail('Voraussetzung', 'keine Saisonalitaet geladen');
  let geprueft = 0, punkte = 0;
  for (const id of ids) {
    await p.evaluate(id => gotoSym(id), id); await p.waitForTimeout(250);
    const r = await p.evaluate(id => {
      const t = [...document.querySelectorAll('#detail .ab-tile')].find(x => x.querySelector('.ab-seas'));
      if (!t) return { fehlt: true };
      const A = SEASONALITY_DATA.assets[id];
      const cy = seasCurYearReturns(id, A.inv) || {};
      const monate = A.months.slice().sort((a, b) => a[0] - b[0]);
      const max = Math.max(...monate.map(m => Math.abs(+m[1])), ...Object.values(cy).filter(isFinite).map(Math.abs)) || 1;
      const cols = [...t.querySelectorAll('.ab-sb')];
      const fehler = [];
      let n = 0;
      cols.forEach((c, i) => {
        const nr = monate[i][0], avg = +monate[i][1];
        const bars = c.querySelector('.ab-sb-bars').getBoundingClientRect();
        const halb = c.querySelector('.ab-sb-up').getBoundingClientRect().height;
        const bar = c.querySelector('.ab-sb-up>i,.ab-sb-dn>i');
        const soll = Math.abs(avg) / max * halb;
        if (bar && Math.abs(bar.getBoundingClientRect().height - Math.max(2, soll)) > 1.2) fehler.push(`B ${nr}: Balken ${bar.getBoundingClientRect().height.toFixed(1)}px statt ${soll.toFixed(1)}px`);
        const dot = c.querySelector('.ab-sb-cy');
        const sichtbar = dot && getComputedStyle(dot).display !== 'none' && dot.getBoundingClientRect().width > 0;
        if (cy[nr] == null) { if (sichtbar) fehler.push(`A ${nr}: Punkt ohne Kursdaten`); return; }
        if (!sichtbar) { fehler.push(`A ${nr}: kein Punkt, obwohl ${cy[nr].toFixed(2)}% vorliegt`); return; }
        n++;
        const d = dot.getBoundingClientRect();
        const y = d.top + d.height / 2 - bars.top, sollY = (0.5 - cy[nr] / max * 0.5) * bars.height;
        if (Math.abs(y - sollY) > 1) fehler.push(`B ${nr}: Punkt bei ${y.toFixed(1)}px statt ${sollY.toFixed(1)}px`);
        const cr = c.getBoundingClientRect();
        if (Math.abs(d.left + d.width / 2 - (cr.left + cr.width / 2)) > 0.6) fehler.push(`C ${nr}: Punkt nicht auf der Spaltenmitte`);
        const seg = c.querySelector('.ab-sb-cyl');
        if (cy[nr + 1] != null && i + 1 < cols.length) {
          const nb = cols[i + 1].getBoundingClientRect();
          if (!seg) fehler.push(`C ${nr}: kein Strich zum Folgemonat`);
          else if (Math.abs(seg.getBoundingClientRect().right - (nb.left + nb.width / 2)) > 0.8) fehler.push(`C ${nr}: Strich endet nicht auf der Nachbarmitte`);
        }
      });
      const knopf = [...t.querySelectorAll('button')].filter(x => /vs\s*price|this year/i.test(x.textContent + (x.title || ''))).length;
      return { fehler, n, knopf, leg: !!t.querySelector('.ab-seas-leg'), mitDaten: Object.keys(cy).length };
    }, id);
    if (r.fehlt) { fail(id, 'keine Seasonality-Kachel'); continue; }
    geprueft++; punkte += r.n;
    r.fehler.slice(0, 3).forEach(x => fail(id, x));
    if (r.knopf) fail(id + ' D', 'die Kachel hat einen Schalter - das laufende Jahr muss fest drin sein');
    if (r.mitDaten && !r.leg) fail(id + ' D', 'Legende "This year so far" fehlt');
  }
  if (perr.length) fail('Seitenfehler', perr.slice(0, 3).join(' | '));
  await b.close();
  if (F.length) { console.log('✗ Seasonality vs Price:\n  ' + F.slice(0, 20).join('\n  ')); process.exit(1); }
  console.log(`✓ Seasonality vs Price: ${geprueft} Kacheln, ${punkte} Monatspunkte auf der Balkenskala, kein Schalter`);
})().catch(e => { console.log('✗ seasvsprice: ' + e.message); process.exit(1); });
