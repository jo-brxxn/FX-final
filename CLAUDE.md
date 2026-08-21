# FX Analyst Pro — Projektkonventionen

Die App ist eine einzelne `index.html` (HTML + CSS + JS in einem File).

**Diese Datei enthält nur die aktuell gültigen Regeln/Konventionen.** Das
komplette Engineering-Tagebuch (jeder einzelne Bugfix/jede Design-Iteration
mit Datum) liegt in `docs/CHANGELOG.md` — wird NICHT automatisch geladen,
bei Bedarf gezielt per Grep/Read nachschlagen (z.B. bei einem Bugreport, der
nach einem bekannten Muster riecht, oder um zu prüfen, ob eine Entscheidung
schon einmal bewusst getroffen wurde).

## ⚠️ WICHTIGSTE REGEL: Persistierter State MUSS in den Cross-Device-Sync

**Jeder neue Zustand, den ein Nutzer ändern kann und der erhalten bleiben soll,
muss geräteübergreifend synchronisiert werden — nicht nur in `localStorage`
ablegen.** (Genau dieser Fehler ist bei `tabStacks` einmal passiert: nur
localStorage → kam nicht auf anderen Geräten an.)

Beim Anlegen von neuem persistentem State IMMER prüfen/anbinden:

1. **Gehört es in `snap()`?** `snap()` (≈ Zeile 2855) serialisiert den Kern-State
   und wird für Speichern, Undo UND Cloud-Sync genutzt. Wenn der State ins
   Undo/in den normalen Save gehört → Feld zu `snap()` UND `applySnap()`
   hinzufügen. Fertig (Sync läuft dann automatisch mit).

2. **Soll es NICHT ins Undo (UI-Präferenz, Flags)?** Dann nach dem Muster von
   `greenDismissed` / `tabStacks` anbinden — alle vier Stellen:
   - **`cloudPush`** (≈ 3049): `data.<feld>=<feld>;`
   - **`cloudPull`** (≈ 3093): `if(cd.<feld>){<feld>=cd.<feld>; localStorage.setItem(...); <neu rendern>;}`
   - **Save-Funktion des Felds**: `localStorage.setItem('fxpro_updated', new Date().toISOString());`
     und `cloudAutoSync();` aufrufen, damit die Änderung als neue Version in die
     Cloud geht. (Die *Default*-Anlage bleibt rein lokal, ohne Sync-Anstoß.)
   - **`exportData`** (≈ 2989) und **`importData`** (≈ 2993): Feld mit
     exportieren bzw. beim Import anwenden.

Der Sync vergleicht Versionen über `fxpro_updated` (Gleichheits-Check gegen
`fxpro_cloud_seen`). Wenn eine Änderung `fxpro_updated` nicht bumpt, propagiert
sie NICHT — deshalb in der Save-Funktion bumpen.

Nach diesem Muster angebundene Felder: `greenDismissed`, `tabStacks`,
`compactLevel` (+Legacy-Boolean `compactView`), `pinEnabled`, `designHue`
(Designer/🎨: null = Auto-Risk-Sentiment-Färbung der Aurora, Zahl 0–360 =
Nutzer-Farbton; beim Pull `!==undefined`-Check, damit auch "zurück auf
Auto" = null ankommt), `setupCcyFilter`/`setupFxOnly`
(Set-ups-Waehrungsfilter/FX-Quick-Filter), `calHighOnly`/`calCcyFilter`
(Kalender-Filter), `cmpCols` (Compare-Tab-Spaltenauswahl), `telegramEnabled`,
`newsSeenTs`, `denseMode`, `assetAnimEnabled` (und die drei weiteren
Animations-Schalter aus demselben Vier-Schalter-Satz). Details/Fundgeschichte
einzelner Felder ggf. in `docs/CHANGELOG.md` nachschlagen.

**`scoreHist` (Score-Verlauf für Trends/History, Stand 2026-07-20) ist ein
Sonderfall des Musters:** normalerweise gewinnt beim Pull einfach der
Cloud-Stand (`cd.<feld>` übernehmen). Bei `scoreHist` würde das aber Historie
LÖSCHEN, weil zwei Geräte typischerweise DISJUNKTE Tage angesammelt haben
(jedes Gerät schreibt nur Tage, an denen es tatsächlich offen war) — ein
simples Overwrite hätte genau den gemeldeten Bug verursacht (Handy nur 2 Tage
Historie, obwohl das iPad viel mehr hatte). Deshalb **`mergeScoreHist(base,
override)`** (bei `SCOREHIST_KEY`, ≈ Zeile 8688): vereinigt beide Objekte je
Symbol nach Datum, `override` gewinnt nur bei einer echten Datums-Kollision
(typischerweise "heute", falls beide Geräte am selben Tag schon einen
Eintrag geschrieben haben — dann gewinnt der lokale, weil der gerade frisch
per Live-Feed korrigiert wurde). Bei künftigen `scoreHist`-artigen Feldern
(Log/Historie, die auf mehreren Geräten UNABHÄNGIG voneinander waechst)
immer prüfen, ob ein Merge statt Overwrite nötig ist, statt blind dem
Standard-Muster zu folgen. Die Save-Funktion ist hier `recordScoreHist()`
selbst (nicht `save()`, da `scoreHist` bewusst außerhalb von `snap()` liegt
und `save()`s eigener Change-Diff es daher nicht automatisch erkennt) —
bumpt `fxpro_updated`+ruft `cloudAutoSync()` selbst auf, wenn sich etwas
geändert hat.

**Zusätzlich in der Save-Funktion `markPrefEdit()` aufrufen** (2. Ursache des
"Hide-Button springt zurück"-Bugs, gefixt 2026-07-07): Ohne das Flag stuft die
optimistische Versionsprüfung in `cloudPush()` den Toggle als "nur
Auto-Refresh" ein, ersetzt den Push durch einen Pull und zieht die alte
Cloud-Stufe drüber, sobald irgendein anderes Gerät zwischen Toggle und
1,5-s-Push gepusht hat. `cloudPull` lässt bei gesetztem Pending-Flag die
lokalen Präferenz-Felder (Kompakt-Stufe, designHue) in Ruhe und schiebt sie
danach als neue Version hoch; ein MANUELLER Download übernimmt weiter alles.

## ⚠️ SCORE-MODELL: der vollstaendige Stand (2026-08-08)

Diese Uebersicht ist die Referenz fuer den Score - bei Widerspruch zu
irgendeiner aelteren Herleitung in `docs/CHANGELOG.md` gilt IMMER diese
hier.

### Was in den Score einfliesst

| Bestandteil | Gewicht | Bemerkung |
|---|---|---|
| Beat/Miss gegen Forecast | ±1 | Basis. Halbgewicht ±0,5 bei Core-Paaren, Bonds, COT-Netto, CB Tone |
| Step-Signal (Actual vs. Previous) | ±0,5 | NUR wenn kein Forecast existiert - Ersatz fuer Beat/Miss, betrifft 38 Indikatoren |
| ★ Wichtig | +0,5 additiv | Nutzer-Markierung |
| Normierung (nur Modus `normalized`) | ×0,4 bis ×1,8 | drei gemessene Faktoren, siehe unten |

### Was NICHT (mehr) in den Score einfliesst

| Bestandteil | Seit | Grund |
|---|---|---|
| 2-Schritt-Trend | 2026-08-08 | war als Bonus gedacht, war faktisch gleichrangiger Treiber (USD 47%, AUD 100% des Scores). Citis CESI hat aus demselben Grund keinen Trend-Term: Ueberraschung und Momentum wirken auf verschiedenen Zeithorizonten. Chip/Sparkline bleiben sichtbar. |
| Revision des Previous | 2026-08-08 | kam unzuverlaessig an (TVs previous-Feld traegt sie nur ~3 Tage; bei geblocktem Workflow fuer immer weg) UND die Bonus-Dauer hing an der Frequenz (NZD GDP 91 Tage vs. GBP NFP 28). Anzeige + Bias-Faerbung bleiben. |
| Veraltete Releases | 2026-08-08 | siehe Altersgrenze unten |
| 2Y/10Y Spread | laenger | `SCORE_ZERO`, bewusst display-only |

### Altersgrenze (`IND_STALE_CYCLES = 2`)

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

### Die drei Normierungs-Faktoren (nur Modus `normalized`)

| Faktor | Funktion | Was er misst |
|---|---|---|
| Ueberraschungsgroesse | `indSurpriseMag` | (Actual − Forecast) / Streuung der eigenen historischen Prognosefehler. Erst dadurch sind NFP (σ ≈ 75.700) und CPI (σ ≈ 0,12) vergleichbar. Ab `NORM_MIN_OBS`=5 Beobachtungen, sonst neutral statt geraten. |
| Zeit-Decay | `indDecayWeight` | Halbwertszeit = `DECAY_HALFLIFE_CYCLES`=1,5 EIGENE Zyklen. Bei einem 28-Tage-Zyklus also 42 Tage. Zyklus-relativ, damit Quartalswerte langsamer altern. |
| Marktrelevanz | `indMarketWeight` | durchschnittliche Kursbewegung an den Release-Tagen dieses Indikators, geteilt durch die durchschnittliche Bewegung aller Tage. Wurzel-gedaempft. Gemessen, nicht zugewiesen. Braucht ≥60 Preistage und ≥5 Treffer. |

Produkt geklemmt auf `SCORE_NORM_MIN`=0,4 bis `SCORE_NORM_MAX`=1,8 und um
1,0 zentriert - die Schwellen ±2/±3 sind auf ±1-Einheiten kalibriert, ein
frei laufender Faktor haette sie still bedeutungslos gemacht.

### Datenstand-Regel (Vintages)

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

### Datenqualitaets-Fenster (`openDataQuality`)

Pro Asset erreichbar ueber den Knopf "Data quality" in der Kopfzeile der
Detailseite. Zeigt je Indikator: Beobachtungen, Median-Ueberraschung
(Median statt Mittelwert - ein Ausreisser verschiebt den Mittelwert stark,
den Median kaum), Streuung σ, aktuelle Ueberraschung in σ, Zyklus in
Tagen, Halbwertszeit in Tagen, gemessene Marktrelevanz, resultierender
Gewichtsfaktor. Alles aus denselben Funktionen wie der Score - nichts
eigens fuer die Anzeige gerechnet.

### Surprise Index: duenne Basis

`ESI_THIN_N`=8. Gemessen: USD 18 Indikatoren, EUR/GBP 9, CHF/JPY 6,
AUD/NZD 5, CAD 4. Unter 8 wird die Zahl neben dem Kuerzel ausgewiesen.
Citi hat das Problem nicht, weil Citi Laender gar nicht absolut
vergleicht - diese App muss es (sie stellt sie nebeneinander), also wird
die Basis ausgewiesen statt verschwiegen.

### ⚠️ Die Asset-ID MUSS bis in `indScoreParts` durchkommen

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

## ⚠️ STAERKE 1-10 aus der eigenen Historie (Stand 2026-08-08)

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

### ⚠️ `SCORE_MODEL_VERSION` - bei JEDER Score-Formel-Aenderung hochzaehlen

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

## ⚠️ PMI-FEED: TradingView liefert fuer S&P Global/HCOB/Jibun KEINE Actuals

Belegt am 2026-08-08 durch die Titel-Diagnose im Workflow (`ind_data TITLE
DIAG`, dauerhaft eingebaut, gibt alle Kalendertitel im Themenfeld je
Waehrung aus, mit Hinweis ob ein Actual dranhaengt - 126 Reihen im
Testlauf).

**Jede** S&P-Global-, HCOB- und Jibun-Bank-PMI-Reihe kommt ohne Actual an,
bei allen acht Waehrungen, auch bei USD. Actuals liefern ausschliesslich:
**ISM** (USD), **procure.ch** (CHF, nur Manufacturing), **Ivey** (CAD),
**BusinessNZ** (NZD). Genau diese vier stehen auch in `ind_data.json` -
kein Zufall, das ist die vollstaendige Erklaerung.

**Daraus folgt: fuer EUR/GBP/JPY/AUD Manufacturing + Services PMI hilft an
TradingView KEIN Regel-Fix.** Nicht nochmal Zeit mit Muster-Basteln
verbrennen.

### ✅ GELOEST (2026-08-09): Trading-Economics-Laenderseiten

Vorher geprueft, welche freie Quelle vom Runner aus ueberhaupt erreichbar
ist UND die Zahl fuehrt (Sonde, Ergebnisse im Job-Log):

| Quelle | Ergebnis |
|---|---|
| FXStreet-Kalender | **0** PMI-Reihen im gesamten Payload |
| FF-Website / TradingEconomics-API / TV (`altActuals`) | 4 PMI-Reihen, nur `CAD Ivey` mit Wert |
| Investing.com | Cloudflare, `invcal.json: 3 bytes`, 3/3 Versuche |
| S&P Global Release-Uebersicht | 200, 92 KB - aber nur eine LISTE, Zahlen erst in den Einzelmitteilungen |
| HCOB | vom Runner **nicht erreichbar** (curl 000, 0 Byte) |
| **tradingeconomics.com/`<land>`/`<kind>`-pmi** | **200, ~300 KB, Wert im KLARTEXT** ✅ |

Der Berichtssatz dort lautet z.B. *"Manufacturing PMI in Japan decreased
to 54.50 points in July from 54.80 points in June of 2026."* - Actual,
Vorwert, Referenzmonat und Jahr in einem Zug. Schritt **"Fetch PMI actuals
from Trading Economics country pages"**, 6 Waehrungen × mfg/svc.

**⚠️ Drei Fallen, die dort schon geloest sind - nicht neu aufmachen:**

1. **Die Verben sind abschliessend aufgezaehlt** (`increased|decreased|
   rose|fell|declined|edged up|edged down|was unchanged at|remained at|
   stood at`). Auf derselben Seite stehen Prognose- ("is expected to be"),
   Durchschnitts- ("averaged") und Ausblickssaetze ("projected to trend")
   mit demselben Satzbau. Ein offenes Muster liest die Prognose als Actual.
   Geprueft: 6/6 Formulierungen geparst, 3/3 Nicht-Treffer verworfen.
2. **Der Wert geht DIREKT nach `ind_data`, nicht nur ueber den Kalender.**
   Erster Livelauf: 12/12 Werte geholt, **0 zuzuordnen** - der FF-Feed
   umfasst nur zwei Wochen, die PMI-Zeile vom 3.-5.8. war am 9.8. schon
   weg. Der Kalender-Pfad bleibt zusaetzlich bestehen (fuellt die Zeile,
   solange es sie gibt), traegt aber nicht allein.
3. **Ohne echtes Release-Datum wird NICHTS eingetragen.** Das Datum wird
   von derselben Seite gelesen (juengstes nicht-zukuenftiges, beide
   Schreibweisen) - daran haengen Altersgrenze und Zyklus-Rechnung, ein
   geratenes waere schlimmer als kein Eintrag. Live: 9 geschrieben,
   1 uebersprungen (CHF Services fuehrt kein Datum), 2 hatten schon einen
   juengeren Wert. `ind_data` dadurch von 84 auf **99** Werte.

Bei der Zuordnung im Kalender bleiben die nationalen Teilreihen der
Eurozone (`German`/`French`/`Italian`/`Spanish` …) ausdruecklich
ausgeschlossen - sonst landet der Eurozone-Wert auf der deutschen Zeile.

### ✅ AUSGEBAUT (2026-08-09): TE-Laenderseiten als ALLGEMEINE Indikatorquelle

Anlass war AUD Retail Sales unter Economic Growth: Wert vom 31.07.2025,
15 eigene Zyklen ueberfaellig, weil das ABS die Handelsumsatz-Reihe 2025
durch den **Household Spending Indicator** ersetzt hat. Die Nachfolgereihe
laeuft weiter - die App kannte sie nur nicht.

Der Schritt heisst jetzt **"Fetch indicator actuals from Trading Economics
country pages"** und zieht 23 Seiten: PMI (6 Waehrungen × mfg/svc) plus
AUD Retail Sales (alte UND neue Reihe), AUD/CHF Core CPI, CHF PPI, JPY
GDP/Erwerbstaetige/offene Stellen, EUR Beschaeftigungsaenderung.

**⚠️ Die Satzmuster sind an den ECHTEN Seiten gemessen, nicht geraten.**
Fuenf Iterationen waren noetig, jede durch die eingebaute Fehlerdiagnose
aufgeklaert (bei Nicht-Treffer werden bis zu 3 Fenster um jedes
Ankervorkommen ausgegeben). Was dabei herauskam - nicht neu aufmachen:

| Falle | Beispiel von der echten Seite |
|---|---|
| Anker trifft zuerst die **Navigation** | `Retail Sales MoM Calendar News Markets …` - ein einzelnes `exec()` bleibt dort haengen. Es werden ALLE Vorkommen durchprobiert. |
| Quartalsformulierung | `in the second quarter of 2026` statt `in June of 2026` |
| Datum **ohne** `of` | `held steady at 3.6% in June 2026` |
| Zustands- statt Bewegungsverb | `held steady at`, `was`, `came in at` |
| Prozentzeichen **ohne** Leerzeichen | `rose 1.2%` statt `1.2 percent` |
| **Gar keine Einheit** | `increased by 0.10 in March of 2026` → Einheit wird vom Durchschnittssatz derselben Seite gelesen (`averaged 0.21 percent`), NICHT geraten |
| Fuellwoerter vor der Periode | `rose 1.2% month-on-month in June 2025` |
| Datum nur im **Attribut** | Das Tag-Strippen entfernt `data-date="2026-08-04"` - die Datumssuche laeuft deshalb auch auf dem ROHEN HTML |

**Zwei Schutzmechanismen, die dabei bleiben muessen:**
1. **Perioden-Anhang ist Pflicht.** Auf derselben Seite stehen Prognose-
   (`is expected to be … by the end of this quarter`), Durchschnitts-
   (`averaged … from 1994 until 2026`) und Ausblickssaetze. Sie haben
   diesen Anhang nicht - genau das haelt sie draussen, nicht die Verbliste.
2. **Jahres-Check + 120-Tage-Fenster.** `reaching an all time high of 10.70
   percent in March of 1990` wird ueber das Bezugsjahr verworfen; ein
   Release-Datum aelter als 120 Tage gilt nicht als aktuell. Genau das
   faengt AUD Retail Sales ab, dessen ALTE Reihe bei der Quelle selbst
   stehengeblieben ist (ihr Satz spricht noch von Juni 2025) - der Wert
   wird erkannt, aber nicht eingetragen, und Household Spending liefert
   stattdessen den aktuellen Stand.

**Ohne echtes Release-Datum wird NIE etwas eingetragen** - daran haengen
Altersgrenze und Zyklus-Rechnung.

**Drei Satzformen** (in dieser Reihenfolge probiert): **A** `… to X <Einheit>
in <Monat> from Y <Einheit> in <Monat> of <Jahr>` (Actual + Vorwert), **B**
`… X <Einheit> in <Periode> of <Jahr>` (nur Actual), **C** `… X <Einheit> in
<Monat>.` OHNE Jahr - nur als letzte Rueckfalloption, Jahr aus dem Monat
abgeleitet (juengstes nicht-zukuenftiges Vorkommen), Monate aelter als ein
halbes Jahr werden verworfen.

**Prognose + Vorwert aus demselben Berichtssatz** (Pruefdurchgang
2026-08-09). Die Formen B und C nennen keinen Vorwert - sechs Eintraege
standen dadurch mit Actual, aber ohne Forecast UND ohne Previous da und
trugen **0** zum Score bei, obwohl sie taufrisch waren (weder Beat/Miss
noch Step-Signal ist ohne Vergleichswert moeglich). Beide Zahlen stehen
aber meist im selben Satz. Zwei Grenzen halten den Unsinn draussen:
1. **Nur eindeutig benannte Formulierungen.** Forecast nur aus
   `expectations|forecasts|estimates|consensus of X`, Vorwert nur aus
   `from|after|compared with/to X percent|%|points`. `is expected to be …
   by the end of this quarter` (Ausblick) und `averaged … percent`
   (Langzeitmittel) stehen auf denselben Seiten und werden dadurch NICHT
   gelesen - live bestaetigt an CHF Core CPI und AUD Retail Sales.
2. **Das Fenster endet am Satzende** (`. ` + Grossbuchstabe; Dezimalpunkte
   stehen vor einer Ziffer und zaehlen nicht). Direkt hinter dem
   Berichtssatz stehen die Nachbarreihen - ohne diese Grenze koennte deren
   Konsens als unserer gelesen werden. An den zwischengespeicherten echten
   Seiten gemessen: 0 Treffer ausserhalb des Satzes, die Grenze kostet
   also nichts und schliesst den Fall trotzdem.

**Einheiten-Formatierung nur an EINER Stelle** (`SUF`/`fmtU`): Actual,
Vorwert und Forecast teilen sich dieselbe Tabelle. Eine zweite daneben war
schon nach wenigen Minuten auseinandergelaufen - der Forecast kannte
`percent of gdp` nicht und haette die Zahl ohne Prozentzeichen neben einen
Actual MIT Prozentzeichen geschrieben.

**⚠️ Historie NICHT erben, wenn die Reihe gewechselt hat.** Ein eigenes
`label` heisst per Definition: die Quelle misst etwas anderes als bisher.
AUD Retail Sales hat 32 `historyFull`-Punkte der eingestellten
ABS-Handelsumsatzreihe weitergeschleppt, obwohl der Wert inzwischen
Household Spending ist - Verlaufschart, Trend-Signal und im normalisierten
Modus auch die Streuung der Prognosefehler haetten damit zwei Messgroessen
vermischt. `sameSeries=!e.label` entscheidet das; lieber keine Historie als
eine vermischte, sie baut sich neu auf. Der Verwurf wird geloggt
(`Historie der alten Reihe verworfen`).

**⚠️ Drei Reihen messen NICHT exakt dasselbe wie der Kartenname** und tragen
deshalb ein eigenes Label, damit das auf der Karte sichtbar ist statt
stillschweigend gleichgesetzt zu werden:
- JPY `NFP / Employment Change` ← **Employed Persons** (Japan fuehrt keine
  monatliche Beschaeftigungsaenderung; fuer den Score zaehlt die Richtung
  gegen den Vorwert, und die ist dieselbe Aussage)
- AUD `Retail Sales` ← **Household Spending** (ABS hat die Handelsumsatz-
  Reihe 2025 eingestellt; verifiziert als Monatsrate: *"increased 6 percent
  in June of 2026 over the previous month"*)
- JPY `Services Inflation` ← **CPI-Dienstleistungskomponente** des
  Innenministeriums, NICHT der Unternehmens-Dienstleistungspreisindex der BoJ

**Ausnahme, eng gefasst:** fehlt der Termin auf der Seite, darf er von der
SCHWESTERREIHE derselben Veroeffentlichung uebernommen werden - aber nur,
wenn beide denselben Berichtsmonat und dasselbe Jahr melden (`SIBLING`).
Aktuell nur `svc_CHF` ← `mfg_CHF`: procure.ch bringt beide Schweizer PMIs
in einer gemeinsamen Mitteilung. Weicht der Monat ab, bleibt der Eintrag
ohne Datum und wird nicht geschrieben.

### ⚠️ Zyklus-Untergrenze: Reihen mit Vorabschaetzung UND Endstand

`indCycleDaysCalc` misst den Zyklus als Median der echten Release-Abstaende.
Bei Reihen mit ZWEI Terminen je Periode wechseln sich kurze und lange
Abstaende ab - und der Median landet auf dem KURZEN. Gemessen an EUR
Employment Change: 21/70/21/68/23 Tage → Median 23, obwohl die Reihe
quartalsweise erscheint; JPY GDP ebenso mit 25 statt 90. Die Altersgrenze
hat beide dadurch nach gut zwei Monaten faelschlich auf 0 gesetzt, obwohl
die Quelle schlicht noch nichts Neues hatte.

Der angegebene Turnus (`ind.interval`) dient deshalb als **Untergrenze**
(`Math.max(median, turnus*0,6)`). Das wirkt ausschliesslich entschaerfend -
die Grenze kann nie strenger werden als vorher, echte Terminverschiebungen
(Feiertage, unregelmaessige Termine) laufen weiter durch. Bei kuenftigen
Aenderungen an der Zyklus-Messung diesen Fall mitpruefen: Prel/Final-Reihen
sind der Normalfall bei BIP und Beschaeftigung, nicht die Ausnahme.

Bei "Indikator veraltet"-Meldungen deshalb IMMER zuerst die TITLE-DIAG-
Zeile im Job-Log lesen und unterscheiden:
- Titel steht da MIT `[actual]`, aber kein Wert in `ind_data` → Regel-Luecke, fixbar.
- Titel steht da mit `[kein actual]` → Quellenproblem, Regel-Fix sinnlos.
- Titel steht gar nicht da → die Quelle fuehrt die Reihe nicht.

So gefunden und gefixt (2026-08-08): **Lohnwachstum** war in den RULES auf
USD gegated, obwohl fuer GBP (`Average Earnings incl. Bonus (3Mo/Yr)`),
JPY (`Average Cash Earnings YoY`), CAD (`Average Hourly Wages YoY`), EUR
(`Negotiated Wage Growth`), AUD (`Wage Price Index YoY`) und NZD (`Labour
Cost Index QoQ`) je eine Reihe MIT Actual existiert. Und **CAD Services
PMI** heisst `Ivey PMI s.a` und traf weder `services pmi` noch
`non-manufacturing pmi` - die App kannte die Zuordnung laengst
(`IND_EVENT_MATCHERS` hat `CAD:/ivey/`), nur der Workflow nicht.

**Echte Datenluecken (keine Quelle, kein Bug):** CHF Core CPI, CHF PPI,
CHF Services PMI, JPY Employment Change, JPY Services Inflation (CSPI,
bewusst aus den RULES ausgelassen), AUD Core CPI (Trimmed Mean), AUD
Retail Sales (ABS-Reihe 2025 eingestellt).

**Zweite, unabhaengige Baustelle (erledigt 2026-08-08):** im `ff_calendar`
hatten **82 bereits vergangene** Events immer noch kein Actual. Die
Unmatched-Diagnose der Enrichment-Stufe meldete NUR High/Medium - PMIs
laufen dort als "Low" und fielen still durch, ausgerechnet die
Indikatoren also, ueber die es nie eine Meldung gab. Die Diagnose zaehlt
jetzt jede Impact-Stufe; dazu gibt eine **Quellen-Diagnose** die rohen
FXStreet- und Alt-Payloads nach PMI-Reihen aus, damit die Frage nach
einer Ersatzquelle mit Messwerten statt Vermutungen beantwortet wird.

## ⚠️ "Release faellig, aber kein Wert" muss GEMELDET werden

Nutzer-Vermutung 2026-08-08, bestaetigt: "bei dem automatischen Update
bei neuen Releases [muss] einen Bug geben wenn die Quelle da nicht
gefunden wird". Es war eine LUECKE, keine Fehlrechnung.

`findIndEventHistory()` verwirft jedes Kalender-Event **ohne Actual**
(`if(!ev.actual...)return false`), und der Feed-Pfad kennt die betroffenen
Indikatoren teils gar nicht. Ein Release, das stattgefunden hat, dessen
Zahl aber von keiner Quelle kam, war damit **unsichtbar**: die Karte zeigt
unveraendert den ALTEN Wert mit dem ALTEN Datum, als waere er aktuell.
Erst nach `IND_STALE_CYCLES`=2 eigenen Zyklen greift die Altersgrenze -
bei einem monatlichen Indikator also erst nach rund zwei Monaten, ohne
ein einziges Signal dazwischen.

Loesung nach dem Grundsatz "nie schaetzen → Dashboard-Meldung":
`indAwaitingEvent(symId,ind)` sucht ein Kalender-Event, das (a) faellig
war (`AWAIT_GRACE_H`=6h Karenz), (b) NEUER ist als `ind.research.date`
und (c) immer noch keinen Actual hat. `awaitingIndicators()` sammelt sie;
sichtbar als **`AWAITING VALUE`** an der Indikator-Zeile (gestrichelter
Rahmen, bewusst ruhiger als das amberfarbene `OUT OF DATE`) und als
eigene Dashboard-Karte `awaitingNotifyHtml()`.

**Bewusst zwei getrennte Zustaende, nicht einer:** `OUT OF DATE` heisst
"zaehlt nicht mehr", `AWAITING VALUE` heisst "der angezeigte Wert ist
womoeglich ueberholt, wir haben die neue Zahl nur nicht bekommen". An der
ZEILE wird nur eine Marke gezeigt (`OUT OF DATE` gewinnt, weil sie den
Score-Beitrag 0 erklaert), im Dashboard erscheinen beide.

**⚠️ Grenze, die man kennen muss:** der FF-Feed umfasst nur diese +
naechste Woche. Eine verpasste Zeile rollt also binnen Tagen aus dem
Kalender und ist danach nicht mehr erkennbar - genau das ist beim Test am
2026-08-09 passiert (die PMI-Zeilen vom 3.-5.8. waren weg, die Erkennung
meldete korrekt 0). Die Meldung faengt den Fall also im Zeitfenster, sie
ist keine rueckwirkende Buchhaltung. Bei JEDER neuen Regel, die ein Event
ohne Actual verwirft, hier mitpruefen.

## ⚠️ EUR-PMI-Kalendermatcher: "Final" nicht vergessen

`IND_EVENT_MATCHERS['Manufacturing PMI'/'Services PMI']` hat fuer EUR ein
VERANKERTES Muster, damit "German Final Manufacturing PMI" und die
spanische/italienische/franzoesische Reihe (alle ebenfalls als EUR
getaggt) draussen bleiben. Genau diese Verankerung hat bis 2026-08-08 aber
auch das Aggregat selbst ausgesperrt: Forex Factory nennt es **"Final
Manufacturing PMI"**, und `final ` stand nicht in der Praefix-Liste - EUR
war die EINZIGE Waehrung mit null Treffern. Bei kuenftigen Aenderungen an
diesem Muster IMMER gegen die echten FF-Titel testen, nicht nur gegen den
theoretischen Reihennamen.

## ⚠️ SCHRIFT (Stand 2026-08-08)

Zwei Variablen: `--ff-text` (Oberflaechentext) und `--ff-num` (alle
Zahlen). Bei neuen Stellen IMMER eine der beiden verwenden, nie einen
eigenen Stapel.

**Die echte Bloomberg-Schrift ist nicht verfuegbar.** "Bloomberg Prop
Unicode" wurde bei Matthew Carter angefertigt, ist bei Carter & Cone
markenrechtlich geschuetzt, kommerziell lizenziert und exklusiv fuer
Bloomberg. Die "Free Download"-Seiten dazu sind Raubkopien. Eine
Web-Schrift ueber ein CDN scheidet ohnehin aus - die App ist eine einzelne
Datei, die per Service Worker offline laufen muss.

Nachgebaut ist deshalb das, was den Terminal-Charakter ausmacht - die
ZIFFERN: `font-feature-settings:'tnum' 1,'zero' 1,'ss01' 1` plus
`font-variant-numeric:tabular-nums slashed-zero` auf `body`. Dicktengleiche
Ziffern lassen Zahlenspalten optisch einrasten, ohne dass man Linien
zeichnen muss (Tuftes Data-Ink-Gedanke, und der Grund, warum Bloomberg
ueberhaupt eine eigene Mono anfertigen liess); die geschlitzte Null trennt
0 von O.

**Historie, damit es nicht nochmal passiert:** ein frueherer Nutzer-Wunsch
"ueberall Arial" war als globales
`*,*::before,*::after{font-family:Arial...!important}` umgesetzt. Das hat
ALLE 200 Monospace-Deklarationen der App stillschweigend ueberschrieben -
die Zahlen waren nie dicktengleich. Der Stern setzt jetzt weiterhin die
einheitliche Textfamilie, aber OHNE `!important`: ein Selektor aus lauter
Sternen hat Spezifitaet 0, jede Klassenregel schlaegt ihn automatisch.
**Nie wieder ein globales `!important` auf font-family setzen.**

## ⚠️ TYPOGRAFISCHE SKALA (Dashboard, Stand 2026-08-08)

Sieben feste Stufen als CSS-Variablen statt frei gewaehlter Werte:
`--fs-hero` 30 · `--fs-xl` 22 · `--fs-lg` 17 · `--fs-md` 15 (KARTENTITEL) ·
`--fs-base` 13 · `--fs-sm` 12 · `--fs-xs` 11 · `--fs-2xs` 10.

Vor dem Umbau kamen 33 verschiedene Groessen/Gewichts-Kombinationen vor
(8 bis 32px, dazwischen 9,5 / 10,5 / 11,5 / 12,5) - keine Skala, sondern
pro Stelle ad hoc gewaehlt. Der Kartentitel war mit 11px KLEINER als der
Fliesstext daneben (12px), die Hierarchie also umgekehrt.

Grundsatz (Stephen Few, *Information Dashboard Design*): wenige Stufen
erzwingen Hierarchie, viele loesen sie auf. Bei neuen Elementen IMMER eine
der sieben Stufen verwenden, keine neue Zwischengroesse einfuehren.

Karten-Abschluss: NICHTS wird gestreckt, um Luecken zu fuellen
(`align-items:start` ueberall). Die Spalten duerfen unterschiedlich hoch
enden wie Zeitungsspalten; eine Haarlinie ueber der Fussleiste zieht den
Schlussstrich.

## ⚠️ GRUNDSATZ: wiederkehrende UI-Bausteine müssen einheitlich sein

**Nutzer-Wunsch 2026-07-12:** Elemente, die an mehreren Stellen der Webseite
vorkommen (Kalender, Filter-Dropdowns, usw.), müssen überall gleich aufgebaut
sein — gleiche Optik, gleiches Verhalten. Unterschiede sind nur ok, wenn sie
sachlich begründet sind (z.B. filtert die eine Stelle nach etwas anderem als
die andere) — das ist selbstverständlich kein Widerspruch zur Regel.

Umgesetztes Beispiel: `assetFilterSelect(ids, selected, onChange, allLabel,
titleAttr, labelFn)` (≈ Zeile 1701, direkt nach `SB_CATS`) ist der EINE
gemeinsame Helper für alle Asset-Filter-Dropdowns (COT, Put/Call, Net Options
Flow, Seasonality) — gruppiert nach `SB_CATS`-Kategorie (FX/Crypto/Metals/
Energy/Indices/Stocks), einheitliche Größe über `.cot-filterbar select` in
der CSS (nicht mehr `#cotFilterSel`-only). Retail Sentiment filtert nach
Broker-PAAR statt Asset-ID (passt nicht in `SB_CATS`) und bekommt daher eine
eigene, aber optisch gleich aussehende Zweifach-Gruppierung (FX Pairs /
Other Assets). Beim Anlegen eines NEUEN Filters immer zuerst prüfen, ob
`assetFilterSelect` passt, statt einen eigenen `<select>` zu bauen.

Weitere bereits geltende Cross-Cutting-UI-Regeln (durchgehend, nicht nur wo
gerade dran gearbeitet wird):
- **Charts mit mehreren Datenpunkten**: überall Hover/Touch mit Linie + Punkt
  + Tooltip-Fenster (Muster: `chartHoverWrap()` + `attachChartHovers()`,
  ≈ Zeile 8845) — Fenster verschwindet, sobald Finger/Maus weg ist. Charts
  dürfen NICHT horizontal wegwischbar/verschiebbar sein.
- **Karten-Inhalt darf nie über den Kartenrand hinausgehen.** Ist der Inhalt
  zu breit, wird er INNERHALB der Karte horizontal scrollbar gemacht (nicht
  abgeschnitten, nicht die Karte selbst verschoben) — alles bleibt zu jeder
  Zeit exakt untereinander ausgerichtet, nichts "rutscht".
- **⚠️ Elemente dürfen sich NIEMALS so überlappen, dass etwas dadurch
  unsichtbar/unlesbar wird** (Nutzer-Grundsatz 2026-07-20, per Screenshot:
  im Rate-Probabilities-Mehrlinien-Chart überlappten sich Endpunkt-Labels
  bei nah beieinander liegenden Werten, und ein Hover-Tooltip wurde vom
  `overflow:hidden`-Slide-Viewport oben abgeschnitten). Gilt generell, nicht
  nur für diesen einen Chart — bei JEDEM neuen UI-Element mit mehreren
  dynamisch positionierten Beschriftungen/Overlays (Chart-Labels, Tooltips,
  Badges, Dropdowns) immer eine Kollisions-/Clipping-Prüfung einbauen
  (Muster: Labels an ähnlicher Position gruppieren, sortieren, Mindestabstand
  erzwingen; bei Tooltips/Overlays in einem `overflow:hidden`-Container genug
  eigene Innen-Freiheit einplanen, statt sich auf den Container-Rand zu
  verlassen). Verwandtes Problem, dieselbe Klasse: jedes Dropdown/Overlay,
  das aus einer `backdrop-filter`-Leiste (`.hdr`/`.tabbar`/`.sb`)
  herausragen könnte, gehört per `document.body.appendChild()` +
  `position:fixed` gebaut (Muster: `openStackMenu`) — ein simples
  `z-index` auf einem statischen Kind-Element reicht nicht, weil die Leiste
  ihren eigenen Stacking-Context aufmacht (Fundgeschichte: `docs/CHANGELOG.md`,
  Stichwort "Data"-Dropdown).
- **Score-/Asset-Karten**: kalmes Design statt Farbflut — Bias wird NUR über
  einen linken Rand-Streifen gezeigt (`.rub-card` 4px, `.ind-card`/
  `.pair-card`/`.sym-row` 3px) auf neutralem 1px-Rahmen, `glow-*`-Klassen
  setzen ausschliesslich `border-left-color`, keinerlei Hintergrund-Tint.
  Ein Hintergrund-Glow wurde mehrfach probiert und vom Nutzer nach Ansehen
  jedes Mal wieder verworfen (Details in `docs/CHANGELOG.md`, Stichwort
  "Glow") — **bei einem erneuten "Glow zurück"-Wunsch zuerst nachfragen**,
  welche Kartentypen genau gemeint sind, statt direkt umzusetzen.

## ⚠️ META-GRUNDSATZ: jede dauerhafte Nutzer-Vorgabe gehört ins CLAUDE.md

**Nutzer-Wunsch 2026-07-12:** Alles, was der Nutzer als dauerhafte Präferenz
äußert (nicht nur einmalige Task-Anweisungen), muss dokumentiert werden —
damit eine NEUE Session sofort weiß, wie der Nutzer es haben will, ohne die
komplette Chat-Historie erneut durchgehen zu müssen. Bei Unsicherheit, ob
etwas dauerhaft oder einmalig gemeint ist: lieber dokumentieren als
auslassen.

**⚠️ Ergänzung 2026-08-21 (nach der CLAUDE.md/CHANGELOG-Trennung):** eine
neue STANDING-Regel (etwas, das bei jeder künftigen Aufgabe gilt) gehört
weiterhin in DIESE Datei — kompakt, ohne die volle Fund-/Iterationsgeschichte.
Der Verlauf EINER einzelnen Änderung/eines Bugfixes (Datum, was ausprobiert
wurde, Screenshots-Beschreibung, Messwerte) gehört stattdessen nach
`docs/CHANGELOG.md`. Grund: genau die dort dokumentierte volle Nacherzählung
jeder Session hat CLAUDE.md auf ~25% des Kontextfensters aufgebläht. Faustregel:
"gilt das ab jetzt immer?" → hier rein. "So kam es dazu?" → CHANGELOG.

## Arbeitsweise: Agent/Modell-Triage (Nutzer-Wunsch 2026-07-12)

Bei jeder neuen Top-Level-Anfrage zuerst kurz die Komplexität einschätzen,
dann entscheiden, ob und mit welchem Agent/Modell delegiert wird — Ziel:
bestes Ergebnis bei geringstem Tokenverbrauch, nicht Delegation um der
Delegation willen:
- Kleinkram (einzelner Grep, kurzer Fix, ein Log lesen) selbst erledigen —
  ein Sub-Agent-Spawn kostet hier mehr Overhead als er spart.
- Echte Bulk-/Recherche-Teilaufgaben (breite Codebase-Suche, unabhängige
  Parallel-Checks, reine Recherche ohne Syntheseaufwand) an `Explore` oder
  `general-purpose` delegieren.
- Modellwahl nach Schwierigkeit: Haiku für simple/mechanische Suchen, Sonnet
  als Standard, Opus nur wenn wirklich komplexes Urteilsvermögen gebraucht
  wird.

## ⚠️ KOMMUNIKATIONS-GRUNDSATZ: nie schätzen → Dashboard-Meldung (Nutzer-Wunsch 2026-07-23)

**Wenn ein echter Wert nicht aus einer Live-Quelle beschafft werden kann, NIEMALS
schätzen/raten/hart eintragen — stattdessen eine Meldung auf dem Dashboard erzeugen.**
Die Dashboard-Meldung ist der Kanal, über den die App (und ich) dem Nutzer mitteilt,
dass etwas Aufmerksamkeit braucht (fehlende Daten, Quelle nicht erreichbar, Entscheidung
nötig). Steht auch in der `README.md`. Gilt generell, nicht nur für den Indikator-Feed.

**Indikator-Datenquellen-Policy (nur Makro-Indikatoren wie CPI/GDP/PPI/PMI/NFP/Retail
Sales/Consumer Confidence — NICHT COT/Yields/Put-Call/Risk-Sentiment):**
- Primärquelle **Investing.com** (Actual+Forecast+Previous aus einer Quelle).
- Fallback NUR bei Block (nach mehreren Versuchen), **pro Indikator** die Alternativquelle
  mit vollständigen Werten (FF/TE/FXStreet/TradingView).
- Fallback-Werte werden im UI hervorgehoben + ein Dashboard-Popup listet die betroffenen
  Indikatoren. Ein eigener `*/10`-Min-Workflow versucht Investing.com erneut, aber NUR
  solange ein Fallback aktiv ist (sonst sofortiger No-Op); bei Erfolg wird der Wert
  zurückgeschrieben und Highlight/Popup lösen sich selbst.
- Zwei getrennte Meldungen: *temporär geblockt* (selbstlösend) vs. *Investing.com führt
  den Indikator nie* (eigene Dauer-Meldung, Nutzer kümmert sich selbst darum).

## Arbeits-Workflow (vom Nutzer durchgehend eingefordert)

- **⚠️ Vor Code-Änderungen erst das OK des Nutzers einholen (Nutzer-Wunsch
  2026-07-21):** bei einer neuen Anfrage NICHT sofort in `index.html`/den
  Workflow-Dateien loseditieren. Stattdessen zuerst den geplanten Ansatz
  MIT KONKRETEN BEISPIELEN vorstellen (z. B. Beispiel-Sätze bei Text-/
  Formulierungs-Änderungen, Vorher/Nachher-Werte bei Logik-Änderungen,
  Mockup-Beschreibung bei UI-Änderungen) und auf die Bestätigung des
  Nutzers warten, bevor der Code tatsächlich angefasst wird. Gilt für
  inhaltliche/funktionale Änderungen — offensichtliche, eindeutig
  beschriebene Bugfixes ohne Interpretationsspielraum sind hiervon nicht
  automatisch ausgenommen, im Zweifel lieber einmal zu viel nachfragen als
  ungefragt loslegen.
  **⚠️ Verschärfung 2026-08-21 (Nutzer-Wunsch, nach der als "einfach eine
  Menge Grau drauf gepackt" kritisierten Kontrast-Aktion):** vor JEDER
  Änderung muss ich zu 95 % sicher sein, dass ich die Anfrage vollständig
  und richtig verstanden habe — bei Design-/Geschmacksentscheidungen
  ausdrücklich eingeschlossen, nicht nur bei funktionalen Änderungen.
  Solange diese Sicherheit nicht erreicht ist, so lange nachfragen (per
  `AskUserQuestion`, mit konkreten Optionen/Beispielen/Referenzen statt
  offener Fragen), bis sie erreicht ist — dann erst anfangen.
- **⚠️ VERSION-CHECK/LIVE-Banner bei JEDER Änderung an `index.html` bumpen —
  ausnahmslos, auch bei kleinen/reinen Bugfixes ohne UI-Sichtbarkeit.**
  Zentriert in derselben Zeile wie das Logo (`.hdr-livebanner`,
  `id="verBanner"`), Name/Nummer in `#hlbName` (z.B. `VERSION-CHECK-234`) +
  `title`-Tooltip mit Kurzbeschreibung der Änderung hochzählen. Farbe (roter
  Punkt/„LIVE"-Text) ist fest, nicht Teil des Änderungssignals. Die eigene
  Chat-Antwort muss nach jeder Änderung als LETZTEN Satz explizit nennen,
  wie die neue Nummer lautet (z. B. „Aktuelle Version ist jetzt
  VERSION-CHECK-243.") — nicht nur im Code bumpen, auch im Chat mitteilen.
  Wird zusätzlich von `check/rules.js` erzwungen (siehe WAECHTER unten).
- **⚠️ KEIN Apostroph in einem `node -e '...'`-Block der Workflow-YAML —
  auch nicht im Kommentar.** Der gesamte Node-Code steckt in einem
  einfach-quotierten Shell-String; ein `'` darin beendet ihn, der Rest wird
  als Shell interpretiert und der Schritt stirbt mit
  `syntax error near unexpected token '('` (Exit 2). Passiert 2026-08-09
  durch einen deutschen Kommentar mit `Japan's`. Der Schritt hat
  `continue-on-error`, faellt also nur dadurch auf, dass die erzeugte Datei
  fehlt (`ENOENT`) - nicht dadurch, dass der Lauf rot wird. **`node --check`
  findet das NICHT** (es prueft den bereits extrahierten JS-Code). Deshalb
  nach JEDER Aenderung an einem Workflow-Schritt zusaetzlich
  `bash -n <extrahierter run-Block>` laufen lassen, nicht nur
  `yaml.safe_load` + `node --check`.
- **JS-Syntax-Check vor jedem Push** von `index.html`: `<script>`-Blöcke
  extrahieren, zusammenfügen, `node --check` laufen lassen. Für die Workflow-YAML
  zusätzlich `python3 -c "import yaml; yaml.safe_load(...)"` und das eingebettete
  Node-Skript via `node --check` prüfen.
- **⚠️ IMMER auch auf `main` pushen (Nutzer-Wunsch 2026-07-26, nach einem
  Vorfall):** `main` ist der Branch, den GitHub Pages live auf
  jo-brxxn.github.io deployed. Der Session-Dev-Branch (Name wechselt je
  Task/Session, z. B. `claude/new-session-...`) ist NICHT das, was der
  Nutzer auf der echten Webseite sieht. Vorfall 2026-07-26: eine ganze
  Feature-Session (Retail-Sentiment-Historie) wurde nur auf den Dev-Branch
  gepusht — Nutzer meldete "Ich seh nix auf der Webseite", weil `main`
  unveraendert blieb. Ab sofort bei JEDEM Push (nicht nur am Ende einer
  Session): zuerst `git fetch origin main` + `git merge origin/main` (oder
  Fast-Forward pruefen) in den Dev-Branch, dann sowohl auf den Dev-Branch ALS
  AUCH auf `main` pushen (`git push origin <dev-branch>` UND
  `git push origin <dev-branch>:main` bzw. `git push origin main` nach
  einem lokalen Merge/Checkout) — nicht erst fragen, ob das gewuenscht ist,
  das ist ab jetzt Standard-Verhalten fuer dieses Projekt.
- **Browser-Verifikation** für UI-Änderungen: lokaler `http.server` +
  Playwright (`/opt/node22/lib/node_modules/playwright`, Chromium). Vor dem
  Rendern `#introOv` und `#lockScreen` entfernen (Intro/PIN-Sperre).
- **Antworten auf Deutsch.**
- Commit-Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` +
  `Claude-Session: …`.

## Daten & Workflow

- **⚠️ GRUNDSATZ — nur nützliche Daten ziehen (Nutzer-Wunsch 2026-07-11):**
  Beim Abrufen von Daten aus dem Internet über APIs IMMER nur die Daten
  speichern/ziehen, die tatsächlich einen Nutzen haben — konkret nur für die
  Assets, die in der App gelistet sind (FX-Majors `USD/EUR/GBP/CHF/JPY/CAD/
  AUD/NZD` + Non-FX `GOLD/SILVER/OIL(WTI)/BTC/SP500/NAS`, siehe `FX`/`COT_NAME`
  in `index.html`). Kein „alles speichern und im Browser filtern". Beispiel:
  die Myfxbook-Retail-Quelle liefert ~186 Symbole (viele Exoten/Einzelaktien)
  — im Workflow werden davon nur die FX-Major-Paare + je ein kanonisches
  Non-FX-Symbol behalten (Schritt „Fetch market sentiment"). Neue Feeds nach
  demselben Prinzip von vornherein auf die gelisteten Assets filtern.
- **⚠️ GRUNDSATZ — nie Schätzungen oder veraltend-manuelle Werte (Nutzer-
  Wunsch 2026-07-11):** Niemals geschätzte/geratene Zahlen in die App oder
  die Daten-JSONs schreiben. Und niemals einen Wert, der sich über Zeit
  ändert (Kurs, Ratio, Score, Zins, Volumen, …), als fester manuell
  eingetragener Wert im Code oder in einer Daten-Datei hinterlegen — der
  wird nie wieder aktualisiert und ist ab dem Moment des Schreibens falsch.
  Variable Werte kommen IMMER aus einem lebenden Feed (Workflow-Fetch,
  API-Call), der bei jedem Lauf neu zieht — oder das Feld bleibt leer/fehlt,
  bis eine echte Quelle existiert. Das gilt auch für Backfills: nur echte
  historische Werte einer Quelle nachladen (wie beim OCC-Put/Call-Backfill),
  nie Zwischenwerte interpolieren oder schätzen, um eine Lücke zu füllen.
- **⚠️ GRUNDSATZ — ein nötiges kostenloses Konto ist KEIN Abbruchgrund
  (Nutzer-Wunsch 2026-07-11):** Wenn eine Datenquelle nur nach Anmeldung
  (kostenloses Konto/Login) Daten herausgibt, ist das kein Grund, die Suche
  dort zu beenden — der Nutzer registriert sich bei Bedarf überall kostenlos
  und legt die Zugangsdaten als Repo-Secrets an (Muster: `MYFXBOOK_EMAIL`/
  `MYFXBOOK_PASSWORD`, siehe Retail-Positionierung unten). Erst wenn eine
  Quelle nachweislich eine BEZAHLTE Stufe für die gebrauchten Daten verlangt
  (nicht nur Registrierung), ist das ein echter Abbruchgrund. Vor dem
  Verwerfen einer Quelle wegen "braucht Login" daher IMMER erst klären, ob
  ein kostenloses Konto reicht, statt das anzunehmen.
- Daten-JSONs (`ff_calendar.json`, `ind_data.json`, `bond_data.json`,
  `cot_data.json`) werden stündlich vom GitHub-Action-Workflow
  `.github/workflows/update-ff-calendar.yml` erzeugt und nach `main` gepusht.
  Diese Dateien NICHT manuell editieren — den Workflow fixen und ggf. neu
  auslösen (`workflow_dispatch`).
- **COT-Marktauswahl**: pro Markt den kanonischen Kontrakt per größtem Open
  Interest wählen (Cross-Rate-/Nano-Varianten ausschließen). Diese Logik
  existiert ZWEIMAL und muss synchron bleiben: im Workflow-Node-Skript UND im
  Browser (`cotParseRaw` in `index.html`).
- **EUR-Indikatoren** (ind_data): bei mehreren Quellen das Eurozone-Aggregat
  (TV-Land `EU`) bevorzugen, nicht nationale Releases (DE/FR/IT/ES).
- Netzwerk in dieser Sandbox ist eingeschränkt: CFTC/FF/TradingView direkt sind
  meist blockiert. Live-Daten-Checks daher über die GitHub-Action-Logs bzw. den
  committed Stand auf `origin/main`, nicht über direkte Fetches.

## ⚠ WAECHTER: `node check/all.js` vor JEDEM Push (Stand 2026-08-16)

Alle Pruefskripte liegen ab sofort **im Repo** unter `check/`, nicht mehr im
Sitzungs-Scratchpad. Siehe `check/README.md` fuer die vollstaendige Liste.

```bash
python3 -m http.server 8935 --directory . &    # einmal pro Sitzung
node check/all.js                               # ~2,5 Minuten, 9 Pruefungen
node check/all.js --static                      # ~1 Sekunde, ohne Browser
```

Dieselben Pruefungen laufen zusaetzlich bei jedem Push automatisch
(`.github/workflows/checks.yml`), damit sie nicht davon abhaengen, dass
jemand daran denkt. Der Workflow reagiert bewusst nur auf `index.html`,
`check/**` und `.github/workflows/**` - die stuendlichen Daten-Commits
(reine `*.json`) loesen ihn nicht aus.

**Der Anlass:** die Fehler dieser Session waren nicht zufaellig. Jeder war
eine Regel, die NUR als Prosa in dieser Datei stand - `SCORE_MODEL_VERSION`
war hier sogar mit ⚠ markiert und wurde trotzdem vergessen. Prosa-Regeln
werden vergessen, ausfuehrbare nicht. `check/rules.js` uebersetzt vier davon
in ein Abbruch-Kriterium:

1. `index.html` geaendert → VERSION-CHECK-Nummer muss steigen
2. Score-Formel angefasst → `SCORE_MODEL_VERSION` muss steigen
3. Formulierungs-Logik angefasst → `SUMMARY_ENGINE_VERSION` muss steigen
4. Workflow erzeugt eine `.json` → sie muss in einem `git add` desselben
   Workflows stehen (ausser er loescht sie selbst wieder)

**Merksatz:** eine neue Konvention gehoert ab jetzt als PRUEFUNG nach
`check/`, nicht als Absatz in diese Datei. Ein Absatz erinnert niemanden;
ein roter Lauf schon. Und: eine neue Score-Groesse ohne zugehoerige Pruefung
ist ein blinder Fleck - `check/score.js` entsprechend erweitern.

**⚠ Falle, die beim Bau des Waechters selbst zugeschlagen hat:** `execSync`
hat ein `maxBuffer` von 1 MB. `git show HEAD:index.html` liefert ~1,5 MB -
der Aufruf schlug fehl, der `catch` lieferte einen leeren String, und JEDE
Regel, die den Vorher-Stand braucht, wurde STILL uebersprungen. Der erste
Testlauf meldete "ok" auf einem echten Verstoss. Seither wirft der
git-Helfer statt zu schlucken. Bei jedem neuen Pruefskript daran denken:
ein Waechter, der bei einem eigenen Fehler "gruen" meldet, ist schlimmer
als keiner.


## ⚠ NAVIGATION: dunkle Koyfin-Sidebar statt horizontaler Tab-Leiste (2026-08-21)

Nutzer-Wunsch per `/goal`, mit drei Koyfin.com-Screenshots als Referenz
(WebFetch war fuer praktisch jede externe Domain in dieser Umgebung
`EGRESS_BLOCKED` - org-weite Netzwerk-Policy, kein CLI/MCP-Problem; der
Nutzer hat die Screenshots stattdessen direkt in den Chat geschickt).
Wörtlich: "schwarz aussenrum machen, innendrin weiss, den Marmor-Look im
Hintergrund beibehalten, Kategorien links untereinander".

**Umsetzung:** die horizontale `.tabbar` ist komplett durch eine vertikale
`#navSidebar` ersetzt (App-Shell-Umbau: `.hdr` bleibt oben durchgehend,
darunter liegen `#navSidebar` und `#pageArea` als Flex-Row nebeneinander -
alle 17 `pgXxx`-Seiten stecken jetzt in `#pageArea` statt direkt in
`<body>`). Icon je Tab (`TAB_ICONS`, Feather/Lucide-Stroke-Stil), aktiver
Eintrag ueber blauen linken Rand + blaues Icon + fette weisse Schrift.

**⚠ Dunkle Farbgebung NUR ueber gescopte CSS-Variablen-Ueberschreibung**,
nicht durch Anfassen einzelner Stellen: `.hdr,#navSidebar{--bg0:...;--t0:...;
...}` ueberschreibt die Palette-Variablen NUR innerhalb dieses Teilbaums -
jede der rund 200 Stellen, die bereits `var(--t0)`/`var(--bg3)`/... nutzt,
faerbt sich dadurch automatisch um. Ohne dieses Muster haette jede Buchse
(Buttons, Icons, Logo, Live-Banner, Profil-Avatar) einzeln anfasst werden
muessen. **Bei kuenftigen dunklen/hellen Teilbereichen zuerst pruefen, ob
ein solcher gescopter Variablen-Override reicht**, bevor Einzelstellen
angefasst werden.

Der bestehende Tab-Stack-Mechanismus (`tabStacks`, drag-to-reorder,
`openStackMenu` als Flyout) ist FUNKTIONAL unveraendert geblieben - nur
`renderTabBar()` zielt jetzt auf `#navSidebar` statt `#tabbar` und baut
`.np`-Buttons (Icon+Label) statt `.tp`-Buttons, und `openStackMenu()`
oeffnet das Flyout jetzt RECHTS neben dem Stack-Button statt darunter
(mit Ruecksprung auf "darunter", wenn rechts kein Platz mehr ist) - passt
zu einer vertikalen statt horizontalen Leiste. `.tab-menu`/`.tab-menu-item`
selbst bleiben bewusst HELL (werden per `document.body.appendChild()`
ausserhalb von `#navSidebar` gerendert, erben die dunklen Variablen also
nicht) - ein helles Flyout ueber einer dunklen Sidebar-Kante ist auch bei
Koyfin selbst das uebliche Muster, kein Fehler.

**Mobile (<760px, Nutzer-Entscheid):** Sidebar wird zu einer reinen 56px-
Icon-Leiste (`.np-lbl{display:none}`), Labels bleiben nur noch als
`title`-Tooltip erreichbar. Bewusst NICHT gewaehlt: Hamburger-Drawer oder
Bottom-Nav (beide waeren groesserer Umbau bzw. zusaetzliche zweite
Nav-Struktur).

**Marmor-Hintergrund bleibt unveraendert** im Content-Bereich (`#pageArea`
setzt keinen eigenen Hintergrund, `body{background-image}` scheint weiter
durch) - nur `.hdr`/`#navSidebar` sind jetzt opak dunkel und verdecken ihn
dort. Bias-Farben (Blau=bullish/Rot=bearish) und der Kartenrand-Wert aus
der Kontrast-Korrektur (V400, 1.58:1) sind unveraendert - reine
Navigations-/Chrome-Aenderung, keine neue Kontrast-Iteration.

## ⚠ NAVIGATION/HEADER V2: Feinschliff nach dem ersten Koyfin-Umbau (2026-08-21)

Direkt im Anschluss an die dunkle Koyfin-Sidebar kam eine lange, konkrete
Punktliste vom Nutzer per `/goal` - Kernaenderungen, die bei kuenftigen
Aufgaben zu beachten sind:

**Inbox komplett entfernt** (nicht nur ausgeblendet): Button, Badge,
Modal, UND der komplette Postfach-Code - `mkEventNotif`/`syncEvtNotifs`,
`mkScoreNotif`/`syncIndNotifs`, `pruneInbox`, `updInboxBadge`, `openInboxM`,
`renderInbox`, `gotoIndicatorByNotif`, `delInboxItem`, `clearInbox`, das
`inbox`-Array aus `snap()`/`applySnap()`/beiden Initialisierungen/
`cloudPull`. **Wichtig fuer kuenftige "entfern X komplett"-Auftraege:** so
ein Feature ist oft an mehr Stellen verdrahtet als der sichtbare Button -
IMMER nach dem Datenfeld selbst suchen (hier: `inbox`), nicht nur nach dem
UI-Einstiegspunkt. Zwei Nachbar-Features blieben bewusst stehen, weil nicht
explizit genannt: `eventAlerts`/`priceAlerts` (Alarm-KONFIGURATION, feuert
weiterhin serverseitig per Telegram) und das Dashboard-"notification"-
Widget (zeigt weiterhin COT/Stale/Awaiting-Popups, nur der `inbox`-
gespeiste `evtRows`-Teil ist raus, da er nach der Inbox-Entfernung ohnehin
nie mehr etwas liefern konnte).

**Kopfzeile jetzt EINE Reihe** (`display:flex` statt 2-Zeilen-Grid): Logo
→ `.hdr-search` (breites Suchfeld links, Koyfin-Referenz, oeffnet weiter
dasselbe `#mSearch`-Modal) → `.hdr-status` (Saved + Live-Banner, direkt
nebeneinander) → `.hdr-r` (Undo/Redo/Help/Settings, `margin-left:auto`
haelt sie rechts). Die Bull/Bear/Neutral-Zaehlzeile (`updateStat()`,
`#statLine`) ist ersatzlos raus. "Data" (Export/Import/Backups) ist kein
eigenes Header-Dropdown mehr, sondern die erste Zeile im vormaligen
"☁ Cloud Synchronization"-Modal (`#mCloud`), das jetzt schlicht
"⚙ Settings" heisst - Cloud-Sync ist darin nur noch EIN Abschnitt
(eigene `<h3>☁ Cloud Sync</h3>`-Zwischenueberschrift). Bei kuenftigen neuen
Einstellungen: hier rein, nicht wieder einen eigenen Header-Button bauen.

**Sidebar-Breite passt sich dem Inhalt an** statt eines festen Werts:
`#navSidebar{width:max-content;min-width:150px;max-width:230px}` +
`.np{width:100%}` auf den Kindern - der Container sizet sich auf die
intrinsische Breite des breitesten Labels, alle anderen strecken sich
exakt darauf. Standardmuster fuer "Spalte so breit wie noetig, nicht
mehr" - bei kuenftigen aehnlichen Wuenschen (Sidebar, Dropdown-Breite)
zuerst pruefen, ob dieses Muster reicht, bevor ein fester Pixelwert
geraten wird.

**"Insights" (und jeder andere Tab-Stapel) klappt jetzt INLINE auf**,
nicht mehr als Flyout: `renderTabBar()` haengt bei offenem Stapel die
Mitglieder-Buttons (`.np-sub`, kleinere Schrift, eingerueckt) direkt nach
dem Stapel-Button in denselben Sidebar-Fluss. `openStackMenu()` (das
frueher ein `document.body`-Flyout baute) ist komplett entfernt -
`onStackClick()` toggelt nur noch `expandedStack` + `renderTabBar()`.
`showTab()` klappt den Stapel des jeweils aktiven Tabs automatisch auf
(egal ueber welchen Weg navigiert wurde - Klick, Suche, Tastenkuerzel),
damit die aktive Sektion immer sichtbar bleibt (Koyfin-Muster).

**Sidebar klappt automatisch auf Icon-Breite ein**, sobald im Inhalt
(`#pageArea`) gescrollt oder getippt/geklickt wird - und wieder aus, sobald
die Sidebar selbst beruehrt wird (`pointerenter`/`focusin`). Klasse
`.nav-collapsed` auf `#navSidebar` nutzt dieselben CSS-Regeln wie die
Mobil-Icon-Leiste (<760px), nur durch JS statt durch eine Media Query
ausgeloest - bei kuenftigen "Icon-only bei Bedarf"-Wuenschen dieses Muster
wiederverwenden statt eine dritte Regel-Kopie zu bauen.

**⚠ Kopfzeile/Sidebar sind NICHT mehr dunkel** - direkte Korrektur der
V401-Entscheidung, nachdem der Nutzer das Ergebnis gesehen hatte: "die
dunkel eingefaerbte Spalte links und die Zeile oben soll in dem gleichen
Grauton sein wie bei Assets die Hintergrundfarbe der Karten". Diese Karten
(`.rub-card`) nutzten `--bg3` = `#d7dbe0` - genau dieser Wert ist jetzt
FEST (nicht ueber die Variable) der Hintergrund von `.hdr`/`#navSidebar`.
Weil derselbe Ton nicht gleichzeitig als Kartenfarbe im Inhalt UND als
Chrome-Farbe auftauchen soll ("tausch dann auch ueberall im Inhalt wo
dieses Grau verwendet die Farbe aus durch ein helleres Grau"), wurde die
`--bg3`-VARIABLE selbst auf `#e3e6ea` (= `--bg1`) anghoben - das faerbt
automatisch alle ~60 Verbrauchsstellen (Buttons, `.rub-card`, Badges) im
Inhalt heller, ohne dass jede einzeln angefasst werden musste. Text/Icons
in Kopfzeile/Sidebar sind wieder normale helle-Theme-Tokens (kein
Weiss-auf-Dunkel-Override mehr noetig).

**Merksatz fuer den naechsten Farbwunsch dieser Art:** wenn ein Nutzer
"derselbe Grauton wie bei X" sagt, IMMER zuerst den echten Hex-Wert an X
nachschlagen (hier: `.rub-card{background:var(--bg3)}` → `#d7dbe0`) statt
zu schaetzen - der Unterschied zwischen "ungefaehr passend" und "exakt
derselbe Wert" ist bei einem expliziten Farbabgleich-Wunsch genau der
Punkt der Anfrage.

**⚠ Nachtrag Minuten spaeter (2026-08-21): "mach das grau aussenrum
deutlich dunkler".** Die eben beschriebene helle #d7dbe0-Angleichung war
also nur ein Zwischenschritt - der Nutzer wollte die Chrome-Flaeche
insgesamt kraeftiger abgesetzt sehen, nicht heller. Jetzt `#454b53`, ein
bewusst NEUTRALES dunkles Grau (kein Blau-/Navy-Stich wie beim ersten
Koyfin-Anlauf - der Nutzer sagte diesmal "grau", nicht "schwarz"). Text/
Icons in `.hdr`/`#navSidebar` sind dafuer wieder auf helle Tokens
umgestellt (`--t0` bis `--t3`, plus `--bg2`-`--bg5`/`--bd`/`--bd2` fuer
Buttons/Suchfeld/Profil-Kreis darin), Kontrast gegen Weiss nachgerechnet:
8.8:1. **Merksatz:** Farbentscheidungen bei einem laufenden `/goal` koennen
sich innerhalb derselben Sitzung mehrfach aendern, wenn der Nutzer das
Zwischenergebnis sieht und nachjustiert - das ist normales iteratives
Feinjustieren, kein Widerspruch zur vorherigen Entscheidung. Immer den
NEUESTEN expliziten Wunsch umsetzen, nicht die aeltere Begruendung
verteidigen.

## ⚠ WAECHTER: check/cards.js + zwei echte Layout-Funde (2026-08-21)

Nutzer-Wunsch per `/goal`: (1) Sidebar-Klick beim Ein-/Ausklappen darf
nicht gleichzeitig navigieren, (2) Performance-Check, (3) Karten sollen
rechts denselben Abstand haben wie links, (4) "stell durch eine NEUE
REGEL sicher, dass Text oder andere Elemente zu keiner Zeit den Rand der
Karte verlassen".

**Sidebar-Klick-Fix:** `pointerenter`/`focusin` klappt die Sidebar zwar
meist schon VOR einem Klick aus (Hover kommt zeitlich zuerst) - bei Touch/
Trackpad ohne echtes Vor-Hover oder einem sehr schnellen Klick reicht das
nicht. Fix: ein Capture-Phase-Click-Listener auf `#navSidebar` faengt den
Klick ab, SOLANGE `.nav-collapsed` gesetzt ist (`preventDefault`+
`stopPropagation`, bevor der Button-eigene `onclick` greift) und klappt
nur aus - navigiert nicht. Ein zweiter Klick (Sidebar jetzt ausgeklappt)
navigiert normal. Getestet per `dispatchEvent('click')` ohne vorheriges
Hover-Event (simuliert genau den Touch-Fall).

**⚠ Echter Layout-Bug gefunden, der Ursache fuer "Karten haben rechts
keine Luecke" war:** `#pageArea{display:flex;flex-direction:column}` und
`.pc`/`.body` (ihre Flex-Kinder) hatten kein `min-width:0`. Flex-Items
haben per Default `min-width:auto` (= "nie kleiner als der Content-
Minimalbreite") - ein breiter Chart (Rate-Probabilities-Track, inline-
block mit voller intrinsischer Breite) zwang dadurch `.pc`, `#pageArea`
UND `.app-shell` ueber den Viewport hinaus, obwohl der Chart selbst brav
in einem `overflow:hidden`-Viewport sass. Die ganze SEITE wurde dadurch
111px breiter als der Viewport und horizontal scrollbar - der rechte
Karten-Randabstand war schlicht nicht mehr sichtbar, weil man ihn erst
nach dem Wegscrollen gesehen haette. Fix: `min-width:0` auf `#pageArea`,
`.pc` UND `.body`. **Merksatz: bei JEDEM neuen `display:flex`-Container in
dieser App - ob Zeile oder Spalte - IMMER pruefen, ob seine Kinder
`min-width:0` (bzw. bei `flex-direction:row` `min-height:0`) brauchen,
sobald sie selbst wieder Inhalt mit intrinsischer Breite enthalten
koennten (Charts, lange Tabellen, `white-space:nowrap`).**

**⚠ Der bestehende `layout.js`-Waechter hatte genau diesen Bug NICHT
gefunden, obwohl er "Seiten-Ueberlauf" bereits prueft** - zwei eigene
Bugs im Waechter selbst:
1. Er maß `document.documentElement.scrollWidth`. `body` ist in dieser
   App `position:fixed` (verhindert iOS-Bounce-Scroll) - dadurch traegt
   KEIN Kind jemals zu `documentElement`s Scroll-Groesse bei, ganz gleich
   wie sehr es ueberlaeuft. Fix: direkt `document.body`/`.app-shell`/
   `#pageArea` messen.
2. Seine `TABS`-Liste hatte veraltete/falsche Ids (`fx` statt `cur`,
   `matrix` statt `mx`, `compare` statt `cmp`, `setups` statt `pairs`,
   ein nicht existierendes `research`) UND liess `edge`/`news`/`carry`
   komplett aus. `showTab()` schluckt eine unbekannte Id per try/catch
   still - der Test lief dadurch mehrfach auf dem zuletzt gueltigen Tab
   statt auf den gemeinten. **Merksatz: die Tab-Id-Liste in JEDEM
   `check/*.js` muss exakt `PAGE_IDS` aus `index.html` spiegeln - bei
   einer neuen Kategorie dort IMMER auch alle `check/*.js`-Dateien mit
   einer eigenen Tab-Liste durchgehen.**

**Neuer Waechter `check/cards.js`:** generalisiert `dashboard.js`s
bewaehrte Logik (Kartenrand-Ueberlauf, Text-vs-Text-Ueberlappung mit
Scroll-Clip-Ausschluss, Text-vs-eigenes-Element-Ueberlauf) von "nur
`#dashWidgets .dw` auf dem Dashboard-Tab" auf ALLE 17 Tabs und ein
breiteres Karten-Klassen-Set, PLUS eine neue Seiten-Ebene-Pruefung (Punkt
0, faengt genau den obigen Fund). Beim ersten echten Lauf sofort einen
zweiten, unabhaengigen Fund geliefert: EUR/CAD-Endpunkt-Labels im
"Implied policy path"-Chart (`termStructureCardHtml()`) ueberlappten sich,
wenn die eingepreisten Zinspfade zweier Notenbanken nah beieinander
liegen - keine Mindestabstand-Logik vorhanden. Gefixt nach demselben
Muster wie beim Rate-Probabilities-Mehrlinien-Chart (siehe Grundsatz oben
"Elemente duerfen sich NIEMALS so ueberlappen"): Endpunkt-Y-Werte sortieren,
von oben nach unten einen Mindestabstand (12px) erzwingen.

**Performance-Check (Playwright):** DOMContentLoaded ~320ms, alle 17 Tab-
Wechsel unter 220ms (meist <100ms), 20 aufeinanderfolgende Scroll-Events
(Sidebar-Auto-Einklapp-Listener) in 29ms ohne spuerbares Ruckeln, JS-Heap
17/30 MB - unauffaellig. Die einzigen Konsolen-Fehler waren
`ERR_TUNNEL_CONNECTION_FAILED` fuer externe FF-Kalender-Fetches - das ist
die dokumentierte Netzwerk-Einschraenkung dieser Sandbox (siehe "Daten &
Workflow" oben), kein echter Bug.

## ⚠ KOYFIN-FARBABGLEICH V2 + Klaerung per AskUserQuestion (2026-08-21)

Nutzer schickte ein zweites, deutlich detaillierteres Koyfin-Screenshot
(Laptop-Mockup: dunkle Kopfzeile+Sidebar mit "DASHBOARDS"-Abschnitt +
"+NEW"-Button + benannter "My Dashboards"-Liste, 4 weisse Panels mit
Kopfleisten-Toolbar-Icons) mit "so will ich das haben... frag mich so
lange bis du dir komplett sicher bist wie es die Regel sagst" - explizite
Berufung auf die 95%-Sicherheits-Regel. Der Screenshot buendelte mind. 4
Aenderungen unterschiedlichen Umfangs (Panel-Design, Drag/Resize/Close,
Chart-Zeichenwerkzeuge, Mehrfach-Dashboards) - deshalb 4 gezielte Fragen
per `AskUserQuestion` statt zu raten. Ergebnis, **bindend fuer diese und
kuenftige Sitzungen zu diesem Thema**:
- Umfang: **alle 17 Tabs**, nicht nur Dashboard.
- Tiefe: **nur Design/Farben** ("Mir geht es nur um das seiten leisten
  design und generell die Farben die dort benutzt wurden und die innen
  benutzt wurden") - AUSDRUECKLICH KEIN Drag/Resize/Schliessen(×) fuer
  Karten.
- Chart-Werkzeuge: **keine** neuen Zeichen-/Annotations-Icons.
- Mehrere Dashboards: **ja, neues Feature** - mehrere eigene benannte
  Dashboards wie Koyfins "My Dashboards" + "+NEW".

**Farb-Ergebnis:** die Chrome-Farbe (siehe Abschnitt "NAVIGATION/HEADER
V2" oben) ist am ECHTEN zweiten Referenzfoto nochmal nachgemessen worden -
das dort sichtbare Anthrazit ist NAHEZU SCHWARZ, deutlich dunkler als das
zuvor "geratene" `#454b53`. Jetzt `#14171c` (Kontrast 17.96:1 gegen
Weiss), per Playwright-Screenshot (Dashboard- und Assets-Tab, 1440px)
gegen die Referenz verifiziert - Kopfzeile/Sidebar/aktiver-Nav-Eintrag
sehen dem Foto jetzt sehr nah.

**⚠ `.dw` (Dashboard-Widgets) BEWUSST OHNE Koyfin-Kopfleisten-Hintergrund
gelassen - keine neue Iteration noetig.** `.rub-card`/`.cot-card` haben
bereits eine helle Kopfleiste (`--bg3`/`--bg4`-Gradient, siehe
`.rub-hdr`/`.cot-card-title`) und entsprechen damit strukturell schon
Koyfins Panel-Kopf. `.dw` hat das NICHT - aber das ist keine Luecke,
sondern eine bereits am 2026-07-25 explizit getroffene Nutzer-Entscheidung
("Keine Ueberschrift einfach so", siehe Code-Kommentar bei `.dw-hdr` in
`index.html`, "Minimaler Kartenkopf wie im Referenz-Foto"): der
Dashboard-Kartenkopf ist bewusst ein minimaler Kleinbuchstaben-Titel ohne
eigenen Hintergrundblock. **Bei einem kuenftigen "Karten sehen nicht
einheitlich aus"-Einwand zu `.dw` zuerst diese Entscheidung nachschlagen,
bevor sie neu aufgerollt wird** - dieselbe Vorsicht wie beim "Glow"-Punkt
im Abschnitt "wiederkehrende UI-Bausteine" oben.

**Merksatz zur 95%-Regel bei Bildreferenzen:** ein einzelner Screenshot
kann mehrere unabhaengige Aenderungswuensche gleichzeitig zeigen (hier:
Farben + Interaktion + neues Feature) - IMMER in einzelne Fragen zerlegen
statt den Umfang aus dem Bild selbst zu erraten, auch wenn "so will ich
das haben" pauschal klingt.
