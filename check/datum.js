// ══ WAECHTER: JEDES DATUM MIT JAHR, UND ZWAR ZWEISTELLIG ═════════════════
//
// Nutzer-Regel, zweimal gesetzt:
//   2026-09-05: "mach bitte das ueberall wo ein Datum steht in zwei Zahlen
//                immer auch da steht das Jahr also 26 fuer 2026 ... generell
//                in der ganzen Webseite"
//   2026-09-17: "bei allen grafiken oder tabellen oder ueberall wo datums
//                stehen will ich das dort auch die jahreszahl steht aber
//                nicht zb 2026 sonder 26"
//
// Warum es diesen Waechter gibt und nicht nur den Kommentar in
// js/calendar.js: die Regel stand dort ab 2026-09-05 - und war am 2026-09-17
// an 13 Stellen wieder unterlaufen. 8x fehlte das Jahr ganz (Kerzen-Hover,
// zwei Chart-Achsen, Zinspfad-Kacheln), 5x stand es vierstellig da
// (Sicherungen, Papierkorb, Cloud-Status, drei "updated"-Zeilen) - alle ueber
// `toLocaleString()` bzw. `toLocaleDateString('en-GB')` ohne Optionen, also
// genau die Aufrufform, die man beim Schreiben nicht als Datumsformat
// wahrnimmt. Ein Absatz erinnert niemanden; ein roter Lauf schon
// (CLAUDE.md, Meta-Grundsatz).
//
// Geprueft wird in zwei Stufen:
//   1) STATISCH ueber alle FX-Quellen: jeder toLocaleDateString/
//      toLocaleString-Aufruf muss entweder einer der vier zentralen
//      Formatierer in js/calendar.js sein, oder year:'2-digit' mitgeben,
//      oder reine Uhrzeit/Zahl sein (dann ist er kein Datum).
//   2) IN DER SEITE: die vier Formatierer werden echt aufgerufen und ihre
//      Ausgabe gegen die Regel geprueft - damit der Waechter nicht nur die
//      Schreibweise, sondern das Ergebnis pruefen kann.
//
// ⚠ js/rezept/* ist ausgenommen: das ist die ANDERE App (CLAUDE.md, oberster
// Abschnitt) und hat mit den FX-Datumsformaten nichts zu tun.
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLEN = ['js/main.js', 'js/score.js', 'js/calendar.js', 'js/data-feeds.js',
  'js/globe.js', 'js/constants.js', 'js/regime.js', 'js/quickcapture.js',
  'js/assetlayout.js', 'index.html'];

// Die vier zentralen Formatierer. Sie DUERFEN toLocaleDateString direkt
// aufrufen - sie sind die Stelle, an der die Regel einmal steht.
const ZENTRAL = ['fmtDayHdr', 'fmtDayShort', 'fmtMonShort', 'fmtStamp'];

// Ein Aufruf rendert nur dann ein DATUM, wenn er Tag, Monat oder Jahr
// anfordert. `{weekday:'short'}` ist ein Wochentagsname ("Thu"), keine
// Datumsangabe - dort ein Jahr zu fordern waere Unsinn. Genau diese
// Unterscheidung lief in der ersten Fassung dieses Waechters falsch: er
// pruefte den ganzen Argument-String (inklusive Locale) gegen ein Muster
// statt das Options-Objekt, und meldete dadurch 6 Wochentagsnamen rot.
const DATUMSTEILE = /\b(day|month|year|dateStyle)\s*:/;
// Ausnahme mit Begruendung: `// datum-ok: <warum>` in derselben oder einer
// der drei Zeilen darueber (mehrzeilige Kommentarbloecke sind hier ueblich).
// Absichtlich woertlich und greppbar - wer sie setzt, muss dazuschreiben,
// warum: entweder es ist gar kein Datum (Zahlformat), oder das Jahr kommt an
// der Aufrufstelle separat dazu.
const FREIGABE = /\/\/ ?datum-ok:/;
const FREIGABE_ZEILEN = 3;

let fehler = 0, geprueft = 0;

function istZentraleZeile(zeile) {
  return ZENTRAL.some(n => zeile.includes('function ' + n + '('))
    || /^\s*return d\.toLocaleDateString\('en', ?o\)/.test(zeile);
}

console.log('── 1) Statisch: jeder Datums-Aufruf traegt ein zweistelliges Jahr ──');
QUELLEN.forEach(rel => {
  const abs = path.join(WURZEL, rel);
  if (!fs.existsSync(abs)) return;
  const zeilen = fs.readFileSync(abs, 'utf8').split('\n');
  // Innerhalb der vier zentralen Formatierer gilt die Ausnahme. Sie stehen in
  // js/calendar.js zusammen; der Block endet mit fmtStamp.
  let inZentral = false;
  zeilen.forEach((zeile, i) => {
    const nr = i + 1;
    if (ZENTRAL.some(n => zeile.includes('function ' + n + '('))) inZentral = true;
    else if (inZentral && /^(function |const |let |\/\/ ──)/.test(zeile)
      && !ZENTRAL.some(n => zeile.includes(n))) inZentral = false;

    const treffer = [...zeile.matchAll(/\.toLocale(?:Date)?String\(([^;]*?)\)/g)];
    if (!treffer.length) return;
    treffer.forEach(t => {
      const args = t[1];
      const optionen = args.includes('{') ? args.slice(args.indexOf('{')) : '';
      const hatOptionen = !!optionen;
      // Kein Datumsteil angefordert -> es ist keine Datumsangabe (reiner
      // Wochentagsname, reiner Monatsname, Zahlformat, Uhrzeit).
      if (hatOptionen && !DATUMSTEILE.test(optionen)) return;
      // Uhrzeit-Anteil allein ist auch kein Datum.
      if (hatOptionen && /hour:/.test(optionen) && !DATUMSTEILE.test(optionen)) return;
      geprueft++;
      if (inZentral || istZentraleZeile(zeile)) return;
      if (/year:\s*'2-digit'/.test(optionen)) return;
      if (zeilen.slice(Math.max(0, i - FREIGABE_ZEILEN), i + 1).some(z => FREIGABE.test(z))) return;
      // Alles andere ist ein Datum ohne (oder mit vierstelligem) Jahr.
      const grund = /year:\s*'numeric'/.test(optionen) ? "vierstelliges Jahr (year:'numeric')"
        : !hatOptionen ? 'keine Optionen -> Locale-Standard, vierstelliges Jahr'
        : "Datumsteil ohne year:'2-digit'";
      console.log(`  ✗ ${rel}:${nr} — ${grund}`);
      console.log(`      ${zeile.trim().slice(0, 120)}`);
      console.log(`      Fix: einen der vier Formatierer benutzen (${ZENTRAL.join(', ')}),`);
      console.log(`      oder "// datum-ok: <warum>" setzen, wenn das Jahr anderswo dazukommt.`);
      fehler++;
    });
  });
});
console.log(`  ${fehler ? '✗' : '✓'} ${geprueft} Datums-Aufrufe geprueft, ${fehler} ohne zweistelliges Jahr`);

// ── 2) Die Formatierer selbst: stimmt die AUSGABE? ──────────────────────
// Statisch ist nur die Schreibweise geprueft. Ob "26" herauskommt und nicht
// "2026", sagt erst der echte Aufruf.
(async () => {
  let PW;
  try { PW = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
  catch (e) {
    console.log('\n── 2) In der Seite: uebersprungen (kein Playwright) ──');
    process.exit(fehler ? 1 : 0);
  }
  const { wartenBisDatenDa } = require('./warten.js');
  console.log('\n── 2) In der Seite: Ausgabe der vier Formatierer ──');
  const b = await PW.chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  await p.goto(process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html');
  await wartenBisDatenDa(p);

  const res = await p.evaluate(() => {
    const fehlt = [];
    const probe = '2026-03-04';
    const paare = [
      ['fmtDayHdr', typeof fmtDayHdr === 'function' ? fmtDayHdr(probe) : null],
      ['fmtDayShort', typeof fmtDayShort === 'function' ? fmtDayShort(probe) : null],
      ['fmtMonShort', typeof fmtMonShort === 'function' ? fmtMonShort(probe) : null],
      ['fmtStamp', typeof fmtStamp === 'function' ? fmtStamp('2026-03-04T15:07:00') : null],
    ];
    paare.forEach(([n, v]) => { if (v == null) fehlt.push(n + ' fehlt in der window-Bruecke'); });
    return { paare, fehlt };
  });
  res.fehlt.forEach(f => { console.log('  ✗ ' + f); fehler++; });
  res.paare.forEach(([n, v]) => {
    if (v == null) return;
    const hatZwei = /\b'?26\b/.test(v) && !/\b2026\b/.test(v);
    console.log(`  ${hatZwei ? '✓' : '✗'} ${n}('2026-03-04') = "${v}"`);
    if (!hatZwei) {
      console.log(`      erwartet: Jahr als "26", nicht "2026" und nicht weggelassen`);
      fehler++;
    }
  });

  // ── 3) Und was WIRKLICH auf dem Schirm steht ───────────────────────────
  // Der Test, der die 13 Fundstellen ueberhaupt erst gefunden hat: alle
  // sichtbaren Texte einsammeln und nach einer vierstelligen Jahreszahl in
  // Datumsform suchen. Reine Jahreszahlen (Saisonalitaet "2019", ein
  // Copyright, eine Achse "2024") sind erlaubt - verboten ist die
  // Kombination aus Monatsname und vierstelligem Jahr.
  // ⚠ ZWEI Fehler in der ersten Fassung, beide machten die Stufe
  // wirkungslos-gruen (gefunden durch die Gegenprobe, nicht durch Nachdenken):
  //   (1) Sie rief `go(seite)` - eine Funktion, die es nicht gibt. Die
  //       Navigation heisst `showTab`. Der Lauf hat dadurch elfmal dasselbe
  //       Dashboard gemessen, auf dem ueberhaupt kein Datum mit Monatsnamen
  //       steht: 1640 Blatt-Elemente, 0 Datumsangaben. Gruen, weil leer.
  //   (2) SVG-Text war ausgeschlossen (uebernommen aus check/typo.js, wo das
  //       richtig ist). Fuer Datumsangaben ist es genau falsch - die
  //       Chart-ACHSEN sind der Hauptfundort.
  console.log('\n── 3) Sichtbarer Text: kein "Sep 2026" irgendwo ──');
  const SEITEN = ['over', 'dash', 'cur', 'mx', 'trends', 'cot', 'sent', 'seas',
    'data', 'rate', 'news', 'edge', 'carry', 'pairs', 'cal', 'notes', 'regime'];
  const MONAT = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
  let treffer3 = 0;
  for (const seite of SEITEN) {
    await p.evaluate(s => { try { showTab(s); } catch (e) {} }, seite);
    await p.waitForTimeout(450);
    const bad = await p.evaluate(({ seite, MONAT }) => {
      // ⚠ Drei Schreibweisen, nicht eine. Die erste Fassung dieses Musters
      // verlangte den Monatsnamen DIREKT vor dem Jahr und uebersah damit
      // genau das Format, das die App benutzt ("Mar 4, 2026") - die
      // Gegenprobe lief dadurch faelschlich gruen.
      const re = new RegExp(
        MONAT + '\\.?,? *\\d{0,2},? *(19|20)\\d{2}\\b'      // Mar 2026 / Mar 4, 2026
        + '|\\b\\d{1,2}\\.? *' + MONAT + ',? *(19|20)\\d{2}\\b'  // 4 Mar 2026 / 4. March 2026
        + '|\\b\\d{1,2}[/.]\\d{1,2}[/.](19|20)\\d{2}\\b');        // 04/03/2026
      const out = [];
      // ⚠ AUSGENOMMEN: Nachrichten-Ueberschriften und -Ausschnitte. Das ist
      // FREMDTEXT von Marketaux ("Gold price today, Thursday, September 17,
      // 2026: ..."), kein von der App formatiertes Datum. Ein zitiertes
      // Datum umzuschreiben waere eine Faelschung der Quelle - die Regel
      // gilt fuer Datumsangaben, die die App SETZT.
      // Gemessen: 6 Treffer in den Schlagzeilen von Dashboard und News-Tab;
      // fruehere Laeufe waren nur gruen, weil die Schlagzeilen des Tages
      // zufaellig keine solche Form enthielten.
      const FREMD = '.hl-title,.hl-sum,.hl-src,.nw-title,.nw-sum,.news-title,.news-sum';
      document.querySelectorAll('body *, svg text').forEach(el => {
        if (el.closest && el.closest(FREMD)) return;
        if (el.matches && el.matches(FREMD)) return;
        if (el.children.length) return;
        const t = (el.textContent || '').trim();
        if (!t || t.length > 200) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;   // deckt display:none mit ab
        const m = t.match(re);
        if (m) out.push({ txt: t.slice(0, 80),
          klasse: String(el.className && el.className.baseVal !== undefined
            ? el.className.baseVal : el.className || el.tagName).slice(0, 40) });
      });
      // Doppelte Fundstellen (dasselbe Datum in mehreren Zellen) einmal zaehlen.
      const seen = new Set();
      return out.filter(x => { const k = x.txt + '|' + x.klasse;
        if (seen.has(k)) return false; seen.add(k); return true; });
    }, { seite, MONAT });
    if (bad.length) {
      bad.slice(0, 4).forEach(x => console.log(`  ✗ ${seite}: "${x.txt}"  (.${x.klasse})`));
      treffer3 += bad.length; fehler += bad.length;
    }
  }
  console.log(`  ${treffer3 ? '✗' : '✓'} ${SEITEN.length} Seiten, ${treffer3} Datumsangaben mit vierstelligem Jahr`);

  await b.close();
  console.log(`\n${fehler ? '✗ DATUM: ' + fehler + ' Fund(e)' : '✓ DATUM: alles mit zweistelligem Jahr'}`);
  process.exit(fehler ? 1 : 0);
})();
