// ── EIN CSS-KOMMENTAR DARF KEINE REGELN VERSCHLUCKEN ──────────────────
// Anlass (2026-09-19, in DIESER Sitzung passiert und zweimal hintereinander):
// im erklaerenden Kommentar ueber dem Archiv-Block stand eine Regelgruppe als
// "rterm-top" plus Glob-Sternchen abgekuerzt, direkt gefolgt von einem
// Schraegstrich. Diese zwei Zeichen BEENDEN den CSS-Kommentar mitten im Satz.
// Der Resttext wurde danach als CSS gelesen und hat die folgenden Regeln
// mitgerissen.
//
// Gemessen im Browser: .rterm-shell stand auf display:block statt flex,
// .rterm-side war 1286px breit statt 300px, beide Spalten stapelten
// untereinander - und eine Aufzaehlung ALLER Stylesheets fand die Regel
// ueberhaupt nicht mehr. Der Browser meldet dabei nichts: kein Fehler, keine
// Warnung, die Regeln sind einfach weg.
//
// ⚠ Warum ein eigener Waechter und nicht "besser aufpassen": genau das hat
// nicht funktioniert. Beim ERSTEN Reparaturversuch wurde die kaputte
// Zeichenfolge im Warntext woertlich zitiert - und damit exakt derselbe
// Fehler nochmal ausgeloest. Ein Absatz erinnert niemanden, ein roter Lauf
// schon.
//
// Die Pruefung ahmt den Browser nach: Kommentar endet am ERSTEN */, danach
// muss jeder Textabschnitt vor einem { ein Selektor sein. Ein Semikolon oder
// ein deutscher Prosa-Satz an dieser Stelle ist ausgelaufener Kommentartext.
const fs = require('fs');

const DATEI = process.env.CHECK_HTML || 'index.html';

function styleBloecke(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ css: m[1], offset: m.index + m[0].indexOf(m[1]) });
  return out;
}

// Zeilennummer im Originaldokument, damit der Befund anklickbar ist.
const zeileVon = (html, pos) => html.slice(0, pos).split('\n').length;

// Deutsche Prosa-Signale. Bewusst Stoppwoerter statt "irgendein Wort":
// Selektoren wie .note-dirbtn oder [data-fx-theme] enthalten auch Buchstaben.
const PROSA = /\b(der|die|das|und|nicht|wird|wird|eine|einen|einem|sind|statt|sonst|damit|weil|dieser|diese|dieses|ohne|aber|schon|noch|jede|jeder|jedes)\b/i;
const UMLAUT = /[äöüÄÖÜß]/;

function pruefe(html) {
  const befunde = [];
  for (const { css, offset } of styleBloecke(html)) {
    // Genau wie der Browser: Kommentar endet am ERSTEN */. Durch Leerzeichen
    // ersetzen statt loeschen, damit die Zeichenpositionen (und damit die
    // gemeldeten Zeilennummern) stimmen.
    const ohne = css.replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, ' '));
    // Ein Durchlauf mit Tiefenzaehler: bei { wird der gesammelte Text als
    // Selektor geprueft, bei } verworfen. Das behandelt @media/@supports
    // richtig - ein Ueberspringen ganzer Bloecke haette deren schliessende
    // Klammer in den naechsten "Selektor" gezogen (erster Anlauf: 42
    // Fehlalarme wie "} .profile-btn").
    let tiefe = 0, buf = '', bufStart = 0;
    for (let k = 0; k < ohne.length; k++) {
      const c = ohne[k];
      if (c === '{') {
        const sel = buf.trim();
        if (sel) {
          const kompakt = sel.replace(/\s+/g, ' ');
          const zeile = zeileVon(html, offset + bufStart + buf.indexOf(sel[0]));
          const kurz = kompakt.slice(0, 110);
          if (sel.includes(';'))
            befunde.push({ zeile, grund: 'Semikolon vor einem { - hier steht eine Deklaration, wo ein Selektor stehen muesste', kurz });
          else if (UMLAUT.test(sel) || PROSA.test(sel))
            befunde.push({ zeile, grund: 'Fliesstext an Selektor-Stelle - sehr wahrscheinlich aus einem vorzeitig beendeten Kommentar ausgelaufen', kurz });
          // Laenge allein reicht NICHT: eine ehrliche Selektorliste
          // (body.anim-enter .rank-bar, ... ) wird hier legitim ueber 300
          // Zeichen lang - gemessen an der laengsten im Projekt. Der
          // Unterschied zu ausgelaufenem Text sind die Kommas: eine lange
          // Liste hat viele, ein Fliesstext praktisch keine.
          else if (kompakt.length > 300 && (kompakt.match(/,/g) || []).length < 3)
            befunde.push({ zeile, grund: 'langer Selektor ohne Kommas - typisch fuer ausgelaufenen Kommentartext', kurz });
        }
        tiefe++; buf = ''; bufStart = k + 1;
      } else if (c === '}') {
        if (tiefe > 0) tiefe--;
        buf = ''; bufStart = k + 1;
      } else {
        buf += c;
      }
    }
  }
  return befunde;
}

// Gegenprobe: baut den echten Fehler ein und verlangt, dass er rot wird.
if (process.argv.includes('--gegenprobe')) {
  const html = fs.readFileSync(DATEI, 'utf8');
  const kaputt = html.replace(
    /\/\* ── ARCHIVE \(Umbau 2026-09-19/,
    '/* ── ARCHIVE: die frueheren .rterm-top*/.rterm-riskbox-Regeln sind weg, und das hier ist der Resttext'
  );
  if (kaputt === html) { console.log('GEGENPROBE FEHLGESCHLAGEN: Ankerkommentar nicht gefunden'); process.exit(1); }
  const b = pruefe(kaputt);
  if (!b.length) { console.log('GEGENPROBE FEHLGESCHLAGEN: eingebauter Fehler wurde NICHT gemeldet'); process.exit(1); }
  console.log('Gegenprobe ok: eingebauter Fehler gemeldet (' + b.length + ' Befund(e), erster in Zeile ' + b[0].zeile + ')');
  process.exit(0);
}

const html = fs.readFileSync(DATEI, 'utf8');
const b = pruefe(html);
if (b.length) {
  console.log('CSS-KOMMENTAR VERSCHLUCKT REGELN:');
  b.forEach(x => console.log(`  ${DATEI}:${x.zeile}  ${x.grund}\n     gelesen als Selektor: "${x.kurz}"`));
  console.log('\n  Ursache ist fast immer ein Stern direkt vor einem Schraegstrich im Kommentartext.');
  process.exit(1);
}
console.log('CSS-Kommentare ok: ' + styleBloecke(html).length + ' <style>-Bloecke, jeder Selektor ist ein Selektor');
