#!/usr/bin/env node
// ── WAECHTER FUER DIE REZEPT-APP (Perfect Rezept) ─────────────────────────
// Gehoert zur ZWEITEN App dieses Repos (rezept.html + js/rezept/*, siehe
// docs/rezept.md). Der FX Analyst Pro wird hier NICHT angefasst.
//
// Warum es diesen Waechter gibt (Nutzer 2026-09-01): "mach das alle Buttons
// usw auch wirklich eine Funktion haben und auch funktionieren, aktuell
// klappt fast nix." Genau zwei Fehler waren dafuer verantwortlich, und beide
// haetten von einer Pruefung gefunden werden koennen:
//   1. Der Datei-Dialog fuers Bild hing nicht im DOM -> auf iOS Safari
//      passierte beim Klick nichts.
//   2. Jede Ausnahme im Speicherpfad endete als unbehandelte Promise-
//      Rejection -> Fenster blieb offen, keine Meldung, nichts gespeichert.
//
// Geprueft wird deshalb in fuenf Stufen:
//   A) Jeder Inline-Handler loest sich zu einer echten Funktion auf.
//   B) Jeder sichtbare Button bewirkt tatsaechlich etwas (DOM aendert sich).
//   C) Der komplette Ablauf laeuft durch (anlegen, bearbeiten, favorisieren,
//      filtern, loeschen, wiederherstellen, Theme wechseln).
//   D) Ungespeicherte Eingaben gehen beim Schliessen nicht verloren.
//   E) Jede Palette haelt AA-Kontrast gegen JEDE ihrer Flaechen ein.
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const BASE = (process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html').replace(/index\.html.*$/, '');
const URL = BASE + 'rezept.html';
const { chromium } = require(PW);
const fs = require('fs');
const os = require('os');
const path = require('path');

const F = [];
const fail = (stufe, text) => F.push(stufe + ': ' + text);

// Ein winziges, gueltiges PNG als Testfoto (8x8, Graustufe) - reicht fuer die
// komplette Bild-Pipeline und kostet nichts.
function testPng() {
  const zlib = require('zlib');
  const W = 8, H = 8;
  const roh = Buffer.concat(Array.from({ length: H }, () =>
    Buffer.concat([Buffer.from([0]), Buffer.alloc(W * 3, 160)])));
  const chunk = (t, d) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const typ = Buffer.from(t);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([typ, d])) : crc32(Buffer.concat([typ, d])));
    return Buffer.concat([len, typ, d, crc]);
  };
  function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crc ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = c ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(roh)), chunk('IEND', Buffer.alloc(0))]);
}

// ── E) Kontrast: rein statisch, braucht keinen Browser ───────────────────
function pruefeKontrast() {
  const s = fs.readFileSync('rezept.html', 'utf8');
  const lum = h => {
    h = h.replace('#', '');
    const v = [0, 2, 4].map(i => {
      const c = parseInt(h.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const cr = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const bloecke = [...s.matchAll(/(:root\[data-rez-theme="(\w+)"\]|\[data-rez-theme="(\w+)"\] \.hdr,[^{]+)\{([^}]*)\}/g)];
  const themes = {};
  for (const b of bloecke) {
    const name = b[2] || b[3], chrome = !b[2], t = {};
    for (const m of b[4].matchAll(/--([\w-]+):\s*([^;]+);/g)) t[m[1]] = m[2].trim();
    themes[name] = themes[name] || {};
    themes[name][chrome ? 'chrome' : 'content'] = t;
  }
  const namen = Object.keys(themes);
  if (namen.length < 2) fail('E', 'keine Theme-Bloecke gefunden - Regex kaputt?');
  for (const [name, v] of Object.entries(themes)) {
    if (!v.content || !v.chrome) { fail('E', `Theme "${name}" hat nur einen der beiden Bloecke`); continue; }
    for (const scope of ['content', 'chrome']) {
      const t = Object.assign({}, v.content, scope === 'chrome' ? v.chrome : {});
      const flaechen = (scope === 'chrome'
        ? [t['chrome-bg'], t.bg2, t.bg3, t.bg4, t.bg5]
        : [t.bg0, t.bg1, t.bg2, t.bg3, t.bg4, t.bg5]).filter(x => x && x.startsWith('#'));
      for (const tk of ['t0', 't1', 't2', 't3']) {
        if (!t[tk] || !t[tk].startsWith('#')) { fail('E', `${name}/${scope}: --${tk} fehlt oder ist kein Hex`); continue; }
        for (const bg of flaechen) {
          const r = cr(t[tk], bg);
          if (r < 4.5) fail('E', `${name}/${scope}: --${tk} ${t[tk]} auf ${bg} nur ${r.toFixed(2)}:1 (AA verlangt 4.5)`);
        }
      }
    }
  }
  return namen.length;
}

(async () => {
  const themeAnzahl = pruefeKontrast();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rezcheck-'));
  const foto = path.join(tmp, 'dish.png');
  fs.writeFileSync(foto, testPng());

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const jsFehler = [];
  p.on('pageerror', e => jsFehler.push(e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(t)) jsFehler.push(t);
  });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#rezNav .np').length > 0, { timeout: 15000 })
    .catch(() => fail('C', 'Navigationsleiste wurde nie gerendert'));

  // Drei Rezepte ueber die Datenschicht anlegen - die Oberflaechen-Pruefungen
  // brauchen Inhalt, das eigentliche Anlegen per UI kommt in Stufe C.
  await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const px = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#999"/></svg>');
    for (const [t, m, tag] of [['Alpha Bowl', 15, 'Lunch'], ['Beta Roast', 90, 'Dinner'], ['Gamma Oats', 5, 'Breakfast']]) {
      await S.saveRecipe({ id: S.uid(), title: t, min: m, tags: [tag], fav: t === 'Beta Roast', cover: px, thumb: px, ingredients: ['1 thing'], blocks: [{ t: 'text', v: 'Step.' }] });
    }
  });
  await p.waitForTimeout(600);

  // ── A) Loest sich JEDER Inline-Handler zu einer echten Funktion auf? ──
  // Das ist die haeufigste Ursache fuer "der Button tut nichts": eine
  // Funktion existiert im Modul, wurde aber nie ueber die window-Bruecke
  // exportiert. Der Klick wirft dann ein stilles ReferenceError.
  const ansichten = ['overview', 'recipes'];
  const unaufloesbar = new Set();
  async function sammleHandler(wo) {
    const namen = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('[onclick],[oninput],[onchange],[onkeydown]').forEach(el => {
        ['onclick', 'oninput', 'onchange', 'onkeydown'].forEach(a => {
          const v = el.getAttribute(a);
          if (!v) return;
          // ⚠ Nur echte Funktionsaufrufe sammeln, keine Methoden: in
          // "event.stopPropagation()" ist stopPropagation eine Methode des
          // Ereignisses, kein globaler Name - ohne diesen Filter meldet die
          // Pruefung lauter Scheinfehler.
          for (const m of v.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) out.push(m[2]);
        });
      });
      return [...new Set(out)];
    });
    for (const n of namen) {
      const da = await p.evaluate(fn => typeof window[fn] === 'function' ||
        ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'Boolean', 'String', 'Number'].includes(fn), n);
      if (!da) unaufloesbar.add(wo + ' -> ' + n + '()');
    }
  }
  for (const v of ansichten) {
    await p.evaluate(id => window.rezShowPage(id), v);
    await p.waitForTimeout(300);
    await sammleHandler(v);
  }
  // auch in den Fenstern
  await p.evaluate(() => window.rezOpenForm(null)); await p.waitForTimeout(400); await sammleHandler('add-form');
  await p.evaluate(() => window.rezCloseModal());
  await p.evaluate(() => window.rezOpenSettings()); await p.waitForTimeout(400); await sammleHandler('settings');
  await p.evaluate(() => window.rezCloseModal());
  const ersteId = await p.evaluate(() => (window.__rezIds = null, document.querySelector('.rez-card') ? 1 : 0));
  await p.evaluate(() => window.rezShowPage('recipes')); await p.waitForTimeout(300);
  await p.click('.rez-card'); await p.waitForTimeout(700); await sammleHandler('detail');
  await p.click('.rd-menu-btn'); await p.waitForTimeout(300); await sammleHandler('detail-menu');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  unaufloesbar.forEach(x => fail('A', 'Handler zeigt auf keine Funktion: ' + x));

  // ── B) Bewirkt jeder sichtbare Button tatsaechlich etwas? ─────────────
  // Gemessen am DOM: veraendert der Klick den sichtbaren Inhalt, den
  // Fenster-Zustand oder eine Klasse? Tut er nichts, ist der Button tot.
  const NAVIGIERT = /rezSwitchApp|rezCloseModal|rezRequestClose|rezKeepEditing|rezDiscardClose/;
  for (const v of ansichten) {
    await p.evaluate(id => window.rezShowPage(id), v);
    await p.waitForTimeout(300);
    const tote = await p.evaluate(async (skip) => {
      const re = new RegExp(skip);
      const out = [];
      // ⚠ Vor JEDEM Klick den Filterzustand zuruecksetzen und die Liste neu
      // abfragen. Sonst passiert Folgendes: ein Klick auf einen Tag-Chip
      // filtert das Raster, der naechste Klick trifft den Stern einer jetzt
      // AUSGEBLENDETEN Karte - der Schalter arbeitet korrekt, das sichtbare
      // Raster bleibt aber identisch, und die Pruefung meldet einen toten
      // Button, den es nicht gibt. Genau dieser Scheinfehler ist beim ersten
      // Lauf entstanden.
      const frisch = () => [...document.querySelectorAll('#rezPageArea [onclick], .hdr [onclick]')]
        .filter(b => b.offsetParent);
      // Ein Schalter, der bereits in seinem Zielzustand steht (Chip "All",
      // wenn ohnehin nicht gefiltert wird), darf nichts aendern - das ist
      // richtig so und kein toter Button.
      const fingerAbdruck = () => document.getElementById('rezPageArea').innerHTML
        + '|' + document.getElementById('rezModals').innerHTML
        + '|' + (document.querySelector('#rezNav .np.on') || {}).textContent
        + '|' + (document.activeElement && (document.activeElement.id || document.activeElement.className));
      const gesehen = new Set();
      for (let i = 0; i < 200; i++) {
        if (window.rezClearFilters) window.rezClearFilters();
        await new Promise(r => setTimeout(r, 120));
        const liste = frisch();
        const b = liste.find(el => {
          const oc = el.getAttribute('onclick') || '';
          return !gesehen.has(oc) && !re.test(oc) && !el.classList.contains('on');
        });
        if (!b) break;
        const oc = b.getAttribute('onclick') || '';
        gesehen.add(oc);
        const vorher = fingerAbdruck();
        b.click();
        await new Promise(r => setTimeout(r, 400));
        if (fingerAbdruck() === vorher) out.push(oc.slice(0, 60));
        if (window.rezCloseModal) window.rezCloseModal();
        await new Promise(r => setTimeout(r, 120));
      }
      return out;
    }, NAVIGIERT.source);
    tote.forEach(x => fail('B', `Button ohne Wirkung auf "${v}": ${x}`));
  }

  // ── C) Kompletter Ablauf ueber die Oberflaeche ────────────────────────
  // ⚠ Stufe B hat beim Durchklicken Such-/Zeit-/Tag-/Favoritenfilter gesetzt.
  // Ohne Zuruecksetzen zaehlt die naechste Pruefung ein GEFILTERTES Raster
  // und meldet einen Fehler, den es nicht gibt.
  await p.evaluate(() => window.rezClearFilters());
  await p.waitForTimeout(300);
  await p.evaluate(() => window.rezShowPage('overview'));
  await p.waitForTimeout(300);
  await p.click('.dw-click');                                  // "Add New Meal"
  await p.waitForTimeout(500);
  if (!(await p.locator('#rfTitle').isVisible().catch(() => false)))
    fail('C', '"Add New Meal" oeffnet das Hinzufuegen-Fenster nicht');
  if ((await p.locator('#rezNav .np.on .np-lbl').textContent().catch(() => '')) !== 'Recipes')
    fail('C', '"Add New Meal" wechselt nicht in die Kategorie Recipes');

  await p.fill('#rfTitle', 'Guard Test Dish');
  const fc = p.waitForEvent('filechooser', { timeout: 8000 });
  await p.click('.rf-drop');
  await fc.then(c => c.setFiles(foto)).catch(() => fail('C', 'Der Datei-Dialog fuers Titelbild oeffnet sich nicht'));
  await p.waitForFunction(() => !!document.querySelector('.rf-drop img'), { timeout: 20000 })
    .catch(() => fail('C', 'Das gewaehlte Titelbild erscheint nicht im Formular'));
  // ⚠ Der <input type=file> MUSS im Dokument haengen - sonst oeffnet iOS
  // Safari den Dialog nicht (Bugreport 2026-09-01). Wird hier direkt am
  // Quelltext geprueft, weil Chromium den Fehler nicht zeigt.
  const quelle = fs.readFileSync('js/rezept/app.js', 'utf8');
  if (!/appendChild\(inp\)/.test(quelle))
    fail('C', 'pickFile() haengt den <input type=file> nicht ins Dokument (auf iOS Safari oeffnet der Dialog dann nicht)');

  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  await p.click('.modal button:has-text("Add recipe")');
  await p.waitForTimeout(1200);
  const nachSpeichern = await p.locator('.rez-card').count();
  if (nachSpeichern !== 4) fail('C', `Nach dem Speichern stehen ${nachSpeichern} statt 4 Karten im Raster`);
  if (await p.locator('#rfTitle').count()) fail('C', 'Das Formular bleibt nach dem Speichern offen');

  // Suche / Zeitfilter / Tag / Favoriten
  await p.fill('#rezSearchInp', 'zzzz'); await p.waitForTimeout(300);
  if (await p.locator('.rez-card').count() !== 0) fail('C', 'Die Suche filtert nicht');
  await p.fill('#rezSearchInp', 'alpha'); await p.waitForTimeout(300);
  if (await p.locator('.rez-card').count() !== 1) fail('C', 'Die Suche findet den erwarteten Treffer nicht');
  await p.fill('#rezSearchInp', ''); await p.waitForTimeout(300);
  await p.selectOption('.rez-sel', '15'); await p.waitForTimeout(300);
  const kurz = await p.locator('.rez-card').count();
  if (kurz !== 2) fail('C', `Zeitfilter "<= 15 min" zeigt ${kurz} statt 2 Karten`);
  await p.selectOption('.rez-sel', '0'); await p.waitForTimeout(300);
  // Definierter Ausgangszustand: genau EIN Favorit. Stufe B hat beim
  // Durchklicken Sterne umgeschaltet - ohne dieses Zuruecksetzen prueft die
  // naechste Zeile gegen eine Zahl, die vom Klickpfad abhaengt.
  await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    for (const r of S.state.index.recipes.slice()) if (r.fav) await S.toggleFav(r.id);
    await S.toggleFav(S.state.index.recipes[0].id);
  });
  await p.waitForTimeout(700);
  await p.evaluate(() => window.renderRecipes ? window.renderRecipes() : window.rezShowPage('recipes'));
  await p.waitForTimeout(300);
  await p.click('.rez-toolbar .btn:has-text("Favourites")'); await p.waitForTimeout(300);
  const favN = await p.locator('.rez-card').count();
  if (favN !== 1) fail('C', `Der Favoriten-Filter zeigt ${favN} statt 1 Karte`);
  await p.click('.rez-toolbar .btn:has-text("Favourites")'); await p.waitForTimeout(300);
  const tagChips = await p.locator('.tag-chip').count();
  if (tagChips < 2) fail('C', 'Es werden keine Tag-Chips gerendert');
  await p.locator('.tag-chip').nth(1).click(); await p.waitForTimeout(300);
  if (await p.locator('.rez-card').count() === 4) fail('C', 'Ein Tag-Chip filtert nicht');
  await p.locator('.tag-chip').first().click(); await p.waitForTimeout(300);

  // Favoriten-Stern auf der Karte
  const vorFav = await p.locator('.rez-card-star.on').count();
  await p.locator('.rez-card-star').first().click(); await p.waitForTimeout(700);
  if (await p.locator('.rez-card-star.on').count() === vorFav) fail('C', 'Der Stern auf der Karte schaltet den Favoriten nicht um');

  // Detail -> Bearbeiten -> speichern
  await p.locator('.rez-card').first().click(); await p.waitForTimeout(800);
  if (!(await p.locator('.rd-title').count())) fail('C', 'Das Detailfenster oeffnet sich nicht');
  await p.click('.rd-menu-btn'); await p.waitForTimeout(300);
  await p.click('.rd-menu-item:has-text("Edit recipe")'); await p.waitForTimeout(700);
  if (!(await p.locator('#rfTitle').count())) fail('C', '"Edit recipe" oeffnet das Formular nicht');
  await p.fill('#rfTitle', 'Renamed Dish');
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  await p.click('.modal button:has-text("Save changes")'); await p.waitForTimeout(1200);
  if (!(await p.locator('.rez-card-title:has-text("Renamed Dish")').count()))
    fail('C', 'Eine Umbenennung landet nicht im Raster');

  // Papierkorb + Wiederherstellen
  await p.locator('.rez-card-title:has-text("Renamed Dish")').click(); await p.waitForTimeout(800);
  await p.click('.rd-menu-btn'); await p.waitForTimeout(300);
  await p.click('.rd-menu-item.danger'); await p.waitForTimeout(400);
  await p.click('.modal button.btn-danger'); await p.waitForTimeout(1000);
  if (await p.locator('.rez-card-title:has-text("Renamed Dish")').count())
    fail('C', 'Ein geloeschtes Rezept steht weiter im Raster');
  await p.evaluate(() => window.rezOpenSettings()); await p.waitForTimeout(500);
  if (!(await p.locator('.trash-row').count())) fail('C', 'Der Papierkorb bleibt nach dem Loeschen leer');
  await p.click('.trash-row button:has-text("Restore")'); await p.waitForTimeout(1000);
  await p.evaluate(() => window.rezCloseModal());
  await p.evaluate(() => window.rezShowPage('recipes')); await p.waitForTimeout(500);
  if (!(await p.locator('.rez-card-title:has-text("Renamed Dish")').count()))
    fail('C', 'Wiederherstellen aus dem Papierkorb bringt das Rezept nicht zurueck');

  // Alle Themes durchschalten - jedes muss die Variablen wirklich setzen
  const themeIds = await p.evaluate(() => Array.from(document.styleSheets)
    .flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } })
    .map(r => (r.selectorText || '').match(/^:root\[data-rez-theme="(\w+)"\]$/))
    .filter(Boolean).map(m => m[1]));
  if (themeIds.length !== themeAnzahl) fail('E', `CSS kennt ${themeIds.length} Themes, die Kontrastpruefung ${themeAnzahl}`);
  for (const id of themeIds) {
    await p.evaluate(t => window.rezSetTheme(t), id);
    await p.waitForTimeout(350);
    const r = await p.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        gesetzt: document.documentElement.getAttribute('data-rez-theme'),
        bg0: cs.getPropertyValue('--bg0').trim(),
        t0: cs.getPropertyValue('--t0').trim(),
        accent: cs.getPropertyValue('--accent').trim(),
        live: cs.getPropertyValue('--live').trim(),
        avatar: cs.getPropertyValue('--avatar-bg').trim(),
      };
    });
    if (r.gesetzt !== id) fail('C', `Theme "${id}" wird nicht gesetzt (steht auf "${r.gesetzt}")`);
    ['bg0', 't0', 'accent', 'live', 'avatar'].forEach(k => {
      if (!r[k]) fail('E', `Theme "${id}": --${k === 'avatar' ? 'avatar-bg' : k} ist leer`);
    });
    await p.evaluate(() => window.rezCloseModal());
  }
  // Ein entferntes Theme im Speicher darf die Seite nicht farblos machen
  const migriert = await p.evaluate(async () => {
    localStorage.setItem('rez_theme', 'clay');
    return true;
  });
  const p2 = await ctx.newPage();
  await p2.goto(URL, { waitUntil: 'load' });
  await p2.waitForTimeout(900);
  const nachMigration = await p2.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-rez-theme'),
    bg0: getComputedStyle(document.documentElement).getPropertyValue('--bg0').trim(),
  }));
  if (!nachMigration.bg0) fail('C', `Ein entferntes Theme im Speicher laesst die Seite ohne Farben zurueck (data-rez-theme="${nachMigration.attr}")`);
  await p2.close();

  // ── D) Ungespeicherte Eingaben ───────────────────────────────────────
  await p.evaluate(() => window.rezShowPage('recipes')); await p.waitForTimeout(300);
  await p.evaluate(() => window.rezOpenForm(null)); await p.waitForTimeout(400);
  await p.fill('#rfTitle', 'Halbfertig');
  await p.evaluate(() => { const ov = document.getElementById('rezOv'); ov.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(400);
  if (!(await p.locator('.uc-box').count()))
    fail('D', 'Klick neben das Fenster verwirft die Eingaben ohne Nachfrage');
  const knoepfe = await p.locator('.uc-btn').allTextContents();
  if (knoepfe.length !== 3) fail('D', `Die Nachfrage hat ${knoepfe.length} statt 3 Buttons: ${knoepfe.join(' / ')}`);
  await p.click('.uc-keep'); await p.waitForTimeout(300);
  if (!(await p.locator('#rfTitle').count())) fail('D', '"Keep editing" schliesst das Formular trotzdem');
  if ((await p.inputValue('#rfTitle').catch(() => '')) !== 'Halbfertig')
    fail('D', '"Keep editing" verliert die bereits eingegebenen Werte');
  // Escape muss denselben Weg gehen
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  if (!(await p.locator('.uc-box').count())) fail('D', 'Escape verwirft die Eingaben ohne Nachfrage');
  await p.click('.uc-discard'); await p.waitForTimeout(400);
  if (await p.locator('#rfTitle').count()) fail('D', '"Discard & close" schliesst das Formular nicht');

  if (jsFehler.length) [...new Set(jsFehler)].slice(0, 8).forEach(e => fail('JS', e.slice(0, 200)));

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (F.length) {
    console.error('REZEPT-WAECHTER NICHT BESTANDEN:\n');
    F.forEach(x => console.error('  ' + x));
    process.exit(1);
  }
  console.log(`[rezept] ok (${themeAnzahl} Themes, Handler/Buttons/Ablauf/Nachfrage/Kontrast)`);
})().catch(e => { console.error('REZEPT-WAECHTER abgestuerzt: ' + e.message); process.exit(1); });
