// ══ WAECHTER: ZERBROCHENE HTML-ATTRIBUTE ═════════════════════════════════
//
// Anlass: Nutzer-Bugreport 2026-09-18 mit Bildschirmfoto - in der Kopfleiste
// stand mitten zwischen den Statusanzeigen der Textfetzen
// «ueber toLocaleString() ohne Optionen – genau». Das war ein Stueck des
// VERSION-CHECK-524-Banners.
//
// URSACHE, gemessen und nicht geraten: der Banner-Text stand in einem
// title="..."-Attribut und enthielt 32 rohe doppelte Anfuehrungszeichen. Das
// erste davon SCHLIESST das Attribut - alles danach liest der Parser als
// weitere Attribute und schliesslich als Textinhalt. Im DOM standen dadurch
// hunderte Pseudo-Attribute (`sind=`, `ueberhaupt=`, `alterungsfaehig.=`,
// `(368=`), und der Rest wurde sichtbar.
//
// ⚠ Die Fehlerklasse ist groesser als die eine Zeile. Sie entsteht ueberall,
// wo freier Text in ein "-begrenztes Attribut geraet:
//   (a) fest in index.html geschrieben (der gemeldete Fall),
//   (b) per Template-Literal, wenn escH() fehlt - gemessen 41 von 119
//       Attribut-Interpolationen in js/*.js ohne escH/escJH. Die meisten
//       tragen feste Zeichenketten, einige aber freien Feed-Text
//       (Indikator-, Asset-, Ereignisnamen). Bricht eine Quelle je ein `"`
//       mit, sieht es genauso aus.
//
// Deshalb zwei Stufen, und die zweite ist die tragende:
//   1) STATISCH: die fest in index.html stehenden Attribute. Dort ist kein
//      escH() moeglich, der Text selbst muss frei von `"` sein.
//   2) IM DOM, ueber alle Seiten UND alle Fenster: kein Element darf einen
//      Attributnamen tragen, den es in HTML/SVG/ARIA nicht gibt. Ein
//      zerbrochenes Attribut erzeugt sofort Dutzende davon - egal, ob der
//      Text fest dasteht oder aus einem Feed kommt. Der Browser IST der
//      Parser; ihn zu fragen ist verlaesslicher, als selbst zu parsen.
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';

let fehler = 0;
const rot = (m) => { console.log('  ✗ ' + m); fehler++; };
const gruen = (m) => console.log('  ✓ ' + m);

// ── 1) Statisch: index.html ──────────────────────────────────────────────
// Ein Attribut der Form name="..." darf zwischen den Grenzen kein rohes "
// fuehren. Das ist per Definition so - der Test ist deshalb, ob der Text
// NACH dem schliessenden " noch wie Markup aussieht oder wie Fliesstext.
console.log('── 1) index.html: kein Attribut bricht mitten im Text ──');
const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
// Alle Attribute mit laengerem Fliesstext einsammeln (title/alt/placeholder/
// aria-label) und pruefen, was direkt dahinter steht.
const attrRe = /\s(title|alt|placeholder|aria-label)="([^"]*)"/g;
let m, geprueft = 0, verdacht = 0;
while ((m = attrRe.exec(html)) !== null) {
  geprueft++;
  const nach = html.slice(attrRe.lastIndex, attrRe.lastIndex + 60);
  // Nach einem sauberen Attribut folgt: ein weiteres Attribut, ">", "/>"
  // oder Zeilenumbruch/Leerraum. Folgt stattdessen ein Wort mit einem
  // Satzzeichen, ist das Attribut mitten im Text abgerissen.
  if (/^\s*(>|\/>|[a-zA-Z-]+\s*=|\n|$)/.test(nach)) continue;
  // Fliesstext-Merkmale: Komma/Punkt/Umlaut direkt hinter dem Attribut.
  if (/^\s*[a-zA-ZäöüÄÖÜ][a-zäöü]{2,}[\s,.;:)]/.test(nach)) {
    const zeile = html.slice(0, m.index).split('\n').length;
    rot(`index.html:${zeile} — ${m[1]}="…" endet mitten im Text, danach folgt Fliesstext: «${nach.replace(/\s+/g, ' ').slice(0, 50)}»`);
    console.log(`      Ein rohes " im Attributtext schliesst das Attribut. Typografische Anfuehrungszeichen („ “) koennen das nicht.`);
    verdacht++;
  }
}
if (!verdacht) gruen(`${geprueft} Text-Attribute in index.html, keines bricht mitten im Text`);

// ── 2) Im DOM: keine erfundenen Attributnamen ────────────────────────────
// Die Liste ist bewusst LANG und nicht "alles was klein geschrieben ist":
// ein zerbrochenes Attribut erzeugt Namen wie `sind`, `ueberhaupt`,
// `alterungsfaehig.` - die faende eine lockere Regel nicht.
const ERLAUBT = new Set(('id class style title href src alt type value name placeholder disabled ' +
  'checked selected readonly multiple rows cols min max step width height viewbox d fill stroke ' +
  'x y x1 y1 x2 y2 cx cy r rx ry points transform opacity clip-path preserveaspectratio ' +
  'stroke-width stroke-dasharray stroke-linecap stroke-linejoin vector-effect text-anchor ' +
  'font-size font-weight font-family dominant-baseline xmlns lang charset content rel media ' +
  'target for colspan rowspan maxlength autocomplete spellcheck contenteditable draggable ' +
  'tabindex role hidden open loading decoding integrity crossorigin sizes srcset defer async ' +
  'accept capture inputmode pattern required autofocus form list wrap download ping ' +
  'referrerpolicy enterkeyhint translate dir slot part is shape-rendering mask filter offset ' +
  'stop-color stop-opacity gradientunits gradienttransform patternunits marker-end paint-order ' +
  'version label scope headers start reversed muted controls playsinline poster preload allow ' +
  'sandbox frameborder scrolling size cellpadding cellspacing border align valign bgcolor ' +
  'maxheight minheight fill-opacity stroke-opacity fill-rule clip-rule mask-type ' +
  'xml:space xlink:href focusable pointer-events overflow display visibility ' +
  'maskcontentunits maskunits pathlength clippathunits primitiveunits spreadmethod ' +
  'requiredfeatures systemlanguage baseprofile classname ' +
  // SMIL-Animation (seit 2026-09-23: Flaggenwelle #aiWave, Falten #aiFoldG) -
  // echte SVG-Attribute; ohne sie meldete der Waechter jede Flagge als zerbrochen.
  'attributename attributetype dur repeatcount repeatdur values from to by begin end ' +
  'calcmode keytimes keysplines additive accumulate restart ' +
  // SVG-Filter (seit 2026-09-23: gezeichnete Flaggen, Filter #aiDuo; #aiDuoBand mit fester Flaeche).
  'color-interpolation-filters filterunits primitiveunits tablevalues slope intercept amplitude exponent in in2 result stddeviation').split(/\s+/));
const PRAEFIX = /^(data-|aria-|on|xlink:|xmlns:|v-|:|@|_)/;

(async () => {
  let PW;
  try { PW = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
  catch (e) {
    console.log('\n── 2) Im DOM: uebersprungen (kein Playwright) ──');
    process.exit(fehler ? 1 : 0);
  }
  const { wartenBisDatenDa } = require('./warten.js');
  console.log('\n── 2) Im DOM: keine erfundenen Attributnamen (alle Seiten + Fenster) ──');
  const b = await PW.chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });

  const scan = async (wo) => p.evaluate(({ erlaubt, praefix }) => {
    const re = new RegExp(praefix);
    const bad = [];
    document.querySelectorAll('*').forEach(el => {
      for (const a of el.attributes) {
        const n = a.name.toLowerCase();
        if (re.test(n) || erlaubt.includes(n)) continue;
        bad.push({ tag: el.tagName, attr: a.name.slice(0, 32),
          id: (el.id || '').slice(0, 20),
          klasse: String(el.className && el.className.baseVal !== undefined
            ? el.className.baseVal : el.className || '').slice(0, 28) });
      }
    });
    return { n: document.querySelectorAll('*').length, bad };
  }, { erlaubt: [...ERLAUBT], praefix: PRAEFIX.source });

  const SEITEN = ['over', 'dash', 'cur', 'mx', 'trends', 'cot', 'sent', 'seas', 'data',
    'rate', 'news', 'edge', 'carry', 'pairs', 'cal', 'notes', 'regime'];
  let elemente = 0, treffer = 0;
  const gesehen = new Set();
  for (const s of SEITEN) {
    await p.evaluate(x => { try { showTab(x); } catch (e) {} }, s);
    await p.waitForTimeout(280);
    const r = await scan(s);
    elemente = Math.max(elemente, r.n);
    r.bad.forEach(x => {
      const k = x.tag + '|' + x.attr + '|' + x.klasse;
      if (gesehen.has(k)) return;
      gesehen.add(k);
      rot(`${s}: <${x.tag}${x.id ? ' #' + x.id : ''}${x.klasse ? ' .' + x.klasse : ''}> traegt das Attribut «${x.attr}» — das gibt es in HTML/SVG nicht. Ein zerbrochenes Attribut macht aus Text Attributnamen.`);
      treffer++;
    });
  }
  // Und die Fenster: sie stehen auf display:none, ihre Attribute existieren
  // aber genauso. Einzeln einblenden waere unnoetig - der Scan geht ueber
  // das ganze Dokument, Sichtbarkeit spielt keine Rolle.
  if (!treffer) gruen(`${SEITEN.length} Seiten, bis zu ${elemente} Elemente, 0 erfundene Attributnamen`);

  // ── 3) Kein TEXT in einem gestreckten SVG ─────────────────────────────
  // Nutzer-Bugreport 2026-09-18, zweites Bildschirmfoto: "guck mal die Zahlen
  // die sind so breit". `preserveAspectRatio="none"` streckt ein SVG auf die
  // Containerbreite - und zwar ALLES darin, auch Schrift und Kreise. Fuer
  // Kurven und Balken ist das gewollt, fuer Buchstaben nicht.
  //
  // GEMESSEN beim Anlass (Streckfaktor = (Breite/viewBox-Breite) geteilt
  // durch (Hoehe/viewBox-Hoehe), 1.0 = unverzerrt):
  //   Historie, Score-Linie   viewBox 434 -> gerendert 1374   3,17x
  //   Backtester, Zinspfad    viewBox 1670 -> gerendert 1399  0,84x
  //   Seasonality-Balken      viewBox 880 -> gerendert 1256   1,43x
  // 12 weitere SVGs mit Text waren unverzerrt, 14 gestreckte ohne Text
  // unproblematisch - betroffen ist genau die Kombination.
  //
  // Der Weg heraus ist nicht "nicht mehr strecken" (dann fuellt der Chart die
  // Breite nicht), sondern die Beschriftung als HTML darueber zu legen -
  // chartAchsenHtml()/chartPunkteHtml() in js/main.js.
  console.log('\n── 3) Kein Text in einem gestreckten SVG ──');
  const streckScan = () => p.evaluate(() => {
    const out = [];
    document.querySelectorAll('svg').forEach(sv => {
      if (!sv.querySelectorAll('text').length) return;
      const vb = (sv.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const r = sv.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || vb.length < 4 || !vb[2] || !vb[3]) return;
      const f = (r.width / vb[2]) / (r.height / vb[3]);
      if (Math.abs(f - 1) <= 0.15) return;
      out.push({ f: Math.round(f * 100) / 100,
        klasse: String(sv.className && sv.className.baseVal !== undefined ? sv.className.baseVal : '') || '(ohne Klasse)',
        vb: vb[2] + 'x' + vb[3], px: Math.round(r.width) + 'x' + Math.round(r.height),
        txt: (sv.querySelector('text').textContent || '').slice(0, 16) });
    });
    return out;
  });
  let streckN = 0, svgN = 0;
  const streckGesehen = new Set();
  for (const s of SEITEN) {
    await p.evaluate(x => { try { showTab(x); } catch (e) {} }, s);
    await p.waitForTimeout(280);
    const r = await streckScan();
    svgN += await p.evaluate(() => [...document.querySelectorAll('svg')].filter(v => v.querySelectorAll('text').length).length);
    r.forEach(x => {
      const k = s + '|' + x.klasse + '|' + x.vb;
      if (streckGesehen.has(k)) return; streckGesehen.add(k);
      rot(`${s}: SVG .${x.klasse} (viewBox ${x.vb}, gerendert ${x.px}) streckt seinen Text um ${x.f}x — z.B. «${x.txt}». Beschriftung gehoert als HTML darueber (chartAchsenHtml), nicht ins gestreckte SVG.`);
      streckN++;
    });
  }
  // Und die beiden Fenster, in denen der Fehler gemeldet wurde.
  await p.evaluate(() => { try { gotoSym('USD'); } catch (e) {} });
  await p.waitForTimeout(400);
  for (const [nm, fn] of [['mHist', 'openHistModal'], ['mBt', 'openBacktester']]) {
    await p.evaluate(f => { try { window[f]('USD'); } catch (e) {} }, fn);
    await p.waitForTimeout(1100);
    (await streckScan()).forEach(x => {
      rot(`${nm}: SVG .${x.klasse} (viewBox ${x.vb}, gerendert ${x.px}) streckt seinen Text um ${x.f}x — z.B. «${x.txt}».`);
      streckN++;
    });
    await p.evaluate(n => { try { closeM(n); } catch (e) {} }, nm);
    await p.waitForTimeout(250);
  }
  if (!streckN) gruen(`${svgN} SVGs mit Text ueber ${SEITEN.length} Seiten und 2 Fenster, keines verzerrt seine Schrift`);

  await b.close();
  console.log(fehler ? `\n✗ HTML: ${fehler} Fund(e)` : '\n✓ HTML: kein zerbrochenes Attribut');
  process.exit(fehler ? 1 : 0);
})();
