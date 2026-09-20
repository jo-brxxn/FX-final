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
    const BIAS = ['#0B5FCC', '#C50F1A'];
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

  if (perr.length) { rot('Seitenfehler: ' + [...new Set(perr)].slice(0, 3).join(' | ')); }
  await b.close();
  console.log(fehler ? `\n✗ HISTORIE: ${fehler} Fund(e)` : '\n✓ HISTORIE: alles in Ordnung');
  process.exit(fehler ? 1 : 0);
})();
