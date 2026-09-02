'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - WARENKUNDE FUER DIE EINKAUFSLISTE
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).
//
// Zwei Aufgaben:
//   1. Ein getippter oder aus einem Rezept uebernommener Eintrag bekommt
//      automatisch eine Abteilung ("Gemüse", "Backwaren", ...), damit die
//      Liste so sortiert ist, wie man durch den Laden laeuft.
//   2. Beim Tippen erscheinen Vorschlaege.
//
// ⚠ SPRACHE: die Oberflaeche ist Englisch (feste Projektregel), der Nutzer
// tippt aber deutsch. Deshalb traegt jeder Eintrag einen ENGLISCHEN
// Anzeigenamen und deutsche Suchwoerter: "Milch" findet "Milk", "milk"
// natuerlich auch. Wer frei tippt, behaelt seinen eigenen Text - ersetzt
// wird nur, was der Nutzer aus der Vorschlagsliste auswaehlt.
//
// ⚠ Nichts wird geraten: was das Woerterbuch nicht kennt, landet in "Other"
// und nicht in einer plausibel klingenden Abteilung.

export const CATS=[
  {id:'produce',  label:'Fruit & Veg', icon:'🥕'},
  {id:'bakery',   label:'Bakery',      icon:'🥖'},
  {id:'dairy',    label:'Dairy & Eggs',icon:'🧀'},
  {id:'meat',     label:'Meat & Fish', icon:'🥩'},
  {id:'pantry',   label:'Pantry',      icon:'🫙'},
  {id:'frozen',   label:'Frozen',      icon:'🧊'},
  {id:'drinks',   label:'Drinks',      icon:'🧃'},
  {id:'household',label:'Household',   icon:'🧻'},
  {id:'other',    label:'Other',       icon:'🛒'},
];
export const CAT_BY_ID=Object.fromEntries(CATS.map(c=>[c.id,c]));

// ── Woerterbuch ──────────────────────────────────────────────────────────
// n  = englischer Anzeigename (das steht im Vorschlag)
// de = deutsche (und weitere) Suchwoerter
// c  = Abteilung
const W=(n,de,c)=>({n,de,c});
export const PRODUCTS=[
  // ── Fruit & Veg ──
  W('Apples',['apfel','aepfel','äpfel'],'produce'),
  W('Bananas',['banane','bananen'],'produce'),
  W('Lemons',['zitrone','zitronen','limone'],'produce'),
  W('Limes',['limette','limetten'],'produce'),
  W('Oranges',['orange','orangen','apfelsine'],'produce'),
  W('Berries',['beeren','erdbeere','erdbeeren','himbeere','himbeeren','blaubeere','blaubeeren','heidelbeere'],'produce'),
  W('Grapes',['traube','trauben','weintraube','weintrauben'],'produce'),
  W('Avocado',['avocado','avocados'],'produce'),
  W('Tomatoes',['tomate','tomaten','cocktailtomaten','kirschtomaten'],'produce'),
  W('Cucumber',['gurke','gurken','salatgurke'],'produce'),
  W('Peppers',['paprika','chili','chilis','peperoni'],'produce'),
  W('Onions',['zwiebel','zwiebeln','schalotte','schalotten'],'produce'),
  W('Spring onions',['fruehlingszwiebel','frühlingszwiebel','fruehlingszwiebeln','lauchzwiebel'],'produce'),
  W('Garlic',['knoblauch','knoblauchzehe','knoblauchzehen'],'produce'),
  W('Ginger',['ingwer'],'produce'),
  W('Potatoes',['kartoffel','kartoffeln','erdaepfel'],'produce'),
  W('Sweet potato',['suesskartoffel','süßkartoffel','suesskartoffeln'],'produce'),
  W('Carrots',['karotte','karotten','moehre','möhre','moehren','möhren'],'produce'),
  W('Broccoli',['brokkoli'],'produce'),
  W('Cauliflower',['blumenkohl'],'produce'),
  W('Spinach',['spinat'],'produce'),
  W('Salad',['salat','kopfsalat','feldsalat','rucola','ruccola'],'produce'),
  W('Mushrooms',['pilz','pilze','champignon','champignons'],'produce'),
  W('Courgette',['zucchini','zuchini'],'produce'),
  W('Aubergine',['aubergine','auberginen','melanzani'],'produce'),
  W('Leek',['lauch','porree'],'produce'),
  W('Celery',['sellerie','staudensellerie'],'produce'),
  W('Peas',['erbse','erbsen'],'produce'),
  W('Beans',['bohne','bohnen','gruene bohnen','grüne bohnen'],'produce'),
  W('Corn',['mais','maiskolben'],'produce'),
  W('Cabbage',['kohl','weisskohl','weißkohl','rotkohl','spitzkohl'],'produce'),
  W('Pumpkin',['kuerbis','kürbis'],'produce'),
  W('Basil',['basilikum'],'produce'),
  W('Parsley',['petersilie'],'produce'),
  W('Coriander',['koriander','cilantro'],'produce'),
  W('Mint',['minze','pfefferminze'],'produce'),
  W('Rosemary',['rosmarin'],'produce'),
  W('Thyme',['thymian'],'produce'),
  W('Dill',['dill'],'produce'),
  W('Chives',['schnittlauch'],'produce'),
  // ── Bakery ──
  W('Bread',['brot','brotlaib','vollkornbrot','toastbrot','sauerteigbrot'],'bakery'),
  W('Rolls',['broetchen','brötchen','semmel','semmeln','weckerl'],'bakery'),
  W('Toast',['toast','toastbrot'],'bakery'),
  W('Baguette',['baguette','stangenbrot'],'bakery'),
  W('Croissants',['croissant','croissants','hoernchen'],'bakery'),
  W('Pretzels',['brezel','brezeln','laugengebaeck','laugengebäck'],'bakery'),
  W('Wraps',['wrap','wraps','tortilla','tortillas','fladenbrot'],'bakery'),
  W('Pita',['pita','pitabrot'],'bakery'),
  W('Cake',['kuchen','torte'],'bakery'),
  W('Buns',['burgerbroetchen','burgerbrötchen','buns','hamburgerbroetchen'],'bakery'),
  W('Breadcrumbs',['paniermehl','semmelbroesel','semmelbrösel'],'bakery'),
  // ── Dairy & Eggs ──
  W('Milk',['milch','vollmilch','hafermilch','mandelmilch','sojamilch'],'dairy'),
  W('Butter',['butter'],'dairy'),
  W('Eggs',['ei','eier','bio-eier'],'dairy'),
  W('Cheese',['kaese','käse','gouda','emmentaler','cheddar','reibekaese'],'dairy'),
  W('Parmesan',['parmesan','parmigiano','pecorino'],'dairy'),
  W('Mozzarella',['mozzarella','burrata'],'dairy'),
  W('Feta',['feta','hirtenkaese','hirtenkäse','schafskaese'],'dairy'),
  W('Cream',['sahne','schlagsahne','kochsahne','rahm','obers'],'dairy'),
  W('Sour cream',['schmand','saure sahne','creme fraiche','crème fraîche'],'dairy'),
  W('Yoghurt',['joghurt','jogurt','naturjoghurt','griechischer joghurt'],'dairy'),
  W('Quark',['quark','speisequark'],'dairy'),
  W('Cream cheese',['frischkaese','frischkäse','philadelphia'],'dairy'),
  W('Mascarpone',['mascarpone'],'dairy'),
  W('Ricotta',['ricotta'],'dairy'),
  // ── Meat & Fish ──
  W('Chicken',['haehnchen','hähnchen','huhn','haehnchenbrust','hühnchen','poulet'],'meat'),
  W('Beef',['rind','rindfleisch','rinderhack','steak','rinderbraten'],'meat'),
  W('Pork',['schwein','schweinefleisch','schnitzel','kassler'],'meat'),
  W('Mince',['hackfleisch','hack','faschiertes'],'meat'),
  W('Bacon',['speck','bacon','baucherspeck','pancetta'],'meat'),
  W('Sausage',['wurst','bratwurst','wuerstchen','würstchen','chorizo','salami'],'meat'),
  W('Ham',['schinken','kochschinken','serrano','prosciutto'],'meat'),
  W('Turkey',['pute','putenbrust','truthahn'],'meat'),
  W('Lamb',['lamm','lammfleisch'],'meat'),
  W('Salmon',['lachs','raeucherlachs','räucherlachs'],'meat'),
  W('Tuna',['thunfisch'],'meat'),
  W('White fish',['kabeljau','dorsch','seelachs','zander','forelle'],'meat'),
  W('Prawns',['garnele','garnelen','shrimps','scampi'],'meat'),
  W('Tofu',['tofu','tempeh','seitan'],'meat'),
  // ── Pantry ──
  W('Pasta',['nudeln','pasta','spaghetti','penne','fusilli','tagliatelle','lasagne','makkaroni'],'pantry'),
  W('Rice',['reis','basmati','jasminreis','risotto','risottoreis'],'pantry'),
  W('Noodles',['ramen','glasnudeln','reisnudeln','mie-nudeln'],'pantry'),
  W('Couscous',['couscous','bulgur','quinoa'],'pantry'),
  W('Lentils',['linsen','linse'],'pantry'),
  W('Chickpeas',['kichererbsen','kichererbse'],'pantry'),
  W('Flour',['mehl','weizenmehl','dinkelmehl'],'pantry'),
  W('Sugar',['zucker','puderzucker','rohrzucker','vanillezucker'],'pantry'),
  W('Salt',['salz','meersalz'],'pantry'),
  W('Pepper',['pfeffer','pfefferkoerner'],'pantry'),
  W('Spices',['gewuerz','gewürz','gewuerze','paprikapulver','curry','kreuzkuemmel','kurkuma','zimt','muskat','oregano','chiliflocken'],'pantry'),
  W('Stock',['bruehe','brühe','gemuesebruehe','gemüsebrühe','bruehwuerfel','fond'],'pantry'),
  W('Olive oil',['olivenoel','olivenöl'],'pantry'),
  W('Oil',['oel','öl','sonnenblumenoel','rapsoel','sesamoel'],'pantry'),
  W('Vinegar',['essig','balsamico','weissweinessig','apfelessig'],'pantry'),
  W('Soy sauce',['sojasauce','sojasosse','sojasoße','soja'],'pantry'),
  // ⚠ Verarbeitete Tomatenprodukte gehoeren ins Regal, nicht ins Gemuese -
  // ohne eigenen Eintrag greift die Zusammensetzungs-Regel und schiebt
  // "Tomatensauce" zu den Tomaten (beim ersten Test genau so passiert).
  W('Tomato passata',['passierte tomaten','passata','tomatenmark','gehackte tomaten','dosentomaten','tomatensauce','tomatensosse','tomatensoße','pastasauce','pastasosse'],'pantry'),
  W('Coconut milk',['kokosmilch','kokosnussmilch'],'pantry'),
  W('Honey',['honig'],'pantry'),
  W('Jam',['marmelade','konfituere','konfitüre','fruchtaufstrich'],'pantry'),
  W('Peanut butter',['erdnussbutter','erdnussmus'],'pantry'),
  W('Nutella',['nutella','nussnougatcreme','schokoaufstrich'],'pantry'),
  W('Mustard',['senf','dijonsenf'],'pantry'),
  W('Ketchup',['ketchup'],'pantry'),
  W('Mayonnaise',['mayonnaise','mayo','aioli'],'pantry'),
  W('Nuts',['nuesse','nüsse','mandeln','walnuesse','walnüsse','haselnuesse','cashew','cashews','pinienkerne'],'pantry'),
  W('Seeds',['kerne','sonnenblumenkerne','kuerbiskerne','kürbiskerne','sesam','chiasamen','leinsamen'],'pantry'),
  W('Oats',['haferflocken','hafer','porridge'],'pantry'),
  W('Cereal',['muesli','müsli','cornflakes','granola'],'pantry'),
  W('Chocolate',['schokolade','schoki','kuvertuere','kuvertüre','kakao','schokoladenstuecke'],'pantry'),
  W('Baking powder',['backpulver','natron','hefe','trockenhefe','vanilleextrakt'],'pantry'),
  W('Crisps',['chips','kartoffelchips','salzstangen'],'pantry'),
  W('Biscuits',['kekse','keks','plaetzchen','plätzchen','cookies'],'pantry'),
  W('Canned beans',['kidneybohnen','weisse bohnen','weiße bohnen','dosenbohnen'],'pantry'),
  W('Olives',['oliven','olive'],'pantry'),
  W('Capers',['kapern'],'pantry'),
  W('Curry paste',['currypaste','currypulver','miso','misopaste'],'pantry'),
  // ── Frozen ──
  W('Frozen vegetables',['tk-gemuese','tk gemüse','tiefkuehlgemuese','tiefkühlgemüse','erbsen tk'],'frozen'),
  W('Frozen berries',['tk-beeren','tiefkuehlbeeren','tiefkühlbeeren'],'frozen'),
  W('Ice cream',['eis','speiseeis','eiscreme'],'frozen'),
  W('Pizza',['pizza','tiefkuehlpizza','tiefkühlpizza'],'frozen'),
  W('Frozen chips',['pommes','tk-pommes'],'frozen'),
  W('Puff pastry',['blaetterteig','blätterteig','filoteig','pizzateig'],'frozen'),
  // ── Drinks ──
  W('Water',['wasser','mineralwasser','sprudel','stilles wasser'],'drinks'),
  W('Coffee',['kaffee','espresso','kaffeebohnen'],'drinks'),
  W('Tea',['tee','schwarztee','gruener tee','grüner tee'],'drinks'),
  W('Juice',['saft','orangensaft','apfelsaft','multivitaminsaft'],'drinks'),
  W('Beer',['bier'],'drinks'),
  W('Wine',['wein','rotwein','weisswein','weißwein','prosecco','sekt'],'drinks'),
  W('Soft drinks',['cola','limonade','fanta','sprite','tonic'],'drinks'),
  // ── Household ──
  W('Kitchen roll',['kuechenrolle','küchenrolle','kuechenpapier'],'household'),
  W('Toilet paper',['toilettenpapier','klopapier'],'household'),
  W('Washing-up liquid',['spuelmittel','spülmittel','geschirrspueltabs'],'household'),
  W('Detergent',['waschmittel','weichspueler','weichspüler'],'household'),
  W('Cling film',['frischhaltefolie','alufolie','backpapier','gefrierbeutel'],'household'),
  W('Bin bags',['muellbeutel','müllbeutel','muellsaecke'],'household'),
  W('Sponges',['schwamm','spuelschwamm','spülschwamm','putzlappen'],'household'),
  W('Soap',['seife','handseife','duschgel','shampoo','zahnpasta'],'household'),
];

// ── Normalisieren ────────────────────────────────────────────────────────
// Umlaute werden ausgeschrieben, damit "Möhren" und "Moehren" dasselbe
// finden - das tippt jeder anders.
export function norm(s){
  return String(s||'').toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    // ⚠ Bindestrich wird zum Leerzeichen: "Bio-Zitrone" muss als zwei Woerter
    // gelesen werden, sonst findet die Wortsuche die Zitrone nicht und der
    // Eintrag landet in "Other" (beim ersten Test genau so passiert).
    .replace(/[-_/]+/g,' ')
    .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
}
// Grobe Einzahl-Form: deutsche und englische Mehrzahl-Endungen abschneiden.
// Bewusst simpel - es geht nur darum, "Tomaten" auf "tomate" zu bringen.
function stamm(w){
  if(w.length<=4)return w;
  return w.replace(/(en|er|es|n|s|e)$/,'');
}

// Index: Suchwort -> Eintrag. Laengere Schluessel gewinnen, damit
// "olivenoel" nicht an "oel" haengen bleibt.
const INDEX=(()=>{
  const m=new Map();
  PRODUCTS.forEach(p=>{
    [p.n,...p.de].forEach(w=>{
      const k=norm(w);
      if(k&&!m.has(k))m.set(k,p);
      const st=stamm(k);
      if(st&&st!==k&&!m.has(st))m.set(st,p);
    });
  });
  return m;
})();
const SCHLUESSEL_LANG=[...INDEX.keys()].sort((a,b)=>b.length-a.length);

// ── Menge vom Namen trennen ─────────────────────────────────────────────
// "500 g Mehl" -> {qty:'500 g', name:'Mehl'}   "2x Milch" -> {qty:'2×', ...}
// Steht keine Menge da, bleibt qty leer - erfunden wird nichts.
const MENGE=/^\s*(\d+(?:[.,]\d+)?)\s*(x|×|g|kg|mg|ml|cl|l|el|tl|tbsp?|tsp?|cups?|st(?:ue|ü)ck|stk|packung(?:en)?|pkg|dose[n]?|bund|scheiben?|zehen?|prise[n]?|glas|tasse[n]?)?\b\.?\s*(.*)$/i;
export function splitQty(text){
  const t=String(text||'').trim();
  const m=t.match(MENGE);
  if(!m||!m[3])return{qty:'',name:t};
  const zahl=m[1],einheit=(m[2]||'').toLowerCase();
  if(!einheit)return{qty:zahl+'×',name:m[3].trim()};
  const schoen=(einheit==='x'||einheit==='×')?zahl+'×':zahl+' '+m[2];
  return{qty:schoen,name:m[3].trim()};
}

// ── Abteilung bestimmen ─────────────────────────────────────────────────
export function categorize(text){
  const t=norm(text);
  if(!t)return'other';
  // 1. Ganzer Text bekannt?
  if(INDEX.has(t))return INDEX.get(t).c;
  // 2. Mehrwort-Begriff enthalten? (laengste Treffer zuerst)
  for(const k of SCHLUESSEL_LANG){
    if(k.includes(' ')&&t.includes(k))return INDEX.get(k).c;
  }
  // 3. Wortweise - Menge/Einheit vorne abschneiden
  const ohneMenge=norm(splitQty(text).name)||t;
  const worte=ohneMenge.split(' ').filter(w=>w.length>1&&!/^\d+$/.test(w));
  for(const w of worte){
    if(INDEX.has(w))return INDEX.get(w).c;
    const st=stamm(w);
    if(INDEX.has(st))return INDEX.get(st).c;
  }
  // 4. Zusammengesetzte Woerter ("Tomatensauce" -> Tomaten)
  for(const w of worte){
    if(w.length<5)continue;
    for(const k of SCHLUESSEL_LANG){
      if(k.length>=4&&!k.includes(' ')&&w.startsWith(k))return INDEX.get(k).c;
    }
  }
  // ⚠ Nichts raten: unbekannt bleibt unbekannt.
  return'other';
}

// ── Vorschlaege beim Tippen ─────────────────────────────────────────────
// Reihenfolge: zuerst, was der Nutzer selbst schon einmal auf der Liste
// hatte (das trifft seinen Sprachgebrauch am besten), danach das
// Woerterbuch. Ohne Eingabe kommen die haeufigsten eigenen Eintraege.
export function suggest(query,verlauf,max){
  const q=norm(query);
  const grenze=max||8;
  const out=[],gesehen=new Set();
  const nimm=(text,cat,quelle)=>{
    const k=norm(text);
    if(!k||gesehen.has(k))return;
    gesehen.add(k);
    out.push({text,cat:cat||categorize(text),source:quelle});
  };
  (verlauf||[]).forEach(v=>{
    if(out.length>=grenze)return;
    const k=norm(v.text);
    if(!q||k.startsWith(q)||k.includes(q))nimm(v.text,v.cat,'recent');
  });
  if(q){
    PRODUCTS.forEach(p=>{
      if(out.length>=grenze)return;
      const treffer=[p.n,...p.de].some(w=>norm(w).startsWith(q));
      if(treffer)nimm(p.n,p.c,'dict');
    });
    PRODUCTS.forEach(p=>{
      if(out.length>=grenze)return;
      const treffer=[p.n,...p.de].some(w=>norm(w).includes(q));
      if(treffer)nimm(p.n,p.c,'dict');
    });
  }
  return out.slice(0,grenze);
}
