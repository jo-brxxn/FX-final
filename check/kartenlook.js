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
//
// ⚠ 2026-09-14 NEU AUFGETEILT. Der Nutzer hat den Kartenton ausdruecklich
// zurueckgenommen ("mach weniger stark die hintergrundfarbe der Karten"),
// --card ging von #D6DCEC auf #E0E5F1 und der Flaechenkontrast damit von
// 1,230 auf 1,131:1. Einfach nur MIN_KONTRAST abzusenken haette den
// Waechter stumpf gemacht: er haette dann gar nichts mehr geschuetzt.
// Deshalb traegt jetzt der SCHATTEN die eigentliche Pruefung - er ist das,
// was die Karte wirklich abhebt, und er ist unabhaengig vom Kartenton
// (gemessen an derselben Kante: 1,340:1 bei BEIDEN Toenen). MIN_KONTRAST
// ist nur noch die Grenze, ab der die Flaeche ueberhaupt nicht mehr da ist.
const MIN_KONTRAST = 1.10;
const MIN_SCHATTENKANTE = 1.28;
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
      // Direkt UNTER der Kartenunterkante liegt der Schatten. Dort wird der
      // dunkelste Bildpunkt genommen, nicht der Median: der Schatten ist ein
      // Verlauf, sein Anfang ist die Kante.
      schatten: { x: Math.round(k.x + k.width * .3), y: Math.round(k.bottom + 1), w: 60, h: 6 },
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
      const dunkelst = z => {
        const d = ctx.getImageData(z.x, z.y, z.w, z.h).data, px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        const hell = q => .2126 * q[0] + .7152 * q[1] + .0722 * q[2];
        return px.sort((a, c) => hell(a) - hell(c))[0];
      };
      return { karte: med(zz.karte), grund: med(zz.grund), schatten: dunkelst(zz.schatten) };
    }, [foto, ziele]);
    const lum = c => { const s = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * s[0] + .7152 * s[1] + .0722 * s[2]; };
    const kon = (a, c) => { const l1 = lum(a), l2 = lum(c); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
    const gemessen = kon(farben.karte, farben.grund);
    if (!(gemessen >= MIN_KONTRAST)) fail('KARTENFLAECHE VERSCHWUNDEN',
      `am Bildschirmpixel nur ${gemessen.toFixed(3)}:1 zwischen Karte rgb(${farben.karte}) und Seitengrund rgb(${farben.grund}), verlangt sind ${MIN_KONTRAST}. Darunter ist die Karte farblich gar nicht mehr da.`);
    global._kontrast = gemessen;
    // Der Schatten ist das, was die Karte wirklich abhebt - und das Einzige,
    // was auch dann noch traegt, wenn der Kartenton (auf Nutzer-Wunsch)
    // zurueckgenommen wird. Deshalb eine eigene, strengere Untergrenze.
    const schattenKon = kon(farben.schatten, farben.grund);
    if (!(schattenKon >= MIN_SCHATTENKANTE)) fail('KARTE WIRFT KEINEN SCHATTEN',
      `die Schattenkante unter der Karte misst nur ${schattenKon.toFixed(3)}:1 gegen den Grund rgb(${farben.grund}), verlangt sind ${MIN_SCHATTENKANTE}. Der Schatten traegt seit dem 2026-09-14 die Kartentrennung, weil der Kartenton bewusst schwaecher ist - faellt er weg, liegen die Karten wieder flach auf der Seite.`);
    global._schatten = schattenKon;
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

  // ── 3) Was oben auf der Asset-Seite steht ────────────────────────────
  // ⚠ DIE KOPFLEISTE IST WIEDER WEG. Sie stand genau eine Version lang da
  // (VERSION-CHECK-518) und ist am 2026-09-14 auf ausdrueckliche Ansage
  // abgeraeumt worden: "mach die leiste oben wieder weg und mach das wie
  // vorher". Die sechs Pruefungen auf .ahead sind mit ihr gegangen - ein
  // Waechter auf ein Element, das es nicht mehr geben SOLL, meldet sonst
  // dauerhaft rot fuer den gewuenschten Zustand.
  //
  // Was bleibt, sind die zwei Dinge, die den Rueckbau ueberlebt haben und
  // beim naechsten Umbau still verschwinden koennten:
  //   • die schmale .dmeta-Zeile mit "Next event" und der Knopfleiste,
  //   • der PRICE-Streifen (1D/1W/1M/YTD) UNTEN in der Preis-Karte - der
  //     war beim 518er Umbau nach oben gewandert und muss jetzt wieder da
  //     sein, wo er herkam.
  // Dazu die Reihen-Ueberschriften, die der Nutzer ausdruecklich behalten
  // wollte, mit seiner Obergrenze ("nicht zu viel gliedern").
  const KOPF_BREITEN = [[1920, 1080], [1500, 1000], [1280, 900], [820, 1180], [390, 844]];
  const KOPF_ASSETS = ['USD', 'GOLD', 'SP500', 'GER100', 'USYIELD', 'NZYIELD'];
  let kopfGeprueft = 0, mitStreifen = 0, ohneStreifen = 0;
  for (const [w, h] of KOPF_BREITEN) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(240);
    for (const id of KOPF_ASSETS) {
      await p.evaluate(x => gotoSym(x), id);
      await p.waitForTimeout(170);
      const r = await p.evaluate(() => {
        const d = document.getElementById('detail');
        const titel = [...d.querySelectorAll('.ab-rtitel')];
        const ptile = d.querySelector('.ab-ptile');
        return {
          dmeta: !!d.querySelector('.dmeta'),
          knoepfe: d.querySelectorAll('.dmeta .dmeta-hist-btn').length,
          ahead: !!d.querySelector('.ahead'),
          ptile: !!ptile,
          // Der Streifen gehoert IN die Preis-Karte, nicht irgendwohin.
          streifenInKarte: !!(ptile && ptile.querySelector('.aperf')),
          streifenIrgendwo: !!d.querySelector('.aperf'),
          ueberlauf: d.scrollWidth > d.clientWidth + 1,
          titelAnzahl: titel.length,
          titelHoehe: Math.max(0, ...titel.map(e => Math.round(e.getBoundingClientRect().height))),
        };
      });
      kopfGeprueft++;
      if (r.ahead) fail('KOPFLEISTE IST ZURUECK',
        `${id} bei ${w}px: es gibt wieder ein .ahead-Element. Die Leiste war ausdruecklich unerwuenscht ("mach die leiste oben wieder weg").`);
      if (!r.dmeta) fail('META-ZEILE FEHLT',
        `${id} bei ${w}px: keine .dmeta-Zeile. Das ist die Zeile mit "Next event" und der Knopfleiste - ohne sie sind Price chart, History, Backtester und Data quality gar nicht erreichbar.`);
      if (r.dmeta && r.knoepfe < 4) fail('KNOEPFE FEHLEN IN DER META-ZEILE',
        `${id} bei ${w}px: nur ${r.knoepfe} von 4 Knoepfen (Price chart, History, Backtester, Data quality) in der .dmeta-Zeile.`);
      // ⚠ Der Streifen ist beim 518er Umbau nach oben gewandert und beim
      // Rueckbau wieder heruntergekommen. Genau solche Wanderungen fallen
      // sonst niemandem auf - die Zahlen sind ja irgendwo.
      if (r.ptile && !r.streifenInKarte) fail('PRICE-STREIFEN NICHT IN DER PREIS-KARTE',
        `${id} bei ${w}px: 1D/1W/1M/YTD stehen ${r.streifenIrgendwo ? 'irgendwo anders auf der Seite' : 'gar nicht da'}, nicht unten in der Preis-Karte. Dorthin gehoeren sie seit dem Rueckbau vom 2026-09-14.`);
      if (r.streifenInKarte) mitStreifen++; else ohneStreifen++;
      if (r.ueberlauf) fail('SEITE LAEUFT UEBER',
        `${id} bei ${w}px: die Asset-Seite scrollt waagerecht.`);
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
    + `Schattenkante ${(global._schatten || 0).toFixed(2)}:1, `
    + `${Object.values(schatten)[0].lagen} gestapelte Schattenlagen, EINE Kartenflaeche fuer alle Karten; `
    + `Asset-Seite auf ${kopfGeprueft} Kombinationen geprueft - keine Kopfleiste, ${mitStreifen} mit PRICE-Streifen in der Preis-Karte, ${ohneStreifen} ohne Preis-Karte)`);
})().catch(e => { console.error('KARTEN-LOOK-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
