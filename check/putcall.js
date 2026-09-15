// ── PUT/CALL: EINE SCHWELLEN-WAHRHEIT, UND SIE MUSS ZU DEN DATEN PASSEN ──
//
// Anlass (Nutzer 2026-09-15): "ich bekomme ... put Call Ratio und net options
// Flow ... es funktioniert nicht so richtig also ich glaube das ist falsch
// eingestellt und es fehlt vlt ein Ema oder die Grenzen sind falsch oder die
// Rechnung". Nachgerechnet an der echten OCC-Reihe (83 Handelstage) und in
// jedem Punkt bestaetigt:
//   • Score-Schwelle >=1.0 an 0 von 83 Tagen erreicht (Reihenmaximum 0.93).
//   • Chart-Schwelle >=1.8 erst recht nie.
//   • <=0.7 traf 26.5% der Tage, <=0.8 sogar 66.3% - ein Dauer-"Extrem".
//   • Chart und Score widersprachen sich an 39.8% der Tage.
//
// Die Fehlerklasse dahinter ist NICHT "eine Zahl war zu hoch", sondern:
//   (a) ZWEI Stellen entscheiden unabhaengig voneinander dasselbe, und
//   (b) feste Schwellen einer FREMDEN Zeitreihe (CBOE Total, Median ~0.95)
//       wurden auf die eigene (OCC-Mischung, Median 0.76) geklebt.
// Genau diese zwei Dinge prueft dieser Waechter - eine Zahl kann man
// nachziehen, eine zweite Wahrheit waechst von selbst wieder nach.
//
// Laeuft OHNE Browser: die Rechenfunktionen in js/main.js sind DOM-frei und
// werden hier per Marker herausgeschnitten. Schlaegt das Schneiden fehl (weil
// jemand sie umbenennt oder verschiebt), meldet der Waechter rot statt still
// nichts zu pruefen.
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const MAIN = path.join(WURZEL, 'js', 'main.js');
const DATEN = path.join(WURZEL, 'sentiment_data.json');

let fehler = 0, geprueft = 0;
const fail = (was, txt) => { fehler++; console.log(`  ✗ ${was}: ${txt}`); };
const ok = () => { geprueft++; };
const pruefe = (was, bedingung, txt) => { geprueft++; if (!bedingung) { fehler++; console.log(`  ✗ ${was}: ${txt}`); } return bedingung; };

const src = fs.readFileSync(MAIN, 'utf8');

// ── 1) Die Rechenlogik aus js/main.js holen ─────────────────────────────
const NAMEN = ['pcQuantile', 'pcGapWorkdays', 'pcSmoothSeries', 'pcRawSeries',
               'pcThresholds', 'pcClassify', 'pcReading'];
function schneideLogik() {
  let code = '';
  for (const n of NAMEN) {
    const i = src.indexOf('function ' + n + '(');
    if (i < 0) { fail('Extraktion', `Funktion ${n}() nicht in js/main.js gefunden.`); return null; }
    const rest = src.slice(i);
    const end = rest.indexOf('\n}\n');
    if (end < 0) { fail('Extraktion', `Ende von ${n}() nicht gefunden.`); return null; }
    code += rest.slice(0, end + 3) + '\n';
  }
  const konst = src.match(/const PC_MIN_HIST=[\s\S]*?const PC_MAX_SPREAD=[\d.]+;/);
  if (!konst) { fail('Extraktion', 'Konstantenblock PC_MIN_HIST…PC_MAX_SPREAD nicht gefunden.'); return null; }
  const voll = konst[0] + '\nfunction todayStr(){return new Date().toISOString().slice(0,10);}\n' + code +
    '\nmodule.exports={' + NAMEN.join(',') +
    ',PC_MIN_HIST,PC_WINDOW,PC_SMOOTH,PC_STALE_DAYS,PC_PCTL_LO,PC_PCTL_HI,PC_MAX_SPREAD};';
  const tmp = path.join(require('os').tmpdir(), 'pc_logic_check_' + process.pid + '.js');
  fs.writeFileSync(tmp, voll);
  try { const m = require(tmp); fs.unlinkSync(tmp); return m; }
  catch (e) { fail('Extraktion', 'Die geschnittene Logik laeuft nicht: ' + e.message); return null; }
}
const L = schneideLogik();
if (!L) { console.log(`\n"geprueft": ${geprueft}\n"fehler": ${fehler}`); process.exit(1); }
ok();

const D = JSON.parse(fs.readFileSync(DATEN, 'utf8'));

// ── 2) KEINE ZWEITE WAHRHEIT ────────────────────────────────────────────
// Der teuerste Fehler war nicht die falsche Zahl, sondern dass es sie
// ZWEIMAL gab. sentEval('putCall') darf keine eigenen Schwellen mehr
// mitbringen, sondern muss ueber pcReading()/pcClassify() gehen.
{
  const i = src.indexOf("if(key==='putCall'){");
  if (i < 0) fail('Eine Wahrheit', "Zweig sentEval(key==='putCall') nicht gefunden.");
  else {
    const zweig = src.slice(i, i + 1600);
    const bisEnde = zweig.slice(0, zweig.indexOf('\n  }') + 4);
    // Code von Kommentaren trennen: in den Kommentaren stehen die alten
    // Zahlen absichtlich als Begruendung und duerfen nicht anschlagen.
    const nurCode = bisEnde.split('\n').filter(z => !z.trim().startsWith('//')).join('\n');
    pruefe('Eine Wahrheit', /pcReading\s*\(/.test(nurCode),
      'sentEval(putCall) ruft pcReading() nicht auf - es entscheidet wieder selbst.');
    const festeSchwelle = nurCode.match(/[<>]=?\s*\d*\.\d+/g);
    pruefe('Eine Wahrheit', !festeSchwelle,
      'sentEval(putCall) vergleicht wieder gegen feste Zahlen: ' + (festeSchwelle || []).join(', '));
  }
}

// ── 3) Die Schwellen muessen zur eigenen Reihe passen ───────────────────
// Kernpruefung. Ein Extrem, das nie oder staendig anschlaegt, ist keins.
// Erwartung bei PC_PCTL_LO/HI = 0.10/0.90: je ~10% der Tage, mit Luft nach
// beiden Seiten (die Perzentile stammen aus einem laengeren Fenster als der
// hier geprueften Reihe, deshalb kein exakter Wert).
{
  const raw = L.pcRawSeries(D, '');
  const th = L.pcThresholds('', D);
  if (th.basis !== 'pctl') {
    fail('Marktweite Schwellen', `keine Zonen (${th.why}) - die marktweite Reihe MUSS auswertbar sein, sie hat ${th.n} Punkte.`);
  } else {
    const sm = L.pcSmoothSeries(raw, L.PC_SMOOTH);
    let bull = 0, bear = 0;
    sm.forEach(e => { const c = L.pcClassify(+e[1], th); if (c === 'bull') bull++; else if (c === 'bear') bear++; });
    const pb = bull / sm.length * 100, pr = bear / sm.length * 100;
    console.log(`  marktweit: LO ${th.LO.toFixed(3)} / HI ${th.HI.toFixed(3)} (Spread ${th.spread.toFixed(2)}x, n=${th.n})`);
    console.log(`             bullish ${pb.toFixed(1)}% · bearish ${pr.toFixed(1)}% · neutral ${(100 - pb - pr).toFixed(1)}%`);
    pruefe('Bullische Zone lebt', pb >= 3 && pb <= 20,
      `${pb.toFixed(1)}% der Tage bullisch - erwartet 3-20%. Bei 0% ist die Zone tot (der alte Fehler), bei >20% ist sie kein Extrem mehr.`);
    pruefe('Bearische Zone lebt', pr >= 3 && pr <= 20,
      `${pr.toFixed(1)}% der Tage bearisch - erwartet 3-20%.`);
  }
}

// ── 4) Keine Zonen aus Rauschen ─────────────────────────────────────────
// Perzentile sind robust gegen einzelne Ausreisser, nicht gegen eine Reihe,
// die ueberwiegend aus ihnen besteht (duenne Waehrungs-ETFs: ein Tag mit drei
// Calls ergibt eine Ratio von 40). Wer Zonen bekommt, muss den Spread-Test
// bestehen - sonst stuende wieder eine erfundene Marke im Chart.
{
  const ids = [''].concat(Object.keys(D.putCallByAsset || {}).sort());
  let mitZonen = 0, ohne = 0;
  ids.forEach(id => {
    const th = L.pcThresholds(id, D);
    if (th.basis === 'pctl') {
      mitZonen++;
      pruefe('Spread-Grenze', th.spread <= L.PC_MAX_SPREAD,
        `${id || 'marktweit'} hat Zonen, obwohl der Spread ${th.spread.toFixed(1)}x betraegt (Grenze ${L.PC_MAX_SPREAD}x).`);
      pruefe('Schwellen plausibel', th.LO > 0 && th.HI > th.LO,
        `${id || 'marktweit'}: LO ${th.LO} / HI ${th.HI} ist keine gueltige Spanne.`);
    } else ohne++;
  });
  console.log(`  Reihen mit Zonen: ${mitZonen} · ohne (zu kurz oder zu verrauscht): ${ohne}`);
  pruefe('Ueberhaupt auswertbar', mitZonen >= 3,
    `nur ${mitZonen} Reihen bekommen Zonen - das ist zu wenig, die Grenze PC_MAX_SPREAD sperrt zu hart.`);
}

// ── 5) Luecken werden erkannt ───────────────────────────────────────────
// Vorher zog die Stufenlinie ueber fehlende Handelstage durch und behauptete
// damit Daten, die es nicht gibt (gemessen: 6 fehlende Werktage, groesste
// Luecke 04.09.->10.09.).
{
  pruefe('Luecke: Fr->Mo ist keine', L.pcGapWorkdays('2026-09-11', '2026-09-14') === 0,
    `Wochenende wird als Luecke gemeldet (${L.pcGapWorkdays('2026-09-11', '2026-09-14')} Werktage).`);
  pruefe('Luecke: Fr->Do ist eine', L.pcGapWorkdays('2026-09-04', '2026-09-10') === 3,
    `erwartet 3 fehlende Werktage, bekommen ${L.pcGapWorkdays('2026-09-04', '2026-09-10')}.`);
  pruefe('Luecke: direkt aufeinander', L.pcGapWorkdays('2026-09-10', '2026-09-11') === 0,
    'zwei aufeinanderfolgende Handelstage gelten als Luecke.');
}

// ── 6) Glaettung rechnet richtig ────────────────────────────────────────
{
  const s = [['2026-01-01', 1], ['2026-01-02', 3], ['2026-01-03', 5]];
  const sm2 = L.pcSmoothSeries(s, 2).map(e => +e[1]);
  pruefe('SMA', Math.abs(sm2[0] - 1) < 1e-9 && Math.abs(sm2[1] - 2) < 1e-9 && Math.abs(sm2[2] - 4) < 1e-9,
    `2er-Schnitt von [1,3,5] muss [1,2,4] sein, ist [${sm2.join(',')}].`);
  // Der Anfang darf NICHT abgeschnitten werden: sonst verliert der Chart
  // links Punkte, ohne dass es jemand sieht.
  pruefe('SMA behaelt Laenge', L.pcSmoothSeries(s, 10).length === s.length,
    'Glaettung verkuerzt die Reihe.');
  // Und die Streuung muss wirklich sinken - sonst glaettet sie nichts.
  const raw = L.pcRawSeries(D, '').map(e => +e[1]);
  if (raw.length > L.PC_SMOOTH * 2) {
    const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
    const sm = L.pcSmoothSeries(L.pcRawSeries(D, ''), L.PC_SMOOTH).slice(L.PC_SMOOTH).map(e => +e[1]);
    pruefe('Glaettung wirkt', sd(sm) < sd(raw),
      `Streuung geglaettet (${sd(sm).toFixed(4)}) nicht kleiner als roh (${sd(raw).toFixed(4)}).`);
  }
}

// ── 7) Veraltete Lesung zaehlt nicht ────────────────────────────────────
// Gegenstueck zu AAII_STALE_DAYS. Die OCC-Reihe lag am 14.09. noch auf dem
// Stand vom 11.09.; ohne Altersgrenze wuerde ein wochenalter Wert weiter als
// aktuelles Signal gefaerbt.
{
  const rd = L.pcReading(D, '');
  pruefe('Lesung vorhanden', !!rd, 'pcReading() liefert fuer die marktweite Reihe nichts.');
  if (rd) {
    console.log(`  letzte Lesung: ${rd.date} (${rd.ageDays}d alt), ${rd.smooth.toFixed(3)} = ${rd.pctl}. Perzentil -> ${rd.bias}`);
    pruefe('Alter wird gemessen', Number.isFinite(rd.ageDays) && rd.ageDays >= 0,
      `ageDays ist ${rd.ageDays}.`);
    if (rd.stale) pruefe('Veraltet zaehlt nicht', rd.bias === 'neu',
      `Lesung ist ${rd.ageDays}d alt, wird aber als "${rd.bias}" gewertet.`);
  }
}

// ── 8) GEGENPROBEN ──────────────────────────────────────────────────────
// Ein Waechter, der nur gruen kann, prueft nichts. Jede Kernaussage bekommt
// hier kuenstlich kaputte Daten und MUSS daran scheitern.
{
  const gegen = (was, bedingung, txt) => { geprueft++; if (!bedingung) { fehler++; console.log(`  ✗ Gegenprobe ${was}: ${txt}`); } };

  // (a) Zu kurze Reihe -> keine Zonen.
  const kurz = { putCall: { series: Array.from({ length: 10 }, (_, i) => ['2026-01-' + String(i + 1).padStart(2, '0'), 0.8]) } };
  gegen('zu kurz', L.pcThresholds('', kurz).basis === 'none',
    'eine Reihe mit 10 Punkten bekommt Zonen, obwohl PC_MIN_HIST ' + L.PC_MIN_HIST + ' verlangt.');

  // (b) Verrauschte Reihe -> keine Zonen. Haelfte 0.5, Haelfte 40.
  const laut = { putCall: { series: Array.from({ length: 200 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
    return [d, i % 2 ? 0.5 : 40];
  }) } };
  const thLaut = L.pcThresholds('', laut);
  gegen('verrauscht', thLaut.basis === 'none' && thLaut.why === 'noisy',
    `eine Reihe, die zwischen 0.5 und 40 springt, bekommt Zonen (basis=${thLaut.basis}).`);

  // (c) Konstante Reihe -> keine Streuung, also auch kein Extrem. Ohne diese
  // Abfrage waere bei HI==LO JEDER Wert sofort "bull" (v>=HI trifft immer).
  const flach = { putCall: { series: Array.from({ length: 200 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
    return [d, 0.8];
  }) } };
  const thFlach = L.pcThresholds('', flach);
  gegen('konstant', thFlach.basis === 'none',
    `eine Reihe ohne jede Streuung bekommt Zonen (basis=${thFlach.basis}, HI=${thFlach.HI}, LO=${thFlach.LO}) - damit waere jeder Wert "bull".`);
  gegen('konstant ist neutral', L.pcClassify(0.8, thFlach) === 'neu',
    `konstante Reihe stuft 0.8 als "${L.pcClassify(0.8, thFlach)}" ein.`);

  // (d) Eine kuenstlich gesetzte feste Schwelle MUSS Pruefung 2 rot machen.
  const fakeCode = "if(key==='putCall'){\n    return{bias:v>=1.0?'bull':'neu'};\n  }";
  const fakeNurCode = fakeCode.split('\n').filter(z => !z.trim().startsWith('//')).join('\n');
  gegen('feste Schwelle wird erkannt', /[<>]=?\s*\d*\.\d+/.test(fakeNurCode),
    'der Regex fuer feste Schwellen wuerde ">=1.0" NICHT finden - Pruefung 2 waere blind.');

  // (e) Luecken-Erkennung darf keine Luecke erfinden, wo keine ist.
  gegen('keine erfundene Luecke', L.pcGapWorkdays('2026-09-14', '2026-09-15') === 0,
    'Mo->Di wird als Luecke gemeldet.');
}

console.log(`\n"geprueft": ${geprueft}`);
console.log(`"fehler": ${fehler}`);
process.exit(fehler ? 1 : 0);
