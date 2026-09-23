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
//   node check/kalender.js [--gegenprobe]   (Blass-Regel per CSS ausgehebelt)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const fs = require('fs'), path = require('path');
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const IND = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ind_data.json'), 'utf8'));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1000, height: 695 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
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
  });
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
    const ist = await p.evaluate(tag => { openAssetCal(tag);
      return [...document.querySelectorAll('#assetCalBody .acm-day .abc-e')].map(e => ({ name: e.querySelector('.abc-e-n').textContent.trim(), vorbei: e.classList.contains('vorbei'),
        werte: [...e.querySelectorAll('.abc-v')].map(v => v.textContent.trim()), op: +getComputedStyle(e).opacity })); }, tagSoll);
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
  perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('VERGANGENER TAG NICHT BLASS'));
    console.log(ok ? 'kalender --gegenprobe: ok (nicht blasse vergangene Tage werden gemeldet)' : 'kalender --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`kalender: ${F.length} Befund(e)\n  ` + F.slice(0, 30).join('\n  ')); process.exit(1); }
  console.log(`kalender: ok (vergangene Tage blass mit Punkt; ${tagSoll}: ${soll[tagSoll].length} Release(s) aus ind_data.json mit Actual/Forecast/Previous im Tagesfenster)`);
})();
