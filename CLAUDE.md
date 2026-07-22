# FX Analyst Pro — Projektkonventionen

Die App ist eine einzelne `index.html` (HTML + CSS + JS in einem File).

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

Nach diesem Muster angebundene Felder (Stand 2026-07-07): `greenDismissed`,
`tabStacks`, `compactLevel` (+Legacy-Boolean `compactView`), `pinEnabled`,
`designHue` (Designer/🎨: null = Auto-Risk-Sentiment-Färbung der Aurora,
Zahl 0–360 = Nutzer-Farbton; beim Pull `!==undefined`-Check, damit auch
"zurück auf Auto" = null ankommt). **Ergänzt 2026-07-20** (Audit-Agent-Fund,
siehe Session-Eintrag weiter unten): `setupCcyFilter`/`setupFxOnly`
(Set-ups-Waehrungsfilter/FX-Quick-Filter), `calHighOnly`/`calCcyFilter`
(Kalender-Filter), `cmpCols` (Compare-Tab-Spaltenauswahl).

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
  verlassen). Siehe auch den bereits bestehenden `overflow:hidden`-Overlay-
  Merksatz weiter unten (Data-Dropdown/Header) — dieselbe Problemklasse
  (etwas rutscht hinter/unter/über etwas anderes), hier aber Labels/Tooltips
  statt Dropdown-Stacking-Context.
- **Score-/Asset-Karten**: kalmes Design statt Farbflut — Bias wird NUR über
  einen linken Rand-Streifen gezeigt (`.rub-card` 4px, `.ind-card`/
  `.pair-card`/`.sym-row` 3px) auf neutralem 1px-Rahmen, `glow-*`-Klassen
  setzen ausschliesslich `border-left-color`, keinerlei Hintergrund-Tint.
  **Kurze Episode 2026-07-20/21:** ein Hintergrund-Glow wurde probeweise
  ergaenzt (`.ind-card`/`.ri` hatten ihn durchs Farbaudit Runde 1 verloren,
  Nutzer wollte ihn zurueck — "ganz leicht und gleichmässig, nicht
  dynamisch"), dann auf Wunsch verstaerkt ("stärker"), dann nach einem
  Foto-Bugreport ("das schlecht geschrieben") komplett wieder entfernt
  ("mach den glow wieder aus") — Endstand ist wieder der urspruengliche
  reine Rand-Streifen, wie oben beschrieben. Bei einem kuenftigen erneuten
  "Glow zurück"-Wunsch: `background-image:linear-gradient(rgba(...,X),
  rgba(...,X))` auf den `glow-*`-Regeln (CSS-Kopf, ~Z. 184-207) ergaenzen,
  bewusst OHNE Transition/Animation (sonst pulsiert es) — aber vorher beim
  Nutzer nachfragen, ob wirklich alle Traeger (`.ab`/`.rub-card`/
  `.pair-card`/`.ind-card`/`.ri`/`.sym-row`/`.dw-chip`) gemeint sind oder
  nur ein Teil, da das in dieser Session mehrfach hin und her ging.

## ⚠️ META-GRUNDSATZ: jede dauerhafte Nutzer-Vorgabe gehört ins CLAUDE.md

**Nutzer-Wunsch 2026-07-12:** Alles, was der Nutzer als dauerhafte Präferenz
äußert (nicht nur einmalige Task-Anweisungen), muss direkt hier im CLAUDE.md
vermerkt werden — damit eine NEUE Session sofort weiß, wie der Nutzer es
haben will, ohne die komplette Chat-Historie erneut durchgehen zu müssen. Bei
Unsicherheit, ob etwas dauerhaft oder einmalig gemeint ist: lieber
dokumentieren als auslassen. Nach diesem Prinzip auch rückwirkend prüfen, ob
ältere Vorgaben aus dem Gespräch schon eingetragen sind, und fehlende
nachtragen (genau das ist der Auslöser für diesen Abschnitt gewesen).

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
- **VERSION-CHECK-Banner**: oben in `index.html` gibt es ein Banner
  `VERSION-CHECK: <FARBE> (<Beschreibung>)`. Bei **jeder** Änderung Farbe +
  Beschreibung ändern — auch bei reinen Workflow-(YAML-)Änderungen.
- **JS-Syntax-Check vor jedem Push** von `index.html`: `<script>`-Blöcke
  extrahieren, zusammenfügen, `node --check` laufen lassen. Für die Workflow-YAML
  zusätzlich `python3 -c "import yaml; yaml.safe_load(...)"` und das eingebettete
  Node-Skript via `node --check` prüfen.
- **Auf BEIDE Branches pushen**: zuerst `git fetch origin main` + `git merge
  origin/main`, dann Push auf `claude/chat-history-context-2uz60v` UND `main`.
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

## Session-Notizen (Stand 2026-07-04) — worauf achten

### Trend-Modell für Indikatoren (Design, in `index.html` bereits ausführlich
kommentiert ab ≈ Zeile 1584 `CORE_PAIRS`/`indIsHalfWeight` und ≈ Zeile 2684
`applyTrendModel`/`indTrendBias`/`indStepBias`)

- **Additiv, nie ein Ersatz.** Ohne Forecast: `ind.stepDriven` (1-Schritt-
  Vergleich actual≠previous, ±0,5 Basis, sofort verfügbar) UND zusätzlich
  `ind.trendDriven` (bestätigter 2-Schritt-Trend, +1 Bonus obendrauf, macht
  in Summe ±1,5). Bei Halbgewicht-Typen (`indIsHalfWeight`: Bond-Halbpunkt,
  COT-Netto, CB Tone, Core-Paar) ist der Bonus nur +0,5 → Summe ±1, NICHT 1,5.
  **Historischer Fehler:** Ich hatte das erst als Ersatz-Modell gebaut
  (`stepDriven` XOR `trendDriven`, 1/0,5 ODER 1,5/1) — der Nutzer hat das
  explizit korrigiert, es MUSS additiv sein. Bei jeder Änderung an diesem
  Modell zuerst die Kommentare ab Zeile 1584/2684 lesen, nicht aus dem Bauch
  heraus umbauen.
- `indBaseWeight`/`indTrendAdjMag` teilen sich bewusst `indIsHalfWeight` als
  gemeinsame Quelle — nicht wieder auseinanderziehen (Regression: Bonds
  bekamen sonst versehentlich den vollen ±1-Bonus statt ±0,5).

### COT-Trend + Investing.com-Forecasts + JPY CSPI (Stand 2026-07-05)

**COT-Indikatoren speisen jetzt das Trend-Modell** (Net Bullish/Bearish
Positioning, WoW Change — in `applyCotDataFeed`):

- Bewusst über den **`ind.trendBias`-Pfad wie bei den Bond-Renditen, NICHT
  über `stepDriven`** — sonst würde das Dominanz-Bias (>=60 % Long/Short)
  der Net-Indikatoren vom Step-Signal überschrieben. COT sind wie Bonds
  Marktdaten ohne Forecast-Konzept, keine Releases.
- Trend = Long%-Anteil der Spekulanten 2 Wochenreports in Folge gestiegen
  (bull) bzw. gefallen (bear), aus `COT_DATA.symbols[id].history` (26
  Wochen). Net Bullish + Net Bearish sind komplementär (Long%+Short%=100)
  und teilen sich als Paar je ±0,5 (zusammen ±1, wie ein Core-Paar), WoW
  zählt ±1 nur ab |Δ| ≥ 3 Prozentpunkten, kleinere Bewegungen ±0,5
  (`cotWowIsSmall` in `indIsHalfWeight`, Nutzer-Entscheid 2026-07-07). `ind.cotTrendPts` ([[Datum,Wert]×3], eigene Reihe je Indikator:
  Long% bzw. Short%) füttert Chip-Fortschritt (`cotTrendProgress`) und
  Trend-Modal (eigener COT-Zweig in `openTrendInfo`).
- Gilt wie das COT-Auto-Bias auch für Non-FX (COT-Rubrik ist nicht in
  `IND_AUTO_RUBS`, `resetNonFxIndBias` fasst sie nicht an).
- Per Playwright verifiziert: GBP Trend −0,5/−0,5/−1 (Karte −3,5), EUR
  neutral mit 1/2-Fortschritt, SP500 bull.

**Investing.com liefert jetzt ALLE Kalender-Events** (nicht nur PMI; PMI-
Zeilen tragen `mfg:true`, die Land+Zeit-Nähe-Konsumenten prüfen das Flag).
Damit zwei neue Nutzungen im ind_data-Schritt:

- **Fehlende Forecasts nachtragen** (TradingView führt für JPY CPI y/y+m/m,
  JPY Retail Sales, EUR CPI m/m, CAD Core CPI/PPI/GDP/Retail Sales, AUD
  PPI/Westpac, NZD Westpac keinen): Match über Währung + canonKey + Datum
  (max. 3 Tage) + **Actual-Gleichheits-Guard** (beide Actuals vorhanden →
  müssen numerisch übereinstimmen, sonst anderes Event). Einmal gefundene
  Forecasts bleiben über das VORHERIGE ind_data.json am Release kleben
  (`prevOut`-Carry-over) — das Investing.com-Fenster umfasst nur ~6 Tage,
  die Anreicherung greift also nur am Release-Tag selbst.
- **JPY Services Inflation (CSPI)** als neuer automatischer Feed-Eintrag
  direkt aus Investing.com (Actual+Forecast+Previous; TV-RULES lassen CSPI
  bewusst aus). Carry-over zwischen den Monats-Releases wie oben.

**canonKey wurde in ALLEN 4 Workflow-Kopien synchron erweitert** (final/
prel/preliminary/advance/index/national entfernt, "consumer sentiment" →
"consumer confidence") — nötig, damit Investing.com-Titel ("Westpac
Consumer Sentiment", "National CPI", "Retail Sales MoM Prel") gegen TV/FF-
Titel matchen. Die Kopien MÜSSEN synchron bleiben.

**Investing.com blockt intermittierend per Cloudflare:** am 2026-07-04
liefen 8/8 Läufe durch, am 2026-07-05 wurden 5/5 Requests (2 Läufe + 3
Retry-Versuche) mit einer ~6-KB-Challenge-Seite statt ~230 KB JSON
geblockt. Der Fetch macht jetzt bis zu 3 Versuche mit 20 s Pause und
validiert die Antwort (JSON-Anfang + >20 KB). Stündlicher Cron (24
Chancen/Tag) + Forecast-Persistenz gleichen Blocks aus — EIN erfolgreicher
Lauf im Release-Fenster genügt. Bei Problemen zuerst die
"[debug] invcal.json: N bytes (attempt X)"-Zeile im Job-Log prüfen.
Die Enrichment-Logik selbst lief in allen geblockten Läufen fehlerfrei
durch (0 filled/0 kept + STILL-WITHOUT-FORECAST-Report).

**Falle beim JS-Syntax-Check:** der frühere Einzeiler filterte den Skript-
INHALT auf `'src=' not in s` und übersprang damit still das große App-
Skript (das enthält `src=` in Template-Strings) — jahrelang wurde nur das
Banner-Skript geprüft. Korrekt: auf die Attribute des `<script>`-TAGS
filtern: `re.findall(r'<script((?:\s[^>]*)?)>(.*?)</script>', html, re.S)`
und `'src=' not in attrs`.

### Manufacturing PMI (S&P Global/HCOB) — 5. Quelle Investing.com umgesetzt (Stand 2026-07-04, Abend)

Investing.com-Kalender-AJAX (`Service/getCalendarFilteredData`, Request-Format
aus der investpy-Bibliothek reverse-engineered, siehe Schritt "Fetch alternative
actual sources" im Workflow) wurde als 5. Quelle ergänzt und funktioniert:
per workflow_dispatch bestätigt liefert sie den `actual` für **EUR, GBP, JPY,
CAD** (z. B. EUR Final Manufacturing PMI 51.4, GBP 52.5, JPY 54.8, CAD 53.0 —
vorher überall `null`). Zwei Stolpersteine dabei, falls das je wieder bricht:
- **Matching NICHT über `canonKey()`/exakten Namen** — Investing.com mischt
  Bank-Marke/Land in den Titel (z. B. "au Jibun Bank Japan Manufacturing PMI",
  "Judo Bank Australia Manufacturing PMI"), das trifft nie gegen FFs
  "Final Manufacturing PMI". Stattdessen matcht die investingcom-Quelle nur
  über Land + Zeit-Nähe (30 h Toleranz) + `ev.title` selbst ist ein
  Manufacturing-PMI-Titel (die Extraktion filtert vorher schon auf
  `manufacturing pmi`-Titel, siehe `isMfgPmi` in der Enrich-Stufe).
- **Datum kam aus dem `data-event-datetime`-Attribut der Event-Zeile selbst**,
  NICHT aus dem vorangehenden `theDay`-Header (dessen `id` tatsächlich am
  verschachtelten `<td>` hängt, nicht am `<tr>` — eine Regex, die das am
  `<tr>` sucht, matcht nie und jedes Datum fällt auf "heute" zurück; genau das
  ist beim ersten Anlauf passiert und hat 6 Testläufe gekostet, bis es per
  Raw-HTML-Dump auffiel).

**AUD/NZD bleiben ungeklärt**, aber aus Datengründen, nicht wegen der neuen
Quelle: AUD hatte im getesteten Zeitfenster gerade kein "AUD Manufacturing
PMI"-Event im rollierenden `ff_calendar.json`-Fenster (Investing.com hatte den
Wert, aber es gab kein Kalender-Event zum Andocken — sollte sich beim
nächsten Release-Zyklus von selbst klären). NZD trackt in FF nur den
"Business NZ PMI" (andere Quelle/anderer Indikator als S&P Global) — dafür
liefert Investing.com keinen passenden Wert, das ist keine Matching-Lücke,
sondern ein anderer Indikator.

### Markt-Sentiment (sentiment_data.json) — Stand nach Live-Verifikation (2026-07-11)

Contrarian-Stimmungs-Layer, Workflow-Schritt "Fetch market sentiment"
(continue-on-error, Carry-over, jede Quelle eigenes try/catch). Per
`workflow_dispatch`-Läufen verifiziert, welche Quellen aus GitHub-Actions-IPs
erreichbar sind:

- **Crypto Fear & Greed** (`api.alternative.me/fng/`) — ✓ zuverlässig, eigene
  Historie. Scort **BTC** (auch ETH, falls angelegt).
- **VIX** (TradingView-Scanner `CBOE:VIX`, wie price_data) — ✓ zuverlässig,
  Tagesschluss + Carry-over-Serie. Scort **SP500/NAS** (contrarian: ≥28
  Panik=bullish, ≤13 Sorglosigkeit=bearish).
- **Stock Fear & Greed** (CNN `production.dataviz.cnn.io`) — war am 08.07.
  per HTTP 418 geblockt, liefert seit 10.07. wieder Daten (der Block ist
  intermittierend; Carry-over überbrückt Lücken). Chart-only.
- **Retail-Positionierung** (Myfxbook Login-API) — ✓ seit 11.07. LIVE.
  Login via `MYFXBOOK_EMAIL`/`MYFXBOOK_PASSWORD`-Secrets; **die Session MUSS
  ROH (ohne URL-Encoding) in die Query** — mit encodeURIComponent kommt
  "Invalid session" (Token enthält Sonderzeichen, Myfxbook dekodiert nicht).
  Gefiltert auf gelistete Assets: 28 Major-Paare + XAU/XAG/BTC/US500/NAS100/
  USOIL (34 von ~186). Chart-only.
- **Put/Call Ratio** (OCC `marketdata.theocc.com/mdapi/daily-volume-totals
  ?report_date=YYYY-MM-DD`) — ✓ seit 11.07. LIVE, nach 5 Proberunden.
  **snake_case `report_date` ist der Trick** (camelCase `reportDate` → 400).
  Summe Calls+Puts über alle US-Optionsbörsen, Ratio=Puts/Calls, Serie am
  Report-Datum, bis 5 Tage Rückwärtssuche (Wochenende/Feiertage). Füttert
  auch den Net-Options-Flow-Chart. **Einmaliger Backfill (11.07.) hat 41
  Handelstage Historie nachgeladen** (12.05.–10.07., Wochenenden sauber
  ausgelassen) — der temporäre Workflow-Schritt dafür ist wieder entfernt;
  die reguläre stündliche Stufe trägt ab jetzt täglich einen neuen Punkt
  nach. **CBOEs freie Feeds sind endgültig tot**:
  delayed-quotes kennt kein `_PCC`/`_PC` (403), `totalpc.csv` ist ein bei
  2019-10-04 eingefrorenes Archiv (Stale-Guard im Skript verwarf sie korrekt),
  die daily-Seite ist eine reine Client-Shell ohne öffentlich erreichbare
  Endpunkte, TradingView-Scanner liefert `USI:PC`/`PCC` nie. Nicht wieder
  bei CBOE suchen. Chart-only (kein Score).
- **Put/Call Ratio PRO ASSET** (Nutzer-Wunsch 11.07., da OCC nur markt-weit
  ist) — ✓ LIVE für 13/14 gelistete Assets über liquide ETF-Optionsketten
  bei Yahoo Finance (`query1.finance.yahoo.com/v7/finance/options/{SYM}`).
  **Braucht seit 2023 Cookie+Crumb-Auth** gegen Yahoos Anti-Bot-Schutz (bekannt
  aus der `yfinance`-Bibliothek): erst `fc.yahoo.com` für den Cookie, dann
  `query2.finance.yahoo.com/v1/test/getcrumb` für den Crumb-Token, beides an
  die Options-Anfrage anhängen — ohne das kommt sofort ein leeres Ergebnis
  (kein Fehler, nur `expirations:0`). Proxy-Zuordnung: `UUP`=USD, `FXE`=EUR,
  `FXB`=GBP, `FXY`=JPY, `FXF`=CHF, `FXC`=CAD, `FXA`=AUD, `GLD`=Gold,
  `SLV`=Silber, `USO`=Öl, `IBIT`=BTC, `SPY`=S&P500, `QQQ`=Nasdaq. **NZD hat
  keinen etablierten Options-ETF**, bleibt aussen vor. In der App über
  `putCallByAsset` + Asset-Filter (Dropdown wie bei Retail Sentiment)
  abrufbar, Fallback bleibt die markt-weite OCC-Zahl.
  **Dünnes Volumen bei den FX-Proxys**: FXA/FXB/FXC/FXF/FXY/UUP handeln nur
  37–807 Kontrakte/Tag (live gemessen), während GOLD/SILVER/OIL/BTC/Index-ETFs
  vier- bis sechsstellig liegen — Tages-Ratios wie AUD 3.63 aus nur 37
  Kontrakten sind Ausreisser, kein echtes Signal. Deshalb ⚠-Kennzeichnung im
  Filter-Dropdown + Warnhinweis in der Karte unter 1000 Kontrakten/Tag.
  **Historie schwierig, aber nicht endgültig aufgegeben**: Yahoos Options-
  Endpoint liefert nur die aktuelle Kette, kein Datums-Parameter für
  historisches Volumen (anders als bei der markt-weiten OCC-Zahl, die
  tägliche Reports publiziert). Proberunde 11.07. bestätigte: OCC-Symbol-
  Endpunkte existieren nicht (404), OCCs `daily-volume-totals` ignoriert
  einen angehängten `symbol`-Parameter (bleibt markt-weit), CBOEs per-
  Symbol-Optionskette (`delayed_quotes/options/{SYM}.json`, funktioniert,
  3,5 MB Antwort) ist ebenfalls nur eine Momentaufnahme ohne Verlauf.
  **Barchart** gab bei der anonymen Anfrage 401 — das ist aber laut
  Nutzer-Grundsatz oben KEIN Abbruchgrund: der Nutzer legt bei Bedarf ein
  kostenloses Barchart-Konto an. **Nächster Schritt, falls erneut versucht
  wird**: Nutzer nach `BARCHART_EMAIL`/`BARCHART_PASSWORD`-Secrets fragen
  (Muster wie Myfxbook), Login-Flow bauen und testen, ob die kostenlose
  Stufe historische Put/Call-Daten pro Symbol freischaltet (typisch bei
  Freemium-Finanzseiten: oft nur ein kurzes rollierendes Fenster, nicht die
  volle Historie — das ist erst nach dem Login-Test sicher zu sagen). Bis
  dahin wachsen die Serien wie jeder neue Feed ab jetzt einen Punkt pro
  Handelstag.

Scoring nach dem `applyCotDataFeed`-Muster (`applySentimentFeed`,
`research.sent`-Flag, halbes Gewicht via `SENT_HALF`, KEIN Trend, nur an
Extremen nicht-neutral) — die Indikatoren leben in der COT-Data-Karte der
betroffenen Symbole (`SENT_MAP`). **Wichtig:** `SENT_MAP`/`SENT_HALF`/
`SENT_SOURCE` stehen bewusst FRÜH (bei `COT_NET_HALF` ~Z.1714), weil die
Rubrik-Migration `migrateRubInds` sie beim Boot schon braucht (sonst TDZ).
Chart-only-Namen ('Put/Call Ratio','Fear & Greed Index') stehen in
`RUB_IND_REMOVE['COT Data']`, damit sie nicht als leere Karten auftauchen.
Neuer Insights-Tab "Sentiment" (`renderSentiment`, `pgSent`), in den
Insights-Stack einsortiert (auch Migration für Bestandsnutzer in
`loadTabStacks`). VIX zaehlt bewusst NICHT zusätzlich zum Stock-F&G (steckt
dort schon drin) — VIX ist das einzige gescorte Index-Signal; Put/Call und
Retail sind bewusst Chart-only.

### Drei neue Anzeige-Ebenen (2026-07-12, Nutzer-Auswahl "2,3,4") — ALLE display-only, KEIN Score-Einfluss

1. **Saisonalität** (`seasonality_data.json`, Workflow-Schritt "Fetch
   seasonality", 1×/Tag Stooq-Langzeithistorie; Sandbox erreicht Stooq NICHT
   — Verifikation nur über committed JSON auf main): je Asset je Kalendermonat
   Ø-Return + Trefferquote über 15 Jahre. USD-first-Paare (JPY/CHF/CAD) werden
   im Workflow exakt invertiert (`(r0/r1-1)*100`). App: Insights-Tab
   "Seasonality" (`pgSeas`/`renderSeasonality`, Migration in `loadTabStacks`
   nach dem Sentiment-Muster), Info-Text via `SENT_INFO.seas` (generisches
   Sentiment-Info-Modal wird mitbenutzt).
2. **COT-3-Jahres-Perzentil** (`cot_data.json.pct3y`, eigener CFTC-Enrich-
   Schritt, läuft nur bei neuem `report_date`): Perzentil der aktuellen
   Netto-Positionierung in der eigenen 3-Jahres-Historie. UI: Spalte
   "3y %ile" in der COT-Vergleichstabelle + Hinweiszeile in der Einzel-
   Ansicht (`cotPct3yOf`/`cotPct3yCell`); erscheint NUR wenn
   `pct3y.report_date === cot report_date`, sonst komplett ausgeblendet.
3. **Korrelations-Matrix + realisierte Vol** (rein client-seitig aus
   `price_data`, Matrix-Tab, `renderCorrCard`): Pearson r der Log-Returns
   (bis 60 gemeinsame Tage, ehrlich ab 8 mit Tiefen-Ausweis in der
   Unterzeile — die price_data-Serie ist jung und wächst 1 Punkt/Tag),
   Diagonale = 20-Tage-Vol annualisiert.

### Bond-Yields-Backfill (GBP/CHF/JPY/AUD/NZD) — Endstand nach 7 workflow_dispatch-Runden (2026-07-04)

- **AUD (RBA) — GELÖST.** `https://www.rba.gov.au/statistics/tables/csv/f2-data.csv`,
  Tabelle F2 "Capital Market Yields - Government Bonds". 35 Tage Historie.
- **JPY (Japan MOF) — GELÖST.** `https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv`.
  Zwei Fallen: Shift-JIS-Encoding (→ `iconv -f SHIFT_JIS -t UTF-8`) UND das
  Datum ist NICHT gregorianisch, sondern japanische Nengo-Aera-Schreibweise
  (`R8.6.30` = Reiwa 8, 30. Juni = 2026-06-30; Reiwa 1 = 2019, also
  gregorianisches Jahr = Aera-Jahr + 2018). 35 Tage Historie.
- **GBP (Bank of England) — technisch integriert, aber ohne Mehrwert.**
  ZIP mit XLSX-Arbeitsmappen (`latest-yield-curve-data.zip`), Sheet-Auswahl
  über die einzige Tabelle mit monoton steigender Reifen-Kopfzeile 0.5→25+
  Jahre. Liefert nur 2 Punkte, weil die kostenlose BoE-Datei laut eigenem
  Dateinamen nur den LAUFENDEN MONAT enthält — das überschneidet sich mit dem
  ohnehin täglichen TradingView-Fetch und bringt keine zusätzliche Historie.
  GBP bleibt bei ~21-25 Tagen (löst sich wie ursprünglich prognostiziert von
  selbst binnen weniger Tage auf, unabhängig von der BoE-Integration).
- **CHF (SNB) — nicht lösbar, Quelle eingestellt.** Cube `rendoblid`
  (`data.snb.ch/api/cube/rendoblid/data/csv/en`) parst korrekt (Format
  `Date;D0;Value`, Laufzeit-Codes `2J`/`10J0`), aber die vom Cube selbst
  mitgelieferten Metadaten (`PublishingDate`) zeigen **2025-09-01**, letzter
  Datenpunkt **2025-07-31** — die Quelle wird seit ~11 Monaten nicht mehr
  aktualisiert. Kein Fix möglich ohne eine SNB-Ersatzquelle (noch nicht
  gesucht). CHF bleibt bei ~21-25 Tagen.
- **NZD (RBNZ) — keine funktionierende URL gefunden.** 3 Kandidaten probiert
  (`.../ReserveBank/Files/Statistics/tables/b2/hb2-daily.xlsx`,
  `.../project/sites/rbnz/files/statistics/series/b/b2/hb2-daily-close.xlsx`,
  `.../hb2.xlsx`) — alle liefern eine HTML-Fehlerseite statt XLSX. RBNZs
  Downloadstruktur scheint sich haeufig zu aendern; ohne Browser-Zugriff auf
  die aktuelle Serien-Seite nicht zuverlaessig zu finden. NZD bleibt bei
  ~21-25 Tagen.

Alle Backfill-Schritte laufen mit `continue-on-error: true` und ausführlichem
Debug-Logging (Byte-Größen, Kopfzeilen-Dumps, Diagnose-Zähler) — bei
zukünftigen Problemen zuerst `workflow_dispatch` + Job-Logs statt zu raten.

### Score-Logik-Analyse (2026-07-06) — Entscheidungen, nicht neu aufrollen

Komplette Score-Pipeline auditiert (Bias-Quellen → Gewichte → Trend →
Karte → Symbol → Paar). Endstand nach Nutzer-Korrektur:

- **CORE_PAIRS bleiben die klassischen Headline/Core-Paare** (CPI, PPI,
  PCE). Zwischenzeitlich hatte ich "CPI" (m/m) und NFP+ADP als Gruppen
  ergänzt — der Nutzer hat beides ZURÜCKGEWIESEN: "CPI m/m" existiert
  nicht als eigener Indikator (nur als Zweit-Link im CPI-Indikator), und
  NFP + ADP sind bewusst getrennte Indikatoren mit je voller ±1-Wirkung.
  NICHT wieder gruppieren. (Der Code kann Gruppen beliebiger Größe,
  `indGroupPartners` fürs Modal existiert weiter.)
- **Faire Vergleichsbasis statt roher Summen bei Symbol-Vergleichen**
  (Nutzer-Wunsch, weil USD mehr Indikatoren trackt als z. B. CHF):
  `symScoreCmp(sym) = symScore × (Ø-Indikatoranzahl der FX-Majors /
  eigene Anzahl)` — genutzt von `pairScore` (beide Seiten skaliert, dann
  Differenz + Carry) und dem Currency-Strength-Ranking. **Update
  2026-07-07 (Nutzer-Wunsch): der ANGEZEIGTE Symbol-Score ist jetzt
  ÜBERALL der Vergleichs-Score** (Sidebar, Detail-Badge, Globe,
  Symbol-Widgets, Risk-Zeilen, Heatmap, Matrix-Ranking, Set-ups-Liste,
  Weekly-Report-Snapshot). Die ±3-Auto-Bias-Schwelle wertet weiterhin
  die ROHE Summe aus (im Modal + Badge-Tooltip offengelegt) — diese
  EINE Stelle bleibt bewusst roh (Bias-Klassifikation, keine Anzeige-
  Zahl). Das Symbol-Modal zeigt beide Zeilen: "Raw sum of all
  indicators" und "Displayed score: raw × Faktor".
  **Update 2026-07-13 (Nutzer-Bugreport):** `recordScoreHist` (Score-
  Historie/Trends-Chart/"Today's Movers"), das `risk_sentiment`-Widget
  (Summenzeile + Aurora-Färbung) und der Flip-Alert-Text liefen noch auf
  roher Basis — dadurch konnte sich der angezeigte (Vergleichs-)Score
  eines Symbols ändern, OHNE dass die History das zeigte (z. B. NZDs
  Score verschob sich, weil sich `symCmpFactor` durch eine ANDERE
  Währung mit geänderter Indikatoren-Anzahl verschob, NZDs roher Score
  blieb aber gleich). Alle vier jetzt auf `symScoreCmp` umgestellt —
  ÜBERALL exakt derselbe angezeigte Wert, auf die Nachkommastelle genau.
  Die Bias-Flip-AUSLÖSUNG selbst (`scoreBias`/`recomputeAllSymBiases`)
  bleibt roh, nur die im Alert-Text angezeigte Zahl wurde umgestellt.
- Score-Modal (Klick auf jeden Score) zeigt: Zusammensetzung je Indikator,
  Gruppen-Hinweis, Release-Datum + Alter (amber >45 Tage), Comparison-
  Score-Zeile, aktive/gesamt Indikatoren, Paar-Skalierungs-Fußnote.
  Arithmetik-Quelle ist ausschließlich `indScoreParts` (indScore summiert
  nur) — Modal kann nie von der echten Rechnung abweichen.

BEWUSST NICHT geändert (mit Nutzer-Kontext, nicht heimlich "fixen"):
- **Magnitude-Blindheit** (0,01-Beat zählt wie Riesen-Beat): diskretes
  Modell ist Nutzer-Design; Skalierung bräuchte willkürliche Schwellen.
- **Alte Releases zählen weiter** (kein Zeit-Decay): Quartalsdaten sind
  legitim alt; stattdessen Alters-Anzeige im Modal.
- **Manuelles Bias ohne Forecast wiegt 1,0** (Step-Auto nur 0,5): bewusste
  Nutzer-Überzeugung zählt voll; im Modal sichtbar.
- Interest Rates ohne Trend, COT ohne Trend, Spread=0: Nutzer-Entscheide
  vom 05.07., stehen weiter oben dokumentiert.

### GitHub-MCP-Connector kann mitten in der Session die Verbindung verlieren

- Symptom: alle `mcp__github__*`-Tools verschwinden (auch per `ToolSearch`
  nicht mehr auffindbar), ein System-Reminder verlangt Reauth, Session ist
  non-interactive und kann den OAuth-Flow nicht selbst durchlaufen.
- In einem beobachteten Fall war die GitHub-App-Installation selbst
  nachweislich intakt (Permissions + Repository-Access auf GitHub.com korrekt
  konfiguriert) — das Problem lag an der Session-internen Connector-
  Verbindung, NICHT an der App-Autorisierung auf GitHub-Seite. Prüfen/
  Ändern der App-Konfiguration auf GitHub.com hat die Tools nicht
  zurückgebracht.
- **Was geholfen hat:** nicht versuchen, die bestehende Session zu reparieren
  (nicht möglich), sondern eine NEUE Code-Session für dasselbe Repo starten —
  die baut die Connector-Verbindung frisch auf.
- Falls das wieder passiert: dem Nutzer transparent erklären (nicht raten,
  was genau die Ursache war), eine neue Session vorschlagen, und NICHT blind
  ohne Verifikation an Workflow-Änderungen weiterarbeiten, die
  `workflow_dispatch`/Job-Logs zur Bestätigung brauchen.

### Geopolitics entfernt, Risk Environment neu (Nutzer-Wunsch 2026-07-13/14)

- Die eigenständige "Geopolitics"-Karte wurde bei ALLEN Assets entfernt
  (`stripGeopoliticsRub`, in `migrateRubInds`/`applySnap` eingehängt).
- `Macro & Risk Environment` heißt jetzt nur noch **`Risk Environment`**
  (`MACRO_NAME`), enthält nur noch genau 2 Indikatoren — `Risk Correlation`
  und `Geopolitics` (wieder da, aber innerhalb dieser einen Karte, nicht mehr
  als eigene Rubrik) — und steht als LETZTE Karte (`addMacroRub` pusht statt
  unshiftet; `ensureRiskEnvLast()` migriert Bestandsreihenfolgen einmalig).
- Dashboard-Regler (`riskEnvLevel`: 0=None/0.5=Half/1=Full) auf der
  Risk-Sentiment-Karte steuert automatisch den 5-stufigen Bias von
  `Risk Correlation` (strongly bullish/bullish/neutral/bearish/strongly
  bearish, ±2/±1/0 roh → durch `indIsHalfWeight` ±1/±0,5 Score-Wirkung).
  Zahnrad-Menü (`openRiskEnvCfgM`) legt PRO ASSET fest, wie es reagiert:
  **`bullish`** = wird bei riskantem Umfeld GUTGESCHRIEBEN (Safe Haven, z.B.
  USD/CHF/JPY/Gold), **`bearish`** = wird ABGEZOGEN (Risk Asset, alles
  andere), **`neutral`** = keine Reaktion (`RISK_ENV_DEFAULT_DIR`). **Nicht
  verwechseln mit "risk-on/risk-off"-Jargon** — die Richtung sagt NICHT "wie
  verhält sich der Markt", sondern direkt "wird dieses Asset bei viel Risiko
  besser oder schlechter bewertet". Zahnrad-Liste ist nach `SB_CATS`
  gruppiert (FX/Crypto/Metals/…) und innerhalb jeder Gruppe nach aktuellem
  Bias sortiert (bullish → neutral → bearish). Gespeicherte Szenarien
  (`riskEnvLists`, Name + Snapshot der `riskEnvCfg`) lassen sich anlegen,
  anwenden, löschen. Alle drei State-Variablen (`riskEnvLevel`, `riskEnvCfg`,
  `riskEnvLists`) sind Teil von `snap()`/`applySnap()` (Undo + Cloud-Sync).
  Sonntags-Erinnerung (`riskEnvRemindActive()`, unter der COT-Erinnerung,
  gleicher Stil, bleibt bis Montag/bis weggeklickt) erinnert daran, die
  Einstellung zu überprüfen; Klick springt zur Risk-Sentiment-Karte.

### Score-History-Bug: "History"-Karte zeigte falsche/zu viele Events (Bugreport 2026-07-15)

- Nutzer bemerkte in der Asset-"History"-Karte (🕰️-Button, `openHistModal`)
  Zeilen wie "CPI m/m: -1" an einem CPI-Release-Tag, obwohl sich der
  tatsächliche (Live-)Score dadurch gar nicht verändert hatte.
- Ursache: `symHistoryDays()` nutzte `isScoreDrivingEvent()` — ein reiner
  Namens-Regex-Match über ALLE Kalenderzeilen des Tages. Ein CPI-Release
  liefert aber oft mehrere Kalenderzeilen fürs selbe Thema (CPI m/m, CPI y/y,
  CPI s.a., Core CPI m/m, Core CPI y/y), die alle denselben Matcher treffen
  — die History-Karte zählte jede einzeln als eigenen ±1-Effekt, obwohl der
  echte Score pro Indikator-KARTE nur EIN Event zieht (`findIndEvent`, mit
  Perioden-Filter aus `stripPeriodSuffix`) und "CPI m/m" als Basisname "CPI"
  gar keinen eigenen `IND_EVENT_MATCHERS`-Eintrag hat, also nie automatisch
  bepreist wird.
- Fix: neue Funktion `symScoreDrivingEventsByDate(id)` iteriert stattdessen
  über die ECHTEN Indikator-Karten des Symbols (nur `IND_AUTO_RUBS`-Rubriken,
  nur FX — Nicht-FX wird von `syncIndicatorBiases()` ohnehin nie automatisch
  aus Kalender-Events bepreist) und holt sich über `findIndEvent(id,
  ind.name)` GENAU das Event, das auch die echte Karte bepreist — dieselbe
  Selektion wie im Live-Score. `symHistoryDays()` nutzt das jetzt für Anzeige
  UND Score-Rückrechnung. Bei einer Änderung an `IND_EVENT_MATCHERS` oder an
  `findIndEvent`/`stripPeriodSuffix` daran denken, dass `symHistoryDays()`
  genau diese Selektion spiegelt — nicht wieder auf einen losen Namens-Match
  zurückfallen.

### Indikator-Historie-Chart (Nutzer-Wunsch 2026-07-15)

- Neue, von `ind.valHist` (4-Punkte-Trend-Array, unverändert) komplett
  GETRENNTE Reihe `ind.chartHist` (`[Datum, actual, forecast][]`, bis zu 3
  Jahre) — befüllt über `adoptChartHist()` in `applyIndDataFeed()`. Workflow
  (`update-ff-calendar.yml`, Schritt "Fetch TradingView wide window for
  indicator values") lädt dafür schrittweise (max. 1 zusätzlicher 60-Tage-
  TradingView-Chunk pro Stunde, Fortschritt in `ind_data.json.
  _histChunksFetched`, Ziel 18 Chunks ≈ 3 Jahre) und mergt über den
  `prevOut`-Bestand (`historyFull` je Indikator), damit nichts verloren
  geht. CSPI ("Services Inflation") bekommt bewusst kein `historyFull", da
  es erst nach der Merge-Stelle konstruiert wird — akzeptierte Lücke.
- UI: `indHistChart(ind)` — Balken=Actual (mit Wert-Label), andersfarbige
  Linie=Forecast, Range-Filter `IND_HIST_RANGES` (3Y/2Y/1Y/6M/3M/1M, Default
  1Y). Erscheint (a) beim Ausklappen eines Indikators auf der Asset-
  Detailseite (`<details class="ind-data">`, nur wenn `chartHist.length>=2`)
  und (b) im neuen Insights-Tab **"Data"** (`renderDataTab`, Asset-Filter via
  `assetFilterSelect`, dann Indikator-`<select>` gruppiert nach den Rubriken
  DIESES Assets — unterschiedliche Assets zeigen automatisch unterschiedliche
  Listen, da direkt aus `sym.rubrics` gebaut).
- **Bug gefixt:** natives `<details>` hat keinen persistenten Open-Status —
  ein Klick auf einen Range-Filter-Button ruft `setIndHistRange()` →
  `renderDetail()` auf, was das gesamte `#detail`-Panel neu baut und damit
  das gerade geöffnete `<details>` wieder zuklappte (Buttons/Chart
  verschwanden mitten in der Interaktion). Fix: transientes (kein Sync, kein
  Undo) `indDetailsOpen{}`-Objekt, `<details ${indDetailsOpen[ind.id]?'
  open':''} ontoggle="indDetailsOpen['${ind.id}']=this.open">` — dasselbe
  Muster bei künftigen `<details>`-Elementen verwenden, die von einem
  inneren Klick aus neu gerendert werden können.

### Asset-Score-Historie (🕰️) widersprach dem Trends-Chart (Bugreport 2026-07-16)

- Nutzer bemerkte: die Score-Historie eines Assets (🕰️-Button,
  `renderSymHistoryPanel`) zeigte für vergangene Tage ANDERE Werte als der
  Trends-Chart für dasselbe Asset/dieselben Tage — beide sollten identisch
  sein.
- Ursache: `renderSymHistoryPanel` rechnete den Score pro Tag NICHT aus einer
  persistierten Historie, sondern rückwärts vom AKTUELLEN `symScore()` aus
  (`running`, pro Tag um den Netto-Effekt seiner Events reduziert). Sobald
  sich der heutige Score aus irgendeinem Grund änderte — auch aus Gründen,
  die mit den vergangenen Tagen selbst nichts zu tun hatten (z.B. `symCmpFactor`
  verschiebt sich, weil eine ANDERE Währung ihre Indikatorenzahl änderte,
  siehe die 2026-07-13-Notiz oben) — verschob sich die GESAMTE rückgerechnete
  Reihe, und vergangene Tage zeigten plötzlich andere Werte als vorher. Der
  Trends-Chart dagegen liest aus `scoreHist` (`recordScoreHist()`), das
  Einträge für vergangene Tage NIE nachträglich überschreibt (nur der
  heutige Eintrag wird aktualisiert) — daher der Widerspruch.
- Fix: `renderSymHistoryPanel` liest den Score pro Tag jetzt ebenfalls aus
  `scoreHist[id]` (Datum → Wert, dieselbe Quelle wie Trends) statt ihn
  selbst zurückzurechnen. Für "heute" (falls `recordScoreHist()` in der
  aktuellen Sitzung noch nicht gelaufen ist) Fallback auf den Live-Wert
  `symScoreCmp(sym)`. Tage ohne Eintrag in `scoreHist` (älter als die
  Aufzeichnung) zeigen bewusst "–" statt einen erfundenen Wert. Die Event-
  Liste pro Tag (welche Kalender-Events, Beat/Miss) bleibt weiterhin aus
  `symHistoryDays()`/`symScoreDrivingEventsByDate()` abgeleitet — nur die
  angezeigte TAGES-SCORE-ZAHL kommt jetzt aus `scoreHist`. Bei künftigen
  Änderungen an `scoreHist`/`recordScoreHist()` daran denken, dass die
  History-Karte davon direkt mitgespeist wird — nicht wieder eine eigene
  Rückrechnung einbauen.

### PPI (und andere) fehlten komplett in der Asset-History (Bugreport 2026-07-16)

- Nutzer bemerkte: PPI-Releases (mit echten Actual/Forecast-Werten, sichtbar
  auf der Indikator-Karte) tauchten nie in der Asset-"History"-Karte (🕰️)
  auf, obwohl sie den Score sichtbar bewegen.
- Ursache: **zwei parallele Live-Update-Pfade** pro Indikator, je nachdem was
  ForexFactory anbietet. (1) `findIndEvent()`/`calEvts` (FF-Kalender,
  `ff_calendar.json`) — trifft nur, wenn FF GENAU die vom Indikator erwartete
  Perioden-Variante führt (unser "PPI"-Indikator heißt intern "PPI y/y",
  `stripPeriodSuffix` verlangt also ein FF-Event mit y/y-Kennung). (2) sonst
  `applyIndDataFeed()` (`ind_data.json`/TradingView-Feed) → schreibt
  `ind.research` und setzt darüber **tatsächlich** den Bias
  (`ind.bias=researchBias(...)`). Für US-PPI führt FF nur "PPI m/m" (keine
  y/y-Zeile) — `findIndEvent()` findet deshalb NIE etwas, obwohl der
  Live-Bias die ganze Zeit über Pfad (2) korrekt lief. Die Indikator-Karte
  selbst (`renderInd`) hat für genau diesen Fall schon einen Fallback
  (`ev`-Zweig → `ind.research`-Zweig) — aber `symScoreDrivingEventsByDate()`
  (die History-Auswahl-Logik) hatte nur Pfad (1), keinen Fallback auf Pfad
  (2), und ließ PPI (und potenziell jeden anderen Indikator mit derselben
  Perioden-Diskrepanz) komplett unter den Tisch fallen.
- Fix: `symScoreDrivingEventsByDate()` fällt jetzt genau wie die Karte selbst
  auf `ind.research` zurück, wenn `findIndEvent()` nichts liefert — aber NUR
  wenn `ind.research.feed===true` (echter Live-Treffer, nicht die einmalige
  Erstbefüllung aus `IND_RESEARCH_DATA`) und `ind.research.date`/`.actual`
  gesetzt sind. Erzeugt ein synthetisches Event-Objekt (`name/date/actual/
  forecast/previous`) aus `ind.research`, das dieselben Downstream-Funktionen
  (`indBiasFromEvent`/`actualColor`) unverändert weiterverarbeiten. Bei
  künftigen Änderungen an `applyIndDataFeed()`/`ind.research` oder an
  `IND_EVENT_MATCHERS`-Perioden daran denken, dass History diesen
  Zwei-Pfad-Fallback exakt spiegeln muss — sonst fehlen wieder Indikatoren,
  bei denen FF und die interne Perioden-Erwartung auseinanderlaufen.

### Pro-UI-Update + neue Funktionen (Nutzer-Auftrag 2026-07-16 "mach alles")

Nach dem Komplett-Audit umgesetzt (VERSION-CHECKs 131/132):

- **SVG-Icon-Set statt Emojis (NEUE UI-REGEL):** `ICONS`/`icn(name,size)`
  (bei `escH`, ~Z.1840) ist das gemeinsame Inline-SVG-Icon-Set (Stroke-Stil,
  erbt currentColor). Alle BEDIEN-Buttons nutzen es (Header, Kalender-
  Toolbar + Zeilen-Glocke, Zahnrad/History/Refresh, Perioden-Badge).
  Bei neuen Buttons IMMER `icn()` verwenden, keine neuen Emojis einführen
  (Emojis in Info-TEXTEN/Karten-Titeln sind ok). Statisches HTML (Header)
  trägt dieselben SVG-Pfade direkt inline, da `icn()` dort nicht läuft.
- **Header konsolidiert:** Export/Import/Backups stecken in EINEM
  "Data"-Dropdown (`toggleDataMenu`/`#dataMenu`); Profil-Kreis zeigt
  Initialen des Sync-Namens (`updProfile`), ohne Sync ein Personen-SVG.
  Mobil (<760px): kompakter Header (kleiner Avatar ohne Namen) und
  VERSION-CHECK-Banner default EINGEKLAPPT (nur solange der Nutzer den
  Zustand nie selbst umgeschaltet hat — localStorage-Wert hat Vorrang).
- **Globale Suche:** Lupe im Header oder Taste "/" → `openSearchM()`;
  findet Assets, Indikatoren, Kalender-Events, Tabs (`searchEntries`),
  Pfeiltasten+Enter. Neue durchsuchbare Dinge dort ergänzen.
- **Preis-Alerts** (`priceAlerts`, Teil von `snap()`/Cloud-Sync wie
  `eventAlerts`): Set-ups-Tab → Glocken-Button → `mPriceAlert`-Modal
  (Ziel = angelegtes Paar oder Asset mit Preis-Serie, Richtung
  über/unter, Level). Client prüft bei jedem Preis-Refresh
  (`checkPriceAlerts` in `autoFetchPriceData`) und legt EINMAL eine
  Inbox-Nachricht ab (`a.notified`); der TELEGRAM-Versand läuft wie bei
  Event-Alarmen serverseitig in `event-alerts.yml` (liest `priceAlerts`
  aus fx_sync + `price_data.json` von main, invert-Logik exakt wie
  `priceSeriesFor`/`pairPriceSeries`, Dedup über `fx_alert_log`).
  Wichtig: fx_alert_log räumt nach 7 Tagen auf — ein nie gelöschter,
  weiter überschrittener Preis-Alert kann danach erneut senden (bewusst
  als Erinnerung akzeptiert).
- **CSV-Export** (`dlCSV(filename,header,rows)` bei `exportData`):
  Data-Tab (Indikator-Historie), COT-Tab (Positionierungs-Historie,
  `dlCotCSV`), Trends (`dlTrendsCSV`, Score-Historie aus `scoreHist`).
- **Matrix:** sichtbare Legende erklärt die Surprise-Notation (+1/2 …)
  direkt unter dem Ranking (Touch hat keinen Hover).
- **PWA war bereits komplett eingerichtet** (manifest.json, sw.js
  network-first, Icons, Registrierung) — nicht doppelt anlegen.

### Bond-Renditen fehlten komplett in der Asset-History (Bugreport 2026-07-17)

- Nutzer bemerkte: an einem Tag sank der USD-Tagesscore (History-Karte,
  🕰️) gegenüber dem Vortag, obwohl die einzigen gelisteten Events (Jobless
  Claims, Retail Sales) klar positiv/neutral waren — der Rückgang war durch
  nichts Sichtbares erklärt.
- Ursache: **dritte Live-Update-Quelle**, die der PPI-Fix vom Vortag noch
  nicht abdeckte. `applyBondDataFeed()` setzt `ind.bias` für 2Y/10Y Bond
  Yield JEDEN Tag direkt (aktueller Wert vs. Wert vor 15 Tagen, `aVal>pVal
  → bull`) — komplett ohne Kalender-Release. `ind.research` wird dabei zwar
  auch befüllt, aber bewusst OHNE `feed:true` (das Flag ist reserviert für
  den `applyIndDataFeed()`-Pfad). Der PPI-Fix (`symScoreDrivingEventsByDate`)
  prüfte nur `r.feed` als Fallback — Bond-Bias-Kipper blieben dadurch
  komplett unsichtbar in der History, obwohl sie den Score taeglich bewegen
  können.
- Fix: `symScoreDrivingEventsByDate()` fällt jetzt zusätzlich auf `r.bond`
  zurück. Da Bonds kein echtes Forecast haben, trägt das synthetische Event
  den 15-Tage-Vergleichswert (`r.previous`) als `forecast`-Feld, damit
  `actualColor()`/`indBiasFromEvent()` dieselbe Höher-ist-besser-Logik wie
  überall sonst anwenden (kein Treffer in `LOWER_IS_BETTER_RE`, also
  `a>f → bullish` — exakt `bondColor`s `aVal>pVal → bull`). Die Anzeige
  labelt das aber NICHT als "fc" (kein echter Forecast), sondern als
  "vs X (15d ago)" (`ev.bond`-Flag in `renderSymHistoryPanel`/
  `renderSymHistory`). **Merksatz für künftige Score-Quellen:** JEDE neue
  Stelle, die `ind.bias` automatisch setzt, MUSS auch in
  `symScoreDrivingEventsByDate()` einen Fallback bekommen — sonst wird sie
  in der History unsichtbar, obwohl sie den Score bewegt. Bisher drei
  Pfade: (1) `findIndEvent`/calEvts, (2) `ind.research.feed`, (3)
  `ind.research.bond`.

### Set-ups-FX-Filter, COT-Crowded-Badge, Dashboard-Scroll-Sprung, Trends-FX-Filter, Bias-eingefärbte Trend-Linien (Nutzer-Wünsche 2026-07-18/19)

- **Set-ups-Tab**: eigener "FX"-Filter-Button neben "All" (`setupFxOnly`,
  localStorage `fxpro_setup_fxonly`), zeigt nur reine FX-Paare
  (`isPureFxPair(name)`), kombinierbar mit den Währungs-Chips.
- **COT-Tab "⚠ CROWDED"-Badge**: schrumpfte auf ein 14×14px reines
  Icon-Badge (Text nur noch im `title`-Tooltip) + `.cot-bar-sym`-Spalte auf
  80px verbreitert + `white-space:nowrap` — vorher brach der Text bei
  3-stelligen Symbolen in eine zweite Zeile um und machte NUR diese Zeilen
  höher als die übrigen (Nutzer-Grundsatz "wiederkehrende UI-Bausteine
  einheitlich" oben gilt auch für Zeilenhöhen innerhalb einer Liste).
- **Dashboard-Scroll-Sprung beim Risk-Sentiment-Regler:** `renderDash()`
  ersetzt bei jedem Regler-Klick `#dashWidgets.innerHTML` komplett, was die
  Scroll-Position resettete. Der Bug-Ursache war NICHT `window.scrollY`/
  `window.scrollTo` (das ist in dieser App immer 0 — `body` hat
  `overflow:hidden;position:fixed`, das Fenster scrollt hier NIE), sondern
  der eigentliche Scroll-Container ist `#pgDash` (`.pc`-Klasse,
  `overflow-y:auto`). Fix: `#pgDash.scrollTop` vor dem `innerHTML=` merken
  und danach wiederherstellen, plus `document.activeElement.blur()` davor
  (iOS-Safari-Absicherung gegen Auto-Scroll bei Entfernen eines fokussierten
  Elements). **Bei künftigen "Seite springt beim Neu-Rendern"-Bugs zuerst
  `#pgDash.scrollTop` prüfen, nicht `window.scrollY`** — das App-Layout hat
  keinen scrollenden `body`/`window`.
- Regler-Reihenfolge umgedreht: **Full, Half, None** (von links nach
  rechts) statt vorher None/Half/Full.
- Regler-Änderungen (`setRiskEnvLevel`) landen jetzt im `scoreLog` (wie
  jede manuelle Bias-Änderung) und erscheinen dadurch in der Asset-History
  (🕰️) als "✏️ Risk Correlation: ◆ Neutral → ▲ Strongly bullish" o.ä.
- **Trends-Tab**: neue Option "💱 FX only" direkt unter "🌐 All assets" im
  Filter-Dropdown (`groupedAssetOptions` weiterhin für die einzelnen Asset-
  Optionen darunter) — zeigt wie "All assets" mehrere Linien gleichzeitig,
  aber nur die 8 FX-Majors statt aller gelisteten Assets. "vs Price"-Button
  bleibt wie bei "All assets" deaktiviert (mehrere Linien gleichzeitig,
  Preis-Overlay ergibt nur bei genau einem Asset/Paar Sinn).
- **Score-Verlauf in Bias-Farben statt fester Identitätsfarbe:** sobald der
  Trends-Chart auf GENAU EIN Asset/Paar gefiltert ist (nicht bei "All"/"FX
  only", da dort mehrere Linien pro Farbe unterscheidbar bleiben müssen),
  färbt sich die Total-Score-Linie (und die Score-Linie im "Score vs
  Price"-Chart) abschnittsweise in den Bias-Farben (`BC.bull/neu/bear`) —
  der Farbwechsel sitzt exakt am Tag des Bias-Flips, nicht verzögert.
  Zusätzlich erscheint ein Dreieck-Marker oben im Chart an jedem Tag, an
  dem der Bias neu auf bullish oder bearish kippt (nicht bei jedem Wechsel
  zurück auf neutral). Umsetzung: `recordScoreHist()` persistiert jetzt
  zusätzlich `sym.bias` als 6. Tupel-Element in `scoreHist[id]`
  (`[date,total,infl,labour,growth,bias]`) — alte Einträge ohne dieses
  Feld bleiben bewusst uneingefärbt statt einen Bias zu erraten. Gemeinsame
  Helfer `biasGroup(b)` (bildet `sbull`/`sbear` auf `bull`/`bear` ab) und
  `biasLineSegments(pts,topPad)` (zerlegt Punkte in Läufe gleicher
  Bias-Gruppe, zeichnet pro Lauf eine eigene `<polyline>` — überlappend am
  Laufübergang, damit die Linie nicht optisch abreißt — und die
  Dreieck-`<polygon>`-Marker nur an echten Bull-/Bear-Einstiegen) werden
  von `scoreTrendChart()` UND `scoreVsPriceChart()` genutzt.
  **Paar-Modus hat keine persistierte historische Bias** (Diff-Reihen leben
  nur in `trendsEphemeral`, nie in `scoreHist`) — dort wird ersatzweise
  `scoreBias()` direkt auf den historischen Diff-Wert angewendet, exakt
  dieselbe Formel/Schwelle, die auch die bisherige (nicht-historische)
  Live-Farbe der Paar-Linie verwendet (`BC[scoreBias(pairScore(pairKey))]`
  in `renderTrendsPair`) — das ist eine Erweiterung einer bereits
  akzeptierten Näherung auf die ganze Reihe, keine neue Schätzung.
- **Kerzen ohne Docht für den Preis (Nutzer-Korrektur 2026-07-19):** der
  ursprüngliche Candlestick-Refusal ("keine OHLC-Daten vorhanden") war zu
  pauschal — ein Docht braucht High/Low, der KÖRPER einer Kerze aber nur
  Open+Close. Da `price_data.json` einen fortlaufenden Tagesschlusskurs
  liefert, ist "Open" eines Tages schlicht der Schlusskurs des VORTAGS —
  keine erfundene Zahl, sondern derselbe Wert, der ohnehin schon im Datensatz
  steht. `scoreVsPriceChart()` zeichnet den Preis deshalb jetzt als
  Kerzen-Körper OHNE Docht (`<rect>` von `yOfPrice(min(prevClose,close))`
  bis `yOfPrice(max(...))`, `var(--green)`/`var(--red)`/`var(--t3)` bei
  gestiegen/gefallen/unverändert — dieselbe Farbkonvention wie das Carry-
  Differential in `openCarryDetail`). Der erste Tag einer Serie hat keine
  Kerze (kein Vortageswert verfügbar). Kein neuer Workflow-Schritt nötig.
- **Flip-Dreiecke nur noch im "vs Price"-Chart** (Nutzer-Korrektur
  2026-07-19): `scoreTrendChart()` (reine Score-Linie, Total Score /
  Inflation / Labour / Growth) behält die Bias-Farbsegmente, zeichnet aber
  KEINE Dreieck-Marker mehr — die tauchen jetzt ausschließlich in
  `scoreVsPriceChart()` auf. `biasLineSegments()` liefert weiterhin beides
  (`lines`+`triangles`) zurück, `scoreTrendChart` verwirft `seg.triangles`
  einfach.
- **Paar-Filter wählt jetzt DIREKT ein Paar** (Nutzer-Korrektur 2026-07-19):
  vorher zwei Selects (Basis- + Kurswährung einzeln), jetzt EIN Dropdown
  (`#trendsPairSel`/`trendsPairSel`-State, ersetzt `trendsPairBase`/
  `trendsPairQuote`) mit dem bestehenden kanonischen `ALL_PAIRS`
  (dieselbe Liste wie im "Add Pair"-Modal, 28 FX-Kreuze + 7 Non-FX/USD-
  Paare, gruppiert "FX Pairs"/"Other Assets" wie beim Retail-Sentiment-
  Filter). Nicht-FX-Paare nutzen Kürzel (`XAU`,`XAG`,`WTI`) statt interner
  IDs — `renderTrendsPair()` übersetzt über das bestehende
  `PAIR_CODE_TO_ID`-Mapping (`XAU→GOLD` usw., schon vorher für
  `pairScore()`/`autoPairBias()` genutzt) auf die echten Asset-IDs für
  `scoreHist`/`resolvePairPriceSeries`/`FX.includes`-Zugriffe, behält aber
  den Anzeigenamen (`XAU/USD`) für `pairScore()`/`trendsEphemeral`/die
  Kartentitel bei.
- **Bugfix (Nutzer-Bugreport 2026-07-19, selber Tag):** bei Einzelassets war
  die Bias-Einfärbung nur am aktuellen (heutigen) Tag sichtbar, alle
  älteren Punkte blieben orange/neutral — weil `recordScoreHist()` den Bias
  erst ab dem Tag der Feature-Einführung mitspeichert (Index 5), ältere
  `scoreHist`-Einträge haben ihn nicht. Der Fallback (`scoreBias(v)` auf
  den historischen Wert selbst) war zuvor nur für Paar-Diff-Reihen aktiv
  (`id.includes('/')`), nicht für einzelne Assets. Fix: Fallback in
  `scoreTrendChart()` gilt jetzt für JEDEN Total-Score-Datenpunkt ohne
  persistierten Bias (`vi===1`, unabhängig davon ob Asset oder Paar), und
  `renderTrends()` baut die `biasMap` für den vs-Price-Call jetzt genauso
  mit `e[5]||scoreBias(e[1])`. Kein Raten eines neuen Werts — nur
  Klassifikation eines bereits bekannten, echten historischen Scores über
  dieselbe Schwelle, die auch live gilt.
- **Kerzen-Kontrast + Dreiecke ganz entfernt (Nutzer-Korrektur 2026-07-19,
  selber Tag):** die Kerzen (grün/rot, `var(--green)`/`var(--red)`) trafen
  bei gleicher Kursrichtung farblich exakt die Bias-Farbe der Score-Linie
  (`BC.bull` ist buchstäblich derselbe Hex-Wert wie `var(--green)`) — die
  Linie verschwand optisch in gleichfarbigen Kerzen. Fix in
  `scoreVsPriceChart()`: Kerzen jetzt gedämpft (`opacity:0.42`, vorher
  0.88) UND in voller Slot-Breite (`width:PD`, keine Lücken zwischen
  Kerzen mehr) UND VOR der Score-Linie gezeichnet (SVG-Zeichenreihenfolge
  = Stapelreihenfolge, spätere Elemente liegen oben); die Linie selbst ist
  jetzt dicker (`stroke-width:3` statt 2.4) und bekommt einen dunklen
  Kontrast-„Kasar" (`biasLineSegments(pts,halo)`-Parameter: zeichnet vor
  der farbigen Linie eine breitere `var(--bg0)`-Linie bei 0.7 Opazität) —
  bleibt dadurch IMMER lesbar, unabhängig von der Kerzenfarbe darunter.
  **Flip-Dreiecke wurden komplett entfernt** (auch aus dem vs-Price-Chart,
  wo sie zuvor als einziger Ort noch erlaubt waren) — `biasLineSegments()`
  gibt nur noch die Linien-SVG-Strings zurück, keine Dreiecke mehr; bei
  Bedarf müsste diese Funktionalität komplett neu gebaut werden, nicht nur
  wieder freigeschaltet werden.

### Header-Dropdown "Data" verschwand teilweise hinter der Tab-Leiste auf Mobil (Bugreport 2026-07-19, per Foto)

- Nutzer-Screenshot zeigte: im ausgeklappten "Data"-Menü (Export JSON /
  Import JSON / Backups) war die MITTLERE Zeile ("Import JSON") von einem
  dunklen Balken komplett verdeckt, obere und untere Zeile blieben lesbar.
- Ursache: `.hdr` (Header-Leiste) hat `backdrop-filter:blur(18px)` — das
  erzeugt einen EIGENEN CSS-Stacking-Context. Das `#dataMenu`-Dropdown lag
  als statisches Kind darin mit `z-index:300`, aber dieses z-index wirkt
  NUR innerhalb von `.hdr`s eigenem Stacking-Context, kann also nicht über
  `.hdr`s spätere Geschwister-Elemente im DOM hinausragen. `.tabbar` (die
  Dashboard/FX/Non-FX/…-Leiste direkt unter dem Header) hat EBENFALLS
  `backdrop-filter` (eigener Stacking-Context) und kommt im DOM NACH
  `.hdr` — malt sich dadurch immer über `.hdr`s gesamten Inhalt drüber,
  z-index hin oder her. Reicht das 3-zeilige Dropdown auf dem kompakten
  Mobil-Header (kleinerer Header, siehe oben) über die Kopfzeile hinaus in
  den `.tabbar`-Streifen hinein, verschwindet genau die Zeile, die dort
  liegt — reproduzierbar per Playwright bestätigt (`overlapsTabbar:true`
  vor dem Fix, Klickziel-Element an der "Import JSON"-Position war die
  Tabbar, nicht der Button).
- Fix: `#dataMenu` wird jetzt genau wie das Stack-Tab-Dropdown
  (`openStackMenu`, dasselbe Muster) dynamisch per `document.body.
  appendChild()` erzeugt, mit `position:fixed` und `z-index:100001`
  (identisch zu `.tab-menu`) — dadurch lebt es AUSSERHALB von `.hdr`s
  Stacking-Context und kann von keinem späteren Geschwister-Element mehr
  verdeckt werden. Position wird aus `getBoundingClientRect()` des
  "Data"-Buttons berechnet (rechtsbündig, wie vorher optisch). **Merksatz:
  jedes Dropdown/Overlay, das aus einer `backdrop-filter`-Leiste (`.hdr`,
  `.tabbar`, `.sb`) herausragen könnte, MUSS nach diesem Muster gebaut
  werden (`document.body.appendChild` + `position:fixed`), ein simples
  `z-index` auf einem statischen Kind-Element reicht nicht.**

### Bias-Linie zeichnete sich in einzelnen Stücken statt als ein Sweep (Nutzer-Korrektur 2026-07-19, selber Tag)

- Die mehrfarbige Bias-Linie besteht technisch aus mehreren `<polyline>`-
  Elementen (einer je zusammenhängendem Bias-Abschnitt, siehe
  `biasLineSegments()`). Die alte Zeichnen-Animation (`.tr-line-in`,
  `stroke-dasharray:1` + `stroke-dashoffset` 1→0 über 0.9s) lief auf JEDEM
  dieser Stücke UNABHÄNGIG — jedes Stück "zeichnete sich" in denselben
  0.9s von 0 auf 100% SEINER EIGENEN Länge, unabhängig von den Nachbar-
  Stücken. Ergebnis: statt einem einzigen durchgehenden Links-nach-rechts-
  Sweep (wie vor der Bias-Einfärbung, als es nur EIN `<polyline>` pro Linie
  gab) wirkten die einzelnen Bias-Abschnitte wie separat/durcheinander
  auftauchende Teile.
- Fix: neue Klassen `tr-line-fade`/`tr-halo-fade` (einfaches synchrones
  Opacity-Fade, `@keyframes trFadeIn`/`trHaloFadeIn`, kein
  `stroke-dashoffset`) ersetzen `tr-line-in` NUR für die Bias-Segment-
  Polylines in `biasLineSegments()` — alle Stücke erscheinen jetzt
  gemeinsam/gleichzeitig. Die eigentliche `tr-line-in`-Zeichnen-Animation
  bleibt unverändert für alle EINZEL-Polyline-Faelle (z.B. "All assets"/
  "FX only" Mehrfarben-Charts, die nicht-bias-eingefärbte Score-vs-Price-
  Linie) — dort gab es das Problem nie, weil dort nur ein durchgehendes
  `<polyline>` existiert.
- **Nutzer-Korrektur 2026-07-19 (später am selben Tag):** Kerzen waren nach
  der "weniger stark + keine Lücken"-Änderung zu blass/zu breit geworden.
  Zurückkorrigiert auf Deckkraft 0.68 (statt 0.42) und Breite `PD*0.6`
  (statt volle Slot-Breite `PD`) — klassischerer Kerzen-Look mit sichtbarer
  Lücke zwischen den Kerzen, aber kräftiger als das Original vor der
  ersten Anpassung (0.88). Die Score-Linie bleibt trotzdem immer lesbar
  (dicker + dunkler Kontrast-Rand, s.o.), unabhängig von der Kerzenbreite.

### "CB Consumer Confidence" zeigte bullish trotz klarem Miss (Bugreport 2026-07-19)

- Nutzer-Screenshot: Actual 91.2, Forecast 94.7, Previous 93.1 — eindeutig
  ein Rückgang UND ein Miss gegen Forecast, trotzdem stand der Bias-Badge
  auf ▲ (bullish).
- Ursache: **vierter Score-treibender Pfad**, den frühere Fixes (PPI/Bonds,
  Session-Notizen oben) noch nicht abdeckten — diesmal keine fehlende
  History-Anzeige, sondern ein tatsächlich FALSCHER `ind.bias`-Wert selbst.
  `applyIndDataFeed()` (der `ind_data.json`/TradingView-Feed-Pfad, den u.a.
  GDP/PMI/Retail Sales/Consumer Confidence nutzen) hatte einen "nichts
  geändert"-Frühausstieg (`if(r.feed&&r.actual===na&&r.forecast===nf&&...)
  return;`), der die Bias-Neuberechnung IMMER mit übersprang, sobald sich
  die Feed-Werte seit dem letzten Lauf nicht mehr änderten. War `ind.bias`
  aus IRGENDEINEM Grund einmal falsch (z.B. ein Bug in einer früheren
  Code-Version zum Zeitpunkt der Erstverarbeitung dieses Release, der seither
  gefixt wurde, aber dessen falsches Ergebnis im gespeicherten State
  hängen blieb), konnte sich das nie mehr von selbst korrigieren — der
  Guard fror die Diskrepanz zwischen echten Daten (korrekt angezeigt in
  der Karte, da direkt aus `ind.research`) und Bias (falsch, aus
  `ind.bias`) dauerhaft ein. Playwright-Reproduktion: `ind.bias='bull'`
  erzwingen, `applyIndDataFeed()` erneut aufrufen → blieb VORHER bei
  `'bull'` stehen, obwohl `researchBias()` mit denselben Daten `'bear'`
  berechnet.
- Fix: Bias wird jetzt bei JEDEM `applyIndDataFeed()`-Lauf unconditional
  mit den aktuellen Feed-Werten neu berechnet (`researchBias(base,na,nf,
  np)`, Vergleich mit dem bestehenden `ind.bias`) — VOR dem "nichts
  geändert"-Frühausstieg, nicht mehr danach. Idempotent (stimmt der Bias
  schon, passiert nichts, kein zusätzliches `changed=true`) und
  selbstheilend (stimmt er nicht, wird er repariert). Per Playwright
  bestätigt: dieselbe erzwungene Diskrepanz heilt jetzt beim nächsten Lauf
  zurück auf `'bear'`, und ein dritter Lauf mit bereits korrektem Bias
  liefert weiterhin `changed:false` (kein unnötiger Save/Cloud-Push bei
  jedem stündlichen Poll). **Merksatz:** anders als der `syncIndicatorBiases()`-
  Pfad (calEvts, hält einen manuellen Klick bewusst bis zum nächsten ECHTEN
  Release über `ind.autoEvId`-Tracking) hat der `applyIndDataFeed()`-Pfad
  kein explizites "manuell überschrieben"-Flag — sein "nichts geändert"-Guard
  war rein eine Update-Optimierung, keine bewusste Manual-Override-Funktion.
  Bei zukünftigen Bugs dieser Art (Karte zeigt korrekte Zahlen, Bias-Badge
  widerspricht ihnen) zuerst prüfen, ob die Bias-Neuberechnung versehentlich
  hinter einem "nichts geändert"-Frühausstieg hängt.

### Farbaudit Runde 1: weniger Vollflächen, gedämpftere Palette (Nutzer-Wunsch 2026-07-19)

Nutzer-Auftrag: "Website wirkt zu bunt/wie eine Hobby-Seite, soll professioneller
aussehen, Bedeutung der Farben aber erhalten bleiben." Ein Opus-Agent hat die
App per Playwright-Screenshots (Desktop+Mobile, alle Kern-Tabs) + Code-Grep
auditiert und 7 priorisierte Vorschläge geliefert — alle umgesetzt:

1. **`TREND_COLORS`** (≈ Z. 8836, Trends-Tab "All assets"/"FX only"): von 14
   vollgesättigten Regenbogenfarben (kollidierten teils mit den Bias-Farben,
   z. B. USD-Blau ≈ `BC.bull`-Blau) auf eine gedämpfte, einheitliche Palette
   (gleiche Lightness/Sättigung, nur der Hue unterscheidet) umgestellt.
2. **Score-/Rank-Balken**: `.rank-bar` (Currency-Strength-Widget),
   `.mx-rank-bar` (Matrix-Tab), `.risk-asset-bar` (Risk-Sentiment-Widget) —
   alle vorher `background:${BC[bias]}` als Vollfläche, jetzt zusätzlich
   `opacity:.6` in der CSS-Klasse (nicht inline, wirkt dadurch überall
   einheitlich).
3. **COT-/Net-Options-Flow-/Seasonality-Balken**: `.cot-bar-long`/
   `.cot-bar-short` (COT-Tab, waren `opacity` los), die Balken in
   `renderNetFlowChart()` (0.9→0.6) und `seasBarChart()` (0.8→0.6 für
   Nicht-aktuelle Monate, aktueller Monat bleibt bei .92 als bewusster
   Hervorhebung) auf gedämpfte Deckkraft.
4. **Dashboard-Banner** ("New COT Data!", "Check Your Risk Environment",
   `.cot-notify-card`/`.risk-env-notify-card`): von vollflächigem
   Farbverlauf (Blau bzw. Lila) + starkem Pulse-Glow auf neutralen
   `--bg2`-Grund + 4px farbigen linken Rand-Streifen (dieselbe Konvention
   wie `.rub-card`) umgestellt; Text/Icon tragen die Akzentfarbe, der
   Pulse-Schatten ist deutlich schwächer (0.1→0.25 statt 0.35→0.6 Alpha).
5. **Retail-Sentiment-Symbol-Pills** (`renderRetailBars()`): das Symbol-Tag
   (z. B. "NAS100") war ein vollfarbig gefüllter Chip mit weißer Schrift,
   jetzt getönter Chip nach `ticker-chip`-Muster (Rand 27%, Grund 8%,
   Text in voller Farbe) — Long/Short-Split-Balken daneben ebenfalls auf
   `opacity:.62`.
6. **Logo + Profil-Kreis** (`.logo`, `.profile-circle`): vorher
   `linear-gradient(135deg,var(--blue),var(--purple))` als Text- bzw.
   Flächenfüllung, jetzt einfarbig (`var(--t0)` bzw. `var(--bg5)` mit
   `--bd2`-Rahmen) — reines Deko-Element, kein Bedeutungsverlust.
7. Bewusst NICHT angefasst: der Bias-Randstreifen selbst und die
   Kalender-Impact-Farben (High/Medium) — dort trägt Farbe echte,
   dichte Information.

**Runde 2 angestoßen** (Nutzer-Feedback nach Foto: "sieht aus wie ein
Video-Spiel, nicht professionell") — ein zweiter Opus-Agent prüft
zusätzlich Formsprache/Rundungen, Schatten/Glow-Effekte, Animationen,
das 3D-Globus-Widget, Typografie/Emoji-Nutzung und Iconographie auf
"Gadget/Spiel"- vs. "professionelles Analyse-Tool"-Wirkung.

### Professionalitäts-Audit Runde 2: kein "Video-Game"-Eindruck mehr (Nutzer-Wunsch 2026-07-19)

Der zweite Agent kam zum Schluss: der "Video-Game"-Eindruck kam NICHT von
den Farben (Runde 1 schon erledigt), sondern von bewegter Ambient-Grafik,
verspielter Motion, Emoji statt Icons und einer Badge-/Pill-Flut. Alle
8 Vorschläge umgesetzt (bis auf einen bewusst nur teilweise, siehe unten):

1. **Aurora-Hintergrund** (`.dash-aurora`/`.aurora-blob`): die drei endlos
   driftenden Farbwolken (`auroraDrift1-3 … infinite`) sind jetzt statisch
   (keine `animation` mehr) und deutlich dezenter (`opacity` 0.28→0.1) —
   trägt weiterhin die Risk-Sentiment-Färbung (`updateAuroraColors()`).
2. **Globus nicht mehr Dashboard-Hero**: `DASH_V` auf 5 erhöht, neue
   `migrateDash()`-Rangfolge stellt `ccy_ranking` an Position 0 und
   `globe` ans Ende (Position 8) — greift auch bei Bestandsnutzern
   automatisch beim nächsten Laden (derselbe Versions-Mechanismus wie
   jede vorherige Dashboard-Schema-Änderung). `mkWidgets()` (Default für
   neue Nutzer) entsprechend mit angepasst.
3. **Verspielte Motion beruhigt**: `flipScorePulse`/`scorePop` hatten
   Overshoot (`scale(1.35-1.4)`) — jetzt kein Überschwingen mehr
   (`scale(1.06-1.08)`, `ease-out` statt Bounce-Kurve). `flipGlowSweep`
   deutlich schwächer (`16px 3px`→`8px 1px`). Endlose Puls-Animationen
   komplett entfernt (nicht nur abgeschwächt): `.green-alert-wrap.ga-many
   .green-alert-icon` und `.inbox-badge` (vorher `pulse-badge … infinite`)
   sowie die beiden Dashboard-Banner (`cotNotifyPulse`/
   `riskEnvNotifyPulse`) — statischer Schatten reicht als Hinweis.
4. **Emoji → SVG-Icon-Set** (`ICONS`/`icn()`, ~Z. 1908): neue Icons
   `bars`/`trendUp`/`globe`/`zap`/`pin`/`shuffle`/`flame`/`note` ergänzt.
   Ersetzt in: Logo ("📊 FX Analyst Pro" → reine Wortmarke), Currency-
   Strength- und Pair-Heatmap-Kartentitel (💪/🔥), COT "Net Long/Short"-
   Titel (📊), Macro/Notes-Tab-Buttons (⚡/📝) auf der Asset-Detailseite,
   Trends-Header-Buttons "Pair"/"vs Price" (🔀/📈, als statisches Inline-
   SVG da `icn()` in statischem Header-HTML nicht läuft, siehe bestehende
   Konvention). Emoji in `<select><option>`/`<textarea placeholder>`
   (können kein SVG enthalten) einfach entfernt statt ersetzt: "🌐 All
   assets/currencies/symbols", "💱 FX only", "📌 Quick Note", die beiden
   `.nt-sub-lbl`-Marker im Notes-Tab. **Bewusst NICHT angefasst:**
   `CMP_RUB_ICON` (Emoji als Zeilen-Unterscheidung in der Compare-Tabelle)
   und sonstige Emoji in Info-/Hilfetexten — das fällt unter die bereits
   bestehende Regel "Emoji in Info-Texten/Karten-Titeln sind ok", nur
   Chrome-Elemente (Buttons, Sektions-/Karten-Titel, Logo) wurden bereinigt.
5. **Badge-/Pill-Flut**: NICHT strukturell umgebaut (Risiko zu hoch, die
   Bias-Buttons/Sterne-Bewertung sind funktional - Sterne = "important"-
   Flag mit echter Score-Auswirkung, kein reines Gamification-Element).
   `.ibo`/`.trend-chip`/`.dbadge`/`.istar2` waren beim Nachprüfen bereits
   gedämpft (transparent/getönt statt vollflächig) - hier nur die globale
   Radius-Reduktion (Punkt 6) angewendet, keine Struktur-Änderung.
6. **Border-Radius global reduziert**: `--r`/`--rs`/`--rss` (die App-weit
   verwendeten Radius-Variablen) von 10/7/5px auf 8/6/4px gesenkt - wirkt
   auf Dutzende Elemente konsistent, ohne jede Fundstelle einzeln anfassen
   zu müssen. Einzelne hartcodierte Radien (12-20px an einzelnen Stellen)
   bewusst NICHT durchgefegt - zu hohes Regressionsrisiko für den Umfang.
7. **Intro-Screen entschärft**: `.intro-title` von 3-Farben-Gradient-Text
   + starkem Glow (`drop-shadow(0 0 26px …)`) + dramatischem Zoom-in
   (`scale(.62→1)`) auf einfarbig (`#e8eef7`), kein Glow, dezenter Zoom
   (`scale(.94→1)`) umgestellt.
8. **Zahlen-Typografie**: `font-variant-numeric:tabular-nums` global auf
   `body` ergänzt. Die eigentliche Monospace-Nutzung (SF Mono) war beim
   Nachprüfen bereits sehr weit verbreitet (155 Fundstellen) - die
   Agent-Einschätzung "nur in der Globe-Legende" traf nicht zu, `tabular-
   nums` ist hier nur eine zusätzliche Absicherung für Nicht-Mono-Stellen.

Per Playwright verifiziert (Desktop+Mobile, Dashboard/Matrix/COT/FX-Detail/
Intro): Widget-Reihenfolge stimmt (`ccy_ranking` zuerst, `globe` zuletzt),
keine JS-Fehler, alle ersetzten Icons rendern korrekt, Intro wirkt sichtbar
ruhiger (Screenshot-Vergleich).

### Intro-Lade-Anzeige nach Referenz-Screenshot (Nutzer-Wunsch 2026-07-19)

Nutzer schickte einen Screenshot des myfxbook-Splash-Screens: Reihe kleiner
Quadrate unter dem Untertitel, eines davon leuchtet farbig auf und wird
etwas breiter, wandert sichtbar von links nach rechts durch die Reihe,
Zyklus wiederholt sich. Ausdrücklicher Wunsch: NUR dieses Lade-Element
übernehmen, der eigene Hintergrund (dunkles Karo-Raster, `.intro-grid`)
UND die eigene Wortmarke bleiben unverändert - keine komplette Vorlagen-
Übernahme.

- Neues `.intro-loader` (5× `.intro-loader-sq`) unter `.intro-sub`
  eingefügt, `@keyframes introLoaderSweep` + `animation-delay` pro
  Quadrat (0/.16/.32/.48/.64s) erzeugt den Sweep-Effekt.
- **Falle beim ersten Anlauf:** mit `ease-in-out` und einem Hell-Fenster
  (Breite/Farbe aktiv) von 8-20 % einer 1,6-s-Animation UND nur 0,16 s
  Versatz zwischen den Quadraten überlappten sich die weichen Übergangs-
  Rampen benachbarter Quadrate zeitlich - per Playwright-Sampling
  (`getComputedStyle().width` alle 100 ms) bestätigt: 2-4 Quadrate waren
  gleichzeitig teilweise aufgeweitet statt sauber EINES nacheinander.
  Fix: `steps(1)` statt `ease-in-out` (digitales Umschalten ohne
  Zwischenwerte) + Hell-Fenster auf 10-18 % verkürzt (0,128 s), kürzer als
  der 0,16-s-Versatz - dadurch nie zwei Quadrate gleichzeitig aktiv,
  per erneutem Sampling bestätigt (sauber EIN aktives Quadrat pro Frame,
  wandert 1→2→3→4→5→Pause→1…).
- Akzentfarbe = `var(--blue)` (App-eigener Ton), nicht das Orange aus dem
  myfxbook-Referenzbild - der Nutzer wollte das Element uebernehmen, nicht
  eine fremde Markenfarbe einführen.

### Zwei Korrekturen zum Professionalitäts-Audit (Nutzer-Wunsch 2026-07-19, selber Tag)

Nach dem Live-Ansehen der Runde-2-Änderungen zwei Rückmeldungen:

- **Aurora-Hintergrund war zu schwach geworden.** Die Reduktion auf
  `opacity:.10` (Audit-Runde 2) machte den Effekt praktisch unsichtbar -
  Nutzer-Eindruck "dunkel auf dunkel", obwohl der Hintergrund technisch
  noch da war. Per Pixel-Sampling bestätigt (Playwright-Screenshot,
  `PIL.Image.getpixel`): Ecke mit Aurora-Blob (26,41,57) vs. reine
  Body-Farbe (17,22,31) - der Unterschied war real, aber zu gering, um
  gegen die UI-Chrome (Header/Karten) wahrnehmbar zu sein. Auf `.18`
  angehoben (statisch bleibt es, keine Animation zurück) - deutlich unter
  dem ursprünglichen `.28` (Video-Game-Kritik), aber wieder sichtbar genug
  gegen den sonst sehr dunklen Hintergrund.
- **Globus zurück als Dashboard-Hero.** Der Nutzer wollte den Globus nach
  dem Ansehen der Demotion (Audit-Runde 2, Punkt 2) wieder an seiner alten
  Stelle ganz oben haben - Professionalität ja, aber nicht auf Kosten
  dieses Features. `DASH_V` auf 6 erhöht, `migrateDash()`-Rang-Tabelle und
  `mkWidgets()` beide auf `globe:0` zurückgesetzt. **Merksatz:** bei
  Meinungsverschiedenheiten zwischen einem Audit-Agenten-Vorschlag und dem
  tatsächlichen Nutzer-Feedback nach dem Live-Ansehen zählt IMMER Letzteres
  - Agent-Vorschläge sind Ausgangspunkt, keine Endabnahme.

### Performance-Audit: empirisch profiliert, drei Bottlenecks behoben (2026-07-19)

Nutzer meldete "sehr schlechte Performance, haengt an vielen Stellen". Statt
zu raten mit Playwright empirisch profiliert (window-Funktionen gewrappt,
Zeit+Aufrufzahl pro Funktion gemessen, Median ueber 25 Iterationen, Vorher via
`git stash`). Drei bestaetigte Bottlenecks - alle waren VOLLE Neuberechnungen,
die pro Render vielfach unnoetig liefen:

1. **`indHistChart()` wurde fuer JEDEN Indikator vorab gebaut, obwohl in
   eingeklapptem `<details>` unsichtbar.** Gemessen: ~1,3 ms je Chart × 24
   Indikatoren = ~30 ms, die HAELFTE der gesamten `renderDetail`-Stringarbeit
   (`renderSpecTab` 33 ms). Der Nutzer sieht diese Charts erst beim Aufklappen.
   Fix: eingeklapptes `<details>` bekommt nur einen leeren Platzhalter
   `<div class="ind-hist-holder">`; `onIndDetailsToggle()` (neu) rendert den
   Chart erst beim ERSTEN Aufklappen einmalig hinein (Marker `data-filled`,
   danach nie wieder) und ruft `attachChartHovers(holder)` separat auf (das
   globale renderDetail-attachChartHovers ist dann schon durch). Ist das
   `<details>` beim Rendern schon offen (Range-Filter-Klick ->
   `setIndHistRange()` -> `renderDetail()`), wird der Chart wie bisher inline
   gebaut, damit die Range-Buttons unveraendert laufen. **Merksatz:** teure
   SVG-/Chart-Strings NIE unbedingt in ein standardmaessig eingeklapptes
   `<details>` bauen - lazy erst beim Aufklappen (Lookup ueber `ind.id` via
   `findIndById`).
2. **`stripPeriodSuffix()` (reine Funktion des Namens-Strings) memoisiert.**
   Lief auf heissen Pfaden ~36.000 Regex-Matches pro `renderDash`
   (`symTrackedCount` -> `fxRefCount`). Cache nach Name (`_stripPeriodCache`),
   Ergebnis `Object.freeze`d, weil geteilt zurueckgegeben (Aufrufer lesen nur
   `.base`/`.period`). 100 % risikofrei (deterministisch, Cache-Groesse durch
   endliche Namensmenge beschraenkt).
3. **`fxRefCount()` in `symScoreCmp()` memoisiert.** Haengt AUSSCHLIESSLICH von
   der Indikator-ANZAHL der FX-Majors ab (nicht von Bias/Score), lieferte in
   einem Render-Durchlauf immer denselben Wert, wurde aber pro `symScoreCmp`
   neu gerechnet (in `renderDash` 164×, jedes Mal alle 8 Majors iteriert).
   `_fxRefCountCache` + `invalidateCmpCache()`, geleert in `recomputeAuto()`
   (laeuft nach jedem Add/Remove von Indikatoren/Rubriken, nach `applySnap`
   fuer Undo/Import/Load, und beim Boot) UND in `save()` als Sicherheitsnetz.
   **Wichtig:** Per Playwright verifiziert, dass die Invalidierung greift -
   nach einem Bias-Klick aenderte sich der angezeigte Vergleichs-Score korrekt
   (0.4 -> 1.2) und Undo stellte ihn wieder her (-> 0.4), d. h. der Cache wird
   NICHT stale. Bei kuenftigen neuen Stellen, die Indikatoren/Rubriken
   strukturell aendern OHNE ueber `recomputeAuto`/`save` zu laufen, dort
   `invalidateCmpCache()` ergaenzen (Ueber-Invalidierung ist harmlos).

Ergebnis (Median, Playwright, Chromium): **`renderDetail` 66 -> 24 ms**
(Worst-Case 212 -> 55 ms - das war der eigentliche spuerbare "Haenger" beim
Oeffnen eines Assets), **`renderDash` 51 -> 43 ms** (symScoreCmp-Anteil darin
16 -> 3 ms). Zusaetzlich: der minuetliche Full-Rebuild-`setInterval` (renderDash
/renderMatrix/renderCompare/renderCalendar) pausiert jetzt bei `document.hidden`
(kein Neuaufbau fuer einen Hintergrund-Tab; beim Zurueckkehren rendert der
`visibilitychange`-Handler ohnehin neu). Regression-frei getestet: alle 13 Tabs
rendern fehlerfrei, Bias-Klick/Undo/History/Risk-Dial/snap-Roundtrip ok, keine
Page-Errors. **Merksatz fuer kuenftige Perf-Arbeit:** zuerst mit dem
window-Wrap-Profiler (Scratchpad `prof.js`) messen WELCHE Funktion wie oft/lange
laeuft, dann gezielt fixen - nicht aus dem Code-Lesen raten. Die dominierenden
Kosten waren nie einzelne langsame Funktionen, sondern billige Funktionen, die
pro Render zig- bis hundertfach unnoetig wiederholt liefen.

### Aurora-Hintergrund: harte Kante + hakeliger Design-Regler (Bugreport 2026-07-19, per Foto)

- Nutzer-Screenshot zeigte auf der EUR-Detailseite eine deutlich sichtbare,
  fast diagonale harte Kante im Hintergrund ("verbogen") statt eines
  weichen Glühens. Zusätzlich: der Farbregler im Designer (🎨) "hängte"
  beim Ziehen, reagierte nicht fluessig.
- Ursache fuer BEIDES dieselbe Stelle: `.aurora-blob` war eine volle
  Kreisflaeche (`background:var(--aurora-a)`) mit `filter:blur(90px)` bei
  `opacity:.18` (siehe Eintrag "Zwei Korrekturen..." oben, wo die
  Deckkraft von .10 auf .18 angehoben wurde). Ein CSS-Blur-Filter blendet
  eine harte Kante nur INNERHALB des Blur-Radius weich aus - bei einem so
  grossen Element (bis 56vw) und der jetzt hoeheren Deckkraft blieb der
  Kreisrand als sichtbare Kante uebrig. Gleichzeitig ist `filter:blur()`
  auf so grossen Flaechen teuer: der Browser muss es bei JEDER Aenderung
  in der Naehe neu rendern - und genau das passierte bei jedem einzelnen
  `input`-Event des Farbreglers (`previewDesignHue()` setzt
  `document.body.style.background` + drei CSS-Variablen auf den Blobs).
  Ein Touch-Drag feuert `input` weit haeufiger, als der Browser das teure
  Blur-Repaint hinterherrendern konnte → spuerbares Haengen.
- Fix: `.aurora-blob` nutzt jetzt `background:radial-gradient(circle,
  <farbe> 0%, transparent 70%)` statt Vollflaeche+Blur - ein radialer
  Verlauf hat PER DEFINITION keine harte Kante (faedet selbst bis
  transparent aus), braucht also kein Blur-Filter mehr (nur noch die
  guenstige `opacity`, jetzt `.4` am Gradient-Zentrum, visuell aehnliche
  Gesamt-Intensitaet wie vorher). Zusaetzlich `previewDesignHue()` per
  `requestAnimationFrame` gebuendelt (nur der jeweils letzte Wert pro
  Frame wird angewendet) - per Playwright bestaetigt: 181 rasch
  aufeinanderfolgende `input`-Events lösten vorher 181 `applyDesignHue()`-
  Aufrufe aus, jetzt nur noch 1.
- **Merksatz:** `filter:blur()` auf grossen/vielen Elementen ist ein
  wiederkehrender Perf-Fallstrick in dieser App (aehnlich den bereits
  dokumentierten Vollflaechen-Bottlenecks) - bei kuenftigen Hintergrund-/
  Glow-Effekten bevorzugt `radial-gradient`/`box-shadow` statt
  `filter:blur()` auf grossflaechigen Elementen verwenden, v.a. wenn sie
  sich haeufig neu zeichnen (z.B. durch haeufige Style-Aenderungen in der
  Naehe).

### Indikator-Verlaufschart: Legende in dieselbe Zeile wie Zeitraum-Filter (Nutzer-Wunsch 2026-07-20)

- Die "■ Actual"/"— Forecast"-Legende von `indHistChart()` (Ausklappen einer
  Indikator-Karte auf der Asset-Detailseite ODER Insights-Tab "Data") stand
  bisher als `<text>` oben rechts IM SVG selbst - strukturell getrennt von
  der `.ind-hist-range-bar` (3Y/2Y/1Y/6M/3M/1M-Buttons), die als eigenes
  HTML-`<div>` DARUEBER sass. Nutzer wollte beides in derselben Zeile.
  Fix: Legende raus aus dem SVG, als HTML `.ind-hist-legend`-Div gebaut und
  zusammen mit `.ind-hist-range-bar` in einen gemeinsamen Flex-Container
  `.ind-hist-toolbar` (`justify-content:space-between;flex-wrap:wrap`)
  gepackt - auf schmalen Screens faellt die Legende sauber in eine zweite
  Zeile um, statt zu ueberlaufen (Grundsatz "Karten-Inhalt darf nie ueber
  den Kartenrand hinausgehen" oben gilt sinngemaess auch hier).

### EUR-Score "flippt" beim Laden (1.5 -> 0.5) + scoreHist-Sync-Bug (Bugreport 2026-07-20)

Nutzer meldete zwei zusammenhaengende Beobachtungen: (1) EUR zeigt beim
Oeffnen der Seite kurz einen Score, der dann auf einen anderen Wert wechselt
("das liegt daran das manche indikatoren sich erst dann mit neuen werten
fuellen") und (2) die Trends-Historie ist je Geraet unterschiedlich lang
(iPad deutlich mehr Tage als das Handy, das nur 2 Tage zeigte).

**(1) Score-Flip empirisch geprueft (Playwright, `symScoreCmp('EUR')` alle
150ms gepollt ueber 8s ab Seitenaufruf) - KEIN Datenfehler:** der Boot
rendert sofort mit dem zwischengespeicherten/eingebauten Stand (fuer
Offline-Faehigkeit noetig, siehe Service-Worker-Abschnitt), danach laufen
die Live-Feed-Fetches (`autoFetchIndData`/`autoFetchBondData`/...)
asynchron und korrigieren `ind.bias`/den Score, sobald sie durch sind (im
Test nach ~2,6s). Getestet: `scoreHist`s heutiger Eintrag wird dabei
korrekt UEBERSCHRIEBEN (nicht doppelt/verwaist), History zeigt also nach
der Korrektur den richtigen Wert. Das ist die - durch den kuerzlich
geshippten `applyIndDataFeed()`-Bias-Selbstheilungs-Fix (siehe Eintrag
weiter oben zu "CB Consumer Confidence") jetzt sichtbarere - erwartete
Offline-first-Mechanik (sofort aus Cache rendern, dann mit Live-Daten
korrigieren), kein eigener Bug. Der Nutzer hatte die Ursache selbst schon
richtig vermutet.

**(2) scoreHist-Historie-Laenge PRO GERAET war dagegen ein echter Bug** -
und die eigentliche Erklaerung fuer die iPad/Handy-Diskrepanz: `scoreHist`
war rein `localStorage`, nie an `cloudPush`/`cloudPull`/`exportData`/
`importData` angebunden - exakt die `tabStacks`-Bug-Klasse aus der
"WICHTIGSTE REGEL" oben. Jedes Geraet sammelte nur seine EIGENEN Tage
(schrieb nur, wenn es tatsaechlich offen war), nie synchronisiert. Fix nach
dem etablierten Muster, aber mit **Merge statt Overwrite beim Pull/Import**
(`mergeScoreHist()`, siehe "WICHTIGSTE REGEL"-Abschnitt oben fuer Details) -
ein normales Overwrite haette die jeweils andere Geraete-Historie geloescht.
Zusaetzlich Cap in `recordScoreHist()` von ~95 auf ~1100 Tage (3 Jahre)
angehoben ("maximale Historie", Nutzer-Wunsch), angelehnt an den
3-Jahres-Horizont von `chartHist`/`IND_HIST_RANGES`/COT-3y%ile. Per
Playwright verifiziert: `mergeScoreHist()` vereinigt disjunkte Tage
korrekt, loest Datums-Kollisionen zugunsten des lokalen (frischeren)
Werts auf, `recordScoreHist()` bumpt `fxpro_updated`+ruft `cloudAutoSync()`
zuverlaessig auf bei echter Aenderung, alle 13 Tabs + Bias-Klick
regressions-frei.

### Gemeinsamer Zeitraum-Filter fuer Zeitreihen-Diagramme (Nutzer-Wunsch 2026-07-20)

Neue, wiederverwendbare Filter-Komponente (`TIME_RANGES`/`timeRangeBarHtml()`/
`timeRangeCustomHtml()`/`filterDatesByRange()`, ≈ Zeile 9037) - Optionen
Max/3Y/2Y/1Y/6M/3M/1M/Custom (Custom blendet zwei `<input type="date">`
inline ein). Ersetzt/generalisiert den bisherigen indikator-spezifischen
`IND_HIST_RANGES`-Filter (der hatte kein Max/Custom).

- **Trends-Tab** (`renderTrends()`/`renderTrendsPair()`): eigener State
  `trendsRange`/`trendsCustomFrom`/`trendsCustomTo`, Default **`'MAX'`**
  (Nutzer-Wunsch "maximale Historie ueberall" als Startzustand - anders als
  beim Indikator-Chart, der weiterhin bei 1Y startet, siehe unten). Filtert
  die `dates`-Liste VOR dem Aufruf von `scoreTrendCard`/`scoreVsPriceCard` -
  alle vier Karten (Total/Inflation/Labour/Growth bzw. vs Price) teilen sich
  dieselbe gefilterte Datumsliste, die Range-Bar erscheint deshalb nur EINMAL
  oben, nicht pro Karte.
- **Indikator-Verlaufschart** (`indHistChart()`, Ausklappen einer Indikator-
  Karte ODER Insights > Data): `indHistRange`/`indHistCustomFrom`/
  `indHistCustomTo` ersetzen die alten `IND_HIST_RANGES`/`setIndHistRange`-
  Variablen, Default bleibt 1Y (unveraendert, war schon vorher so gewaehlt).
  Jetzt zusaetzlich Max und Custom moeglich, exakt dieselbe Optik wie im
  Trends-Tab (dieselben CSS-Klassen `.ind-hist-range-bar`/`.ind-hist-range-
  btn`/`.time-range-custom`).
- Bei kuenftigen neuen Zeitreihen-Diagrammen (COT-Historie, Retail-
  Sentiment-Verlauf, Put/Call-Verlauf, ...) diesen Filter wiederverwenden
  statt einen eigenen zu bauen (CLAUDE.md-Grundsatz "wiederkehrende UI-
  Bausteine muessen einheitlich sein"). Noch NICHT umgesetzt fuer:
  COT-Positionierungshistorie, Risk-Sentiment-Mini-Chart, Put/Call/Retail-
  Sentiment-Charts (die haben meist ohnehin keinen langen Zeit-Horizont
  oder sind Balken-Aggregate ohne echte "Zeitspanne"-Semantik wie
  Saisonalitaet) - bei Bedarf nachruesten.

### KRITISCHER Regressions-Bug im scoreHist-Sync-Fix: Live-Korrekturen wurden verworfen (Bugreport 2026-07-20, selber Tag wie der Fix)

Nutzer meldete weiterhin (nach dem obigen scoreHist-Sync-Fix): "Score bleibt
beim Laden auf dem alten Wert stehen, obwohl schon neue Daten da sind - soll
nicht jedes Mal neu gefragt werden muessen." Per Playwright empirisch bis auf
die Zeile zurueckverfolgt (window.__DBG-Instrumentierung direkt in
`applyIndDataFeed()`, dann wieder entfernt) - **das war kein Feed-Problem,
sondern ein durch den scoreHist-Fix selbst eingefuehrter Bug**:

- `recordScoreHist()` bumpt bei einer Aenderung `localStorage['fxpro_updated']`
  direkt (noetig, da `scoreHist` ausserhalb von `snap()` liegt, siehe oben).
  Das tat es aber OHNE die In-Memory-Variable `_lsUpdatedSeen` mitzuziehen -
  an JEDER anderen Stelle im Code, die `fxpro_updated` schreibt, passiert das
  im GLEICHEN Atemzug (`_lsUpdatedSeen=localStorage.getItem('fxpro_updated')`,
  grep zeigt das Muster an >8 Stellen).
- `save()`s Multi-Tab-Schutz (≈ Zeile 4907) vergleicht bei JEDEM Aufruf
  `localStorage.getItem('fxpro_updated') !== _lsUpdatedSeen` - eine
  Abweichung wird als "ein ANDERES Geraet/Tab hat inzwischen gepusht"
  interpretiert und `adoptExternalState()` aufgerufen, was `syms` (inkl.
  aller `ind.research`) aus dem AKTUELL in localStorage stehenden (noch
  UNKORRIGIERTEN) Snapshot neu laedt - und damit die frisch im Speicher
  korrigierten Live-Feed-Werte wieder verwirft, BEVOR sie je gespeichert
  wurden.
- Ablauf des Bugs: `recordScoreHist()` laeuft beim Boot ZUERST (synchron,
  vor jedem Live-Fetch) und bumpt oft `fxpro_updated` (neuer Tag/neuer
  Score) - ohne `_lsUpdatedSeen` nachzuziehen. Kurz danach korrigiert
  `applyIndDataFeed()`/`applyBondDataFeed()`/etc. `ind.research` im Speicher
  korrekt (per Playwright bestaetigt: die Korrektur selbst lief immer
  fehlerfrei durch) - aber der ANSCHLIESSENDE `save()`-Aufruf sieht die
  Diskrepanz aus dem ersten Punkt, denkt "fremde Aenderung" und verwirft die
  gerade korrigierten Daten wieder. Das erklaert auch, warum es sich wie
  "wird immer wieder neu gefragt, kommt aber nie an" anfuehlte - die
  Korrektur passierte durchaus, wurde aber nie persistiert.
- Fix: `recordScoreHist()` zieht `_lsUpdatedSeen` jetzt im selben Atemzug
  mit (`localStorage.setItem('fxpro_updated',...);_lsUpdatedSeen=
  localStorage.getItem('fxpro_updated');`), exakt wie an jeder anderen
  Bump-Stelle. Per Playwright verifiziert: `CPI (Headline) y/y` (EUR) zeigt
  jetzt sofort/durchgehend die korrekte Live-Feed-Zahl (`feed:true`) statt
  auf den Ship-Time-Fallback-Wert zurueckzufallen, auch nach mehrfachem
  Reload mit bereits bestehendem localStorage-Stand.
- **Zusaetzlich**: die vier score-treibenden Live-Feeds (Ind/Bond/COT/
  Sentiment) liefen bisher komplett unabhaengig - jeder feuerte bei eigenem
  Abschluss sofort einzeln `recomputeAuto()+save()+rerender()`, was den
  sichtbaren "Flip" beim Laden auf bis zu vier gestaffelte Spruenge
  aufteilte. Neue Funktion `bootFetchScoreFeeds()` (≈ Zeile 11221, ersetzt
  die vier einzelnen `autoFetchX()`-Aufrufe im Boot UND im stuendlichen
  `setInterval`) buendelt alle vier per `Promise.all` und macht EINEN
  gemeinsamen Recompute/Save/Render-Zyklus, sobald alle durch sind - ein
  sauberer Uebergang von "aus dem Cache" zu "live" statt mehrerer.
  `autoFetchFF()` (Kalender, eigene komplexere Speicherlogik direkt in
  `fetchFF()`) und `autoFetchPriceData()` (kein Bias-Einfluss) bleiben
  bewusst separat/unbatched - dort nicht angefasst, um das Risiko fuer
  diesen Fix klein zu halten.
- **Bekannter, kleinerer Restbefund** (nicht der urspruenglich gemeldete
  Bug, deutlich enger): vereinzelt wurde beobachtet, dass die Bias-
  Klassifikation EINES einzelnen Indikators (beobachtet: EUR PPI y/y)
  zwischen zwei aufeinanderfolgenden Aufrufen bei IDENTISCHEN
  Actual/Forecast/Previous-Werten kippte (bull -> bear, keine Werte-
  Aenderung) - vermutlich der separate, hier bewusst nicht angefasste
  Kalender-Abgleichspfad (`syncIndicatorBiases()`/`findIndEvent()`, dritter
  Bias-Pfad neben `ind.research.feed`/`ind.research.bond`, siehe PPI-
  Eintrag vom 2026-07-16 oben). Noch nicht tiefer untersucht - bei
  Wiederauftreten zuerst dort ansetzen, nicht wieder bei `applyIndDataFeed()`
  suchen (die ist inzwischen per Playwright als deterministisch/idempotent
  bestaetigt).
- **Merksatz fuer kuenftigen Code:** JEDE Stelle, die
  `localStorage.setItem('fxpro_updated', ...)` schreibt, MUSS im selben
  Atemzug `_lsUpdatedSeen` nachziehen - sonst greift `save()`s Multi-Tab-
  Schutz faelschlich und verwirft frische In-Memory-Aenderungen. Dieser
  Fehler ist leicht zu uebersehen, weil er in der lokalen Entwicklung ohne
  parallel geoeffnete Tabs/Geraete UND ohne einen echten, zeitlich nahen
  zweiten `save()`-Aufruf gar nicht auffaellt - Playwright-Verifikation mit
  tatsaechlichem Boot-Timing (nicht nur isolierten Funktionsaufrufen) ist
  hier der einzige zuverlaessige Test.

### Server-seitige Score-Historie: schliesst Luecken an Tagen ohne Geraete-Besuch (Nutzer-Wunsch 2026-07-20)

Nutzer schickte Screenshots: iPad (nach eigener Aussage taeglich geoeffnet)
zeigte trotzdem Luecken in der Trends-Historie, PC (selten geoeffnet) nur
vier vereinzelte Punkte. Der am selben Tag weiter oben gefixte Cross-
Device-Sync von `scoreHist` behebt das NICHT vollstaendig - er sorgt nur
dafuer, dass verschiedene Geraete sich die Tage TEILEN, an denen JEWEILS
EIN Geraet offen war. An einem Tag, an dem ÜBERHAUPT KEIN Geraet die App
oeffnet, kann `recordScoreHist()` (laeuft ausschliesslich im Browser) gar
nicht erst laufen - eine echte Luecke, die reiner Client-Sync strukturell
nicht schliessen kann.

**Loesung: server-seitige Aufzeichnung im stuendlichen Workflow.**
`cloudPush()`s `scoreSnapshot`-Feld (schon vorher fuer `weekly-report.yml`
da, jetzt um `infl`/`labour`/`growth` erweitert, damit es dasselbe 6er-
Tupel-Format wie `scoreHist` selbst liefert) wird beim Push IMMER aktuell
gehalten - unabhaengig davon, ob das die einzige Aenderung ist. Neuer
Schritt **"Fetch score snapshot from cloud sync"** in
`update-ff-calendar.yml` (nach der COT-3y%ile-Anreicherung, vor "Cleanup
temp files") liest bei jedem stuendlichen Lauf den aktuellen
`scoreSnapshot` aus der Supabase `fx_sync`-Tabelle (dieselben
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SYNC_ID`-Secrets, die
`weekly-report.yml`/`event-alerts.yml` schon nutzen - keine neue
Einrichtung noetig) und schreibt/aktualisiert daraus **taeglich EINEN
Eintrag pro Asset** in einer neuen Datei `score_hist.json` (Format:
`{[assetId]: [[datum,total,infl,labour,growth,bias], ...]}`, identisch zum
client-seitigen `scoreHist` - Cap ebenfalls 1100 Tage). Laeuft unabhaengig
davon, ob an diesem Tag ein Geraet die App geoeffnet hat - solange
IRGENDWANN vorher mindestens einmal gepusht wurde, liefert die Cloud einen
(ggf. leicht "alten", aber immer noch besser als gar keinen) Snapshot, der
taeglich fortgeschrieben wird.
- Client-seitig: `fetchScoreHistServer()`/`applyScoreHistServerFeed()`
  (≈ Zeile 11290 bei `bootFetchScoreFeeds()`, laeuft im selben `Promise.all`
  wie die anderen Boot-Feeds - ein weiterer kleiner JSON-Fetch, kein
  zusaetzlicher Render-Zyklus, daher kein spuerbarer Performance-Impact,
  Nutzer-Vorgabe "nicht viel Performance ziehen" beruecksichtigt).
  `applyScoreHistServerFeed()` merged die Server-Datei als **Basis**
  (`mergeScoreHist(SCORE_HIST_SERVER, scoreHist)`) - eine lokale, gerade im
  Browser frisch berechnete Aenderung hat bei einer Datums-Kollision immer
  Vorrang (per Playwright verifiziert: lokaler Wert fuer "heute" bleibt bei
  gleichzeitig vorhandenem Server-Wert fuer "heute" unveraendert erhalten;
  ein Server-Eintrag fuer eine Luecke, die lokal fehlt, wird uebernommen).
- Ohne konfigurierte `SUPABASE_*`-Secrets (z.B. bei einem Fork ohne Cloud-
  Sync) bleibt `score_hist.json` einfach leer/nicht vorhanden - der Schritt
  degradiert sauber (`continue-on-error: true`, klare Debug-Zeile), das
  bisherige rein client-seitige Recording funktioniert unveraendert weiter.
  Rein additiv, kein Breaking Change.
- Per Node-Skript-Test lokal verifiziert: Idempotent (zweiter Lauf mit
  identischem Snapshot meldet "0 aktualisiert"), schreibt das exakt gleiche
  Tupel-Format wie der Client.

### Audit-Agent: weitere localStorage-only-Bugs derselben Klasse gefunden + gefixt (2026-07-20)

Nutzer bat explizit um einen Agenten, der pruefen soll, ob der scoreHist-
Sync-Bug (siehe oben) noch an anderen Stellen vorkommt. Ergebnis (alle
121 `localStorage`-Zugriffe im File gegen `cloudPush`/`cloudPull`/
`exportData`/`importData`/`snap` abgeglichen) - drei echte Funde, alle
sofort nach dem etablierten Muster gefixt:

- **`setupCcyFilter`/`setupFxOnly`** (Set-ups-Waehrungsfilter/FX-Quick-
  Filter, erst am 2026-07-17/20 gebaut) - der Code-Kommentar sagte sogar
  woertlich "Persistiert eigenstaendig im localStorage", der dokumentierte
  Anti-Pattern-Satz selbst. Neuer gemeinsamer Helper `syncSetupFilterPref()`
  (bumpt `fxpro_updated`+`_lsUpdatedSeen`+`markPrefEdit()`+`cloudAutoSync()`)
  wird von `toggleSetupCcy()`/`clearSetupCcy()`/`toggleSetupFxOnly()`
  aufgerufen.
- **`calHighOnly`/`calCcyFilter`** (Kalender "High-Impact only" + Waehrungs-
  Filter) - `toggleCalHighOnly()`/`setCalCcyFilter()` bumpen jetzt genauso.
- **`cmpCols`** (Compare-Tab Spaltenauswahl) - neuer Helper `saveCmpCols()`,
  genutzt von `toggleCmpCol()`/`cmpSelectAllFx()`/`cmpSelectAllAssets()`/
  `cmpSelectAll()`.

Alle drei zusaetzlich in `cloudPush()`/`cloudPull()` (mit `prefPending`-
Schutz wie `compactLevel`/`designHue`, da jetzt `markPrefEdit()` nutzend)
und `exportData()`/`importData()` eingebunden.

**Separater, verwandter Fund:** `exportData()` pflegte eine manuelle
Feldliste statt `snap()` als Basis zu nutzen - dabei waren `rubOrder`/
`sbOrder`/`catOrder`/`rateWatchCustom`/`indLinkCustom`/`dashV`/
`riskEnvLevel`/`riskEnvCfg`/`riskEnvLists` vergessen worden. Die gingen
zwar NICHT beim normalen Cloud-Sync verloren (der nutzt `snap()` direkt),
aber bei einem manuellen "Export JSON" → "Import JSON" (z.B. Backup ohne
Cloud) fielen sie auf ihre Defaults zurueck. Fix: `exportData()` nutzt jetzt
`JSON.parse(snap())` als Basis (plus die Nicht-Snap-Felder oben) statt einer
Handliste - kann bei kuenftigen neuen `snap()`-Feldern nicht mehr passieren.
**Merksatz:** bei `exportData()` nie wieder eine manuelle Feldliste pflegen,
immer von `snap()` ausgehen.

**Bewusst NICHT als Bug eingestuft:** `fxpro_verbanner_collapsed`
(VERSION-CHECK-Banner ein-/ausgeklappt) - reine Chrome-/Debug-Praeferenz,
kein App-Inhalt; bleibt lokal (auffaellig ist nur, dass es `localStorage`
statt `sessionStorage` nutzt wie das verwandte `fxpro_verbanner_hidden` -
falls das je stoert, gesondert klaeren, kein dringender Fix).

### Set-ups-FX-Filter jetzt exklusiv zu den Waehrungs-Chips (Nutzer-Wunsch 2026-07-20)

`toggleSetupCcy(c)`/`toggleSetupFxOnly()` (≈ Zeile 6555): liefen bisher als
UND-Verknuepfung nebeneinander (beide gleichzeitig aktivierbar). Jetzt
gegenseitig exklusiv - Aktivieren eines Waehrungs-Chips leert
`setupFxOnly`, Aktivieren von "FX" leert `setupCcyFilter` (auch "All"/
`clearSetupCcy()` raeumt beides). Die bestehende Filter-Logik in
`renderPairs()` (UND-verknuepfte Filter-Kette) musste dafuer nicht
geaendert werden, da jetzt ohnehin nie beide gleichzeitig aktiv sind.

### Quick-Note-Textfeld warf beim Tippen aus dem Feld (Bugreport 2026-07-20)

`renderDetail()` baut `#detail` bei JEDEM Aufruf komplett per `innerHTML=`
neu - u.a. das Quick-Note-`<textarea>`. Ausgeloest wird `renderDetail()`
aber nicht nur durch Nutzer-Aktionen, sondern auch durch Hintergrund-
Vorgaenge, die waehrend des Tippens laufen koennen (periodischer Feed-Poll,
Cloud-Pull, `bootFetchScoreFeeds()` usw. rufen `rerender()`/`renderDetail()`
unabhaengig vom aktuellen Fokus auf) - das ersetzt die aktive Textarea durch
einen neuen DOM-Knoten und der Browser wirft den Fokus/die Cursor-Position
weg, mitten im Tippen. Fix: `renderDetail()` merkt sich vor dem Rebuild, ob
`document.activeElement` das `.quick-note`-Feld ist (inkl.
`selectionStart`/`selectionEnd`), und stellt Fokus + Cursor-Position nach
dem Rebuild auf dem NEUEN Textarea-Element wieder her - selbes Muster wie
die `#pgDash.scrollTop`-Rettung beim Risk-Sentiment-Regler (oben
dokumentiert). **Bei kuenftigen "Feld wirft beim Tippen raus"-Bugs**: prüfen,
ob die umgebende Render-Funktion das Feld per `innerHTML=`-Rebuild ersetzt,
und denselben Capture-vor-Rebuild/Restore-danach-Ansatz anwenden statt das
Feld aus dem Rebuild komplett herauszulösen (waere ein groesserer Umbau).

### 3-Agenten-Audit: stimmen Indikator-Verlaufschart und Karten-Werte ueberein? (Nutzer-Wunsch 2026-07-20)

Nutzer bat um einen Audit "bei jedem Indikator, wenn man ihn ausklappt: was
steht im Chart, passt das zu den Werten direkt am Indikator, gibt es
ueberhaupt Werte im Chart" - drei parallele Agenten (Playwright/lokaler
Server, je eigener Port), aufgeteilt in 3x ~5 Assets (alle 14 Assets/
~250 Indikatoren insgesamt: USD/EUR/GBP/CHF/JPY, CAD/AUD/NZD/BTC/GOLD,
SILVER/OIL/SP500/NAS/DAX), jeder Agent rein lesend (keine Datei-Aenderungen
parallel, um Kollisionen auf derselben `index.html` zu vermeiden) - Befunde
danach zentral gesichtet und EIN Fix angewendet.

**Ergebnis: genau EIN echter Bug** unter ~250 geprueften Indikatoren:
**CAD "GDP Growth QoQ q/q"** - Karte zeigte Forecast 0.1%, Chart (letzter
Punkt) zeigte GAR KEINEN Forecast, obwohl Datum+Actual uebereinstimmten.

- **Ursache:** `applyIndDataFeed()` hat schon LANGE eine Faellback-Logik
  (Zeile ~7395-7398, Kommentar "Liefert der Live-Feed KEINEN Forecast..."):
  liefert der rohe Feed fuer ein Release keinen Forecast, wird der
  kuratierte Research-Forecast als Fallback uebernommen (wenn Datum
  ≤4 Tage auseinander) - dieser angereicherte Wert (`nf`) landet in
  `ind.research.forecast`, also auf der Karte. `adoptChartHist(ind,f)`
  (Zeile 3354) baute den Chart-Verlauf aber komplett SEPARAT aus
  `f.historyFull` (dem rohen, unangereicherten Feed-Verlauf) - kannte den
  kuratierten Fallback also gar nicht und zeigte fuer denselben Release
  weiterhin `forecast:null`.
- **Fix:** `adoptChartHist(ind,f,curatedForecast)` bekommt den bereits
  berechneten `nf`-Wert als drittes Argument mitgegeben (Call-Site in
  `applyIndDataFeed()` unveraendert an derselben Stelle, nur der Parameter
  ergaenzt) und gleicht NUR den LETZTEN Chart-Punkt an, falls dessen Datum
  exakt dem aktuellen Release (`f.date`) entspricht UND der rohe Forecast
  dort `null` ist UND ein kuratierter Fallback existiert - historische
  Punkte (die schon einen eigenen, damals kuratierten Fallback in
  `ind.research` hatten, aber nie rueckwirkend in `chartHist` einflossen)
  bleiben bewusst unangetastet, das waere ein grösserer, hier nicht
  gerechtfertigter Umbau (`historyFull` selbst wird server-seitig vom
  Workflow erzeugt, nicht hier).
- Per Playwright verifiziert: CAD "GDP Growth QoQ q/q" zeigt jetzt am
  letzten Chart-Punkt `forecast:"0.1%"`, identisch zur Karte.

**Alle "kein Chart"-Faelle strukturell erklaerbar, kein Bug:**
`adoptChartHist()`/`chartHist` wird AUSSCHLIESSLICH innerhalb von
`applyIndDataFeed()` befuellt - drei ganz andere Live-Update-Pfade
(`applyBondDataFeed()`/`ind.research.bond`, `applyCotDataFeed()`/
`ind.research.cot`, `applySentimentFeed()`/Chart-only wie VIX oder Crypto
Fear&Greed) sowie rein manuelle/qualitative Felder (CB Tone, Next CB Move,
Risk Correlation, Geopolitics, 2Y/10Y Spread) ruehren `chartHist` nie an -
identisch zum bereits dokumentierten Dreiwege-Bias-Modell (PPI-/Bond-
History-Fixes vom 2026-07-16/17 oben). Zusaetzlich: bei einigen kleineren
FX-Majors (v.a. AUD/CAD/NZD: Manufacturing/Services PMI, Avg Hourly
Earnings, teils Core CPI/PPI) fehlt der Live-Feed-Key in `ind_data.json`
grundsaetzlich noch (bekannte, bereits an mehreren Stellen oben
dokumentierte Feed-Abdeckungsluecke, kein neuer Befund) - betroffene
Karten zeigen dann weiterhin nur die statische Erstbefuellung
(`IND_RESEARCH_DATA`) ohne "feed:true" und folgerichtig auch ohne Chart.

### EUR-Score flippte weiterhin bei JEDEM Laden - echter Ursachenfund: zwei konkurrierende Live-Quellen (Bugreport 2026-07-20, nach den vorherigen Fixes)

Nutzer meldete: der scoreHist-Sync-Regressionsfix (siehe oben) hatte das
Symptom nicht behoben - EUR zeigte weiterhin bei JEDEM Laden erst 1.5, dann
0.5, nicht nur einmalig beim allerersten Cache->Live-Uebergang. Per
Playwright bis auf die konkrete Ursache zurueckverfolgt (Reload-Persistenz-
Test, dann gezielter Diff der Indikator-Bias-Werte zwischen "vor" und
"transientem Zwischenstand"):

- **Ursache gefunden: EUR "PPI y/y" wird von ZWEI unabhaengigen Live-
  Quellen gleichzeitig bedient**, die sich auf VERSCHIEDENE Releases
  beziehen koennen: `applyIndDataFeed()` (TradingView-Feed, `ind_data.json`)
  hatte korrekt das Eurozone-Aggregat (Actual 5.9%, Forecast 5.7%, Datum
  2026-07-06 -> bullish). `syncIndicatorBiases()` (FF-Kalender-Abgleich,
  `findIndEvent()`) hatte ZUSAETZLICH ein Kalender-Event "PPI YoY"/EUR
  gematcht (Actual 1.8%, Datum 2026-07-20 - laut Rohdaten vermutlich ein
  deutsches Landesrelease, das ohne "German"-Praefix faelschlich unter der
  "EUR"-Landeskennung im Kalender landete, siehe Grundsatz oben "EUR-
  Indikatoren: Eurozone-Aggregat bevorzugen, nicht nationale Releases" -
  dieser Grundsatz galt bisher nur fuer `ind_data.json`s EIGENE Quellwahl,
  nicht fuer den separaten Kalender-Matcher). Beide Pfade setzen `ind.bias`
  unabhaengig voneinander - je nachdem, welcher der beiden asynchronen
  Boot-Feeds (Live-Feed vs. Kalender-Fetch) zuletzt durchlief, "gewann" mal
  der eine, mal der andere Wert. Ein reiner Datums-Vergleich (juengeres
  Release gewinnt) haette das NICHT geloest, weil das fehlgematchte
  Kalender-Event trotzdem ein neueres Datum hatte als das echte Feed-
  Release.
- Betraf nicht nur die direkte Bias-Zuweisung, sondern auch
  `trackIndValues()` (vermischte zwei verschiedene Release-Serien in
  derselben Werte-Historie `ind.valHist`) und darueber indirekt
  `applyTrendModel()`/`indStepBias()` - DAS war der tatsaechliche zweite
  Ueberschreiber: selbst mit einer ersten, engeren Fix-Version (die nur die
  direkte Bias-Zuweisung schuetzte) flippte es weiter, weil
  `applyTrendModel()` das vom Feed korrekt gesetzte Bias ueber den durch
  die vermischte Werte-Historie verunreinigten Trend/Step-Wert erneut
  ueberschrieb.
- **Fix in `syncIndicatorBiases()`** (≈ Zeile 3617): sobald ein Indikator
  ueberhaupt vom TradingView-Feed abgedeckt ist (`ind.research.feed===
  true`), hat dieser Pfad JETZT DURCHGEHEND Vorrang - fuer Bias-Zuweisung,
  Werte-Historie (`trackIndValues`) UND Trend-Modell
  (`applyTrendModel(...,allowBiasReplace)`) gleichermassen. Der Kalender-
  Pfad bleibt nur noch fuer Indikatoren OHNE Feed-Abdeckung die alleinige
  Quelle (unveraendertes Verhalten dort). Bewusst KEIN Datums-Vergleich
  mehr als Kriterium - der Feed laeuft im selben stuendlichen Rhythmus wie
  der Kalender-Fetch und holt ein echtes neues Release ohnehin genauso
  schnell selbst nach.
- Per Playwright verifiziert: EUR "PPI y/y" bleibt nach `fetchFF()` UND
  `processCalEvts()` jetzt stabil bei der vom Feed gesetzten Klassifikation
  (vorher: flippte bei jedem Aufruf). 4 aufeinanderfolgende Reloads mit
  ausreichend Settle-Zeit blieben stabil beim selben Score. Zusaetzlich
  alle 8 FX-Majors/`IND_AUTO_RUBS`-Indikatoren nach dem Fix auf verbleibende
  Feed-vs-Kalender-Konflikte gescannt (Nutzer-Wunsch "guck ob das auch bei
  allen anderen Assets ein Bug ist") - **0 verbleibende Konflikte
  gefunden** (der Fix ist eine generische Regel, kein EUR-spezifischer
  Patch, deckt daher automatisch alle Waehrungen ab).

### Quick-Note-Text konnte sich beim Tippen selbst leeren (Bugreport 2026-07-20, tiefere Ursache als der vorherige Fokus-Fix)

Der zuvor gefixte Fokus-Verlust (`renderDetail()` rettet Fokus/Cursor ueber
den Rebuild, siehe Eintrag oben) loeste nur EINEN Teil des Problems -
Nutzer meldete weiterhin: der eingegebene Text "entfernt sich manchmal
einfach so", nicht nur der Cursor springt raus. Per Playwright-Testfall
(getippten Text setzen, dann `fxpro_updated` wie ein zufaelliges
Hintergrund-Update bumpen, dann `save()` aufrufen) reproduziert:

- **Ursache:** `saveSoon()` (der 400ms-Debounce hinter JEDEM Tipp-Feld -
  Quick Note, alle Notiz-/Zusammenfassungs-Textareas) bumpte bisher NICHT
  `_lastUserEditTs`. `save()`s Multi-Tab-Schutz (≈ Zeile 4959:
  `localStorage.fxpro_updated !== _lsUpdatedSeen && Date.now()-
  _lastUserEditTs>=3000` -> `adoptExternalState()`) haelt dadurch JEDES
  Hintergrund-Update, das zufaellig waehrend des Tippens `fxpro_updated`
  bumpt (ein Live-Feed-Fund, `recordScoreHist()`, ...), faelschlich fuer
  eine Aenderung eines ANDEREN Tabs/Geraets - obwohl der Nutzer gerade
  aktiv in DIESEM Tab tippt. `adoptExternalState()` laedt `syms` dann
  komplett aus dem AKTUELL in localStorage stehenden (den getippten Text
  noch NICHT enthaltenden) Snapshot neu - der gerade eingegebene, nur im
  Speicher stehende Text ist damit weg, BEVOR der naechste debounced
  `save()` ihn je gespeichert hat.
- **Fix:** `saveSoon()` markiert jetzt selbst bei jedem Aufruf
  `_lastUserEditTs=Date.now()` (+ `_userEditedSinceSync`/
  `fxpro_user_pending`, wie `pushU()` es fuer diskrete Aktionen tut) -
  zentral an EINER Stelle, da `saveSoon()` ausschliesslich von echten
  Tipp-Handlern aufgerufen wird (nie von automatisierten/Hintergrund-
  Prozessen), daher risikofrei als "gerade aktiv editiert" zu werten.
  Deckt automatisch ALLE ueber `saveSoon()` laufenden Textfelder ab, nicht
  nur Quick Note. Per Playwright verifiziert: derselbe Race-Test verliert
  den Text jetzt nicht mehr (vorher: reproduzierbar leer nach `save()`).
- **Merksatz:** `pushU()` (Undo-Stack + `_lastUserEditTs`) ist fuer
  diskrete Aktionen gedacht: kontinuierliches Tippen soll NICHT bei jedem
  Tastendruck einen Undo-Eintrag erzeugen, aber MUSS trotzdem
  `_lastUserEditTs` pflegen, damit der Multi-Tab-Schutz aktive Eingaben
  erkennt. `saveSoon()` ist dafuer die richtige zentrale Stelle, nicht die
  einzelnen `oninput`-Handler.

### Score-Flip-Fix war unvollstaendig: applyTrendModel() ueberschrieb trendBias weiterhin (Bugreport 2026-07-20, selber Tag)

Nutzer meldete nach dem obigen Score-Flip-Fix mehrfach hintereinander "eur
score bug immernoch da" - der Fix hatte das Symptom NICHT vollstaendig
behoben. Per Playwright empirisch weiterverfolgt (wiederholte Reload-
Zyklen bis ein Flip gefangen wurde, dann kompletter Tiefen-Diff des
gesamten EUR-Symbol-Objekts zwischen den beiden Zustaenden - ein reiner
`ind.bias`-Vergleich hatte in der vorherigen Runde faelschlich "keine
Aenderung" gemeldet, weil die eigentliche Aenderung ganz woanders lag):

- **Ursache: der erste Fix war nur TEILWEISE.** Er schuetzte die direkte
  Bias-Zuweisung (`nb=indBiasFromEvent(ev)`) und `trackIndValues()` vor
  dem konkurrierenden Kalender-Pfad, uebergab aber weiterhin
  `newRelease&&!feedCovered` als `allowBiasReplace`-Parameter an
  `applyTrendModel(ind,noForecast,allowBiasReplace)`. Diese Funktion hat
  ZWEI Zweige: der `if(noForecast)`-Zweig respektiert `allowBiasReplace`
  korrekt, aber der `else`-Zweig (laeuft, wenn das Kalender-Event SELBST
  einen Forecast hat) setzt `ind.trendBias=trend||'neu'` **unbedingt**,
  komplett unabhaengig von `allowBiasReplace`. Der Trend-Bonus (`trendBias`)
  fliesst additiv in den Rubrik-Score ein (siehe Trend-Modell-Grundsatz
  oben) - EUR "PPI y/y" hatte dadurch trotz stabilem `ind.bias='bull'`
  weiterhin einen flippenden `trendBias` ('neu' bei Kalender-Lauf,
  korrekterweise 'bull' bei Feed-Lauf, da `valHist=[-3,2.1,4.9,5.9]` einen
  echten 2-Schritt-Aufwaertstrend zeigt) - macht den sichtbaren
  Score-Unterschied von genau 1 Punkt (2.5 vs. 1.5).
- **Fix: `syncIndicatorBiases()` fasst feed-abgedeckte Indikatoren jetzt
  KOMPLETT nicht mehr an** - ein fruehes `if(ind.research&&ind.research.feed)
  return;` direkt zu Beginn der Indikator-Verarbeitung (≈ Zeile 3617),
  statt einzelne Teilschritte (Bias/Werte-Historie/Trend) separat mit
  `feedCovered`-Flags abzusichern. Damit ist ausgeschlossen, dass IRGENDEIN
  Teil des Kalender-Pfads (auch zukuenftige Erweiterungen von
  `applyTrendModel()`/`syncIndicatorBiases()`) einen feed-abgedeckten
  Indikator noch beeinflusst - der Feed hat vollstaendige Exklusivitaet,
  nicht nur fuer den Hauptwert.
- Per Playwright verifiziert: 6 aufeinanderfolgende Reload-Zyklen (mit
  vollstaendigem Tiefen-Diff des kompletten EUR-Objekts bei jedem Zyklus)
  blieben alle stabil - keine Oszillation mehr gefangen (vorher: in ~1 von
  6 Versuchen reproduzierbar). Voller Tab-Regressionstest weiterhin sauber.
- **Merksatz:** bei einem Bugfix, der zwei konkurrierende Datenquellen fuer
  dieselbe Ausgabegroesse entkoppeln soll, IMMER pruefen, ob die
  "gewinnende" Quelle wirklich JEDEN Pfad abdeckt, der die Ausgabegroesse
  beeinflusst - nicht nur den offensichtlichsten (hier: `ind.bias`). Ein
  Diff auf Feld-Ebene (nur `ind.bias` verglichen) haette dieses Leck
  uebersehen; erst ein vollstaendiger Tiefen-Diff des gesamten Objekts
  (`JSON.stringify`-Rekursion ueber alle Felder) deckte `trendBias` als
  zweiten, uebersehenen Ueberschreiber auf. Bei aehnlichen kuenftigen
  Bugs diese Technik zuerst einsetzen, statt einzelne Felder zu raten.

### Neuer Insights-Tab "Rate Probabilities" (Nutzer-Wunsch 2026-07-20)

Nutzer fragte, ob Zugriff auf das CME-FedWatch-Tool besteht (Fed-Zins-
Wahrscheinlichkeiten je FOMC-Sitzung) und ob sich das dokumentieren +
mit Historie versehen liesse. Recherche: die offizielle CME-FedWatch-API
ist **kostenpflichtig** (~25 $+/Monat, CME Global Account Management) -
das ist nach dem oben dokumentierten Grundsatz ("ein kostenloses Konto ist
KEIN Abbruchgrund, eine BEZAHLTE Stufe schon") ein legitimer Grund, eine
freie Eigenberechnung zu bauen statt die Quelle zu nutzen. Nutzer bestaetigt
("Ja mach das und mach das in insights und nenn es Rate probabilities"),
plus explizite Frage nach 1 Jahr Historie.

- **Methodik (frei nachgebaut, CMEs eigene oeffentlich dokumentierte
  Formel):** 30-Day Fed Funds Futures (Ticker `ZQ`, CBOT) geben je
  Kalendermonat den durchschnittlichen taeglichen Zinssatz an (`100 -
  Future-Preis`). Faellt eine FOMC-Sitzung mitten in einen Monat, laesst
  sich daraus tageszahl-gewichtet der Zins NACH der Sitzung herausrechnen:
  `R_avg = (Tage_vorher/Tage_gesamt)*R_vorher + (Tage_nachher/Tage_gesamt)*
  R_nachher`, nach `R_nachher` aufgeloest. Die Sitzungen werden verkettet
  (`R_nachher` einer Sitzung wird zu `R_vorher` der naechsten). Startwert:
  der aktuelle Effective Federal Funds Rate (EFFR) von FRED (frei, kein
  Key, taeglich, `fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR` - genau
  der Referenzzins, gegen den ZQ selbst abrechnet).
- **Vereinfachung ggue. dem bezahlten CME-Tool:** nur die zwei
  benachbarten 25bp-Stufen werden linear interpoliert (`probsFromDelta()`,
  in `index.html` UND im Workflow identisch implementiert - DRY-Verstoss
  bewusst in Kauf genommen, da eine gemeinsame Datei fuer beide Laufzeiten
  hier nicht existiert, aber im Info-Text/Kommentar aufeinander verwiesen).
  Keine optionen-implizite Verteilung ueber mehr als 2 Ausgaenge (z.B.
  50bp-Ausreisser-Wahrscheinlichkeit) - dafuer fehlt eine freie
  Optionsdaten-Quelle. Im "i"-Info-Text (`SENT_INFO.rateprob`) fuer den
  Nutzer transparent gemacht, keine stille Abweichung.
- **Farbkonvention bewusst wie beim Rest der App:** Hike=`BC.bull`
  (deckt sich mit "CB Tone"/"Next CB Move": bullish=hawkish), Cut=`BC.bear`
  (dovish), Hold=`BC.neu` - keine neue Farbsprache eingefuehrt.
- **Neuer Workflow-Schritt** "Fetch Fed rate probabilities (FRED + CME-
  style ZQ futures)" in `update-ff-calendar.yml` (nach dem COT-3y%ile-
  Schritt, vor "Cleanup temp files"): holt EFFR (FRED-CSV) + die ZQ-Kurve
  (TradingView-Scanner, Ticker-Format `CBOT:ZQ<Monatscode><4-stelliges
  Jahr>`, z.B. `CBOT:ZQN2026` fuer Juli 2026 - **ungetestet, da diese
  Sandbox keinen direkten Netzwerkzugriff auf TradingView hat** (curl-Test
  schlug mit Verbindungsfehler fehl); muss nach dem ersten
  `workflow_dispatch`-Lauf per Job-Log verifiziert werden, ob TradingView
  dieses Format akzeptiert - bei Fehlschlag zeigt die Debug-Zeile
  "no ZQ contract data from TradingView" im Log, dann Ticker-Format
  anpassen, exakt das etablierte iterative Vorgehen wie bei den Bond-Yield-
  Backfills). 14 Monatskontrakte vorausschauend (deckt alle konfirmierten
  FOMC-Termine + 1 Puffermonat ab). FOMC-Termine sind fest im Skript
  hinterlegt (offiziell bestaetigt via federalreserve.gov, nur 2025+2026 -
  **2027-Termine folgen, sobald die Fed sie veroeffentlicht**, dann hier
  ergaenzen). `continue-on-error:true`, degradiert sauber ohne Daten.
- **1-Jahres-Historie-Backfill NICHT moeglich, transparent dokumentiert
  statt stillschweigend uebergangen:** drei gepruefte Wege scheiterten -
  (1) CMEs offizielle API ist bezahlt (s.o.). (2) Investing.com fuehrt
  historische Einzelkontrakt-Seiten (potenziell die volle Kurve), aber
  WebFetch auf die Kontrakt-Listing-Seite lieferte durchgehend HTTP 403
  (Cloudflare-Block, deckt sich mit dem bereits an anderer Stelle
  dokumentierten "Investing.com blockt intermittierend"-Befund) - die
  fuer den AJAX-Zugriff noetigen Kontrakt-IDs liessen sich dadurch nicht
  ermitteln. (3) Yahoo Finance `ZQ=F` liefert zwar freie historische
  Tagesdaten, aber nur als KONTINUIERLICHER Frontmonat-Kontrakt (eine
  Serie, kein Mehrfach-Kontrakt-Kalender) - fuer die vollstaendige
  Mehr-Sitzungen-Entflechtung (jede Sitzung braucht ihren EIGENEN
  Kalendermonat-Kontrakt) strukturell unzureichend, und eine vereinfachte
  Frontmonat-Naeherung waere genau die Art von Zwischenwert-Schaetzung, die
  der Grundsatz oben ("nie Schaetzungen oder veraltend-manuelle Werte")
  ausschliesst. Entscheidung: **wie bei mehreren anderen Feeds in dieser
  App** (Put/Call pro Asset, Seasonality vor dem Stooq-Fund, etc.) waechst
  die Historie ab jetzt echt/unverfaelscht **einen Punkt pro Tag** -
  `rate_probabilities.json.history` (Cap 400 Eintraege, ≈13 Monate). Dem
  Nutzer im finalen Antworttext ehrlich kommuniziert statt als "erledigt"
  hingestellt.
- **Client:** neuer Insights-Tab "Rate Probabilities" (`renderRateProb()`,
  ≈ Zeile 10921 direkt nach der Seasonality-Sektion) - Karte mit aktuellem
  EFFR, je eine Karte pro anstehender FOMC-Sitzung mit Wahrscheinlichkeits-
  Balken (`rateProbBarHtml()`), plus History-Chart fuer eine per Dropdown
  waehlbare Sitzung (`rateProbHistChart()`, nutzt den bestehenden
  `TIME_RANGES`/`timeRangeBarHtml()`/`filterDatesByRange()`-Filter aus dem
  CLAUDE.md-Grundsatz "wiederkehrende UI-Bausteine muessen einheitlich
  sein" - kein neuer eigener Zeitraum-Filter gebaut). In `TABS`/
  `TAB_ORDER`/`PAGE_IDS` eingehaengt, `loadTabStacks()`-Migration reiht ihn
  bei Bestandsnutzern direkt nach "Data" in den Insights-Stapel ein (analog
  zum bereits etablierten Muster fuer Sentiment/Seasonality/Data). Rein
  display-only, kein Score-Einfluss, kein `snap()`/Cloud-Sync-Feld noetig
  (nur Lesezustand `rateProbSel`/`rateProbRange` bleiben bewusst lokal wie
  andere reine Chart-Auswahl-States z.B. `dataAsset`/`seasAsset`).
- Per Playwright verifiziert (synthetische `RATE_PROB_DATA` injiziert,
  da `rate_probabilities.json` erst nach dem ersten Workflow-Lauf real
  existiert): Karten, Wahrscheinlichkeits-Balken, Meeting-Dropdown und
  History-Chart rendern korrekt und fehlerfrei; voller 14-Tab-
  Regressionstest weiterhin sauber. Die eigentliche Live-Berechnung
  (TradingView-Ticker-Format, FRED-Erreichbarkeit) ist NICHT von dieser
  Sandbox aus testbar - Verifikation erst nach Push per
  `workflow_dispatch` + Job-Log (wie bei jeder neuen Datenquelle in
  diesem Projekt ueblich).

**Live-Verifikation per `workflow_dispatch` (2026-07-20, direkt im Anschluss):**
per `mcp__github__actions_run_trigger`/`actions_list`/`get_job_logs` drei
Iterationsrunden gefahren (gleiches Vorgehen wie bei den Bond-Yield-
Backfills - Job-Log lesen statt raten):
1. Erster Lauf: die ZQ-Futures-Ticker (`CBOT:ZQ<Monatscode><4-stelliges
   Jahr>`, z.B. `CBOT:ZQN2026`) kamen auf Anhieb korrekt von TradingView
   zurueck (alle 14 Kontrakte mit echten Kursen) - aber der FRED-EFFR-
   Fetch lieferte 0 Bytes ohne sichtbaren Fehler, der Schritt brach daher
   still ab (`Rcurrent==null` -> `process.exit(0)`).
2. Diagnose-Ausgabe ergaenzt (`-w "http=%{http_code} size=%{size_download}"`
   + Retry nach 5s + CRLF-sicheres CSV-Parsing) und erneut getestet: jetzt
   sichtbar `curl exit 92` = `CURLE_HTTP2_STREAM_ERROR` - FREDs Server/CDN
   vertraegt curls automatische HTTP/2-Aushandlung offenbar nicht sauber.
3. `--http1.1` erzwingt das alte Protokoll (bekannter, dokumentierter Fix
   fuer diesen Fehlercode). Dritter Testlauf lief zum Zeitpunkt dieses
   Eintrags noch (per `Monitor`-Tool im Hintergrund beobachtet, nicht
   `Bash sleep` - Sandbox kann `fred.stlouisfed.org`/
   `scanner.tradingview.com` selbst NICHT erreichen, beide liefern vom
   Sandbox-Proxy ein `403` als bewusste Org-Policy-Sperre, siehe
   `/root/.ccr/README.md`: "do not retry organization policy denials" -
   Live-Daten-Fetches fuer dieses Projekt sind daher AUSSCHLIESSLICH ueber
   den echten GitHub-Actions-Runner moeglich, nicht durch einen manuellen
   Fetch-Versuch aus dieser Sandbox ersetzbar, exakt wie im bestehenden
   CLAUDE.md-Grundsatz "Netzwerk in dieser Sandbox ist eingeschraenkt"
   oben schon dokumentiert).

### Bugfix: "Rate Probabilities" landete als eigener Top-Level-Tab statt im Insights-Dropdown (Nutzer-Foto 2026-07-20)

Nutzer schickte einen Screenshot der LIVE-Seite (jo-brxxn.github.io):
"Rate Probabilities" erschien in der Tab-Leiste als EIGENER Button neben
dem "Insights ▸"-Dropdown, nicht als Eintrag darin - Nutzer-Wunsch war
klar, es sollte "in die insights" gepackt werden.

- **Ursache:** `renderTabBar()` rendert einen Tab nur dann als Eintrag
  IM Stack-Dropdown, wenn `stackOf(id)` einen Treffer liefert - findet
  sich die ID in KEINEM `tabStacks[].members`-Array, faellt sie auf den
  `else`-Zweig zurueck und wird als eigener Top-Level-Button gerendert.
  Die urspruengliche Migration in `loadTabStacks()` (`ins4`) fügte `'rate'`
  nur dann ein, wenn irgendein Stapel bereits `'data'` enthielt - bei
  diesem Bestandsnutzer (oder generell bei jedem mit einer vom Standard
  abweichenden eigenen Tab-Anordnung, z.B. `'data'` schon einmal aus dem
  Insights-Stapel herausgezogen) griff dieser Anker nicht, `'rate'` landete
  dadurch in KEINEM Stapel.
- **Fix:** neuer Fallback direkt nach der `ins4`-Migration - ist `'rate'`
  nach allen vier spezifischen Migrationen immer noch in keinem Stapel,
  wird es in JEDEN Stapel gepackt, der mindestens eines der bekannten
  Analyse-Tab-Mitglieder (`cot`/`data`/`sent`/`seas`/`trends`) enthaelt,
  statt sich auf genau einen Anker (`'data'`) zu verlassen. Per Playwright
  gegen drei Szenarien verifiziert: (1) Bestandsnutzer-Stapel ohne `'data'`
  (genau der gemeldete Bug) - `'rate'` landet jetzt korrekt im Insights-
  Stapel; (2) normaler Fall mit `'data'` im Stapel - unveraendertes
  Verhalten; (3) komplett neuer Nutzer ohne `tabStacks`-Eintrag - Default
  greift wie gehabt. Selbstheilend beim naechsten Laden, keine manuelle
  Nutzer-Aktion noetig.
- **Merksatz:** bei kuenftigen neuen Tabs, die nachtraeglich in einen
  bestehenden Stack einsortiert werden sollen, IMMER einen stapel-weiten
  Fallback (nicht nur einen einzelnen Anker-Tab) vorsehen - Bestandsnutzer
  koennen durch fruehere manuelle Umsortierung/Feature-Historie von der
  angenommenen Standard-Struktur abweichen.

### Farbaudit-Rueckbau: gedaempfte Balken ueberall wieder auf volle Deckkraft (Nutzer-Wunsch 2026-07-20, per Foto)

Nutzer-Screenshot (COT-Tab, "Net Long/Short %"-Karte): die im "Farbaudit
Runde 1" (siehe Eintrag oben, 2026-07-19) eingefuehrte Balken-Daempfung
(`opacity:.6`-artig, "weniger Vollflaechen") wird nicht mehr gewuenscht -
"Ich will das du das wieder ueberall rueckgaengig machst". Alle
betroffenen Stellen zurueckgesetzt:

- `.cot-bar-long`/`.cot-bar-short` (COT-Tab Net Long/Short, ≈ Zeile 560):
  `opacity:.65` entfernt.
- `.rank-bar` (Dashboard Currency-Strength-Widget, ≈ Zeile 736),
  `.mx-rank-bar` (Matrix-Tab, ≈ Zeile 535), `.risk-asset-bar` (Risk-
  Sentiment-Widget, ≈ Zeile 782): `opacity:.6` je entfernt.
- `renderNetFlowChart()` Balken (≈ Zeile 10605): `opacity="0.6"` zurueck
  auf `0.9` (Original-Wert vor dem Audit).
- `seasBarChart()` Monatsbalken (≈ Zeile 10831): Nicht-aktueller-Monat
  zurueck von `.6` auf `.8` (aktueller Monat bleibt bei `.92`, war vom
  Audit nicht betroffen).
- Retail-Sentiment Long/Short-Split-Balken (`renderRetailBars()`,
  ≈ Zeile 10500): `opacity:.62` entfernt.
- `rateProbBarHtml()` (der am selben Tag neu gebaute Rate-Probabilities-
  Balken, siehe Eintrag oben) hatte bewusst dieselbe gedaempfte Konvention
  uebernommen - ebenfalls zurueckgesetzt, damit die Balken app-weit wieder
  einheitlich volle Deckkraft haben (Grundsatz "wiederkehrende UI-
  Bausteine muessen einheitlich sein" gilt auch rueckwaerts: aendert sich
  die Konvention, zieht das JEDE Stelle nach, auch brandneue).
- Per Playwright verifiziert (`getComputedStyle().opacity`): alle
  genannten Klassen liefern jetzt `1`. Bewusst NICHT angefasst: `.rinfo`
  (Info-Icon-Button-Deckkraft, kein Balken), `.cot-refresh:disabled`
  (Button-Disabled-Zustand), gestrichelte Referenzlinien in Charts - das
  sind keine Balken-Farbdaempfungen im Sinne des Nutzer-Wunsches.
- Bewusst NICHT angefasst (Nutzer bezog sich explizit auf "Balken
  abgedunkelt", nicht auf die anderen Farbaudit-Punkte): `TREND_COLORS`-
  Palette, Dashboard-Banner-Umbau (Gradient→Randstreifen), Retail-Symbol-
  Chip-Taeuung, Logo/Profil-Kreis-Vereinfachung, Radius-Reduktion,
  Aurora/Intro-Aenderungen aus Runde 1+2 - diese bleiben wie im Audit
  umgesetzt, nur die Opacity-Daempfung der Balken wurde zurueckgerollt.

### Rate Probabilities: FRED-Fetch dritte Iteration - "exit 28" Timeout, cosd grenzt ein (2026-07-20, selber Tag)

Dritter `workflow_dispatch`-Testlauf (nach dem `--http1.1`-Fix fuer den
HTTP/2-Fehler): der HTTP/2-Fehler (`exit 92`) war weg, aber JETZT ein
sauberer Timeout (`curl exit 28` = `CURLE_OPERATION_TIMEDOUT`) auf BEIDEN
Versuchen, konstant bei den vollen 30s (`--max-time 30`). Ursache:
`fredgraph.csv?id=EFFR` OHNE Datumsbereich liefert die KOMPLETTE Historie
der Serie seit Beginn (EFFR startet 2016) - das Generieren/Uebertragen
dieser vollen CSV dauert offenbar zu lange. Fix: `&cosd=<heute-120 Tage>`
(FRED-Standardparameter "Chart Observation Start Date") grenzt auf die
letzten 120 Tage ein - mehr als genug fuer den aktuellen Wert, macht die
Antwort winzig und schnell generierbar. Zusaetzlich `--connect-timeout 15`
+ `--max-time` auf 45s angehoben als Sicherheitsmarge. Naechster Testlauf
per `workflow_dispatch` + Job-Log verifiziert das (gleiches iteratives
Vorgehen wie bei den Bond-Yield-Backfills - jeder Fehlercode einzeln
diagnostiziert statt geraten). Die ZQ-Futures-Kurve selbst lief bei
ALLEN drei Testlaeufen fehlerfrei durch, betrifft ausschliesslich den
FRED-EFFR-Teil.

### Professionalitaets-Audit-Rueckbau: entfernte/gedaempfte Animationen wiederhergestellt (Nutzer-Wunsch 2026-07-20)

Nutzer: "Und s gibt auch keine Animationen mehr die die Balken erscheinen
lässt und generell hatten wie viele Animationen entfernt bitte mach das
auch wieder rückgängig" - bezieht sich auf die Bewegungs-Reduktionen aus
dem "Professionalitaets-Audit Runde 2" (2026-07-19, Eintrag oben, Punkt 1+3
"weniger Video-Game"). Per `git show` auf den damaligen Audit-Commit
(8f27068) die exakten Vorher-Werte zurueckgeholt, NUR die Bewegungs-
/Animations-Teile - Globus-Position, Radius-Reduktion, Emoji→Icon-Ersatz
und `tabular-nums` aus demselben Commit bewusst NICHT angefasst (nicht
Teil des Nutzer-Wunsches, waeren zudem teils von spaeteren, gezielteren
Aenderungen ueberholt, z.B. Globus wurde schon einmal zurueckgeholt).

- **Aurora-Hintergrund** (`.aurora-a`/`.aurora-b`/`.aurora-c`): treibt
  wieder endlos (`auroraDrift1/2/3`, 42s/50s/58s, `transform:translate(...)
  scale(...)`). Die `@keyframes` existierten nach der Entfernung gar nicht
  mehr im File, wieder ergaenzt (Werte aus dem alten Commit uebernommen).
  Laeuft jetzt auf der GUENSTIGEN radial-gradient-Struktur (siehe Bugfix-
  Eintrag "Aurora-Hintergrund: harte Kante..." oben) statt der alten
  teuren Blur-Kreisflaeche - `transform`-Animation ist billig (Compositor),
  reisst also NICHT das Performance-Problem wieder auf, das damals zur
  Entfernung fuehrte.
- **Score-Flip-Puls/-Glow** (`flipScorePulse`/`flipGlowSweep`, beim
  Bias-Wechsel eines Symbols): Overshoot zurueck (`scale(1.4)`→`.92`→`1`
  statt gedaempftem `scale(1.06)`), Glow-Sweep wieder staerker (`16px 3px`
  statt `8px 1px`), beide Animationen wieder mit ihrer urspruenglichen
  laengeren Dauer (1.4s/.6s statt 1s/.4s).
- **Score-Pop** (`scorePop`, beim manuellen Bias-Klick): Overshoot zurueck
  (`scale(1.35)` statt `1.08`), urspruengliche Bounce-Kurve
  (`cubic-bezier(.3,1.4,.5,1)` statt `ease-out`).
- **Endlose Puls-Animationen wiederhergestellt** (waren im Audit komplett
  entfernt, nicht nur abgeschwaecht - `@keyframes pulse-badge` existierte
  nicht mehr): `.inbox-badge` (Header-Glocke) und
  `.green-alert-wrap.ga-many .green-alert-icon` (mehrere aktive Alerts)
  pulsieren wieder endlos. `cotNotifyPulse`/`riskEnvNotifyPulse` (die
  beiden Dashboard-Banner "New COT Data!"/"Check Your Risk Environment")
  ebenso - `@keyframes` wiederhergestellt, `animation:...infinite` wieder
  auf `.cot-notify-card`/`.risk-env-notify-card` gesetzt.
- **Intro-Titel-Zoom** (`introTitleIn`): dramatischerer Zoom-In
  (`scale(.62→1)` statt des gedaempften `scale(.94→1)`) - bewusst NUR die
  Skalierung zurueckgeholt, nicht den damals ebenfalls entfernten Glow-
  Filter (`drop-shadow`)/die Gradient-Textfarbe, da das eher Farb-/Stil-
  Entscheidungen aus dem Audit sind als "Animation" im engeren Sinne des
  Nutzer-Wunsches.
- **Nicht gefunden / nicht angefasst:** eine explizite "Balken wachsen beim
  Erscheinen rein"-Animation für die einfachen Prozent-Balken (Dashboard
  Currency-Strength `.rank-bar`, Risk-Sentiment `.risk-asset-bar`) liess
  sich per `git log -S` NICHT in der Historie finden - diese Balken hatten
  nie eine eigene Eintritts-Animation (nur `transition:width` fuer spaetere
  Updates, seit jeher). Die Matrix-Tab-Zeilen (`.mx-rank-row`, enthaelt
  `.mx-rank-bar`) haben dagegen bereits eine gestaffelte Eintritts-
  Animation (`list-in`/`listRowIn`, `animation-delay:${i*45ms}`) - die war
  nie entfernt, existiert unveraendert. Falls der Nutzer eine bestimmte,
  jetzt fehlende Balken-Animation an einer konkreten Stelle meint, die
  hier nicht identifiziert wurde: gezielt nachfragen WO genau, statt eine
  neue Animation zu erfinden (waere kein "Rueckgaengigmachen" mehr,
  sondern ein neues Feature).
- Per Playwright verifiziert: `getComputedStyle().animationName` liefert
  `auroraDrift1` auf `.aurora-a` und `pulse-badge` auf `#inboxBadge` nach
  dem Fix (vorher: `none`). Voller 14-Tab-Regressionstest weiterhin ohne
  JS-Fehler.

### Rate Probabilities: FRED komplett gegen die NY Fed Markets Data API ausgetauscht (2026-07-20, 4. Iteration)

Vierter `workflow_dispatch`-Testlauf (nach `--http1.1` + `cosd`-Eingrenzung):
weiterhin `curl exit 28` (Timeout) auf BEIDEN Versuchen, jetzt mit 45s
Timeout - und beide Versuche haengen exakt bis zur vollen `--max-time`-
Grenze fest (0 Bytes, `http=000`, keine Server-Antwort ueberhaupt, nicht
mal ein abgelehntes TCP/TLS-Handshake). Vier verschiedene, gezielte Fixes
(HTTP-Version, Datumsbereich, Timeout-Dauer) haben das Problem NICHT
gelöst - das deutet nicht mehr auf ein Konfigurationsproblem hin, sondern
auf einen harten Netzwerk-Stillstand speziell gegen `fred.stlouisfed.org`
von GitHub-Actions-IP-Bereichen aus (die ZQ-Futures-Kurve von TradingView
kam bei ALLEN 4 Laeufen sofort und fehlerfrei an - kein generelles
Netzwerkproblem des Runners, sondern spezifisch FRED).

**Fix: komplett auf die NY Fed Markets Data API umgestellt**
(`https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json`) -
das ist die PRIMAERE Quelle fuer den EFFR (die NY Fed veroeffentlicht ihn
selbst taeglich, FRED spiegelt ihn nur), oeffentlich erreichbar, KEIN
API-Key noetig, aber ein voellig anderer Host/CDN als FRED - falls der
Stillstand tatsaechlich FRED-spezifisch ist (WAF/Bot-Schutz gegen Cloud-
Datacenter-IP-Bereiche, wie es andere Finanzseiten teils auch machen, vgl.
CBOE/Investing.com-Cloudflare-Faelle oben), sollte dieser andere Host
davon nicht betroffen sein. JSON statt CSV (`refRates[0].percentRate`),
node-Parsing entsprechend vereinfacht. Naechster Testlauf per
`workflow_dispatch` verifiziert das. **Falls auch das blockt:** naechster
Schritt waere FREDs offizielle `api.stlouisfed.org`-API (braucht einen
kostenlosen API-Key - nach dem Grundsatz oben "kostenloses Konto ist kein
Abbruchgrund" waere das der naechste Versuch, nicht das Aufgeben der
Live-Berechnung).

### Dual-Source-Bug erneut aufgetreten - diesmal auf dem ANZEIGE-Pfad statt Bias/Score (Bugreport 2026-07-20)

Nutzer: "EUR ppi zeigt anderen Wert als die Grafik dadrunter welcher isr
richtig?" - Karte zeigte Actual 1.8%/Previous 2.2%, Chart darunter Actual
5.9%/Forecast 5.7% fuer denselben Release. **Antwort: der Chart war
richtig.**

- **Ursache:** exakt derselbe Dual-Source-Konflikt wie beim vorherigen
  EUR-Score-Flip-Bugreport (siehe Eintrag oben "zwei konkurrierende Live-
  Quellen") - ein Kalender-Event "PPI YoY" mit Datum HEUTE (2026-07-20)
  war unter der Waehrung EUR einsortiert, obwohl es inhaltlich vermutlich
  ein deutsches Landesrelease ist (Actual 1.8%, klar verschieden vom
  echten Eurozone-Aggregat-Feed-Wert 5.9% vom 2026-07-06). Der damalige
  Fix gab dem TradingView-Feed (`ind.research.feed===true`) volle
  Exklusivitaet gegenueber dem Kalender-Pfad - aber NUR in
  `syncIndicatorBiases()` (Bias/Werte-Historie/Trend). VIER weitere
  Stellen riefen `findIndEvent()` weiterhin unabhaengig und ohne Wissen
  von dieser Exklusivitaetsregel auf und zeigten deshalb weiterhin den
  falschen Kalender-Treffer an, obwohl der Score/Bias laengst korrekt vom
  Feed kam:
  1. `renderInd()` (≈ Zeile 5810, die Indikator-Karte selbst) -
     `if(ev){...}else if(ind.research){...}` bevorzugte `ev` bedingungslos.
  2. `symScoreDrivingEventsByDate()` (≈ Zeile 3001, History-Panel/🕰️) -
     pruefte `findIndEvent()` VOR dem `r.feed`-Fallback.
  3. `syncIndNotifs()` (≈ Zeile 3714, Postfach-Benachrichtigungen) - haette
     bei einem neuen (falschen) Kalender-Match eine irrefuehrende Meldung
     mit falschem Wert erzeugt.
  4. `cmpCellData()` (≈ Zeile 8792, Compare-Tab) - der Code-Kommentar sagte
     sogar woertlich "exakt dieselbe Quelle/Prioritaet wie die Detailkarte"
     - stimmte, aber die Detailkarte hatte zu dem Zeitpunkt selbst noch
     den Bug.
- **Fix:** an allen vier Stellen dieselbe Regel wie in
  `syncIndicatorBiases()` ergaenzt - ist `ind.research.feed===true`, wird
  `findIndEvent()` gar nicht erst aufgerufen (Karte/Compare-Tab: `ev=null`
  erzwungen) bzw. der Feed-Wert VOR dem Kalender-Fallback geprueft
  (History-Panel/Notifications, die `ind.research` bereits als Fallback
  kannten, aber in der falschen Reihenfolge). Bei den Notifications
  zusaetzlich ein synthetisches Event aus `ind.research` gebaut (statt die
  Meldung fuer feed-abgedeckte Indikatoren komplett zu unterdruecken) -
  sonst haetten viele Indikatoren (PPI, GDP, PMI, Consumer Confidence, ...)
  gar keine Release-Benachrichtigungen mehr bekommen, das waere eine
  Funktions-Regression gewesen, keine reine Bugfix.
- Per Playwright verifiziert: Karte, History-Panel, Compare-Tab zeigen
  jetzt konsistent 5.9%/5.7%/4.9% (identisch zum Chart). Voller
  Tab-Regressionstest weiterhin ohne JS-Fehler.
- **Merksatz (Ergaenzung zum bereits bestehenden Merksatz oben):** wird
  einer Datenquelle Exklusivitaet gegenueber einer konkurrierenden Quelle
  eingeraeumt, IMMER nach ALLEN Aufrufstellen der konkurrierenden Quelle
  suchen (hier: `grep -n "findIndEvent("`), nicht nur der einen Stelle, an
  der der urspruenglich gemeldete Bug auftrat - Score/Bias und Anzeige
  sind oft getrennte Code-Pfade, die dieselbe Regel unabhaengig
  respektieren muessen.

### Rate Probabilities: 5. Testlauf lief endlich durch, aber Sitzungs-Deltas unplausibel - Berechnung stabilisiert (2026-07-20)

Fuenfter `workflow_dispatch`-Testlauf (NY-Fed-Quelle statt FRED): **endlich
Erfolg** - `rate_probabilities.json` wurde zum ersten Mal geschrieben,
EFFR=3.63% korrekt gelesen, alle 14 ZQ-Kontrakte kamen an. ABER: die
berechneten Sitzungs-Deltas oszillierten unplausibel -
`Jul29:-4bp, Sep16:+30bp, Oct28:-81bp, Dec9:+122bp` - obwohl die
zugrunde liegende Monats-Durchschnittskurve selbst glatt und gleichmaessig
steigend war (Jul 3.63% → Aug 3.665% → Sep 3.73% → Okt 3.81% → Nov 3.87%
→ Dez 3.94% → Jan 3.97%). Kein reales Marktpreis-Szenario wuerde
meeting-zu-meeting derart wilde Ausschlaege zeigen (+122bp nach -81bp
in aufeinanderfolgenden Sitzungen ist praktisch unmoeglich).

- **Ursache:** die Verkettungs-Formel (`R_nachher` einer Sitzung wird zu
  `R_vorher` der naechsten) ist numerisch instabil, wenn eine Sitzung nahe
  am Monatsende liegt - die Sitzung Jul 28-29 hat nur 2 Tage "danach" von
  31 Tagen im Monat. Da die Formel durch dieses "after"-Fenster teilt,
  wird jede kleine Ungenauigkeit im Kontraktpreis um den Faktor
  `Tage_im_Monat/Tage_danach` verstaerkt (hier: ~15,5x) - UND dieser
  verstaerkte Fehler wird zum Ausgangswert der naechsten Sitzung, pflanzt
  sich also durch die ganze Kette fort und akkumuliert.
- **Fix:** wo ein Kalendermonat OHNE eigene Sitzung zwischen zwei
  Sitzungen liegt (hier: August zwischen Jul29 und Sep16, November
  zwischen Okt28 und Dez9), ist dessen Monats-Durchschnitt ein SAUBERER
  DIREKTER Messwert fuer den zu dem Zeitpunkt geltenden Zins - kein
  Meeting in diesem Monat heisst kein Zinswechsel, der komplette
  Monats-Durchschnitt MUSS also gleich dem konstanten Zins sein, ganz
  ohne Tageszahl-Gewichtung noetig. Dieser saubere Wert wird jetzt bevorzugt
  genutzt statt der fehleranfaelligen Herleitung aus der vorherigen
  Sitzung, wann immer ein solcher Monat existiert. Ergebnis nach dem Fix:
  `Jul29:-4bp, Sep16:+14bp, Oct28:+6bp, Dec9:+10bp` - ein gleichmaessig
  leicht steigender Pfad, konsistent mit der beobachteten glatten Kurve.
  Per Node-Testskript lokal nachgerechnet und gegen die echten Kurswerte
  aus dem 5. Testlauf verifiziert (siehe Session), bevor es in den
  Workflow uebernommen wurde.
- **Kein neuer Live-Testlauf noetig, um dies zu verifizieren** (die
  Eingabedaten - EFFR + ZQ-Kurve - kamen bereits real an, nur die
  Ableitungs-Formel wurde korrigiert; die Rechnung selbst ist deterministisch
  und wurde lokal mit den echten, bereits abgerufenen Werten nachvollzogen).
  Naechster stuendlicher Lauf schreibt die korrigierten Werte automatisch.
- **Merksatz:** bei tageszahl-gewichteten Ableitungen aus Monats-
  Durchschnitten IMMER pruefen, ob ein "sauberer" (nicht-abgeleiteter)
  Referenzpunkt existiert, BEVOR eine fehleranfaellige Verkettung/Division
  durch ein kleines Zeitfenster genutzt wird - besonders wenn das Ergebnis
  als Eingabe fuer eine weitere Ableitung dient (Fehlerfortpflanzung).
  Plausibilitaets-Check ("wuerde ein echter Markt das so einpreisen?")
  haette diesen Bug schon vor dem ersten Live-Testlauf auffangen koennen -
  fuer kuenftige neue Berechnungs-Features immer einen Sanity-Check der
  Ergebnisgroessenordnung einbauen, nicht nur auf "der Code lief ohne
  Fehler durch" vertrauen. **Update:** der naechste stuendliche Lauf hat
  die stabilisierte Formel bestaetigt - `rate_probabilities.json` zeigt
  jetzt durchgehend die plausiblen Werte (-4/+14/+6/+10bp), Feature ist
  fertig und live.

### Drei Rendite-Indikatoren von Interest Rates in die Inflation-Karte umgezogen (Nutzer-Wunsch 2026-07-20)

Nutzer: "ich will das du das dreipack mit den drei Indikatoren zu yields
aus der arte interest rate rausnimmst und in die Karte Inflation
reinpackst. An die letzte Stelle bitte und überall." - gemeint sind
`2Y Bond Yield`, `10Y Bond Yield`, `2Y/10Y Spread`.

- **Default-Vorlage** (`mkRubs()`, ≈ Zeile 4170): Inflation endet jetzt mit
  den drei Renditen-Indikatoren, Interest Rates hat nur noch `Central Bank
  Rate`/`CB Tone`/`Next CB Move`.
- **`IND_RESEARCH_DATA`** (Recherche-Erstbefuellung, alle 8 Waehrungen):
  `rubric:'Interest Rates'` auf `rubric:'Inflation'` fuer die drei
  Indikatoren umgestellt (24 Fundstellen, per `sed`), damit
  `applyIndResearch()` sie in der richtigen Karte findet.
- **Migration fuer Bestandsnutzer**: neue Funktion
  `moveYieldIndsToInflation(rubrics)` (≈ Zeile 4294, direkt nach
  `migrateRiskEnvRub`) verschiebt die drei Indikator-OBJEKTE (nicht neu
  erzeugt - Bias/Notizen/Recherche-Werte/Verlaufshistorie bleiben
  erhalten) ans Ende von Inflation. Eingehaengt an beiden Stellen, die
  laut der "WICHTIGSTE REGEL" oben fuer sowas noetig sind:
  `migrateRubInds()` (normaler Boot-Pfad) UND `applySnap()` (Cloud-Pull/
  Undo/Redo/Backup-Restore, die NICHT durch migrateRubInds laufen - exakt
  dasselbe Muster wie `stripGeopoliticsRub`/`migrateRiskEnvRub` dort).
  Idempotent: nach der ersten Ausfuehrung sind die Indikatoren nicht mehr
  in Interest Rates, ein erneuter Lauf findet nichts und tut nichts.
- **Score-Verhalten bewusst UNVERAENDERT** (reine Karten-Umsortierung,
  keine Scoring-Regel-Aenderung): der Nutzer-Entscheid vom 05.07.
  ("Bond-Renditen bekommen keinen Trend-Bonus") war bisher ueber
  `NO_TREND_RUBS=new Set(['Interest Rates'])` RUBRIK-basiert geprueft
  (`indScoreParts()`, ≈ Zeile 2140) - haette die Renditen nach dem Umzug
  in die Inflation-Karte faelschlich einen Trend-Bonus bekommen lassen.
  Fix: zusaetzlich direkt `BOND_HALF_PT.has(ind.name)` geprueft (indikator-
  statt rubrik-basiert) - sowohl in `indScoreParts()` als auch im Trend-
  Chip-Anzeige-Gate in `renderInd()` (≈ Zeile 5929). Per Playwright
  verifiziert: Gesamt-Score eines Symbols vor/nach der Migration exakt
  identisch (1.5 → 1.5), nur die Karten-Zuordnung aendert sich.
  `SCORE_ZERO`/`BOND_HALF_PT`/`indIsHalfWeight` waren schon vorher
  indikator- statt rubrik-basiert (keine Aenderung noetig), ebenso
  `IND_AUTO_RUBS`/`MACRO_SYNC_RUBS`/`MACRO_DERIVE_RUBS`/`NONFX_RUB_DERIVE`
  (enthalten/behandeln beide Rubriken ohnehin identisch) und
  `applyBondDataFeed()` (matcht ueber Indikator-Name quer durch alle
  Rubriken, nie rubrik-spezifisch).
- Per Playwright verifiziert: frischer Nutzer bekommt die neue Struktur
  direkt: Migrations-Test mit einem simulierten Alt-Layout (Renditen noch
  in Interest Rates, mit Test-Bias/Notizen versehen) zeigt nach
  `moveYieldIndsToInflation()` die Indikatoren korrekt in Inflation MIT
  erhaltenen Bias-/Notiz-Werten. Voller 15-Tab-Regressionstest weiterhin
  fehlerfrei.

### CSV-Export komplett entfernt (Nutzer-Wunsch 2026-07-20)

Nutzer: "entfern alle csv Button und den Code dazu das brauch ich nicht" -
das am 2026-07-16 eingefuehrte CSV-Export-Feature (Trends-Tab
Score-Historie, COT-Tab Positionierungs-Historie, Insights>Data
Indikator-Historie) wurde komplett entfernt: alle drei Buttons aus dem
HTML/Template-Code, die Funktionen `dlCSV()` (generischer Downloader),
`dlTrendsCSV()`, `dlCotCSV()`, `dlDataTabCSV()`, sowie das dadurch
ungenutzt gewordene `csv`-SVG-Icon aus `ICONS`. Per Playwright verifiziert:
alle vier Funktionsnamen sind `undefined`, kein "CSV"-Text mehr irgendwo
im gerenderten DOM ueber alle 15 Tabs, keine JS-Fehler.

### Rate Probabilities komplett neu gebaut: CME-FedWatch-Optik + gleitender Linien-Chart (Nutzer-Wunsch 2026-07-20, per Foto)

Nutzer schickte einen Screenshot des ECHTEN CME-FedWatch-Tools:
"Mach das in dem Design und dann einfach das mit Linien wie bei den
Trends. Und Mann kann dann oben wechseln für Meeting und die Grafik ist
dann aber nicht neu sondern bewegt sich soweit nach rechts das das
nächste Meeting Datum kommt." Nach einer Rückfrage (welche Grösse die
Linie zeigen soll) praezisiert: "Ne damit soll sich die Grafik direkt zu
den Meetings verschieben. Also es gibt dann den Button today und die
Buttons mit den nächsten drei kommenden Meetings wo auch das Datum
steht. Es soll auch wie bei der Karte interest Rates ein link zu dem cme
watch Tool geben. Und ein Countdown bis zum nächsten Meeting brauche
ich."

Die alte Version (Meeting-Karten mit horizontalen Hike/Hold/Cut-Balken +
separater Dropdown-History-Chart) komplett ersetzt durch:

- **Meeting-Pillen** (`.rateprob-pillbar`, CME-Optik: runde Buttons in
  einer Reihe): "Today" + ein Button pro anstehendem Meeting mit
  Kurz-Datum (z.B. "29 Jul"), volles Label als `title`-Tooltip. Aktive
  Pille farblich hervorgehoben.
- **EIN durchgehender Linien-Chart** (`rateProbTimelineChart()`) statt
  einzelner Balken je Sitzung: X-Achse = Today + Meetings mit FESTEM
  Slot-Abstand (`RATEPROB_SLOT=170px`, index-basiert wie bei den Trends-
  Charts, nicht kalendertag-proportional), Y-Achse = impliziter Fed-Funds-
  Satz in % (verkettete `rateBefore`/`rateAfter`-Werte aus
  `rate_probabilities.json`). Hover/Tap auf einen Punkt zeigt Datum +
  impliziten Satz + die Hike/Hold/Cut-Aufschluesselung (`probsFromDelta`)
  als Tooltip - die Wahrscheinlichkeits-Info geht dadurch nicht verloren,
  steckt nur nicht mehr in der Balkenbreite selbst.
- **Pillen bewegen den Chart, statt ihn neu zu rendern**
  (`scrollRateProbTo(idx)`): der SVG-Chart ist BREITER als der sichtbare
  Ausschnitt (`.rateprob-chart-viewport{overflow:hidden}`), ein innerer
  Track (`.rateprob-chart-track`) wird per `transform:translateX(...)` mit
  CSS-Transition (0,5s) zum gewaehlten Punkt verschoben - derselbe SVG-
  DOM-Knoten bleibt bestehen (per Playwright verifiziert: ein Test-Marker
  auf dem Track-Element ueberlebt den Pillen-Klick), es gibt keinen
  Re-Render-Flackerer. **Bewusst KEIN natives Scrollen/Wischen** auf dem
  Viewport - deckt sich mit dem bereits bestehenden App-Grundsatz "Charts
  dürfen NICHT horizontal wegwischbar sein" (siehe Cross-Cutting-UI-Regeln
  oben) - die Bewegung ist ausschliesslich ueber die Pillen steuerbar.
- **Countdown + CME-Link**: Tage bis zum naechsten FOMC-Meeting
  (`daysUntil()`, bereits bestehender App-Helper) + ein Link im selben
  `.rate-watch`-Stil wie auf der Interest-Rates-Karte, Ziel
  `RATE_WATCH.USD` (die echte CME-FedWatch-URL, dieselbe Konstante wie
  dort - kein Duplikat).
- Per Playwright verifiziert (420px schmale Ansicht simuliert Handy):
  Pillen/Countdown/Link/Chart rendern korrekt, Klick auf eine spaetere
  Pille verschiebt den sichtbaren Ausschnitt sichtbar nach rechts
  (Screenshots vor/nach verglichen), Hover-Tooltip zeigt Datum + Prozente,
  voller 15-Tab-Regressionstest weiterhin fehlerfrei.

### Rate Probabilities: EINE Linie war falsch, Nutzer will MEHRERE (kumulative Wahrscheinlichkeitsverteilung) (2026-07-20, selber Tag)

Nutzer-Korrektur direkt nach der obigen Umstellung: "Ich will doch mehrere
Linien die die warscheinligkeit für die jeweiligen Ausgänge des meetings
zeigen. Eine Linie soll angezeigt werden wenn die warscheinligkeit für
einen Ausgang über 1% liegt. Deswegen gibt es auch auf der Seite die
Balken also mehrere davon" - die EINE Linie (impliziter Zinspfad) hatte
genau die Information versteckt, die CMEs eigenes Mehr-Balken-Chart pro
Sitzung zeigt (bei weiter entfernten Sitzungen typischerweise MEHR als 2
Balken, weil sich Unsicherheit ueber mehrere Sitzungen aufsummiert).

- **Neue Funktion `rateProbDistTimeline(meetingsWithData)`** (≈ Zeile
  10972): verkettet (convolved) die bereits vorhandene Zwei-Stufen-
  Verteilung JEDER Sitzung (`probsFromDelta(deltaBp)`, unveraendert) zu
  einer KUMULATIVEN Verteilung ueber ALLE Sitzungen hinweg. Level = Basis-
  punkte relativ zum HEUTIGEN Zins (nicht relativ zur jeweils vorherigen
  Sitzung) - dadurch bleibt "Hold" z.B. ueber alle Sitzungen hinweg
  dieselbe vergleichbare Linie. Reines Client-seitiges Post-Processing
  der bereits abgerufenen `meetings[].deltaBp`-Werte - KEINE Workflow-
  Aenderung noetig, kein erneuter `workflow_dispatch`-Testlauf noetig.
- **Vereinfachung bewusst im Info-Text dokumentiert**: die Verkettung
  nimmt an, dass sich die lokale Zwei-Stufen-Aufteilung EINER Sitzung
  nicht je nach Vorgeschichte (welcher Zweig/welche Vorentscheidung)
  aendert - eine wirklich zweig-spezifische Neuberechnung braeuchte
  optionen-implizite Daten, die frei nicht verfuegbar sind (bereits an
  anderer Stelle als Limitierung dokumentiert).
- **`rateProbTimelineChart(pts,distTimeline)`** zeichnet jetzt pro
  Level (Basispunkt-Stufe) eine EIGENE Linie, aber NUR durch die
  Abschnitte, in denen die Wahrscheinlichkeit ueber 1% liegt (Nutzer-
  Vorgabe woertlich umgesetzt) - fehlt ein Level an einer Sitzung unter
  der Schwelle, entsteht eine Luecke statt eines durchgezogenen
  Segments. Farbe nach Richtung (`rateProbLineColor`: Hold=BC.neu,
  Hikes=BC.bull-Toene, Cuts=BC.bear-Toene, dunklere Schattierung fuer
  groessere Bewegungen), Beschriftung direkt am Linienende statt einer
  separaten Legende (skaliert auf beliebig viele gleichzeitig sichtbare
  Linien, ohne Farbpalette-Kollisionen zu riskieren).
- Per Handrechnung UND per Node-Testskript mit den echten Live-Daten
  (deltaBp -4/+14/+6/+10) gegengeprueft, exakt uebereinstimmend: nach
  Sitzung 1 zwei Level (Hold 84%/-25bp 16%), nach Sitzung 4 fuenf Level
  (Hold 24,1% / +25bp 42,7% / +50bp 25,5% / +75bp 4,5% / -25bp 3,2%) -
  alle ueber der 1%-Schwelle, zeigt also plausibel bei allen vier
  Sitzungen mehrere Linien. Per Playwright verifiziert: `<path>`/
  `<circle>`-Anzahl im SVG stimmt exakt mit der von Hand vorhergesagten
  Segment-/Punkt-Anzahl ueberein, alle 5 erwarteten Linien-Labels im DOM
  vorhanden, voller Tab-Regressionstest weiterhin fehlerfrei.

### Rate-Probabilities-Mehrlinien-Chart: Label-Ueberlappung + abgeschnittener Tooltip (Bugreport 2026-07-20, per Screenshot)

Nutzer schickte einen Screenshot der Live-Seite: beim letzten Meeting
("Dec 8-9, 2026") ueberlappten sich die Endpunkt-Labels "Hold"/"+50bp" und
separat "+75bp"/"-25bp" unlesbar, und der Hover-Tooltip "Hold: 100.0%" am
Today-Punkt war am oberen Kartenrand abgeschnitten/unsichtbar. Dazu die
explizite, als DAUERHAFT formulierte Vorgabe: "Es duerfen niemals Elemente
ueberlappen sodass man etwas nicht sehen kann" (jetzt als eigener
Cross-Cutting-Grundsatz weiter oben dokumentiert).

- **Label-Ueberlappung:** `rateProbTimelineChart()` platzierte das
  Endpunkt-Label jeder Basispunkt-Linie unabhaengig auf der Roh-Y-Koordinate
  ihres letzten sichtbaren Punkts - lagen zwei Linien am selben X (meist der
  letzte Punkt) prozentual nah beieinander, ueberlappten sich ihre Labels.
  Fix: alle Endpunkt-Labels werden gesammelt und nach ihrem X-Index (Punkt,
  an dem sie enden) gruppiert; innerhalb jeder Gruppe nach Y sortiert und ein
  Mindestabstand (13px) erzwungen (spaetere Labels werden nach unten
  verschoben, falls zu nah am vorherigen) - genau das Kollisions-Vermeidungs-
  Muster, das jetzt als generischer Grundsatz weiter oben dokumentiert ist.
- **Abgeschnittener Tooltip:** `.rateprob-chart-viewport{overflow:hidden}`
  (fuer die Slide-Navigation zwischen Meetings noetig) schnitt den
  Hover-Tooltip (`.chv-tip`, rendert per `transform:translate(-50%,
  calc(-100% - 10px))` OBERHALB seines Ankerpunkts, braucht ~45-55px
  Kopf-Freiheit) ab, wenn der Ankerpunkt nahe am oberen SVG-Rand lag (Today/
  Hold=100% ist der hoechste Punkt im ganzen Chart, `padT` war nur 20px).
  Fix: `padT` von 20 auf 56 erhoeht (Chart-Hoehe entsprechend von 230 auf
  266, damit die eigentliche Plot-Flaeche gleich gross bleibt) - schafft
  genug Innen-Freiheit im SVG-eigenen Koordinatensystem, OHNE die geteilte
  `chartHoverWrap()`/`attachChartHovers()`-Funktion selbst anzufassen (die
  wird app-weit von vielen anderen Charts genutzt, eine Aenderung dort haette
  ein deutlich hoeheres Regressionsrisiko gehabt als eine lokale Anpassung
  nur in diesem einen Chart).
- Per Playwright verifiziert: `getBBox()`-Kollisionscheck ueber alle 5
  Endpunkt-Labels bei jedem der 5 Meeting-Fokus-Zustaende (Today + 4
  Sitzungen) liefert 0 Ueberlappungen (vorher: 2 Paare ueberlappend beim
  letzten Meeting); Hover auf den Today/Hold-Punkt zeigt den Tooltip jetzt
  vollstaendig sichtbar (`top`-Koordinate deutlich > 0, nicht mehr negativ/
  abgeschnitten). Voller Tab-Regressionstest weiterhin fehlerfrei.
- **Merksatz:** bei JEDEM neuen Chart/Overlay mit mehreren dynamisch
  positionierten Text-Labels oder einem `overflow:hidden`-Ahnen-Container
  immer explizit pruefen (nicht nur "sieht im Testlauf gut aus"): (1) koennen
  sich zwei Labels bei ungluecklichen Datenwerten ueberlappen (Kollisions-
  Pass einbauen, nicht auf "wird schon nicht passieren" vertrauen), (2) kann
  ein Tooltip/Overlay, das ausserhalb des sichtbaren Elements rendert
  (z.B. oberhalb per negativem Transform), von einem `overflow:hidden`-
  Container abgeschnitten werden (genug Innen-Padding einplanen).

### Rate-Probabilities-Chart: Hover-Tooltip zeigte nur EINE Linie statt aller Ausgaenge (Bugreport 2026-07-20)

Nutzer: "Und bei der Info wird auch nicht alle 3 Linien Info zu gegeben" -
beim Hovern nahe einer Sitzung mit mehreren gleichzeitig sichtbaren
Basispunkt-Linien (z.B. Hold/+25bp/-25bp bei "Oct 27-28, 2026") zeigte das
Tooltip-Fenster nur den Wert der EINEN naechstliegenden Linie, nicht aller.

- **Ursache:** `rateProbTimelineChart()` registrierte bisher einen eigenen
  `chartHoverWrap()`-Punkt PRO (Level, Index)-Kombination. Die geteilte
  `attachChartHovers()`-Logik (≈ Zeile 10228) sucht bei Mausbewegung den
  EINEN Punkt mit dem kleinsten `|fx-Maus_fx|`-Abstand und zeigt nur dessen
  `tip` - lagen mehrere Linien am selben X (Sitzungsdatum), gewann
  zwangslaeufig nur eine davon (die mit dem geringsten Abstand/zuerst im
  Array).
- **Fix:** exakt das bereits etablierte Muster aus `scoreTrendChart()`
  ("All assets"/"FX only"-Trends-Chart, hat identisch dasselbe Mehrlinien-
  Problem und loest es schon so) uebernommen: EIN `hpts`-Eintrag PRO
  X-Position (Today/Meeting) statt pro Linie-Punkt, das Tooltip-Fenster
  listet darin ALLE an diesem Index sichtbaren Level (>1%) zusammen auf
  (jede Zeile in ihrer eigenen Linienfarbe), der Hover-Punkt selbst sitzt
  auf der ersten (niedrigsten Basispunkt-Stufe) mit einem Wert an diesem
  Index.
- Per Playwright verifiziert: Tooltip bei "Jul 28-29, 2026" zeigt beide
  Level (Hold 84,0% + -25bp 16,0%), bei "Dec 8-9, 2026" alle fuenf Level
  (Hold 24,1% / +25bp 42,7% / +50bp 25,5% / +75bp 4,5% / -25bp 3,2%) -
  vorher nur je ein einzelner Wert. Voller Tab-Regressionstest weiterhin
  fehlerfrei.
- **Merksatz:** bei JEDEM neuen Mehrlinien-Chart mit `chartHoverWrap()`
  IMMER das "ein Tooltip-Punkt pro X-Position, listet alle Linien"-Muster
  aus `scoreTrendChart()` verwenden statt einen Hover-Punkt pro Linie zu
  registrieren - sonst zeigt `attachChartHovers()`s Naechster-Punkt-Suche
  bei mehreren Linien am selben X immer nur eine davon (Grundsatz
  "wiederkehrende UI-Bausteine muessen einheitlich sein" gilt auch fuer
  diese Tooltip-Aggregations-Logik, nicht nur fuer die Optik).

### Rate Probabilities: "Today" zeigte trivial nur 1 Linie + fehlende Kennzeichnung vergangener Meetings (Nutzer-Feedback 2026-07-20, per Screenshot vom echten CME-Tool)

Nutzer verglich mit dem echten CME-FedWatch-Tool (Screenshot: Balken-Chart
fuer EIN Meeting mit mehreren Ausgaengen) und fragte: "es gibt heute mehrere
Wahrscheinlichkeiten fuer mehrere Szenarien [...] warum gibt es bei today nur
eine Linie? [...] today ist einfach nicht welche Rate aktuell ist sondern was
die Wahrscheinlichkeit heute [...] ist fuer welche Rate beim naechsten
Meeting. Und wenn das Meeting kommt und die Rate rauskommt soll das
gekennzeichnet sein. Und auch gezeigt werden welche Rate jetzt wirklich
rauskam."

- **Ursache Teil 1 ("Today" trivial):** `rateProbDistTimeline()` startet die
  Verteilungs-Kette bei `dist[0]={0:100}` - der HEUTIGE Zins ist per
  Definition sicher bekannt, es gibt keine "Wahrscheinlichkeit" dafuer, was
  er JETZT ist. Der Chart plottete diesen trivialen Fakt 1:1 am "Today"-
  Index, was sich fuer den Nutzer wie ein Bug anfuehlte, weil er "Today" als
  "heutige Prognose fuer den naechsten Entscheid" verstand (korrekt so) -
  numerisch ist das aber exakt `dist[1]` (die Verteilung NACH dem ersten
  Meeting), nicht `dist[0]`.
- **Fix Teil 1:** `renderRateProb()` baut `distTimeline` jetzt so, dass der
  "Today"-Index dieselben Werte wie das erste Meeting bekommt (`rawDist[1]`
  statt `rawDist[0]`) - ergibt eine flache Linie zwischen "Today" und dem
  ersten Meeting (nichts aendert sich, bis die Sitzung tatsaechlich
  stattfindet), danach faechert sich die Verteilung wie gehabt weiter auf.
- **Ursache/Fix Teil 2 (vergangene Meetings unsichtbar, kein Ergebnis
  gezeigt):** der Workflow filterte Meetings bisher komplett auf
  `d>=today` - ein gerade stattgefundenes Meeting verschwand sofort
  spurlos aus `rate_probabilities.json.meetings`. Neu: `out.pastMeeting`
  (Workflow, ≈ Zeile 2888) berechnet fuer das zuletzt VERGANGENE Meeting
  das tatsaechliche Ergebnis - NICHT geschaetzt, sondern aus der bereits
  bestehenden taeglichen EFFR-Historie (`out.history`, waechst seit
  2026-07-20 einen echten Punkt pro Tag) abgeleitet: EFFR am letzten Tag
  VOR dem Termin vs. am ersten Tag NACH dem Termin, Differenz auf die
  naechste 25bp-Stufe gerundet. Nur gesetzt, wenn echte Historie auf BEIDEN
  Seiten des Termins existiert - kein Backfill, kein Raten (Grundsatz "nie
  Schaetzungen"). Client (`renderRateProb()`/`rateProbTimelineChart()`):
  zeigt diesen einen vergangenen Termin als zusaetzliche Pille ("✓ 17 JUN")
  links von "Today", im Chart als fixer Haekchen-Marker (eigene Referenz -
  sein Basispunkt-Wert bezieht sich auf den Zins VOR JENEM Termin, nicht auf
  heute, deshalb bewusst KEINE Linie durch die Wahrscheinlichkeits-Kette,
  nur ein separater Punkt) mit gestrichelter Trenn-Linie zur Prognose.
- Per Playwright mit synthetisch injiziertem `pastMeeting` verifiziert (auf
  main gibt es noch keinen echten vergangenen Termin seit Feature-Einfuehrung
  - erstes echtes Ergebnis fruehestens nach dem 2026-07-29-Meeting, sobald
  genug EFFR-Historie auf beiden Seiten existiert): Pille + Haekchen-Marker +
  gestrichelte Trennlinie + Tooltip ("✓ +25bp (realized - from NY Fed EFFR)")
  rendern korrekt, Pillen-Navigation/Bounds-Clamping (`rateProbTodayIdx()`)
  funktioniert mit der zusaetzlichen Pille, "Today" zeigt jetzt dieselbe
  Verteilung wie das erste Meeting (flache Linie dazwischen). Voller
  Tab-Regressionstest weiterhin fehlerfrei.

### Rate Probabilities: Vorzeichen-Fehler bei Meetings nahe Monatsende (Bugreport 2026-07-20, Nutzer-Vergleich mit dem echten CME-Tool)

Nutzer verglich meine Sep-16-Zahlen (aus der App: -25bp 7,0% / Hold 45,9% /
+25bp 47,0%) mit dem echten CME-FedWatch-Tool fuer denselben Termin (Ease
0,0% / No Change 36,3% / Hike 63,7%, Zielbaender 350-375: 36,3%, 375-400:
54,4%, 400-425: 9,4%) und fragte "wie kann sich das unterscheiden?". Nach-
rechnung zeigte: auch das JULI-Meeting (Basis fuer die Sept-Kette) war klar
falsch - CME zeigt fuer Jul 29 83,4% Hold/16,6% Hike/0% Ease (impliziert
+4,15bp), meine App hatte live deltaBp=-4 fuer Juli - fast exakt dieselbe
Magnitude, nur mit gedrehtem Vorzeichen. Das war kein Zufall.

- **Ursache:** derselbe Verstaerkungs-Effekt, der schon einmal (siehe Eintrag
  "Rate Probabilities: 5. Testlauf..." oben) fuer die Sitzungs-VERKETTUNG
  gefixt wurde, trat hier INNERHALB des Juli-Meetings selbst auf: Jul 29 hat
  von 31 Tagen im Monat nur 2 Tage "danach" (Jul 30-31) - die tageszahl-
  gewichtete Formel teilt jede Ungenauigkeit im rohen Juli-Kontraktpreis
  durch dieses winzige Fenster, Verstaerkungsfaktor 31/2=15,5x. Eine
  Abweichung von nur ~0,5bp im rohen ZQ-Kontraktpreis (z.B. durch Timing
  zwischen meinem stuendlichen Abruf und CMEs eigenem Snapshot, oder
  normales Kursrauschen) reichte, um das Ergebnis von "leichte Hike-Erwartung"
  auf "leichte Cut-Erwartung" zu drehen. Der vorherige Fix deckte nur die
  KETTE zwischen Sitzungen ab (Rprev aus einem sauberen Zwischenmonat), nicht
  diesen symmetrischen Fall INNERHALB einer einzelnen Sitzung nahe
  Monatsende.
- **Fix:** genau dasselbe Prinzip auf die andere Seite angewendet - existiert
  der Kalendermonat DIREKT NACH dem Meeting (hier: August) und enthaelt
  SELBST kein eigenes Meeting, ist sein Monats-Durchschnitt ein sauberer
  DIREKTER Messwert fuer R_nachher (der Zins aendert sich zwischen der
  Sitzung und dem naechsten Meeting nicht mehr) - wird jetzt bevorzugt
  genutzt statt der verstaerkungsanfaelligen tageszahl-gewichteten Herleitung
  aus dem eigenen (oft kurzen) "Danach"-Fenster.
- Per Node-Testskript mit realistischen Werten verifiziert: der noisy
  Juli-Eigenwert (3,6274, ergab live deltaBp=-4) wird durch den sauberen
  August-Wert (3,6715) ersetzt, ergibt deltaBp=+4 - `probsFromDelta(4)`
  liefert [84%,16%], praktisch identisch zu CMEs echten 83,4%/16,6%.
- **Merksatz:** dieser Verstaerkungs-Effekt (kleine Kontraktpreis-Ungenauigkeit
  wird durch ein kurzes Tage-Fenster geteilt und dadurch vervielfacht) kann an
  ZWEI Stellen auftreten, die getrennt behandelt werden muessen - beim
  Verketten zum NAECHSTEN Meeting (Rprev, zuerst gefixt) UND innerhalb der
  Sitzung selbst, wenn ihr eigenes "Danach"-Fenster im Monat kurz ist (Rafter,
  hier gefixt). Bei kuenftigen Aenderungen an dieser Formel immer beide
  Richtungen pruefen, nicht nur eine.

### Rate Probabilities: History wurde gesammelt, aber nie angezeigt (Bugreport 2026-07-21)

Nutzer, nach Bestaetigung dass der Vorzeichen-Fix live ist: "Gibt trotzdem
keine Historie" - `rate_probabilities.json.history` sammelt seit 2026-07-20
zuverlaessig einen echten Snapshot pro Tag (verifiziert: am 2026-07-21 bereits
2 Eintraege), aber die App hatte dafuer nie eine Ansicht gebaut - das Feld
wurde nur ins `RATE_PROB_DATA`-Objekt geladen, aber in keiner Render-Funktion
je gelesen (`grep` auf `RATE_PROB_DATA.history` fand ausser dem Fetch keine
Fundstelle).

- **Fix:** neue Karte "Forecast history for [Meeting]" unter dem Haupt-Chart
  (`rateProbMeetingHistChart()`, `#rateProbHistCard`) - zeigt, wie sich die
  LOKALE Zwei-Stufen-Aufteilung (`probsFromDelta`) fuer GENAU DAS gerade per
  Pille ausgewaehlte Meeting Tag fuer Tag entwickelt hat (bewusst nicht die
  kumulierte Verteilung ueber mehrere Sitzungen wie im Haupt-Chart - hier soll
  die Entwicklung EINER Sitzung isoliert sichtbar sein, unabhaengig davon ob
  sich fruehere Sitzungen zwischenzeitlich aufgeloest haben). Mehrlinien-
  Rendering (>1%-Schwelle, Label-Kollisionsvermeidung, kombiniertes
  Pro-Tag-Tooltip das alle sichtbaren Level auflistet) folgt exakt demselben
  Muster wie der Haupt-Chart (`rateProbTimelineChart`)/`scoreTrendChart` -
  CLAUDE.md-Grundsatz "wiederkehrende UI-Bausteine muessen einheitlich sein".
  Zeitraum-Filter nutzt den bereits bestehenden `TIME_RANGES`/
  `timeRangeBarHtml()`-Helper (kein neuer eigener Filter gebaut).
- **Eigenstaendiges Update statt volles Rebuild:** `updateRateProbHistCard()`
  wird sowohl beim initialen Render als auch bei JEDEM Pillen-Klick
  (`scrollRateProbTo()`) aufgerufen und ersetzt NUR den Inhalt von
  `#rateProbHistCard` - der Haupt-Chart-DOM-Knoten (samt Slide-Animation)
  wird dabei nicht angefasst, exakt das bereits etablierte Prinzip aus der
  urspruenglichen Feature-Umsetzung ("die Grafik bewegt sich, wird nicht neu
  gerendert").
- Zeigt "Not enough history yet" solange <2 Tage vorliegen (aktuell der Fall
  auf main, erst 2 Tage seit Feature-Start) - per Playwright mit
  synthetisch injizierter 14-Tage-Historie verifiziert: Mehrlinien-Rendering,
  Label-Kollisionsfreiheit, kombiniertes Tooltip pro Tag, Pillen-Wechsel
  aktualisiert die Karte korrekt auf das neu gewaehlte Meeting, alle 8
  Zeitraum-Filter-Buttons klickbar ohne Fehler. Voller Tab-Regressionstest
  weiterhin fehlerfrei.

### Rate Probabilities: History wieder umgebaut - jetzt nahtlos in den Haupt-Chart integriert statt separate Karte (Nutzer-Korrektur 2026-07-21)

Nutzer, direkt nach dem Bau der separaten "Forecast history"-Karte: "Die
Historie soll auch oben mit in die Grafik rein" - die getrennte Karte
unterhalb des Meeting-Charts war nicht das gewuenschte Ergebnis, die
Historie sollte stattdessen Teil DESSELBEN Charts sein, direkt links an
"Today" angehaengt.

- **Design:** `rateProbBuildPts(D)` (neuer zentraler Helfer, ersetzt das
  alte `rateProbTodayIdx()`) haengt links an "Today" die taegliche Historie
  des NAECHSTEN Meetings an. Mathematisch saubere Anschlussstelle: `dist[1]`
  (kumulierte Verteilung nach dem ersten Meeting, ausgehend von der
  trivialen `dist[0]={0:100}`) ist IDENTISCH zu diesem Meetings eigener
  Zwei-Stufen-Aufteilung (`probsFromDelta(deltaBp)`) - die Historie
  schliesst dadurch nahtlos an "Today" an, keine Bruchstelle/kein
  Farbsprung im Uebergang. Ein bereits realisiertes vergangenes Meeting
  (Haekchen-Marker) bleibt technisch getrennt (andere Referenz: sein
  Basispunkt-Wert bezieht sich auf den Zins VOR jenem Termin) und sitzt
  hinter der gestrichelten Trennlinie, VOR der Historie.
- **Pillen bleiben auf Today/Meetings beschraenkt** (keine eigene Pille pro
  Historientag - waeren potenziell hunderte) - die Historie ist trotzdem
  sichtbar, weil `scrollRateProbTo()` den fokussierten Punkt im Viewport
  ZENTRIERT statt linksbuendig anzuzeigen; die links angehaengten
  Historientage liegen dadurch beim Fokus auf "Today" automatisch mit im
  Blickfeld. Pillen tragen jetzt `data-idx` (echter Index im `pts`-Array,
  das jetzt Luecken zu den Pillen hat) statt sich auf die DOM-Reihenfolge
  zu verlassen.
- **Zeitraum-Filter** (Max/3Y/2Y/1Y/6M/3M/1M/Custom, wiederverwendet
  `TIME_RANGES`) sitzt jetzt direkt unter den Pillen und steuert, wie viel
  Historie angehaengt wird - Default bewusst **1M statt des sonst
  app-weiten MAX-Defaults** (dokumentierter Grundsatz "maximale Historie
  ueberall"): dieser Chart hat anders als andere MAX-Default-Charts KEINEN
  Weg, gezielt zu weit zurueckliegenden Tagen zu navigieren (kein natives
  Wegwischen erlaubt, keine Pille pro Tag) - ein kleiner Default haelt die
  angehaengte Historie standardmaessig komplett im sichtbaren, per
  "Today"-Pille zentrierten Ausschnitt statt unerreichbar ausserhalb.
- **Bug gefunden + gefixt waehrend der Umsetzung:** `rateProbHistRange`
  wurde faelschlich auf den STRING `'1M'` initialisiert statt auf die
  numerische `1`, die `TIME_RANGES`/`filterDatesByRange()` tatsaechlich
  erwarten (`TIME_RANGES=[...,[1,'1M'],...]` - `1` ist der Wert, `'1M'` nur
  das Label) - `cutoff.setMonth(cutoff.getMonth()-'1M')` ergab `NaN`,
  `cutoff` wurde ein Invalid Date, `.toISOString()` warf `RangeError:
  Invalid time value` und der gesamte Rate-Probabilities-Tab blieb auf
  "Loading..." haengen. Per Playwright-Konsolen-Stacktrace gefunden (die
  Fehlermeldung zeigte exakt `filterDatesByRange` → `rateProbBuildPts` →
  `renderRateProb`), sofort auf die numerische `1` korrigiert.
- Per Playwright verifiziert: initiales Laden (2 Tage echte lokale
  Historie) fehlerfrei, alle 8 Zeitraum-Filter-Buttons (inkl. Custom mit
  Datums-Eingabefeldern) klickbar ohne Fehler, mit synthetisch injizierter
  25-Tage-Historie zeigt der Chart eine durchgehende Linie von der
  Historie durch "Today" bis zu den Meetings (Pfad-/Punktanzahl konsistent,
  Tooltip am linkesten Historienpunkt zeigt korrekte Werte), Pillen-Klicks
  (inkl. letzter Meeting-Pille) verschieben weiterhin korrekt und markieren
  die richtige Pille aktiv. Voller Tab-Regressionstest weiterhin
  fehlerfrei.

### Dual-Source-Bug erneut aufgetreten - diesmal auf dem ANZEIGE-Pfad statt Bias/Score (Bugreport 2026-07-21)

Nutzer: "Eigentlich ist das gut aber es wird im Score negativ gewertet
warum?" - Screenshot zeigte GBP "Claimant Count Change" (Actual 6.7K,
Forecast 29.4K - klar weniger neue Arbeitslosenmeldungen als erwartet, gute
Nachricht) im Score-Modal korrekt als bullish (+1), aber in der Asset-
History (🕰️) fuer denselben Tag/Release mit rotem ▼ (-1).

- **Ursache:** `LOWER_IS_BETTER_RE=/unemployment|jobless|claims|deficit/i`
  matchte nur die exakte Zeichenkette "claims" - der interne kanonische
  Indikator-Name ("Unemployment Claims") matchte damit, GBPs waehrungs-
  spezifischer ANZEIGENAME ("Claimant Count Change", aus
  `IND_DISPLAY_NAMES.GBP`) aber NICHT ("Claimant" enthaelt "claims" nicht
  als Teilstring). Der Live-Score-Pfad (`applyIndDataFeed()`s Bias-
  Selbstheilung, ≈ Zeile 7567) ruft `researchBias(base,...)` mit
  `base=stripPeriodSuffix(ind.name).base` auf - dem KANONISCHEN Namen,
  matchte also korrekt. Die History-Karte
  (`symScoreDrivingEventsByDate()`, ≈ Zeile 3025) baut ihr synthetisches
  Event dagegen bewusst mit `name:ind.displayName||ind.name` (der
  Anzeigename soll ja in der Liste lesbar erscheinen) - genau dieses Feld
  wird aber von `indBiasFromEvent()`/`actualColor()` AUCH fuer den
  Regex-Test wiederverwendet, matchte fuer GBP nicht, kippte die Farbe.
- **Fix:** Regex auf den Wortstamm `claim` verkuerzt (Praefix-Match trifft
  sowohl "claims" als auch "claimant") statt eine zweite Alternative
  hinzuzufuegen - deckt beide Faelle einheitlich ab, an JEDER Stelle, die
  `actualColor()` mit irgendeinem Namen aufruft (kanonisch, Anzeigename,
  oder ein rohes FF-Kalender-Event-Titel-Feld, das ebenfalls "Claimant
  Count Change" heissen kann).
- Per Skript alle `IND_DISPLAY_NAMES`-Eintraege gegen die Regex gescannt
  (kanonischer Name vs. Anzeigename), ob es woanders aehnliche
  Diskrepanzen gibt - **0 weitere Treffer**, der Fix war vollstaendig.
- Per Playwright verifiziert: `ind.bias` (Live-Score) und
  `indBiasFromEvent()` auf dem synthetischen History-Event liefern jetzt
  beide `'bull'` fuer identische Daten; die echte History-Modal-UI zeigt
  "Claimant Count Change" jetzt mit blauem ▲ (bullish), identisch zum
  Score-Modal. Voller Tab-Regressionstest weiterhin fehlerfrei.
- **Merksatz:** dritte Variante derselben Bug-Klasse in dieser Session
  (nach EUR-PPI/Kalender-Dual-Source): dasselbe zugrunde liegende Faktum
  (Actual/Forecast) kann je nachdem, WELCHE STRING-REPRAESENTATION eines
  Indikator-Namens ein Code-Pfad fuer eine Klassifikations-Entscheidung
  (hier: Regex-Test) heranzieht, unterschiedlich klassifiziert werden -
  auch wenn beide Pfade denselben zugrunde liegenden `ind`-Datensatz lesen.
  Bei kuenftigen Bugs dieser Art (Karte X zeigt etwas anderes als Karte Y
  fuer dieselben Rohdaten) immer pruefen, ob unterschiedliche Namensfelder
  (kanonisch vs. Anzeigename vs. Kalender-Event-Titel) in eine
  namensbasierte Klassifikationsregel (Regex, Lookup-Tabelle) eingespeist
  werden - eine Regex-Erweiterung auf den gemeinsamen Wortstamm ist meist
  robuster als das Umsortieren, welches Namensfeld wo verwendet wird.

### "Risk Environment"-Kartenbias brauchte eine eigene, niedrigere Schwelle (Nutzer-Wunsch 2026-07-21)

Nutzer: "Der Kartenbias von Risk Correlation soll schon bei -1 oder 1
bearish bzw. Bullish werden" - das Karten-Badge der "Risk Environment"-
Karte (2 Indikatoren: Risk Correlation + Geopolitics) blieb praktisch
immer "Neutral", selbst wenn der Risk-Sentiment-Regler auf "Full" stand
und "Risk Correlation" eindeutig bullish/bearish war.

- **Ursache:** `recomputeRubricAutoBias()` nutzte fuer ALLE Karten dieselbe
  App-weite Schwelle (Kartensumme ±2 -> bull/bear). "Risk Correlation" ist
  aber HALBGEWICHT (`indIsHalfWeight`, w=0,5) und meist der EINZIGE aktive
  Treiber der Karte (Geopolitics bleibt fast immer manuell neutral) - selbst
  bei staerkster Reglerstufe ("Full", sbull/sbear) traegt Risk Correlation
  nur `biasScore(±2)×0,5=±1` zur Kartensumme bei. Die ±2-Schwelle konnte
  dadurch strukturell NIE ausloesen.
- **Fix:** neue `RUB_AUTO_BIAS_THRESHOLD`-Lookup-Tabelle (Default weiterhin
  2, `'Risk Environment'` -> 1) in `recomputeRubricAutoBias()` - exakt
  dasselbe Prinzip wie der bereits bestehende Sonderfall fuer "COT Data"
  (das hat sogar eine eigene, komplett separate Bias-Logik, weil es nur
  einen einzigen score-treibenden Indikator hat und die normale Schwelle
  dort ebenfalls nie ausloesen wuerde).
- Per Playwright verifiziert (`setRiskEnvLevel(0/1/2)` durchgeklickt fuer
  USD, `riskEnvDirOf('USD')==='bullish'`): Regler auf "None" -> Score 0,
  Badge neutral (unveraendert). "Half" -> Score 0,5, Badge bleibt neutral
  (0,5 < 1, korrekt - der Nutzer sagte explizit "-1 oder 1", nicht 0,5).
  "Full" -> Score 1, Badge jetzt korrekt bullish (vorher faelschlich
  weiterhin neutral). Voller Tab-Regressionstest weiterhin fehlerfrei.

### Revidierte Previous-Werte: Erkennung + Anzeige + Score-Wirkung (Nutzer-Wunsch 2026-07-21)

Nutzer: "oft werden ja previous Werte sobald ein neuer Indikator rauskommt
geaendert also revised... Der Wert soll dann auch entsprechend eingefaerbt
werden... gib begruendete Vorschlaege dazu wie viel das am Score ausmachen
soll." Umgesetzt mit Score-Wirkung ±0,5 (halbes Basisgewicht, additiv).

- **Erkennung SERVER-seitig** (Workflow, Stufe "(3) Revisions-Erkennung"
  direkt vor dem ind_data.json-Write): kommt ein NEUES Release (Datum
  wechselt ggue. prevOut) und weicht dessen `previous` numerisch vom
  urspruenglich gemeldeten Actual des Vor-Release ab (prevOut traegt genau
  diesen Stand), wird `revisedFrom` (der urspruengliche Wert) am Indikator-
  Eintrag gesetzt. Innerhalb desselben Release wird revisedFrom aus dem
  Vor-Lauf weitergetragen (Persistenz wie beim Forecast-Kleben), beim
  naechsten Release faellt es automatisch weg. BEWUSST nicht client-seitig:
  ein Geraet, das zwischen zwei Releases nie offen war, haette einen 2+
  Releases alten Vergleichsstand und wuerde faelschlich Revisionen melden -
  server-seitig sehen alle Geraete dieselbe Wahrheit. (Hinweis: der aeltere
  Kommentar "Revisions-Erkennung" bei den Alternativquellen ~Z.342 betrifft
  etwas ANDERES - dort werden nur Kalender-Events mit frischeren
  previous-Werten angereichert, keine Revisions-Markierung.)
- **Client** (`applyIndDataFeed()`): uebernimmt `f.revisedFrom` nach
  `ind.research.revisedFrom` und leitet `ind.revBias` ab (Richtung ueber
  `LOWER_IS_BETTER_RE` auf den KANONISCHEN Namen - Claimant-Lehre vom
  selben Tag beachtet). Wie die Bias-Selbstheilung VOR dem "nichts
  geaendert"-Fruehausstieg, idempotent, selbstloeschend. Nur fuer FX
  (Non-FX-Spiegelkarten scoren nicht ueber Indikator-Biases;
  `resetNonFxIndBias()` raeumt revBias dort zusaetzlich ab).
- **Score** (`indScoreParts()`): `rev = biasScore(revBias) × 0,5 × w` -
  volles Gewicht ±0,5, Core-Paar/Halbgewicht ±0,25. Begruendung: Revision
  ist echte, aber SCHWAECHERE Information als der Headline-Beat/Miss
  (rueckwaertsgerichtet, teils eingepreist) - exakt die bestehende
  Halbgewicht-Systematik (Step-Signal 0,5, kleine COT-WoW 0,5). Additiv wie
  der Trend-Bonus, nie ein Ersatz. Neues `rev`-Feld in den Parts, Modal
  zeigt eigene Zeile "prev revised from X ±0,5" (Grundsatz: Modal darf nie
  von der echten Rechnung abweichen).
- **Anzeige** (`renderInd`, research-Zweig): Previous wird zu
  "144K (rev. from 147K)", gefaerbt via act-good/act-bad nach
  Revisions-Richtung, mit Erklaer-Tooltip.
- Per Playwright verifiziert (Feed-Injektion `revisedFrom` auf NFP +
  Unemployment Claims): beide Richtungen korrekt (NFP hoeher-besser,
  Claims niedriger-besser), Score-Parts exakt (+0,5 auf total),
  idempotent (2. Lauf changed:false), Revision verschwindet bei
  Feed-Wegfall, Karte + Score-Modal zeigen die Revision, voller
  Tab-Regressionstest fehlerfrei. Workflow-Logik per Node-Skript mit
  simuliertem prevOut/out lokal getestet (Revision erkannt / gleicher
  Release unangetastet / Persistenz-Carry). Erster ECHTER Live-Fund
  entsteht erst beim naechsten tatsaechlich revidierten Release -
  bei Problemen Job-Log nach "ind_data revisions detected" greppen.
- **Nicht abgedeckt (bewusst):** Indikatoren OHNE Feed-Abdeckung (reiner
  FF-Kalender-Pfad) bekommen keine Revisions-Erkennung - der Feed deckt
  die grosse Mehrheit ab (siehe Feed-Abdeckungsluecken-Notizen oben).
  History-Karte (🕰️) zeigt Revisionen nicht separat - der Score-Effekt
  ist im Score-Modal sichtbar; bei Bedarf nachruesten.

### Revisions-Backfill fuer die aktuellen Release-Zyklen aus der Git-Historie (Nutzer-Wunsch 2026-07-21, direkt nach dem Revisions-Feature)

Nutzer: "Kannst du das nicht schon fuer alle Indikatoren jetzt schon machen
weil du hast doch die Daten - sonst muss ich warten bis jeder Indikator
einen neuen Wert hat." Berechtigt - und loesbar OHNE Schaetzung, aber nur
ueber einen Umweg:

- **Warum die offensichtlichen Quellen NICHT gehen:** TradingView liefert
  rueckwirkend nur noch die REVIDIERTEN Werte (historyFull-Merge: "neuere
  Werte gewinnen"), und `ind.valHist` wird bei jedem Lauf per
  `adoptFeedHistory()` von genau dieser Feed-Historie ueberschrieben - der
  "damals gemeldete" Wert ist in den Live-Daten also nirgends mehr
  vorhanden. Revidiert-vs-revidiert zu vergleichen ergaebe immer "keine
  Revision".
- **Die echte Quelle: die Git-Historie von ind_data.json.** Stuendliche
  Commits = reale Snapshots der Werte, wie sie zum jeweiligen Zeitpunkt
  gemeldet waren (gleiche Datenklasse wie der OCC-Put/Call-Backfill - echte
  historische Werte, kein Interpolieren). Shallow-Clone vorher per `git
  fetch --unshallow` vertieft (108 ind_data-Commits bis zum Feed-Start
  2026-06-13).
- **Skript** (`backfill_revisions.js`, Scratchpad, einmalig): je Indikator
  den juengsten Snapshot suchen, in dem noch das VOR-Release aktuell war,
  dessen `actual` (wie damals gemeldet) numerisch gegen das heutige
  `previous` vergleichen. Zwei Guards: (1) Konsistenz-Anker - das
  Snapshot-Datum MUSS dem direkten Vor-Release-Datum laut aktueller
  historyFull entsprechen (verhindert falsches Pairing, wenn der Feed einen
  Release verpasst hat - hat bei NZD Consumer Confidence korrekt
  uebersprungen); (2) Vorlaeufer vor Feed-Start ohne Snapshot werden ehrlich
  uebersprungen (betraf 8 Quartals-/Luecken-Indikatoren bei AUD/CAD/NZD/GBP).
- **Ergebnis: genau 2 aktive echte Revisionen** (beide GBP, Release
  2026-07-21, das heute Morgen VOR dem Feature-Deploy erfasst wurde und der
  Live-Erkennung daher knapp entging): Claimant Count Change 31.2K->1.3K
  (massive Abwaertsrevision, bei lower-is-better bullish +0,5) und
  Employment Change 100K->99K (bearish -0,5). Ueber ~10 Snapshots
  spot-gecheckt: der Vor-Zyklus meldete durchgehend stabil 31.2K/100K -
  kein Flackern, echtes Restatement. Alle uebrigen Indikatoren: previous
  stimmt exakt mit dem damals gemeldeten Actual ueberein (keine Revision).
- **Delivery:** revisedFrom direkt in ind_data.json committet (bewusste,
  dokumentierte Ausnahme von "Daten-JSONs nicht manuell editieren" - wie
  beim OCC-Backfill ein Einmal-Backfill echter historischer Werte). Die
  Persistenz-Stufe des Workflows ("(3) Revisions-Erkennung", Carry-over bei
  `pv.date===v.date`) traegt die Eintraege ab dem naechsten Lauf von selbst
  weiter, bis das jeweils naechste Release sie ablost.
- Per Playwright mit den ECHTEN backgefuellten Daten verifiziert: beide
  Revisionen laufen durch die komplette Kette (revisedFrom -> revBias ->
  indScoreParts rev ±0,5 -> Kartenanzeige "(rev. from 31.2K)" gruen/rot).
- **Merksatz:** wenn "urspruenglich gemeldete" Werte gebraucht werden, die
  die Live-Quellen rueckwirkend ueberschreiben, ist die Git-Historie der
  stuendlich committeten Daten-JSONs die einzige verlaessliche Quelle im
  Projekt - Snapshots dort sind echte Aufzeichnungen, kein Cache.
  (Push-Race-Randnotiz vom selben Tag: zwei parallele Workflow-Laeufe
  koennen sich beim Push die Klinke geben; der Verlierer-Lauf schlaegt mit
  Rebase-Konflikt in den Daten-JSONs fehl, der naechste Stundenlauf heilt
  das von selbst - kein Handlungsbedarf, solange es vereinzelt bleibt.)

### Revisions-Vermerk war nicht eingefaerbt (Bugreport 2026-07-21, direkt nach dem Launch)

Der "(rev. from X)"-Vermerk am Previous nutzte die Klassen act-good/act-bad,
die in der CSS aber nur fuer `.ind-data-act` (den Actual-Wert) gescoped
waren - auf dem `.ind-data-val`-Span des Previous blieben sie wirkungslos,
die Revision erschien farblos. Fix: zwei neue Regeln
`.ind-data-val.act-good/.act-bad` (Farben identisch zu den Bias-Farben
BC.bull/BC.bear). **Merksatz:** die act-Farbklassen sind KEINE globalen
Utility-Klassen, sondern pro Kontext gescoped (`.ind-data-act.act-good`,
`.cmp-a.act-good`, `.cal-val.act-good`, `.histp-val .act-good`, jetzt auch
`.ind-data-val.act-good`) - beim Wiederverwenden an einer NEUEN Stelle
immer pruefen, ob fuer deren Element-Klasse eine Scope-Regel existiert,
sonst bleibt die Faerbung still aus.

### Revisions-Backfill v2: TVs previous-Feld traegt Revisionen nur ~3 Tage (Nutzer-Fund 2026-07-21, "NFP bei USD sollte auch revised Werte haben")

Der Nutzer hatte recht - der erste Backfill uebersah fast alles. Ursache
(per Snapshot-Analyse des USD-NFP-Juli-Zyklus gefunden): **TradingViews
previous-Feld zeigt den revidierten Wert NUR im Release-Fenster** (~3 Tage,
z.B. USD NFP: previous 129K vom 02.-04.07., ab 05.07. wieder der
unrevidierte Juni-Actual 172K; TVs history-Reihe fuehrt durchgehend das
Original). Der v1-Backfill verglich gegen das AKTUELLE previous - da war
die Revision laengst wieder weggewischt.

- **Backfill v2** (`backfill_revisions_v2.js`, Scratchpad): vergleicht
  gegen die previous-Werte aus dem RELEASE-FENSTER (Zyklus-Snapshots der
  ersten 5 Tage). Guards: >=2 Snapshots stabil (kein Ein-Snapshot-Glitch),
  genau EIN distinkter abweichender Wert (sonst noisy -> skip, traf USD
  JOLTS), Einheiten-Guard %/K-M-B/blank (fing AUD Consumer Confidence ab:
  Index-Level "80.6" vs. m/m-Aenderung "-2.9%" - Format-Mix, keine
  Revision). Ergebnis: 18 weitere echte Revisionen ueber 8 Waehrungen
  (u.a. USD NFP 172K->129K, USD GDP 1.6%->0.5%, AUD Employment
  -18.6K->-40.7K, GBP GDP 0.6%->0.1%), insgesamt jetzt 20 aktive. Wo TV
  das previous zurueckgesetzt hatte, wurde es auf den revidierten
  Release-Fenster-Wert restauriert (TVs EIGENER damaliger Wert, keine
  Schaetzung).
- **Workflow-Carry-over-Guard** (Stufe "(3) Revisions-Erkennung"): haelt
  das revidierte previous jetzt fest, wenn TVs frisches previous exakt auf
  revisedFrom zurueckspringt (`numOf(v.previous)===numOf(pv.revisedFrom)`
  -> `v.previous=pv.previous`). Ein DRITTER Wert (echte Zweitrevision)
  wird weiterhin normal uebernommen. Ohne diesen Guard waere JEDE kuenftige
  Revision nach ~3 Tagen von selbst verschwunden (und der Client haette
  revBias still neutralisiert, da np===revisedFrom).
- Per Playwright mit den echten Daten verifiziert: alle 20 Revisionen
  laufen durch die Kette (revBias-Richtungen korrekt inkl. lower-is-better,
  Core-Paare mit ±0,25, Faerbung rot/blau). **Merksatz:** TVs previous-Feld
  ist FLUECHTIG - wer Revisions-Informationen daraus braucht, muss sie im
  Release-Fenster einfangen und selbst persistieren; die Git-Historie der
  Daten-JSONs ist dafuer nachtraeglich die einzige Quelle.

### Karten-SUMMARY automatisch generiert statt manuell, "What matters right now"-Feld entfernt (Nutzer-Wunsch 2026-07-21)

Nutzer: "bei den karten bei den assets da gibt es ja die zusammenfassungen da
will ich jetzt zwei Änderungen. Einmal will ich diese Zusammenfassung mit
what matters today komplett weg haben und ich will das die zusammenfassung
sich automatisch ausfüllt und updated. [...] Es soll aber alles ohne Ki
funktionieren also auch wenn die webseite irgendwann ohne dich läuft und
sich bei den indikatoren was ändert muss es in der zusammenfassung geändert
werden." Auf Nachfrage per AskUserQuestion abgelehnt ("STOP ... wait for the
user to tell you how to proceed") - der Nutzer beantwortete direkt: "ich
will das es komplett automatisch erstellt wird [...] aber ich kann es
trotzdem wenn ich will überschreiben selber. Sobald ein indikator allerdings
geupdated wird ist meine überschreibung weg und der automatische text steht
da wieder." Spaeter ergaenzt: "du kannst auch im text wichtige sachen
markieren und am besten relativ kurz [...] aber jeder indikator kurz aber
halt probieren zu verbinden."

- **Jedes Rubrik-Objekt hatte bisher ZWEI unabhaengige manuelle Textfelder**
  (`rub.summary`/"SUMMARY" und `rub.now`/"⚡ What matters right now") - beide
  in `renderRub()` als Textareas, beide in der Overview-Kachel
  (`renderOverviewCard()`) als Vorschau gezeigt. `rub.now` (samt CSS
  `.rub-now-txt`/`.rub-summary-sep`/`.ov-now`) komplett entfernt, `rub.summary`
  bleibt als einziges Feld - aber jetzt primaer automatisch befuellt.
- **Reine Template-Engine, kein KI-Aufruf** (`summarizeRub()`/`sumFrag()`/
  `sumIndSource()`/`joinFrags()`, direkt vor `recomputeAuto()`): baut aus den
  tatsaechlichen Indikator-Werten einen kurzen, verbundenen Satz. Pro
  Indikator EIN kurzes Fragment ("headline CPI **missed** at **3.5%** (fc.
  3.8%)", "the 2Y yield **up** to **4.21%**", bei Revisionen zusaetzlich
  "(rev. from X)") - `sumPhrase()`/`SUM_PHRASE` uebersetzt den internen
  Indikator-Namen in eine lesbare Kurzform ("NFP" statt "NFP / Employment
  Change"). Rein qualitative Indikatoren ohne Recherche-Wert (CB Tone,
  Geopolitics) werden nur erwaehnt, wenn ihr Bias nicht neutral ist ("X
  tilted **bullish**"). Alle Fragmente werden zu EINEM Satz verbunden
  (`joinFrags()`, Oxford-Komma-Stil) und mit dem Karten-Bias-Wort eingeleitet
  ("The inflation picture for EUR is currently **bullish**, with ...").
  **`SCORE_ZERO`-Indikatoren** (aktuell nur "2Y/10Y Spread") werden wie im
  Score selbst uebersprungen.
- **Dieselbe Drei-Wege-Quellen-Exklusivitaet wie `symScoreDrivingEventsByDate()`**
  (`sumIndSource()`: Feed `ind.research.feed===true` zuerst mit voller
  Exklusivitaet, dann FF-Kalender `findIndEvent()`, dann Bond/COT/Sentiment)
  - bewusst repliziert statt neu erfunden, nach der in dieser Session
  mehrfach gelernten Dual-Source-Lehre (EUR PPI, GBP Claimant Count Change,
  siehe Eintraege oben): eine vierte unabhaengige Implementierung dieser
  Prioritaetsregel haette wieder eine Quelle zeigen koennen, die von der
  Karte selbst abweicht.
- **Manuelles Ueberschreiben bleibt moeglich, haelt aber nur bis zur naechsten
  echten Datenaenderung** - exakt das bereits bestehende Pin-Muster von
  `rub._biasScore` in `recomputeRubricAutoBias()` uebernommen, nur mit einem
  Fingerprint statt einer einzelnen Zahl (`rubSummarySig(rub)`: JSON aus
  Name/Bias/Actual/Forecast/Previous/RevisedFrom jedes Indikators).
  `syncRubSummaries()` (neu in `recomputeAuto()` eingehaengt) regeneriert
  `rub.summary` nur, wenn sich die Signatur seit dem letzten Lauf geaendert
  hat - ein manueller Edit setzt `rub._summarySig` im selben Atemzug auf den
  aktuellen Stand (im `onchange`-Handler der Textarea), macht den eigenen
  Text dadurch "gueltig", bis sich wirklich etwas an den Daten aendert.
- **Wichtige Fakten fett markiert**: `summarizeRub()` produziert `**...**`-
  Markdown im Rohtext (bleibt beim Bearbeiten in der Textarea sichtbar, wie
  bei jedem anderen Freitext-Feld dieser App), neue Funktion `mdBold(s)`
  (`escH(s)` dann `**(.+?)**` → `<b>$1</b>`) wandelt es NUR beim Anzeigen um
  - in der Overview-Kachel verwendet (`mdBold(rub.summary)` statt
  `escH(rub.summary)`).
- **Widerspruchs-Guard**: hat KEIN Indikator ein Fragment geliefert (alle
  neutral/ohne Wert), aber die Karte traegt trotzdem einen manuell gepinnten
  Bias ungleich neutral (`rub._biasScore`-Pin), wuerde "currently bullish,
  with no indicator sending a clear signal" sich selbst widersprechen -
  `summarizeRub()` formuliert diesen Fall daher um ("is currently marked
  **bullish**, though no individual indicator is currently sending a clear
  signal") statt den Bias unkommentiert wegzulassen oder den Widerspruch
  stehen zu lassen.
- Per Playwright verifiziert (USD/EUR/GOLD/BTC, alle Standard-Rubriken +
  eine frisch angelegte leere Custom-Rubrik): jede Karte bekommt einen
  sinnvollen, jeden Indikator erwaehnenden Satz, Overview-Kachel zeigt
  korrektes `<b>`-HTML, Textarea zeigt weiterhin die rohen `**`-Marker,
  manuelle Ueberschreibung bleibt nach `recomputeAuto()` ohne Datenaenderung
  exakt erhalten, wird aber nach einer echten Aenderung (Bias-Flip + neuer
  `research.actual`-Wert) korrekt durch frischen Auto-Text ersetzt, leere
  Custom-Rubrik zeigt den widerspruchsfreien Fallback-Satz. Voller
  14-Tab-Regressionstest weiterhin fehlerfrei (nur netzwerkbedingte
  `ERR_TUNNEL_CONNECTION_FAILED`-Ressourcenfehler in der Sandbox, keine
  JS-Fehler).

### Auto-Zusammenfassung: Bold-Markup entfernt + Wortwahl auf Themen-Aussage umgebaut (Nutzer-Feedback 2026-07-21, direkt im Anschluss)

Zwei Nachbesserungen zur eben gebauten Auto-Zusammenfassung:

**1. "**" blieb sichtbar.** Die `**fett**`-Marker aus dem vorherigen Commit
wurden nur in der schreibgeschuetzten Overview-Kachel (`mdBold()`) in `<b>`
umgewandelt - die editierbare SUMMARY-Textarea kann kein HTML rendern, dort
blieben die rohen `**`-Zeichen als Stoerung sichtbar, und genau dort liest
der Nutzer die Zusammenfassung hauptsaechlich. Fix: Bold-Markup komplett
entfernt (`sumFrag`/`summarizeRub` erzeugen jetzt reinen Klartext), `mdBold()`
als toter Code geloescht, Overview-Kachel nutzt wieder schlichtes `escH()`.

**2. Wortwahl war reine Daten-Aneinanderreihung.** Nutzer: "du reihst
einfach nur die daten aneinander. Ich will eher das da steht das sich zb
die inflation aktuell stärker wird und dabei über expectations oder in line
kommt. Und dann steht da irgendwie vor allem wird es durch CPIs und PPIs
gestützt [...] es muss nicht stehen welcher indikator von der gruppe es ist
[...] aber es muss trotzdem pro indikator kurz erwähnt werden wie hoch die
werte sind aber weniger." Drei Formulierungs-Ansaetze vorgeschlagen (A:
volle Themen-Synthese mit Indikator-Familien, B: einfache Zwei-Satz-Struktur
ohne Gruppierung, C: Hybrid) - Nutzer waehlte **C**, umgesetzt:

- **`indFamily(ind)`** (neue Lookup-Tabelle `IND_FAMILY`) gruppiert
  verwandte Indikatoren unter einem gemeinsamen Namen (Headline+Core CPI →
  "CPI", NFP+ADP → "employment", Net Bullish+Net Bearish → "net
  positioning", usw.) - deckt genau den Nutzer-Wunsch "keine Unterscheidung
  Core/Headline noetig".
- **`RUB_TREND_WORDS`** liefert ein themenspezifisches Richtungsverb statt
  eines generischen "bullish/bearish": Inflation → "strengthening/cooling",
  Labour Market → "improving/weakening", Economic Growth →
  "accelerating/slowing", COT Data → "turning more bullish/bearish",
  Interest Rates → "turning more hawkish/dovish", Custom-Karten fallen auf
  einen generischen Default zurueck.
- **Richtung wird primaer aus dem tatsaechlichen Beat/Miss-Muster der Karte
  abgeleitet, NICHT aus `rub.bias`** - `rub.bias` kippt erst ab einer festen
  Score-Schwelle (`RUB_AUTO_BIAS_THRESHOLD`) und kann dadurch hinter den
  Rohdaten zurueckbleiben (beobachtet: USD Inflation mit 4 Misses/0 Beats
  zeigte `rub.bias==='neu'`, waere mit dem alten Ansatz faelschlich als
  "neutral" beschrieben worden statt als "cooling"). `rub.bias` bleibt nur
  Fallback fuer Karten ohne jeden Forecast-Vergleich (COT Data, Risk
  Environment, Interest Rates).
- **Erwartungs-Verdikt** (", coming in above/below expectations" bzw.
  ", mixed against expectations" bzw. ", broadly in line with
  expectations") aus dem Beat/Miss/Inline-Verhaeltnis aller Familien mit
  echtem Forecast.
- **"driven mainly by X, alongside Y" nur wenn die Forecast-Ueberraschungen
  tatsaechlich eine MINDERHEIT der Familien sind** (`drivers.length<=
  Math.ceil(famOrder.length/2)`) - bei einem vollen Release-Tag (z.B.
  Labour Market mit 4 von 5 Familien mit Beat/Miss) waere "mainly"
  irrefuehrend; dann eine schlichte Liste ohne Gewichtung, die aber
  weiterhin jede Familie kurz nennt (Nutzer-Vorgabe "pro Indikator[-Familie]
  kurz erwaehnt" bleibt so in JEDEM Fall erfuellt).
- Beispiel-Ergebnis (USD, live verifiziert): *"The inflation picture for USD
  is currently cooling, coming in below expectations, driven mainly by CPI
  (3.5%/2.6%) and PPI (5.5%/4.7%), alongside the PCE index (4.1%/3.4%), the
  2Y yield (4.21%), and the 10Y yield (4.6%)."* - liest sich sehr nah am
  Nutzer-Beispiel ("inflation aktuell staerker/schwaecher, driven mainly by
  CPIs und PPIs").
- Per Playwright ueber USD/EUR/GOLD/BTC und alle Standard-Kartentypen
  verifiziert (kein `**` mehr irgendwo, manuelle Ueberschreibung bleibt bis
  zur naechsten echten Datenaenderung erhalten, No-Signal-Fallback weiterhin
  widerspruchsfrei), voller 14-Tab-Regressionstest fehlerfrei.

### Auto-Zusammenfassung: Selbstheilung fuer alte "**"-Texte, Hinweistext entfernt, auf Ansatz "A" gewechselt (Nutzer-Feedback 2026-07-21, direkt im Anschluss)

Drei weitere Nachbesserungen, alle noch am selben Tag wie die vorigen zwei:

**1. "**" war IMMER NOCH sichtbar** ("in den texten stehen überall um die
werte rum ** mach das weg") - der vorherige Commit hatte die Engine
korrigiert, aber NICHT die bereits gespeicherten/synchronisierten
`rub.summary`-Texte selbst geheilt. `syncRubSummaries()` regeneriert nur,
wenn sich `rubSummarySig(rub)` seit dem letzten Lauf geaendert hat - stand
ein alter, noch mit `**...**` aus V183 generierter Text bereits im
localStorage/Cloud-Sync UND hatten sich die zugrunde liegenden
Indikator-Werte seither nicht geaendert, passte die Signatur weiterhin und
der Text wurde nie angefasst. Fix: zusaetzlicher Check
`rub.summary.indexOf('**')!==-1` erzwingt eine Regeneration unabhaengig von
der Signatur, sobald ein liegengebliebener `**`-Marker gefunden wird -
echte manuelle Ueberschreibungen ohne `**` bleiben davon unberuehrt.
Selbstheilend beim naechsten `recomputeAuto()`-Lauf (Boot oder jede
Datenaenderung), keine Nutzer-Aktion noetig.

**2. Hinweistext entfernt** ("bei den karten bei summary steht die ganze
zeit neben summary auto generated... mach das auch weg") - der kleine graue
Text "Auto-generated – edit to override, resets when the data changes"
neben dem "▸ SUMMARY"-Label in `renderRub()` ersatzlos gestrichen.

**3. Formulierungs-Ansatz von "C" auf "A" gewechselt** ("änder das ganze
nochmal zu option a") - Unterschied zu C: Treiber-Familien (echte
Forecast-Ueberraschung) bekommen jetzt den VOLLEN Vergleich inkl. Prognose
("CPI (3.5% vs 3.8% fc., 2.6% vs 2.8% fc.)" bei mehreren Mitgliedern einer
Familie), waehrend Nicht-Treiber NUR NOCH BESCHREIBEND ohne Zahlen
eingeordnet werden ("the PCE index held in line", "the 2Y yield ticked
higher", "CB Tone tilted bullish") statt wie bei C auch dort noch
Klammer-Werte zu zeigen. Neue Helfer `famDriverPhrase()`/
`famContextPhrase()` ersetzen das gemeinsame `famLabel()` von C;
`sumIndInfo()` traegt dafuer zusaetzlich `fcValue` (den rohen
Forecast-String) pro Indikator. Die "mainly nur bei echter Minderheit"-
Sicherung aus C bleibt unveraendert bestehen (siehe voriger Eintrag).
Beispiel (GOLD, live verifiziert): *"The inflation picture for GOLD is
currently cooling, coming in below expectations — driven mainly by CPI
(3.5% vs 3.8% fc., 2.6% vs 2.8% fc.) and PPI (5.5% vs 6.2% fc., 4.7% vs
5.2% fc.), while the PCE index held in line, the 2Y yield ticked higher,
and the 10Y yield ticked higher."*

Per Playwright verifiziert: ein synthetisch injizierter Alt-Text mit `**`
(gleiche Signatur wie die aktuellen Daten, simuliert exakt den gemeldeten
Bug) wird beim naechsten `recomputeAuto()` korrekt geheilt; ein echter
manueller Text ohne `**` bleibt weiterhin unangetastet; das
"Auto-generated"-Textchen ist aus dem DOM verschwunden; alle Standard-
Kartentypen (USD/EUR/GOLD/BTC) liefern den neuen Ansatz-A-Stil; voller
14-Tab-Regressionstest weiterhin fehlerfrei.

### Auto-Zusammenfassung: keine Revisionen mehr, Trend/Lage-Eroeffnung, Non-FX-Framing (Nutzer-Wunsch 2026-07-21, direkt im Anschluss)

Nutzer: "in der zusammenfassung soll nichts zu revised werten gesagt werden
und es soll mehr trends erkannt werden und die generelle lage. Zb: With the
unemployment rate at 4% the us labour market is stable and is on the of
improvement with adp and nfp beating expectations recently. Avg. hourly
earnings are supporting that trend... ca so halt und bei den non fx assets
muss man dann halt bullish oder bearish sagen weil below oder above
expectations halt einfach manchmal gut und manchmal schlecht ist." Direkt im
Anschluss ergaenzt (Kontext-Indikatoren wie Bond Yields): "einfach supporting
oder not supporting the trend or coming in mixed [...] keine woerter da zu
viel zu verlieren."

- **Keine Revisions-Erwaehnung mehr**: `sumIndInfo()` baut `value` jetzt nur
  noch aus `src.actual` - der bisherige `revNote`-Zusatz ("(rev. from X)")
  ist komplett raus. Der Revisions-Effekt bleibt im Score selbst weiterhin
  sichtbar (Karte + Score-Modal, siehe Revisions-Feature oben), nur die
  Auto-Zusammenfassung erwaehnt ihn nicht mehr.
- **Eroeffnungs-Klausel mit "Level"-Anker** (`RUB_ANCHOR_IND`: Inflation→CPI
  (Headline), Interest Rates→Central Bank Rate, Labour Market→Unemployment
  Rate, Economic Growth→GDP Growth QoQ; COT Data/Risk Environment/Custom
  ohne Anker): "With unemployment at 4.2%, the labour market picture for
  USD is currently ..." - liefert die vom Nutzer gewuenschte "generelle
  Lage" am Satzanfang statt direkt mit Beat/Miss zu starten. Traegt die
  Karte NUR EINEN Indikator und der ist bereits der Anker ohne echtes
  Ereignis (z.B. Interest Rates mit nur der Policy Rate), wird die
  redundante Wiederholung am Satzende unterdrueckt (`skipTail`).
- **Kontext-Indikatoren ohne Forecast (Bond Yields etc.) relativ zum
  Gesamttrend statt einzeln beschrieben** (`famContextPhrase()`, exakt nach
  Nutzer-Vorgabe umgesetzt): hat der Indikator eine eigene Bewegungsrichtung
  (`verdict==='trend'`) UND die Karte selbst einen klaren Trend (`dir`
  up/down), wird nur noch verglichen: "{Familie} supporting the trend" bzw.
  "not supporting the trend". Ohne klaren Kartentrend oder ohne eigene
  Richtung (Inline-Werte, reine Level-Werte): "{Familie} coming in mixed" -
  eine einzige, knappe Kategorie fuer alle unklaren Faelle statt mehrerer
  eigener Formulierungen ("held in line"/"ticked higher"/"ticked lower"
  aus der Vorversion entfernt).
- **Non-FX-Assets bekommen bullish/bearish statt above/below expectations**
  (`isFxAsset=FX.includes(sym.id)`): das Gesamt-Verdikt (`expClause`) nutzt
  fuer die 8 FX-Majors weiterhin "coming in above/below expectations", fuer
  alle anderen Assets (Gold/Silber/Oel/BTC/SP500/NAS - dieselben US-
  Makrodaten wie USD via `macroSyncRub`, aber nicht dieselbe Bedeutung fuer
  den Asset-Preis) stattdessen "turning bullish"/"turning bearish"/"showing
  a mixed signal"/"broadly balanced". Der zugrunde liegende Beat/Miss-
  Mechanismus bleibt identisch (kein Asset-spezifisches Vorzeichen-Flippen -
  das waere eine echte oekonomische Interpretation, die frei nicht
  zuverlaessig herleitbar ist); nur die WORTWAHL fuer die Ambiguitaet passt
  sich an, exakt wie vom Nutzer verlangt.
- **Grammatik-Fix waehrend der Umsetzung**: der Verbinder zwischen Treiber-
  und Kontext-Liste war zunaechst "..., while {Kontext-Liste}" - "while"
  verlangt aber pro Element ein eigenes finites Verb ("while X is Y"),
  waehrend `famContextPhrase()` bewusst verblose Partizipial-Phrasen liefert
  (fuer "with" korrekt, "die Nutzer-Kontext-Vorgabe kurz halten"). Verbinder
  auf "with" umgestellt (`— driven mainly by X, with Y`) - grammatisch
  korrekt und stilistisch konsistent mit der Eroeffnungs-Klausel ("With X
  at Y, ...").
- Beispiel (USD Labour Market, live verifiziert): *"With unemployment at
  4.2%, the labour market picture for USD is currently mixed, mixed against
  expectations, with employment (57K vs 110K fc., 98K vs 113K fc.),
  unemployment (4.2% vs 4.3% fc.), JOLTS openings (7.594M vs 7.3M fc.), wage
  growth coming in mixed, and jobless claims (208K vs 217K fc.)."* Beispiel
  Non-FX (GOLD Inflation): *"With headline CPI at 3.5%, the inflation
  picture for GOLD is currently cooling, turning bearish — driven mainly by
  CPI (3.5% vs 3.8% fc., 2.6% vs 2.8% fc.) and PPI (5.5% vs 6.2% fc., 4.7%
  vs 5.2% fc.), with the PCE index coming in mixed, the 2Y yield not
  supporting the trend, and the 10Y yield not supporting the trend."*
- Per Playwright verifiziert: kein `revisedFrom`/"rev. from" mehr in irgendeiner
  Zusammenfassung trotz aktiver Revisionen im Test-Datensatz, Eroeffnungs-
  Anker erscheint korrekt bei allen vier Anker-Kartentypen, Interest-Rates-
  Redundanz unterdrueckt, GOLD/BTC (Non-FX) zeigen bullish/bearish statt
  above/below expectations, EUR/USD (FX) unveraendert bei above/below
  expectations, manuelle Ueberschreibung bleibt weiterhin bis zur naechsten
  echten Datenaenderung erhalten, `**`-Selbstheilung funktioniert weiterhin,
  voller 14-Tab-Regressionstest fehlerfrei.

### Auto-Zusammenfassung: "mixed, mixed"-Dopplung + Revisions-Reste nicht selbstheilend (Bugreport 2026-07-21, direkt im Anschluss)

Nutzer: "ok also da steht teilweise ... is currently mixed, mixed agains
expectations. das ist eine unnötige dopplung. Außerdem haben die revised
werte dort nichts verloren. Ich glaube du hast ein paar meiner nachrichten
übersehen check das nochmal ob du alles berücksichtigt hast" - zwei
konkrete Bugs im direkt vorangegangenen Commit, kein Feature-Wunsch mehr
uebersehen (nochmal gegen alle vorherigen Nachrichten dieser Session
geprueft - `RUB_ANCHOR_IND`/Non-FX-Framing/Kontext-"supporting"-Phrasen/
kein Revisions-Erwaehnen sind alle korrekt umgesetzt, nur diese zwei Bugs
waren neu):

- **"mixed, mixed against expectations"-Dopplung**: `dir` (Richtungswort,
  aus `RUB_TREND_WORDS`) UND `expClause` (Erwartungs-Verdikt) wurden
  unabhaengig voneinander aus denselben Beat/Miss-Zahlen berechnet - beide
  konnten unabhaengig auf "mixed" kommen ("is currently mixed" + ", mixed
  against expectations"). Fix: `dir` wird jetzt VOR `expClause` berechnet,
  `expClause` wird bei `dir==='mixed'` komplett weggelassen (das
  Richtungswort sagt "mixed" bereits) - der Rest der `expClause`-Logik
  (above/below/in line bzw. bullish/bearish/balanced) leitet sich jetzt
  direkt aus `dir` ab statt die Beat/Miss-Vergleiche ein zweites Mal separat
  auszuwerten (weniger Redundanz, kann nicht mehr auseinanderlaufen).
- **Revidierte Werte waren technisch schon aus der Generierungs-Logik raus
  (`sumIndInfo()` baut `value` seit dem vorigen Commit nur noch aus
  `src.actual`), aber bereits gespeicherte/synchronisierte Texte aus VOR
  diesem Commit heilten sich nie** - exakt dieselbe Bug-Klasse wie beim
  `**`-Selbstheilungs-Fix zuvor: `syncRubSummaries()`s Signatur-Vergleich
  sieht keine Aenderung, wenn sich an den zugrunde liegenden Werten seither
  nichts geaendert hat, also blieb ein alter "(rev. from X)"-Vermerk stehen.
  Fix: derselbe Selbstheilungs-Check um `rub.summary.indexOf('rev. from')`
  erweitert (neben `**`) - erzwingt eine Regeneration unabhaengig von der
  Signatur, sobald ein liegengebliebener Revisions-Vermerk gefunden wird.
- Per Playwright verifiziert: kein `/mixed,\s*mixed/i`-Treffer mehr in
  irgendeiner Zusammenfassung ueber USD/EUR/GOLD/BTC; ein synthetisch
  injizierter Alt-Text mit "(rev. from X)" (gleiche Signatur wie aktuelle
  Daten) heilt beim naechsten `recomputeAuto()`; kompletter Scan ueber
  **alle** Symbole/Rubriken (nicht nur die vier Stichproben) bestaetigt
  0 verbleibende `**`- oder `rev. from`-Reste; voller 14-Tab-
  Regressionstest weiterhin fehlerfrei.
- **Merksatz (Ergaenzung zum bereits bestehenden `**`-Merksatz):** JEDE
  Aenderung an der TEXT-FORM von `summarizeRub()` (nicht nur am Bias/Wert
  selbst) braucht einen Selbstheilungs-Check in `syncRubSummaries()` fuer
  das alte Muster, das entfernt wurde - die Signatur allein (basiert auf
  Rohdaten, nicht auf Text-Format) erkennt reine Formatierungs-/Wortwahl-
  Aenderungen nie von selbst.

### Auto-Zusammenfassung: fest verdrahtete Formulierung pro Kartentyp (Nutzer-Wunsch 2026-07-21, sehr detailliert)

Nutzer gab eine praezise Vorgabe fuer jede der 6 Standard-Karten (woertlich
zusammengefasst): **Inflation** - am Anfang den Headline-CPI-y/y-Wert nennen,
dann ob CPI (Headline+Core zusammen) "hotter/partly hotter/in line/partly
softer/softer" kam ("partly" GENAU dann, wenn ein Mitglied nicht dem Forecast
entsprach, das andere aber in line war - explizit "auch fuer die anderen
Indikator-Paare" gemerkt), dasselbe fuer PPI und PCE, dann ob Yields diesen
Trend "supporten/partly supporten/partly nicht supporten/gar nicht (und in
die andere Richtung trenden)". **Labour Market** - genauso, aber mit dem
Unemployment-Rate-Wert am Anfang statt CPI, NFP+ADP zusammen ob "mehr/partly
mehr/in line/partly weniger/weniger" Jobs, dann ob Jobless Claims das
BESTAETIGT (explizit als gegenlaeufig markiert: Claims messen Verluste, NFP/
ADP Zuwaechse), dann kurz ob JOLTS/Wages dazu passen. **Economic Growth** -
GDP-Wert UND "stronger/weaker than expected" IM SELBEN SATZ, dann PMIs
(Manufacturing+Services) relativ dazu supportend/nicht, dasselbe fuer Retail
Sales, dann kurz ob Consumer Confidence sich auch gebessert hat. **Interest
Rates** - NUR EIN SATZ: aktueller Satz + hoeher/niedriger/gleich wie vorher.
**COT Data** - Long/Short-Verteilung, "crowded" nur wenn zutreffend (sonst
weglassen), dann WoW-Aenderung positiv/negativ. **Risk Environment** - simpel
ob aktuell risk-on/halb/risk-off, und ob das gut oder schlecht fuer die
Waehrung ist.

- **Zwei-Schichten-Architektur**: `summarizeRub()` ist jetzt nur noch ein
  Dispatcher (`RUB_SUMMARIZERS`-Lookup nach `rub.name`), der fuer die 6
  Standard-Karten auf eigene, HANDGESCHRIEBENE Funktionen
  (`summarizeInflation`/`summarizeLabour`/`summarizeGrowth`/
  `summarizeInterestRates`/`summarizeCot`/`summarizeRiskEnv`) verzweigt und
  fuer alles andere (Custom-Rubriken) auf die bisherige generische
  Familien-Engine zurueckfaellt (umbenannt zu `summarizeGeneric()`,
  Formulierungs-Logik unveraendert).
- **Gemeinsame Klassifikations-Bausteine** (neu, wiederverwendet von allen 6
  Karten): `sumRawState()` liefert Roh-Actual/Forecast/Previous +
  lowerBetter-Flag; `fcState()`/`trendState()` liefern je ±1/0/null (Forecast-
  bzw. Vorwert-Vergleich, bereits lowerBetter-bereinigt); `classifySingle()`
  liefert `pos`/`neutral`/`neg`; `classifyPair(a,b)` liefert die 6-stufige
  Skala `pos`/`partly-pos`/`neutral`/`partly-neg`/`neg`/`mixed` - "partly"
  EXAKT nach Nutzer-Definition (ein Mitglied weicht ab, das andere ist in
  line), "mixed" nur im vom Nutzer nicht abgedeckten Fall echt gegenlaeufiger
  Signale (ein Mitglied beat, das andere miss). `alignCls(cls,refCls)`
  spiegelt eine Klassifikation gegen eine Referenzrichtung (z.B. Yields
  gegen den CPI-Trend, PMIs gegen den GDP-Trend) und liefert dieselbe
  4-Wege-"supporting"-Skala aus der Nutzer-Vorgabe. Drei Wortlisten
  (`HOTCOLD_WORDS`/`JOBS_WORDS`/`SUPPORT_WORDS`) uebersetzen die Klassen in
  Text - bewusst als generische Bausteine gebaut, nicht 6× dieselbe Logik
  dupliziert.
- **Gegenlaeufigkeit bei Jobless Claims**: da `fcState()` bereits
  lowerBetter-bereinigt ist (weniger Claims als erwartet = +1, genau wie ein
  NFP-Beat = +1), reicht ein direkter `alignCls(claimsCls, jobsCls)`-Aufruf
  ohne manuelle Vorzeichen-Umkehr - die Inversion steckt schon in `fcState()`
  selbst (dieselbe `LOWER_IS_BETTER_RE`, die auch den Score-treibenden
  Feed-Pfad bereinigt).
- **Grammatik-Fallen gefunden + gefixt waehrend der Umsetzung** (Playwright-
  Vollscan ueber alle 108 Karten-Zusammenfassungen des Test-Datensatzes nach
  `with [\w ]*(were|was)`/doppeltem Leerzeichen/" in in "-Mustern):
  `JOBS_WORDS` waren urspruenglich volle Saetze mit finitem Verb ("more jobs
  than expected **were** added recently") - nach "with " vorangestellt ergab
  das "with more jobs than expected were added recently" (kaputt, "with"
  verlangt eine Nominalphrase/Partizip, kein finites Verb). Auf reine
  Partizipial-Form umgestellt ("more jobs than expected **added** recently").
  `HOTCOLD_WORDS.neutral` war "in line with expectations" - nach "coming in "
  ergab das "coming in **in** line with expectations" (doppeltes "in") →
  "roughly in line with expectations". `HOTCOLD_WORDS.mixed` war "a mixed
  signal" - nach "coming in " ergab das "coming in a mixed signal" (fehlende
  Praeposition) → einfach "mixed" (funktioniert als Adjektiv nach "coming
  in"/"came in" ueberall gleichermassen).
- **COT "crowded"-Schwelle** (`COT_CROWDED_PCT_SUM=80`) dupliziert bewusst
  den bestehenden `COT_CROWDED_PCT`-Wert aus dem COT-Tab (dort lokal in
  `renderCot()` deklariert, daher nicht direkt importierbar) - beide muessen
  synchron bleiben, falls die Schwelle sich mal aendert.
- **Risk Environment** nutzt direkt `riskEnvLevel` (0/1/2) fuer die
  Umgebungs-Beschreibung und `riskEnvDirOf(sym.id)` fuer "gut/schlecht" -
  dieselben bestehenden globalen Variablen/Helfer, die auch
  `riskCorrBiasFor()` (den echten Karten-Bias der Risk-Correlation-
  Indikator) speisen, keine zweite unabhaengige Implementierung (Dual-
  Source-Lehre).
- Per Playwright ueber ALLE 12 gelisteten Assets × alle Rubriken (108
  Kombinationen im Standard-Testdatensatz) verifiziert: 0 leere Summaries,
  0 verbleibende `**`/`rev. from`-Reste, 0 Grammatik-Auffaelligkeiten;
  Risk Environment liefert korrekt unterschiedliche Saetze fuer alle 3
  Regler-Stufen; Custom-Rubriken laufen nachweislich weiterhin ueber
  `summarizeGeneric()` (nicht ueber die neuen fest verdrahteten Funktionen);
  COT-Crowded-Fall (85 % long) wird korrekt erkannt und erwaehnt; manuelle
  Ueberschreibung + Selbstheilung weiterhin funktionsfaehig; voller
  14-Tab-Regressionstest fehlerfrei.
- Beispiele (live verifiziert): *"With headline CPI at 2.8%, ... CPIs came
  in roughly in line with expectations. PPIs came in hotter than expected.
  Yields are trending higher."* (EUR Inflation) · *"The unemployment rate is
  at 4.2%, with fewer jobs than expected added recently. Jobless claims do
  not confirm that, though, pointing the other way. JOLTS openings and wage
  growth are partly not supporting that trend."* (USD/GOLD/BTC Labour
  Market, mirrored macro data) · *"The policy rate is at 2.4%, up from the
  previous level of 2.15%."* (EUR Interest Rates) · *"Positioning is
  currently split 84.8% long / 15.2% short (crowded long), with the weekly
  change negative."* (GOLD COT Data) · *"Risk sentiment is currently a half
  risk-off environment, currently bullish for USD."* (Risk-Regler auf
  "Half").

### Bestandsnutzer sahen nach dem Summarizer-Umbau weiterhin die ALTE Formulierung (Bugreport per Foto, 2026-07-21)

Nutzer schickte ein Foto der Live-Seite: die Karten zeigten noch den alten
generischen Text ("driven mainly by CPI (3.5% vs 3.8% fc., ...), while the
PCE index held in line, the 2Y yield ticked higher...") statt der neu
gebauten, fest verdrahteten Formulierung ("Headline CPI is at 3.5%, with
CPIs coming in softer than expected. ..."), obwohl das Banner bereits
V191 zeigte (der Umbau war also technisch live) - dazu die Vorgabe "guck
nochmal meine Nachricht durch, bei Fragen frag".

- **Ursache: DRITTE Auspraegung derselben Selbstheilungs-Luecke** (nach
  liegengebliebenen `**`-Markern und `rev. from`-Vermerken, siehe die
  beiden Eintraege oben). `rubSummarySig()` haengt AUSSCHLIESSLICH von den
  Indikator-WERTEN ab (Name/Bias/Actual/Forecast/Previous/RevisedFrom) -
  nicht davon, WELCHE Version von `summarizeRub()` den Text erzeugt hat.
  Der komplette Umbau von der generischen Familien-Engine auf die 6 fest
  verdrahteten Karten-Summarizer aenderte an den zugrunde liegenden
  Indikator-Werten nichts - die Signatur blieb also identisch, und
  `syncRubSummaries()` hielt den laengst veralteten Text faelschlich fuer
  weiterhin gueltig. Anders als bei `**`/`rev. from` gab es diesmal auch
  KEINEN erkennbaren Text-Marker, an dem ein Ad-hoc-Substring-Check haette
  ansetzen koennen (die alte generische Formulierung sieht oberflaechlich
  wie normaler Fliesstext aus).
- **Fix, diesmal strukturell statt Ad-hoc:** neue Konstante
  `SUMMARY_ENGINE_VERSION` (aktuell `2`) fliesst als erstes Element in
  `rubSummarySig()` mit ein. **Ab jetzt bei JEDER Aenderung an der
  Formulierungs-Logik** (egal ob `summarizeGeneric()` oder einer der
  fest verdrahteten Karten-Summarizer, auch reine Wortwahl-Fixes) diese
  Zahl hochzaehlen, statt einen neuen `rub.summary.indexOf(...)`-Check zu
  bauen - das war der wiederholte Fehler in den beiden vorherigen Runden.
  Ein hochgezaehlter Wert regeneriert ALLE Zusammenfassungen beim naechsten
  `recomputeAuto()`-Lauf, auch echte manuelle Ueberschreibungen ohne
  erkennbaren Marker (bewusster Trade-off: nach einem echten Formulierungs-
  Wechsel gilt der alte Text ohnehin nicht mehr als "bewusst vom Nutzer so
  gewaehlt", da er sich auf die ALTE Engine bezog).
- Per Playwright verifiziert: ein synthetisch injizierter Alt-Text mit der
  ALTEN Signatur-Berechnung (ohne Versions-Wrapper, exakt wie vor diesem
  Fix) wird beim naechsten `recomputeAuto()` korrekt durch die neue
  Formulierung ersetzt; kompletter Scan ueber alle Symbole/Rubriken auf
  Reste alter Phrasen ("driven mainly by"/"held in line"/"ticked higher/
  lower") liefert 0 Treffer; voller 14-Tab-Regressionstest weiterhin
  fehlerfrei.
- **Merksatz (jetzt zum dritten Mal gelernt, diesmal strukturell statt mit
  einem weiteren Einzelfall-Patch geloest):** `rubSummarySig()` darf sich
  NIE nur auf die Rohdaten verlassen, wenn sich die daraus abgeleitete
  TEXT-FORM aendern kann - eine Versionsnummer, die bei jeder Logik-
  Aenderung manuell hochgezaehlt wird, ist die einzige zuverlaessige
  Absicherung. Kuenftige Aenderungen an `summarizeRub()`/
  `summarizeGeneric()`/den 6 Karten-Summarizern IMMER mit einem
  `SUMMARY_ENGINE_VERSION`-Bump kombinieren, nicht vergessen.

### Hintergrund-Glow komplett wieder entfernt (Nutzer-Wunsch 2026-07-21, direkt im Anschluss)

Im selben Bugreport-Foto: "mach den glow wieder aus" - das erst kurz zuvor
ergaenzte und dann verstaerkte statische Hintergrundleuchten (siehe
CLAUDE.md-Grundsatz "Score-/Asset-Karten" oben) wurde komplett
zurueckgebaut. `glow-*`-Klassen (`.ab`/`.rub-card`/`.pair-card`/
`.ind-card`/`.ri`/`.sym-row`/`.dw-chip`) setzen wieder ausschliesslich
`border-left-color`, kein `background-image`/`box-shadow` mehr - exakt der
Stand von vor dem 2026-07-20-Farbaudit-Rueckbau. Per Playwright verifiziert
(`getComputedStyle().backgroundImage` liefert `none`), voller
Regressionstest fehlerfrei.

### Formulierungs-Feinschliff mit Vorab-Beispielen abgestimmt (Nutzer-Wunsch 2026-07-21, nach der neuen "erst OK einholen"-Regel)

Erste Anfrage nach der neu eingefuehrten Arbeitsweise-Regel ("vor Code-
Aenderungen erst das OK des Nutzers einholen", siehe Abschnitt oben) - drei
Formulierungs-Wuensche zur Inflation-/Growth-/Labour-Zusammenfassung wurden
per Beispielsaetzen im Chat abgestimmt, BEVOR Code angefasst wurde:

1. **"Yields are pricing in cooling/strengthening inflation"** ersetzt den
   bisherigen `SUPPORT_WORDS`-Ansatz fuer die Yields-Zeile der Inflation-
   Karte - beschreibt jetzt direkt, welche Inflation die Yields SELBST
   einpreisen (`inflDirWord()`, aus der eigenen Trendrichtung der Yields
   `yieldsCls`), statt sie nur gegen die CPI-Richtung zu "spiegeln". Ein
   `even though`-Kontrast erscheint NUR bei echtem Widerspruch zur CPI/PPI/
   PCE-Richtung ("Yields, however, are pricing in strengthening inflation,
   even though the broader picture is cooling.") - und nennt dabei bewusst
   NICHT nochmal "CPI"/"PPI" (Nutzer-Korrektur: "sonst ist das doppelt"),
   sondern nur "the broader picture". Stimmen beide Richtungen ueberein:
   "..., in line with that." (kein `even though`, waere sonst kein echter
   Kontrast). Kein Referenzpunkt vorhanden (CPI/PPI/PCE alle neutral):
   nur die eigene Yields-Richtung ohne Vergleich.
2. **Eroeffnungs-Anker bekommt ein Trend-Verb statt "is at"** (Nutzer-Fund:
   "wenn du GDP oder CPI am Anfang erwaehnst, sagst du nicht wie der
   aktuell aussieht"): neue Funktion `anchorClause(rs)` vergleicht den
   aktuellen Wert mit dem VORWERT (nicht Forecast) und liefert
   "climbed to"/"eased to"/"held at" statt des neutralen "is at" - gilt fuer
   Headline CPI (Inflation), Unemployment Rate (Labour Market) und GDP
   Growth (Economic Growth). Bei GDP zusaetzlich `though`-Logik: nur wenn
   sich Vorwert-Trend (`climbed`/`eased`) UND Forecast-Verdikt (`stronger`/
   `weaker than expected`) WIDERSPRECHEN (z. B. Wachstum liess nach, schlug
   aber trotzdem die Prognose), wird "though that came in X" statt "coming
   in X" verwendet - stimmen beide Richtungen ueberein, waere "though"
   sprachlich falsch (kein Widerspruch).
3. **"that trend" ersetzt durch konkreten Themen-Bezug** (Nutzer-Fund:
   "sonst muss man immer wissen was davor stand"): neue Funktion
   `supportPhrase(cls,topic)` ersetzt die alte `SUPPORT_WORDS`-Konstante -
   PMIs/Retail Sales (Economic Growth) beziehen sich jetzt auf "that growth
   picture", JOLTS+Wages (Labour Market) auf "that labour market picture" -
   jeder Satz bleibt dadurch fuer sich allein verstaendlich, ohne den
   Kartenanfang im Kopf behalten zu muessen.
- `SUMMARY_ENGINE_VERSION` (siehe Merksatz-Eintrag oben) auf `3` erhoeht,
  da sich die Formulierungs-LOGIK geaendert hat - Selbstheilung greift
  dadurch automatisch bei allen Bestandsnutzern, kein erneuter Foto-
  Bugreport wie beim letzten Mal zu erwarten.
- Per Playwright verifiziert: alle drei Aenderungen liefern exakt die im
  Chat abgestimmten Beispielsaetze (GOLD/BTC Inflation mit `even though`-
  Kontrast, EUR Inflation ohne Kontrast "in line with that", EUR/GOLD
  Growth mit `climbed to`/`eased to` + korrekter though/coming-in-Wahl,
  Labour Market mit "that labour market picture"); voller Scan ueber alle
  108 Karten-Kombinationen ohne leere/fehlerhafte Texte; voller
  14-Tab-Regressionstest fehlerfrei.

### COT/Risk-Environment-Formulierung nachgeschaerft (Nutzer-Wunsch 2026-07-21, direkt im Anschluss)

Wieder per Beispielsaetzen abgestimmt vor der Umsetzung:

- **COT Data ab 60% Net-Positioning auf einer Seite**: neue Konstante
  `COT_LEAN_PCT_SUM=60` - `summarizeCot()` formuliert dann "Institutions
  are currently leaning more on the bullish/bearish side, at X%" statt nur
  den nackten Long/Short-Split zu nennen (die Gegenseite laesst sich
  ableiten, muss nicht explizit genannt werden - Nutzer-Vorgabe woertlich).
  Der bestehende `COT_CROWDED_PCT_SUM=80`-Hinweis bleibt als zusaetzliche
  Parenthese "(crowded)" erhalten, wenn er zutrifft - eine staerkere
  Aussage (Squeeze-Risiko) als die blosse Schlagseite. Unter 60% auf beiden
  Seiten bleibt der bisherige "Positioning is currently split X% long / Y%
  short"-Satz unveraendert. Der Weekly-Change-Halbsatz nennt jetzt
  zusaetzlich die Prozentzahl ("with the weekly change positive at
  +0.4%"/"negative at -0.7%" statt nur "positive"/"negative").
- **Risk Environment**: `summarizeRiskEnv()` nutzte "currently" zweimal im
  selben Satz ("Risk sentiment is currently X, currently bullish for Y") -
  das zweite `currently` im `effect`-Teil entfernt.
- `SUMMARY_ENGINE_VERSION` auf `4` erhoeht.
- Per Playwright verifiziert: GOLD/BTC COT (84.8% long) liefert "Institutions
  are currently leaning more on the bullish side, at 84.8% (crowded), with
  the weekly change negative at -0.7%.", EUR COT (48.7%/51.3%, unter 60%)
  bleibt beim Split-Satz; Risk Environment zeigt "currently" nur noch
  einmal pro Satz auf allen 3 Regler-Stufen; voller 14-Tab-Regressionstest
  und Selbstheilungs-Test weiterhin fehlerfrei.

### Auto-Zusammenfassung: Core CPI namentlich statt Kollektiv "CPIs" + "roughly in line" gekuerzt (Nutzer-Wunsch 2026-07-21, direkt im Anschluss)

Zwei weitere, per Beispielsaetzen abgestimmte Feinschliffe:

- **CPI/Core-Pluralisierungs-Verwirrung behoben** (Nutzer-Korrektur: "es sind
  zwei nicht mehr... da muss einfach gesagt werden ob Core auch so ist oder
  nicht" - mein erster Loesungsvorschlag "both CPIs" wurde explizit
  abgelehnt): `summarizeInflation()`s Eroeffnungssatz nennt Core CPI jetzt
  mit einem EIGENEN Verdikt statt der Kollektiv-Formulierung "CPIs coming in
  X" - "Headline CPI cooled to 3.5%, coming in softer than expected, with
  core CPI matching that." wenn beide dieselbe Richtung haben, sonst "...,
  though core CPI came in hotter/softer than expected/was in line." `cpiCls`
  (die bisherige `classifyPair`-Klassifikation) bleibt als Referenzrichtung
  fuer die spaetere Yields-Klausel im selben Satzblock erhalten - nur die
  Eroeffnungsformulierung selbst wurde umgebaut. `hAnchor` nutzt jetzt
  explizit `ANCHOR_VERBS_INFLATION` (war vorher versehentlich noch der
  Default-Verb-Satz).
- **"roughly in line with expectations" ueberall auf "in line with
  expectations" gekuerzt** (Nutzer-Wunsch: "sag mir nicht roughly in line
  sondern nur in line") - betrifft `HOTCOLD_WORDS.neutral` und das GDP-
  Verdikt in `summarizeGrowth()`. **Dabei reproduzierte sich das doppelte
  "in", wegen dem "roughly" urspruenglich eingefuehrt wurde** ("PPIs came in
  in line with expectations") - selbst per Playwright-Regex-Scan gefunden,
  dem Nutzer mit konkretem Vorschlag vorgelegt (per `AskUserQuestion`) und
  bestaetigt, BEVOR es implementiert wurde. Fix: neue Helper-Funktion
  `cameInPhrase(subject,verb,cls)` - beim neutralen Fall wird der Satzbau
  auf "{subject} {verb} in line with expectations" umgestellt (kein "came
  in" davor), alle anderen Faelle (hotter/softer/mixed/partly-*) bleiben
  bei "{subject} came in {HOTCOLD_WORDS[cls]}" unveraendert. Betroffene
  Stellen: PPI-/PCE-Klausel und CPI-Fallback (Inflation), Job-creation-
  Fallback (Labour Market), PMI-/Retail-Sales-Fallback (Economic Growth).
  Der GDP-Satz selbst (`summarizeGrowth()`, eigene inline Verdikt-Logik,
  kein `HOTCOLD_WORDS`/`cameInPhrase`) hatte dieselbe Kollision separat
  ("coming in in line with expectations") - dort das "coming in"/"though
  that came in"-Praefix beim neutralen Fall (`gCls==='neutral'`) komplett
  weggelassen ("GDP growth climbed to 0.6%, in line with expectations.").
- `SUMMARY_ENGINE_VERSION` auf `5` erhoeht.
- Per Playwright verifiziert: kompletter Scan ueber alle 108 Karten-
  Zusammenfassungen liefert 0 Grammatik-Auffaelligkeiten (vorher 11 "in
  in"-Treffer), Labour Market zeigt weiterhin "fell to"/"rose to" (Nutzer-
  Wahl vom vorherigen Round), Stale-Text-Selbstheilung + Duplikations-Check
  + Glow-Check weiterhin fehlerfrei, voller 14-Tab-Regressionstest sauber.
- **Merksatz:** eine woertlich eindeutige Nutzer-Vorgabe ("nur in line,
  nicht roughly") kann trotzdem an anderen Stellen einen bereits behobenen
  Bug reproduzieren, wenn der urspruengliche Fix (hier: "roughly" als
  Kollisionsvermeidung) nicht mehr im Kopf ist - vor dem Umsetzen IMMER
  einen vollen Playwright-Scan fahren und bei einem gefundenen Nebeneffekt
  dem Nutzer einen konkreten Loesungsvorschlag vorlegen, statt ihn still
  mitzuloesen (auch wenn die urspruengliche Anweisung selbst eindeutig war).

### Auto-Zusammenfassung: Asset-Bezug-Schlusssatz fuer Inflation/Labour Market/Economic Growth (Nutzer-Wunsch 2026-07-21, Design von einem delegierten Agenten geloest)

Nutzer bestaetigte den vom Agenten vorgeschlagenen Design-B-Ansatz ("Und die
Lösung für den asset Bezug ist gut"): ein Schlusssatz, der sich IMMER aus dem
echten Karten-Bias ableitet (`rub.bias`, derselbe Wert wie das Badge) - bei
eindeutigem Bullish/Bearish ein klares Fazit, bei Neutral eine Aufschluesselung
statt "neutral" stehen zu lassen. Umgesetzt fuer `summarizeInflation`/
`summarizeLabour`/`summarizeGrowth` (Interest Rates/COT/Risk Environment
hatten den Asset-Bezug schon).

- **Klar (Bull/Bear):** "On balance, that makes the inflation data bullish/
  bearish for USD." (`assetVerdictClause()`, ~Zeile 7095).
- **Neutral (Aufschluesselung):** jeder Treiber mit einer eigenen, von neutral
  abweichenden Richtung wird benannt und nach Richtung gruppiert: "On balance
  the read is mixed for USD — the softer CPI and the softer PPI lean
  bearish, while firmer yields lean bullish." Treiber je Karte: Inflation
  (CPI/PPI/PCE/Yields), Labour Market (Unemployment Rate/Job creation/
  Jobless Claims/JOLTS+Wages), Economic Growth (GDP/PMIs/Retail Sales/
  Consumer Confidence). Grammatik: mehrere mit "and" verbundene Subjekte
  sind immer plural ("lean"), ein einzelnes Item richtet sich nach seiner
  eigenen grammatischen Zahl (`plural:true`-Flag pro Treiber - "yields"/
  "claims"/"PMIs"/"retail sales"/"JOLTS and wage data" sind Plural-Nomen
  auch allein: "firmer yields lean bullish", nicht "leans").
- **Non-FX-Assets: KEINE eigene Uebersetzung, sondern die BEREITS
  BESTEHENDE karten-eigene same/inverse-Regel** (`effDeriveRules(sym)
  [rub.name]`, treibt `deriveMacroBiasAll()` schon seit laengerem -
  GOLD/SP500/NAS haben dort bereits fuer Inflation/Interest Rates/Labour
  Market/Economic Growth einzeln hinterlegt, ob heisse USD-Daten "same"
  oder "inverse" fuer das Asset wirken). **Wichtiger Fehlversuch dabei**:
  ein erster Anlauf nutzte stattdessen das Risk-Environment-Zahnrad
  (`riskEnvDirOf`, Safe-Haven/Risk-Asset-Einstellung) fuer eine eigene
  Uebersetzung - der Nutzer korrigierte das explizit: "Also das steht nur
  als safe Heaven da aus anderen Gründen... bei non fx ist alles über die
  settings geregelt was wie ist also einfach das nehmen anstatt zu
  probieren Gruppen zu erstellen". Fix: komplett auf `effDeriveRules`
  umgestellt, `riskEnvDirOf` hier nicht mehr verwendet.
- **Kritischer Doppel-Invertierungs-Bug waehrend der Umsetzung gefunden +
  gefixt:** `rub.bias` ist fuer GOLD/SP500/NAS durch `deriveMacroBiasAll()`
  BEREITS same/inverse-transformiert (z.B. GOLD Inflation='inverse': USD
  bull -> GOLD bear automatisch). Der klare Bull/Bear-Zweig darf `rub.bias`
  daher NICHT nochmal durch `macroSignAdjust()` schicken (sonst doppelte
  Invertierung, Testfall zeigte faelschlich "bullish for GOLD" obwohl
  `rub.bias==='bear'`) - Fix: der Bull/Bear-Zweig nutzt `assetBiasWord(sign)`
  direkt ohne weitere Uebersetzung. Die Neutral-Aufschluesselung braucht
  dagegen weiterhin `macroSignAdjust()`, weil die einzelnen Treiber-Signs
  (`cpiCls`/`ppiCls`/...) aus den ROHEN, nicht-transformierten
  Forschungswerten des jeweiligen Assets berechnet werden (diese Rohdaten
  sind fuer alle verknuepften Assets identisch gespiegelt, nur `rub.bias`
  selbst durchlaeuft die same/inverse-Transformation). Per Playwright
  verifiziert: GOLD/SP500 (Inflation='inverse') zeigen nach erzwungenem
  USD-Bull-Bias korrekt "bearish for GOLD/SP500"; GOLD Economic
  Growth='same' zeigt korrekt "bullish for GOLD" bei USD-Bull.
- Assets OHNE hinterlegte Regel (z.B. BTC/SILVER/OIL im Auslieferzustand,
  kein Default in `MACRO_DERIVE_RULES` und keine eigene
  `sym.deriveRules`-Anpassung) bekommen bewusst KEINEN Asset-Bezug-Satz in
  der Neutral-Aufschluesselung (`macroSignAdjust` liefert 0, keine Treiber)
  - der klare Bull/Bear-Fall nutzt aber weiterhin direkt `rub.bias` (das ist
  fuer diese Assets ihr eigener, unabhaengig berechneter Kartenwert, braucht
  also gar keine Regel).
- **`rubSummarySig()` beruecksichtigt jetzt `effDeriveRules(sym)[rub.name]`**
  (dieselbe Bug-Klasse wie schon zweimal zuvor in dieser Session: die
  Signatur muss JEDEN Text-beeinflussenden Input abdecken, sonst regeneriert
  sich der Text nicht, wenn der Nutzer nur die same/inverse-Einstellung
  aendert, ohne dass sich Indikator-Daten aendern) - `rubSummarySig(sym,rub)`
  nimmt dafuer jetzt `sym` als ersten Parameter entgegen (beide Aufrufstellen
  angepasst: `syncRubSummaries()` und der manuelle Textarea-Edit-Handler).
- `SUMMARY_ENGINE_VERSION` auf `7` erhoeht (Logik-Wechsel von riskEnvDirOf
  auf effDeriveRules zaehlt als Wording-Logik-Aenderung).
- Per Playwright verifiziert: FX (USD) direkt korrekt, GOLD/SP500 (inverse)
  korrekt gedreht, GOLD Growth (same) korrekt gleich, BTC (keine Regel) ohne
  Asset-Bezug-Satz im Neutral-Fall, Regel-Aenderung zur Laufzeit
  (`sym.deriveRules`) regeneriert den Text sofort, kein Grammatik-Fehler
  ueber alle 108 Karten-Kombinationen, voller 14-Tab-Regressionstest
  fehlerfrei.
- **Merksatz:** bei einem Design, das einen bereits existierenden Bias-Wert
  (`rub.bias`) fuer eine Anzeige wiederverwendet, IMMER pruefen, ob dieser
  Wert bereits an ANDERER Stelle durch dieselbe Transformation gelaufen ist,
  die man selbst nochmal anwenden will - sonst doppelte Transformation. Und:
  bevor eine eigene Uebersetzungslogik fuer "was ist gut/schlecht fuer
  dieses Asset" gebaut wird, immer zuerst pruefen, ob dafuer nicht schon
  ein bestehender Einstellungs-Mechanismus existiert (hier: `deriveRules`/
  `MACRO_DERIVE_RULES`), statt eine zweite, konkurrierende Quelle
  einzufuehren.

### Economic-Growth-Anker: "eased to" auf "dropped to" umgestellt (Nutzer-Wunsch 2026-07-21, direkt im Anschluss)

Letzter offener Punkt aus der Eroeffnungs-Anker-Wortwahl-Runde (Inflation
bekam "cooled", Labour Market "fell"/"rose", GDP war noch offen): neues
`ANCHOR_VERBS_GROWTH={up:'climbed to',down:'dropped to',flat:'held at'}`,
in `summarizeGrowth()`s `anchorClause(gRS,ANCHOR_VERBS_GROWTH)` verdrahtet
(vorher ohne Verb-Set-Parameter, damit auf `ANCHOR_VERBS_DEFAULT`/"eased to"
zurueckgefallen). `ANCHOR_VERBS_DEFAULT` selbst bleibt bestehen (aktuell
keine andere Aufrufstelle mehr, aber als generischer Fallback fuer
`anchorClause()` ohne explizites Set weiterhin sinnvoll). `SUMMARY_ENGINE_
VERSION` auf `8`. Per Playwright mit einem erzwungenen GDP-Ruecksetzer
verifiziert: "GDP growth dropped to 1.0%, coming in weaker than expected."
- kein "eased to" mehr im DOM, voller Tab-Regressionstest weiterhin
fehlerfrei.

### Bugfix: Non-FX-Settings liessen COT Data/Risk Environment faelschlich als same/inverse-Regel zu (Nutzer-Bugreport 2026-07-21)

Nutzer: "Ich will das man nicht mehr die Kategorie cot oder Risk environment
da listet und bullish bearish stellen kann weil das ist komplett
unabhängig... bei Gold ist cot aktuell bearish obwohl es bullish sein
müsste." Zusaetzlich: die "Link with other assets"-Sync-Gruppe (z.B.
Krypto) soll COT Data/Risk Environment ebenfalls NICHT zwischen Assets
gleichschalten, da jedes Asset (z.B. BTC/ETH) einen eigenen COT-Report/
eigene Risk-Environment-Lage hat.

- **Ursache:** `MACRO_DERIVE_RUBS=['Inflation','Interest Rates','Labour
  Market','Economic Growth']` (~Zeile 4591) war als Whitelist GEDACHT, wurde
  aber nirgends tatsaechlich benutzt - weder die Settings-Anzeige
  (`renderAssetCfgBody()`) noch die Berechnung (`deriveMacroBiasAll()`)
  filterten danach, beide iterierten blind ueber ALLE Rubriken des Assets.
  Dadurch tauchten "COT Data"/"Risk Environment" im Zahnrad-Menue mit
  Bullish/Bearish/Off-Buttons auf, und ein (vermutlich versehentlicher)
  Klick darauf liess `deriveMacroBiasAll()` GOLDs eigenen, aus GOLDs echtem
  COT-Report berechneten Bias mit dem invertierten USD-COT-Bias
  ueberschreiben - obwohl GOLDs COT-Positionierung mit USDs COT-
  Positionierung nichts zu tun hat.
- **Fix 1 (Settings-UI):** `renderAssetCfgBody()` filtert die Rubrik-Liste
  jetzt auf `MACRO_DERIVE_RUBS` - COT Data/Risk Environment erscheinen nicht
  mehr im Zahnrad-Menue.
- **Fix 2 (Berechnung + Bereinigung):** `deriveMacroBiasAll()` ueberspringt
  jetzt jede Rubrik, die nicht in `MACRO_DERIVE_RUBS` steht (Verteidigung in
  der Tiefe, falls doch nochmal ein stray-Eintrag auftaucht). Neue Funktion
  `cleanDeriveRules(sym)` entfernt bestehende `sym.deriveRules`-Keys, die
  nicht zu den 4 echten Makro-Karten gehoeren - eingehaengt an beiden
  Stellen, die laut der "WICHTIGSTE REGEL" oben dafuer noetig sind:
  `migrateRubInds()` (normaler Boot-Pfad, `addMacroRub()`->`loadState()`)
  UND `applySnap()` (Cloud-Pull/Undo/Redo/Import/Backup-Restore). Danach
  faellt der Bias automatisch auf den echten, aus den eigenen Daten
  berechneten Wert zurueck - keine manuelle Korrektur noetig.
- **Fix 3 (Sync-Gruppe):** `syncAssetGroup()` (die "Link with other
  assets"-Funktion) kopierte beim `rubrics`-Feld bisher das komplette Array
  1:1 zwischen Assets derselben Gruppe. Neue Konstante
  `SYNC_EXCLUDE_RUBS=['COT Data','Risk Environment']` (bewusst mit
  hartkodiertem String statt `MACRO_NAME` - `MACRO_NAME` wird als `const`
  erst viel spaeter im Script deklariert, TDZ-Falle, siehe Merksatz unten)
  - beim Kopieren werden diese beiden Karten aus dem Quell-Array entfernt
  und stattdessen die EIGENEN (Ziel-Asset) COT Data/Risk Environment-Karten
  wieder eingefuegt (Reihenfolge: COT Data vor Risk Environment, passend
  zur etablierten `mkRubOrder()`/`ensureRiskEnvLast()`-Konvention). Alle
  anderen Rubriken (Inflation/Interest Rates/Labour Market/Economic Growth/
  Custom) bleiben wie gehabt 1:1 gespiegelt.
- **TDZ-Bug waehrend der Umsetzung gefunden + gefixt:** der erste Versuch
  von `SYNC_EXCLUDE_RUBS` nutzte `MACRO_NAME` (die Konstante fuer "Risk
  Environment") - `SYNC_EXCLUDE_RUBS` steht aber ganz frueh im Script (bei
  `symSyncGroup()`, ~Zeile 2737), `MACRO_NAME` wird erst bei ~Zeile 4574
  deklariert. Ein `const`-Array-Literal wertet seine Elemente SOFORT aus
  (anders als eine Referenz INNERHALB einer Funktion, die erst beim Aufruf
  ausgewertet wird) - `ReferenceError: Cannot access 'MACRO_NAME' before
  initialization` beim Laden der Seite (per Playwright-Pageerror-Check
  gefunden, nicht erraten). Fix: `'Risk Environment'` hartkodiert statt
  `MACRO_NAME` referenziert - exakt derselbe Stolperstein, der schon einmal
  bei `SENT_MAP`/`COT_NET_HALF` dokumentiert ist (siehe PMI-Eintrag oben:
  "SENT_MAP/SENT_HALF/SENT_SOURCE stehen bewusst FRUEH... weil die Rubrik-
  Migration migrateRubInds sie beim Boot schon braucht (sonst TDZ)").
- Per Playwright verifiziert: (1) simulierter Bug-Zustand (GOLD COT-Bias
  'bull', `deriveRules['COT Data']='inverse'`) - nach `cleanDeriveRules()`+
  Recompute bleibt GOLDs COT-Bias korrekt bei 'bull', der Key ist aus
  `deriveRules` entfernt; (2) `applySnap()`-Rundreise mit vergifteten
  `deriveRules`-Eintraegen (COT Data + Risk Environment) - beide werden
  entfernt; (3) Settings-UI (GOLD) enthaelt "COT Data"/"Risk Environment"
  nicht mehr, "Inflation" weiterhin; (4) Sync-Gruppe (SP500+NAS, Gruppe
  'usidx'): nach `syncAssetGroup('SP500')` behaelt NAS seinen EIGENEN COT-
  Bias ('bear', nicht von SP500s 'bull' ueberschrieben) und seine eigene
  Risk-Environment-Summary, waehrend die Inflation-Summary korrekt von
  SP500 uebernommen wird - Rubrik-Reihenfolge bleibt korrekt. Voller
  14-Tab-Regressionstest + Auto-Summary-Grammatik-Scan weiterhin fehlerfrei.
- **Merksatz:** eine als Whitelist GEDACHTE Konstante (`MACRO_DERIVE_RUBS`)
  ist wertlos, wenn sie nirgends tatsaechlich referenziert wird - beim
  Anlegen einer solchen Konstante IMMER pruefen, ob auch wirklich JEDE
  Stelle, die die zugehoerige Datenstruktur iteriert (hier: UI-Rendering
  UND Berechnungslogik), sie auch tatsaechlich anwendet.

### Auto-Zusammenfassung: COT-Text widersprach dem Bias-Badge + Unemployment-Rate ohne Forecast-Verdikt (Nutzer-Bugreport 2026-07-21, per Screenshot)

Nutzer schickte zwei Screenshots der Live-Seite: GBPs COT-Data-Karte zeigte
Badge "▲ BULLISH +0.5", der Zusammenfassungstext darunter aber "Institutions
are currently leaning more on the **bearish** side, at 70.5%..." - ein
direkter Widerspruch. Frage: "Siehst du das gar nicht? Wie können so Fehler
passieren?" Zusaetzlich: "Unemployment held at… keine Wort dazu das es
besser als expected war?"

**COT-Widerspruch - Ursache:** die Score-Berechnung selbst war korrekt
(kein Rechenfehler): Netto-Positionierung 70.5% short (≥60%-Schwelle)
zieht -0.5, die Wochenveraenderung war aber stark positiv (+4.3%, ≥3pp-
Schwelle) und zieht +1 (volles statt halbes Gewicht) - macht in Summe +0.5,
Badge korrekt "Bullish". `summarizeCot()` beschrieb aber nur das nackte
Niveau ("leaning more on the bearish side") und haengte die WoW-Aenderung
nur als Nebensatz an, ohne zu erklaeren, dass GENAU die gerade den
Ausschlag gibt - fuer den Leser ein scheinbarer Widerspruch zum Badge.

- **Fix:** `summarizeCot()` komplett umgebaut. Niveau-Satz bleibt
  ("Positioning is still net short at 70.5%"), WoW-Aenderung wird nur dann
  mit "but ... which is currently the stronger signal" als Kontrast
  gegenuebergestellt, wenn sie dem Niveau tatsaechlich WIDERSPRICHT
  (`levelSign!==wowSign`) - stimmen beide ueberein oder ist das Niveau
  selbst nicht dominant (Split), waere "but" grammatisch falsch, dann
  simple additive Formulierung ("with the weekly change positive at
  +4.3%"). "Strongly positive/negative" nur wenn die WoW-Aenderung
  tatsaechlich das volle Gewicht bekommt (`!cotWowIsSmall(ind)`, ≥3pp),
  keine erratene Verstaerkung.
- **Neue Funktion `magnitudeBiasWord(sc)`:** liest denselben `rubScore(rub)`-
  Wert, der auch das Badge setzt (Dual-Source-Lehre - kein zweiter,
  unabhaengiger Bias-Pfad) und haengt ein Fazit an ("on balance, that makes
  the picture X"), X abgestuft nach |Score|: 0,5 → "slightly bullish/
  bearish" (Nutzer-Wunsch: "Schreib lieber slightly bullish"), 1,0 → nur
  "bullish/bearish", 1,5 → "strongly bullish/bearish" - dasselbe Vokabular
  wie die bestehende 5-stufige Risk-Correlation-Skala. Bei neutralem Score
  kein Fazit-Satz.
- **Unemployment-Rate-Fix:** `summarizeLabour()`s Eroeffnungssatz nutzte
  `anchorClause()` (nur Trend ggue. Vorwert: "held at"/"fell to"/"rose to"),
  aber NIE das Forecast-Verdikt - anders als Inflation (CPI) und Growth
  (GDP), die im Eroeffnungssatz beides nennen. Fix: `fcState(uRS)`
  (bereits lowerBetter-bereinigt) ergaenzt "coming in better than
  expected"/"coming in worse than expected"/"in line with expectations"
  direkt nach dem Trend-Verb - "The unemployment rate held at 4.9%, coming
  in better than expected, with more jobs than expected added recently."
- `SUMMARY_ENGINE_VERSION` auf `9` erhoeht.
- Per Playwright mit dem EXAKTEN Screenshot-Szenario verifiziert (GBP COT:
  70.5% short + WoW +4.3%) - Ergebnis: "Positioning is still net short at
  70.5%, but this week's shift was strongly positive at +4.3%, which is
  currently the stronger signal — on balance, that makes the picture
  slightly bullish." (Badge-konsistent, keine Widerspruch mehr). GBP
  Labour Market (4.9% actual vs. 5% forecast vs. 4.9% previous) liefert
  "The unemployment rate held at 4.9%, coming in better than expected,
  ...". Voller Grammatik-Scan ueber alle 108 Karten-Kombinationen + 14-Tab-
  Regressionstest + Selbstheilungs-Test weiterhin fehlerfrei.
- **Merksatz:** wenn eine Zusammenfassung EINEN Teilaspekt eines Scores
  beschreibt (hier: nur das Netto-Niveau), aber der Score aus MEHREREN,
  unterschiedlich gewichteten Signalen besteht (hier: Niveau ±0,5 vs. WoW
  bis ±1), kann der beschriebene Teilaspekt dem Gesamt-Badge widersprechen,
  sobald das staerker gewichtete Signal die andere Richtung zieht - bei
  jeder neuen Kartenzusammenfassung pruefen, ob ALLE score-tragenden
  Signale im Text erscheinen und das Text-Fazit immer aus derselben Quelle
  (`rub.bias`/`rubScore()`) wie das Badge kommt, nicht aus einer eigenen
  Teil-Interpretation.

### Vollstaendiger Audit aller 6 Kartentypen auf Badge-Text-Widersprueche: "Geopolitics" bei Non-FX entfernt (Nutzer-Wunsch 2026-07-21, direkt im Anschluss an den COT-Fix)

Nutzer: "Prüf nochmal alle anderen Karten auf ähnliche Widersprüche." Gezielt
mit Testszenarien geprueft, die genau diese Bug-Klasse provozieren (ein
score-tragendes Signal wird im Text ignoriert): erzwungene Gegensignale bei
allen 6 Standard-Kartentypen, inkl. Non-FX same/inverse-Faelle.

**Ergebnis: ein weiterer echter Fall in "Risk Environment" gefunden.** Die
Karte hat zwei Score-Treiber - "Risk Correlation" (automatisch aus dem
Risk-Sentiment-Regler + Safe-Haven/Risk-Asset-Einstellung) und
"Geopolitics" (manuell, wie ein normaler Indikator). `summarizeRiskEnv()`
las aber NUR Risk Correlation (`riskEnvLevel`/`riskEnvDirOf`), Geopolitics
komplett ignoriert. Zwei per Playwright bestaetigte Widersprueche: (1)
Regler auf "None" + Geopolitics manuell bullish gesetzt -> Badge "Bullish"
(Score allein aus Geopolitics), Text sagte trotzdem "having no clear
impact". (2) GOLD, Regler auf "Full" (waere pro Safe-Haven-Einstellung
bullish) + Geopolitics manuell stark bearish (hebt sich auf) -> Badge
korrekt "Neutral", Text behauptete trotzdem "bullish for GOLD".
Inflation/Labour Market/Economic Growth/Interest Rates/COT Data (frisch
gefixt) zeigten in allen erzwungenen Szenarien (inkl. Non-FX same/inverse-
Regeln wie GOLD Inflation='inverse'/SP500 Labour Market='same') KEINE
weiteren Widersprueche - dort ist der Schlusssatz bereits durchgehend
Dual-Source-sicher (`biasSignOf(rub)`/`assetVerdictClause()`).

**Nutzer-Entscheidung zum Fix (nach Vorschlag einer komplexeren Kontrast-
Formulierung explizit abgelehnt):** "Lass den Indikator bei fx und entfern
ihn bei Non fx. Sag einfach das political uncertainty bullish oder bearish
für die Währung ist bei der Zusammenfassung. Ganz simpel." - strukturelle
Loesung statt Text-Reparatur:

- **"Geopolitics" existiert nur noch bei FX-Waehrungen.** Bei Non-FX-Assets
  (Gold/Silber/Oel/BTC/Indizes/...) war ohnehin unklar, WESSEN Politik
  gemeint sein soll - der Indikator wird dort komplett entfernt, "Risk
  Environment" hat bei Non-FX nur noch "Risk Correlation". Neue Konstante
  `RISK_ENV_INDS_NONFX=['Risk Correlation']` neben dem bestehenden
  `RISK_ENV_INDS=['Risk Correlation','Geopolitics']` (FX). `mkMacroRub()`
  (neue Assets) und `migrateRiskEnvRub(rubrics,sym)` (bestehende Assets -
  jetzt mit `sym`-Parameter fuer den FX/Non-FX-Unterschied, beide
  Aufrufstellen `migrateRubInds()`/`applySnap()` angepasst) waehlen je nach
  `isNonFx(sym.id)` das richtige Set. Bestehende Werte fuer Indikatoren, die
  in BEIDEN Sets vorkommen ("Risk Correlation"), bleiben beim Migrieren
  erhalten statt neu erzeugt zu werden.
- **Bei FX bekommt Geopolitics einen eigenen, simplen Zusatzsatz** statt in
  die Risk-Correlation-Zeile verwoben zu werden: "Political uncertainty is
  currently bullish/bearish for USD." - nur wenn `geo.bias` tatsaechlich
  nicht neutral ist, sonst bleibt der Satz komplett weg (Standardfall,
  Geopolitics wird von den meisten Nutzern nie angefasst, bleibt exakt wie
  zuvor). Loest den Widerspruch strukturell: beide Saetze sind rein additiv
  und beschreiben je NUR ihr eigenes Signal, keiner behauptet ein
  Gesamt-Fazit fuer die ganze Karte - kann sich dadurch nicht gegenseitig
  widersprechen.
- Per Playwright verifiziert: GOLD/BTC/SP500/SILVER/OIL/NAS haben nach
  Migration nur noch "Risk Correlation" (keine der beiden Bug-Szenarien
  mehr moeglich, da der zweite Treiber schlicht nicht mehr existiert);
  USD/EUR behalten beide Indikatoren; der urspruengliche Bug-Fall 2 (GOLD +
  Geopolitics) reproduziert sich nicht mehr; Fall 1 (USD, Geopolitics
  manuell) liefert jetzt den additiven Satz, keinen Widerspruch mehr;
  Standardfall (Geopolitics neutral) liefert wortgleich den alten Text -
  keine Regression. Migrations-Test mit einem simulierten Alt-Zustand
  (GOLD traegt noch einen stale "Geopolitics"-Eintrag mit gesetztem Bias)
  durch `applySnap()` geschickt - wird korrekt entfernt, USDs Geopolitics-
  Bias bleibt dabei erhalten. `SUMMARY_ENGINE_VERSION` auf `10`. Voller
  14-Tab-Regressionstest + Grammatik-Scan weiterhin fehlerfrei.
- **Merksatz:** bei einer gemeldeten Text-Badge-Diskrepanz nicht nur DIE
  eine gemeldete Karte fixen, sondern (wie hier auf Nutzer-Wunsch
  systematisch gemacht) JEDEN anderen Kartentyp mit demselben
  Struktur-Muster (mehrere unabhaengig score-tragende Indikatoren, von
  denen der Text nur einen wiedergibt) gezielt mit erzwungenen
  Gegensignal-Szenarien durchtesten - das reine Lesen des Codes haette den
  Risk-Environment-Fall vermutlich uebersehen, erst der gezielte Test mit
  einem isolierten, starken Gegensignal deckte ihn auf.

### NZD Manufacturing PMI/Services PMI/Retail Sales: kompletter Live-Pfad hatte gefehlt (Bugreport 2026-07-22)

Nutzer-Screenshot der NZD-"Economic Growth"-Karte: Zusammenfassung erwaehnte
PMIs/Retail Sales gar nicht. Zusaetzlich per eigener Beobachtung: "guck ma
bei nzd retail Sales da kommt monatlich ein neuer Wert aber der Wert der da
steht ist aus dem mai und bei services pmi das gleiche. Das sollte ja schon
laengst aktualisiert sein. Find das Problem."

- **Ursache:** fuer diese drei Indikatoren gab es bei NZD noch NIE einen
  Live-Pfad - nur die einmalige statische Erstbefuellung
  (`IND_RESEARCH_DATA`/`applyIndResearch()`), die naturgemaess einfriert.
  `researchBias()` (nur dieser eine Pfad) hat KEINEN Trend-Fallback bei
  fehlendem Forecast. Weder FF-Kalender (fuehrt keine NZD-PMI/Retail-Events)
  noch der TradingView-Feed (`RULES` im Workflow kannten NZDs eigene
  Reihentitel nicht) noch Investing.com (kann nur FORECASTS an bereits
  bestehende Eintraege anreichern, keine neuen erzeugen) griffen.
- **Fix (Workflow, `update-ff-calendar.yml`, RULES-Array):** per
  workflow_dispatch-Diagnose (Titel-Dump aller NZD-Kalenderevents von
  TradingView) die tatsaechlichen Reihentitel gefunden - BusinessNZ fuehrt
  eigene, anders betitelte Reihen statt der generischen S&P-Global-Namen:
  `"business nz pmi"` (Manufacturing PMI), `"services nz psi"` (Services
  PMI), `"electronic retail card spending mom"` (Retail Sales m/m, TV fuehrt
  keine eigene "Retail Sales m/m"-Reihe fuer NZD). Drei neue NZD-spezifische
  RULES-Eintraege ergaenzt (currency-gated `c==="NZD"`). Per zweitem
  workflow_dispatch-Lauf verifiziert: echte Live-Werte kommen jetzt an
  (Manufacturing PMI 59.7 vs. vorher eingefroren 49.9, Services PMI 50.6 vs.
  47.5, Retail Sales -1,4% vs. 1,7%) - alle drei ohne Forecast (`forecast:
  null`), aber mit echtem `previous`.
- **Scoring lief automatisch korrekt mit, KEINE Code-Aenderung noetig:**
  `applyIndDataFeed()` ruft fuer FX-Indikatoren unconditional
  `applyTrendModel(ind,nf==null,false)` auf - bei fehlendem Forecast greift
  exakt derselbe Step+Trend-Mechanismus wie bei jedem anderen Indikator ohne
  Forecast (±0,5 Basis gegen Previous + additiver ±1-Bonus bei bestaetigtem
  2-Schritt-Trend, NIE Ersatz). Per Playwright mit den echten Live-Daten
  bestaetigt: alle drei NZD-Indikatoren zeigen jetzt `stepDriven:true` mit
  korrekter Bias-Richtung (Manufacturing/Services PMI bull, Retail Sales
  bear).
- **Text-Seite (`index.html`, `summarizeGrowth()`):** PMI-/Retail-Sales-
  Klausel nutzte bisher ausschliesslich `fcState()` (Forecast-Vergleich) -
  ohne Forecast blieb `pmiCls`/`retailCls` `null`, der Satz komplett stumm.
  Neuer Trend-Fallback: `classifyPair(trendState(...),trendState(...))` bzw.
  `classifySingle(trendState(...))` als Ersatz, wenn die Forecast-Variante
  `null` liefert - dieselbe `classifyPair`/`alignCls`-Skala wie ueberall
  sonst (Nutzer-Vorgabe: "ob nur Party oder mixed (also einer hoch einer
  runter)" ist exakt die bestehende partly/mixed-Klassifikation). Neues
  `TREND_WORDS`-Vokabular ("trending higher/lower/partly.../mixed
  directions") statt `HOTCOLD_WORDS` ("hotter/softer than expected") - es
  gibt hier ja keinen Forecast, gegen den etwas "than expected" waere. Greift
  nur, wenn kein GDP-Bezug (`alignCls` gegen `gCls`) moeglich ist - hat GDP
  selbst eine Forecast-Richtung, bleibt die bereits bestehende
  "supporting/not supporting that growth picture"-Formulierung unveraendert
  fuehrend (unabhaengig davon, ob die PMI/Retail-Klassifikation selbst aus
  Forecast oder Trend stammt) - kein neuer Sonderfall, nur eine zusaetzliche
  Eingabequelle fuer dieselbe bestehende Logik. `SUMMARY_ENGINE_VERSION` auf
  11 erhoeht (Wording-Logik-Aenderung, Selbstheilungs-Pflicht siehe Merksatz
  oben).
- Per Playwright mit den echten NZD-Live-Daten verifiziert: Standardfall
  (GDP hat eine Forecast-Richtung) nutzt weiterhin die aligned-Formulierung;
  mit entferntem GDP-Forecast (kein Alignment-Ziel) greift der reine
  Trend-Pfad korrekt ("PMIs are trending higher."); erzwungenes
  Gegensignal (eine PMI rauf, eine runter) liefert korrekt "trending in
  mixed directions"; beide runter liefert korrekt "trending lower."; USD
  (hat Forecasts) zeigt unveraendert die alte fc-basierte Formulierung -
  keine Regression. Voller JS-Syntax-Check sauber, keine Page-Errors.
- **Noch offen (bewusst nicht in diesem Fix):** die drei NZD-Indikatoren
  liefern weiterhin keinen Forecast (TradingView fuehrt fuer diese Reihen
  keinen) - das ist der vom Nutzer selbst sanktionierte Fallback-Fall
  ("entweder... wie mit fc verglichen oder halt mit precious"), kein
  Rest-Bug. Sollte TradingView/Investing.com kuenftig doch einen Forecast
  fuer eine dieser drei Reihen fuehren, greift die bestehende
  Investing.com-Enrichment-Logik automatisch (kein weiterer Code noetig).

### Trend/Step-Chip am Indikator: Bias-Farben statt immer Blau (Nutzer-Wunsch 2026-07-22)

Nutzer: "Ich will das dieser Kasten wo drinne steht Trend oder auch Stepp
oder auch beides wenn es negativen Score impact hat auch in der bias Farbe
bearish ist." Der `.trend-chip` (📈 "Trend +1"/"Step +0.5 · 1/2"/etc., neben
jedem Indikator mit Trend-Daten) war bisher IMMER blau (`var(--blue)`),
unabhaengig von der Richtung - nur der neutrale Zustand (`.neu`) war grau.
Nach Rueckfrage (nur negativ rot, oder auch positiv auf die Bias-Farbe
umstellen) entschied der Nutzer: **beide Richtungen** auf die App-weiten
Bias-Farben umstellen (gruen=bullish/rot=bearish, wie ueberall sonst, z.B.
`.ibo.bb`/`.ibo.br`), nicht nur die negative Seite isoliert reparieren.

- Neue CSS-Klassen `.trend-chip.bull`(`var(--green)`)/`.trend-chip.bear`
  (`var(--red)`), analog zum bestehenden `.trend-chip.neu`-Muster.
- In der Chip-Render-Funktion (`renderDetail()`, Trend-Chip-IIFE) wird `cls`
  jetzt in JEDEM der vier Zweige gesetzt: `ind.stepDriven` (deckt sowohl den
  reinen Step-Fall als auch den bestaetigten Trend-Fall ab, da beide
  `ind.bias`='bull'/'bear' nutzen) → `bull`/`bear` nach `ind.bias`;
  `ind.trendBias==='bull'`/`'bear'` (Bond-Yields-Pfad ohne stepDriven) →
  ebenso; neutraler Fall unveraendert `neu`.
- **Hinweis, kein Bug:** `--green` ist in dieser App als Hex-Wert tatsaechlich
  ein helles Cyan-Blau (`#4fc3f7`), nicht "klassisch gruen" - das ist aber
  die durchgehend etablierte Bull-Farbe der ganzen App (identisch zu
  `.ibo.bb`), keine Abweichung vom Muster.
- Per Playwright verifiziert: erzwungene Zustaende (stepDriven bull/bear
  ohne Trend, stepDriven bull/bear MIT bestaetigtem Trend, neutral) liefern
  exakt die erwarteten Klassen + `getComputedStyle().color`-Werte
  (`rgb(79,195,247)` fuer bull, `rgb(239,83,80)` fuer bear, unveraendertes
  Grau fuer neutral), keine Page-Errors.

### Bias-Buttons durch Long-Press-Popover ersetzt + einheitliche Verfalls-Logik fuer manuelle Bias-Wahl (Nutzer-Experiment 2026-07-22)

Nutzer: "Entfern mal bei jeder Karte und jedem Indikator und generell wo das
überall Verwender wird diese drei Vierecke mit denen man das bias einstellen
kann. Ich will dafür als Ersatz das wenn man länger auf eine Karte oder einen
Indikator drauf drückt das sich dann ein Fenster mit genau den Feldern öffnet
wo man einstellen kann ob es bullish bearish oder neutral ist. Diese
Änderungen verfallen sobald der Indikator wieder automatisch einen neuen Wert
bekommt." Vor dem Codieren zwei offene Design-Fragen per `AskUserQuestion`
geklärt (Popover am Druckpunkt vs. zentrales Modal -> Popover; bestehende
Verfalls-Logik pro Indikator-Typ unangetastet lassen vs. vereinheitlichen ->
vereinheitlichen), wie von der "erst OK einholen"-Regel verlangt.

**Vier Fundstellen des ▲/◆/▼-Musters** (`grep 'onclick="set.*Bias'`): Rubrik-
Karten-Header (`.rbg`/`.rbo`, `setRubBias`), Indikator-Zeile (`.ibg`/`.ibo`,
`setIndBias`), Notes-Tab-Kategorie (`.rbg`/`.rbo`, `setNoteRubBias`), Notes-
Tab-Eintrag (`.rb-g`/`.rb`, `setNoteRubItemBias`) - alle vier ersetzt, alte
CSS-Klassen als jetzt toter Code entfernt (`.rbg`/`.rbo`/`.ibg`/`.ibo`/
`.rb-g`/`.rb`/`.auto-lock button`).

- **Long-Press-Infrastruktur** (`biasPressStart`/`biasPressEnd`, ≈ Zeile
  2826, nach dem etablierten `rwPressStart`/`ilPressStart`-Muster fuer den
  Zinserwartungs-Link bzw. Quellen-Link): `onpointerdown`/`onpointerup`/
  `onpointerleave`/`onpointercancel`/`oncontextmenu="return false"` auf dem
  jeweiligen Header-Container (`.rub-hdr`/`.ind-hdr`) bzw. der Notes-Zeile
  (`.ri`), 450ms Timer oeffnet `openBiasPicker(kind,ri,ii,x,y)`. Bricht ab,
  wenn der Druck auf einem Button/Link beginnt (eigene Einzel-Aktion:
  Stern, Loeschen, Auf/Ab, ...) - **bewusst NICHT** auf dem Namens-
  Eingabefeld: die Kartenkoepfe haben sonst praktisch keine freie Flaeche
  (das Feld fuellt fast die ganze Zeile, empirisch per Playwright bestaetigt
  - `document.elementFromPoint()` auf einen freien Fleck im Header fand
  buchstaeblich keinen einzigen Pixel). Ein kurzer Klick zum Umbenennen
  bleibt trotzdem unbeeinflusst, da der Timer beim Loslassen vor Ablauf der
  450ms abgebrochen wird.
- **Popover** (`openBiasPicker`/`biasPickerChoose`/`closeBiasPicker`, ≈ nach
  `setRubBias`): `document.body.appendChild`+`position:fixed`-Muster wie
  `toggleDataMenu`/`openStackMenu` (kein Zentral-Modal), erscheint am
  Druckpunkt, zeigt den aktuellen Bias hervorgehoben, schliesst bei Klick
  auf eine Option oder ausserhalb. Gesperrte Faelle (per Zahnrad gespiegelte
  Karte/Indikator, "Risk Correlation") zeigen weiterhin dieselbe `alert()`-
  Erklaerung wie zuvor, GEPRUEFT VOR dem Oeffnen des Popovers (kein Fenster,
  das man dann doch nicht nutzen kann). Lock-Icon (🔗) bleibt separat sichtbar
  (aus der entfernten Button-Gruppe herausgeloest) - zeigt weiterhin auf
  einen Blick, dass eine Karte/ein Indikator automatisch gesteuert ist, ohne
  erst einen Long-Press zu brauchen.
- **Verfalls-Logik vereinheitlicht** (Nutzer-Wunsch: "verfallen sobald...
  einen neuen Wert bekommt"): Kartenebene (`rub.bias`) hatte dieses Verhalten
  BEREITS ueber das bestehende `rub._biasScore`-Pin-Muster
  (`recomputeRubricAutoBias()`, siehe Merksatz-Kommentar dort) - unveraendert
  gelassen. Indikator-Ebene (`ind.bias`) hatte es NICHT konsistent: der
  Feed-Pfad MIT Forecast (`applyIndDataFeed()`s Bias-Selbstheilung)
  ueberschrieb jede manuelle Wahl bei JEDEM stuendlichen Poll, auch OHNE
  Datenaenderung; der Feed-Pfad OHNE Forecast (`applyTrendModel()`) haette
  eine manuelle Wahl auf einem zuvor `stepDriven`-aktiven Indikator beim
  naechsten Poll ebenfalls sofort verworfen (stepDriven blieb `true` stehen);
  Bond/COT/Sentiment-Feed hatten ueberhaupt keinen Schutz. Neue gemeinsame
  Signatur-Funktionen `indBiasInputSig(actual,forecast,previous,date)`/
  `indBiasPinned(ind,sig)` (≈ Zeile 3595, direkt vor `applyTrendModel`):
  `setIndBias()` pinnt bei jeder manuellen Wahl den aktuellen
  `ind.research`-Stand; JEDER der fuenf Automatik-Pfade prueft das VOR einem
  Schreibzugriff auf `ind.bias` (bzw. bei `applyTrendModel`s noForecast-Zweig
  zusaetzlich `stepDriven`/`trendDriven`, komplett eingefroren solange
  gepinnt) - alle fuenf teilen sich denselben Landeplatz
  `ind.research.{actual,forecast,previous,date}`, daher genuegt EINE
  gemeinsame Signatur statt fuenf eigener Implementierungen. `applyTrendModel`
  bekommt dafuer einen neuen optionalen 4. Parameter `sig`; der Kalenderpfad
  (`syncIndicatorBiases()`) hatte fuer die direkte Beat/Miss-Zuweisung zwar
  bereits einen eigenen, aehnlichen Schutz (`ind.autoEvId`/`newRelease`) -
  der wird durch die neue Signatur ERGAENZT (robuster, da `ev.id` laut
  bestehendem Code-Kommentar "bei jedem FF-Reload wechselt", waehrend
  Actual/Forecast/Previous/Datum stabil bleiben) statt ersetzt.
- Per Playwright mit den ECHTEN lokalen Feed-Daten (ind_data.json,
  bond_data.json, cot_data.json, sentiment_data.json) verifiziert, ueber
  alle fuenf Pfade: manuelle Wahl bleibt bei einem erneuten Lauf mit
  UNVERAENDERTEN Rohdaten stehen; sobald die Rohdaten sich wirklich aendern
  (Actual/Bond-Yield/Long-Short-Split/Sentiment-Wert bewusst verschoben),
  berechnet der jeweilige Automatik-Pfad wieder normal und die manuelle Wahl
  verfaellt selbststaendig. **Zwei Playwright-Fallstricke dabei gefunden
  (Test-Artefakte, kein App-Bug):** (1) `getRub`/`getInd` haengen vom GLOBAL
  gewaehlten Symbol ab (`selId`) - ein Test, der Indizes eines ANDEREN
  Symbols berechnet ohne vorher `selSym()` aufzurufen, trifft im Zweifel
  eine falsche/leere Stelle und `setIndBias` bricht daher still ab. (2) bei
  Bond/COT muss die MUTATION exakt den Wert treffen, den die Auto-Funktion
  tatsaechlich liest (`bondPick(series,yesterday)` sucht nach Datum, nicht
  einfach `series[series.length-1]`; `cotMetrics()` liest `s.long`/`s.short`
  direkt vom Symbol-Objekt, nicht aus dem `history`-Array) - sonst hat die
  Mutation schlicht keinen Effekt und der Test liefert ein falsch-negatives
  Ergebnis. Voller 14-Tab-Regressionstest + Undo/Redo mit einer Bias-Wahl
  weiterhin fehlerfrei.
- **Bewusst NICHT geaendert:** die Risk-Correlation-5-Stufen-Sperre (weiterhin
  komplett automatisch, keine manuelle Wahl moeglich, wie zuvor), das COT-
  Data/Risk-Environment-Ausschluss beim Karten-Zahnrad (unabhaengiges
  Feature vom 2026-07-21), die generelle Score-Formel selbst (nur WANN ein
  manueller Override respektiert wird, nicht WIE der Score berechnet wird).

### Indikator-Zeile + Karten-Header: rechte Icon-Reihe wie eine Tabellenspalte ausgerichtet (Nutzer-Wunsch 2026-07-22)

Nutzer per Screenshot: die rechte Icon-Reihe an Indikator-Zeilen (i, Zeit-
intervall-Badge, Trend/Step-Chip, Stern, Auf/Ab, Löschen) stand unordentlich
da - unterschiedlich lange Badge-Texte ("Trend 0/2" vs. "Step +0.5 · 1/2",
"daily" vs. "quarterly") liessen die Icons in jeder Zeile unterschiedlich
weit versetzt erscheinen, ganz anders als z.B. die Set-ups-Tabelle. Vorgabe:
"i" direkt links vom Stern, Trend/Step-Chip direkt links vom "i", Zeit-
intervall-Badge direkt links vom Chip - UND die beiden variablen Badges
sollen trotz unterschiedlicher Textlaenge alle untereinander an derselben
Stelle beginnen (wie eine Tabellenspalte).

- **Neue Reihenfolge Indikator-Zeile** (`renderInd`, ≈ Zeile 6058): `[Zeit-
  intervall-Badge] [Trend/Step-Chip] [i] [★] [▲] [▼] [✕]` (vorher: i vor
  beiden Badges). Der Lock-Hinweis (🔗, gespiegelte/Risk-Correlation-
  Indikatoren) bleibt bewusst GANZ LINKS (direkt nach dem Namensfeld), damit
  er die beiden ausgerichteten Spalten nicht stoert - er ist selten/bedingt
  und braucht keine eigene Spaltenausrichtung.
- **Neue Reihenfolge Karten-Header** (`renderRub`, ≈ Zeile 5888): `[Score-
  Badge] [i] [★] [▲] [▼] [✕]` (vorher: i vor dem Score-Badge) - dieselbe
  Logik auf Kartenebene.
- **Feste Spaltenbreite**: `.trend-chip` (min-width 92px, gemessen aus dem
  laengsten Label "📈 Step +0.5 · 1/2"), `.ibadge`/`.add-date-btn`
  (min-width 100px, gemessen aus "🔄 quarterly"), `.rub-score` (min-width
  44px) - jeweils rechtsbuendiger Text (`text-align:right` bzw. bei `.ibadge`
  als Flexbox `justify-content:flex-end`, da Icon+Text zwei Kindelemente
  sind). Da `*{box-sizing:border-box}` global gilt, entspricht `min-width`
  direkt der gemessenen Border-Box-Breite - kein Nachrechnen von
  Padding/Border noetig. Folgt demselben, bereits bestehenden Muster wie
  `.row-score{width:26px;text-align:right}` (Matrix-Tab), nur mit
  `min-width` statt festem `width` (echte historische Extremwerte duerfen
  die Spalte sprengen statt abgeschnitten zu werden).
- **Unsichtbarer Platzhalter, wenn der Trend-Chip fehlt** (Bond-Renditen
  ohne Trend, `NO_TREND_RUBS`-Karten, Indikatoren ohne Trend-Daten): die
  IIFE gibt jetzt `<span class="trend-chip" style="visibility:hidden">
  </span>` statt eines leeren Strings zurueck - `visibility:hidden` (statt
  `display:none`) behaelt den Platz im Flex-Layout, wodurch die Spalte in
  DIESER Zeile nicht nach rechts wandert. Per Playwright verifiziert: "2Y
  Bond Yield"/"10Y Bond Yield"/"2Y/10Y Spread" (kein Trend) haben exakt
  dieselbe `i`-Icon-Position wie "CPI (Headline) y/y" (mit Trend) in
  derselben Inflation-Karte.
- **Bewusste Ausnahme**: das Zeitintervall des Leitzins-Indikators ("every
  6-8 weeks", deutlich laenger als "daily"/"weekly"/"monthly"/"quarterly")
  wuerde die Spalte auf ueber 150px aufblasen, wenn sie mit einbezogen
  wuerde - bleibt bewusst aussen vor (`min-width` statt festem `width`
  erlaubt genau das: die Box waechst fuer diesen einen Ausreisser natuerlich
  ueber die Spaltenbreite hinaus, ohne den Text abzuschneiden oder die
  anderen Zeilen zu beeinflussen).
- Vor dem Umsetzen einen konkreten Plan (Reihenfolge + Ausrichtungsmechanik +
  Ausreisser-Fall) vorgestellt und Bestaetigung abgewartet (CLAUDE.md-Regel
  "erst OK einholen"). Per Playwright verifiziert: `getBoundingClientRect()`
  von Chip/Badge/i liefert exakt dieselben X-Koordinaten fuer JEDE
  Indikator-Zeile innerhalb einer Karte (auch ueber unterschiedliche Badge-
  Texte hinweg) und fuer JEDEN Karten-Header innerhalb derselben Masonry-
  Spalte; voller 14-Tab-Regressionstest + Undo/Redo weiterhin fehlerfrei.

### "Kein Datum vorhanden" markierbar + Trend-Chip fehlte bei vielen Indikatoren (Bugreports 2026-07-22, direkt nach der Spalten-Ausrichtung)

Zwei Bugreports im Anschluss an die Icon-Spalten-Ausrichtung (siehe voriger
Eintrag) - die neue, prominentere Spalten-Optik machte beide Luecken erst
richtig sichtbar:

**(1) "+ Date"-Einladung liess sich nicht dauerhaft abstellen.** Nutzer:
"bei chf... [nein, das war der zweite Bugreport - hier das erste:] obwohl
ich in der zweiten Stufe des Reglers bin wird das Datum bei den Indikatoren
angezeigt, wo keins eingetragen ist. Da ist aber keins eingetragen, weil es
dazu keins gibt." Gemeint ist die Kompakt-Stufe (`compactView`/
`compactLevel`): Stufe 1 (`body.compact-view`) blendet nur `.ibadge`
(Zeitintervall) aus, nicht aber `.dbadge`/`.add-date-btn` (erst Stufe 2,
`compact-view2`, tut das) - fuer rein qualitative Indikatoren ohne jedes
Datum-Konzept (CB Tone, Next CB Move, Geopolitics, individuelle Custom-
Indikatoren) blieb die "+ Date"-Aufforderung dadurch bei Stufe 1 dauerhaft
sichtbar, obwohl es dafuer schlicht nie ein Datum geben wird.
- **Fix:** neue Checkbox "This indicator has no release date (don't ask
  again)" im bestehenden Datums-Modal (`mDate`/`openDateM`/`saveDateM`) -
  setzt `ind.noDate=true` (persistiert automatisch mit, da Indikatoren als
  ganzes Objekt Teil von `snap()` sind - keine eigene 4-Punkte-Sync-
  Anbindung noetig, anders als globale State-Felder wie `tabStacks`).
  `renderInd()`s `datePart`-Zweig zeigt bei `ind.noDate` einen LEEREN, aber
  weiterhin klickbaren `.add-date-btn` (kein Text/Icon) statt der "+ Date"-
  Aufforderung - bewusst NICHT komplett unsichtbar (`visibility:hidden`),
  damit der Slot als Escape-Hatch reichbar bleibt (erneuter Klick oeffnet
  das Modal wieder, Checkbox laesst sich jederzeit zurueck-haken). Greift
  unabhaengig von der Kompakt-Stufe (die CSS-Regeln `compact-view`/
  `compact-view2` bleiben unveraendert, das ist jetzt eine reine Content-
  Entscheidung, kein CSS-Sichtbarkeits-Hack).
- Per Playwright verifiziert: Checkbox setzen + Speichern -> leerer Slot,
  `ind.noDate===true`; Modal erneut oeffnen -> Checkbox weiterhin gehakt;
  Haken entfernen + Speichern -> "+ Date"-Button + Text kommen zurueck.

**(2) Trend-Chip fehlte komplett bei vielen Indikatoren.** Nutzer: "bei chf
gibt es sehr viele Indikatoren wo es gar nicht den Trend gibt und auch bei
anderen Assets ist das der Fall. Ich will das das aber bei jedem Indikator
mit Wert der Fall ist, ausser bei Bonds halt, ist ja klar." Ursache: die
`hasData`-Bedingung fuer den Chip (siehe voriger Eintrag) verlangte
`valHist`/`stepDriven`/`trendBias` - Felder, die AUSSCHLIESSLICH von
`trackIndValues()`/dem Trend-Engine-Lauf befuellt werden, welcher wiederum
nur bei Indikatoren mit eigener Live-Feed- oder Kalender-Abdeckung laeuft.
Indikatoren, die NUR auf der einmaligen Recherche-Erstbefuellung
(`IND_RESEARCH_DATA`/`applyIndResearch()`) stehen (bekannte "Feed-
Abdeckungsluecke", bei CHF/CAD/AUD/NZD an mehreren Stellen oben
dokumentiert), haben zwar einen echten, angezeigten Actual-Wert, aber NIE
diese Felder - der Chip blieb dadurch dauerhaft (unsichtbarer Platzhalter)
aus, obwohl ein Wert da war.
- **Fix:** `hasData` bekommt einen zusaetzlichen `hasValue`-Zweig
  (`ind.research&&ind.research.actual!=null&&ind.research.actual!==''`) -
  reicht ein Wert allein schon, faellt der Chip mangels `valHist` auf den
  neutralen "Trend 0/2"-Fortschritt zurueck (`indTrendProgress` liefert bei
  leerem/zu kurzem `valHist` sicher `0`, kein Crash).
- **Ausnahmen ausgeweitet, nicht nur Bonds:** beim Testen mit CHF zeigte
  sich, dass die neue Regel auch bei "2Y/10Y Spread" (`SCORE_ZERO` - traegt
  NIE etwas zum Score bei, unabhaengig von Bias/Trend) und bei COT-/
  Sentiment-gespeisten Indikatoren (haben laut bestehender Dokumentation
  "bewusst KEINEN Trend-Bonus", ihre WoW-Aenderung bzw. Extremwert-Logik
  IST bereits das eigene Momentum-Signal) einen permanent bei "Trend 0/2"
  eingefrorenen, bedeutungslosen Chip gezeigt haette (`valHist` wird fuer
  diese Pfade nie befuellt, der Fortschritt haette sich also nie bewegt).
  Beide zusaetzlich zur bestehenden Bond-/`NO_TREND_RUBS`-Ausnahme
  ausgeschlossen (`SCORE_ZERO.has(...)` bzw. `ind.research.cot||ind.research.sent`)
  - der Nutzer hatte nur Bonds explizit genannt, aber diese beiden Faelle
  folgen aus genau derselben, bereits vorher getroffenen Design-
  Entscheidung ("kein Trend-Modell fuer diese Quelle"), nicht aus einer
  eigenen neuen Abwaegung.
- Per Playwright verifiziert (CHF, alle Karten ausser Interest Rates - das
  bleibt komplett ausgeschlossen via `NO_TREND_RUBS`): jeder Indikator mit
  echtem Actual-Wert zeigt jetzt einen Chip (0/2, 1/2 oder konfirmiert),
  2Y/10Y-Renditen + Spread bleiben unsichtbar/platzhalter, GOLD COT-Data-
  Karte (Net Bullish/Bearish/WoW Change) bleibt ebenfalls unsichtbar. Voller
  14-Tab-Regressionstest weiterhin fehlerfrei.
