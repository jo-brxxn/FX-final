// Prueft die Schnellerfassung an echten Beispieltexten.
//
// Warum ein eigener Waechter: die Zerlegung ist der ganze Nutzen der
// Funktion. Erkennt sie das falsche Asset, landet die Notiz im falschen
// Ordner - und das faellt erst Wochen spaeter auf, wenn man sie sucht.
// Die Faelle unten sind bewusst so gewaehlt, dass sie die typischen
// Fallstricke treffen: Notenbank ohne Waehrungsnamen, Waehrungspaar,
// deutsche und englische Formulierung gemischt, Gleichstand bei der
// Richtung, und ein Text ganz ohne Asset.
const { qcZerlegen } = require('../js/quickcapture.js');

// Dieselbe Asset-Liste, die die App kennt.
const ERLAUBT = ['USD','EUR','GBP','CHF','JPY','CAD','AUD','NZD',
                 'GOLD','SILVER','OIL','BTC','SP500','NAS','DAX','GER100'];

const FAELLE = [
  {
    was: 'Notenbank ohne Waehrungsnamen',
    text: 'Die Fed bleibt hawkish und signalisiert eine weitere Zinserhoehung im Dezember.',
    assets: ['USD'], bias: 'bull', tags: ['centralbank'],
  },
  {
    was: 'Waehrungspaar schlaegt auf beide Seiten durch',
    text: 'EURUSD faellt unter 1.08, weil die EZB dovish klingt.',
    assets: ['EUR','USD'], bias: 'bear',
  },
  {
    was: 'Deutsch und Englisch gemischt',
    text: 'Gold rally geht weiter, der Dollar wird schwaecher. #macro',
    assets: ['GOLD','USD'], tags: ['macro'],
  },
  {
    was: 'Gleichstand -> keine erfundene Richtung',
    text: 'Der Yen steigt, gleichzeitig faellt der Yen wieder zurueck.',
    assets: ['JPY'], bias: 'neu',
  },
  {
    was: 'Kein Asset im Text -> nichts vorschlagen',
    text: 'Erinnerung: morgen den Steuerberater anrufen.',
    assets: [], bias: 'neu',
  },
  {
    was: 'Rohstoff und Index nebeneinander',
    text: 'Brent crude springt an, der S&P gibt nach. Rezession bleibt das Thema.',
    assets: ['OIL','SP500'],
  },
];

let fehler = 0, gesamt = 0;
console.log('Fall'.padEnd(42) + 'erwartet'.padEnd(22) + 'gefunden');
for (const f of FAELLE) {
  const r = qcZerlegen(f.text, ERLAUBT);
  const pruefe = (name, soll, ist) => {
    gesamt++;
    const s = JSON.stringify(soll), i = JSON.stringify(ist);
    const ok = s === i;
    if (!ok) { fehler++; console.log(`  ✗ ${f.was} / ${name}: erwartet ${s}, bekommen ${i}`); }
    return ok;
  };
  let zeileOk = true;
  if (f.assets) zeileOk &= pruefe('assets', f.assets.slice().sort(), r.assets.slice().sort());
  if (f.bias) zeileOk &= pruefe('bias', f.bias, r.bias);
  if (f.tags) zeileOk &= pruefe('tags', f.tags, f.tags.filter(t => r.tags.includes(t)));
  console.log(f.was.padEnd(42) +
    String((f.assets || []).join(',') + ' ' + (f.bias || '')).padEnd(22) +
    r.assets.join(',') + ' ' + r.bias + (zeileOk ? '' : '   <<<'));
}

// Der Titel darf nie leer und nie laenger als 90 Zeichen sein - sonst steht
// in der Notizliste eine leere Zeile oder ein abgeschnittener Absatz.
const lang = 'Ein sehr langer Absatz ohne Satzzeichen der einfach immer weiter geht und nie aufhoert und noch weiter laeuft';
const rl = qcZerlegen(lang, ERLAUBT);
gesamt++;
if (!rl.titel || rl.titel.length > 90) { fehler++; console.log(`  ✗ Titel-Laenge: ${rl.titel.length}`); }
gesamt++;
const leer = qcZerlegen('', ERLAUBT);
if (leer.assets.length || leer.bias !== 'neu') { fehler++; console.log('  ✗ Leerer Text liefert etwas'); }

console.log(`\n"geprueft": ${gesamt}`);
console.log(`"fehler": ${fehler}`);
process.exit(fehler ? 1 : 0);
