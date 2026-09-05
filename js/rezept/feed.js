'use strict';
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - VORSCHLAEGE: ZERLEGEN UND AUFBAUEN
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).
//
// ⚠ DIESE DATEI LAEUFT AN ZWEI STELLEN, und das ist der ganze Zweck:
//   • im taeglichen Lauf auf dem GitHub-Runner (tools/rezept-feed.mjs),
//   • in der App, wenn der Vorrat leer ist und der Knopf "Show 3 more"
//     live bei TheMealDB nachholt.
// Beide bauen einen Vorschlag damit GENAU gleich zusammen. Zwei Fassungen
// waeren die sichere Art, dass ein nachgeladenes Gericht anders aussieht
// als eins aus dem Vorrat.
//
// Deshalb: kein DOM, kein Netz, kein Zugriff auf den Store - nur reine
// Funktionen. Das Holen macht jede Seite selbst.

import {themenOf} from './themen.js';

// ── Hilfen ───────────────────────────────────────────────────────────────
export function saeubere(s) {
  return String(s == null ? '' : s)
    .replace(/<br\s*\/?>/gi, '\n')
    // ⚠ Ein Listen-/Absatzende ist eine ZEILENGRENZE, kein Leerzeichen.
    // Deutsche Seiten legen die Zutaten oefter als <ul><li>-Block in EIN
    // Feld; ohne diese Zeile klebte daraus eine einzige lange Zutat
    // zusammen, die dann an der Laengengrenze still verschwand.
    .replace(/<\/(?:li|p|div|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // ⚠ Mengen stehen auf europaeischen Seiten oft als Entity
    // ("&frac12; TL Salz", "&#189; Zwiebel"). Unaufgeloest landete das so in
    // der Einkaufsliste. Aufgeloest wird nur, was eindeutig ist - geraten
    // (etwa aus "eine halbe") wird nichts.
    .replace(/&frac12;/gi, '½').replace(/&frac14;/gi, '¼').replace(/&frac34;/gi, '¾')
    .replace(/&deg;/gi, '°')
    .replace(/&#(\d{2,5});/g, (_, d) => { const n = +d; return n > 8 && n < 0x10000 ? String.fromCharCode(n) : ' '; })
    .replace(/&#x([0-9a-f]{2,5});/gi, (_, h) => { const n = parseInt(h, 16); return n > 8 && n < 0x10000 ? String.fromCharCode(n) : ' '; })
    .replace(/[ \t ]+/g, ' ')
    // ⚠ Der Umbruch aus </li> laesst das Leerzeichen des folgenden <li>
    // stehen ("...vorheizen.\n Gemuese..."). Wer spaeter an \n trennt,
    // bekaeme Zeilen mit fuehrendem Leerzeichen - und die Zeilen-Muster
    // (Ueberschrift, Nachbemerkung) griffen dann nicht mehr.
    .replace(/[ \t ]*\n[ \t ]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Schritte aus einem Fliesstext: erst an Zeilenumbruechen, sonst an Saetzen.
// ⚠ Kein Absatz laenger als ~200 Zeichen bleibt stehen - im Kochmodus ist
// eine Textwand unbrauchbar (dieselbe Regel wie im Caption-Parser).
// ⚠ MUELL AUS ECHTEN QUELLEN. Im ersten scharfen Lauf (2026-09-03) kamen
// von TheMealDB Rezepte, die von BBC Good Food stammen - deren Anleitung
// enthaelt Zwischenzeilen wie "step 1" und haengt am Ende Abschnitte wie
// "Notes" oder "Storing:" an. Beides stand als eigener Kochschritt in der
// App: "Schritt 1 von 9: step 1". Solche Zeilen fliegen raus, und ab einer
// Nachbemerkungs-Ueberschrift endet die Anleitung.
const NUR_SCHRITTNUMMER = /^(?:(?:step|schritt)\s*\d+(?:\s*(?:von|of)\s*\d+)?|\d{1,2}\s*[.)]?\s*(?:step|schritt))\s*[:.]?$/i;
const NACHBEMERKUNG = /^(?:notes?|notizen|hinweise?|storing|storage|aufbewahrung|tips?|tipps?|nutrition|naehrwerte|nährwerte|variations?|variationen|conservazione)\s*[:.]?$/i;
// ⚠ UEBERSCHRIFT IST KEIN KOCHSCHRITT. Deutsche und italienische Seiten
// stellen ihrer Anleitung eine Zeile "Zubereitung" / "Preparazione" voran -
// im Kochmodus stand die dann als "Schritt 1 von 9: Zubereitung" da, also
// derselbe Muell wie das englische "step 1", nur unentdeckt, weil die
// bisherigen Muster englisch waren. Es zaehlt NUR die alleinstehende Zeile:
// "Die Zubereitung dauert 20 Minuten." ist ein echter Satz und bleibt.
const NUR_UEBERSCHRIFT = /^(?:zubereitung|anleitung|arbeitsschritte|zutaten|und so geht'?s|preparation|instructions?|directions?|method|preparazione|procedimento|esecuzione|ingredienti|ingredients)\s*[:.]?$/i;
// ⚠ Ein Gruss ist kein Arbeitsschritt. "Guten Appetit!" als letzter
// Schritt im Kochmodus ist keine Anweisung, sondern das Ende des Textes.
const NUR_GRUSS = /^(?:guten appetit|lass(?:t)? es euch schmecken|viel spa(?:ß|ss) beim (?:nachkochen|nachbacken)|buon appetito|bon app[eé]tit|enjoy(?: your meal| it)?)\s*[!.]*$/i;
// Eine Zeile, die zwar Text ist, aber kein Schritt: Schrittnummer,
// Ueberschrift oder Gruss.
// ⚠ Die Nachbemerkungs-Ueberschrift steht bewusst NICHT hier drin: sie
// ist das ENDEZEICHEN der Anleitung und muss deshalb bis putzeSchritte()
// stehen bleiben. Gemessen an einer Anleitung, die als Liste einzelner
// Absaetze ankommt: wird "Tipps" schon beim Zerlegen des einzelnen Absatzes
// weggeworfen, findet der Abschneider spaeter nichts mehr - und der
// Tipp-Text darunter stand als letzter Kochschritt in der App.
function istKeinSchritt(x) {
  return NUR_SCHRITTNUMMER.test(x) || NUR_UEBERSCHRIFT.test(x) || NUR_GRUSS.test(x);
}
// ⚠ Dieselben Filter auf eine BESTEHENDE Schrittliste anwenden. Gebraucht
// fuer den Vorrat: verbessert sich das Zerlegen, muessen auch die schon
// gespeicherten Eintraege mitwandern - sonst steht "step 1" dort fuer
// immer, obwohl die Ursache behoben ist (dieselbe Regel wie bei den Themen).
// ⚠ DAS LECK ZWISCHEN DEN BEIDEN STUFEN - der teuerste Fehler hier.
// Stufe 1 (saeubere) macht aus </li> einen ZEILENUMBRUCH, Stufe 2 nahm
// jeden Listeneintrag als EINE Zeile. Kommt eine Anleitung als ein
// einziges Feld mit <ol><li>-Block, entstand daraus genau ein Eintrag
// "Ofen vorheizen.\nGemuese schneiden.\n45 Minuten backen." - im Kochmodus
// ein Schritt statt drei. Schlimmer: die Zeilen-Muster unten sind auf eine
// ALLEINSTEHENDE Zeile geschrieben (^...$), also traf keins mehr - weder
// "Zubereitung" noch "step 1" noch der Abschneider vor "Tipps". Der ganze
// Filter lief ins Leere, obwohl beide Stufen fuer sich richtig arbeiteten.
// Deshalb ist HIER die Naht: erst an \n trennen, dann filtern.
export function putzeSchritte(schritte) {
  let liste = [];
  (Array.isArray(schritte) ? schritte : []).forEach(x => {
    // ⚠ Objekte (HowToStep & Co.) gehoeren in anweisungenAus(); hier
    // wuerde String(x) daraus "[object Object]" machen - eine Zeile, die
    // nie in einer Karte stehen darf.
    if (x == null || typeof x === 'object') return;
    String(x).split(/\r?\n+/).forEach(z => {
      // Dieselbe Normierung wie in zuSchritten(): eine Aufzaehlungsmarke
      // oder eine vorangestellte Schrittnummer ist nicht Teil des Schritts.
      const y = z.replace(/^\s*(?:\d{1,2}[.)]|[-\u2013\u2014\u2022*])\s*/, '').trim();
      if (y) liste.push(y);
    });
  });
  const bis = liste.findIndex(x => NACHBEMERKUNG.test(x));
  // ⚠ Nur ab der ZWEITEN Zeile abschneiden: stuende "Notes" ganz vorn,
  // bliebe sonst gar nichts uebrig. Die Zeile selbst faellt trotzdem weg -
  // dafuer sorgt der Filter darunter.
  if (bis > 0) liste = liste.slice(0, bis);
  return liste.filter(x => !istKeinSchritt(x) && !NACHBEMERKUNG.test(x));
}
export function zuSchritten(text) {
  const roh = saeubere(text);
  if (!roh) return [];
  let teile = roh.split(/\r?\n+/).map(x => x.replace(/^\s*(?:\d{1,2}[.)]|[-–—•*])\s*/, '').trim()).filter(Boolean);
  const bis = teile.findIndex(x => NACHBEMERKUNG.test(x));
  if (bis > 0) teile = teile.slice(0, bis);
  teile = teile.filter(x => !istKeinSchritt(x));
  // ⚠ Zweite Stelle desselben Lecks: der Rueckfall zerlegte den ROHTEXT
  // neu und holte damit alles zurueck, was eine Zeile vorher gerade
  // aussortiert wurde. "Zubereitung\nAlles mischen." hatte danach die
  // Ueberschrift wieder drin, weil vor dem Umbruch kein Satzzeichen steht
  // und der Satz-Zerleger deshalb gar nicht trennt. Zerlegt wird jetzt die
  // GEFILTERTE Zeile; ist nach dem Filtern nichts mehr da, ist auch nichts
  // mehr da - dann wird nichts wiederbelebt.
  if (teile.length === 1) {
    teile = teile[0].split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map(x => x.trim()).filter(Boolean);
  }
  const fein = [];
  teile.forEach(t => {
    if (t.length > 200) t.split(/(?<=[.!?])\s+/).forEach(x => { const y = x.trim(); if (y) fein.push(y); });
    else fein.push(t);
  });
  return fein.filter(x => x.length > 2 && !istKeinSchritt(x)).slice(0, 40);
}

// ISO-8601-Dauer ("PT1H30M") in Minuten.
export function isoMinuten(v) {
  const m = /^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?/.exec(String(v || '').trim().toUpperCase());
  if (!m) return null;
  const min = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return min > 0 && min < 24 * 60 ? Math.round(min) : null;
}

export function zahl(v) {
  const m = /(\d{1,3})/.exec(String(v == null ? '' : v));
  return m ? +m[1] : null;
}

export function idAus(s) {
  let h = 5381;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return 'f' + h.toString(36);
}

export function normTitel(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// ⚠ ZUTATEN KOMMEN IN VIELEN VERPACKUNGEN. schema.org verlangt fuer
// recipeIngredient zwar Text, aber gemessen an echten Seiten liefert das
// Markup ausserdem: EINEN String mit Zeilenumbruechen, eine <li>-Liste in
// einem Feld, Objekte ({name}/{text}), nach Gruppen verschachtelte Listen -
// und mittendrin Ueberschriften wie "Für den Teig:" oder "Per la pasta:".
// Ungepackt zaehlte eine ganze Zutatenliste als EINE Zutat (oder als
// "[object Object]"), womit das Gericht an der Schwelle "mindestens zwei
// Zutaten" scheiterte. Auspacken ist kein Raten: es entsteht kein Wert,
// der nicht in der Quelle stand.
const ZUTAT_UEBERSCHRIFT = /^(?:(?:f(?:ü|ue)r|for)\s+(?:den|die|das|dem|the)\b|per\s+(?:il|la|le|lo|i|gli|l')\b|(?:zutaten|ingredients?|ingredienti|teig|f(?:ü|ue)llung|belag|topping|dressing|marinade|so(?:ß|ss)e|sauce|garnitur|dekoration|deko|au(?:ß|ss)erdem|zum servieren|to serve)\s*$)/i;
const PORTIONSKOPF = /^(?:f(?:ü|ue)r|per|for)\s+\d+\s*(?:person|personen|portion|portionen|st(?:ü|ue)ck|persone|porzioni|serving|servings)\b/i;
// ⚠ Im Zweifel bleibt die Zeile drin: eine Ueberschrift zu viel in der
// Liste ist ein Schoenheitsfehler, eine fehlende Zutat ein leerer Posten
// im Einkauf. Deshalb drei Bremsen: eine Ueberschrift traegt KEINE Menge
// ("Für die Deko: 2 EL Zucker" ist eine Zutat), sie ist kurz, und steht
// hinter dem Doppelpunkt noch etwas ("Für den Belag: Käse"), ist das die
// Zutat und die Zeile bleibt.
function istZutatUeberschrift(x) {
  if (PORTIONSKOPF.test(x)) return true;
  if (/\d/.test(x)) return false;
  if (x.length > 60) return false;
  if (/:\s*$/.test(x)) return true;
  if (x.includes(':')) return false;
  return ZUTAT_UEBERSCHRIFT.test(x);
}
export function zutatenAus(v, tiefe) {
  const t = tiefe || 0;
  if (v == null || t > 5) return [];
  if (Array.isArray(v)) { const raus = []; v.forEach(x => raus.push(...zutatenAus(x, t + 1))); return raus; }
  if (typeof v === 'object') {
    // Objektform: nur die Felder lesen, die die Zutat WIRKLICH enthalten.
    const s2 = v.name || v.text || v.ingredient || v.item;
    return typeof s2 === 'string' ? zutatenAus(s2, t + 1) : [];
  }
  return saeubere(v).split(/\r?\n+/)
    .map(x => x.replace(/^\s*[-–—•*]\s*/, '').trim())
    .filter(x => x && x.length < 160 && !istZutatUeberschrift(x));
}

// Ein Vorschlag ist nur brauchbar, wenn er Titel, Bild UND genug Inhalt hat.
// ⚠ Halbe Eintraege werden VERWORFEN, nicht mit Platzhaltern aufgefuellt:
// eine Karte ohne Zutaten sieht aus wie ein Rezept, ist aber keins.
// ⚠ ZUTATEN SIND PFLICHT, Schritte allein reichen nicht (docs/rezept.md).
// Mit der frueheren Oder-Schwelle (weniger als 2 Zutaten UND weniger als 2
// Schritte) kam ein Restaurant-Vlog mit 0 Zutaten und 3 Absaetzen durch -
// jeder Absatz der Videobeschreibung zaehlte als Kochschritt. Fuer diese
// App ist das kein Rezept: die Einkaufsliste bliebe leer.
// ⚠ Gezaehlt wird NACH dem Putzen. Zwei Zeilen "step 1"/"step 2" sind kein
// Inhalt, sahen aber wie zwei Schritte aus.
export function baue(o) {
  const titel = saeubere(o.title).slice(0, 120);
  const zutaten = zutatenAus(o.ingredients).slice(0, 40);
  // ⚠ Auch die Schritte kommen in mehreren Verpackungen an: als Liste von
  // Saetzen (Vorrat, TheMealDB), als Fliesstext oder als Knoten aus dem
  // Markup. Ein Knoten, der als String behandelt wird, ergibt die Zeile
  // "[object Object]" - genau so ein Wert darf nie in einer Karte landen.
  const roh = Array.isArray(o.steps) ? o.steps
    : (typeof o.steps === 'string' ? zuSchritten(o.steps) : anweisungenAus(o.steps));
  const schritte = putzeSchritte(roh.flatMap(x =>
    (x && typeof x === 'object') ? anweisungenAus(x) : [saeubere(x)])).slice(0, 40);
  if (!titel || titel.length < 3) return null;
  if (!o.image) return null;
  if (zutaten.length < 2) return null;
  return {
    id: idAus((o.url || '') + '|' + normTitel(titel)),
    src: o.src,
    srcName: o.srcName,
    title: titel,
    url: o.url || '',
    image: o.image || '',
    video: o.video || '',
    creator: saeubere(o.creator || '').slice(0, 60),
    min: o.min || null,
    servings: o.servings || null,
    ingredients: zutaten,
    steps: schritte,
    themes: themenOf(titel, zutaten, o.tags || []),
    tags: (o.tags || []).map(x => saeubere(x)).filter(Boolean).slice(0, 6),
    added: new Date().toISOString(),
  };
}

// ── Quelle C: eigene Seiten ueber schema.org/Recipe ──────────────────────
// ⚠ Warum das zuverlaessig geht, anders als bei Instagram: Google verlangt
// fuer die Rezept-Kacheln in der Suche das JSON-LD-Markup, deshalb tragen
// es praktisch alle Rezeptseiten. Gelesen wird die oeffentliche Seite -
// dieselbe, die ein Browser auch bekommt.
// ⚠ RECHTLICH: das ist fuer den EIGENEN Gebrauch mit Quellenangabe und Link
// gedacht. Der Feed speichert Titel, Bild-ADRESSE, Zutaten und Schritte
// samt Herkunft; weiterveroeffentlicht wird nichts.
export function feedLinks(xml, max) {
  const raus = [];
  const rss = [...xml.matchAll(/<item\b[\s\S]*?<link>\s*([^<\s]+)\s*<\/link>/gi)].map(m => m[1]);
  const atom = [...xml.matchAll(/<entry\b[\s\S]*?<link[^>]*href="([^"]+)"/gi)].map(m => m[1]);
  const alle = rss.concat(atom).map(u => saeubere(u));
  for (const u of alle) { if (/^https?:\/\//i.test(u) && !raus.includes(u)) raus.push(u); }
  return raus.slice(0, max);
}

export function jsonLdBloecke(html) {
  const raus = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const roh = m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim();
    try { raus.push(JSON.parse(roh)); } catch (e) { /* kaputtes Markup ueberspringen */ }
  }
  return raus;
}

export function findeRezept(knoten, tiefe) {
  if (!knoten || tiefe > 6) return null;
  if (Array.isArray(knoten)) {
    for (const k of knoten) { const t = findeRezept(k, tiefe + 1); if (t) return t; }
    return null;
  }
  if (typeof knoten !== 'object') return null;
  const typ = [].concat(knoten['@type'] || []).map(x => String(x).toLowerCase());
  if (typ.includes('recipe')) return knoten;
  for (const k of ['@graph', 'mainEntity', 'itemListElement']) {
    if (knoten[k]) { const t = findeRezept(knoten[k], tiefe + 1); if (t) return t; }
  }
  return null;
}

export function bildAus(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return bildAus(v[0]);
  if (typeof v === 'object') return bildAus(v.url || v.contentUrl || '');
  return '';
}

// ⚠ ANLEITUNGEN SIND VERSCHACHTELT, nicht flach. Gemessen an echten
// Seiten kommt recipeInstructions in mindestens fuenf Formen: Fliesstext,
// Liste von HowToStep, HowToSection mit itemListElement, HowToStep mit
// HowToDirection DARIN (kein eigenes "text"), und als ItemList-Huelle.
// Die frueheren Fassung kannte nur die ersten drei; bei den anderen fiel
// der echte Text weg und stattdessen landete der Name des Knotens
// ("Schritt 1", "Zubereitung") als Kochschritt in der App - also gleich
// zweimal falsch. Deshalb: erst nach Kindern schauen, dann nach Text.
// ⚠ Ein Abschnittsname ist eine UEBERSCHRIFT und wird nie zum Schritt;
// der Name eines Schritts dagegen ist auf vielen Seiten der Schritt selbst.
// ⚠ HowToTip/HowToSupply sind bewusst draussen: ein Tipp ist kein
// Arbeitsschritt (dieselbe Linie wie "Notes"/"Storing").
const HUELLE = /^(?:howtosection|itemlist|list|creativework)$/;
const KEIN_SCHRITT_TYP = /^(?:howtotip|howtosupply|howtotool|imageobject|videoobject)$/;
export function anweisungenAus(v, tiefe) {
  const t = tiefe || 0;
  if (!v || t > 6) return [];
  if (typeof v === 'string') return zuSchritten(v);
  if (Array.isArray(v)) { const raus = []; v.forEach(x => raus.push(...anweisungenAus(x, t + 1))); return raus; }
  if (typeof v !== 'object') return [];
  const typ = String([].concat(v['@type'] || '')[0] || '').toLowerCase();
  if (KEIN_SCHRITT_TYP.test(typ)) return [];
  const kinder = v.itemListElement || v.steps || v.step;
  if (HUELLE.test(typ) && kinder) return anweisungenAus(kinder, t + 1);
  if (v.text) return anweisungenAus(v.text, t + 1);
  if (kinder) return anweisungenAus(kinder, t + 1);
  if (v.name && !HUELLE.test(typ)) return zuSchritten(v.name);
  return [];
}

// ── TheMealDB: deren Antwort in einen Vorschlag uebersetzen ──────────────
// ⚠ Wird von BEIDEN Seiten gebraucht: vom Tageslauf und vom Nachladen im
// Browser. TheMealDB legt die Zutaten als 20 Einzelfelder ab
// (strIngredient1..20 + strMeasure1..20) - genau diese Eigenart ist der
// Grund, warum die Uebersetzung an EINER Stelle stehen muss.
export function mealDbToItem(m){
  if(!m||!m.strMeal)return null;
  const zutaten=[];
  for(let k=1;k<=20;k++){
    const z=(m['strIngredient'+k]||'').trim();
    const menge=(m['strMeasure'+k]||'').trim();
    if(z)zutaten.push((menge?menge+' ':'')+z);
  }
  return baue({
    src:'themealdb', srcName:'TheMealDB',
    title:m.strMeal, image:m.strMealThumb,
    url:m.strSource||('https://www.themealdb.com/meal/'+(m.idMeal||'')),
    video:m.strYoutube||'',
    ingredients:zutaten,
    steps:zuSchritten(m.strInstructions),
    tags:[m.strCategory,m.strArea].filter(Boolean),
  });
}
