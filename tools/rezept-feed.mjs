#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
//  PERFECT REZEPT - TAEGLICHE ESSENSVORSCHLAEGE EINSAMMELN
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠ Gehoert zur Rezept-App, NICHT zum FX Analyst Pro (siehe docs/rezept.md).
//
// Nutzer-Wunsch 2026-09-03: "irgendeine Quelle die jeden Tag neue
// essenvorschlaege mit direkt erstellbaren Rezepten liefert".
//
// ⚠ WARUM DAS HIER LAEUFT UND NICHT IM BROWSER - drei Gruende, jeder allein
// ausreichend:
//   1. API-Schluessel. Ein Spoonacular-Schluessel im Browser steht im
//      Quelltext einer oeffentlich erreichbaren Seite. Hier liegt er als
//      GitHub-Secret.
//   2. CORS. Fremde Server erlauben der Seite die Abfrage meist nicht -
//      genau die Wand, an der der Instagram-Import steht. Ein Server-Lauf
//      kennt diese Regel nicht.
//   3. Kontingent. Ein Lauf pro Tag verbraucht 1 Abfrage, nicht eine pro
//      Geraet und Seitenaufruf.
// Das Ergebnis landet als rezept_feed.json IM REPO - die App liest es von
// ihrer eigenen Adresse: kein Schluessel, kein CORS, offline nutzbar.
//
// ⚠ EINE KAPUTTE QUELLE DARF DEN LAUF NICHT KIPPEN. Jede Quelle laeuft in
// ihrem eigenen try/catch und meldet, was sie geliefert hat. Ein Feed, der
// heute 500 zurueckgibt, kostet ein paar Vorschlaege - nicht den Vorrat.
//
// Aufruf:  node tools/rezept-feed.mjs [--out rezept_feed.json] [--max 90]
// Umgebung: SPOONACULAR_KEY (freiwillig)

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCaption } from '../js/rezept/import.js';
// ⚠ Zerlegen und Aufbauen stehen in js/rezept/feed.js - dieselbe Datei
// benutzt die App beim Nachladen. Siehe Kopf dort.
import { themenOf } from '../js/rezept/themen.js';
import { saeubere, zuSchritten, isoMinuten, zahl, idAus, normTitel, baue,
  feedLinks, jsonLdBloecke, findeRezept, bildAus, anweisungenAus,
  mealDbToItem, putzeSchritte } from '../js/rezept/feed.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..');
const UA = 'Mozilla/5.0 (compatible; PerfectRezeptBot/1.0; +https://github.com/jo-brxxn/FX-final)';

const args = process.argv.slice(2);
const argOf = (n, f) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : f; };
const AUS = path.resolve(WURZEL, argOf('--out', 'rezept_feed.json'));
const MAX = Math.max(9, Number(argOf('--max', '90')) || 90);
// ⚠ WARUM DIE BILDER IM REPO LIEGEN: ein Bild von einer fremden Adresse
// laesst sich im Browser NICHT lokal speichern, wenn der fremde Server kein
// CORS erlaubt - und das tun Foodblogs meist nicht. Gemessen: aus einem
// Vorschlag wurde beim "Add as recipe" ein ERFUNDENES Titelbild statt des
// Fotos, das man in der Vorschlagskarte gesehen hatte. Der Runner hat diese
// Grenze nicht. Er holt das Bild also einmal, rechnet es klein und legt es
// neben den Vorrat - von da an ist es fuer die App eigenes Gebiet:
// dasselbe Foto ueberall, und offline.
const BILDER = path.resolve(WURZEL, 'rezept_bilder');
// Zielgroesse je Bild. 90 KB x 90 Eintraege = ~8 MB Deckel fuers Repo.
const BILD_BYTES = 90 * 1024;
const BILD_KANTE = 900;

const log = (...a) => console.log('[feed]', ...a);

// ── Netz ─────────────────────────────────────────────────────────────────
async function hole(url, { json = false, ms = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8' },
      redirect: 'follow',
    });
    if (!res.ok) { log('  ✗', res.status, url.slice(0, 90)); return null; }
    return json ? await res.json() : await res.text();
  } catch (e) {
    log('  ✗', (e && e.name === 'AbortError') ? 'Zeitueberschreitung' : (e && e.message), url.slice(0, 90));
    return null;
  } finally { clearTimeout(t); }
}

// ── Quelle A: TheMealDB ──────────────────────────────────────────────────
// Frei, ohne Schluessel, vollstaendige Rezepte. Der Bestand ist mit ~300
// Gerichten klein - deshalb ist Entdoppeln weiter unten Pflicht, sonst
// stehen nach zwei Wochen dieselben Gerichte doppelt im Vorrat.
async function quelleMealDb(cfg) {
  const raus = [];
  const n = Math.max(1, Math.min(12, cfg.anzahl || 6));
  for (let i = 0; i < n; i++) {
    const d = await hole('https://www.themealdb.com/api/json/v1/1/random.php', { json: true });
    const e = mealDbToItem(d && d.meals && d.meals[0]);
    if (e) raus.push(e);
  }
  return raus;
}

// ── Quelle B: Spoonacular ────────────────────────────────────────────────
// ⚠ Ohne Schluessel wird STILL uebersprungen (kein Fehler): der Lauf soll
// auch dann taeglich Vorschlaege liefern, wenn kein Konto angelegt ist.
async function quelleSpoonacular(cfg, key) {
  if (!key) { log('Spoonacular: kein SPOONACULAR_KEY gesetzt - uebersprungen'); return []; }
  const n = Math.max(1, Math.min(10, cfg.anzahl || 4));
  const d = await hole(`https://api.spoonacular.com/recipes/random?number=${n}&apiKey=${encodeURIComponent(key)}`, { json: true });
  const liste = (d && d.recipes) || [];
  return liste.map(r => {
    const schritte = [];
    (r.analyzedInstructions || []).forEach(bl => (bl.steps || []).forEach(s => { if (s.step) schritte.push(s.step); }));
    return baue({
      src: 'spoonacular', srcName: 'Spoonacular',
      title: r.title, image: r.image, url: r.sourceUrl || r.spoonacularSourceUrl || '',
      creator: r.sourceName || '',
      min: r.readyInMinutes || null, servings: r.servings || null,
      ingredients: (r.extendedIngredients || []).map(z => z.original),
      steps: schritte.length ? schritte : zuSchritten(r.instructions),
      tags: [].concat(r.dishTypes || [], r.diets || []).slice(0, 6),
    });
  }).filter(Boolean);
}

async function quelleJsonLd(cfg) {
  const seiten = (cfg.seiten || []).filter(s => s && s.feed);
  if (!seiten.length) { log('JSON-LD: keine Seiten eingetragen (tools/rezept-quellen.json)'); return []; }
  const proSeite = Math.max(1, Math.min(6, cfg.proSeite || 3));
  const raus = [];
  for (const s of seiten) {
    const xml = await hole(s.feed);
    if (!xml) continue;
    // "pro" an EINER Seite schlaegt den gemeinsamen Wert - so bekommen neu
    // ausgewaehlte Quellen mehr Gewicht im Vorrat, ohne dass jede alte
    // Seite mitwaechst (Nutzer-Wunsch 2026-09-03: neue Quellen staerker).
    const links = feedLinks(xml, Math.max(1, Math.min(6, s.pro || proSeite)));
    log(`JSON-LD ${s.name}: ${links.length} neue Beitraege`);
    for (const u of links) {
      const html = await hole(u);
      if (!html) continue;
      let r = null;
      for (const b of jsonLdBloecke(html)) { r = findeRezept(b, 0); if (r) break; }
      if (!r) { log('  – kein Rezept-Markup:', u.slice(0, 70)); continue; }
      const e = baue({
        src: 'blog', srcName: s.name || 'Blog',
        title: r.name, image: bildAus(r.image), url: u,
        creator: (r.author && (r.author.name || (Array.isArray(r.author) && r.author[0] && r.author[0].name))) || s.name || '',
        min: isoMinuten(r.totalTime) || isoMinuten(r.cookTime) || null,
        servings: zahl(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield),
        ingredients: [].concat(r.recipeIngredient || r.ingredients || []),
        steps: anweisungenAus(r.recipeInstructions),
        tags: [].concat(r.recipeCategory || [], r.recipeCuisine || []).slice(0, 4),
      });
      if (e) raus.push(e);
    }
  }
  return raus;
}

// ⚠ EIN HANDLE IST KEINE KANAL-ID. Der Atom-Feed braucht die UC...-ID; in
// der Adresse eines Kanals steht heute meist nur "@name". Die ID steht aber
// im Quelltext der Kanalseite ("channelId":"UC..."), also wird sie EINMAL
// aufgeloest. Klappt das nicht, wird der Kanal uebersprungen - eine
// geratene ID waere ein Feed, der nichts liefert.
let letzteSuche = 0;
const SUCH_PAUSE = 4000;
async function kanalId(k) {
  if (k.id) return k.id;
  const zieh = html => {
    const m = html && (/"channelId":"(UC[\w-]{20,})"/.exec(html) || /channel\/(UC[\w-]{20,})/.exec(html));
    return m ? m[1] : '';
  };
  if (k.handle) {
    const h = String(k.handle).replace(/^@?/, '@');
    const id = zieh(await hole('https://www.youtube.com/' + encodeURIComponent(h).replace('%40', '@') + '/videos'));
    if (id) return id;
  }
  // ⚠ HANDLE RATEN IST AUCH RATEN. In Runde 2 waren vier von acht geratenen
  // Handles schlicht 404 - der Kandidat fiel damit durch, ohne dass jemand
  // wusste, ob es den Kanal gibt. Deshalb sucht der Lauf den Kanal notfalls
  // ueber seinen NAMEN (sp=EgIQAg: Suchfilter "Kanaele") und nimmt den
  // ersten Treffer. Ein Kandidat braucht dann nur noch {"name": "..."}.
  // Der gefundene Kanal wird im Ergebnis mit Namen ausgewiesen, damit beim
  // Uebernehmen auffaellt, wenn die Suche danebengegriffen hat.
  const suche = k.suche || k.name;
  if (!suche) return '';
  // ⚠ YouTube drosselt die Suche. Gemessen im ersten Lauf: die ersten zehn
  // Namen wurden aufgeloest, ab dem elften kam nur noch "fetch failed" -
  // 22 Koeche galten dadurch als nicht auffindbar, obwohl es sie gibt.
  // Deshalb eine Pause zwischen den Suchen; sie kostet den Pruef-Lauf ein
  // paar Minuten und ist der Unterschied zwischen einem Befund und Rauschen.
  const seit = Date.now() - letzteSuche;
  if (seit < SUCH_PAUSE) await new Promise(r => setTimeout(r, SUCH_PAUSE - seit));
  letzteSuche = Date.now();
  const html = await hole('https://www.youtube.com/results?search_query='
    + encodeURIComponent(suche) + '&sp=EgIQAg%3D%3D');
  return zieh(html);
}

// ── Quelle D: YouTube-Kanaele ueber ihren oeffentlichen Feed ─────────────
// ⚠ Kein Schluessel noetig: jeder Kanal hat einen Atom-Feed. Aus Titel und
// Beschreibung entsteht ein Entwurf ueber DENSELBEN Parser wie beim
// Reel-Import (js/rezept/import.js) - zwei Parser waeren zwei Verhalten.
async function quelleYoutube(cfg) {
  const kanaele = (cfg.kanaele || []).filter(k => k && (k.id || k.handle));
  if (!kanaele.length) { log('YouTube: keine Kanaele eingetragen (tools/rezept-quellen.json)'); return []; }
  const pro = Math.max(1, Math.min(5, cfg.proKanal || 2));
  const raus = [];
  for (const k of kanaele) {
    const id = await kanalId(k);
    if (!id) { log(`YouTube ${k.name}: Kanal-ID nicht aufloesbar - uebersprungen`); continue; }
    const xml = await hole('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(id));
    if (!xml) continue;
    // "pro" an EINEM Kanal schlaegt den gemeinsamen Wert - siehe JSON-LD.
    const eintraege = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]).slice(0, Math.max(1, Math.min(5, k.pro || pro)));
    log(`YouTube ${k.name}: ${eintraege.length} Videos`);
    for (const e of eintraege) {
      const titel = saeubere((/<title>([\s\S]*?)<\/title>/i.exec(e) || [])[1] || '');
      const vid = (/<yt:videoId>([\w-]+)<\/yt:videoId>/i.exec(e) || [])[1] || '';
      const beschr = saeubere((/<media:description>([\s\S]*?)<\/media:description>/i.exec(e) || [])[1] || '');
      if (!vid) continue;
      const entwurf = parseCaption(titel + '\n' + beschr);
      const eintrag = baue({
        src: 'youtube', srcName: k.name || 'YouTube',
        title: entwurf.title && entwurf.title.length > 4 ? entwurf.title : titel,
        image: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
        url: 'https://www.youtube.com/watch?v=' + vid,
        video: 'https://www.youtube.com/watch?v=' + vid,
        creator: k.name || entwurf.creator || '',
        min: entwurf.min || null,
        ingredients: entwurf.ingredients,
        steps: entwurf.steps,
        tags: entwurf.tags,
      });
      if (eintrag) raus.push(eintrag);
      else log('  – zu wenig Rezepttext im Video:', titel.slice(0, 50));
    }
  }
  return raus;
}

// ── Kandidaten pruefen ───────────────────────────────────────────────────
// ⚠ WARUM DAS EIN EIGENER MODUS IST: Feed-Adressen und Kanal-IDs lassen sich
// aus der Entwicklungsumgebung nicht pruefen (der Egress-Proxy blockt fremde
// Domains). Geraten wird hier nicht - der Runner probiert jeden Kandidaten
// aus und sagt, was wirklich Rezepte liefert. Was besteht, wandert nach
// tools/rezept-quellen.json.
// ── Bilder neben den Vorrat legen ────────────────────────────────────────
// Klein gerechnet wird mit ImageMagick. ⚠ Ist es nicht da, wird NICHT
// geraten und auch nichts Riesiges ins Repo gelegt: dann wandert das Bild
// nur mit, wenn es ohnehin klein genug ist - sonst behaelt der Eintrag seine
// Fernadresse und die App zeigt eben das Bild von der fremden Seite.
let magickCmd = null;
function magick() {
  if (magickCmd !== null) return magickCmd;
  for (const c of ['magick', 'convert']) {
    const r = spawnSync(c, ['-version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { magickCmd = c; return magickCmd; }
  }
  log('⚠ ImageMagick fehlt - Bilder wandern nur mit, wenn sie schon klein genug sind');
  magickCmd = '';
  return magickCmd;
}
function rechneKlein(roh) {
  const c = magick();
  if (!c) return roh.length <= BILD_BYTES ? roh : null;
  for (const q of [82, 70, 58, 45]) {
    const r = spawnSync(c, ['-', '-auto-orient', '-resize', BILD_KANTE + 'x' + BILD_KANTE + '>',
      '-strip', '-quality', String(q), 'jpg:-'], { input: roh, maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0 && r.stdout && r.stdout.length && r.stdout.length <= BILD_BYTES) return r.stdout;
  }
  return null;
}
async function bildDazu(e) {
  if (!e || !e.image) return;
  // Schon lokal (aus einem frueheren Lauf uebernommen)? Dann nichts tun -
  // ausser die Datei ist weg, dann zurueck zur Quelladresse.
  if (!/^https?:/i.test(e.image)) {
    if (fs.existsSync(path.join(BILDER, path.basename(e.image)))) return;
    e.image = e.imageSrc || '';
    if (!e.image) return;
  }
  const name = e.id + '.jpg';
  const ziel = path.join(BILDER, name);
  if (fs.existsSync(ziel)) { e.imageSrc = e.imageSrc || e.image; e.image = 'rezept_bilder/' + name; return; }
  let roh = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(e.image, { signal: ctrl.signal, headers: { 'User-Agent': UA }, redirect: 'follow' });
    clearTimeout(t);
    if (res.ok) roh = Buffer.from(await res.arrayBuffer());
  } catch (err) { /* faellt unten auf die Fernadresse zurueck */ }
  if (!roh || !roh.length) { log('  ✗ Bild nicht erreichbar:', String(e.image).slice(0, 70)); return; }
  const klein = rechneKlein(roh);
  if (!klein) { log('  ✗ Bild zu gross und nicht kleinzurechnen:', String(e.image).slice(0, 70)); return; }
  fs.mkdirSync(BILDER, { recursive: true });
  fs.writeFileSync(ziel, klein);
  e.imageSrc = e.image;                            // Herkunft bleibt nachvollziehbar
  e.image = 'rezept_bilder/' + name;
}
// Was zu keinem Eintrag mehr gehoert, fliegt raus - sonst waechst der Ordner
// mit jedem Lauf, obwohl der Vorrat bei MAX gedeckelt ist.
function raeumeBilder(items) {
  if (!fs.existsSync(BILDER)) return 0;
  const behalten = new Set(items.map(i => path.basename(String(i.image || ''))).filter(n => /\.jpg$/.test(n)));
  let weg = 0;
  for (const f of fs.readdirSync(BILDER)) {
    if (!/\.jpg$/.test(f) || behalten.has(f)) continue;
    fs.unlinkSync(path.join(BILDER, f)); weg++;
  }
  return weg;
}

// ⚠ EINE FEED-ADRESSE RATEN IST RATEN. In Runde 3 waren drei von vier
// geratenen "/feed/"-Adressen falsch (404 oder nichts) - der Koch galt als
// durchgefallen, obwohl seine Seite einen Feed hat, nur woanders. Jede Seite
// nennt ihn selbst im Kopf: <link rel="alternate" type="application/rss+xml">.
// Also wird er von dort gelesen, wenn der Kandidat nur eine Adresse angibt.
async function feedAdresse(k) {
  if (k.feed) {
    const probe = await hole(k.feed, { ms: 15000 });
    if (probe && /<(rss|feed|channel)\b/i.test(probe)) return { url: k.feed, xml: probe };
  }
  const start = k.seite || k.feed;
  if (!start) return null;
  const basis = new URL(start).origin + '/';
  const html = await hole(basis, { ms: 15000 });
  if (!html) return null;
  const kandidaten = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const h = /href=["']([^"']+)["']/i.exec(tag);
    if (h) kandidaten.push(new URL(h[1], basis).href);
  }
  for (const u of kandidaten) {
    const xml = await hole(u, { ms: 15000 });
    if (xml && /<(rss|feed|channel)\b/i.test(xml)) return { url: u, xml, gefunden: true };
  }
  return null;
}

async function pruefeKandidaten() {
  let k = {};
  try { k = JSON.parse(fs.readFileSync(path.join(HIER, 'rezept-kandidaten.json'), 'utf8')); }
  catch (e) { console.error('[pruefe] tools/rezept-kandidaten.json fehlt oder ist kaputt:', e.message); process.exit(1); }

  const gutBlogs = [], gutTube = [];
  console.log('\n═══ BLOGS (schema.org/Recipe) ═══');
  for (const b of (k.blogs || [])) {
    const gef = await feedAdresse(b);
    if (!gef) { console.log(`✗ ${b.name.padEnd(24)} kein Feed gefunden (weder ${b.feed || b.seite} noch im Seitenkopf)`); continue; }
    const xml = gef.xml;
    if (gef.gefunden) console.log(`  … ${b.name.padEnd(22)} Feed aus dem Seitenkopf: ${gef.url}`);
    b.feed = gef.url;
    const links = feedLinks(xml, 2);
    if (!links.length) { console.log(`✗ ${b.name.padEnd(24)} Feed ohne Beitragslinks`); continue; }
    let treffer = null, geprueft = 0;
    for (const u of links) {
      const html = await hole(u, { ms: 15000 });
      if (!html) continue;
      geprueft++;
      let r = null;
      for (const blk of jsonLdBloecke(html)) { r = findeRezept(blk, 0); if (r) break; }
      if (!r) continue;
      const e = baue({
        src: 'blog', srcName: b.name, title: r.name, image: bildAus(r.image), url: u,
        min: isoMinuten(r.totalTime) || isoMinuten(r.cookTime) || null,
        ingredients: [].concat(r.recipeIngredient || []),
        steps: anweisungenAus(r.recipeInstructions),
      });
      if (e) { treffer = e; break; }
    }
    if (treffer) {
      gutBlogs.push({ name: b.name, feed: b.feed });
      console.log(`✓ ${b.name.padEnd(24)} "${treffer.title.slice(0, 40)}" - ${treffer.ingredients.length} Zutaten, ${treffer.steps.length} Schritte, Bild ${treffer.image ? 'ja' : 'nein'}, Themen ${JSON.stringify(treffer.themes)}`);
    } else {
      console.log(`✗ ${b.name.padEnd(24)} ${geprueft} Beitraege geprueft, kein brauchbares Rezept-Markup`);
    }
  }

  console.log('\n═══ YOUTUBE-KANAELE ═══');
  for (const c of (k.youtube || [])) {
    const id = await kanalId(c);
    if (!id) { console.log(`✗ ${c.name.padEnd(24)} Kanal-ID nicht aufloesbar (${c.handle || c.id || '?'})`); continue; }
    const xml = await hole('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { ms: 15000 });
    if (!xml) { console.log(`✗ ${c.name.padEnd(24)} Feed nicht erreichbar (${id})`); continue; }
    const eintraege = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]).slice(0, 3);
    // ⚠ Wurde der Kanal ueber die NAMENSSUCHE gefunden, muss der Bericht
    // sagen, WEN sie gefunden hat - sonst uebernimmt man einen fremden Kanal,
    // weil der gesuchte gar keinen hat. Der Titel steht im Kopf des Feeds.
    const echterName = saeubere((/<title>([\s\S]*?)<\/title>/i.exec(xml) || [])[1] || '');
    const geraten = !c.id && !c.handle;
    const wer = echterName && echterName.toLowerCase() !== String(c.name).toLowerCase()
      ? `  [Kanal heisst: "${echterName}"]` : '';
    let bester = null;
    for (const e of eintraege) {
      const titel = saeubere((/<title>([\s\S]*?)<\/title>/i.exec(e) || [])[1] || '');
      const beschr = saeubere((/<media:description>([\s\S]*?)<\/media:description>/i.exec(e) || [])[1] || '');
      const ent = parseCaption(titel + '\n' + beschr);
      const punkte = ent.ingredients.length + ent.steps.length;
      if (!bester || punkte > bester.punkte) bester = { punkte, titel, z: ent.ingredients.length, s: ent.steps.length };
    }
    // ⚠ Viele Kochkanaele schreiben das Rezept NICHT in die Beschreibung.
    // Genau das soll diese Pruefung zeigen, statt spaeter leere Karten.
    // ⚠ ZUTATEN SIND PFLICHT, Schritte allein reichen nicht. Mit der alten
    // Oder-Schwelle bestand ein Restaurant-Vlog ("Asia Neueroeffnungen in
    // Wiesbaden", 0 Zutaten / 2 Schritte) die Pruefung - jeder Absatz der
    // Beschreibung zaehlte als Kochschritt. Ein Rezept ohne Zutatenliste
    // ist in dieser App auch kein Rezept: die Einkaufsliste bliebe leer.
    if (bester && bester.z >= 3) {
      gutTube.push({ name: echterName || c.name, id });
      console.log(`✓ ${c.name.padEnd(24)} ${id} - bestes Video: ${bester.z} Zutaten, ${bester.s} Schritte ("${bester.titel.slice(0, 34)}")${geraten ? ' [ueber Namenssuche]' : ''}${wer}`);
    } else {
      console.log(`✗ ${c.name.padEnd(24)} ${id} - Beschreibungen enthalten kein Rezept (${bester ? bester.z + '/' + bester.s : '0/0'})${geraten ? ' [ueber Namenssuche]' : ''}${wer}`);
    }
  }

  console.log('\n═══ ZUM UEBERNEHMEN IN tools/rezept-quellen.json ═══');
  console.log('"seiten": ' + JSON.stringify(gutBlogs, null, 2));
  console.log('"kanaele": ' + JSON.stringify(gutTube, null, 2));
  console.log(`\n[pruefe] ${gutBlogs.length} von ${(k.blogs || []).length} Blogs, ${gutTube.length} von ${(k.youtube || []).length} Kanaelen brauchbar.`);
}

// ── Lauf ─────────────────────────────────────────────────────────────────
// ⚠ Nur ausfuehren, wenn die Datei DIREKT aufgerufen wird. Der Waechter
// importiert sie, um die Zerlege-Funktionen mit festen Beispielen zu
// pruefen - ohne diese Bedingung wuerde jeder Import einen kompletten
// Netz-Lauf ausloesen.
export async function lauf() {
  if (args.includes('--pruefe')) { await pruefeKandidaten(); return; }
  const cfgPfad = path.join(HIER, 'rezept-quellen.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPfad, 'utf8')); }
  catch (e) { console.error('[feed] tools/rezept-quellen.json ist nicht lesbar:', e.message); process.exit(1); }

  const an = (k) => cfg[k] && cfg[k].an !== false;
  const teile = [];
  const bericht = [];
  const lauf = async (name, fn) => {
    if (!an(name)) { bericht.push(`${name}: aus`); return; }
    try {
      const r = await fn();
      teile.push(...r);
      bericht.push(`${name}: ${r.length}`);
    } catch (e) {
      // ⚠ Eine Quelle darf den Lauf nicht kippen - siehe Kopf der Datei.
      bericht.push(`${name}: FEHLER ${e && e.message}`);
    }
  };

  await lauf('themealdb', () => quelleMealDb(cfg.themealdb || {}));
  await lauf('spoonacular', () => quelleSpoonacular(cfg.spoonacular || {}, process.env.SPOONACULAR_KEY || ''));
  await lauf('jsonld', () => quelleJsonLd(cfg.jsonld || {}));
  await lauf('youtube', () => quelleYoutube(cfg.youtube || {}));

  // Bestand lesen und zusammenfuehren: neue zuerst, Doppelte raus.
  let alt = { items: [] };
  try { alt = JSON.parse(fs.readFileSync(AUS, 'utf8')); } catch (e) { /* erster Lauf */ }
  const altItems = Array.isArray(alt.items) ? alt.items : [];

  // ⚠ BESTEHENDE EINTRAEGE NEU EINSORTIEREN. Die Themen stehen im Vorrat,
  // sind aber ein RECHENERGEBNIS - verbessert sich die Erkennung, muessen
  // die alten Eintraege mitwandern. Sonst blieb "Panang chicken curry" fuer
  // immer unter "Fish" stehen, obwohl die Ursache (Fischsauce) laengst
  // behoben ist. Kostet nichts: kein Netz, reine Rechnung.
  altItems.forEach(e => {
    if (!e || !e.title) return;
    // ⚠ Auch die SCHRITTE nachputzen: der erste scharfe Lauf hat "step 1"
    // und "Notes" als eigene Kochschritte in den Vorrat geschrieben. Die
    // Reparatur am Zerleger allein haette die schon gespeicherten Eintraege
    // nie erreicht.
    const sauber = putzeSchritte(e.steps || []);
    if (sauber.length !== (e.steps || []).length) {
      log(`  Schritte geputzt: ${e.title.slice(0, 40)} ${(e.steps || []).length} -> ${sauber.length}`);
      e.steps = sauber;
    }
    const neu = themenOf(e.title, e.ingredients || [], e.tags || []);
    if (JSON.stringify(neu) !== JSON.stringify(e.themes || [])) {
      log(`  neu einsortiert: ${e.title.slice(0, 40)} ${JSON.stringify(e.themes)} -> ${JSON.stringify(neu)}`);
      e.themes = neu;
    }
  });

  const gesehen = new Set();
  const zusammen = [];
  for (const e of teile.concat(altItems)) {
    if (!e || !e.title) continue;
    const schluessel = e.id || idAus(normTitel(e.title));
    const titelKey = 'T:' + normTitel(e.title);
    if (gesehen.has(schluessel) || gesehen.has(titelKey)) continue;
    gesehen.add(schluessel); gesehen.add(titelKey);
    zusammen.push(e);
  }
  const items = zusammen.slice(0, MAX);

  // ⚠ ERST die Bilder holen, DANN vergleichen. Andersherum haette ein Lauf,
  // der "nur" Bilder lokal gemacht hat, als "nichts Neues" gegolten und
  // waere nie geschrieben worden - derselbe Fehler wie beim Neueinsortieren
  // der Themen weiter oben.
  let lokal = 0, fern = 0;
  for (const e of items) {
    await bildDazu(e);
    if (e.image && !/^https?:/i.test(e.image)) lokal++; else if (e.image) fern++;
  }
  const weg = raeumeBilder(items);
  log(`Bilder: ${lokal} lokal, ${fern} nur als Adresse, ${weg} verwaiste geloescht`);

  // ⚠ Nichts schreiben, wenn nichts hinzukam UND der Bestand steht: sonst
  // erzeugt der taegliche Lauf jeden Tag einen Commit, der nur den
  // Zeitstempel aendert.
  // ⚠ Der Vergleich enthaelt die Themen: sonst gilt ein Lauf, der nur neu
  // einsortiert hat, als "nichts Neues" und die Korrektur wird nie
  // geschrieben.
  const kennung = l => l.map(i => i.id + ':' + (i.themes || []).join('+') + ':' + (i.steps || []).length + ':' + (i.image || '')).join(',');
  const neuIds = kennung(items);
  const altIds = kennung(altItems);
  if (neuIds === altIds && altItems.length) {
    log('nichts Neues -', bericht.join(' | '));
    process.exit(0);
  }

  const raus = {
    updated: new Date().toISOString(),
    count: items.length,
    sources: [...new Set(items.map(i => i.srcName))].sort(),
    items,
  };
  fs.writeFileSync(AUS, JSON.stringify(raus, null, 1) + '\n');
  log(`${items.length} Vorschlaege (${teile.length} neu) ->`, path.relative(WURZEL, AUS));
  log(bericht.join(' | '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  lauf().catch(e => {
    console.error('[feed] abgebrochen:', e && e.stack || e);
    process.exit(1);
  });
}
