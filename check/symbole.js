// ── FLAGGEN UND KARTENSYMBOLE ──────────────────────────────────────────
//
// Nutzer 2026-09-23: "wenn die [Flaggen] sich bewegen entstehen weisse
// Luecken im Bild und die animation muss cleaner sein ... Bei jpy ist die
// flaggenfarbe gleich dem Hintergrund ... der Schimmereffekt ... startet vor
// der Flagge und hoert auch erst danach auf" und "ergaenz bei den Makro
// Karten noch passende icons und mach bei den Sentiment Karten und sonst
// ueberall verschiedene".
//
// Gemessen VOR dem Umbau: die Flagge war in 4/10 Streifen zerschnitten, die
// einzeln kippten (Stufen, Luecken, Saegezahn-Kante); der Glanz lief von
// 107 px vor bis 100 px hinter einer 240-px-Flagge; Weiss #fff auf #F8FAFD.
// Geprueft wird deshalb:
//   A) jede Flagge ist EIN Stueck (genau ein <use> auf ihr Motiv, keine
//      Streifen-Clips), Glanz und Falten liegen IN der Clip-Welle, der Rand
//      ist da, und im Flaggen-Motiv steht kein reines Weiss mehr;
//   B) der Glanz ist am Bildschirm nie ausserhalb der Flagge zu sehen
//      (Pixelvergleich: Flaggenumgebung bleibt Grundfarbe, egal wann);
//   C) jeder sichtbare Kartenkopf auf 11 Seiten traegt GENAU EIN Symbol, und
//      in den Sentiment-Reitern steht kein Emoji mehr.
//   D) Nutzer 2026-09-23: "in manche Flaggen gehoeren Sterne aber da sind nur
//      Punkte" - USD-Flagge (50 Punkte) und die einfarbigen Symbole EUR/AUD/NZD
//      trugen <circle>. Jetzt: kein Kreis, und die Zahl der Sterne stimmt.
//      Dazu "die [Kopf-]Flaggen gehen ueber die Karte drueber und Teile werden
//      oben und unten abgeschnitten": gemessen 510x340 px in 404x113 px -
//      geprueft wird, dass die Flagge GANZ in der Kopfkarte liegt, und dass
//      der Rand nicht mit der Flagge waechst (vector-effect am Defs-Pfad).
//   E) Nutzer 2026-09-23 (iPad): Kopf-Band "komplett weg". In WebKit
//      gemessen: der Filter am Band nahm seine Flaeche aus der Box der
//      gestreckten Randspalte - 9747 statt 144 Einheiten, bei Pixeldichte 2
//      ~91 000 px breit, WebKit zeichnet dann nichts. Chromium zeichnet es
//      trotzdem, deshalb wird die Bauform geprueft: der Filter am Band hat
//      eine FESTE Flaeche (userSpaceOnUse) innerhalb der Band-viewBox.
//   node check/symbole.js [--gegenprobe]          (Glanz ohne Clip)
//   node check/symbole.js [--gegenprobe-sterne]   (Punkte + Riesenflagge)
//   node check/symbole.js [--gegenprobe-band]     (Band mit Box-Filter #aiDuo)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const GP_STERNE = process.argv.includes('--gegenprobe-sterne');
const GP_BAND = process.argv.includes('--gegenprobe-band');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('fxpro_intro_anim_enabled', '0'); } catch (e) {} });
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL); await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });

  // ── A) Aufbau ───────────────────────────────────────────────────────
  const a = await p.evaluate(() => AI_FLAG_IDS.map(id => {
    const d = document.createElement('div'); d.innerHTML = assetIconHtml(id, 160);
    const uses = d.querySelectorAll(`use[href="#ai-${id}"]`).length;
    const streifen = d.querySelectorAll('[clip-path*="aiStrip"]').length;
    const sheen = d.querySelector('.ai-sheen'), fold = d.querySelector('.ai-fold');
    const imClip = el => !!(el && el.closest('[clip-path="url(#aiWave)"]'));
    const sym = document.getElementById('ai-' + id);
    const weiss = sym ? /fill="#fff(fff)?"/i.test(sym.innerHTML) : false;
    return { id, uses, streifen, sheenClip: imClip(sheen), foldClip: imClip(fold), rand: !!d.querySelector('.ai-rim'), weiss };
  }));
  a.forEach(r => {
    if (r.uses !== 1 || r.streifen) fail('FLAGGE ZERSCHNITTEN', `${r.id}: ${r.uses} Kopien des Motivs, ${r.streifen} Streifen-Clips - die Flagge muss EIN Stueck sein (sonst Luecken beim Wehen)`);
    if (!r.sheenClip || !r.foldClip) fail('GLANZ/FALTEN AUSSERHALB DER WELLE', `${r.id}: Glanz oder Falten liegen nicht in clip-path #aiWave - der Glanz lief frueher vor und hinter der Flagge`);
    if (!r.rand) fail('RAND FEHLT', `${r.id}: kein .ai-rim - weisse Flaechen verschwinden sonst auf dem hellen Grund (JPY)`);
    if (r.weiss) fail('REINES WEISS IN DER FLAGGE', `${r.id}: fill="#fff" im Motiv - auf #F8FAFD unsichtbar (AI_FLAG_WHITE verwenden)`);
  });
  const smil = await p.evaluate(() => !!document.querySelector('#aiWave animate[attributeName="d"]'));
  if (!smil) fail('WELLE STEHT', 'die Clip-Welle #aiWave hat keine Animation');

  // ── B) Glanz am Bildschirm nie ausserhalb ──────────────────────────
  await p.evaluate(g => {
    const d = document.createElement('div'); d.id = 'symTest';
    // Dunkler Testgrund: auf dem fast weissen Seitengrund ist ein Glanz mit
    // 42 % Weiss nicht messbar (erste Fassung war dadurch blind - Gegenprobe).
    d.style.cssText = 'position:fixed;left:0;top:0;z-index:999999;background:#6F84A6;padding:60px;width:520px;height:320px';
    d.innerHTML = assetIconHtml('JPY', 160);
    if (g) d.querySelector('g[clip-path]').removeAttribute('clip-path');
    document.body.appendChild(d);
  }, GEGENPROBE);
  const rahmen = await p.evaluate(() => { const r = document.querySelector('#symTest .ai-svg').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  let ausserhalb = 0;
  for (const t of [300, 900, 1500, 2100, 2700, 3300]) {
    await p.evaluate(t => document.querySelectorAll('#symTest .ai-sheen').forEach(e => e.getAnimations().forEach(a => { a.pause(); a.currentTime = t; })), t);
    await p.waitForTimeout(40);
    // Streifen links und rechts NEBEN der Flagge (16 px Abstand, Schatten ausgenommen)
    for (const x of [rahmen.x - 40, rahmen.x + rahmen.w + 24]) {
      const buf = await p.screenshot({ clip: { x, y: rahmen.y + 10, width: 16, height: rahmen.h - 20 } });
      // Pixel im Browser auswerten (keine PNG-Bibliothek noetig).
      const hell = await p.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
        // Grund #6F84A6 = (111,132,166): alles deutlich Hellere ist Glanz.
        for (let i = 0; i < d.length; i += 4) if (d[i] > 140 && d[i + 1] > 160) n++;
        return n;
      }, buf.toString('base64'));
      if (hell > 20) ausserhalb++;
    }
  }
  if (ausserhalb) fail('GLANZ AUSSERHALB DER FLAGGE', `${ausserhalb} Messungen neben der Flagge zeigen den weissen Glanz`);
  await p.evaluate(() => document.getElementById('symTest').remove());

  // ── D) Sterne statt Punkte, Rand waechst nicht ─────────────────────
  const d = await p.evaluate(gp => {
    if (gp) document.getElementById('ai-USD').insertAdjacentHTML('beforeend', '<circle cx="2" cy="2" r=".4" fill="#fff"/>');
    const SOLL = { USD: 50, EUR: 12, AUD: 6, NZD: 4 }, out = [];
    const zacken = el => [...el.querySelectorAll('path')].reduce((n, pth) => n + ((pth.getAttribute('d') || '').match(/Z/gi) || []).length, 0);
    for (const id in SOLL) {
      const sym = document.getElementById('ai-' + id);
      const g = document.createElement('div'); g.innerHTML = assetGlyphHtml(id, 40);
      out.push({ id, wo: 'Flagge', kreise: sym.querySelectorAll('circle').length, sterne: zacken(sym), soll: SOLL[id] });
      if (id !== 'USD') out.push({ id, wo: 'Symbol', kreise: g.querySelectorAll('circle').length, sterne: zacken(g), soll: SOLL[id] });
    }
    const rim = document.getElementById('aiRim');
    return { out, rimFest: !!rim && rim.getAttribute('vector-effect') === 'non-scaling-stroke' };
  }, GP_STERNE);
  d.out.forEach(r => {
    if (r.kreise) fail('PUNKTE STATT STERNE', `${r.id} (${r.wo}): ${r.kreise} <circle> - dort gehoeren Sterne hin`);
    if (r.sterne < r.soll) fail('STERNE FEHLEN', `${r.id} (${r.wo}): ${r.sterne} Sterne, verlangt ${r.soll}`);
  });
  if (!d.rimFest) fail('RAND WAECHST MIT', '#aiRim ohne vector-effect="non-scaling-stroke" - an .ai-rim wirkt es nicht (vererbt sich nicht durch <use>), der Rand stand als 9-37 px dicker Rahmen um grosse Flaggen');

  // ── C) Kartensymbole ───────────────────────────────────────────────
  const SEITEN = ['sym:USD', 'sym:GOLD', 'dash', 'cot', 'sent', 'seas', 'data', 'rate', 'edge', 'carry', 'mx'];
  let koepfe = 0;
  for (const s of SEITEN) {
    await p.evaluate(s => s.startsWith('sym:') ? gotoSym(s.slice(4)) : showTab(s), s);
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.rub-hdr,.dw-t,.cot-card-title,.ab-tile-hd').forEach(h => {
        if (!h.offsetParent) return;
        const n = h.querySelectorAll(':scope > .k-ic, :scope > .ab-tile-ic, :scope > svg.ic').length;
        const t = (h.querySelector('.rub-inp') || {}).value || h.textContent.trim().slice(0, 30);
        out.push([t, n]);
      });
      const emoji = [...document.querySelectorAll('.stabs .st')].filter(e => /\p{Extended_Pictographic}/u.test(e.textContent)).map(e => e.textContent.trim());
      return { out, emoji };
    });
    r.out.forEach(([t, n]) => { koepfe++; if (n !== 1) fail('KARTENSYMBOL', `${s}: "${t}" hat ${n} Symbole (verlangt genau 1)`); });
    r.emoji.forEach(e => fail('EMOJI IM REITER', `${s}: "${e}"`));
    if (s === 'sym:USD') {
      const k = await p.evaluate(([gp, gpb]) => { const a = document.querySelector('.ahead'), f = document.querySelector('.ahead-motif-band');
        if (!a || !f) return null; if (gp) { f.style.height = '340px'; f.style.width = '510px'; }
        if (gpb) f.querySelectorAll('[filter]').forEach(e => e.setAttribute('filter', 'url(#aiDuo)'));
        // E) Filterflaeche: jeder Filter im Band braucht feste Einheiten und
        //    darf nicht ueber die viewBox des Bandes hinausreichen.
        const vb = f.viewBox.baseVal, filt = [];
        f.querySelectorAll('[filter]').forEach(e => { const m = /url\(#([^)]+)\)/.exec(e.getAttribute('filter')); const d = m && document.getElementById(m[1]);
          const x = d && +d.getAttribute('x'), w = d && +d.getAttribute('width'), y = d && +d.getAttribute('y'), h = d && +d.getAttribute('height');
          if (!d || d.getAttribute('filterUnits') !== 'userSpaceOnUse' || x < vb.x || y < vb.y || x + w > vb.x + vb.width || y + h > vb.y + vb.height)
            filt.push(`${m ? m[1] : '?'} (${d ? (d.getAttribute('filterUnits') || 'objectBoundingBox') : 'fehlt'})`); });
        const ar = a.getBoundingClientRect(), fr = f.getBoundingClientRect();
        // statisch: keine Welle, kein Glanz, keine SMIL-/CSS-Animation im Band
        const bewegt = !!f.querySelector('[clip-path*="aiWave"], .ai-sheen, animate, animateTransform') || f.getAnimations({ subtree: true }).length > 0;
        return { bewegt, filt, ar: [ar.left, ar.top, ar.right, ar.bottom].map(Math.round), fr: [fr.left, fr.top, fr.right, fr.bottom].map(Math.round) }; }, [GP_STERNE, GP_BAND]);
      if (k && k.filt.length) fail('KOPF-BAND FILTERFLAECHE', `Filter ${k.filt.join(', ')} am Kopf-Band ohne feste Flaeche in der Band-viewBox - WebKit rechnet die Box der gestreckten Randspalte ungeschnitten (9747 statt 144 Einheiten) und zeichnet das Band auf dem iPad gar nicht (2026-09-23)`);
      if (k && k.bewegt) fail('KOPF-FLAGGE BEWEGT SICH', 'das Band oben rechts traegt Welle/Glanz/Animation - verlangt ist eine statische Zeichnung (Nutzer 2026-09-23)');
      if (!k) fail('KOPF-FLAGGE FEHLT', 'kein .ahead-motif-band auf der USD-Seite');
      else if (k.fr[0] < k.ar[0] || k.fr[1] < k.ar[1] || k.fr[2] > k.ar[2] || k.fr[3] > k.ar[3])
        fail('KOPF-FLAGGE ABGESCHNITTEN', `Flagge ${k.fr.join(',')} ragt aus der Kopfkarte ${k.ar.join(',')}`);
    }
  }
  if (koepfe < 20) fail('ZU WENIG KOEPFE GEFUNDEN', `${koepfe} - Selektoren veraltet?`);
  if (perr.length) perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GP_STERNE) {
    const ok = ['PUNKTE STATT STERNE', 'KOPF-FLAGGE ABGESCHNITTEN'].every(t => F.some(x => x.startsWith(t)));
    console.log(ok ? 'symbole --gegenprobe-sterne: ok (Punkte und ueberstehende Kopf-Flagge werden gemeldet)' : 'symbole --gegenprobe-sterne: FEHLER - nicht gemeldet: ' + F.join(' | ')); process.exit(ok ? 0 : 1);
  }
  if (GP_BAND) {
    const ok = F.some(x => x.startsWith('KOPF-BAND FILTERFLAECHE'));
    console.log(ok ? 'symbole --gegenprobe-band: ok (Box-Filter am Kopf-Band wird gemeldet)' : 'symbole --gegenprobe-band: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('GLANZ AUSSERHALB'));
    console.log(ok ? 'symbole --gegenprobe: ok (Glanz ohne Clip wird gemeldet)' : 'symbole --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`symbole: ${F.length} Befund(e)\n  ` + F.slice(0, 40).join('\n  ')); process.exit(1); }
  console.log(`symbole: ok (${a.length} Flaggen je ein Stueck mit Rand und begrenztem Glanz, Sterne statt Punkte, Kopf-Flagge ganz in der Karte mit fester Filterflaeche, ${koepfe} Kartenkoepfe mit genau einem Symbol)`);
})();
