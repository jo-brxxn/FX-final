// ── KARTENTITEL EINHEITLICH, ⓘ BLAU UND KLEINER, NOTIZEN IN BIAS-FARBE ────
//
// Nutzer 2026-09-24: "die Makrokarten haben groessere Ueberschriften als die
// anderen Karten, mach das einheitlich, treff dich in der Groesse ca. in der
// Mitte und die kleinen Info i sollen leicht kleiner als die Schrift daneben
// sein und blau"; "bei Pinned notes die Notizen sollen mehr in der
// Bias-Farbe eingefaerbt sein und die Ueberschrift groesser".
// Vorher gemessen: Kartentitel 22/17/15/13px je nach Karte; ⓘ grau 18px
// (groesser als der Titel daneben) neben blau 13px; Notizen grau mit 3px-Strich.
// Geprueft (Dashboard, Asset EUR, jede Seite):
//   A) jeder sichtbare Kartentitel hat --fs-kt (17px);
//   B) jedes ⓘ im Kartenkopf ist blau und schmaler als die Titelschrift;
//   C) eine angepinnte bullishe Notiz ist blau getoent, ihr Titel >= 15px.
//   node check/kartentitel.js [--gegenprobe]  (alte Werte per CSS -> rot)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);
const TITEL = '.rub-inp,.nc-inp,.pcc-name,.rub-name-static,.ab-tile-t,.cot-card-title,.dw-t-txt,.abc-mon,.wt-name,.rg-name,.mx-card-title,.data-h,.data-pt';
const KOPF = '.ab-tile-hd,.rub-hdr,.cot-card-title,.dw-t,.abc-hd';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' })).newPage();
  await p.addInitScript(gp => { try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {}
    if (gp) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.rub-inp{font-size:22px!important}.info-b{color:#515c74!important;width:18px!important}.ab-nt{background:var(--bg2)!important}.ab-nt-ti{font-size:10px!important}'; document.head.appendChild(st); }); }, GEGENPROBE);
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { const e = document.getElementById('lockScreen'); if (e) e.remove(); });
  const mess = (seite) => p.evaluate(({ seite, TITEL, KOPF }) => {
    const soll = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-kt')) || 17;
    const blau = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim();
    const probe = document.createElement('i'); probe.style.color = blau; document.body.appendChild(probe); const blauRgb = getComputedStyle(probe).color; probe.remove();
    const out = [];
    document.querySelectorAll(TITEL).forEach(e => { if (!e.offsetParent || !e.getBoundingClientRect().height) return; const fs = parseFloat(getComputedStyle(e).fontSize);
      if (Math.abs(fs - soll) > 0.1) out.push(['TITELGROESSE', `${seite}: .${e.className.split(' ')[0]} "${(e.value || e.textContent).trim().slice(0, 24)}" ${fs}px statt ${soll}px`]); });
    document.querySelectorAll('.info-b,.rinfo').forEach(i => { const k = i.closest(KOPF); if (!k || !i.offsetParent) return; const cs = getComputedStyle(i), vor = getComputedStyle(i, '::before'), w = (vor.content !== 'none' && vor.position === 'absolute') ? parseFloat(vor.width) : i.getBoundingClientRect().width; // sichtbarer Kreis (::before), nicht die 23px-Trefferflaeche
      if (cs.color !== blauRgb) out.push(['INFO-I NICHT BLAU', `${seite}: in .${k.className.split(' ')[0]} ${cs.color}`]);
      if (w >= soll) out.push(['INFO-I ZU GROSS', `${seite}: in .${k.className.split(' ')[0]} ${Math.round(w)}px, Titel ${soll}px`]); });
    return out;
  }, { seite, TITEL, KOPF });
  const alle = [];
  alle.push(...await mess('dashboard'));
  await p.evaluate(() => { gotoSym('EUR'); const t = new Date().toISOString();
    research.notes.push({ id: 'kt-probe', fids: [], title: 'Probe', body: 'x', tags: [], fav: false, pin: true, arch: false, hl: false, ord: -99, ts: t, up: t, bias: 'bull', asset: 'EUR' }); rerenderNotesHost(); });
  await p.waitForTimeout(1000);
  alle.push(...await mess('EUR'));
  // C)
  const n = await p.evaluate(() => { const z = document.querySelector('#detail .ab-nt'); if (!z) return null;
    const roh = getComputedStyle(z).backgroundColor, bg = roh.match(/[\d.]+/g).map(Number).map(v => /^color\(/.test(roh) ? v * 255 : v), ti = z.querySelector('.ab-nt-ti');
    return { bg, ti: ti ? parseFloat(getComputedStyle(ti).fontSize) : 0 }; });
  if (!n) fail('NOTIZ FEHLT', 'keine angepinnte Notiz auf EUR nach dem Anlegen');
  else {
    const [r, g, bl] = n.bg; if (!(bl - r >= 12)) fail('NOTIZ NICHT IN BIAS-FARBE', `bullishe Notiz hat Hintergrund rgb(${n.bg.slice(0, 3).map(Math.round).join(',')}) - kein Blauton`);
    if (n.ti < 15) fail('NOTIZ-TITEL ZU KLEIN', `${n.ti}px (soll >= 15px)`);
  }
  for (const t of Object.keys(await p.evaluate(() => PAGE_IDS)).filter(t => t !== 'dash' && t !== 'cur')) { await p.evaluate(t => showTab(t), t); await p.waitForTimeout(700); alle.push(...await mess(t)); }
  const gesehen = new Set(); alle.forEach(([a, x]) => { const k = a + x.replace(/^[^:]*:/, ''); if (!gesehen.has(k)) { gesehen.add(k); fail(a, x); } });
  perr.forEach(e => fail('JS-FEHLER', e));
  await b.close();
  const name = 'kartentitel';
  if (GEGENPROBE) { if (F.length) { console.log(`${name} --gegenprobe: ok (rot wie erwartet, ${F.length} Befund(e))`); process.exit(0); } console.log(`${name} --gegenprobe: FEHLER - Waechter bleibt gruen`); process.exit(1); }
  if (F.length) { console.log(`${name}: ${F.length} Befund(e)`); F.slice(0, 25).forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log(`${name}: ok (Kartentitel einheitlich ${'17'}px, Info-i blau und kleiner, Notizen in Bias-Farbe)`);
})().catch(e => { console.log('kartentitel: ABBRUCH ' + e.message); process.exit(1); });
