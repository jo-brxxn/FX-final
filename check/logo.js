// ── FX-LOGO: LADEBILDSCHIRM + LEERE KARTENFLAECHE, INTRO WEG ──────────
//
// Nutzer 2026-09-24: animiertes FX-Logo (per Rueckfrage "Kerzen wachsen")
// als Ladesymbol beim Oeffnen, danach langsam ausblenden; in leeren bzw.
// sehr leeren Karten unten mittig, Groesse nach freier Flaeche ("wenn man
// einen Chart bei einem Indikator ausklappt und daneben die Karten die
// Groesse annehmen"); Cockpit-Intro, Gleiter und Einstellungen komplett weg.
// Geprueft:
//   A) kein #introOv, kein Intro-Schalter, kein Gleiter-Feld;
//   B) Ladebildschirm steht mit Logo und vier Kerzen, blendet aus, sobald
//      die Feeds da sind (spaetestens 12 s + Ausblenden) und ist dann weg;
//   C) leere "Pinned notes" (USD): Logo sichtbar, unten mittig, innerhalb
//      der Karte, UEBER dem Fuss und UNTER dem letzten Inhalt (verdeckt
//      nichts); eine Karte ohne freie Flaeche (Price) hat keins;
//   D) Indikator-Chart aufgeklappt -> Nachbarkarte bekommt ein Logo.
//   E) (Nutzer 2026-09-24 "mach die Platzhalter nicht animiert, nur wenn
//      etwas laedt ... beim Erscheinen wenn sich was ausklappt koennen die
//      animiert sein aber danach nicht mehr"; "die Anfangsanimation ... sehr
//      abgehakt"): Platzhalter nach dem Laden ohne laufende Animation; das
//      nach dem Aufklappen neu erschienene waechst genau einmal (endlich);
//      die Kerzen des Ladebildschirms sind HTML-Ebenen mit transform-
//      Animation (Grafikprozessor) statt SVG-Kinder (Hauptthread - stand
//      beim Laden in jeder Pause still).
//   node check/logo.js [--gegenprobe]   (Logo per CSS versteckt -> muss rot werden)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  // B) Ladebildschirm (eigener Kontext, mit __ladeTest)
  {
    const p = await (await b.newContext({ viewport: { width: 1000, height: 695 }, serviceWorkers: 'block' })).newPage();
    await p.addInitScript(() => { window.__ladeTest = true; });
    p.goto(URL).catch(() => {});
    let da = null;
    try { await p.waitForSelector('#ladeOv .fxlogo', { timeout: 10000 }); da = await p.evaluate(() => ({ kerzen: document.querySelectorAll('#ladeOv .lg-k').length, ebenen: [...document.querySelectorAll('#ladeOv .lg-k')].every(k => k.tagName === 'DIV' && getComputedStyle(k).animationName === 'lgKerze' && !k.ownerSVGElement), filter: getComputedStyle(document.querySelector('#ladeOv .lade-logo')).filter, voll: (() => { const r = document.getElementById('ladeOv').getBoundingClientRect(); return r.width >= innerWidth && r.height >= innerHeight; })() })); } catch (e) {}
    if (!da) fail('LADEBILDSCHIRM FEHLT', 'kein #ladeOv mit Logo beim Oeffnen');
    else {
      if (da.kerzen !== 4) fail('LADE-LOGO', `${da.kerzen} Kerzen statt 4`);
      if (!da.ebenen) fail('LADE-KERZEN AUF DEM HAUPTTHREAD', 'die Kerzen sind keine HTML-Ebenen mit lgKerze - SVG-Kinder-Animationen standen beim Laden in jeder Pause des Hauptthreads still ("sehr abgehakt", 2026-09-24)');
      if (da.filter !== 'none') fail('LADE-LOGO MIT FILTER', `filter ${da.filter} am Logo wird in jedem Bild neu gerechnet`);
      if (!da.voll) fail('LADEBILDSCHIRM', 'deckt den Bildschirm nicht');
      const weg = await p.waitForFunction(() => !document.getElementById('ladeOv'), null, { timeout: 16000 }).then(() => true).catch(() => false);
      if (!weg) fail('LADEBILDSCHIRM BLEIBT', 'nach 16 s noch da - er soll ausblenden, sobald die Daten da sind (spaetestens 12 s)');
    }
    await p.context().close();
  }
  const ctx = await b.newContext({ viewport: { width: 1000, height: 695 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(gp => { try { localStorage.setItem('fxpro_help_seen', '1'); } catch (e) {}
    if (gp) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.lg-frei{display:none!important}'; document.head.appendChild(st); }); }, GEGENPROBE);
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  // A)
  const a = await p.evaluate(() => ({ intro: !!document.getElementById('introOv'), schalter: !!document.getElementById('introAnimToggleBtn'), gleiter: !!document.getElementById('cloudPilotName'), boost: !!document.getElementById('mIntroBoost'), lade: !!document.getElementById('ladeOv') }));
  if (a.intro || a.schalter || a.gleiter || a.boost) fail('INTRO NICHT WEG', JSON.stringify(a));
  if (a.lade) fail('LADEBILDSCHIRM IN PRUEFSKRIPTEN', 'unter webdriver soll er sofort weg sein (faengt sonst Klicks ab)');
  // C)
  await p.evaluate(() => { const e = document.getElementById('lockScreen'); if (e) e.remove(); gotoSym('USD'); });
  await p.waitForTimeout(700);
  const c = await p.evaluate(() => {
    const karte = [...document.querySelectorAll('#detail .ab-ntile')].find(k => /Pinned notes/.test(k.textContent));
    const preis = document.querySelector('#detail .ab-ptile');
    if (!karte) return null;
    const lg = karte.querySelector(':scope > .lg-frei');
    const sichtbar = lg && getComputedStyle(lg).display !== 'none' && lg.getBoundingClientRect().height > 20;
    const kr = karte.getBoundingClientRect(), r = lg ? lg.getBoundingClientRect() : null, fuss = karte.querySelector(':scope > .ab-goto');
    // letzter Inhalt ueber dem Logo
    let inhalt = kr.top; karte.querySelectorAll('*').forEach(e => { if (e.ownerSVGElement || e.closest('.lg-frei') || (fuss && fuss.contains(e)) || e.children.length || !e.textContent.trim()) return; const b = e.getBoundingClientRect(); if (b.height) inhalt = Math.max(inhalt, b.bottom); });
    return { leer: /Nothing pinned/.test(karte.textContent), sichtbar, r: r && [r.left, r.top, r.right, r.bottom].map(Math.round), kr: [kr.left, kr.top, kr.right, kr.bottom].map(Math.round),
      fussTop: fuss ? Math.round(fuss.getBoundingClientRect().top) : null, inhalt: Math.round(inhalt), mitte: r ? Math.round((r.left + r.right) / 2 - (kr.left + kr.right) / 2) : null,
      preisLogo: !!(preis && preis.querySelector(':scope > .lg-frei')), laeuft: lg ? lg.getAnimations({ subtree: true }).filter(an => an.playState === 'running').length : 0 };
  });
  if (!c) fail('KARTE FEHLT', 'keine "Pinned notes"-Karte auf USD');
  else if (!c.leer) fail('VORAUSSETZUNG', '"Pinned notes" auf USD ist nicht leer - Pruefung braucht die leere Karte');
  else {
    if (!c.sichtbar) fail('LOGO FEHLT IN LEERER KARTE', `"Pinned notes" ohne Eintrag zeigt kein Logo (Karte ${c.kr.join(',')})`);
    else {
      if (c.r[1] < c.inhalt) fail('LOGO UEBERDECKT INHALT', `Logo-Oberkante ${c.r[1]} liegt ueber dem letzten Inhalt ${c.inhalt}`);
      if (c.fussTop !== null && c.r[3] > c.fussTop) fail('LOGO UEBER DEM FUSS', `Logo-Unterkante ${c.r[3]} unter der "Go to"-Zeile ${c.fussTop}`);
      if (Math.abs(c.mitte) > 2) fail('LOGO NICHT MITTIG', `${c.mitte} px neben der Kartenmitte`);
      if (c.fussTop !== null && c.fussTop - c.r[3] > 40) fail('LOGO NICHT UNTEN', `${c.fussTop - c.r[3]} px Luft bis zum Fuss - verlangt "unten mittig"`);
    }
    if (c.preisLogo) fail('LOGO OHNE FREIRAUM', 'die volle Price-Karte traegt ein Logo');
    if (c.laeuft) fail('PLATZHALTER ANIMIERT', `${c.laeuft} laufende Animation(en) im Platzhalter der leeren Karte nach dem Laden - verlangt: still, animiert nur beim Laden (2026-09-24)`);
  }
  // D)
  const d = await p.evaluate(async () => {
    const zaehl = () => [...document.querySelectorAll('#detail .rub-card')].filter(k => k.querySelector(':scope > .lg-frei') && getComputedStyle(k.querySelector(':scope > .lg-frei')).display !== 'none').length;
    const vor = zaehl(), alt = new Set([...document.querySelectorAll('#detail .lg-frei')]);
    const z = document.querySelector('#detail .rub-card [onclick*="toggleIndDetailRow"]'); if (!z) return null; z.click();
    await new Promise(r => setTimeout(r, 400));
    const neu = [...document.querySelectorAll('#detail .rub-card > .lg-frei')].filter(l => !alt.has(l));
    const einmal = neu.every(l => l.querySelector('.fxlogo.lg-einmal') && l.getAnimations({ subtree: true }).every(an => !an.effect || an.effect.getComputedTiming().iterations !== Infinity));
    return { vor, nach: zaehl(), neu: neu.length, einmal };
  });
  if (!d) fail('INDIKATOR-ZEILE FEHLT', 'keine aufklappbare Indikator-Zeile');
  else if (d.neu && !d.einmal) fail('AUFKLAPP-LOGO NICHT EINMALIG', 'das nach dem Aufklappen erschienene Logo soll genau einmal hineinwachsen (lg-einmal, endlich), nicht dauerhaft laufen');
  else if (d.nach <= d.vor) fail('KEIN LOGO NACH AUFKLAPPEN', `Rubrik-Karten mit Logo vorher ${d.vor}, nach dem Aufklappen eines Charts ${d.nach} - die gestreckten Nachbarkarten sollen eins bekommen`);
  perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('LOGO FEHLT IN LEERER KARTE'));
    console.log(ok ? 'logo --gegenprobe: ok (verstecktes Logo wird gemeldet)' : 'logo --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`logo: ${F.length} Befund(e)\n  ` + F.join('\n  ')); process.exit(1); }
  console.log('logo: ok (Intro weg, Ladebildschirm mit 4 Kerzen blendet aus, leere Karte mit Logo unten mittig ohne Ueberdeckung, Nachbarkarten nach Aufklappen mit Logo)');
})();
