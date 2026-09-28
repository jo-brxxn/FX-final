// ── PAST RELEASES: LISTE DER VERGANGENEN TERMINE JE ASSET ─────────────────
//
// Nutzer 2026-09-27: "Ich will noch irgendwo bei Assets haben eine Liste die
// die vergangenen 2 Wochen abspiegelt mit allen events die fuer das Asset
// passiert sind mit dem actual also so aufgebaut wie der Kalender" - per
// Rueckfrage in Kalender-Karte UND -Fenster, Zeitfilter bis 10 Jahre,
// High + Medium.
// Das Archiv (cal_hist/) wird hier nachgestellt (page.route), damit der
// Waechter nicht vom Stand des Datenjobs abhaengt.
// Geprueft (USD):
//   A) Karte: "Past" zeigt die Liste, juengster Tag zuoberst, jede Zeile
//      vergangen, keine Low-Zeile, bei "High-impact only" nur High;
//   B) pro Tag genau EINE Quelle: an einem Tag, den der Live-Kalender kennt,
//      steht keine Archivzeile (sonst Doppelzeilen aus zwei Schreibweisen);
//   C) Zeitfilter nur so weit, wie das Archiv reicht (meta.von), und ein
//      Klick darauf erweitert die Liste bis zum Stichtag;
//   D) "Show older" zeichnet weitere Zeilen, das Fenster zeigt dieselbe Sicht;
//   E) Monat bleibt Standard, der Umschalter bringt das Raster zurueck.
//   node check/calpast.js [--gegenprobe]   (Ein-Quelle-pro-Tag-Regel aus)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

const TAG = 864e5;
function archivJahr(y, liveTag) {
  const ev = [];
  const ende = Math.min(Date.parse((y + 1) + '-01-01'), Date.now() - TAG);
  for (let t = Date.parse(y + '-01-01'); t < ende; t += TAG) {
    const d = new Date(t); if (d.getUTCDay() % 6 === 0) continue;
    const iso = h => new Date(t + h * 36e5).toISOString().slice(0, 16) + 'Z';
    ev.push([iso(12.5), 'USD', 'Archive Retail Sales MoM', 0, '0.4%', '0.2%', '0.1%']);
    ev.push([iso(14), 'USD', 'Archive ISM Manufacturing PMI', 1, '49.1', '50.2', '49.8']);
    ev.push([iso(15), 'USD', 'Archive Low Thing', -1, '1', '1', '1']);
    ev.push([iso(16), 'USD', 'Archive Redbook YoY', 0, '5.1%', '', '4.9%']);
    ev.push([iso(13), 'EUR', 'Archive German Inflation Rate YoY', 1, '2.1%', '2.3%', '2.2%']);
  }
  // Eine Archivzeile an einem Tag, den der Live-Kalender schon kennt.
  if (liveTag && liveTag.startsWith(String(y))) ev.push([liveTag + 'T11:00Z', 'USD', 'Archive Duplicate Of Live Day', 1, '1', '2', '3']);
  return { y, ev };
}

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); localStorage.setItem('fxpro_cal_highonly', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  const liveTag = await p.evaluate(gp => {
    ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (gp) window.__calpOhneTagesregel = true;
    // Eigener vergangener Live-Termin statt des Feed-Stands: ff_calendar.json
    // beginnt sonntags mit der neuen FF-Woche und kennt dann KEINEN
    // vergangenen Tag (am 2026-09-27 so rot gelaufen).
    const tag = dateAddStr(todayStr(), -3);
    calEvts.push({ id: 'calpast-test', name: 'Live Test Release', date: tag, time: '14:30', currencies: 'USD', impact: 'high', actual: '1', forecast: '2', previous: '3', notes: '', src: 'ff' });
    return tag;
  }, GEGENPROBE);
    const VON = new Date(Date.now() - 400 * TAG).toISOString().slice(0, 10);
  await p.route('**/cal_hist/meta.json*', r => r.fulfill({ json: { von: VON, jahre: [+VON.slice(0, 4), new Date().getFullYear()].filter((x, i, a) => a.indexOf(x) === i) } }));
  await p.route(/cal_hist\/\d{4}\.json/, r => r.fulfill({ json: archivJahr(+r.request().url().match(/(\d{4})\.json/)[1], liveTag) }));
  await p.evaluate(() => gotoSym('USD'));
  await p.waitForTimeout(400);

  // E) Standard ist der Monat.
  const start = await p.evaluate(() => ({ grid: !!document.querySelector('#detail .abc-cal .abc-grid'), sw: [...document.querySelectorAll('#detail .abc-cal .calp-sw button')].map(x => x.textContent) }));
  if (!start.grid) fail('E', 'die Kalender-Karte startet nicht im Monatsraster');
  if (start.sw.join('|') !== 'Month|Past') fail('E', `Umschalter fehlt oder falsch beschriftet (${start.sw.join('|')})`);

  await p.click('#detail .abc-cal .calp-sw button:nth-child(2)');
  await p.waitForFunction(() => !document.querySelector('#detail .abc-cal .lade-platz'), null, { timeout: 15000 }).catch(() => fail('A', 'das Archiv laedt nicht fertig'));
  const lesen = () => p.evaluate(() => {
    const k = document.querySelector('#detail .abc-cal');
    const tage = [...k.querySelectorAll('.cal-day-hdr')].map(h => h.textContent);
    const zeilen = [...k.querySelectorAll('.cal-row')].map(r => r.querySelector('.cal-evname').textContent);
    const rg = [...k.querySelectorAll('.chart-leiste-r button')].map(x => x.textContent);
    return { tage, zeilen, rg, grid: !!k.querySelector('.abc-grid'), titel: (k.querySelector('.abc-mon') || {}).textContent };
  });
  const a = await lesen();
  // A)
  if (a.grid) fail('A', '"Past" zeigt weiter das Monatsraster');
  if (a.titel !== 'PAST RELEASES') fail('A', `Kartentitel "${a.titel}" statt PAST RELEASES`);
  if (!a.zeilen.some(z => /^Archive /.test(z))) fail('A', 'keine Archivzeile in der 2W-Liste');
  if (a.zeilen.some(z => /Low Thing/.test(z))) fail('A', 'eine Low-Impact-Zeile steht in der Liste');
  if (a.zeilen.some(z => /German Inflation/.test(z))) fail('A', 'eine EUR-Zeile steht in der USD-Liste');
  const reihenfolge = await p.evaluate(() => {
    const k = document.querySelector('#detail .abc-cal');
    // Tage aus den Zeilen-Events: calpDaten liefert die Reihenfolge der Anzeige.
    const d = calpDaten('USD').evts.map(e => e.date);
    const heute = todayStr();
    return { absteigend: d.every((x, i) => i === 0 || d[i - 1] >= x), zukunft: calpDaten('USD').evts.filter(e => !isEvtPast(e)).length, n: d.length, erster: d[0], heute };
  });
  if (!reihenfolge.absteigend) fail('A', 'die Tage stehen nicht mit dem juengsten zuoberst');
  if (reihenfolge.zukunft) fail('A', `${reihenfolge.zukunft} Termin(e) aus der Zukunft in der Liste`);
  // B)
  const doppel = await p.evaluate(tag => calpDaten('USD').evts.filter(e => e.date === tag).map(e => e.name), liveTag);
  if (!doppel.includes('Live Test Release')) fail('B', `der Live-Termin am ${liveTag} fehlt in der Liste`);
  if (doppel.some(n => /Duplicate Of Live Day/.test(n))) fail('B', `am Live-Tag ${liveTag} steht zusaetzlich eine Archivzeile (Doppelquelle)`);
  // A) High-only
  const nurHigh = await p.evaluate(() => { const alt = calHighOnly; setCalHighOnlyVal(true); const r = calpDaten('USD').evts.filter(e => evtImpact(e) !== 'high').length; setCalHighOnlyVal(alt); return r; });
  if (nurHigh) fail('A', `"High-impact only" laesst ${nurHigh} Nicht-High-Zeile(n) durch`);
  // C) Zeitfilter bis zur Archivtiefe (~400 Tage: bis 1Y, kein 5Y/10Y)
  if (a.rg.join('|') !== '2W|1M|3M|6M|1Y') fail('C', `Zeitfilter ${a.rg.join('|')} statt 2W|1M|3M|6M|1Y bei ~400 Tagen Archiv`);
  await p.click('#detail .abc-cal .chart-leiste-r button:last-child');
  await p.waitForFunction(() => !document.querySelector('#detail .abc-cal .lade-platz'), null, { timeout: 15000 }).catch(() => {});
  const c1 = await p.evaluate(() => { const d = calpDaten('USD').evts.map(e => e.date); return { n: d.length, aeltester: d[d.length - 1], stich: dateAddStr(todayStr(), -365) }; });
  if (!(c1.n > reihenfolge.n)) fail('C', `1Y zeigt nicht mehr Termine als 2W (${c1.n} vs ${reihenfolge.n})`);
  if (c1.aeltester < c1.stich) fail('C', `1Y reicht bis ${c1.aeltester}, Stichtag ${c1.stich}`);
  if (c1.aeltester > dateAddStr0(c1.stich, 7)) fail('C', `1Y endet schon bei ${c1.aeltester}, Stichtag ${c1.stich}`);
  // D) Show older + Fenster
  const vor = await p.evaluate(() => document.querySelectorAll('#detail .abc-cal .cal-row').length);
  const mehr = await p.$('#detail .abc-cal .calp-mehr');
  if (!mehr) fail('D', 'kein "Show older" bei 1Y');
  else {
    await mehr.click(); await p.waitForTimeout(300);
    const nach = await p.evaluate(() => document.querySelectorAll('#detail .abc-cal .cal-row').length);
    if (!(nach > vor)) fail('D', `"Show older" zeichnet keine weiteren Zeilen (${vor} -> ${nach})`);
    if (await p.evaluate(() => document.getElementById('mAssetCal').style.display === 'flex')) fail('D', 'der Klick auf "Show older" oeffnet zusaetzlich das Fenster');
  }
  await p.evaluate(() => openAssetCal()); await p.waitForTimeout(500);
  const f = await p.evaluate(() => ({ sw: [...document.querySelectorAll('#assetCalBody .calp-sw button.on')].map(x => x.textContent), rows: document.querySelectorAll('#assetCalBody .calp .cal-row').length }));
  if (f.sw[0] !== 'Past' || !f.rows) fail('D', `das Fenster zeigt nicht dieselbe Past-Liste (${f.sw.join()} / ${f.rows} Zeilen)`);
  await p.click('#assetCalBody .calp-sw button:first-child'); await p.waitForTimeout(300);
  if (!(await p.evaluate(() => !!document.querySelector('#assetCalBody .acm-grid')))) fail('E', '"Month" im Fenster bringt das Raster nicht zurueck');
  // F) High-impact-Filter in der Titelzeile (Nutzer 2026-09-27) - im Fenster
  //    steht noch die Past-Liste? Dann erst schliessen, der Filter sitzt in der Karte.
  await p.evaluate(() => closeAssetCal());
  await p.evaluate(() => setAbCalSicht('past')); await p.waitForTimeout(300);
  const hf = await p.evaluate(() => { const b = document.querySelector('#detail .abc-cal .abc-hd .calp-high'); return b ? { on: b.classList.contains('on'), vor: calpDaten('USD').evts.filter(e => evtImpact(e) !== 'high').length } : null; });
  if (!hf) fail('F', 'kein High-impact-Filter in der Titelzeile der Past-Karte');
  else {
    await p.click('#detail .abc-cal .abc-hd .calp-high'); await p.waitForTimeout(400);
    const nach = await p.evaluate(() => ({ on: document.querySelector('#detail .abc-cal .abc-hd .calp-high').classList.contains('on'), rest: calpDaten('USD').evts.filter(e => evtImpact(e) !== 'high').length, fenster: document.getElementById('mAssetCal').style.display === 'flex' }));
    if (!(hf.vor > 0)) fail('F', 'Voraussetzung: keine Medium-Zeile in der Liste');
    if (nach.on === hf.on) fail('F', 'der Filter schaltet nicht um');
    if (nach.on && nach.rest) fail('F', `"High impact" an, aber ${nach.rest} Nicht-High-Zeile(n) in der Liste`);
    if (nach.fenster) fail('F', 'der Klick auf den Filter oeffnet zusaetzlich das Fenster');
    await p.click('#detail .abc-cal .abc-hd .calp-high'); await p.waitForTimeout(300);
  }
  await p.evaluate(() => setAbCalSicht('month')); await p.waitForTimeout(200);
  if (!(await p.evaluate(() => !!document.querySelector('#detail .abc-cal .abc-grid')))) fail('E', '"Month" gilt nicht auch fuer die Karte');
  if (perr.length) fail('Seitenfehler', perr.slice(0, 3).join(' | '));
  await b.close();
  if (F.length) { console.log('✗ Past Releases:\n  ' + F.join('\n  ')); process.exit(1); }
  console.log(`✓ Past Releases: Karte + Fenster, ${a.zeilen.length} Zeilen (2W), 1Y bis ${c1.aeltester}, ein Quelle je Tag (Live-Tag ${liveTag}), Zeitfilter ${a.rg.join('/')}`);
})().catch(e => { console.log('✗ calpast: ' + e.message); process.exit(1); });
function dateAddStr0(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
