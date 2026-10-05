// ══ WAECHTER: DESIGN-REGELN AUS DEM DESIGN-AUDIT 2026-10-04 ══════════════
//
// Nutzer 2026-10-04: "Recherchier im Internet und mach dich schlau ueber
// Webseiten Designs und Dashboards ... Was sollte geaendert werden? ... Ich
// will am Ende ein Webseiten Design ohne Schwaechen haben". Per Rueckfrage
// gewaehlt (Runde 1) und mit "Funktionalitaet steht an oberster Stelle"
// umgesetzt (VERSION-CHECK-588, docs/design-system.md "Design-Audit
// 2026-10-04"). Jede Regel ist hier eine MESSUNG:
//   A) keine Farb-Emojis in Seiten und Fenstern; Zeichen wie ⚠ ↗ ↔ kommen aus
//      der eingebetteten Symbolschrift 'FX Sym' (sonst zeichnet Safari auf
//      dem iPad sie als bunte Emojis - font-variant-emoji ist dort aus)
//   B) keine Monospace-Schrift (eine Schrift, Ziffern per tabular-nums)
//   C) Diagramm-Schrift kommt in echter Groesse an: jeder SVG-Text >= 10,8 px
//      GERENDERT (font-size x Skalierung), bei 820 und 1180 px. Vorher
//      Trends 2,7-3,0 px (322 von 322), Put/Call & Co. bei 820 px 8-9,7 px
//   D) Mindestschrift 11 px fuer HTML-Text in Seiten und Fenstern; die
//      Leisten-Beschriftung bleibt dabei einzeilig ("Dashboar/d" gemessen)
//   E) drei Hoehen fuer Bedienelemente: S 28 / M 34 / L 40 px (vorher 21-38 px
//      in 17 Stufen)
//   F) Trefferflaechen (820/1180/1440): jede unsichtbar vergroesserte Flaeche
//      trifft an ihren Raendern den eigenen Knopf (wirkt, und ragt in keinen
//      Nachbarn), und KEIN Bedienelement verliert seine sichtbare Flaeche an
//      ein anderes (Klick-Stichproben per elementFromPoint)
//   G) "gewaehlt/aktiv" = --ui-act (Navy), nie das Bias-Blau
//   H) Rot nur bearish/Warnung: "heute", Jetzt-Linie, Impact HIGH, aktiver
//      Filter, ruhiges Leit-Regime und dessen Haken sind nicht rot
//   I) der Schalter im Asset-Kopf ist sichtbar beschriftet ("Summaries"),
//      das Wort schaltet mit, und der Tooltip sagt den WIRKLICHEN Zustand
//      (bis 2026-10-04 stand er verkehrt herum)
//   J) Touch (kein Hover, wie iPad): Bedienelemente, die erst per Hover
//      kraeftig werden, sind dort voll sichtbar (>= 0,6), deaktivierte
//      Knoepfe erkennbar (>= 0,4) - vorher Kalender-× 0,20, Undo/Redo 0,22
//   K) Runde 2/Paket B: Waehrungsstaerke ab Mittellinie je Vorzeichen,
//      Watchlist einzeilig + × nur beim Bearbeiten, Price-Karte max. 2
//      Bedienzeilen ohne Einzelknopf, Majors-Titel, ⓘ nie unter der
//      Knopfleiste, COT-/Retail-Balken <= 14 px
//   node check/designregeln.js [--gegenprobe]
//   (Gegenprobe: je Stufe ein eingebauter Fehler -> JEDE Stufe muss rot sein)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

const SEITEN = ['dash', 'A:USD', 'A:GOLD', 'A:EURUSD', 'over', 'regime', 'news', 'mx', 'trends', 'cot', 'sent:retail', 'sent:putcall',
  'sent:netflow', 'sent:feargreed', 'sent:aaii', 'seas', 'data', 'rate', 'carry', 'pairs', 'watch', 'cal', 'notes'];
// Gegenprobe: je Stufe ein Fehler, so wie er frueher im Code stand
const GP_CSS = [
  '.cot-card-title{font-family:monospace!important}',                 // B
  'svg.tr-svg{width:40%!important}',                                    // C
  ':root{--fs-2xs:10px!important}',                                     // D
  '#navSidebar{padding-left:7px!important;padding-right:7px!important}#navSidebar>.np{padding-left:2px!important;padding-right:2px!important}', // D Umbruch
  '.cmp-quick{height:23px!important}',                                  // E
  '.cmp-chip::after{inset:-30px!important}',                            // F
  ':root{--ui-act:#0B5FCC!important;--ui-act-rgb:11,95,204!important}', // G
  '.cal-imp.ih{color:var(--red)!important}',                            // H
  '.sw-lbl{display:none!important}',                                    // I
  '@media (hover:none){.cal-row-del{opacity:.2!important}}',             // J (Kalender-× auf Touch blass wie vor 590)
  '.rank-div>.rank-bar.neg,.rank-div>.mx-rank-bar.neg{left:50%!important;right:auto!important}', // K (negativ nach rechts)
  'body,body *{font-family:Arial,sans-serif!important}',                // A (Symbolschrift fehlt)
].join('\n');

const oeffne = (p, z) => p.evaluate(z => { const [a, v] = z.split(':'); if (a === 'A') gotoSym(v); else { showTab(a); if (v) setSentSub(v); } }, z);

(async () => {
  const b = await chromium.launch();
  const perr = [];
  const neueSeite = async vw => {
    const p = await b.newPage({ viewport: { width: vw, height: 3200 } });
    await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
    p.on('pageerror', e => perr.push(String(e)));
    await p.goto(URL); await wartenBisDatenDa(p);
    await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); });
    if (GEGENPROBE) await p.addStyleTag({ content: GP_CSS });
    return p;
  };

  // ════ 1180 px: alle Stufen ═════════════════════════════════════════════
  let p = await neueSeite(1180);
  const n = { emoji: 0, mono: 0, svg: 0, html: 0, hoehe: 0, flaechen: 0, elem: 0, kalNews: 0, touch: 0, k: 0 };
  for (const z of SEITEN) {
    await oeffne(p, z); await p.waitForTimeout(1300);
    if (GEGENPROBE && z === 'trends') await p.evaluate(() => { const t = document.querySelector('#pgTrends .pg-titel'); if (t) t.textContent += ' 📈'; });
    const r = await p.evaluate(() => {
      const out = { emoji: [], mono: [], svg: [], html: [], hoehe: [], symFont: [], n: { emoji: 0, mono: 0, svg: 0, html: 0, hoehe: 0 } };
      const NUTZER = '.hl-title,.hl-src,.hl-row,.news-item,.res-note,.rterm-note,.nc-body,.note-body,.hl-body,.ab-nt-t,.ab-nt-ti,.res-nbody,textarea,input';
      const sicht = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.02; };
      const pfad = e => { const k = []; let x = e; for (let i = 0; i < 2 && x; i++) { k.push(x.tagName.toLowerCase() + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/)[0] : '')); x = x.parentElement; } return k.join('<'); };
      const EMOJI = /\p{Emoji_Presentation}|️/u;
      const TEXTEMOJI = /[↔-↙↩↪▶◀⚠✔✖]/u;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
      while ((t = w.nextNode())) {
        const v = t.nodeValue; if (!v.trim()) continue;
        const e = t.parentElement; if (!e || e.closest('script,style,svg')) continue;
        if (!sicht(e)) continue;
        // A) Farb-Emoji in der Oberflaeche (Nutzerinhalte/News ausgenommen)
        if (EMOJI.test(v) && !e.closest(NUTZER)) out.emoji.push(`"${v.trim().slice(0, 30)}" @${pfad(e)}`);
        out.n.emoji++;
        // A) Text-Emoji-Zeichen muessen die Symbolschrift zuerst in der Liste haben
        if (TEXTEMOJI.test(v) && !/^\s*"?FX Sym"?/.test(getComputedStyle(e).fontFamily)) out.symFont.push(`"${v.trim().slice(0, 24)}" in ${getComputedStyle(e).fontFamily.slice(0, 30)} @${pfad(e)}`);
        // B) Monospace
        const ff = getComputedStyle(e).fontFamily; out.n.mono++;
        if (/monospace|Menlo|Consolas|SF Mono|SFMono|Courier/i.test(ff)) out.mono.push(`${pfad(e)} [${ff.slice(0, 30)}]`);
        // D) Mindestschrift (Symbol im ⓘ-Kreis und Logo ausgenommen)
        if (!e.closest('.rinfo,.info-b,.si-info-btn,.fxlogo')) { const px = parseFloat(getComputedStyle(e).fontSize); out.n.html++; if (px < 10.95) out.html.push(`${px}px "${v.trim().slice(0, 20)}" @${pfad(e)}`); }
      }
      // C) Diagramm-Schrift gerendert
      document.querySelectorAll('svg text').forEach(e => {
        if (!e.textContent.trim() || !sicht(e) || e.closest('.fxlogo')) return;
        const m = e.getScreenCTM(); if (!m) return; out.n.svg++;
        const eff = parseFloat(getComputedStyle(e).fontSize) * Math.hypot(m.a, m.b);
        if (eff < 10.8) { let s = e.ownerSVGElement; while (s.ownerSVGElement) s = s.ownerSVGElement; out.svg.push(`${eff.toFixed(1)}px "${e.textContent.trim().slice(0, 12)}" in ${(s.getAttribute('class') || (s.parentElement && s.parentElement.className) || '?').toString().split(' ')[0]}`); }
      });
      // E) drei Hoehen
      const STUFE = [[28, '.ind-hist-range-btn,.cmp-chip,.cmp-quick,.ab-rg,.hl-tab,.perf-win,.histp-rbtn,.histp-agebtn,.rg-ccy,.px-panel-chip,.btn.dw-nav,.note-dirbtn,select.px-panel-sel,select.res-sfield,select.dw-sel,select.bt-sel,.rterm-side-toggle'],
        [34, '.btn:not(.dw-nav):not(.ind-cmp-btn),select.btn,select.finp,select.fsel,input.finp,input.news-q,.st,.dmeta-hist-btn,.cot-refresh,.abc-nav,.ab-nt-qc'],
        [40, '.m-inp:not(textarea),.uc-btn,.search-inp-wrap']];
      STUFE.forEach(([h, sel]) => document.querySelectorAll(sel).forEach(e => { if (!sicht(e)) return; out.n.hoehe++; const ist = e.getBoundingClientRect().height; if (Math.abs(ist - h) > 0.6) out.hoehe.push(`${pfad(e)} ${ist.toFixed(1)}px statt ${h}`); }));
      return out;
    });
    r.emoji.forEach(x => fail('A EMOJI', `${z}: ${x}`)); r.symFont.forEach(x => fail('A SYMBOLSCHRIFT', `${z}: ${x}`));
    r.mono.forEach(x => fail('B MONOSPACE', `${z}: ${x}`)); r.svg.forEach(x => fail('C DIAGRAMMSCHRIFT 1180', `${z}: ${x}`));
    r.html.forEach(x => fail('D MINDESTSCHRIFT', `${z}: ${x}`)); r.hoehe.forEach(x => fail('E HOEHE', `${z}: ${x}`));
    Object.keys(r.n).forEach(k => n[k] += r.n[k]);
  }
  // A/D/E in den Fenstern (einzeln eingeblendet wie check/typo.js, nach der Oeffnungsanimation)
  const ids = await p.evaluate(() => [...document.querySelectorAll('.ov[id^="m"]')].map(e => e.id));
  let fenster = 0;
  for (const id of ids) {
    await p.evaluate(i => { document.getElementById(i).style.display = 'flex'; }, id); await p.waitForTimeout(450);
    const r = await p.evaluate(i => {
      const out = { emoji: [], html: [], hoehe: [] }; const w0 = document.getElementById(i);
      const sicht = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden'; };
      const w = document.createTreeWalker(w0, NodeFilter.SHOW_TEXT); let t;
      while ((t = w.nextNode())) { const v = t.nodeValue; if (!v.trim()) continue; const e = t.parentElement; if (!e || !sicht(e) || e.closest('svg,textarea,input')) continue;
        if (/\p{Emoji_Presentation}|️/u.test(v)) out.emoji.push(v.trim().slice(0, 30));
        if (!e.closest('.rinfo,.info-b,.si-info-btn,.fxlogo') && parseFloat(getComputedStyle(e).fontSize) < 10.95) out.html.push(getComputedStyle(e).fontSize + ' "' + v.trim().slice(0, 20) + '"'); }
      [[34, '.btn,select.btn,select.finp,input.finp'], [40, '.m-inp:not(textarea),.uc-btn,.search-inp-wrap'], [28, '.note-dirbtn']].forEach(([h, sel]) =>
        w0.querySelectorAll(sel).forEach(e => { if (!sicht(e)) return; const ist = e.getBoundingClientRect().height; if (Math.abs(ist - h) > 0.6) out.hoehe.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${ist.toFixed(1)}px statt ${h}`); }));
      return out;
    }, id);
    r.emoji.forEach(x => fail('A EMOJI', `Fenster ${id}: "${x}"`)); r.html.forEach(x => fail('D MINDESTSCHRIFT', `Fenster ${id}: ${x}`)); r.hoehe.forEach(x => fail('E HOEHE', `Fenster ${id}: ${x}`));
    await p.evaluate(i => { document.getElementById(i).style.display = 'none'; }, id); fenster++;
  }
  // A) die Symbolschrift ist wirklich geladen und enthaelt ⚠
  const symOk = await p.evaluate(async () => { try { await document.fonts.load('12px "FX Sym"', '⚠'); } catch (e) {} return document.fonts.check('12px "FX Sym"', '⚠') && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'FX Sym' && f.status === 'loaded'); });
  if (!symOk) fail('A SYMBOLSCHRIFT', '"FX Sym" nicht geladen');

  // G) aktiv = --ui-act, nie Bias-Blau (Trends: All + Zeitraum; Kalender: High-impact)
  await oeffne(p, 'trends'); await p.waitForTimeout(900);
  const g = await p.evaluate(() => {
    const farbe = v => { const i = document.createElement('i'); i.style.color = v; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const ui = farbe('var(--ui-act)'), blau = farbe('var(--blue)'), gruen = farbe('var(--green)');
    const akt = [...document.querySelectorAll('.cmp-quick.on,.ind-hist-range-btn.on,.cmp-chip.on,.btn.on,.st.on')].filter(e => e.offsetParent).map(e => [String(e.className).split(' ')[0] + '.on', getComputedStyle(e).backgroundColor]);
    return { ui, blau, gruen, akt, gleich: ui === blau || ui === gruen };
  });
  if (g.gleich) fail('G AKTIV = BIAS-BLAU', `--ui-act ${g.ui} ist die Bias-Farbe ${g.blau}`);
  if (!g.akt.length) fail('G AKTIV', 'kein aktives Element auf Trends gefunden - Selektoren veraltet?');
  g.akt.forEach(([k, c]) => { if (c === g.blau || c === g.gruen) fail('G AKTIV = BIAS-BLAU', `${k} ${c}`); else if (c !== g.ui) fail('G AKTIV', `${k} ${c} statt --ui-act ${g.ui}`); });

  // H) Rot nur bearish/Warnung
  await oeffne(p, 'cal'); await p.waitForTimeout(900);
  const h = await p.evaluate(() => {
    const farbe = v => { const i = document.createElement('i'); i.style.color = v; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const rot = farbe('var(--red)'), out = [];
    const pruef = (sel, eig, was) => { const e = [...document.querySelectorAll(sel)].find(x => x.offsetParent); if (!e) return; const c = getComputedStyle(e)[eig]; if (c.includes(rot.slice(4, -1))) out.push(`${was} ist rot (${sel})`); };
    pruef('.cal-day-hdr.today', 'color', '"heute"-Kopf'); pruef('.cal-now-time', 'backgroundColor', 'Jetzt-Linie'); pruef('.cal-now-rule', 'backgroundColor', 'Jetzt-Linie');
    pruef('.cal-imp.ih', 'color', 'Impact HIGH'); pruef('#pgCal .btn.active', 'backgroundColor', 'aktiver Filter');
    // das "!" an "Today" (countdownHtml) - Probe-Element, falls heute nichts ansteht
    const pr = document.createElement('span'); pr.className = 'cd-heute'; pr.textContent = '!'; document.body.appendChild(pr);
    if (getComputedStyle(pr).color.includes(rot.slice(4, -1))) out.push('"!" an "Today" ist rot (.cd-heute)'); pr.remove();
    const hi = !![...document.querySelectorAll('.cal-imp.ih')].find(x => x.offsetParent);
    return { out, hi };
  });
  h.out.forEach(x => fail('H ROT', 'Kalender: ' + x));
  if (!h.hi) fail('H ROT', 'Kalender: keine HIGH-Kennzeichnung sichtbar - Selektor veraltet?');
  await oeffne(p, 'regime'); await p.waitForTimeout(900);
  const hr = await p.evaluate(() => {
    const farbe = v => { const i = document.createElement('i'); i.style.color = v; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const rot = farbe('var(--red)'), out = []; let karten = 0;
    document.querySelectorAll('.rg-card').forEach(k => { if (k.classList.contains('rg-stress')) return; karten++;
      k.querySelectorAll('.rg-ja .rg-ic').forEach(i => { if (getComputedStyle(i).color === rot) out.push(`Haken rot in ruhigem Szenario "${(k.querySelector('.rg-name') || {}).textContent}"`); });
      k.querySelectorAll('.rg-bar-in').forEach(i => { if (getComputedStyle(i).backgroundColor === rot) out.push(`Balken rot in ruhigem Szenario "${(k.querySelector('.rg-name') || {}).textContent}"`); }); });
    const top = document.querySelector('.rg-top-v'), name = top && top.textContent.split('·')[0].trim();
    const k = [...document.querySelectorAll('.rg-card')].find(x => (x.querySelector('.rg-name') || {}).textContent === name);
    if (top && k && !k.classList.contains('rg-stress') && getComputedStyle(top).color === rot) out.push(`Leit-Regime "${name}" (ruhig) steht rot da`);
    return { out, karten };
  });
  hr.out.forEach(x => fail('H ROT', 'Regime: ' + x));
  if (!hr.karten) fail('H ROT', 'Regime: keine ruhigen Szenario-Karten gefunden - rg-stress fehlt?');

  // I) Schalter "Summaries"
  await oeffne(p, 'A:USD'); await p.waitForTimeout(1200);
  const zustand = () => p.evaluate(() => { const sw = document.getElementById('compactSw'), l = document.querySelector('label.sw-lbl[for="compactSw"]');
    const s = [...document.querySelectorAll('.rub-summary')];
    return { lbl: !!l && !!l.offsetParent && /summar/i.test(l.textContent), an: compactView === 1, title: sw && sw.title, sichtbar: s.filter(x => x.offsetParent).length, alle: s.length }; });
  const i0 = await zustand();
  if (!i0.lbl) fail('I SCHALTER', 'keine sichtbare Beschriftung "Summaries" am Schalter (label for=compactSw)');
  else {
    await p.click('label.sw-lbl'); await p.waitForTimeout(350);
    const i1 = await zustand();
    if (i1.an === i0.an) fail('I SCHALTER', 'Tipp auf die Beschriftung schaltet nicht');
    [i0, i1].forEach(s => { const sagtAn = /shown/i.test(s.title || ''), sagtAus = /hidden/i.test(s.title || '');
      if (s.an && !sagtAn || !s.an && !sagtAus) fail('I TOOLTIP', `Zustand ${s.an ? 'AN' : 'AUS'}, Tooltip "${s.title}"`);
      if (s.alle && (s.an ? s.sichtbar === 0 : s.sichtbar > 0)) fail('I SCHALTER', `Zustand ${s.an ? 'AN' : 'AUS'}, aber ${s.sichtbar}/${s.alle} Zusammenfassungen sichtbar`); });
    await p.click('label.sw-lbl'); await p.waitForTimeout(300);   // Ausgangslage wiederherstellen
  }
  await p.close();

  // ════ 820 / 1180 / 1440: Diagrammschrift (820), Leiste einzeilig, Trefferflaechen ════
  for (const vw of [820, 1180, 1440]) {
    p = await neueSeite(vw);
    const nav = await p.evaluate(() => [...document.querySelectorAll('#navSidebar>.np .np-lbl')].filter(e => e.offsetParent).map(e => { const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2; return [e.textContent.trim(), e.getBoundingClientRect().height, lh]; }));
    nav.forEach(([t, hh, lh]) => { if (hh > lh * 1.5) fail(`D LEISTE ${vw}`, `"${t}" bricht um (${hh.toFixed(0)} px hoch)`); });
    for (const z of SEITEN) {
      await oeffne(p, z); await p.waitForTimeout(1200);
      // Datenunabhaengig: eine Kalenderzeile mit Schlagzeilen-Knopf + Glocke + ×.
      // Den Knopf gibt es nur an Tagen mit passenden Schlagzeilen - in der
      // Aktionsspalte lag die Glocken-Flaeche ueber ihm und die Spalte lief
      // ueber (gefunden erst mit den Daten vom 2026-10-05). Seit 590 steht er
      // hinter dem Termin-Namen; die Gegenprobe setzt ihn an den alten Platz.
      // Ohne kommenden Termin (Wochenende) entfaellt die Zeile.
      if (z === 'cal') n.kalNews += await p.evaluate(gp => {
        const knopf = '<button class="cal-news-btn" title="test"><svg class="ic" width="11" height="11" viewBox="0 0 24 24"></svg><span>1</span></button>';
        const zeile = [...document.querySelectorAll('.cal-row:not(.compact)')].find(x => x.offsetParent && x.querySelector('.cal-alert-btn') && x.querySelector('.cal-row-del'));
        if (!zeile) return 0;
        if (gp) zeile.querySelector('.cal-row-actions').insertAdjacentHTML('afterbegin', knopf);
        else if (!zeile.querySelector('.cal-evname .cal-news-btn')) zeile.querySelector('.cal-evname').insertAdjacentHTML('beforeend', knopf);
        return 1; }, GEGENPROBE);
      const r = await p.evaluate(vw => {
        const out = { svg: [], a: [], b: [], fl: 0, el: 0 };
        if (vw === 820) document.querySelectorAll('svg text').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width || !e.textContent.trim() || e.closest('.fxlogo')) return; const m = e.getScreenCTM(); if (!m) return;
          const eff = parseFloat(getComputedStyle(e).fontSize) * Math.hypot(m.a, m.b); if (eff < 10.8) out.svg.push(`${eff.toFixed(1)}px "${e.textContent.trim().slice(0, 12)}"`); });
        const pg = [...document.querySelectorAll('.pc')].find(e => e.offsetParent) || document.body;
        const IA = 'button,select,a[href],input:not([type=hidden]),[onclick]:not(div):not(tr):not(td):not(svg):not(g):not(path):not(circle):not(li),[role=button]';
        const sicht = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && +cs.opacity > 0.05 && r.bottom > 0 && r.top < innerHeight - 1; };
        // Ganz im sichtbaren Teil jedes SCROLLENDEN Vorfahren? Eine teilweise
        // weggescrollte Zeile (Schlagzeilen-Liste im Dashboard, 545 px hoch,
        // 715 px Inhalt) hat an ihren Stichpunkten zwangslaeufig etwas anderes
        // unter sich - das ist Scrollstand, keine Ueberdeckung (Volllauf
        // 2026-10-05: 7 Fehlmeldungen "hl-row verliert Flaeche an hl-expand/
        // rinfo/hl-foot-link", identisch im Stand 587).
        const imScroll = e => { const r = e.getBoundingClientRect();
          for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x);
            const sy = /auto|scroll/.test(c.overflowY) && x.scrollHeight > x.clientHeight + 1, sx = /auto|scroll/.test(c.overflowX) && x.scrollWidth > x.clientWidth + 1;
            if (!sy && !sx) continue; const q = x.getBoundingClientRect(), t = q.top + x.clientTop, l = q.left + x.clientLeft;
            if (sy && (r.top < t - 0.5 || r.bottom > t + x.clientHeight + 0.5)) return false;
            if (sx && (r.left < l - 0.5 || r.right > l + x.clientWidth + 0.5)) return false; }
          return true; };
        const alle = [...pg.querySelectorAll(IA)].filter(e => sicht(e) && imScroll(e));
        const nm = e => e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.');
        alle.forEach(e => {
          const cs = getComputedStyle(e, '::after'); if (cs.content === 'none' || cs.position !== 'absolute' || (cs.left === 'auto' && cs.right === 'auto')) return;
          const r = e.getBoundingClientRect(), b0 = getComputedStyle(e), px = v => parseFloat(v) || 0;
          const L = r.left + px(b0.borderLeftWidth), T = r.top + px(b0.borderTopWidth), R = r.right - px(b0.borderRightWidth), B = r.bottom - px(b0.borderBottomWidth);
          const hl = L + px(cs.left), ht = T + px(cs.top), hr = R - px(cs.right), hb = B - px(cs.bottom);
          out.fl++; const cx = (hl + hr) / 2, cy = (ht + hb) / 2;
          // Nur Richtungen, in die die Flaeche wirklich ueber den Knopf ragt -
          // ohne Vergroesserung ist der Stichpunkt der Knopf selbst (dessen
          // Lage pruefen layout/cards, nicht diese Stufe).
          const ragt = { L: L - hl, R: hr - R, T: T - ht, B: hb - B };
          [['L', hl + 1.5, cy], ['R', hr - 1.5, cy], ['T', cx, ht + 1.5], ['B', cx, hb - 1.5]].forEach(([k, x, y]) => {
            if (ragt[k] < 0.5) return;
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
            const h = document.elementFromPoint(x, y); if (h && (h === e || e.contains(h))) return;
            const i = h && h.closest(IA); out.a.push(`${nm(e)} ${i && i !== e ? 'ragt in ' + nm(i) : 'wirkt nicht (verdeckt/abgeschnitten)'}`);
          });
        });
        alle.forEach(e => {
          const r = e.getBoundingClientRect(); if (r.width < 6 || r.height < 6 || e.matches('.cax-p')) return; out.el++;
          [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 2, (r.top + r.bottom) / 2], [r.right - 2, (r.top + r.bottom) / 2], [(r.left + r.right) / 2, r.top + 2], [(r.left + r.right) / 2, r.bottom - 2]].forEach(([x, y]) => {
            const h = document.elementFromPoint(x, y); if (!h || h === e || e.contains(h)) return;
            const i = h.closest(IA); if (i && i !== e && !i.contains(e) && !e.contains(i)) out.b.push(`${nm(e)} verliert Flaeche an ${nm(i)}`);
          });
        });
        // Aktionsspalte der Kalenderzeile: ihr Inhalt bleibt in der Spalte. Bis
        // 590 lief sie mit Schlagzeilen-Knopf zentriert ~17 px nach beiden Seiten
        // ueber, das × wurde am Tabellenrand 2,5 px abgeschnitten (Glocke + ×
        // allein: 26,8 px in 24 px = 1,4 px je Seite, deshalb 3 px Toleranz).
        out.spalte = [];
        pg.querySelectorAll('.cal-row:not(.compact) .cal-row-actions').forEach(a => { if (!a.offsetParent || !a.children.length) return;
          const q = a.getBoundingClientRect(); let l = Infinity, rr = -Infinity;
          [...a.children].forEach(c => { const k = c.getBoundingClientRect(); if (k.width) { l = Math.min(l, k.left); rr = Math.max(rr, k.right); } });
          const ueber = Math.max(q.left - l, rr - q.right);
          if (ueber > 3) out.spalte.push(`Aktionsspalte laeuft ${ueber.toFixed(1)} px ueber (${[...a.children].map(c => String(c.className).split(' ')[0]).join(' + ')})`); });
        return out;
      }, vw);
      [...new Set(r.spalte)].forEach(x => fail(`F SPALTE ${vw}`, `${z}: ${x}`));
      // I) das Wort am Schalter ist bei jeder Breite anklickbar (bei 820 px lag es
      // zuerst ausserhalb des scrollenden .dmeta - sichtbar, aber nicht klickbar)
      if (z === 'A:USD') { const lb = await p.evaluate(() => { const l = document.querySelector('label.sw-lbl'); if (!l || !l.offsetParent) return 'fehlt'; l.scrollIntoView({ block: 'center' }); const q = l.getBoundingClientRect(); const h = document.elementFromPoint((q.left + q.right) / 2, (q.top + q.bottom) / 2); return h === l || l.contains(h) ? '' : 'Klick trifft ' + (h ? h.tagName.toLowerCase() + '.' + String(h.className).split(' ')[0] : 'nichts'); });
        if (lb) fail(`I SCHALTER ${vw}`, `Beschriftung "Summaries" nicht anklickbar: ${lb}`); }
      [...new Set(r.svg)].forEach(x => fail('C DIAGRAMMSCHRIFT 820', `${z}: ${x}`));
      [...new Set(r.a)].forEach(x => fail(`F TREFFERFLAECHE ${vw}`, `${z}: ${x}`));
      [...new Set(r.b)].forEach(x => fail(`F UEBERDECKT ${vw}`, `${z}: ${x}`));
      if (vw === 1180) { n.flaechen += r.fl; n.elem += r.el; }
    }
    await p.close();
  }

  // ════ J) Touch (kein Hover, wie iPad): Bedienelemente, die erst per Hover
  // kraeftig werden, sind dort voll sichtbar; deaktivierte Knoepfe erkennbar.
  // Vorher gemessen: Kalender-× .20, Glocke .22, Set-ups-Stern .40, im
  // Bearbeitungsmodus Karten-× .15, Indikator-× .35, Undo/Redo .22. ════
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 1600 }, hasTouch: true });
    const t = await ctx.newPage();
    await t.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
    t.on('pageerror', e => perr.push(String(e)));
    await t.goto(URL); await wartenBisDatenDa(t);
    await t.evaluate(() => { ['introOv', 'lockScreen'].forEach(x => { const e = document.getElementById(x); if (e) e.remove(); }); });
    if (GEGENPROBE) await t.addStyleTag({ content: GP_CSS });
    if (await t.evaluate(() => matchMedia('(hover:hover)').matches)) fail('J TOUCH', 'Touch-Emulation greift nicht ((hover:hover) ist wahr) - Messung ungueltig');
    for (const [z, bearb] of [['cal', 0], ['pairs', 0], ['A:USD', 1]]) {
      await t.evaluate(([z, bearb]) => { document.body.classList.toggle('ind-edit-mode', !!bearb); const [a, v] = z.split(':'); if (a === 'A') gotoSym(v); else showTab(a); }, [z, bearb]);
      await t.waitForTimeout(1200);
      const j = await t.evaluate(() => {
        const out = [], zahl = { n: 0 };
        const pruef = (sel, min) => document.querySelectorAll(sel).forEach(e => { const q = e.getBoundingClientRect(); if (q.width < 2 || q.height < 2) return;
          const o = +getComputedStyle(e).opacity; zahl.n++; if (o < min) out.push(`${sel} Deckkraft ${o.toFixed(2)} (min ${min})`); });
        pruef('.cal-row-del,.cal-alert-btn,.dw-mark,.rdel,.idel2,.rstar,.res-note-star', 0.6);
        pruef('.rmv:not(:disabled),.imv:not(:disabled)', 0.6);
        pruef('.btn:disabled', 0.4);
        return { out: [...new Set(out)], n: zahl.n };
      });
      n.touch += j.n; j.out.forEach(x => fail('J TOUCH', `${z}: ${x}`));
    }
    await t.evaluate(() => document.body.classList.remove('ind-edit-mode'));
    await ctx.close();
  }

  // ════ K) Runde 2, Paket B (VERSION-CHECK-591) bei 820/1180/1440 ═════════
  //  - Waehrungsstaerke (Dashboard + Matrix): Balken auf der Seite seines
  //    Vorzeichens, von der Mittellinie aus (vorher alle von links: +2,6 und
  //    -2,6 sahen gleich aus)
  //  - Watchlist: einzeilig (vorher bei 1440 px 5/5 Zeilen 58 px), das
  //    Entfernen-× nur im Bearbeitungsmodus
  //  - Price-Karte: hoechstens 2 Bedienzeilen ueber dem Chart, ab 1180 px eine,
  //    nie ein einzelner Zeitfilter-Knopf in einer Zeile (vorher 820 px: 4
  //    Zeilen, "MAX" allein); Korb als Untertitel
  //  - Majors-Karte mit Kartentitel; Bearbeitungsmodus: kein ⓘ unter der
  //    Knopfleiste sichtbar; COT-/Retail-Balken <= 14 px hoch (vorher 26)
  for (const vw of [820, 1180, 1440]) {
    p = await neueSeite(vw);
    await p.evaluate(() => { ['GBP/CAD', 'EUR/USD', 'AUD/NZD', 'XAU/USD', 'SP500/USD'].forEach(x => { try { if (!isWatched(x)) toggleWatch(x); } catch (e) {} }); showTab('dash'); });
    await p.waitForTimeout(1300);
    const k1 = await p.evaluate(() => {
      const out = [], n = { rank: 0, wl: 0 };
      const seite = (row, bar, track, txt) => { const v = parseFloat(txt); const q = track.getBoundingClientRect(), bq = bar.getBoundingClientRect(), mid = (q.left + q.right) / 2; n.rank++;
        if (bq.width < 0.5 || !isFinite(v)) return; if (v >= 0 ? Math.abs(bq.left - mid) > 0.8 : Math.abs(bq.right - mid) > 0.8) out.push(`Staerke ${txt.trim()}: Balken ${Math.round(bq.left)}-${Math.round(bq.right)} statt ab Mitte ${Math.round(mid)}`); };
      document.querySelectorAll('.rank-row').forEach(r => { const t = r.querySelector('.rank-div'); if (t) seite(r, t.querySelector('.rank-bar'), t, (r.querySelector('.rank-sc') || {}).textContent || ''); });
      if (!n.rank) out.push('Dashboard: keine Waehrungsstaerke-Zeile mit Mittellinie (.rank-div) gefunden');
      document.querySelectorAll('.wl-table .wl-row.wl-click').forEach(r => { n.wl++; const h = r.getBoundingClientRect().height; if (h > 40) out.push(`Watchlist "${r.querySelector('.wl-name').textContent.trim()}" ${Math.round(h)} px hoch (zweizeilig)`);
        const x = r.querySelector('button.dw-del'); if (x && x.getBoundingClientRect().width > 0) out.push('Watchlist: Entfernen-× ausserhalb des Bearbeitungsmodus sichtbar'); });
      if (!n.wl) out.push('Watchlist: keine Zeilen (Testpaare nicht angelegt?)');
      const mh = document.querySelector('.dash-majors-card .dw-t-txt'); if (!mh || parseFloat(getComputedStyle(mh).fontSize) < 16) out.push('Majors-Karte ohne Kartentitel');
      return { out: [...new Set(out)], n };
    });
    // Bearbeitungsmodus (nach dem 0,12-s-Uebergang der Sichtbarkeit messen)
    await p.evaluate(() => document.body.classList.add('dash-edit-mode')); await p.waitForTimeout(450);
    const k2 = await p.evaluate(() => { const out = [];
      document.querySelectorAll('.dw-hdr').forEach(h => { const i = h.querySelector('.rinfo'), bt = h.querySelector('.dw-btns'); if (!i || !bt || getComputedStyle(i).visibility === 'hidden') return;
        const a = i.getBoundingClientRect(), c = bt.getBoundingClientRect(); if (a.width && c.width && a.right > c.left && a.left < c.right && a.bottom > c.top && a.top < c.bottom) out.push(`Bearbeitungsmodus: ⓘ "${(h.querySelector('.dw-t-txt') || {}).textContent}" liegt unter der Knopfleiste`); });
      if (![...document.querySelectorAll('.wl-row button.dw-del')].some(e => e.getBoundingClientRect().width > 0)) out.push('Bearbeitungsmodus: Watchlist-Entfernen-× fehlt');
      document.body.classList.remove('dash-edit-mode'); return [...new Set(out)]; });
    await p.evaluate(() => showTab('mx')); await p.waitForTimeout(1100);
    const k3 = await p.evaluate(() => { const out = []; let n = 0;
      document.querySelectorAll('.mx-rank-row').forEach(r => { const t = r.querySelector('.rank-div'); if (!t) { out.push('Matrix-Staerke ohne Mittellinie'); return; } n++; const bar = t.querySelector('.mx-rank-bar'), q = t.getBoundingClientRect(), bq = bar.getBoundingClientRect(), mid = (q.left + q.right) / 2, txt = r.querySelector('.mx-rank-score').textContent, v = parseFloat(txt);
        if (bq.width >= 0.5 && isFinite(v) && (v >= 0 ? Math.abs(bq.left - mid) > 0.8 : Math.abs(bq.right - mid) > 0.8)) out.push(`Matrix-Staerke ${txt.trim()}: Balken nicht ab der Mitte`); });
      if (!n) out.push('Matrix: keine Staerke-Zeilen'); return [...new Set(out)]; });
    await oeffne(p, 'A:USD'); await p.waitForTimeout(1300);
    const k4 = await p.evaluate(vw => { const out = []; const t = document.querySelector('#detail .ab-ptile'); if (!t) return ['Price-Karte fehlt'];
      const ch = t.querySelector('.ab-pk-chart').getBoundingClientRect();
      const kn = [...t.querySelectorAll('.chart-leiste button')].filter(e => e.getBoundingClientRect().bottom <= ch.top + 1);
      const reihen = [...new Set(kn.map(e => Math.round(e.getBoundingClientRect().top)))];
      if (reihen.length > 2 || (vw >= 1180 && reihen.length > 1)) out.push(`Price-Karte ${vw}: ${reihen.length} Bedienzeilen ueber dem Chart`);
      reihen.forEach(y => { const z = kn.filter(e => Math.round(e.getBoundingClientRect().top) === y); if (z.length === 1 && z[0].matches('.ab-rgs .ab-rg')) out.push(`Price-Karte ${vw}: Zeitfilter "${z[0].textContent.trim()}" allein in einer Zeile`); });
      if (!t.querySelector('.ab-tile-hd + .ab-tile-sub.ab-korb')) out.push('Price-Karte: Korb nicht als Untertitel unter der Kopfzeile');
      return out; }, vw);
    // COT- und Retail-Balken liegen auf ihren eigenen Seiten (auf dem Dashboard
    // gibt es keine - dort gesucht, lief die Pruefung ins Leere)
    const k5 = [];
    for (const [z, sel] of [['cot', '.cot-bar'], ['sent:retail', '.sent-bar']]) {
      await oeffne(p, z); await p.waitForTimeout(1100);
      const r = await p.evaluate(sel => { const e = [...document.querySelectorAll(sel)].filter(x => x.offsetParent); return { n: e.length, hoch: e.filter(x => x.getBoundingClientRect().height > 14.5).map(x => Math.round(x.getBoundingClientRect().height)) }; }, sel);
      if (!r.n) k5.push(`${z}: keine ${sel}-Balken gefunden`); else if (r.hoch.length) k5.push(`${z}: ${r.hoch.length} Balken ${r.hoch[0]} px hoch (max 14)`);
      n.k += r.n;
    }
    [...k1.out, ...k2, ...k3, ...k4, ...k5].forEach(x => fail(`K RUNDE2 ${vw}`, x));
    n.k += k1.n.rank + k1.n.wl;
    await p.close();
  }
  await b.close();
  perr.forEach(x => fail('JS-FEHLER', x));

  if (n.html < 1500 || n.svg < 120 || n.hoehe < 200 || n.flaechen < 200 || n.touch < 50 || n.k < 30) fail('ZU WENIG GEMESSEN', `Text ${n.html}, SVG ${n.svg}, Bedienelemente ${n.hoehe}, Flaechen ${n.flaechen}, Touch ${n.touch}, Runde-2-Zeilen ${n.k} - Selektoren veraltet?`);
  if (GEGENPROBE) {
    const stufen = ['A ', 'B ', 'C ', 'D ', 'E ', 'F ', 'G ', 'H ', 'I ', 'J ', 'K '];
    const fehlt = stufen.filter(s => !F.some(f => f.startsWith(s)));
    if (fehlt.length) { console.log('designregeln --gegenprobe: FEHLER - nicht gemeldet: ' + fehlt.join(',')); process.exit(1); }
    console.log(`designregeln --gegenprobe: ok (alle 11 Stufen melden den eingebauten Fehler, ${F.length} Befunde)`); process.exit(0);
  }
  if (F.length) { console.log(`designregeln: ${F.length} Befund(e)`); [...new Set(F)].slice(0, 60).forEach(x => console.log('  ' + x)); process.exit(1); }
  console.log(`designregeln: ok (${SEITEN.length} Seiten + ${fenster} Fenster: keine Farb-Emojis, Symbolschrift aktiv, keine Monospace, ${n.svg} Diagrammtexte und ${n.html} Texte >= 11 px, ${n.hoehe} Bedienelemente auf 28/34/40 px, ${n.flaechen} Trefferflaechen ohne Ueberdeckung bei 820/1180/1440 (Kalenderzeile mit Schlagzeilen-Knopf ${n.kalNews ? 'geprueft' : 'entfiel - kein kommender Termin'}), aktiv Navy, Rot nur bearish/Warnung, Schalter beschriftet, ${n.touch} Touch-Bedienelemente sichtbar, Runde 2: Staerke ab Mitte, Watchlist einzeilig, Price-Karte max. 2 Bedienzeilen)`);
})().catch(e => { console.log('designregeln: ABBRUCH ' + e.message); process.exit(1); });
