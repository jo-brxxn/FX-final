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
//
// ⚠ REIHENFOLGE UND IDs SIND STABIL. Gespeicherte Filter merken sich die
// id, und die Karten zeigen die ERSTEN DREI Themen in genau dieser
// Reihenfolge (app.js: `themes.slice(0,3)`). Neue Themen kommen deshalb
// HINTEN dazu - "Seafood" waere neben "Fish" huebscher, wuerde aber die
// Chips auf jeder bestehenden Karte verschieben.
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
  // ── ab hier 2026-09-04 dazugekommen (deshalb hinten, siehe oben) ──
  // ⚠ SEAFOOD getrennt von Fish (Nutzer-Befund 2026-09-04: "kein einziges
  // Mal z.B. mit Garnelen"). Garnelen, Muscheln und Tintenfisch fielen
  // vorher unter "Fish" - wer Garnelen suchte, musste sich durch Lachs und
  // Kabeljau wuehlen, und wer Fisch suchte, bekam Muscheln. Die Trennung
  // ist an der Zutat messbar, also erlaubt. ⚠ Fuer "No meat" zaehlen
  // Meeresfruechte weiter als tierisch - sonst waere eine Garnelenpasta
  // ploetzlich vegetarisch, und das ist die gefaehrliche Richtung.
  { id: 'seafood',    label: 'Seafood',     icon: '🦐' },
  // ⚠ KUECHE/HERKUNFT (Nutzer-Wunsch 2026-09-04: "deutsch, italienisch und
  // was Deutsche im Urlaub essen"). Nur diese zwei, und nur weil beide
  // MESSBAR sind: die Quelle nennt die Kueche selbst im Tag ("Italian",
  // "Italienisch", "Deutsch", "Deutschland"), oder der Gerichtname ist
  // eindeutig (Carbonara, Maultaschen). "Mediterran" bzw. "Urlaubsessen"
  // gibt es bewusst NICHT: das waere ein geratenes Etikett wie "Healthy" -
  // es gibt kein Merkmal im Rezept, an dem "was Deutsche im Urlaub essen"
  // haengt, und der Tag "Mediterranean" steht in diesen Daten auf einem
  // Gurkensalat wie auf Kofta-Kebabs.
  { id: 'italian',    label: 'Italian',     icon: '🇮🇹' },
  { id: 'german',     label: 'German',      icon: '🥨' },
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
    // ⚠ "braten" ALLEIN stand hier bis 2026-09-03 und hat "Öl zum Braten"
    // getroffen - zwei vegetarische Gerichte (Pierogi ruskie, Zucchini
    // Puffer) standen dadurch unter Fleisch. Es ist im Deutschen genauso
    // haeufig ein Verb wie ein Gericht; die Gerichte stehen deshalb
    // ausgeschrieben da, die Fleischart faengt ohnehin "schwein"/"rind".
    'goulash', 'schweinebraten', 'rinderbraten', 'sauerbraten', 'sonntagsbraten',
    'roast beef', 'pot roast', 'meatball', 'frikadelle',
    'prosciutto', 'pancetta', 'kassler', 'leber', 'liver', 'fleisch',
    // ⚠ 2026-09-04 nachgetragen, alle drei an ECHTEN Eintraegen gemessen -
    // und alle drei standen vorher unter "No meat", der gefaehrlichsten
    // Richtung ueberhaupt:
    //   "Holiday Wine-Braised Short Ribs" (6 Pfund Short Ribs) -> "rib"
    //     fehlte komplett, ebenso das schlichte englische Wort "meat", das
    //     bei NYT Cooking als Tag danebensteht.
    //   "Salsiccia mit Mangold" (8 Salsiccia) -> die italienische Rohwurst
    //     fehlte; "wurst" faengt sie nicht.
    //   "Asado" trug "Morcilla" (Blutwurst) nur ueber die Rindfleisch-Zeile.
    'meat', 'rib', 'ribs', 'short rib', 'short ribs', 'spare ribs', 'spareribs', 'rippchen',
    'salsiccia', 'morcilla', 'mortadella', 'pepperoni', 'guanciale', 'nduja', 'pastrami',
    'ribeye', 'rib eye', 'entrecote', 'entrecôte', 'oxtail', 'ochsenschwanz', 'brisket',
    'rouladen', 'roulade', 'hackbraten', 'leberkäse', 'leberkaese', 'eisbein', 'schweinshaxe',
    'gyros', 'bratwurst', 'currywurst', 'kotelett', 'nackensteak'],
  // ⚠ Hier stehen nur FISCHE. Schalen- und Weichtiere sind seit 2026-09-04
  // ein eigenes Thema (siehe WOERTER.seafood) - "Fish" heisst jetzt
  // wirklich Fisch.
  fish: ['fish', 'fisch', 'lachs', 'salmon', 'thunfisch', 'tuna', 'kabeljau', 'cod', 'dorsch',
    'forelle', 'trout', 'zander', 'seelachs', 'pollock', 'hering', 'herring', 'sardine',
    'makrele', 'mackerel', 'wolfsbarsch', 'sea bass',
    // ⚠ "seafood" bleibt HIER und nicht bei den Meeresfruechten: bei
    // TheMealDB ist "Seafood" die Kategorie fuer alles aus dem Wasser. In
    // diesen 90 Eintraegen steht sie auf drei reinen FISCH-Gerichten
    // ("Cajun spiced fish tacos", "Balchi di Pisca", "Recheado Masala
    // Fish") und auf keinem einzigen mit Garnelen. Das deutsche
    // "Meeresfruechte" meint dagegen wirklich Schalentiere - das steht
    // deshalb drueben.
    'seafood',
    // ⚠ Diese Liste wurde nach dem ersten scharfen Lauf erweitert: fehlte
    // eine Art, bekam das Gericht faelschlich "No meat" - die gefaehrliche
    // Richtung. "Kedgeree" (Schellfisch) und "Spaghetti alle Vongole" waren
    // genau das. Lieber eine Art zu viel in der Liste als ein Fischgericht
    // unter "ohne Fleisch".
    'haddock', 'schellfisch', 'scholle', 'plaice', 'seezunge', 'sole', 'barsch',
    'perch', 'karpfen', 'carp', 'wels', 'catfish', 'dorade', 'seabream', 'sea bream',
    'snapper', 'tilapia', 'pangasius', 'heilbutt', 'halibut', 'seeteufel', 'monkfish',
    'schwertfisch', 'swordfish', 'rotbarsch', 'redfish', 'aal', 'eel',
    'matjes', 'bismarckhering', 'stockfisch', 'räucherlachs', 'raeucherlachs',
    // Surimi und Kaviar sind Fischerzeugnisse, keine Schalentiere - auch
    // wenn "Surimi" als "Krebsfleisch" verkauft wird.
    'surimi', 'kaviar', 'caviar', 'rogen', 'roe'],
  // ⚠ MEERESFRUECHTE. Getrennt von "Fish", weil der Nutzer ausdruecklich
  // nach Garnelen gesucht hat. Alle Woerter hier sind harte Zutaten, keine
  // Wuerzmittel - Garnelenpaste und Austernsauce stehen in NICHT_VEGGIE und
  // sind aus dem Text raus, bevor hier gesucht wird (sonst waeren die
  // "Drunken noodles" mit 1 EL Austernsauce ein Meeresfruechte-Gericht).
  seafood: ['garnele', 'garnelen', 'shrimp', 'prawn', 'king prawn', 'scampi', 'gambas',
    'muschel', 'muscheln', 'mussel', 'clam', 'vongole', 'venusmuschel', 'jakobsmuschel',
    'scallop', 'auster', 'oyster', 'tintenfisch', 'calamari', 'squid', 'octopus', 'pulpo',
    'krabbe', 'crab', 'hummer', 'lobster', 'krebs', 'crayfish', 'langustine', 'langoustine',
    'languste', 'sepia', 'meeresfrüchte', 'meeresfruechte', 'frutti di mare'],
  // ⚠ NUDELN. Der Nutzer hat 2026-09-04 gemeldet, dass der Pasta-Filter fast
  // leer ist. Nachgezaehlt an rezept_feed.json: die Liste hat KEINEN
  // Eintrag verpasst - es lag am Vorrat, nicht an der Erkennung. Trotzdem
  // fehlten Formen, die jederzeit hereinkommen koennen (pappardelle stand
  // schon als Zutat drin und wurde nur zufaellig ueber "pasta" gefunden).
  // ⚠ WAS HIER BEWUSST NICHT STEHT: "dumpling", "auflauf", "casserole",
  // "gratin". Die Ablation an echten Daten zeigt, warum - "Tirolean
  // Dumplings" sind Semmelknoedel (Brot + Milch), "Jamaican Boiled
  // Dumplings" sind Mehlkloesse in Wasser, "Taco Casserole" und "Vegetable
  // Enchilada Casserole" sind Tortilla-Aufl3aufe. Kein Gramm Teigware, und
  // wer nach Nudeln filtert, will keinen Enchilada-Auflauf.
  pasta: ['pasta', 'nudel', 'nudeln', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'tagliatelle',
    'linguine', 'farfalle', 'lasagne', 'lasagna', 'ravioli', 'tortellini', 'gnocchi', 'orzo',
    'macaroni', 'makkaroni', 'cannelloni', 'noodle', 'noodles', 'ramen', 'udon', 'soba',
    'spätzle', 'spaetzle', 'maultaschen', 'carbonara',
    // 2026-09-04 ergaenzt: gaengige Formen, die vorher gefehlt haben.
    'fettuccine', 'fettuccini', 'pappardelle', 'bucatini', 'conchiglie', 'cavatappi',
    'rotini', 'ziti', 'paccheri', 'casarecce', 'trofie', 'strozzapreti', 'mafalda',
    'vermicelli', 'capellini', 'angel hair', 'tortelloni', 'agnolotti', 'teigwaren',
    // "mac & cheese" wird beim Normieren zu "mac cheese" - beide Formen.
    'mac and cheese', 'mac cheese', 'macaroni and cheese',
    // Gefuellte Teigtaschen gehoeren zu denselben Teigwaren wie die schon
    // gelisteten Maultaschen: "Pierogi ruskie" (Mehl, Wasser, Öl, gefuellt,
    // gekocht) stand bisher nur unter Potato.
    'pierogi', 'piroggen', 'teigtasche', 'teigtaschen',
    // ⚠ "Bolognese" ist hier erlaubt, in der FLEISCHliste dagegen verboten:
    // der Saucenname sagt nichts ueber Fleisch (es gibt sie mit Linsen und
    // Aubergine), aber sehr wohl etwas ueber die Beilage - Bolognese kommt
    // auf Nudeln. "Easy Eggplant Bolognese" ist genau dieser Fall.
    'bolognese', 'arrabbiata', 'aglio e olio', 'cacio e pepe'],
  rice: ['rice', 'reis', 'risotto', 'paella', 'jasminreis', 'basmati', 'sushi', 'bowl',
    'poke', 'quinoa', 'couscous', 'bulgur', 'pilaw', 'pilaf', 'jambalaya', 'biryani',
    'fried rice', 'gebratener reis'],
  // ⚠ BRUEHE IST EINE ZUTAT, KEIN GERICHT. "1/2 cup beef broth" und "500 ml
  // Gemuesebruehe" standen bis 2026-09-03 in dieser Liste und machten aus
  // Pulled Pork und einem Nudelgericht eine Suppe - derselbe Denkfehler wie
  // bei der Fischsauce, nur eine Zeile tiefer. Ebenso raus: "chili" (traf
  // Chilipulver und Chiliflocken) und "topf" (im deutschen Supermarkt
  // steht "1 Topf Basilikum" auf jedem zweiten Zettel). "Eintopf" wird
  // ueber die Stammliste weiter gefunden.
  soup: ['soup', 'suppe', 'eintopf', 'stew', 'ramen',
    'chowder', 'bisque', 'minestrone', 'gulaschsuppe', 'chili con carne',
    'chilli con carne', 'curry soup'],
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

// ── Ausnahmen: Woerter, die ein Thema NUR SCHEINBAR belegen ──────────────
// ⚠ Diese Begriffe werden VOR DER SUCHE NACH GENAU DIESEM EINEN THEMA aus
// dem Text genommen - nicht global, sonst verliert "Flammkuchen" sein
// "Bread & Dough". Jeder Eintrag hier stammt aus einer Ablation an
// rezept_feed.json: das Wort wurde einzeln entfernt und neu klassifiziert,
// bis feststand, welche Zeile das falsche Thema traegt.
const AUSNAHMEN = {
  // "1 Bowl!" heisst SCHUESSEL, nicht Bowl-Gericht. Minimalist Baker
  // schreibt das in fast jeden Titel; "Easy Fattoush Salad (1 Bowl!)" stand
  // dadurch unter "Rice & Bowls". Reisessig und Reiswein sind Wuerzmittel:
  // "Air Fryer Tempeh" (1 EL rice vinegar) war ein Reisgericht ohne ein
  // Korn Reis - in diesen 90 Eintraegen steckt 5x Reisessig.
  rice: ['1 bowl', 'one bowl', 'in a bowl', 'mixing bowl', 'large bowl', 'medium bowl',
    'small bowl', 'separate bowl', 'serving bowl', 'rice vinegar', 'reisessig',
    'rice wine vinegar', 'rice wine', 'reiswein', 'mirin'],
  // Paniermehl ist eine Panade, kein Brotgericht: "Crispy Parmesan Chicken"
  // (1 1/2 cup panko bread crumbs) und "Classic Christmas pudding" (100g
  // Breadcrumbs) standen unter "Bread & Dough".
  bread: ['bread crumbs', 'breadcrumbs', 'bread crumb', 'brotkrumen', 'semmelbrösel',
    'semmelbroesel', 'paniermehl', 'panko'],
  // Nicht jedes deutsche "-kuchen" ist suess. "Zwiebelkuchen" stand ueber
  // den Stamm "kuchen" unter Sweet - er ist herzhaft, mit Speck. Ein
  // globales Entfernen ginge nicht: "Flammkuchen" braucht sein Wort noch
  // fuer "Bread & Dough".
  sweet: ['zwiebelkuchen', 'flammkuchen', 'reibekuchen', 'kartoffelkuchen', 'fleischkuchen'],
  // Das Nudelholz ist Werkzeug. Es traegt den Stamm "nudel" und wuerde
  // sonst jedes Plaetzchenrezept zur Pasta machen.
  pasta: ['nudelholz', 'nudelbrett'],
};

// ⚠ BEILAGEN-ZEILEN. "an easy green salad for serving" hat "Crispy Parmesan
// Chicken with Creamy Lemon Pasta" zum Salat gemacht, "Tzatziki zum
// Servieren" haengt an den Zucchini Puffern. Was zum Servieren daneben
// steht, ist kein Nachweis fuer das Thema des Gerichts - dieselbe Regel wie
// beim Öl zum Braten. In diesen 90 Eintraegen betrifft es 8 Zeilen.
const BEILAGE = /\b(for|to)\s+(serving|serve|garnish|top)\b|\bzum\s+(servieren|garnieren)\b|\bals\s+beilage\b|\bdazu\s+servieren\b/i;

// ⚠ PROTEINREICH: nur EIWEISSTRAEGER, die ein Gericht wirklich tragen.
// Speck als Garnitur oder ein Ei im Kuchen zaehlen nicht - siehe die Regel
// weiter unten. Zusammengesetzte Woerter wie "Magerquark" oder
// "Haehnchenbrust" werden ueber die Stammliste mitgefunden.
const PROTEIN = ['chicken', 'hähnchen', 'haehnchen', 'hühnchen', 'huehnchen', 'pute', 'turkey',
  'beef', 'rind', 'rinderfilet', 'steak', 'hackfleisch', 'mince', 'lamm', 'lamb',
  // ⚠ Schwein fehlte hier bis 2026-09-03: "Pork Katsu" und "Schweinebraten"
  // bekamen "High protein" nur zufaellig ueber das Ei in der Panade. Ein
  // Kotelett ist ein Eiweisstraeger wie jedes andere Stueck Fleisch.
  // Prosciutto, Speck und Salami stehen bewusst NICHT hier - die liegen als
  // Garnitur oben drauf und tragen kein Gericht.
  'pork', 'schwein', 'schweinefleisch', 'schweinebraten', 'kotelett', 'schnitzel',
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
  // ⚠ "brühe" stand hier und traf "Gemuesebruehe" mitten im Wort - siehe
  // die Begruendung an WOERTER.soup.
  'schnitzel', 'gulasch', 'burger', 'strudel', 'waffel',
  'quark', 'linsen', 'kichererbsen', 'bohnen', 'joghurt', 'protein', 'tofu', 'skyr',
  // 2026-09-04 ergaenzt. "Pizzateig" war der Beleg: ein Rezept, das aus
  // NICHTS ausser Teig besteht, hatte kein einziges Thema, weil weder
  // "pizza" noch "teig" als ganzes Wort darin vorkommen. Ebenso
  // "Kartoffelgnocchi", "Spinatravioli", "Kaesemaultaschen".
  'pizza', 'teig', 'gnocchi', 'ravioli', 'tortellini', 'maultaschen', 'tintenfisch'];
// ⚠ "braten" fehlt hier absichtlich - und seit 2026-09-03 auch in der
// Fleischliste: weder als Wortbestandteil ("gebratene Zwiebeln") noch als
// ganzes Wort ("Öl zum Braten") sagt es etwas ueber Fleisch aus.

// ── Kueche/Herkunft ──────────────────────────────────────────────────────
// ⚠ ZWEI GETRENNTE BEWEISARTEN, und das ist der ganze Trick:
//   `tags`     - nur in den TAGS der Quelle gesucht. Die Quelle sagt selbst,
//                aus welcher Kueche das Rezept kommt.
//   `gerichte` - in Titel UND Zutaten gesucht. Nur Namen, die es praktisch
//                nur in dieser Kueche gibt.
// ⚠ WARUM DIE TRENNUNG: "Italian seasoning" steht in 4 Zutatenlisten und
// "italienische Kräuter" in 3 weiteren. Wuerde das Wort "italian" auch in
// den Zutaten zaehlen, waere jedes Haehnchen mit italienischer
// Kraeutermischung ein italienisches Gericht - genau der Fehler, der schon
// bei "Öl zum Braten" und "1 Topf Basilikum" passiert ist.
// ⚠ NICHT hier stehen Zutaten wie Parmesan, Mozzarella, Pancetta oder
// Mascarpone: die liegen heute in jeder Kueche im Kuehlschrank. Parmesan im
// "Chicken Broccoli Casserole" macht daraus kein italienisches Gericht.
const KUECHE = {
  italian: {
    tags: ['italian', 'italienisch', 'italy', 'italien', 'italian inspired', 'italienische küche'],
    gerichte: ['spaghetti', 'lasagne', 'lasagna', 'ravioli', 'tortellini', 'tortelloni',
      'gnocchi', 'risotto', 'carbonara', 'bolognese', 'arrabbiata', 'amatriciana',
      'cacio e pepe', 'aglio e olio', 'pesto', 'pizza', 'focaccia', 'ciabatta', 'bruschetta',
      'caprese', 'burrata', 'parmigiana', 'saltimbocca', 'ossobuco', 'osso buco',
      'vitello tonnato', 'piccata', 'arancini', 'minestrone', 'salsiccia', 'antipasti',
      'tiramisu', 'panna cotta', 'cannoli', 'panettone', 'affogato', 'gelato'],
  },
  german: {
    tags: ['deutsch', 'deutschland', 'german', 'germany', 'hausmannskost'],
    // ⚠ DEUTSCHE SPRACHE IST KEINE DEUTSCHE KUECHE. Ein deutscher Foodblog
    // schreibt auch Shakshuka und Omelett auf Deutsch. Hier stehen deshalb
    // nur Gerichte, die es so nur hier gibt - keine allgemeinen deutschen
    // Woerter wie "Brötchen" oder "Eintopf" ("Grüne Bohnen Eintopf" ist in
    // diesen Daten mit dem Tag "Griechisch" ausgeliefert worden).
    gerichte: ['schnitzel', 'spätzle', 'spaetzle', 'maultaschen', 'sauerbraten', 'rouladen',
      'sauerkraut', 'bratwurst', 'currywurst', 'leberkäse', 'leberkaese', 'frikadelle',
      'bulette', 'buletten', 'königsberger klopse', 'kartoffelsalat', 'kartoffelpuffer',
      'reibekuchen', 'zwiebelkuchen', 'flammkuchen', 'semmelknödel', 'semmelknoedel',
      'kartoffelknödel', 'kartoffelknoedel', 'grünkohl', 'gruenkohl', 'rotkohl', 'eisbein',
      'schweinshaxe', 'labskaus', 'obatzda', 'brezel', 'laugenbrezel', 'franzbrötchen',
      'streuselkuchen', 'bienenstich', 'schwarzwälder kirschtorte', 'milchnudeln',
      'dampfnudel', 'germknödel', 'spargel mit sauce hollandaise', 'senfeier'],
  },
};

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
 * Nimmt eine Liste von Begriffen aus einem normierten Text.
 * ⚠ Wird an drei Stellen gebraucht: fuer die Wuerzmittel (Gesamttext und
 * Zutaten allein) und fuer die Themen-Ausnahmen oben. Ohne den Aufruf auf
 * die Zutaten machte "500 ml chicken stock" im Risotto daraus ein
 * Proteingericht - derselbe Fehler wie bei "Fisch", nur an anderer Stelle.
 * @returns {{text: string, gefunden: boolean}}
 */
function ohneWorte(t, liste) {
  let text = t, gefunden = false;
  liste.forEach(w => {
    const n = normText(w).trim();
    if (!n) return;
    if (text.includes(n)) { gefunden = true; text = text.split(n).join(' '); }
  });
  return { text, gefunden };
}
function ohneWuerzmittel(t) { return ohneWorte(t, NICHT_VEGGIE); }

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
  // ⚠ Zeilen, die nur eine Beilage ankuendigen ("an easy green salad for
  // serving"), fliegen VOR allem anderen raus - siehe BEILAGE.
  const zutAlle = (zutaten || []).map(z => String(z == null ? '' : z));
  const zutEcht = zutAlle.filter(z => !BEILAGE.test(z));
  const roh = normText([titel, zutEcht.join(' '), alleTags].join(' '));
  // ⚠ Zuerst die versteckten tierischen Zutaten AUS DEM TEXT nehmen, bevor
  // die Themen gesucht werden. Sonst waere jedes Pad Thai mit Fischsauce
  // ein "Fisch"-Gericht - und wer nach Fisch filtert, bekaeme Gerichte ohne
  // ein Stueck Fisch darin. Gemerkt wird der Fund trotzdem: fuer "No meat"
  // zaehlt er. Die Beilagen-Zeilen zaehlen hier NICHT mit: eine Sauce zum
  // Servieren sagt nichts ueber das Gericht.
  const gesaeubert = ohneWuerzmittel(roh);
  const text = gesaeubert.text, versteckt = gesaeubert.gefunden;
  const raus = [];

  const hatChicken = !!enthaelt(text, WOERTER.chicken);
  const hatMeat = !!enthaelt(text, WOERTER.meat);
  const hatFish = !!enthaelt(text, WOERTER.fish);
  const hatSeafood = !!enthaelt(text, WOERTER.seafood);

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
  if (hatSeafood && !sagtVegan) raus.push('seafood');

  // ⚠ "No meat" wird NUR vergeben, wenn nichts Tierisches gefunden wurde -
  // und zusaetzlich nur, wenn ueberhaupt Zutaten vorliegen. Ein Gericht ohne
  // Zutatenliste koennte alles sein; dann lieber kein Thema als ein
  // falsches, auf das sich jemand verlaesst.
  const explizitVeggie = sagtVegan;
  if (zutAlle.length || explizitVeggie) {
    // ⚠ Sagt das Rezept "vegan"/"vegetarisch", zaehlen die Produktnamen auch
    // hier nicht: "Vegan Chicken Nuggets" ist ein fleischloses Gericht und
    // gehoert unter "No meat", nicht ins Nichts.
    // ⚠ Meeresfruechte zaehlen hier wie Fisch als tierisch - die Trennung
    // der beiden Themen darf eine Garnelenpasta nicht vegetarisch machen.
    const tierisch = (hatMeat || hatChicken || hatFish || hatSeafood) && !sagtVegan;
    if (!tierisch && !versteckt) raus.push('veggie');
  }

  ['pasta', 'rice', 'soup', 'salad', 'potato', 'bread', 'sweet', 'breakfast'].forEach(id => {
    // Ausnahmen gelten immer nur fuer DIESES Thema (siehe AUSNAHMEN).
    const t = AUSNAHMEN[id] ? ohneWorte(text, AUSNAHMEN[id]).text : text;
    if (enthaelt(t, WOERTER[id])) raus.push(id);
  });

  // ⚠ PROTEINREICH nur, wenn ein Eiweisstraeger IN DEN ZUTATEN steht - der
  // Titel allein reicht nicht ("Protein Bowl" ohne Protein gibt es).
  // Eier zaehlen mit, ABER nicht als einziger Nachweis in etwas Suessem:
  // zwei Eier im Kuchen machen daraus kein Proteingericht. Ein Protein-
  // Dessert mit Quark oder Pulver dagegen schon - deshalb die Trennung.
  // ⚠ Auch hier ZUERST die Wuerzmittel heraus: "500 ml chicken stock" ist
  // Bruehe, kein Eiweisstraeger - genauso wenig wie sie ein Huehnergericht
  // macht (Pruef-Lauf 2026-09-03: Risotto stand unter "High protein").
  const zutText = ohneWuerzmittel(normText(zutEcht.join(' '))).text;
  if (zutText.trim()) {
    const traeger = !!enthaelt(zutText, PROTEIN);
    const nurEier = !traeger && !!enthaelt(zutText, EIER);
    if (traeger || (nurEier && !raus.includes('sweet'))) raus.push('protein');
  }

  // Kueche/Herkunft: Tag der Quelle ODER eindeutiger Gerichtname.
  const tagText = normText(alleTags);
  Object.keys(KUECHE).forEach(id => {
    if (enthaelt(tagText, KUECHE[id].tags) || enthaelt(text, KUECHE[id].gerichte)) raus.push(id);
  });

  // Reihenfolge wie in THEMEN, damit die Chips ueberall gleich stehen.
  return THEMEN.map(t => t.id).filter(id => raus.includes(id));
}

/** Label-Liste zu IDs - fuer die Anzeige auf einer Karte. */
export function themenLabels(ids) {
  return (ids || []).map(id => (THEMA_BY_ID[id] || {}).label).filter(Boolean);
}
