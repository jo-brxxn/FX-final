// ══ WAECHTER: BACKTESTER ═════════════════════════════════════════════════
//
// Neubau 2026-09-17 (Nutzer: "bau die backtester funktion komplett neu um").
// Geprueft wird jede Aussage, die der Neubau neu macht - und zwar gegen die
// ROHEN Feed-Dateien, nicht gegen die App selbst:
//
//   A) Sitzungsliste: jede Zeile muss in ind_data.json['Central Bank Rate']
//      .historyFull stehen, mit dem Vorher/Nachher-Satz und der richtigen
//      Richtung. Holds sind Sitzungen ohne Aenderung und muessen vollstaendig
//      sein - der Vorgaenger hat sie weggeworfen.
//   B) Releases je Bereich: Werte, Anzahl und Datumsgrenze gegen
//      ind_data.json bzw. bond_data.json nachgerechnet. KEIN Wert darf aus
//      der Zukunft der Sitzung stammen (das waere der schwerste Fehler:
//      ein Rueckblick, der schon weiss, was danach kam).
//   C) Ueberraschungsfarbe: nur wo ein Forecast dasteht, und mit dem
//      richtigen Vorzeichen (LOWER_IS_BETTER beachtet).
//   D) Kursreaktion: gegen price_data.json nachgerechnet, in DATENPUNKTEN.
//   E) Steuerung: jeder der sechs Handler wirkt wirklich (Regel 6).
//   F) Zinspfad: Treppe (keine schraegen Verbindungen), Klick trifft die
//      richtige Zeile, Vergleichskurve erscheint.
//   G) Kein Ueberlauf auf vier Fensterbreiten.
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';

let fehler = 0;
const rot = (m) => { console.log('  ✗ ' + m); fehler++; };
const gruen = (m) => console.log('  ✓ ' + m);
const zahl = (v) => { if (v == null) return null;
  const m = String(v).match(/-?\d[\d.,]*/); if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, '')); return isFinite(n) ? n : null; };
// Die Fed nennt einen Korridor ("3.50%-3.75%") - daraus muss die Mitte
// werden, genau wie parsePolicyRate es im Produktivcode tut. Ohne das
// verschiebt sich jeder Fed-Satz um 0,125.
const satz = (v) => {
  const s = String(v == null ? '' : v);
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%?\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*%/);
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  return zahl(s);
};

(async () => {
  let PW;
  try { PW = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
  catch (e) { console.log('[backtester] uebersprungen (kein Playwright)'); process.exit(0); }
  const { wartenBisDatenDa } = require('./warten.js');

  const indData = JSON.parse(fs.readFileSync(path.join(WURZEL, 'ind_data.json'), 'utf8'));
  const priceData = JSON.parse(fs.readFileSync(path.join(WURZEL, 'price_data.json'), 'utf8'));

  const b = await PW.chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });
  await p.evaluate(() => gotoSym('USD'));
  await p.waitForTimeout(500);
  await p.evaluate(() => openBacktester('USD'));
  await p.waitForTimeout(1400);

  // ── A) Sitzungsliste gegen ind_data.json ──────────────────────────────
  console.log('── A) Sitzungen: jede Zeile steht im Feed, Richtung und Satz stimmen ──');
  const cbHist = ((indData.USD || {})['Central Bank Rate'] || {}).historyFull || [];
  const cbPts = cbHist.map(h => [String(h[0]).slice(0, 10), satz(h[1])])
    .filter(x => x[0] && x[1] != null).sort((a, b2) => a[0].localeCompare(b2[0]));
  // Erwartete Sitzungen: jeder Punkt ab dem zweiten, mit seinem Vorgaenger.
  const sollAlle = [];
  for (let i = 1; i < cbPts.length; i++) {
    const d = cbPts[i][1] - cbPts[i - 1][1];
    sollAlle.push({ date: cbPts[i][0], rate: cbPts[i][1], prev: cbPts[i - 1][1],
      dir: Math.abs(d) < 1e-9 ? 'hold' : (d > 0 ? 'hike' : 'cut') });
  }
  const ist = await p.evaluate(() => btMeetings('USD').map(m =>
    ({ date: m.date, rate: m.rate, prev: m.prev, dir: m.dir })));
  if (ist.length !== sollAlle.length)
    rot(`btMeetings('USD') gibt ${ist.length} Sitzungen, aus ind_data.json folgen ${sollAlle.length}`);
  else gruen(`${ist.length} Sitzungen, deckungsgleich mit ind_data.json (davon ${sollAlle.filter(m => m.dir === 'hold').length} Holds)`);
  let aFehl = 0;
  const istMap = new Map(ist.map(m => [m.date, m]));
  sollAlle.forEach(s => {
    const i2 = istMap.get(s.date);
    if (!i2) { if (aFehl++ < 4) rot(`Sitzung ${s.date} fehlt in der Anzeige`); return; }
    if (i2.dir !== s.dir && aFehl++ < 4) rot(`${s.date}: Anzeige sagt ${i2.dir}, nachgerechnet ${s.dir}`);
    if (Math.abs(i2.rate - s.rate) > 0.005 && aFehl++ < 4)
      rot(`${s.date}: Anzeige nennt Satz ${i2.rate}, im Feed steht ${s.rate}`);
    if (Math.abs(i2.prev - s.prev) > 0.005 && aFehl++ < 4)
      rot(`${s.date}: Anzeige nennt Vorwert ${i2.prev}, im Feed steht ${s.prev}`);
  });
  if (!aFehl) gruen('Richtung, Satz und Vorwert jeder Sitzung stimmen');

  // ── B) Releases je Bereich ────────────────────────────────────────────
  console.log('\n── B) Releases: Werte, Anzahl, und KEIN Wert aus der Zukunft ──');
  const bProben = await p.evaluate(() => {
    const ms = btMeetings('USD').filter(m => m.dir !== 'hold').slice(0, 8);
    const out = [];
    BT_AREAS.forEach(([rub, lbl, base]) => {
      ms.forEach(m => {
        const rel = btReleases('USD', base, m.date, BT_LOOKBACK);
        out.push({ base, tag: m.date, n: rel.length,
          rel: rel.map(r => ({ d: r.date, a: r.actual, f: r.forecast })) });
      });
    });
    return { out, lookback: BT_LOOKBACK };
  });
  let zukunft = 0, bAbw = 0, bGeprueft = 0;
  bProben.out.forEach(x => {
    // ⚠ Der schwerste denkbare Fehler in einem Rueckblick: ein Wert, der zum
    // Zeitpunkt der Sitzung noch nicht veroeffentlicht war.
    x.rel.forEach(r => { if (r.d > x.tag) { if (zukunft++ < 4) rot(`${x.base} zur Sitzung ${x.tag}: Wert vom ${r.d} — der lag damals in der ZUKUNFT`); } });
    if (x.n > bProben.lookback) rot(`${x.base} zur Sitzung ${x.tag}: ${x.n} Werte, erlaubt sind ${bProben.lookback}`);
    // Gegen die Rohdatei: nur fuer die drei Indikator-Bereiche (die
    // Renditen kommen aus bond_data.json und werden woechentlich abgegriffen,
    // dafuer ist der Abschnitt hier nicht gebaut).
    if (/Bond Yield/.test(x.base)) return;
    const e = (indData.USD || {})[x.base];
    const hf = e && Array.isArray(e.historyFull) ? e.historyFull : null;
    if (!hf) return;
    bGeprueft++;
    const soll = hf.map(h => [String(h[0]).slice(0, 10), zahl(h[1]), h[2] == null ? null : zahl(h[2])])
      .filter(h => h[0] && h[1] != null && h[0] <= x.tag)
      .sort((a, b2) => a[0].localeCompare(b2[0])).slice(-bProben.lookback);
    if (soll.length !== x.n && bAbw++ < 4)
      rot(`${x.base} zur Sitzung ${x.tag}: Anzeige ${x.n} Werte, aus ind_data.json folgen ${soll.length}`);
    soll.forEach((s, i) => {
      const r = x.rel[i]; if (!r) return;
      if (r.d !== s[0] && bAbw++ < 4) rot(`${x.base}/${x.tag} Position ${i}: Anzeige ${r.d}, Feed ${s[0]}`);
      if (Math.abs(r.a - s[1]) > 0.005 && bAbw++ < 4) rot(`${x.base}/${x.tag} ${s[0]}: Anzeige ${r.a}, Feed ${s[1]}`);
    });
  });
  if (!zukunft) gruen(`${bProben.out.length} Bereichszellen: kein Wert aus der Zukunft der Sitzung`);
  if (!bGeprueft) rot('Keine einzige Bereichszelle gegen ind_data.json nachgerechnet — die Pruefung waere leer-gruen');
  else if (!bAbw) gruen(`${bGeprueft} Bereichszellen wertgenau gegen ind_data.json nachgerechnet`);

  // ── C) Ueberraschungsfarbe ────────────────────────────────────────────
  console.log('\n── C) Ueberraschungsfarbe nur mit Forecast, und richtig gedreht ──');
  const farben = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#mBtBody .bt-v').forEach(e => {
      const t = e.getAttribute('title') || '';
      out.push({ txt: e.textContent.trim(), kl: String(e.className),
        hatForecast: /forecast/.test(t) && !/no forecast on file/.test(t),
        tip: t.slice(0, 90) });
    });
    return out;
  });
  const gefaerbt = farben.filter(f => /act-(good|bad)/.test(f.kl));
  const ohneFc = gefaerbt.filter(f => !f.hatForecast);
  if (ohneFc.length) rot(`${ohneFc.length} Werte sind als Ueberraschung gefaerbt, obwohl kein Forecast dasteht (z.B. "${ohneFc[0].txt}" — ${ohneFc[0].tip})`);
  else gruen(`${gefaerbt.length} von ${farben.length} Werten gefaerbt, alle mit Forecast im Tooltip`);
  // Vorzeichen: "above forecast" muss bei einem Indikator, bei dem MEHR gut
  // ist, act-good ergeben - bei Arbeitslosigkeit/Claims genau umgekehrt.
  const drehFehler = await p.evaluate(() => {
    const LOWER = /unemployment|jobless|claim|deficit/i;
    const out = [];
    document.querySelectorAll('#mBtBody tbody tr').forEach(tr => {
      // ⚠ Zuordnung ueber BT_AREAS, NICHT ueber den Spaltenindex. Der erste
      // Lauf zaehlte thead-Spalten mit einem festen Versatz und lag nach dem
      // Einschieben der "Price after"-Spalte um eins daneben: er verglich
      // Inflationswerte gegen den Labour-Kopf und wendete damit
      // "niedriger ist besser" auf CPI an - 310 gemeldete Vorzeichenfehler,
      // die alle dem Waechter gehoerten und nicht der Anzeige.
      const bereiche = BT_AREAS.map(a => a[2]);
      const zellen = [...tr.querySelectorAll('.bt-cell')].filter(td => !td.classList.contains('bt-rk'));
      zellen.forEach((td, k) => {
        const base = bereiche[k] || '';
        td.querySelectorAll('.bt-v').forEach(e => {
          const t = e.getAttribute('title') || '';
          const ueber = /above forecast/.test(t), unter = /below forecast/.test(t);
          if (!ueber && !unter) return;
          const gut = /act-good/.test(e.className), schlecht = /act-bad/.test(e.className);
          if (!gut && !schlecht) return;
          const niedrigerBesser = LOWER.test(base);
          const erwartetGut = niedrigerBesser ? unter : ueber;
          if (erwartetGut !== gut) out.push({ base, txt: e.textContent.trim(), t: t.slice(0, 70), kl: String(e.className) });
        });
      });
    });
    return out;
  });
  if (drehFehler.length) rot(`${drehFehler.length} Werte mit falschem Ueberraschungs-Vorzeichen, z.B. ${drehFehler[0].base} "${drehFehler[0].txt}" (${drehFehler[0].t}) -> ${drehFehler[0].kl}`);
  else gruen('Ueberraschungs-Vorzeichen ueberall richtig gedreht (auch bei "niedriger ist besser")');

  // ── D) Kursreaktion gegen price_data.json ─────────────────────────────
  console.log('\n── D) Kursreaktion: gegen price_data.json nachgerechnet ──');
  const dProben = await p.evaluate(() => {
    const ms = btMeetings('USD').filter(m => m.dir !== 'hold').slice(0, 10);
    return { reakt: ms.map(m => ({ tag: m.date, r: btKursReaktion('USD', m.date) })), schritte: BT_REAKT };
  });
  const pd = priceData.USD;
  const ser = (pd && Array.isArray(pd.series)) ? pd.series.map(e => [String(e[0]).slice(0, 10), Number(e[1])]) : null;
  if (!ser) rot('price_data.json fuehrt keine USD-Reihe — die Kursreaktion ist damit nicht nachrechenbar');
  else {
    // ⚠ invert beachten: USD/JPY & Co. stehen gekehrt in der Datei. Fuer USD
    // selbst ist invert normalerweise falsch, aber die Pruefung darf das
    // nicht voraussetzen.
    const inv = !!(pd && pd.invert);
    const kurs = ser.map(e => [e[0], inv ? 1 / e[1] : e[1]]);
    let dGeprueft = 0, dAbw = 0;
    dProben.reakt.forEach(x => {
      if (!x.r) return;
      let i0 = -1;
      for (let i = 0; i < kurs.length; i++) { if (kurs[i][0] <= x.tag) i0 = i; else break; }
      if (i0 < 0) return;
      const p0 = kurs[i0][1];
      x.r.forEach((e, k) => {
        const n = dProben.schritte[k];
        const j = i0 + n;
        const soll = (j < kurs.length && isFinite(kurs[j][1]) && isFinite(p0) && p0)
          ? Math.round(((kurs[j][1] / p0) - 1) * 10000) / 100 : null;
        dGeprueft++;
        if (soll == null && e.pct != null && dAbw++ < 4)
          rot(`${x.tag} +${n}: Anzeige ${e.pct}%, aber die Reihe reicht nicht so weit — das darf nicht gefuellt werden`);
        else if (soll != null && e.pct == null && dAbw++ < 4)
          rot(`${x.tag} +${n}: leer, obwohl die Reihe ${soll}% hergibt`);
        else if (soll != null && e.pct != null && Math.abs(soll - e.pct) > 0.02 && dAbw++ < 4)
          rot(`${x.tag} +${n}: Anzeige ${e.pct}%, nachgerechnet ${soll}%`);
      });
    });
    if (!dGeprueft) rot('Keine Kursreaktion nachgerechnet — die Pruefung waere leer-gruen');
    else if (!dAbw) gruen(`${dGeprueft} Kursreaktions-Werte (+${dProben.schritte.join('/+')}) gegen price_data.json nachgerechnet`);
  }

  // ── E) Die Steuerung wirkt wirklich ───────────────────────────────────
  console.log('\n── E) Steuerung: sechs Handler, jeder mit sichtbarer Wirkung ──');
  const steuer = await p.evaluate(async () => {
    const warte = () => new Promise(r => setTimeout(r, 450));
    const zeilen = () => document.querySelectorAll('#mBtBody tbody tr').length;
    const holds = () => document.querySelectorAll('#mBtBody tr.bt-holdrow').length;
    const titel = () => (document.getElementById('mBtTitle') || {}).textContent || '';
    const o = {};
    setBtCcy('USD'); setBtFilter('all'); setBtJahr('all'); if (btHolds) toggleBtHolds();
    await warte();
    o.start = { zeilen: zeilen(), holds: holds(), titel: titel() };
    setBtCcy('EUR'); await warte();
    o.ccy = { titel: titel(), zeilen: zeilen() };
    setBtCcy('USD'); await warte();
    toggleBtHolds(); await warte();
    o.holdsAn = { zeilen: zeilen(), holds: holds() };
    toggleBtHolds(); await warte();
    o.holdsAus = { zeilen: zeilen(), holds: holds() };
    setBtFilter('hike'); await warte();
    o.hikes = { zeilen: zeilen(), cuts: document.querySelectorAll('#mBtBody .bt-tag.bt-cut').length };
    setBtFilter('cut'); await warte();
    o.cuts = { zeilen: zeilen(), hikes: document.querySelectorAll('#mBtBody .bt-tag.bt-hike').length };
    setBtFilter('all'); await warte();
    const jahre = [...document.querySelectorAll('#mBtBody .bt-sel option')].map(e => e.value).filter(v => v !== 'all');
    if (jahre.length) { setBtJahr(jahre[0]); await warte(); o.jahr = { wert: jahre[0], zeilen: zeilen() }; }
    setBtJahr('all'); await warte();
    setBtCmp('EUR'); await warte();
    o.cmp = { legende: !!document.querySelector('#mBtBody .bt-pfad-leg'),
      gestrichelt: !!document.querySelector('#mBtBody .bt-pfad svg path[stroke-dasharray]') };
    setBtCmp('EUR'); await warte();
    o.cmpAus = { legende: !!document.querySelector('#mBtBody .bt-pfad-leg') };
    return o;
  });
  const s = steuer;
  if (!/EUR/.test(s.ccy.titel)) rot(`Waehrungs-Umschalter: Titel bleibt "${s.ccy.titel}"`);
  else gruen(`Waehrungs-Umschalter: USD (${s.start.zeilen} Zeilen) → EUR (${s.ccy.zeilen} Zeilen)`);
  if (s.holdsAn.holds <= 0) rot('Holds-Schalter: kein Hold erscheint');
  else if (s.holdsAus.holds !== 0) rot(`Holds-Schalter aus: es stehen weiter ${s.holdsAus.holds} Hold-Zeilen da`);
  else gruen(`Holds-Schalter: 0 → ${s.holdsAn.holds} → 0 Hold-Zeilen`);
  if (s.hikes.cuts !== 0) rot(`Filter "Hikes": ${s.hikes.cuts} CUT-Zeilen bleiben stehen`);
  else if (s.cuts.hikes !== 0) rot(`Filter "Cuts": ${s.cuts.hikes} HIKE-Zeilen bleiben stehen`);
  else gruen(`Filter: Hikes ${s.hikes.zeilen} Zeilen (0 Cuts), Cuts ${s.cuts.zeilen} Zeilen (0 Hikes)`);
  if (!s.jahr) rot('Keine Jahresauswahl im Fenster');
  else if (s.jahr.zeilen >= s.start.zeilen) rot(`Jahresfilter "${s.jahr.wert}": ${s.jahr.zeilen} Zeilen, ungefiltert ${s.start.zeilen} — er wirkt nicht`);
  else gruen(`Jahresfilter ab '${String(s.jahr.wert).slice(-2)}: ${s.jahr.zeilen} statt ${s.start.zeilen} Zeilen`);
  if (!s.cmp.legende || !s.cmp.gestrichelt) rot(`Vergleichsbank: Legende ${s.cmp.legende}, gestrichelte Kurve ${s.cmp.gestrichelt}`);
  else if (s.cmpAus.legende) rot('Vergleichsbank laesst sich nicht wieder abschalten');
  else gruen('Vergleichsbank: gestrichelte Kurve + Legende, und wieder abschaltbar');

  // ── F) Zinspfad: echte Treppe, Klick trifft ───────────────────────────
  console.log('\n── F) Zinspfad: Treppe statt Schraegen, Klick trifft die Zeile ──');
  const pfad = await p.evaluate(async () => {
    setBtCcy('USD'); await new Promise(r => setTimeout(r, 600));
    const sv = document.querySelector('#mBtBody .bt-pfad svg');
    if (!sv) return null;
    const d = (sv.querySelector('path') || {}).getAttribute ? sv.querySelector('path').getAttribute('d') : '';
    // Eine Treppe besteht ausschliesslich aus waagrechten und senkrechten
    // Stuecken: jedes L teilt mit seinem Vorgaenger entweder x oder y.
    const pkt = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
    let schraeg = 0;
    for (let i = 1; i < pkt.length; i++) {
      const dx = Math.abs(pkt[i][0] - pkt[i - 1][0]), dy = Math.abs(pkt[i][1] - pkt[i - 1][1]);
      if (dx > 0.5 && dy > 0.5) schraeg++;
    }
    const g = document.querySelector('#mBtBody .bt-pfad .cax-p');
    let klick = null;
    if (g) {
      const soll = (g.getAttribute('onclick') || '').match(/'([\d-]{10})'/);
      g.click();
      await new Promise(r => setTimeout(r, 400));
      const tr = document.querySelector('#mBtBody tr.bt-jump');
      klick = { soll: soll ? soll[1] : null, ist: tr ? tr.getAttribute('data-d') : null };
    }
    // Marker liegen seit 2026-09-18 als HTML-Knoepfe ueber dem SVG, nicht
    // mehr als <circle> darin: im gestreckten SVG waren sie Ellipsen.
    return { punkte: pkt.length, schraeg,
      marker: document.querySelectorAll('#mBtBody .bt-pfad .cax-p').length,
      achse: [...sv.querySelectorAll('text')].map(e => e.textContent), klick };
  });
  if (!pfad) rot('Kein Zinspfad gezeichnet');
  else {
    if (pfad.schraeg) rot(`${pfad.schraeg} schraege Verbindung(en) im Zinspfad — ein Leitzins springt an der Sitzung, er driftet nicht dazwischen`);
    else gruen(`Treppe aus ${pfad.punkte} Punkten, 0 schraege Verbindungen`);
    if (pfad.marker < 2) rot(`${pfad.marker} Marker im Pfad`);
    else gruen(`${pfad.marker} Marker (nur echte Aenderungen)`);
    const MON = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;
    const ohneJahr = pfad.achse.filter(t => MON.test(t) && !/'\d{2}/.test(t));
    if (ohneJahr.length) rot(`Achsenbeschriftung ohne Jahr: ${ohneJahr.join(' / ')}`);
    else gruen(`Achse mit Jahr: ${pfad.achse.filter(t => MON.test(t)).join(' · ')}`);
    if (!pfad.klick) rot('Kein Marker zum Klicken');
    else if (pfad.klick.ist !== pfad.klick.soll)
      rot(`Klick auf Marker ${pfad.klick.soll} markiert die Zeile ${pfad.klick.ist}`);
    else gruen(`Klick auf Marker ${pfad.klick.soll} markiert genau diese Zeile`);
  }

  // ── G) Kein Ueberlauf ─────────────────────────────────────────────────
  console.log('\n── G) Vier Fensterbreiten: kein Ueberlauf ──');
  for (const w of [1600, 1280, 1024, 820]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const mod = document.querySelector('#mBt .modal');
      if (!mod) return null;
      const r = mod.getBoundingClientRect();
      const sc = document.querySelector('#mBtBody .bt-scroll');
      return { breiter: Math.round(r.width - document.documentElement.clientWidth),
        hoeher: Math.round(r.height - document.documentElement.clientHeight),
        querScrollbar: sc ? sc.scrollWidth > sc.clientWidth : null };
    });
    if (!m) { rot(`${w}px: Fenster nicht gefunden`); continue; }
    if (m.breiter > 1) rot(`${w}px: das Fenster ist ${m.breiter}px breiter als der Bildschirm`);
    else if (m.hoeher > 1) rot(`${w}px: das Fenster ist ${m.hoeher}px hoeher als der Bildschirm`);
    else gruen(`${w}px: passt${m.querScrollbar ? ' (Tabelle waagrecht scrollbar — sie hat 8 Spalten, das ist gewollt)' : ''}`);
  }

  if (perr.length) rot('Seitenfehler: ' + [...new Set(perr)].slice(0, 3).join(' | '));
  await b.close();
  console.log(fehler ? `\n✗ BACKTESTER: ${fehler} Fund(e)` : '\n✓ BACKTESTER: alles in Ordnung');
  process.exit(fehler ? 1 : 0);
})();
