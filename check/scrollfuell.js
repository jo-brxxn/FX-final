// ── MAUSRAD UEBER KARTEN, HISTORY FUELLT IHRE REIHE, ⓘ IN DER ZEILE ──────
// Nutzer 2026-10-10 (VERSION-CHECK-597), drei Punkte in einer Nachricht:
//   A) "wenn ich mit meiner maus auf einer karte bin in der man kein inhalt
//      zum scrollen hat und ich dann scrollen will dann geht das nicht" -
//      Ursache `*{overscroll-behavior:none}` auf Containern OHNE Ueberlauf;
//      Chromium ueberspringt sie, Safari/Firefox nicht. Geloest per
//      wheel-Handler in js/main.js. Geprueft wird der Handler direkt: an
//      Stichpunkten jeder Karte (Dashboard + Asset-Seite), unter denen kein
//      echter innerer Scrollbereich liegt, muss ein wheel-Ereignis die Seite
//      verschieben. Ueber einem echten inneren Bereich darf er es NICHT
//      (sonst ginge die Regel "feste Tabellen" 2026-09-25 verloren).
//   B) "die karte history ... wird nicht so gross wie die notes karte" -
//      History-Karte endet mit der hoechsten Schwester ihrer Reihe, auch wenn
//      Pinned notes durch viele Notizen hoeher wird (vorher fest 420px).
//   C) "das i soll aber auch keine zeile alleine einnehmen" - das ⓘ der
//      aufgeklappten Indikatorzeile steht IN der Quellenzeile, ganz rechts.
//   D) "beim dashboard die untersten karten die haben einen abstand zu den
//      oberen ... sie sollen direkt an den anderen dran haengen" - jede
//      Dashboard-Karte beginnt hoechstens 16px unter der Karte darueber
//      (1920/1440/1194px; vorher 23-97px bei der unteren Reihe).
//   node check/scrollfuell.js [--gegenprobe]
//   (Gegenprobe: wheel-Handler abgeklemmt, History wieder 420px, ⓘ wieder
//   absolut, Kalender/Movers/Notifications zurueck in die untere Reihe ->
//   A, B, C und D muessen rot werden)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(gp => {
    try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {}
    if (gp) window.addEventListener('wheel', e => e.stopImmediatePropagation(), { capture: true });
  }, GEGENPROBE);
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(gp => {
    ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (gp) { const st = document.createElement('style'); st.textContent = '.ab-orow>.ab-col>.ab-htile{position:static!important;max-height:420px!important}.ind-data-src>.ind-erkl-i{position:absolute!important;top:-14px!important;right:6px}.ind-data-body{position:relative}'; document.head.appendChild(st); }
  }, GEGENPROBE);

  // A) Mausrad
  const rad = sel => p.evaluate(sel => {
    const seite = () => [...document.querySelectorAll('.pc,.detail')].find(e => e.offsetParent && e.scrollHeight > e.clientHeight);
    const innen = (el, pg) => { for (let q = el; q && q !== pg; q = q.parentElement) { const oy = getComputedStyle(q).overflowY; if ((oy === 'auto' || oy === 'scroll') && q.scrollHeight > q.clientHeight + 1) return q; } return null; };
    const out = { geprueft: 0, innenGeprueft: 0, fehl: [] };
    const karten = [...document.querySelectorAll(sel)].filter(k => k.offsetParent);
    for (const k of karten) {
      const pg = seite(); if (!pg) { out.fehl.push('kein Seiten-Scroller'); break; }
      k.scrollIntoView({ block: 'center' });
      if (pg.scrollTop + pg.clientHeight >= pg.scrollHeight - 5) pg.scrollTop -= 300;
      const r = k.getBoundingClientRect();
      const name = (k.querySelector('.dw-title,.ab-tile-t,.kt,h3') || k).textContent.trim().slice(0, 24);
      for (const fy of [0.2, 0.5, 0.8]) for (const fx of [0.3, 0.7]) {
        const x = r.left + r.width * fx, y = Math.max(60, Math.min(innerHeight - 10, r.top + r.height * fy));
        const el = document.elementFromPoint(x, y); if (!el || !k.contains(el)) continue;
        const inn = innen(el, pg);
        const vor = pg.scrollTop, vorInn = inn ? inn.scrollTop : 0;
        const ev = new WheelEvent('wheel', { deltaY: 120, deltaMode: 0, bubbles: true, cancelable: true, clientX: x, clientY: y });
        el.dispatchEvent(ev);
        const weg = pg.scrollTop - vor;
        pg.scrollTop = vor;
        if (inn) { out.innenGeprueft++; if (weg !== 0 || ev.defaultPrevented) out.fehl.push(`${name}: ueber innerem Scrollbereich (${String(inn.className).slice(0, 20)}) hat das Rad die SEITE bewegt`); continue; }
        out.geprueft++;
        if (weg <= 0) { out.fehl.push(`${name} @${Math.round(x)},${Math.round(y)} (${String(el.className).slice(0, 24)}): Seite bewegte sich nicht (${weg}px)`); break; }
      }
    }
    return out;
  }, sel);
  const dash = await rad('.dw');
  await p.evaluate(() => gotoSym('EUR')); await p.waitForTimeout(1500);
  const asset = await rad('#detail .ab-orow .ab-col>*, #detail .rub-card');
  for (const [ort, r] of [['Dashboard', dash], ['Asset', asset]]) {
    if (r.geprueft < 10) fail('A MAUSRAD', `${ort}: nur ${r.geprueft} Stichpunkte geprueft - Messung kaputt?`);
    r.fehl.slice(0, 6).forEach(x => fail('A MAUSRAD', `${ort}: ${x}`));
  }
  console.log(`  (Mausrad: Dashboard ${dash.geprueft}+${dash.innenGeprueft} innen, Asset ${asset.geprueft}+${asset.innenGeprueft} innen)`);

  // B) History fuellt ihre Reihe - auch wenn Pinned notes hoch wird
  for (const zusatz of [0, 8]) {
    const m = await p.evaluate(n => {
      const l = document.querySelector('#detail .ab-nt-list');
      if (n && l) { for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'pruef-dummy'; d.style.height = '60px'; l.appendChild(d); } l.style.overflow = 'visible'; }
      const h = document.querySelector('#detail .ab-htile'); if (!h) return null;
      const reihe = h.closest('.ab-col'); const top = Math.round(reihe.getBoundingClientRect().top);
      const schw = [...reihe.parentElement.children].filter(c => Math.abs(c.getBoundingClientRect().top - top) < 2 && c !== reihe).map(c => Math.round(c.firstElementChild.getBoundingClientRect().bottom));
      const r = { hist: Math.round(h.getBoundingClientRect().bottom), schw, histH: Math.round(h.getBoundingClientRect().height) };
      document.querySelectorAll('.pruef-dummy').forEach(d => d.remove()); if (l) l.style.overflow = '';
      return r;
    }, zusatz);
    if (!m) { fail('B HISTORY', 'History-Karte nicht gefunden'); break; }
    const ziel = m.schw.length ? Math.max(...m.schw) : m.hist;
    if (m.schw.length && Math.abs(m.hist - ziel) > 1) fail('B HISTORY', `mit ${zusatz} Zusatz-Notizen: History endet bei ${m.hist}, Schwester(n) bei ${m.schw.join('/')} (${m.hist - ziel}px)`);
    if (m.histH > 4000) fail('B HISTORY', `History ${m.histH}px hoch - die Tagesliste zieht die Karte auf`);
  }

  // C) ⓘ in der Quellenzeile
  const c = await p.evaluate(async () => {
    const out = [];
    const zeilen = [...document.querySelectorAll('#detail tr.ind-row')].slice(0, 30);
    for (const z of zeilen) {
      const id = z.dataset.indid; const det = document.getElementById('indDetail-' + id);
      if (!det) continue;
      if (det.style.display === 'none') z.querySelector('.ir-act').click();
    }
    await new Promise(r => setTimeout(r, 400));
    let n = 0;
    document.querySelectorAll('#detail .ind-erkl-i').forEach(i => {
      if (!i.offsetParent) return; n++;
      const s = i.closest('.ind-data-src');
      const name = (i.getAttribute('aria-label') || '').replace('Explanation of ', '');
      if (!s) { out.push(`${name}: ⓘ steht nicht in der Quellenzeile`); return; }
      const ri = i.getBoundingClientRect(), rs = s.getBoundingClientRect();
      const kinder = [...s.children].filter(k => k !== i && k.getBoundingClientRect().width);
      const erste = kinder.length ? Math.min(...kinder.map(k => k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2)) : ri.top + ri.height / 2;
      if (Math.abs(ri.top + ri.height / 2 - erste) > 3) out.push(`${name}: ⓘ ${Math.round(ri.top + ri.height / 2 - erste)}px neben der ersten Textzeile`);
      if (rs.right - ri.right > 12) out.push(`${name}: ⓘ nicht ganz rechts (${Math.round(rs.right - ri.right)}px Abstand)`);
    });
    return { n, out };
  });
  if (c.n < 5) fail('C INFO', `nur ${c.n} ⓘ gefunden`);
  c.out.slice(0, 6).forEach(x => fail('C INFO', x));
  // D) Dashboard: jede Karte haengt direkt (<=16px) an der Karte darueber
  for (const vw of [1920, 1440, 1194]) {
    // 1194 (Dreispalter, iPad): right2 steht als volle zweite Reihe unter der
    // ersten - geprueft werden dort nur die Karten INNERHALB der Spalten
    // (bewusste Ausnahme, index.html beim 1160px-Raster).
    const nurSpalten = vw < 1320;
    await p.setViewportSize({ width: vw, height: 1000 });
    await p.evaluate(() => showTab('dash')); await p.waitForTimeout(1200);
    const d = await p.evaluate(([gp, nurSpalten]) => {
      if (gp) { const bz = document.querySelector('.dash-zone-bottom'); document.querySelectorAll('.dw-mini_calendar,.dw-movers_fx,.dw-notification').forEach(k => bz.appendChild(k)); }
      const ks = [...document.querySelectorAll('#dashWidgets .dw')].filter(k => k.offsetParent).map(k => ({ n: (k.querySelector('.dw-title') || k).textContent.trim().slice(0, 18), r: k.getBoundingClientRect(), z: k.parentElement }));
      const out = [];
      ks.forEach(k => {
        const drueber = ks.filter(o => o !== k && (!nurSpalten || o.z === k.z) && o.r.bottom <= k.r.top + 1 && o.r.right > k.r.left + 4 && o.r.left < k.r.right - 4);
        if (!drueber.length) return;
        const naechst = Math.max(...drueber.map(o => o.r.bottom));
        const luft = Math.round(k.r.top - naechst);
        if (luft > 16) out.push(`${k.n}: ${luft}px unter der Karte darueber`);
      });
      return out;
    }, [GEGENPROBE, nurSpalten]);
    d.slice(0, 4).forEach(x => fail('D DASHBOARD', `${vw}px ${x}`));
  }
  if (perr.length) fail('JS', perr[0]);
  await b.close();

  if (GEGENPROBE) {
    const a = F.some(x => x.startsWith('A ')), bb = F.some(x => x.startsWith('B ')), cc = F.some(x => x.startsWith('C ')), dd = F.some(x => x.startsWith('D '));
    const ok = a && bb && cc && dd;
    console.log(ok ? 'scrollfuell --gegenprobe: ok (Rad ohne Handler, History 420px, ⓘ ueber der Zeile, untere Dashboard-Reihe werden gemeldet)' : `scrollfuell --gegenprobe: FEHLER - A ${a} B ${bb} C ${cc} D ${dd}\n  ` + F.join('\n  '));
    process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`scrollfuell: ${F.length} Befund(e)\n  ` + F.join('\n  ')); process.exit(1); }
  console.log(`scrollfuell: ok (Mausrad scrollt ueber Karten die Seite, innere Bereiche bleiben fest; History fuellt ihre Reihe; ${c.n} ⓘ in ihrer Quellenzeile; Dashboard-Karten haengen direkt aneinander)`);
})().catch(e => { console.log('scrollfuell: ABBRUCH ' + e.message); process.exit(1); });
