// ── KALENDER-KARTE DER ASSET-SEITE: VERGANGENE TAGE ────────────────────
//
// Nutzer 2026-09-23: "bei der Kalender Karte ich will das sobald ein Tag
// vorbei ist er grau wird und blass wie es aktuell ist aber es soll trotzdem
// ein roter Punkt dort bleiben und die Eintraege stehen dann da einfach mit
// actual Wert nur alles halt blasser" - per Rueckfrage: aeltere Tage "Aus
// Indikator-Historie" rekonstruieren. Der Kalender-Feed kennt nur ~3 Tage
// zurueck; vorher waren alle Tage davor blass OHNE Punkt ("Not published
// yet" - fuer die Vergangenheit falsch).
// Geprueft (USD, laufender Monat):
//   A) jeder vergangene Tag traegt "vorbei", seine Zahl ist blass (<= .5),
//      ein Punkt daran bleibt in voller Deckkraft;
//   B) ein Tag VOR dem Feed-Beginn mit einer Veroeffentlichung aus
//      ind_data.json hat einen Punkt und im Fenster Eintraege, deren Actual/
//      Forecast/Previous exakt der historyFull entsprechen, blass (.vorbei);
//   C) nur Indikatoren mit Kalender-Zuordnung (keine geratene Wichtigkeit).
//   E) Nutzer 2026-10-06: "alle zukuenftigen Datum Zahlen so geschrieben sind
//      nicht blass" + "mach die Zahlen im Kalender groesser": jeder kommende
//      Tag (laufender UND Folgemonat, Wochenende eingeschlossen) in voller
//      Deckkraft, einheitlicher Farbe, 15px und mindestens 600.
//   F) Next-Countdown sucht den richtigen Termin (2026-10-06 gemessen falsch):
//      EUR ohne nationale Vorab-Zahlen (Ifo ausgenommen), m/m und y/y als
//      derselbe Termin, q/q nicht.
//   node check/kalender.js [--gegenprobe | --gegenprobe-zukunft | --gegenprobe-termin]
//   (Blass-Regel per CSS ausgehebelt | alte CSS der Zukunftstage | alte
//    Termin-Suche ohne die beiden Regeln)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const fs = require('fs'), path = require('path');
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_ZUKUNFT = process.argv.includes('--gegenprobe-zukunft');
const GP_TERMIN = process.argv.includes('--gegenprobe-termin');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const IND = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ind_data.json'), 'utf8'));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1000, height: 695 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  // ⚠ Seit 2026-09-27 fuellt das Kalender-Archiv (cal_hist/) die Tage vor dem
  // Live-Feed, die Rekonstruktion aus der Historie tritt dahinter zurueck -
  // B/C pruefen aber genau DIE (das Archiv prueft check/calpast.js). Ohne
  // Archiv laeuft hier also der Historien-Pfad allein, wie er gemeint ist.
  // (Bis 2026-09-30 gruen, weil das Archiv im Pruef-Fenster oft noch nicht da war.)
  await p.route(/cal_hist\//, r => r.fulfill({ status: 404, body: '' }));
  await p.goto(URL); await wartenBisDatenDa(p);
  const r = await p.evaluate(gp => {
    ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (gp) { const st = document.createElement('style'); st.textContent = '.abc-d .abc-n{opacity:1!important}'; document.head.appendChild(st); }
    gotoSym('USD');
    const heute = todayStr();
    const karte = document.querySelector('#detail .abc-cal');
    const tage = [...karte.querySelectorAll('.abc-d:not(.leer)')].map(d => {
      const n = +d.querySelector('.abc-n').textContent, dot = d.querySelector('.abc-dot');
      return { n, vorbei: d.classList.contains('vorbei'), heute: d.classList.contains('heute'), op: +getComputedStyle(d.querySelector('.abc-n')).opacity, dotOp: dot ? +getComputedStyle(dot).opacity : null };
    });
    const monat = heute.slice(0, 8);
    const fe = getSymEventsAll('USD');
    return { heute, monat, tage, feedStart: fe.length ? fe[0].date : null };
  }, GEGENPROBE);
  const tagHeute = +r.heute.slice(8, 10);
  // A)
  r.tage.forEach(t => {
    if (t.n < tagHeute) {
      if (!t.vorbei) fail('VERGANGENER TAG NICHT MARKIERT', `${r.monat}${String(t.n).padStart(2, '0')} ohne "vorbei"`);
      else if (t.op > 0.5) fail('VERGANGENER TAG NICHT BLASS', `${r.monat}${String(t.n).padStart(2, '0')}: Zahl Deckkraft ${t.op} (verlangt <= .5)`);
      if (t.dotOp !== null && t.dotOp < 0.99) fail('PUNKT NICHT VOLL', `${r.monat}${String(t.n).padStart(2, '0')}: Punkt Deckkraft ${t.dotOp} - der Punkt soll bleiben`);
    } else if (t.vorbei) fail('ZUKUNFT ALS VORBEI', `Tag ${t.n} ist nicht vergangen`);
    else if (t.n > tagHeute && t.op < 0.99) fail('ZUKUNFT BLASS', `${r.monat}${String(t.n).padStart(2, '0')}: Zahl Deckkraft ${t.op} (kommende Tage voll)`);
  });
  // E) Folgemonat: lauter kommende Tage - Wochenende und "noch nicht im Feed"
  //    eingeschlossen (am Monatsende hat der laufende Monat kaum noch welche).
  const folge = await p.evaluate(gp => {
    if (gp) { const st = document.createElement('style'); st.textContent = '.abc-d.unbekannt .abc-n{opacity:.38}.abc-d.we .abc-n{color:var(--t3)}'; document.head.appendChild(st); }
    abCalShift(1);
    const tage = [...document.querySelectorAll('#detail .abc-cal .abc-d:not(.leer)')].map(d => { const z = d.querySelector('.abc-n'), cs = getComputedStyle(z);
      return { n: +z.textContent, we: d.classList.contains('we'), vorbei: d.classList.contains('vorbei'), op: +cs.opacity, col: cs.color, fs: cs.fontSize, fw: +cs.fontWeight }; });
    abCalShift(-1);
    return tage;
  }, GP_ZUKUNFT);
  if (!folge.length) fail('FOLGEMONAT', 'kein Tag im Raster nach ›');
  const farben = [...new Set(folge.map(t => t.col))];
  folge.forEach(t => {
    if (t.vorbei) fail('ZUKUNFT ALS VORBEI', `Folgemonat Tag ${t.n}`);
    if (t.op < 0.99) fail('ZUKUNFT BLASS', `Folgemonat Tag ${t.n}${t.we ? ' (Wochenende)' : ''}: Deckkraft ${t.op}`);
    if (t.fs !== '15px' || t.fw < 600) fail('ZAHL ZU KLEIN', `Folgemonat Tag ${t.n}: ${t.fs}/${t.fw} (verlangt 15px, >= 600)`);
  });
  if (farben.length > 1) fail('ZUKUNFT UNGLEICH', `kommende Tage in ${farben.length} Farben (${farben.join(' / ')}) - Wochenende grau?`);
  // B) + C): Soll aus ind_data.json - letzter Release-Tag vor dem Feed-Beginn
  //    (monatsunabhaengig, sonst waere der Waechter am Monatsanfang grundlos rot)
  const matcher = await p.evaluate(() => Object.keys(CAL_RESEARCH_MATCHERS));
  const soll = {};
  Object.entries(IND.USD || {}).forEach(([base, e]) => {
    if (!matcher.includes(base) || !e || !Array.isArray(e.historyFull)) return;
    let vorher = '';
    e.historyFull.forEach(h => { const d = String(h[0]).slice(0, 10), a = h[1] != null ? String(h[1]) : '';
      if (a && d < r.heute && (!r.feedStart || d < r.feedStart)) (soll[d] = soll[d] || []).push({ base, a, f: h[2] != null ? String(h[2]) : '', p: vorher });
      if (a) vorher = a; });
  });
  const tagSoll = Object.keys(soll).sort().pop();
  if (!tagSoll) fail('KEIN PRUEFTAG', `kein Release vor dem Feed-Beginn ${r.feedStart} in ind_data.json`);
  else {
    const t = r.tage.find(x => x.n === +tagSoll.slice(8, 10));
    if (tagSoll.startsWith(r.monat) && (!t || t.dotOp === null)) fail('PUNKT FEHLT', `${tagSoll}: ${soll[tagSoll].length} Release(s) in ind_data.json, aber kein Punkt im Raster`);
    // ⚠ Zum Monat des Prueftags blaettern (wie ein Nutzer mit ‹/›): das Fenster
    // zeigt den Tag nur im angezeigten Monat. Am Monatsanfang liegt der
    // Prueftag im Vormonat - ohne Blaettern zeigte es einen Oktober-Tag.
    const ist = await p.evaluate(tag => {
      const d0 = new Date(tag + 'T12:00:00'), jetzt = new Date();
      const versatz = (d0.getFullYear() - jetzt.getFullYear()) * 12 + d0.getMonth() - jetzt.getMonth();
      abCalShift(versatz); openAssetCal(tag);
      const out = [...document.querySelectorAll('#assetCalBody .acm-day .abc-e')].map(e => ({ name: e.querySelector('.abc-e-n').textContent.trim(), vorbei: e.classList.contains('vorbei'),
        werte: [...e.querySelectorAll('.abc-v')].map(v => v.textContent.trim()), op: +getComputedStyle(e).opacity }));
      closeAssetCal(); abCalShift(-versatz);
      return out; }, tagSoll);
    soll[tagSoll].forEach(s => {
      const e = ist.find(x => x.name === s.base);
      if (!e) { fail('EINTRAG FEHLT', `${tagSoll}: ${s.base} (Actual ${s.a}) steht nicht im Tagesfenster`); return; }
      const w = [s.a, s.f || '–', s.p || '–'];
      if (JSON.stringify(e.werte) !== JSON.stringify(w)) fail('WERT FALSCH', `${tagSoll} ${s.base}: angezeigt ${e.werte.join(' / ')}, ind_data.json ${w.join(' / ')}`);
      if (!e.vorbei || e.op > 0.8) fail('EINTRAG NICHT BLASS', `${tagSoll} ${s.base}: vorbei=${e.vorbei}, Deckkraft ${e.op}`);
    });
    const fremd = ist.filter(e => !soll[tagSoll].some(s => s.base === e.name));
    if (fremd.length) fail('UNBELEGTER EINTRAG', `${tagSoll}: ${fremd.map(e => e.name).join(', ')} - nicht aus der Historie mit Kalender-Zuordnung (Regel 4)`);
  }
  // F) Termin-Suche gegen nachgebaute Kalender-Termine (eigene, kurzzeitige
  //    calEvts - der echte Feed bleibt unberuehrt und wird danach zurueckgesetzt).
  const termin = await p.evaluate(gp => {
    const tag = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    // Vorzustand der Suche (bis 2026-10-06): strenge Periode, nationale Zahlen mit drin.
    const alt = (symId, indName) => { const { base, period } = stripPeriodSuffix(indName || ''); const m = IND_EVENT_MATCHERS[base]; const ccy = macroCcyFor(symId); let best = null;
      calEvts.forEach(ev => { if (ev.actual || ev.date < todayStr() || !String(ev.currencies || '').toUpperCase().split(/[,/&\s]+/).includes(ccy) || !m(ev.name, ccy)) return; if (period) { const evp = periodLabel(ev.name); if (evp && evp !== period) return; } if (!best || ev.date < best.date) best = ev; }); return best; };
    const such = gp ? alt : window.findIndNextEvent;
    const e = (name, n, ccy) => ({ id: 'kt' + name + n, name, date: tag(n), time: '10:00', currencies: ccy, impact: 'high', actual: '', forecast: '', previous: '', notes: '' });
    const vorher = calEvts;
    calEvts = [e('French Inflation Rate YoY Prel', 3, 'EUR'), e('Inflation Rate YoY Flash', 7, 'EUR'), e('Core PPI MoM', 4, 'USD'), e('Core PPI y/y', 30, 'USD'),
      e('CPI q/q', 2, 'AUD'), e('CPI y/y', 10, 'AUD'), e('German Ifo Business Climate', 5, 'EUR')];
    const f = (s, i) => { const x = such(s, i); return x ? x.date : null; };
    const out = [['EUR', 'CPI (Headline) y/y', tag(7), 'Eurozonen-Flash statt franzoesischer Vorab-Zahl'], ['USD', 'Core PPI y/y', tag(4), 'm/m-Zeile desselben Releases'],
      ['AUD', 'CPI (Headline) y/y', tag(10), 'Quartals-CPI (q/q) ist ein anderer Termin'], ['EUR', 'Ifo Business Climate', tag(5), 'Ifo gibt es nur deutsch']].map(([s, i, soll, warum]) => ({ s, i, soll, ist: f(s, i), warum }));
    calEvts = vorher;
    return out;
  }, GP_TERMIN);
  termin.forEach(t => { if (t.ist !== t.soll) fail('TERMIN FALSCH', `${t.s} ${t.i}: ${t.ist} statt ${t.soll} (${t.warum})`); });
  perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GP_ZUKUNFT || GP_TERMIN) {
    const ok = F.some(x => x.startsWith(GP_ZUKUNFT ? 'ZUKUNFT' : 'TERMIN FALSCH'));
    console.log(ok ? `kalender ${GP_ZUKUNFT ? '--gegenprobe-zukunft: ok (blasse/graue kommende Tage werden gemeldet)' : '--gegenprobe-termin: ok (alte Termin-Suche wird gemeldet)'}` : 'kalender Gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('VERGANGENER TAG NICHT BLASS'));
    console.log(ok ? 'kalender --gegenprobe: ok (nicht blasse vergangene Tage werden gemeldet)' : 'kalender --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`kalender: ${F.length} Befund(e)\n  ` + F.slice(0, 30).join('\n  ')); process.exit(1); }
  console.log(`kalender: ok (vergangene Tage blass mit Punkt, kommende voll in 15px; ${tagSoll}: ${soll[tagSoll].length} Release(s) aus ind_data.json mit Actual/Forecast/Previous im Tagesfenster; ${termin.length} Termin-Regeln)`);
})();
