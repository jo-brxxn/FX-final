'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - THEMEN EINES GERICHTS
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).
//
// Nutzer-Wunsch 2026-09-03: "ich will das ich dann diese Quellen gut
// sortiert bekomme. Aber nicht nur nach Quellen sondern auch vlt nach mit
// Fleisch ohne Fleisch und Fisch und Nudeln und Suppe usw".
//
// ⚠ DIESE DATEI LAEUFT AN ZWEI STELLEN: in der App (Filterleiste) und im
// Feed-Werkzeug auf dem GitHub-Runner (tools/rezept-feed.js). Deshalb steht
// hier NUR reines JavaScript - kein DOM, kein localStorage, kein import aus
// der App. Zwei getrennte Fassungen waeren die sichere Art, dass ein
// Vorschlag in der Liste anders einsortiert ist als im Filter.
//
// ⚠ SPRACHE: Titel und Zutaten kommen mal deutsch, mal englisch herein
// (TheMealDB und Spoonacular englisch, Foodblogs und YouTube oft deutsch).
// Jedes Thema traegt deshalb Woerter in beiden Sprachen. Die Oberflaeche
// zeigt ausschliesslich die englischen Labels - feste Projektregel.
//
// ⚠ NICHTS RATEN: findet sich kein Merkmal, bekommt das Gericht KEIN Thema
// und landet im Filter unter "All". Ein falsch gesetztes "Vegetarian" waere
// schlimmer als gar keins - danach sucht jemand, der kein Fleisch essen
// will.

// Die Themen in der Reihenfolge, in der sie in der Filterleiste stehen.
// Bewusst kurz gehalten: 12 Knoepfe kann man ueberblicken, 40 nicht.
export const THEMEN = [
  { id: 'meat',       label: 'Meat',        icon: '🥩' },
  { id: 'chicken',    label: 'Chicken',     icon: '🍗' },
  { id: 'fish',       label: 'Fish',        icon: '🐟' },
  { id: 'veggie',     label: 'No meat',     icon: '🥗' },
  // ⚠ "High protein" steht hier, "Healthy" NICHT. Proteinreich laesst sich
  // an den Zutaten festmachen (Haehnchenbrust, Quark, Tofu, Linsen ...);
  // "gesund" hat in diesen Daten keine Grundlage - Naehrwerte liefert nur
  // Spoonacular, TheMealDB und Blogs nicht. Ein Healthy-Chip waere ein
  // erfundenes Etikett. Nutzer-Wunsch 2026-09-03 entsprechend beantwortet:
  // gesund kommt ueber die AUSWAHL DER QUELLEN, nicht ueber ein Label.
  { id: 'protein',    label: 'High protein', icon: '💪' },
  { id: 'pasta',      label: 'Pasta',       icon: '🍝' },
  { id: 'rice',       label: 'Rice & Bowls', icon: '🍚' },
  { id: 'soup',       label: 'Soup',        icon: '🍲' },
  { id: 'salad',      label: 'Salad',       icon: '🥬' },
  { id: 'potato',     label: 'Potato',      icon: '🥔' },
  { id: 'bread',      label: 'Bread & Dough', icon: '🍞' },
  { id: 'sweet',      label: 'Sweet',       icon: '🍰' },
  { id: 'breakfast',  label: 'Breakfast',   icon: '🍳' },
];
export const THEMA_BY_ID = Object.fromEntries(THEMEN.map(t => [t.id, t]));

// ── Wortlisten ───────────────────────────────────────────────────────────
// ⚠ Jedes Wort steht als GANZES Wort im Text (Wortgrenzen), sonst faengt
// "ei" in "Zwiebel" und jedes Gericht waere ploetzlich ein Fruehstueck.
// ⚠ "Bolognese" und "Ragù" stehen BEWUSST NICHT in der Fleischliste. Der
// Pruef-Lauf vom 2026-09-03 hat "Easy Eggplant Bolognese" (rein pflanzlich,
// 16 Zutaten, kein Gramm Fleisch) als Fleischgericht einsortiert - der Name
// einer Sauce sagt nichts ueber ihren Inhalt. Fleisch wird an den ZUTATEN
// erkannt (Hackfleisch, mince, ...), nicht am Gerichtnamen.
// Mehrwortbegriffe ("ground beef") sind erlaubt und werden als Folge
// gesucht.
const WOERTER = {
  chicken: ['chicken', 'hähnchen', 'haehnchen', 'huhn', 'hühnchen', 'huehnchen', 'poulet',
    'pute', 'turkey', 'ente', 'duck', 'geflügel', 'gefluegel', 'chicken breast', 'chicken thigh'],
  meat: ['beef', 'rind', 'rinder', 'rindfleisch', 'steak', 'hack', 'hackfleisch', 'mince',
    'ground beef', 'pork', 'schwein', 'schweine', 'schweinefleisch', 'lamm', 'lamb', 'kalb', 'veal',
    'speck', 'bacon', 'schinken', 'ham', 'wurst', 'sausage', 'salami', 'chorizo', 'gulasch',
    'goulash', 'braten', 'roast beef', 'meatball', 'frikadelle',
    'prosciutto', 'pancetta', 'kassler', 'leber', 'liver', 'fleisch'],
  fish: ['fish', 'fisch', 'lachs', 'salmon', 'thunfisch', 'tuna', 'kabeljau', 'cod', 'dorsch',
    'forelle', 'trout', 'zander', 'seelachs', 'pollock', 'hering', 'herring', 'sardine',
    'makrele', 'mackerel', 'wolfsbarsch', 'sea bass', 'garnele', 'garnelen', 'shrimp', 'prawn',
    'scampi', 'muschel', 'muscheln', 'mussel', 'clam', 'tintenfisch', 'calamari', 'squid',
    'octopus', 'krabbe', 'crab', 'hummer', 'lobster', 'jakobsmuschel', 'scallop',
    'meeresfrüchte', 'meeresfruechte', 'seafood',
    // ⚠ Diese Liste wurde nach dem ersten scharfen Lauf erweitert: fehlte
    // eine Art, bekam das Gericht faelschlich "No meat" - die gefaehrliche
    // Richtung. "Kedgeree" (Schellfisch) und "Spaghetti alle Vongole" waren
    // genau das. Lieber eine Art zu viel in der Liste als ein Fischgericht
    // unter "ohne Fleisch".
    'haddock', 'schellfisch', 'scholle', 'plaice', 'seezunge', 'sole', 'barsch',
    'perch', 'karpfen', 'carp', 'wels', 'catfish', 'dorade', 'seabream', 'sea bream',
    'snapper', 'tilapia', 'pangasius', 'heilbutt', 'halibut', 'seeteufel', 'monkfish',
    'schwertfisch', 'swordfish', 'rotbarsch', 'redfish', 'aal', 'eel', 'sepia',
    'auster', 'oyster', 'vongole', 'venusmuschel', 'langustine', 'langoustine',
    'king prawn', 'krebs', 'crayfish', 'surimi', 'kaviar', 'caviar', 'rogen', 'roe'],
  pasta: ['pasta', 'nudel', 'nudeln', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'tagliatelle',
    'linguine', 'farfalle', 'lasagne', 'lasagna', 'ravioli', 'tortellini', 'gnocchi', 'orzo',
    'macaroni', 'makkaroni', 'cannelloni', 'noodle', 'noodles', 'ramen', 'udon', 'soba',
    'spätzle', 'spaetzle', 'maultaschen', 'carbonara'],
  rice: ['rice', 'reis', 'risotto', 'paella', 'jasminreis', 'basmati', 'sushi', 'bowl',
    'poke', 'quinoa', 'couscous', 'bulgur', 'pilaw', 'pilaf', 'jambalaya', 'biryani',
    'fried rice', 'gebratener reis'],
  soup: ['soup', 'suppe', 'eintopf', 'stew', 'broth', 'brühe', 'bruehe', 'bouillon', 'ramen',
    'chowder', 'bisque', 'minestrone', 'gulaschsuppe', 'chili', 'curry soup', 'topf'],
  salad: ['salad', 'salat', 'coleslaw', 'krautsalat', 'caesar', 'bowl salad', 'rohkost',
    'tabouleh', 'caprese'],
  potato: ['potato', 'potatoes', 'kartoffel', 'kartoffeln', 'süßkartoffel', 'suesskartoffel',
    'sweet potato', 'pommes', 'fries', 'bratkartoffeln', 'kartoffelbrei', 'mashed potato',
    'gnocchi', 'rösti', 'roesti', 'auflauf mit kartoffeln'],
  bread: ['bread', 'brot', 'brötchen', 'broetchen', 'roll', 'baguette', 'focaccia', 'ciabatta',
    'pizza', 'teig', 'dough', 'flammkuchen', 'wrap', 'tortilla', 'naan', 'pita', 'sandwich',
    'burger bun', 'toast', 'quiche', 'tarte', 'blätterteig', 'blaetterteig'],
  sweet: ['cake', 'kuchen', 'torte', 'dessert', 'nachtisch', 'cookie', 'keks', 'plätzchen',
    'plaetzchen', 'brownie', 'muffin', 'cupcake', 'pudding', 'mousse', 'eis', 'ice cream',
    'sorbet', 'tiramisu', 'cheesecake', 'käsekuchen', 'kaesekuchen', 'crumble', 'strudel',
    'waffel', 'waffle', 'donut', 'schokolade', 'chocolate', 'karamell', 'caramel', 'süßspeise',
    'suessspeise', 'kompott', 'creme brulee', 'pancake', 'pfannkuchen', 'crepe', 'crêpe'],
  breakfast: ['breakfast', 'frühstück', 'fruehstueck', 'porridge', 'oatmeal', 'haferbrei',
    'overnight oats', 'müsli', 'muesli', 'granola', 'rührei', 'ruehrei', 'scrambled egg',
    'spiegelei', 'fried egg', 'omelett', 'omelette', 'pancake', 'pfannkuchen', 'french toast',
    'arme ritter', 'bagel', 'smoothie bowl', 'shakshuka'],
};

// ⚠ PROTEINREICH: nur EIWEISSTRAEGER, die ein Gericht wirklich tragen.
// Speck als Garnitur oder ein Ei im Kuchen zaehlen nicht - siehe die Regel
// weiter unten. Zusammengesetzte Woerter wie "Magerquark" oder
// "Haehnchenbrust" werden ueber die Stammliste mitgefunden.
const PROTEIN = ['chicken', 'hähnchen', 'haehnchen', 'hühnchen', 'huehnchen', 'pute', 'turkey',
  'beef', 'rind', 'rinderfilet', 'steak', 'hackfleisch', 'mince', 'lamm', 'lamb',
  'lachs', 'salmon', 'thunfisch', 'tuna', 'kabeljau', 'cod', 'garnelen', 'shrimp', 'prawn',
  'tofu', 'tempeh', 'seitan', 'sojaschnetzel', 'soja granulat', 'edamame',
  'quark', 'magerquark', 'skyr', 'hüttenkäse', 'huettenkaese', 'cottage cheese', 'harzer',
  'griechischer joghurt', 'greek yogurt', 'greek yoghurt', 'proteinpulver', 'protein powder',
  'eiweisspulver', 'eiweißpulver', 'whey', 'casein', 'proteinriegel',
  'linsen', 'lentils', 'kichererbsen', 'chickpeas', 'bohnen', 'beans', 'erbsenprotein',
  'lupinen', 'lupine', 'seelachs', 'putenbrust', 'hähnchenbrust', 'haehnchenbrust'];
// Eier zaehlen mit - aber nicht in einem Kuchen (siehe themenOf).
const EIER = ['ei', 'eier', 'egg', 'eggs', 'eiklar', 'egg white', 'egg whites', 'eiweiss'];

// Diese Zutaten machen ein Gericht NICHT vegetarisch, obwohl sie in keiner
// der Fleisch-/Fischlisten oben stehen (versteckte tierische Bestandteile).
// ⚠ Hier stehen WUERZMITTEL, nicht Hauptbestandteile. Im ersten scharfen
// Lauf (2026-09-03) bekam ein Panang-Curry mit Fischsauce und Garnelenpaste
// das Thema "Fish" - wer danach filtert, erwartet aber ein Fischgericht und
// nicht ein Huehnercurry mit einem Teeloeffel Paste. Diese Begriffe werden
// deshalb vor der Themensuche aus dem Text genommen; fuer "No meat" zaehlen
// sie weiter. Dazu gehoeren auch Sardellen: der Pruef-Lauf hat "Mushroom
// Ragu Pasta" (3 TL Sardellenfilet in der Sauce) als Fischgericht
// einsortiert - wer nach Fisch sucht, meint keine Wuerzpaste.
const NICHT_VEGGIE = ['gelatine', 'gelatin', 'worcester', 'worcestershire', 'fischsauce',
  'fish sauce', 'austernsauce', 'oyster sauce', 'shrimp paste', 'garnelenpaste',
  'anchovy', 'anchovies', 'anchovy paste', 'anchovy fillet', 'anchovy fillets',
  'sardelle', 'sardellen', 'sardellenpaste', 'sardellenfilet', 'schmalz', 'lard', 'brühwürfel',
  'bruehwuerfel', 'hühnerbrühe', 'huehnerbruehe', 'chicken stock', 'chicken broth',
  'beef stock', 'rinderbrühe', 'rinderbruehe', 'bacon fat'];

// ⚠ DEUTSCHE ZUSAMMENSETZUNGEN. "Tomatensuppe" ist EIN Wort - eine Suche
// nach ganzen Woertern findet "suppe" darin nie, und das Gericht haette
// kein Thema. Fuer diese Staemme wird deshalb zusaetzlich INNERHALB von
// Woertern gesucht. Alle mindestens 5 Zeichen lang: kuerzere Staemme
// treffen zu oft daneben ("reis" steckt in "Preiselbeere").
const STAMM = ['suppe', 'eintopf', 'salat', 'kuchen', 'nudel', 'kartoffel', 'fleisch',
  'wurst', 'hähnchen', 'haehnchen', 'hühnchen', 'huehnchen', 'lachs', 'garnele', 'muschel',
  'brötchen', 'broetchen', 'auflauf', 'pfannkuchen', 'plätzchen', 'plaetzchen', 'spätzle',
  'spaetzle', 'risotto', 'lasagne', 'spaghetti', 'schokolade', 'frühstück', 'fruehstueck',
  'brühe', 'bruehe', 'schnitzel', 'gulasch', 'burger', 'strudel', 'waffel',
  'quark', 'linsen', 'kichererbsen', 'bohnen', 'joghurt', 'protein', 'tofu', 'skyr'];
// ⚠ "braten" fehlt hier absichtlich: als Wortbestandteil traefe es
// "gebratene Zwiebeln" und "Bratensosse" - als ganzes Wort ("Braten") bleibt
// es in der Fleischliste.

// ── Suche ────────────────────────────────────────────────────────────────
function normText(s) {
  return ' ' + String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim() + ' ';
}
function enthaelt(text, woerter) {
  for (const w of woerter) {
    const n = normText(w).trim();
    if (!n) continue;
    if (text.includes(' ' + n + ' ')) return w;
    // Englische Mehrzahl: "pancakes" zu "pancake". ⚠ Erst ab 4 Zeichen,
    // sonst wuerde "ei" + s auf "Eis" passen - und Eis ist kein Ei.
    if (n.length >= 4 && text.includes(' ' + n + 's ')) return w;
    // Nur fuer die Staemme oben zusaetzlich innerhalb eines Wortes suchen.
    // ⚠ Die Laenge deckelt nur Zufallstreffer ab; STAMM ist eine kuratierte
    // Liste, deshalb reichen hier 4 Zeichen ("tofu" in "Raeuchertofu").
    if (n.length >= 4 && STAMM.includes(n) && text.includes(n)) return w;
  }
  return '';
}

/**
 * Nimmt die Wuerzmittel aus NICHT_VEGGIE aus einem normierten Text.
 * ⚠ Wird ZWEIMAL gebraucht: einmal fuer den Gesamttext (Themensuche) und
 * einmal fuer die Zutaten allein (Proteinsuche). Ohne den zweiten Aufruf
 * machte "500 ml chicken stock" im Risotto daraus ein Proteingericht -
 * derselbe Fehler wie bei "Fisch", nur an einer anderen Stelle.
 * @returns {{text: string, gefunden: boolean}}
 */
function ohneWuerzmittel(t) {
  let text = t, gefunden = false;
  NICHT_VEGGIE.forEach(w => {
    const n = normText(w).trim();
    if (!n) return;
    if (text.includes(n)) { gefunden = true; text = text.split(n).join(' '); }
  });
  return { text, gefunden };
}

/**
 * Themen eines Gerichts aus Titel, Zutaten und vorhandenen Tags.
 * Gibt eine Liste von Themen-IDs zurueck - ein Gericht darf mehrere haben
 * ("Chicken noodle soup" ist chicken UND pasta UND soup).
 * @param {string} titel
 * @param {string[]} zutaten
 * @param {string[]} [tags]  z.B. "Vegetarian" von TheMealDB/Spoonacular
 */
export function themenOf(titel, zutaten, tags) {
  const alleTags = (tags || []).join(' ');
  const roh = normText([titel, (zutaten || []).join(' '), alleTags].join(' '));
  // ⚠ Zuerst die versteckten tierischen Zutaten AUS DEM TEXT nehmen, bevor
  // die Themen gesucht werden. Sonst waere jedes Pad Thai mit Fischsauce
  // ein "Fisch"-Gericht - und wer nach Fisch filtert, bekaeme Gerichte ohne
  // ein Stueck Fisch darin. Gemerkt wird der Fund trotzdem: fuer "No meat"
  // zaehlt er.
  const gesaeubert = ohneWuerzmittel(roh);
  const text = gesaeubert.text, versteckt = gesaeubert.gefunden;
  const raus = [];

  const hatChicken = !!enthaelt(text, WOERTER.chicken);
  const hatMeat = !!enthaelt(text, WOERTER.meat);
  const hatFish = !!enthaelt(text, WOERTER.fish);

  // ⚠ SAGT DAS REZEPT SELBST "vegan"/"vegetarisch", gibt es KEIN Fleisch und
  // keinen Fisch - egal was in der Zutatenliste steht. Grund (Pruef-Lauf
  // 2026-09-03): "Veganes Pizza-Sandwich mit Tofu-Ricotta" landete unter
  // Meat, weil pflanzliche Produkte nach ihrem Vorbild heissen ("vegane
  // Salami", "Räuchertofu", "Sojaschnetzel"). Die Selbstauskunft des
  // Rezepts wiegt schwerer als ein Produktname.
  // ⚠ Ohne abschliessende Wortgrenze: im Deutschen steht da "veganes",
  // "vegane", "vegetarische" - ein \b nach "vegan" trifft davon nichts.
  const sagtVegan = /\b(vegan|vegetarisch|vegetarian|veggie)/.test(roh);
  if (hatMeat && !sagtVegan) raus.push('meat');
  if (hatChicken && !sagtVegan) raus.push('chicken');
  if (hatFish && !sagtVegan) raus.push('fish');

  // ⚠ "No meat" wird NUR vergeben, wenn nichts Tierisches gefunden wurde -
  // und zusaetzlich nur, wenn ueberhaupt Zutaten vorliegen. Ein Gericht ohne
  // Zutatenliste koennte alles sein; dann lieber kein Thema als ein
  // falsches, auf das sich jemand verlaesst.
  const explizitVeggie = sagtVegan;
  if ((zutaten && zutaten.length) || explizitVeggie) {
    // ⚠ Sagt das Rezept "vegan"/"vegetarisch", zaehlen die Produktnamen auch
    // hier nicht: "Vegan Chicken Nuggets" ist ein fleischloses Gericht und
    // gehoert unter "No meat", nicht ins Nichts.
    const tierisch = (hatMeat || hatChicken || hatFish) && !sagtVegan;
    if (!tierisch && !versteckt) raus.push('veggie');
  }

  ['pasta', 'rice', 'soup', 'salad', 'potato', 'bread', 'sweet', 'breakfast'].forEach(id => {
    if (enthaelt(text, WOERTER[id])) raus.push(id);
  });

  // ⚠ PROTEINREICH nur, wenn ein Eiweisstraeger IN DEN ZUTATEN steht - der
  // Titel allein reicht nicht ("Protein Bowl" ohne Protein gibt es).
  // Eier zaehlen mit, ABER nicht als einziger Nachweis in etwas Suessem:
  // zwei Eier im Kuchen machen daraus kein Proteingericht. Ein Protein-
  // Dessert mit Quark oder Pulver dagegen schon - deshalb die Trennung.
  // ⚠ Auch hier ZUERST die Wuerzmittel heraus: "500 ml chicken stock" ist
  // Bruehe, kein Eiweisstraeger - genauso wenig wie sie ein Huehnergericht
  // macht (Pruef-Lauf 2026-09-03: Risotto stand unter "High protein").
  const zutText = ohneWuerzmittel(normText((zutaten || []).join(' '))).text;
  if (zutText.trim()) {
    const traeger = !!enthaelt(zutText, PROTEIN);
    const nurEier = !traeger && !!enthaelt(zutText, EIER);
    if (traeger || (nurEier && !raus.includes('sweet'))) raus.push('protein');
  }

  // Reihenfolge wie in THEMEN, damit die Chips ueberall gleich stehen.
  return THEMEN.map(t => t.id).filter(id => raus.includes(id));
}

/** Label-Liste zu IDs - fuer die Anzeige auf einer Karte. */
export function themenLabels(ids) {
  return (ids || []).map(id => (THEMA_BY_ID[id] || {}).label).filter(Boolean);
}
