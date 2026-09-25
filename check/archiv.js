// ── LANGE KURSHISTORIE BEI BEDARF + WARTE-PLATZHALTER ──────────────────
//
// Nutzer 2026-09-25: "pack die Daten fuer die grossen Zeitintervalle in eine
// Datei wo dann drauf zugegriffen wird bei Bedarf. Wenn das dann laedt soll
// das Ladesymbol kommen, generell bei Warten als Platzhalter immer das
// animierte Logo so festhalten."
// Geprueft (price_hist*.json kommen hier aus einem Test-Archiv, das aus
// price_data.json nach hinten verlaengert wird - der Waechter haengt also
// nicht davon ab, ob der Workflow schon gelaufen ist):
//   A) beim Start wird price_hist.json NICHT geladen
//   B) 6Y/10Y erscheinen, weil die Meta-Datei weiter zurueckreicht
//   C) 10Y: waehrend des Ladens steht das animierte Logo (lg-loop), danach
//      mehr Kerzen als ohne Archiv, genau ein Abruf
//   D) kein Score aendert sich durch das Archiv (nur Darstellung)
//   E) kein Warte-Satz ohne Logo im Code ("Loading ...</div>" als Text)
//   node check/archiv.js [--gegenprobe]  (Archiv beim Start laden -> rot)
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const ROOT = path.join(__dirname, '..');

// E) statisch
const js = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
const saetze = js.split('\n').filter(l => !/^\s*\/\//.test(l) && /Loading [^'"`]*…<\/div>|>Loading[^<]*<\/div>/.test(l) && !/ladeLogoHtml/.test(l));
saetze.forEach(l => fail('WARTE-SATZ OHNE LOGO', l.trim().slice(0, 120)));

(async () => {
  const pd = JSON.parse(fs.readFileSync(path.join(ROOT, 'price_data.json'), 'utf8'));
  const arch = {}, meta = {};
  Object.keys(pd).forEach(id => { const s = pd[id].series; if (!s || !s.length) return; const erst = Date.parse(s[0][0] + 'T00:00:00Z'); const a = [];
    for (let t = erst - 864e5 * 2600; t < erst; t += 864e5) { const d = new Date(t); if (id !== 'BTC' && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue; a.push([d.toISOString().slice(0, 10), +s[0][1]]); }
    arch[id] = a; meta[id] = a[0][0]; });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(g => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); localStorage.setItem('fxpro_ab_range', '3M'); } catch (e) {}
    if (g) window.addEventListener('load', () => setTimeout(() => { try { window.ladePreisArchiv(); } catch (e) {} }, 0)); }, GEGENPROBE);
  let abrufe = 0;
  await p.route('**/price_hist_meta.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ updated: new Date().toISOString(), assets: meta }) }));
  await p.route('**/price_hist.json*', async r => { abrufe++; await new Promise(x => setTimeout(x, 1500)); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ updated: new Date().toISOString(), assets: arch }) }); });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); gotoSym('EUR'); });
  await p.waitForTimeout(1200);
  if (abrufe) fail('BEIM START GELADEN', `price_hist.json ${abrufe}x abgerufen, ohne dass ein langer Zeitraum gewaehlt war`);
  const regler = await p.evaluate(() => [...document.querySelectorAll('#detail .ab-ptile .ab-rgs .ab-rg')].map(x => x.textContent.trim()));
  if (!regler.includes('10Y') || !regler.includes('6Y')) fail('STUFEN', `6Y/10Y fehlen trotz Archiv: ${regler.join(' ')}`);
  const vorher = await p.evaluate(() => { const o = {}; syms.forEach(s => { o[s.id] = symScoreCmp(s); }); return { o, k: +((document.querySelector('#detail .ab-ptile .ab-pk-s') || {}).textContent || '0').match(/\d+/)[0] }; });
  await p.evaluate(() => setAbChartRange('10Y')); await p.waitForTimeout(300);
  const logo = await p.evaluate(() => !!document.querySelector('#detail .ab-ptile .lade-platz .fxlogo.lg-loop'));
  if (!logo && !GEGENPROBE) fail('KEIN LADE-LOGO', 'waehrend das Archiv laedt, steht kein animiertes Logo in der Price-Karte');
  await p.waitForTimeout(2600);
  const nach = await p.evaluate(() => { const o = {}; syms.forEach(s => { o[s.id] = symScoreCmp(s); }); const t = (document.querySelector('#detail .ab-ptile .ab-pk-s') || {}).textContent || ''; return { o, k: +(t.match(/\d+/) || [0])[0], logo: !!document.querySelector('#detail .ab-ptile .lade-platz') }; });
  if (nach.logo) fail('LOGO BLEIBT', 'nach dem Laden steht noch der Platzhalter');
  if (!(nach.k > vorher.k + 500)) fail('ARCHIV NICHT GEZEICHNET', `${vorher.k} -> ${nach.k} Kerzen`);
  if (abrufe > 1) fail('MEHRFACH GELADEN', `${abrufe} Abrufe`);
  Object.keys(vorher.o).forEach(id => { if (vorher.o[id] !== nach.o[id]) fail('SCORE VERAENDERT', `${id}: ${vorher.o[id]} -> ${nach.o[id]}`); });
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.length) { console.log(`archiv --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('archiv --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`archiv: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`archiv: ok (nicht beim Start geladen, 6Y/10Y da, Lade-Logo waehrend des Abrufs, ${vorher.k} -> ${nach.k} Kerzen, 1 Abruf, ${Object.keys(vorher.o).length} Scores unveraendert)`);
})().catch(e => { console.log('archiv: ABBRUCH ' + e.message); process.exit(1); });
