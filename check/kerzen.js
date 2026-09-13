#!/usr/bin/env node
// ── WAECHTER FUER DIE KERZEN-REGELN (FX Analyst Pro) ─────────────────────
//
// Vier Dauerregeln, alle am 2026-09-13 vom Nutzer gesetzt, alle so
// beschaffen, dass sie beim naechsten Umbau lautlos verlorengehen koennen:
//
//   1. EINE KERZE = EIN TAG, und KEINE Kerze fuer Samstag/Sonntag - ausser
//      bei Krypto ("leg generell bei den charts als regel fest das es keine
//      kerzen fuer samstag und sontag gibt ausser bei crypto"). Die Feeds
//      LIEFERN Wochenendtage: gemessen 11 Samstage + 96 Sonntage im EUR auf
//      drei Jahre, mit dem Freitagsschluss noch einmal notiert. Ohne diese
//      Regel stehen dort zwei flache Kerzen je Woche, die nichts bedeuten.
//   2. Der Hover nennt den WOCHENTAG ("ich will wenn ich drueber hover bei
//      den charts auch den wochentag sehen").
//   3. Kerzen tragen --cndl-up/--cndl-dn, NICHT die Bias-Farben. Bias ist
//      eine Aussage ueber das Asset, die Kerzenfarbe ueber einen Tag - wer
//      beides auf denselben Token legt, kann das eine nie mehr aendern.
//   4. Dochte nur aus echtem High/Low. Solange die Reihe je Tag einen
//      einzigen Wert traegt, darf keine Kerze einen Docht haben (Regel 4:
//      ein erfundener Docht ist eine erfundene Zahl).
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');

const F = [];
const fail = (t, x) => F.push(`${t}: ${x}`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('dmfx_app_choice', 'fx');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen', 'appChoiceOv'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });

  // ── 1 + 4: Wochenende und Dochte, direkt am Kerzen-Bauer gemessen ──────
  const r1 = await p.evaluate(() => {
    const we = (d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6; };
    const out = [];
    ['EUR', 'USD', 'GOLD', 'SILVER', 'SP500', 'NAS', 'OIL', 'BTC'].forEach(id => {
      const roh = priceSeriesFor(id);
      if (!Array.isArray(roh) || roh.length < 3) return;
      const k = tagesKerzen(roh, id);
      out.push({ id, krypto: kerzenWochenendeErlaubt(id),
        rohWe: roh.filter(e => we(e[0])).length,
        kerzenWe: k.filter(c => we(c.d)).length,
        kerzen: k.length,
        // Ein Tag darf hoechstens einmal vorkommen.
        doppelt: k.length - new Set(k.map(c => c.d)).size,
        // Ein Docht ohne echtes OHLC waere erfunden.
        dochtOhneOhlc: k.filter(c => !c.ohlc && (c.h > Math.max(c.o, c.c) || c.l < Math.min(c.o, c.c))).length,
        ohlc: k.filter(c => c.ohlc).length });
    });
    return out;
  });
  if (!r1.length) fail('KERZEN', 'keine einzige Preisreihe erreichbar - die Messung sagt so gar nichts');
  r1.forEach(a => {
    if (a.krypto) {
      if (a.rohWe > 0 && a.kerzenWe === 0) fail('WOCHENENDE', `${a.id} ist Krypto, hat ${a.rohWe} Wochenendtage im Feed, aber keine einzige Wochenendkerze`);
    } else if (a.kerzenWe > 0) {
      fail('WOCHENENDE', `${a.id} zeichnet ${a.kerzenWe} Kerzen fuer Samstag/Sonntag (Feed: ${a.rohWe} Wochenendtage)`);
    }
    if (a.doppelt) fail('EIN TAG = EINE KERZE', `${a.id} hat ${a.doppelt} doppelte Tage`);
    if (a.dochtOhneOhlc) fail('DOCHTE', `${a.id}: ${a.dochtOhneOhlc} Kerzen mit Docht, obwohl die Reihe kein High/Low traegt`);
  });

  // ── 2: Wochentag im Hover ─────────────────────────────────────────────
  await p.evaluate(() => gotoSym('EUR'));
  await p.waitForTimeout(900);
  const chv = await p.$('.ab-k .chv');
  if (!chv) fail('HOVER', 'kein Kontext-Chart mit Hover-Rahmen auf der Asset-Seite');
  else {
    // ⚠ scrollIntoView ist Pflicht: ohne das liefert boundingBox() schon
    // einmal Koordinaten ausserhalb des Fensters, mouse.move landet im
    // Nichts und der Waechter meldet "kein Tooltip", wo einer ist.
    await chv.scrollIntoViewIfNeeded();
    const bx = await chv.boundingBox();
    await p.mouse.move(bx.x + bx.width * 0.6, bx.y + bx.height / 2);
    await p.waitForTimeout(250);
    const tip = await p.evaluate(() => {
      const t = document.querySelector('.ab-k .chv-tip');
      return t && t.style.display !== 'none' ? t.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    if (!tip) fail('HOVER', 'kein Tooltip, obwohl der Zeiger im Chart steht');
    // Die Kopfzeile laeuft durch text-transform:uppercase - deshalb ohne
    // Ruecksicht auf Gross-/Kleinschreibung pruefen.
    else if (!/\b(MON|TUE|WED|THU|FRI|SAT|SUN)\b/i.test(tip)) fail('HOVER', `Tooltip nennt keinen Wochentag: "${tip.slice(0, 80)}"`);
    else if (/\b(SAT|SUN)\b/i.test(tip)) fail('HOVER', `Tooltip steht ueber einem Wochenendtag: "${tip.slice(0, 80)}"`);
  }

  // ── 3: Kerzenfarben kommen aus den eigenen Tokens ─────────────────────
  const farben = await p.evaluate(() => {
    const f = {};
    document.querySelectorAll('.ab-k .ab-chart rect').forEach(r => {
      const v = r.getAttribute('fill') || ''; f[v] = (f[v] || 0) + 1;
    });
    const cs = getComputedStyle(document.documentElement);
    return { f, up: cs.getPropertyValue('--cndl-up').trim(), dn: cs.getPropertyValue('--cndl-dn').trim() };
  });
  const schl = Object.keys(farben.f);
  if (!schl.length) fail('FARBEN', 'keine einzige Kerze gezeichnet');
  if (!farben.up || !farben.dn) fail('FARBEN', `--cndl-up/--cndl-dn nicht gesetzt (up="${farben.up}" dn="${farben.dn}")`);
  if (schl.some(k => /--bias-(bull|bear)/.test(k)))
    fail('FARBEN', 'Kerzen benutzen die Bias-Farben statt --cndl-up/--cndl-dn: ' + schl.join(' '));
  if (schl.length && !schl.some(k => /--cndl-up/.test(k)))
    fail('FARBEN', 'keine steigende Kerze in --cndl-up: ' + schl.join(' '));
  if (schl.length && !schl.some(k => /--cndl-dn/.test(k)))
    fail('FARBEN', 'keine fallende Kerze in --cndl-dn: ' + schl.join(' '));

  // Und auf den dunklen Vorlagen darf keine der beiden verschwinden.
  const dunkel = await p.evaluate(() => {
    const lum = (rgb) => { const v = rgb.map(c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); });
      return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const zahl = (wert) => { const d = document.createElement('div'); d.style.color = wert; document.body.appendChild(d);
      const m = getComputedStyle(d).color.match(/\d+/g); d.remove(); return m ? m.slice(0, 3).map(Number) : null; };
    const out = [];
    ['carbon', 'midnight', 'graphite', 'nord', 'solar'].forEach(t => {
      document.documentElement.setAttribute('data-fx-theme', t);
      const cs = getComputedStyle(document.documentElement);
      const up = zahl(cs.getPropertyValue('--cndl-up')), dn = zahl(cs.getPropertyValue('--cndl-dn')),
            bg = zahl(cs.getPropertyValue('--bg2'));
      const k = (a) => { const l1 = lum(a), l2 = lum(bg); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
      out.push({ t, up: k(up), dn: k(dn) });
    });
    document.documentElement.removeAttribute('data-fx-theme');
    return out;
  });
  dunkel.forEach(d => {
    if (d.up < 3) fail('FARBEN DUNKEL', `${d.t}: steigende Kerze nur ${d.up.toFixed(2)}:1 gegen die Kartenflaeche`);
    if (d.dn < 3) fail('FARBEN DUNKEL', `${d.t}: fallende Kerze nur ${d.dn.toFixed(2)}:1 gegen die Kartenflaeche`);
  });

  await b.close();
  if (F.length) {
    console.error('KERZEN-REGELN NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
  const we = r1.map(a => `${a.id} ${a.kerzen}${a.krypto ? ' (7 Tage)' : ''}`).join(', ');
  console.log(`[kerzen] ok (${r1.length} Reihen: ${we} · Wochenende nur bei Krypto, Wochentag im Hover, eigene Kerzenfarben auf 5 dunklen Vorlagen)`);
})().catch(e => { console.error('KERZEN-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
