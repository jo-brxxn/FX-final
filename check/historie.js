// ══ WAECHTER: HISTORIE ═══════════════════════════════════════════════════
//
// Neubau 2026-09-17 (Nutzer: "ich will da mehr detail und es simpler mit mehr
// uebersicht"). Geprueft wird, was daran nachrechenbar ist - nicht der
// Geschmack, sondern die Aussagen:
//
//   A) Score-Linie: Nulllinie IM Bild, Farbwechsel am Nulldurchgang, Luecken
//      nicht ueberbrueckt, Achsen mit zweistelligem Jahr.
//   B) Klick auf einen Punkt fuehrt WIRKLICH zur zugehoerigen Zeile.
//   C) Alterung: Zyklus, Release und Altersgrenze werden in Node aus den
//      ROHEN Eingaben des Indikators UNABHAENGIG nachgerechnet und gegen die
//      Anzeige gestellt. Das ist der Kern - eine Zeile, die "aged out, -1"
//      behauptet, muss aus den Daten folgen, und der Tag davor darf die
//      Grenze noch nicht ueberschritten haben.
//   D) Der Alterungs-Schalter tut etwas (CLAUDE.md Regel 6).
//   E) Tage ohne Veroeffentlichung sagen "No data released" und werden NICHT
//      zusammengefasst (Nutzer-Vorgabe "jeden tag einzeln").
//   F) Kein Ueberlauf auf fuenf Fensterbreiten, Kopfzeile klebt.
//   G0/G/G2) Was die Historie ueber URSACHEN behauptet: ein Sync ohne
//      Zustandsaenderung schreibt nichts (G0 zusaetzlich direkt nach dem
//      Boot UND im Modus "normalized" - siehe dort, warum beides noetig
//      ist), eine echte Aenderung schreibt genau einen Eintrag, und eine
//      Feed-Ursache wird weiterhin benannt statt mitverschluckt.
//
// ⚠ A bis G laufen im Standardmodus "classic". Wer hier eine Stufe
// ergaenzt, die an der Normierung haengt (Marktrelevanz, Alters-Faktor,
// Ueberraschungsgroesse), MUSS den Modus wie in G0 ausdruecklich setzen -
// in "classic" ist indNormFactor() immer 1 und die Stufe waere gruen, ohne
// je etwas geprueft zu haben.
//
// ⚠ Was dieser Waechter NICHT prueft: ob die Zahlen des Scores stimmen. Das
// macht check/score.js / check/scorediff.js. Hier geht es allein darum, dass
// die Historie dieselben Zahlen ZEIGT, die der Score rechnet.
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const IND_STALE_CYCLES = 2;   // muss zu js/score.js passen, s. Abschnitt C

let fehler = 0;
const rot = (m) => { console.log('  ✗ ' + m); fehler++; };
const gruen = (m) => console.log('  ✓ ' + m);

(async () => {
  let PW;
  try { PW = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
  catch (e) { console.log('[historie] uebersprungen (kein Playwright)'); process.exit(0); }
  const { wartenBisDatenDa } = require('./warten.js');

  const b = await PW.chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });

  // ── A) Die Score-Linie ────────────────────────────────────────────────
  console.log('── A) Score-Linie: Nulllinie, Farbwechsel, Luecken, Achse ──');
  await p.evaluate(() => { gotoSym('USD'); });
  await p.waitForTimeout(500);
  await p.evaluate(() => openHistModal('USD'));
  await p.waitForTimeout(900);

  const linie = await p.evaluate(() => {
    const sv = document.querySelector('#mHist .histl svg');
    if (!sv) return null;
    const pl = [...sv.querySelectorAll('polyline')];
    const vb = (sv.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const nl = sv.querySelector('line');
    const clips = [...sv.querySelectorAll('clipPath rect')].map(r =>
      ({ y: +r.getAttribute('y'), h: +r.getAttribute('height') }));
    return {
      polylines: pl.length,
      farben: [...new Set(pl.map(e => e.getAttribute('stroke')))],
      geclippt: pl.every(e => !!e.getAttribute('clip-path')),
      nulllinieY: nl ? +nl.getAttribute('y1') : null,
      hoehe: vb[3] || null,
      clips,
      // ⚠ Die Punkte liegen seit 2026-09-18 als HTML-Knoepfe UEBER dem SVG,
      // nicht mehr als <circle> darin: im gestreckten SVG waren sie Ellipsen.
      punkte: (sv.closest('.cax') || document).querySelectorAll('.cax-p').length,
      achse: [...sv.querySelectorAll('text')].map(e => e.textContent),
    };
  });
  if (!linie) rot('Keine Score-Linie im Historie-Fenster gefunden (.histl svg)');
  else {
    // Nulllinie muss INNERHALB der Zeichenflaeche liegen - eine Nulllinie am
    // Rand oder ausserhalb ist keine.
    if (linie.nulllinieY == null || linie.nulllinieY <= 2 || linie.nulllinieY >= linie.hoehe - 2)
      rot(`Nulllinie liegt bei y=${linie.nulllinieY} in einer ${linie.hoehe}px hohen Flaeche — sie muss im Bild liegen`);
    else gruen(`Nulllinie bei y=${linie.nulllinieY.toFixed(1)} von ${linie.hoehe} (im Bild)`);
    // Zwei Farben, und beide muessen Bias-Farben sein (docs/design-system.md,
    // Kerzen-Regel 3: ein Score ueber/unter Null ist eine Aussage ueber das
    // ASSET, also Bias-Palette - nicht --cndl-up/--cndl-dn).
    const BIAS = ['#0B5FCC', '#DC2430'];
    if (linie.farben.length !== 2 || !BIAS.every(f => linie.farben.includes(f)))
      rot(`Die Linie fuehrt ${linie.farben.length} Farbe(n) (${linie.farben.join(', ')}) — erwartet genau die zwei Bias-Farben ${BIAS.join(' / ')}`);
    else gruen('Zwei Bias-Farben: blau ueber Null, rot darunter');
    if (!linie.geclippt)
      rot('Mindestens eine Linie ist nicht an der Nulllinie beschnitten — der Farbwechsel liegt dann am naechsten Datenpunkt statt am Nulldurchgang');
    else gruen('Beide Linien an der Nulllinie beschnitten (Farbwechsel exakt bei 0)');
    if (linie.punkte < 1) rot('Kein anklickbarer Punkt in der Linie');
    else gruen(`${linie.punkte} Punkte an Tagen mit Ursache`);
    // Jede Achsenbeschriftung mit Monatsnamen braucht ein Jahr (Regel
    // 2026-09-17, eigener Waechter check/datum.js - hier nur fuer diese Achse).
    const MON = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;
    const ohneJahr = linie.achse.filter(t => MON.test(t) && !/\d{2}\b/.test(t.replace(/^[^,]*,?/, '')));
    if (ohneJahr.length) rot(`Achsenbeschriftung ohne Jahr: ${ohneJahr.join(' / ')}`);
    else gruen(`Achse mit Jahr: ${linie.achse.filter(t => MON.test(t)).join(' · ')}`);
  }

  // Luecken: ein Tag ohne aufgezeichneten Score darf die Linie UNTERBRECHEN,
  // nicht ueberbrueckt werden. Gepruefte Behauptung: die Zahl der
  // Linienabschnitte entspricht der Zahl zusammenhaengender Wertelaeufe.
  const luecken = await p.evaluate(() => {
    const items = window.histLinienDaten || [];
    let laeufe = 0, lauf = 0;
    items.forEach(i => { if (i.score == null) { if (lauf > 1) laeufe++; lauf = 0; } else lauf++; });
    if (lauf > 1) laeufe++;
    const pl = document.querySelectorAll('#mHist .histl svg polyline').length;
    return { tage: items.length, ohneScore: items.filter(i => i.score == null).length, laeufe, polylines: pl };
  });
  if (luecken.laeufe * 2 !== luecken.polylines)
    rot(`${luecken.laeufe} zusammenhaengende Wertelaeufe, aber ${luecken.polylines} Linien (erwartet ${luecken.laeufe * 2}: je Lauf eine blaue und eine rote Kopie) — eine Luecke wird ueberbrueckt`);
  else gruen(`${luecken.tage} Tage, ${luecken.ohneScore} ohne Score, ${luecken.laeufe} Abschnitt(e) — keine Luecke ueberbrueckt`);

  // ── B) Klick auf einen Punkt fuehrt zur Zeile ─────────────────────────
  console.log('\n── B) Klick auf einen Linienpunkt ──');
  const klick = await p.evaluate(async () => {
    const g = document.querySelector('#mHist .histl .cax-p');
    if (!g) return { keinPunkt: true };
    // Aus dem onclick-Attribut das Zieldatum lesen, damit geprueft werden
    // kann, ob DIE RICHTIGE Zeile markiert wird - nicht irgendeine.
    const soll = (g.getAttribute('onclick') || '').match(/'([\d-]{10})'/);
    g.click();
    await new Promise(r => setTimeout(r, 400));
    const tr = document.querySelector('#mHist .hw-day.hw-jump');
    return { soll: soll ? soll[1] : null, ist: tr ? tr.getAttribute('data-d') : null };
  });
  if (klick.keinPunkt) rot('Kein Punkt zum Klicken');
  else if (!klick.ist) rot(`Klick auf den Punkt ${klick.soll} markiert keine Zeile (histJumpDay fehlt in der window-Bruecke?)`);
  else if (klick.ist !== klick.soll) rot(`Klick auf ${klick.soll} markiert die Zeile ${klick.ist}`);
  else gruen(`Klick auf ${klick.soll} markiert genau diese Zeile`);

  // ── C) Alterung unabhaengig nachrechnen ───────────────────────────────
  console.log('\n── C) Alterung: Ueberfaelligkeit unabhaengig nachgerechnet ──');
  // ⚠ NICHT gegen ind_data.json. Der erste Entwurf dieses Abschnitts tat das
  // und meldete alle 6 Zeilen als "nicht nachrechenbar" - nachgemessen lag es
  // daran, dass diese Indikatoren im Feed GAR NICHT vorkommen: EUR
  // "JOLTS Job Openings" hat chartHist.length 0 und lebt von research.date
  // (2026-03-18, recherchiert mit Quell-URL) plus dem erklaerten Intervall
  // ("quarterly" -> 90 Tage). Das sind exakt dieselben Eingaben, aus denen
  // auch der Produktivpfad indOverdueCycles seine OUT-OF-DATE-Marke bildet.
  // Der Waechter rechnet deshalb GENAU DIESE Arithmetik unabhaengig nach:
  // Zyklus aus den echten Abstaenden (Median) bzw. aus dem Intervalltext,
  // Alter aus dem letzten Release vor dem Stichtag, und zusaetzlich, dass der
  // Tag DAVOR die Grenze noch nicht ueberschritten hatte.
  const TEXT_ZYKLUS = [[/week/, 7], [/quarter/, 90], [/year|annual/, 365], [/month/, 30]];
  const zyklusAusText = (t) => {
    const s = String(t || '').toLowerCase();
    for (const [re, d] of TEXT_ZYKLUS) if (re.test(s)) return d;
    return null;
  };
  const angezeigt = await p.evaluate(() => {
    const tg = n => { const x = new Date(); x.setDate(x.getDate() + n);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const out = [];
    syms.forEach(s => {
      if (!s.rubrics) return;
      for (let k = 1; k <= 90; k++) {
        const tag = tg(-k + 1);
        let w = [];
        try { w = histAlterungsWechsel(s, tag, tg(-k)); } catch (e) { return; }
        w.forEach(x => {
          // Die ROHEN Eingaben mitgeben, damit Node die Rechnung selbst
          // nachvollzieht - nicht das Ergebnis.
          const rub = (s.rubrics || []).find(r => r.name === x.rubrik);
          const ind = rub ? (rub.indicators || []).find(i => (i.displayName || i.name) === x.name || i.name === x.name) : null;
          out.push({ sym: s.id, ccy: macroCcyFor(s.id), tag, name: x.name, base: x.base,
            wirkung: x.wirkung, zyklen: x.zyklen, cyc: x.cyc, release: x.release,
            roh: ind ? {
              histDaten: Array.isArray(ind.chartHist)
                ? ind.chartHist.map(e => String((e && e[0]) || '').slice(0, 10)).filter(Boolean) : [],
              resDatum: ind.research && ind.research.date ? String(ind.research.date).slice(0, 10) : null,
              interval: ind.interval || (ind.research && ind.research.interval) || null,
            } : null });
        });
      }
    });
    return out;
  });
  console.log(`  ${angezeigt.length} Alterungs-Wechsel in 90 Tagen ueber alle Assets`);
  if (!angezeigt.length) {
    // Kein harter Fehler - es kann wirklich keinen geben. Aber dann muss der
    // Rechenweg belegt sein, sonst ist die Pruefung leer-gruen (genau der
    // Fehler, der check/datum.js Stufe 3 zuerst unterlaufen ist).
    const probe = await p.evaluate(() => {
      const s = syms.find(x => x.id === 'USD');
      const infl = (s.rubrics || []).find(r => r.name === 'Inflation');
      const ind = (infl.indicators || []).find(i => /CPI \(Headline\)/.test(i.name)) || infl.indicators[0];
      const a = histIndAltAm(ind, new Date().toISOString().slice(0, 10));
      return a ? { name: ind.name, zyklen: Math.round(a.zyklen * 100) / 100, cyc: Math.round(a.cyc), release: a.release } : null;
    });
    if (!probe) rot('Kein Alterungs-Wechsel UND histIndAltAm liefert fuer USD/CPI nichts — der Rechenweg ist damit ungeprueft');
    else gruen(`Kein Wechsel in 90 Tagen (kann sein). Rechenweg belegt: ${probe.name} ist ${probe.zyklen} Zyklen alt (Zyklus ${probe.cyc}d, Release ${probe.release})`);
  }
  let cGeprueft = 0;
  angezeigt.forEach(a => {
    if (!a.roh) { rot(`${a.sym} ${a.name}: Indikator auf dem Symbol nicht wiederauffindbar — nicht nachrechenbar`); return; }
    const ds = a.roh.histDaten.slice().sort();
    let cyc = null, quelle = '';
    if (ds.length >= 4) {
      const gaps = [];
      for (let i = 1; i < ds.length; i++) gaps.push((new Date(ds[i]) - new Date(ds[i - 1])) / 86400000);
      gaps.sort((x, y) => x - y);
      cyc = gaps[Math.floor(gaps.length / 2)];
      quelle = `Median von ${gaps.length} echten Abstaenden`;
    } else {
      cyc = zyklusAusText(a.roh.interval);
      quelle = `Intervalltext "${a.roh.interval}"`;
    }
    if (cyc == null) { rot(`${a.sym} ${a.name}: Zyklus weder aus ${ds.length} Datenpunkten noch aus dem Intervall ("${a.roh.interval}") bestimmbar — dann darf keine Altersgrenze behauptet werden`); return; }
    cGeprueft++;
    if (Math.abs(cyc - a.cyc) > Math.max(1, cyc * 0.1))
      rot(`${a.sym} ${a.name}: Anzeige nennt Zyklus ${a.cyc}d, nachgerechnet ${Math.round(cyc)}d (${quelle})`);
    const vor = ds.filter(d => d <= a.tag);
    const rel = vor.length ? vor[vor.length - 1] : a.roh.resDatum;
    if (rel !== a.release)
      rot(`${a.sym} ${a.name} am ${a.tag}: Anzeige nennt Release ${a.release}, nachgerechnet ${rel}`);
    const zyk = (new Date(a.tag) - new Date(rel)) / 86400000 / cyc;
    if (!(zyk > IND_STALE_CYCLES))
      rot(`${a.sym} ${a.name} am ${a.tag}: als "aged out" gezeigt, nachgerechnet aber nur ${Math.round(zyk * 100) / 100} Zyklen ueberfaellig (Grenze ${IND_STALE_CYCLES})`);
    if (Math.abs(zyk - a.zyklen) > 0.15)
      rot(`${a.sym} ${a.name} am ${a.tag}: Anzeige ${a.zyklen} Zyklen, nachgerechnet ${Math.round(zyk * 100) / 100}`);
    const vorTag = new Date(new Date(a.tag) - 86400000).toISOString().slice(0, 10);
    const relV = ds.filter(d => d <= vorTag);
    const relVor = relV.length ? relV[relV.length - 1] : a.roh.resDatum;
    const zykV = (new Date(vorTag) - new Date(relVor)) / 86400000 / cyc;
    if (zykV > IND_STALE_CYCLES)
      rot(`${a.sym} ${a.name}: als Wechsel AM ${a.tag} gezeigt, war aber schon am ${vorTag} ueberfaellig (${Math.round(zykV * 100) / 100} Zyklen)`);
  });
  if (angezeigt.length && !cGeprueft)
    rot(`${angezeigt.length} Alterungs-Wechsel gemeldet, aber KEINER nachgerechnet — die Pruefung waere leer-gruen`);
  else if (cGeprueft) gruen(`${cGeprueft} von ${angezeigt.length} Alterungs-Zeilen unabhaengig nachgerechnet (Zyklus, Release, Grenze, Wechseltag)`);
  console.log('\n── D) Alterungs-Schalter ──');
  // Ein Asset waehlen, bei dem es ueberhaupt eine Alterungszeile gibt.
  const mitAlterung = angezeigt.length ? angezeigt[0].sym : 'EUR';
  const schalter = await p.evaluate(async (id) => {
    closeM('mHist'); await new Promise(r => setTimeout(r, 200));
    gotoSym(id); await new Promise(r => setTimeout(r, 400));
    openHistModal(id); await new Promise(r => setTimeout(r, 700));
    setHistRange(90); await new Promise(r => setTimeout(r, 700));
    const knopf = document.querySelector('#mHist .histp-agebtn');
    const an = document.querySelectorAll('#mHist .histp-age').length;
    if (!knopf) return { keinKnopf: true, an };
    knopf.click(); await new Promise(r => setTimeout(r, 600));
    const aus = document.querySelectorAll('#mHist .histp-age').length;
    document.querySelector('#mHist .histp-agebtn').click();
    await new Promise(r => setTimeout(r, 600));
    const wieder = document.querySelectorAll('#mHist .histp-age').length;
    return { an, aus, wieder };
  }, mitAlterung);
  if (schalter.keinKnopf) rot('Kein Alterungs-Schalter (.histp-agebtn) im Fenster');
  else if (!schalter.an) rot(`${mitAlterung}: keine Alterungszeile im 3M-Bereich, obwohl Abschnitt C dort einen Wechsel ausgibt — der Schalter ist damit ungeprueft`);
  else if (schalter.aus !== 0) rot(`Schalter aus: es stehen weiter ${schalter.aus} Alterungszeilen da`);
  else if (schalter.wieder !== schalter.an) rot(`Schalter wieder an: ${schalter.wieder} statt ${schalter.an} Alterungszeilen`);
  else gruen(`${mitAlterung}: ${schalter.an} → 0 → ${schalter.wieder} Alterungszeilen (Regel 6: der Knopf tut etwas)`);

  // ── E) Jeden Tag einzeln, "No data released" statt Sammelzeile ────────
  console.log('\n── E) Jeden Tag einzeln, leere Tage benannt ──');
  const tage = await p.evaluate(async () => {
    setHistRange(30); await new Promise(r => setTimeout(r, 700));
    const zeilen = [...document.querySelectorAll('#mHist .hw-day')];
    const daten = zeilen.map(z => z.getAttribute('data-d')).filter(Boolean);
    const leer = zeilen.filter(z => /No data released/.test(z.textContent)).length;
    const alteMeldung = zeilen.filter(z => /no recorded cause/.test(z.textContent)).length;
    const sammel = zeilen.filter(z => /days? without a recorded cause/.test(z.textContent)).length;
    const kopfzeilen = document.querySelectorAll('#mHist .hw-cols').length;
    return { zeilen: zeilen.length, eindeutig: new Set(daten).size, leer, alteMeldung, sammel, kopfzeilen };
  });
  if (tage.zeilen !== tage.eindeutig)
    rot(`${tage.zeilen} Tageszeilen, aber nur ${tage.eindeutig} verschiedene Datumsangaben — ein Tag kommt doppelt vor`);
  else gruen(`${tage.zeilen} Tageszeilen, alle mit eigenem Datum ("jeden tag einzeln")`);
  if (tage.sammel) rot(`${tage.sammel} zusammengefasste Sammelzeile(n) — der Nutzer hat ausdruecklich jeden Tag einzeln verlangt`);
  if (tage.alteMeldung) rot(`${tage.alteMeldung}x steht noch "no recorded cause" — ersetzt durch "No data released"`);
  else gruen(`${tage.leer} Tage sagen "No data released"`);
  if (tage.kopfzeilen !== 1)
    rot(`${tage.kopfzeilen} Spaltenkoepfe (DAY/SCORE/Δ/...) — es darf genau EINER sein, vorher stand er pro Woche da`);
  else gruen('Genau eine Spaltenkopfzeile');

  // ── F) Kein Ueberlauf, Kopf klebt ─────────────────────────────────────
  console.log('\n── F) Fuenf Fensterbreiten: kein Ueberlauf, Kopf klebt ──');
  for (const w of [1500, 1280, 1024, 820, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(350);
    const m = await p.evaluate(() => {
      const mod = document.querySelector('#mHist .modal');
      const sc = document.querySelector('#mHist .histp');
      const cols = document.querySelector('#mHist .hw-cols');
      if (!mod || !sc) return null;
      const r = mod.getBoundingClientRect();
      return {
        breiter: Math.round(r.width - document.documentElement.clientWidth),
        quer: sc.scrollWidth - sc.clientWidth,
        klebt: cols ? getComputedStyle(cols).position : null,
        sichtbareTage: (() => {
          const rr = sc.getBoundingClientRect();
          return [...document.querySelectorAll('#mHist .hw-day')]
            .filter(t => { const x = t.getBoundingClientRect(); return x.top >= rr.top - 1 && x.bottom <= rr.bottom + 1; }).length;
        })(),
      };
    });
    if (!m) { rot(`${w}px: Fenster nicht gefunden`); continue; }
    if (m.breiter > 1) rot(`${w}px: das Fenster ist ${m.breiter}px breiter als der Bildschirm`);
    else if (m.quer > 1) rot(`${w}px: die Tagesliste scrollt ${m.quer}px waagrecht`);
    else if (m.klebt !== 'sticky') rot(`${w}px: die Spaltenkopfzeile klebt nicht (position:${m.klebt})`);
    else gruen(`${w}px: kein Ueberlauf, Kopf klebt, ${m.sichtbareTage} Tage gleichzeitig sichtbar`);
  }

  // ── G) EIN SYNC OHNE ZUSTANDSAENDERUNG SCHREIBT KEINE HISTORIE ─────
  // Nutzer-Bugreport 2026-09-20 (Screenshot CHF-History): "Die Scores
  // aendern sich wegen irgendwelchen Syncs das kann nicht sein."
  //
  // Gemessen war: das Adoptieren eines IDENTISCHEN Standes liess die Scores
  // unveraendert, schrieb aber ELF Eintraege mit Bewegungen bis 5,8 Punkten
  // (GOLD -2,8, JPYIELD +5,8, GBYIELD +3,9). Ursache: recomputeAuto() zog
  // seinen Vergleichswert MITTEN im Aufbau - reapplyLiveFeeds() hatte die
  // abgeleiteten Indikator-Biasse gerade zurueckgesetzt, bei GOLD standen
  // PPI/PCE/Bond Yields/NFP alle auf 'neu'. Das Delta war die Differenz zu
  // einem Zwischenzustand, den niemand je gesehen hat.
  //
  // ⚠ Die Pruefung hat ZWEI Haelften, und die zweite ist die wichtigere:
  // ein Waechter, der nur "keine Eintraege" verlangt, waere auch dann gruen,
  // wenn die Protokollierung komplett kaputt ist. Deshalb muss eine ECHTE
  // Aenderung im selben Lauf weiterhin genau EINEN Eintrag mit dem
  // RICHTIGEN Delta erzeugen.
  await p.setViewportSize({ width: 1500, height: 1000 });

  // ── G0) DASSELBE, ABER DIREKT NACH DEM BOOT ────────────────────────
  // ⚠ Nutzer-Screenshot 2026-09-20 18:00, VERSION-CHECK-533: in der
  // USD-History standen schon wieder zwei Sync-Zeilen ("auto +0.2",
  // "auto -0.9") - obwohl Stufe G unten gruen war. Der Waechter hat den
  // Fall nicht gesehen, weil er ihn zu SPAET prueft: bis Abschnitt G sind
  // in A-F laengst etliche recomputeAuto()-Durchlaeufe gelaufen und haben
  // den eingeschwungenen Vergleichsstand aufgefrischt.
  //
  // Der Fehler lebt aber genau in dem Fenster, das der Nutzer erwischt:
  // zwischen dem letzten recomputeAuto() des Bootvorgangs und dem ersten
  // Sync danach trifft der PREIS-Feed ein. Seit die Marktrelevanz nicht
  // mehr eingefroren ist (SCORE_MODEL_VERSION 13), veraendert das jeden
  // Score im Modus normalized - und fetchPriceData steht nicht in
  // bootFetchScoreFeeds, es folgt also kein Durchlauf, der den
  // Vergleichsstand nachzieht. Der naechste Sync bekam die ganze
  // Feed-Bewegung angehaengt. Gemessen vor dem Fix: 0 echte Aenderungen,
  // 20 protokollierte Eintraege, USD +0,2 - exakt die Zahl im Foto.
  //
  // ⚠ MERKSATZ FUER KUENFTIGE STUFEN: eine Pruefung, die den Zustand erst
  // warmlaeuft, prueft nicht mehr den Zustand des Nutzers. Deshalb laedt
  // diese hier ausdruecklich NEU und misst als Allererstes.
  // ⚠⚠ UND IM MODUS "normalized" - das ist der zweite Grund, warum Stufe G
  // den Fall nicht gesehen hat. Dieser Waechter setzt fxpro_score_mode
  // nirgends, laeuft also durchgehend in "classic". Dort ist indNormFactor()
  // per Definition 1: die Marktrelevanz spielt keine Rolle, der Preis-Feed
  // bewegt keinen Score, und der Fehler KANN nicht auftreten. Der Nutzer
  // fuehrt die App aber in "normalized" - genau dort, wo es passiert.
  // Gegenprobe beim Einbau: ohne diese Zeile bleibt G0 auch mit wieder
  // ausgebautem Fix gruen, mit ihr meldet sie 20 Phantom-Eintraege.
  console.log('\n── G0) Sync direkt nach dem Boot, Modus normalized ──');
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_score_mode', 'normalized'); } catch (e) {} });
  await p.goto(URL);
  await p.evaluate(() => { try { localStorage.setItem('fxpro_score_mode', 'normalized'); } catch (e) {} });
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });
  await p.waitForTimeout(3000);   // Preis-Feed nachlaufen lassen wie beim echten Nutzer
  const g0 = await p.evaluate(() => {
    const scores = () => { const m = {}; (syms || []).forEach(s => m[s.id] = symScoreCmp(s)); return m; };
    const vor = scores(), n0 = (scoreLog || []).length;
    _flipCauseTag = 'sync'; applySnap(snap()); _flipCauseTag = null;
    const nach = scores();
    const bewegt = Object.keys(vor).filter(k => Math.abs(nach[k] - vor[k]) > 0.05);
    return { bewegt, phantom: (scoreLog || []).slice(n0).map(x => x.sym + ' ' + x.delta) };
  });
  if (g0.bewegt.length)
    rot('Ein identischer Sync direkt nach dem Boot hat den Score veraendert: ' + g0.bewegt.join(', '));
  else if (g0.phantom.length)
    rot(`Sync direkt nach dem Boot: 0 echte Aenderungen, aber ${g0.phantom.length} History-Eintrag/Eintraege ` +
        `(${g0.phantom.slice(0, 6).join(', ')}). Der eingeschwungene Vergleichsstand ist veraltet - ` +
        `zwischen ihm und jetzt hat ein Feed geliefert, siehe _feedStamp() in recomputeAuto().`);
  else gruen('Sync direkt nach dem Boot: Score unveraendert, kein History-Eintrag');

  console.log('\n── G) Sync ohne Aenderung schreibt nichts, echte Aenderung schon ──');
  const g = await p.evaluate(() => {
    const R = {};
    const sc = id => { const s = (syms || []).find(x => x.id === id); return s ? symScoreCmp(s) : null; };
    const scores = () => { const m = {}; (syms || []).forEach(s => m[s.id] = symScoreCmp(s)); return m; };
    const diff = (a, c) => { const o = {}; Object.keys(a).forEach(k => { const d = +(c[k] - a[k]).toFixed(2); if (Math.abs(d) > 0.05) o[k] = d; }); return o; };

    // 1) Identischen Stand adoptieren - zweimal, damit auch ein
    //    "beim ersten Mal noch nicht eingeschwungen" auffliegt.
    const vor = scores(), n0 = (scoreLog || []).length;
    for (let k = 0; k < 2; k++) { _flipCauseTag = 'sync'; applySnap(snap()); _flipCauseTag = null; }
    R.scoreAenderung = diff(vor, scores());
    R.phantom = (scoreLog || []).slice(n0).map(x => x.sym + ' ' + x.delta);

    // 2) Echte Strukturaenderung muss weiterhin sauber protokolliert werden.
    const sy = (syms || []).find(x => x.id === 'GOLD');
    const rub = sy && (sy.rubrics || []).find(r => (r.indicators || []).length);
    if (rub) {
      const v = sc('GOLD'), n1 = (scoreLog || []).length;
      for (let k = 0; k < 3; k++) rub.indicators.push({ id: 'waechter' + k, name: 'WAECHTER-TEST-' + k, bias: 'bull', imp: true, date: '', interval: '', points: [] });
      _flipCauseTag = 'structure'; recomputeAuto(); _flipCauseTag = null;
      const n = sc('GOLD');
      const e = (scoreLog || []).slice(n1).filter(x => x.sym === 'GOLD');
      R.echt = { delta: +(n - v).toFixed(2), eintraege: e.length, protokolliert: e.map(x => x.delta) };
      rub.indicators = rub.indicators.filter(i => !/^WAECHTER-TEST-/.test(i.name));
      _flipCauseTag = 'structure'; recomputeAuto(); _flipCauseTag = null;
    }
    return R;
  });
  if (Object.keys(g.scoreAenderung).length)
    rot('Ein identischer Sync hat den Score veraendert: ' + JSON.stringify(g.scoreAenderung));
  else if (g.phantom.length)
    rot(`Ein Sync OHNE jede Zustandsaenderung hat ${g.phantom.length} History-Eintrag/Eintraege geschrieben: ${g.phantom.slice(0, 6).join(', ')}`);
  else gruen('identischer Sync (2x): Score unveraendert, kein History-Eintrag');
  if (!g.echt) rot('Gegenprobe nicht ausfuehrbar - keine Rubrik mit Indikatoren bei GOLD gefunden');
  else if (g.echt.eintraege !== 1)
    rot(`Echte Aenderung (${g.echt.delta}) erzeugte ${g.echt.eintraege} Eintraege statt genau einem - die Protokollierung ist kaputt`);
  else if (Math.abs(g.echt.protokolliert[0] - g.echt.delta) > 0.15)
    rot(`Echte Aenderung: Score bewegte sich um ${g.echt.delta}, protokolliert wurde ${g.echt.protokolliert[0]}`);
  else gruen(`echte Aenderung: Score ${g.echt.delta}, genau ein Eintrag mit demselben Delta`);

  // ── G2) DIE FEED-URSACHEN DUERFEN NICHT MITVERSCHLUCKT WERDEN ──────
  // Die Feed-Stempel-Pruefung in recomputeAuto() unterdrueckt eine
  // Bewegung, die eine fremde Lieferung verursacht hat. Bei cot/sentiment/
  // bond/seasonality IST die Lieferung aber die genannte Ursache - dort
  // waere Verschweigen genauso falsch wie Erfinden. Gegenprobe beim Einbau:
  // 'cot' aus FEED_ERKLAERT_VON entfernt -> diese Stufe meldet 0 Eintraege.
  console.log('\n── G2) Eine Feed-Ursache wird weiterhin benannt ──');
  const g2 = await p.evaluate(() => {
    const sc = () => { const s = (syms || []).find(x => x.id === 'USD'); return s ? symScoreCmp(s) : null; };
    const sy = (syms || []).find(x => x.id === 'USD');
    const rub = sy && (sy.rubrics || []).find(r => r.name === 'COT Data');
    const ind = rub && (rub.indicators || [])[0];
    if (!ind) return null;
    const v = sc(), n = (scoreLog || []).length, alt = ind.bias, altPkt = ind.pkt;
    ind.bias = (alt === 'bull') ? 'bear' : 'bull';
    // Seit 2026-09-24 zaehlen COT-Zeilen feste Punkte (ind.pkt) - der Bias
    // allein bewegt den Score nicht mehr. Die Lieferung aendert also auch pkt.
    if (typeof altPkt === 'number') ind.pkt = altPkt > 0 ? -0.75 : 0.75;
    // Eine echte Lieferung ersetzt das Feed-Objekt - genau das nachstellen.
    window.COT_DATA = Object.assign({}, window.COT_DATA || {});
    _flipCauseTag = 'cot'; recomputeAuto(); _flipCauseTag = null;
    const e = (scoreLog || []).slice(n).filter(x => x.sym === 'USD');
    const r = { delta: +(sc() - v).toFixed(2), eintraege: e.length, cause: e[0] && e[0].cause, protokolliert: e[0] && e[0].delta };
    ind.bias = alt; if (typeof altPkt === 'number') ind.pkt = altPkt; _flipCauseTag = 'cot'; recomputeAuto(); _flipCauseTag = null;
    return r;
  });
  if (!g2) rot('Gegenprobe nicht ausfuehrbar - keine COT-Karte bei USD gefunden');
  else if (Math.abs(g2.delta) < 0.1) rot('Gegenprobe untauglich: der COT-Bias-Wechsel bewegte den Score gar nicht');
  else if (g2.eintraege !== 1 || g2.cause !== 'cot')
    rot(`Eine COT-Lieferung bewegte den Score um ${g2.delta}, protokolliert wurden ${g2.eintraege} Eintraege ` +
        `(Ursache ${g2.cause}) - die Feed-Stempel-Pruefung verschluckt eine echte Ursache.`);
  else gruen(`COT-Lieferung: Score ${g2.delta}, genau ein Eintrag mit Ursache "cot"`);

  if (perr.length) { rot('Seitenfehler: ' + [...new Set(perr)].slice(0, 3).join(' | ')); }
  // ── H) DIE ZAHL AM EVENT IST DIE TAGESWIRKUNG, KEIN STAND ──────────
  // Nutzer-Bugreport 2026-09-20, dritter Anlauf ("Immernoch ergibt es keinen
  // Sinn"): am Samstag standen zwei Zeilen mit +0,5 und +0,5, daneben ein
  // Tagesdelta von -1,8. Ursache war, dass effOf() den HEUTIGEN Beitrag
  // (indScoreParts) auf ein altes Datum stempelte - ein Stand neben einem
  // Delta. Drei Haelften, jede mit eigener Gegenprobe:
  //   1. Bei einem vergangenen Release muss die Zahl von indScoreParts(heute)
  //      ABWEICHEN, sobald der Decay gewirkt hat. Sonst ist es wieder der Stand.
  //   2. Laufende Zustaende (Bond/COT/Sentiment) fuehren keine Beitrags-Reihe
  //      je Tag - sie duerfen KEINE Zahl behaupten, sondern zeigen einen Strich.
  //   3. Die Zahl steht auf derselben Skala wie Delta und Kartenzerlegung
  //      (roh x Fairness-Faktor). Sonst sind es wieder zwei Massstaebe.
  // ⚠ Modus normalized, aus demselben Grund wie bei G0: ohne Decay ist der
  // heutige Stand zufaellig gleich der Tageswirkung und Haelfte 1 waere blind.
  console.log('\n── H) Event-Zahl = Tageswirkung, nicht heutiger Stand ──');
  const h1 = await p.evaluate(() => {
    const byD = symScoreDrivingEventsByDate('USD');
    const heute = todayStr();
    const rel = [], lauf = [];
    Object.keys(byD).forEach(d => (byD[d] || []).forEach(e => {
      const o = { d, n: e.name, sc: e.sc, wk: e.scWirkung, art: e.bond ? 'bond' : e.cot ? 'cot' : e.sent ? 'sent' : 'release' };
      (o.art === 'release' ? rel : lauf).push(o);
    }));
    // Ein vergangenes Release mit spuerbarem Beitrag - dort muss der Decay
    // zwischen "damals" und "heute" einen Unterschied machen.
    const probe = rel.filter(o => o.d < heute && o.sc != null && Math.abs(o.sc) > 0.2);
    const gleich = probe.filter(o => o.wk == null || Math.abs(o.wk - o.sc) < 0.01);
    return { relN: rel.length, laufN: lauf.length, probeN: probe.length,
      gleich: gleich.slice(0, 4), mitZahl: lauf.filter(o => o.wk != null).slice(0, 4) };
  });
  if (!h1.probeN) rot('Kein vergangenes Release mit Beitrag gefunden - Stufe H kann nichts zeigen');
  else if (h1.gleich.length === h1.probeN)
    rot(`Alle ${h1.probeN} vergangenen Releases zeigen exakt ihren HEUTIGEN Beitrag als Tageswirkung `
      + `(${h1.gleich.map(o => o.n + ' ' + o.sc).join(', ')}) - die Zeile nennt wieder einen Stand statt einer Veraenderung.`);
  else gruen(`${h1.probeN - h1.gleich.length} von ${h1.probeN} vergangenen Releases zeigen eine Tageswirkung, die vom heutigen Stand abweicht`);
  // ⚠ AKTIV pruefen, nicht bloss nachsehen. Bond/COT/Sentiment haben heute
  // gar keine chartHist - die Sperre in histIndBeitragAm ist damit bei den
  // aktuellen Daten redundant, und ein blosses "traegt keine Zahl" waere auch
  // mit ausgebauter Sperre gruen (im ersten Anlauf genau so gemessen).
  // Deshalb bekommt eine Bond-Zeile hier eine Historie angehaengt: auch DANN
  // darf keine Tageswirkung entstehen, denn der Beitrag einer laufenden
  // Messung laesst sich daraus nicht rekonstruieren.
  const h1b = await p.evaluate(() => {
    const sy = syms.find(s => s.id === 'USD');
    let ziel = null, rubZ = null;
    (sy.rubrics || []).forEach(r => (r.indicators || []).forEach(i => {
      const rr = i.research || {};
      if (!ziel && (rr.bond || rr.cot || rr.sent)) { ziel = i; rubZ = r; }
    }));
    if (!ziel) return null;
    const alt = ziel.chartHist;
    const heute = todayStr();
    const tag = n => { const d = new Date(heute); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    ziel.chartHist = [[tag(40), '1', '0.9'], [tag(30), '1.1', '1'], [tag(20), '1.2', '1.1'],
                      [tag(10), '1.3', '1.2'], [tag(2), '1.4', '1.3'], [tag(1), '1.5', '1.4']];
    let wk = null; try { wk = histIndWirkungAm(ziel, rubZ, 'USD', tag(1)); } catch (e) { wk = 'ERR'; }
    ziel.chartHist = alt;
    return { name: ziel.name, wirkung: wk };
  });
  if (!h1b) rot('Kein laufender Zustand (Bond/COT/Sentiment) bei USD gefunden - Haelfte 2 laeuft ins Leere');
  else if (h1b.wirkung != null)
    rot(`"${h1b.name}" ist ein laufend gemessener Zustand, hat aber mit angehaengter Historie eine Tageswirkung `
      + `von ${h1b.wirkung} behauptet. Bond/COT/Sentiment fuehren keine Beitrags-Reihe je Tag - dort gehoert `
      + `ein Strich hin, keine Zahl.`);
  else if (h1.mitZahl.length)
    rot(`Laufende Zustaende behaupten eine Tageswirkung: ${h1.mitZahl.map(o => o.art + ' ' + o.n + ' = ' + o.wk).join(', ')}.`);
  else gruen(`${h1.laufN} laufende Zustaende zeigen keine Tageswirkung - auch "${h1b.name}" nicht, als ihm testweise eine Historie angehaengt wurde`);

  // 3) Skala: die angezeigte Zahl muss roh x Faktor sein, nicht roh.
  const h2 = await p.evaluate(() => {
    const div = document.createElement('div'); div.innerHTML = renderSymHistoryPanel('USD');
    const byD = symScoreDrivingEventsByDate('USD');
    const sym = syms.find(s => s.id === 'USD');
    const f = symCmpFactor(sym);
    const out = [];
    [...div.querySelectorAll('.hw-day')].forEach(t => {
      const d = t.getAttribute('data-d');
      [...t.querySelectorAll('.histp-evt')].forEach(e => {
        const nm = ((e.querySelector('.histp-name') || {}).textContent || '').trim();
        const v = ((e.querySelector('.histp-eff') || {}).textContent || '').trim();
        if (v === '–' || v === '') return;
        const ev = (byD[d] || []).find(x => nm.indexOf(x.name) === 0);
        if (!ev || ev.scWirkung == null || !ev.scWirkung) return;
        out.push({ d, nm, gezeigt: parseFloat(v), roh: ev.scWirkung, erwartet: Math.round(ev.scWirkung * f * 100) / 100 });
      });
    });
    return { faktor: f, zeilen: out };
  });
  const falscheSkala = h2.zeilen.filter(z => Math.abs(z.gezeigt - z.erwartet) > 0.06);
  if (!h2.zeilen.length) rot('Keine bezifferte Event-Zeile gefunden - die Skalen-Pruefung laeuft ins Leere');
  else if (falscheSkala.length)
    rot(`${falscheSkala.length} Event-Zahl(en) stehen nicht auf der Vergleichsskala: `
      + falscheSkala.slice(0, 3).map(z => `${z.nm} zeigt ${z.gezeigt}, erwartet ${z.erwartet} (roh ${z.roh} x ${h2.faktor})`).join('; ')
      + ' - Delta und Kartenzerlegung rechnen mit dem Faktor, die Event-Zahl muss das auch.');
  else gruen(`${h2.zeilen.length} Event-Zahl(en) auf derselben Skala wie Delta und Kartenzerlegung (Faktor ${h2.faktor})`);

  // ── H2) DIE WOCHENSUMME FOLGT DERSELBEN VERGLEICHSREGEL ────────────
  // Sie rechnete stur "letzter minus erster Tag" - quer ueber einen
  // Modellwechsel, den die Tageszeile daneben mit "n/c" verweigert. Im
  // gemeldeten Screenshot stand oben "+2,3 this week", waehrend die heutige
  // Zeile sagte, sie sei mit gestern nicht vergleichbar.
  console.log('\n── H2) Wochensumme und Tagesdelta folgen derselben Regel ──');
  // ⚠ Geprueft werden die ENDEN der Woche, nicht jeder n/c-Tag darin: die
  // Summe ist "letzter minus erster Tag", ein taglosen Tag in der MITTE macht
  // diese beiden nicht unvergleichbar (erster Entwurf hat genau das
  // faelschlich gemeldet). Ein Modellwechsel ZWISCHEN den Enden ist dagegen
  // genau der Fall aus dem Bugreport: Sonntag unter Modell 13, Montag unter
  // 12, und oben stand trotzdem "+2,3 this week".
  // Sichtbares Merkmal: das Sternchen am Tagesscore markiert einen Eintrag aus
  // einem FRUEHEREN Modell. Tragen die beiden Enden es unterschiedlich, liegt
  // dazwischen ein Wechsel.
  const h3 = await p.evaluate(() => {
    const div = document.createElement('div'); div.innerHTML = renderSymHistoryPanel('USD');
    return [...div.querySelectorAll('.hw-week')].map(w => {
      const mitScore = [...w.querySelectorAll('.hw-day')]
        .map(t => ((t.querySelector('.hw-sc') || {}).textContent || '').trim())
        .filter(x => x && x !== '–');
      return { summe: ((w.querySelector('.hw-hd-n') || {}).textContent || '').trim(),
        erstesAlt: mitScore.length ? /\*/.test(mitScore[mitScore.length - 1]) : null,
        letztesAlt: mitScore.length ? /\*/.test(mitScore[0]) : null,
        n: mitScore.length };
    });
  });
  const widerspruch = h3.filter(w => w.n >= 2 && w.erstesAlt !== w.letztesAlt && /this week/.test(w.summe));
  if (widerspruch.length)
    rot(`${widerspruch.length} Woche(n) nennen eine Summe ("${widerspruch[0].summe}"), obwohl ihre beiden Enden unter `
      + `VERSCHIEDENEN Score-Modellen aufgezeichnet sind. Genau das stand im Bugreport: oben eine Wochensumme, `
      + `unten "n/c" fuer denselben Uebergang.`);
  else gruen(`${h3.length} Wochen: keine nennt eine Summe ueber einen Modellwechsel hinweg`);

  // ── I) KEIN TAGESWERT AUS DEM BOOTZUSTAND ──────────────────────────
  // Nutzer-Bugreport 2026-09-22, vierter Anlauf am selben Thema, Screenshot
  // der NZD-History. In score_hist.json stand ein V: 14.09. 1,5 -> 15.09. 0,6
  // -> 16.09. 1,5, identisch rein und raus, und die Tageszeile behauptete
  // dafuer ein Delta von -2 neben einer BULLISCHEN Veroeffentlichung.
  //
  // URSACHE: recordScoreHist() lief im INIT direkt nach loadScoreHist(), also
  // VOR bootFetchScoreFeeds(). Zu dem Zeitpunkt haben die Indikatoren kein
  // research.date, die abgeleiteten Karten-Biasse fehlen, und vor allem
  // stehen die getrackten Indikatorzahlen falsch - damit symCmpFactor. Der
  // aufgezeichnete Tageswert war ein Zwischenzustand, den niemand je auf dem
  // Bildschirm hatte. Gemessen an NZD mit verzoegerten Feeds:
  //   beim Boot      cmp 0,71  roh 1,98  aufgezeichnet 1,4
  //   nach den Feeds cmp 1,11  roh 2,01  aufgezeichnet 2,2
  // Der ROHE Score ist praktisch gleich - die aufgezeichnete Zahl liegt
  // trotzdem 0,8 auseinander. Bleibt die App offen, ueberschreibt ein
  // spaeterer Lauf das; wird sie kurz geoeffnet und geschlossen, bleibt der
  // Muell als Tageswert stehen und die ganze Historie rechnet mit ihm.
  //
  // ⚠ ZWEI HAELFTEN, und die zweite ist die wichtigere: ein Waechter, der nur
  // "vor den Feeds wird nichts geschrieben" verlangt, waere auch dann gruen,
  // wenn ueberhaupt nichts mehr aufgezeichnet wird. Nach den Feeds MUSS der
  // Tageswert dem Live-Score entsprechen.
  console.log('\n── I) Kein Tageswert aus dem Bootzustand ──');
  const pI = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await pI.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_score_mode', 'normalized');
  } catch (e) {} });
  // Feeds verzoegern wie bei einer langsamen Verbindung.
  await pI.route('**/ind_data.json*', async r => { await new Promise(x => setTimeout(x, 4000)); r.continue(); });
  await pI.route('**/price_data.json*', async r => { await new Promise(x => setTimeout(x, 4500)); r.continue(); });
  await pI.goto(URL, { waitUntil: 'domcontentloaded' });
  await pI.waitForFunction(() => Array.isArray(window.syms) && window.syms.length, { timeout: 20000 });
  await pI.waitForTimeout(600);
  const iFrueh = await pI.evaluate(() => {
    const s = syms.find(x => x.id === 'NZD') || syms[0];
    const h = ((window.scoreHist || {})[s.id]) || [];
    const heute = todayStr(), e = h.filter(x => x[0] === heute)[0] || null;
    return { id: s.id, live: symScoreCmp(s), eintrag: e ? e[1] : null, cmp: e ? e[7] : null,
      feeds: JSON.parse(JSON.stringify(window.DATA_LIVE_OK || {})) };
  });
  await wartenBisDatenDa(pI);
  await pI.waitForTimeout(7000);
  const iSpaet = await pI.evaluate(() => {
    const s = syms.find(x => x.id === 'NZD') || syms[0];
    const h = ((window.scoreHist || {})[s.id]) || [];
    const heute = todayStr(), e = h.filter(x => x[0] === heute)[0] || null;
    return { live: symScoreCmp(s), eintrag: e ? e[1] : null, cmp: e ? e[7] : null,
      feeds: JSON.parse(JSON.stringify(window.DATA_LIVE_OK || {})) };
  });
  await pI.close();
  // ⚠ Bezugspunkt ist der Stand VOR dem Boot, nicht der Live-Score im selben
  // Moment: der laeuft waehrend des Bootvorgangs ohnehin weiter, ein Vergleich
  // damit ist wertlos (erster Entwurf blieb deshalb auch mit ausgebauter
  // Sperre gruen). Vor dem Boot gilt, was in score_hist.json steht - der
  // Browser merged die Datei als Basis. Weicht der Eintrag davon ab, hat die
  // App ihn in dieser Sitzung geschrieben, und zwar vor den Feeds.
  let vorBoot = null;
  try {
    const H = JSON.parse(fs.readFileSync(path.join(WURZEL, 'score_hist.json'), 'utf8'));
    const heute = new Date().toISOString().slice(0, 10);
    const reihe = H[iFrueh.id] || [];
    const tr = reihe.filter(x => x[0] === heute)[0];
    vorBoot = tr ? tr[1] : null;
  } catch (e) {}
  if (iFrueh.feeds.ind === true)
    rot('Der Indikator-Feed war schon beim ersten Messpunkt da - die Verzoegerung greift nicht, Stufe I prueft nichts.');
  else if (iFrueh.eintrag != null && (vorBoot == null || Math.abs(iFrueh.eintrag - vorBoot) > 0.001))
    rot(`Vor den Feeds wurde ein Tageswert geschrieben: ${iFrueh.eintrag}, vor dem Boot stand dort ${vorBoot}. `
      + `Zu dem Zeitpunkt fehlen research.date, die abgeleiteten Karten-Biasse und damit symCmpFactor - `
      + `ein kurz geoeffneter Tab friert so einen Zwischenstand als Tageswert ein. Siehe scoreHistAufzeichenbar().`);
  else gruen(`vor den Feeds kein Tageswert geschrieben (Live stand bei ${iFrueh.live}, aufgezeichnet blieb ${iFrueh.eintrag})`);
  if (iSpaet.eintrag == null)
    rot('Nach den Feeds gibt es ueberhaupt keinen Tageswert - die Sperre greift zu weit, die Historie waechst nicht mehr.');
  else if (Math.abs(iSpaet.eintrag - iSpaet.live) > 0.06)
    rot(`Nach den Feeds weicht der aufgezeichnete Tageswert vom Live-Score ab: ${iSpaet.eintrag} gegen ${iSpaet.live}.`);
  else gruen(`nach den Feeds entspricht der Tageswert dem Live-Score (${iSpaet.eintrag})`);

  await b.close();
  console.log(fehler ? `\n✗ HISTORIE: ${fehler} Fund(e)` : '\n✓ HISTORIE: alles in Ordnung');
  process.exit(fehler ? 1 : 0);
})();
