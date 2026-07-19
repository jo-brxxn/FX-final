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
"zurück auf Auto" = null ankommt).

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
- **Score-/Asset-Karten**: kalmes Design statt Farbflut — Bias wird über
  einen linken Rand-Streifen gezeigt (`.rub-card` 4px, `.ind-card`/
  `.pair-card`/`.sym-row` 3px) auf neutralem 1px-Rahmen, `glow-*`-Klassen
  setzen nur `border-left-color` (+ schwacher Gradient), nicht die ganze
  Karte einfärben.

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
