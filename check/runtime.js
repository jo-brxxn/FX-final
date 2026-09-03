const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const URL=process.env.CHECK_URL||'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const seen = new Set();
  const rec = (kind, msg) => {
    const key = kind + '|' + msg;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ kind, msg });
  };
  page.on('pageerror', e => rec('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); // ⚠ faireconomy.media erlaubt keine Abfrage aus dem Browser. Der Code
      // rechnet damit: fetchFFPeriod() probiert die Adresse direkt UND ueber
      // drei CORS-Proxys, jeder Weg in try/catch (js/main.js). Die
      // CORS-Meldung schreibt der BROWSER trotzdem in die Konsole, und kein
      // JavaScript kann das unterdruecken. Auf dem Runner (mit echtem Netz)
      // hat sie den Lauf rot gemacht, lokal (ohne Netz) trat sie nie auf -
      // ein roter Lauf fuer ein Verhalten, das so gebaut ist. Deshalb genau
      // DIESE Quelle ausgenommen, nicht CORS allgemein: eine CORS-Meldung
      // von woanders ist weiter ein Fehler.
      const erwartet = /blocked by CORS policy/.test(t) && /faireconomy\.media/.test(t);
      if (!erwartet && !/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(t)) rec('CONSOLE', t); } });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => { ['introOv','lockScreen','appChoiceOv'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  await page.waitForTimeout(800);
  // dismiss any auto-opened modal
  await page.evaluate(() => { if (typeof closeM === 'function') { document.querySelectorAll('.mov,.mov2').forEach(m => { if (m.id) try { closeM(m.id); } catch(e){} }); } });
  await page.waitForTimeout(200);

  const TABS = ['dash','fx','matrix','cot','trends','sent','seas','data','rate','compare','watch','notes','cal','research','setups'];

  // ---- 1. every tab renders ----
  for (const t of TABS) {
    await page.evaluate(tab => { try { showTab(tab); } catch(e) { window.__e = (window.__e||[]).concat(tab+': '+e.message); } }, t);
    await page.waitForTimeout(250);
  }
  const tabErrs = await page.evaluate(() => window.__e || []);
  tabErrs.forEach(e => rec('TAB', e));

  // ---- 2. click every button on every tab ----
  for (const t of TABS) {
    await page.evaluate(tab => { try { showTab(tab); } catch(e){} }, t);
    await page.waitForTimeout(250);
    const clicked = await page.evaluate((tab) => {
      const out = [];
      const page_ = document.querySelector('.pc:not([style*="display: none"])') || document;
      const btns = [...document.querySelectorAll('button[onclick], [role=button][onclick], select')];
      for (const b of btns) {
        if (!b.offsetParent) continue;                    // invisible
        const oc = b.getAttribute('onclick') || '';
        if (/del|remove|reset|clear|Del|Remove|logout|Import|import/i.test(oc)) continue; // destructive
        // ⚠ Navigations-Buttons ebenfalls ueberspringen. Diese Schleife
        // klickt JEDEN sichtbaren Button - "Settings -> Apps -> Switch"
        // (switchToRezept) verlaesst dabei index.html komplett, und jede
        // spaetere page.evaluate() dieses Waechters lief danach in der
        // Rezept-App auf: "ReferenceError: syms is not defined". Das ist
        // kein App-Fehler (ein echter Klick SOLL die App wechseln), sondern
        // eine Grenze dieser Klick-alles-Methode.
        if (/switchToRezept|chooseApp/.test(oc)) continue;
        try {
          if (b.tagName === 'SELECT') continue;
          b.click();
        } catch (e) { out.push(tab + ' [' + oc.slice(0,60) + '] ' + e.message); }
      }
      return out;
    }, t);
    clicked.forEach(e => rec('CLICK', e));
    await page.waitForTimeout(300);
    // close whatever opened
    await page.evaluate(() => { document.querySelectorAll('.mov,.mov2').forEach(m => { m.style.display='none'; }); });
  }

  // ---- 3. score modals across all symbols/rubrics/pairs, both modes ----
  const modalErrs = await page.evaluate(() => {
    const out = [];
    for (const mode of ['classic','normalized']) {
      try { setScoreMode(mode); } catch(e) { out.push('setScoreMode '+mode+': '+e.message); continue; }
      for (const s of syms) {
        try { openScoreInfoSym(s.id); } catch(e) { out.push(mode+' sym '+s.id+': '+e.message); }
        for (const r of (s.rubrics||[])) {
          try { openScoreInfoRub(s.id, r.id); } catch(e) { out.push(mode+' rub '+s.id+'/'+r.name+': '+e.message); }
        }
      }
      for (const p of (typeof ALL_PAIRS!=='undefined'?ALL_PAIRS:[]).slice(0,20)) {
        try { openScoreInfoPair(p); } catch(e) { out.push(mode+' pair '+p+': '+e.message); }
      }
    }
    return out;
  });
  modalErrs.forEach(e => rec('SCOREMODAL', e));

  // ---- 4. asset detail pages ----
  const detailErrs = await page.evaluate(() => {
    const out = [];
    for (const s of syms) {
      try { gotoSym(s.id); } catch(e) { out.push('gotoSym '+s.id+': '+e.message); }
    }
    return out;
  });
  detailErrs.forEach(e => rec('DETAIL', e));
  await page.waitForTimeout(300);

  // ---- 5. data-driven views with every asset selected ----
  const filterErrs = await page.evaluate(() => {
    const out = [];
    const tryIt = (label, fn) => { try { fn(); } catch(e) { out.push(label + ': ' + e.message); } };
    for (const s of syms) {
      tryIt('setSeasAsset '+s.id, () => { setSeasAsset(s.id); });
      tryIt('setDataAsset '+s.id, () => { if (typeof setDataAsset==='function') setDataAsset(s.id); });
      tryIt('setTrendsFilter '+s.id, () => { setTrendsFilter(s.id); renderTrends(); });
    }
    tryIt('setTrendsFilter ALL', () => { setTrendsFilter('ALL'); renderTrends(); });
    tryIt('setTrendsFilter FX', () => { setTrendsFilter('FX'); renderTrends(); });
    return out;
  });
  filterErrs.forEach(e => rec('FILTER', e));

  // ---- 6. undo/redo + save roundtrip ----
  const stateErrs = await page.evaluate(() => {
    const out = [];
    try {
      const before = snap();
      // applySnap() erwartet den STRING, nicht das geparste Objekt
      // (es ruft selbst JSON.parse auf) - fruehere Testfassung uebergab
      // das Objekt und meldete dadurch einen Phantom-Fehler.
      // Der ERSTE Durchlauf darf abweichen: applySnap ruft migrateDash() auf,
      // das bei einem noch nicht migrierten Stand dashV einmalig hochzieht
      // (gemessen 0 -> DASH_V). Gefordert ist Stabilitaet AB dem zweiten Lauf.
      applySnap(before);
      recomputeAuto();
      const once = snap();
      applySnap(once);
      recomputeAuto();
      const after = snap();
      if (once !== after) out.push('snap/applySnap roundtrip is NOT idempotent');
    } catch(e) { out.push('snap roundtrip: ' + e.message); }
    try { doUndo(); doRedo(); } catch(e) { out.push('undo/redo: ' + e.message); }
    return out;
  });
  stateErrs.forEach(e => rec('STATE', e));

  console.log(JSON.stringify({ total: errors.length, errors }, null, 2));
  await browser.close();
})();
