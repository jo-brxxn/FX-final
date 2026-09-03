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
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Schritte aus einem Fliesstext: erst an Zeilenumbruechen, sonst an Saetzen.
// ⚠ Kein Absatz laenger als ~200 Zeichen bleibt stehen - im Kochmodus ist
// eine Textwand unbrauchbar (dieselbe Regel wie im Caption-Parser).
export function zuSchritten(text) {
  const roh = saeubere(text);
  if (!roh) return [];
  let teile = roh.split(/\r?\n+/).map(x => x.replace(/^\s*(?:\d{1,2}[.)]|[-–—•*])\s*/, '').trim()).filter(Boolean);
  if (teile.length <= 1) {
    teile = roh.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map(x => x.trim()).filter(Boolean);
  }
  const fein = [];
  teile.forEach(t => {
    if (t.length > 200) t.split(/(?<=[.!?])\s+/).forEach(x => { const y = x.trim(); if (y) fein.push(y); });
    else fein.push(t);
  });
  return fein.filter(x => x.length > 2).slice(0, 40);
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

// Ein Vorschlag ist nur brauchbar, wenn er Titel, Bild UND genug Inhalt hat.
// ⚠ Halbe Eintraege werden VERWORFEN, nicht mit Platzhaltern aufgefuellt:
// eine Karte ohne Zutaten sieht aus wie ein Rezept, ist aber keins.
export function baue(o) {
  const titel = saeubere(o.title).slice(0, 120);
  const zutaten = (o.ingredients || []).map(x => saeubere(x)).filter(x => x && x.length < 160).slice(0, 40);
  const schritte = (o.steps || []).filter(Boolean);
  if (!titel || titel.length < 3) return null;
  if (!o.image) return null;
  if (zutaten.length < 2 && schritte.length < 2) return null;
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
    steps: schritte.map(x => saeubere(x)).filter(Boolean).slice(0, 40),
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

export function anweisungenAus(v) {
  if (!v) return [];
  if (typeof v === 'string') return zuSchritten(v);
  const raus = [];
  [].concat(v).forEach(s => {
    if (typeof s === 'string') { raus.push(...zuSchritten(s)); return; }
    if (!s || typeof s !== 'object') return;
    const typ = String(s['@type'] || '').toLowerCase();
    if (typ === 'howtosection' && s.itemListElement) { raus.push(...anweisungenAus(s.itemListElement)); return; }
    if (s.text) raus.push(...zuSchritten(s.text));
    else if (s.name) raus.push(saeubere(s.name));
  });
  return raus;
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
