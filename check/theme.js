#!/usr/bin/env node
// ── WAECHTER FUER DIE DESIGN-VORLAGEN (FX Analyst Pro) ───────────────────
// Prueft JEDE Vorlage rechnerisch statt nach Augenmass:
//   1. Kontrast jeder Textstufe gegen jede Flaeche (WCAG AA)
//   2. Farben mit BEDEUTUNG bleiben unterscheidbar - bullish/bearish/neutral
//      duerfen sich in keiner Vorlage angleichen
//   3. bullish bleibt blau, bearish bleibt rot (Farbton geprueft, nicht nur
//      "irgendwie anders") - eine Vorlage, in der bearish gruen waere, ist
//      kein Geschmacksfall, sondern eine falsche Aussage ueber die Daten
//   4. jede Vorlage MUSS jedes Pflicht-Token setzen; ein vergessenes Token
//      erbt still den Wert der vorherigen Vorlage
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);

const F = [];
const fail = (thema, txt) => F.push(`${thema}: ${txt}`);

// WCAG-Kontrast. Bewusst nachgerechnet - "sieht hell genug aus" hat in
// diesem Projekt schon einmal vier Farben durchgehen lassen, die auf Weiss
// bestanden und auf der dunkelsten Flaeche durchfielen.
function lum(rgb) {
  const v = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function kontrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parse(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) return m[1].split(',').slice(0, 3).map(x => parseFloat(x));
  const h = /^#([0-9a-f]{6})$/i.exec((s || '').trim());
  if (h) return [0, 2, 4].map(i => parseInt(h[1].substr(i, 2), 16));
  return null;
}
// Farbton in Grad - damit "blau" und "rot" pruefbar sind, nicht nur "anders".
function hue([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return -1;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}

// Saettigung (HSL) - "neutral" heisst grau, nicht dunkel.
function sat([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
}

const PFLICHT = ['--bg0','--bg1','--bg2','--bg3','--bg4','--bg5','--bg6','--bd','--bd2',
  '--t0','--t1','--t2','--t3','--green','--red','--amber','--due','--blue','--accent',
  '--chrome-bg','--chrome-bd','--chrome-line','--chrome-quick','--on-accent',
  '--green-rgb','--red-rgb','--amber-rgb','--blue-rgb','--accent-rgb',
  '--a-infl','--a-rate','--a-lab','--a-grow','--a-cot','--a-risk','--success','--live','--purple'];

// ⚠ PFLICHT-TOKENS STATISCH pruefen, nicht ueber getComputedStyle. Ein
// Regelwerk, das ein Token NICHT setzt, erbt es still von :root - der
// Browser liefert also brav einen Wert, und die Pruefung sieht nichts. Beim
// Mutationstest genau so aufgefallen: --chrome-quick aus einer Vorlage
// entfernt, Waechter blieb gruen. Fuer eine dunkle Vorlage waere das ein
// helles Bedienelement mitten im dunklen Chrome gewesen.
function pruefeTokensStatisch() {
  const fs = require('fs');
  let html = '';
  try { html = fs.readFileSync('index.html', 'utf8'); }
  catch (e) { fail('AUFBAU', 'index.html nicht lesbar: ' + e.message); return; }
  const bloecke = [...html.matchAll(/:root\[data-fx-theme="([^"]+)"\]\{([\s\S]*?)\}/g)];
  if (!bloecke.length) fail('AUFBAU', 'kein einziges [data-fx-theme]-Regelwerk gefunden');
  for (const [, id, rumpf] of bloecke) {
    PFLICHT.forEach(n => {
      if (!new RegExp('(^|[;{\\s])' + n.replace(/-/g, '\\-') + '\\s*:').test(rumpf))
        fail('TOKEN', `Vorlage "${id}" setzt ${n} nicht - der Wert erbt still vom Standard-Design`);
    });
  }
}

(async () => {
  pruefeTokensStatisch();
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('dmfx_app_choice', 'fx'); } catch (e) {} });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);

  const themen = await p.evaluate(() => (window.FX_THEMES || []).map(t => ({ id: t.id, name: t.name })));
  if (!themen.length) { fail('AUFBAU', 'window.FX_THEMES fehlt - die Vorlagen-Auswahl kann gar nicht rendern'); }

  for (const th of themen) {
    const w = await p.evaluate(id => {
      if (id) document.documentElement.setAttribute('data-fx-theme', id);
      else document.documentElement.removeAttribute('data-fx-theme');
      const cs = getComputedStyle(document.documentElement);
      const g = n => cs.getPropertyValue(n).trim();
      const namen = ['--bg0','--bg1','--bg2','--bg3','--bg4','--bg5','--bg6','--bd','--bd2',
        '--t0','--t1','--t2','--t3','--green','--red','--amber','--due','--blue','--accent',
        '--chrome-bg','--chrome-bd','--chrome-line','--chrome-quick','--on-accent',
        '--green-rgb','--red-rgb','--amber-rgb','--blue-rgb','--accent-rgb',
        '--a-infl','--a-rate','--a-lab','--a-grow','--a-cot','--a-risk','--success','--live','--purple'];
      const o = {};
      namen.forEach(n => o[n] = g(n));
      // Kopfzeilen-Scope getrennt messen: dort werden die Textstufen gedreht.
      const hdr = document.querySelector('.hdr');
      if (hdr) {
        const hs = getComputedStyle(hdr);
        o.__hdr = { t0: hs.getPropertyValue('--t0').trim(), t1: hs.getPropertyValue('--t1').trim(),
                    t2: hs.getPropertyValue('--t2').trim(), bg: g('--chrome-bg') };
      }
      return o;
    }, th.id);
    const wo = `"${th.name}"`;


    // 1. Kontrast Text gegen Flaeche
    const flaechen = ['--bg0','--bg1','--bg2','--bg3','--bg4','--bg5'];
    for (const tn of ['--t0','--t1','--t2','--t3']) {
      const tc = parse(w[tn]); if (!tc) continue;
      for (const fn of flaechen) {
        const fc = parse(w[fn]); if (!fc) continue;
        const k = kontrast(tc, fc);
        // --t3 ist Sekundaertext; AA verlangt 4.5 fuer normalen Text.
        if (k < 4.5) fail('KONTRAST', `${wo} ${tn} auf ${fn} nur ${k.toFixed(2)}:1 (AA verlangt 4.5)`);
      }
    }
    // Bias-Farben muessen auf der Kartenflaeche lesbar sein
    for (const bn of ['--green','--red','--amber','--due','--success','--live','--accent']) {
      const bc = parse(w[bn]); if (!bc) continue;
      for (const fn of ['--bg2','--bg5']) {
        const fc = parse(w[fn]); if (!fc) continue;
        const k = kontrast(bc, fc);
        if (k < 3.0) fail('KONTRAST', `${wo} ${bn} auf ${fn} nur ${k.toFixed(2)}:1 - als Zahlenfarbe unlesbar`);
      }
    }
    // Text auf Akzentflaeche (aktiver Chip, Profilkreis)
    const oa = parse(w['--on-accent']), ac = parse(w['--accent']);
    if (oa && ac) {
      const k = kontrast(oa, ac);
      if (k < 3.0) fail('KONTRAST', `${wo} --on-accent auf --accent nur ${k.toFixed(2)}:1 - Text auf dem aktiven Chip unlesbar`);
    }
    // Kopfzeile: Text gegen Chrome-Grund
    if (w.__hdr) {
      const bg = parse(w.__hdr.bg);
      for (const [n, v] of [['t0', w.__hdr.t0], ['t1', w.__hdr.t1], ['t2', w.__hdr.t2]]) {
        const c = parse(v); if (!c || !bg) continue;
        const k = kontrast(c, bg);
        if (k < 4.5) fail('KONTRAST', `${wo} Kopfzeilen-${n} auf --chrome-bg nur ${k.toFixed(2)}:1`);
      }
    }

    // 2./3. Bedeutung
    // ⚠ NICHT ueber den Helligkeitskontrast pruefen. Blau und Rot koennen
    // gleich HELL und trotzdem sofort unterscheidbar sein - der Unterschied
    // ist der Farbton. Der erste Wurf dieses Waechters rechnete mit WCAG und
    // erklaerte damit das seit Monaten bewaehrte aktuelle Design fuer kaputt
    // (bullish/bearish 1.02:1). Das war ein Fehler der Pruefung, nicht der
    // Farben. Gemessen wird deshalb: Farbton-ABSTAND zwischen bullish und
    // bearish, und fuer "neutral" die SAETTIGUNG - neutral ist neutral, weil
    // es grau ist, nicht weil es dunkler waere.
    const gr = parse(w['--green']), rd = parse(w['--red']), am = parse(w['--amber']);
    if (gr && rd) {
      const hg = hue(gr), hr = hue(rd);
      if (!(hg >= 185 && hg <= 265)) fail('BEDEUTUNG', `${wo} --green (bullish) hat Farbton ${hg.toFixed(0)}° - das ist kein Blau mehr`);
      if (!((hr >= 0 && hr <= 25) || hr >= 340)) fail('BEDEUTUNG', `${wo} --red (bearish) hat Farbton ${hr.toFixed(0)}° - das ist kein Rot mehr`);
      let d = Math.abs(hg - hr); if (d > 180) d = 360 - d;
      if (d < 90) fail('BEDEUTUNG', `${wo} bullish und bearish liegen nur ${d.toFixed(0)}° auseinander - zu aehnlich`);
    }
    if (am) {
      const s = sat(am);
      if (s > 0.28) fail('BEDEUTUNG', `${wo} --amber (neutral) ist mit ${(s*100).toFixed(0)}% Saettigung keine neutrale Farbe mehr`);
    }
  }

  await browser.close();
  if (F.length) {
    console.error('VORLAGEN NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
  console.log(`[theme] ok (${themen.length} Vorlagen: Kontrast, Bedeutung, Pflicht-Tokens)`);
})().catch(e => { console.error('VORLAGEN-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
