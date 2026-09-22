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
| Step-Signal (Actual vs. Previous) | ±0,5 | NUR wenn kein Forecast existiert - Ersatz fuer Beat/Miss. Betrifft am Stand 2026-09-20 **61** Indikator-Instanzen (die Zahl waechst mit jedem neuen Asset - sie stand hier lange auf 38, dem Stand vor den Yield-Assets) |
| Normierung (nur Modus `normalized`) | ×0,4 bis ×1,8 | drei gemessene Faktoren, siehe unten |
| **Saisonalitaet** | ±0,5 | seit 2026-09-14, siehe unten |
| **Retail-Positionierung** | ±0,5 / ±1 | seit 2026-09-14, gegen die Menge, siehe unten |

### Saisonalitaet und Retail (seit 2026-09-14)

Beide sitzen als Indikator in der Karte **COT Data** (`applySeasRetailFeed()`
in `js/main.js`), beide sind **Halbgewicht** (`SEAS_RETAIL_HALF` in
`js/score.js`) — `bull`/`bear` ergeben damit ±0,5, `sbull`/`sbear` ±1.
Angezeigt wird der Beitrag aber in der jeweiligen **Kachel** der Asset-Seite
(`abScoreZeile()`), nicht in einer eigenen Karte: Nutzer-Vorgabe *„Das kommt
zu sesonality kurz dadrunter … Und retail kommt zu retail dadrunter"*.
`abScoreZeile()` liest `indScore()` — nie eine zweite Rechnung danebenstellen,
sonst nennen Kachel und Score-Fenster verschiedene Zahlen.

**Saisonalitaet** (`seasBiasFor`, `SEAS_HIT_HOCH=60` / `SEAS_HIT_TIEF=40`):
Monatsschnitt **und** Trefferquote muessen dasselbe sagen, sonst 0. Ein
positiver Schnitt braucht mindestens 60 % gestiegene Jahre, ein negativer
hoechstens 40 %. Die Doppelbedingung traegt: OIL steht im September bei
+0,32 % Schnitt, ist aber nur in 38 % der Jahre gestiegen — der Schnitt allein
haette Rueckenwind in den Score geschrieben. Nie `sbull`/`sbear`, also nie
mehr als ±0,5.

**Retail** (`retailBiasFor`, `RETAIL_EXTREM=85` / `RETAIL_MILD=60`): gegen die
Menge. Ab 85/15 volle ∓1, ab 60/40 nur ∓0,5, zwischen 40 und 60 nichts.
⚠ Bei einer **Waehrung** zaehlt der Anteil ihrer **Paare** auf einer Seite,
bei einem **Einzel-Asset** der Anteil des **Buches** — das sind dieselben
Schwellen auf derselben Skala (3 von 5 Paaren = 60 %, 5 von 5 = 100 %), nicht
zwei Regeln. Mit sieben USD-Paaren heisst das 5/7 (71 %) mild, 6/7 (86 %)
extrem.

**Kein `research.date`** bei beiden, mit Absicht: es sind Zustaende, keine
Veroeffentlichungen. Mit Datum wuerde `indOverdueCycles` einen 15-Jahres-
Mittelwert nach zwei Zyklen als OUT OF DATE markieren. **Keine Geisterzeile:**
wo es keine Datenlage gibt, wird der Indikator entfernt statt mit einem
geschaetzten Nullwert stehen gelassen.

Geprueft von `check/seasretail.js` (Schwellen an eingespeisten Werten,
Deckel, Geisterzeilen, Kachel gegen Score, Monats-Markierung im DOM) und
`check/score.js` Abschnitt E1c (Halbgewicht, Deckel und `indNormFactor === 1`
in **beiden** Score-Modi).

## Was NICHT (mehr) in den Score einfliesst

| Bestandteil | Seit | Grund |
|---|---|---|
| 2-Schritt-Trend | 2026-08-08 | war als Bonus gedacht, war faktisch gleichrangiger Treiber (USD 47%, AUD 100% des Scores). Citis CESI hat aus demselben Grund keinen Trend-Term: Ueberraschung und Momentum wirken auf verschiedenen Zeithorizonten. Chip/Sparkline bleiben sichtbar. |
| Revision des Previous | 2026-08-08 | kam unzuverlaessig an (TVs previous-Feld traegt sie nur ~3 Tage; bei geblocktem Workflow fuer immer weg) UND die Bonus-Dauer hing an der Frequenz (NZD GDP 91 Tage vs. GBP NFP 28). Anzeige + Bias-Faerbung bleiben. |
| Veraltete Releases | 2026-08-08 | siehe Altersgrenze unten |
| ★ Wichtig (+0,5 additiv) | 2026-07-28 | Auf Nutzer-Wunsch entfernt. ⚠ Stand bis 2026-09-20 trotzdem noch in DIESER Tabelle (als Bestandteil), im Tooltip jeder Score-Badge und im Hilfetext - drei Versprechen fuer eine Rechnung, die es nicht mehr gibt (`ind.imp` ist app-weit bei 0 von 559 Indikatoren gesetzt und wird von `indBaseWeight()` nicht gelesen; einen ★-Schalter am Indikator gibt es auch nicht mehr). Nutzer 2026-09-20: *„Wo kann man Sachen markieren mit additiv 0.5? Das gibt es doch nicht mehr"*. |
| 2Y/10Y Spread | laenger | `SCORE_ZERO`, bewusst display-only |
| **Risk Environment (ganze Karte)** | 2026-09-13 | Nutzer-Entscheid: *„loesch Risk Environment und alles was dazu gehoert bitte von der kompletten Webseite"*. ⚠ Gemessen VOR dem Entfernen: die Karte trug bei **allen 24 Assets exakt 0 Punkte** bei — `Risk Correlation` und `Geopolitics` standen durchgehend auf neutral. Trotzdem aendern sich **11 von 24 Scores**, weil ihre Indikatoren im Divisor mitzaehlten: BTC +3,6→+3,4, S&P −3,9→−3,6, Nasdaq −4,7→−4,4, JP Yield +7,7→+7,4, die uebrigen ±0,1. Die acht FX-Majors, DAX, GER 100, US Yield und CA Yield bleiben unveraendert. Mit entfernt: der Dashboard-Regler None/Half/Full, die Reaktionsrichtung je Asset, die speicherbaren Szenarien, das Konfigurationsfenster, die Sonntags-Erinnerung und der Accent-Token `--a-risk`. Der **Risiko-Index aus Marktpreisen** auf dem Dashboard bleibt — er ist reine Anzeige und haengt an keinem Score. |

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
| Ueberraschungsgroesse | `indSurpriseMag` | \|Actual − Forecast\| / `indSurpriseScale` (der typischen Abweichung dieses Indikators), dann Wurzel. Erst dadurch sind NFP (Abweichungen in Zehntausenden) und CPI (in Hundertsteln eines Prozents) vergleichbar. Ab `NORM_MIN_OBS`=5 Beobachtungen, sonst neutral statt geraten. |
| Zeit-Decay | `indDecayWeight` | Halbwertszeit = `DECAY_HALFLIFE_CYCLES`=1,5 EIGENE Zyklen. Bei einem 28-Tage-Zyklus also 42 Tage. Zyklus-relativ, damit Quartalswerte langsamer altern. |
| Marktrelevanz | `indMarketWeight` | durchschnittliche Kursbewegung an den Release-Tagen dieses Indikators, geteilt durch die durchschnittliche Bewegung aller Tage. Wurzel-gedaempft. Gemessen, nicht zugewiesen. Braucht ≥60 Preistage und ≥5 Treffer. |

### ⚠️ Der Marktrelevanz-Cache muss sich SELBST fuer ungueltig erklaeren (seit 2026-09-20)

`indMarketWeight()` cached in `_mktWeightCache`. Der Schluessel war bis zum
2026-09-20 nur `symId|indName`, geleert wurde ausschliesslich von
`invalidateNormCache()` — also beim Modus-Wechsel und beim Import, **nicht**
beim Eintreffen eines Feeds. Beim Boot laeuft `recomputeAuto()` aber VOR
jeder Live-Feed-Korrektur: `ind.chartHist` ist dann leer, `indMarketWeight`
liefert 1 — und dieser Wert war fuer die ganze Sitzung zementiert.

Gemessen am echten Stand: von 182 wertbaren Indikator/Asset-Paaren trugen
**108 die eingefrorene 1** und nur 74 den echten Wert; welches Asset welchen
bekam, haengte allein an der Boot-Reihenfolge. Der Score mischte damit zwei
verschiedene Gewichtungen. Nach einer Cache-Leerung aenderten sich **alle 24
Asset-Scores** (USD roh 3,93→4,19, JPY 6,15→6,40, GOLD −1,89→−2,15). Im
Fenster *Data quality & weighting* standen 18 von 19 USD-Zeilen auf
`Impact 1.00×`, obwohl die Spalte ausdruecklich *„Measured, not assigned"*
verspricht (echte Spanne 0,92× bis 1,23×).

**Loesung: Objekt-Identitaet statt Name.** Beide Eingaben werden beim
Eintreffen neuer Daten KOMPLETT ERSETZT — `adoptChartHist()` schreibt ein
neues `chartHist`-Array (und zwar nur, wenn sich der Inhalt wirklich
geaendert hat), `fetchPriceData()` ein neues `PRICE_DATA_FEED`-Objekt. Ein
`===`-Vergleich erkennt das exakt und kostet nichts. Dieselbe Behandlung
haben `_sigCache`/`_cycCache` bekommen: sie schluesselten auf die LAENGE der
Historie, eine Revision ohne neuen Punkt blieb dadurch unbemerkt.

**Merksatz:** eine Invalidierung, die an einer AUFRUFSTELLE haengt, wird beim
naechsten neuen Feed vergessen — dieselbe Lehre wie bei `_fxRefCountCache`.
Die Laenge taugt hier bewusst NICHT als Schluessel: `priceSeriesFor()` baut
bei invertierten Paaren die Reihe bei jedem Aufruf neu auf, sie vor dem
Cache-Treffer aufzurufen waere genau die Rechnung, die der Cache einspart.

Geprueft von `check/score.js` Abschnitt **E1d**: (1) der Faktor muss
streuen (300 von 346), (2) eine Cache-Leerung darf KEINEN Score bewegen
(0 von 24). Gegenprobe mit dem alten Schluessel: beides rot, 0 streuend und
20 von 24 Assets bewegt.

Produkt geklemmt auf `SCORE_NORM_MIN`=0,4 bis `SCORE_NORM_MAX`=1,8 und um
1,0 zentriert - die Schwellen ±2/±3 sind auf ±1-Einheiten kalibriert, ein
frei laufender Faktor haette sie still bedeutungslos gemacht.

### Der Massstab: mittlere absolute Abweichung, nicht Sigma (seit 2026-09-06)

`indSurpriseScale()` liefert die **mittlere absolute Abweichung** (MAD) der
historischen Prognosefehler, gemessen **um deren Mittelwert**. Vorher war es
die Standardabweichung. Nutzer-Vorgabe, gegen die echten Daten geprueft
(76 Indikatoren mit ≥5 Beobachtungen, 2.387 Releases):

- **Warum nicht Sigma:** die Varianz quadriert, ein einzelner Ausreisser
  dominiert sie. Normal liegt MAD/σ bei rund 0,78 (Median hier 0,772,
  Theoriewert 0,798) — bei USD PCE aber bei 0,55, bei GBP Unemployment
  Claims 0,54, bei EUR Core CPI 0,61. Dort blaeht ein Ausreisser das Sigma
  so auf, dass jede normale Abweichung danach winzig wirkt (USD PCE: z fiel
  von 2,83 auf 1,56).
- **Warum um den Mittelwert statt um die Null:** ein systematischer
  Konsens-Bias ist keine Ueberraschung, sondern bekannt und eingepreist.
  \|Mittelwert\|/MAD ist im Median nur 0,215, im obersten Zehntel aber 0,844
  (JPY PPI 0,67, CHF CPI Headline 0,35) — dort waere sonst der Grossteil der
  „Ueberraschung" ein Dauer-Bias.
- **Warum die Wurzel bleibt:** gegen linear (klemmt 60% aller Indikatoren
  weg), `1+ln(z)/ln 3` (54%), `z^0,75` (51%) und `z^0,4` (38%) gemessen. Die
  Wurzel liegt bei 43%, und `z^0,4` ist so flach, dass die
  Ueberraschungsgroesse den Score kaum noch bewegt.
- **Wirkung:** MAD ist rund 23% kleiner als Sigma, z-Werte steigen
  entsprechend (Median 0,48 → 0,60), Faktor-Median 0,69 → 0,78. Am echten
  Stand aendern 120 von 258 Indikator-Instanzen ihren Faktor, Median +0,101,
  Maximum +0,348 (USD PCE). Ueberwiegend eine Massstabsaenderung — die
  Rangfolge der Indikatoren untereinander verschiebt sich kaum.

⚠ **z = 1 heisst nicht „Median-Release".** Der Durchschnitt der Abweichungen
wird von den wenigen grossen Fehlschuessen nach oben gezogen; mehr als die
Haelfte aller Releases liegt darunter (z-Median 0,60, Faktor 0,78). z = 1
heisst „so gross wie der durchschnittliche Fehlschuss" und ist damit bereits
ein ueberdurchschnittliches Ereignis. Von der Klemmung ist fast alles die
UNTERgrenze und gewollt: 25 der 68 Indikatoren trafen den Forecast
punktgenau (app-weit 691 von 2.387 Releases = 29%) → z = 0.

Derselbe Massstab speist den **Surprise Index** (`esiForCcy`/`esiSeries`) —
eine Aenderung hier wirkt dort mit.

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
den Median kaum), durchschnittliche Abweichung ("Avg miss", siehe
`indSurpriseScale`), aktuelle Ueberraschung als Vielfaches davon, Zyklus in
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

**⚠️ Ein Tag-Vergleich muss PAARWEISE sein, nicht nur "gegen live"**
(Nutzer-Bugreport 2026-08-30 "History hat viele Fehler", VERSION-CHECK-454).
`renderSymHistoryPanel()`s Tagesdelta prüfte bis dahin nur, ob DER
GEPRÜFTE Tag zum aktuellen Live-Tag passt - nicht, ob er zum VORTAG passt,
gegen den das Delta ueberhaupt berechnet wird. Am Tag eines Modellwechsels
matcht der neue Tag das Live-Modell (gilt selbst also nicht als "alt"),
sein Vortag steht aber noch unter der alten Version - das Delta wurde
trotzdem berechnet und als echte Score-Bewegung gezeigt, obwohl nur die
Formel gewechselt hatte (bei den 6 Versionswechseln der letzten 3 Wochen
rund 80 solcher erfundener Spruenge in der echten Historie). Fix:
`histTagsComparable(a,b)` verlangt beide Tage bekannt UND identisch - jeder
Vergleich zwischen zwei aufgezeichneten Tagen (nicht nur "gegen heute")
braucht diese Funktion, nicht nur `e[6]===SCORE_MODEL_TAG()`.

**Merksatz:** zwei Features, die je fuer sich richtig sind, muessen nicht
zusammenpassen. Bei jedem neuen Feld in `scoreHist` pruefen, ob der
SERVER-Pfad (`cloudPush` → Workflow → `score_hist.json` → `mergeScoreHist`)
es genauso mitfuehrt wie der Client-Pfad - sonst ist die Server-Historie
fuer die neue Auswertung still wertlos.

**⚠️ Und genau das ist danach noch einmal passiert — mit den Feldern 8-12**
(Fund im Pruefdurchgang 2026-09-20). Der Client schreibt seit dem 2026-08-23
ein ZWOELFstelliges Tupel (8 = Fairness-Faktor, 9 = Rohscore) und seit dem
2026-09-06 zusaetzlich Interest Rates (10) und COT Data (11);
`data.scoreSnapshot` in `cloudPush()` schickte aber weiter nur
`score/bias/infl/labour/growth`. Der Workflow konnte daraus hoechstens
sieben Felder schreiben.

Gemessen an `score_hist.json`: von **1295 server-ergaenzten Eintraegen trug
kein einziger** die Felder 8-12. `histDeltaParts()` braucht Faktor UND
Rohscore fuer BEIDE verglichenen Tage und liefert sonst nichts — die
Ursachen-Aufschluesselung der History („What moved it"), gebaut nach dem
Bugreport 2026-08-23 *„Ergibt keinen sinn"*, war damit auf jedem Geraet fuer
jeden Tag leer ausser dem einen, den es selbst aufgezeichnet hat.
Nachgemessen im Fenster: EUR 15 Tage mit Delta, 0 mit Aufschluesselung;
JPY 18 zu 0.

Behoben an beiden Enden: `scoreSnapshot` traegt jetzt `cmp/raw/ir/cot`, der
Workflow haengt sie GESCHLOSSEN an (das Format ist positionsbasiert, ein
einzeln nachgereichtes Feld stuende an der falschen Stelle). Fehlen sie bei
einem aelteren Client, bleibt der Eintrag siebenstellig — es wird nichts
geraten. Mit korrigiert: die Meldung an einem Tag ohne Aufschluesselung sagte
pauschal *„so this day predates the breakdown"* und behauptete damit eine
Ursache (Alter), die fuer fast alle betroffenen Tage falsch war.

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

**7 → 8 (2026-08-24, zwei Indikatoren entfernt):** `NFIB Small Business
Optimism` und `Leading Index` (beide USD, Economic-Growth-Karte) auf
Nutzer-Wunsch entfernt (`RUB_IND_REMOVE['Economic Growth']`). Diesmal
ECHT score-relevant, anders als der 6→7-Fall oben: `check/scorediff.js`
zaehlte 21 geaenderte Stellen - die Indikatorenzahl in USDs Economic-Growth-
Karte sinkt, das wirkt sich (Modus `normalized`) auch auf die vergleichende
Staerke-Note ANDERER Waehrungen aus, nicht nur auf USD selbst.

**13 → 14 (2026-09-22, Leitzins in die Inflation-Karte):** Nutzer-Wunsch
*„bei der Inflationskarte ganz oben direkt den Indikator interest rate"*,
ausdrücklich als Verschieben. `moveRateIndToInflation()` legt das
Indikator-Objekt an die Spitze der Inflation-Karte. Die **Summe** ändert sich
nicht (nachgemessen EUR: −0,5 vorher = −0,5 nachher) — die Rate bleibt über
`NO_TREND_INDS` trendfrei, auch außerhalb von Interest Rates. Aber die
**Kartenwerte** Inflation und Interest Rates, die `scoreHist` je Tag
aufzeichnet, springen; deshalb der Bump.

### Altersgrenze: zwei Bedingungen, die sie NICHT stellen darf (seit 2026-09-06)

`indIsStale()` ist eine harte Aussage ueber einen Indikator. Sie unterbleibt
in zwei Faellen, in denen die App die noetige Grundlage nicht hat:

1. **Zyklus nur geraten** (`indCycleIsGuess`). Ohne `chartHist` zum Messen und
   ohne `ind.interval` faellt `indCycleDaysCalc()` auf pauschale 30 Tage
   zurueck. Fuer einen Quartalswert ist die Grenze damit 60 statt 180 Tage.
   Fuer die GEWICHTUNG (Decay/Halbwertszeit) bleibt der Notnagel - dort ist
   irgendein Wert noetig und er wirkt weich; fuer die Altersgrenze nicht.
2. **Indikator-Feed diese Sitzung nicht angekommen**
   (`DATA_LIVE_OK.ind===false`). Dann weiss die App nichts ueber den aktuellen
   Stand und darf nicht einzelnen Indikatoren die Schuld geben - gemessen
   trugen sonst 286 von 591 die Marke, obwohl die Ursache eine war. Der echte
   Grund steht als "Live data unavailable: Indicators" auf dem Dashboard.

Dieselbe Ueberlegung wie beim aelteren `SCORE_ZERO`-Ausschluss: keine Marke
fuer einen Grund, den es so nicht gibt. Geprueft von `check/score.js`,
Abschnitt E2 (stellt den Feed-Ausfall an Kopien echter Indikatoren nach).
