// ══ WAECHTER: ✕ NEBEN ASSET-FILTERN ═════════════════════════════════════════
//
// Nutzer 2026-10-03: "bei den Filtern mit drop-down wo man dann das Asset
// oder so auswaehlt und es dort aber eine Ansicht gibt mit allen Symbolen das
// es neben dem Filter einen Button gibt um den Filter zurueckzusetzen also
// zurueck auf alle Symbole kommt" - per Rueckfrage: "✕" nur bei aktivem Filter.
//
// Geprueft je Filter (Trends, Calendar, News, Sentiment/Retail, COT,
// Sentiment/Put-Call) mit ECHTEN Eingaben (selectOption + click):
//   A) "alle" gewaehlt -> kein ✕ zu sehen;
//   B) ein Asset gewaehlt -> genau ein ✕, direkt rechts neben dem Dropdown,
//      in derselben Zeile und Hoehe;
//   C) Klick auf ✕ -> Dropdown steht wieder auf "alle", das ✕ ist weg.
// Neue Asset-Dropdowns mit "alle"-Ansicht gehoeren hier in FILTER.
//   node check/filterreset.js [--gegenprobe]   (✕ per CSS versteckt -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

// name, Seite oeffnen, Selektor des Dropdowns, Wert fuer "alle"
const FILTER = [
  ['Trends', "showTab('trends')", '#trendsCcySel', 'ALL'],
  ['Calendar', "showTab('cal')", '#calCcySel', 'ALL'],
  ['News', "showTab('news')", 'select[onchange^="setNewsTabAsset"]', 'ALL'],
  ['Sentiment Retail', "showTab('sent');setSentSub('retail')", 'select[onchange^="setSentSym"]', ''],
  ['COT', "showTab('cot')", 'select[onchange^="pickCotFilter"]', ''],
  ['Put/Call', "showTab('sent');setSentSub('putcall')", 'select[onchange^="setPcAsset"]', ''],
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  if (GEGENPROBE) await p.addStyleTag({ content: '.flt-x{display:none!important}' });
  const xZustand = sel => p.evaluate(sel => {
    const s = document.querySelector(sel); if (!s) return { fehlt: true };
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const bar = s.parentElement;
    const xs = [...bar.querySelectorAll('.flt-x')].filter(vis);
    const sr = s.getBoundingClientRect();
    return { wert: s.value, anzahl: xs.length, lage: xs[0] ? (() => { const r = xs[0].getBoundingClientRect(); return { abstand: Math.round(r.left - sr.right), dy: Math.round(Math.abs((r.top + r.bottom) / 2 - (sr.top + sr.bottom) / 2)), dh: Math.round(Math.abs(r.height - sr.height)) }; })() : null };
  }, sel);
  let geprueft = 0;
  for (const [name, oeffnen, sel, alle] of FILTER) {
    await p.evaluate(c => { (0, eval)(c); }, oeffnen);
    await p.waitForTimeout(700);
    // Ausgangslage "alle" herstellen (Calendar ist gespeichert)
    await p.evaluate(([sel, alle]) => { const s = document.querySelector(sel); if (s && s.value !== alle) { s.value = alle; s.dispatchEvent(new Event('change', { bubbles: true })); } }, [sel, alle]);
    await p.waitForTimeout(300);
    const a = await xZustand(sel);
    if (a.fehlt) { fail(name, `Dropdown ${sel} nicht gefunden`); continue; }
    if (a.anzahl) fail(`${name} A`, `✕ sichtbar, obwohl "alle" gewaehlt ist`);
    // ein Asset waehlen: erste echte Option
    const wahl = await p.evaluate(([sel, alle]) => { const o = [...document.querySelector(sel).options].find(o => o.value && o.value !== alle && o.value !== 'FX'); return o ? o.value : null; }, [sel, alle]);
    if (!wahl) { fail(name, 'keine Asset-Option im Dropdown'); continue; }
    await p.selectOption(sel, wahl);
    await p.waitForTimeout(500);
    const bz = await xZustand(sel);
    if (bz.anzahl !== 1) { fail(`${name} B`, `${bz.anzahl} sichtbare ✕ nach Wahl von ${wahl} (soll 1)`); continue; }
    if (bz.lage.abstand < 0 || bz.lage.abstand > 16) fail(`${name} B`, `✕ ${bz.lage.abstand}px vom Dropdown (soll direkt rechts daneben, 0-16px)`);
    if (bz.lage.dy > 4 || bz.lage.dh > 4) fail(`${name} B`, `✕ nicht in Zeile/Hoehe des Dropdowns (dy ${bz.lage.dy}px, Hoehe ±${bz.lage.dh}px)`);
    await p.locator(sel).locator('xpath=..').locator('.flt-x:visible').first().click();
    await p.waitForTimeout(500);
    const c = await xZustand(sel);
    if (c.wert !== alle) fail(`${name} C`, `nach ✕ steht das Dropdown auf "${c.wert}" statt "alle"`);
    if (c.anzahl) fail(`${name} C`, `✕ nach dem Zuruecksetzen noch sichtbar`);
    geprueft++;
  }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { console.log(F.length ? `filterreset --gegenprobe: ok (rot wie erwartet: ${F.length} Befund(e))` : 'filterreset --gegenprobe: FEHLER - nicht gemeldet'); process.exit(F.length ? 0 : 1); }
  if (F.length) { console.log(`filterreset: ${F.length} Befund(e)`); F.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`filterreset: ok (${geprueft} Asset-Filter: ✕ nur bei Auswahl, direkt daneben, setzt auf "alle" zurueck)`);
})().catch(e => { console.log('filterreset: ABBRUCH ' + e.message); process.exit(1); });
