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
//   node check/symbole.js [--gegenprobe]   (Gegenprobe: Glanz ohne Clip)
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const GEGENPROBE = process.argv.includes('--gegenprobe');
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
  }
  if (koepfe < 20) fail('ZU WENIG KOEPFE GEFUNDEN', `${koepfe} - Selektoren veraltet?`);
  if (perr.length) perr.forEach(e => fail('PAGEERROR', e));
  await b.close();
  if (GEGENPROBE) {
    const ok = F.some(x => x.startsWith('GLANZ AUSSERHALB'));
    console.log(ok ? 'symbole --gegenprobe: ok (Glanz ohne Clip wird gemeldet)' : 'symbole --gegenprobe: FEHLER - nicht gemeldet'); process.exit(ok ? 0 : 1);
  }
  if (F.length) { console.log(`symbole: ${F.length} Befund(e)\n  ` + F.slice(0, 40).join('\n  ')); process.exit(1); }
  console.log(`symbole: ok (${a.length} Flaggen je ein Stueck mit Rand und begrenztem Glanz, ${koepfe} Kartenkoepfe mit genau einem Symbol)`);
})();
