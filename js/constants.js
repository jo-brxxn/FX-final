// ══ CONSTANTS ══════════════════════════════════════════════════════
// Erste Datei der schrittweisen Modul-Aufteilung von index.html (Nutzer-
// Wunsch 2026-08-25: "generell das Projekt in Kategorien machen"). Reine
// Daten/pure Helfer ohne jede DOM-/onclick-Kopplung - deshalb als erste,
// risikoärmste Kategorie ausgekoppelt. Siehe docs/CHANGELOG.md fuer den
// vollen Kontext und die Reihenfolge der weiteren Kategorien.
// Der ASSET-NAME neben dem Score traegt dieselbe Bias-Farbe wie die Zahl
// (Nutzer-Wunsch 2026-08-09). Eine dunklere Zweitfassung war kurz probiert
// und auf Nutzer-Wunsch wieder verworfen - falls sie je zurueckkommen soll:
// bull #1d4ed8, bear #b23a3a, neu #475569.
export const BC={bull:'#0B5FCC',bear:'#C50F1A',neu:'#55617A'};
// ⚠ BC ist fuer HELLE Flaechen gebaut. Auf dem Chrome-Grund der
// Navigationsleiste (#2A3757) kommen die drei Werte auf 1,98 / 1,94 / 1,89 -
// praktisch unlesbar (gemessen 2026-08-23). Die Asset-Liste dort faerbt
// deshalb NICHT nach Bias, sondern in den normalen Leisten-Textfarben
// (Nutzer-Wunsch 2026-08-23: "ich will alles in normalem Farben nicht in
// bias Farbe"). Wer dort doch je eine Bias-Farbe einsetzen will, misst sie
// vorher gegen Grund, Hover UND offenen Stapel.
export const BL={bull:'▲ BULLISH',bear:'▼ BEARISH',neu:'◆ NEUTRAL'};
export const FX=['USD','EUR','GBP','CHF','JPY','CAD','AUD','NZD'];
// Landesflaggen fuer den Asset-Seiten-Titel (tech-design-Skill 2026-07-28,
// aus dem Referenz-Mockup: abgerundete Emoji-Stil-Flagge vor dem Ticker-
// Namen, NUR bei echten FX-Waehrungen - Non-FX-Assets wie GOLD/BTC/SP500
// haben keine Landeszugehoerigkeit, bekommen daher keine Flagge).
export const FX_FLAG={USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',CHF:'🇨🇭',JPY:'🇯🇵',CAD:'🇨🇦',AUD:'🇦🇺',NZD:'🇳🇿'};
// FX_FLAG bleibt als Datenquelle/Fallback bestehen; gerendert wird ab
// VERSION-CHECK-374 aber der SVG-Satz unten (assetIconHtml).
/* ============================================================================
   ASSET-ICONS: realistische Flaggen + Rohstoff-/Index-Symbole mit Dauer-
   Animation. Ersetzt die bisherigen Emoji-Flaggen (FX_FLAG) und die
   generischen Strich-Icons der Non-FX-Assets (nonFxWatchIconHtml).

   Aufbau (bewusst so und nicht anders):

   1. Jedes Motiv wird EINMAL als <symbol> in einem globalen, unsichtbaren
      <svg id="aiDefs"> im Body abgelegt. Die Icons selbst sind nur noch
      <use href="#ai-USD">. Bei ~20 gleichzeitig sichtbaren Icons spart das
      die 20-fache Wiederholung derselben Pfade im DOM.

   2. WEHEN: die Flagge wird in 10 senkrechte Streifen geschnitten (clipPath),
      jeder Streifen zeigt dasselbe <use> und bekommt dieselbe Keyframe-
      Animation mit gestaffeltem NEGATIVEM delay - dadurch laeuft eine Welle
      von links nach rechts durch das Tuch.
      ⚠ Das Fenster (clip) und der bewegte Inhalt sind ZWEI geschachtelte
      Gruppen. Liegen clip-path und transform auf DEMSELBEN Element, wandert
      das Fenster mit - dann laesst sich der Streifen nicht kippen, ohne dass
      zwischen den Nachbarn keilfoermige Luecken aufreissen. Aussen also der
      feste Ausschnitt, innen die Bewegung.
      Das Kippen ist der Grund, warum es rund statt kantig wirkt: es folgt der
      STEIGUNG der Welle (Phase um eine Viertelperiode versetzt zur Hoehe) und
      legt damit die Bruchkanten zwischen den Streifen um.
      ⚠ Der physikalisch entscheidende Teil: die Amplitude waechst von der
      Stange (links, fast 0) zum freien Ende (rechts, voll). Eine gleich
      grosse Amplitude ueber die ganze Breite sieht aus wie ein wackelndes
      Rechteck, nicht wie Stoff. Das steckt in --ai-amp pro Streifen.

   3. Nur TRANSFORM + OPACITY werden animiert (Compositor), nie filter/blur -
      siehe die dokumentierte Blur-Performance-Lehre im CLAUDE.md. Bei ~20
      Icons a 6 Streifen laufen sonst 120 teure Repaints pro Frame.

   4. Die Streifen ueberlappen sich um 0.35 Einheiten (clip ist breiter als
      der Raster-Schritt), sonst reisst an den Schnittkanten eine Haarlinie
      auf, sobald zwei Nachbarstreifen unterschiedlich weit verschoben sind.
   ============================================================================ */

// --- kleine Geometrie-Helfer (Sterne von Hand zu tippen ist fehleranfaellig) --
export function aiStar(cx, cy, rOut, points, rot) {
  const rIn = rOut * (points === 5 ? 0.382 : 0.5);
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = (Math.PI / points) * i - Math.PI / 2 + (rot || 0);
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ',' + (cy + Math.sin(a) * r).toFixed(2);
  }
  return d + 'Z';
}
export function aiStars(list) { return list.map(s => aiStar(s[0], s[1], s[2], s[3] || 5, s[4] || 0)).join(''); }

// EU: 12 Sterne auf einem Kreis (r=7), Spitze nach oben
export const AI_EU_STARS = (() => {
  let d = '';
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    d += aiStar(18 + Math.cos(a) * 7.2, 12 + Math.sin(a) * 7.2, 1.55, 5);
  }
  return d;
})();

// Union Jack als eigenes <symbol>, weil GBP/AUD/NZD ihn alle brauchen -
// dreimal denselben Pfadsatz im DOM zu halten waere Verschwendung.
export const AI_UNION_JACK = `
  <rect width="36" height="24" fill="#012169"/>
  <path d="M0,0 36,24 M36,0 0,24" stroke="#fff" stroke-width="4.8"/>
  <path d="M0,0 36,24" stroke="#C8102E" stroke-width="2.4" clip-path="url(#aiUjA)"/>
  <path d="M36,0 0,24" stroke="#C8102E" stroke-width="2.4" clip-path="url(#aiUjB)"/>
  <path d="M18,0 V24 M0,12 H36" stroke="#fff" stroke-width="8"/>
  <path d="M18,0 V24 M0,12 H36" stroke="#C8102E" stroke-width="4.8"/>`;

// ── Kanadisches Ahornblatt: 11 Zacken, in einer 100x100-Box gezeichnet und
//    per transform an seinen Platz gesetzt. In 36x24-Koordinaten direkt zu
//    tippen war der erste Versuch - das Ergebnis sah aus wie ein Busch, weil
//    sich die Rundungsfehler bei so kleinen Schrittweiten aufsummieren.
export const AI_MAPLE = 'M50,7 L55,27 L67,23 L64,36 L78,32 L74,45 L93,43 L86,51 L95,62'
  + ' L69,59 L68,65 L54,61 L57,89 L43,89 L46,61 L32,65 L31,59 L5,62 L14,51'
  + ' L7,43 L26,45 L22,32 L36,36 L33,23 L45,27 Z';

/* Motive. Alle im selben 36x24-Koordinatenraum gezeichnet.
   ⚠ Auch die Schweiz bekommt 3:2 statt des quadratischen Nationalformats:
   in Tabellen/Listen stehen die Flaggen in einer Spalte untereinander, ein
   abweichend schmales Icon bricht die Ausrichtung (CLAUDE.md-Grundsatz
   "alles bleibt exakt untereinander ausgerichtet"). 3:2 ist fuer die Schweiz
   nicht falsch - die Seeflagge (civil ensign) hat genau dieses Format. */
export const AI_FLAGS = {
  USD: `<rect width="36" height="24" fill="#fff"/>` +
    [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${(i * 24 / 13).toFixed(2)}" width="36" height="${(24 / 13).toFixed(2)}" fill="#B22234"/>`).join('') +
    `<rect width="14.4" height="${(24 / 13 * 7).toFixed(2)}" fill="#3C3B6E"/>` +
    (() => { // 9 Reihen abwechselnd 6/5 Sterne - vereinfacht als Punkte, bei 20px ist ein 5-Zack nicht mehr aufloesbar
      let d = '';
      for (let r = 0; r < 9; r++) {
        const odd = r % 2;
        const n = odd ? 5 : 6, y = 1.05 + r * 1.35, x0 = odd ? 2.3 : 1.25;
        for (let c = 0; c < n; c++) d += `<circle cx="${(x0 + c * 2.15).toFixed(2)}" cy="${y.toFixed(2)}" r=".42" fill="#fff"/>`;
      }
      return d;
    })(),

  EUR: `<rect width="36" height="24" fill="#039"/><path d="${AI_EU_STARS}" fill="#FC0"/>`,

  GBP: `<use href="#aiUJ"/>`,

  CHF: `<rect width="36" height="24" fill="#D52B1E"/>` +
    `<path d="M15.6,5.4h4.8v4.2h4.2v4.8h-4.2v4.2h-4.8v-4.2h-4.2v-4.8h4.2Z" fill="#fff"/>`,

  JPY: `<rect width="36" height="24" fill="#fff"/><circle cx="18" cy="12" r="7.2" fill="#BC002D"/>`,

  CAD: `<rect width="36" height="24" fill="#fff"/><rect width="9" height="24" fill="#D52B1E"/>` +
    `<rect x="27" width="9" height="24" fill="#D52B1E"/>` +
    `<path transform="translate(18,12) scale(.215) translate(-50,-50)" d="${AI_MAPLE}" fill="#D52B1E"/>`,

  // ⚠ <use> auf ein <symbol> braucht width/height, sonst rendert Chromium
  //   NICHTS (kein Fehler, einfach leer) - genau daran sind GBP/AUD/NZD im
  //   ersten Anlauf komplett unsichtbar geblieben.
  AUD: `<rect width="36" height="24" fill="#012169"/>` +
    `<use href="#aiUJ" width="36" height="24" transform="scale(.5)"/>` +
    `<path d="${aiStar(9, 18, 2.6, 7)}" fill="#fff"/>` +
    `<path d="${aiStars([[27.5, 5.2, 1.5, 7], [31.6, 11.4, 1.6, 7], [26.4, 15.8, 1.5, 7], [22.6, 10.4, 1.2, 7], [29.2, 8.6, .8, 5]])}" fill="#fff"/>`,

  NZD: `<rect width="36" height="24" fill="#012169"/>` +
    `<use href="#aiUJ" width="36" height="24" transform="scale(.5)"/>` +
    `<path d="${aiStars([[29.5, 5.6, 2.3], [32.4, 12.6, 2.3], [26.6, 16.6, 2.3], [24.4, 9.8, 2.3]])}" fill="#fff"/>` +
    `<path d="${aiStars([[29.5, 5.6, 1.5], [32.4, 12.6, 1.5], [26.6, 16.6, 1.5], [24.4, 9.8, 1.5]])}" fill="#C8102E"/>`,
};

// Yields-Kategorie (Nutzer-Wunsch 2026-08-24): Zuordnung Yield-Asset-ID ->
// zugrundeliegende Waehrung. Treibt sowohl die Icon-Zusammensetzung hier
// (AI_SYMBOLS/AI_GLYPHS unten) als auch linkCcy/MACRO_DERIVE_RULES/
// RISK_ENV_DEFAULT_DIR bei den DEF-Eintraegen weiter unten - eine einzige
// Quelle statt derselben 8 Paare mehrfach von Hand zu wiederholen. Vor
// AI_SYMBOLS platziert, weil dessen Aufbau unten am Modul-Ladezeitpunkt
// bereits darauf zugreift (const ist sonst noch nicht initialisiert - TDZ).
export const YIELD_CCY={USYIELD:'USD',DEYIELD:'EUR',GBYIELD:'GBP',CHYIELD:'CHF',JPYIELD:'JPY',CAYIELD:'CAD',AUYIELD:'AUD',NZYIELD:'NZD'};
/* Non-FX: keine Flaggen, sondern das Material/Instrument selbst.
   Jedes bekommt eine EIGENE, zum Motiv passende Dauerbewegung statt eines
   generischen Pulsierens - genau das war der Nutzer-Wunsch ("das Oel Symbol
   tropfen usw"). */
export const AI_SYMBOLS = {
  OIL: `
    <defs>
      <linearGradient id="aiOilG" x1="0" y1="0" x2=".35" y2="1">
        <stop offset="0" stop-color="#4a5560"/><stop offset=".45" stop-color="#1c2430"/><stop offset="1" stop-color="#0a0e14"/>
      </linearGradient>
    </defs>
    <path d="M18,3.2 C22.6,9 25.4,12.6 25.4,15.8 a7.4,7.4 0 0 1-14.8,0 C10.6,12.6 13.4,9 18,3.2Z" fill="url(#aiOilG)"/>
    <ellipse cx="14.9" cy="14.4" rx="1.9" ry="2.7" fill="#fff" opacity=".26" transform="rotate(-20 14.9 14.4)"/>
    <path class="ai-drip" d="M18,3.2 C19.4,5 20.3,6.2 20.3,7.2 a2.3,2.3 0 0 1-4.6,0 C15.7,6.2 16.6,5 18,3.2Z" fill="url(#aiOilG)"/>`,

  GOLD: `
    <defs>
      <linearGradient id="aiGoldTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFF0B8"/><stop offset=".5" stop-color="#FFD35C"/><stop offset="1" stop-color="#E8A62C"/>
      </linearGradient>
      <linearGradient id="aiGoldFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#F2BE45"/><stop offset="1" stop-color="#C7891F"/>
      </linearGradient>
    </defs>
    <g transform="translate(18,12.2) scale(1.28) translate(-18,-12.2)">
    <path d="M8.2,9.6 h19.6 l2.6,9.4 h-24.8Z" fill="url(#aiGoldFront)"/>
    <path d="M10.6,5.4 h14.8 l2.4,4.2 h-19.6Z" fill="url(#aiGoldTop)"/>
    <path d="M8.2,9.6 h19.6" stroke="#fff" stroke-width=".5" opacity=".45"/>
    <g clip-path="url(#aiBarClip)"><path class="ai-sheen-el" d="M2,22 L10,2 L14,2 L6,22Z" fill="#fff" opacity=".5"/></g>
    </g>`,

  SILVER: `
    <defs>
      <linearGradient id="aiSilTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#DCE3EA"/><stop offset="1" stop-color="#A9B4C0"/>
      </linearGradient>
      <linearGradient id="aiSilFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#CBD4DE"/><stop offset="1" stop-color="#8994A2"/>
      </linearGradient>
    </defs>
    <g transform="translate(18,12.2) scale(1.28) translate(-18,-12.2)">
    <path d="M8.2,9.6 h19.6 l2.6,9.4 h-24.8Z" fill="url(#aiSilFront)"/>
    <path d="M10.6,5.4 h14.8 l2.4,4.2 h-19.6Z" fill="url(#aiSilTop)"/>
    <path d="M8.2,9.6 h19.6" stroke="#fff" stroke-width=".5" opacity=".5"/>
    <g clip-path="url(#aiBarClip)"><path class="ai-sheen-el" d="M2,22 L10,2 L14,2 L6,22Z" fill="#fff" opacity=".55"/></g>
    </g>`,

  BTC: `
    <defs>
      <linearGradient id="aiBtcG" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stop-color="#FBB03B"/><stop offset=".55" stop-color="#F7931A"/><stop offset="1" stop-color="#D9770A"/>
      </linearGradient>
    </defs>
    <circle cx="18" cy="12" r="9.4" fill="url(#aiBtcG)"/>
    <circle cx="18" cy="12" r="9.4" fill="none" stroke="#fff" stroke-width=".7" opacity=".3"/>
    <path d="M15.1,6.9 h4.1 c2.5,0 3.9,1.1 3.9,2.9 0,1.2-.6,2-1.7,2.4 1.4.35 2.2,1.3 2.2,2.7 0,2-1.6,3.2-4.3,3.2 h-4.2Z
             M17.3,8.7 v2.6 h1.7 c1.1,0 1.7-.45 1.7-1.3 0-.85-.6-1.3-1.7-1.3Z
             M17.3,13 v3 h1.9 c1.3,0 2-.5 2-1.5 0-1-.7-1.5-2-1.5Z" fill="#fff"/>
    <path d="M17.2,4.6 h1.5 v2.6 h-1.5Z M19.6,4.6 h1.5 v2.6 h-1.5Z
             M17.2,16.9 h1.5 v2.6 h-1.5Z M19.6,16.9 h1.5 v2.6 h-1.5Z" fill="#fff"/>
    <g clip-path="url(#aiCoinClip)"><path class="ai-sheen-el" d="M-2,22 L6,2 L10,2 L2,22Z" fill="#fff" opacity=".38"/></g>`,
};
// Yields-Kategorie, grosser animierter Icon-Satz (Asset-Kopfzeile, Research-
// Terminal-Sidebar, ...): dieselbe Verkleinern-plus-Abzeichen-Idee wie bei
// AI_GLYPHS oben, hier per <use> auf die bereits registrierte Flaggen-<symbol>
// der zugrundeliegenden Waehrung (kein eigenes Wehen noetig/gewuenscht - ein
// zusaetzliches Abzeichen soll ruhig stehen, nicht mitwehen). Badge in einer
// festen dunklen Farbe statt currentColor, da der Hintergrund hier (anders als
// bei AI_GLYPHS) je nach Flagge stark wechselt und ein reines Konturzeichen
// auf hellen Flaggen (z.B. CHF) kaum sichtbar waere.
export const AI_BOND_BADGE = '<circle cx="29.6" cy="18" r="6.2" fill="#1B2431"/><circle cx="29.6" cy="18" r="6.2" fill="none" stroke="#fff" stroke-width=".7" opacity=".35"/>'
  + '<path d="M26.4 16.4h6.4M26.4 19.6h4.4" stroke="#fff" stroke-width="1.25" stroke-linecap="round"/>';
Object.keys(YIELD_CCY).forEach(id=>{
  AI_SYMBOLS[id]=`<use href="#ai-${YIELD_CCY[id]}" transform="scale(.78)"/>`+AI_BOND_BADGE;
});

// Indizes teilen sich dieselbe Zeichnung (Kursverlauf im Rahmen), nur der
// Akzentton unterscheidet sie - eine eigene Metapher je Index waere
// Bedeutung, die es nicht gibt.
export function aiIndex(accent) {
  return `
    <rect x="3.2" y="3.6" width="29.6" height="16.8" rx="2.4" fill="#131A24"/>
    <rect x="3.2" y="3.6" width="29.6" height="16.8" rx="2.4" fill="none" stroke="${accent}" stroke-width=".8" opacity=".55"/>
    <path class="ai-tick" d="M6.4,16.4 L11,12.6 L14.6,14.4 L19.4,9.2 L23.6,11.4 L29.6,6.6"
          fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle class="ai-tick-dot" cx="29.6" cy="6.6" r="1.5" fill="${accent}"/>`;
}
export const AI_INDEX_ACCENT = { SP500: '#4FA3F7', NAS: '#7C7CF0', DAX: '#F0C24F', GER100: '#F0C24F' };
