# Score-Modell: der vollständige Stand

Referenziert von `CLAUDE.md`. Diese Uebersicht ist die Referenz fuer den
Score - bei Widerspruch zu irgendeiner aelteren Herleitung in
`docs/CHANGELOG.md` gilt IMMER diese hier.

**⚠️ Bei JEDER Score-Formel-Änderung `SCORE_MODEL_VERSION` hochzählen** —
siehe eigenen Abschnitt weiter unten, sonst vergleicht die Stärke-Note zwei
verschiedene Rechnungen.

## Was in den Score einfliesst

| Bestandteil | Gewicht | Bemerkung |
|---|---|---|
| Beat/Miss gegen Forecast | ±1 | Basis. Halbgewicht ±0,5 bei Core-Paaren, Bonds, COT-Netto, CB Tone (`IND_PAIR_GROUPS`/`indPairGroupPositions()` in `index.html` zeigt die Halbgewicht-Paare zusaetzlich als gemeinsam umrandete Box in der Indikator-Tabelle, wenn sie direkt benachbart stehen - Bias/Score bleiben pro Zeile eigenstaendig) |
| Step-Signal (Actual vs. Previous) | ±0,5 | NUR wenn kein Forecast existiert - Ersatz fuer Beat/Miss, betrifft 38 Indikatoren |
| ★ Wichtig | +0,5 additiv | Nutzer-Markierung |
| Normierung (nur Modus `normalized`) | ×0,4 bis ×1,8 | drei gemessene Faktoren, siehe unten |

## Was NICHT (mehr) in den Score einfliesst

| Bestandteil | Seit | Grund |
|---|---|---|
| 2-Schritt-Trend | 2026-08-08 | war als Bonus gedacht, war faktisch gleichrangiger Treiber (USD 47%, AUD 100% des Scores). Citis CESI hat aus demselben Grund keinen Trend-Term: Ueberraschung und Momentum wirken auf verschiedenen Zeithorizonten. Chip/Sparkline bleiben sichtbar. |
| Revision des Previous | 2026-08-08 | kam unzuverlaessig an (TVs previous-Feld traegt sie nur ~3 Tage; bei geblocktem Workflow fuer immer weg) UND die Bonus-Dauer hing an der Frequenz (NZD GDP 91 Tage vs. GBP NFP 28). Anzeige + Bias-Faerbung bleiben. |
| Veraltete Releases | 2026-08-08 | siehe Altersgrenze unten |
| 2Y/10Y Spread | laenger | `SCORE_ZERO`, bewusst display-only |

## Altersgrenze (`IND_STALE_CYCLES = 2`)

Ein Release, das mehr als 2 EIGENE Zyklen ueberfaellig ist, traegt 0 bei.
Relativ zum eigenen Zyklus gemessen (`indCycleDays`, Median der echten
Abstaende der eigenen Historie), NICHT in festen Tagen - sonst waeren
quartalsweise berichtende Volkswirtschaften strukturell benachteiligt.

Ausgenommen: manuelle/qualitative Indikatoren (CB Tone, Geopolitics, Risk
Correlation - kein Release-Konzept) sowie Bond/COT/Sentiment (laufen
kontinuierlich).

Anlass: AUD Retail Sales, Release 31.07.2025, 372 Tage alt, 14,9 Zyklen
ueberfaellig, mit vollem +1 im Score. Die Reihe ist in ind_data.json
komplett zu Ende - das ABS hat sie 2025 ersetzt. Citi/Bloomberg loesen
das beide mit hartem Schnitt statt Ausfaden (CESI: rollierendes
3-Monats-Fenster).

Sichtbar an drei Stellen: `OUT OF DATE`-Marke an der Indikator-Zeile,
Dashboard-Meldung (`staleNotifyHtml`), und im Score-Modal AUSDRUECKLICH
EINZELN aufgefuehrt statt in der Sammelzeile "N weitere bei 0 (neutral)" -
denn neutral sind sie gerade nicht.

**⚠️ Merksatz:** `symTrackedCount` MUSS veraltete Indikatoren
ueberspringen. Ohne das wird ein Asset doppelt bestraft - einmal durch das
fehlende Signal, noch einmal durch den zu grossen Divisor in
`symScoreCmp`. Gemessen: JPY verlor dadurch 0,7 Punkte (Faktor 0,97 statt
1,15). Bei JEDER kuenftigen Regel, die einen Indikator auf 0 setzt, hier
mitpruefen.

## Die drei Normierungs-Faktoren (nur Modus `normalized`)

| Faktor | Funktion | Was er misst |
|---|---|---|
| Ueberraschungsgroesse | `indSurpriseMag` | (Actual − Forecast) / Streuung der eigenen historischen Prognosefehler. Erst dadurch sind NFP (σ ≈ 75.700) und CPI (σ ≈ 0,12) vergleichbar. Ab `NORM_MIN_OBS`=5 Beobachtungen, sonst neutral statt geraten. |
| Zeit-Decay | `indDecayWeight` | Halbwertszeit = `DECAY_HALFLIFE_CYCLES`=1,5 EIGENE Zyklen. Bei einem 28-Tage-Zyklus also 42 Tage. Zyklus-relativ, damit Quartalswerte langsamer altern. |
| Marktrelevanz | `indMarketWeight` | durchschnittliche Kursbewegung an den Release-Tagen dieses Indikators, geteilt durch die durchschnittliche Bewegung aller Tage. Wurzel-gedaempft. Gemessen, nicht zugewiesen. Braucht ≥60 Preistage und ≥5 Treffer. |

Produkt geklemmt auf `SCORE_NORM_MIN`=0,4 bis `SCORE_NORM_MAX`=1,8 und um
1,0 zentriert - die Schwellen ±2/±3 sind auf ±1-Einheiten kalibriert, ein
frei laufender Faktor haette sie still bedeutungslos gemacht.

## Datenstand-Regel (Vintages)

Standard aus der Real-Time-Data-Praxis, bei Bloomberg strukturell erzwungen:

- **Ueberraschung** (Beat/Miss) → immer gegen den **Erstdruck**, nie neu geschrieben
- **Niveau und Pfad** (`valHist`, Step-Signal) → immer **neuester Stand**, also revidiert
- **Revision selbst** → eigenes Ereignis, kein Score-Term

`applyRevisionToValHist()` setzt den vorletzten valHist-Punkt auf den
revidierten Wert. MUSS nach `adoptFeedHistory` laufen - die ueberschreibt
valHist komplett aus der Feed-Reihe, die weiter den Erstdruck traegt.

Anlass: GBP Unemployment Claims stand als 26.800/26.500/31.200/6.700 in
der Historie; die 31.200 wurden auf 1.300 revidiert. Bei 3 von 8
Revisionen kippte dadurch die Signalrichtung.

## Datenqualitaets-Fenster (`openDataQuality`)

Pro Asset erreichbar ueber den Knopf "Data quality" in der Kopfzeile der
Detailseite. Zeigt je Indikator: Beobachtungen, Median-Ueberraschung
(Median statt Mittelwert - ein Ausreisser verschiebt den Mittelwert stark,
den Median kaum), Streuung σ, aktuelle Ueberraschung in σ, Zyklus in
Tagen, Halbwertszeit in Tagen, gemessene Marktrelevanz, resultierender
Gewichtsfaktor. Alles aus denselben Funktionen wie der Score - nichts
eigens fuer die Anzeige gerechnet.

## Surprise Index: duenne Basis

`ESI_THIN_N`=8. Gemessen: USD 18 Indikatoren, EUR/GBP 9, CHF/JPY 6,
AUD/NZD 5, CAD 4. Unter 8 wird die Zahl neben dem Kuerzel ausgewiesen.
Citi hat das Problem nicht, weil Citi Laender gar nicht absolut
vergleicht - diese App muss es (sie stellt sie nebeneinander), also wird
die Basis ausgewiesen statt verschwiegen.

## ⚠️ Die Asset-ID MUSS bis in `indScoreParts` durchkommen

Im normalisierten Modus haengt ein Faktor am Asset: `indMarketWeight(ind,
symId)` misst die Kursbewegung an den Release-Tagen **im Preisverlauf
dieses Assets**. `indScoreParts(ind,rub,symId)` nimmt die ID entgegen -
aber `symScore -> rubScore -> indScore` gab sie NICHT weiter, und der
Rueckfall war das GLOBAL gewaehlte Asset (`selId`).

Folge (Nutzer-Bugreport 2026-08-09, drei Screenshots): beim Wechsel
zwischen Assets aenderten sich ALLE Scores in der Leiste, jedes Mal mit
Zaehl-Animation - der Score jedes Assets wurde mit dem Preisverlauf des
gerade GEOEFFNETEN gewichtet. Gemessen: `symScore('USD')` = -4,38 / -3,99 /
-3,97 / -3,85 je nach offenem Asset, und exakt wieder -3,99, sobald EUR
erneut geoeffnet wurde. Ueber die ±3-Schwelle kippte dadurch sogar die
Bull/Bear-Zaehlung im Kopf (2 Bull -> 3 Bull).

**Loesung: `stampRubOwners()` in `recomputeAuto()`** stempelt jeder Rubrik
ihr Asset als nicht-enumerierbares `rub._symId` auf (nicht-enumerierbar =
faellt aus `snap()`/Cloud-Sync). `indScoreParts` nutzt die Reihenfolge
*uebergebene ID → `rub._symId` → `selId`*. Bewusst NICHT durch die rund 16
`rubScore`-Aufrufstellen gefaedelt: eine davon zu vergessen haette den
Fehler still zurueckgebracht.

**Merksatz:** JEDE neue Groesse, die vom Asset abhaengt, muss ueber
`rub._symId` gehen - nie ueber `selId`. `selId` ist die ANZEIGE-Auswahl,
nicht der Besitzer der Daten. Das Score-Fenster (`indNormBreakdown`) liest
dieselbe Quelle, sonst zeigt es einen anderen Faktor als die Rechnung.

**⚠️ Nachtrag 2026-08-09 (Pruefdurchgang): Der Stempel ueberlebt keine
JSON-Rundreise.** `syncAssetGroup()` klont die Rubriken tief
(`JSON.parse(JSON.stringify(...))`), um verknuepfte Assets anzugleichen -
dabei faellt `_symId` weg, weil es nicht-enumerierbar ist (genau die
Eigenschaft, die es aus `snap()` heraushaelt). Und `save()` ruft
`syncAssetGroup()` auf, OHNE dass danach `recomputeAuto()` laeuft: der
Zustand haette also bis zur naechsten Struktur-Aenderung Bestand. Gemessen:
SP500 -1,31 mit SP500 offen, -1,4 mit JPY offen - der Bug war zurueck.
`syncAssetGroup()` stempelt jetzt am Ende selbst nach.

**Merksatz:** bei JEDER neuen Stelle, die Rubriken kopiert, serialisiert
oder ersetzt, `stampRubOwners()` nachziehen. Der Test dafuer ist billig und
sollte bei Verdacht immer gefahren werden: ueber alle Symbole/Rubriken
zaehlen, wie viele `_symId` gar nicht oder falsch tragen (Soll: 0/0), und
denselben Score einmal je geoeffnetem Asset messen (Soll: identisch).

## STAERKE 1-10 aus der eigenen Historie

Nur im Modus `normalized`. Drei Stufen, bewusst getrennt (alle bei
`symScoreCmp`, ≈ Zeile 4366):

| Funktion | Was sie liefert |
|---|---|
| `symScoreAvg` | Mittelwert: Punkte je getracktem Indikator. `symScoreCmp` ist derselbe Mittelwert, nur mit der Ø-FX-Indikatorzahl zurueckskaliert, damit die ±3-Schwellen weiter passen. |
| `symOwnZ` | Dieser Wert gemessen an der EIGENEN Historie des Assets (z-Wert). Quelle ist `scoreHist` - dieselbe wie Trends/History-Karte, KEINE zweite Aufzeichnung. Der heutige Eintrag wird ausgelassen, sonst misst man den Tag gegen sich selbst. |
| `symStrength10` | z auf 1-10 abgebildet, `STRENGTH_Z_BANDS` (9 feste Grenzen). |

Anzeige: `strengthBadgeHtml()` neben dem Punkte-Score im Asset-Kopf,
volle Rechnung + Grenzen in `symStrengthSectionHtml()` im Score-Fenster.

**⚠️ Zwei Entscheidungen, die NICHT neu aufgerollt werden sollten:**

1. **Feste Sigma-Baender, KEIN Perzentil-Rang.** Ein Rang macht jede
   Waehrung per Konstruktion gleich (jede hat ihr eigenes Maximum) und
   verschluckt damit die Groessenordnung. An der echten Historie vom
   2026-08-08 nachgerechnet: JPY +7,3 (mit Abstand am staerksten), CAD
   -1,0 und NZD -1,4 landeten ALLE DREI im selben Dezil 4.
2. **Die Note ersetzt den Punkte-Score NICHT, sie steht daneben.** Note
   allein = keine Groessenordnung; Punkte allein = keine Aussage, ob der
   Wert fuer DIESES Asset ungewoehnlich ist. Erst zusammen ergeben sie
   beides. Fuer Asset-Vergleiche bleiben die Punkte massgeblich.

`STRENGTH_MIN_OBS`=10. Darunter - oder bei einer Reihe ohne jede Varianz -
erscheint ausdruecklich `–/10` mit Begruendung statt einer Note. Eine
geratene Note waere schlechter als keine (Grundsatz "nie schaetzen").

## ⚠️ `SCORE_MODEL_VERSION` - bei JEDER Score-Formel-Aenderung hochzaehlen

`scoreHist` traegt seit 2026-08-08 ein 7. Feld: `SCORE_MODEL_TAG()` =
`SCORE_MODEL_VERSION + ':' + scoreMode`. `symOwnHistory()` nimmt NUR
Eintraege mit dem aktuellen Tag - alles andere waere ein Vergleich zweier
verschiedener Rechnungen.

Anlass (Nutzer-Bugreport per Foto): JPY zeigte `1/10`, obwohl es mit
Abstand die staerkste Waehrung war. Kein Rechenfehler, sondern zwei
Bruchstellen gleichzeitig: (1) das MODELL hat sich geaendert - Revisionen
und Trend sind seit V327 raus, die Altersgrenze kam in V329 dazu; JPYs
aufgezeichnete Reihe stand im Mittel bei 7,6, dieselbe Lage liefert heute
3,0, gemessen z = -6,55. (2) Der MODUS wurde mitgeschrieben, aber nicht
mitgedacht - `classic` und `normalized` haben verschiedene
Groessenordnungen und landeten in derselben Reihe.

Nach dem Fix fallen alle Alt-Eintraege (ohne Tag) aus der z-Rechnung, die
Note zeigt ehrlich `–/10 - noch N Tage` und baut sich taeglich neu auf.
**Ohne den Versions-Bump vergleicht die Note wieder stillschweigend zwei
verschiedene Rechnungen** - dieselbe Pflicht wie bei
`SUMMARY_ENGINE_VERSION`. Der Trends-Chart liest bewusst weiter die VOLLE
Reihe: dort ist jeder Punkt fuer sich der Wert, der an dem Tag galt, und
das bleibt richtig - nur ein z-Wert QUER ueber die Reihe braucht eine
einheitliche Skala.

**⚠️ Der Tag muss AUCH durch die server-seitige Historie** (Fund im
Pruefdurchgang 2026-08-09). `score_hist.json` (Workflow-Schritt "Fetch
score snapshot from cloud sync") schrieb ein SECHSstelliges Tupel ohne
Tag - `symOwnHistory()` verlangt aber `e[6]===SCORE_MODEL_TAG()`. Damit
zaehlte **kein einziger** server-ergaenzter Tag zur Note: ausgerechnet die
Tage, an denen kein Geraet offen war und fuer die diese Historie
ueberhaupt gebaut wurde. Gemessen: 14 Eintraege → 0 gezaehlt → `–/10`;
mit Tag 14 von 14 und eine echte Note. `cloudPush()` schickt den Tag
jetzt als `data.scoreModelTag` mit, der Workflow haengt ihn als 7. Element
an. Fehlt er (alter Client), wird NICHTS geraten - der Eintrag bleibt
sechsstellig und faellt wie bisher aus der Notenrechnung.

**Merksatz:** zwei Features, die je fuer sich richtig sind, muessen nicht
zusammenpassen. Bei jedem neuen Feld in `scoreHist` pruefen, ob der
SERVER-Pfad (`cloudPush` → Workflow → `score_hist.json` → `mergeScoreHist`)
es genauso mitfuehrt wie der Client-Pfad - sonst ist die Server-Historie
fuer die neue Auswertung still wertlos.

**⚠️ Blinder Fleck in `scoreSurface.js` (2026-08-21):** `addSurveyInds`
(eine WURZEL der Score-Oberflaeche) hatte einen Kommentar mit
`` `loadState()` `` in Backticks (Markdown-Code-Span, der durchgehende
Kommentarstil dieser Codebasis). Die naive Aufruf-Erkennung (`NAME(`-Regex
ueber den rohen Funktionskoerper, OHNE Kommentare zu entfernen) las das als
echten Aufruf - dadurch rutschte `loadState()`s komplette Aufrufkette
(`migrateDash`, `mkWidgets`, `recomputeAuto`, `applyRubOrder`, ... 13
Funktionen) faelschlich in die Score-Oberflaeche, obwohl keine davon die
Score-FORMEL betrifft. Fix in `scoreSurface.js`: ein `NAME(`-Treffer zaehlt
nicht als Aufruf, wenn ihm unmittelbar ein Backtick vorausgeht (echte
Aufrufe sehen in dieser Codebasis nie so aus). **Merksatz:** bei jedem
kuenftigen Falsch-Alarm von `rules.js` erst pruefen, ob es ein ECHTER
Score-Bezug ist, bevor man `SCORE_MODEL_VERSION` bumpt - ein unnoetiger
Bump schadet genauso wie ein vergessener, nur in die andere Richtung.

**6 → 7 (2026-08-24, neue Yields-Asset-Kategorie):** `isNonFx()` bekam eine
neue Klasse (`'yield'`) fuer die 8 neuen Yield-Assets (siehe `docs/
navigation.md` fuer die Assets-Stapel-Seite dieser Aenderung) -
`check/rules.js` flaggte das automatisch als Score-Formel-Aenderung
(`isNonFx` ist Teil der Ableitungs-Kette `rubAutoDerived`/
`deriveMacroBiasAll`), `check/scorediff.js` zaehlte 72 geaenderte Stellen.
**Wichtig fuer kuenftiges Nachvollziehen:** das ist KEINE Formel-Aenderung
fuer irgendein BESTEHENDES Asset - `isNonFx('USD')`/`isNonFx('GOLD')` etc.
liefern exakt wie vorher `false`/`true`, die 72 Stellen sind ausschliesslich
die neu hinzugekommenen Yield-Assets selbst (die vorher schlicht nicht
existierten, also auch keine "alte Rechnung" hatten, mit der man sie
verwechseln koennte). Trotzdem gebumpt, weil `rules.js` als Waechter hier
bewusst konservativ ist (siehe Merksatz oben) und ein neuer, echter
Eintrag in der Ableitungs-Kette (`MACRO_DERIVE_RULES`/`RISK_ENV_DEFAULT_DIR`
je 8 neue Eintraege) grundsaetzlich score-relevant genug ist, um im Zweifel
zu bumpen statt zu riskieren, dass eine kuenftige echte Aenderung an
`isNonFx()` faelschlich als "schon mal genehmigt" durchgewunken wird.
