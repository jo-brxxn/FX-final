// ══ AUFBAU DER ASSET-SEITE ═════════════════════════════════════════════
//
// Nutzer-Wunsch 2026-09-13, woertlich: "Ich will das jetzt aber alles in der
// Kategorie Assets unter einem Asset viel besser noch mal darstellen" und
// "mach es so, dass, wenn ich dir sage: Aendere mal die und die Karte von der
// Reihenfolge oder Form oder so her, das ganz schnell geht".
//
// ⚠ GENAU DAFUER IST DIESE DATEI DA. Die ganze Seite steht als TABELLE hier
// oben. Eine Kachel verschieben heisst: zwei Eintraege im Array tauschen.
// Eine Kachel entfernen heisst: eine Zeile loeschen. Wer dafuer HTML suchen
// muss, hat schon verloren - deshalb liegt die Anordnung bewusst NICHT im
// Renderer.
//
// ⚠ ALLES HIER IST VORERST PLATZHALTER (Nutzer: "Mach erstmal nicht alles
// direkt schon verknuepft mit Daten ... Setz da wirklich Platzhalter ein").
// Jede erfundene Kachel traegt sichtbar das Abzeichen PLACEHOLDER - Regel 4
// verbietet Zahlen, die echt aussehen, aber keine sind. Beim Verdrahten
// faellt pro Kachel EINE Funktion weg, das Layout bleibt unberuehrt.

// ── Die drei Karten oben, in dieser Reihenfolge ──────────────────────────
// Nutzer 2026-09-13: "1. Inflation 2. Arbeitsmarkt 3. Wirtschaftswachstum".
export const ASSET_CARDS = ['Inflation', 'Labour Market', 'Economic Growth'];

// ── Das Grafik-Band darunter, spaltentreu zu den Karten ──────────────────
// Nutzer: COT unter Inflation, Seasonality unter Wachstum. Die Mitte war
// offen ("Unter Labour market das was passt") - dort steht Retail, damit das
// Band eine Logik hat, die man sich merkt: institutionell, privat, saisonal.
export const ASSET_GRAPHS = ['cot', 'retail', 'seas'];

// ── Das Kontext-Band ─────────────────────────────────────────────────────
// Nutzer: "brauche ich Gold nicht nur, um den Chart zu gucken, sondern auch,
// um sich anzusehen, was der Staat an Leihenrenditen macht. Auch ist es
// wichtig, was der Dollar macht" - und ausdruecklich: "Bei den anderen
// Assets ... braucht man allerdings auch wieder mehrere unterschiedliche
// Charts und Daten".
// Deshalb je Asset-Klasse ein eigener Satz. 'cb' ist der Leitzins - die
// Karte "Interest Rates" faellt weg und nur die Rate bleibt (Nutzer:
// "die Sachen zu interest Rates auch weg machen nicht aufnehmen nur die
// Rate").
const KONTEXT_KLASSE = {
  fx:     ['cb', 'y2', 'y10', 'dxy'],
  metal:  ['y2us', 'y10us', 'dxy'],
  energy: ['dxy', 'y10us', 'spx'],
  index:  ['y10us', 'dxy', 'vix'],
  crypto: ['nas', 'dxy', 'y10us'],
  stock:  ['y10us', 'dxy', 'spx'],
  yield:  ['cb', 'ccy', 'dxy'],
};
// Einzelne Assets, bei denen der Klassensatz nicht passt.
const KONTEXT_ASSET = {
  // Beim Dollar waere eine Dollar-Kachel sinnlos.
  USD: ['cb', 'y2', 'y10', 'spx'],
};

/** Welche Kontext-Kacheln gehoeren zu diesem Asset? */
export function assetContextFor(id, klasse) {
  return (KONTEXT_ASSET[id] || KONTEXT_KLASSE[klasse] || KONTEXT_KLASSE.fx).slice();
}

// ── Beschriftung und Sprungziel je Kachel-Art ────────────────────────────
// ziel = Asset-Id, auf die der Klick springt. Nutzer wollte das ausdruecklich
// fuer den Dollar ("Muss man direkt zum Dollar kommen") - es gilt hier fuer
// JEDE Kachel, weil der Grund derselbe ist.
// Ein '#'-Platzhalter im Ziel wird durch die Waehrung des Assets ersetzt.
export const KONTEXT_ART = {
  cb:    { titel: 'Central Bank Rate', art: 'rate',  ziel: null },
  y2:    { titel: '2Y Yield',          art: 'chart', ziel: '#YIELD' },
  y10:   { titel: '10Y Yield',         art: 'chart', ziel: '#YIELD' },
  y2us:  { titel: 'US 2Y Yield',       art: 'chart', ziel: 'USYIELD' },
  y10us: { titel: 'US 10Y Yield',      art: 'chart', ziel: 'USYIELD' },
  dxy:   { titel: 'Dollar',            art: 'chart', ziel: 'USD' },
  spx:   { titel: 'S&P 500',           art: 'chart', ziel: 'SP500' },
  nas:   { titel: 'Nasdaq',            art: 'chart', ziel: 'NAS' },
  vix:   { titel: 'Volatility',        art: 'chart', ziel: null },
  ccy:   { titel: 'Currency',          art: 'chart', ziel: null },
};

// ══ PLATZHALTER-DATEN ══════════════════════════════════════════════════
//
// ⚠ FEST VERDRAHTETER ZUFALL, kein Math.random(). Eine Kachel, die sich bei
// jedem Neuzeichnen aendert, sieht kaputt aus - und man kann nicht darueber
// reden ("die dritte Kerze von links"), wenn sie beim naechsten Blick anders
// steht. Der Startwert kommt aus Asset-Id + Kachelname, also ist jede Kachel
// stabil und trotzdem von der daneben verschieden.
function saat(txt) {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Kerzen fuer eine Chart-Kachel. */
export function phKerzen(schluessel, n = 34) {
  const r = saat(schluessel);
  const out = [];
  let kurs = 100;
  for (let i = 0; i < n; i++) {
    const o = kurs;
    const spanne = 0.6 + r() * 1.6;
    const c = o + (r() - 0.47) * spanne * 2;
    const h = Math.max(o, c) + r() * spanne;
    const l = Math.min(o, c) - r() * spanne;
    out.push({ o, h, l, c });
    kurs = c;
  }
  return out;
}

/** Long/Short-Anteil fuer COT- und Retail-Platzhalter. */
export function phAnteil(schluessel) {
  const r = saat(schluessel);
  const lang = Math.round(18 + r() * 64);
  return { lang, kurz: 100 - lang };
}

/** Zwoelf Monatswerte fuer das Seasonality-Profil. */
export function phMonate(schluessel) {
  const r = saat(schluessel);
  return Array.from({ length: 12 }, () => +((r() - 0.45) * 4).toFixed(2));
}
