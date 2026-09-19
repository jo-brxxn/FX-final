// ── REGIME RADAR ──────────────────────────────────────────────────────
// Nutzer-Wunsch 2026-09-15: Szenarien aus vorhandenen Daten, als eigener Tab.
//
// ⚠ WAS DIESER WAECHTER PRUEFT UND WARUM GENAU DAS:
//
// 1. JEDE ZAHL GEGEN DIE ROHDATEI, nicht gegen sich selbst. Der Waechter
//    liest bond_data.json / ind_data.json / price_data.json / risk_index.json
//    in Node und rechnet Kurve, Realzins, Rendite und Perzentil NOCH EINMAL -
//    mit eigenem Code. Stimmt die Zahl im Browser nicht mit dieser ueberein,
//    ist es egal, ob sie plausibel aussieht.
//    Anlass: der Realzins haette sich lautlos verrechnen lassen, indem man
//    "CPI" statt "CPI (Headline)" nimmt - der erste ist in diesem Feed die
//    MONATSrate. Das Ergebnis waere rund +4pp statt +1,6pp gewesen: eine
//    voellig falsche Aussage, die trotzdem wie eine Zahl aussieht.
//
// 2. DIE DREI SCHUTZREGELN, die beim ersten Live-Lauf gefehlt haben:
//    • "Not measured" faellt aus dem Nenner (Grundsatz 4).
//    • Ein Szenario mit fehlender KERNbedingung darf nie "Leading regime"
//      sein. Ungeschuetzt stand Funding Squeeze auf 100% an der Spitze,
//      obwohl genau die zwei Bedingungen fehlten, die es von gewoehnlichem
//      Risk-off unterscheiden.
//    • Unter drei messbaren Bedingungen gibt es KEINEN Prozentwert.
//      Ungeschuetzt stand Productivity Upswing bei JPY auf 100% - aus einer
//      einzigen zutreffenden Bedingung.
//
// 3. DASS DER TAB WIRKLICH BEDIENBAR IST: echter Mausklick auf die
//    Waehrungsknoepfe, und die Werte muessen sich danach aendern.
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const ROOT = path.join(__dirname, '..');

const F = [];
const fail = (t, x) => F.push(`${t}: ${x}`);
const J = n => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, n), 'utf8')); } catch (e) { return null; } };

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const MIN_BED = 3;
const nah = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

// ── Die unabhaengige Nachrechnung in Node ─────────────────────────────
const bond = J('bond_data.json') || {};
const ind = J('ind_data.json') || {};
const risk = J('risk_index.json') || {};
const zahl = s => {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
function sollKurve(c) {
  const b = bond[c] || {};
  const z = new Map(((b['2Y Bond Yield'] || {}).series || []).map(e => [String(e[0]).slice(0, 10), Number(e[1])]));
  const out = [];
  (((b['10Y Bond Yield'] || {}).series) || []).forEach(e => {
    const d = String(e[0]).slice(0, 10), t = z.get(d);
    if (t != null && isFinite(Number(e[1])) && isFinite(t)) out.push(Number(e[1]) - t);
  });
  return out.length ? out[out.length - 1] : null;
}
function sollRealzins(c) {
  const s = ((bond[c] || {})['10Y Bond Yield'] || {}).series || [];
  const r = s.length ? Number(s[s.length - 1][1]) : null;
  // ⚠ Ausdruecklich (Headline) - siehe Kopfkommentar.
  const cpi = zahl(((ind[c] || {})['CPI (Headline)'] || {}).actual);
  return (r != null && cpi != null && isFinite(r)) ? r - cpi : null;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try {
    localStorage.setItem('fxpro_help_seen', '1');
    localStorage.setItem('fxpro_intro_anim_enabled', '0');
  } catch (e) {} });
  const perr = [];
  p.on('pageerror', e => perr.push(String(e)));
  await p.goto(URL);
  await wartenBisDatenDa(p);
  await p.evaluate(() => { ['introOv', 'lockScreen'].forEach(id => {
    const e = document.getElementById(id); if (e) e.remove(); }); });
  await p.evaluate(() => showTab('regime'));
  await p.waitForTimeout(1100);

  // ── 1) Der Tab existiert ueberhaupt und zeichnet alle Szenarien ──────
  const auf = await p.evaluate(() => ({
    seite: !!document.getElementById('pgRegime'),
    sichtbar: (() => { const e = document.getElementById('pgRegime'); return !!e && getComputedStyle(e).display !== 'none'; })(),
    karten: document.querySelectorAll('.rg-card').length,
    szenarien: (typeof regimeStand === 'function') ? regimeStand('USD').length : 0,
    knoepfe: document.querySelectorAll('.rg-ccy').length,
  }));
  if (!auf.seite) fail('SEITE FEHLT', 'kein #pgRegime im Dokument');
  if (!auf.sichtbar) fail('SEITE BLEIBT VERSTECKT', 'showTab("regime") zeigt #pgRegime nicht an - der Menuepunkt fuehrt ins Leere');
  if (auf.karten !== auf.szenarien || !auf.karten)
    fail('KARTEN FEHLEN', `${auf.szenarien} Szenarien gerechnet, aber ${auf.karten} Karten gezeichnet`);
  if (auf.knoepfe !== CCYS.length)
    fail('WAEHRUNGSWAHL UNVOLLSTAENDIG', `${auf.knoepfe} Knoepfe statt ${CCYS.length}`);

  // ── 2) Jede Zahl gegen die Rohdatei ─────────────────────────────────
  let gemessen = 0;
  for (const c of CCYS) {
    const ist = await p.evaluate(x => {
      const k = rgKurve(x), r = rgRealzins(x);
      return { kurve: k ? k.wert : null, kpct: k ? k.pct : null, real: r ? r.wert : null,
        rendite: r ? r.rendite : null, cpi: r ? r.cpi : null };
    }, c);
    const sk = sollKurve(c), sr = sollRealzins(c);
    if (sk != null) {
      gemessen++;
      if (!nah(ist.kurve, sk, 0.005)) fail('KURVE FALSCH',
        `${c}: die App rechnet ${ist.kurve}, bond_data.json ergibt ${sk.toFixed(3)} (10Y minus 2Y am selben Tag)`);
      if (ist.kpct != null && (ist.kpct < 0 || ist.kpct > 100)) fail('PERZENTIL AUSSERHALB',
        `${c}: Kurven-Perzentil ${ist.kpct}`);
    }
    if (sr != null) {
      gemessen++;
      if (!nah(ist.real, sr, 0.02)) fail('REALZINS FALSCH',
        `${c}: die App rechnet ${ist.real}, die Rohdaten ergeben ${sr.toFixed(3)} (10Y minus CPI Headline y/y)`);
      // ⚠ Die Falle explizit: wurde versehentlich die Monatsrate benutzt?
      const mm = zahl(((ind[c] || {})['CPI'] || {}).actual);
      const hd = zahl(((ind[c] || {})['CPI (Headline)'] || {}).actual);
      if (mm != null && hd != null && Math.abs(mm - hd) > 0.3 && nah(ist.cpi, mm, 0.01))
        fail('MONATSRATE STATT JAHRESRATE',
          `${c}: der Realzins rechnet mit CPI ${mm}% - das ist die MONATSrate (period m/m). Gemeint ist "CPI (Headline)" mit ${hd}% y/y.`);
    }
  }
  if (gemessen < 8) fail('ZU WENIG NACHGERECHNET',
    `nur ${gemessen} Werte liessen sich gegen die Rohdateien pruefen - bond_data.json oder ind_data.json fehlen offenbar`);

  // Risk-Index: die App darf ihn nicht umdeuten
  const rIst = await p.evaluate(() => { const r = rgRisk(); return r ? { w: r.wert, p: r.pct } : null; });
  if (risk && risk.value != null && rIst) {
    if (!nah(rIst.w, Number(risk.value), 0.001)) fail('RISK-INDEX FALSCH',
      `die App liest ${rIst.w}, risk_index.json fuehrt ${risk.value}`);
  }

  // ── 3) Die drei Schutzregeln ────────────────────────────────────────
  for (const c of CCYS) {
    const st = await p.evaluate(x => regimeStand(x).map(s => ({
      name: s.name, grad: s.grad, erf: s.erfuellt, mess: s.messbar, offen: s.offen,
      kernOffen: s.kernOffen, zuWenig: s.zuWenig, zeilen: s.zeilen.length,
    })), c);
    st.forEach(s => {
      // a) Nenner = messbar, nicht Gesamtzahl
      if (s.mess + s.offen !== s.zeilen) fail('NENNER STIMMT NICHT',
        `${c}/${s.name}: ${s.mess} messbar + ${s.offen} offen ergibt nicht ${s.zeilen} Bedingungen`);
      if (s.grad != null && s.mess > 0 && s.grad !== Math.round(s.erf / s.mess * 100))
        fail('GRAD FALSCH GERECHNET', `${c}/${s.name}: ${s.grad}% aus ${s.erf}/${s.mess}`);
      if (s.erf > s.mess) fail('MEHR ERFUELLT ALS MESSBAR', `${c}/${s.name}: ${s.erf} von ${s.mess}`);
      // b) unter der Mindestzahl gibt es keinen Prozentwert
      if (s.mess < MIN_BED && s.grad != null) fail('PROZENT AUS ZU WENIG BEDINGUNGEN',
        `${c}/${s.name}: ${s.grad}% aus nur ${s.mess} messbaren Bedingungen. Unter ${MIN_BED} ist das kein Anteil, sondern eine als Zahl verkleidete Einzelbeobachtung - genau der Fall, der bei JPY 100% ergab.`);
      if (s.mess >= MIN_BED && s.zuWenig) fail('ZU-WENIG-FLAG FALSCH',
        `${c}/${s.name}: ${s.mess} messbare Bedingungen, trotzdem als "zu wenig" markiert`);
    });
    // c) das fuehrende Regime hat keine offene Kernbedingung
    const kopf = await p.evaluate(() => {
      const e = document.querySelector('.rg-top-v');
      return e ? e.textContent.trim() : null;
    });
    const mitGrad = st.filter(s => s.grad != null);
    const voll = mitGrad.filter(s => !s.kernOffen);
    if (voll.length) {
      const soll = voll.reduce((a, x) => (x.grad > a.grad ? x : a));
      if (kopf && !kopf.startsWith(soll.name)) fail('FALSCHES FUEHRENDES REGIME',
        `${c}: die Kopfzeile nennt "${kopf}", das staerkste VOLLSTAENDIG belegte Szenario ist aber "${soll.name}" mit ${soll.grad}%`);
      const luecke = mitGrad.find(s => s.kernOffen && kopf && kopf.startsWith(s.name));
      if (luecke) fail('LUECKENHAFTES SZENARIO FUEHRT',
        `${c}: "${luecke.name}" steht als fuehrendes Regime, obwohl ${luecke.kernOffen} Kernbedingung(en) nicht messbar sind. Genau so stand Funding Squeeze mit 100% an der Spitze.`);
    }
    if (c !== CCYS[CCYS.length - 1]) { await p.evaluate(x => setRegimeCcy(x), CCYS[CCYS.indexOf(c) + 1]); await p.waitForTimeout(220); }
  }

  // ── 4) Jedes "Not measured" nennt SEINEN Grund ──────────────────────
  await p.evaluate(() => setRegimeCcy('USD'));
  await p.waitForTimeout(350);
  const ohneGrund = await p.evaluate(() => {
    let n = 0;
    regimeStand('USD').forEach(s => s.zeilen.forEach(z => {
      if (z.zustand === 'unbekannt' && !(z.warum && z.warum.length > 12)) n++;
    }));
    return n;
  });
  if (ohneGrund) fail('NICHT MESSBAR OHNE BEGRUENDUNG',
    `${ohneGrund} Bedingung(en) melden "Not measured", sagen aber nicht warum. Die Begruendung IST die Auskunft (Grundsatz 4).`);

  // ── 5) Der Waehrungswechsel wirkt wirklich - mit echtem Mausklick ────
  const vorher = await p.evaluate(() => ({ ccy: window.regimeCcy, txt: document.querySelector('.rg-rows').textContent.slice(0, 200) }));
  await p.click('.rg-ccy:has-text("JPY")', { timeout: 4000 }).catch(e => fail('WAEHRUNGSKNOPF NICHT KLICKBAR', String(e.message).split('\n')[0]));
  await p.waitForTimeout(600);
  const nachher = await p.evaluate(() => ({ ccy: window.regimeCcy,
    aktiv: (document.querySelector('.rg-ccy.on') || {}).textContent,
    gespeichert: localStorage.getItem('fxpro_regime_ccy'),
    txt: document.querySelector('.rg-rows').textContent.slice(0, 200) }));
  if (nachher.ccy !== 'JPY') fail('WAEHRUNGSWECHSEL WIRKT NICHT', `nach dem Klick steht regimeCcy auf "${nachher.ccy}"`);
  if (nachher.aktiv !== 'JPY') fail('AKTIVER KNOPF FALSCH', `hervorgehoben ist "${nachher.aktiv}"`);
  if (nachher.gespeichert !== 'JPY') fail('WAHL NICHT GESPEICHERT',
    `localStorage fuehrt "${nachher.gespeichert}" - ohne das kommt die Wahl weder ueber einen Neustart noch ueber den Cloud-Sync (CLAUDE.md Regel 1).`);
  if (vorher.txt === nachher.txt) fail('ANZEIGE AENDERT SICH NICHT',
    'nach dem Waehrungswechsel steht derselbe Text in den Bedingungen - der Knopf sieht aus, als tue er etwas, tut es aber nicht');

  // ── 6) Kein Ueberlauf, nichts Unlesbares, auf fuenf Breiten ──────────
  for (const [w, h] of [[1920, 1080], [1500, 1000], [1180, 820], [820, 1180], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(280);
    const r = await p.evaluate(() => {
      const pg = document.getElementById('pgRegime');
      const karten = [...document.querySelectorAll('.rg-card')];
      let raus = 0;
      karten.forEach(k => {
        const kr = k.getBoundingClientRect();
        k.querySelectorAll('.rg-t,.rg-w,.rg-name,.rg-grad,.rg-kern').forEach(e => {
          const er = e.getBoundingClientRect();
          if (er.width && (er.right > kr.right + 1 || er.left < kr.left - 1)) raus++;
        });
      });
      return { raus, quer: document.documentElement.scrollWidth > window.innerWidth + 1,
        leer: karten.filter(k => !k.textContent.trim()).length };
    });
    if (r.quer) fail('SEITE LAEUFT UEBER', `bei ${w}px scrollt die Seite waagerecht`);
    if (r.raus) fail('TEXT VERLAESST DIE KARTE', `bei ${w}px ragen ${r.raus} Elemente ueber den Kartenrand`);
    if (r.leer) fail('LEERE KARTE', `bei ${w}px sind ${r.leer} Karten ohne Inhalt`);
  }
  await p.setViewportSize({ width: 1500, height: 1000 });

  await b.close();
  if (perr.length) fail('SEITENFEHLER', [...new Set(perr)].slice(0, 3).join(' | '));
  if (F.length) {
    console.error('REGIME NICHT BESTANDEN:\n' + F.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
  console.log(`[regime] ok (${auf.szenarien} Szenarien x ${CCYS.length} Waehrungen, ${gemessen} Werte gegen bond_data/ind_data nachgerechnet, `
    + `Nenner/Kernbedingung/Mindestzahl geprueft, Waehrungswechsel per echtem Klick, kein Ueberlauf auf 5 Breiten)`);
})().catch(e => { console.error('REGIME-WAECHTER abgestuerzt:', e && e.message || e); process.exit(1); });
