// ══ SCHNELLERFASSUNG FUER NOTIZEN ══════════════════════════════════════
//
// Nutzer-Wunsch 2026-09-08, woertlich: "Ich brauche eine neue Funktion, die
// es einfacher macht, die Notizen zu speichern und abzulegen. Es ist ein viel
// zu grosser Aufwand, das selber zu machen." Und praeziser: "Ich will eine
// Nachricht reinkopieren und die ki nimmt alles auseinander und traegt das
// dann ein."
//
// ⚠ HIER ARBEITET KEINE KI, UND DAS IST ABSICHT. Der Weg ueber eine geplante
// Claude-Sitzung ist gemessen gescheitert (siehe CHANGELOG 2026-09-10: drei
// Bauformen, keine konnte ins Repo schreiben), und die API kostet Geld, das
// das Abo nicht abdeckt. Was der Nutzer eigentlich will, ist aber nicht "KI",
// sondern "ich fuege Text ein und muss nichts mehr ausfuellen" - und das
// leisten Regeln hier vollstaendig und sofort, ohne Netz, ohne Wartezeit,
// ohne laufende Kosten.
// Wichtiger Unterschied zu einer KI: Regeln koennen nichts erfinden. Sie
// finden entweder ein Asset im Text oder eben keins - und was sie finden,
// wird VOR dem Speichern angezeigt und ist aenderbar. Das passt zu Regel 4
// (nie schaetzen) besser als ein Modell, das im Zweifel etwas Plausibles
// hinschreibt.
//
// Die Erkennung liegt bewusst in einem eigenen Modul: so ist sie ohne
// Browser testbar (check/quickcapture.js faehrt sie gegen echte Beispiele).

// ── Asset-Erkennung ──────────────────────────────────────────────────────
// ⚠ Die Ids muessen zu denen in syms passen. Was hier nicht steht, wird auch
// nicht vorgeschlagen - lieber ein Asset weniger als ein falsches.
const QC_WORT = {
  USD: ['usd', 'dollar', 'greenback', 'us-dollar', 'buck'],
  EUR: ['eur', 'euro', 'einheitswaehrung'],
  GBP: ['gbp', 'pound', 'sterling', 'pfund', 'cable'],
  JPY: ['jpy', 'yen'],
  CHF: ['chf', 'franc', 'franken', 'swissie'],
  CAD: ['cad', 'loonie', 'kanada-dollar', 'kanadische'],
  AUD: ['aud', 'aussie', 'australische'],
  NZD: ['nzd', 'kiwi', 'neuseeland'],
  GOLD: ['gold', 'xau', 'xauusd'],
  SILVER: ['silver', 'silber', 'xag'],
  OIL: ['oil', 'oel', 'öl', 'wti', 'brent', 'crude'],
  BTC: ['btc', 'bitcoin'],
  SP500: ['sp500', 's&p', 'spx', 's&p500'],
  NAS: ['nas', 'nasdaq', 'ndx'],
  DAX: ['dax', 'ger40'],
  GER100: ['ger100'],
};
// Notenbank -> Waehrung. Ein Text ueber die Fed handelt vom Dollar, auch
// wenn das Wort "Dollar" nicht vorkommt.
const QC_BANK = {
  USD: ['fed', 'federal reserve', 'fomc', 'powell'],
  EUR: ['ezb', 'ecb', 'lagarde'],
  GBP: ['boe', 'bank of england', 'bailey'],
  JPY: ['boj', 'bank of japan', 'ueda'],
  CHF: ['snb', 'schweizerische nationalbank', 'swiss national bank'],
  CAD: ['boc', 'bank of canada', 'macklem'],
  AUD: ['rba', 'reserve bank of australia'],
  NZD: ['rbnz', 'reserve bank of new zealand'],
};

// ── Richtung ─────────────────────────────────────────────────────────────
// Gewichtet: eindeutige Begriffe zaehlen doppelt. "hawkish" ist ein klares
// Signal, "steigt" kann sich auf alles Moegliche beziehen.
const QC_BULL = [['hawkish', 2], ['falkenhaft', 2], ['bullish', 2], ['bullisch', 2],
  ['stronger', 1], ['staerker', 1], ['stärker', 1], ['rally', 1], ['rallye', 1],
  ['steigt', 1], ['steigen', 1], ['rises', 1], ['surge', 1], ['beat', 1],
  ['upside', 1], ['aufwaerts', 1], ['aufwärts', 1], ['hoeher', 1], ['höher', 1],
  ['tightening', 1], ['straffung', 1], ['rate hike', 2], ['zinserhoehung', 2], ['zinserhöhung', 2]];
const QC_BEAR = [['dovish', 2], ['taubenhaft', 2], ['bearish', 2], ['baerisch', 2], ['bärisch', 2],
  ['weaker', 1], ['schwaecher', 1], ['schwächer', 1], ['selloff', 1], ['ausverkauf', 1],
  ['faellt', 1], ['fällt', 1], ['fallen', 1], ['drops', 1], ['miss', 1], ['slump', 1],
  ['downside', 1], ['abwaerts', 1], ['abwärts', 1], ['niedriger', 1],
  ['easing', 1], ['lockerung', 1], ['rate cut', 2], ['zinssenkung', 2], ['recession', 1], ['rezession', 1]];

// ── Themen ───────────────────────────────────────────────────────────────
const QC_THEMA = {
  inflation: ['inflation', 'cpi', 'ppi', 'preisauftrieb', 'teuerung', 'deflation'],
  rates: ['rate', 'zins', 'yield', 'rendite', 'bond', 'anleihe'],
  labour: ['labour', 'labor', 'payroll', 'unemployment', 'arbeitsmarkt', 'arbeitslos', 'jobs'],
  growth: ['gdp', 'bip', 'growth', 'wachstum', 'pmi', 'recession', 'rezession'],
  centralbank: ['fed', 'ecb', 'ezb', 'boe', 'boj', 'snb', 'boc', 'rba', 'rbnz', 'notenbank', 'central bank'],
  tariffs: ['tariff', 'zoll', 'zoelle', 'zölle', 'trade war', 'handelskrieg'],
  energy: ['oil', 'oel', 'öl', 'gas', 'energy', 'energie', 'opec'],
  equities: ['equity', 'aktien', 'stocks', 'index', 'earnings'],
};

const qcNorm = s => String(s || '').toLowerCase()
  .replace(/[‘’“”]/g, "'").replace(/\s+/g, ' ');

/** Zaehlt Treffer einer Wortliste als GANZE Woerter. */
function qcTreffer(txt, woerter) {
  let n = 0;
  for (const w of woerter) {
    // Wortgrenzen von Hand: \b arbeitet bei Umlauten und & nicht zuverlaessig.
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|[^a-z0-9äöüß])' + esc + '($|[^a-z0-9äöüß])', 'g');
    let m; while ((m = re.exec(txt)) !== null) { n++; re.lastIndex = m.index + 1; }
  }
  return n;
}

/**
 * Zerlegt einen eingefuegten Text.
 * @param {string} roh      der eingefuegte Text
 * @param {string[]} erlaubt  Asset-Ids, die es in dieser App wirklich gibt
 */
function qcZerlegen(roh, erlaubt) {
  const txt = qcNorm(roh);
  const ok = new Set(erlaubt || []);

  // ── Assets ─────────────────────────────────────────────────────────────
  const punkte = {};
  const zaehl = (id, n) => { if (n && ok.has(id)) punkte[id] = (punkte[id] || 0) + n; };
  Object.keys(QC_WORT).forEach(id => zaehl(id, qcTreffer(txt, QC_WORT[id])));
  Object.keys(QC_BANK).forEach(id => zaehl(id, qcTreffer(txt, QC_BANK[id]) * 2));
  // Paare wie EURUSD oder EUR/USD schlagen auf BEIDE Seiten durch.
  const paare = txt.match(/\b([a-z]{3})\s*\/?\s*([a-z]{3})\b/g) || [];
  paare.forEach(p => {
    const a = p.slice(0, 3).toUpperCase(), b = p.replace(/[^a-z]/g, '').slice(3, 6).toUpperCase();
    if (QC_WORT[a] && QC_WORT[b]) { zaehl(a, 2); zaehl(b, 2); }
  });
  const assets = Object.keys(punkte).sort((a, b) => punkte[b] - punkte[a]).slice(0, 3);

  // ── Richtung ───────────────────────────────────────────────────────────
  let bull = 0, bear = 0;
  QC_BULL.forEach(([w, g]) => { bull += qcTreffer(txt, [w]) * g; });
  QC_BEAR.forEach(([w, g]) => { bear += qcTreffer(txt, [w]) * g; });
  // ⚠ Gleichstand heisst 'neu', nicht "irgendwas". Eine erfundene Richtung
  // waere schlimmer als gar keine - sie faerbt die Notiz und den Ordner.
  const bias = bull > bear ? 'bull' : bear > bull ? 'bear' : 'neu';

  // ── Themen ─────────────────────────────────────────────────────────────
  const tags = [];
  Object.keys(QC_THEMA).forEach(t => { if (qcTreffer(txt, QC_THEMA[t])) tags.push(t); });
  // Ausdrueckliche Hashtags des Nutzers haben Vorrang und stehen vorn.
  const eigene = (String(roh).match(/#([\wäöüß-]{2,24})/gi) || []).map(s => s.slice(1).toLowerCase());
  const alleTags = [...new Set(eigene.concat(tags))].slice(0, 5);

  // ── Titel ──────────────────────────────────────────────────────────────
  // Erste Zeile, wenn sie kurz ist (typisch bei kopierten Schlagzeilen),
  // sonst der erste Satz. Nie laenger als 90 Zeichen.
  const zeilen = String(roh).trim().split(/\r?\n/).filter(z => z.trim());
  let titel = '';
  if (zeilen.length && zeilen[0].trim().length <= 90) titel = zeilen[0].trim();
  else {
    const satz = (String(roh).trim().match(/^[\s\S]{10,90}?[.!?](\s|$)/) || [])[0];
    titel = (satz || String(roh).trim().slice(0, 90)).trim();
  }
  titel = titel.replace(/^[#>\-*\s]+/, '').replace(/[.\s]+$/, '').slice(0, 90);

  return {
    titel, body: String(roh).trim(), assets, bias, tags: alleTags,
    // Fuer die Anzeige: woran die Richtung festgemacht wurde. Ohne das ist
    // eine automatische Einordnung eine Behauptung.
    belege: { bull, bear },
  };
}

export { qcZerlegen, qcTreffer, qcNorm, QC_WORT, QC_BANK, QC_THEMA };
