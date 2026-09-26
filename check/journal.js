// ══ WAECHTER: SCORE-JOURNAL ══════════════════════════════════════════════
//
// Nutzer-Auftrag 2026-09-26: "ich moechte das alles was den Score aendert
// aufgezeichnet wird und in history gezeigt wird auch wenn es nur 0,1 ist ...
// immer den Grund daneben ausfuehrlich ... kein Wert soll leer bleiben alles
// muss nachvollziehbar sein".
//
// Gemessen VOR dem Journal (Playwright, echter Stand): ein Kurs-Update bewegte
// 11 von 23 Assets (CAD -0,3 -> +1,4) - protokolliert: 0 Eintraege. Ein Tag
// Alterung bewegte 9 Assets - protokolliert: 0. In der History (23 Assets x 30
// Tage = 690 Zeilen) standen 184x "n/c", 190 Tage mit Bewegung ohne jede
// Ursache, 111 von 301 Ereignis-Zeilen mit "–".
//
// Geprueft wird, was daran nachrechenbar ist:
//   A) Kurs-Update: JEDES bewegte Asset hat einen Eintrag, und die Teile ergeben
//      exakt die angezeigte Veraenderung. Gegenprobe --gegenprobe: Journal
//      stillgelegt -> A muss rot werden (so sah es vorher aus).
//   B) Identischer Sync schreibt nichts (sonst stuenden Phantom-Ursachen da).
//   C) Manuelle Bias-Aenderung: Eintrag, als "set by you" benannt.
//   D) Zwei Tage Alterung ohne jede Veroeffentlichung: Eintraege mit der
//      Ursache "Ageing of releases", Summe exakt.
//   E) Modellwechsel mit unveraenderten Eingaben wird als Modellwechsel
//      benannt, und jede Modell-Version hat eine Notiz (JR_MODELL_NOTIZ).
//   F) Zwei Geraete: Merge ohne Doppelzaehlung, juengere Basis gewinnt.
//   G) History ueber alle Assets: kein "n/c", kein "not comparable", kein "–"
//      als Wirkung, jede Zeile hat eine Zahl und einen Text; an Journal-Tagen
//      ergeben die angezeigten Betraege exakt die Tagesveraenderung.
//   H) Statisch: Sync-Verdrahtung (Push, Pull, Export, Import), Aufruf in
//      recordScoreHist, Modell-Notiz fuer die aktuelle SCORE_MODEL_VERSION.
//   J) Echter Push/Pull zweier Geraete ueber eine nachgebildete Cloud: das
//      Journal faehrt im Push mit, Geraet B uebernimmt es und zeigt den
//      Eintrag genau einmal. Gegenprobe --gegenprobe-sync (Journal aus dem
//      Push entfernt) -> J rot.
//   I) Schrift der neuen Zeilen: aus der Skala, unter dem Fenstertitel
//      (typo.js/hierarchie.js sehen sie nicht - sie entstehen erst nach
//      einer Aenderung).
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const GEGENPROBE = process.argv.includes('--gegenprobe');

let fehler = 0;
const rot = (m) => { console.log('  ✗ ' + m); fehler++; };
const gruen = (m) => console.log('  ✓ ' + m);

// ── H) statisch, zuerst - braucht keinen Browser ─────────────────────────
function statisch() {
  console.log('── H) Verdrahtung und Modell-Notizen (statisch) ──');
  const main = fs.readFileSync(path.join(WURZEL, 'js/main.js'), 'utf8');
  const jr = fs.readFileSync(path.join(WURZEL, 'js/journal.js'), 'utf8');
  const score = fs.readFileSync(path.join(WURZEL, 'js/score.js'), 'utf8');
  const push = (main.match(/async function cloudPush[\s\S]*?\n}\n/) || [''])[0];
  const pull = (main.match(/async function cloudPull[\s\S]*?\n}\n/) || [''])[0];
  const exp = (main.match(/function exportData\(\)[\s\S]*?\n}\n/) || [''])[0];
  const imp = (main.match(/function importData\(input\)[\s\S]*?\n}\n/) || [''])[0];
  const rec = (main.match(/function recordScoreHist\(\)[\s\S]*?\n}\n/) || [''])[0];
  const fehlt = [];
  if (!/data\.scoreJournal\s*=\s*scoreJournal/.test(push)) fehlt.push('cloudPush schickt scoreJournal nicht');
  if (!/jrUebernehmen\(cd\.scoreJournal\)/.test(pull)) fehlt.push('cloudPull merged scoreJournal nicht');
  if (!/data\.scoreJournal\s*=\s*scoreJournal/.test(exp)) fehlt.push('exportData nimmt scoreJournal nicht mit');
  if (!/jrUebernehmen\(_imp\.scoreJournal\)/.test(imp)) fehlt.push('importData uebernimmt scoreJournal nicht');
  if (!/jrErfassen\(\)/.test(rec)) fehlt.push('recordScoreHist ruft jrErfassen() nicht auf');
  if (!/loadScoreJournal\(\)/.test(main)) fehlt.push('loadScoreJournal() wird beim Start nicht aufgerufen');
  if (fehlt.length) fehlt.forEach(rot);
  else gruen('Journal ist an Push, Pull, Export, Import, Start und recordScoreHist angebunden (CLAUDE.md Regel 1)');
  const v = +((score.match(/const SCORE_MODEL_VERSION\s*=\s*(\d+)/) || [])[1]);
  const notizBlock = (jr.match(/const JR_MODELL_NOTIZ=\{([\s\S]*?)\n\};/) || [])[1] || '';
  const versionen = [...notizBlock.matchAll(/^\s*(\d+):/gm)].map(m => +m[1]);
  if (!v) rot('SCORE_MODEL_VERSION in js/score.js nicht gefunden');
  else if (!versionen.includes(v))
    rot(`JR_MODELL_NOTIZ in js/journal.js hat keine Zeile fuer die aktuelle SCORE_MODEL_VERSION ${v} - `
      + 'an einem Modellwechsel stuende in der History "changed" ohne Inhalt. Eine englische Zeile ergaenzen.');
  else gruen(`Modell-Notiz fuer v${v} vorhanden (${versionen.length} Versionen beschrieben)`);
}

(async () => {
  statisch();
  let PW;
  try { PW = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
  catch (e) { console.log('[journal] Browser-Teil uebersprungen (kein Playwright)'); process.exit(fehler ? 1 : 0); }
  const { wartenBisDatenDa } = require('./warten.js');
  const b = await PW.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.clock.install();
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  // Kurs-Feed: auf Kommando die letzten drei Kerzen aller Reihen um 3 % senken -
  // bewegt 1D-Trend und Marktrelevanz, genau wie ein echtes Update, nur groesser.
  let kursSprung = false;
  await p.route(/price_data\.json/, async route => {
    const raw = JSON.parse(fs.readFileSync(path.join(WURZEL, 'price_data.json'), 'utf8'));
    if (kursSprung) for (const k of Object.keys(raw)) {
      const s = raw[k] && raw[k].series; if (!Array.isArray(s)) continue;
      for (let i = Math.max(0, s.length - 3); i < s.length; i++) {
        const e = s[i]; if (Array.isArray(e)) for (let j = 1; j < e.length; j++) if (typeof e[j] === 'number') e[j] *= 0.97;
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(raw) });
  });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  await p.waitForTimeout(1500);

  const scores = () => p.evaluate(() => { const m = {}; (syms || []).forEach(s => m[s.id] = symScoreCmp(s)); return m; });
  const pruefeSummen = () => p.evaluate(() => {
    const falsch = [];
    (scoreJournal.runs || []).forEach(l => Object.entries(l.a || {}).forEach(([id, e]) => {
      const s = e.p.reduce((x, q) => x + q.v, 0), d = Math.round((e.o - e.f) * 10) / 10;
      if (Math.abs(s - d) > 0.0015) falsch.push(`${id} ${e.f}→${e.o}: Teile ${s.toFixed(3)} statt ${d}`);
      e.p.forEach(q => { if (!q.a) falsch.push(`${id}: Teil ohne Ursachenart`); });
    }));
    return falsch;
  });

  // ── A) Kurs-Update ────────────────────────────────────────────────────
  console.log('\n── A) Kurs-Update: jedes bewegte Asset hat einen Eintrag, Summe exakt ──');
  const aktiv = await p.evaluate(() => jrAktiv());
  if (!aktiv) rot('Das Journal ist nach dem Start nicht aktiv (jrAktiv() false) - es wuerde nie etwas aufzeichnen');
  if (GEGENPROBE) await p.evaluate(() => jrSperren());
  const vorA = await scores();
  const nA = await p.evaluate(() => (scoreJournal.runs || []).length);
  kursSprung = true;
  await p.evaluate(async () => { const m = await import('./js/data-feeds.js'); m.autoFetchPriceData(); });
  await p.waitForTimeout(3500);
  const nachA = await scores();
  const bewegt = Object.keys(vorA).filter(k => nachA[k] != null && Math.abs(nachA[k] - vorA[k]) >= 0.05);
  const aufgezeichnet = await p.evaluate(n0 => {
    const ids = new Set(); (scoreJournal.runs || []).slice(n0).forEach(l => Object.keys(l.a || {}).forEach(id => ids.add(id)));
    return [...ids];
  }, nA);
  const ohne = bewegt.filter(id => !aufgezeichnet.includes(id));
  if (!bewegt.length) rot('Gegenprobe untauglich: das Kurs-Update hat keinen Score bewegt');
  else if (ohne.length)
    rot(`${bewegt.length} Assets haben sich bewegt, ${ohne.length} davon OHNE Journal-Eintrag (${ohne.slice(0, 6).map(id => id + ' ' + vorA[id] + '→' + nachA[id]).join(', ')}) - `
      + 'genau der gemeldete Fehler: der Score aendert sich, und niemand zeichnet den Grund auf.');
  else gruen(`${bewegt.length} bewegte Assets, alle mit Eintrag`);
  if (GEGENPROBE) await p.evaluate(() => jrFreigeben());
  const summenA = await pruefeSummen();
  if (summenA.length) rot(`Teile ergeben nicht die angezeigte Veraenderung: ${summenA.slice(0, 4).join(' | ')}`);
  else gruen('In jedem Eintrag ergeben die Teile exakt die angezeigte Veraenderung');

  // ── B) Identischer Sync ───────────────────────────────────────────────
  console.log('\n── B) Identischer Sync schreibt nichts ──');
  const b1 = await p.evaluate(() => new Promise(r => {
    const n0 = (scoreJournal.runs || []).length;
    for (let k = 0; k < 2; k++) { _flipCauseTag = 'sync'; applySnap(snap()); _flipCauseTag = null; save(); }
    setTimeout(() => r((scoreJournal.runs || []).length - n0), 700);
  }));
  if (b1) rot(`Ein Sync OHNE Zustandsaenderung hat ${b1} Journal-Lauf/Laeufe geschrieben - Phantom-Ursachen`);
  else gruen('Identischer Sync (2x): kein Eintrag');

  // ── C) Manuelle Aenderung ─────────────────────────────────────────────
  console.log('\n── C) Manuelle Bias-Aenderung wird als eigene Aenderung benannt ──');
  const c1 = await p.evaluate(() => new Promise(r => {
    selId = 'USD';
    const usd = syms.find(s => s.id === 'USD');
    const ri = usd.rubrics.findIndex(x => x.name === 'Labour Market');
    const ii = usd.rubrics[ri].indicators.findIndex(i => typeof i.pkt !== 'number');
    const ind = usd.rubrics[ri].indicators[ii];
    const neu = ind.bias === 'bull' ? 'bear' : 'bull';
    const n0 = (scoreJournal.runs || []).length, vor = symScoreCmp(usd);
    setIndBias(ri, ii, neu);
    setTimeout(() => {
      const l = (scoreJournal.runs || []).slice(n0).find(x => x.a && x.a.USD);
      const d = document.createElement('div'); d.innerHTML = renderSymHistoryPanel('USD');
      const heute = d.querySelector('.hw-day.hw-today');
      r({ vor, nach: symScoreCmp(usd), name: ind.name, eintrag: !!l, q: l && l.q,
        text: heute ? heute.textContent.replace(/\s+/g, ' ') : '' });
    }, 800);
  }));
  if (Math.abs(c1.nach - c1.vor) < 0.05) rot(`Gegenprobe untauglich: der Bias-Wechsel an ${c1.name} bewegte USD nicht`);
  else if (!c1.eintrag) rot(`Manuelle Aenderung (${c1.vor}→${c1.nach}) ohne Journal-Eintrag`);
  else if (!/set by you/.test(c1.text)) rot('Manuelle Aenderung steht in der History, aber nicht als "set by you" benannt');
  else gruen(`USD ${c1.vor}→${c1.nach}: Eintrag (Anlass ${c1.q}), in der History als "set by you" benannt`);

  // ── D) Alterung ueber Nacht ───────────────────────────────────────────
  console.log('\n── D) Zwei Tage ohne Veroeffentlichung: Alterung als Ursache ──');
  const jetzt = await p.evaluate(() => Date.now());
  await p.clock.setSystemTime(jetzt + 2 * 86400000);
  const d1 = await p.evaluate(() => new Promise(r => {
    const n0 = (scoreJournal.runs || []).length;
    recomputeAuto(); save();
    setTimeout(() => {
      const neu = (scoreJournal.runs || []).slice(n0);
      const mitAlter = new Set();
      neu.forEach(l => Object.entries(l.a || {}).forEach(([id, e]) => { if (e.p.some(q => q.a === 'dec')) mitAlter.add(id); }));
      r({ laeufe: neu.length, assets: neu.reduce((s, l) => s + Object.keys(l.a || {}).length, 0), mitAlter: [...mitAlter] });
    }, 800);
  }));
  const summenD = await pruefeSummen();
  if (!d1.assets) rot('Zwei Tage Alterung haben keinen einzigen Score um 0,1 bewegt - die Stufe kann nichts zeigen');
  else if (!d1.mitAlter.length) rot(`${d1.assets} Eintraege nach zwei Tagen, aber keiner nennt die Alterung als Ursache`);
  else if (summenD.length) rot(`Nach der Alterung gehen Teile nicht auf: ${summenD.slice(0, 3).join(' | ')}`);
  else gruen(`${d1.assets} Eintraege, ${d1.mitAlter.length} mit "Ageing of releases" (${d1.mitAlter.slice(0, 5).join(', ')}), Summen exakt`);

  // ── E) Modellwechsel ──────────────────────────────────────────────────
  console.log('\n── E) Gleiche Eingaben, neue Rechnung = Modellwechsel ──');
  const e1 = await p.evaluate(async () => {
    const { SCORE_MODEL_TAG, SCORE_MODEL_VERSION } = await import('./js/score.js');
    const usd = syms.find(s => s.id === 'USD');
    const neu = jrSchnappschuss(usd, new Date().toISOString(), SCORE_MODEL_TAG(), 19, {});
    const alt = JSON.parse(JSON.stringify(neu));
    alt.tag = (SCORE_MODEL_VERSION - 1) + ':normalized';
    alt.t = new Date(Date.now() - 60000).toISOString();
    // Ein Beitrag unter der "alten Rechnung" anders, Eingaben unveraendert.
    const k = Object.keys(alt.i).find(x => alt.i[x][0] !== 0 && alt.i[x][1] === 'n');
    alt.i[k][0] = Math.round((alt.i[k][0] - 0.5) * 100) / 100;
    alt.r = Math.round((alt.r - 0.5) * 100) / 100;
    alt.d = Math.round(alt.r * alt.c * 10) / 10;
    const texte = []; const txt = s => { texte.push(s); return texte.length - 1; };
    const e = jrVergleich(alt, neu, txt);
    const m = e && e.p.find(q => q.a === 'modell');
    const l = { x: texte, tag: SCORE_MODEL_TAG(), t: new Date().toISOString() };
    const satz = m ? jrModellText(alt.tag, SCORE_MODEL_TAG()) : '';
    return { key: k, gefunden: !!m, satz };
  });
  if (!e1.gefunden) rot(`Ein Beitrag, der sich bei gleichen Eingaben unter anderem Modell aendert (${e1.key}), wurde nicht als Modellwechsel erkannt`);
  else if (!/score model v\d+ → v\d+ \(v\d+: /.test(e1.satz)) rot(`Modellwechsel erkannt, aber ohne Inhalt beschrieben: "${e1.satz}"`);
  else gruen(`Modellwechsel erkannt und beschrieben: "${e1.satz.slice(0, 90)}..."`);

  // ── F) Zwei Geraete ───────────────────────────────────────────────────
  console.log('\n── F) Zwei Geraete: keine Doppelzaehlung, juengere Basis gewinnt ──');
  const f1 = await p.evaluate(() => {
    const e = (bt, t, f, o) => ({ bt, t, f, o, p: [{ a: 'rund', v: Math.round((o - f) * 10) / 10, xo: f, xn: o }] });
    const l = (id, t, eintrag) => ({ id, t, tag: '19:normalized', x: [], a: { ZZZ: eintrag } });
    // Geraet A: 10:00 und 11:00. Geraet B hat dieselbe Bewegung ab 10:00 als
    // EINEN Eintrag bis 11:05 aufgezeichnet (hatte A's Basis von 10:00).
    const A = { v: 1, base: { ZZZ: { t: '2026-01-01T11:00:00.000Z', d: 2 } }, runs: [
      l('a1', '2026-01-01T10:00:00.000Z', e('2026-01-01T09:00:00.000Z', '2026-01-01T10:00:00.000Z', 1, 1.5)),
      l('a2', '2026-01-01T11:00:00.000Z', e('2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z', 1.5, 2))] };
    const B = { v: 1, base: { ZZZ: { t: '2026-01-01T11:05:00.000Z', d: 2 } }, runs: [
      l('b1', '2026-01-01T11:05:00.000Z', e('2026-01-01T10:00:00.000Z', '2026-01-01T11:05:00.000Z', 1.5, 2))] };
    const M = mergeScoreJournal(A, B);
    // Die ECHTE Kette (jrKette), auf dem gemergten Journal.
    const kette = jrKette('ZZZ', M);
    const s = Math.round(kette.reduce((x, k) => x + (k.e.o - k.e.f), 0) * 10) / 10;
    return { runs: M.runs.length, basisT: M.base.ZZZ.t, kette: { s, n: kette.length } };
  });
  if (f1.runs !== 3) rot(`Merge hat ${f1.runs} statt 3 Laeufe - Eintraege verloren oder verdoppelt`);
  else if (f1.basisT !== '2026-01-01T11:05:00.000Z') rot(`Merge hat die aeltere Basis behalten (${f1.basisT})`);
  else if (f1.kette.s !== 1) rot(`Kette zaehlt ${f1.kette.s} statt 1,0 (1 -> 2): ueberlappende Eintraege zweier Geraete werden doppelt gezaehlt`);
  else gruen(`Merge: 3 Laeufe, juengere Basis, Kette ${f1.kette.n} Eintraege = +1.0 (keine Doppelzaehlung)`);

  // ── G) History ueber alle Assets ──────────────────────────────────────
  console.log('\n── G) History: kein leerer Wert, Journal-Tage gehen exakt auf ──');
  const g1 = await p.evaluate(() => {
    histRange = 30;
    const st = { zeilen: 0, nc: 0, nichtVergleichbar: 0, strich: 0, ohneDelta: 0, ohneText: 0, jrTage: 0, jrFalsch: [] };
    trendAssets().forEach(id => {
      const d = document.createElement('div'); d.innerHTML = renderSymHistoryPanel(id);
      d.querySelectorAll('.hw-hd-n').forEach(h => { if (/not comparable/.test(h.textContent)) st.nichtVergleichbar++; });
      d.querySelectorAll('.hw-day').forEach(z => {
        st.zeilen++;
        const dl = ((z.querySelector('.hw-dl') || {}).textContent || '').trim();
        if (dl === 'n/c') st.nc++;
        if (!dl || dl === '·') st.ohneDelta++;
        const det = ((z.querySelector('.hw-d4') || {}).textContent || '').replace(/\s+/g, ' ').trim();
        if (!det) st.ohneText++;
        z.querySelectorAll('.histp-eff').forEach(e => { if (e.textContent.trim() === '–' || !e.textContent.trim()) st.strich++; });
        const jv = [...z.querySelectorAll('.jr-z .jr-v')].map(e => parseFloat(e.textContent.replace('−', '-').replace('±', '')));
        if (jv.length) {
          st.jrTage++;
          const s = Math.round(jv.reduce((a, b) => a + b, 0) * 100) / 100;
          const delta = parseFloat(dl.replace('−', '-'));
          if (isFinite(delta) && Math.abs(s - delta) > 0.001) st.jrFalsch.push(id + ' ' + z.getAttribute('data-d') + ': Zeilen ' + s + ' statt ' + delta);
        }
      });
    });
    return st;
  });
  if (g1.nc || g1.nichtVergleichbar) rot(`${g1.nc}x "n/c" und ${g1.nichtVergleichbar}x "not comparable" - ein leerer Wert statt einer begruendeten Zahl`);
  else gruen(`${g1.zeilen} Tageszeilen, kein "n/c", kein "not comparable"`);
  if (g1.strich) rot(`${g1.strich} Wirkungen stehen als "–" oder leer da`);
  else gruen('Keine Wirkung als "–" oder leer');
  if (g1.ohneDelta || g1.ohneText) rot(`${g1.ohneDelta} Zeilen ohne Veraenderung, ${g1.ohneText} ohne Text`);
  else gruen('Jede Zeile hat eine Veraenderung und einen Text');
  if (!g1.jrTage) rot('Keine einzige Tageszeile mit Journal-Ursachen - die Anzeige ist ungeprueft');
  else if (g1.jrFalsch.length) rot(`An ${g1.jrFalsch.length} Journal-Tagen ergeben die angezeigten Betraege nicht die Tagesveraenderung: ${g1.jrFalsch.slice(0, 3).join(' | ')}`);
  else gruen(`${g1.jrTage} Journal-Tage: angezeigte Betraege = Tagesveraenderung`);

  // ── I) Schrift der neuen Zeilen (CLAUDE.md Regel 9) ─────────────────
  // check/typo.js und check/hierarchie.js sehen diese Zeilen NICHT: sie
  // entstehen erst nach einer Score-Aenderung, beide Waechter messen einen
  // frisch gestarteten Stand. Deshalb hier, im Fenster, nach den Aenderungen
  // aus A-D: jede Schrift aus der Skala (dieselbe Liste wie check/typo.js)
  // und kleiner als der Fenstertitel.
  console.log('\n── I) Schrift der Journal-Zeilen: Skala und unter dem Titel ──');
  const i1 = await p.evaluate(() => new Promise(r => {
    openHistModal('USD');
    setTimeout(() => {
      const m = document.getElementById('mHist');
      const titel = document.getElementById('mHistTitle');
      const fs = e => parseFloat(getComputedStyle(e).fontSize);
      const sel = ['.jr-kopf', '.jr-kopf b', '.jr-nm', '.jr-kt', '.jr-v', '.jr-why', '.jr-regel summary', '.jr-lauf summary', '.jr-l'];
      const out = [];
      sel.forEach(q => m.querySelectorAll(q).forEach(e => { const rr = e.getBoundingClientRect(); if (rr.width && rr.height) out.push({ q, fs: fs(e) }); }));
      const res = { titel: titel ? fs(titel) : null, werte: out, gefunden: [...new Set(out.map(o => o.q))] };
      closeM('mHist');
      r(res);
    }, 700);
  }));
  const SKALA = [30, 24, 22, 17, 15, 13, 12, 11, 10, 14, 16, 18];
  const frei = i1.werte.filter(o => !SKALA.includes(Math.round(o.fs * 10) / 10));
  const zuGross = i1.werte.filter(o => i1.titel && o.fs >= i1.titel);
  if (!i1.gefunden.includes('.jr-nm') || !i1.gefunden.includes('.jr-why')) rot(`Keine sichtbaren Journal-Zeilen im Fenster (${i1.gefunden.join(', ') || 'nichts'}) - die Stufe misst nichts`);
  else if (frei.length) rot(`Freie Schriftgroessen: ${[...new Set(frei.map(o => o.q + ' ' + o.fs + 'px'))].join(', ')}`);
  else if (zuGross.length) rot(`Journal-Text so gross wie der Fenstertitel (${i1.titel}px): ${[...new Set(zuGross.map(o => o.q))].join(', ')}`);
  else gruen(`${i1.werte.length} Journal-Textelemente (${i1.gefunden.length} Arten), alle aus der Skala und unter dem Titel (${i1.titel}px)`);

  // ── J) Zwei Geraete ueber eine (nachgebildete) Cloud ─────────────────
  // Stufe F prueft den Merge als Funktion; hier laeuft der ECHTE Weg:
  // cloudPush von Geraet A (Journal im Rumpf?), cloudPull beim Start von
  // Geraet B (Journal uebernommen, Eintrag in der History, keine zweite
  // Aufzeichnung derselben Bewegung). Sync-Fehler sind in diesem Projekt
  // mehrfach erst beim Nutzer aufgefallen (docs/state-sync.md).
  console.log('\n── J) Geraet A -> Cloud -> Geraet B, echter Push/Pull ──');
  const wolke = { row: null, posts: 0 };
  const geraet = async () => {
    const c = await b.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
    await c.route(/fake-journal\.supabase\.invalid/, async route => {
      const req = route.request(), u = req.url();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '[]');
        // Gegenprobe: so saehe es aus, wenn cloudPush das Journal vergaesse.
        if (process.argv.includes('--gegenprobe-sync') && body[0] && body[0].data) delete body[0].data.scoreJournal;
        wolke.row = body[0]; wolke.posts++; return route.fulfill({ status: 201, body: '' });
      }
      if (req.method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (/select=updated_at/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wolke.row ? [{ updated_at: wolke.row.updated_at }] : []) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wolke.row ? [{ data: wolke.row.data, updated_at: wolke.row.updated_at }] : []) });
    });
    const q = await c.newPage();
    await q.addInitScript(() => { try {
      localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); localStorage.setItem('fxpro_rez_purged', '1');
      if (!localStorage.getItem('fxpro_cloud_cfg')) localStorage.setItem('fxpro_cloud_cfg', JSON.stringify({ url: 'https://fake-journal.supabase.invalid', key: 'k', syncId: 'waechter' }));
    } catch (e) {} });
    q.on('pageerror', e => perr.push(String(e)));
    await q.goto(URL); await wartenBisDatenDa(q); await q.waitForTimeout(1500);
    return { c, q };
  };
  const A = await geraet();
  const ja = await A.q.evaluate(() => new Promise(r => {
    selId = 'USD';
    const usd = syms.find(s => s.id === 'USD'); const ri = usd.rubrics.findIndex(x => x.name === 'Labour Market');
    const ii = usd.rubrics[ri].indicators.findIndex(i => typeof i.pkt !== 'number');
    const ind = usd.rubrics[ri].indicators[ii];
    const vor = symScoreCmp(usd); setIndBias(ri, ii, ind.bias === 'bull' ? 'bear' : 'bull');
    setTimeout(() => r({ vor, nach: symScoreCmp(usd), laeufe: scoreJournal.runs.length }), 3500);
  }));
  const inWolke = !!(wolke.row && wolke.row.data && wolke.row.data.scoreJournal && wolke.row.data.scoreJournal.runs.length);
  const B = await geraet();
  const jb = await B.q.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = renderSymHistoryPanel('USD');
    const heute = d.querySelector('.hw-day.hw-today');
    return { laeufe: scoreJournal.runs.length, kette: jrKette('USD').length, text: heute ? heute.textContent.replace(/\s+/g, ' ') : '' };
  });
  if (Math.abs(ja.nach - ja.vor) < 0.05) rot('Gegenprobe untauglich: die Aenderung auf Geraet A bewegte USD nicht');
  else if (!inWolke) rot(`Geraet A hat ${wolke.posts}x gepusht, aber OHNE Journal im Rumpf - Geraet B saehe die Ursache nie`);
  else if (!jb.laeufe) rot('Geraet B hat das Journal aus der Cloud nicht uebernommen (0 Laeufe nach dem Start)');
  else if (jb.kette !== 1) rot(`Geraet B zeigt fuer dieselbe Bewegung ${jb.kette} Eintraege statt einem - doppelt aufgezeichnet`);
  else if (!/set by you/.test(jb.text)) rot('Geraet B zeigt den Eintrag, aber nicht als "set by you"');
  else gruen(`USD ${ja.vor}→${ja.nach} auf Geraet A, per Cloud auf Geraet B: 1 Eintrag, als "set by you" benannt`);
  await A.c.close(); await B.c.close();

  if (perr.length) rot('Seitenfehler: ' + [...new Set(perr)].slice(0, 3).join(' | '));
  await b.close();
  console.log(fehler ? `\n[journal] ${fehler} Fehler` : '\n[journal] ok');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
