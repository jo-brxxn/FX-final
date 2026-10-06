// ── 3-MONATS-KALENDER: WORKFLOW-SCHRITT + FXSTREET-NAMEN ────────────────
// Nutzer 2026-10-06: "ich will das immer der Kalender schon fuer die
// kommenden 3 Monate geladen wird" (per Rueckfrage: High/Medium +
// Score-Indikatoren) und "bei den Tabellen der Indikatoren wird ja ein
// Countdown … angezeigt … das ist oft falsch … verbinde das mit dem
// Kalender". Gemessen vorher: 13 von 138 Next-Zellen der acht Waehrungen mit
// echtem Termin, 95 mit ~Schaetzung; mit dem 3-Monats-Feed 74 / 34.
//
// Der Schritt "Add upcoming events …" in update-ff-calendar.yml laeuft nur auf
// dem Runner (TradingView/FXStreet sind aus der Sandbox gesperrt). Dieser
// Waechter fuehrt GENAU diesen Schritt (aus der YAML gelesen) gegen
// nachgebaute Quellen aus und prueft:
//   A) FXStreet-Namen -> FF-Schreibweise, die die App-Muster treffen
//      (tools/kalender-vorschau.mjs + js/event-matchers.js, echte Fixtures
//      aus probe-calendar-horizon.yml Lauf 3);
//   B) keine TradingView-Low-Termine (Landes-CPIs, 4-Wochen-Schnitt der
//      Claims haetten falsche Werte in den Score gezogen);
//   C) FXStreet hinter dem TV-Ende, davor nur Lueckenfueller fuer Score-
//      Releases; Projektions-Unterzeilen, vorlaeufige Reden und alles hinter
//      +92 Tagen draussen; alte FXStreet-Termine werden neu entschieden;
//   D) Fenster: TradingView-Abruf >= 30 Tage, FXStreet >= 92, App-Import
//      FF_WINDOW_DAYS >= 90.
//   node check/kalendervorschau.js [--gegenprobe | --gegenprobe-dedup]
//   (--gegenprobe: der TV-Filter laesst Low durch -> B muss rot werden;
//    --gegenprobe-dedup: der am 2026-10-06 gefundene Fehler - FXStreet prueft
//    gegen die Dedup-Menge MIT den alten eigenen Terminen -> der zweite Lauf
//    verliert alles hinter TradingView, C muss rot werden)
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_DEDUP = process.argv.includes('--gegenprobe-dedup');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

// Echte FXStreet-Zeilen (Lauf 37518060066, 2026-10-06) mit dem, was daraus
// werden muss. ind = Indikator, den die App fuer den Termin findet (null =
// bewusst keiner).
const FALL = [
  ['US','USD','Consumer Price Index (YoY)','CPI y/y','CPI (Headline)'],
  ['US','USD','Consumer Price Index ex Food & Energy (MoM)','Core CPI m/m','Core CPI'],
  ['US','USD','Nonfarm Payrolls','Non-Farm Employment Change','NFP / Employment Change'],
  ['US','USD','Fed Interest Rate Decision','Fed Interest Rate Decision','Central Bank Rate'],
  ['US','USD','Core Personal Consumption Expenditures - Price Index (MoM)','Core PCE Price Index m/m','Core PCE'],
  ['US','USD','Producer Price Index ex Food & Energy (YoY)','Core PPI y/y','Core PPI'],
  ['US','USD','Gross Domestic Product Annualized','GDP q/q','GDP Growth QoQ'],
  ['US','USD','ISM Manufacturing PMI','ISM Manufacturing PMI','Manufacturing PMI'],
  ['US','USD','Michigan Consumer Sentiment Index','UoM Consumer Sentiment','Consumer Confidence'],
  ['US','USD','ADP Employment Change','ADP Non-Farm Employment Change','ADP Employment'],
  ['EMU','EUR','Harmonized Index of Consumer Prices (YoY)','CPI y/y','CPI (Headline)'],
  ['EMU','EUR','Core Harmonized Index of Consumer Prices (YoY)','Core CPI y/y','Core CPI'],
  ['EMU','EUR','HCOB Manufacturing PMI','HCOB Manufacturing PMI','Manufacturing PMI'],
  ['EMU','EUR','ECB Main Refinancing Operations Rate','Main Refinancing Rate','Central Bank Rate'],
  ['EMU','EUR','Gross Domestic Product s.a. (QoQ)','GDP q/q','GDP Growth QoQ'],
  ['DE','EUR','HCOB Manufacturing PMI','German HCOB Manufacturing PMI',null],
  ['DE','EUR','Harmonized Index of Consumer Prices (YoY)','German HICP y/y',null],
  ['UK','GBP','BoE MPC Vote Rate Unchanged','MPC Official Bank Rate Votes','Central Bank Rate'],
  ['UK','GBP','ILO Unemployment Rate (3M)','Unemployment Rate','Unemployment Rate'],
  ['UK','GBP','Claimant Count Change','Claimant Count Change','Unemployment Claims'],
  ['CA','CAD','Net Change in Employment','Employment Change','NFP / Employment Change'],
  ['AU','AUD','Employment Change s.a.','Employment Change','NFP / Employment Change'],
  ['JP','JPY','Tokyo Consumer Price Index (YoY)','Tokyo CPI y/y',null],
  ['NZ','NZD','RBNZ Interest Rate Decision','RBNZ Interest Rate Decision','Central Bank Rate'],
  ['CH','CHF','SNB Interest Rate Decision','SNB Interest Rate Decision','Central Bank Rate'],
];

function schrittAusYaml() {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/update-ff-calendar.yml'), 'utf8');
  const i = y.indexOf('- name: Add upcoming events from TradingView');
  if (i < 0) return { fehlt: 'Schritt "Add upcoming events from TradingView" nicht gefunden', y };
  const k = y.indexOf("node --input-type=module -e '", i);
  if (k < 0) return { fehlt: 'Schritt laeuft nicht als ES-Modul (node --input-type=module -e)', y };
  const start = k + "node --input-type=module -e '".length;
  const ende = y.indexOf("\n          '", start);
  return { skript: y.slice(start, ende).replace(/^ {12}/gm, ''), y };
}

function lauf(skript, dateien) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalvorschau-'));
  fs.symlinkSync(path.join(ROOT, 'tools'), path.join(dir, 'tools'));
  fs.symlinkSync(path.join(ROOT, 'js'), path.join(dir, 'js'));
  Object.entries(dateien).forEach(([n, d]) => fs.writeFileSync(path.join(dir, n), JSON.stringify(d)));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', skript], { cwd: dir, encoding: 'utf8' });
  let out = null; try { out = JSON.parse(fs.readFileSync(path.join(dir, 'ff_calendar.json'), 'utf8')); } catch (e) {}
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, log: (r.stdout || '') + (r.stderr || ''), out };
}

(async () => {
  const K = await import(pathToFileURL(path.join(ROOT, 'tools/kalender-vorschau.mjs')).href);
  // ── A) Namen ──
  FALL.forEach(([cc, ccy, name, soll, ind]) => {
    const e = { name, countryCode: cc, currencyCode: ccy, volatility: 'HIGH' };
    const ist = K.fxsTitel(e);
    if (ist !== soll) { fail('NAME', `${cc} "${name}" -> "${ist}", erwartet "${soll}"`); return; }
    const hits = K.indikatorTreffer(ist, ccy);
    if (ind && !hits.includes(ind)) fail('INDIKATOR', `${ccy} "${ist}" trifft ${hits.join(',') || 'nichts'}, erwartet ${ind}`);
    if (!ind && hits.length) fail('FALSCHER INDIKATOR', `${ccy} "${ist}" trifft ${hits.join(',')} - nationale/abgeleitete Reihe darf keinen Score-Indikator treffen`);
    if (!K.fxsAufnehmen(e)) fail('NICHT AUFGENOMMEN', `${cc} "${name}"`);
  });
  if (K.fxsAufnehmen({ name: 'Interest Rate Projections - Current', countryCode: 'US', currencyCode: 'USD', volatility: 'HIGH' })) fail('PROJEKTION', 'FOMC-Unterzeile aufgenommen');
  if (K.fxsAufnehmen({ name: "RBNZ's Breman speech", countryCode: 'NZ', currencyCode: 'NZD', volatility: 'HIGH', isTentative: true, isSpeech: true })) fail('VORLAEUFIG', 'vorlaeufige Rede aufgenommen');
  if (!K.fxsAufnehmen({ name: 'BoJ Interest Rate Decision', countryCode: 'JP', currencyCode: 'JPY', volatility: 'HIGH', isTentative: true })) fail('BOJ', 'BoJ-Entscheid (Uhrzeit vorlaeufig, Datum fest) fehlt');
  ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF'].forEach(c => {
    const name = { USD: 'Fed', EUR: null, GBP: 'BoE', JPY: 'BoJ', CAD: 'BoC', AUD: 'RBA', NZD: 'RBNZ', CHF: 'SNB' }[c];
    if (name && !K.indikatorTreffer(K.fxsTitel({ name: name + ' Interest Rate Decision', countryCode: 'X', currencyCode: c }), c).includes('Central Bank Rate')) fail('ZINSENTSCHEID', c);
  });

  // ── D) Fenster ──
  const s = schrittAusYaml();
  const tvTo = (s.y.match(/TV_TO=\$\(node -e 'console\.log\(new Date\(Date\.now\(\)\+(\d+)\*86400e3\)/) || [])[1];
  const fxTo = (s.y.match(/FX_TO=\$\(node -e 'console\.log\(new Date\(Date\.now\(\)\+(\d+)\*86400e3\)/) || [])[1];
  if (!(+tvTo >= 30)) fail('TV-FENSTER', `TradingView-Abruf bis +${tvTo} Tage (TradingView liefert ~30)`);
  if (!(+fxTo >= 92)) fail('FXSTREET-FENSTER', `FXStreet-Abruf bis +${fxTo} Tage (verlangt 3 Monate)`);
  const win = (fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/const FF_WINDOW_DAYS=(\d+);/) || [])[1];
  if (!(+win >= 90)) fail('APP-FENSTER', `FF_WINDOW_DAYS=${win} - die App importiert dann keine 3 Monate`);

  // ── B) + C) Schritt gegen nachgebaute Quellen ──
  let skript = s.skript;
  if (s.fehlt) fail('SCHRITT', s.fehlt);
  else {
    if (GEGENPROBE) skript = skript.replace('if(!impact)return;', '');
    if (GP_DEDUP) skript = skript.replace('if(haveFx.has(key))return;', 'if(have.has(key))return;');
    const T = Date.now(), D = 864e5;
    const at = (tage, h) => { const d = new Date(T + tage * D); d.setUTCHours(h, 30, 0, 0); return d.toISOString(); };
    const tv = { status: 'ok', result: [
      { country: 'US', title: 'Initial Jobless Claims', date: at(2, 12), importance: 0 },
      { country: 'US', title: 'Jobless Claims 4-week Average', date: at(2, 12), importance: -1 },
      { country: 'DE', title: 'Bavaria CPI YoY', date: at(5, 8), importance: -1 },
      { country: 'US', title: 'PPI MoM', date: at(9, 12), importance: 1 },
      { country: 'US', title: 'Core PPI MoM', date: at(9, 12), importance: 0 },
      { country: 'GB', title: 'Claimant Count Change', date: at(14, 6), importance: -1 },
      { country: 'US', title: 'Building Permits', date: at(30, 12), importance: 0 },
    ] };
    const fx = (cc, ccy, name, tage, h, x) => Object.assign({ countryCode: cc, currencyCode: ccy, name, volatility: 'HIGH', dateUtc: at(tage, h).replace('.000', '') }, x || {});
    const fxs = [
      fx('US', 'USD', 'Producer Price Index ex Food & Energy (YoY)', 9, 12),
      fx('UK', 'GBP', 'Claimant Count Change', 14, 6),
      fx('US', 'USD', 'Nonfarm Payrolls', 40, 12),
      fx('US', 'USD', 'Interest Rate Projections - Current', 45, 18),
      fx('JP', 'JPY', 'BoJ Interest Rate Decision', 50, 3, { isTentative: true }),
      fx('NZ', 'NZD', "RBNZ's Breman speech", 50, 8, { isTentative: true, isSpeech: true }),
      fx('EMU', 'EUR', 'Harmonized Index of Consumer Prices (YoY)', 60, 9),
      fx('DE', 'EUR', 'Harmonized Index of Consumer Prices (YoY)', 60, 12),
      fx('US', 'USD', 'Fed Interest Rate Decision', 100, 18),
    ];
    const alt = [
      { title: 'CPI y/y', country: 'USD', date: at(70, 12), impact: 'High', forecast: '', previous: '', actual: '', src: 'fxs' },
      { title: 'GDP q/q', country: 'USD', date: at(10, 12), impact: 'High', forecast: '', previous: '', actual: '', src: 'fxs' },
    ];
    const r = lauf(skript, { 'ff_calendar.json': alt, 'tv.json': tv, 'fxs_ahead.json': fxs });
    if (r.code !== 0 || !Array.isArray(r.out)) fail('SCHRITT ABGEBROCHEN', `Exit ${r.code}: ${r.log.slice(0, 400)}`);
    else {
      const o = r.out, hat = (t, c) => o.filter(e => e.title === t && (!c || e.country === c));
      // B)
      ['Jobless Claims 4-week Average', 'German Bavaria CPI YoY'].forEach(t => { if (hat(t).length) fail('TV-LOW AUFGENOMMEN', `"${t}" - Low-Termin, haette den Score-Wert verfaelscht`); });
      // C)
      if (hat('Claimant Count Change', 'GBP').length !== 1) fail('LUECKE', `GBP Claimant Count Change ${hat('Claimant Count Change', 'GBP').length}x (TV nur Low, FXStreet High -> genau 1x)`);
      if (hat('Core PPI y/y', 'USD').length) fail('DOPPELT', 'Core PPI y/y aufgenommen, obwohl TV denselben Release (Core PPI MoM) fuehrt');
      const nfp = hat('Non-Farm Employment Change', 'USD');
      if (nfp.length !== 1 || nfp[0].src !== 'fxs') fail('HINTER TV', `NFP +40d ${nfp.length}x`);
      if (o.some(e => /Interest Rate Projections/.test(e.title))) fail('PROJEKTION', 'FOMC-Unterzeile im Kalender');
      if (!hat('BoJ Interest Rate Decision', 'JPY').length) fail('BOJ', 'BoJ-Entscheid fehlt');
      if (o.some(e => /Breman/.test(e.title))) fail('VORLAEUFIG', 'vorlaeufige Rede im Kalender');
      if (!hat('CPI y/y', 'EUR').length || !hat('German HICP y/y', 'EUR').length) fail('EUR-NAMEN', 'Eurozonen-CPI und deutscher HICP muessen getrennt ankommen');
      if (o.some(e => Date.parse(e.date) > T + 92 * D + 3600e3)) fail('ZU WEIT', 'Termin hinter +92 Tagen');
      if (hat('CPI y/y', 'USD').length) fail('ALT BEHALTEN', 'FXStreet-Termin des letzten Laufs, den FXStreet nicht mehr fuehrt, steht noch drin');
      if (hat('GDP q/q', 'USD').length) fail('ALT IM FENSTER', 'alter FXStreet-Termin im TV-Fenster ohne Luecke steht noch drin');
      const k = new Map(); o.forEach(e => { const x = e.country + '|' + e.title + '|' + String(e.date).slice(0, 10); k.set(x, (k.get(x) || 0) + 1); });
      [...k].filter(([, n]) => n > 1).forEach(([x, n]) => fail('DUPLIKAT', `${x} ${n}x`));
      for (let i = 1; i < o.length; i++) if (new Date(o[i].date) < new Date(o[i - 1].date)) { fail('SORTIERUNG', `${o[i - 1].date} vor ${o[i].date}`); break; }
      // FXStreet faellt aus: die eigenen Termine bleiben, neu entschieden.
      const r2 = lauf(skript, { 'ff_calendar.json': o, 'tv.json': tv });
      if (r2.code !== 0 || !Array.isArray(r2.out)) fail('AUSFALL ABGEBROCHEN', `Exit ${r2.code}: ${r2.log.slice(0, 300)}`);
      else {
        if (!r2.out.some(e => e.title === 'Non-Farm Employment Change' && e.src === 'fxs')) fail('AUSFALL', 'FXStreet weg -> Termine hinter TV verschwunden');
        if (r2.out.filter(e => e.title === 'Claimant Count Change' && e.country === 'GBP').length !== 1) fail('AUSFALL LUECKE', 'Lueckenfueller nach FXStreet-Ausfall nicht genau 1x');
      }
    }
  }

  if (GP_DEDUP) {
    const ok = F.some(x => x.startsWith('AUSFALL'));
    console.log(ok ? 'kalendervorschau --gegenprobe-dedup: ok (verlorene FXStreet-Termine im zweiten Lauf werden gemeldet)' : 'kalendervorschau --gegenprobe-dedup: FEHLER - nicht gemeldet\n  ' + F.join('\n  '));
    process.exit(ok ? 0 : 1);
  }
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('TV-LOW AUFGENOMMEN'));
    console.log(ok ? 'kalendervorschau --gegenprobe: ok (Low-Termine aus TradingView werden gemeldet)' : 'kalendervorschau --gegenprobe: FEHLER - nicht gemeldet\n  ' + F.join('\n  '));
    process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`kalendervorschau: ${F.length} Befund(e)\n  ` + F.join('\n  ')); process.exit(1); }
  console.log(`kalendervorschau: ok (${FALL.length} FXStreet-Namen auf FF-Schreibweise und Indikator, TV-Low draussen, FXStreet hinter TV + Lueckenfueller, Ausfall haelt, Fenster TV +${tvTo}/FXStreet +${fxTo}/App ${win} Tage)`);
})().catch(e => { console.log('kalendervorschau: ABBRUCH ' + e.message); process.exit(1); });
