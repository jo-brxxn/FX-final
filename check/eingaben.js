// ══ WAECHTER: KEINE EINGABE GEHT BEIM SCHLIESSEN VERLOREN ════════════════
//
// Nutzer 2026-09-30: "wenn man in einem Fenster ist und dort was ausfuellt
// und dann neben das Fenster geht ist ja das ausgefuellte Weg zumindest bei
// den Notizen ist das noch irgendwo der Fall? Sonst mach dort ueberall wenn
// es sonst nicht gespeichert ist das wenn man das Fenster durch wegdruecken
// schliesst das dann ein kleines Fenster kommt mit der Frage ob man es
// speichern will ... bearish nein und in bullish Farbe ja speichern".
// Dazu im selben Auftrag: die Knopfleiste "in einer eigenen Leiste fest
// fixiert" und aus "Pinned notes" heraus direkt das volle Notiz-Fenster.
//
// GEMESSEN vorher (Playwright, echte Klicks, 1500x1000): der Schutz von
// 2026-09-01 hing nur am Notiz-Editor und griff dort auf 2 von 4
// Oeffnungswegen. "+ New note" auf der Asset-Seite, auf der Watchlist und
// Quick capture: Klick daneben -> Fenster zu, Text WEG, keine Nachfrage.
// Dazu 9 weitere Fenster ohne Schutz, Escape schloss 7 davon am Schutz
// vorbei. "Save" der Einstellungen stand 1554px unter der Fensterunterkante.
//
// Geprueft wird:
//   A) Jedes Fenster mit einem Eingabefeld ist in MODAL_GUARDS eingetragen
//      oder steht unten in AUSNAHMEN - mit Grund. Jedes eingetragene hat hier
//      einen echten Oeffner, steht in ESC_MODALS, und sein Overlay/seine
//      Cancel-Knoepfe rufen nicht closeM() am Schutz vorbei.
//   B) Je Fenster und je Oeffnungsweg: unveraendert schliessen -> KEINE
//      Nachfrage (kein Fehlalarm). Nach einer Eingabe fragt JEDER Weg nach:
//      Klick daneben, Escape, Cancel/Close. "No, delete" schliesst, und beim
//      Wiederoeffnen steht das Getippte nicht mehr da.
//   C) Die Nachfrage selbst: genau zwei Knoepfe, "No, delete" auf
//      --bias-bear, "Yes, save" auf --bias-bull. Klick neben die Nachfrage
//      -> zurueck ins Fenster, Text unversehrt. "Yes, save" speichert.
//   D) Pinned notes: kein Eingabefeld mehr in der Karte; der Einstieg oeffnet
//      den vollen Editor mit dem Asset als Ort und gesetztem Pin-Haken;
//      gespeichert -> angepinnt und OBEN in der Karte.
//   E) Knopfleiste: laeuft der Inhalt ueber, liegt jede .m-btns-Leiste an der
//      Unterkante des Fensters, ueber die volle Innenbreite, ohne
//      Querscrollen - in drei Viewports und als Notiz-Vollseite.
//
// Gegenproben (muessen ROT werden):
//   --gegenprobe-schutz  Quick capture aus MODAL_GUARDS entfernt -> A und B rot
//   --gegenprobe-leiste  Leiste nicht mehr sticky                -> E rot
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const fs = require('fs');
const path = require('path');
const { wartenBisDatenDa } = require('./warten.js');

const GP_SCHUTZ = process.argv.includes('--gegenprobe-schutz');
const GP_LEISTE = process.argv.includes('--gegenprobe-leiste');

let fehler = 0;
const rot = (m) => { console.log('  ✗ ' + m); fehler++; };
const gruen = (m) => console.log('  ✓ ' + m);

// Fenster mit Eingabefeld, die BEWUSST nicht nachfragen - jeweils mit Grund.
const AUSNAHMEN = {
  mSearch: 'ein Suchbegriff ist keine Eingabe, die man speichert',
  mEvtAlertPicker: 'nur eine Auswahl; "Next" fuehrt erst zum Formular (mEvtAlert, geschuetzt)',
  mAssetCfg: 'jede Einstellung wirkt sofort beim Aendern (onchange -> save)',
  mCcyCfg: 'jede Auswahl wirkt sofort beim Klick (toggleCcyAsset -> save)',
};

// Die ECHTEN Oeffnungswege je Fenster. Ein neu eingetragenes Fenster ohne
// Eintrag hier ist rot: ungetesteter Schutz ist kein Schutz.
const OEFFNER = {
  mResNote: [
    `newResNoteIn('USD','')`,                    // Asset-Seite "+ New note"
    `newResNoteForAsset('USD')`,                 // Watchlist + Pinned notes
    `newResNote()`,                              // Archiv
    `openResNote(research.notes.find(n=>n&&!n.arch&&!n.seed).id)`, // bestehende Notiz
  ],
  mQuickNote: [`openQuickNote('','USD')`, `quickNoteForAsset('USD')`,
    // vorbelegt: die Zerlegung darf NICHT als ungespeicherte Aenderung zaehlen
    `openQuickNote('Fed hikes rates, USD looks bullish into the payrolls','USD')`],
  mPriceAlert: [`openPriceAlertM()`],
  mAddSym: [`openAddSym()`],
  mAddPair: [`openAddPair('Watchlist')`],
  mRename: [`renameWidget(widgets[0].id)`, `addWidget()`],
  mInfo: [`openInfoM(0,0)`],
  mEvtAlert: [`openEvtAlertM(evtDismissKey(calEvts.find(ev=>ev&&ev.name&&findCalEvtByKey(evtDismissKey(ev)))))`],
  mEvtAlertCustom: [`openEvtAlertCustom()`],
  mRateWatch: [`openRateWatchEdit('USD')`],
  mIndLink: [`openIndLinkEdit('USD|CPI','https://example.org/cpi')`],
  mCloud: [`openCloudM()`],
};

(async () => {
  // ── A (statisch): Overlays und Knoepfe der geschuetzten Fenster ────────
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const b = await chromium.launch();
  const perr = [];
  const neueSeite = async (vw, vh) => {
    const p = await b.newPage({ viewport: { width: vw, height: vh } });
    await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {} });
    p.on('pageerror', e => perr.push(String(e)));
    p.on('dialog', d => d.accept());
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
    await wartenBisDatenDa(p, { nachlauf: 800 });
    return p;
  };
  const W = 1500, H = 1000;
  const p = await neueSeite(W, H);
  await p.evaluate(() => { try { gotoSym('USD'); } catch (e) {} });
  await p.waitForTimeout(600);
  if (GP_SCHUTZ) await p.evaluate(() => { delete MODAL_GUARDS.mQuickNote; });

  console.log('A) Jedes Eingabefenster ist geschuetzt oder begruendet ausgenommen');
  const inv = await p.evaluate(() => {
    const txt = 'input:not([type]),input[type=text],input[type=number],input[type=url],input[type=search],input[type=date],input[type=time],textarea';
    return {
      mitFeld: [...document.querySelectorAll('.ov')].filter(o => o.querySelector(txt)).map(o => o.id),
      geschuetzt: Object.keys(MODAL_GUARDS),
      esc: ESC_MODALS.slice(),
    };
  });
  const offen = inv.mitFeld.filter(id => !inv.geschuetzt.includes(id) && !AUSNAHMEN[id] && id !== 'mUnsaved');
  if (offen.length) rot(`Fenster mit Eingabefeld ohne Schutz und ohne begruendete Ausnahme: ${offen.join(', ')}`);
  else gruen(`${inv.mitFeld.length} Fenster mit Eingabefeld: ${inv.geschuetzt.length} geschuetzt, ${Object.keys(AUSNAHMEN).length} begruendet ausgenommen`);
  const ohneOeffner = inv.geschuetzt.filter(id => !OEFFNER[id]);
  if (ohneOeffner.length) rot(`geschuetzt, aber ohne Oeffner in check/eingaben.js (ungetestet): ${ohneOeffner.join(', ')}`);
  const ohneEsc = inv.geschuetzt.filter(id => !inv.esc.includes(id));
  if (ohneEsc.length) rot(`Escape laeuft nicht ueber den Schutz: ${ohneEsc.join(', ')}`);
  for (const id of inv.geschuetzt) {
    const m = new RegExp(`<div class="ov" id="${id}"[^>]*>`).exec(html);
    if (m && /onclick=/.test(m[0])) rot(`${id}: eigenes onclick am Overlay laeuft am Schutz vorbei: ${m[0]}`);
    // Knoepfe, die das Fenster OHNE Speichern schliessen, muessen fragen.
    const start = html.indexOf(`id="${id}"`);
    const ende = html.indexOf('<div class="ov"', start + 10);
    const block = html.slice(start, ende > 0 ? ende : undefined);
    const direkt = [...block.matchAll(/<button[^>]*onclick="closeM\('([A-Za-z]+)'\)"[^>]*>([^<]*)</g)].filter(x => x[1] === id);
    for (const d of direkt) rot(`${id}: Knopf "${d[2].trim()}" schliesst per closeM() ohne Nachfrage`);
  }
  if (!fehler) gruen('Overlays, Cancel/Close und Escape der geschuetzten Fenster laufen ueber den Schutz');

  // ── B + C: echte Klicks je Fenster und Oeffnungsweg ─────────────────────
  console.log('B) Jeder Schliess-Weg fragt nach einer Eingabe nach - und nur dann');
  const aufraeumen = async () => {
    await p.evaluate(() => {
      if (document.getElementById('mUnsaved').style.display !== 'none') unsavedDiscard();
      [...document.querySelectorAll('.ov')].forEach(o => { if (o.style.display !== 'none') closeM(o.id); });
    });
  };
  const oeffne = async (src) => { await p.evaluate(s => { (0, eval)(s); }, src); await p.waitForTimeout(140); };
  const status = (id) => p.evaluate(id => ({
    offen: document.getElementById(id).style.display !== 'none',
    nachfrage: document.getElementById('mUnsaved').style.display !== 'none',
  }), id);
  // Tippt in das erste Textfeld der Schutz-Liste; eine Auswahlliste
  // (addWidget) bekommt einen anderen Eintrag. Liefert den Pruefwert.
  const eingabe = async (id) => {
    const ziel = await p.evaluate(id => {
      const g = MODAL_GUARDS[id];
      // Ohne Eintrag (Gegenprobe) das erste Textfeld des Fensters - der
      // Nutzer tippt ja trotzdem hinein.
      const felder = (g && g.felder) || [...document.querySelectorAll(`#${id} input[id],#${id} textarea[id]`)].map(e => e.id);
      for (const f of felder) {
        const e = document.getElementById(f);
        if (!e || e.type === 'checkbox' || e.type === 'date' || e.type === 'time') continue;
        return { f, tag: e.tagName, typ: e.type || '' };
      }
      return null;
    }, id);
    if (!ziel) return null;
    if (ziel.tag === 'SELECT') {
      const v = await p.evaluate(f => {
        const s = document.getElementById(f);
        const o = [...s.options].find(o => o.value !== s.value);
        if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
        return s.value;
      }, ziel.f);
      return { f: ziel.f, wert: v, select: true };
    }
    const wert = ziel.typ === 'number' ? '1.2345' : ziel.typ === 'url' ? 'https://example.org/waechter' : 'WAECHTER ' + id;
    const loc = p.locator('#' + ziel.f);
    await loc.click();
    await p.keyboard.press('End');
    await p.keyboard.type((await loc.inputValue()) ? ' ' + wert : wert);
    await p.waitForTimeout(60);
    return { f: ziel.f, wert };
  };
  const schliessen = async (id, weg) => {
    if (weg === 'daneben') await p.mouse.click(5, H - 5);
    else if (weg === 'escape') await p.keyboard.press('Escape');
    else {
      const k = p.locator(`#${id} .m-btns button`, { hasText: /^(Cancel|Close)$/ }).last();
      if (!(await k.count())) return false;
      await k.click();
    }
    await p.waitForTimeout(140);
    return true;
  };

  let faelle = 0, fehlalarm = 0, verloren = 0;
  for (const id of inv.geschuetzt.concat(GP_SCHUTZ ? ['mQuickNote'] : [])) {
    for (const src of OEFFNER[id] || []) {
      // 1) unveraendert: kein Fehlalarm, bei keinem Weg
      for (const weg of ['daneben', 'escape', 'cancel']) {
        await aufraeumen(); await oeffne(src);
        if (!(await schliessen(id, weg))) continue;
        const st = await status(id);
        if (st.nachfrage || st.offen) { fehlalarm++; rot(`${id} ueber ${src}: unveraendert geschlossen (${weg}) -> ${st.nachfrage ? 'Nachfrage (Fehlalarm)' : 'bleibt offen'}`); }
      }
      // 2) mit Eingabe: jeder Weg fragt nach
      for (const weg of ['daneben', 'escape', 'cancel']) {
        await aufraeumen(); await oeffne(src);
        const e = await eingabe(id);
        if (!e) { rot(`${id}: kein Textfeld zum Tippen gefunden`); break; }
        if (!(await schliessen(id, weg))) continue;
        faelle++;
        const st = await status(id);
        if (!st.nachfrage) { verloren++; rot(`${id} ueber ${src}: Eingabe + ${weg} -> ${st.offen ? 'keine Nachfrage' : 'Fenster zu, Eingabe weg'}`); continue; }
        // "No, delete": zu - und beim Wiederoeffnen steht das Getippte nicht da.
        await p.locator('#mUnsaved button', { hasText: 'No, delete' }).click();
        await p.waitForTimeout(120);
        const nach = await status(id);
        if (nach.offen || nach.nachfrage) rot(`${id}: "No, delete" schliesst nicht`);
        await oeffne(src);
        const wieder = await p.evaluate(f => { const e = document.getElementById(f); return e ? e.value : ''; }, e.f);
        if (!e.select && wieder.includes(e.wert)) rot(`${id}: nach "No, delete" steht das Getippte beim Wiederoeffnen wieder da`);
      }
    }
  }
  await aufraeumen();
  if (!verloren && !fehlalarm) gruen(`${faelle} Schliess-Vorgaenge mit Eingabe: jeder fragt nach; ohne Eingabe kein einziger Fehlalarm`);

  // ── C: die Nachfrage selbst ───────────────────────────────────────────
  console.log('C) Nachfrage: "No, delete" bearish, "Yes, save" bullish, daneben = zurueck');
  await oeffne(`newResNoteIn('USD','')`);
  const titel = 'WAECHTER-C ' + Date.now();
  await p.locator('#resNTitle').fill(titel);
  await p.locator('#resNBody').fill('Body text that must survive the question.');
  await p.mouse.click(5, H - 5);
  await p.waitForTimeout(150);
  const nf = await p.evaluate(() => {
    const ov = document.getElementById('mUnsaved');
    const knoepfe = [...ov.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor }));
    const probe = (v) => { const d = document.createElement('div'); d.style.background = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
    return { offen: ov.style.display !== 'none', titel: ov.querySelector('h3').textContent.trim(), txt: document.getElementById('ucTxt').textContent,
      knoepfe, bear: probe('--bias-bear'), bull: probe('--bias-bull') };
  });
  if (!nf.offen) rot('Nachfrage erscheint nicht');
  const namen = nf.knoepfe.map(k => k.t).join(' | ');
  if (namen !== 'No, delete | Yes, save') rot(`Knoepfe der Nachfrage: "${namen}" statt "No, delete | Yes, save"`);
  const no = nf.knoepfe.find(k => k.t === 'No, delete'), yes = nf.knoepfe.find(k => k.t === 'Yes, save');
  if (!no || no.bg !== nf.bear) rot(`"No, delete" ist nicht bearish gefaerbt (${no && no.bg} statt ${nf.bear})`);
  if (!yes || yes.bg !== nf.bull) rot(`"Yes, save" ist nicht bullish gefaerbt (${yes && yes.bg} statt ${nf.bull})`);
  if (!/note/i.test(nf.txt)) rot(`Satz der Nachfrage nennt nicht, was fehlt: "${nf.txt}"`);
  // Klick neben die Nachfrage: zurueck ins Fenster, Text unversehrt.
  await p.mouse.click(5, 5);
  await p.waitForTimeout(150);
  const zurueck = await p.evaluate(() => ({
    nf: document.getElementById('mUnsaved').style.display !== 'none',
    offen: document.getElementById('mResNote').style.display !== 'none',
    titel: document.getElementById('resNTitle').value,
  }));
  if (zurueck.nf || !zurueck.offen || zurueck.titel !== titel) rot(`Klick neben die Nachfrage fuehrt nicht zurueck ins Fenster: ${JSON.stringify(zurueck)}`);
  // "Yes, save": gespeichert, Fenster zu.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(120);
  await p.locator('#mUnsaved button', { hasText: 'Yes, save' }).click();
  await p.waitForTimeout(200);
  const gesp = await p.evaluate(t => ({
    da: research.notes.some(n => n && n.title === t),
    offen: document.getElementById('mResNote').style.display !== 'none',
  }), titel);
  if (!gesp.da || gesp.offen) rot(`"Yes, save" speichert nicht / schliesst nicht: ${JSON.stringify(gesp)}`);
  // Quick capture ebenso
  await oeffne(`openQuickNote('','USD')`);
  await p.locator('#qcInput').fill('WAECHTER quick capture: CPI came in hot, USD bullish');
  await p.mouse.click(5, H - 5);
  await p.waitForTimeout(150);
  if ((await status('mQuickNote')).nachfrage) {
    await p.locator('#mUnsaved button', { hasText: 'Yes, save' }).click();
    await p.waitForTimeout(200);
  }
  const qc = await p.evaluate(() => ({
    da: research.notes.some(n => n && String(n.body || '').includes('WAECHTER quick capture')),
    offen: document.getElementById('mQuickNote').style.display !== 'none',
  }));
  if (!qc.da || qc.offen) rot(`Quick capture: "Yes, save" speichert nicht / schliesst nicht: ${JSON.stringify(qc)}`);
  await aufraeumen();
  // Fenster, die nach ihrem EIGENEN Speichern offen bleiben: danach ist der
  // Stand gespeichert, ein Klick daneben darf nicht mehr nachfragen.
  await p.route('https://waechter.invalid/**', r => r.abort());
  const offenGespeichert = [
    { id: 'mPriceAlert', src: `openPriceAlertM()`, tippen: [['#paLevel', '1.2345']], knopf: /Create alert/ },
    { id: 'mCloud', src: `openCloudM()`, tippen: [['#cloudUsername', 'Waechter'], ['#cloudUrl', 'https://waechter.invalid'], ['#cloudKey', 'k'], ['#cloudSyncId', 'waechter']], knopf: /^Save$/ },
  ];
  for (const f of offenGespeichert) {
    await oeffne(f.src);
    for (const [sel, v] of f.tippen) await p.locator(sel).fill(v);
    await p.locator(`#${f.id} button`, { hasText: f.knopf }).first().click();
    await p.waitForTimeout(250);
    await p.mouse.click(5, H - 5);
    await p.waitForTimeout(150);
    const st = await status(f.id);
    if (st.nachfrage) rot(`${f.id}: nach dem eigenen Speichern fragt ein Klick daneben trotzdem "Save changes?"`);
    else if (st.offen) rot(`${f.id}: nach dem eigenen Speichern schliesst ein Klick daneben nicht`);
    await aufraeumen();
  }
  await p.evaluate(() => { try { localStorage.removeItem('fxpro_cloud_cfg'); } catch (e) {} priceAlerts = []; save(); });
  if (!fehler) gruen('zwei Knoepfe in Bias-Farben, Satz nennt die Notiz, daneben = zurueck, "Yes, save" speichert (Editor und Quick capture); nach eigenem Speichern (Price alert, Settings) keine Nachfrage mehr');

  // ── D: Pinned notes -> voller Editor ────────────────────────────────────
  console.log('D) Pinned notes oeffnen den vollen Notiz-Editor, angepinnt');
  await p.evaluate(() => { gotoSym('USD'); });
  await p.waitForTimeout(500);
  const karte = await p.evaluate(() => {
    const t = [...document.querySelectorAll('.ab-ntile')].find(x => /Pinned notes/.test(x.textContent));
    if (!t) return null;
    const neu = t.querySelector('.ab-nt-neu');
    return { felder: t.querySelectorAll('input,textarea').length, einstieg: !!neu, text: neu ? neu.textContent.trim() : '' };
  });
  if (!karte) rot('Pinned-notes-Karte nicht gefunden');
  else {
    if (karte.felder) rot(`Pinned-notes-Karte hat noch ${karte.felder} Eingabefeld(er) - neue Notizen sollen im Fenster entstehen`);
    if (!karte.einstieg) rot('Pinned-notes-Karte hat keinen Einstieg in den Notiz-Editor');
    else {
      await p.locator('.ab-ntile .ab-nt-neu').first().click();
      await p.waitForTimeout(200);
      const ed = await p.evaluate(() => ({
        offen: document.getElementById('mResNote').style.display !== 'none',
        pin: document.getElementById('resNPin').checked,
        ort: _resFids.slice(), soll: researchGenFidFor('USD'),
        felder: ['resNTitle', 'resNBody', 'resNTags', 'resNEvt', 'resNFav', 'resNPin', 'resNPlaceAsset'].filter(i => !document.getElementById(i)),
      }));
      if (!ed.offen) rot('Einstieg oeffnet den Notiz-Editor nicht');
      if (!ed.pin) rot('Notiz-Editor aus Pinned notes: Pin-Haken nicht gesetzt');
      if (!ed.ort.includes(ed.soll)) rot(`Notiz-Editor aus Pinned notes: Asset nicht als Ort gesetzt (${JSON.stringify(ed.ort)})`);
      if (ed.felder.length) rot(`Notiz-Editor: Felder fehlen: ${ed.felder.join(', ')}`);
      const t2 = 'WAECHTER-D ' + Date.now();
      await p.locator('#resNTitle').fill(t2);
      await p.locator('#mResNote .m-btns button', { hasText: /^Save$/ }).click();
      await p.waitForTimeout(400);
      const erg = await p.evaluate(t => {
        const n = research.notes.find(x => x && x.title === t);
        const t0 = [...document.querySelectorAll('.ab-ntile')].find(x => /Pinned notes/.test(x.textContent));
        const erste = t0 && t0.querySelector('.ab-nt-ti');
        return { da: !!n, pin: !!(n && n.pin), oben: erste ? erste.textContent.trim() : null };
      }, t2);
      if (!erg.da || !erg.pin) rot(`gespeicherte Notiz aus Pinned notes nicht angepinnt: ${JSON.stringify(erg)}`);
      else if (erg.oben !== t2) rot(`neue angepinnte Notiz steht nicht oben in der Karte (oben: "${erg.oben}")`);
      else gruen(`Karte ohne Eingabefeld, Einstieg "${karte.text}" -> voller Editor mit USD und Pin -> gespeichert, oben angepinnt`);
    }
  }
  await aufraeumen();
  await p.close();

  // ── E: Knopfleiste fest an der Unterkante ───────────────────────────────
  console.log('E) Knopfleiste liegt bei langem Inhalt fest an der Fensterunterkante');
  let leisten = 0;
  const leisteFehler = fehler;
  for (const [vw, vh] of [[1500, 1000], [1180, 820], [390, 844]]) {
    const q = await neueSeite(vw, vh);
    if (GP_LEISTE) await q.addStyleTag({ content: '.modal>.m-btns:last-child{position:static!important}' });
    const ids = await q.evaluate(() => [...document.querySelectorAll('.ov')]
      .filter(o => o.querySelector(':scope > .modal > .m-btns:last-child')).map(o => o.id));
    const varianten = ids.map(id => [id, false]).concat([['mResNote', true]]);
    for (const [id, vollseite] of varianten) {
      const m = await q.evaluate(([id, vollseite]) => {
        document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; });
        const ov = document.getElementById(id);
        ov.classList.toggle('res-note-page', vollseite);
        ov.style.display = 'flex';
        const md = ov.querySelector(':scope > .modal');
        md.style.animation = 'none';
        const leiste = md.querySelector(':scope > .m-btns:last-child');
        // Inhalt kuenstlich verlaengern, damit das Fenster sicher scrollt.
        // flex:none - in den Flex-Fenstern (.m-gross: History, Backtester)
        // wuerde ein Fueller sonst einfach schrumpfen, statt zu ueberlaufen.
        const f = document.createElement('div'); f.style.height = '2400px'; f.style.flex = 'none'; f.className = 'waechter-fueller';
        md.insertBefore(f, md.firstChild);
        md.scrollTop = 0;
        const mr = md.getBoundingClientRect(), lr = leiste.getBoundingClientRect();
        const cs = getComputedStyle(md);
        const innenL = mr.left + parseFloat(cs.borderLeftWidth), innenR = mr.right - parseFloat(cs.borderRightWidth);
        const innenU = mr.bottom - parseFloat(cs.borderBottomWidth);
        const r = {
          id: id + (vollseite ? ' (Vollseite)' : ''),
          scrollt: md.scrollHeight > md.clientHeight + 1,
          unten: Math.round(innenU - lr.bottom), links: Math.round(lr.left - innenL), rechts: Math.round(innenR - lr.right),
          quer: md.scrollWidth - md.clientWidth,
          imBild: lr.top >= mr.top && lr.bottom <= mr.bottom + 0.5,
        };
        f.remove(); ov.classList.remove('res-note-page'); ov.style.display = 'none'; md.style.animation = '';
        return r;
      }, [id, vollseite]);
      leisten++;
      const probleme = [];
      if (!m.scrollt) probleme.push('Fenster scrollt trotz Fueller nicht');
      if (!m.imBild) probleme.push('Leiste ausserhalb des sichtbaren Fensters');
      if (Math.abs(m.unten) > 1) probleme.push(`Abstand zur Unterkante ${m.unten}px`);
      if (Math.abs(m.links) > 1 || Math.abs(m.rechts) > 1) probleme.push(`nicht randlos (links ${m.links}px, rechts ${m.rechts}px)`);
      if (m.quer > 0) probleme.push(`Querscrollen ${m.quer}px`);
      if (probleme.length) rot(`${vw}x${vh} ${m.id}: ${probleme.join('; ')}`);
    }
    await q.close();
  }
  if (fehler === leisteFehler) gruen(`${leisten} Leisten in 3 Viewports: an der Unterkante, randlos, ohne Querscrollen`);

  if (perr.length) rot('JS-Fehler: ' + perr.slice(0, 3).join(' | '));
  await b.close();
  console.log(fehler ? `\n${fehler} Befund(e).` : '\nEingaben-Waechter gruen.');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
