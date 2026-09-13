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

// ⚠ HIER STANDEN BIS 2026-09-13 DREI PLATZHALTER-ERZEUGER (saat/phKerzen/
// phAnteil/phMonate): ein deterministischer Pseudozufallsgenerator, der
// Kerzen, Long/Short-Anteile und Monatsprofile erfunden hat, damit das
// Layout gebaut werden konnte, bevor die Daten dranhingen. Jede dieser
// Kacheln trug dabei sichtbar das Abzeichen PLACEHOLDER.
// Alle drei Kacheln haengen jetzt an echten Feeds (cot_data.json,
// sentiment_data.json, seasonality_data.json), also sind die Erzeuger weg -
// nicht auskommentiert, sondern geloescht. Erfundene Zahlen, die noch
// aufrufbar herumliegen, werden irgendwann wieder aufgerufen.
