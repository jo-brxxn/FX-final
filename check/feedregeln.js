// ── INDIKATOR-FEED: JEDE REIHE NUR AUS IHREM EIGENEN RELEASE ────────────
// Gefunden 2026-10-07 bei der Klassensuche zu "Muster trifft einen anderen
// Release" (Nutzer: "guck dir die Historie an" - die Release-Tage der
// Historie waren dabei selbst verunreinigt):
//   - USD-NFP: die jaehrliche Benchmark-Revision ("Non Farm Payrolls Annual
//     Revision Prel") stand dreimal als NFP-Wert in ind_data.json
//     (2024-08-21 -818K, 2025-09-09 -911K, 2026-08-28 -79K).
//   - USD-ISM-PMI: S&P Globals Flash-PMI (eine andere Umfrage) stand 16-mal
//     in den ISM-Reihen; vom ~23. bis zum ISM-Termin trieb jeweils die
//     S&P-Zahl den USD-PMI (2026-09-23: 57 gegen Prognose 53,6).
// Der Indikator-Feed laeuft nur auf dem Runner (TradingView ist aus der
// Sandbox gesperrt). Dieser Waechter liest deshalb die RULES und die
// Bereinigung keinRelease() DIREKT aus update-ff-calendar.yml und prueft sie
// an echten TradingView-Titeln und an echten Punkten der Historie:
//   A) die Regeln treffen den eigenen Release und nicht den fremden;
//   B) die Bereinigung entfernt genau die eingeschleppten Punkte und keinen
//      regulaeren (auch nicht bei anderen Waehrungen);
//   C) Info (kein Fehler): wie viele Punkte der aktuellen ind_data.json der
//      naechste Lauf entfernt - die Daten im Repo bereinigt erst der Workflow.
//   node check/feedregeln.js [--gegenprobe]   (alte Regeln ohne die beiden
//   Ausschluesse -> A muss rot werden)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GEGENPROBE = process.argv.includes('--gegenprobe');
const F = []; const fail = (t, x) => F.push(`${t}: ${x}`);

const y = fs.readFileSync(path.join(ROOT, '.github/workflows/update-ff-calendar.yml'), 'utf8');
function block(start, ende) {
  const i = y.indexOf(start);
  if (i < 0) return null;
  const j = y.indexOf(ende, i);
  return j < 0 ? null : y.slice(i, j + ende.length);
}
let excore = block('const EXCORE=', ';\n');
let rules = block('const RULES=[', '\n            ];');
let kein = block('function keinRelease(', '// ENDE keinRelease');
if (!excore || !rules) fail('RULES', 'const EXCORE / const RULES nicht in update-ff-calendar.yml gefunden');
if (!kein) fail('BEREINIGUNG', 'function keinRelease(...) // ENDE keinRelease nicht in update-ff-calendar.yml gefunden');
if (GEGENPROBE && rules) {
  rules = rules.replace('!/private|revision|benchmark/.test(t)', '!/private/.test(t)').split('&&(c!=="USD"||/\\bism\\b/.test(t))').join('');
}

if (rules && excore) {
  let RULES = null;
  try { RULES = new Function(excore + '\n' + rules + '\nreturn RULES;')(); } catch (e) { fail('RULES', 'nicht auswertbar: ' + e.message); }
  if (RULES) {
    // wie im Workflow: norm() = klein, Leerraum zusammengezogen
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const trifft = (titel, ccy, ind) => RULES.some(r => r.ind === ind && r.test(norm(titel), ccy));
    // [Titel (TradingView), Waehrung, Indikator, soll treffen?]
    const FALL = [
      ['Non Farm Payrolls', 'USD', 'NFP / Employment Change', true],
      ['Non Farm Payrolls Annual Revision Prel', 'USD', 'NFP / Employment Change', false],
      ['Nonfarm Payrolls Private', 'USD', 'NFP / Employment Change', false],
      ['ISM Manufacturing PMI', 'USD', 'Manufacturing PMI', true],
      ['S&P Global Manufacturing PMI Flash', 'USD', 'Manufacturing PMI', false],
      ['S&P Global Manufacturing PMI Final', 'USD', 'Manufacturing PMI', false],
      ['ISM Services PMI', 'USD', 'Services PMI', true],
      ['S&P Global Services PMI Flash', 'USD', 'Services PMI', false],
      ['S&P Global Services PMI Final', 'USD', 'Services PMI', false],
      ['CB Consumer Confidence', 'USD', 'Consumer Confidence', true],
      ['Michigan Consumer Sentiment Prel', 'USD', 'Consumer Confidence', false],
      // die anderen Waehrungen behalten ihre (S&P-/HCOB-)PMI
      ['HCOB Manufacturing PMI', 'EUR', 'Manufacturing PMI', true],
      ['S&P Global Manufacturing PMI Final', 'JPY', 'Manufacturing PMI', true],
      ['S&P Global Services PMI Flash', 'GBP', 'Services PMI', true],
      ['Employment Change', 'CAD', 'NFP / Employment Change', true],
    ];
    FALL.forEach(([t, c, ind, soll]) => {
      const ist = trifft(t, c, ind);
      if (ist !== soll) fail(soll ? 'EIGENER RELEASE FEHLT' : 'FREMDER RELEASE', `${c} "${t}" ${ist ? 'trifft' : 'trifft nicht'} ${ind}`);
    });
  }
}

let keinRelease = null;
if (kein) { try { keinRelease = new Function(kein + '\nreturn keinRelease;')(); } catch (e) { fail('BEREINIGUNG', 'nicht auswertbar: ' + e.message); } }
if (keinRelease) {
  const d = arr => arr.map(h => h[0]).join(',');
  // echte Punkte aus ind_data.json (Stand 2026-10-07)
  const nfp = [['2026-07-02', '57K', '110K'], ['2026-08-07', '-23K', '80K'], ['2026-08-28', '-79K', null], ['2026-09-04', '162K', '56K'], ['2026-10-02', '29K', null]];
  const nfpIst = keinRelease('USD|NFP / Employment Change', nfp);
  if (d(nfpIst) !== '2026-07-02,2026-08-07,2026-09-04,2026-10-02') fail('NFP-BEREINIGUNG', `${d(nfpIst)} - erwartet ohne 2026-08-28 (Benchmark-Revision), aber MIT 2026-10-02 (regulaer, nur Prognose fehlt)`);
  const pmi = [['2026-08-21', '53.2', '53.9'], ['2026-09-01', '54.6', '55.2'], ['2026-09-23', '57', '53.6'], ['2026-10-01', '54.5', '55']];
  const pmiIst = keinRelease('USD|Manufacturing PMI', pmi);
  if (d(pmiIst) !== '2026-09-01,2026-10-01') fail('ISM-BEREINIGUNG', `${d(pmiIst)} - erwartet nur die ISM-Termine 2026-09-01, 2026-10-01`);
  const svc = keinRelease('USD|Services PMI', [['2026-09-03', '55.4', '54.3'], ['2026-09-23', '58.7', '56'], ['2026-10-05', '54.9', '55']]);
  if (d(svc) !== '2026-09-03,2026-10-05') fail('ISM-BEREINIGUNG', `Services ${d(svc)}`);
  const eur = keinRelease('EUR|Manufacturing PMI', pmi);
  if (eur.length !== pmi.length) fail('FREMDE REIHE BEREINIGT', `EUR Manufacturing PMI verlor ${pmi.length - eur.length} Punkt(e) - die Regel gilt nur fuer die US-ISM-Reihen`);
  // C) Info: was der naechste Lauf an der aktuellen Datei bereinigt
  try {
    const ind = JSON.parse(fs.readFileSync(path.join(ROOT, 'ind_data.json'), 'utf8'));
    const info = [];
    ['NFP / Employment Change', 'Manufacturing PMI', 'Services PMI'].forEach(k => {
      const h = ((ind.USD || {})[k] || {}).historyFull || [];
      const weg = h.length - keinRelease('USD|' + k, h).length;
      if (weg) info.push(`USD ${k}: ${weg}`);
    });
    if (info.length) console.log('  (Info: der naechste Workflow-Lauf entfernt aus ind_data.json ' + info.join(', ') + ' Punkt(e))');
  } catch (e) {}
}

if (GEGENPROBE) {
  const ok = F.some(x => x.startsWith('FREMDER RELEASE'));
  console.log(ok ? 'feedregeln --gegenprobe: ok (alte Regeln mit Benchmark-Revision und S&P-Flash werden gemeldet)' : 'feedregeln --gegenprobe: FEHLER - nicht gemeldet\n  ' + F.join('\n  '));
  process.exit(ok ? 0 : 1);
}
if (F.length) { console.log(`feedregeln: ${F.length} Befund(e)\n  ` + F.join('\n  ')); process.exit(1); }
console.log('feedregeln: ok (Indikator-Feed: NFP ohne Benchmark-Revision, US-PMI nur ISM, andere Waehrungen unveraendert; Bereinigung entfernt genau die eingeschleppten Punkte)');
