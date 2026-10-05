// ══ WAECHTER: NICHTS SPRINGT ZURUECK ══════════════════════════════════════
//
// Nutzer 2026-09-30: "manchmal wenn ich ein paar button druecke und generell
// Eingaben mache dann kommt aufeinmal ein Moment und dann gehen die Buttons
// zurueck auf den Zustand von davor ... richte Sachen ein das das nicht nach
// jeder Aenderung so ist weil das war schonmal so" (2026-07-07 Hide-Button,
// 2026-07-26 Farbe/Tab-Stapel/PIN, 2026-07-27 Tab-Stapel).
//
// GEMESSEN vorher (nachgestellte Cloud, echte Klicks): App oeffnen, der
// Abgleich braucht 3 s, in der Zeit ein Paar auf die Watchlist und einen
// Indikator-Bias setzen - als die Antwort ankam, waren beide wieder weg.
// cloudPull() ersetzte den ganzen Kernzustand (applySnap); geschuetzt waren
// nur die Einstellungen daneben. Die Cloud-Version ist beim Oeffnen fast immer
// eine andere, weil jedes Geraet Verlauf und Journal automatisch hochlaedt.
// Im laufenden Betrieb (Minuten-Neuzeichnen, Datenupdate, Uebernahme
// desselben Stands) sprang auf keiner der 16 Seiten etwas zurueck.
//
// Geprueft wird - und zwar OHNE Liste, die jemand pflegen muesste: jede Stufe
// klickt sich selbst durch alle Bedienelemente, neue Funktionen sind also
// automatisch dabei:
//   A) ABGLEICH WAEHREND DER EINGABE: der Pull beim Start wird angehalten,
//      waehrenddessen wird auf Asset-Seite, Set-ups, Dashboard, Regime und
//      Kalender alles geklickt, was Zustand speichert. Dann kommt die Cloud
//      mit Aenderungen eines "anderen Geraets" an. Jede lokale Aenderung muss
//      bleiben, jede fremde (an anderer Stelle) muss ankommen.
//   B) MARKIERUNG: jeder Klick auf allen Seiten, der gespeicherten Zustand
//      aendert, markiert sich als Nutzer-Aenderung (pushU/markPrefEdit) -
//      sonst ersetzt der naechste Push ihn durch einen Pull des fremden Stands.
//   C) EINGABE WAEHREND DES PUSH: die Markierung bleibt stehen, der naechste
//      automatische Push nimmt die Eingabe mit, statt sie wegzuziehen.
//   D) OHNE eigene Eingabe kommt ein fremder Stand vollstaendig an (der
//      Abgleich darf fremde Aenderungen nicht schlucken).
// Gegenproben (muessen ROT werden):
//   --gegenprobe-abgleich   Basis geloescht (= Verhalten vor 2026-09-30) -> A rot
//   --gegenprobe-markierung toggleWatch ohne pushU                         -> B rot
//   --gegenprobe-push       Markierung nach dem Push geloescht             -> C rot
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GP_ABGLEICH = process.argv.includes('--gegenprobe-abgleich');
const GP_MARK = process.argv.includes('--gegenprobe-markierung');
const GP_PUSH = process.argv.includes('--gegenprobe-push');
const FAKE = 'https://waechter-cloud.invalid';

let fehler = 0;
const rot = m => { console.log('  ✗ ' + m); fehler++; };
const gruen = m => console.log('  ✓ ' + m);

// Klicks, die die Seite verlassen, Fenster oeffnen oder etwas loeschen, sind
// nicht Gegenstand dieser Pruefung (dafuer gibt es nav/eingaben/notizen).
const WEG = /showTab|gotoSym|selSym|openM\(|window\.open|QuickGo|setSub\(|Picker|confirm\(|del[A-Z]|remove|Remove|trash|Trash|reset|Reset|import|export|cloud|Pull|Push|location|download|addWidget|renameWidget|newRes|openQuick|openRes|open[A-Z]|toggleAllAnim|togglePin|setSbEdit|dissolve|print|history\.|research|Research|archive|Archive|resNote|gotoPair|fetchFF|goto/;

// JSON -> {pfad: wert}; Listen mit id werden ueber die id adressiert, damit
// eine andere Reihenfolge keine Scheinaenderung ist.
function flach(o, pre, out) {
  out = out || {}; pre = pre || '';
  if (o === null || typeof o !== 'object') { out[pre] = JSON.stringify(o); return out; }
  if (Array.isArray(o)) {
    const mitId = o.length && o.every(e => e && typeof e === 'object' && (typeof e.id === 'string' || typeof e.id === 'number'));
    if (!o.length) { out[pre] = '[]'; return out; }
    if (!mitId) { out[pre] = JSON.stringify(o); return out; }
    o.forEach(e => flach(e, pre + '[' + e.id + ']', out));
    return out;
  }
  const ks = Object.keys(o);
  if (!ks.length) { out[pre] = '{}'; return out; }
  ks.forEach(k => flach(o[k], pre ? pre + '.' + k : k, out));
  return out;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('dialog', d => d.dismiss().catch(() => {}));
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  // Die App bricht eine Cloud-Anfrage nach 10 s ab. Stufe A haelt den Pull
  // aber so lange an, wie das Durchklicken dauert (~30 s) - nur fuer den
  // Test verlaengert, sonst misst A einen abgebrochenen statt eines
  // verspaeteten Abgleichs.
  await p.addInitScript(() => { const o = AbortSignal.timeout.bind(AbortSignal); AbortSignal.timeout = ms => o(Math.max(ms, 180000)); });
  // ⚠ Hermetisch: Daten-Abrufe ins Internet werden abgebrochen (Skripte/
  // Schriften laden weiter). Die App holt beim Start zusaetzlich den Forex-
  // Factory-Kalender LIVE (direkt + drei Proxys). Auf dem GitHub-Runner mit
  // Internet hing dieser Abruf - die 180-s-Frist oben gilt fuer JEDE Anfrage -
  // ueber das 30-s-Datensignal hinaus; seine Antwort baute calEvts mitten in
  // Stufe B neu und wurde dem gerade geklickten Knopf zugeschrieben (CI-Lauf
  // 522: "sent: setSentSub('retail')", lokal nie, weil die Sandbox die
  // Proxys sofort ablehnt). Nachgestellt mit 40 s verzoegerter Live-Antwort:
  // ohne diese Zeile rot (<calEvts>), mit ihr gruen.
  const HIER = new globalThis.URL(URL).origin;
  await ctx.route(u => u.origin !== HIER && !u.href.startsWith(FAKE), route => ['fetch', 'xhr'].includes(route.request().resourceType()) ? route.abort() : route.fallback());
  await p.goto(URL); await wartenBisDatenDa(p);
  const weg = () => p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; }); });
  await weg();
  const basisStr = await p.evaluate(() => { flushAndSave(); return snap(); });
  const basis = JSON.parse(basisStr);

  // ── Nachgestellte Cloud ─────────────────────────────────────────────────
  // Ein "anderes Geraet" hat an ANDEREN Stellen geaendert: einen Indikator
  // eines Assets, das auf keiner der geklickten Seiten steht, ein Paar
  // angelegt und ein Widget umbenannt.
  const fremd = JSON.parse(basisStr);
  const jpy = fremd.syms.find(s => s.id === 'JPY');
  // ⚠ Ein Feld, das NUR der Nutzer setzt (Info-Notiz am Indikator) - ein
  // Bias wuerde von recomputeAuto()/den Feeds ohnehin neu berechnet und
  // kaeme deshalb nie "an", egal wie gut der Abgleich ist.
  const jInd = jpy.rubrics.filter(r => (r.indicators || []).length).slice(-1)[0].indicators[0];
  jInd.info = 'WAECHTER: Notiz vom anderen Geraet';
  const wl = fremd.pairCats.find(c => c.name === 'Watchlist') || fremd.pairCats[0];
  fremd.pairs.push({ id: 'waechterfremd1', name: 'NZD/CHF', bias: 'neu', catId: wl.id, entry: '', entryTrigger: '', sl: '', tp: '', rr: '', size: '', notes: 'WAECHTER fremd', _open: false });
  const wid = fremd.widgets[fremd.widgets.length - 1]; wid.title = 'WAECHTER fremder Titel';
  const fremdPfade = (() => { const a = flach(basis), c = flach(fremd); return Object.keys(c).filter(k => a[k] !== c[k]); })();
  const cloud = { data: fremd, updated_at: '2026-09-30T12:00:00.000Z' };
  const ALT = '2026-09-30T08:00:00.000Z';
  let pullFrei = null, pushFrei = null, pullWartet = false, pushWartet = false;
  const pushes = [];
  await ctx.route(FAKE + '/**', async route => {
    const r = route.request(), u = r.url();
    if (r.method() === 'POST') {
      let body = null; try { body = JSON.parse(r.postData())[0]; } catch (e) {}
      if (pushWartet) await new Promise(res => { pushFrei = res; });
      if (body) { pushes.push(body); cloud.data = body.data; cloud.updated_at = body.updated_at; }
      return route.fulfill({ status: 201, body: '' });
    }
    if (/select=updated_at/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ updated_at: cloud.updated_at }]) });
    if (/select=data/.test(u)) {
      // Antwort = Stand im MOMENT der Anfrage (wie beim echten Server), auch
      // wenn sie erst spaeter ausgeliefert wird.
      const antwort = JSON.stringify([{ data: cloud.data, updated_at: cloud.updated_at }]);
      if (pullWartet) await new Promise(res => { pullFrei = res; });
      return route.fulfill({ status: 200, contentType: 'application/json', body: antwort });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await p.evaluate(([FAKE, ALT]) => {
    localStorage.setItem('fxpro_cloud_cfg', JSON.stringify({ username: 'W', url: FAKE, key: 'k', syncId: 'waechter' }));
    localStorage.setItem('fxpro_cloud_seen', ALT); localStorage.setItem('fxpro_updated', ALT);
    localStorage.removeItem('fxpro_user_pending');
  }, [FAKE, ALT]);

  // ── A: Abgleich waehrend der Eingabe ──────────────────────────────────────
  console.log('A) Abgleich beim Oeffnen, waehrend geklickt wird');
  pullWartet = true;
  await p.reload(); await wartenBisDatenDa(p, { nachlauf: 400 }); await weg();
  for (let i = 0; i < 40 && !pullFrei; i++) await p.waitForTimeout(100);
  if (!pullFrei) rot('der Start-Abgleich hat die Cloud nie gefragt');
  if (GP_ABGLEICH) await p.evaluate(() => { _syncBasis = null; });
  const vorKlicks = JSON.parse(await p.evaluate(() => snap()));
  let klicksA = 0;
  for (const seite of ['cur', 'pairs', 'dash', 'regime', 'cal']) {
    await p.evaluate(s => { if (s === 'cur') gotoSym('USD'); else showTab(s); }, seite); await p.waitForTimeout(400);
    klicksA += await p.evaluate(async ([s, WEGQ]) => {
      const WEG = new RegExp(WEGQ), sleep = ms => new Promise(r => setTimeout(r, ms));
      const wurzel = () => s === 'cur' ? document.getElementById('detail') : document.getElementById(PAGE_IDS[s]);
      const liste = [...wurzel().querySelectorAll('[onclick],select[onchange]')].filter(e => e.offsetParent)
        .map(e => ({ h: e.getAttribute('onclick') || e.getAttribute('onchange') || '', t: (e.textContent || '').trim().slice(0, 30) }))
        .filter(k => !WEG.test(k.h));
      const gesehen = new Set(); let n = 0;
      for (const k of liste) {
        if (gesehen.has(k.h + k.t)) continue; gesehen.add(k.h + k.t);
        const e = [...wurzel().querySelectorAll('[onclick],select[onchange]')].find(x => (x.getAttribute('onclick') || x.getAttribute('onchange') || '') === k.h && (x.textContent || '').trim().slice(0, 30) === k.t);
        if (!e || !e.offsetParent) continue;
        const vor = snap();
        try {
          if (e.tagName === 'SELECT') { const o = e.options[(e.selectedIndex + 1) % e.options.length]; if (!o) continue; e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); }
          else e.click();
        } catch (x) { continue; }
        await sleep(60);
        document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; });
        if (snap() !== vor) n++;
        if ((s === 'cur' && (curPage !== 'cur' || getSym().id !== 'USD')) || (s !== 'cur' && curPage !== s)) { if (s === 'cur') gotoSym('USD'); else showTab(s); await sleep(250); }
      }
      return n;
    }, [seite, WEG.source]);
  }
  const lokal = JSON.parse(await p.evaluate(() => snap()));
  const fb = flach(vorKlicks), fl = flach(lokal);
  const lokalPfade = Object.keys(Object.assign({}, fb, fl)).filter(k => fb[k] !== fl[k]);
  if (klicksA < 10) rot(`nur ${klicksA} Klicks haben waehrend des Abgleichs etwas gespeichert - Selektoren veraltet?`);
  // Cloud antwortet
  if (pullFrei) pullFrei();
  pullWartet = false;
  await p.waitForTimeout(2500);
  // Abgeleitete Felder (Paar-Bias der Set-ups, Asset-Bias, Karten-Summen)
  // berechnet die App bei jedem Anwenden neu aus den Scores - sie gehoeren
  // niemandem. Vergleichsmassstab ist deshalb, was die App aus dem LOKALEN
  // Stand selbst ableitet (einmal anwenden, messen, Endstand zurueck).
  const [nachAStr, lokalAbgStr] = await p.evaluate(ls => {
    const ende = snap();
    _flipCauseTag = 'sync'; applySnap(ls); const abg = snap(); applySnap(ende); _flipCauseTag = null;
    return [ende, abg];
  }, JSON.stringify(lokal));
  const nachA = JSON.parse(nachAStr), fla = flach(JSON.parse(lokalAbgStr));
  const fn = flach(nachA), ff = flach(fremd);
  const verloren = lokalPfade.filter(k => fn[k] !== fl[k] && fn[k] !== fla[k]);
  const nichtAngekommen = fremdPfade.filter(k => !lokalPfade.includes(k) && fn[k] !== ff[k]);
  if (verloren.length) rot(`${verloren.length} von ${lokalPfade.length} lokalen Aenderungen nach dem Abgleich ZURUECKGESPRUNGEN, z. B. ${verloren.slice(0, 4).map(k => k + ' ' + fl[k] + ' -> ' + fn[k]).join(' | ')}`);
  if (nichtAngekommen.length) rot(`${nichtAngekommen.length} Aenderungen des anderen Geraets nicht angekommen: ${nichtAngekommen.slice(0, 4).join(', ')}`);
  if (!verloren.length && !nichtAngekommen.length) gruen(`${klicksA} Klicks waehrend des Abgleichs (${lokalPfade.length} geaenderte Felder) bleiben, alle ${fremdPfade.length} Felder des anderen Geraets kommen an`);

  // ── B: Markierung ─────────────────────────────────────────────────────────
  console.log('B) Jeder speichernde Klick markiert sich als Nutzer-Aenderung');
  if (GP_MARK) await p.evaluate(() => { window.toggleWatch = n => { setWatched(n, !isWatched(n)); save(); renderDash(); }; });
  // Watchlist leeren, damit das Dashboard die Vorschlagszeilen zeigt
  await p.evaluate(() => { const wl = pairCats.find(c => c.name === 'Watchlist'); if (wl) { pairs = pairs.filter(x => x.catId !== wl.id); save(); } });
  const unmarkiert = []; let speichernd = 0;
  for (const seite of ['cur', 'dash', 'mx', 'trends', 'cot', 'sent', 'seas', 'news', 'regime', 'data', 'rate', 'carry', 'pairs', 'watch', 'cal', 'notes']) {
    await p.evaluate(s => { document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; }); if (s === 'cur') gotoSym('USD'); else showTab(s); }, seite); await p.waitForTimeout(400);
    const r = await p.evaluate(async ([s, WEGQ]) => {
      const WEG = new RegExp(WEGQ), sleep = ms => new Promise(r => setTimeout(r, ms));
      // Kein Nutzer-Zustand: Sync-Marker, Caches und Einmal-Marker, die die App
      // nach einem Abruf SELBST schreibt. ⚠ Diese Schreibvorgaenge kommen
      // asynchron - auf dem langsamen GitHub-Runner landete der COT-Cache am
      // 2026-10-05 im 80-ms-Fenster nach einem Seasonality-Klick und wurde als
      // "unmarkierte Nutzer-Aenderung" gemeldet (lokal nie). Mitgefunden,
      // gleiche Klasse: carryRateCache, fxpro_rez_purge*, fxpro_seedclean.
      const VOL = /^(fxpro_updated|fxpro_cloud_seen|fxpro_user_pending|fxpro_backup|fxpro_scorehist|fxpro_scorejournal|fxpro_ff_last|fxpro_saved|fxpro_undo|fxpro_cot_hist_cache|carryRateCache|fxpro_rez_purge|fxpro_seedclean)/;
      const lsMap = () => { const m = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!VOL.test(k) && k !== SK) m[k] = localStorage.getItem(k); } return m; };
      const wurzel = () => s === 'cur' ? document.getElementById('detail') : document.getElementById(PAGE_IDS[s]);
      const liste = [...wurzel().querySelectorAll('[onclick],select[onchange],input[type=checkbox][onchange]')].filter(e => e.offsetParent)
        .map(e => ({ h: e.getAttribute('onclick') || e.getAttribute('onchange') || '', t: (e.textContent || '').trim().slice(0, 30) }))
        .filter(k => !WEG.test(k.h));
      const gesehen = new Set(); const aus = []; let n = 0;
      for (const k of liste) {
        if (gesehen.has(k.h + k.t)) continue; gesehen.add(k.h + k.t);
        const e = [...wurzel().querySelectorAll('[onclick],select[onchange],input[type=checkbox][onchange]')].find(x => (x.getAttribute('onclick') || x.getAttribute('onchange') || '') === k.h && (x.textContent || '').trim().slice(0, 30) === k.t);
        if (!e || !e.offsetParent) continue;
        markUserSynced();
        const s0 = snap(), l0 = lsMap();
        try {
          if (e.tagName === 'SELECT') { const o = e.options[(e.selectedIndex + 1) % e.options.length]; if (!o) continue; e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); }
          else if (e.type === 'checkbox') { e.checked = !e.checked; e.dispatchEvent(new Event('change', { bubbles: true })); }
          else e.click();
        } catch (x) { continue; }
        await sleep(80);
        document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; });
        const l1 = lsMap();
        const lsAnders = Object.keys(Object.assign({}, l0, l1)).filter(x => l0[x] !== l1[x]);
        if (snap() !== s0 || lsAnders.length) {
          n++;
          // Welcher Teil des Zustands sich geaendert hat (<calEvts>, <syms> ...) -
          // ohne diese Angabe war der CI-Befund vom 2026-10-05 nicht zuzuordnen.
          if (!(_userEditedSinceSync || localStorage.getItem('fxpro_user_pending') === '1')) { let teile = ''; try { const A = JSON.parse(s0), B = JSON.parse(snap()); teile = Object.keys(Object.assign({}, A, B)).filter(x => JSON.stringify(A[x]) !== JSON.stringify(B[x])).join(','); } catch (x) {}
            aus.push(`${s}: ${k.h.slice(0, 70)} "${k.t}"${lsAnders.length ? ' [' + lsAnders.join(',') + ']' : ''}${teile ? ' <' + teile + '>' : ''}`); }
        }
        if ((s === 'cur' && (curPage !== 'cur' || getSym().id !== 'USD')) || (s !== 'cur' && curPage !== s)) { if (s === 'cur') gotoSym('USD'); else showTab(s); await sleep(250); }
      }
      return { n, aus };
    }, [seite, WEG.source]);
    speichernd += r.n; unmarkiert.push(...r.aus);
  }
  if (unmarkiert.length) rot(`${unmarkiert.length} Klicks speichern, ohne sich als Nutzer-Aenderung zu markieren - der naechste Push ersetzt sie durch den fremden Stand: ${unmarkiert.slice(0, 5).join(' | ')}`);
  else gruen(`${speichernd} speichernde Klicks auf 16 Seiten, alle als Nutzer-Aenderung markiert`);
  if (speichernd < 30) rot(`nur ${speichernd} speichernde Klicks gefunden - Selektoren veraltet?`);

  // ── C: Eingabe waehrend des Push ──────────────────────────────────────────
  console.log('C) Eingabe waehrend eines laufenden Push bleibt markiert und geht hoch');
  await p.evaluate(() => { markUserSynced(); showTab('pairs'); });
  pushWartet = true;
  const pushLauf = p.evaluate(() => { pushU(); save(); return cloudPush(false); });
  for (let i = 0; i < 40 && !pushFrei; i++) await p.waitForTimeout(100);
  await p.evaluate(() => { toggleWatch('AUD/NZD'); });
  pushWartet = false; if (pushFrei) pushFrei();
  await pushLauf;
  if (GP_PUSH) await p.evaluate(() => { markUserSynced(); });
  const markiertC = await p.evaluate(() => localStorage.getItem('fxpro_user_pending') === '1');
  // anderes Geraet laedt dazwischen etwas hoch (ohne AUD/NZD)
  cloud.updated_at = '2026-09-30T13:00:00.000Z';
  cloud.data = JSON.parse(JSON.stringify(cloud.data)); cloud.data.pairs = (cloud.data.pairs || []).filter(x => x.name !== 'AUD/NZD');
  await p.evaluate(() => cloudPush(false));
  await p.waitForTimeout(500);
  const bleibtC = await p.evaluate(() => isWatched('AUD/NZD'));
  if (!markiertC) rot('eine Eingabe waehrend des Push gilt danach als schon hochgeladen (Markierung geloescht)');
  if (!bleibtC) rot('Watchlist-Eintrag, gesetzt waehrend eines Push, ist nach dem naechsten automatischen Push WEG');
  if (markiertC && bleibtC) gruen('Eingabe waehrend des Push: bleibt markiert, der naechste Push nimmt sie mit');

  // ── D: ohne eigene Eingabe kommt der fremde Stand vollstaendig an ─────────
  console.log('D) Ohne eigene Eingabe kommt ein fremder Stand vollstaendig an');
  await p.evaluate(() => { flushAndSave(); });
  await p.waitForTimeout(2000);
  const fremdZiehen = async (aendern, ts) => {
    const hier = JSON.parse(await p.evaluate(() => { markUserSynced(); return snap(); }));
    aendern(hier);
    cloud.data = hier; cloud.updated_at = ts;
    await p.evaluate(() => cloudPull(false));
    await p.waitForTimeout(800);
  };
  // D1: anderes Geraet legt einen Watchlist-Eintrag an und schreibt eine Info-Notiz
  let eRub = -1, notizSoll = 'WAECHTER: zweite Notiz vom anderen Geraet';
  await fremdZiehen(h => {
    const eur = h.syms.find(s => s.id === 'EUR'); eRub = eur.rubrics.findIndex(r => (r.indicators || []).length);
    eur.rubrics[eRub].indicators[0].info = notizSoll;
    const wlc = h.pairCats.find(c => c.name === 'Watchlist') || h.pairCats[0];
    h.pairs.push({ id: 'waechterfremd2', name: 'USD/TRY', bias: 'neu', catId: wlc.id, entry: '', entryTrigger: '', sl: '', tp: '', rr: '', size: '', notes: '', _open: false });
  }, '2026-09-30T14:00:00.000Z');
  const d1 = await p.evaluate(ri => ({ info: syms.find(s => s.id === 'EUR').rubrics[ri].indicators[0].info, da: pairs.some(x => x.id === 'waechterfremd2') }), eRub);
  // D2: anderes Geraet loescht ihn wieder
  await fremdZiehen(h => { h.pairs = h.pairs.filter(x => x.id !== 'waechterfremd2'); }, '2026-09-30T15:00:00.000Z');
  const d2 = await p.evaluate(() => pairs.some(x => x.id === 'waechterfremd2'));
  if (d1.info !== notizSoll) rot(`fremde Aenderung nicht angekommen (Info-Notiz "${d1.info}")`);
  if (!d1.da) rot('fremd angelegter Watchlist-Eintrag nicht angekommen');
  if (d2) rot('fremdes Loeschen eines Watchlist-Eintrags nicht angekommen');
  if (d1.info === notizSoll && d1.da && !d2) gruen('fremder Stand ohne eigene Eingabe: Aenderung, neuer Eintrag und Loeschung kommen an');

  if (perr.length) rot('JS-Fehler: ' + perr.slice(0, 3).join(' | '));
  await b.close();
  const gp = GP_ABGLEICH || GP_MARK || GP_PUSH;
  if (gp) { console.log(fehler ? `\nGegenprobe ok: ${fehler} Befund(e), wie erwartet rot.` : '\nGegenprobe FEHLGESCHLAGEN: Waechter bleibt gruen.'); process.exit(fehler ? 0 : 1); }
  console.log(fehler ? `\n${fehler} Befund(e).` : '\nZurueck-Waechter gruen.');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
