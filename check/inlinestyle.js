// ── EIN INLINE-style SCHLAEGT JEDE REGEL ──────────────────────────────
// Anlass (2026-09-19, in DIESER Sitzung zweimal hintereinander passiert):
// die Notiz sollte aus dem Archiv heraus als GANZE SEITE aufgehen. Die Regel
// dafuer stand korrekt im Stylesheet (.ov.res-note-page>.modal{max-width:none}),
// am Element stand aber style="max-width:640px". Ein Inline-Wert hat hoehere
// Prioritaet als JEDER Selektor - die Seite war also ueber die volle Hoehe da
// und blieb trotzdem 640px breit (gemessen: modal 640x1000 in einem
// 1500px-Fenster). Derselbe Fall beim Textfeld mit style="min-height:170px".
//
// ⚠ Das Tueckische daran ist, dass NICHTS kaputt aussieht: kein Fehler, keine
// Warnung, die Regel steht sichtbar im Code und "greift nur nicht ganz". Beide
// Male ist der Fehler erst beim NACHMESSEN im Browser aufgefallen, nicht beim
// Lesen des Codes.
//
// ⚠ GEPRUEFT WIRD NUR DER FALL, DER WIRKLICH EIN FEHLER IST. Der erste
// Anlauf meldete jede Ueberlagerung und kam auf 23 Befunde, praktisch alle
// harmlos: ein <div class="modal" style="max-width:560px"> kollidiert eben
// NICHT mit .modal.ci-modal, weil dieses Element die zweite Klasse gar nicht
// traegt. Und einen Grundwert wie .nbox{min-height:...} pro Element inline zu
// uebersteuern ist gaengige, bewusste Praxis. Ein Waechter, der so etwas rot
// meldet, bringt niemandem bei hinzusehen - er bringt bei wegzusehen.
//
// Der Fehler ist enger: eine Regel setzt die Eigenschaft fuer einen ZUSTAND,
// den erst JavaScript herstellt (.ov.res-note-page>.modal), und der Inline-
// Wert am Element macht genau diesen Zustandswechsel wirkungslos. Erkennbar
// daran, dass die fehlende Klasse im Markup NIRGENDS vorkommt - sie existiert
// nur in CSS und in einem classList-Aufruf. Beschraenkt ausserdem auf
// Eigenschaften, bei denen das ein LAYOUT kippt.
const fs = require('fs');

const DATEI = process.env.CHECK_HTML || 'index.html';
const EIGENSCHAFTEN = ['display', 'width', 'max-width', 'min-width', 'height', 'max-height', 'min-height', 'flex', 'flex-direction', 'position'];

const html = fs.readFileSync(DATEI, 'utf8');
const zeileVon = pos => html.slice(0, pos).split('\n').length;

// 1) Alle CSS-Regeln einsammeln: welche Klasse setzt welche Eigenschaft?
const cssBloecke = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
// Alle Klassen, die IRGENDWO im Markup an einem Element stehen - egal ob in
// index.html oder in einem Template-Literal der Module. Was hier fehlt, kann
// nur zur Laufzeit gesetzt werden (classList.add/toggle) und ist damit eine
// Zustandsklasse.
const imMarkup = new Set();
const quellen = [html].concat(
  fs.existsSync('js') ? fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => fs.readFileSync('js/' + f, 'utf8')) : []
);
for (const q of quellen)
  for (const m of q.matchAll(/class=(?:"|\\")([^"\\]*)/g))
    m[1].split(/\s+/).filter(Boolean).forEach(c => { if (!c.includes('$')) imMarkup.add(c); });

// klasse -> Map(eigenschaft -> {selektor, fehlend})
const setztFuer = new Map();
for (const css of cssBloecke) {
  const ohne = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of ohne.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    if (!sel || sel.startsWith('@')) continue;
    const props = EIGENSCHAFTEN.filter(p => new RegExp('(^|;|\\s)' + p + '\\s*:', 'i').test(body));
    if (!props.length) continue;
    const klassenImSel = new Set([...sel.matchAll(/\.([A-Za-z][\w-]*)/g)].map(x => x[1]));
    for (const kl of klassenImSel) {
      if (!setztFuer.has(kl)) setztFuer.set(kl, new Map());
      const m2 = setztFuer.get(kl);
      // ⚠ ALLE Regeln je Eigenschaft sammeln, nicht nur die erste. Im ersten
      // Anlauf wurde nur die zuerst gefundene behalten - das war die
      // GRUNDregel (.res-note-modal{max-width:640px}), die Zustandsregel
      // dahinter fiel weg, und die Gegenprobe blieb gruen, obwohl der Fehler
      // drin war. Ein Waechter, der seinen eigenen Anlassfall nicht findet,
      // ist wertlos.
      props.forEach(p => {
        if (!m2.has(p)) m2.set(p, []);
        m2.get(p).push({ sel: sel.replace(/\s+/g, ' ').slice(0, 80), alle: klassenImSel });
      });
    }
  }
}

// 2) Alle Elemente mit class UND style gegenpruefen
const befunde = [];
for (const m of html.matchAll(/<[a-z][a-z0-9]*\b[^>]*>/gi)) {
  const tag = m[0];
  const kl = /\bclass="([^"]*)"/i.exec(tag);
  const st = /\bstyle="([^"]*)"/i.exec(tag);
  if (!kl || !st) continue;
  const klassen = kl[1].split(/\s+/).filter(Boolean);
  const inline = EIGENSCHAFTEN.filter(p => new RegExp('(^|;)\\s*' + p + '\\s*:', 'i').test(st[1]));
  if (!inline.length) continue;
  for (const k of klassen) {
    const regeln = setztFuer.get(k);
    if (!regeln) continue;
    for (const p of inline) {
      if (!regeln.has(p)) continue;
      // display:none als Startzustand ist Absicht und keine Regel-Kollision:
      // die App schaltet es per JS um, die Regel gilt danach wieder.
      if (p === 'display' && /display\s*:\s*none/i.test(st[1])) continue;
      for (const { sel, alle } of regeln.get(p)) {
        // Nur Zustandsregeln: mindestens eine Klasse des Selektors steht an
        // KEINEM Element im Markup - die kann also nur JavaScript setzen.
        const zustand = [...alle].filter(c => !klassen.includes(c) && !imMarkup.has(c));
        if (!zustand.length) continue;
        befunde.push({ zeile: zeileVon(m.index), klasse: k, prop: p, sel, zustand, tag: tag.slice(0, 90) });
      }
    }
  }
}

if (process.argv.includes('--gegenprobe')) {
  // Der echte Fall: max-width wieder inline an die Notiz-Vollseite haengen.
  const kaputt = html.replace('<div class="modal res-note-modal">', '<div class="modal res-note-modal" style="max-width:640px">');
  if (kaputt === html) { console.log('GEGENPROBE FEHLGESCHLAGEN: Anker nicht gefunden'); process.exit(1); }
  fs.writeFileSync('/tmp/_inline_gegenprobe.html', kaputt);
  const r = require('child_process').spawnSync(process.execPath, [__filename], { env: { ...process.env, CHECK_HTML: '/tmp/_inline_gegenprobe.html' }, encoding: 'utf8' });
  fs.unlinkSync('/tmp/_inline_gegenprobe.html');
  if (r.status === 0) { console.log('GEGENPROBE FEHLGESCHLAGEN: eingebauter Fehler wurde NICHT gemeldet\n' + r.stdout); process.exit(1); }
  console.log('Gegenprobe ok: eingebauter Fehler gemeldet\n  ' + r.stdout.split('\n').filter(l => /res-note-modal/.test(l)).join('\n  '));
  process.exit(0);
}

if (befunde.length) {
  console.log('INLINE-style SCHLAEGT EINE CSS-REGEL:');
  befunde.forEach(b => console.log(`  ${DATEI}:${b.zeile}  .${b.klasse} pinnt "${b.prop}" inline fest. Die Zustandsregel "${b.sel}" (greift erst, wenn JavaScript .${b.zustand.join('/.')} setzt) will dieselbe Eigenschaft aendern - der Inline-Wert gewinnt und der Zustandswechsel bleibt wirkungslos.\n     ${b.tag}`));
  console.log('\n  Loesung: den Wert aus dem style="" in eine eigene Klasse verschieben.');
  process.exit(1);
}
console.log('Inline-styles ok: kein Layout-Wert inline festgenagelt, den eine Zustandsregel aendern will (' + setztFuer.size + ' Klassen, ' + imMarkup.size + ' im Markup belegt)');
