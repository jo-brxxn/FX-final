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

// ── Statisch: die Sync-Kopfzeilen muessen zum FX Analyst Pro passen ──────
// Nutzer-Bugreport 2026-09-02 ("Sync failed: HTTP 401"): diese App schickte
// zusaetzlich `Authorization: Bearer <key>`. Bei den heutigen
// Supabase-Schluesseln (sb_publishable_...) ist das kein gueltiges JWT und
// der Gateway antwortet 401 - mit demselben Schluessel, mit dem der FX
// Analyst Pro (nur `apikey`) einwandfrei arbeitet.
function pruefeSyncKopfzeilen() {
  const s = fs.readFileSync('js/rezept/store.js', 'utf8');
  const m = s.match(/function cloudHeaders\([^)]*\)\s*\{([^}]*)\}/);
  if (!m) { fail('SYNC', 'cloudHeaders() in js/rezept/store.js nicht gefunden'); return; }
  if (/Authorization/i.test(m[1]))
    fail('SYNC', 'cloudHeaders() setzt einen Authorization-Header — genau das hat den 401 verursacht. Nur `apikey` senden, wie js/main.js.');
  if (!/apikey/.test(m[1]))
    fail('SYNC', 'cloudHeaders() sendet keinen apikey-Header');
  const fx = fs.readFileSync('js/main.js', 'utf8');
  const mf = fx.match(/function cloudHeaders\([^)]*\)\s*\{([^}]*)\}/);
  if (mf) {
    const norm = t => (t.match(/'[\w-]+':/g) || []).sort().join(',');
    if (norm(m[1]) !== norm(mf[1]))
      fail('SYNC', `Die Kopfzeilen weichen vom FX Analyst Pro ab: Rezept [${norm(m[1])}] vs FX [${norm(mf[1])}]. Beide reden mit derselben Gegenstelle.`);
  }
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
  // ⚠ Genau EIN Inhalts- und EIN Chrome-Block je Theme. Ein zweiter Block
  // mit demselben Selektor ist fuer den Browser egal, macht aber jedes
  // Nachschlagen (und diese Pruefung) blind fuer die Haelfte der Tokens -
  // beim Einfuehren der Typo-Tokens 2026-09-02 genau so passiert.
  const zaehle = (sel) => (s.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  namen.forEach(n => {
    const c = zaehle(`:root[data-rez-theme="${n}"]{`);
    if (c > 1) fail('E', `Theme "${n}" hat ${c} Inhalts-Bloecke - zusammenfuehren, sonst liest jede Pruefung nur einen davon`);
  });
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
  pruefeSyncKopfzeilen();
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
  // ⚠ ALLE Kategorien, nicht nur die ersten beiden: ein toter Button auf
  // einer nicht geprueften Seite faellt sonst niemandem auf.
  const ansichten = ['overview', 'recipes', 'inspo', 'week', 'shopping', 'cooked'];
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
  await p.click('#pgRecipes .rez-card'); await p.waitForTimeout(700); await sammleHandler('detail');
  await p.click('.rd-menu-btn'); await p.waitForTimeout(300); await sammleHandler('detail-menu');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  unaufloesbar.forEach(x => fail('A', 'Handler zeigt auf keine Funktion: ' + x));

  // ── B) Bewirkt jeder sichtbare Button tatsaechlich etwas? ─────────────
  // Gemessen am DOM: veraendert der Klick den sichtbaren Inhalt, den
  // Fenster-Zustand oder eine Klasse? Tut er nichts, ist der Button tot.
  // ⚠ rezShowPage gehoert dazu: ein Navigations-Knopf wechselt die Seite,
  // die Schleife klickt danach Knoepfe einer ANDEREN Seite und meldet sie
  // unter dem falschen Namen als wirkungslos. Navigation prueft Stufe C/F.
  const NAVIGIERT = /rezSwitchApp|chooseApp|rezCloseModal|rezRequestClose|rezKeepEditing|rezDiscardClose|rezShowPage/;
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
        + '|' + (document.activeElement && (document.activeElement.id || document.activeElement.className))
        // ⚠ Der Toast gehoert dazu: "From this week's plan" bei leerem Plan
        // sagt "nothing planned" - das IST die richtige Rueckmeldung und kein
        // toter Button. Ohne diese Zeile meldete die Pruefung drei
        // Scheinfehler.
        + '|' + ((document.getElementById('rezToast') || {}).textContent || '')
        + '|' + (document.getElementById('rezToast') || {className:''}).className;
      const gesehen = new Set();
      for (let i = 0; i < 200; i++) {
        if (window.rezClearFilters) window.rezClearFilters();
        if (window.rezInspoClear) window.rezInspoClear();
        // ⚠ Toast VOR jedem Klick leeren: zwei aufeinanderfolgende Klicks mit
        // derselben Meldung ("nothing planned") sahen sonst wie "keine
        // Wirkung" aus, obwohl die Rueckmeldung korrekt kam.
        const tst = document.getElementById('rezToast');
        if (tst) { tst.textContent = ''; tst.classList.remove('on'); }
        // ⚠ Leere Eingabefelder fuellen: ein "Add"-Knopf ohne Eingabe tut
        // richtigerweise nichts. Ein echter Nutzer haette vorher getippt -
        // die Pruefung muss dieselbe Ausgangslage herstellen, sonst meldet
        // sie korrektes Verhalten als toten Button.
        document.querySelectorAll('#rezPageArea input[type=text], #rezPageArea input[type=search]').forEach(el => {
          if (!el.value) { el.value = 'probe'; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await new Promise(r => setTimeout(r, 120));
        const liste = frisch();
        const b = liste.find(el => {
          const oc = el.getAttribute('onclick') || '';
          // Ein DEAKTIVIERTER Knopf tut richtigerweise nichts - ihn als tot
          // zu melden waere ein Scheinfehler ("Add ingredients" bei leerem
          // Wochenplan ist absichtlich aus).
          if (el.disabled || el.getAttribute('disabled') !== null) return false;
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
  await p.evaluate(() => { window.rezClearFilters(); if (window.rezInspoClear) window.rezInspoClear(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.rezShowPage('overview'));
  await p.waitForTimeout(300);
  await p.click('.dw-click:has-text("Add New Meal")');
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
  const nachSpeichern = await p.locator('#pgRecipes .rez-card').count();
  if (nachSpeichern !== 4) fail('C', `Nach dem Speichern stehen ${nachSpeichern} statt 4 Karten im Raster`);
  if (await p.locator('#rfTitle').count()) fail('C', 'Das Formular bleibt nach dem Speichern offen');

  // Suche / Zeitfilter / Tag / Favoriten
  await p.fill('#rezSearchInp', 'zzzz'); await p.waitForTimeout(300);
  if (await p.locator('#pgRecipes .rez-card').count() !== 0) fail('C', 'Die Suche filtert nicht');
  await p.fill('#rezSearchInp', 'alpha'); await p.waitForTimeout(300);
  if (await p.locator('#pgRecipes .rez-card').count() !== 1) fail('C', 'Die Suche findet den erwarteten Treffer nicht');
  await p.fill('#rezSearchInp', ''); await p.waitForTimeout(300);
  await p.selectOption('#pgRecipes .rez-sel', '15'); await p.waitForTimeout(300);
  const kurz = await p.locator('#pgRecipes .rez-card').count();
  if (kurz !== 2) fail('C', `Zeitfilter "<= 15 min" zeigt ${kurz} statt 2 Karten`);
  await p.selectOption('#pgRecipes .rez-sel', '0'); await p.waitForTimeout(300);
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
  await p.click('#pgRecipes .rez-toolbar .btn:has-text("Favourites")'); await p.waitForTimeout(300);
  const favN = await p.locator('#pgRecipes .rez-card').count();
  if (favN !== 1) fail('C', `Der Favoriten-Filter zeigt ${favN} statt 1 Karte`);
  await p.click('#pgRecipes .rez-toolbar .btn:has-text("Favourites")'); await p.waitForTimeout(300);
  const tagChips = await p.locator('#pgRecipes .tag-chip').count();
  if (tagChips < 2) fail('C', 'Es werden keine Tag-Chips gerendert');
  await p.locator('#pgRecipes .tag-chip').nth(1).click(); await p.waitForTimeout(300);
  if (await p.locator('#pgRecipes .rez-card').count() === 4) fail('C', 'Ein Tag-Chip filtert nicht');
  await p.locator('#pgRecipes .tag-chip').first().click(); await p.waitForTimeout(300);

  // Favoriten-Stern auf der Karte
  const vorFav = await p.locator('#pgRecipes .rez-card-star.on').count();
  await p.locator('#pgRecipes .rez-card-star').first().click(); await p.waitForTimeout(700);
  if (await p.locator('#pgRecipes .rez-card-star.on').count() === vorFav) fail('C', 'Der Stern auf der Karte schaltet den Favoriten nicht um');

  // Detail -> Bearbeiten -> speichern
  await p.locator('#pgRecipes .rez-card').first().click(); await p.waitForTimeout(800);
  if (!(await p.locator('.rd-title').count())) fail('C', 'Das Detailfenster oeffnet sich nicht');
  await p.click('.rd-menu-btn'); await p.waitForTimeout(300);
  await p.click('.rd-menu-item:has-text("Edit recipe")'); await p.waitForTimeout(700);
  if (!(await p.locator('#rfTitle').count())) fail('C', '"Edit recipe" oeffnet das Formular nicht');
  await p.fill('#rfTitle', 'Renamed Dish');
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  await p.click('.modal button:has-text("Save changes")'); await p.waitForTimeout(1200);
  if (!(await p.locator('#pgRecipes .rez-card-title:has-text("Renamed Dish")').count()))
    fail('C', 'Eine Umbenennung landet nicht im Raster');

  // Papierkorb + Wiederherstellen
  await p.locator('#pgRecipes .rez-card-title:has-text("Renamed Dish")').click(); await p.waitForTimeout(800);
  await p.click('.rd-menu-btn'); await p.waitForTimeout(300);
  await p.click('.rd-menu-item.danger'); await p.waitForTimeout(400);
  await p.click('.modal button.btn-danger'); await p.waitForTimeout(1000);
  if (await p.locator('#pgRecipes .rez-card-title:has-text("Renamed Dish")').count())
    fail('C', 'Ein geloeschtes Rezept steht weiter im Raster');
  await p.evaluate(() => window.rezOpenSettings()); await p.waitForTimeout(500);
  if (!(await p.locator('.trash-row').count())) fail('C', 'Der Papierkorb bleibt nach dem Loeschen leer');
  await p.click('.trash-row button:has-text("Restore")'); await p.waitForTimeout(1000);
  await p.evaluate(() => window.rezCloseModal());
  await p.evaluate(() => window.rezShowPage('recipes')); await p.waitForTimeout(500);
  if (!(await p.locator('#pgRecipes .rez-card-title:has-text("Renamed Dish")').count()))
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

  // ── H) Der Caption-Parser, beide Wege ────────────────────────────────
  // ⚠ Diese Stufe existiert wegen eines Regressionstests: die Zutaten-
  // Erkennung wurde absichtlich kaputt gemacht und der Waechter meldete
  // trotzdem "ok". Grund: die Test-Caption in Stufe F hat Ueberschriften
  // ("Zutaten:"), und dieser Weg kommt ohne die Mengen-Erkennung aus. Der
  // zweite Weg - Caption OHNE Ueberschriften, Zutaten nur an der Mengen-
  // angabe erkennbar - war komplett ungeprueft. Beide Wege gehoeren hierher.
  const parserFaelle = await p.evaluate(async () => {
    const I = await import('./js/rezept/import.js');
    const out = [];
    const pruef = (name, ist, soll) => out.push({ name, ist, soll, ok: JSON.stringify(ist) === JSON.stringify(soll) });

    // Weg 1: mit Ueberschriften
    const a = I.parseCaption([
      '🍜 Ramen in 35 Minuten 🔥', 'Zutaten:', '- 2 Portionen Nudeln', '- 1 l Brühe',
      'Zubereitung:', '1. Brühe erhitzen.', '2. Nudeln kochen.',
      '#ramen #reels', 'https://www.instagram.com/reel/AbC123XyZ/'].join('\n'));
    pruef('mit Ueberschrift: Zutaten', a.ingredients.length, 2);
    pruef('mit Ueberschrift: Schritte', a.steps.length, 2);
    pruef('mit Ueberschrift: Dauer', a.min, 35);
    pruef('mit Ueberschrift: Titel ohne Emoji', a.title, 'Ramen in 35 Minuten');
    pruef('mit Ueberschrift: Reichweiten-Tag gefiltert', a.tags, ['Ramen']);
    pruef('mit Ueberschrift: Instagram erkannt', a.link && a.link.platform, 'instagram');

    // Weg 2: OHNE Ueberschriften - Zutaten nur an der Mengenangabe erkennbar
    const b = I.parseCaption([
      'Crispy Chicken Bowl ready in 25 mins',
      '400g chicken thighs', '2 tbsp soy sauce', '1 cup jasmine rice', '2 cloves garlic',
      '1. Marinate the chicken.', '2. Sear on high heat.', '#mealprep #fyp'].join('\n'));
    pruef('ohne Ueberschrift: Zutaten an der Menge erkannt', b.ingredients.length, 4);
    pruef('ohne Ueberschrift: Schritte', b.steps.length, 2);
    pruef('ohne Ueberschrift: Dauer', b.min, 25);
    pruef('ohne Ueberschrift: Tags', b.tags, ['Mealprep']);

    // Dauer-Schreibweisen
    [['1h30', 90], ['2 Std 30 Minuten', 150], ['ca. 20 Min', 20], ['90 mins', 90],
     ['1 hour', 60], ['13 min', 15], ['ohne Angabe', null]].forEach(([t, soll]) =>
      pruef('Dauer ' + JSON.stringify(t), I.parseDuration(t), soll));

    // Andere Plattformen
    pruef('TikTok erkannt', (I.detectLink('https://www.tiktok.com/@chef/video/7211122334455') || {}).platform, 'tiktok');
    pruef('YouTube erkannt', (I.detectLink('https://youtu.be/dQw4w9WgXcQ') || {}).platform, 'youtube');

    // Nichts erfinden: ohne Angabe bleibt die Dauer leer
    pruef('keine erfundene Dauer', I.parseCaption('One pan salmon').min, null);

    // Randfaelle duerfen nicht werfen
    [null, undefined, '', '   ', '#nur #hashtags', '😀😀😀'].forEach(x => {
      try { pruef('Randfall ' + JSON.stringify(x), typeof I.parseCaption(x).title, 'string'); }
      catch (e) { out.push({ name: 'Randfall ' + JSON.stringify(x), ist: 'Absturz: ' + e.message, soll: 'kein Absturz', ok: false }); }
    });
    return out;
  });
  parserFaelle.filter(f => !f.ok).forEach(f =>
    fail('H', `Parser "${f.name}": ${JSON.stringify(f.ist)} statt ${JSON.stringify(f.soll)}`));

  // ── F) Die vier neuen Kategorien inhaltlich ──────────────────────────
  // Stufe B sieht nur, DASS ein Button etwas tut. Hier wird geprueft, ob er
  // das RICHTIGE tut - inklusive des Wegs "Reel einfuegen -> Rezept".
  const CAPTION = [
    '🍝 Pasta al Limone in 20 Minuten',
    'Das cremigste Rezept überhaupt!',
    '',
    'Zutaten:',
    '- 200 g Spaghetti',
    '- 1 Bio-Zitrone',
    '- 100 ml Sahne',
    '',
    'Zubereitung:',
    '1. Nudeln al dente kochen.',
    '2. Sahne mit Zitrone erhitzen.',
    '3. Alles vermengen.',
    '',
    '#pasta #zitrone #reels',
    'https://www.instagram.com/reel/CxYz123AbC/',
  ].join('\n');

  // F1: Idee anlegen, Link muss erkannt und der Titel gefuellt werden
  await p.evaluate(() => { if (window.rezInspoClear) window.rezInspoClear(); window.rezShowPage('inspo'); });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.rezOpenInspoForm(null));
  await p.waitForTimeout(400);
  await p.fill('#ifPaste', CAPTION);
  await p.waitForTimeout(400);
  const erkannt = await p.evaluate(() => ({
    titel: (document.getElementById('ifTitle') || {}).value || '',
    hinweis: (document.querySelector('.insp-detect') || {}).textContent || '',
    url: (document.getElementById('ifUrl') || {}).value || '',
    tags: (document.getElementById('ifTags') || {}).value || '',
  }));
  if (!/Instagram/.test(erkannt.hinweis)) fail('F', 'Der Instagram-Link wird beim Einfuegen nicht erkannt');
  if (!/Pasta al Limone/.test(erkannt.titel)) fail('F', `Titel wird nicht aus der Caption uebernommen (war "${erkannt.titel}")`);
  // ⚠ Nicht nur im Modell, sondern SICHTBAR im Feld: erst standen Link und
  // Tags still im Entwurf, waehrend der Nutzer leere Felder sah.
  if (!/instagram\.com/.test(erkannt.url)) fail('F', `Der erkannte Link steht nicht im Link-Feld (war "${erkannt.url}")`);
  if (!/Pasta/.test(erkannt.tags)) fail('F', `Die erkannten Tags stehen nicht im Tag-Feld (war "${erkannt.tags}")`);
  await p.click('.modal button:has-text("Add idea")');
  await p.waitForTimeout(900);
  const inspoN = await p.locator('#pgInspo .rez-card').count();
  if (inspoN !== 1) fail('F', `Nach dem Anlegen stehen ${inspoN} statt 1 Idee im Raster`);

  // F2: "Convert to recipe" - der Kern des Reel-Imports
  await p.click('#pgInspo .rez-card');
  await p.waitForTimeout(700);
  if (!(await p.locator('.insp-frame iframe').count()))
    fail('F', 'Das Reel wird im Detailfenster nicht eingebettet');
  await p.click('.modal button:has-text("Convert to recipe")');
  await p.waitForTimeout(900);
  const entwurf = await p.evaluate(() => ({
    titel: (document.getElementById('rfTitle') || {}).value || '',
    zutaten: [...document.querySelectorAll('#rfIng .m-inp')].map(i => i.value).filter(Boolean),
    schritte: (document.querySelector('#rfBlocks textarea') || {}).value || '',
    dauer: (document.querySelector('.rf-row select') || {}).value || '',
  }));
  if (!/Pasta al Limone/.test(entwurf.titel)) fail('F', `Convert: Titel nicht uebernommen ("${entwurf.titel}")`);
  if (entwurf.zutaten.length !== 3) fail('F', `Convert: ${entwurf.zutaten.length} statt 3 Zutaten erkannt`);
  if (!/1\. Nudeln/.test(entwurf.schritte)) fail('F', 'Convert: Zubereitungsschritte nicht uebernommen');
  if (entwurf.dauer !== '20') fail('F', `Convert: Dauer ${entwurf.dauer} statt 20 aus der Caption`);
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  // Ohne Bild verweigert das Formular - genau richtig, hier nur bestaetigen.
  await p.click('.modal button:has-text("Add recipe")');
  await p.waitForTimeout(500);
  if (!(await p.locator('#rfErr').isVisible().catch(() => false)))
    fail('F', 'Ein Rezept ohne Titelbild wird kommentarlos angenommen');
  const fc2 = p.waitForEvent('filechooser', { timeout: 8000 });
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 0));
  await p.click('.rf-drop');
  await fc2.then(c => c.setFiles(foto)).catch(() => fail('F', 'Datei-Dialog im Convert-Formular oeffnet nicht'));
  await p.waitForFunction(() => !!document.querySelector('.rf-drop img'), { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  await p.click('.modal button:has-text("Add recipe")');
  await p.waitForTimeout(1200);
  const mitQuelle = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const r = S.state.index.recipes.find(x => /Pasta al Limone/.test(x.title));
    if (!r) return null;
    const d = await S.getFull(r.id);
    return d ? { id: r.id, source: d.source || '', zutaten: (d.ingredients || []).length } : null;
  });
  if (!mitQuelle) fail('F', 'Das umgewandelte Rezept wurde nicht gespeichert');
  else {
    if (!/instagram\.com/.test(mitQuelle.source)) fail('F', 'Die Herkunft (Reel-Link) fehlt am Rezept');
    if (mitQuelle.zutaten !== 3) fail('F', `Gespeichertes Rezept hat ${mitQuelle.zutaten} statt 3 Zutaten`);
  }

  // F3: Wochenplan + Einkaufsliste
  await p.evaluate(() => window.rezShowPage('week'));
  await p.waitForTimeout(400);
  const tage = await p.locator('.week-day').count();
  if (tage !== 7) fail('F', `Der Wochenplan zeigt ${tage} statt 7 Tage`);
  await p.locator('.week-add').first().click();
  await p.waitForTimeout(500);
  await p.locator('.pick-row').first().click();
  await p.waitForTimeout(900);
  if (!(await p.locator('.week-item').count())) fail('F', 'Ein zugewiesenes Rezept erscheint nicht im Wochenplan');
  const wocheVor = await p.locator('.week-range').textContent();
  await p.click('.rez-toolbar .btn:has-text("Next")');
  await p.waitForTimeout(400);
  if ((await p.locator('.week-range').textContent()) === wocheVor) fail('F', '"Next" wechselt die Woche nicht');
  await p.click('.rez-toolbar .btn:has-text("This week")');
  await p.waitForTimeout(400);
  await p.click('.rez-toolbar .btn:has-text("Add ingredients")');
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.rezShowPage('shopping'));
  await p.waitForTimeout(500);
  const eink = await p.locator('.shop-row').count();
  if (!eink) fail('F', 'Die Zutaten des Wochenplans landen nicht auf der Einkaufsliste');
  // Doppelt uebernehmen darf die Liste nicht verdoppeln
  await p.click('.shop-tools .btn:has-text("From this week")');
  await p.waitForTimeout(1200);
  const eink2 = await p.locator('.shop-row').count();
  if (eink2 !== eink) fail('F', `Zweimal uebernehmen verdoppelt die Liste (${eink} -> ${eink2})`);
  await p.locator('.shop-row input[type=checkbox]').first().click();
  await p.waitForTimeout(700);
  if (!(await p.locator('.shop-row.done').count())) fail('F', 'Ein Eintrag laesst sich nicht abhaken');

  // F4: Overview - Zufallsgenerator, heute kochen, als gekocht markieren
  await p.evaluate(() => window.rezShowPage('overview'));
  await p.waitForTimeout(500);
  await p.click('.dw button:has-text("Surprise me")');
  await p.waitForTimeout(600);
  if (!(await p.locator('.dw .today-nm').count())) fail('F', '"Surprise me" liefert keinen Vorschlag');
  await p.click('.dw button:has-text("Cook this today")');
  await p.waitForTimeout(900);
  const heuteGesetzt = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    return !!S.todaysMeal();
  });
  if (!heuteGesetzt) fail('F', '"Cook this today" setzt Today\'s Meal nicht');
  await p.click('.dw button:has-text("Mark as cooked")');
  await p.waitForTimeout(900);
  await p.evaluate(() => window.rezShowPage('cooked'));
  await p.waitForTimeout(500);
  if (!(await p.locator('.cook-row').count())) fail('F', 'Ein als gekocht markiertes Gericht fehlt im Verlauf');
  await p.locator('.cook-star').nth(3).click();
  await p.waitForTimeout(700);
  if (!(await p.locator('.cook-star.on').count())) fail('F', 'Die Bewertung im Verlauf laesst sich nicht setzen');

  // ── I) Einkaufsliste: Abteilungen, Vorschlaege, Mengen, Bearbeiten ──
  await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    // Sauberer Ausgangszustand - Stufe F hat die Liste schon gefuellt.
    for (const it of S.shoppingItems()) await S.removeShopping(it.id);
  });
  await p.evaluate(() => window.rezShowPage('shopping'));
  await p.waitForTimeout(500);
  for (const t of ['Milch', '500 g Mehl', 'Brötchen', '2 Zwiebeln', 'Klopapier', 'Schraubenzieher']) {
    await p.fill('#shopNew', t);
    await p.evaluate(() => window.rezShopAdd());
    await p.waitForTimeout(350);
  }
  // ⚠ Stufe B hat beim Durchklicken auch die Sortierung umgestellt. Ohne
  // Zuruecksetzen prueft die naechste Zeile eine Liste OHNE Abteilungen und
  // meldet einen Fehler, den es nicht gibt.
  const sortBtn = p.locator('.shop-tools .btn:has-text("Sorted by")');
  if ((await sortBtn.count()) && !/aisle/i.test(await sortBtn.first().textContent())) {
    await sortBtn.first().click();
    await p.waitForTimeout(400);
  }
  const abteilungen = await p.evaluate(() =>
    [...document.querySelectorAll('.shop-cat-nm')].map(e => e.textContent.trim()));
  ['Dairy & Eggs', 'Pantry', 'Bakery', 'Fruit & Veg', 'Household', 'Other'].forEach(a => {
    if (!abteilungen.includes(a)) fail('I', `Abteilung "${a}" fehlt in der Einkaufsliste (da: ${abteilungen.join(', ')})`);
  });
  // Menge muss vom Namen getrennt angezeigt werden
  const mengen = await p.evaluate(() => [...document.querySelectorAll('.shop-qty')].map(e => e.textContent.trim()));
  if (!mengen.includes('500 g')) fail('I', `Die Menge "500 g" wird nicht getrennt angezeigt (da: ${mengen.join(', ')})`);
  // Vorschlaege beim Tippen
  await p.fill('#shopNew', 'zwie');
  await p.evaluate(() => window.rezShopSuggest('zwie'));
  await p.waitForTimeout(350);
  const vorschlaege = await p.evaluate(() =>
    [...document.querySelectorAll('.shop-sugg-row .shop-sugg-nm')].map(e => e.textContent.trim()));
  if (!vorschlaege.length) fail('I', 'Beim Tippen erscheinen keine Vorschlaege');
  else if (!vorschlaege.some(v => /onion/i.test(v))) fail('I', `Deutsche Eingabe "zwie" schlaegt nichts Passendes vor (da: ${vorschlaege.join(', ')})`);
  // Vorschlag uebernehmen
  await p.evaluate(() => window.rezShopPick(0));
  await p.waitForTimeout(600);
  if ((await p.inputValue('#shopNew')) !== '') fail('I', 'Nach dem Uebernehmen bleibt der Text im Eingabefeld stehen');
  // Abhaken, Fortschritt, alles abhaken
  await p.locator('.shop-row input[type=checkbox]').first().click();
  await p.waitForTimeout(600);
  if (!(await p.locator('.shop-row.done').count())) fail('I', 'Ein Eintrag laesst sich nicht abhaken');
  const breite = await p.evaluate(() => (document.querySelector('.shop-bar-fill') || {}).style?.width || '');
  if (!breite || breite === '0%') fail('I', 'Der Fortschrittsbalken bewegt sich nicht');
  await p.click('.shop-tools .btn:has-text("Check all")');
  await p.waitForTimeout(700);
  const offenDanach = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    return S.shoppingItems().filter(i => !i.done).length;
  });
  if (offenDanach !== 0) fail('I', `"Check all" laesst ${offenDanach} Eintraege offen`);
  // Sortierung umschalten
  await p.click('.shop-tools .btn:has-text("Sorted by")');
  await p.waitForTimeout(400);
  if (await p.locator('.shop-cat-hd').count()) fail('I', 'Nach dem Umschalten auf "newest" wird weiter nach Abteilung gruppiert');
  await p.click('.shop-tools .btn:has-text("Sorted by")');
  await p.waitForTimeout(400);
  // Eintrag bearbeiten: Abteilung korrigierbar
  await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const it = S.shoppingItems().find(i => /Schraubenzieher/.test(i.text));
    if (it) window.rezShopEdit(it.id);
  });
  await p.waitForTimeout(500);
  if (!(await p.locator('.cat-opt').count())) fail('I', 'Im Bearbeiten-Fenster fehlt die Abteilungs-Auswahl');
  await p.click('.cat-opt:has-text("Household")');
  await p.click('.modal button:has-text("Save")');
  await p.waitForTimeout(700);
  const korrigiert = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const it = S.shoppingItems().find(i => /Schraubenzieher/.test(i.text));
    return it ? it.cat : null;
  });
  if (korrigiert !== 'household') fail('I', `Eine von Hand gesetzte Abteilung haelt nicht (war "${korrigiert}")`);

  // ── G) Merge-Regeln: der Fall, der auf zwei Geraeten Daten kostet ────
  // Rein rechnerisch im Seitenkontext - kein zweites Geraet noetig, aber
  // genau die Situation, die im FX Analyst Pro zweimal Notizen gekostet hat.
  const merge = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const A = S.normalizeIndex({
      recipes: [{ id: 'r1', title: 'A', up: '2026-01-02' }],
      inspo: [{ id: 'i1', title: 'IA', up: '2026-01-02' }],
      plan: { '2026-01-05': { ids: ['r1'], up: '2026-01-02' } },
      shopping: { items: [{ id: 's1', text: 'Milk', done: false, up: '2026-01-02' }] },
      cooked: [{ id: 'c1', recipeId: 'r1', date: '2026-01-02', up: '2026-01-02' }],
    });
    const B = S.normalizeIndex({
      recipes: [{ id: 'r2', title: 'B', up: '2026-01-03' }],
      inspo: [{ id: 'i2', title: 'IB', up: '2026-01-03' }],
      plan: { '2026-01-06': { ids: ['r2'], up: '2026-01-03' } },
      shopping: { items: [{ id: 's2', text: 'Bread', done: false, up: '2026-01-03' }] },
      cooked: [{ id: 'c2', recipeId: 'r2', date: '2026-01-03', up: '2026-01-03' }],
    });
    const m = S.mergeIndex(A, B);
    // Grabstein: auf Geraet B geloescht, auf A noch vorhanden
    const C = S.normalizeIndex({ recipes: [{ id: 'r1', title: 'A', up: '2026-01-02' }], trash: [] });
    const D = S.normalizeIndex({ recipes: [], trash: [{ id: 'r1', delAt: '2026-01-04', kind: 'recipe' }] });
    const m2 = S.mergeIndex(C, D);
    // Wiederhergestellt: nach dem Loeschen erneut bearbeitet
    const E = S.normalizeIndex({ recipes: [{ id: 'r1', title: 'A', up: '2026-01-09' }], trash: [] });
    const m3 = S.mergeIndex(D, E);
    return {
      rezepte: m.recipes.length, ideen: m.inspo.length,
      tage: Object.keys(m.plan).length, eink: m.shopping.items.length, verlauf: m.cooked.length,
      grabstein: m2.recipes.length, wiederher: m3.recipes.length,
    };
  });
  const soll = { rezepte: 2, ideen: 2, tage: 2, eink: 2, verlauf: 2, grabstein: 0, wiederher: 1 };
  Object.entries(soll).forEach(([k, v]) => {
    if (merge[k] !== v) fail('G', `Merge "${k}": ${merge[k]} statt ${v} - zwei Geraete wuerden sich gegenseitig Daten loeschen`);
  });

  // ── J) Bewegung und Typografie ───────────────────────────────────────
  // Animationen duerfen die Bedienung NIE blockieren. Der teuerste Fehler
  // dieser Art: ein Fenster mit Abgangs-Animation, dessen DOM haengen
  // bleibt - dann nimmt eine unsichtbare Flaeche weiter Klicks entgegen.
  await p.evaluate(() => window.rezShowPage('recipes'));
  await p.waitForTimeout(400);

  // J1: Staffelung gesetzt UND gedeckelt
  const stag = await p.evaluate(() => {
    const g = document.querySelector('#pgRecipes .rez-grid.stagger');
    if (!g) return null;
    return [...g.children].map(c => +(c.style.getPropertyValue('--i') || -1));
  });
  if (!stag) fail('J', 'Das Rezept-Raster traegt keine .stagger-Klasse - die Karten kommen ohne Staffelung');
  else {
    if (stag.some(v => v < 0)) fail('J', 'Nicht jede Karte bekommt einen --i-Wert (renderStagger vergessen?)');
    if (stag.some(v => v > 14)) fail('J', `Die Staffelung ist nicht gedeckelt (hoechster Wert ${Math.max(...stag)}) - die letzte Karte erschiene erst nach einer Sekunde`);
  }
  // J2: Bilder werden sichtbar geschaltet (im CSS stehen sie auf opacity:0)
  const bilder = await p.evaluate(() => {
    const im = [...document.querySelectorAll('#pgRecipes img.rez-card-img')];
    return { n: im.length, rdy: im.filter(i => i.classList.contains('rdy')).length,
      sichtbar: im.filter(i => +getComputedStyle(i).opacity > 0.9).length };
  });
  if (bilder.n && bilder.sichtbar !== bilder.n)
    fail('J', `${bilder.n - bilder.sichtbar} von ${bilder.n} Kartenbildern bleiben unsichtbar - fadeInImages() vergessen (CSS setzt opacity:0)`);

  // J3: Die Auswahl-Markierung wandert wirklich
  const indA = await p.evaluate(() => (document.getElementById('rezNavInd') || {}).style?.getPropertyValue('--y'));
  await p.evaluate(() => window.rezShowPage('cooked'));
  await p.waitForTimeout(500);
  const indB = await p.evaluate(() => {
    const el = document.getElementById('rezNavInd');
    return el ? { y: el.style.getPropertyValue('--y'), h: el.style.getPropertyValue('--h'), on: el.classList.contains('on') } : null;
  });
  if (!indB) fail('J', 'Die gleitende Auswahl-Markierung (#rezNavInd) fehlt');
  else {
    if (!indB.on) fail('J', 'Die Auswahl-Markierung ist nicht sichtbar');
    if (indB.y === indA) fail('J', 'Die Auswahl-Markierung bewegt sich beim Seitenwechsel nicht');
    if (!indB.h || indB.h === '0px') fail('J', 'Die Auswahl-Markierung hat keine Hoehe');
  }

  // J4: Fenster gehen trotz Abgangs-Animation WIRKLICH zu
  await p.evaluate(() => window.rezShowPage('recipes'));
  await p.waitForTimeout(300);
  await p.evaluate(() => window.rezOpenForm(null));
  await p.waitForTimeout(400);
  await p.evaluate(() => window.rezCloseModal());
  // Direkt nach dem Schliessen darf nichts mehr Eingaben annehmen
  const sofort = await p.evaluate(() => ({
    zeigt: !!document.querySelector('#rezModals .ov'),
    klickbar: getComputedStyle(document.querySelector('#rezModals .ov') || document.body).pointerEvents,
  }));
  if (sofort.zeigt && sofort.klickbar !== 'none')
    fail('J', 'Ein schliessendes Fenster nimmt waehrend der Abgangs-Animation weiter Klicks an');
  await p.waitForTimeout(400);
  const spaeter = await p.evaluate(() => document.getElementById('rezModals').innerHTML.length);
  if (spaeter !== 0) fail('J', 'Nach der Abgangs-Animation bleibt das Fenster im DOM haengen');

  // J5: Der Schalter in den Einstellungen greift wirklich
  await p.evaluate(() => window.rezToggleAnim());
  await p.waitForTimeout(600);
  const aus = await p.evaluate(() => ({
    klasse: document.body.classList.contains('no-anim'),
    dauer: getComputedStyle(document.querySelector('.modal') || document.body).animationDuration,
  }));
  if (!aus.klasse) fail('J', 'Der Animations-Schalter setzt body.no-anim nicht');
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(120);
  if (await p.evaluate(() => document.getElementById('rezModals').innerHTML.length))
    fail('J', 'Mit abgeschalteten Animationen muss ein Fenster SOFORT verschwinden, nicht nach 140 ms');
  await p.evaluate(() => window.rezToggleAnim());
  await p.waitForTimeout(500);
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(300);

  // J6: Typografie-Tokens vollstaendig - je Theme, nicht nur im Standard
  const typo = await p.evaluate(async () => {
    const ids = Array.from(document.styleSheets)
      .flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } })
      .map(r => (r.selectorText || '').match(/^:root\[data-rez-theme="(\w+)"\]$/))
      .filter(Boolean).map(m => m[1]);
    const out = [];
    const vorher = document.documentElement.getAttribute('data-rez-theme');
    for (const id of ids) {
      document.documentElement.setAttribute('data-rez-theme', id);
      const cs = getComputedStyle(document.documentElement);
      const w = k => cs.getPropertyValue(k).trim();
      out.push({ id, title: w('--ff-title'), text: w('--ff-text'), ls: w('--ls-title'),
        lh: w('--lh-base'), hero: w('--fs-hero'), tf: w('--t-fast'), eo: w('--e-out') });
    }
    document.documentElement.setAttribute('data-rez-theme', vorher);
    return out;
  });
  typo.forEach(t => {
    ['title', 'text', 'ls', 'lh', 'hero', 'tf', 'eo'].forEach(k => {
      if (!t[k]) fail('J', `Theme "${t.id}": Typo-/Bewegungs-Token "${k}" ist leer`);
    });
    // ⚠ Ohne ui-*-Familie faellt das Geraet auf eine Ersatzschrift zurueck -
    // genau der Unterschied zwischen SF Pro und "irgendeine Grotesk".
    if (!/ui-(sans-serif|serif|rounded)|Helvetica Neue/.test(t.title))
      fail('J', `Theme "${t.id}": --ff-title nennt keine System-Schriftfamilie (${t.title.slice(0, 60)})`);
    // Keine Web-Fonts nachladen - die App muss offline laufen.
    if (/url\(|@import/.test(t.title + t.text))
      fail('J', `Theme "${t.id}": laedt eine Schrift nach - die App muss offline laufen`);
  });
  if (/@import|fonts\.googleapis|fonts\.gstatic/.test(fs.readFileSync('rezept.html', 'utf8')))
    fail('J', 'rezept.html laedt eine Web-Schrift nach - die App muss offline laufen (siehe docs/rezept.md)');

  // J7: Mit "reduce motion" darf nichts haengen bleiben
  const p3 = await ctx.newPage();
  await p3.emulateMedia({ reducedMotion: 'reduce' });
  await p3.goto(URL, { waitUntil: 'load' });
  await p3.waitForTimeout(1200);
  await p3.evaluate(() => window.rezOpenForm(null));
  await p3.waitForTimeout(300);
  if (!(await p3.locator('#rfTitle').count())) fail('J', 'Mit reduzierter Bewegung oeffnet sich das Formular nicht');
  await p3.evaluate(() => window.rezCloseModal());
  await p3.waitForTimeout(200);
  if (await p3.evaluate(() => document.getElementById('rezModals').innerHTML.length))
    fail('J', 'Mit reduzierter Bewegung bleibt das Fenster im DOM haengen');
  await p3.close();

  // ── K) Kochmodus, Timer, Portionen, Notizen, Suche, Vorschlag ────────
  // K1: Mengen-Rechnung und Timer-Erkennung rein rechnerisch
  const rechen = await p.evaluate(async () => {
    const C = await import('./js/rezept/cook.js');
    const out = [];
    const t = (n, ist, soll) => out.push({ n, ist, soll, ok: JSON.stringify(ist) === JSON.stringify(soll) });
    t('200 g verdoppeln', C.scaleIngredient('200 g Spaghetti', 2), '400 g Spaghetti');
    t('ohne Zahl bleibt gleich', C.scaleIngredient('Salz & Pfeffer', 2), 'Salz & Pfeffer');
    t('halbieren wird Bruch', C.scaleIngredient('1 EL Öl', 0.5), '½ EL Öl');
    t('Komma-Menge', C.scaleIngredient('1,5 kg Braten', 2), '3 kg Braten');
    t('Bruch verdoppeln', C.scaleIngredient('½ TL Salz', 2), '1 TL Salz');
    t('zwei Timer im Schritt', C.findTimers('5 Minuten anbraten, dann 20 Minuten schmoren').map(x => x.sek), [300, 1200]);
    t('Spanne nimmt Obergrenze', C.findTimers('15-20 Minuten backen').map(x => x.sek), [1200]);
    t('Stunde', C.findTimers('1 Stunde ruhen lassen').map(x => x.sek), [3600]);
    t('keine Zeit im Text', C.findTimers('Alles vermengen').length, 0);
    t('Temperatur ist keine Zeit', C.findTimers('bei 200 Grad backen').length, 0);
    t('Uhr mit Stunden', C.fmtClock(3661), '1:01:01');
    t('Uhr ohne Stunden', C.fmtClock(90), '01:30');
    return out;
  });
  rechen.filter(r => !r.ok).forEach(r =>
    fail('K', `${r.n}: ${JSON.stringify(r.ist)} statt ${JSON.stringify(r.soll)}`));

  // K2: Kochmodus oeffnet, zeigt Schritte, rechnet Portionen um
  await p.evaluate(() => { window.rezClearFilters(); window.rezShowPage('recipes'); });
  await p.waitForTimeout(400);
  const ersteRez = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const r = S.state.index.recipes[0];
    if (!r) return null;
    const d = await S.getFull(r.id);
    if (d) { d.servings = 2; d.ingredients = ['200 g Spaghetti', 'Salz & Pfeffer']; d.blocks = [{ t: 'text', v: '1. Nudeln 10 Minuten kochen.\n2. Servieren.' }]; await S.saveRecipe(d); }
    return r.id;
  });
  if (!ersteRez) fail('K', 'Kein Rezept fuer den Kochmodus vorhanden');
  else {
    await p.evaluate(id => window.rezCook(id), ersteRez);
    await p.waitForTimeout(700);
    if (!(await p.evaluate(() => document.body.classList.contains('cooking'))))
      fail('K', 'Der Kochmodus oeffnet sich nicht');
    const schritt1 = await p.evaluate(() => (document.querySelector('.ck-step') || {}).textContent || '');
    if (!/Nudeln/.test(schritt1)) fail('K', `Der erste Schritt fehlt im Kochmodus ("${schritt1.slice(0, 40)}")`);
    // Schritte werden einzeln gezeigt, nicht als Block
    if (/Servieren/.test(schritt1)) fail('K', 'Die Zubereitung wird nicht in einzelne Schritte zerlegt');
    // Ein Timer aus dem Schritt muss angeboten werden
    if (!(await p.locator('.ck-timers .btn').count())) fail('K', 'Aus "10 Minuten" entsteht kein Timer-Knopf');
    // Portionen verdoppeln muss die Menge verdoppeln
    const vorher = await p.evaluate(() => (document.querySelector('.ck-ing span') || {}).textContent || '');
    await p.click('.ck-serv .ck-sv:last-child');
    await p.waitForTimeout(350);
    const nachher = await p.evaluate(() => (document.querySelector('.ck-ing span') || {}).textContent || '');
    if (vorher === nachher) fail('K', `Der Portionsregler aendert die Mengen nicht ("${vorher}")`);
    if (!/300 g/.test(nachher)) fail('K', `2 -> 3 Portionen ergibt "${nachher}" statt "300 g Spaghetti"`);
    // Nur die Mengen, nicht der Text ohne Zahl
    const zweite = await p.evaluate(() => [...document.querySelectorAll('.ck-ing span')].map(e => e.textContent)[1] || '');
    if (zweite !== 'Salz & Pfeffer') fail('K', `Eine Zutat ohne Menge wurde veraendert ("${zweite}")`);
    // Vor/Zurueck
    await p.click('.ck-nav .btn:has-text("Next")');
    await p.waitForTimeout(300);
    if (!/Servieren/.test(await p.evaluate(() => (document.querySelector('.ck-step') || {}).textContent || '')))
      fail('K', '"Next" blaettert nicht zum naechsten Schritt');
    // Timer starten und die Uhr pruefen
    await p.evaluate(() => window.rezStartTimer(90, 'test'));
    await p.waitForTimeout(600);
    const uhr = await p.evaluate(() => (document.querySelector('.tm-clock') || {}).textContent || '');
    if (!/^0?1:2\d|^0?1:3\d/.test(uhr)) fail('K', `Die Countdown-Uhr zeigt "${uhr}" statt einer Zeit um 01:30`);
    if (!(await p.locator('#rezTimers.on').count())) fail('K', 'Die Timer-Leiste erscheint nicht');
    await p.waitForTimeout(1400);
    const uhr2 = await p.evaluate(() => (document.querySelector('.tm-clock') || {}).textContent || '');
    if (uhr2 === uhr) fail('K', 'Die Uhr laeuft nicht herunter');
    // Pause haelt sie an
    await p.click('.tm-row .btn:has-text("Pause")');
    await p.waitForTimeout(1200);
    const uhr3 = await p.evaluate(() => (document.querySelector('.tm-clock') || {}).textContent || '');
    await p.waitForTimeout(1200);
    if ((await p.evaluate(() => (document.querySelector('.tm-clock') || {}).textContent || '')) !== uhr3)
      fail('K', 'Ein pausierter Timer laeuft weiter');
    // ⚠ Die Leiste darf die Schritt-Navigation nicht verdecken - beim ersten
    // Screenshot lag sie genau ueber "Back / Next".
    const ueberdeckt = await p.evaluate(() => {
      const nav = document.querySelector('.ck-nav'), tm = document.getElementById('rezTimers');
      if (!nav || !tm || !tm.classList.contains('on')) return false;
      const a = nav.getBoundingClientRect(), b = tm.getBoundingClientRect();
      return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
    });
    if (ueberdeckt) fail('K', 'Die Timer-Leiste verdeckt die Schritt-Navigation im Kochmodus');
    await p.evaluate(() => document.querySelectorAll('.tm-row .rf-x').forEach(b => b.click()));
    await p.waitForTimeout(400);
    if (await p.locator('#rezTimers.on').count()) fail('K', 'Ein gestoppter Timer verschwindet nicht');
    // ⚠ Der Kochmodus muss den Bildschirm-Wachhalter beim Verlassen wieder
    // freigeben - sonst bleibt das Geraet dauerhaft an.
    await p.evaluate(() => window.rezCookExit());
    await p.waitForTimeout(400);
    if (await p.evaluate(() => document.body.classList.contains('cooking')))
      fail('K', 'Der Kochmodus laesst sich nicht verlassen');
  }

  // K3: Portionen und Notizen im Detailfenster
  if (ersteRez) {
    await p.evaluate(id => window.rezOpenDetail(id), ersteRez);
    await p.waitForTimeout(800);
    const iv = await p.evaluate(() => (document.querySelector('#rdIng li') || {}).textContent || '');
    await p.click('.rd-serv .ck-sv:last-child');
    await p.waitForTimeout(350);
    const iv2 = await p.evaluate(() => (document.querySelector('#rdIng li') || {}).textContent || '');
    if (iv === iv2) fail('K', 'Der Portionsregler im Detailfenster wirkt nicht');
    await p.fill('#rdNotes', 'Beim naechsten Mal weniger Salz');
    await p.evaluate(id => window.rezSaveNotes(id), ersteRez);
    await p.waitForTimeout(900);
    const notiz = await p.evaluate(async (id) => {
      const S = await import('./js/rezept/store.js');
      const d = await S.getFull(id);
      return d ? (d.notes || '') : '';
    }, ersteRez);
    if (!/weniger Salz/.test(notiz)) fail('K', `Die Notiz wird nicht gespeichert (gelesen: "${notiz}")`);
    await p.evaluate(() => window.rezCloseModal());
    await p.waitForTimeout(400);
  }

  // K4: Globale Suche findet auch ueber Zutaten und Notizen
  await p.evaluate(() => window.rezFocusSearch());
  await p.waitForTimeout(500);
  await p.evaluate(() => window.rezSearchQuery('spaghetti'));
  await p.waitForTimeout(500);
  if (!(await p.locator('.gs-res .pick-row').count()))
    fail('K', 'Die globale Suche findet ein Rezept nicht ueber seine Zutat');
  await p.evaluate(() => window.rezSearchQuery('weniger salz'));
  await p.waitForTimeout(500);
  if (!(await p.locator('.gs-res .pick-row').count()))
    fail('K', 'Die globale Suche findet ein Rezept nicht ueber seine Notiz');
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(400);

  // K5: "Was kann ich kochen?" rechnet die Trefferquote
  await p.evaluate(() => window.rezOpenMatch());
  await p.waitForTimeout(1200);
  if (!(await p.locator('.mt-chips .tag-chip').count()))
    fail('K', '"Was kann ich kochen?" listet keine Zutaten auf');
  else {
    await p.locator('.mt-chips .tag-chip').first().click();
    await p.waitForTimeout(600);
    if (!(await p.locator('.mt-row').count()))
      fail('K', 'Nach dem Abhaken einer Zutat erscheint kein Rezept-Vorschlag');
    const quote = await p.evaluate(() => (document.querySelector('.mt-sub') || {}).textContent || '');
    if (!/%/.test(quote)) fail('K', `Der Vorschlag zeigt keine Trefferquote ("${quote}")`);
  }
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(400);

  // K6: Inspiration - Massenimport, Kuenstler-Erkennung, Filter
  await p.evaluate(() => { if (window.rezInspoClear) window.rezInspoClear(); window.rezShowPage('inspo'); });
  await p.waitForTimeout(400);
  const vorherIdeen = await p.locator('#pgInspo .rez-card').count();
  await p.evaluate(() => window.rezOpenBulk());
  await p.waitForTimeout(400);
  await p.fill('#bulkTxt', [
    'https://www.instagram.com/kochenmitchef/reel/AbCdEf123/',
    'https://www.tiktok.com/@pastaqueen/video/7211122334455',
    'https://youtu.be/dQw4w9WgXcQ',
    'kein link in dieser zeile',
  ].join('\n'));
  await p.click('.modal button:has-text("Add all")');
  await p.waitForTimeout(1500);
  const nachherIdeen = await p.locator('#pgInspo .rez-card').count();
  if (nachherIdeen !== vorherIdeen + 3)
    fail('K', `Massenimport legte ${nachherIdeen - vorherIdeen} statt 3 Ideen an (die vierte Zeile hat keinen Link)`);
  const kuenstler = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    return S.state.index.inspo.map(i => i.creator || '').filter(Boolean);
  });
  if (!kuenstler.includes('@kochenmitchef')) fail('K', `Der Instagram-Kuenstler wird nicht aus der Adresse gelesen (${kuenstler.join(', ')})`);
  if (!kuenstler.includes('@pastaqueen')) fail('K', 'Der TikTok-Kuenstler wird nicht aus der Adresse gelesen');
  if (!(await p.locator('#pgInspo .tag-chip').count()))
    fail('K', 'Es gibt keine Filterleiste fuer Kuenstler/Themen');
  else {
    const vorFilter = await p.locator('#pgInspo .rez-card').count();
    await p.evaluate(() => window.rezInspoCreator(0));
    await p.waitForTimeout(500);
    const nachFilter = await p.locator('#pgInspo .rez-card').count();
    if (nachFilter >= vorFilter) fail('K', `Der Kuenstler-Filter filtert nicht (${vorFilter} -> ${nachFilter})`);
    await p.evaluate(() => window.rezInspoClear());
    await p.waitForTimeout(400);
  }
  // Sortierung schaltet wirklich um
  const sortVor = await p.evaluate(() => (document.querySelector('#pgInspo .rez-toolbar .btn') || {}).textContent || '');
  await p.evaluate(() => window.rezInspoSort());
  await p.waitForTimeout(400);
  if ((await p.evaluate(() => (document.querySelector('#pgInspo .rez-toolbar .btn') || {}).textContent || '')) === sortVor)
    fail('K', 'Die Sortierung der Inspirationen schaltet nicht um');
  // Doppelte Adresse darf nicht zweimal angelegt werden
  await p.evaluate(() => window.rezOpenBulk());
  await p.waitForTimeout(400);
  await p.fill('#bulkTxt', 'https://youtu.be/dQw4w9WgXcQ');
  await p.click('.modal button:has-text("Add all")');
  await p.waitForTimeout(1200);
  if ((await p.locator('#pgInspo .rez-card').count()) !== nachherIdeen)
    fail('K', 'Eine bereits vorhandene Adresse wird ein zweites Mal angelegt');

  if (jsFehler.length) [...new Set(jsFehler)].slice(0, 8).forEach(e => fail('JS', e.slice(0, 200)));

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (F.length) {
    console.error('REZEPT-WAECHTER NICHT BESTANDEN:\n');
    F.forEach(x => console.error('  ' + x));
    process.exit(1);
  }
  console.log(`[rezept] ok (${themeAnzahl} Themes, Handler/Buttons/Ablauf/Nachfrage/Kontrast/Kategorien/Merge/Bewegung/Kochmodus)`);
})().catch(e => {
  // ⚠ Bei einem Absturz AUCH die bis dahin gesammelten Befunde ausgeben.
  // Ohne das sieht man nur "Timeout" und raet, was vorher schon schieflief -
  // genau das hat beim Kochmodus-Umbau eine Viertelstunde gekostet.
  console.error('REZEPT-WAECHTER abgestuerzt: ' + e.message);
  if (F.length) { console.error('\nBis dahin gefunden:'); F.forEach(x => console.error('  ' + x)); }
  process.exit(1);
});
