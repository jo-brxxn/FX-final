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
//      (Retail seit 2026-09-24: Paar-Stimmen ab 65/35, doppelt bei Wachstum)
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

    // (b) Retail, EIN Buch (Gold) - Regel seit 2026-09-24 (Nutzer: "nur Paare
    // zu Long oder Short ab 65 und 35 Prozent, sonst neutral ... und die
    // Veraenderung einbeziehen"): >=65 % long -> -0,5, <=35 % -> +0,5,
    // doppelt, wenn das Extrem in 5 Tagen um >=3 Punkte gewachsen ist.
    const gsym = retailSymFor('GOLD');
    const hist = (l, alt) => ({ [gsym]: [['2026-09-10', alt, 100 - alt], ['2026-09-20', l, 100 - l]] });
    [[98, 98, -0.5], [65, 65, -0.5], [64, 64, 0], [50, 50, 0], [36, 36, 0], [35, 35, 0.5], [2, 2, 0.5],
     [70, 66, -1],      // extrem und um 4 Punkte weiter gewachsen -> doppelt
     [70, 68, -0.5],    // nur 2 Punkte -> einfach
     [70, 75, -0.5],    // Extrem schrumpft -> einfach
     [30, 34, 1],       // Short-Extrem waechst -> doppelt
    ].forEach(([lang, alt, soll]) => {
      SENTIMENT_DATA = { retail: [{ sym: gsym, long: lang, short: 100 - lang }], retailHistory: hist(lang, alt) };
      const e = retailBiasFor('GOLD');
      out.ret.push({ lang, alt, soll, ist: e.pkt, txt: e.txt });
    });

    // (c) Retail, eine WAEHRUNG: Durchschnitt der Paar-Stimmen. Sieben USD-
    // Paare, davon nLang mit >=70 % long USD, der Rest 50 % (neutral).
    const PAARE = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD'];
    [[7, -0.5], [6, -0.43], [2, -0.14], [0, 0]].forEach(([nLang, soll]) => {
      SENTIMENT_DATA = { retail: PAARE.map((s, i) => {
        const usdLang = i < nLang, vorn = s.slice(0, 3) === 'USD';
        const l = usdLang ? (vorn ? 70 : 30) : 50;
        return { sym: s, long: l, short: 100 - l };
      }) };
      const e = retailBiasFor('USD');
      out.paare.push({ nLang, soll, ist: e.pkt, txt: e.txt });
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
  r1.ret.forEach(c => { if (Math.abs(c.ist - c.soll) > 1e-9)
    fail('RETAIL-REGEL (Buch)', `${c.lang}% long (5 Tage vorher ${c.alt}%) -> ${c.ist} statt ${c.soll}`); });
  r1.paare.forEach(c => { if (Math.abs(c.ist - c.soll) > 0.006)
    fail('RETAIL-REGEL (Paare)', `${c.nLang}/7 Paare >=65% long -> ${c.ist} statt ${c.soll}`); });
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
        // Saisonalitaet: Halbgewicht. Retail: feste Punkte nach der Regel (ind.pkt).
        if (n === 'Seasonality' && Math.abs(teile.w - 0.5) > 1e-9) out.probleme.push({ sym: s.id, ind: n, t: 'kein Halbgewicht', w: teile.w });
        if (n === 'Retail Positioning' && !teile.fest && ind.pkt !== undefined) out.probleme.push({ sym: s.id, ind: n, t: 'Retail nicht nach fester Regel', pkt: ind.pkt });
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

  // ── EIN SYNC OHNE GELADENE QUELLE DARF DIE ZEILEN NICHT LOESCHEN ──
  // Nutzer-Screenshot 2026-09-20 18:57 (VERSION-CHECK-534): USD-History
  // zeigte "sync -0.9", und diesmal war die Bewegung ECHT. Gemessen: ein
  // applySnap, waehrend SEASONALITY_DATA/SENTIMENT_DATA noch nicht geladen
  // sind, liess USD von 3,3 auf 2,5 fallen - BEIDE Zeilen waren danach weg.
  // reapplyLiveFeeds() ruft applySeasRetailFeed() bei jedem applySnap auf,
  // und seasBiasFor/retailBiasFor liefern ohne geladene Quelle dasselbe
  // leere Ergebnis wie fuer ein Asset, das wirklich keine Reihe hat - die
  // Zeile wurde also geloescht, obwohl nur der Feed fehlte.
  //
  // ⚠ Die Pruefung hat ZWEI Haelften. Ohne die zweite waere ein Waechter
  // gruen, der das Loeschen KOMPLETT ausgebaut hat - und dann staende bei
  // NZD & Co. wieder eine Geisterzeile mit geschaetztem Nullwert.
  // Gegenprobe beim Einbau: den quelleDa-Zweig entfernt -> erste Haelfte
  // meldet USD 3,3 -> 2,5 und zwei fehlende Zeilen.
  const sy = await p.evaluate(() => {
    const usd = () => { const s = syms.find(x => x.id === 'USD'); return s ? symScoreCmp(s) : null; };
    const zeilen = id => {
      const s = syms.find(x => x.id === id); if (!s) return null;
      const c = (s.rubrics || []).find(r => r.name === 'COT Data');
      return (c && c.indicators || []).filter(i => i.name === 'Seasonality' || i.name === 'Retail Positioning').map(i => i.name);
    };
    const vorScore = usd(), vorZeilen = zeilen('USD');
    // 1) Quellen wegnehmen (der Zustand frueh im Boot) und einen Stand adoptieren.
    const sent = window.SENTIMENT_DATA, seas = window.SEASONALITY_DATA;
    window.SENTIMENT_DATA = null; window.SEASONALITY_DATA = null;
    _flipCauseTag = 'sync'; applySnap(snap()); _flipCauseTag = null;
    const ohneQuelle = { score: usd(), zeilen: zeilen('USD') };
    window.SENTIMENT_DATA = sent; window.SEASONALITY_DATA = seas;
    // 2) Mit geladener Quelle muss die Geisterzeilen-Regel weiter greifen.
    //    ⚠ Bloss NACHZUSEHEN, ob so ein Asset eine Zeile traegt, beweist
    //    nichts: es hatte nie eine, also faellt ein ausgebautes Loeschen
    //    dabei gar nicht auf (im ersten Anlauf genau so passiert - die
    //    Gegenprobe blieb gruen). Die Zeile wird deshalb ABSICHTLICH
    //    eingesetzt und muss wieder verschwinden.
    const ohneReihe = (() => {
      const d = window.SEASONALITY_DATA;
      const id = (syms || []).map(x => x.id).find(x => !(d && d.assets && d.assets[x]));
      if (!id) return null;
      const s2 = syms.find(x => x.id === id);
      const c = (s2.rubrics || []).find(r => r.name === 'COT Data');
      if (!c) return null;
      c.indicators.push({ id: 'geist', name: 'Seasonality', bias: 'bull', imp: false, date: '', interval: '',
        research: { actual: '+9.99% · up in 99%', forecast: null, previous: null, source: 'waechter', cotColor: 'bond-up' } });
      applySeasRetailFeed();
      const uebrig = (zeilen(id) || []).filter(n => n === 'Seasonality');
      c.indicators = c.indicators.filter(i => i.id !== 'geist');
      applySeasRetailFeed();
      return { id, zeilen: uebrig };
    })();
    return { vorScore, vorZeilen, ohneQuelle, ohneReihe, nachScore: usd() };
  });
  if (!sy.vorZeilen || sy.vorZeilen.length !== 2)
    fail('PRUEFUNG UNTAUGLICH', `USD traegt vor dem Test ${(sy.vorZeilen || []).length} statt 2 Zeilen - der Sync-Test kann so nichts zeigen.`);
  else if (sy.ohneQuelle.zeilen.length !== 2)
    fail('SYNC OHNE QUELLE LOESCHT ZEILEN',
      `Ein applySnap ohne geladenes SEASONALITY_DATA/SENTIMENT_DATA hat USD von ${sy.vorScore} auf ${sy.ohneQuelle.score} gedrueckt `
      + `und ${2 - sy.ohneQuelle.zeilen.length} der beiden Zeilen entfernt (uebrig: ${sy.ohneQuelle.zeilen.join(', ') || 'keine'}). `
      + `"Quelle noch nicht geladen" ist nicht "keine Datenlage" - siehe quelleDa in applySeasRetailFeed().`);
  else if (Math.abs(sy.ohneQuelle.score - sy.vorScore) > 0.05)
    fail('SYNC OHNE QUELLE BEWEGT DEN SCORE', `USD ${sy.vorScore} -> ${sy.ohneQuelle.score}, obwohl beide Zeilen stehen geblieben sind.`);
  if (sy.ohneReihe && sy.ohneReihe.zeilen.length)
    fail('GEISTERZEILE TROTZ FEHLENDER REIHE',
      `${sy.ohneReihe.id} hat keine Saisonalitaets-Reihe im Feed, traegt die Zeile aber trotzdem. `
      + `Eine eingesetzte Testzeile wurde bei geladener Quelle NICHT entfernt - die quelleDa-Pruefung darf das `
      + `Entfernen nur aussetzen, solange die QUELLE fehlt, nicht generell.`);

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
