// ── KARTENOPTIK UND KOPFLEISTE DER ASSET-SEITE ────────────────────
//
// Nutzer 2026-09-14: "mach jetzt den generellen Hintergrund weis und die
// Karten dunkler ... mach so einen Effekt das es so aussieht als ob sich die
// Karten vom Hintergrund abheben".
//
// Was man nicht im Code sieht und was schon einmal danebengegangen ist:
//
// DIE KARTENTRENNUNG IST EIN PIXELWERT, KEIN TOKENWERT. --card gegen
//     --bg0 gerechnet ergab 1,23:1 - am Bildschirm gemessen waren es 1,15,
//     weil die Aurora (der Risk-Sentiment-Schleier hinter allem) die weisse
//     Seite auf rgb(248,247,247) toent. Der Waechter misst deshalb am
//     Bildschirmfoto, nicht an den Variablen. Und er prueft die GESTAPELTEN
//     Schatten: ein einzelner Schatten faellt linear ab und sieht aus wie
//     ein aufgemalter Rand (Technik nachgeschlagen bei Tobias Ahlin /
//     Josh Comeau, Material 3 empfiehlt tonale Erhoehung PLUS Schatten).
//
// ⚠ Die Asset-Motive (erst gezeichnete Embleme, dann Schein-Fotos als
// breites Band) sind am 2026-09-14 auf Nutzer-Wunsch wieder komplett
// entfernt worden ("entfern die Bilder komplett wieder"). Die dazu
// gehoerenden Pruefungen sind mit raus - was bleibt, ist die Kartenoptik,
// und die war der eigentliche Auftrag.
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

const F = [];
const fail = (t, x) => F.push(`${t}: ${x}`);

// Untergrenzen. Der Kartenkontrast lag vor dem Umbau bei 1,08:1 (Token) bzw.
// 1,15:1 (Pixel) - jede Zahl darunter heisst, die Karten sind wieder eine
// Flaeche mit dem Hintergrund.
const MIN_KONTRAST = 1.18;
const MIN_SCHATTEN_LAGEN = 3;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('dmfx_app_choice', 'fx');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const perr = [];
  p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen', 'appChoiceOv'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });
  await p.evaluate(() => gotoSym('USD'));
  await p.waitForTimeout(800);

  // ── 1) Kartentrennung AM BILDSCHIRMPIXEL ─────────────────────────────
  const ziele = await p.evaluate(() => {
    const d = document.getElementById('detail').getBoundingClientRect();
    const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const k = r('.ab-ptile'), inf = r('.rub-card');
    if (!k) return null;
    return {
      // Kartenflaeche: ein Fleck ganz oben in der Karte, wo nur Flaeche ist
      karte: { x: Math.round(k.x + k.width * .52), y: Math.round(k.y + 3), w: 30, h: 5 },
      // Freier Grund: ueber der Kartenreihe, weit genug vom Schatten weg
      grund: { x: Math.round(k.x + 40), y: Math.round(d.top + 4), w: 60, h: 5 },
    };
  });
  if (!ziele) fail('AUFBAU', 'keine Preis-Karte auf der Asset-Seite gefunden');
  else {
    const foto = (await p.screenshot({ type: 'png' })).toString('base64');
    const farben = await p.evaluate(async ([b64, zz]) => {
      const img = new Image();
      await new Promise(ok => { img.onload = ok; img.src = 'data:image/png;base64,' + b64; });
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      const med = z => {
        if (!z) return null;
        const d = ctx.getImageData(z.x, z.y, z.w, z.h).data, px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        const hell = q => .2126 * q[0] + .7152 * q[1] + .0722 * q[2];
        return px.sort((a, c) => hell(a) - hell(c))[Math.floor(px.length / 2)];
      };
      return { karte: med(zz.karte), grund: med(zz.grund) };
    }, [foto, ziele]);
    const lum = c => { const s = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * s[0] + .7152 * s[1] + .0722 * s[2]; };
    const kon = (a, c) => { const l1 = lum(a), l2 = lum(c); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
    const gemessen = kon(farben.karte, farben.grund);
    if (!(gemessen >= MIN_KONTRAST)) fail('KARTE HEBT SICH NICHT AB',
      `am Bildschirmpixel nur ${gemessen.toFixed(3)}:1 zwischen Karte rgb(${farben.karte}) und Seitengrund rgb(${farben.grund}), verlangt sind ${MIN_KONTRAST}. Vor dem Umbau waren es 1,15 - genau das war die Beschwerde.`);
    global._kontrast = gemessen;
  }

  // ── 1b) EINE Kartenfarbe fuer alle Karten ────────────────────────────
  // ⚠ Nicht am Pixel: der Messpunkt oben in der Makro-Karte trifft ihre
  // Kopfzeile, die bewusst eine Stufe heller ist (--bg3). Verglichen wird
  // deshalb die gesetzte Flaeche der Karte selbst.
  const flaechen = await p.evaluate(() => {
    const soll = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
    const raus = { soll, abweichler: [] };
    [['.ab-ptile', 'Preis-Karte'], ['.ab-ktile', 'Kontext-Band'], ['.ab-ntile', 'Pinned notes'],
     ['.ab-tile', 'Grafik-Kachel'], ['.rub-card', 'Makro-Karte'], ['.abc-cal', 'Kalender']].forEach(([s, n]) => {
      const e = document.querySelector(s);
      if (!e) return;
      const ist = getComputedStyle(e).backgroundColor;
      // --card als Hex gegen den computed rgb()-String
      const hex = ist.match(/\d+/g);
      const soll2 = soll.replace('#', '').match(/../g);
      if (!hex || !soll2) return;
      const gleich = hex.slice(0, 3).every((v, i) => Math.abs(+v - parseInt(soll2[i], 16)) <= 1);
      if (!gleich) raus.abweichler.push({ n, ist });
    });
    return raus;
  });
  flaechen.abweichler.forEach(x => fail('ZWEI KARTENFARBEN',
    `${x.n} steht auf ${x.ist} statt auf --card (${flaechen.soll}). Alle Karten haengen an EINEM Token, damit sie sich bei der naechsten Palettenaenderung nicht auseinanderentwickeln - vorher war .rub-card auf --bg3 und die Kacheln auf --card.`));

  // ── 2) Gestapelte Schatten, nicht EIN Schatten ───────────────────────
  const schatten = await p.evaluate(() => {
    const raus = {};
    [['.ab-ptile', 'Kachel'], ['.rub-card', 'Makro-Karte'], ['.dw', 'Dashboard-Karte']].forEach(([s, n]) => {
      const e = document.querySelector(s);
      if (!e) return;
      const cs = getComputedStyle(e).boxShadow;
      // Jede Lage beginnt mit einer Farbe. inset-Lagen (die Lichtkante oben)
      // zaehlen nicht als Tiefe.
      const lagen = (cs.match(/rgba?\([^)]*\)[^,]*/g) || []).filter(x => !/inset/.test(x));
      raus[n] = { lagen: lagen.length, roh: cs.slice(0, 120) };
    });
    return raus;
  });
  Object.keys(schatten).forEach(n => {
    if (schatten[n].lagen < MIN_SCHATTEN_LAGEN) fail('SCHATTEN NICHT GESTAPELT',
      `${n} hat ${schatten[n].lagen} Schattenlage(n), verlangt sind ${MIN_SCHATTEN_LAGEN}. Ein einzelner Schatten faellt linear ab und sieht aus wie ein aufgemalter Rand - "${schatten[n].roh}"`);
  });

  // ── 3) Die Kopfleiste ist ein Block, kein schwebender Text ───────────
  // ⚠ Nutzer 2026-09-14: "hat nicht oben einen richtigen Anfang". Gemessen
  // hatte der Kopf background rgba(0,0,0,0), border-bottom 0px und ein
  // 476px-Loch zwischen Titel und Knopfleiste. Genau das darf nicht
  // zurueckkommen.
  const KOPF_BREITEN = [[1920, 1080], [1500, 1000], [1280, 900], [820, 1180], [390, 844]];
  const KOPF_ASSETS = ['USD', 'GOLD', 'SP500', 'GER100', 'USYIELD', 'NZYIELD'];
  let kopfGeprueft = 0, mitKennzahlen = 0, mitGrund = 0;
  for (const [w, h] of KOPF_BREITEN) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(240);
    for (const id of KOPF_ASSETS) {
      await p.evaluate(x => gotoSym(x), id);
      await p.waitForTimeout(170);
      const r = await p.evaluate(() => {
        const d = document.getElementById('detail');
        const k = d.querySelector('.ahead');
        if (!k) return { fehlt: true };
        const cs = getComputedStyle(k), kr = k.getBoundingClientRect();
        // Ueberlappen sich Teile IN der Leiste? (Kinder in Eltern zaehlen nicht)
        const teile = [...k.querySelectorAll('.ahead-id, .ahk-i, .dmeta-ctrl')].map(e => e.getBoundingClientRect());
        let ueber = 0;
        for (let i = 0; i < teile.length; i++) for (let j = i + 1; j < teile.length; j++) {
          const a = teile[i], c = teile[j];
          if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) ueber++;
        }
        const titel = [...d.querySelectorAll('.ab-rtitel')];
        return {
          fehlt: false,
          flaeche: cs.backgroundColor, rand: cs.borderTopWidth,
          hoehe: Math.round(kr.height),
          kennzahlen: k.querySelectorAll('.ahead-kpi .ahk-i:not(.ahk-leer)').length,
          grund: !!k.querySelector('.ahk-leer'),
          ueber,
          ueberlauf: d.scrollWidth > d.clientWidth + 1,
          titelAnzahl: titel.length,
          titelHoehe: Math.max(0, ...titel.map(e => Math.round(e.getBoundingClientRect().height))),
        };
      });
      kopfGeprueft++;
      if (r.fehlt) { fail('KOPFLEISTE FEHLT', `${id} bei ${w}px: kein .ahead-Element`); continue; }
      if (/, 0\)$/.test(r.flaeche) || r.flaeche === 'transparent') fail('KOPF OHNE EIGENE FLAECHE',
        `${id} bei ${w}px: die Kopfleiste steht auf ${r.flaeche}. Genau so schwebte sie vorher ueber dem Raster - das war der gemeldete Fehler.`);
      if (r.rand === '0px') fail('KOPF OHNE RAHMEN', `${id} bei ${w}px: border-top 0px, die Leiste ist nicht als Block erkennbar.`);
      if (r.ueber) fail('KOPF UEBERLAPPT SICH', `${id} bei ${w}px: ${r.ueber} Ueberschneidung(en) zwischen Titel, Kennzahlen und Knopfleiste.`);
      if (r.ueberlauf) fail('KOPF LAEUFT UEBER', `${id} bei ${w}px: die Seite scrollt waagerecht. Gemessen lief die Knopfleiste bei 390px 122px ueber den Rand.`);
      // ⚠ Nie ein Loch: entweder Kennzahlen oder der ehrliche Grund, warum
      // es keine gibt (Grundsatz 4 - die Luecke wird gemeldet, nicht gefuellt).
      if (!r.kennzahlen && !r.grund) fail('KOPF OHNE INHALT',
        `${id} bei ${w}px: weder Kennzahlen noch eine Begruendung - die Leiste hat wieder ein Loch in der Mitte.`);
      if (r.kennzahlen) mitKennzahlen++; else mitGrund++;
      // ⚠ Nutzer: "nicht zu viel gliedern das da nicht so viel Platz
      // verschwendet wird und es so klein wird."
      if (r.titelAnzahl > 3) fail('ZU VIEL GEGLIEDERT',
        `${id} bei ${w}px: ${r.titelAnzahl} Reihen-Ueberschriften. Mehr als drei war ausdruecklich ausgeschlossen.`);
      if (r.titelHoehe > 20) fail('UEBERSCHRIFTEN ZU HOCH',
        `${id} bei ${w}px: eine Reihen-Ueberschrift ist ${r.titelHoehe}px hoch, erlaubt sind 20. Sie sollen kaum Platz kosten.`);
    }
  }
  await p.setViewportSize({ width: 1500, height: 1000 });

  await b.close();
  if (perr.length) fail('SEITENFEHLER', perr.slice(0, 3).join(' | '));
  if (F.length) {
    console.error('KARTEN-LOOK NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
  console.log(`[kartenlook] ok (Karte gegen Seitengrund ${(global._kontrast || 0).toFixed(2)}:1 am Pixel, `
    + `${Object.values(schatten)[0].lagen} gestapelte Schattenlagen, EINE Kartenflaeche fuer alle Karten; `
    + `Kopfleiste auf ${kopfGeprueft} Kombinationen geprueft - ${mitKennzahlen} mit Kennzahlen, ${mitGrund} mit Begruendung, 0 Loecher)`);
})().catch(e => { console.error('KARTEN-LOOK-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
