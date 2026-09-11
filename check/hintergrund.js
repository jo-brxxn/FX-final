// Kontrast unter JEDEM waehlbaren Hintergrund - am echten Bildschirmpixel.
//
// Anlass (Nutzer-Wunsch 2026-09-11): die Einstellungen bieten jetzt fuenf
// Hintergruende an, drei davon Marmor-Bilder, und bei Marmor sind die Karten
// zu 88% deckend. Damit haengt die Lesbarkeit einer Zahl nicht mehr nur an
// ihrer eigenen Farbe, sondern daran, welche Marmorader zufaellig darunter
// liegt - mal eine helle Flaeche, mal eine leuchtend blaue Ader.
//
// ⚠ getComputedStyle taugt dafuer NICHT. Es liefert die DEKLARIERTE Farbe
// (bei uns ein color-mix mit Alpha 0.88), nicht das, was nach Transparenz,
// backdrop-filter und dem Bild darunter wirklich gezeichnet wird. Genau
// daran ist der erste Entwurf dieser Pruefung vorbeigelaufen und haette
// beruhigende Zahlen gemeldet, ohne je das Bild anzusehen.
// Deshalb: Bildschirmfoto machen, im Browser auf ein Canvas legen und die
// Pixel AUSLESEN. Hintergrund ist der Medianwert im Textfeld, Vordergrund
// das dunkelste bzw. hellste Pixel darin - also die gezeichnete Schrift.
//
// Geprueft wird die Kreuzung, die wehtut: drei Design-Vorlagen (hell, zwei
// dunkle) mal fuenf Hintergruende. Ein heller Marmor unter einer dunklen
// Vorlage ist der gefaehrlichste Fall und faellt sonst niemandem auf, weil
// kaum jemand alle Kombinationen durchklickt.
const PW=process.env.PW_PATH||'/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

const URL = process.env.FXPRO_URL || 'http://127.0.0.1:8935/index.html';
const BGS = ['', 'white', 'marble-light', 'marble-vivid', 'marble-dark'];
const THEMES = ['', 'carbon', 'midnight'];
const MIN = 4.5;              // WCAG AA fuer normalen Text
// ⚠ Gemessen wird der UNTERSCHIED zum selben Design OHNE Bild, nicht der
// absolute Wert. Grund: der erste Lauf meldete die Seitenleiste in den
// dunklen Vorlagen mit 2.54:1 rot - und zwar IDENTISCH bei "Current" und
// "White". Das ist ein vorhandener Mangel der Vorlagen und hat mit dem
// Hintergrund nichts zu tun; dafuer ist check/theme.js zustaendig. Wuerde
// dieser Waechter daran rot, blockierte er jeden Push aus fremdem Grund und
// waere nach zwei Wochen weggeklickt (Lehre aus Regel 7). Seine Frage ist
// enger und dadurch beantwortbar: macht ein Hintergrundbild etwas
// SCHLECHTER, als es ohne Bild war?
const VERLUST = 0.75;         // hoechstens ein Viertel des Kontrasts darf das Bild kosten
// ⚠ Der relative Verlust zaehlt nur, SOLANGE das Ergebnis unter AAA faellt.
// Gemessen: heller Marmor unter der Vorlage "carbon" kostet 25% - landet
// damit aber immer noch bei 8.88:1, also ueber WCAG AAA (7:1). Das als
// Verstoss zu melden waere Buchhaltung, kein Befund; der Waechter wuerde bei
// jeder Geschmacksaenderung rot und damit wertlos. Umgekehrt bleibt ein
// Verlust, der unter AAA drueckt, ein echter Befund - auch wenn er AA noch
// knapp haelt.
const AAA = 7.0;

function lum(r, g, b) {
  const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
}
function kontrast(a, b) {
  const la = lum(...a), lb = lum(...b);
  const [h, d] = la > lb ? [la, lb] : [lb, la];
  return (h + .05) / (d + .05);
}

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  // ⚠ Ohne diese Zeile liegt das App-Auswahlfenster ueber der Seite und der
  // Waechter misst dessen Abdunklung statt der App. Erster Lauf meldete
  // deshalb in ALLEN 15 Kombinationen exakt 1.01:1 - identische Zahlen fuer
  // Weiss und Carbon sind das Warnsignal, dass gar nicht das Gemeinte
  // gemessen wird.
  await pg.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('dmfx_app_choice', 'fx');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const fehler = [], zeilen = [], basis = {}, vorbestand = [];

  for (const th of THEMES) {
    for (const bg of BGS) {
      await pg.goto(URL);
      await pg.evaluate(([t, b]) => {
        t ? localStorage.setItem('fxpro_theme', t) : localStorage.removeItem('fxpro_theme');
        b ? localStorage.setItem('fxpro_bg', b) : localStorage.removeItem('fxpro_bg');
      }, [th, bg]);
      await pg.reload();
      await wartenBisDatenDa(pg);
      await pg.evaluate(() => { ['introOv','lockScreen','appChoiceOv'].forEach(id => {
        const e = document.getElementById(id); if (e) e.remove(); }); });

      const ziele = await pg.evaluate(() => {
        const raus = [];
        const nimm = (sel, art) => {
          for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            const txt = (el.textContent || '').trim();
            if (r.width < 12 || r.height < 8 || r.y < 0 || r.y > 960 || !txt) continue;
            raus.push({ art, x: Math.round(r.x), y: Math.round(r.y),
                        w: Math.min(220, Math.round(r.width)), h: Math.round(r.height) });
            break;                      // je Art ein Vertreter reicht
          }
        };
        nimm('.dw-t', 'Kartentitel');
        nimm('.ir-name-txt', 'Indikatorname');
        nimm('.ir-trend', 'Trendwert');
        nimm('.sb-score', 'Seitenleiste');
        return raus;
      });

      const foto = (await pg.screenshot({ type: 'png' })).toString('base64');
      const gemessen = await pg.evaluate(async ([b64, ziele]) => {
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = 'data:image/png;base64,' + b64; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        cv.getContext('2d').drawImage(img, 0, 0);
        const ctx = cv.getContext('2d');
        return ziele.map(z => {
          const d = ctx.getImageData(z.x, z.y, z.w, z.h).data;
          const px = [];
          for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
          if (!px.length) return null;
          const hell = p => .2126 * p[0] + .7152 * p[1] + .0722 * p[2];
          const sortiert = px.slice().sort((a, b2) => hell(a) - hell(b2));
          // Median = Flaeche (der Text bedeckt nur einen Bruchteil des Felds).
          const grund = sortiert[Math.floor(sortiert.length / 2)];
          // Schrift = das Extrem, das am weitesten von der Flaeche weg liegt.
          const dunkel = sortiert[Math.floor(sortiert.length * .02)];
          const licht = sortiert[Math.floor(sortiert.length * .98)];
          const vorn = Math.abs(hell(dunkel) - hell(grund)) > Math.abs(hell(licht) - hell(grund)) ? dunkel : licht;
          return { art: z.art, grund, vorn };
        }).filter(Boolean);
      }, [foto, ziele]);

      for (const m of gemessen) {
        const k = kontrast(m.vorn, m.grund);
        const schl = (th || '-') + '|' + m.art;
        if (!bg) { basis[schl] = k; }          // "Current" ist die Messlatte
        const b0 = basis[schl];
        const delta = (b0 === undefined) ? null : k - b0;
        zeilen.push([th || 'Terminal Pro', bg || 'Current', m.art, k.toFixed(2),
                     delta === null ? '-' : (delta >= 0 ? '+' : '') + delta.toFixed(2)]);
        if (!bg || b0 === undefined) continue;
        if (b0 >= MIN && k < MIN)
          fehler.push(`${th || 'Terminal Pro'} / ${bg} / ${m.art}: das Bild drueckt den Kontrast von ` +
            `${b0.toFixed(2)}:1 auf ${k.toFixed(2)}:1 und damit unter ${MIN}:1.`);
        else if (k < b0 * VERLUST && k < AAA)
          fehler.push(`${th || 'Terminal Pro'} / ${bg} / ${m.art}: das Bild kostet ` +
            `${(100 - k / b0 * 100).toFixed(0)}% Kontrast (${b0.toFixed(2)} -> ${k.toFixed(2)}) und faellt damit unter AAA (${AAA}:1).`);
      }
    }
  }
  await br.close();

  // Vorhandene Schwaechen ohne Bild nur BENENNEN, nicht bestrafen.
  Object.keys(basis).forEach(k => { if (basis[k] < MIN)
    vorbestand.push(`${k.replace('|', ' / ')}: ${basis[k].toFixed(2)}:1 schon OHNE Hintergrundbild`); });

  const spalten = [10, 13, 15, 9, 7];
  console.log(['Vorlage', 'Hintergrund', 'Element', 'Kontrast', 'Delta'].map((s, i) => s.padEnd(spalten[i])).join(' '));
  zeilen.forEach(z => console.log(z.map((s, i) => String(s).padEnd(spalten[i])).join(' ')));
  // ⚠ NICHT "total" nennen: check/all.js nimmt den ERSTEN Treffer von
  // "fehler" ODER "total" als Befundzahl. Mit "total": 30 davor las der
  // Laeufer 30 Befunde und meldete den Waechter rot, obwohl "fehler": 0
  // darunter stand.
  console.log(`\n"messungen": ${zeilen.length}`);
  console.log(`"fehler": ${fehler.length}`);
  fehler.forEach(f => console.log('  ' + f));
  if (vorbestand.length) {
    console.log('\n  [HINWEIS] schon ohne Hintergrundbild unter ' + MIN + ':1 - gehoert zu check/theme.js, nicht hierher:');
    vorbestand.forEach(v => console.log('    ' + v));
  }
  process.exit(fehler.length ? 1 : 0);
})();
