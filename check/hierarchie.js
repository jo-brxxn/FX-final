// ── SCHRIFTHIERARCHIE AUF ALLEN SEITEN (Pflicht bei jeder Aenderung) ─────
//
// Nutzer 2026-09-26: "ueberpruef gleichzeitig ueberall auch nochmal die
// Schriften Hierarchien. Fueg das auch als Regel ein das die immer wenn man
// was hinzufuegt oder aendert ueberprueft werden soll und sie Pflicht ist."
// Gemessen vorher: Seitentitel 16px/700 auf 11 Seiten, darunter Kartentitel
// 17px - die Hierarchie war umgedreht; Trends 22px, Archive 26px; Matrix-
// Kartentitel 15px statt 17px. check/kartentitel.js hat das nicht gesehen,
// weil er eine FESTE Liste von Klassennamen prueft - jede neue Kartenart
// faellt dort still heraus. Dieser Waechter erkennt Karten an ihrer FORM
// (Schatten + Rundung), nicht am Namen.
// Stufen (docs/design-system.md "Schrifthierarchie"):
//   1. Seitentitel .pg-titel  = --fs-xl 24px / 800, genau einer je Seite
//   2. Kartentitel            = --fs-kt 17px / 700 (erster fetter Text oben
//                               in jeder Karte)
//   3. Text in der Karte      < Kartentitel (Median der Textzeilen)
//   Asset-Seite: Asset-Name (.atitle) > Kartentitel.
//   node check/hierarchie.js [--gegenprobe]  (Seitentitel 16px + ein
//   Kartentitel 15px wie vorher -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const SEITEN = ['regime', 'news', 'dash', 'mx', 'trends', 'cot', 'sent', 'seas', 'data', 'rate', 'carry', 'pairs', 'watch', 'cal', 'notes', 'A:EUR', 'A:GOLD'];
// Seiten mit eigenem Kopf statt Seitentitel: Dashboard (Kartenraster),
// Data (Kopf = Datenkarte, Nutzerwahl "Kompakt"), Asset-Seiten (.atitle).
const OHNE_SEITENTITEL = ['dash', 'data', 'A:EUR', 'A:GOLD'];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  if (GEGENPROBE) await p.addStyleTag({ content: '.pg-titel{font-size:16px!important;font-weight:700!important} .mx-card-title{font-size:15px!important}' });
  let n = { seiten: 0, karten: 0 };
  for (const z of SEITEN) {
    await p.evaluate(z => { if (z.startsWith('A:')) gotoSym(z.slice(2)); else showTab(z); if (z === 'data') { dataAssets.length = 0; ['USD', 'EUR'].forEach(x => dataAssets.push(x)); if (!dataIndBase) dataIndBase = 'CPI (Headline)'; renderDataTab(); } }, z);
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const fs = e => parseFloat(getComputedStyle(e).fontSize), fw = e => parseInt(getComputedStyle(e).fontWeight, 10);
      const wurzel = [...document.querySelectorAll('#pageArea .pc')].find(e => getComputedStyle(e).display !== 'none' && vis(e)) || document.getElementById('detail');
      const out = { titel: [], karten: [], atitle: null };
      wurzel.querySelectorAll('.pg-titel').forEach(t => { if (vis(t)) out.titel.push({ fs: fs(t), fw: fw(t), txt: t.textContent.trim().slice(0, 24) }); });
      const at = wurzel.querySelector('.atitle'); if (at && vis(at)) out.atitle = fs(at);
      // Karten an der FORM erkennen: Schatten + Rundung, mind. 160px breit,
      // keine Knoepfe/Eingaben, nicht in einer anderen Karte.
      const istKarte = e => { const cs = getComputedStyle(e); return cs.boxShadow !== 'none' && parseFloat(cs.borderTopLeftRadius) >= 8 && e.getBoundingClientRect().width >= 160 && !/^(BUTTON|INPUT|SELECT|A|LABEL)$/.test(e.tagName); };
      const alle = [...wurzel.querySelectorAll('div,section,article')].filter(e => vis(e) && istKarte(e));
      // Asset-Kopf (.ahead, Titel = Seitentitel der Asset-Seite) und Hinweis-
      // Banner (.cot-notify) sind keine Karten mit Titel.
      const karten = alle.filter(k => !alle.some(o => o !== k && o.contains(k)) && !k.matches('.ahead,.cot-notify') && !k.closest('.ahead'));
      karten.forEach(k => {
        const kr = k.getBoundingClientRect();
        const blaetter = [...k.querySelectorAll('*')].filter(e => vis(e) && [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim().length > 1) && !e.closest('button,select,option,svg,.rinfo,.info-b,.cmp-chip,.bbadge,.score-badge,.ab-tile-s,input,textarea'));
        if (!blaetter.length) return;
        // Kartentitel: erster fetter Text im oberen Bereich der Karte
        const oben = blaetter.filter(e => e.getBoundingClientRect().top - kr.top < 56).sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top || a.getBoundingClientRect().left - c.getBoundingClientRect().left);
        const t = oben.find(e => fw(e) >= 700);
        if (!t) return;
        // Karte ohne Titelzeile (reine Liste/Zahl oben): der erste fette Text
        // ist dann keine Ueberschrift - erkennbar daran, dass er kleiner ist
        // als der Text darunter oder eine Zahl ist.
        if (/^[−\-+]?[\d.,%]+$/.test(t.textContent.trim())) return;
        if (t.closest('[class*="notify"]')) return;   // Sync-Hinweis, keine Ueberschrift
        const rest = blaetter.filter(e => e !== t && !t.contains(e) && e.getBoundingClientRect().top > t.getBoundingClientRect().bottom - 2).map(fs).sort((a, c) => a - c);
        const median = rest.length ? rest[Math.floor(rest.length / 2)] : null;
        out.karten.push({ name: t.textContent.trim().replace(/\s+/g, ' ').slice(0, 28), cls: String(t.getAttribute('class') || t.parentElement.getAttribute('class') || '').slice(0, 24), fs: fs(t), fw: fw(t), median });
      });
      return out;
    });
    n.seiten++;
    if (!OHNE_SEITENTITEL.includes(z)) {
      if (r.titel.length !== 1) fail(z, `${r.titel.length} Seitentitel (.pg-titel) statt genau einem`);
      r.titel.forEach(t => { if (Math.abs(t.fs - 24) > .5 || t.fw < 800) fail(z + ' SEITENTITEL', `"${t.txt}" ${t.fs}px/${t.fw} statt 24px/800`); });
    }
    r.karten.forEach(k => {
      n.karten++;
      if (Math.abs(k.fs - 17) > .5 || k.fw !== 700) fail(z + ' KARTENTITEL', `"${k.name}" (${k.cls}) ${k.fs}px/${k.fw} statt 17px/700`);
      if (k.median != null && k.median >= k.fs) fail(z + ' TEXT >= TITEL', `"${k.name}": Text darunter ${k.median}px, Titel ${k.fs}px`);
      r.titel.forEach(t => { if (t.fs <= k.fs) fail(z + ' SEITE <= KARTE', `Seitentitel ${t.fs}px nicht groesser als Kartentitel "${k.name}" ${k.fs}px`); });
    });
    if (r.atitle != null && r.karten.some(k => k.fs >= r.atitle)) fail(z, `Asset-Name ${r.atitle}px nicht groesser als die Kartentitel`);
  }
  perr.forEach(x => fail('JS-FEHLER', x));
  await b.close();
  if (GEGENPROBE) { if (F.some(f => f.includes('SEITENTITEL')) && F.some(f => f.includes('KARTENTITEL'))) { console.log(`hierarchie --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log('hierarchie --gegenprobe: FEHLER - Waechter bleibt gruen'); process.exit(1); }
  if (F.length) { console.log(`hierarchie: ${F.length} Befund(e)`); F.slice(0, 50).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`hierarchie: ok (${n.seiten} Seiten, ${n.karten} Karten: Seitentitel 24px/800 > Kartentitel 17px > Text)`);
})().catch(e => { console.log('hierarchie: ABBRUCH ' + e.message); process.exit(1); });
