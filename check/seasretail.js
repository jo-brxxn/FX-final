// ── SAISONALITAET UND RETAIL IM SCORE ─────────────────────────────
// Zwei neue Score-Treiber, beide nach einer WOERTLICHEN Nutzer-Regel
// (2026-09-14). Genau deshalb steht hier ein eigener Waechter: eine Regel,
// die in Prosa im Chat steht und in einer if-Kette im Code, laeuft sonst
// still auseinander, sobald jemand eine Schwelle anfasst.
//
//   Saisonalitaet: "ich will das sessonality mit in den Score genommen wird.
//   0,5 Aenderung macht das dann."
//   Retail: "ab Extremen von 85 und 15 Long oder Short in % 1 scoreaemderung
//   in die andere Richtung und ab 60 bzw 40% nur 0,5 Aenderung aber bei
//   40-60 gar nix das ist neutral" - und fuer eine Waehrung ueber ihre
//   Paare: "3/5 Paaren Long Dann scoreaemderung -0,5 bearish. Aber wenn 5/5
//   Long dann -1".
//
// ⚠ Die Doppelbedingung der Saisonalitaet (Schnitt UND Trefferquote muessen
// dasselbe sagen) ist ein Zusatz von mir und traegt gemessen: OIL steht im
// September bei +0,32% Schnitt, ist aber nur in 38% der Jahre gestiegen.
// Ohne die Bedingung haette der Schnitt allein "Rueckenwind" in den Score
// geschrieben, wo die Mehrheit der Jahre das Gegenteil sagt.
//
// Geprueft wird:
//   1. die Schwellen-Tabelle beider Regeln, an eingespeisten Werten
//   2. Halbgewicht und Deckel: Saisonalitaet nie ueber 0,5, Retail nie ueber 1
//   3. keine Geisterzeile - ohne Datenlage existiert der Indikator nicht
//   4. Kachel-Zeile und Score-Fenster nennen dieselbe Zahl
//   5. kein Release-Datum (sonst meldet die Altersgrenze "OUT OF DATE"
//      fuer einen 15-Jahres-Mittelwert, der gar nicht altern kann)
//   6. der laufende Monat ist in der Kachel-Grafik wirklich MARKIERT,
//      im DOM gemessen statt im Quelltext behauptet
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

const F = [];
const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const perr = [];
  p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });

  // ── 1) Die Schwellen-Tabellen, an eingespeisten Werten ────────────────
  // ⚠ Eingespeist statt an den echten Daten geprueft: die echten Werte
  // decken die Schwellen nicht ab (heute steht kein Asset auf exakt 60%
  // oder 85%). Ein Waechter, der nur das prueft, was gerade zufaellig in
  // der Datei steht, kann eine verschobene Schwelle nicht sehen.
  const r1 = await p.evaluate(() => {
    const out = { seas: [], ret: [], paare: [], leer: {} };
    const monat = new Date().getMonth() + 1;
    const altS = SEASONALITY_DATA, altR = SENTIMENT_DATA;

    // (a) Saisonalitaet. [Schnitt, Trefferquote, erwarteter Bias]
    [[0.50, 75, 'bull'], [0.50, 60, 'bull'], [0.50, 59, 'neu'],
     [0.32, 38, 'neu'],                       // OIL im September
     [0.00, 60, 'bull'],                      // 0 gilt als nicht negativ
     [-0.50, 25, 'bear'], [-0.50, 40, 'bear'], [-0.50, 41, 'neu'],
     [-0.59, 50, 'neu']                       // AUD im September
    ].forEach(([avg, hit, soll]) => {
      SEASONALITY_DATA = { updated: 'test', assets: { EUR: { proxy: 'T', inv: 0, months: [[monat, avg, hit, 15]] } } };
      const e = seasBiasFor('EUR');
      out.seas.push({ avg, hit, soll, ist: e.bias, txt: e.txt });
    });
    // Ohne Reihe: kein Text -> kein Indikator -> kein Beitrag.
    SEASONALITY_DATA = { updated: 'test', assets: {} };
    const le = seasBiasFor('EUR');
    out.leer.seas = { bias: le.bias, txt: le.txt };
    SEASONALITY_DATA = altS;

    // (b) Retail, EIN Buch (Gold): Prozent des Buches.
    const gsym = retailSymFor('GOLD');
    [[98, 'sbear'], [85, 'sbear'], [84, 'bear'], [60, 'bear'], [59, 'neu'],
     [50, 'neu'], [41, 'neu'], [40, 'bull'], [16, 'bull'], [15, 'sbull'], [2, 'sbull']
    ].forEach(([lang, soll]) => {
      SENTIMENT_DATA = { retail: [{ sym: gsym, long: lang, short: 100 - lang }] };
      const e = retailBiasFor('GOLD');
      out.ret.push({ lang, soll, ist: e.bias, txt: e.txt });
    });

    // (c) Retail, eine WAEHRUNG: Anteil der Paare. Genau der Satz des
    // Nutzers ("3/5 Paaren Long ... aber wenn 5/5 Long dann -1"), hier auf
    // die sieben USD-Paare uebertragen: 5/7 = 71% mild, 6/7 = 86% extrem.
    const PAARE = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD'];
    [[7, 'sbear'], [6, 'sbear'], [5, 'bear'], [4, 'neu'], [3, 'neu'],
     [2, 'bull'], [1, 'sbull'], [0, 'sbull']
    ].forEach(([nLang, soll]) => {
      SENTIMENT_DATA = { retail: PAARE.map((s, i) => {
        const usdLang = i < nLang;                 // steht USD in diesem Paar long?
        const vorn = s.slice(0, 3) === 'USD';      // USD ist die Basis
        const l = vorn ? (usdLang ? 70 : 30) : (usdLang ? 30 : 70);
        return { sym: s, long: l, short: 100 - l };
      }) };
      const e = retailBiasFor('USD');
      out.paare.push({ nLang, soll, ist: e.bias, txt: e.txt });
    });
    SENTIMENT_DATA = { retail: [] };
    const lr = retailBiasFor('GOLD');
    out.leer.ret = { bias: lr.bias, txt: lr.txt };
    SENTIMENT_DATA = altR;
    // Nach dem Einspeisen den echten Stand wieder anwenden, damit die
    // folgenden Abschnitte auf den echten Daten messen.
    try { applySeasRetailFeed(); } catch (e) { out.leer.reapply = String(e); }
    return out;
  });
  r1.seas.forEach(c => { if (c.ist !== c.soll)
    fail('SAISONALITAET-SCHWELLE', `Schnitt ${c.avg}% bei ${c.hit}% Trefferquote -> "${c.ist}" statt "${c.soll}"`); });
  r1.ret.forEach(c => { if (c.ist !== c.soll)
    fail('RETAIL-SCHWELLE (Buch)', `${c.lang}% long -> "${c.ist}" statt "${c.soll}"`); });
  r1.paare.forEach(c => { if (c.ist !== c.soll)
    fail('RETAIL-SCHWELLE (Paare)', `${c.nLang}/7 Paare long -> "${c.ist}" statt "${c.soll}"`); });
  if (r1.leer.seas && (r1.leer.seas.bias !== 'neu' || r1.leer.seas.txt != null))
    fail('SAISONALITAET OHNE REIHE', `liefert ${JSON.stringify(r1.leer.seas)} statt neutral ohne Text`);
  if (r1.leer.ret && (r1.leer.ret.bias !== 'neu' || r1.leer.ret.txt != null))
    fail('RETAIL OHNE BUCH', `liefert ${JSON.stringify(r1.leer.ret)} statt neutral ohne Text`);

  // ── 2-5) Gewicht, Deckel, Geisterzeilen, Datum, Kachel gegen Score ────
  const r2 = await p.evaluate(() => {
    const out = { treffer: [], probleme: [], zeilen: 0 };
    const NAMEN = { Seasonality: 0.5, 'Retail Positioning': 1 };
    (syms || []).forEach(s => {
      const rub = (s.rubrics || []).find(r => r && r.name === 'COT Data');
      if (!rub || !Array.isArray(rub.indicators)) { out.probleme.push({ sym: s.id, t: 'keine COT-Karte' }); return; }
      const daten = { Seasonality: seasBiasFor(s.id), 'Retail Positioning': retailBiasFor(s.id) };
      Object.keys(NAMEN).forEach(n => {
        const ind = rub.indicators.find(i => i && i.name === n);
        const hatDaten = !!(daten[n] && daten[n].txt);
        // 3) Geisterzeile in beide Richtungen
        if (!!ind !== hatDaten) out.probleme.push({ sym: s.id, ind: n,
          t: ind ? 'Indikator ohne Datenlage' : 'Datenlage ohne Indikator', txt: daten[n] && daten[n].txt });
        const html = abScoreZeile(s, n, null);
        if (!ind) { if (html !== '') out.probleme.push({ sym: s.id, ind: n, t: 'Score-Zeile ohne Indikator' }); return; }
        const teile = indScoreParts(ind, rub);
        // 2) Halbgewicht und Deckel
        if (Math.abs(teile.w - 0.5) > 1e-9) out.probleme.push({ sym: s.id, ind: n, t: 'kein Halbgewicht', w: teile.w });
        const v = indScore(ind, rub);
        if (Math.abs(v) > NAMEN[n] + 1e-9) out.probleme.push({ sym: s.id, ind: n, t: 'Beitrag ueber der Regel', v, max: NAMEN[n] });
        if (n === 'Seasonality' && (ind.bias === 'sbull' || ind.bias === 'sbear'))
          out.probleme.push({ sym: s.id, ind: n, t: 'doppelter Bias bei der Saisonalitaet', bias: ind.bias });
        // 5) kein Release-Datum -> nie "OUT OF DATE"
        if (ind.research && ind.research.date)
          out.probleme.push({ sym: s.id, ind: n, t: 'traegt ein Release-Datum', d: ind.research.date });
        if (typeof indIsStale === 'function' && indIsStale(ind))
          out.probleme.push({ sym: s.id, ind: n, t: 'gilt als veraltet' });
        // 4) Kachel-Zeile == Score-Fenster
        const soll = (v > 0 ? '+' : '') + (Math.round(v * 100) / 100);
        if (!html.includes('>' + soll + '<'))
          out.probleme.push({ sym: s.id, ind: n, t: 'Kachel-Zeile weicht vom Score ab', soll, html: html.slice(0, 140) });
        out.zeilen++;
        out.treffer.push({ sym: s.id, ind: n, v, bias: ind.bias, txt: daten[n].txt });
      });
    });
    return out;
  });
  r2.probleme.forEach(x => fail('SCORE-BEITRAG', JSON.stringify(x)));

  // ── 6) Der laufende Monat ist in der Kachel-Grafik MARKIERT ───────────
  // ⚠ Im DOM gemessen, nicht im Quelltext behauptet (Nutzer 2026-09-14:
  // "in der Grafik wird auch immer der aktuelle Monat markiert"). Bis
  // hierher tat `.ab-sb.on` genau eines: das Monatskuerzel bekam die
  // Akzentfarbe - in einer Spalte von rund 14px Breite nicht zu finden.
  // Der Waechter verlangt deshalb eine sichtbare FLAECHE, nicht nur eine
  // andere Schriftfarbe.
  await p.evaluate(() => gotoSym('EUR'));
  await p.waitForTimeout(800);
  const r3 = await p.evaluate(() => {
    const sb = [...document.querySelectorAll('.ab-seas .ab-sb')];
    if (!sb.length) return { fehlt: true };
    const on = sb.filter(e => e.classList.contains('on'));
    const kuerzel = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const jetzt = kuerzel[new Date().getMonth()][0];
    const durchsichtig = c => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
    const messe = e => {
      const cs = getComputedStyle(e);
      return { bg: cs.backgroundColor, schatten: cs.boxShadow,
               l: (e.querySelector('.ab-sb-l') || {}).textContent || '' };
    };
    return { n: sb.length, nOn: on.length, jetzt,
             markiert: on.length === 1 ? messe(on[0]) : null,
             nachbar: messe(sb[0]),
             leerFlaeche: on.length === 1 ? durchsichtig(messe(on[0]).bg) : null };
  });
  if (r3.fehlt) fail('MONATS-MARKIERUNG', 'keine Seasonality-Kachel auf der Asset-Seite gefunden');
  else {
    if (r3.n !== 12) fail('MONATS-MARKIERUNG', `${r3.n} Monatsspalten statt 12`);
    if (r3.nOn !== 1) fail('MONATS-MARKIERUNG', `${r3.nOn} Spalten tragen .on - genau eine darf es sein`);
    if (r3.markiert && r3.markiert.l !== r3.jetzt)
      fail('MONATS-MARKIERUNG', `markiert ist "${r3.markiert.l}", laufender Monat ist "${r3.jetzt}"`);
    if (r3.leerFlaeche)
      fail('MONATS-MARKIERUNG', `die markierte Spalte hat keine eigene Flaeche (background ${r3.markiert.bg}) - eine andere Schriftfarbe allein findet niemand`);
    if (r3.markiert && r3.nachbar && r3.markiert.bg === r3.nachbar.bg)
      fail('MONATS-MARKIERUNG', `markierte Spalte und Nachbarspalte haben dieselbe Flaeche (${r3.markiert.bg})`);
  }

  // ── 7) Die Score-Zeile steht wirklich unter den beiden Kacheln ────────
  // Nutzer 2026-09-14: "Das kommt zu sesonality kurz dadrunter ... Und
  // retail kommt zu retail dadrunter". Ein Beitrag, den man nur im
  // Score-Fenster sieht, ist nicht das, was verlangt war.
  const r4 = await p.evaluate(() => {
    const titel = t => [...document.querySelectorAll('.ab-tile')]
      .find(e => (e.querySelector('.ab-tile-hd') || e).textContent.trim().startsWith(t));
    const pruef = t => { const k = titel(t); if (!k) return null;
      const z = k.querySelector('.ab-scoreline');
      return { da: !!z, sichtbar: !!(z && z.getBoundingClientRect().height > 6),
               txt: z ? z.textContent.replace(/\s+/g, ' ').trim() : '' }; };
    return { seas: pruef('Seasonality'), ret: pruef('Retail Positioning') };
  });
  [['Seasonality', r4.seas], ['Retail Positioning', r4.ret]].forEach(([n, x]) => {
    if (!x) return;                       // Kachel ohne Datenlage - eigener Fall oben
    if (!x.da) fail('SCORE-ZEILE FEHLT', `${n}: keine .ab-scoreline in der Kachel`);
    else if (!x.sichtbar) fail('SCORE-ZEILE FEHLT', `${n}: .ab-scoreline ist 0px hoch`);
  });

  // ── 6) RETAIL-ZEILEN GEGEN DEN ROHEN FEED ────────────────────────────
  // ⚠ Nutzer-Bugreport 2026-09-14, zwei Bildschirmfotos nebeneinander: der
  // Sentiment-Tab sagte "NZDJPY 95% long", die JPY-Kachel daneben "5%".
  // Beides war richtig gerechnet - die Kachel drehte jedes Paar auf die
  // Asset-Seite - und trotzdem eine Falle, weil neben der 5 der echte
  // Ticker NZD/JPY stand. Woertlich: "lass es doch richtig da stehen was
  // fuer einen sinn hat es das zu drehen".
  //
  // ⚠ FEHLERKLASSE: dieselbe Groesse an zwei Stellen in zwei
  // Blickrichtungen, ohne dass die Beschriftung den Unterschied traegt. Das
  // faellt in keinem Diff auf und in keiner Rechenprobe - beide Zahlen sind
  // ja richtig. Nur der direkte Vergleich mit der Quelle zeigt es.
  //
  // Geprueft wird deshalb JEDE angezeigte Zeile gegen sentiment_data.json:
  // die Prozentzahl neben "NZD/JPY" muss die Zahl sein, die der Broker fuer
  // NZDJPY fuehrt. Die Sicht des Assets darf weiter vorkommen, aber nur
  // beschriftet (Kopfzahl/Fusszeile tragen das Kuerzel) und nur im Score.
  const FX8 = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD'];
  let rzeilen = 0;
  for (const id of FX8) {
    await p.evaluate(x => gotoSym(x), id);
    await p.waitForTimeout(260);
    const r = await p.evaluate(assetId => {
      const roh = {};
      ((window.SENTIMENT_DATA || {}).retail || []).forEach(x => { if (x && x.sym) roh[String(x.sym).toUpperCase()] = Math.round(+x.long); });
      const kachel = [...document.querySelectorAll('.ab-tile')].find(t => /Retail Positioning/.test(t.textContent || ''));
      if (!kachel) return { fehlt: true };
      const zeilen = [...kachel.querySelectorAll('.ab-bar-row:not(.ab-bar-hd)')].map(e => ({
        name: ((e.querySelector('.ab-bar-n') || {}).textContent || '').trim(),
        lang: parseInt((((e.querySelector('.ab-bar-l') || {}).textContent) || '').replace('%', ''), 10),
        kurz: parseInt((((e.querySelector('.ab-bar-r') || {}).textContent) || '').replace('%', ''), 10),
        markiert: [...e.querySelectorAll('.ab-bar-me')].map(x => x.textContent),
      }));
      const big = ((kachel.querySelector('.ab-big') || {}).textContent || '').trim();
      const fuss = ((kachel.querySelector('.ab-foot') || {}).textContent || '').replace(/\s+/g, ' ');
      return { fehlt: false, zeilen, roh, big, fuss, assetId };
    }, id);
    if (r.fehlt) { fail('RETAIL-KACHEL FEHLT', `${id}: keine Retail-Kachel auf der Asset-Seite`); continue; }
    r.zeilen.forEach(z => {
      rzeilen++;
      const sym = z.name.replace('/', '').toUpperCase();
      const soll = r.roh[sym];
      if (soll == null) { fail('ZEILE NICHT IM FEED', `${id} ${z.name}: der Broker fuehrt kein Symbol ${sym}`); return; }
      if (z.lang !== soll) fail('RETAIL-ZEILE GEDREHT',
        `${id} ${z.name}: die Kachel zeigt ${z.lang}%, der Feed (und damit der Sentiment-Tab) fuehrt ${soll}%. `
        + `Genau dieser Widerspruch wurde am 2026-09-14 gemeldet - die Zeile gehoert dem PAAR, nur Kopfzahl und Fusszeile drehen auf das Asset.`);
      if (z.lang + z.kurz !== 100) fail('ZEILE ERGIBT NICHT 100', `${id} ${z.name}: ${z.lang}% + ${z.kurz}% = ${z.lang + z.kurz}`);
      // Auf welcher Seite das Asset steht, muss sichtbar sein - sonst ist
      // die ungedrehte Zahl zwar richtig, aber nicht deutbar.
      if (z.name.includes('/') && !z.markiert.includes(id)) fail('EIGENE SEITE NICHT MARKIERT',
        `${id} ${z.name}: das eigene Kuerzel ist im Paarnamen nicht hervorgehoben (.ab-bar-me). Ohne das ist nicht zu sehen, ob "long" fuer oder gegen ${id} spricht.`);
    });
    // Die gedrehte Zusammenfassung muss das Kuerzel tragen, sonst steht
    // wieder eine Zahl ohne Blickrichtung da.
    if (r.zeilen.length && !new RegExp('long\\s+' + id + '\\b').test(r.big))
      fail('KOPFZAHL OHNE BLICKRICHTUNG', `${id}: die grosse Zahl lautet "${r.big}" und nennt das Asset nicht. Sie ist gedreht - ohne Kuerzel ist sie von den Zeilen nicht zu unterscheiden.`);
    if (r.zeilen.length > 1 && !r.fuss.includes(id))
      fail('FUSSZEILE OHNE BLICKRICHTUNG', `${id}: die Fusszeile lautet "${r.fuss}" und nennt das Asset nicht.`);
  }

  await b.close();
  if (perr.length) fail('SEITENFEHLER', perr.slice(0, 3).join(' | '));
  if (F.length) {
    console.error('SAISONALITAET/RETAIL NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
  const mit = r2.treffer.filter(t => t.v !== 0);
  console.log(`[seasretail] ok (${r1.seas.length + r1.ret.length + r1.paare.length} Schwellen-Faelle, `
    + `${r2.zeilen} Indikatoren in ${new Set(r2.treffer.map(t => t.sym)).size} Assets, davon ${mit.length} mit Beitrag; `
    + `laufender Monat "${r3.jetzt}" markiert, Kachel und Score-Fenster deckungsgleich; `
  + `${rzeilen} Retail-Zeilen ungedreht gegen den Feed geprueft)`);
})().catch(e => { console.error('SEASRETAIL-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
