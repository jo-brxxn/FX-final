// ── KARTEN HEBEN SICH AB · ASSET-MOTIVE KOLLIDIEREN NICHT ─────────
//
// Nutzer 2026-09-14: "mach jetzt den generellen Hintergrund weis und die
// Karten dunkler ... mach so einen Effekt das es so aussieht als ob sich die
// Karten vom Hintergrund abheben" und "kann man vlt im generellen
// Hintergrund im oberen Drittel so z.B. beim Dollar einen Dollar Schein
// unscheinbar in den Hintergrund setzen der einfach so blass ist".
//
// Zwei Dinge, die man nicht im Code sieht und die beide schon einmal
// danebengegangen sind:
//
// (1) DIE KARTENTRENNUNG IST EIN PIXELWERT, KEIN TOKENWERT. --card gegen
//     --bg0 gerechnet ergab 1,23:1 - am Bildschirm gemessen waren es 1,15,
//     weil die Aurora (der Risk-Sentiment-Schleier hinter allem) die weisse
//     Seite auf rgb(248,247,247) toent. Der Waechter misst deshalb am
//     Bildschirmfoto, nicht an den Variablen. Und er prueft die GESTAPELTEN
//     Schatten: ein einzelner Schatten faellt linear ab und sieht aus wie
//     ein aufgemalter Rand (Technik nachgeschlagen bei Tobias Ahlin /
//     Josh Comeau, Material 3 empfiehlt tonale Erhoehung PLUS Schatten).
//
// (2) DAS ASSET-MOTIV DARF NIE AUF SCHRIFT LIEGEN. Zwei Anlaeufe lagen
//     daneben: erst 330px hoch (70% verschwand hinter den Karten), dann
//     rechts oben (genau hinter der Knopfleiste). Und eine feste Position
//     war auf "USD" gerechnet - bei "S&P 500 -3.8" lag das Motiv auf dem
//     Score-Abzeichen. Schrift auf Textur ist hier ausdruecklich abgelehnt
//     worden (Nutzer-Entscheid 2026-09-04, die acht Dekorlinien).
//     Geprueft wird deshalb ueber fuenf Fensterbreiten und mit den
//     laengsten Asset-Namen, dass sich das Motiv mit KEINEM Textelement
//     ueberschneidet - und dass es dort, wo kein Platz ist, verschwindet
//     statt zu kollidieren.
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

  // ── 3) Das Asset-Motiv beruehrt NIE Schrift ──────────────────────────
  // ⚠ Ueber fuenf Breiten UND mit den laengsten Namen: "S&P 500" mit einem
  // zweistelligen Score ist rund 100px breiter als "USD".
  const BREITEN = [[1920, 1080], [1500, 1000], [1280, 900], [1100, 820], [390, 844]];
  const ASSETS = ['USD', 'EUR', 'GOLD', 'OIL', 'BTC', 'SP500', 'GER100', 'USYIELD', 'NZYIELD'];
  let geprueft = 0, mitMotiv = 0, ohneMotiv = 0, mitBand = 0;
  for (const [w, h] of BREITEN) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(260);
    for (const id of ASSETS) {
      await p.evaluate(x => gotoSym(x), id);
      await p.waitForTimeout(170);
      const r = await p.evaluate(() => {
        const d = document.getElementById('detail');
        const cs = getComputedStyle(d);
        if (cs.backgroundImage === 'none') return { aus: true };
        // ⚠ Im Bandmodus liegt das Motiv ABSICHTLICH unter der Schrift -
        // die Kollisionspruefung gilt dort nicht, dafuer die Streuung
        // weiter unten. Erkennbar an der Klasse, die renderDetail setzt.
        if (d.classList.contains('hat-band')) return { aus: false, band: true };
        const dr = d.getBoundingClientRect();
        // Wo genau liegt das Motiv? Aus background-position/-size.
        const pos = cs.backgroundPosition.split(' ');
        const grx = parseFloat(pos[0]) || 0, gry = parseFloat(pos[1]) || 0;
        const hoehe = parseFloat(cs.backgroundSize.split(' ')[1]) || 0;
        const breite = hoehe * 540 / 400;
        const kasten = { l: dr.left + grx, t: dr.top + gry, r: dr.left + grx + breite, b: dr.top + gry + hoehe };
        // Jedes Textelement im oberen Band
        const treffer = [];
        d.querySelectorAll('.atitle, .atitle *, .dmeta, .dmeta *, .asub').forEach(e => {
          if (!e.textContent.trim() && !e.querySelector('svg,img')) return;
          const b = e.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) return;
          if (b.left < kasten.r && b.right > kasten.l && b.top < kasten.b && b.bottom > kasten.t) {
            treffer.push({ was: (e.className || e.tagName).toString().split(' ')[0], txt: e.textContent.trim().slice(0, 18) });
          }
        });
        // Laeuft es hinter die Kartenreihe?
        const karten = d.querySelector('.ab-cards');
        const unterKarten = karten ? (kasten.b > karten.getBoundingClientRect().top + 6) : false;
        return { aus: false, kasten: { l: Math.round(kasten.l), r: Math.round(kasten.r), b: Math.round(kasten.b) }, treffer, unterKarten };
      });
      geprueft++;
      if (r.aus) { ohneMotiv++; continue; }
      if (r.band) { mitBand++; continue; }   // Bandmodus: eigene Pruefung unten
      mitMotiv++;
      if (r.treffer.length) fail('MOTIV AUF SCHRIFT',
        `${id} bei ${w}px: das Motiv (x ${r.kasten.l}-${r.kasten.r}) ueberdeckt ${r.treffer.map(t => t.was + ' "' + t.txt + '"').join(', ')}`);
      if (r.unterKarten) fail('MOTIV UNTER DEN KARTEN',
        `${id} bei ${w}px: das Motiv reicht bis y=${r.kasten.b} und damit hinter die Kartenreihe - dort sieht es niemand.`);
    }
  }
  // Gegenprobe in die andere Richtung: auf einem breiten Fenster MUSS es da
  // sein, sonst hat sich der Abschalt-Zweig still ueber alles gelegt.
  if (!mitMotiv) fail('GAR KEIN MOTIV', 'auf keiner der geprueften Breiten wurde ein Asset-Motiv gezeichnet.');
  if (!ohneMotiv) fail('NIE ABGESCHALTET', 'auch auf 390px Breite stand ein Motiv - dort gibt es keine Luecke, es muesste verschwinden.');

  // ── 3b) Wie unruhig macht das Band den Grund? ───────────────────────
  // ⚠ DIE RICHTIGE MESSGROESSE. Der erste Versuch nahm den Kontrast
  // Schrift-gegen-Grund - der kam MIT Band sogar besser heraus als ohne,
  // weil die Linien des Scheins den Median des Grunds verschieben. Was ein
  // Bild hinter Schrift wirklich kostet, ist die STREUUNG: ruhig heisst
  // sigma nahe 0 (gemessen 0,3-0,4 ohne Band), ein Geldschein mit eigener
  // Schrift darunter hat eine hohe. Geprueft wird der ZUWACHS, weil die
  // Flagge im Titel auch ohne Band schon sigma 66 hat.
  const MAX_ZUWACHS = 6;
  await p.setViewportSize({ width: 1500, height: 1000 });
  const bandAsset = await p.evaluate(() => (typeof NOTE_FOTOS !== 'undefined' && NOTE_FOTOS[0]) || null);
  if (bandAsset) {
    await p.evaluate(x => gotoSym(x), bandAsset);
    await p.waitForTimeout(500);
    const raster = await p.evaluate(() => {
      const d = document.getElementById('detail').getBoundingClientRect();
      const karten = document.querySelector('.ab-cards');
      const bis = karten ? karten.getBoundingClientRect().top - 4 : d.top + 100;
      const zeilen = Math.max(1, Math.floor((bis - d.top - 6) / 26));
      const out = [];
      for (let gy = 0; gy < zeilen; gy++) for (let gx = 0; gx < 6; gx++)
        out.push({ n: `r${gy}c${gx}`, x: Math.round(d.left + 10 + gx * (d.width - 30) / 6), y: Math.round(d.top + 3 + gy * 26), w: Math.round((d.width - 30) / 6 - 6), h: 22 });
      return out;
    });
    const sigma = async () => {
      const foto = (await p.screenshot({ type: 'png' })).toString('base64');
      return await p.evaluate(async ([b64, zz]) => {
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = 'data:image/png;base64,' + b64; });
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        return zz.map(z => {
          const d = ctx.getImageData(z.x, z.y, z.w, z.h).data; const h = [];
          for (let i = 0; i < d.length; i += 4) h.push(.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]);
          h.sort((a, b) => a - b);
          const g = h.slice(Math.floor(h.length * .12));   // Schrift/Icons raus
          const m = g.reduce((a, b) => a + b, 0) / g.length;
          return Math.sqrt(g.reduce((a, b) => a + (b - m) * (b - m), 0) / g.length);
        });
      }, [foto, raster]);
    };
    const mitB = await sigma();
    await p.evaluate(() => { const d = document.getElementById('detail'); d.classList.remove('hat-band'); d.style.setProperty('--asset-art', 'none'); });
    await p.waitForTimeout(220);
    const ohneB = await sigma();
    let maxZ = 0, wo = '';
    mitB.forEach((v, i) => { const z = v - ohneB[i]; if (z > maxZ) { maxZ = z; wo = raster[i].n; } });
    if (maxZ > MAX_ZUWACHS) fail('BAND ZU KRAEFTIG',
      `das Schein-Band erhoeht die Streuung des Grunds um bis zu +${maxZ.toFixed(1)} sigma (${wo}), erlaubt sind ${MAX_ZUWACHS}. Darueber liest man die Schrift des Scheins hinter der Knopfleiste - der Nutzer wollte "unscheinbar ... so blass". Der Schleier in .detail.hat-band gehoert hochgesetzt.`);
    global._bandZuwachs = maxZ;
    await p.evaluate(x => gotoSym(x), 'USD');
    await p.waitForTimeout(300);
  }

  // ── 4) Jedes Asset hat ein Motiv, und es laedt ───────────────────────
  await p.setViewportSize({ width: 1500, height: 1000 });
  const laden = await p.evaluate(async () => {
    const out = [];
    for (const s of syms) {
      let u = '';
      try { u = assetBandUrl(s.id) || assetArtUrl(s.id); } catch (e) { u = ''; }
      // Ein Band-Foto ist eine echte Datei - laedt sie nicht, ist die Seite
      // still ohne Motiv (404 faellt niemandem auf).
      if (u.startsWith('url(img/')) {
        const pfad = u.slice(4, -1);
        const ok2 = await new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = pfad; });
        if (!ok2) out.push({ id: s.id, dateiWeg: pfad });
        continue;
      }
      if (!u) { out.push({ id: s.id, fehlt: true }); continue; }
      const src = u.slice(5, -2);
      const ok = await new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = src; });
      if (!ok) out.push({ id: s.id, kaputt: true });
    }
    return out;
  });
  laden.forEach(x => {
    if (x.fehlt) fail('KEIN MOTIV', `${x.id} bekommt kein Hintergrundmotiv - jedes gelistete Asset soll eins haben.`);
    if (x.kaputt) fail('MOTIV LAEDT NICHT', `${x.id}: der data-URI ist kein gueltiges SVG (Sonderzeichen nicht kodiert?).`);
    if (x.dateiWeg) fail('SCHEIN-FOTO FEHLT', `${x.id} steht in NOTE_FOTOS, aber ${x.dateiWeg} laedt nicht. Ein 404 faellt niemandem auf - die Seite steht dann einfach ohne Motiv da.`);
  });

  await b.close();
  if (perr.length) fail('SEITENFEHLER', perr.slice(0, 3).join(' | '));
  if (F.length) {
    console.error('KARTEN-LOOK NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
  console.log(`[kartenlook] ok (Karte gegen Seitengrund ${(global._kontrast || 0).toFixed(2)}:1 am Pixel, `
    + `${Object.values(schatten)[0].lagen} gestapelte Schattenlagen; Motiv auf ${geprueft} Kombinationen aus `
    + `${BREITEN.length} Breiten x ${ASSETS.length} Assets geprueft - ${mitMotiv} als Emblem, ${mitBand} als Band, ${ohneMotiv} mangels Platz aus, 0 Kollisionen; `
    + `Band erhoeht die Streuung um +${(global._bandZuwachs || 0).toFixed(1)} sigma)`);
})().catch(e => { console.error('KARTEN-LOOK-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
