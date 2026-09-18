// ── ERKLAERUNGEN GEHOEREN HINTER DAS ⓘ, NICHT IN DIE KARTE ──────────────
// Dauerregel, Nutzer 2026-09-18 (woertlich): "Auf der Karte steht eine
// Erklaerung unten die nimmt viel Platz mach die Erklaerung so das man sie
// sieht wenn man auf ein i mit einem Kreis herum drueckt das steht neben dem
// Namen. Leg das auch als Regel fest und setz das ueberall um die Erklaerung
// oeffnet sich dann zentriert als Fenster und muss uebersichtlich sein."
//
// Warum ein Waechter und kein Absatz in der Doku: die naechste neue Karte
// bekommt sonst wieder eine Fusszeile, weil das beim Schreiben der naheliegende
// Ort ist. Ein Absatz erinnert niemanden, ein roter Lauf schon.
//
// Geprueft wird in drei Stufen:
//   A) statisch - die abgeschafften Erklaer-Klassen kommen im Code nicht mehr vor
//   B) im DOM   - sie kommen auf keiner Seite mehr vor
//   C) im DOM   - JEDES ⓘ oeffnet wirklich das zentrierte Fenster MIT Text
// Stufe C ist die wichtigste: ein ⓘ, das nichts oeffnet, ist schlimmer als
// gar keins (CLAUDE.md Regel 6 - jedes Bedienelement muss etwas tun).
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);
const { wartenBisDatenDa } = require('./warten.js');
const URL = process.env.CHECK_URL || 'http://127.0.0.1:8935/index.html';
const WURZEL = path.join(__dirname, '..');

// Klassen, die es fuer Kartenerklaerungen nicht mehr geben darf. Sie sind
// bewusst namentlich gelistet statt heuristisch gesucht: eine Heuristik
// ("Text unten in einer Karte") trifft auch Datenzeilen, und ein Waechter mit
// Fehlalarmen wird abgeschaltet.
// ⚠ `abc-foot` steht hier mit einem Zusatz: die Kalenderkarte traegt dort
// weiterhin ihren ABDECKUNGSZEITRAUM, und der ist Inhalt, keine Erklaerung -
// er aendert sich taeglich, und check/display.js verlangt ihn ausdruecklich.
// Verboten ist nur eine abc-foot OHNE die Marke `abc-range`, also die alte
// Erklaer-Fusszeile. Genau diese Unterscheidung ist die Dauerregel selbst:
// aendert sich der Satz mit den Daten, ist er Inhalt.
const VERBOTEN = [
  { kl: 'ab-note',          sel: '.ab-note' },
  { kl: 'abc-foot',         sel: '.abc-foot:not(.abc-range)' },
  { kl: 'histp-modelnote',  sel: '.histp-modelnote' }
];
const SEITEN = ['dash', 'assets', 'trends', 'calendar', 'regime', 'news', 'sentiment', 'research'];

const fehler = [];
let geprueft = { statisch: 0, dom: 0, knoepfe: 0 };

// ── A) statisch ────────────────────────────────────────────────────────
for (const datei of ['js/main.js', 'js/score.js', 'js/calendar.js', 'js/data-feeds.js', 'js/regime.js', 'js/globe.js']) {
  const p = path.join(WURZEL, datei);
  if (!fs.existsSync(p)) continue;
  const txt = fs.readFileSync(p, 'utf8');
  txt.split('\n').forEach((z, i) => {
    VERBOTEN.forEach(v => {
      if (z.includes('class="' + v.kl + '"') || z.includes("class='" + v.kl + "'")) {
        fehler.push(`${datei}:${i + 1} baut noch eine Erklaerung als .${v.kl} in den Kartenkoerper. ` +
          `Sie gehoert hinter das ⓘ: abTile(...,erkl) bzw. abInfoBtn(titel,erkl).`);
      }
      geprueft.statisch++;
    });
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const jsFehler = [];
  p.on('pageerror', e => jsFehler.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('fxpro_help_seen', '1'); localStorage.setItem('dmfx_app_choice', 'fx'); } catch (e) {} });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => { ['introOv', 'lockScreen', 'appChoiceOv'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  await wartenBisDatenDa(p);

  const pruefeSeite = async (name) => {
    geprueft.dom++;
    // B) verbotene Klassen im DOM
    const treffer = await p.evaluate(v => v.map(x => [x.kl, document.querySelectorAll(x.sel).length]), VERBOTEN);
    treffer.forEach(([kl, n]) => {
      if (n) fehler.push(`[${name}] ${n}x .${kl} im DOM - Erklaerung steht noch im Kartenkoerper statt hinter dem ⓘ.`);
    });
    // C) jedes ⓘ oeffnet EIN zentriertes Fenster mit Text
    // ⚠ Es wird bewusst NICHT auf ein bestimmtes Fenster geprueft: es gibt drei
    // Erklaerwege (openCardInfo fuer Karten, openInfoM fuer Indikatoren,
    // openSentInfoM fuer Sentiment), und alle drei tragen dasselbe ⓘ. Die
    // Regel lautet "zentriertes Fenster mit uebersichtlichem Text", nicht
    // "dieses eine Fenster" - ein Waechter, der das verwechselt, meldet die
    // beiden anderen faelschlich als kaputt (beim ersten Lauf genau passiert).
    const knoepfe = await p.$$('.info-b,.rinfo');
    for (let i = 0; i < knoepfe.length; i++) {
      // Vorzustand: ALLE Fenster zu, sonst misst der naechste Klick ein altes.
      await p.evaluate(() => document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; }));
      try { await knoepfe[i].click({ timeout: 1200 }); } catch (e) { continue; }
      await p.waitForTimeout(160);
      const r = await p.evaluate(() => {
        const offen = [...document.querySelectorAll('.ov')].filter(o => getComputedStyle(o).display !== 'none');
        if (!offen.length) return { grund: 'kein Fenster ging auf' };
        if (offen.length > 1) return { grund: offen.length + ' Fenster gingen gleichzeitig auf (' + offen.map(o => o.id).join(', ') + ')' };
        const ov = offen[0], m = ov.querySelector('.modal');
        if (!m) return { grund: '#' + ov.id + ' ohne .modal' };
        const mb = m.getBoundingClientRect();
        const h3 = m.querySelector('h3');
        const cb = document.getElementById('mCardInfoBody');
        return { ok: true, id: ov.id, titel: (h3 ? h3.textContent : '').trim().slice(0, 30),
          zeichen: m.textContent.trim().length,
          // Nur fuer die KARTEN-Erklaerung: ein Absatz je Gedanke.
          absaetze: ov.id === 'mCardInfo' && cb ? cb.querySelectorAll('p').length : null,
          mittigX: Math.abs((mb.left + mb.width / 2) - window.innerWidth / 2),
          mittigY: Math.abs((mb.top + mb.height / 2) - window.innerHeight / 2) };
      });
      geprueft.knoepfe++;
      if (!r.ok) { fehler.push(`[${name}] ⓘ #${i + 1}: ${r.grund}.`); continue; }
      // 40 Zeichen: Titel + "Done" allein sind schon rund 20 - darunter steht
      // faktisch keine Erklaerung im Fenster.
      if (r.zeichen < 40) fehler.push(`[${name}] ⓘ #${i + 1} oeffnet #${r.id} mit nur ${r.zeichen} Zeichen - faktisch leer.`);
      if (r.mittigX > 2) fehler.push(`[${name}] ⓘ #${i + 1} (#${r.id}, "${r.titel}") steht ${Math.round(r.mittigX)}px neben der Mitte (waagerecht).`);
      if (r.mittigY > 2) fehler.push(`[${name}] ⓘ #${i + 1} (#${r.id}, "${r.titel}") steht ${Math.round(r.mittigY)}px neben der Mitte (senkrecht).`);
      if (r.absaetze === 0) fehler.push(`[${name}] Karten-ⓘ #${i + 1} ("${r.titel}") zeigt Text ohne Absaetze - "muss uebersichtlich sein".`);
      await p.evaluate(() => document.querySelectorAll('.ov').forEach(o => { o.style.display = 'none'; }));
      await p.waitForTimeout(60);
    }
  };

  for (const s of SEITEN) {
    try {
      await p.evaluate(n => { if (typeof showTab === 'function') showTab(n); }, s);
      await p.waitForTimeout(800);
      await pruefeSeite(s);
    } catch (e) { fehler.push(`[${s}] nicht pruefbar: ${e.message}`); }
  }
  await p.evaluate(() => { if (typeof gotoSym === 'function') gotoSym('USD'); });
  await p.waitForTimeout(2200);
  await pruefeSeite('asset:USD');

  if (jsFehler.length) fehler.push('JS-Fehler waehrend der Pruefung: ' + jsFehler.slice(0, 3).join(' | '));
  await b.close();

  // ⚠ Nichts geprueft ist KEIN Bestanden. Ohne diese Zeile waere der Waechter
  // gruen, sobald die Seite gar nicht mehr laedt oder die Knoepfe verschwinden -
  // genau die Sorte leerer Zusicherung, die check/historie.js schon einmal
  // hatte (dort: 6 gemeldete Faelle, 0 tatsaechlich nachgerechnet).
  if (!geprueft.knoepfe) fehler.push('Kein einziges ⓘ gefunden - die Pruefung hat nichts gesehen, das ist kein Bestanden.');

  if (fehler.length) {
    console.error('[erklaerung] NICHT BESTANDEN');
    fehler.slice(0, 40).forEach(f => console.error('  ' + f));
    if (fehler.length > 40) console.error(`  ... und ${fehler.length - 40} weitere`);
    process.exit(1);
  }
  console.log(`[erklaerung] ok (${geprueft.dom} Seiten, ${geprueft.knoepfe} ⓘ-Knoepfe angeklickt und geoeffnet, ` +
    `${VERBOTEN.length} abgeschaffte Klassen nirgends mehr gefunden)`);
})();
