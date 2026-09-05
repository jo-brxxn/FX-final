# Indikator-Datenquellen: Policy + PMI/Trading-Economics-Scraping

Referenziert von `CLAUDE.md`.

## Kommunikations-Grundsatz: nie schätzen → Dashboard-Meldung (Nutzer-Wunsch 2026-07-23)

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

## Allgemeine Daten-Grundsätze

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
  `MYFXBOOK_PASSWORD`, siehe Retail-Positionierung). Erst wenn eine
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

## Live-Status der acht Hintergrund-Feeds (`DATA_LIVE_OK`, 2026-08-25)

Bugreport: nach dem Privat-Stellen des GitHub-Repos luden Risk Sentiment und
Performance Ranking keine Daten mehr. Ursache: **alle zehn Live-Daten-JSONs**
laufen ausserhalb jedes Deploy-Mechanismus per anonymem `fetch()` direkt von
`raw.githubusercontent.com` (siehe `DATA_BASE`-Kommentar vor `const
DATA_BASE=...` in `index.html`) - das erfordert ein OEFFENTLICHES Repo, sonst
404. Details zur Produktionsadresse (Cloudflare Worker, nicht GitHub Pages):
`docs/workflow.md`.

Nutzer-Wunsch danach: "immer aktuelle Daten, nie veraltete" - bisher fiel ein
fehlgeschlagener Fetch komplett unter den Tisch, die App zeigte kommentarlos
den letzten synchronisierten Wert weiter. Jetzt trackt `DATA_LIVE_OK` (Objekt
bei `DATA_BASE`) fuer alle acht Quellen (`ind`/`bond`/`cot`/`sentiment`/
`price`/`news`/`risk`/`calendar`), ob der letzte Abruf DIESER Sitzung
erfolgreich war. `dataFeedStaleNotifyHtml()` zeigt bei mindestens einer
fehlgeschlagenen Quelle eine Dashboard-Notification-Karte (gleiches
`.stale-notify-card`-Muster wie `staleNotifyHtml()`/`awaitingNotifyHtml()`).
**Ersetzt bewusst KEINEN Wert** (Nutzer-Entscheidung: Warnung zusaetzlich,
nicht statt des alten Werts) - Cross-Device-Sync bleibt die einzige Quelle
ausserhalb der aktuellen Session, die alte Zahl ist echt, nur nicht mehr
live bestaetigt.

COT und Kalender haben je einen ZWEITEN, vom Repo unabhaengigen Live-Weg
(CFTC-Direktabruf bzw. FF-Live-Proxys) - `DATA_LIVE_OK.cot`/`.calendar`
spiegeln deshalb den finalen Erfolg NACH beiden Versuchen, nicht nur den
ersten DATA_BASE-Fetch.

**Ungeloest:** ein privates Repo bleibt damit weiterhin kaputt fuer diese
zehn JSONs - die Warnung macht es nur sichtbar, behebt es nicht. Echte
Loesung waere ein serverseitiger Proxy im Cloudflare Worker (der haelt einen
GitHub-Token als Secret und kann private Repos lesen) statt des anonymen
Client-Fetches - der Worker-Code liegt aber NICHT in diesem Repo (siehe
`docs/workflow.md`), kann also nicht von hier aus umgesetzt werden.

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

## ⚠️ Verlaufschart: die Reihe kommt aus DEMSELBEN Feed wie der Wert

Merksatz aus dem Bugreport 2026-09-02 (Details: `docs/CHANGELOG.md`):
**`ind.chartHist` ist NUR der Kalender-Pfad** — es wird ausschliesslich von
`adoptChartHist()` aus `ind_data.json` (`historyFull`) gefuellt. Ein
Indikator, dessen angezeigter Wert aus einem ANDEREN Feed stammt, bekommt
darueber nie einen Chart, egal wie lange man wartet.

Wer einen Indikator an eine neue Quelle haengt, muss deshalb BEIDES
anbinden — den aktuellen Wert und die Reihe. Fuer die Reihe ist
`indChartSeries(ind,symId)` (`js/main.js`) die eine Stelle; sie faellt der
Reihe nach zurueck auf:

| Quelle | Feld | Indikatoren |
|---|---|---|
| `ind.chartHist` | `historyFull` aus `ind_data.json` | Kalender-Indikatoren |
| `bond_data.json` | `[ccy][base].series` | 2Y/10Y Bond Yield |
| dieselben zwei Reihen | 10Y − 2Y je Tag | 2Y/10Y Spread |
| `cot_data.json` | `symbols[ccy].history` via `cotHistRowMetrics()` | COT long%/short%/WoW |
| `sentiment_data.json` | `series` bzw. `history` (AAII) | VIX, Fear&Greed, AAII |
| `ind.valHist`/`valDates` | lokal mitgeschriebene Releases | Kalender-Indikatoren mit noch kurzer `historyFull` |

Zwei Punkte, die dabei bewusst so sind:
1. **Abgeleitete Reihen werden NICHT in `ind.chartHist` persistiert.** Sie
   kommen bei jedem Laden frisch aus dem Feed; im `snap()`-Schnappschuss
   (Undo-Stapel UND Cloud-Sync) waeren es zehntausende Punkte extra.
2. **Ohne Reihe wird keine erfunden.** Kuratierte Einzelwerte
   (`IND_RESEARCH_DATA`) haben nur einen Stand — dort bleibt der Chart leer,
   mit einem Hinweistext, der genau das sagt (kein „baut sich auf", das dort
   nie eintritt). Undatierte Punkte aus `valHist` (Erstkontakt-Seeding, siehe
   `trackIndValues()`) zaehlen ebenfalls nicht: ohne echtes Release-Datum
   gibt es keinen Punkt auf der Zeitachse.

## Preisdaten: `price_data.json` liefert NUR Schlusskurse

`price_data.json` enthält je Asset `{source, invert, series:[[Datum, Close], …]}`
— **kein Open/High/Low**. Abgedeckt sind die acht FX-Währungen (über ihr
liquidestes USD-Paar, `invert:true` bei USD/XXX-Notierungen) plus GOLD, SILVER,
OIL, BTC, DAX, SP500 und NAS. Alles andere (Yields, GER100, Einzelaktien) hat
**keine** Reihe; der Preischart sagt das dort ausdrücklich, statt etwas zu
zeichnen.

**Daraus folgt für Kerzendarstellungen** (Regel seit 2026-09-05): Es gibt keine
echten OHLC-Kerzen und darf keine geben. Der Kerzenmodus des Preischarts
zeichnet **Close-zu-Close-Körper** (Vortagesschluss → Schluss) und hat deshalb
**keine Dochte** — die bräuchten High/Low und wären erfunden (Regel 4). Der
Modus heißt in der Oberfläche darum nicht einfach „Candles", sondern erklärt im
Titel, warum die Dochte fehlen.

## ⚠️ `ind.research.unit` ist eine ART, kein Suffix

`unit` ist ausschließlich `'count'`, `'level'` oder `'percent'` — eine
Klassifizierung für das Hinweis-Badge (`IND_UNIT_LABEL`), **kein anhängbares
Zeichen**. Wer es an einen Wert hängt, schreibt `115000count` in den Chart
(gefunden 2026-09-05 an den Event-Kärtchen des Preischarts, die dieselbe
Formatierung nutzen wie `indHistChart` — der Fehler steckte dort schon länger,
war nur nie sichtbar, weil die meisten Indikatoren gar kein `unit` tragen).

Ein echtes Suffix gibt es nur bei abgeleiteten Reihen; das liefert
`indChartSeries()` als `_cs.unit` (`'%'`). Zahlen selbst formatiert
`fmtIndVal(v, unit)`: ab 10.000 mit Tausendertrennzeichen, sonst auf zwei
Nachkommastellen gerundet — **keine** K/M-Abkürzung, die würde Stellen
verschlucken.
