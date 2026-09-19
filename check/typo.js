// Schrifthierarchie in ALLEN Fenstern, die man oeffnen kann.
//
// Anlass (Nutzer 2026-09-08): "achte nochmal auf allen Fenstern die man
// oeffnen kann und generell allen Seiten darauf das die Schriften hierachie
// stimmt und nun etwas gezeigt wird dann mach das es sich abtrennt und
// uebersichtlich ist".
//
// ⚠ Damals wurden nur die SEITEN gemessen. Die Modals blieben aussen vor -
// und zwar nicht aus Nachlaessigkeit, sondern weil sie im DOM auf
// display:none stehen und getComputedStyle dort zwar Werte liefert, die
// Elemente aber keine Groesse haben. Wer sie nicht oeffnet, misst nichts.
// Dieser Waechter oeffnet jedes Fenster einzeln.
//
// ⚠⚠ UND DANN WAREN ES NUR NOCH DIE MODALS (bemerkt 2026-09-16, als der
// Nutzer nach dem neuen Regime-Tab fragte: "schau nochmal ueber alles drueber
// was du neu gemacht hast ob da die ueberschriften hierachie usw stimmen").
// Der Waechter holte seine Liste aus `.ov[id^="m"]` - also ausschliesslich
// Fenstern. Die SEITEN, die der Anlass woertlich mitnennt ("und generell
// allen Seiten"), fielen komplett heraus: gemessen wurden 34 Fenster mit
// 301 Textelementen, waehrend allein der Kalender 531 hat. Der neue Tab
// wurde von keiner Pruefung angesehen, und die 14 bestehenden Seiten seit
// dem 2026-09-08 auch nicht mehr.
// Seit jetzt: Abschnitt B unten geht ALLE Seiten durch (3275 Textelemente).
//
// Geprueft werden zwei Dinge:
//
// 1. FREIE SCHRIFTGROESSEN. Die App hat eine 8-stufige Skala (--fs-hero bis
//    --fs-2xs). Ein Wert daneben ist fast immer ein Versehen und faellt
//    einzeln nie auf - in Summe zerfaellt die Hierarchie aber.
//    ⚠ 14/16/18px sind AUSGENOMMEN: sie stehen bewusst an einzelnen Stellen
//    (siehe CHANGELOG 2026-09-08, VERSION-CHECK-489) und wurden dort
//    absichtlich nicht angetastet.
//
// 2. ZU NAHE PAARE. Zwei Textbloecke direkt uebereinander, deren Groessen
//    sich um weniger als 1px unterscheiden, ohne gleich zu sein - das liest
//    sich als Fehler, nicht als Hierarchie. Entweder gleich gross oder
//    deutlich verschieden.
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

const URL = process.env.FXPRO_URL || 'http://127.0.0.1:8935/index.html';
// Die Skala plus die bewusst stehengelassenen Werte.
// ⚠ 14/16/18 stehen seit dem 2026-09-08 drin (VERSION-CHECK-489, dort
// absichtlich nicht angetastet). 22 kam am 2026-09-16 dazu, als der Waechter
// erstmals auch die SEITEN messen konnte: der Wert steht an genau zwei
// Stellen und beide bewusst - der Seitenkopf von Trends (inline 22px) und
// `.rub-inp/.nc-inp/.pcc-name` in einer Media Query (index.html:4088).
// ⚠ Er gehoert NICHT zur Token-Skala: --fs-xl ist 24px. docs/design-system.md
// hat ihn bis zum 2026-09-16 faelschlich als "--fs-xl 22" gefuehrt - die Doku
// nannte damit eine Stufe, die es im Code nicht gibt.
const ERLAUBT = [30, 24, 22, 17, 15, 13, 12, 11, 10, 14, 16, 18];
const TOLERANZ = 0.6;      // Rundungsrauschen von rem/em-Rechnungen
const NAH = 1.0;           // Unterschied < 1px zwischen Nachbarn = zu nah

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1440, height: 960 } });
  await pg.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  await pg.goto(URL);
  await wartenBisDatenDa(pg);
  await pg.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });

  const ids = await pg.evaluate(() =>
    [...document.querySelectorAll('.ov[id^="m"]')].map(e => e.id));

  const fehler = [], zeilen = [];
  for (const id of ids) {
    // ⚠ Direkt einblenden statt openM() zu rufen: viele Fenster erwarten
    // beim Oeffnen Argumente (eine Notiz-Id, ein Asset) und wuerden ohne sie
    // werfen. Gemessen wird die Typografie des Geruests, nicht der Inhalt -
    // dafuer reicht Sichtbarkeit.
    const da = await pg.evaluate(i => {
      const el = document.getElementById(i);
      if (!el) return false;
      el.style.display = 'flex';
      return true;
    }, id);
    if (!da) continue;
    await pg.waitForTimeout(60);

    const m = await pg.evaluate(i => {
      const wurzel = document.getElementById(i);
      const raus = { frei: [], nah: [], n: 0 };
      const sichtbar = el => {
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      };
      // ⚠ Eingabefelder haben KEINEN Textknoten - ihr Text steckt in value
      // bzw. placeholder. Die erste Fassung pruefte nur auf Textknoten und
      // war dadurch fuer jedes input/textarea/select blind; die Gegenprobe
      // (13,4px in .m-inp geschoben) lief glatt durch. Genau dafuer ist eine
      // Gegenprobe da.
      const FELD = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/;
      const hatText = el => FELD.test(el.tagName)
        || [...el.childNodes].some(k => k.nodeType === 3 && k.textContent.trim());
      const alle = [...wurzel.querySelectorAll('*')].filter(el => sichtbar(el) && hatText(el));
      raus.n = alle.length;
      const gesehen = new Set();
      alle.forEach(el => {
        const px = parseFloat(getComputedStyle(el).fontSize);
        const schl = el.className + '|' + px;
        if (!gesehen.has(schl)) {
          gesehen.add(schl);
          raus.frei.push({ px, klasse: String(el.className || el.tagName).slice(0, 42) });
        }
      });
      // Nachbarn im selben Elternelement vergleichen.
      const eltern = new Set(alle.map(e => e.parentElement).filter(Boolean));
      eltern.forEach(p => {
        const kinder = [...p.children].filter(k => sichtbar(k) && hatText(k));
        for (let j = 1; j < kinder.length; j++) {
          const a = parseFloat(getComputedStyle(kinder[j - 1]).fontSize);
          const b = parseFloat(getComputedStyle(kinder[j]).fontSize);
          const d = Math.abs(a - b);
          if (d > 0.05 && d < 1.0)
            raus.nah.push({ a, b, klasse: String(kinder[j].className || '').slice(0, 40) });
        }
      });
      return raus;
    }, id);

    const frei = m.frei.filter(f => !ERLAUBT.some(e => Math.abs(f.px - e) <= TOLERANZ));
    zeilen.push([id, m.n, frei.length, m.nah.length]);
    frei.forEach(f => fehler.push(`${id}: ${f.px}px bei "${f.klasse}" - nicht auf der Skala (${ERLAUBT.slice(0, 8).join('/')})`));
    m.nah.forEach(p => fehler.push(`${id}: ${p.a}px direkt ueber ${p.b}px bei "${p.klasse}" - zu nah beieinander, das liest sich als Fehler`));

    await pg.evaluate(i => { const el = document.getElementById(i); if (el) el.style.display = 'none'; }, id);
  }

  // ══ B) DIE SEITEN ═══════════════════════════════════════════════════
  // Jede Seite einzeln oeffnen und mit DEMSELBEN Regelwerk messen.
  //
  // ⚠ SVG-TEXT IST AUSGENOMMEN. Achsen- und Balkenbeschriftungen in den
  // Diagrammen folgen der Chart-Geometrie, nicht der Typo-Skala - sie
  // skalieren mit der Zeichenflaeche und liegen deshalb zwangslaeufig auf
  // Zwischengroessen (gemessen 6,5 / 9 / 26px). Ohne diese Ausnahme meldete
  // der Lauf vier Treffer, die alle keine Schrifthierarchie betreffen.
  //
  // ⚠ DREI BESTANDSWERTE sind namentlich ausgenommen, mit Datum und Grund.
  // Das ist bewusst eine LISTE und keine aufgeweichte Skala: ein NEUER
  // Wert daneben faellt weiter rot auf.
  const SEITEN_AUSNAHMEN = [
    // Der Asset-Titel ist seit immer gross. Am 2026-09-14 wurde er im
    // Zuge des Kopfleisten-Rueckbaus ausdruecklich wieder so hergestellt
    // ("mach das wie vorher") - ihn jetzt zu aendern waere gegen die Ansage.
    { klasse: 'atitle', grund: 'Asset-Titel, Bestand; am 2026-09-14 auf Nutzer-Wunsch so wiederhergestellt' },
    { klasse: 'rterm-title-big', grund: 'Research-Begriffstitel, Bestand seit der Notiz-Ansicht' },
    // 13,3333px entsteht aus einer rem/em-Rechnung, nicht aus einer
    // gewaehlten Groesse - und liegt genau 0,33px neben der 13er-Stufe.
    { klasse: 'btn', grund: 'Rundungsrest einer rem-Rechnung, 0,33px neben der Stufe' },
  ];
  const istAusnahme = kl => SEITEN_AUSNAHMEN.some(a => String(kl).split(/\s+/).includes(a.klasse));

  const SEITEN = [['over','pgOver'],['dash','pgDash'],['cur','pgCur'],['mx','pgMx'],
    ['trends','pgTrends'],['cot','pgCot'],['sent','pgSent'],['seas','pgSeas'],
    ['data','pgData'],['rate','pgRate'],['news','pgNews'],['edge','pgEdge'],
    ['carry','pgCarry'],['pairs','pgPairs'],['watch','pgWatch'],['cal','pgCal'],
    ['notes','pgNotes'],['regime','pgRegime']];
  // Die Watchlist ist ohne Eintraege leer - dann waere die Seite ungeprueft.
  await pg.evaluate(() => { try {
    ['EUR/USD', 'GBP/USD'].forEach(x => { try { toggleWatch(x); } catch (e) {} });
  } catch (e) {} });

  for (const [tab, pid] of SEITEN) {
    await pg.evaluate(t => { try { showTab(t); } catch (e) {} }, tab);
    await pg.waitForTimeout(520);
    // ⚠ NAH per Argument, nicht als freie Variable: der Rumpf von
    // page.evaluate laeuft IM BROWSER und sieht die Node-Konstanten nicht.
    // Der erste Anlauf warf dort "NAH is not defined" - die Seite war damit
    // ungeprueft, obwohl der Waechter lief.
    const m = await pg.evaluate(([id, NAH_PX]) => {
      const w = document.getElementById(id);
      if (!w) return null;
      const sicht = el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
      const FELD = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/;
      const hatText = el => FELD.test(el.tagName)
        || [...el.childNodes].some(k => k.nodeType === 3 && k.textContent.trim());
      const alle = [...w.querySelectorAll('*')]
        .filter(el => sicht(el) && hatText(el) && !el.closest('svg'));
      const raus = { frei: [], nah: [], n: alle.length };
      const gesehen = new Set();
      alle.forEach(el => {
        const px = parseFloat(getComputedStyle(el).fontSize);
        const kl = String(typeof el.className === 'string' ? el.className : el.tagName);
        const k = kl + '|' + px;
        if (!gesehen.has(k)) { gesehen.add(k); raus.frei.push({ px, klasse: kl.slice(0, 42) }); }
      });
      const eltern = new Set(alle.map(el => el.parentElement).filter(Boolean));
      eltern.forEach(el => {
        const kin = [...el.children].filter(k => sicht(k) && hatText(k) && !k.closest('svg'));
        for (let j = 1; j < kin.length; j++) {
          const a = parseFloat(getComputedStyle(kin[j - 1]).fontSize);
          const b = parseFloat(getComputedStyle(kin[j]).fontSize);
          const d = Math.abs(a - b);
          if (d > 0.05 && d < NAH_PX) raus.nah.push({ a, b, klasse: String(kin[j].className || '').slice(0, 40) });
        }
      });
      return raus;
    }, [pid, NAH]);
    if (!m) { fehler.push(`Seite ${pid}: nicht im Dokument - der Tab "${tab}" fuehrt ins Leere`); continue; }
    const frei = m.frei.filter(f => !ERLAUBT.some(e => Math.abs(f.px - e) <= TOLERANZ) && !istAusnahme(f.klasse));
    const nah = m.nah.filter(x => !istAusnahme(x.klasse));
    zeilen.push(['Seite ' + tab, m.n, frei.length, nah.length]);
    frei.forEach(f => fehler.push(`Seite ${tab}: ${f.px}px bei "${f.klasse}" - nicht auf der Skala (${ERLAUBT.slice(0, 8).join('/')})`));
    nah.forEach(x => fehler.push(`Seite ${tab}: ${x.a}px direkt ueber ${x.b}px bei "${x.klasse}" - zu nah beieinander, das liest sich als Fehler`));
  }

  await br.close();

  const sp = [22, 7, 7, 7];
  console.log(['Fenster/Seite', 'Texte', 'frei', 'nah'].map((s, i) => s.padEnd(sp[i])).join(' '));
  zeilen.forEach(z => { if (z[2] || z[3]) console.log(z.map((s, i) => String(s).padEnd(sp[i])).join(' ')); });
  const nSeiten = zeilen.filter(z => String(z[0]).startsWith('Seite ')).length;
  console.log(`\n${zeilen.length - nSeiten} Fenster + ${nSeiten} Seiten geprueft, `
    + `${zeilen.reduce((n, z) => n + z[1], 0)} Textelemente `
    + `(SVG-Beschriftungen ausgenommen, ${SEITEN_AUSNAHMEN.length} benannte Bestandswerte)`);
  console.log(`"fehler": ${fehler.length}`);
  fehler.slice(0, 40).forEach(f => console.log('  ' + f));
  if (fehler.length > 40) console.log(`  ... und ${fehler.length - 40} weitere`);
  process.exit(fehler.length ? 1 : 0);
})();
