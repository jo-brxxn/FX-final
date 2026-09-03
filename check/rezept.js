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
function testPng(breite, hoehe) {
  const zlib = require('zlib');
  const W = breite || 8, H = hoehe || 8;
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
  pruefeSyncDiagnose(s);
}

// ── Statisch: die Sync-Diagnose muss den Rumpf lesen, nicht nur den Status ─
// Nutzer-Bugreport 2026-09-02 (zweiter Anlauf): die App meldete "API key
// rejected (401)" und schickte den Nutzer einen neuen Schluessel holen -
// im Rumpf stand aber Postgres 42501, "new row violates row-level security
// policy". PostgREST antwortet auf eine RLS-Verletzung naemlich nur DANN
// mit 403, wenn ein JWT mitkam; bei einer anonymen Anfrage (nur `apikey`,
// genau so sprechen beide Apps) mit 401. Wer hier nur den Statuscode
// auswertet, diagnostiziert zuverlaessig das falsche Problem.
// Zweitens: ein Verbindungstest, der nur liest, uebersieht genau diesen
// Fall - die Rezept-App muss NEUE Zeilen anlegen, der FX Analyst Pro
// aktualisiert bloss seine bestehende.
function pruefeSyncDiagnose(s) {
  const h = s.match(/async function httpFehler\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!h) { fail('SYNC', 'httpFehler() in js/rezept/store.js nicht gefunden'); return; }
  // Bewusst auf `42501` und nicht auf "row-level security" gepruft: der Text
  // steht auch in der 403-Meldung, eine Mutation koennte sich damit an der
  // Reihenfolge-Pruefung vorbeimogeln.
  if (!/42501/.test(h[1]))
    fail('SYNC', 'httpFehler() wertet den Fehlercode im Rumpf nicht aus — eine RLS-Verletzung kommt als 401 an und wuerde als Schluesselfehler gemeldet.');
  const statusZuerst = h[1].indexOf('res.status===401');
  const codeZuerst = h[1].indexOf('42501');
  if (statusZuerst >= 0 && codeZuerst >= 0 && codeZuerst > statusZuerst)
    fail('SYNC', 'httpFehler() prueft den Status VOR dem Fehlercode — 401 gewinnt dann gegen 42501 und die Meldung ist wieder falsch.');
  const t = s.match(/export async function testConnection\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!t) { fail('SYNC', 'testConnection() nicht gefunden'); return; }
  if (!/putRow\(/.test(t[1]))
    fail('SYNC', 'testConnection() schreibt nichts — ein reiner Lesetest meldet "Connection works", waehrend jeder Upload an der RLS-Regel scheitert.');
  // Das SQL muss dem Schluessel das ANLEGEN erlauben - `for all` oder
  // `for insert`, in beiden Faellen mit `with check`. Ohne das loest es
  // genau den Fehler nicht, wegen dem es existiert.
  const sql = (s.match(/export const SETUP_SQL=`([\s\S]*?)`;/) || [])[1] || '';
  if (!sql) fail('SYNC', 'SETUP_SQL fehlt — dann steht dem Nutzer im Fehlerfall nichts zum Kopieren bereit.');
  else if (!/for\s+(all|insert)/i.test(sql) || !/with check/i.test(sql))
    fail('SYNC', 'SETUP_SQL erteilt kein INSERT-Recht (`for all`/`for insert` mit `with check`) — genau das fehlt beim gemeldeten Fehler.');
  else if (!/enable row level security/i.test(sql))
    fail('SYNC', 'SETUP_SQL schaltet RLS nicht ein.');
  const app = fs.readFileSync('js/rezept/app.js', 'utf8');
  if (!/SETUP_SQL/.test(app) || !/rezCopySql/.test(app))
    fail('SYNC', 'Die Einstellungen zeigen das Setup-SQL nicht an (SETUP_SQL/rezCopySql fehlen in app.js).');
  if (!/rezCopySql[,}]/.test(app.slice(app.indexOf('Object.assign(window'))))
    fail('SYNC', 'rezCopySql fehlt in der window-Bruecke — der Knopf wuerde beim Klick still ein ReferenceError werfen.');
}

// ── Statisch: der Service Worker darf den Programmcode nicht cachen ─────
// ⚠ Nutzer-Bugreport 2026-09-02 ("es ist wie davor"): die Reparatur WAR
// ausgeliefert, kam beim Geraet aber nicht an - js/rezept/*.js lief ueber
// den Cache-First-Zweig, der Nutzer bekam weiter den alten Code. Von aussen
// sieht das exakt aus wie ein nicht behobener Fehler. Diese Pruefung haelt
// den Netz-zuerst-Zweig fuer Skripte fest.
function pruefeServiceWorker() {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const m = sw.match(/if\s*\(req\.mode\s*===\s*'navigate'([^)]*)\)/);
  if (!m) { fail('SW', 'Der Netz-zuerst-Zweig in sw.js wurde nicht gefunden - Pruefung veraltet?'); return; }
  if (!/isCode/.test(m[1]))
    fail('SW', 'sw.js liefert JS/CSS aus dem Cache aus - eine Code-Aenderung erreicht den Nutzer dann erst beim uebernaechsten Oeffnen ("es ist wie davor")');
  if (!/const\s+isCode\s*=\s*\/\\\.\(\?:js\|mjs\|css\)\$\//.test(sw))
    fail('SW', 'In sw.js fehlt die Erkennung von Skript-Dateien (isCode)');
  const v = (sw.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
  if (!v) fail('SW', 'CACHE_VERSION in sw.js nicht gefunden');
}

// ── Statisch: der taegliche Vorschlags-Lauf ──────────────────────────────
// ⚠ Die Zerlege-Logik darf NICHT zweimal existieren. Sie steht in
// js/rezept/feed.js und wird von beiden Seiten benutzt: vom Werkzeug auf dem
// Runner und von der App beim Nachladen. Eine zweite Kopie im Werkzeug waere
// die sichere Art, dass ein nachgeladenes Gericht anders aussieht als eins
// aus dem Vorrat.
function pruefeFeedAufbau() {
  const werkzeug = fs.readFileSync('tools/rezept-feed.mjs', 'utf8');
  if (!/from '\.\.\/js\/rezept\/feed\.js'/.test(werkzeug))
    fail('FEED', 'tools/rezept-feed.mjs benutzt nicht js/rezept/feed.js - die Zerlege-Logik liegt doppelt vor');
  if (/function\s+mealDbToItem\s*\(/.test(werkzeug))
    fail('FEED', 'mealDbToItem steht ein zweites Mal im Werkzeug');
  // Ein Schluessel darf nur aus der Umgebung kommen, nie im Code stehen.
  if (/apiKey=(?!\$\{|'\s*\+|\$\{encodeURIComponent)[A-Za-z0-9]{8}/.test(werkzeug))
    fail('FEED', 'Im Werkzeug steht ein fest eingetragener API-Schluessel');
  if (!/process\.env\.SPOONACULAR_KEY/.test(werkzeug))
    fail('FEED', 'Der Spoonacular-Schluessel wird nicht aus der Umgebung gelesen');
  // Der Workflow muss existieren und darf den Schluessel nur als Secret reichen.
  let wf = '';
  try { wf = fs.readFileSync('.github/workflows/rezept-feed.yml', 'utf8'); }
  catch (e) { fail('FEED', 'Der taegliche Workflow .github/workflows/rezept-feed.yml fehlt'); return; }
  if (!/secrets\.SPOONACULAR_KEY/.test(wf)) fail('FEED', 'Der Workflow reicht SPOONACULAR_KEY nicht als Secret durch');
  if (!/schedule:/.test(wf) || !/cron:/.test(wf)) fail('FEED', 'Der Workflow hat keinen Zeitplan');
  if (!/workflow_dispatch/.test(wf)) fail('FEED', 'Der Workflow laesst sich nicht von Hand starten');
  // Die Quellen-Datei muss lesbar sein - sie ist zum Bearbeiten von Hand da.
  try {
    const q = JSON.parse(fs.readFileSync('tools/rezept-quellen.json', 'utf8'));
    ['themealdb', 'spoonacular', 'jsonld', 'youtube'].forEach(k => {
      if (!q[k]) fail('FEED', `In tools/rezept-quellen.json fehlt der Abschnitt "${k}"`);
    });
    // ⚠ Ein "pro" an einer einzelnen Quelle muss auch wirken. Steht es in der
    // Datei, aber liest das Werkzeug nur proSeite/proKanal, dann ist die
    // staerkere Gewichtung neuer Quellen still wirkungslos - die Datei sieht
    // richtig aus, der Vorrat aendert sich nicht.
    const eigenesGewicht = []
      .concat((q.jsonld && q.jsonld.seiten) || [], (q.youtube && q.youtube.kanaele) || [])
      .filter(x => x && x.pro != null);
    if (eigenesGewicht.length) {
      if (!/\bs\.pro\b/.test(werkzeug) || !/\bk\.pro\b/.test(werkzeug))
        fail('FEED', `${eigenesGewicht.length} Quelle(n) haben ein eigenes "pro", aber das Werkzeug wertet es nicht aus`);
      eigenesGewicht.forEach(x => {
        if (!Number.isInteger(x.pro) || x.pro < 1)
          fail('FEED', `"pro" bei "${x.name}" ist keine ganze Zahl ab 1`);
      });
    }
  } catch (e) { fail('FEED', 'tools/rezept-quellen.json ist kein gueltiges JSON: ' + e.message); }
  // Der Vorrat selbst muss immer gueltiges JSON mit items-Liste sein.
  try {
    const f = JSON.parse(fs.readFileSync('rezept_feed.json', 'utf8'));
    if (!Array.isArray(f.items)) fail('FEED', 'rezept_feed.json hat keine items-Liste');
  } catch (e) { fail('FEED', 'rezept_feed.json ist kein gueltiges JSON: ' + e.message); }
  // Der Service Worker muss die Datei netz-zuerst ausliefern, sonst sieht
  // man die Vorschlaege von vorgestern.
  const sw = fs.readFileSync('sw.js', 'utf8');
  if (!/rezept_feed/.test(sw))
    fail('FEED', 'sw.js liefert rezept_feed.json aus dem Cache - dann stehen dort die Vorschlaege von vorgestern');
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
  pruefeServiceWorker();
  pruefeFeedAufbau();
  // --static: nur die Stufen ohne Browser (Kontrast, Sync-Diagnose, Service
  // Worker, Aufbau des Vorschlags-Laufs). Damit laesst sich eine Regel in
  // Sekunden gegen eine Mutation pruefen, statt den kompletten Browser-Lauf
  // abzuwarten.
  if (process.argv.includes('--static')) {
    if (F.length) { console.error('[rezept:static] FEHLER:\n' + F.map(f => '  - ' + f).join('\n')); process.exit(1); }
    console.log(`[rezept:static] ok (${themeAnzahl} Themes, Sync-Kopfzeilen/-Diagnose, Service Worker, Vorschlags-Lauf)`);
    process.exit(0);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rezcheck-'));
  const foto = path.join(tmp, 'dish.png');
  fs.writeFileSync(foto, testPng());

  const browser = await chromium.launch();
  // ⚠ serviceWorkers: 'block' - ohne das beantwortet der Service Worker die
  // Anfragen selbst, und page.route() greift nicht (im Probelauf zur
  // Vorschlags-Stufe genau so passiert: die Testdaten kamen nie an, die
  // echte, leere Datei schon).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
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

    // Weg 3: GENAU die Caption aus dem Screenshot des Nutzers (2026-09-02,
    // "du siehst die caption wird nicht richtig zerlegt"). Kennzeichen:
    // Ueberschrift NUR fuer die Zutaten, die Zubereitung folgt als
    // Fliesstext ohne eigene Ueberschrift, und in einer Zeile stehen zwei
    // Zutaten, weil beim Kopieren ein Zeilenumbruch verloren ging.
    const c = I.parseCaption([
      'Baked Salmon Feta Pasta', '', 'Ingredients:',
      '2 salmon fillets', '200 g feta', '400 g cherry tomatoes', '3 tbsp olive oil',
      '2 tsp oregano', '\u00bd tsp garlic powder', '\u00bd tsp salt',
      '\u00bd tsp black pepper 150 g baby spinach', '250 g pasta, cooked',
      'Preheat the oven to 200\u00b0C / 400\u00b0F. Place all the ingredients into a baking dish. '
      + 'Bake at 200\u00b0C / 400\u00b0F for 25 minutes, until the salmon is cooked through and the tomatoes are soft. '
      + 'Flake the salmon with a fork and mix it together with the feta and tomatoes until creamy. '
      + 'Add the spinach to the hot baking dish and let it wilt for 2-3 minutes. '
      + 'Add the cooked pasta and toss everything together. '
      + 'If the sauce is too thick, stir in a few tablespoons of the reserved pasta water.',
      'enjoy', '', '#pasta #salmon #reels', 'https://www.instagram.com/reel/CxYz123AbC/'].join('\n'));
    pruef('Screenshot-Caption: Zutaten', c.ingredients.length, 10);
    pruef('Screenshot-Caption: die Anleitung steht NICHT in den Zutaten',
      c.ingredients.filter(z => /Preheat|Bake at|Flake/.test(z)).length, 0);
    pruef('Screenshot-Caption: zwei Zutaten in einer Zeile getrennt',
      [c.ingredients[7], c.ingredients[8]], ['\u00bd tsp black pepper', '150 g baby spinach']);
    pruef('Screenshot-Caption: Zubereitung in Saetze zerlegt', c.steps.length >= 6, true);
    pruef('Screenshot-Caption: kein Schritt laenger als 180 Zeichen',
      c.steps.filter(x => x.length > 180).length, 0);
    pruef('Screenshot-Caption: Dauer aus dem Text', c.min, 25);

    // Weg 4: zweiter Bugreport 2026-09-02 - die Zubereitung stand in KURZEN
    // Zeilen da (typisch fuer Reels), und alles davon landete wieder in der
    // Zutatenliste, "enjoy" eingeschlossen. Die erste Reparatur hatte nur
    // lange Absaetze erkannt.
    const d = I.parseCaption([
      'Creamy Garlic Chicken', '', 'Ingredients:',
      '2 chicken breasts', '200 ml cream', '3 cloves garlic', 'Salt & pepper',
      'Sear the chicken for 5 minutes.', 'Add the garlic and cream.',
      'Simmer for 10 minutes.', 'Serve with rice.', 'enjoy',
      '#chicken #reels', 'https://www.instagram.com/reel/AbC/'].join('\n'));
    pruef('kurze Anweisungszeilen: Zutaten', d.ingredients.length, 4);
    pruef('kurze Anweisungszeilen: Schritte', d.steps.length, 5);
    pruef('"enjoy" ist keine Zutat', d.ingredients.filter(z => /enjoy/i.test(z)).length, 0);
    pruef('Anweisungen stehen nicht in den Zutaten',
      d.ingredients.filter(z => /Sear|Simmer|Serve|Add the/i.test(z)).length, 0);
    // ⚠ Gegenprobe: Zutaten OHNE Menge, die ein Kochwort enthalten, muessen
    // Zutaten BLEIBEN. Ein zu gieriger Filter waere die naechste Regression.
    const e = I.parseCaption([
      'Pasta', '', 'Ingredients:', '200 g pasta', 'Salt & pepper',
      'Fresh basil to serve', 'Petersilie zum Servieren', 'Olive oil',
      'Cook the pasta.', 'Serve hot.'].join('\n'));
    pruef('Zutat ohne Menge mit Kochwort bleibt Zutat', e.ingredients.length, 5);
    pruef('danach beginnt die Zubereitung', e.steps.length, 2);

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
  // ⚠ Seit REZEPT-CHECK-7 bekommt ein aus einem Reel erzeugtes Rezept
  // AUTOMATISCH ein Titelbild (echtes Vorschaubild bei YouTube, sonst ein
  // erkennbar erzeugtes) - es darf hier also KEINE Bild-Verweigerung mehr
  // geben. Dass ein von Hand angelegtes Rezept ohne Foto weiterhin abgelehnt
  // wird, prueft der Block darunter separat.
  if (!(await p.locator('.rf-drop img').count()))
    fail('F', 'Convert: das aus dem Reel erzeugte Rezept bekommt kein Titelbild');
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  await p.click('.modal button:has-text("Add recipe")');
  await p.waitForTimeout(1500);
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

  // Ein VON HAND angelegtes Rezept ohne Foto muss weiterhin abgelehnt werden -
  // die Automatik gilt nur fuer den Weg aus einer Inspiration.
  await p.evaluate(() => window.rezOpenForm(null));
  await p.waitForTimeout(500);
  await p.fill('#rfTitle', 'Ohne Foto');
  await p.evaluate(() => document.querySelector('.modal').scrollTo(0, 99999));
  await p.click('.modal button:has-text("Add recipe")');
  await p.waitForTimeout(600);
  if (!(await p.locator('#rfErr').isVisible().catch(() => false)))
    fail('F', 'Ein von Hand angelegtes Rezept ohne Titelbild wird kommentarlos angenommen');
  await p.evaluate(() => { window.rezDiscardClose(); });
  await p.waitForTimeout(500);

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
    // ⚠ Seit dem Umbau auf drei Spalten (Nutzer-Wunsch 2026-09-02) stehen
    // ALLE Schritte rechts, der aktive ist hervorgehoben. Geprueft wird
    // deshalb beides: die Liste ist vollstaendig, und genau EIN Schritt ist
    // aktiv - eine Liste ohne aktiven Schritt waere beim Kochen wertlos.
    const stpAnzahl = await p.locator('.ck-side-r .ck-stp').count();
    if (stpAnzahl !== 2) fail('K', `Die Zubereitung zeigt ${stpAnzahl} statt 2 Schritte in der rechten Spalte`);
    if (await p.locator('.ck-stp.on').count() !== 1) fail('K', 'Es ist nicht genau ein Schritt aktiv');
    const schritt1 = await p.evaluate(() => (document.querySelector('.ck-stp.on .ck-stp-t') || {}).textContent || '');
    if (!/Nudeln/.test(schritt1)) fail('K', `Der erste Schritt fehlt im Kochmodus ("${schritt1.slice(0, 40)}")`);
    // Schritte werden einzeln gezeigt, nicht als Block
    if (/Servieren/.test(schritt1)) fail('K', 'Die Zubereitung wird nicht in einzelne Schritte zerlegt');
    // Die drei Spalten muessen NEBENEINANDER liegen (links Zutaten, Mitte
    // Medien, rechts Zubereitung) und duerfen sich nicht ueberlappen.
    const spalten = await p.evaluate(() => {
      const g = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const l = g('.ck-side'), m = g('.ck-main'), r = g('.ck-side-r'), b = g('.ck-body');
      return l && m && r && b ? { l: [l.left, l.right], m: [m.left, m.right], r: [r.left, r.right], breit: b.width } : null;
    });
    if (!spalten) fail('K', 'Der Kochmodus hat keine drei Spalten');
    else if (spalten.breit > 1000) {   // schmale Fenster stapeln bewusst
      if (!(spalten.l[1] <= spalten.m[0] + 1)) fail('K', 'Zutaten und Medienspalte ueberlappen');
      if (!(spalten.m[1] <= spalten.r[0] + 1)) fail('K', 'Medien- und Zubereitungsspalte ueberlappen');
    }
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
    if (!/Servieren/.test(await p.evaluate(() => (document.querySelector('.ck-stp.on .ck-stp-t') || {}).textContent || '')))
      fail('K', '"Next" blaettert nicht zum naechsten Schritt');
    // Ein Klick auf einen Schritt in der Liste springt dorthin
    await p.click('.ck-side-r .ck-stp >> nth=0');
    await p.waitForTimeout(300);
    if (!/Nudeln/.test(await p.evaluate(() => (document.querySelector('.ck-stp.on .ck-stp-t') || {}).textContent || '')))
      fail('K', 'Ein Klick auf einen Schritt in der Liste waehlt ihn nicht aus');
    // Timer starten und die Uhr pruefen
    await p.evaluate(() => window.rezStartTimer(90, 'test'));
    await p.waitForTimeout(600);
    // ⚠ IM KOCHMODUS steht die Uhr OBEN MITTIG (Nutzer-Wunsch 2026-09-02).
    // Die untere Leiste bleibt dort ausgeblendet - dieselbe Uhr an zwei
    // Stellen waere doppelt und verdeckte frueher die Navigation.
    const uhr = await p.evaluate(() => (document.querySelector('#ckTimers .ck-tm-clock') || {}).textContent || '');
    if (!/^0?1:2\d|^0?1:3\d/.test(uhr)) fail('K', `Die Countdown-Uhr oben zeigt "${uhr}" statt einer Zeit um 01:30`);
    const untenSichtbar = await p.evaluate(() => {
      const t = document.getElementById('rezTimers');
      return !!t && getComputedStyle(t).display !== 'none';
    });
    if (untenSichtbar) fail('K', 'Die untere Timer-Leiste laeuft im Kochmodus zusaetzlich - dieselbe Uhr an zwei Stellen');
    const obenImKopf = await p.evaluate(() => {
      const bar = document.querySelector('.ck-bar'), tm = document.getElementById('ckTimers'), body = document.querySelector('.ck-body');
      if (!bar || !tm || !body) return false;
      const b = bar.getBoundingClientRect(), t = tm.getBoundingClientRect(), k = body.getBoundingClientRect();
      const mitte = (t.left + t.right) / 2, fenster = document.documentElement.clientWidth;
      return t.top >= b.top - 1 && t.bottom <= k.top + 1 && Math.abs(mitte - fenster / 2) < fenster * 0.2;
    });
    if (!obenImKopf) fail('K', 'Die Timer stehen nicht oben mittig in der Kopfleiste');
    await p.waitForTimeout(1400);
    const uhr2 = await p.evaluate(() => (document.querySelector('#ckTimers .ck-tm-clock') || {}).textContent || '');
    if (uhr2 === uhr) fail('K', 'Die Uhr laeuft nicht herunter');
    // Pause haelt sie an
    await p.click('#ckTimers .ck-tm-btn[aria-label="Pause or resume"]');
    await p.waitForTimeout(1200);
    const uhr3 = await p.evaluate(() => (document.querySelector('#ckTimers .ck-tm-clock') || {}).textContent || '');
    await p.waitForTimeout(1200);
    if ((await p.evaluate(() => (document.querySelector('#ckTimers .ck-tm-clock') || {}).textContent || '')) !== uhr3)
      fail('K', 'Ein pausierter Timer laeuft weiter');
    await p.click('#ckTimers .ck-tm-btn[aria-label="Remove timer"]');
    await p.waitForTimeout(400);
    if (await p.locator('#ckTimers .ck-tm-clock').count()) fail('K', 'Ein gestoppter Timer verschwindet nicht');
    if (!(await p.locator('#ckTimers .btn').count())) fail('K', 'Ohne laufenden Timer fehlt oben der Knopf, einen zu starten');
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

  // ── L) Bilder ueberall sichtbar ──────────────────────────────────────
  // Nutzer-Wunsch 2026-09-02: die Bilder eines Rezepts sollen auf der Karte,
  // im Rezept UND im Kochmodus zu sehen sein. Bis dahin lagen die Bilder aus
  // der Zubereitung nur im Detailfenster.
  const bildRez = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const px = (f) => 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="${f}"/></svg>`);
    const id = S.uid();
    await S.saveRecipe({
      id, title: 'Bilder Test', min: 20, servings: 2, tags: ['Test'],
      cover: px('#888'), thumb: px('#888'),
      ingredients: ['200 g Spaghetti'],
      blocks: [
        { t: 'text', v: '1. Wasser aufsetzen.' },
        { t: 'img', v: px('#a55') },
        { t: 'text', v: '2. Nudeln hinein.' },
        { t: 'img', v: px('#5a5') },
      ],
      source: 'https://youtu.be/dQw4w9WgXcQ',
    });
    return id;
  });
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.rezClearFilters(); window.rezShowPage('recipes'); });
  await p.waitForTimeout(600);

  // L1: Von aussen sichtbar, dass es mehr als ein Foto gibt
  const abzeichen = await p.evaluate(() => {
    const k = [...document.querySelectorAll('#pgRecipes .rez-card')]
      .find(c => /Bilder Test/.test(c.textContent));
    if (!k) return null;
    const b = k.querySelector('.rez-card-imgs');
    return b ? b.textContent.trim() : '';
  });
  if (abzeichen === null) fail('L', 'Die Testkarte wurde nicht gefunden');
  else if (!/3/.test(abzeichen))
    fail('L', `Die Karte zeigt kein Foto-Abzeichen mit 3 (gelesen: "${abzeichen}") - Bilder sind von aussen nicht erkennbar`);

  // L2: Detailfenster zeigt einen Streifen ALLER Bilder und oeffnet die Grossansicht
  await p.evaluate(id => window.rezOpenDetail(id), bildRez);
  await p.waitForTimeout(900);
  const streifen = await p.locator('.rd-strip img').count();
  if (streifen !== 3) fail('L', `Der Bilderstreifen im Detailfenster zeigt ${streifen} statt 3 Bilder`);
  await p.locator('.rd-strip img').nth(1).click();
  await p.waitForTimeout(500);
  if (!(await p.locator('#rezLight.on .lb-img').count()))
    fail('L', 'Ein Klick auf den Bilderstreifen oeffnet keine Grossansicht');
  else {
    const vor = await p.evaluate(() => (document.querySelector('.lb-img') || {}).src || '');
    await p.click('.lb-next');
    await p.waitForTimeout(400);
    if ((await p.evaluate(() => (document.querySelector('.lb-img') || {}).src || '')) === vor)
      fail('L', 'In der Grossansicht laesst sich nicht weiterblaettern');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    if (await p.locator('#rezLight.on').count()) fail('L', 'Escape schliesst die Grossansicht nicht');
    // ⚠ Escape darf NUR die Grossansicht schliessen, nicht auch das
    // Rezept darunter - sonst ist man mit einem Tastendruck zwei Ebenen weg.
    if (!(await p.locator('.rd-title').count()))
      fail('L', 'Escape in der Grossansicht schliesst auch das Rezept darunter');
  }

  // L3: Video ist vom Rezept aus abspielbar
  if (!(await p.locator('.rd-play').count()))
    fail('L', 'Ein Rezept mit Video-Herkunft bietet keinen Abspiel-Knopf');
  else {
    await p.click('.rd-play');
    await p.waitForTimeout(800);
    if (!(await p.locator('#rezVideo.on iframe').count()))
      fail('L', 'Der Abspiel-Knopf oeffnet kein Video');
    await p.evaluate(() => window.rezCloseVideo());
    await p.waitForTimeout(400);
    if (await p.locator('#rezVideo.on').count()) fail('L', 'Das Video-Fenster laesst sich nicht schliessen');
  }
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(500);

  // L4: Kochmodus - Bild HAENGT AM SCHRITT, nicht als eigener leerer Schritt
  await p.evaluate(id => window.rezCook(id), bildRez);
  await p.waitForTimeout(800);
  const ckStreifen = await p.locator('.ck-strip img').count();
  if (ckStreifen !== 3) fail('L', `Der Fotostreifen im Kochmodus zeigt ${ckStreifen} statt 3 Bilder`);
  const schritt1 = await p.evaluate(() => ({
    text: (document.querySelector('.ck-stp.on .ck-stp-t') || {}).textContent || '',
    bild: !!document.querySelector('.ck-media img'),
    schritte: document.querySelectorAll('.ck-stp').length,
    anzahl: (document.querySelector('.ck-cap') || {}).textContent || '',
  }));
  if (!/Wasser/.test(schritt1.text)) fail('L', 'Der erste Schritt im Kochmodus stimmt nicht');
  if (!schritt1.bild) fail('L', 'In der Mitte des Kochmodus steht kein Bild');
  if (schritt1.schritte !== 2)
    fail('L', `Bilder werden weiter als eigene Schritte gezaehlt (${schritt1.schritte} statt 2 Schritte)`);
  if (!/of 2/.test(schritt1.anzahl))
    fail('L', `Die Schrittzaehlung stimmt nicht ("${schritt1.anzahl.trim()}" statt "Step 1 of 2")`);
  // ⚠ Das Medienfeld MUSS das Seitenverhaeltnis des Bildes annehmen
  // (Nutzer-Wunsch: "es soll sich anpassen an das Format des Bildes").
  // Geprueft mit einem 2:1-Bild: der Kasten muss ~2:1 werden, nicht 4:3.
  const seiten = await p.evaluate(async () => {
    const box = document.querySelector('.ck-media'), im = box && box.querySelector('img');
    if (!box || !im) return null;
    await new Promise(r => { if (im.complete) r(); else im.addEventListener('load', r, { once: true }); });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const b = box.getBoundingClientRect();
    return { bild: (im.naturalWidth || 0) / (im.naturalHeight || 1), kasten: b.width / b.height,
             gesetzt: box.style.getPropertyValue('--ck-ar') };
  });
  if (!seiten) fail('L', 'Das Medienfeld im Kochmodus fehlt');
  else if (!seiten.gesetzt) fail('L', 'Das Medienfeld uebernimmt das Seitenverhaeltnis des Bildes nicht');
  else if (Math.abs(seiten.kasten - seiten.bild) > 0.12)
    fail('L', `Das Medienfeld steht auf ${seiten.kasten.toFixed(2)}:1, das Bild ist ${seiten.bild.toFixed(2)}:1`);
  await p.evaluate(() => window.rezCookExit());
  await p.waitForTimeout(500);

  // L5: Vorschaubild eines Reels wird Titelbild
  // ⚠ Das ECHTE Vorschaubild (YouTube) laesst sich hier nicht pruefen - die
  // Netz-Policy dieser Umgebung blockt img.youtube.com. Geprueft wird der
  // Fall, der ohne Netz gelten muss: Instagram/TikTok geben ihr Vorschaubild
  // nicht heraus, also MUSS ein erzeugtes Titelbild entstehen, damit
  // "Convert to recipe" nicht ohne Bild dasteht.
  const erzeugt = await p.evaluate(async () => {
    const C = await import('./js/rezept/cook.js');
    const d = C.makeCoverCard('Pasta al Limone', '@kochenmitchef', 'Instagram',
      { a: '#3B2A21', b: '#8A5626', ff: 'sans-serif' });
    return { ist: typeof d === 'string' && d.startsWith('data:image/'), laenge: (d || '').length };
  });
  if (!erzeugt.ist) fail('L', 'Es entsteht kein erzeugtes Titelbild fuer Reels ohne oeffentliches Vorschaubild');
  if (erzeugt.laenge < 2000) fail('L', 'Das erzeugte Titelbild ist verdaechtig klein - vermutlich leer');
  const vorschau = await p.evaluate(async () => {
    const I = await import('./js/rezept/import.js');
    return {
      yt: I.previewUrl(I.detectLink('https://youtu.be/dQw4w9WgXcQ')),
      ig: I.previewUrl(I.detectLink('https://www.instagram.com/reel/AbC/')),
    };
  });
  if (!/img\.youtube\.com\/vi\/dQw4w9WgXcQ/.test(vorschau.yt))
    fail('L', `Fuer YouTube wird keine Vorschaubild-Adresse gebildet ("${vorschau.yt}")`);
  if (vorschau.ig !== '')
    fail('L', 'Fuer Instagram wird eine Vorschaubild-Adresse GERATEN - die gibt es nicht oeffentlich, das landet als kaputtes Bild beim Nutzer');


  // ── M) Titelbild aus dem Video / Bildschirmfoto ("Cover Studio") ─────
  // Nutzer-Wunsch 2026-09-02: "Screenshot aus dem Reel als Titelbild direkt
  // in der App auswaehlbar machen". Geprueft wird beides: der Weg, der bei
  // YouTube echte Standbilder anbietet, UND der Weg fuer Instagram/TikTok,
  // wo es die technisch nicht gibt - dort MUSS stattdessen der
  // Bildschirmfoto-Weg dastehen statt einer Attrappe.
  const rahmen = await p.evaluate(async () => {
    const I = await import('./js/rezept/import.js');
    return {
      yt: I.frameUrls(I.detectLink('https://youtu.be/dQw4w9WgXcQ')).map(f => f.url),
      ig: I.frameUrls(I.detectLink('https://www.instagram.com/reel/AbC/')),
      tt: I.frameUrls(I.detectLink('https://www.tiktok.com/@a/video/123')),
      leer: I.frameUrls(null),
    };
  });
  if (rahmen.yt.length < 3) fail('M', `Fuer YouTube werden ${rahmen.yt.length} Standbilder angeboten`);
  if (!rahmen.yt.every(u => /^https:\/\/img\.youtube\.com\/vi\/dQw4w9WgXcQ\//.test(u)))
    fail('M', 'Die Standbild-Adressen zeigen nicht auf das richtige Video');
  if (rahmen.ig.length || rahmen.tt.length || rahmen.leer.length)
    fail('M', 'Fuer Instagram/TikTok werden Standbilder GERATEN - die gibt es nicht, das landet als kaputtes Bild beim Nutzer');

  // M1: mit YouTube-Quelle - Standbilder UND Bildschirmfoto-Weg
  const ytRez = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const px = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const id = S.uid();
    await S.saveRecipe({ id, title: 'From YouTube', min: 20, tags: [], fav: false, cover: px, thumb: px,
      ingredients: ['1 thing'], blocks: [{ t: 'text', v: 'Step.' }], source: 'https://youtu.be/dQw4w9WgXcQ' });
    return id;
  });
  await p.evaluate(id => window.rezOpenForm(id), ytRez);
  await p.waitForTimeout(700);
  if (!(await p.locator('.rf-add .btn:has-text("Cover from the video")').count()))
    fail('M', 'Im Formular fehlt der Knopf "Cover from the video"');
  await p.evaluate(() => window.rezCoverStudio());
  await p.waitForTimeout(500);
  if (!(await p.locator('#rezCover.on').count())) fail('M', 'Das Titelbild-Fenster oeffnet sich nicht');
  const csYt = await p.evaluate(() => ({
    frames: document.querySelectorAll('#rezCover .cs-frame').length,
    rahmen: !!document.querySelector('#csFrame'),
    drop: !!document.querySelector('#csDrop'),
    formNochDa: !!document.getElementById('rfTitle'),
  }));
  if (csYt.frames < 3) fail('M', `Bei YouTube werden ${csYt.frames} Standbilder zur Auswahl gestellt`);
  if (!csYt.rahmen) fail('M', 'Das Video wird im Titelbild-Fenster nicht eingebettet');
  if (!csYt.drop) fail('M', 'Der Weg ueber ein eigenes Bildschirmfoto fehlt');
  if (!csYt.formNochDa) fail('M', 'Das Rezept-Formular verschwindet, sobald das Titelbild-Fenster aufgeht');
  // Jeder Handler im Fenster muss auf eine echte Funktion zeigen (Regel 6).
  const csTot = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#rezCover [onclick],#rezCover [onchange],#rezCover [onerror]').forEach(el => {
      ['onclick', 'onchange', 'onerror'].forEach(a => {
        const v = el.getAttribute(a);
        if (!v) return;
        for (const m of v.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
          const n = m[2];
          if (['if', 'for', 'while', 'return', 'typeof', 'closest', 'querySelector'].includes(n)) continue;
          if (typeof window[n] !== 'function') out.push(a + '="' + v.slice(0, 40) + '" -> ' + n);
        }
      });
    });
    return [...new Set(out)];
  });
  csTot.forEach(x => fail('M', 'Handler im Titelbild-Fenster zeigt auf keine Funktion: ' + x));
  // Escape schliesst NUR das obere Fenster, nicht das Formular darunter.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  if (await p.locator('#rezCover.on').count()) fail('M', 'Escape schliesst das Titelbild-Fenster nicht');
  if (!(await p.locator('#rfTitle').count())) fail('M', 'Escape schliesst auch das Formular darunter - die Eingaben waeren weg');

  // M2: Bildschirmfoto waehlen, zuschneiden, uebernehmen
  // ⚠ Das Testbild ist 8x16 (hochkant wie ein Handy-Screenshot). Mit dem
  // Zuschnitt auf 1:1 MUSS ein quadratisches Titelbild herauskommen - genau
  // daran haengt, ob der Zuschnitt in BILDPUNKTEN gerechnet wird.
  const hoch = path.join(tmp, 'shot.png');
  fs.writeFileSync(hoch, testPng(8, 16));
  await p.evaluate(() => window.rezCoverStudio());
  await p.waitForTimeout(400);
  const fcCs = p.waitForEvent('filechooser', { timeout: 4000 });
  await p.click('#csDrop');
  await fcCs.then(c => c.setFiles(hoch)).catch(() => fail('M', 'Der Datei-Dialog fuer das Bildschirmfoto oeffnet sich nicht'));
  await p.waitForTimeout(900);
  if (!(await p.locator('#csCrop').count())) fail('M', 'Nach der Auswahl erscheint kein Zuschnitt');
  await p.click('.cs-ratio:has-text("1:1")');
  await p.waitForTimeout(300);
  if (!(await p.locator('.cs-ratio.on:has-text("1:1")').count())) fail('M', 'Das Seitenverhaeltnis 1:1 laesst sich nicht waehlen');
  await p.click('.cs-btns .btn-primary');
  await p.waitForTimeout(900);
  if (await p.locator('#rezCover.on').count()) fail('M', 'Das Titelbild-Fenster bleibt nach "Use as cover" offen');
  const zug = await p.evaluate(() => new Promise(res => {
    const im = document.querySelector('.rf-drop img');
    if (!im) return res(null);
    const t = new Image();
    t.onload = () => res({ w: t.naturalWidth, h: t.naturalHeight, src: im.src.slice(0, 30) });
    t.onerror = () => res(null);
    t.src = im.src;
  }));
  if (!zug) fail('M', 'Nach dem Zuschneiden steht kein Titelbild im Formular');
  else {
    if (!/^data:image\//.test(zug.src)) fail('M', 'Das Titelbild ist kein eingebettetes Bild');
    if (Math.abs(zug.w / zug.h - 1) > 0.12)
      fail('M', `Der Zuschnitt auf 1:1 ergibt ${zug.w}x${zug.h} - das Seitenverhaeltnis wird nicht angewandt`);
  }
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(400);

  // M3: Instagram - keine Standbilder, aber der Bildschirmfoto-Weg MUSS da sein
  const igRez = await p.evaluate(async () => {
    const S = await import('./js/rezept/store.js');
    const px = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const id = S.uid();
    await S.saveRecipe({ id, title: 'From Instagram', min: 20, tags: [], fav: false, cover: px, thumb: px,
      ingredients: ['1 thing'], blocks: [{ t: 'text', v: 'Step.' }], source: 'https://www.instagram.com/reel/AbC/' });
    return id;
  });
  await p.evaluate(id => window.rezOpenForm(id), igRez);
  await p.waitForTimeout(700);
  await p.evaluate(() => window.rezCoverStudio());
  await p.waitForTimeout(500);
  const csIg = await p.evaluate(() => ({
    frames: document.querySelectorAll('#rezCover .cs-frame').length,
    drop: !!document.querySelector('#csDrop'),
    text: (document.querySelector('#rezCover') || {}).textContent || '',
  }));
  if (csIg.frames) fail('M', 'Bei Instagram werden Standbilder angeboten, die es nicht gibt');
  if (!csIg.drop) fail('M', 'Bei Instagram fehlt der Bildschirmfoto-Weg - dann kann man dort gar kein Titelbild waehlen');
  if (!/screenshot/i.test(csIg.text)) fail('M', 'Es wird nicht erklaert, wie man bei Instagram zu einem Titelbild kommt');
  await p.evaluate(() => window.rezCloseCover());
  await p.waitForTimeout(300);
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(400);


  // ── N) Taegliche Essensvorschlaege ───────────────────────────────────
  // Nutzer-Wunsch 2026-09-03: taeglich neue Vorschlaege, sortiert nach
  // Quelle UND nach Art (mit Fleisch / ohne / Fisch / Nudeln / Suppe), in
  // einer Dreierreihe mit Nachlade-Knopf.

  // N1: Themen-Erkennung - rein rechnerisch, beide Sprachen
  const themen = await p.evaluate(async () => {
    const T = await import('./js/rezept/themen.js');
    const out = [];
    const t = (name, ist, soll) => out.push({ name, ist, soll, ok: JSON.stringify(ist) === JSON.stringify(soll) });
    t('Lachs + Nudeln', T.themenOf('Baked Salmon Feta Pasta', ['2 salmon fillets', '250 g pasta']), ['fish', 'protein', 'pasta']);
    t('Hackfleisch', T.themenOf('Spaghetti Bolognese', ['500 g Hackfleisch', '400 g Spaghetti']), ['meat', 'protein', 'pasta']);
    t('deutsche Zusammensetzung', T.themenOf('Tomatensuppe', ['Tomaten', 'Zwiebel']), ['veggie', 'soup']);
    t('Huhn', T.themenOf('Chicken Noodle Soup', ['chicken breast', 'noodles']), ['chicken', 'protein', 'pasta', 'soup']);
    // ⚠ Fischsauce macht ein Gericht NICHT zum Fischgericht - wer nach Fisch
    // filtert, bekaeme sonst Gerichte ohne ein Stueck Fisch darin.
    // ⚠ Diese beiden Faelle muessen die ENTFERNUNG der versteckten Zutaten
    // pruefen, nicht nur ihre Wirkung auf "No meat". Erste Fassung nahm das
    // deutsche "Fischsauce" - ein Wort, das ohnehin auf kein Themenwort
    // passt; die Pruefung waere gruen geblieben, als die Entfernung
    // versuchsweise ausgebaut wurde. Mit "fish sauce" und "chicken stock"
    // (beide enthalten ein Themenwort als ganzes Wort) beisst sie wirklich.
    // ⚠ Der Tofu im Pad Thai IST ein Eiweisstraeger - "protein" gehoert hier
    // hin; entscheidend ist, dass "fish" NICHT auftaucht.
    t('fish sauce macht kein Fischgericht', T.themenOf('Pad Thai', ['Reisnudeln', '2 tbsp fish sauce', 'Tofu']), ['protein', 'pasta']);
    // ⚠ Und "chicken stock" darf weder Huhn NOCH Protein ausloesen: Bruehe
    // ist Wuerze. Erste Fassung des Protein-Themas las die Zutaten roh und
    // machte aus diesem Risotto ein Proteingericht.
    t('chicken stock macht kein Huhn', T.themenOf('Risotto', ['200 g Reis', '500 ml chicken stock', 'Parmesan']), ['rice']);
    t('...beides aber unvegetarisch', T.themenOf('Pad Thai', ['Reisnudeln', '2 tbsp fish sauce', 'Tofu']).includes('veggie'), false);
    t('ohne Zutaten kein Thema', T.themenOf('Irgendwas', []), []);
    t('Labels', T.themenLabels(['meat', 'veggie']), ['Meat', 'No meat']);
    // ⚠ Nutzer-Wunsch 2026-09-03: proteinreich. Nur ZUTATEN zaehlen - ein
    // Titel "Protein Bowl" ohne Eiweisstraeger darin waere gelogen.
    t('proteinreich an der Zutat', T.themenOf('Bowl', ['400 g Hähnchenbrust', '200 g Reis']).includes('protein'), true);
    t('Quark/Pulver zaehlen', T.themenOf('Dessert', ['500 g Magerquark', '1 EL Proteinpulver']).includes('protein'), true);
    t('Linsen zaehlen', T.themenOf('Suppe', ['250 g Linsen', 'Karotten']).includes('protein'), true);
    t('Titel allein reicht nicht', T.themenOf('High Protein Bowl', ['Salat', 'Gurke', 'Dressing']).includes('protein'), false);
    // ⚠ Zwei Eier im Kuchen machen daraus kein Proteingericht.
    t('Eier im Kuchen zaehlen nicht', T.themenOf('Schokokuchen', ['Mehl', '2 Eier', 'Zucker', 'Schokolade']).includes('protein'), false);
    t('Eier im Shakshuka zaehlen', T.themenOf('Shakshuka', ['4 Eier', 'Tomaten']).includes('protein'), true);
    // ⚠ Sagt das Rezept selbst "vegan", zaehlen Produktnamen nicht mehr:
    // "vegane Salami" und "Räuchertofu" sind kein Fleisch (Pruef-Lauf
    // 2026-09-03: "Veganes Pizza-Sandwich" stand unter Meat).
    t('vegan schlaegt Produktnamen', T.themenOf('Veganes Pizza-Sandwich mit Tofu-Ricotta',
      ['200 g Räuchertofu', 'vegane Salami', 'Pizzateig']), ['veggie', 'protein', 'bread']);
    t('vegan bleibt ohne Fleisch nicht themenlos', T.themenOf('Vegan Chicken Nuggets',
      ['Sojaschnetzel', 'Panade']), ['veggie', 'protein']);
    t('echtes Fleisch bleibt Fleisch', T.themenOf('Spaghetti Bolognese',
      ['500 g Hackfleisch', 'Spaghetti']), ['meat', 'protein', 'pasta']);
    // ⚠ "Eis" darf nicht ueber die Mehrzahlregel als "Ei" gelten.
    t('Eis ist kein Ei', T.themenOf('Eis am Stiel', ['Eis', 'Sahne']).includes('protein'), false);
    return out;
  });
  themen.filter(x => !x.ok).forEach(x =>
    fail('N', `Themen "${x.name}": ${JSON.stringify(x.ist)} statt ${JSON.stringify(x.soll)}`));

  // N2: Zerlegen der Quellen - dieselbe Datei, die auch das Werkzeug nutzt
  const zerlegt = await p.evaluate(async () => {
    const F = await import('./js/rezept/feed.js');
    const out = [];
    const t = (name, ist, soll) => out.push({ name, ist, soll, ok: JSON.stringify(ist) === JSON.stringify(soll) });
    const html = '<html><head><script type="application/ld+json">' + JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebSite', name: 'Blog' }, {
        '@type': 'Recipe', name: 'Ofengemuese mit Feta',
        image: { '@type': 'ImageObject', url: 'https://x.de/b.jpg' },
        author: { '@type': 'Person', name: 'Lena' }, totalTime: 'PT45M', recipeYield: ['4 Portionen'],
        recipeIngredient: ['500 g Kartoffeln', '200 g Feta'],
        recipeInstructions: [{ '@type': 'HowToStep', text: 'Ofen vorheizen.' },
          { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: '45 Minuten backen.' }] }],
      }],
    }) + '<' + '/script></head><body></body></html>';
    let r = null;
    for (const b of F.jsonLdBloecke(html)) { r = F.findeRezept(b, 0); if (r) break; }
    t('JSON-LD im @graph gefunden', !!r, true);
    t('Bild aus dem Objekt', F.bildAus(r && r.image), 'https://x.de/b.jpg');
    t('Schritte inkl. Abschnitt', F.anweisungenAus(r && r.recipeInstructions), ['Ofen vorheizen.', '45 Minuten backen.']);
    t('Dauer PT45M', F.isoMinuten('PT45M'), 45);
    t('Dauer PT1H30M', F.isoMinuten('PT1H30M'), 90);
    t('Dauer Unsinn', F.isoMinuten('morgen'), null);
    t('RSS-Links', F.feedLinks('<rss><item><link>https://x.de/a</link></item><item><link>https://x.de/b</link></item></rss>', 5), ['https://x.de/a', 'https://x.de/b']);
    t('Atom-Links', F.feedLinks('<feed><entry><link href="https://y.de/1"/></entry></feed>', 5), ['https://y.de/1']);
    // ⚠ Halbe Eintraege gehoeren VERWORFEN, nicht mit Platzhaltern gefuellt:
    // eine Karte ohne Zutaten sieht aus wie ein Rezept, ist aber keins.
    // ⚠ Der Titel muss hier LANG GENUG sein. Erste Fassung nahm 'A' - damit
    // hat die Pruefung in Wahrheit nur die Titel-Mindestlaenge getestet und
    // waere gruen geblieben, als die Bild-Pflicht versuchsweise entfernt
    // wurde. Genau dafuer gibt es den Mutationstest.
    t('ohne Bild verworfen', F.baue({ src: 'x', title: 'Testgericht ohne Bild', ingredients: ['1 a', '2 b'], steps: ['x', 'y'] }), null);
    t('ohne Inhalt verworfen', F.baue({ src: 'x', title: 'Testgericht ohne Inhalt', image: 'u', ingredients: ['1 a'], steps: [] }), null);
    t('vollstaendig wird gebaut', !!F.baue({ src: 'x', title: 'Testgericht komplett', image: 'u', ingredients: ['1 a', '2 b'], steps: ['x', 'y'] }), true);
    const m = F.mealDbToItem({ strMeal: 'Beef Wellington', strMealThumb: 'https://i/1.jpg', idMeal: '1',
      strCategory: 'Beef', strArea: 'British', strInstructions: 'Sear the beef. Bake for 40 minutes.',
      strIngredient1: 'Beef', strMeasure1: '1 kg', strIngredient2: 'Pastry', strMeasure2: '500 g' });
    t('TheMealDB: Mengen an die Zutat', m && m.ingredients, ['1 kg Beef', '500 g Pastry']);
    t('TheMealDB: Themen', m && m.themes, ['meat', 'protein']);
    t('TheMealDB: leere Antwort', F.mealDbToItem(null), null);
    // ⚠ Bestehende Eintraege nachputzen: der Vorrat enthielt nach dem ersten
    // scharfen Lauf "step 1" und "Notes" als eigene Kochschritte. Eine
    // Reparatur nur am Zerleger haette die schon gespeicherten Eintraege nie
    // erreicht - deshalb putzt jeder Lauf den ganzen Vorrat nach.
    t('Schritte nachputzen', F.putzeSchritte(['step 1', 'Heat the oil.', 'step 2', 'Add pork.', 'Notes', 'Storing: 3 days.']),
      ['Heat the oil.', 'Add pork.']);
    t('echte Schritte bleiben', F.putzeSchritte(['Alles vermengen.', 'Backen.']), ['Alles vermengen.', 'Backen.']);
    return out;
  });
  zerlegt.filter(x => !x.ok).forEach(x =>
    fail('N', `Zerlegen "${x.name}": ${JSON.stringify(x.ist)} statt ${JSON.stringify(x.soll)}`));

  // N3: Zusammenfuehren der gesehenen Vorschlaege ueber zwei Geraete
  const feedMerge = await p.evaluate(async () => {
    const S2 = await import('./js/rezept/store.js');
    const A = S2.normalizeIndex({ feed: { seen: ['a', 'b'], up: '2026-09-03T10:00:00Z', cleared: '' } });
    const B = S2.normalizeIndex({ feed: { seen: ['c'], up: '2026-09-03T09:00:00Z', cleared: '' } });
    const R = S2.normalizeIndex({ feed: { seen: [], up: '2026-09-03T11:00:00Z', cleared: '2026-09-03T11:00:00Z' } });
    const N2 = S2.normalizeIndex({ feed: { seen: ['z'], up: '2026-09-03T12:00:00Z', cleared: '' } });
    return {
      vereinigt: S2.mergeIndex(A, B).feed.seen.sort(),
      nachReset: S2.mergeIndex(A, R).feed.seen,
      nachResetUmgedreht: S2.mergeIndex(R, A).feed.seen,
      danachNeu: S2.mergeIndex(R, N2).feed.seen,
    };
  });
  if (JSON.stringify(feedMerge.vereinigt) !== JSON.stringify(['a', 'b', 'c']))
    fail('N', `Gesehene Vorschlaege werden nicht vereinigt: ${JSON.stringify(feedMerge.vereinigt)}`);
  // ⚠ "Show them all again" muss ueberleben: eine reine Vereinigung wuerde
  // die geleerte Liste vom anderen Geraet sofort zurueckholen.
  if (feedMerge.nachReset.length || feedMerge.nachResetUmgedreht.length)
    fail('N', `Ein Zuruecksetzen wird vom Abgleich wieder aufgefuellt: ${JSON.stringify(feedMerge.nachReset)}/${JSON.stringify(feedMerge.nachResetUmgedreht)}`);
  if (JSON.stringify(feedMerge.danachNeu) !== JSON.stringify(['z']))
    fail('N', `Nach dem Zuruecksetzen gesehene Vorschlaege gehen verloren: ${JSON.stringify(feedMerge.danachNeu)}`);

  // N4: die Oberflaeche mit Testdaten - Dreierreihe, Nachladen, Filter
  const FIX = { updated: new Date().toISOString(), count: 8, sources: ['TheMealDB', 'Kitchen Blog', 'Chef TV'], items: [] };
  [['Chicken Handi', 'TheMealDB', ['chicken'], ['1 kg Chicken', '2 Tomatoes'], ['Fry.', 'Simmer.']],
   ['Tomatensuppe', 'Kitchen Blog', ['veggie', 'soup'], ['1 kg Tomaten', '1 Zwiebel'], ['Kochen.', 'Puerieren.']],
   ['Spaghetti Bolognese', 'Chef TV', ['meat', 'pasta'], ['500 g Hack', '400 g Spaghetti'], ['Anbraten.', 'Kochen.']],
   ['Lachs mit Spinat', 'TheMealDB', ['fish'], ['2 Lachsfilets', '200 g Spinat'], ['Backen.', 'Servieren.']],
   ['Kartoffelsalat', 'Kitchen Blog', ['veggie', 'salad', 'potato'], ['1 kg Kartoffeln', '1 Zwiebel'], ['Kochen.', 'Mischen.']],
   ['Pancakes', 'Chef TV', ['veggie', 'sweet', 'breakfast'], ['200 g Mehl', '2 Eier'], ['Ruehren.', 'Backen.']],
   ['Rindergulasch', 'TheMealDB', ['meat', 'soup'], ['1 kg Rind', '2 Zwiebeln'], ['Anbraten.', 'Schmoren.']],
   // ⚠ Quellenname MIT APOSTROPH. Genau daran ist der erste scharfe Lauf
   // gescheitert: "Malte's Kitchen" landete ueber escH() als &#39; im
   // onclick-Text, der Browser machte daraus wieder ein ' und der Handler
   // war kaputtes JavaScript ("missing ) after argument list").
   ['Apfelkuchen', "Malte's Kitchen", ['veggie', 'sweet'], ['500 g Aepfel', '200 g Mehl'], ['Ruehren.', 'Backen.']],
  ].forEach((r, i) => FIX.items.push({ id: 'fx' + i, src: 'x', srcName: r[1], title: r[0],
    url: 'https://beispiel.invalid/' + i, image: 'https://bild.invalid/' + i + '.jpg', video: '', creator: '',
    min: 20 + i * 5, servings: 2, ingredients: r[3], steps: r[4], themes: r[2], tags: [], added: new Date().toISOString() }));

  await p.route(/rezept_feed\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX) }));
  await p.route(/bild\.invalid/, r => r.abort());
  // Sauberer Ausgangszustand: nichts gilt als gesehen.
  await p.evaluate(async () => { const S2 = await import('./js/rezept/store.js'); await S2.clearFeedSeen(); });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.rezShowPage('inspo'));
  await p.waitForTimeout(1200);

  const reihe = () => p.evaluate(() => [...document.querySelectorAll('.fd-card .fd-title')].map(e => e.textContent));
  const ersteDrei = await reihe();
  if (ersteDrei.length !== 3) fail('N', `Die Vorschlagsreihe zeigt ${ersteDrei.length} statt 3 Gerichte`);
  // Drei nebeneinander, nicht untereinander (Nutzer-Wunsch "in einer Reihe").
  const nebeneinander = await p.evaluate(() => {
    const k = [...document.querySelectorAll('.fd-card')].slice(0, 3).map(e => e.getBoundingClientRect());
    if (k.length < 3) return false;
    return Math.abs(k[0].top - k[1].top) < 4 && Math.abs(k[1].top - k[2].top) < 4 && k[0].left < k[1].left && k[1].left < k[2].left;
  });
  if (!nebeneinander) fail('N', 'Die drei Vorschlaege stehen nicht nebeneinander');
  const zaehler1 = await p.evaluate(() => (document.querySelector('.fd-count') || {}).textContent || '');
  if (!/3 of 8/.test(zaehler1)) fail('N', `Der Zaehler zeigt "${zaehler1}" statt "3 of 8"`);

  // "Show 3 more" muss DREI ANDERE zeigen
  await p.click('#fdMore');
  await p.waitForTimeout(800);
  const zweiteDrei = await reihe();
  if (zweiteDrei.length !== 3) fail('N', `Nach "Show 3 more" stehen ${zweiteDrei.length} statt 3 Gerichte da`);
  if (zweiteDrei.some(t => ersteDrei.includes(t)))
    fail('N', `"Show 3 more" zeigt dieselben Gerichte noch einmal: ${JSON.stringify(zweiteDrei)}`);
  // ...und das Weitergeblaetterte muss gemerkt sein (geraeteuebergreifend).
  const gemerkt = await p.evaluate(async () => {
    const S2 = await import('./js/rezept/store.js');
    return ((S2.state.index.feed || {}).seen || []).length;
  });
  if (gemerkt !== 3) fail('N', `Nach dem Weiterblaettern sind ${gemerkt} statt 3 Vorschlaege als gesehen gemerkt`);

  // Filter nach Art
  await p.click('.fd-tags .tag-chip:has-text("No meat")');
  await p.waitForTimeout(600);
  const veggie = await reihe();
  if (!veggie.length) fail('N', 'Der Filter "No meat" zeigt gar nichts mehr');
  if (veggie.some(t => /Bolognese|Gulasch|Handi|Lachs/.test(t)))
    fail('N', `Der Filter "No meat" laesst Fleisch/Fisch durch: ${JSON.stringify(veggie)}`);
  // Filter nach Quelle zusaetzlich
  await p.click('.fd-tags .tag-chip:has-text("Kitchen Blog")');
  await p.waitForTimeout(600);
  const gefiltert = await p.evaluate(() => [...document.querySelectorAll('.fd-card')].map(c => ({
    titel: (c.querySelector('.fd-title') || {}).textContent || '',
    quelle: (c.querySelector('.fd-src') || {}).textContent || '',
  })));
  if (gefiltert.some(x => x.quelle !== 'Kitchen Blog'))
    fail('N', `Der Quellen-Filter greift nicht: ${JSON.stringify(gefiltert)}`);
  await p.evaluate(() => { window.rezFeedSource(-1); window.rezFeedTheme(''); });
  await p.waitForTimeout(500);

  // "Add as recipe" muss ein FERTIG AUSGEFUELLTES Formular ergeben.
  // ⚠ Regressionstest: die erste Fassung schloss das Fenster NACH dem Bauen
  // des Formulars - rezCloseModal() raeumt den Formularzustand ab, und
  // renderForm() stieg mit "Cannot read properties of null" aus. Fuer den
  // Nutzer sah das aus wie ein Knopf, der nichts tut.
  await p.click('.fd-card .btn-primary');
  await p.waitForTimeout(1600);
  const uebernommen = await p.evaluate(() => ({
    formular: !!document.getElementById('rfTitle'),
    titel: (document.getElementById('rfTitle') || {}).value || '',
    zutaten: document.querySelectorAll('#rfIng .rf-line').length,
    schritte: ((document.querySelector('#rfBlocks textarea') || {}).value || '').split('\n').filter(Boolean).length,
    bild: !!document.querySelector('.rf-drop img'),
  }));
  if (!uebernommen.formular) fail('N', '"Add as recipe" oeffnet kein Formular');
  if (!uebernommen.titel) fail('N', '"Add as recipe" uebernimmt den Titel nicht');
  if (uebernommen.zutaten < 2) fail('N', `"Add as recipe" uebernimmt ${uebernommen.zutaten} statt 2 Zutaten`);
  if (uebernommen.schritte < 2) fail('N', `"Add as recipe" uebernimmt ${uebernommen.schritte} statt 2 Schritte`);
  // ⚠ Das Bild liegt auf einem fremden Server (hier bewusst blockiert). Ohne
  // Titelbild verweigert das Speichern - es MUSS also ein erzeugtes
  // entstehen, sonst haengt der Nutzer fest.
  if (!uebernommen.bild) fail('N', 'Ohne erreichbares Bild entsteht kein erzeugtes Titelbild - das Rezept liesse sich nicht speichern');
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(400);

  // "Save idea" legt eine Inspiration an
  await p.evaluate(() => window.rezShowPage('inspo'));
  await p.waitForTimeout(700);
  const ideenVorher = await p.evaluate(async () => (await import('./js/rezept/store.js')).state.index.inspo.length);
  await p.click('.fd-card .fd-btns .btn:not(.btn-primary)');
  await p.waitForTimeout(1200);
  const ideenNachher = await p.evaluate(async () => (await import('./js/rezept/store.js')).state.index.inspo.length);
  if (ideenNachher !== ideenVorher + 1) fail('N', '"Save idea" legt keine Idee an');

  // Detailfenster eines Vorschlags
  await p.click('.fd-card');
  await p.waitForTimeout(900);
  const detail = await p.evaluate(() => ({
    offen: !!document.querySelector('.rd-title'),
    zutaten: document.querySelectorAll('.rd-ing li').length,
    schritte: document.querySelectorAll('.rd-block p').length,
  }));
  if (!detail.offen) fail('N', 'Ein Vorschlag laesst sich nicht oeffnen');
  if (detail.zutaten < 2 || detail.schritte < 2) fail('N', 'Im Vorschlags-Fenster fehlen Zutaten oder Schritte');
  await p.evaluate(() => window.rezCloseModal());
  await p.waitForTimeout(400);

  // Jeder Handler im Vorschlags-Bereich muss auf eine echte Funktion zeigen
  const totN = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.fd-wrap [onclick],.fd-wrap [onkeydown],.fd-wrap [onerror]').forEach(el => {
      ['onclick', 'onkeydown', 'onerror'].forEach(a => {
        const v = el.getAttribute(a);
        if (!v) return;
        for (const m of v.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
          const n = m[2];
          if (['if', 'for', 'while', 'return', 'typeof', 'closest', 'add'].includes(n)) continue;
          if (typeof window[n] !== 'function') out.push(a + ' -> ' + n);
        }
      });
    });
    return [...new Set(out)];
  });
  totN.forEach(x => fail('N', 'Handler im Vorschlags-Bereich zeigt auf keine Funktion: ' + x));

  // N5: fehlt die Datei, darf die Kategorie NICHT kaputtgehen
  await p.unroute(/rezept_feed\.json/);
  await p.route(/rezept_feed\.json/, r => r.fulfill({ status: 404, body: 'weg' }));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.rezShowPage('inspo'));
  await p.waitForTimeout(1000);
  const ohneDatei = await p.evaluate(() => ({
    hinweis: !!document.querySelector('.fd-note'),
    ideenDa: !!document.querySelector('#pgInspo .rez-grid'),
    text: (document.querySelector('.fd-note') || {}).textContent || '',
  }));
  if (!ohneDatei.hinweis) fail('N', 'Ohne Vorschlags-Datei fehlt jeder Hinweis - der Bereich ist einfach leer');
  if (!ohneDatei.ideenDa) fail('N', 'Ohne Vorschlags-Datei verschwinden auch die eigenen Ideen');
  await p.unroute(/rezept_feed\.json/);

  if (jsFehler.length) [...new Set(jsFehler)].slice(0, 8).forEach(e => fail('JS', e.slice(0, 200)));

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (F.length) {
    console.error('REZEPT-WAECHTER NICHT BESTANDEN:\n');
    F.forEach(x => console.error('  ' + x));
    process.exit(1);
  }
  console.log(`[rezept] ok (${themeAnzahl} Themes, Handler/Buttons/Ablauf/Nachfrage/Kontrast/Kategorien/Merge/Bewegung/Kochmodus/Bilder/Titelbild/Vorschlaege)`);
})().catch(e => {
  // ⚠ Bei einem Absturz AUCH die bis dahin gesammelten Befunde ausgeben.
  // Ohne das sieht man nur "Timeout" und raet, was vorher schon schieflief -
  // genau das hat beim Kochmodus-Umbau eine Viertelstunde gekostet.
  console.error('REZEPT-WAECHTER abgestuerzt: ' + e.message);
  if (F.length) { console.error('\nBis dahin gefunden:'); F.forEach(x => console.error('  ' + x)); }
  process.exit(1);
});
