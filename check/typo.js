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
// Die Skala plus die drei bewusst stehengelassenen Werte.
const ERLAUBT = [30, 24, 17, 15, 13, 12, 11, 10, 14, 16, 18];
const TOLERANZ = 0.6;      // Rundungsrauschen von rem/em-Rechnungen
const NAH = 1.0;           // Unterschied < 1px zwischen Nachbarn = zu nah

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1440, height: 960 } });
  await pg.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('dmfx_app_choice', 'fx');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  await pg.goto(URL);
  await wartenBisDatenDa(pg);
  await pg.evaluate(() => { ['introOv', 'lockScreen', 'appChoiceOv'].forEach(id => {
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
  await br.close();

  const sp = [22, 7, 7, 7];
  console.log(['Fenster', 'Texte', 'frei', 'nah'].map((s, i) => s.padEnd(sp[i])).join(' '));
  zeilen.forEach(z => { if (z[2] || z[3]) console.log(z.map((s, i) => String(s).padEnd(sp[i])).join(' ')); });
  console.log(`\n${zeilen.length} Fenster geprueft, ${zeilen.reduce((n, z) => n + z[1], 0)} Textelemente`);
  console.log(`"fehler": ${fehler.length}`);
  fehler.slice(0, 40).forEach(f => console.log('  ' + f));
  if (fehler.length > 40) console.log(`  ... und ${fehler.length - 40} weitere`);
  process.exit(fehler.length ? 1 : 0);
})();
