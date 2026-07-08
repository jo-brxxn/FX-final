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

### Markt-Sentiment (sentiment_data.json) — Stand nach Live-Verifikation (2026-07-08)

Contrarian-Stimmungs-Layer, Workflow-Schritt "Fetch market sentiment"
(continue-on-error, Carry-over, jede Quelle eigenes try/catch). Nach EINEM
`workflow_dispatch`-Lauf verifiziert, welche Quellen aus GitHub-Actions-IPs
erreichbar sind:

- **Crypto Fear & Greed** (`api.alternative.me/fng/`) — ✓ zuverlässig, eigene
  Historie. Scort **BTC** (auch ETH, falls angelegt).
- **VIX** (TradingView-Scanner `CBOE:VIX`, wie price_data) — ✓ zuverlässig,
  Tagesschluss + Carry-over-Serie. Scort **SP500/NAS** (contrarian: ≥28
  Panik=bullish, ≤13 Sorglosigkeit=bearish).
- **Stock Fear & Greed** (CNN `production.dataviz.cnn.io`) — ✗ HTTP 418
  ("I'm a teapot. You're a bot."), Datacenter-IP-Block. Bessere Header
  (Accept/Referer/Origin) als Versuch drin, hilft bei reinem IP-Block nicht.
  **Chart-only** im Sentiment-Tab.
- **CBOE Put/Call** (TradingView `USI:PC`/`USI:PCC`) — ✗ Scanner liefert den
  Ticker nicht (nur VIX kam zurück). **Chart-only**.

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
dort schon drin) — da CNN eh blockt, ist VIX aktuell das einzige gescorte
Index-Signal.

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
  die ROHE Summe aus (im Modal + Badge-Tooltip offengelegt); ebenso
  bleiben Score-Historie (`recordScoreHist`), Tages-History-Panel und
  Flip-Alerts auf roher Basis. Das Symbol-Modal zeigt beide Zeilen:
  "Raw sum of all indicators" und "Displayed score: raw × Faktor".
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
