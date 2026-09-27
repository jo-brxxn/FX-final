// ── GEMEINSAMER CURSOR DER INDIKATOR-CHARTS + COMPARE IN DER LEGENDE ──────
//
// Nutzer 2026-09-27 (Bildschirmfoto, NZD-Asset-Seite): "Compare Button muss
// kleiner in gleiche Zeile wie actual und forecast und es muss wenn ich in
// einem Chart so reingeblickt habe und die Details aufzeigen das in den
// anderen geoeffneten Charts an der gleichen Stelle sein ... Wie im compare
// Modus".
// Geprueft (NZD, Asset-Seite, zwei aufgeklappte Indikatoren aus
// VERSCHIEDENEN Karten):
//   A) an 7 Stellen des ersten Charts zeigt der zweite den Stand AM selben
//      Tag: den letzten eigenen Punkt am oder vor dem Datum (aus _chvReg),
//      vor seinem ersten Punkt nichts - abgeglichen ueber das Datum, nicht
//      ueber die Position (die x-Achse ist pro Release verteilt);
//   B) Compare sitzt in der Legendenzeile (gleiche Mitte wie "Actual"),
//      rechtsbuendig, hoechstens 24 px hoch; keine eigene Zeile mehr darueber.
//   node check/chartsync.js [--gegenprobe]   (Abgleich wieder ueber Position)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 1024 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(gp => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); if (gp) window.__chvNachPosition = true; gotoSym('NZD'); }, GEGENPROBE);
  await p.waitForTimeout(500);
  // Je Karte den ersten Indikator mit Chart aufklappen, bis zwei offen sind -
  // aus verschiedenen Karten, damit die Gruppe kartenuebergreifend geprueft ist.
  const ids = await p.evaluate(() => [...document.querySelectorAll('#detail tr.ind-detail-row')].map(r => ({ id: r.id, karte: [...document.querySelectorAll('#detail .rub-card')].indexOf(r.closest('.rub-card')) })));
  const karten = new Set(); let offen = [];
  for (const { id, karte } of ids) {
    if (offen.length >= 2) break;
    if (karten.has(karte)) continue;
    await p.evaluate(id => document.getElementById(id).previousElementSibling.click(), id);
    await p.waitForTimeout(200);
    const n = await p.evaluate(id => { const w = document.querySelector('#' + CSS.escape(id) + ' .chv[data-chv-group="ind"]'); return w ? (window._chvReg[w.dataset.chv] || []).length : 0; }, id);
    if (n >= 4) { offen.push(id); karten.add(karte); } else await p.evaluate(id => document.getElementById(id).previousElementSibling.click(), id);
  }
  if (offen.length < 2) fail('Voraussetzung', `nur ${offen.length} Indikator-Chart(s) mit Verlauf aufklappbar`);
  else {
    const [a, bId] = offen;
    const wa = await p.$('#' + a + ' .chv'); await wa.scrollIntoViewIfNeeded(); await p.waitForTimeout(150);
    let geprueft = 0;
    for (const f of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.97]) {
      const box = await wa.boundingBox();
      await p.mouse.move(box.x + box.width * f, box.y + box.height * 0.5); await p.waitForTimeout(120);
      const r = await p.evaluate(([a, bId]) => {
        const A = document.querySelector('#' + a + ' .chv'), B = document.querySelector('#' + bId + ' .chv');
        const tipA = A.querySelector('.chv-tip'), tipB = B.querySelector('.chv-tip');
        const ptsA = window._chvReg[A.dataset.chv], ptsB = window._chvReg[B.dataset.chv];
        const textA = tipA.style.display === 'none' ? null : tipA.innerHTML, textB = tipB.style.display === 'none' ? null : tipB.innerHTML;
        const pA = ptsA.find(x => x.tip === textA);
        let soll = null; if (pA) ptsB.forEach(x => { if (x.t <= pA.t && (!soll || x.t >= soll.t)) soll = x; });
        const pB = textB == null ? null : ptsB.find(x => x.tip === textB);
        return { tA: pA && pA.t, tB: pB && pB.t, soll: soll && soll.t };
      }, [a, bId]);
      if (!r.tA) { fail('A', `bei ${Math.round(f * 100)}% zeigt der erste Chart nichts`); continue; }
      geprueft++;
      if ((r.tB || null) !== (r.soll || null)) fail('A', `Chart 1 auf ${r.tA}: Chart 2 zeigt ${r.tB || 'nichts'}, Stand an diesem Tag ist ${r.soll || 'noch keiner'}`);
    }
    if (!F.length) console.log(`  (${geprueft} Stellen, ${a} -> ${bId})`);
  }
  // B) Compare in der Legendenzeile
  const cmp = await p.evaluate(() => {
    const l = document.querySelector('#detail .ind-detail-row:not([style*="none"]) .ind-hist-legend.mit-cmp');
    if (!l) return null;
    const btn = l.querySelector('.ind-cmp-btn'), act = l.querySelector('.lg-act');
    const lr = l.getBoundingClientRect(), br = btn.getBoundingClientRect(), ar = act ? act.getBoundingClientRect() : br;
    return { h: br.height, mitte: Math.abs((br.top + br.height / 2) - (ar.top + ar.height / 2)), rechts: lr.right - br.right,
      alt: document.querySelectorAll('#detail .ind-data-body>.ind-data-act .ind-cmp-btn').length };
  });
  if (!cmp) fail('B', 'kein Compare-Knopf in der Legendenzeile');
  else {
    if (cmp.h > 24) fail('B', `Compare ${cmp.h}px hoch (max 24)`);
    if (cmp.mitte > 3) fail('B', `Compare steht ${cmp.mitte.toFixed(1)}px neben der Legendenzeile`);
    if (cmp.rechts > 1) fail('B', `Compare nicht rechtsbuendig (${cmp.rechts.toFixed(1)}px Abstand)`);
    if (cmp.alt) fail('B', 'die alte Compare-Zeile ueber dem Chart steht noch da');
  }
  if (perr.length) fail('Seitenfehler', perr.slice(0, 3).join(' | '));
  await b.close();
  if (F.length) { console.log('✗ chartsync:\n  ' + F.join('\n  ')); process.exit(1); }
  console.log('✓ chartsync: offene Indikator-Charts zeigen denselben Tag (Stand am Datum), Compare klein in der Legendenzeile');
})().catch(e => { console.log('✗ chartsync: ' + e.message); process.exit(1); });
