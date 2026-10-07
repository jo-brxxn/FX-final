// ── ASSET- UND PAARNAMEN WERDEN NIE GEKUERZT ─────────────────────────────
// Nutzer 2026-10-06 (iPad): "Bei set ups sind teilweise Asset Namen
// abgekuerzt das darf nicht passieren" - per Rueckfrage: Namen endeten mit
// "…" ("GBP/C…"). In der Test-Umgebung trat das nie auf: das iPad rendert
// mit SF Pro (-apple-system), hier greift eine schmalere Arial-Ersatzschrift.
// Nachgestellt mit einer BREITEREN Schrift (DejaVu Sans): 1180x820 fiel die
// Set-ups-Namensspalte auf ihre feste Untergrenze 72px (68px Inhalt), 37 von
// 43 Namen gekuerzt; dieselbe Klasse in Performance Ranking und Correlation
// Check (.perf-name, feste 58px mit Ellipse).
//
// Geprueft wird deshalb ZWEIMAL - mit der normalen Schrift und mit der
// breiten Ersatzschrift als Stellvertreter fuer die iPad-Schrift -, auf allen
// Tabs, der Asset-Seite und einem Dashboard mit ALLEN Kartentypen, bei
// 1180x820, 820x1180, 1366x1024 und 390x844:
//   A) kein Element, dessen eigener Text einen Asset-/Paarnamen enthaelt, ist
//      per Ellipse/overflow gekuerzt (scrollWidth > clientWidth);
//   B) Set-ups: der Preis-Chip ragt nie in seine Nachbarzelle (er gibt Platz
//      ab, indem die Tagesveraenderung umbricht).
//   node check/namen.js [--gegenprobe]   (alte 72-px-Spalte mit Ellipse)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const BREIT = 'DejaVu Sans';
const GP_CSS = '.setups-col-rows{grid-template-columns:minmax(72px,1fr) minmax(0,auto) auto auto auto!important}' +
  '.setups-cols .sym-row .dw-pname{overflow:hidden!important;text-overflow:ellipsis!important}';

(async () => {
  const b = await chromium.launch();
  let geprueft = 0, breitDa = null;
  const laeufe = [[1180, 820, true], [820, 1180, true], [1366, 1024, true], [390, 844, true], [1180, 820, false]];
  for (const [w, h, breit] of laeufe) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: true });
    const p = await ctx.newPage();
    await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
    const perr = []; p.on('pageerror', e => perr.push(String(e)));
    await p.goto(URL); await wartenBisDatenDa(p);
    if (breit) await p.addStyleTag({ content: `:root{--ff-text:'FX Sym','${BREIT}',sans-serif!important}` });
    if (GEGENPROBE) await p.addStyleTag({ content: GP_CSS });
    if (breit && breitDa == null) breitDa = await p.evaluate(s => document.fonts.check(`700 17px "${s}"`), BREIT);
    const ort = `${w}x${h}${breit ? ' breite Schrift' : ''}`;
    const scan = async wo => p.evaluate(wo => {
      const namen = new Set(); (syms || []).forEach(x => { namen.add(x.id); if (x.name) namen.add(x.name); }); (pairs || []).forEach(x => { if (x.name) namen.add(x.name); });
      const nm = [...namen].filter(n => n && n.length >= 3);
      const out = []; let n = 0;
      document.querySelectorAll('body *').forEach(e => {
        if (!e.offsetParent) return;
        const eigen = [...e.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join('').trim();
        if (!eigen || !nm.some(x => eigen.includes(x))) return;
        n++;
        const cs = getComputedStyle(e);
        if ((cs.textOverflow === 'ellipsis' || /hidden|clip/.test(cs.overflowX)) && e.scrollWidth > e.clientWidth + 1)
          out.push(`${wo}: ${e.className.toString().split(' ')[0] || e.tagName.toLowerCase()} "${eigen}" ${e.clientWidth}/${e.scrollWidth}px`);
      });
      return { out, n };
    }, wo);
    await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); });
    const tabs = await p.evaluate(() => TAB_ORDER.slice());
    for (const t of tabs) {
      await p.evaluate(t => { try { showTab(t); } catch (e) {} }, t); await p.waitForTimeout(350);
      const r = await scan('Tab ' + t); r.out.forEach(x => fail('NAME GEKUERZT ' + ort, x)); geprueft += r.n;
    }
    // B) Set-ups: Chip bleibt in seiner Zelle
    await p.evaluate(() => showTab('pairs')); await p.waitForTimeout(400);
    const chip = await p.evaluate(() => {
      let raus = 0, n = 0;
      document.querySelectorAll('#pgPairs .setups-cols .ticker-chip').forEach(c => {
        n++; const nb = c.nextElementSibling; if (!nb) return;
        const rg = document.createRange(); rg.selectNodeContents(c); const rechts = Math.max(c.getBoundingClientRect().right, rg.getBoundingClientRect().right);
        if (rechts > nb.getBoundingClientRect().left + 0.5) raus++;
      });
      return { raus, n };
    });
    if (chip.raus) fail('CHIP UEBER NACHBAR ' + ort, `${chip.raus} von ${chip.n} Preis-Chips in Set-ups ragen in die Δ-Zelle`);
    // Asset-Seite + Dashboard mit allen Kartentypen (nur im Test, nicht gespeichert)
    await p.evaluate(() => gotoSym('GOLD')); await p.waitForTimeout(800);
    let r = await scan('Asset GOLD'); r.out.forEach(x => fail('NAME GEKUERZT ' + ort, x)); geprueft += r.n;
    await p.evaluate(() => { const da = new Set(widgets.map(x => x.type)); W_TYPES.forEach((t, i) => { if (!da.has(t.type)) widgets.push({ id: 'namentest' + i, type: t.type, title: t.label, order: widgets.length, content: '' }); }); showTab('dash'); renderDash(); });
    await p.waitForTimeout(800);
    r = await scan('Dashboard alle Karten'); r.out.forEach(x => fail('NAME GEKUERZT ' + ort, x)); geprueft += r.n;
    perr.forEach(x => fail('JS-FEHLER ' + ort, x));
    await ctx.close();
  }
  await b.close();
  if (breitDa === false) fail('BREITE SCHRIFT FEHLT', `"${BREIT}" ist auf diesem Rechner nicht installiert - der Stellvertreter fuer die iPad-Schrift greift nicht`);
  if (geprueft < 500) fail('ZU WENIG GEMESSEN', `nur ${geprueft} Namensstellen gefunden`);
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('NAME GEKUERZT'));
    console.log(ok ? `namen --gegenprobe: ok (alte 72-px-Spalte wird gemeldet, ${F.length} Befunde)` : 'namen --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`namen: ${F.length} Befund(e)`); [...new Set(F)].slice(0, 30).forEach(x => console.log('  ' + x)); process.exit(1); }
  console.log(`namen: ok (${geprueft} Namensstellen auf allen Tabs, Asset-Seite und Dashboard mit allen Kartentypen, 4 Breiten mit breiter Ersatzschrift + 1180 normal: keiner gekuerzt, Set-ups-Chips bleiben in ihrer Zelle)`);
})().catch(e => { console.log('namen: ABBRUCH ' + e.message); process.exit(1); });
