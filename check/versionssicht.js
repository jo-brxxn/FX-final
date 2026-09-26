// ══ WAECHTER: VERSIONSNUMMER IM KOPF VOLL SICHTBAR (Tablet/PC) ═══════════
// Nutzer 2026-09-26 (iPad-Foto, "VERSION-CHECK-5" abgeschnitten): "Mach die
// search Leiste kleiner damit ich den Version Check sehe". Ursache: das
// Suchfeld stand fest auf 380px (eine spaetere Regel ueberschrieb die 260px
// der Mittelbreite), der Status-Cluster wurde abgeschnitten - gemessen 1194px:
// braucht 354, bekam 351; 1024px: 269 gegen 181.
// Geprueft ab 1000px: Status nicht abgeschnitten, Kopfzeile ohne Ueberlauf.
// Gegenprobe: --gegenprobe setzt das Suchfeld wieder hart auf 380px -> rot.
const PW = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { wartenBisDatenDa } = require('./warten.js');
(async () => {
  const b = await PW.chromium.launch(); let f = 0;
  for (const w of [1024, 1180, 1194, 1366]) {
    const p = await b.newPage({ viewport: { width: w, height: 834 } });
    await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
    await p.goto(URL); await wartenBisDatenDa(p);
    if (process.argv.includes('--gegenprobe')) await p.addStyleTag({ content: '.hdr-search{flex:0 0 380px!important}.hdr-status{flex:1 1 0!important}' });
    const r = await p.evaluate(() => {
      const st = document.querySelector('.hdr-status'), n = document.getElementById('hlbName'), h = document.querySelector('.hdr');
      const nr = n.getBoundingClientRect(), sr = st.getBoundingClientRect();
      return { st: st.scrollWidth - st.clientWidth, drin: nr.right <= sr.right + 1 && nr.width > 0, hdr: h.scrollWidth - h.clientWidth, txt: n.textContent };
    });
    if (r.st > 1 || !r.drin || r.hdr > 1) { f++; console.log(`  ✗ ${w}px: Status ${r.st}px abgeschnitten, Version sichtbar=${r.drin}, Kopf-Ueberlauf ${r.hdr}px`); }
    else console.log(`  ✓ ${w}px: "${r.txt}" voll sichtbar, kein Ueberlauf`);
    await p.close();
  }
  await b.close();
  console.log(f ? `[versionssicht] ${f} Fehler` : '[versionssicht] ok'); process.exit(f ? 1 : 0);
})();
