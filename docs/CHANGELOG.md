# FX Analyst Pro — Session-Historie / Changelog

Dies ist das ausgelagerte Engineering-Tagebuch aus der CLAUDE.md (Trennung
am 2026-08-21, weil die CLAUDE.md allein ~25% des Kontextfensters jeder
Session verbraucht hat). **Diese Datei wird NICHT automatisch geladen** —
sie ist reine Nachschlage-Referenz.

**Wann hier nachsehen:** bei einem Bugreport, der nach einem bereits
bekannten Muster riecht ("das hatten wir doch schon mal"), oder um zu
prüfen, ob eine Design-/Score-Entscheidung schon einmal bewusst getroffen
und begründet wurde, bevor man sie neu aufrollt. Am besten per Grep nach
Stichwort/Datum durchsuchen, nicht komplett einlesen.

**Was hier NICHT steht:** die aktuell gültigen, standing Regeln — die
bleiben in `CLAUDE.md` selbst (Score-Modell-Referenz, Sync-Muster,
Arbeits-Workflow, Waechter-Pflicht etc.). Bei Widerspruch zwischen einem
älteren Eintrag hier und CLAUDE.md gilt immer CLAUDE.md.

Chronologisch, ältester Eintrag zuerst.

---

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
  Mobil (<760px): kompakter Header (kleiner Avatar ohne Namen). Der hier
  beschriebene Ein-/Ausklapp-Mechanismus des Banners ist seit 2026-07-25
  komplett entfernt (siehe "VERSION-CHECK/LIVE-Banner" oben) — Banner ist
  jetzt fest im Header, kein eigener Mobil-Sonderzustand mehr.
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
  **⚠️ Update 2026-07-26: die Kerzen-ohne-Docht-Konvention selbst wurde
  wieder abgeschafft** — Preis-Historie wird app-weit jetzt als gestrichelte
  Linie gezeichnet, nicht mehr als Kerzen. Siehe den Session-Eintrag
  "Preis-Historie: Kerzen durch gestrichelte Linie ersetzt" weiter unten.

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

### Kompakt-Regler mittlere Stufe blendete Datum/"+Date" noch nicht aus (Nutzer-Korrektur 2026-07-22, direkt im Anschluss)

Nutzer: "Wenn der Regler in der mittleren Position ist will ich gar keine
Datums oder zeitperioden sehen auch nicht die wo nix eingetragen ist." Der
`ind.noDate`-Fix von eben (siehe voriger Eintrag) loeste nur das Problem
"Prompt bleibt fuer immer sichtbar" - die Kompakt-Stufen-CSS selbst blendete
an der MITTLEREN Stufe (`body.compact-view`, ohne `compact-view2`) bisher nur
die Perioden-Badge (`.ibadge`) aus, das Release-Datum (`.dbadge`) und die
"+ Date"-Aufforderung (`.add-date-btn`) erst an der LETZTEN Stufe
(`compact-view2`).

- **Fix:** `.dbadge`/`.add-date-btn` von der `compact-view2`-Regel in die
  `compact-view`-Regel verschoben (≈ Zeile 297) - alle drei Datums-/
  Perioden-Elemente (Badge, Datum, "+ Date"-Platzhalter) verschwinden jetzt
  gemeinsam schon an der mittleren Stufe, unabhaengig davon, ob dort etwas
  eingetragen ist. `compact-view2` blendet weiterhin zusaetzlich i-Info-
  Knopf und Trend-Chip aus (nur diese zwei sind jetzt noch dort).
- Per Playwright ueber alle 3 Reglerstufen verifiziert (`Fed Funds Rate`
  mit Perioden-Badge, `CB Tone`/`Next CB Move` mit "+ Date"-Platzhalter):
  Stufe 0 alle drei sichtbar, Stufe 1+2 alle drei `display:none`. Voller
  14-Tab-Regressionstest weiterhin fehlerfrei.

### Auto-Lock-Kettensymbol: Emoji durch SVG-Icon ersetzt (Nutzer-Wunsch 2026-07-22, per Screenshot)

Nutzer schickte einen Screenshot der "Risk Environment"-Karte: das
Kettensymbol (🔗) neben "Risk Correlation" war noch ein Emoji, nicht Teil
des app-weiten SVG-Icon-Sets (`ICONS`/`icn()`, siehe Pro-UI-Update-Eintrag
weiter oben - "Bei neuen Buttons IMMER `icn()` verwenden, keine neuen
Emojis einführen"). Neues `link`-Icon (Standard-Kettenglied-Pfad) zu
`ICONS` ergaenzt, an beiden bestehenden Stellen eingesetzt: Rubrik-Karten-
Header (`renderRub`, gespiegelte Non-FX-Karten) und Indikator-Zeile
(`renderInd`, "Risk Correlation" + gespiegelte Indikatoren). `.auto-lock-ic`
CSS unveraendert (Opacity/Groesse gelten weiterhin, SVG erbt die Farbe ueber
`stroke="currentColor"`). Per Playwright verifiziert: kein 🔗 mehr im DOM,
SVG rendert korrekt, voller 14-Tab-Regressionstest fehlerfrei.

### Dashboard 1:1 nach Referenz-Foto umgebaut (Nutzer-Wunsch 2026-07-25)

Nutzer schickte ein Mockup-Foto und verlangte "die Webseite 1 zu 1 ohne
Ausnahme so designen wie auf dem Bild", mittlere Reihe nach einem zweiten
Foto (waagerechte Ticker-Pillen), explizit mit der Freigabe "veraender dafuer
die hintergrundfarbe und entfern Funktionen und mach einfach alles was
noetig ist. Prinzipien ignorieren". Umgesetzt (VERSION-CHECK-235):

- **Hintergrund** `body` von `#0d1117` auf `#060b12` (deutlich dunkler).
  `--bg0` selbst UNVERAENDERT gelassen - die Variable wird an vielen
  Stellen als Kontrastfarbe genutzt (z.B. der Kontrast-Halo unter den
  Trends-Linien), ein Aendern haette dort unbeabsichtigt mitgewirkt.
- **Karten** (`.dw`): `rgba(8,13,21,.86)` + leichter Blur, 1px `#18202c`,
  Radius 10px, Padding 18px, Grid-Gap 14px. Hero-Reihe jetzt **6/3/3**
  statt 5/3/4 (im Foto ist Daily Bias etwa halb so breit wie die Zeile).
- **Kartenkoepfe**: die Steuerbuttons (hoch/runter/umbenennen/loeschen)
  liegen auf Geraeten MIT Maus jetzt `position:absolute` am rechten
  Kopfrand und erscheinen erst beim Hovern. **Wichtig ist das absolute
  Positionieren, nicht nur `opacity:0`** - vorher belegten sie weiter Platz
  und schnitten laengere Titel ab (per Playwright reproduziert: "CURRENCY
  STREN..."). Auf Touch bleiben sie sichtbar/inline, sonst waeren sie dort
  gar nicht erreichbar.
- **MAJORS-Rail** wieder als Mini-Karten pro Symbol (Name + Bias-Pfeil in
  der Kopfzeile, Sparkline auf voller Breite, Score rechts unten) statt der
  zwischenzeitlich flachen Zeilen - so zeigt es das Foto. Breite 132px
  (ab 1400px 150px). "View all pairs" ist jetzt eine eigene Karte mit
  Chevron rechts.
- **Globus** bekommt einen Nebel-Hintergrund (violett/blau/magenta
  Radialverlaeufe als `::before` auf `.globe-host`, `.dw-globe` traegt
  `overflow:hidden`). Bewusst OHNE `filter:blur()` - siehe die bereits
  dokumentierte Blur-Perf-Lehre bei der Aurora.
- **Fusszeilen-Links** (`.mw-footer`) wie im Foto: Text links, Chevron
  rechts in einem eigenen kleinen Kasten (`::after`). Key Insights hat
  jetzt auch einen ("Go to Insights").
- **Kopfzeilen-Link** `.dw-hdlink` ("View Calendar") in der Kalender-Karte.
- **Entfernt**: die eigene "Dashboard / Live overview"-Ueberschrift ueber
  dem Grid (der Tab sagt schon, wo man ist) und die Bullish/Neutral/Bearish-
  Legende in der Daily-Bias-Karte. Der "+ Widget"-Knopf bleibt (schmal,
  rechtsbuendig) - ohne ihn koennte man keine Karten mehr hinzufuegen.
- **Risk-Sentiment-Asset-Zeilen** ohne Mini-Balken (nur Name + Wert): der
  Balken war rein dekorativ und presste den Namen in der jetzt schmaleren
  3-Spalten-Karte so zusammen, dass "S&P 500" abgeschnitten wurde.
- **LIVE-Banner** ist jetzt ein echtes Flex-Kind (`flex:1 1 auto`) statt
  absolut zentriert. Absolut positioniert lag es ausserhalb des Flex-
  Flusses und schob sich bei 1366px ueber den Alarm-Zaehler (per Playwright
  gesehen). **Merksatz:** zentrierte Header-Elemente in dieser App immer
  als Flex-Kind loesen, nicht per `position:absolute;left:50%` - der Header
  hat links und rechts unterschiedlich breite Bloecke, die je nach
  Fensterbreite wandern.

**Nachtrag (selber Tag): Market Watch ist keine Karte mehr.** Nutzer:
"Market Watch geht schmaler, da brauch man keine ganze Karte mit
Ueberschriften und so". Die mittlere Reihe ist jetzt eine reine
Ticker-Leiste: `.dw.dw-market_watch` hat `background:transparent;
border:none;padding:0`, bekommt in `renderDash()` gar keine `.dw-hdr`
(neue Variable `hdrHtml`, leer fuer diesen Typ) und keine `.mw-footer`
mehr. Die Steuerbuttons (inkl. Zahnrad) wandern in eine neue `.mw-bar`
rechts neben die Kategorie-Tabs; dafuer wurde `btnsHtml` VOR den grossen
if/else-Block gezogen, damit beide Stellen dieselbe Quelle nutzen.
**Wichtig dabei:** die Hover-Regel fuer die Steuerbuttons musste von
`.dw-btns` auf `.dw-hdr .dw-btns` verengt werden - sonst haette die
absolute Positionierung auch die Buttons in der `.mw-bar` erwischt (die
haben keinen positionierten Vorfahren und waeren an den Kartenrand
gesprungen). Ergebnis: Kartenhoehe 185px -> 74px; damit passt das
Dashboard jetzt auch bei 1180px und 1366px vollstaendig ohne Scrollen
(vorher nur ab 1512px). `.daily-bias-lbl` zusaetzlich auf
`clamp(18px,1.75vw,26px)` + `white-space:nowrap`, weil "◆ NEUTRAL" bei
~1180px sonst hinter dem Rautensymbol umbrach.

**Nachtrag 2 (selber Tag): Header-Aufbau als Grid, Banner UEBER den
Buttons.** Nutzer per Foto-Vergleich: "der Banner ist ueber den Buttons".
`.hdr` war ein Flexbox - damit lagen Banner und Button-Leiste zwangslaeufig
in derselben Zeile. Jetzt ein 3-Spalten/2-Zeilen-Grid:
`.logo` (Sp.1/Z.1) · `.hdr-livebanner` (Sp.2/-1, Z.1, zentriert) ·
`.hdr-sub` = FX-Summe+Saved (Sp.1-2, Z.2) · `.hdr-r` = Buttons (Sp.3, Z.2).
**Der Trick ist, das Logo selbst als Grid-Item zu setzen** (nicht in einem
Wrapper-Div): dadurch bestimmt es die Hoehe von Zeile 1, und der darin
zentrierte Banner sitzt exakt auf Logo-Hoehe - mit einem Wrapper, der beide
Zeilen spannt, schwebte der Banner zu weit oben. Der Banner spannt bewusst
`grid-column:2/-1`: Spalte 3 ist in Zeile 1 leer, so bekommt er die volle
Restbreite statt nur der schmalen Mittelspalte.
**Unter 1080px einspaltig** (Logo/Status/Buttons/Banner untereinander):
darueber braucht das Grid Platz fuer Logo-Spalte UND volle Button-Spalte
nebeneinander, darunter quetscht es sonst den Logo-/Statustext mehrzeilig
zusammen (per Playwright bei 820px und 390px reproduziert). Grenze bewusst
1080px, damit sie unter dem 1100px-Breakpoint des Dashboard-Grids liegt.

### Globus neu aufgebaut + Polarlichter dahinter (Nutzer-Wunsch 2026-07-25)

Nutzer: "mach die Weltkugel das Meer einfach komplett gleichmäßig in einem
dunklen Blau. Dann mach die Erdflächen also die Länder in einem helleren
Blau und mach darauf ganz viele ganz ganz kleine leere Vierecke also nur
die Umrandung. Und dann will ich das sich das dreht und alle 5 Sekunden
jedes Viereck untereinander kurz stark hellblau wird also auch richtig
aufleuchtet und dann wieder ausgangszustand. Und das von links nach rechts
wie ein Schauer." Danach: "Ne im Hintergrund so Polarlichter."

- **Meer** ist jetzt EIN `<circle fill="#0b2445">` - die frueheren
  Tag-/Nacht-/Terminator-Radialverlaeufe UND die Meridian-/Breitenkreis-
  Gitterlinien sind ersatzlos raus, beide widersprachen "komplett
  gleichmaessig". Damit sind auch `globeSunInfo()`/`globeSunInfoCached()`
  und `GLOBE_MERIDIANS`/`GLOBE_PARALLELS` toter Code geworden und wurden
  entfernt (der Sonnenstand wurde nirgends sonst gebraucht - vor einem
  Wiedereinbau pruefen, ob er woanders erwartet wird).
- **Land** = helleres Blau (`#2d6ea8`) plus ein `<pattern>` aus winzigen
  LEEREN Quadraten (4,2px Raster, `fill:none;stroke:...`).
- **Schauer alle 5s:** die Land-Geometrie liegt nur EINMAL als
  `<g id="gLandShape…">` in `<defs>` und wird per `<use>` mehrfach mit
  unterschiedlichem `fill` gezeichnet - Grundfarbe, ruhige Vierecke,
  leuchtende Vierecke. Die leuchtende Ebene haengt in einer Maske mit einem
  per SMIL wandernden Rechteck (weicher Verlauf schwarz→weiss→schwarz), so
  leuchten die Vierecke spaltenweise von links nach rechts auf.
  `mix-blend-mode:screen` + doppelter `<use>` machen daraus ein echtes
  Aufleuchten statt eines blassen Schleiers.
  **Wichtig fuer die Performance:** die `<path>`-Elemente in `<defs>` tragen
  KEIN eigenes fill/stroke (sie erben es vom jeweiligen `<use>`), und
  `globeUpdateOne()` aktualisiert weiterhin nur diesen EINEN Satz Pfade -
  die `<use>`-Klone folgen automatisch. Das Aufleuchten selbst kostet gar
  keine JS-Arbeit (reines SMIL). Bei kuenftigen Aenderungen NICHT auf drei
  getrennte Pfad-Saetze umbauen, das wuerde die Frame-Arbeit verdreifachen.
- **Polarlichter** ersetzen den violett/blau/magenta-Nebel hinter dem
  Globus (`.db-split .globe-host::before/::after`): senkrechte Licht-
  "Vorhaenge" aus `repeating-linear-gradient` in Tuerkisgruen/Violett, per
  `mask-image` weich ausgeblendet, zwei Ebenen mit unterschiedlichem Tempo
  (34s/47s, `alternate`) fuer langsames Wabern. Bewusst per `transform`
  statt `filter:blur()` animiert - siehe die dokumentierte Blur-Perf-Lehre
  bei der Aurora. `prefers-reduced-motion` schaltet die Bewegung ab.

### Bearbeitungsmodus statt Hover: Steuerbuttons nur nach 5s-Long-Press (Nutzer-Wunsch 2026-07-25)

Nutzer: "komm weg von diesem Karten Design wo oben rechts immer die hoch
runter Pfeile und das x steht und immer eine Überschrift usw nötig ist.
Ich will das es einen bearbeitungsmodus gibt der aktiviert wird wenn man
länger 5 Sekunden auf den Bildschirm drückt. Dann dürfen diese Funktionen
erscheinen sonst nicht." Titel/i-Icon bleiben (decken sich mit dem
Referenzfoto), nur die Verwaltungs-Buttons (Auf/Ab/Umbenennen/Loeschen,
Zahnrad bei Market Watch, "+ Widget") sind betroffen.

- **`dashEditMode`** (globale Variable) + `body.dash-edit-mode`-Klasse
  steuert alles rein ueber CSS: `.dw-btns{opacity:0;pointer-events:none}`,
  erst `body.dash-edit-mode .dw-btns{opacity:1;pointer-events:auto}`. Der
  alte `@media(hover:hover)`-Sonderfall (Buttons nur bei Hover, siehe
  Eintrag "Dashboard 1:1 nach Referenz-Foto" oben) ist damit ueberfluessig
  geworden und wurde entfernt - eine Geste fuer Maus UND Touch statt zwei
  verschiedener Mechanismen.
- **`dashEditPressStart/-Move/-End()`** (≈ Zeile 9590, direkt vor
  `renderDash()`) haengen an `#pgDash` per Pointer Events (nicht
  Touch-Events - funktioniert dadurch fuer Maus-Long-Click UND
  Touch-Long-Press identisch). 5000ms Timer, bricht ab bei >14px Bewegung
  (gleiche Toleranz wie die bestehenden Long-Press-Muster
  `rwPressStart`/`ilPressStart`/`biasPressStart`) oder beim Loslassen.
  `toggleDashEditMode()` schaltet nur die Body-Klasse um (KEIN
  `renderDash()`-Aufruf) - dadurch kein Scroll-Sprung/Flackern beim
  Ein-/Ausschalten.
- **`.dash-edit-bar`** ("✎ Editing — press & hold to exit" + der "+
  Widget"-Button) ersetzt die frueher immer sichtbare Zeile ueberm Grid -
  `display:none` ausserhalb, `body.dash-edit-mode .dash-edit-bar{display:
  flex}`. Karten bekommen im Modus zusaetzlich einen leicht blauen Rand
  (`body.dash-edit-mode #dashWidgets .dw{border-color:...}`) als Hinweis,
  dass gerade ein anderer Zustand aktiv ist.
- Bearbeitungsmodus ist bewusst NICHT persistiert (kein `snap()`/
  localStorage) - rein temporaerer UI-Zustand fuer die aktuelle Sitzung.
  `showTab()` schaltet ihn automatisch aus, sobald der Nutzer den
  Dashboard-Tab verlaesst (die Buttons existieren ohnehin nur dort).
- Per Playwright verifiziert (Maus-Long-Press UND simulierter Touch-Long-
  Press): Buttons/Bar bleiben bei kurzen Klicks unsichtbar, erscheinen nach
  5s, ein zweiter 5s-Press schaltet wieder aus, eine Bewegung >14px waehrend
  des Drueckens bricht den Timer sauber ab ohne den Modus zu toggeln. Voller
  15-Tab-Regressionstest weiterhin fehlerfrei, Dashboard passt weiterhin
  ohne Scrollen.

### Navy-Blue-Design app-weit uebernommen (Nutzer-Wunsch 2026-07-25)

Nutzer schickte ein Foto der FX-Detailseite (IMG_1190) und verlangte:
"finde eine Beschreibung für das Design und füge... das Design auf der
ganzen Webseite ein. Ich will das es am Ende genau wie auf dem Bild
aussieht und über den Regler wenn man auf Design drückt oben rechts sich
auch anpassen lässt." Umgesetzt (VERSION-CHECK-240):

- **Zentrale Palette umgestellt** statt jede Stelle einzeln: `--bg0`
  bis `--bg6`/`--bd`/`--bd2` im `:root` (≈ Zeile 26) von einer kaum
  gesaettigten Dunkelgrau-Skala auf eine gesaettigte Navy-Skala (Hue
  ~215-220°) gedreht, `body{background}` ebenso. Da praktisch jede
  Komponente im Projekt (alle Tabs, Modals, das Dashboard) ueber diese
  Variablen faerbt, kaskadierte der neue Ton automatisch durch die GANZE
  App, ohne jede Stelle einzeln anfassen zu muessen - genau das macht
  "auf der ganzen Webseite" ueberhaupt handhabbar. Kontraststufen
  zueinander (bg0→bg6, --t0..--t3 gegen --bg2) bewusst 1:1 beibehalten,
  nur der Hue gedreht - dadurch keine neuen Lesbarkeits-Regressionen.
- **Hartcodierte Dunkel-Hex-Literale nachgezogen**: einige waehrend der
  vorherigen Dashboard-Redesign-Runden entstandene Stellen setzen Farben
  direkt als Hex statt ueber die Variablen (`.dw`-Kartenhintergrund,
  `.dash-majors`-Karten, `.mw-tile`, `.mw-footer`-Chevron-Kasten,
  Intro-Screen/-Shards, Slider-Thumb-Rahmen, `theme-color`-Meta) - alle
  auf navy-getoente Aequivalente umgestellt, sonst haetten sie als
  einzige Stellen weiterhin neutral-dunkel gewirkt.
- **Designer-Farbregler (🎨, oben rechts) bleibt voll kompatibel**:
  `applyDesignHue()`/`designColors()` ueberschreiben `body.style.background`
  weiterhin per Inline-Style unabhaengig von der CSS-Variable - die neue
  Navy-Palette ist nur der AUTO-Default (wenn `designHue===null`,
  Auto-Risk-Sentiment-Faerbung). Per Playwright verifiziert: Regler
  aendert den Hintergrund weiterhin live, "Auto/Reset" faellt korrekt auf
  den neuen Navy-Ton zurueck.
- **Overview-Karte** (FX/Non-FX-Detailseite, `renderOverviewCard()`)
  bekommt jetzt ein rundes Icon vor jedem Rubrik-Namen wie im Foto -
  wiederverwendet `CMP_RUB_ICON` (existierte schon fuer den Compare-Tab)
  statt eine zweite Rubrik→Icon-Zuordnung zu pflegen. Custom-Rubriken ohne
  Eintrag bleiben ohne Icon-Rund (kein erfundenes Symbol).
- Per Playwright ueber alle 15 Tabs + Mobile verifiziert: keine JS-Fehler,
  Dashboard passt weiterhin ohne Scrollen, Kontrast/Lesbarkeit in Matrix/
  COT/FX-Detail/Dashboard geprueft (Screenshots), Bearbeitungsmodus (siehe
  Eintrag oben) funktioniert unveraendert mit der neuen Palette.

### Sicherheits-Audit: Webseite ist jetzt oeffentlich (Nutzer-Auftrag 2026-07-26, VERSION-CHECK-241)

Nutzer-Auftrag (hoechste Prioritaet, wortgleich): "die Webseite ist jetzt
oeffentlich finde alle sicherheitsluecken und stelle sicher das kein api
key oder andere wichtige Daten auslesbar sind" + `/debug` (Bugs + ungenutzte
Code-Bloecke finden und entfernen) + Code schlanker machen ohne Funktionen
zu verlieren.

**Keine API-Keys/Secrets gefunden** (Ziel bereits erreicht, nicht neu
geschaffen): komplette `index.html`, alle committeten `*.json`-Datendateien
und alle 4 Workflow-YAMLs durchsucht (String-Muster fuer AWS-Keys, private
Key-Header, JWTs, hartcodierte Secret-Zuweisungen) - nichts gefunden.
Workflows nutzen durchgehend `${{ secrets.X }}` -> Env-Var, kein
`curl -v`/`set -x`, bestehende Debug-Ausgaben vermeiden bewusst das
Ausgeben des eigentlichen Secret-Werts (eigene Kommentare bestaetigen das
explizit, z.B. beim Myfxbook-Login). Zusaetzlich die **volle Git-Historie**
(`git fetch --unshallow`, vorher shallow) nach demselben Muster durchsucht -
auch dort kein jemals committeter und wieder entfernter Key. Supabase-URL/
Anon-Key/Sync-ID sind ohnehin nutzerseitig eingegeben und bleiben rein
lokal (localStorage) - kein serverseitiges Secret in diesem Projekt.

**Echte Befunde: XSS/Code-Injection ueber Freitext-Felder, die ungefiltert
in `onclick="fn('${x}')"`-Handlern landen.** Kernerkenntnis (Schritt-fuer-
Schritt am Payload durchgespielt): weder `escH()` allein noch `escJs()`
allein reicht fuer dieses Muster. `escH()` allein wird wirkungslos, weil
der Browser den Attributwert per HTML-Decode aufloest, BEVOR das Ergebnis
als JS geparst wird - escH()s `'`->`&#39;`-Kodierung wird dadurch vor dem
JS-Parse wieder rueckgaengig gemacht. `escJs()` allein schuetzt zwar die
JS-String-Ebene, aber nicht die HTML-Attribut-Ebene (kein `"`-Escaping).
**Fix-Muster: ERST `escJs()`, DANN `escH()`** (neuer Helper `escJH()`,
bei `escJs()` in `index.html` definiert) - schuetzt beide Ebenen, rundet
beim Decode/Parse korrekt wieder zum Original-Wert ab (Funktionalitaet
bleibt erhalten, nicht nur "irgendwie escaped").

Konkrete Fixes:
- **`eval()` entfernt** (`searchGo()`/`searchEntries()`, globale Suche):
  baute bisher Code-STRINGS (`gotoSym('${s.id}')`) fuer spaeteres `eval()`.
  Umgebaut auf strukturierte Daten (`{fn:'sym',id}`/`{fn:'cal'}`/
  `{fn:'tab',tab,mode}`) + `switch`-artiges Dispatch in `searchGo()` - immun
  gegen String-Injection per Konstruktion, da Werte als echte JS-Werte statt
  als zu re-parsender Quelltext uebergeben werden.
- **Paar-Namen** (`pairs[].name`, Set-ups-Tab/Watchlist/Compare-verwandte
  Stellen): `openScoreInfoPair('${p.name}')`/`${it.name}` an 3 Stellen war
  komplett ungeschuetzt, UND `confirmAddPair()`s Freitext-Feld (`mPairCustom`)
  hatte anders als das Ticker-Feld GAR KEIN Zeichen-Gate. Fix: `escJH()` an
  allen 3 Ausgabestellen + neues Zeichen-Gate (`^[A-Z0-9 ./_-]{1,20}$`,
  analog zum bestehenden Ticker-Gate in `confirmAddSym()`) in `confirmAddPair()`.
- **Compare-Tab** (`toggleCmpRow('${enc}')`, `enc=encodeURIComponent(...)`
  aus einem Indikator-Basisnamen): `encodeURIComponent()` laesst `'` UNVERAENDERT
  (nicht Teil seines Escape-Sets) - ein per "+ Add Indicator" frei benennbarer
  Indikator mit `'` im Namen konnte dadurch trotz URI-Encoding aus dem
  Attribut ausbrechen. Per Playwright mit echtem Payload
  (`Evil'); alert('XSS'); //`) verifiziert: VOR dem Fix haette das den Alert
  ausgeloest, NACH dem Fix (`escJH(enc)`) weder Alert noch Funktionsverlust
  (`toggleCmpRow` dekodiert weiterhin korrekt, Zeile oeffnet/schliesst wie
  erwartet - Playwright-bestaetigt).
- **Symbol-/Kategorie-/Widget-/Rubrik-/Indikator-IDs**: `confirmAddSym()`
  hat schon lange ein Zeichen-Gate (`^[A-Z0-9._-]{1,15}$`) MIT einem
  Kommentar, der die Sync-Umgehung bereits benennt ("XSS, auch via Sync") -
  aber `applySnap()` (der EINE Trichter fuer Cloud-Sync/Import/Undo, siehe
  Grundsatz oben) hat diese Regel nie durchgesetzt. Fix: neue
  `sanitizeSnapIds()` direkt am Anfang von `applySnap()` - verwirft
  Symbole/`customIds`-Eintraege mit einer ID ausserhalb des Formats, und
  (fuer alle `uid()`-basierten IDs: Paare/Widgets/Kategorien/Rubriken/
  Indikatoren) alles ausserhalb von `^[a-z0-9]{1,24}$/i`. Schliesst die
  ganze Klasse an EINER Stelle, statt Dutzende einzelne
  `onclick="fn('${x.id}')"`-Stellen im Code einzeln zu haerten - legitime,
  von der App selbst erzeugte Exporte/Sync-Staende sind davon nie betroffen
  (ihre IDs erfuellen das Format immer schon).
- Bei der Sichtung mehrerer aehnlicher `onclick="fn('${x}')"`-Stellen
  (`cat.l`, `side`, `b`, `date`, `key`/`k`, `c`, `o.key`) bestaetigt: alle
  ungefaehrlich, weil der jeweilige Wert aus einer FESTEN, kleinen Menge
  (Enum-String, `FX`-Array, `RATEPROB_CCYS`, ISO-Kalenderdatum) stammt, nie
  aus Freitext.
- Per Playwright verifiziert (echte Payloads, kein Raten): eval()-Ersatz
  navigiert korrekt (Asset-, Tab-, Kalender-Sprung), Paar-Namen-Gate lehnt
  unsichere Zeichen mit Alert ab, Compare-Tab-Injection-Payload loest keinen
  Alert mehr aus UND die Zeile toggelt weiterhin korrekt, `escJH()` liefert
  korrekt doppelt-geschuetzten Output, voller 15-Tab-Regressionstest ohne
  JS-Fehler (nur sandboxbedingte `ERR_TUNNEL_CONNECTION_FAILED` bei externen
  Datenfeeds, kein App-Fehler).

**`/debug`: tote Code-Bloecke gefunden + entfernt** (Funktion bleibt
komplett erhalten, nur nie erreichter/nie aufgerufener Code entfernt):
- **`riskHistChart()`/`riskNetHistory()`**: eine komplett fertige, aber nie
  aufgerufene Risk-on/Risk-off-Verlaufsgrafik (SVG+Hover-Tooltip) fuer die
  Risk-Sentiment-Dashboard-Karte - inkl. eigener CSS-Klassen
  (`.risk-hist-wrap`/`.risk-hist-hd`/`.risk-hist-empty`/`.risk-hist-scroll`)
  und einem AKTIV LAUFENDEN Hoehen-Sync-Mechanismus (`syncRiskHistHeight()`,
  `_riskHistChartH`, ein `resize`-Listener), der bei jedem Dashboard-Render
  UND jedem Fenster-Resize versuchte, eine Karte zu vergroessern, die
  nirgends gerendert wurde - reiner Render-Overhead ohne jeden sichtbaren
  Effekt. Alles zusammen entfernt (Funktionen, State-Variable, Listener,
  CSS-Klassen); die referenzierten `RISK_ON_IDS`/`RISK_OFF_IDS`-Konstanten
  bleiben, da sie vom AKTIVEN Risk-Sentiment-Gauge weiterhin gebraucht
  werden. Stale Kommentar-Referenz in `renderDash()` (erklaerte einen
  Scroll-Fix ueber `syncRiskHistHeight()`) entsprechend angepasst.
- **`autoFetchIndData()`/`autoFetchBondData()`**: leere Wrapper-Reste aus
  der Zeit VOR `bootFetchScoreFeeds()` (siehe Eintrag "KRITISCHER
  Regressions-Bug..." oben - das buendelt seit 2026-07-20 alle vier Boot-
  Feeds per `Promise.all`, ruft `fetchIndData()`/`fetchBondData()` seither
  DIREKT inline auf). Die beiden Wrapper wurden beim Umbau nie geloescht,
  hatten seither aber keinen einzigen Aufrufer mehr.
- **`setSentimentRange()`/`setSentimentRangeCustom()`** + State-Variablen
  `sentimentRange`/`sentimentCustomFrom`/`sentimentCustomTo`: Reste eines
  offenbar nie fertiggestellten Zeitraum-Filters fuer die Retail-Sentiment-
  Unterseite - anders als die strukturell identischen `pcRange`/
  `fearGreedRange` (Put/Call, Fear&Greed) nie an `timeRangeBarHtml()`/
  `timeRangeCustomHtml()` angeschlossen und nirgends gelesen.
- Alle Entfernungen per Playwright verifiziert: `node --check` sauber,
  voller 15-Tab-Regressionstest ohne JS-Fehler, Risk-Sentiment-Karte
  rendert weiterhin normal (nur der nie sichtbare Verlaufschart-Anhang ist
  weg), Fenster-Resize loest keinen Fehler mehr aus,
  `typeof riskHistChart/syncRiskHistHeight` jetzt korrekt `undefined`.
- **Bewusst NICHT weiterverfolgt**: eine automatisierte CSS-Klassen-Leichen-
  Suche (Substring-Haeufigkeit ueber die ganze Datei) lieferte zu viele
  falsch-positive Treffer (Klassennamen, die per Template-String
  zusammengesetzt werden, z.B. `dw-${type}`, zaehlen dabei faelschlich als
  "unbenutzt") - ein serioeser Abgleich haette pro Fund einzeln verifiziert
  werden muessen; bei ~200 Kandidaten war das Regressionsrisiko fuer den
  verbleibenden Nutzen zu hoch. Bei Bedarf gezielt nachholen, nicht blind
  per Bulk-Diff entfernen.

### Retail Sentiment: Historie vs. Preis pro Einzelasset (Nutzer-Wunsch 2026-07-26)

Waehlt man im Retail-Sentiment-Filter (Insights → Sentiment) statt
"All symbols" ein einzelnes Symbol, zeigt die Karte (`renderRetailBars`,
verzweigt in `renderRetailHistory`) jetzt dessen Historie statt des reinen
Snapshots: Net Positioning (Long%−Short%) als Balken mit Preis-Ueberlagerung
(`retailNetChart`), darunter der Long/Short-Verlauf als 100%-Stacked-Bar
(`retailStackChart`) - mit dem app-weiten `TIME_RANGES`-Zeitraum-Filter
(State `sentimentRange`/`sentimentCustomFrom`/`sentimentCustomTo` - vorher
tote, nie verdrahtete Variablen, jetzt fuer genau diesen Zweck reaktiviert)
und Hover/Touch-Tooltips wie bei jedem anderen Chart. "All symbols" bleibt
unveraendert der bisherige Snapshot.

- Broker-Symbol → unsere Asset-ID fuer den Preisvergleich: `sentSymPriceSeries()`
  (nutzt `resolvePairPriceSeries`/`priceSeriesFor`, Non-FX-Mapping in
  `SENT_NONFX_PRICE_ID`), `sentSymLabel()` fuer die lesbare Anzeige
  ("EURUSD"→"EUR/USD", "XAUUSD"→"Gold" via `COT_NAME`).
- Der Workflow (`update-ff-calendar.yml`, Schritt "Fetch market sentiment")
  schreibt seither taeglich einen echten Punkt pro Symbol in
  `sentiment_data.json.retailHistory` (Cap ~1100 Tage wie `scoreHist`) - kein
  Backfill moeglich, Myfxbook liefert nur den aktuellen Snapshot.
- **Der vorhandene Bestand (17 Tage, 10.–26.07.2026) wurde aus der
  GIT-HISTORIE der bereits committeten `sentiment_data.json`-Staende
  rekonstruiert** (jeder stuendliche Commit ist ein echter Snapshot von
  damals) - exakt dasselbe Prinzip wie der Revisions-Backfill weiter oben:
  bei "es gab doch schon Werte, wo sind die hin" IMMER zuerst pruefen, ob
  die Git-Historie der Daten-JSONs echte vergangene Stände enthaelt, bevor
  man sagt "geht nicht/nie aufgezeichnet". Sandbox-Repo war dafuer shallow
  geklont - `git fetch --unshallow` noetig, um die vollen ~260 Commits der
  Datei zu sehen.

### Preis-Historie: Kerzen durch gestrichelte Linie ersetzt (Nutzer-Wunsch 2026-07-26)

Nutzer schickte ein Referenzfoto (Historical-Retail-Sentiment-Beispiel) und
wollte dieselbe Optik uebernehmen: **ueberall, wo eine Preis-Historie ueber
einem anderen Wert liegt, jetzt eine gestrichelte weisse/helle Linie statt
der bisherigen Kerzen-ohne-Docht** (siehe der jetzt veraltete Eintrag
"Kerzen-Kontrast + Dreiecke ganz entfernt" weiter oben) - plus eine kleine
Legende dazu, wie im Foto.

- Betraf genau zwei Stellen (per `grep CANDLE_W/PRICE_UP` gefunden - das ist
  die vollstaendige Liste, keine weiteren Preis-Overlays im Projekt):
  `scoreVsPriceChart()` (Trends-Tab "Score vs Price") und `retailNetChart()`
  (die brandneue Retail-Sentiment-Historie, s.o.).
  Beide Kerzen-Zeichenschleifen wurden durch eine simple `<polyline>` mit
  `stroke-dasharray="6,4"` in `var(--t0)` (helle Textfarbe, theme-aware)
  ersetzt - Achsen-Skalierung (rechte Preis-Achse, Tick-Labels) unveraendert,
  nur die Zeichnung selbst.
- **Neue gemeinsame Legende-CSS-Klasse `.tr-leg-dash`** (neben dem
  bestehenden `.tr-leg-dot` fuer runde Farbpunkte, ~Zeile 472): kurzer
  gestrichelter Strich (`border-top:2px dashed var(--t0)`), nutzt dieselbe
  `.tr-legend`/`.tr-leg-item`-Struktur wie ueberall. Ersetzt "Price (candle)"
  durch schlicht "Price" in beiden Legenden (`scoreVsPriceCard`,
  `renderRetailHistory`).
- Tooltip-Faerbung nach Kursrichtung (gruen/rot je nach rauf/runter) wurde
  dabei ENTFERNT, nicht nur die Kerzen selbst - die Linie ist jetzt ein
  einzelner neutraler Ton, der Tooltip zeigt "Price" entsprechend auch
  neutral statt richtungsgefaerbt (konsistent mit der neuen Linien-Optik).
- **Merksatz fuer kuenftige neue Preis-Overlay-Charts:** IMMER diese
  gestrichelte-Linie-Konvention (`stroke="var(--t0)" stroke-dasharray="6,4"`)
  + `.tr-leg-dash`-Legende verwenden, keine Kerzen mehr neu einfuehren -
  CLAUDE.md-Grundsatz "wiederkehrende UI-Bausteine muessen einheitlich sein"
  gilt hier genauso.

### Dashboard-Feinschliff nach Foto: Bearbeitungsmodus-Gating, 4er-Ticker-Grid, engere Abstaende + echter Persistenz-Bug gefunden (Nutzer-Wunsch 2026-07-27)

Nutzer schickte ein Foto der Live-Seite mit zwei blau eingekreisten Elementen
("MAJORS"-Label ueber der Majors-Sidebar, FX/Indices/Commodities/Bonds-
Umschalter ueber der Market-Watch-Ticker-Zeile) plus vier Anforderungen.

**1. Beide markierten Elemente nur noch im Bearbeitungsmodus sichtbar** -
dieselbe `body.dash-edit-mode`-Konvention wie die bestehenden `.dw-btns`
(5s-Long-Press, siehe Eintrag "Bearbeitungsmodus statt Hover" oben), kein
zweiter Mechanismus. `.dash-majors-lbl` (das "MAJORS"-Label) und `.mw-bar`
(die ganze Zeile mit Kategorie-Tabs + Zahnrad-Button - nicht nur `.mw-tabs`
selbst, sonst bliebe eine leere unsichtbare Zeile stehen) sind jetzt
`display:none` per Default, `body.dash-edit-mode` schaltet sie auf
`block`/`flex`. Die gerade AKTIVE Kategorie (z.B. "FX") bleibt ausserhalb
des Modus unveraendert in der Ticker-Zeile sichtbar - nur der Umschalter
selbst versteckt sich.

**2. Exakt 4 Assets pro Reihe** in der Market-Watch-Ticker-Zeile
(`.mw-strip`): von `display:flex;flex-wrap:wrap` (so viele Kacheln wie
reinpassen, `flex:0 0 auto`) auf ein echtes `display:grid;grid-template-
columns:repeat(4,minmax(0,1fr))` umgestellt - `.mw-tile` fuellt jetzt die
volle Spaltenbreite (`justify-content:space-between` statt `flex:0 0 auto`).
**3. Responsiv mit Mindestgroesse**: zwei Breakpoints reduzieren die
Spaltenzahl VOR dem Punkt, an dem 4 Spalten unlesbar eng wuerden -
`repeat(2,...)` unter 1000px, `repeat(1,...)` unter 520px (per Playwright an
9 Viewport-Breiten von 390-1920px verifiziert: nie Text-Ueberlauf, exakt 4
Spalten von 1100-1920px).
**4. Globale Abstaende verringert** - bewusst auf das Dashboard-Grid
gescoped (nicht die ganze 14k-Zeilen-App durchgefegt, zu hohes Regressions-
risiko fuer den Nutzen): `#dashWidgets`-Grid-Gap 14→10px, `.dash-layout`-Gap
(Majors-Sidebar zum Grid) 18→12px, `.dw`-Kartenpadding 18→14px (inkl. einer
zuvor uebersehenen `@media(min-width:1100px)`-Override-Zeile, die die
Reduktion sonst auf genau der Bildschirmbreite des Referenzfotos wieder
rueckgaengig gemacht haette), `.dw`-Kartenabstand 10→8px, `.dw-hdr`-Marge
16→12px, `.mw-tile`-Innenpadding 9px 15px→8px 12px. Falls "global" tatsaech-
lich app-weit gemeint war (z.B. auch `.masonry` auf den Asset-Detailseiten),
bei Bedarf gezielt nachziehen statt anzunehmen.

**5. Persistenz-Bug gefunden und gefixt** ("UI-Aenderungen wie Farbwechsel
werden nach wenigen Sekunden ueberschrieben, muessen beim ERSTEN Versuch
dauerhaft bleiben") - der Designer-Farbregler selbst (`applyDesignerHue()`/
`saveDesignHue()`) war beim Nachpruefen bereits korrekt ueber `markPrefEdit()`
abgesichert (per Playwright mit echtem Draw-durch-alle-Trigger-Test
verifiziert: Boot-Feeds, `renderDash()`, `flushAndSave()`, 1,5s-Cloud-Debounce
- Farbe blieb in JEDEM Fall stehen). Der eigentliche Bug lag an sechs
ANDEREN Stellen, die demselben "ausserhalb von snap()/Undo, aber trotzdem
geraeteuebergreifend synchron" -Muster (siehe "WICHTIGSTE REGEL" ganz oben)
folgen SOLLTEN, es aber nicht taten:
- **`saveTabStacks()`** und **`togglePinEnabled()`**: bumpten `fxpro_updated`
  und stiessen `cloudAutoSync()` an, riefen aber `markPrefEdit()` NICHT auf -
  ohne das Flag stufte `cloudPush()`s optimistische Versionspruefung die
  Aenderung als reinen Auto-Refresh ein und ein zeitgleicher Pull (anderes
  Geraet/Tab pusht dazwischen) zog den aelteren Cloud-Stand drueber. Beide
  jetzt mit `markPrefEdit()` ergaenzt.
- **`cloudPull()` selbst fehlte an VIER Stellen der `!prefPending`-Schutz**,
  der bei `compactLevel`/`designHue`/`designSaved`/den Set-ups-/Kalender-
  Filtern bereits existierte: `greenDismissed`, `tabStacks`, `pinEnabled`,
  `riskEnvRemindDismissed` wurden dort IMMER unconditional aus dem Cloud-
  Stand uebernommen - selbst mit korrekt gesetztem `markPrefEdit()`-Flag in
  der jeweiligen Save-Funktion haette das die lokale Aenderung also trotzdem
  ueberschrieben, weil der Schutz an der falschen Stelle (nur Save-Funktion,
  nicht Pull-Funktion) gefehlt hat. Alle vier jetzt mit `!prefPending&&`
  guarded, exakt wie die bereits geschuetzten Felder direkt daneben.
- **Notes-Tab-Rubrik-Funktionen** (`setNoteRubBias`/`togNoteRubImp`/
  `mvNoteRub`/`setNoteRubItemBias`/`togNoteRubItem`/`mvNoteRubItem`) - diese
  gehoeren zum snap()-Kernbaum (ueber `noteCats`/Symbol-Objekte), brauchen
  also `pushU()` (nicht `markPrefEdit()`) als Schutzmarker. Sechs von neun
  Geschwisterfunktionen in dieser Familie hatten es (add/delete-Funktionen),
  sechs andere (Bias setzen, Wichtig-Toggle, Reihenfolge aendern) fehlte es
  komplett - reiner Kopier-/Wartungs-Fehler, als die Long-Press-Bias-Picker
  fuer Notes ergaenzt wurden (siehe "Bias-Buttons durch Long-Press-Popover
  ersetzt" oben), nicht konsistent auf ALLE Geschwisterfunktionen uebertragen.
  Alle sechs jetzt mit `pushU()` ergaenzt.
- Per Playwright mit einem echten simulierten Multi-Geraete-Wettlauf
  verifiziert (gemockter `fetch` liefert bei `cloudPull()` bewusst einen
  ALTEN Cloud-Stand zurueck, waehrend eine lokale Aenderung noch auf ihren
  eigenen 1,5s-Auto-Push wartet): Tab-Stapel-Aenderung UND PIN-Toggle
  ueberleben den simulierten Pull jetzt korrekt (vorher waeren beide durch
  den fehlenden Schutz zurueckgesetzt worden); `setNoteRubBias()` bumpt jetzt
  nachweislich `_lastUserEditTs` und den Undo-Stack.
- **Merksatz:** bei einer neuen "ausserhalb von snap()" laufenden Praeferenz
  IMMER alle VIER Ecken pruefen, nicht nur zwei - (1) Save-Funktion bumpt
  `fxpro_updated`+`_lsUpdatedSeen`+`markPrefEdit()`+`cloudAutoSync()` UND (2)
  `cloudPull()` selbst hat fuer GENAU dieses Feld einen `!prefPending`-Guard,
  sonst nuetzt (1) allein nichts. Bei einer Kernbaum-Aenderung (Teil von
  `snap()`) ist `pushU()` der richtige Marker statt `markPrefEdit()` - bei
  einer Familie von Geschwisterfunktionen (wie hier die Notes-Rubriken)
  IMMER alle pruefen, nicht nur die zuerst gefundene.

### Persistenz-Bug Runde 2: vollstaendiger Codebase-Scan statt Einzelfall-Fixes (Nutzer-Bugreport 2026-07-27, direkt im Anschluss)

Nutzer meldete: der Bug besteht weiterhin - konkret im "Bearbeitungsmenue"
(Market-Watch-Zahnrad, seit der letzten Session nur noch im Bearbeitungs-
modus erreichbar) ein FX-Paar abgewaehlt, nach ein paar Sekunden war es
wieder da. Der Runde-1-Fix (siehe Eintrag oben) hatte gezielt Kandidaten
geprueft, aber **nicht wirklich JEDEN `save()`-Aufruf im ganzen File**, wie
der eigene Merksatz dort eigentlich schon forderte.

**Diesmal ein programmatischer Scan statt Einzelfall-Suche**: Skript
extrahiert JEDE `function name(...){...}` per Klammer-Tiefen-Zaehlung
(auch mehrzeilig, der vorherige Scan hatte nur einzeilige Funktionen erwischt)
und listet alle, die `save();` enthalten, aber nirgends im Funktionskoerper
`pushU()`/`markPrefEdit()`/`markUserEditTs()`. Ergebnis: 10 weitere echte
Treffer (zusaetzlich zu den bereits im Runde-1-Eintrag gefixten):

- **`toggleMwSym()`** - genau der gemeldete Fall (Market-Watch "Choose
  symbols"-Menue, FX-Paar an/abwaehlen). **`setMwTab()`** direkt daneben
  (Kategorie-Umschalter) hatte denselben Fehler.
- **`moveSbSym()`/`moveSbCat()`** - Sidebar-Umsortierung (Long-Press-Sortierung
  von Symbolen/Kategorien).
- **`mvRub()`** - Rubrik-Karten-Umsortierung auf der Asset-Detailseite
  (`addRub()`/`delRub()` direkt daneben hatten `pushU()` bereits - dieselbe
  "add/delete korrekt, move/toggle vergessen"-Musterluecke wie bei den
  Notes-Rubriken in Runde 1).
- **`saveDateM()`/`clearDateM()`** - Indikator-Release-Datum speichern/leeren.
- **`saveRateWatch()`/`saveIndLink()`** - eigene URL fuer Zinserwartungs-/
  Quellen-Link speichern (die zugehoerigen `resetRateWatch()`/`resetIndLink()`
  waren in Runde 1 schon gefixt worden, die SAVE-Variante daneben aber
  uebersehen).
- **`saveInfoM()`** - eigener Info-Text an einer Rubrik/einem Indikator.
- **`doUndo()`/`doRedo()`** - hier bewusst NICHT `pushU()` (wuerde
  uStack/rStack korrumpieren), sondern ein neuer, leichtgewichtiger Helfer
  `markUserEditTs()` (nur `_lastUserEditTs`/`_userEditedSinceSync`/
  `fxpro_user_pending`, ohne Stack-Mutation).

**Bewusst NICHT angefasst** (verifiziert als korrekt OHNE Schutz, kein
Uebersehen): `togRubCollapse()`/`goToRubCard()`/`gotoIndicatorByNotif()`
(reines Auf-/Zuklappen einer Karte, auch als Navigations-Nebeneffekt - haette
`pushU()` dafuer, wuerde JEDES Aufklappen einer Karte einen Undo-Schritt
erzeugen und den 60-Eintrag-Stack mit trivialen Klicks fluten),
`assetCfgApply()` (reiner Helfer, alle drei Aufrufer haben `pushU()` bereits
VOR dem Aufruf), `renderEvtAlertList()`/`updInboxBadge()`/`renderInbox()`
(raeumen nur abgelaufene Eintraege auto auf), `checkPriceAlerts()`/
`autoFetchCot()`/`autoFetchSentiment()`/`bootFetchScoreFeeds()`/
`cotManualRefresh()`/`flushAndSave()` (Live-Feed-getriebene bzw. der
Hintergrund-Save selbst - duerfen NICHT `pushU()` aufrufen, das wuerde jeden
automatischen Refresh als eigenen Undo-Schritt/Nutzer-Edit tarnen).

Per Playwright mit demselben simulierten Multi-Geraete-Wettlauf wie in
Runde 1 verifiziert, diesmal am EXAKTEN gemeldeten Ablauf (Market-Watch-
Menue oeffnen, EUR/USD abwaehlen, `cloudPull()` mit einem gemockten,
aelteren Cloud-Stand dazwischenschieben): das Paar bleibt jetzt entfernt.

**Merksatz (verschaerft gegenueber Runde 1):** bei diesem Bug-Muster reicht
"ein paar naheliegende Kandidaten pruefen" nicht - es gibt inzwischen (Stand
2026-07-27) ueber 20 Funktionen quer durchs ganze File, die demselben Fehler
unterlagen, weil neue Editier-Funktionen offenbar oft nach dem Vorbild einer
NICHT-schuetzenden Nachbarfunktion kopiert wurden statt nach dem Vorbild der
Save-Funktion. Bei JEDEM kuenftigen Verdacht auf dieses Bug-Muster (nicht nur
bei einem Bugreport, auch praeventiv nach dem Hinzufuegen neuer Editier-
Funktionen) den programmatischen Scan erneut fahren (Skript-Idee: Klammer-
balancierte Extraktion jeder `function`, Filter auf `save()` ohne
`pushU`/`markPrefEdit`/`markUserEditTs` im Koerper) - NICHT wieder nur
einzelne Verdachtsfaelle von Hand durchsuchen, das uebersieht nachweislich
einen Grossteil.

### Score-History (🕰️): COT Data/Risk Environment fehlten komplett, Non-FX-Assets hatten NIE Events (Bugreport 2026-07-27, per Screenshot)

Nutzer schickte einen Screenshot der EUR-History: der Score sprang an einem
Tag (Vortag +6.1, dann +3.5), aber sowohl der Sprung-Tag als auch die beiden
Tage danach zeigten "No score-driving events". Auftrag: herausfinden, wieso
nicht ALLE score-treibenden Faktoren erfasst werden, und den Fix fuer JEDES
Asset umsetzen (nicht nur EUR).

**Nachweis ueber echte Repo-Daten statt Raten:** `score_hist.json` (die
server-seitige Score-Historie, siehe Eintrag weiter oben) enthaelt fuer EUR
das Tupel `[datum,total,infl,labour,growth,bias]` - `infl`/`labour` blieben
ueber den fraglichen Zeitraum konstant bei 3.5/1.5, `growth` sprang 0→2→0,
UND der "Rest" (`total - infl - labour - growth`, der zwangslaeufig
Interest Rates + COT Data + Risk Environment umfasst, da nur diese drei
Teil-Scores im Tupel stehen) verschob sich ebenfalls (-0.5→-0.9→-1.5) -
zwei score-treibende Aenderungen an genau dem Tag, an dem die History
"nichts" zeigte.

**Ursache gefunden:** `symScoreDrivingEventsByDate()` (≈ Zeile 3383) filterte
Rubriken nur gegen `IND_AUTO_RUBS=['Interest Rates','Inflation','Labour
Market','Economic Growth']` - "COT Data" und "Risk Environment" fielen
dadurch bei JEDEM Asset immer durch, obwohl beide nachweislich den Score
bewegen (`applyCotDataFeed()`/`recomputeRiskCorr()`). Zusaetzlich brach die
Funktion fuer Nicht-FX-Assets ganz am Anfang komplett ab (`if(isNonFx(id))
return byDate;`) - Gold/Silber/Oel/BTC/Aktienindizes zeigten dadurch
UEBERHAUPT NIE ein Event in ihrer History, unabhaengig vom Score-Sprung.

**Fix, dreiteilig:**
1. **COT Data + Risk Environment jetzt eigenstaendig ausgewertet** (nicht
   ueber `IND_AUTO_RUBS`, sondern ein eigener Zweig fuer `rub.name==='COT
   Data'||rub.name===MACRO_NAME`) - fuer FX UND Nicht-FX gleichermassen, da
   das asset-eigene Daten sind (eigener COT-Report, eigene Risk-Correlation-
   Einstellung), keine von einer Waehrung abgeleiteten. `ind.research.cot`/
   `ind.research.sent` (haben ein `date`-Feld wie COT-Report-Datum bzw.
   Sentiment-Update-Datum) liefern die synthetischen Events.
2. **COT/Sentiment-Bias ist Schwellen-/Vorzeichen-basiert** (z.B. Netto-
   Positionierung >=60%), nicht "Actual vs Forecast" wie bei echten Kalender-
   Events - `actualColor()`/`indBiasFromEvent()` haetten die Richtung ueber
   den bisherigen Zahlenvergleich falsch hergeleitet (bzw. gar nicht, da COT
   kein echtes Forecast hat). Fix: neuer `ev.bias`-Override in `actualColor()`
   (`if(ev.bias)return ev.bias==='bull'?'act-good':...`) - die synthetischen
   COT/Sentiment-Events tragen die bereits vom Feed korrekt berechnete
   `ind.bias` direkt mit, statt sie zu erraten. Tooltip-Formatierung
   (`fcLine` in `renderSymHistoryPanel`, `tip` in `renderSymHistory`) um
   eigene `ev.cot`/`ev.sent`-Zweige ergaenzt (COT: "prev X%" statt "fc X",
   Sentiment: kein Vergleichswert vorhanden, keine Zeile).
3. **Nicht-FX-Assets**: `isNonFx(id)`-Fruehausstieg entfernt. Die 4
   IND_AUTO_RUBS-Karten (Inflation/Interest Rates/Labour Market/Economic
   Growth) sind bei Nicht-FX rein per same/inverse-Regel von der
   verknuepften Waehrung gespiegelt (`deriveMacroBiasAll()`), OHNE dass
   `ind.research` mitkopiert wird - die Treiber-Events werden daher jetzt
   direkt bei der verknuepften Waehrung abgeholt (`macroCcyFor(id)` +
   `effDeriveRules(sym)[rub.name]==='same'/'inverse'`-Check, exakt wie
   `deriveMacroBiasAll()` selbst), nur wenn eine Regel tatsaechlich aktiv
   ist. COT Data/Risk Environment werden wie bei FX direkt am Asset selbst
   ausgewertet (s.o.), unabhaengig von einer Waehrungs-Verknuepfung.
4. **Randfund waehrend der Umsetzung**: `setRiskEnvDir()` (Richtungs-
   Einstellung im Zahnrad-Menue) und `applyRiskEnvList()` (gespeichertes
   Szenario anwenden) aenderten `ind.bias` von Risk Correlation genau wie
   `setRiskEnvLevel()` (der Regler), aber NUR der Regler hatte den
   `scoreLog`-Nachtrag (siehe Eintrag "Risk-Environment-Kartenbias..." vom
   2026-07-19/21) - die anderen beiden blieben unsichtbar in der History.
   Die Log-Logik in einen gemeinsamen Helfer `logRiskCorrChanges()`
   ausgelagert, von allen drei Stellen aufgerufen.
- Per Playwright mit den ECHTEN lokalen Feed-Daten verifiziert: ein
  synthetisches COT-Event auf EUR erscheint korrekt in der Karte (Pfeil,
  Farbe, "65% prev 60%", +1-Badge - Screenshot bestaetigt); ein USD-CPI-Event
  spiegelt sich korrekt in GOLDs History (Inflation-Regel "inverse"), OHNE
  bei EUR (nicht mit USD verknuepft) faelschlich mit aufzutauchen; alle 18
  Assets rendern `symScoreDrivingEventsByDate()`/`renderSymHistoryPanel()`
  fehlerfrei, Nicht-FX-Assets (GOLD/SILVER/OIL/SP500/NAS/BTC) zeigen jetzt
  echte Tage mit Events (vorher immer 0); `setRiskEnvDir()` erzeugt jetzt
  nachweislich einen `scoreLog`-Eintrag mit korrektem Vorher/Nachher-Bias
  und Delta. Voller Tab-Regressionstest weiterhin fehlerfrei.
- **Nicht behebbar (kein Bug, sondern Datenluecke):** die vom Nutzer
  gezeigten VERGANGENEN Tage (Vortag-Sprung) selbst lassen sich nicht
  rueckwirkend korrigieren - der genaue Indikator-Zustand des Nutzers zu
  jenem Zeitpunkt liegt nur in dessen eigenem Cloud-Sync-Stand, nicht in
  diesem Repo. Der Fix schliesst die Luecke fuer ALLE kuenftigen Aenderungen.
- **Merksatz:** bei "Score X, aber History zeigt nichts"-Bugreports immer
  zuerst pruefen, ob `score_hist.json`/`scoreHist` (infl/labour/growth
  einzeln) ein Sub-Signal isoliert, das NICHT durch die drei bekannten
  IND_AUTO_RUBS-Karten erklaerbar ist - das ist ein direkter Hinweis auf
  eine der beiden nicht abgedeckten Rubriken (COT Data/Risk Environment),
  ohne raten zu muessen, welcher Indikator betroffen war.

### ⚠️ Zwei Zustaende zu einem zusammenlegen heisst: MIGRATION schreiben (Bugreport 2026-08-09)

Nutzer: "Paare die ich zur Watchlist hinzugefuegt habe sind jetzt nicht mehr
drauf." Kein Datenverlust - eine fehlende Migration.

Bis zum 2026-08-07 waren **Stern** und **Watchlist** zwei unabhaengige Dinge:
der Stern setzte `p.marked` am Paar, die Watchlist war eine Kategorie in
`pairCats`. Die Zusammenlegung machte die Kategorie zur alleinigen Wahrheit
(`isWatched`/`setWatched`/`watchlistPairs` lesen nur noch sie) und erklaerte
`p.marked` zur "Altlast ohne Wirkung" - **uebertrug es aber nie**. Jedes vorher
markierte Paar hatte danach ein totes Feld im gespeicherten Stand und keinen
Eintrag in der Kategorie.

Sichtbar war das asymmetrisch, was die Meldung erklaert: `renderPairs()`
iteriert ALLE Paare unabhaengig von der Kategorie, `watchlistPairs()` filtert
strikt auf `p.catId===<Watchlist>.id`. Das Paar stand also weiter in den
Set-ups und fehlte nur auf der Watchlist.

`migrateMarkedToWatchlist()` (bei `watchlistCat()`) traegt die Markierung nach
und **loescht danach `p.marked`**. Das Loeschen ist nicht Kosmetik: ohne es
wuerde ein bewusstes Entfernen von der Watchlist beim naechsten Laden wieder
rueckgaengig gemacht, weil die Migration ewig neu setzt. Eingehaengt an beiden
Stellen, die die "WICHTIGSTE REGEL" oben verlangt: `loadState()` UND
`applySnap()` (Cloud-Pull/Undo/Import/Backup).

**Merksatz:** wird ein Zustand durch einen anderen ERSETZT, reicht es nie, die
Leseseite umzustellen - der alte Wert muss in denselben Commit hinein
uebertragen und danach entfernt werden. Ein Kommentar "bleibt als Altlast
liegen, ohne Wirkung" ist genau das Warnsignal: was ohne Wirkung liegen
bleibt, war fuer den Nutzer eine getroffene Entscheidung. Und: wenn zwei
Ansichten dieselbe Sache verschieden filtern (hier alle Kategorien gegen genau
eine), verschwindet ein Fehler in der einen und bleibt in der anderen sichtbar
- das ist der Fingerabdruck einer kaputten Zuordnung, nicht geloeschter Daten.

### Gold/Silber doppelt in den Set-ups: Sternen erzeugt einen leeren Platzhalter-Pair (Bugreport 2026-08-10)

Nutzer-Screenshot: "XAG/USD" (+6) und "Silver" (+3.6) standen als zwei
eigene Zeilen nebeneinander, gleiches Muster bei Gold.

**Ursache:** `setWatched(name,true)` (der Stern) legt beim Sternen eines
Non-FX-Assets automatisch einen `pairs`-Eintrag unter dem KANONISCHEN
Namen an (`GOLD` -> `XAU/USD`, siehe "WATCHLIST ALS EINZIGE WAHRHEIT"
oben) - reiner technischer Traeger, damit die Watchlist-Kategorie das
Asset fuehren kann. `renderPairs()` (Set-ups-Tab) baut seine Zeilenliste
aber aus ZWEI unabhaengigen Quellen: allen `pairs`-Eintraegen UND
zusaetzlich JEDEM Non-FX-Asset als eigener `kind:'asset'`-Zeile - der
bestehende Dedup (`seenPair`) griff nur INNERHALB der `pairs`-Liste
(mehrere Kategorien desselben Paar-Namens), nicht ZWISCHEN den beiden
Quellen. Der Watchlist-Platzhalter-Pair und die Asset-Zeile zeigten
dadurch dasselbe Instrument zweimal - einmal mit dem Kuerzel, einmal mit
dem Asset-Namen, und mit UNTERSCHIEDLICHEM Score (`pairScore('XAU/USD')`
= Gold minus USD plus Carry, `symScoreCmp(GOLD)` = Golds eigener Score).

**Fix:** `nonFxCanon` (Set der kanonischen Paarnamen aller Non-FX-Assets)
+ `isWatchlistPlaceholder(p)` blendet einen `pairs`-Eintrag nur dann aus,
wenn er (a) unter einem kanonischen Non-FX-Namen steht UND (b) komplett
leer ist (kein Entry/Trigger/SL/TP/Notiz) - genau der Zustand, den
`setWatched()` erzeugt. Ein ECHTER, vom Nutzer manuell mit Handelsdaten
angelegter Pair-Eintrag unter demselben Namen (z.B. "XAU/USD" mit Entry
4200/SL 4100/TP 4400) traegt eigene Information, die die Asset-Zeile
nicht zeigen kann, und bleibt deshalb bewusst als eigene Zeile bestehen.

Per Playwright verifiziert: Sternen von GOLD/SILVER ergibt genau eine
Zeile ("Gold"/"Silver"), Stern-Status bleibt korrekt gesetzt; Entsternen
aendert die Zeilenzahl nicht (die Asset-Zeile war immer da); ein Test-
Pair mit echtem Entry/SL/TP behaelt seine eigene Zeile neben der
Asset-Zeile.

**Merksatz:** ein Dedup-Set, das nur INNERHALB einer Quelle prueft
(`seenPair` nur gegen `pairs`), schuetzt nicht vor Duplikaten zwischen
ZWEI verschiedenen Quellen, die dieselbe Sache unterschiedlich
repraesentieren (hier: Pair-Eintrag vs. Asset-Zeile fuer dasselbe
Instrument). Bei kuenftigen Aenderungen an `renderPairs()`/aehnlichen
Listen, die mehrere Quellen kombinieren, immer pruefen, ob ein
technischer Platzhalter aus der einen Quelle mit einem echten Eintrag
der anderen Quelle kollidieren kann.

### Stocks (AMZN/NVDA) komplett aus der App entfernt (Nutzer-Wunsch 2026-08-10)

Sieben Fundstellen in `index.html` (Symbol-Definitionen `DEF`, `SB_CATS`
"Stocks"-Kategorie - komplett geloescht statt leer stehen gelassen,
`NONFX_IDS`, `ASSET_CLASS`, die Risk-Correlation-Erklaertexte in
`MACRO_DATA`, `RISK_ENV_DEFAULT_DIR`) und vier im Workflow
(`update-ff-calendar.yml`: TradingView-Ticker-Liste + MAP + SRC im
Preis-Fetch-Schritt, `MAPS` im Yahoo-3-Jahres-Backfill). Da diese Assets
nur eingebaute `DEF`-Eintraege waren (keine Custom-Assets), reicht die
Entfernung aus `DEF` - `loadState()`s `syms=DEF.map(...)` erzeugt fuer sie
einfach keine Symbol-Objekte mehr, kein Migrations-Aufwand noetig.

**Einmalige Bereinigung der bereits aufgezeichneten Historie:** anders als
bei einem neuen, noch nie erhobenen Feld hatten AMZN/NVDA bereits echte
Daten angesammelt - 3 Jahre Kurshistorie in `price_data.json`, Score-
Verlauf in `score_hist.json`. Der Workflow haette diese Keys nie von
selbst geloescht (die Fetch-Schleife aktualisiert nur bekannte Assets aus
`MAP`, entfernt aber nie verwaiste Alt-Keys) - ohne Bereinigung waeren sie
fuer immer als totes Gewicht im Repo liegen geblieben. Beide Dateien
einmalig direkt bereinigt (nicht ueber den Workflow), dokumentiert als
Ausnahme von "Daten-JSONs nicht manuell editieren" - analog zum bereits
etablierten Muster bei einmaligen Backfills/Bereinigungen (OCC-Put/Call-
Backfill, Revisions-Backfill): keine Schaetzung, reine Loeschung von
Keys, die durch eine echte Code-Aenderung ueberhaupt erst verwaist sind.
`score_hist.json` dabei im kompakten Format belassen (kein Einruecken),
wie es der Workflow selbst schreibt (`JSON.stringify(d)` ohne Parameter) -
`price_data.json` behaelt sein eingerueckte Format (`JSON.stringify(out,
null,1)`).

**Merksatz:** beim Entfernen eines eingebauten Assets immer pruefen, ob es
bereits eigene Zeitreihen-Daten in den committeten JSONs hat (nicht nur
Code-Referenzen) - sonst bleiben verwaiste Keys liegen, die nie wieder
angefasst werden, aber niemand mehr braucht.

### Score-Modal als Karten statt Zeilenliste (Nutzer-Wunsch 2026-08-11)

Nutzer-Auftrag (per `/goal`): der Score-Detailausklapp pro Indikator war
bisher eine dichte einzeilige Liste - Basis/Gewicht/Normierungsfaktoren
standen als Text-Klammer in einer Zeile, ohne Aufschluesselung, WORAUS ein
Faktor stammt. Umgebaut auf Karten (`.si-card`) mit Formel-Kette
(`.si-chain`, Basis × Gewicht × Alter × Marktrelevanz × Ueberraschung als
einzelne Chips) und aufklappbaren Faktor-Tabellen (natives `<details
class="si-factor">`, kein JS-Handler noetig) - Klick auf den ⓘ-Chip bei
"Age" zeigt Release-Datum/eigenen Zyklus/Halbwertszeit/Altersgrenze, bei
"Surprise size" die eigene Streuung σ + Beobachtungszahl, bei "Market
impact" den Ø-Kursausschlag-Faktor + Beobachtungszahl.

**Reine Anzeige-Umstellung** (`scoreInfoIndRow()`, ≈ Zeile 4019): liest
ausschliesslich bereits bestehende Funktionen (`indScoreParts`,
`indNormBreakdown`, `indSurpriseStats`, `indHalfLifeDays`) - keine neue
Berechnung, damit das Modal nie von der echten Rechnung abweichen kann
(Projekt-Grundsatz). Bias weiterhin NUR ueber `border-left-color`
(CLAUDE.md-Grundsatz "Score-/Asset-Karten: kein Hintergrund-Tint"), Karten
in `--bg2` (wie der Modal-Hintergrund selbst) mit 1px Rand fuer Kontrast -
gleiche Konvention wie das bestehende Data-Quality-Fenster
(`.dq-sum-item`). Modal-Breite von 460px auf 600px erhoeht (die Formel-
Kette braucht mehr Platz als die alte Textzeile).

Vor der Umsetzung ein vollstaendiges, interaktives Mockup als Artifact
gebaut und dem Nutzer gezeigt (im exakten "Grey Tech Terminal"-Look der
App, nicht neu erfunden) - erst danach implementiert, da eine reine
Anzeige-Aenderung als niedrigrisikoreich eingestuft wurde (keine Score-
Logik-Aenderung, jederzeit reversibel), waehrend die drei anderen an
diesem Tag ebenfalls angefragten Punkte (neue Indikatoren, ±3-Schwellen-
Kalibrierung, Risk-Environment-Score-Trennung) bewusst NICHT ohne
explizites Nutzer-OK umgesetzt wurden, da sie echte Scoring-Verhaltens-
Aenderungen waeren.

Per Playwright verifiziert: 127 Aufrufe (`openScoreInfoSym`/
`openScoreInfoRub`/`openScoreInfoPair`, alle Symbole/Rubriken/15 Paare) in
BEIDEN Score-Modi fehlerfrei, `<details>`-Toggle oeffnet/schliesst korrekt
und zeigt die richtigen Zahlen (Live-Beispiel USD CPI: 2,41σ, Streuung
0,124, 34 Beobachtungen, Faktor ×1,55 - identisch zur Formel-Kette
darueber). `node --check` sauber.

**Noch offen, wartet auf Nutzer-Entscheidung** (nicht Teil dieses Fixes):
1. Welche der recherchierten Citi/Bloomberg-Indikatoren (Kandidat mit
   bester Erfolgsaussicht: University of Michigan Consumer Sentiment -
   TradingView-Kalender fuehrt laut bestehendem `RULES`-Ausschluss-Regex
   in `update-ff-calendar.yml` bereits einen Michigan-Titel) ergaenzt
   werden sollen.
2. Ob die feste ±3-Bull/Bear-Schwelle im `normalized`-Modus durch eine
   z-Score-Kalibrierung gegen die eigene `scoreHist`-Verteilung ersetzt
   wird (empirischer Befund an echten 22 Tagen `score_hist.json`: JPY war
   100% der Zeit "bullish" eingestuft, mehrere Assets nie ausserhalb der
   Neutral-Zone - die feste Schwelle wirkt je nach Asset-Streuung sehr
   unterschiedlich).
3. Ob `Risk Environment` aus der additiven `symScore`-Summe herausgenommen
   und als eigenes Overlay separat ausgewiesen wird (nach Vorbild von
   Citis GMRI/Macro Risk Index, der ebenfalls nie in einen fundamentalen
   Score gemischt wird) - macht Cross-Asset-Vergleiche zwischen Risk-On-
   und Risk-Off-Assets aktuell schief, weil der Risk-Sentiment-Regler pro
   Asset unterschiedlich stark reinzieht.

### Dashboard-Watchlist-Karte sortiert, "vs Price" ueberall dauerhaft an, Seasonality bekommt eine "vs Price"-Ueberlagerung (Nutzer-Wunsch 2026-08-12)

Drei kleinere, unabhaengige Nutzer-Wuensche in einem Rutsch:

- **Dashboard-Watchlist-Karte (`type==='watchlist'`-Widget) sortiert jetzt
  nach Score absteigend** - dieselbe Sortierregel, die `renderWatchlistTab()`
  (der eigene Watchlist-Tab) schon seit 2026-08-10 hat, war nie auf die
  Dashboard-Karte uebertragen worden (klassischer Fall von "wiederkehrende
  UI-Bausteine muessen einheitlich sein" - zwei Stellen zeigen dieselbe
  Liste, nur eine wurde beim urspruenglichen Fix erwischt). FX-Zeilen nach
  `pairScore()`, Non-FX-Zeilen nach dem Symbol-Score (falls das Asset noch
  existiert, sonst Paar-Score als Fallback) - exakt die Werte, die die
  jeweilige Zeile auch anzeigt, damit Sortierung und Anzeige nie
  auseinanderlaufen. **Falle beim ersten Entwurf:** `nonFxLegAssetId()` auf
  ALLE Items (auch FX-Paare) anzuwenden waere falsch gewesen - fuer
  z.B. "EUR/USD" liefert das ueber den Praefix-Fallback zufaellig `'EUR'`,
  was als echte Symbol-ID matcht und faelschlich den EUR-Einzel-Score statt
  des Paar-Scores zurueckgegeben haette. Getrennte Sortierfunktionen fuer
  `fxItems` (immer `pairScore`) und `nonFxItems` (`nonFxLegAssetId`-Pfad)
  vermeiden das.
- **"vs Price" (Trends-Tab) war ein Toggle-Button (`trendsShowPrice`) - jetzt
  dauerhaft aktiv**, sobald genau ein Asset oder Paar gewaehlt ist (bei
  "All assets"/"FX only" war "vs Price" ohnehin nie moeglich, das bleibt
  unveraendert - mehrere Score-Linien gleichzeitig, kein Platz fuer eine
  einzelne Preis-Ueberlagerung). Button + State-Variable + die
  Button-Sync-Logik in `renderTrends()` komplett entfernt, beide
  Aufrufstellen (`renderTrends()` fuer Einzelasset, `renderTrendsPair()`
  fuer den Paar-Modus) nehmen jetzt unconditional den `scoreVsPriceCard`-
  Zweig.
- **Seasonality bekommt eine eigene "vs Price"-Entsprechung, ebenfalls ohne
  sichtbare Option.** Anders als beim Trends-Tab gibt es hier keinen Score
  und keine echte Datums-Zeitreihe (die X-Achse sind die 12 Kalendermonate,
  gemittelt ueber 15 Jahre) - "vs Price" 1:1 uebertragen ergibt hier keinen
  Sinn. Sinnvolle Entsprechung: der TATSAECHLICHE Kursverlauf des
  LAUFENDEN Jahres, Monat fuer Monat, als gestrichelte Linie ueber den
  historischen Durchschnitts-Balken (`seasCurYearReturns()`, neue Funktion
  vor `seasBarChart()`) - zeigt auf einen Blick, ob das laufende Jahr dem
  15-Jahres-Muster folgt oder abweicht. Aus echter Kurshistorie berechnet
  (`priceSeriesFor()`, dieselbe Quelle wie jeder andere Preis-Chart in der
  App) - Basis je Monat ist der letzte bekannte Kurs VOR Monatsbeginn,
  damit auch der laufende, noch unvollstaendige Monat einen echten
  Zwischenstand zeigt statt zu fehlen; respektiert `A.inv` (dieselbe
  USD-first-Invertierung wie die historischen Saison-Werte, damit beide
  Reihen dasselbe Vorzeichen-System nutzen). Folgt der bereits etablierten
  gestrichelte-Linie-Konvention (`var(--t0)`, `stroke-dasharray`, siehe
  "Preis-Historie: Kerzen durch gestrichelte Linie ersetzt" oben) statt
  eine neue Optik zu erfinden, inkl. `.tr-leg-dash`-Legende. **Ein
  gemeinsamer Tooltip pro Monat** (historischer Ø + "this year so far" im
  selben `chv-tip`) statt zwei separater Hover-Punkte an derselben
  X-Position - sonst genau der bereits mehrfach dokumentierte Bug, dass
  `attachChartHovers()`s Naechster-Punkt-Suche nur den einen von zwei
  Punkten am selben X zeigt.

Per Playwright verifiziert: Watchlist-Karte zeigt FX-Sektion und Non-FX-
Sektion je absteigend sortiert (dieselbe zwei-Sektionen-Struktur wie der
Watchlist-Tab); Trends zeigt fuer ein Einzelasset UND im Paar-Modus immer
die vs-Price-Karte, `trendsPriceBtn`/`toggleTrendsPrice` existieren nicht
mehr im DOM/als Funktion; Seasonality zeigt bei vorhandener Kurshistorie
die gestrichelte Ueberlagerung + Legende, keinen Toggle-Button. Voller
Tab-Regressionstest weiterhin fehlerfrei.

**Noch offen (Nutzer-Auftrag, wartet auf Bild-Entscheidung):** der Marmor-
Hintergrund (`body{background:...}`, Grey-Tech-Terminal-Theme) soll
"deutlich schoener, mehr Details" werden. Vier Prototypen als Artifact
gebaut und dem Nutzer gezeigt (A=aktueller Stand, B=verfeinerte Version
derselben Hand-Gradient-Technik, C/D=echte prozedurale Marmorierung per
SVG `feTurbulence`+`feDisplacementMap` in gedaempfter bzw. kontrastreicher
Auspraegung) - noch keine Auswahl getroffen, noch nicht in `index.html`
uebernommen.

### Marmor-Hintergrund ueberarbeitet: echte prozedurale Adern statt Hand-Gradienten (Nutzer-Wunsch 2026-08-13, "Mischung aus D und B")

Vier Prototypen (A=Ist-Zustand, B=verfeinerte Hand-Gradient-Technik, C/D=
prozedurale SVG-Marmorierung per `feTurbulence`+`feDisplacementMap`) als
Artifact gezeigt, Nutzer waehlte "Mischung aus D und B".

**Erste zwei Umsetzungsversuche hatten einen echten technischen Fehler,
nicht nur einen Geschmacks-Unterschied:** `feTurbulence` in Chromium/Skia
hat eine inhaerente Periodizitaet (fest verdrahtete Permutations-Tabelle,
wiederholt sich abhaengig von `baseFrequency`) - bei den in den Artifact-
Vorschau-Panels (nur 340px hoch) unauffaelligen Parametern zeigte sich bei
voller Seitenhoehe (900px+) ein klar sichtbares Kachel-Wiederholungsmuster
("Fliesen-Look" statt organischer Adern), reproduzierbar per Playwright-
Screenshot bei mehreren `baseFrequency`/`scale`-Kombinationen - das Problem
lag NICHT an falschen Parametern, sondern strukturell daran, dass die
gesamte Aderform aus rohem Turbulenz-Output abgeleitet wurde.

**Loesung:** die Adern sind jetzt handgezeichnete Bezier-Pfade (organische
Verzweigung durch mehrere Kontrollpunkte + kleine Seitenaeste, keine
Wiederholung möglich, da einzigartig gezeichnet) - `feTurbulence` kommt nur
noch an zwei Stellen zum Einsatz, beide mit stark reduziertem Effekt-Radius
relativ zur Vorlagen-Groesse, wodurch die Kachel-Periodizitaet nicht mehr
ins Auge faellt: (1) ein feines Oberflaechenkorn (`baseFrequency 0.9`,
Alpha nur 0,05) auf der gesamten Flaeche, (2) eine KLEINE Verschiebung
(`feDisplacementMap scale=7`, hochfrequente Turbulenz) NUR fuer organische
Rauheit an den Rändern der Adern selbst, nicht fuer deren Grossform. Per
Playwright bei 1400×900, 1920×1080, 820×1180 und 390×844 verifiziert -
kein sichtbares Wiederholungsmuster mehr in keiner Groesse.

**Technische Umsetzung:** als eingebettetes SVG-Daten-URI-Bild
(`background-image:...,url("data:image/svg+xml,...")`, URL-encodiert
statt Base64 fuer Editierbarkeit) - bleibt dadurch innerhalb der
Ein-Datei-Architektur (keine externe Bilddatei), rendert einmalig statisch
(keine Animation, kein `filter:blur()` auf grossen Flaechen - haelt sich an
die bereits dokumentierte Performance-Lehre bei Hintergrund-Effekten).
B's fuenf radiale Highlight-Blooms bleiben als eigene CSS-`radial-gradient`-
Ebenen VOR dem SVG-Bild in `background-image` erhalten (Mehrschicht-
`background`, je ein `background-size`/`-position`/`-repeat`-Eintrag pro
Ebene - die 5 Gradient-Ebenen bleiben `auto`/nicht positioniert wie zuvor,
nur die SVG-Bild-Ebene bekommt `cover`/`center top`). D's rote Mineral-Ader
(Bias-Rot `#e35d5d`, 6% Deckkraft) blieb als Charakter-Detail erhalten.

Ersetzt exakt die eine `background:`-Deklaration in `body{...}` (≈ Zeile 21)
- alle anderen Body-Eigenschaften unangetastet. Kein Score-/Daten-Bezug,
reine Optik. `node --check` sauber, voller 13-Tab-Regressionstest weiterhin
fehlerfrei, Live-Screenshot des echten Dashboards (nicht nur der isolierten
Test-Datei) bestaetigt korrekte Darstellung.

### Prozeduraler Marmor-Hintergrund wieder zurueckgesetzt (Nutzer-Wunsch 2026-08-13, direkt im Anschluss)

Direkt nach dem Ship der SVG-Turbulenz-Adern (siehe voriger Eintrag) kam
"Ne mach den Hintergrund wieder wie es vorher war" - `body{background}`
ist wieder exakt auf den urspruenglichen Stand (12 hand-platzierte
`linear-gradient`-Adern + 4 radiale Highlights, kein SVG-Daten-URI mehr).

**Merksatz (Ergaenzung zum "Farbaudit-Rueckbau"/"Hintergrund-Glow"-Muster
oben):** ein im Artifact-Vorschau positiv bewerteter visueller Vorschlag
kann trotzdem beim Live-Ansehen im echten Kontext (App-Layout drumherum,
tatsaechliche Kartendichte) nicht ueberzeugen - der vorige Eintrag
dokumentiert einen echten technischen Fehler (Turbulenz-Kachelmuster), der
zwar behoben wurde, aber das GESAMTERGEBNIS war dem Nutzer offenbar
trotzdem nicht lieber als der Ausgangszustand. Bei einem erneuten
"Marmor verbessern"-Wunsch nicht wieder bei derselben SVG-Turbulenz-Technik
anfangen, ohne vorher zu erfragen, was genau am prozeduralen Ergebnis nicht
gefiel (zu unruhig? zu grau? die rote Ader zu viel?) - der Rueckbau selbst
gibt darauf keine Antwort.

### Bug-Audit + zwei echte Fehler im Risk-Index (Nutzer-Auftrag 2026-08-14 "schau den ganzen Code nach Bugs")

**Vorgehen:** statischer Scan zuerst, dann Laufzeit - der statische Teil war
groesstenteils WERTLOS und das ist die wichtigere Lehre. Ein selbstgebauter
Kommentar-/String-Stripper hat sich an Regex-Literalen verschluckt und 2/3
der Datei zerstoert (1.097.000 → 357.000 Zeichen), wodurch reihenweise
existierende Funktionen als "nirgends definiert" gemeldet wurden. Ein Scan
auf "aufgerufen aber undefiniert" ohne Stripper meldete hunderte deutsche
Kommentar-Woerter als Funktionsnamen. **Bei kuenftigen Audits nicht wieder
einen eigenen JS-Parser bauen** - die Laufzeit-Tests (Playwright) haben in
einem Bruchteil der Zeit die echten Fehler gefunden.

**Laufzeit-Audit (sauber):** alle 15 Tabs gerendert, jeder sichtbare
Button auf jedem Tab geklickt (destruktive ausgenommen), Score-Modal fuer
JEDES Symbol/JEDE Rubrik/20 Paare in BEIDEN Score-Modi, jede Asset-
Detailseite, alle Asset-Filter in Seasonality/Data/Trends, Undo/Redo.
Ergebnis: 0 Fehler. Ebenso 0 Layout-Fehler ueber 5 Viewports × 15 Tabs
(Seiten-Ueberlauf, Karten-Ueberlauf, vertikal abgeschnittener Inhalt).
Ebenso 0 bei den Edge-Case-Tests (Normierungs-Klemmung, `_symId`-Stempel
vollstaendig, Score identisch unabhaengig vom geoeffneten Asset,
`seasCurYearReturns` mit unbekanntem Asset/null/invertiert).

**Die dokumentierten Bug-Klassen waren alle sauber:** `saveScoreMode`
erfuellt alle vier Ecken (fxpro_updated + _lsUpdatedSeen + markPrefEdit +
cloudAutoSync UND `!prefPending`-Guard in `cloudPull`), die uebrigen
localStorage-Keys ohne Sync sind zu Recht lokal (Caches, Cloud-Config
selbst, Einmal-Migrations-Flags wie `fxpro_ruborder_v3/v4`).

**Zwei echte Bugs - beide im Risk-Index vom 2026-08-12, beide von mir
selbst eingebaut:**

1. **Der KCRORO-Fetch von FRED lief NIE durch.** Der Workflow-Schritt
   meldete "success" (`continue-on-error`), die Datei fehlte aber im Repo.
   Auffaellig war die Laufzeit: exakt 95 s = mein Timeout-Budget
   (45 s + 5 s Pause + 45 s Retry). Job-Log 31825300973 bestaetigt:
   `[debug] KCRORO curl: http=000 size=0` / `command failed (exit 28)`
   auf BEIDEN Versuchen. `http=000` heisst gar keine Antwort - **FRED
   blockt GitHub-Actions-Runner**, exakt dieselbe Blockade, die den
   EFFR-Fetch schon zur NY-Fed-API gezwungen hat. Das stand sogar im
   Kommentar des eigenen Schritts als Risiko drin und ist trotzdem
   eingetreten. **Nicht nochmal `fred.stlouisfed.org` versuchen.** Eine
   Alternativquelle fuer KCRORO existiert nicht (die Kansas-City-Fed-Seite
   rendert nur einen Chart ohne Rohdaten-Link). Moeglicher kuenftiger Weg:
   FREDs offizielle API auf dem ANDEREN Host `api.stlouisfed.org` - braucht
   einen kostenlosen API-Key als Repo-Secret, bisher nicht eingerichtet.
   **Ersatz:** der Index wird jetzt aus echten Marktpreisen berechnet, die
   derselbe Lauf ohnehin schon geholt hat (`price_data.json`/
   `sentiment_data.json`) - VIX, Gold, AUD/USD, USD/JPY, je die
   20-Tage-Veraenderung, z-normiert an der eigenen 1-Jahres-Verteilung,
   dann gemittelt; >0 = Risikovermeidung (Vorzeichen wie KCRORO). Kein
   zusaetzlicher Netzwerk-Request = nichts, was blockiert werden koennte.
   Bewusst VERAENDERUNGEN statt Niveaus: Gold steht in einem mehrjaehrigen
   Aufwaertstrend, ein Niveau-z-Wert wuerde dauerhaft "risk-off" melden.
   Die volle Historie wird bei jedem Lauf aus der 3-Jahres-Kurshistorie neu
   durchgerechnet - kein Ein-Punkt-pro-Tag-Aufbau noetig. An den echten
   Repo-Daten gemessen: 800 Tage, Mittelwert 0,01, Streuung 0,60, Aufteilung
   35 % risk-off / 41 % risk-on / 24 % neutral - plausibel verteilt, keine
   Dauer-Schlagseite. **VIX faellt anfangs noch heraus** (sammelt erst seit
   Feature-Start einen Punkt pro Tag, hatte 37 von noetigen 50) und kommt
   automatisch dazu, sobald die Reihe lang genug ist - ohne Code-Aenderung.
2. **`risk_index.json` fehlte in der `git add`-Liste** des Commit-Schritts.
   Die Datei waere also selbst bei erfolgreichem Fetch nie im Repo gelandet.
   **Merksatz:** bei JEDEM neuen Workflow-Schritt, der eine Datei erzeugt,
   sofort pruefen, ob sie auch in der Commit-Liste steht - der Schritt
   selbst meldet "success", und die fehlende Datei faellt erst auf, wenn
   jemand im Repo nachsieht.

**Dazu ein Fehler, der VOR dem ersten Lauf abgefangen wurde:** im neuen
Skript stand `.filter(p=>p.s.length>=LOOK+30)` VOR `const LOOK=20` - die
temporal dead zone haette einen `ReferenceError` geworfen. Genau die Falle,
die bei `SYNC_EXCLUDE_RUBS`/`SENT_MAP` in `index.html` schon dokumentiert
ist. Gefunden durch eine Reihenfolge-Pruefung nach dem Edit, nicht durch
`node --check` (das meldet TDZ nicht).

**5 tote Funktionen entfernt** (nur noch ihre eigene Definition im File, kein
Aufrufer, auch nicht als String in einem `onclick`): `bondYieldChangeInfo`,
`researchTreeSelLabel`, `setIndHistRangeCustom`, `strengthBadgeHtml` (seit
dem Entfernen des Staerke-Badges am Asset-Kopf), `togPairMark` (seit der
Watchlist-Zusammenlegung). **Falle beim Dead-Code-Scan:** die vielen
`setXRange`-Funktionen sehen tot aus, werden aber als STRING an
`timeRangeBarHtml(...,'setTrendsRange')` uebergeben und dort in ein
`onclick` gebaut - ein Zaehler, der nur `name(` sucht, meldet sie
faelschlich. Zaehlen, wie oft der Name UEBERHAUPT im File vorkommt: genau 1 =
wirklich tot.

### Marmor-Hintergrund v3: echte Raster-Textur statt CSS-Gradienten/SVG-Filter (Nutzer-Wunsch 2026-08-14 "richtig realistisch, vlt auch aus dem Internet")

**Warum nicht "aus dem Internet":** Bild-Hoster (Unsplash, Pexels) sind vom
Sandbox-Egress-Proxy mit HTTP 403 gesperrt (Org-Policy, laut Anweisung nicht
zu wiederholen). Ausserdem waere ein CDN-Link mit der Ein-Datei-/Offline-
Architektur unvereinbar - es haette ohnehin eingebettet werden muessen.
**Und keine Bildbibliotheken:** PIL/numpy sind nicht installiert.

**Loesung: die Textur selbst erzeugen, in reinem Python.** PNG-Encoder von
Hand (zlib+struct aus der Standardbibliothek, ~10 Zeilen), Value-Noise mit
Smoothstep-Interpolation, fBm-Turbulenz, klassisches Perlin-Marmor-Verfahren
(`sin(bandierung + turbulenz*A)` -> die charakteristischen geschwungenen
Adern). Generator liegt im Scratchpad (`marble_gen.py`), Ergebnis ist als
Graustufen-PNG-Daten-URI in `body{background-image}` eingebettet.

**Drei Stellschrauben, die den realistischen Eindruck ausmachen** - der erste
Anlauf hatte sie falsch und sah aus wie eine HOEHENLINIEN-KARTE (zu viele,
zu gleichmaessig verteilte duenne Linien):
1. **Sehr niedrige Bandfrequenz** (0.0135 → 0.0026): nur 2-3 dominante Adern
   queren die Flaeche statt ~20. Echter Calacatta hat wenige grosse Adern auf
   ruhiger Flaeche, keine gleichmaessige Liniendichte.
2. **Anisotropes Rauschen** (`noise(x*freq*aniso, y*freq)`, aniso≈0.35): die
   Strukturen strecken sich in eine Richtung, statt rundliche Blasen zu
   bilden. ⚠️ Richtung leicht zu verwechseln - X stauchen streckt in X.
3. **Pro Ader scharfer Kern PLUS breiter weicher Halo** (`vein(p,15)` und
   `vein(p,3.6)` derselben Phase): erzeugt Tiefe statt Strichzeichnung. Ein
   zu breiter Halo (Exponent 2.2) liess es "zerlaufen" aussehen.

**Einfaerbung ueber `background-blend-mode:multiply`** gegen
`background-color:var(--bg0)`: das PNG ist bewusst GRAUSTUFEN (halb so gross
wie RGB), die Farbe kommt aus dem CSS-Token. Aendert sich die Palette,
zieht der Marmor automatisch mit - keine zweite Farbquelle.

**Groesse:** 760×475 statt 900×560 gewaehlt - 156 KB statt 284 KB base64 bei
praktisch identischer Wirkung, weil `background-size:cover` eine weiche
Textur ohnehin hochskaliert. Der groesste Kompressions-Feind ist das FEINE
KORN (Zufallsrauschen ist per Definition inkompressibel) - deshalb dezent
gehalten (±1,2 statt ±2,6). Datei dadurch 1,31 → 1,46 MB.

**Vorgeschichte (nicht nochmal aufrollen):** v1 waren 12 hand-platzierte
`linear-gradient`-Adern (zu regelmaessig), v2 waren SVG-`feTurbulence`-Adern
(zeigten bei voller Seitenhoehe ein Kachel-Wiederholungsmuster, weil
feTurbulence eine inhaerente Periodizitaet hat - und wurden vom Nutzer nach
dem Live-Ansehen komplett zurueckgerollt). Eine ECHTE Raster-Textur hat
dieses Problem strukturell nicht: sie wird einmal erzeugt und als Bild
skaliert, es gibt nichts, was sich wiederholen koennte.

### Dashboard: alle Spalten enden auf einer Linie - MIT Inhalt (Nutzer-Wunsch 2026-08-14)

Woertlich: "mach das alle Karten gleich weit unten enden aber am besten auch
mit Inhalt und keine weisen Lücken dadrinne". **Das ist KEIN Widerspruch zu
den beiden frueheren Ablehnungen** (2026-07-27 und 2026-08-08, beide im
CSS-Kommentar bei `#dashWidgets.dash-layout` dokumentiert): abgelehnt wurde
damals nicht der gleiche Abschluss an sich, sondern dass dafuer eine Karte
mit UNVERAENDERT WENIG Inhalt aufgeblasen wurde und ihr Inhalt darin
"schwebte". Der jetzige Wunsch loest genau das auf - gleich hoch UND gefuellt.

**Ausgangslage gemessen** (1440×900, frisches Profil): Spaltenfuesse bei
748/1043/1125/1046 px, also **377 px Differenz**. Ursache war fast
ausschliesslich die linke Spalte: `watchlist` (132 px) und `corr_warn`
(114 px) waren reine Platzhalter-Karten mit einem Satz Text.

**Drei Bausteine, in dieser Reihenfolge - Inhalt zuerst, Layout zuletzt:**

1. **Die zwei Platzhalter mit echten Daten fuellen** (der eigentliche Fix,
   brachte allein 377 → 192 px):
   - `watchlist` bei leerer Liste: die aktuell staerksten Paare nach
     `|pairScore|` als Ein-Klick-Vorschlag (`setWatched(...,true)`), mit
     denselben Zeilen-Bausteinen wie die gefuellte Liste - die Karte sieht
     im leeren und gefuellten Zustand gleich aus. 132 → 380 px.
   - `corr_warn` bei <2 Watchlist-Paaren: dieselbe Rechnung ersatzweise auf
     `CORR_FALLBACK_PAIRS` (5 Majors = 10 Kombinationen) statt "bitte erst
     zwei Paare hinzufuegen". `watchlistCorrPairs(pairNames)` nimmt dafuer
     jetzt optional eine Namensliste. 114 → 354 px. ⚠ Der Parameter darf
     NICHT `names` heissen - die Funktion hat intern schon ein `const names`
     (Redeclaration-Fehler, von `node --check` gefunden).
2. **Kuenstlich knappe Zeilen-Limits entdrosselt** - diese Listen hatten weit
   mehr Daten, als sie zeigten: Kalender `slice(0,3)`→`(0,8)`, Volatilitaet
   `(0,6)`→`(0,10)`, Carry `5+5`→`6+6`. Ohne diesen Schritt haetten die
   Karten im naechsten Schritt nichts zum Fuellen gehabt.
3. **Erst dann der Hoehenausgleich:** Grid auf `align-items:stretch`, und
   genau die LETZTE Karte jeder Seitenspalte bekommt in `renderDash()` die
   Klasse `dw-grow` (per String-Replace auf dem fertigen Karten-HTML, kein
   zweiter Render-Pfad). Sie nimmt den Restplatz, und ihre Liste bekommt
   `flex:1` + **`justify-content:space-between`** - der Restplatz verteilt
   sich damit gleichmaessig auf die ZEILENABSTAENDE, statt sich unten als
   weisse Flaeche zu sammeln. Genau das war der "weisse Luecke"-Einwand.
   Passt die Liste nicht hinein, hat `space-between` nichts zu verteilen und
   der `overflow-y:auto`-Scroll uebernimmt - beide Faelle sind abgedeckt.

**Ergebnis gemessen ueber 4 Desktop-Viewports** (1920/1600/1440/1180):
Spaltendifferenz **0 px**, Restluecke in JEDER der vier `dw-grow`-Karten
**0 px**, kein horizontaler Ueberlauf, keine JS-Fehler.

**⚠ Der Zwischenschritt war noetig, um es richtig zu messen:** eine erste
Messung meldete faelschlich "17 px Luecke, alles gut" - sie mass gegen das
LETZTE KIND von `.dw-body`, und das ist die gestreckte Liste SELBST. Der
Leerraum sass INNERHALB der Liste unter der letzten Zeile. Erst die Messung
gegen die letzte ZEILE zeigte die echten Luecken (perf_ranking 256 px,
corr_warn 132 px). **Bei kuenftigen "fuellt die Karte?"-Pruefungen immer
gegen das letzte sichtbare INHALTS-Element messen, nie gegen den Container.**

**Alles greift nur ab `min-width:1100px`** (die Regeln stehen im bestehenden
Media-Block) - darunter stapelt das Dashboard weiterhin einspaltig, dort gibt
es keine Spalten, die zusammen enden koennten. Auf Mobil per Screenshot
geprueft: unveraendert.

**Headlines-Karte:** hat ohne `MARKETAUX_API_KEY` echt keine Daten. Statt
einer nackten Zeile erklaert der Leerzustand jetzt, wie man den Feed
einschaltet - Inhalt mit Nutzen, aber weiterhin KEINE erfundenen
Schlagzeilen (Grundsatz "nie schaetzen").

### Dashboard-Abschluss Runde 2: der Fehlbetrag muss auf ALLE Karten verteilt werden (Nutzer-Bugreport 2026-08-14, per Foto)

Nutzer nach Runde 1: "da sieht man noch grosse weise Luecken so war das nicht
gedacht ... mach vielleicht einfach die Karte vom Kalender als feste Groesse
und dann innerhalb der Karte scrollbar."

**Warum Runde 1 nicht reichte:** dort bekam genau EINE Karte je Spalte
(`dw-grow`) den gesamten Restplatz und verteilte ihn per
`justify-content:space-between` auf die Zeilenabstaende. Das loest eine grosse
Luecke nur in viele kleine auf - und wenn die Karte einen hohen Kopf hat
(Correlation Check: Kennzahl + Erklaerzeile), bleibt vom Rest so wenig, dass
1 von 7 Zeilen sichtbar war. Eine einzelne Karte kann einen Fehlbetrag von
mehreren hundert Pixeln nicht sinnvoll aufnehmen.

**Loesung: schrumpfen statt strecken, und auf alle verteilt.** Jede Karte mit
einer Liste traegt `dw-shrink` (`DASH_SHRINKABLE` in `renderDash()`, per
String-Replace auf dem fertigen Karten-HTML - kein zweiter Render-Pfad):
`min-height:150px`, Body als Flex-Spalte, die Liste `flex:1;min-height:0;
overflow-y:auto`. `equalizeDashColumns()` misst je Spalte die natuerliche
Hoehe UND die Mindesthoehe (Karten ohne Liste zaehlen voll, `dw-shrink`-Karten
mit `DASH_SHRINK_MIN_H`), nimmt das Maximum aus kuerzester natuerlicher Spalte
und groesster Mindesthoehe und setzt allen Spalten diese Hoehe. Flexbox
verteilt den Fehlbetrag danach proportional - jede Karte gibt ein wenig ab,
keine alles. Die Kalender-Karte bekommt dadurch automatisch die vom Nutzer
gewuenschte feste Hoehe mit Innen-Scroll; ihr `mw-footer` bleibt unter der
scrollenden Liste stehen, weil nur `.hie-list` flext.

**⚠ Zwei Fallen, die Messungen unbrauchbar machen:**
1. **`align-items:stretch` macht die Rechnung zum No-Op.** Mit stretch sind
   alle Zonen schon vor der Messung gleich hoch, `Math.min(...natuerlich)`
   ist dann der Maximalwert und es wird nichts angeglichen. Das Grid steht
   deshalb auf `align-items:start`, die Hoehe kommt ausschliesslich aus JS.
   `equalizeDashColumns()` setzt `z.style.height=''` VOR dem Messen zurueck,
   sonst misst der zweite Aufruf die selbst gesetzte Hoehe.
2. **Gegen das letzte INHALTS-Element messen, nie gegen den Container.** Eine
   erste Pruefung meldete faelschlich "17 px, alles gut" - sie mass gegen das
   letzte Kind von `.dw-body`, und das ist die gestreckte Liste selbst. Der
   Leerraum sass INNERHALB der Liste. Ein Filter auf Blatt-Elemente
   (`children.length===0`) ist ebenfalls falsch: ein Absatz mit `<b>` darin
   faellt heraus und meldet Phantom-Luecken von 34-64 px. Richtig: letztes
   sichtbares direktes Kind von `.dw-body` gegen dessen Unterkante.

Gemessen ueber 1920/1600/1440/1180: **Spalten-Differenz 0 px, Restluecke im
Karten-Body 0 px in JEDER Karte, jede Liste vollstaendig gerendert** (auch die
Bottom-Zone: drei Karten je 302 px). Unter 1100 px stapelt das Dashboard
weiterhin einspaltig - alle Regeln stehen im bestehenden `@media`-Block.

### Marmor v4: heller, frischer, weisser (Nutzer-Wunsch 2026-08-14)

Nur die Parameter des Generators (`marble_gen.py`, Scratchpad) veraendert, die
Technik bleibt: Grundton 246 → **251,5**, Wolkigkeit 5,0 → **3,0**, Aderkern
40/15 → **24/7**, zweites Adernsystem 26/9 → **15/4,5**, Verzweigungen 18 →
**8**, Korn ±1,2. Dazu im CSS der obere Lichtschein kraeftiger
(`rgba(255,255,255,.55)` → `.72`) und der graue Fleck unten rechts schwaecher
(`rgba(120,130,142,.10)` → `rgba(132,142,155,.07)`).

Ergebnis: 132 KB base64 statt 156 KB (weniger Kontrast komprimiert besser) -
die Datei schrumpft dadurch trotz gleicher Bildgroesse. Der Marmor liest sich
jetzt als moderne weisse Platte mit angedeuteter Aderung statt als grauer
Stein. Einfaerbung weiterhin ueber `background-blend-mode:multiply` gegen
`var(--bg0)`, das PNG selbst bleibt Graustufen.

### Marmor-Hintergrund ersetzt: Dot-Grid + Farblicht statt Naturstein (Nutzer-Wunsch 2026-08-15)

Nutzer: "Ich will das modern also nicht einfach irgendwelche Streifen" - der
Marmor (egal wie zart die Adern gezogen waren, siehe v2-v4 oben) liest sich
fuer den Nutzer als "Streifen", nicht als modern. Statt an der Marmor-Technik
weiterzudrehen: komplett andere Richtung.

**Vier echte Alternativen verglichen**, nicht nur behauptet - Playwright-
Screenshots MIT ausgeblendeten Dashboard-Karten (`visibility:hidden` auf
`#dashWidgets`/`.hdr`/`.tabbar`), weil Karten den Hintergrund grossteils
verdecken und Unterschiede sonst nicht beurteilbar sind:
1. Reine Lichtfeld-Gradienten (mehrere grosse `radial-gradient`-Flecken) -
   zeigten sichtbare KONZENTRISCHE RINGE (Mach-Band-Artefakt: der Browser
   quantisiert einen sehr grossen, kontrastarmen Farbverlauf in sichtbare
   Stufen). Sah wie ein Rendering-Fehler aus, nicht wie Absicht.
2. Flaches Papier (fast reines Weiss) - kein erkennbarer Charakter.
3. **Dot-Grid** (20px Punktraster, `radial-gradient(circle at 1px 1px,...)`
   als wiederholtes Kachelmuster) + zwei sanfte Farblicht-Flecken - klar
   modernstes Ergebnis, direkt am SaaS-Dashboard-Vokabular (Linear/Notion/
   Vercel) statt an Naturstein orientiert.
4. Mesh-Gradient (mehrere ueberlappende `radial-gradient`-Kreise, weich
   ineinanderlaufend) - haette funktioniert, hatte aber dieselben Banding-
   Ringe wie Variante 1 an den weichen Uebergaengen.

**Gewaehlt: Variante 3.** Vier Ebenen: zwei grosse, sehr sanfte Farbflecken
(Blau oben-links `rgba(196,219,247,.60)`, Violett unten-rechts
`rgba(228,216,247,.42)`), ein `radial-gradient`-Dot-Grid (20px Kachel, Punkt-
Deckkraft nur .28) darueber, ein flacher Grundverlauf (`#ffffff`→`#f5f8fb`)
darunter, ganz oben ein 160×160-Korn-PNG (Zufallsrauschen, per `zlib`+
`struct` in reinem Python erzeugt wie beim Marmor, `background-blend-
mode:multiply`).

**Das Korn ist kein Deko-Extra, sondern die Loesung fuer das Banding-
Problem aus Variante 1/4:** feines Rauschen dithert einen Farbverlauf -
bricht die diskreten 8-Bit-Stufen des Browser-Renderings visuell auf, bevor
sie als Ring sichtbar werden. Genau dieselbe Rolle wie das Korn beim Marmor
v3/v4 oben, hier aber zusaetzlich gegen ein anderes Artefakt (Banding statt
Kachel-Wiederholung).

Reines Rauschen ist von Natur aus nahtlos kachelbar (keine raeumliche
Korrelation zwischen Pixeln), 160×160px wiegt daher nur ein Zwanzigstel
eines Vollbild-Korns bei identischer Wirkung.

Ersetzt exakt dieselbe eine `background-image:...background-blend-mode:...;`
Deklaration in `body{...}` wie die Marmor-Versionen davor. Kein Score-/
Daten-Bezug, reine Optik.

### Marmor v5: zurueck zum Stein, aber grau/weiss und ohne Streifen-Wirkung (Nutzer-Wunsch 2026-08-15)

Nutzer nach dem Dot-Grid: "Doch keine Punkte ich fand den Marmor Look gut aber
moderner wie so ein Kunst Boden" und danach "Mach nur grau und weis Toene nicht
bunt such im Internet nach modernen simplen schlichten Designs".

**Recherche-Ergebnis** (Referenzen 2026): der als minimalistisch geltende
Marmor ist **Bianco Dolomite** - helles Weiss mit WENIGEN zarten grauen Adern
("delicate gray lines that add just enough character without overwhelming").
Gegenprobe war **Microcement** (fugenlos, ganz ohne Adern - "no joints, no
breaks, no visual interruptions") und Terrazzo in Grau. Alle drei gebaut und
am echten Dashboard verglichen: Microcement zu leer (kein Charakter), Terrazzo
wird beim `cover`-Skalieren fleckig, Bianco Dolomite gewinnt klar.

**⚠ Der eigentliche technische Fehler aller frueheren Marmor-Versuche:** die
Adern kamen aus `sin(band + turbulenz)`. Ein Sinus ist PERIODISCH - daraus
entstehen zwangslaeufig viele parallele Adern, und genau das liest sich als
"Streifen". Kein Parameter-Tuning konnte das beheben, weil es an der Formel
lag. Jetzt wird jede Ader als EINZELNER Pfad gelaufen und gestempelt (Random
Walk mit rauschgestoerter Richtung, dann Kern + weicher Halo pro Pfadpunkt):
drei Adern sind wirklich drei Adern, kein Musteranfang.

**Zwei Fallen dabei, die im ersten Anlauf zuschlugen:**
1. **Der Winkel darf NICHT akkumulieren.** `ang += fbm(...)*wobble` ist ein
   Random Walk - die Richtung driftet unbegrenzt, die Ader rollt sich zu
   Schlaufen ein und sah aus wie Gekritzel. Richtig ist `ang = ang0 +
   fbm(...)*wobble`: der Winkel PENDELT um die Grundrichtung, die Ader laeuft
   ueber die Platte.
2. **Aeste brauchen einen flachen Abzweigwinkel** (`ang0 +- 0,22..0,5 rad`).
   Ein freier Zufallswinkel liess den Ast zurueck ins Bild laufen und sich mit
   der Mutterader verschlingen. Echte Adern gabeln spitz.

**Graustufen-PNG statt RGB** (820x512, ~150 KB base64): die Textur ist ohnehin
farblos, Graustufe braucht ein Byte statt drei pro Pixel. Kein `multiply`-Blend
mehr noetig - das Bild traegt die Endhelligkeit direkt (Grundton 247,5), damit
die weissen Karten weiterhin abheben. Generator: `stone_gen.py` im Scratchpad.

**Merksatz:** bei einer prozeduralen Textur zuerst fragen, ob die WIRKUNG
(hier: "Streifen") aus den Parametern kommt oder aus der Formel. Periodische
Funktionen erzeugen periodische Ergebnisse - dagegen hilft kein Nachjustieren,
nur ein anderes Verfahren.

### Asset-Symbolsatz: echte Flaggen/Materialien mit Dauerbewegung (Nutzer-Wunsch 2026-08-15)

Nutzer: "es gibt ja fuer jedes Asset so eine Art icon also die Flagge oder das
Symbol [...] richtig hochwertig neu Designst und es realistisch aussehen laesst
und eine Dauer Animation hinzufuegst die die Flaggen wehen laesst oder zB das
Oel Symbol tropfen [...] und in den Einstellungen soll man die Option haben die
Animationen zu deaktivieren." Nach dem Ansehen der Vorschau: "die Animationen
sind kantig mach das fluessiger und bischen schneller bei den Flaggen".

Ersetzt `FX_FLAG` (Emoji) und die generischen Strich-Icons aus
`nonFxWatchIconHtml`. `FX_FLAG` bleibt als Datenquelle bestehen, gerendert wird
`assetIconHtml(id, px)`. Alle Motive liegen einmal als `<symbol>` in einem
unsichtbaren `<svg id="aiDefs">`, das beim ersten Icon-Bau in den Body kommt
(`aiEnsureDefs`) - die Icons selbst sind nur `<use>`.

**⚠ Die Performance-Lehre, die diese Umsetzung geformt hat (GEMESSEN):**
Ein animierter `transform` auf einer SVG-`<g>` wird von Chromium NICHT auf der
GPU zusammengesetzt, sondern erzwingt Neuzeichnen. Mit 10 Streifen auf allen
~19 gleichzeitig sichtbaren Icons (190 animierte Gruppen) fiel das Dashboard
von konstant 61 fps auf **Median 47 mit Einbruechen auf 29**; ohne die
Streifenwelle waren es 61 in 5 von 5 Messungen. `will-change:transform` und
`contain:paint` auf dem Wrapper wurden beide gemessen und aenderten **nichts**.
Auf einer nackten Testseite mit denselben 20 Flaggen lief alles mit 60 fps -
die Kosten entstehen erst im Zusammenspiel mit dem grossen Hintergrundbild und
den Karten-Schatten der App. **Loesung:** die Streifenzahl haengt an der
ANZEIGEGROESSE (`AI_BIG_MIN_PX`=20) - Listen-Icons (17-18px) bekommen 4
Streifen, die grossen am Asset-Kopf 10. Danach 61 fps in 8 von 8 Messungen,
exakt wie mit abgeschalteter Animation. Bei kuenftigen SVG-Animationen zuerst
diese Frage stellen, nicht erst nach dem Ship.

**Merksatz zur Messmethodik:** die ersten fps-Messungen schwankten zwischen 29
und 61 und liessen sich nicht deuten. Erst ein ABWECHSELNDER A/B-Test in
derselben Sitzung (8x an, 8x aus im Wechsel, dann Mediane) trennte Signal von
Rauschen - "aus" lag dabei 8-mal exakt auf 61, "an" streute. Einzelmessungen
oder Bloecke nacheinander sind in dieser Sandbox wertlos.

**Wie das Wehen entsteht:** senkrechte Streifen (clipPath) mit versetztem
NEGATIVEM `animation-delay`, dadurch laeuft eine Welle durchs Tuch. Drei
Details, ohne die es nicht wie Stoff aussieht:
1. **Die Amplitude waechst von der Stange zum freien Ende** (`--ai-amp`).
   Gleiche Amplitude ueber die Breite sieht aus wie ein wackelndes Rechteck.
2. **Fenster und Inhalt sind zwei geschachtelte Gruppen.** Liegen `clip-path`
   und `transform` auf demselben Element, wandert das Fenster mit - dann laesst
   sich der Streifen nicht kippen, ohne dass keilfoermige Luecken aufreissen.
3. **Das Kippen folgt der Steigung der Welle** (Phase um eine Viertelperiode
   versetzt zur Hoehe) und legt die Bruchkanten zwischen den Streifen um - das
   ist der Unterschied zwischen "kantig" und "fluessig". Dazu vier Stuetzstellen
   in den Keyframes statt zwei, sonst interpoliert der Browser linear durch die
   Mitte und die Bewegung knickt sichtbar um. Der Drehpunkt muss die Mitte
   GENAU DIESES Streifens sein, nicht die Flaggenmitte.

**Der Schalter** (`assetAnimEnabled`, Einstellungen -> "Asset symbols") liegt
wie `pinEnabled`/`introAnimEnabled` ausserhalb von `snap()`/Undo und ist an
allen vier Ecken angebunden (Save-Funktion, `cloudPush`, `cloudPull` MIT
`prefPending`-Schutz, Export/Import) - siehe "WICHTIGSTE REGEL" oben. Er setzt
`body.no-asset-anim`; die Symbole bleiben dabei in Ruhelage sichtbar.

**Vier Fehler, die beim Bauen auftraten - nicht neu aufmachen:**
- **`<use>` auf ein `<symbol>` braucht `width`/`height`,** sonst rendert
  Chromium wortlos NICHTS (kein Fehler in der Konsole). Daran waren GBP, AUD
  und NZD zuerst komplett unsichtbar.
- **Das Ahornblatt direkt in 36x24-Koordinaten zu tippen ergab einen Busch** -
  die Rundungsfehler summieren sich bei so kleinen Schrittweiten. Jetzt in
  einer 100x100-Box gezeichnet und per `transform` platziert.
- **Der Metallglanz lief ueber den Barren hinaus** - er braucht einen
  `clip-path` auf die Barren-/Muenzform.
- **Der Barren fuellte die Box nur zu 57% Hoehe** und wirkte neben dem
  34px-Titel zu klein; die Skalierung sitzt AUSSEN um den gesamten Inhalt
  inkl. der geclippten Glanz-Gruppe, damit der clip-path mitwaechst.

**Bewusste Abweichung:** die Schweiz bekommt 3:2 statt des quadratischen
Nationalformats. In Listen stehen die Flaggen in einer Spalte untereinander,
ein schmaleres Icon braeche die Ausrichtung (Grundsatz "alles bleibt exakt
untereinander ausgerichtet"). Die Schweizer Seeflagge hat genau dieses Format.

**Container-Stile mitziehen:** `.atitle-flag`/`.an-flag` trugen `drop-shadow`
bzw. `saturate()` - beides lag auf dem Emoji-GLYPH. Auf dem SVG waeren sie
doppelt bzw. ein teurer Paint-Filter auf einem dauerhaft animierten Element;
beide entfernt. `.wl-icons` musste von 48px auf 60px wachsen, weil zwei
17px-Flaggen breiter sind als zwei Emoji.

Selbst angelegte Assets ohne eigenes Motiv fallen weiterhin auf das
Research-Ordner-Icon zurueck (`nonFxWatchIconHtml`).

### Animationen app-weit, vierfach abschaltbar, ohne Bildraten-Verlust (Nutzer-Wunsch 2026-08-15)

Nutzer auf die Rueckfrage nach dem Umfang: "Alles aber mach auch alles
abschaltbar in den Einstellungen und mach das es keine Performance Probleme
gibt."

**Die drei Ziele gehen nur zusammen, wenn die Technik PRO ELEMENTTYP gewaehlt
wird.** Vor jeder Entscheidung wurde gemessen, nicht geschaetzt:

1. **Stueckzahlen zuerst zaehlen.** Die Befuerchtung war, dass Massen-Icons
   (Stern an ~250 Indikator-Zeilen) Dauerbewegung unbezahlbar machen. Gemessen
   ueber alle Tabs: max. **10 Glocken**, sonst **1-2 je Sorte** gleichzeitig
   sichtbar. Der Stern ist gar kein `icn()`-Icon, sondern ein Emoji im
   Notes-Tab, und die Chevrons stecken in `::after`-Regeln. Damit war
   Dauerbewegung fuer alle 19 Bedien-Icons bezahlbar - die Annahme war falsch,
   die Messung hat sie widerlegt.
2. **⚠ Animiert wird das `<svg>`-ELEMENT, nicht eine `<g>` darin.** Das ist der
   ganze Unterschied zu den Flaggen: ein `<svg>` ist im HTML-Fluss ein
   ersetztes Element, sein `transform` wird auf der GPU zusammengesetzt; ein
   `transform` auf einer Gruppe DARIN wird es nicht (siehe die
   Asset-Symbol-Notiz oben, dort von 61 auf 29 fps gemessen). Deshalb hier kein
   Streifen-Trick, sondern schlichte Transforms auf dem Icon selbst.
3. **Einmal-Animationen brauchen ein Tor.** Balken-Einwachsen und
   Karten-Einblenden haengen an `body.anim-enter`, das `showTab()` fuer 900ms
   setzt. Ohne dieses Tor wuerden sie bei JEDEM Neu-Render neu starten -
   Dashboard/Matrix/Kalender bauen sich minuetlich neu auf, die Seite wuerde
   also im Minutentakt zucken. Das Tor haengt am TABWECHSEL, nicht am Rendern.

**Ergebnis:** 61 fps in 8 von 8 A/B-Messungen mit allem an, identisch zum
abgeschalteten Zustand; 61 fps auf jedem einzelnen Tab (Dashboard mit 112
sichtbaren Dauerschleifen, Kalender 29, Rest ~20). Zusaetzlich haelt
`body.anim-paused` (`visibilitychange`) im Hintergrundfenster jede Schleife an -
der Browser drosselt zwar selbst, aber nicht bei einem sichtbaren Fenster auf
einem zweiten Bildschirm.

**Bewegung folgt der Bedeutung, nicht einem Einheits-Puls:** Glocke schwingt an
ihrer Aufhaengung (`transform-origin:50% 15%`, nicht Mitte), Zahnrad/Refresh/
Globus drehen unterschiedlich schnell, Lupe tastet ab, Blitz/Flamme flackern,
Pfeile schieben, Karten-Icons atmen. Dazu reagiert jedes Icon auf Beruehrung -
das kostet nichts, solange niemand hinfasst.

**`icn()` haengt den Namen als Klasse an** (`ic ic-bell`). Erst dadurch laesst
sich ein einzelnes Icon per CSS beleben, ohne die ~200 Aufrufstellen
anzufassen. Die vier Header-Icons stehen als statisches SVG im HTML (dort
laeuft `icn()` nicht, siehe bestehende Konvention) und haben ihre Klassen
direkt bekommen.

**Vier Schalter statt einem** (Einstellungen): Intro, Asset-Symbole, Interface,
Daten - plus einer, der alle auf einmal umlegt ("Turn all off"). Jeder folgt
dem Vier-Ecken-Muster (Save-Funktion, `cloudPush`, `cloudPull` MIT
`prefPending`-Schutz, Export/Import). Der Sammelschalter ruft bewusst die
Einzel-Toggles auf, statt eigene Logik zu haben - sonst laufen die
Sync-Pfade auseinander.

**Merksatz zur Messmethodik (zum zweiten Mal bestaetigt):** Einzelmessungen der
Bildrate sind in dieser Sandbox wertlos - dieselbe Konfiguration lieferte 29
bis 61. Nur ein ABWECHSELNDER A/B-Test in derselben Sitzung (8x an, 8x aus im
Wechsel, dann Mediane) trennt Signal von Rauschen.

### ⚠ Doppelt eingefuegter HTML-Block legte das Code-Feld lahm (Bugreport 2026-08-15)

Nutzer: "wenn ich die Seite oeffne lande ich beim Code Feld kann da aber Nix
eingeben." Ausgeliefert war das mit VERSION-CHECK-375.

**Ursache:** beim 375er-Commit landete ein 107-Zeilen-HTML-Block ein zweites
Mal in der Datei (Zeilen 2800-2906, wortgleich zu 2907-3013). Damit stand der
**Sperrbildschirm ZWEIMAL im Dokument** - beide sichtbar, uebereinander.
Getippt wurde auf den oberen, aber `getElementById('lockDots')` liefert immer
den ERSTEN Treffer: die Punkte fuellten sich unsichtbar im unteren, der
sichtbare blieb leer. Fuer den Nutzer sieht das aus, als nehme das Feld nichts
an. Gemessen und gegenuebergestellt: kaputt = 2 Sperrbildschirme, Punkte im
unteren; repariert = 1 Sperrbildschirm, Punkte erscheinen. Dieselbe
Verdopplung traf 19 weitere ids (Header-Statusleiste, Intro-Cockpit,
Boost-Modal, Versions-Banner).

**⚠ Warum keine der bestehenden Pruefungen das gefangen hat - das ist die
eigentliche Lehre:**
- `node --check` war **gruen**, weil das JavaScript voellig gueltig blieb. Ein
  doppelter HTML-Block ist kein Syntaxfehler.
- `bughunt.js` und `layoutaudit.js` liefen daran **vorbei**, weil sie den
  Sperrbildschirm beim Start entfernen (`['introOv','lockScreen'].forEach(...remove())`),
  um an die App zu kommen. Der Fehler lag exakt in ihrem blinden Fleck.
- Ein Bisect gegen aeltere Staende fuehrte zunaechst in die Irre: dort war das
  Keypad AUCH nicht anklickbar - aber nur, weil die Intro-Ebene planmaessig
  davor liegt, solange man nicht "Skip" drueckt. Erst der Test MIT
  abgeschalteter Intro (`fxpro_intro_anim_enabled=0`, die Lage des Nutzers)
  trennte den echten Fehler vom Normalzustand.

**Neu: `structcheck.js`** (Scratchpad) meldet doppelte ids und woertlich
wiederholte 40-Zeilen-Bloecke. Gegen den kaputten Stand gegengeprueft: 19
Treffer plus die Blockdopplung. Gegen den reparierten: still. **Gehoert ab
jetzt vor JEDEN Push von index.html**, zusaetzlich zum JS-Syntax-Check - der
allein reicht bei einer Ein-Datei-App nachweislich nicht.

**Merksatz:** ein Pruefskript, das ein Element ENTFERNT, um an den Rest zu
kommen, kann in genau diesem Element keinen Fehler mehr finden. Bei jedem
Audit mitdenken, was es wegraeumt - und diesen Bereich separat pruefen.

### Dashboard-Ueberlapp, Icon-Ausrichtung und Ueberschriften-Rangfolge (Nutzer-Bugreport 2026-08-16)

**(1) Die untere Kartenreihe wurde von den Spalten darueber ueberlappt.**
Ursache: `equalizeDashColumns()` setzt den vier Spalten-Zonen eine gemeinsame
`height` - die Zonen waren aber `display:block` mit `align-content:start`.
In einem Block kann der Inhalt eine gesetzte Hoehe gar nicht einhalten, er
laeuft schlicht heraus. An JEDER getesteten Breite reproduziert (Ueberlauf
128-298px). Die `.dw-shrink`-Karten konnten nie schrumpfen, weil ihr Elternteil
kein Flex-Container war - die `need`-Rechnung ging von einem Minimum aus, das
das Layout gar nicht herstellen konnte.

Zwei Aenderungen:
- Die Zonen sind jetzt echte Flex-Spalten (`display:flex;flex-direction:column`).
  **Nur** die als schrumpfbar markierten Karten geben nach (`flex:0 1 auto` -
  schrumpfen ja, wachsen NIE; Wachsen war die Ursache der frueheren weissen
  Luecken). Alle uebrigen stehen auf `flex:0 0 auto`, sonst quetscht der
  Fehlbetrag auch Karten zusammen, die ihren Inhalt nicht scrollen koennen.
- `equalizeDashColumns()` **misst nach dem Setzen selbst nach**
  (`scrollHeight` gegen `clientHeight`), korrigiert einmal nach und nimmt die
  Hoehe sonst ganz zurueck. Merksatz: ungleich lange Spalten sind haesslich,
  ueberlappende sind kaputt - im Zweifel gewinnt die Korrektheit.

**Neu: `dashcheck.js`** (Scratchpad) prueft 8 Breiten auf paarweise
Kartenueberlappung UND Zonen-Ueberlauf, Exit 1 bei Befund. Gehoert wie
`structcheck.js` vor jeden Push. `layoutaudit.js` hat das NICHT gefunden, weil
es auf Seiten-/Karten-Ueberlauf prueft, nicht auf zwei Karten, die sich
gegenseitig ueberdecken.

**(2) Das Asset-Icon sass 7px zu tief.** `.atitle` war ein Block, das Icon
haing an `vertical-align` - und `.atitle-flag` wie `.ai-wrap` schoben es BEIDE
nach unten. Jetzt ist `.atitle` eine Flexbox mit `align-items:center`: Versatz
gemessen 0px, ohne Zahlenraterei, und es haelt auch, wenn sich Schrift- oder
Icongroesse aendert. **Merksatz:** ein Icon neben Text nie ueber
`vertical-align` einpassen - der Wert stimmt nur fuer genau eine Kombination
aus Schriftgroesse und Iconhoehe. Der Container richtet aus, nicht das Icon.
Die Symbole sind zugleich praesenter: 34 statt 26px im Asset-Kopf, 26 statt
22px im Research-Bereich.

**(3) Die Ueberschriften-Rangfolge war invertiert.** Gemessen: Rubrik-Titel
Gewicht **800**, uebergeordneter Asset-Titel nur **600** - das Kind war fetter
als der Elternteil. Ausserdem lagen 20px (Rubrik) neben der dokumentierten
Sieben-Stufen-Skala. Jetzt monoton fallend in Groesse UND Gewicht:
Asset-Titel 38/700 -> Rubrik 22/650 (`--fs-xl`) -> Untertitel 13/500 ->
SUMMARY-Label 10/700 (Versalien, als Label bewusst kraeftig).

### Wo die App tatsaechlich liegt (zwei Adressen, unterschiedlicher Zweck)

- **Cloudflare Worker (die geschuetzte Hauptadresse):**
  `https://fx-final.jonathan-fa5.workers.dev` - liegt hinter Cloudflare
  Access, beim Oeffnen kommt zuerst die E-Mail-Code-Abfrage
  (`jonathan.brinkmann@icloud.com`), danach die App.
- **GitHub Pages:** `https://jo-brxxn.github.io/FX-final/` - ungeschuetzt,
  wird direkt aus `main` ausgeliefert.

Der Unterschied ist nicht nur kosmetisch, er steckt auch im Code: `DATA_BASE`
(bei `const SK='fxpro_v1'`) liest die Daten-JSONs auf GitHub Pages und lokal
RELATIV (dort liegt immer der aktuelle Branch-Stand), auf jeder anderen
Herkunft - also auch auf der Cloudflare-Adresse - dagegen direkt von GitHubs
raw-Endpunkt. Grund: Cloudflare baut nur bei einem Push neu, der stuendliche
Daten-Workflow braucht aber ~720 Pushes/Monat und der freie Plan erlaubt 500
Builds - ohne diese Weiche laege dort ein veralteter Snapshot.

⚠ Die URL steht NIRGENDS im Repo (keine `wrangler.toml`, keine CNAME-Datei) -
deshalb hier notiert. Falls sie doch mal fehlt: Cloudflare Dashboard →
Workers & Pages → `fx-final` → Domains & Routes.

### Telegram-Hauptschalter + Ausloeser in der Score-Flip-Nachricht (Nutzer-Wunsch 2026-08-16)

**⚠ Der Schalter musste SERVERSEITIG wirken, nicht in der App.** Der naive Weg
waere ein `if(!telegramEnabled)return;` in `queueScoreFlipAlert()` gewesen -
das haette NICHTS bewirkt: der Browser legt nur die Inbox-Nachricht an, der
tatsaechliche Telegram-Versand laeuft komplett auf dem GitHub-Runner
(`event-alerts.yml` liest `eventAlerts`/`priceAlerts` aus der Supabase-
`fx_sync`-Tabelle, `morning-report.yml`/`weekly-report.yml` senden ganz ohne
App-Zutun). Ein Schalter, der nur im Browser greift, haette den Nutzer
glauben lassen, es sei aus - und das Handy haette weiter gebrummt.

`telegramEnabled` folgt dem Vier-Ecken-Muster (Save-Funktion bumpt
`fxpro_updated`+`_lsUpdatedSeen`+`markPrefEdit()`+`cloudAutoSync()`,
`cloudPull()` mit `!prefPending`-Guard, Export/Import) und geht damit ueber
`cloudPush()` automatisch in denselben `data`-Datensatz, den die Workflows
ohnehin lesen. Kein neues Secret, keine neue Tabelle, kein neuer Endpunkt.

Drei Sendestellen, zwei Muster:
- **`event-alerts.yml`** liest die Sync-Zeile ohnehin schon (fuer
  `eventAlerts`) - dort genuegt ein frueher `return` in `main()`, direkt
  nachdem `syncRows` da ist.
- **`morning-report.yml` / `weekly-report.yml`** lesen `fx_sync` gar nicht
  (der Morgenbericht baut sich rein aus den Repo-JSONs). Beide bekommen
  einen eigenen Schritt `id: tg`, der die Zeile liest, und ihr Sendeschritt
  haengt zusaetzlich an `steps.tg.outputs.on != 'false'`.

**Die Fehlrichtung ist bewusst "senden":** fehlen die Secrets, ist die Cloud
nicht erreichbar oder liefert sie Unsinn, wird gesendet
(`d.get('telegramEnabled') is False` - nur ein ausdrueckliches `false`
schaltet ab, `None`/fehlend nicht). Ein Netzwerkfehler darf keine Meldung
verschlucken; ein einmal zu viel gesendeter Bericht ist harmloser als ein
verpasster Alarm.

**Der Ausloeser in der Flip-Nachricht kommt aus derselben Quelle wie die
History-Karte** (`symScoreDrivingEventsByDate()` + `indBiasFromEvent()`),
nicht aus einer zweiten Rechnung - `flipCauseLines()` uebernimmt sogar deren
Vergleichs-Beschriftungen (`vs X (21d avg)` bei Bonds, `(prev X%)` bei COT,
nichts bei Sentiment, sonst `(fc X)`). Bewusst so: eine eigene Auswahllogik
waere die vierte Implementierung derselben Prioritaetsregel gewesen und haette
frueher oder spaeter etwas anderes gezeigt als die Karte selbst (siehe die
Dual-Source-Eintraege oben).

Zwei Ehrlichkeits-Regeln darin:
1. **Zeigt kein Treiber in die Richtung des Flips, heisst die Ueberschrift
   `Latest score drivers:` statt `Driven by:`.** Beim Test kippte EUR auf
   bearish, waehrend beide gefundenen Treiber bullisch waren (der Flip kam
   aus dem Zusammenspiel, nicht aus einem einzelnen Ereignis) - `Driven by:`
   waere dort schlicht falsch gewesen.
2. **Kein score-treibendes Ereignis = gar kein Zusatz** (an DAX geprueft,
   liefert korrekt `[]`), statt eine Begruendung zu erfinden.

Gemessene Beispiele (echte Daten):
```
📊 USD (USD) flipped to BEARISH - score -5.7 (was NEUTRAL).

Driven by:
▼ 2Y Bond Yield 4.171% vs 4.228% (21d avg)
▲ 10Y Bond Yield 4.692% vs 4.675% (21d avg)
```

**Merksatz:** bei jedem neuen Schalter zuerst fragen, WO die abzuschaltende
Wirkung tatsaechlich entsteht. Alles, was ein Workflow tut, laesst sich nur
im Workflow abschalten - die App kann dafuer bestenfalls das Flag
transportieren.

**Nebenbefund am Test-Werkzeug (kein App-Bug):** `bughunt.js` meldete einen
Phantom-Fehler, weil es `applySnap(JSON.parse(snap()))` aufrief - `applySnap`
erwartet den STRING und parst selbst. Nach der Korrektur blieb eine echte,
aber harmlose Abweichung: `applySnap` ruft `migrateDash()`, das `dashV`
einmalig von 0 auf `DASH_V` hebt. Der Test prueft jetzt Stabilitaet AB dem
ZWEITEN Durchlauf. Bei kuenftigen "roundtrip nicht idempotent"-Meldungen also
zuerst pruefen, ob eine Migration einmalig zuschlaegt, bevor ein Bug gesucht
wird.

### ⚠ Forecastlose Indikatoren behielten ihren Bias FUER IMMER (Bugreport 2026-08-16, Score-Fehler)

Nutzer schickte einen Screenshot der AUD-History und schrieb "das ergibt
keinen Sinn". Dahinter steckten drei Fehler - einer davon im Score selbst.

**Der Score-Fehler:** ein Indikator OHNE Forecast wurde nie wieder
korrigiert. Zwei Tore verriegelten sich gegenseitig:
- die Bias-Selbstheilung in `applyIndDataFeed()` haengt an `nf!=null`,
  laeuft also nur MIT Forecast;
- der Ersatzweg `applyTrendModel(ind,nf==null,/*allowBiasReplace*/false,sig)`
  wendet das Step-Signal nur an, wenn `allowBiasReplace||ind.bias==='neu'
  ||ind.stepDriven`.

Ein Indikator mit einem alten, nicht-neutralen Bias, der nie step-getrieben
war, fiel durch JEDEN Zweig. Er behielt seinen Wert dauerhaft - und weil
`stepDriven` dabei nie gesetzt wurde, mit **vollem** Gewicht statt der
dokumentierten halben Step-Wirkung. Doppelt falsch: Richtung UND Groesse.

Gemessen an den echten Daten, 14 Faelle - u.a. AUD Services PMI auf bearish,
obwohl der Wert von 50,5 auf 53,6 gestiegen war; AUD Retail Sales auf bearish
ganz ohne Vergleichswert; CHF Manufacturing PMI und JPY GDP auf bullish ohne
Grundlage. Score-Wirkung: **AUD -2,0 → +0,4** (Vorzeichenwechsel), GBP 5,2 →
2,3, CHF 2,5 → -0,1, EUR -3,7 → -2,4.

Fix: das dritte Argument am Feed-Aufruf auf `true`. Es wirkt ausschliesslich
im `noForecast`-Zweig (mit Forecast ignoriert `applyTrendModel` es ohnehin).
**Der Schutz einer MANUELLEN Wahl haengt NICHT an diesem Flag**, sondern an
`indBiasPinned(ind,sig)`, das in `applyTrendModel` ZUERST geprueft wird -
verifiziert, dass ein manueller Bias den automatischen Lauf weiterhin
ueberlebt.

**Merksatz:** wenn zwei Pfade sich einen Zustand teilen und jeder annimmt,
der andere kuemmere sich, kuemmert sich keiner. Bei JEDEM Guard, der eine
Korrektur ueberspringt, pruefen, ob fuer den uebersprungenen Fall
tatsaechlich eine ANDERE Instanz zustaendig ist - hier lief die
"Selbstheilung" seit ihrer Einfuehrung an genau den Indikatoren vorbei, die
sie am noetigsten hatten.

### ⚠ Die History darf Richtung und Effekt NIE selbst berechnen (selber Bugreport)

Zwei weitere Fehler, beide dieselbe Ursache: das History-Fenster hat die
Zahlen nachgerechnet, statt sie aus der Score-Rechnung zu uebernehmen.

1. **Der Effekt war hartcodiert `±1`** (`b==='bull'?'+1':...`) und ignorierte
   das Gewicht komplett. Gemessen: **68 von 220** Indikatoren mit falscher
   Groesse - Bonds, Core-Paare, COT-Netto und CB Tone sind Halbgewicht, im
   Modus `normalized` kommt der Normierungsfaktor obendrauf.
2. **Die Richtung wurde neu klassifiziert.** Der Live-Bias fuer Anleihen ist
   SMA5 gegen SMA21 mit `BOND_DEAD_BAND`=3 Basispunkten; die History verglich
   den Tageswert direkt gegen die SMA21 OHNE Totzone. **13 von 220** Zeilen
   behaupteten dadurch einen Treiber, dessen echter Beitrag exakt 0 ist. Im
   gemeldeten Screenshot: 10Y 4,987 % gegen 4,978 % sind 0,9 Basispunkte -
   der Score fuehrt das als neutral, die History schrieb "▲ +1".

`symScoreDrivingEventsByDate()` heftet jetzt jedem Event `sc` (echter Beitrag
aus `indScoreParts`) und `scBias` (Vorzeichen dieses Beitrags) an; alle
Verbraucher (`renderSymHistoryPanel`, `renderSymHistory`, `symHistoryDays`,
`flipCauseLines` fuer Telegram) lesen ueber `histEvtBias(ev)`/`ev.sc`. Damit
kann die Anzeige der Rechnung strukturell nicht mehr widersprechen.

**⚠ Das Kalender-Event MUSS kopiert werden** (`Object.assign({},ev,meta)`) -
`findIndEvent()` liefert ein Objekt direkt aus `calEvts`; es anzureichern
wuerde den gemeinsamen Kalender-Datensatz veraendern. Als Testfall im
Verifikationsskript verankert (`calEvtsSauber`).

Zeilen ohne Wirkung bleiben sichtbar, zeigen aber `0` mit neutraler Raute und
einer echten Begruendung im Tooltip (`histZeroReason`: Totzone / veraltet /
display-only / kein klares Signal) - eine Zeile verschwinden zu lassen waere
genauso irrefuehrend wie einen Treiber zu erfinden.

**Gespiegelte Non-FX-Karten drehen bei `inverse` zusaetzlich das Vorzeichen**
(`pushForInd(...,sign)`): fuer GOLD ist ein heisser US-Inflationswert bearish.
Vorher zeigte die History dort unveraendert die USD-Richtung. Verifiziert:
USD PPI -0,33 bearish → GOLD PPI +0,33 bullish.

**Merksatz (zum wiederholten Mal, jetzt strukturell geloest):** das
Tages-Badge neben dem Datum ist der GESAMTSCORE dieses Tages aus `scoreHist`,
die Zeilen darunter sind einzelne Beitraege - das eine ist nie die Summe des
anderen. Wer hier etwas ergaenzt, uebernimmt Richtung und Zahl aus
`indScoreParts`/`ind.bias` und klassifiziert NIE selbst.

**Offener Nebenbefund (nicht in diesem Fix, VOR der Aenderung genauso
vorhanden - per `git stash` gegengeprueft):** `applyIndDataFeed()` meldet bei
JEDEM Lauf `changed=true`, weil 42 Non-FX-Indikator-Biases zwischen
`deriveMacroBiasAll()` (setzt sie) und `resetNonFxIndBias()` (raeumt sie ab)
hin- und herpendeln. Das verfaelscht keinen Score (Non-FX scort ueber den
Rubrik-Bias), loest aber stuendlich einen unnoetigen Save + Cloud-Push aus.

### ⚠ SCORE_MODEL_VERSION-Bump gehoert in DENSELBEN Commit wie die Formel-Aenderung (2026-08-16)

Der Score-Fix (V379) hat die Zahlen deutlich verschoben, die Versionsnummer
blieb aber auf 1. Folge im History-Fenster: der heutige Wert aus dem
KORRIGIERTEN Modell stand direkt neben den Vortagen aus dem ALTEN (AUD -0,8
gegen +2,4 / +3 / +3,1), ohne dass irgendetwas den Unterschied kenntlich
machte. Der Nutzer hat das zu Recht als "ergibt keinen Sinn" gemeldet - der
Sprung war der Modellwechsel, kein Marktereignis.

Aufgezeichnete Tage aus einem frueheren Modell werden **weder geloescht noch
umgerechnet**: sie bleiben unveraendert stehen (sie sind echt aufgezeichnet),
aber gedaempft mit Sternchen, Tooltip und Fussnote. Der Trends-Chart bekommt
denselben Hinweis, sobald im Zeitraum Punkte aus beiden Modellen liegen.
`scoreHistEntryCurrent(e)` ist die eine gemeinsame Quelle dafuer.

**Merksatz:** der Bump ist kein Nachtrag. Aendert sich die Formel, gehoert
`SCORE_MODEL_VERSION++` in denselben Commit - sonst vergleicht jede Ansicht,
die eine Reihe zeigt, still zwei verschiedene Rechnungen.

### ⚠ Zwei Funktionen schrieben sich bei JEDEM Feed-Lauf gegenseitig um (2026-08-16)

Gefunden beim vollstaendigen Score-Audit. `applyIndDataFeed()` meldete bei
jedem Lauf `changed=true`, obwohl der Endzustand stabil war - ein
Falsch-Positiv, das stuendlich einen ueberfluessigen Save + Cloud-Push
ausgeloest hat. Zwei unabhaengige Ursachen, beide dieselbe Bauart:

1. **Erstdruck gegen Revision.** `adoptFeedHistory()` schreibt `valHist` aus
   `f.history` - und die Feed-Reihe traegt weiter den ERSTDRUCK.
   `applyRevisionToValHist()` spielt danach die Revision ein. Beim naechsten
   Lauf sah die eingespielte Revision fuer `adoptFeedHistory` wie eine
   Abweichung aus und wurde zurueckgeschrieben, dann wieder eingespielt.
   Gemessen: 6 Indikatoren pro Durchlauf. Fix: die Revision wird ueber
   `reviseValHistArr(nh,f)` schon VOR dem Vergleich auf die neue Reihe
   angewendet - EINE gemeinsame Regel fuer beide Aufrufer statt zwei
   Implementierungen (Dual-Source-Lehre).
2. **Feed-Reihe haengt hinter dem Release.** Kommt ein Wert von einer
   Trading-Economics-Laenderseite, setzt der Workflow `date`/`actual`,
   verlaengert `history` aber NICHT. `trackIndValues()` haengt den neueren
   Punkt lokal an, `adoptFeedHistory()` schnitt ihn beim naechsten Lauf
   wieder ab. Gemessen an JPY GDP Growth QoQ: Reihe endet am 07.06., das
   Release steht auf dem 16.08. Fix: `if(ind.valDate&&nd&&ind.valDate>nd)
   return false;` - eine lokal neuere Reihe wird nicht mehr abgeschnitten.

**Die Scores aendern sich dadurch NICHT** - ueber fuenf aufeinanderfolgende
Feed-Laeufe vor und nach der Aenderung gemessen, identisch. Der Gewinn ist,
dass alle vier Feeds jetzt idempotent sind.

**Merksatz:** wenn zwei Schritte im selben Durchlauf dasselbe Feld schreiben
und der zweite den ersten korrigiert, pruefen, ob der erste beim NAECHSTEN
Lauf die Korrektur als Abweichung liest. Der Endzustand kann dabei voellig
richtig aussehen - der Fehler zeigt sich nur daran, dass jeder Lauf Arbeit
meldet. Messverfahren: die beteiligten Funktionen wrappen und zaehlen, wie
oft sie auf einem STABILEN Zustand noch `true` zurueckgeben (Soll: 0).

### Score-Audit-Werkzeug (2026-08-16)

`score_audit.js` und `dom_audit3.js` im Scratchpad pruefen in BEIDEN Modi:
Additivitaet der Rechenkette ueber alle Indikatoren, Drift des Scores je
geoeffnetem Asset (256 Kombinationen), `_symId`-Stempel nach Boot/`save()`/
`applySnap()`, jeden Indikator-Bias gegen seine eigenen Rohdaten, jedes
Karten-Badge gegen `rubScore` und Schwelle, Idempotenz aller vier Feeds,
sowie im echten DOM Sidebar / Asset-Kopf / Score-Fenster aller Assets und
alle Paar-Scores. **Bei jeder kuenftigen Aenderung an der Score-Logik beide
laufen lassen.**

⚠ Zwei Fallen im Pruefskript selbst, damit sie nicht neu gebaut werden:
`rubScore`/`indScore`/`symScore` RUNDEN auf zwei Stellen - eine Toleranz von
1e-6 meldet dutzende Phantom-Fehler, richtig ist ~0,011 je Stufe. Und der
Score steht am ENDE der Zeile: Namen wie "S&P 500" oder "GER 100" tragen
selbst Ziffern, ein Regex von vorn liest "500" als Score.

### AAII Investor Sentiment Survey (Nutzer-Wunsch 2026-08-16)

Woechentliche Umfrage der **American Association of Individual Investors**
(Non-Profit, Chicago, gegruendet 1978; Umfrage laeuft ununterbrochen seit
**Juli 1987** - eine der laengsten Stimmungsreihen der Finanzwelt). Befragt
werden die eigenen MITGLIEDER, also US-**Privat**anleger, per freiwilliger
Online-Abstimmung auf aaii.com. Genau EINE Frage: Richtung des US-Aktien-
marktes auf Sicht von sechs Monaten - bullish / neutral / bearish.
Umfragewoche Donnerstag bis Mittwoch, Veroeffentlichung donnerstags.

**Gemessen wird der SPREAD** (bullish minus bearish in Prozentpunkten): die
Einzelanteile schwanken stark und "neutral" verzerrt sie. Contrarian gelesen,
Schwellen **+/-20 Punkte**. Bewusst NICHT symmetrisch um null - der
langjaehrige Mittelwert liegt bei rund **+6,5 Punkten** (37,5% bullish gegen
31,0% bearish), die Umfrage ist von Haus aus leicht optimistisch verzerrt.

**Scort NUR S&P 500 und Nasdaq**, halbes Gewicht, nur an den Extremen - wie
jedes andere Sentiment-Mass hier. Die Umfrage fragt ausdruecklich nach dem
AKTIENmarkt; daraus ein allgemeines Risikoappetit-Signal fuer FX/Gold/Krypto
abzuleiten waere eine Interpretation, keine Messung (Grundsatz "nie
schaetzen"). Doppelzaehlung mit VIX ist vertretbar: VIX ist der GEZAHLTE
Optionspreis am Terminmarkt, AAII die BEFRAGTE Erwartung von Privatanlegern -
zwei verschiedene Dinge, beide mit halbem Gewicht.

**Der Workflow-Schritt schreibt nur bei bestandener Summenprobe.** Die drei
Anteile MUESSEN 100 ergeben (Toleranz 98,5-101,5) - das ist der eigentliche
Schutz gegen einen falschen Parse, nicht die Mustertreue. Ohne echtes
Wochendatum von der Seite wird NICHTS geschrieben (kein geratenes Datum, sonst
haengt der Verlauf an einem erfundenen Tag). Bei Nicht-Treffer werden die
Kandidaten und ein Textfenster um "Bullish" geloggt.

**⚠ Der Node-Code steht als HEREDOC-Datei, nicht in `node -e '...'`** - damit
ist die dokumentierte Apostroph-Falle strukturell ausgeschlossen. Bei neuen
Workflow-Schritten mit laengerem JS diese Form bevorzugen.

Gegen synthetische Seiten getestet: gueltige Seite wird geschrieben, Summe
ungleich 100 wird verworfen, fehlendes Datum schreibt nichts. Im Browser
verifiziert: Indikator erscheint auf SP500/NAS und NICHT auf FX, Schwellen
exakt bei +/-20 (19,9 loest nicht aus), Score-Wirkung SP500 -2,6 auf -2,2 bei
simulierter Kapitulation, Leerzustand nennt ehrlich, dass noch nichts da ist.

### ⚠ Der Waechter waechst mit jedem Update mit (2026-08-16)

Zwei neue Regeln in `check/rules.js`, die genau die beiden am haeufigsten
wiederholten Fehlerklassen dieses Projekts mechanisch abfangen:

- **Neue Score-Groesse ohne Pruefung**: fuehrt ein Commit eine Funktion mit
  `Score`/`Bias`/`Weight`/`Norm`/`Strength` im Namen ein, ohne dass eine Datei
  unter `check/` angefasst wurde, bricht der Lauf ab. Bewusst grob - lieber
  einmal zu oft nachfragen als eine Groesse ungeprueft lassen.
- **Neuer persistierter Zustand ohne Sync**: taucht ein neuer
  `fxpro_*`-localStorage-Schluessel auf, ohne dass derselbe Commit `cloudPush`
  UND `cloudPull` beruehrt, bricht der Lauf ab. Bewusst lokale Schluessel
  kommen in die `LOKAL_ERLAUBT`-Liste.

**Und die Liste der score-relevanten Stellen waechst selbst mit:** beim Einbau
von AAII kamen `const SENT_MAP=`, `function sentEval`, `applyCotDataFeed`,
`applySentimentFeed` und `recomputeRiskCorr` dazu. **Merksatz: JEDE neue
Score-Quelle gehoert in diese Liste** - sonst merkt der Waechter beim naechsten
Mal nicht, dass `SCORE_MODEL_VERSION` haette steigen muessen.

Genau das ist hier passiert: AAII ist ein neuer Score-Beitrag fuer SP500/NAS,
also wurde `SCORE_MODEL_VERSION` auf **3** gehoben - aufgezeichnete Tage davor
sind mit der neuen Zusammensetzung nicht vergleichbar und werden in History
und Trends entsprechend markiert.

### ⚠ Waechter leitet seine Abdeckung selbst ab (2026-08-16)

`check/rules.js` hatte eine HANDGEPFLEGTE Liste score-relevanter Funktionen.
Die veraltet zwangslaeufig - wer eine neue Hilfsfunktion in die Rechenkette
einbaut und die Liste nicht ergaenzt, umgeht den `SCORE_MODEL_VERSION`-Zwang,
ohne es zu merken.

**`check/scoreSurface.js` leitet die Menge jetzt bei JEDEM Lauf neu aus
`index.html` ab:** ausgehend von festen Wurzeln (`indScoreParts`, `rubScore`,
`symScoreCmp`, `pairScore`, `symTrackedCount`, `symOwnZ`, die fuenf
Bias-Pfade, `applyTrendModel`, `sentEval` ...) werden alle von dort
aufgerufenen Funktionen eingesammelt - zwei Ebenen tief - plus die dort
verwendeten Konstanten. Aktuell 71 Funktionen und 26 Konstanten.

⚠ Zwei Fallen beim Bau, damit sie nicht neu entstehen: (1) Konstanten NUR
uebernehmen, wenn der Name im File auch wirklich als `const NAME=` deklariert
ist - sonst landen deutsche Kommentarwoerter (IMMER, KEIN, NICHT ...) in der
Liste; (2) reine Darstellungs-Helfer (`escH`, `icn`, `fmtDayHdr` ...) gehoeren
in `IGNORIEREN`, sie aendern nie einen Score-WERT.

Gegengeprueft: eine Aenderung an `roundSc` - das in keiner Handliste stand -
wird seither erkannt und verlangt den Bump.

**Merksatz:** eine Liste, die jemand pflegen muss, ist kein Waechter, sondern
eine zweite Stelle zum Vergessen. Wo sich die Menge aus dem Code ableiten
laesst, ableiten.

### AAII-Karte: fuenf Ansichten auf dieselben Daten (2026-08-16)

Nutzer-Wunsch "ausfuehrliche Darstellung mit vielen Moeglichkeiten es anders
anzugucken". `renderAaiiCard` hat einen Ansichts-Umschalter (`aaiiView`, reine
Lese-Auswahl, bewusst nicht persistiert):

| Ansicht | Zeigt |
|---|---|
| **Spread** | roher Wochen-Spread + 8-Wochen-Glaettung, Extremzonen schattiert |
| **Shares** | die drei Anteile als eigene Linien (0-100%) |
| **100% stacked** | Flaechen uebereinander, 50-Prozent-Marke gestrichelt |
| **Distribution** | Haeufigkeit jedes Spread-Niveaus ueber ALLE aufgezeichneten Wochen, heutiger Wert als Marke + Perzentil |
| **vs S&P 500** | Spread gegen den Kurs (gestrichelte Preislinie nach Projekt-Konvention), fuer Divergenzen |

Dazu sechs Kennzahlen-Kacheln, eine Kurzerklaerung mit Quell-Link DIREKT in
der Karte (nicht nur hinter dem i-Knopf) und eine ausklappbare Tabelle mit der
Wirkung auf JEDES gelistete Asset - die beiden Aktienindizes mit halbem
Gewicht, alle uebrigen ausdruecklich ohne Score-Wirkung samt Begruendung.

Zwei Darstellungsfehler dabei gefunden und behoben: das letzte X-Achsen-Label
war abgeschnitten (erstes/letztes jetzt buendig verankert statt mittig), und
die beiden Legendenpunkte im Spread-Chart waren farblich kaum zu unterscheiden.

### AAII-Historie: einmaliger Backfill der echten Wochenreihe (2026-08-16)

Nutzer-Rueckfrage "ich sehe noch nix, die Historie ist doch verfuegbar" - zu
Recht: der Live-Schritt holt nur die AKTUELLE Woche, die Karte waere also
monatelang praktisch leer geblieben. AAII veroeffentlicht die komplette
Wochenreihe seit Juli 1987 als Datei; der neue Schritt **"Backfill AAII survey
history"** laedt sie einmalig.

**⚠ Aus dieser Sandbox ist aaii.com NICHT erreichbar** (Proxy-403,
Org-Policy - nicht wiederholen). Wie bei jeder neuen Quelle in diesem Projekt
laeuft die Verifikation ueber `workflow_dispatch` + Job-Log, nicht ueber einen
Fetch von hier.

**Selbstbegrenzend:** ab `AAII_MIN_HIST`=60 vorhandenen Wochen ist der Schritt
ein sofortiger No-Op und laedt gar nichts mehr. Es ist ein Backfill, kein
wiederkehrender Grossabruf. Bereits vom Live-Schritt geholte Wochen gewinnen
beim Zusammenfuehren.

**Nichts wird geschaetzt:** jede Zeile braucht ein echtes Datum, und die drei
Anteile muessen 100 ergeben (Toleranz 98,5-101,5) - sonst wird sie verworfen.
Gegen synthetische Dateien geprueft: tab-getrennt 80/80 Wochen, HTML-Tabelle
40/40, eine Zeile mit Summe 120 korrekt aussortiert, ohne brauchbare Reihe
wird nichts geschrieben.

**Drei Formate, drei Fallen - alle geloest:**
1. **XLSX ist ein ZIP.** Wird per `unzip -p` aus `xl/worksheets/sheet1.xml`
   plus `xl/sharedStrings.xml` gelesen (Zellen mit `t="s"` sind Verweise in
   die Zeichenkettentabelle, keine Werte).
2. **HTML-Tabellen stehen oft komplett in EINER Zeile.** Ohne Normalisierung
   von `<tr>`/`</tr>` zu echten Umbruechen findet die Zeilenschleife genau
   einen Datensatz. Gemessen: 0 statt 40 Wochen.
3. **Ein Datum wie "Jan 02, 2025" enthaelt selbst ein Komma.** Ein
   kombiniertes Trennmuster (`\t|,|;|...`) schneidet mitten hindurch. Die
   Trennstrategien laufen deshalb NACHEINANDER: erst HTML-Zellen, dann
   Tabulator, dann Semikolon, dann Komma - die erste, die einen gueltigen
   Datensatz liefert, gewinnt.

**Merksatz:** bei einer neuen Datei-Quelle nie ein einzelnes kombiniertes
Trennmuster verwenden. Datumsformate enthalten selbst Trennzeichen; mehrere
Strategien nacheinander zu probieren ist robuster und kostet nichts.

### ⚠ AAII live: Parser-Fehler und Altersgrenze (Livelauf 2026-08-19)

Erster echter Livelauf per `workflow_dispatch`. Zwei Befunde, beide behoben:

**1. Der Parser der Wochenseite fand nichts, obwohl die Seite da war.**
Job-Log: `http=200 size=20043`, trotzdem `Kandidaten: []`. Die
Fehlerdiagnose gab das Textfenster aus und zeigte warum:

```
Week ending August 12, 2026
Bullish 34.7% Avg 37.5% Neutral 27.4% Avg 31.0% Bearish 37.9% Avg 31.5%
```

Zwischen den Feldern steht jeweils der LANGZEITMITTELWERT. Ein kombiniertes
Muster, das zwischen den Labels keine Ziffern erlaubt (`[^0-9%]{0,60}`),
scheitert daran zwangslaeufig. Jetzt wird **jedes Label einzeln** gesucht -
der erste Prozentwert nach dem Label ist der gesuchte, das "Avg" liegt
dahinter und stoert nicht. Gegen den echten Seitentext aus dem Log geprueft.

**Merksatz:** ein kombiniertes Muster ueber mehrere Felder bricht, sobald die
Quelle zwischen ihnen irgendetwas mit Ziffern einfuegt. Label-fuer-Label
suchen ist robuster; die Summenprobe schuetzt weiterhin vor Fehlgriffen.

**2. Die veroeffentlichte Historien-Datei haengt Monate hinterher.**
Der Backfill lieferte 520 Wochen, aber die juengste war **2026-03-19**,
waehrend die Live-Seite bereits den 12.08. fuehrte. Ohne Gegenmassnahme haette
die Karte einen fuenf Monate alten Wert als aktuelle Lesung angezeigt UND
gescort.

**`AAII_STALE_DAYS`=21** (drei verpasste woechentliche Veroeffentlichungen):
ein aelterer Stand bleibt sichtbar, traegt aber **0** bei, und die Karte nennt
ausdruecklich das Datum und dass die Luecke NICHT gefuellt wird. Derselbe
Gedanke wie `IND_STALE_CYCLES` bei den Indikatoren. Gemessen: 21 Tage zaehlen
noch, 22 nicht mehr; ein fuenf Monate alter Extremwert traegt 0 statt 0,5.

**Merksatz:** bei jeder Quelle mit fester Veroeffentlichungsfrequenz gehoert
eine Altersgrenze dazu, sobald Historie und Live-Stand aus VERSCHIEDENEN
Endpunkten kommen - die beiden koennen beliebig weit auseinanderlaufen, und
der aeltere gewinnt sonst still.

### Schlagzeilen-Karte: RSS statt API-Schluessel (Nutzer-Wunsch 2026-08-19)

Die Karte war dauerhaft leer, weil der Marketaux-Zugang einen
`MARKETAUX_API_KEY` brauchte, den es nie gab. Quellen sind jetzt **freie
RSS-Feeds ohne Schluessel** - kein Kontingent, keine Anmeldung:

| Klasse | Quellen |
|---|---|
| **3** Primaerquelle | Federal Reserve, EZB, Bank of England (Mitteilungen direkt) |
| **2** Wirtschaftsmedium | CNBC Economy, CNBC Finance, MarketWatch, Yahoo Finance |
| **1** gezielte Suche | Google News RSS fuer Aussagen einzelner Haeuser (JPMorgan, Goldman Sachs, Morgan Stanley, BofA, Citigroup) und fuer Makro-Themen |

**Drei Zeitfenster** (Today/Week/Month) mit Anzahl je Fenster; sortiert wird
INNERHALB des Fensters nach Wichtigkeit. Die Wichtigkeit ist **keine freie
Bewertung**, sondern eine nachlesbare Rechnung: Quellenklasse x2 + gedeckelte
Treffer auf einer festen Themenliste (`SCHWER`) + gedeckelte Treffer auf den
hier gelisteten Maerkten (`ASSETS`). Sichtbar als HIGH/MED/LOW.

**Zwei Parser-Fehler im Test gefunden - nicht neu aufmachen:**
1. **Atom-`<link href='...'/>` mit EINFACHEN Anfuehrungszeichen** wurde nicht
   erkannt (nur `"` erlaubt) - der komplette Fed-Feed lieferte 0 Eintraege.
2. **`includes` traf "gold" in "Goldman Sachs".** Stichworte werden jetzt nur
   an Wortgrenzen gematcht, mit optionalem Plural-s (damit "interest rate"
   auch "interest rates" trifft, ohne dass "gold" in "Goldman" anschlaegt).

Ohne echtes Datum wird ein Eintrag verworfen. Bestand wird ueber die URL
dedupliziert, 35 Tage gehalten, max. 600 Eintraege.

### Dashboard: kompletter Karteninhalt sichtbar, keine Innen-Scroller (2026-08-19)

Nutzer-Wunsch: "man sieht den kompletten Inhalt aller Karten und muss nicht
scrollen". Die gemeinsame Spaltenhoehe in `equalizeDashColumns()` richtet sich
jetzt nach der **LAENGSTEN** Spalte statt nach der kuerzesten. Vorher wurde auf
die kuerzeste angeglichen und der Rest zusammengedrueckt - genau dadurch
entstanden die Innen-Scroller. `.dw-shrink`-Karten geben keine Hoehe mehr ab
(`flex:0 0 auto`) und ihre Listen scrollen nicht mehr (`overflow:visible`);
die kuerzeren Spalten bekommen den Ueberschuss ueber ihre `dw-grow`-Karte.

Gemessen ueber 1920/1600/1440/1180: **0 Innen-Scroller, 0 ueberlaufende
Karten, 0 Ueberlappungen**, alle Zonen exakt gleich hoch mit 0 Ueberlauf.

**Merksatz:** die Nachmess-Korrektur in `equalizeDashColumns()` bleibt - eine
Hoehe, die der Inhalt nicht einhalten kann, laesst ihn in die untere
Kartenreihe laufen. Ungleich lange Spalten sind haesslich, ueberlappende sind
kaputt.

### Risk-Index: Methodenzeile nannte mehr Reihen als einbezogen (2026-08-19)

`method` behauptete "VIX, Gold, AUD/USD and USD/JPY", `components` enthielt
aber nur drei - VIX faellt heraus, solange seine eigene Reihe zu kurz ist. Die
Zeile wird jetzt aus den TATSAECHLICH verwendeten Reihen gebaut und waechst
automatisch mit. **Merksatz:** eine fest getippte Aufzaehlung neben einer
berechneten Liste laeuft frueher oder spaeter auseinander - immer aus derselben
Quelle erzeugen.

### ⚠ Eine Quelle kann HTTP 200 liefern und trotzdem tot sein (2026-08-19)

Der erste Livelauf der Schlagzeilen-Karte holte 285 Eintraege aus 9 Feeds -
zwei davon lieferten aber **null**, ohne dass irgendwo ein Fehler stand:

| Quelle | Antwort | Eintraege |
|---|---|---|
| Bank of England (`boeapps/rss/feeds.aspx`) | **http=404**, 11 KB HTML | 0 |
| CNBC Economy/Finance (`search.cnbc.com`) | **http=200**, **20 Byte** | 0 |

Der 404 war eine gewoehnliche HTML-Fehlerseite (der Parser findet darin kein
`<item>` und meldet ruhig "0"), CNBCs alter Such-Endpunkt antwortete mit einer
praktisch leeren, aber formal erfolgreichen Antwort. **Ein Statuscode-Check
haette den zweiten Fall nicht gefangen, ein Groessen-Check nicht den ersten.**

`hole()` nimmt deshalb jetzt **je Quelle eine Liste von Adressen** und
verwendet die erste, die tatsaechlich ein Feed IST (`grep -qE "<item|<entry"`) -
nicht die erste mit Status 200. Die alte Adresse bleibt als letzter Kandidat
stehen; liefert keine etwas, wird die Datei geloescht und die Quelle faellt
sauber aus (`try/catch` im Parser ueberspringt sie).

`out.sources` listet nur noch Quellen, aus denen wirklich etwas in der Liste
steht (`[...new Set(liste.map(h=>h.s))]`) - vorher zaehlte die Karte alle neun
auf, auch die beiden toten. Das war eine stille Falschaussage in der UI.

**Merksatz:** bei JEDEM neuen HTTP-Feed pruefen, ob die Antwort das ERWARTETE
FORMAT hat, nicht ob sie erfolgreich war. Und wo eine Adresse sich aendern
kann (Notenbanken und Medien bauen ihre Seiten regelmaessig um), eine
Kandidatenliste statt einer festen Adresse verwenden - das heilt sich selbst,
ohne dass jemand einen leeren Kartenzustand melden muss.

**Nebenbefund, kein Fehler:** der Risk-Index laeuft seit dem `git add`-Fix
(Commit `7ab7512`) korrekt - VOR diesem Commit lag `risk_index.json` nie im
Repo, die Karte zeigte deshalb zu Recht "NO LIVE READ". Aktuell gemessen:
+0,34, RISK-OFF, 74. Perzentil, 800 Punkte Historie aus Gold/AUDUSD/USDJPY.
**VIX fehlt weiterhin bewusst** (43 von 50 noetigen Tagen, sammelt einen Punkt
pro Handelstag) und kommt ohne Code-Aenderung dazu, sobald die Reihe reicht -
die Methodenzeile nennt seit V385 nur die tatsaechlich verwendeten Reihen.

### ⚠ "Ein Rebase ist hier immer konfliktfrei" - war falsch (2026-08-19)

Der Push-Schritt des Datenlaufs traegt seit 2026-07-13 eine Retry-Schleife mit
`git pull --rebase`, begruendet mit: die JSONs seien reine Workflow-Ausgaben,
ein Rebase daher konfliktfrei. **Am 2026-08-19 eingetreten und widerlegt:**
ueberlappen sich ZWEI Laeufe (Zeitplan + `workflow_dispatch`), schreiben beide
dieselben Dateien neu, und der Rebase bricht ab:

```
CONFLICT (content): Merge conflict in bond_data.json
CONFLICT (content): Merge conflict in news_data.json
CONFLICT (content): Merge conflict in price_data.json
CONFLICT (content): Merge conflict in risk_index.json
CONFLICT (content): Merge conflict in sentiment_data.json
##[error]Process completed with exit code 1
```

Der Lauf verlor damit ALLE frisch geholten Daten (u.a. die 371 Schlagzeilen)
UND erzeugte genau die Fehlermail, die die Schleife verhindern sollte.

Aufloesung: bei einem Konflikt gewinnt die Fassung DIESES Laufs - die Dateien
sind Ausgaben eines gerade gelaufenen Abrufs, also der neuere Stand derselben
Quellen. Danach `rebase --continue`, dann Push.

**⚠ Im Rebase sind die Seiten VERTAUSCHT:** `--ours` ist der ZIELZWEIG
(origin/main), `--theirs` der gerade aufgesetzte eigene Commit. Wer hier
intuitiv `--ours` schreibt, wirft genau die frischen Daten weg, die er
retten wollte.

Gegen ein echtes Repo mit erzwungener Kollision getestet, beide Pfade:
mit Konflikt (frischere Daten landen auf dem Server, der fremde Commit bleibt
in der Historie) und ohne Konflikt (eine fremde Datei bleibt erhalten). Beide
Laeufe enden mit Exit 0.

**Merksatz:** eine Begruendung im Kommentar ("kann nicht passieren") ist keine
Absicherung. Wo ein Fehlerfall billig abzufangen ist, abfangen - auch wenn er
unwahrscheinlich scheint. Zwei parallele Laeufe sind bei einem stuendlichen
Zeitplan plus gelegentlichem manuellen Anstoss nicht die Ausnahme, sondern
regelmaessig.

### Schlagzeilen-Karte neu gebaut: Rangfolge, Buendelung, Titel, Design (Nutzer-Wunsch 2026-08-19)

Nutzer: "mach das Widget auf dem Dashboard fuer die News besser finde selber
die Probleme und Sorg fuer guten Inhalt sowie Design." Sieben Befunde, alle
an den echten 297 Schlagzeilen gemessen, nicht geschaetzt:

| Befund | Messwert |
|---|---|
| Rangfolge unbrauchbar | 80% aller Meldungen LOW, nur 6 HIGH - und alle 6 waren Notenbank-VERWALTUNG ("Fed bittet um Kommentare zu einem Regel-Vorschlag"). 143 Eintraege trugen exakt dasselbe Gewicht. |
| Dieselbe Meldung mehrfach | 11 von 27 Meldungen eines Tages betrafen Trump/Kanada/Zoelle |
| Verlags-Anhang im Titel | 164 von 297, teils "- ABC News - Breaking News, Latest News and Videos" |
| echte Quelle unsichtbar | 205 Eintraege standen als "Macro wire"/"Bank research" da |
| rohe HTML-Codes | 8 Titel als `Here&#x2019;s why ...` |
| Lebenshilfe im Wirtschafts-Feed | MarketWatch-Topstories: "Our son ... Should we change our $3 million will?" |
| Karte zu gross | 3112px hoch, 91-123px je Eintrag, ein Titel 240 Zeichen |

**Rangfolge: gezaehlt statt zugewiesen.** Hauptsignal ist jetzt, wie viele
UNABHAENGIGE Haeuser dieselbe Meldung bringen (`Math.min(6,2*(n-1))`) - ein
gemessener Relevanzbeleg. Die Quellenklasse wirkt nur noch als Zu-/Abschlag:
echte Notenbank-Beschluesse und Reden +5 (`CB_ECHT`), deren Verwaltungs-
meldungen −3 (`CB_VERWALTUNG`). Ohne diese Trennung dominierte die Klasse
alles. Schwellen im Client: HIGH ab 5, MED ab 2,5 - an der echten Verteilung
kalibriert (HIGH trifft rund 2%).

**⚠ Der Verlags-Anhang wird NICHT geraten.** Google News liefert je Eintrag
ein `<source>`-Tag mit dem Verlag; genau dieser Anhang wird abgeschnitten.
Nur wo das Tag fehlt (Altbestand), greift ein Rueckfall - und der nimmt das
ERSTE passende " - ", nicht das letzte: Verlagsnamen enthalten selbst
Gedankenstriche, mit dem letzten bliebe " - ABC News" stehen und der Verlag
hiesse "Breaking News, Latest News and Videos".

**⚠ Die Anreicherung laeuft ueber den GESAMTEN Bestand, nicht nur ueber die
frischen Eintraege** - sonst behielte der Altbestand aus `news_data.json`
fuer immer seinen alten Titel, seine alte Quelle und sein altes Gewicht.

**⚠ Nur der Repraesentant einer Gruppe bleibt in der Liste**, die uebrigen
Haeuser stecken als `o[]` daran (Plus-Chip in der Zeile). `n` wird dabei NIE
nach unten korrigiert: aeltere Meldungen rollen aus den Feeds heraus, die
Zahl der Haeuser, die berichtet haben, schrumpft aber nicht rueckwirkend.

**⚠ "Thema des Tages" ueber die WORTVERTEILUNG, nicht ueber die Gruppen.**
Gemessen: die groesste Dubletten-Gruppe hatte 3 Eintraege, waehrend 24 von
220 Meldungen dasselbe Thema hatten - verschiedene Haeuser titeln zu
verschieden, um als Dublette zu gelten. Gezaehlt wird das haeufigste Sachwort
plus die zwei, die am oeftesten damit auftreten; die genannte Zahl ist immer,
wie viele Meldungen das Leitwort enthalten. Zwei Filter noetig: generische
Woerter raus (sonst gewinnt "Stock"), und nur Meldungen MIT Markt- oder
Themenbezug zaehlen (sonst gewinnt Yahoos Transkript-Strom mit "Earnings -
Call - Highlights"). Ergebnis am echten Bestand: "Tariffs · Trump · Canada,
15 von 53".

**Deckel je Quelle** (`MAX_JE_QUELLE`=80): Yahoos Sammelfeed stellte 310 von
537 Eintraegen. Fuer den Deckel wird nach Wichtigkeit sortiert, danach wieder
nach Datum - sonst behielte er die neuesten statt der wichtigsten.

**Anzeige.** Zeilenhoehe 91-123px -> rund 45px, Kartenhoehe 3112 -> 517px.
Wichtigkeit als linker Randstreifen (Konvention der Score-Karten), nicht als
graue Box in eigener Zeile. **⚠ Der Titel darf zwei Zeilen brauchen:**
einzeilig mit Auslassung war in der 364px schmalen Dashboard-Spalte unlesbar
("Donald Trump says de…") - die Schlagzeile IST der Inhalt. Im Wochen-/
Monatsfenster wird nach TAG sortiert und erst innerhalb des Tages nach
Wichtigkeit, sonst erscheint derselbe Trenner mehrfach (im Test stand "Today"
siebenmal in einer Liste). Aufgeklappt bleibt die Karte bei 40 Zeilen
gedeckelt - ohne Deckel wurde sie 13687px hoch und sprengte die
Spaltenangleichung.

**Neu dazu:** Watchlist-Filter, Ungelesen-Markierung (`newsSeenTs`, an allen
vier Sync-Ecken, beim Pull gewinnt der SPAETERE Zeitstempel), Schlagzeilen je
Asset auf der Detailseite mit Hinweis auf einen Score-Flip desselben Tages
(Quelle ausschliesslich `scoreHist`, geprueft in `check/score.js`), ein
Zaehler an jeder Kalenderzeile (⚠ das Feld heisst zur Laufzeit `currencies`,
nicht `country` wie in der Rohdatei) und ein eigener Insights-Tab "News" mit
Volltextsuche, Asset- und Quellenfilter.

**Merksatz:** eine Rangfolge, die eine EIGENSCHAFT der Quelle gewichtet
(Klasse, Prominenz), bevorzugt strukturell das, was diese Quelle am
haeufigsten produziert - bei Notenbanken ist das Verwaltung, nicht
Geldpolitik. Ein gezaehltes Signal (wie viele andere berichten mit) ist
robuster als jede zugewiesene Stufe.

### Schlagzeilen-Karte Runde 2: zaehlen statt nur auflisten (2026-08-20)

Nutzer: "verbesser noch die News Karte auf dem Dashboard mehr". Vier
Ergaenzungen, alle aus reinem Zaehlen der vorhandenen Meldungen - nichts
gedeutet, keine neue Quelle:

- **Nachrichten-Druck** (`newsPressureHtml`): eine Saeule je Stunde im
  Tagesfenster, je Tag in Woche/Monat. Ein Ausschlag heisst, dass gerade
  etwas passiert. Der Streifen wird aus dem Fenster-Pool OHNE Asset- und
  Themenfilter gebaut - sonst filtert er sich selbst weg.
- **Aufmerksamkeits-Chips** (`newsAttentionHtml`): die fuenf meistgenannten
  Assets im Fenster mit Anzahl, jeder klickbar als Filter. Zeigt auf einen
  Blick, woran der Nachrichtenfluss haengt (gemessen: USD 30, CAD 8, BTC 7).
- **Leitthema als Filter**: die Themenzeile ist jetzt ein Knopf. Gefiltert
  wird auf das erste Wort des Labels (`newsTopicWord`), also genau das Wort,
  dessen Haeufigkeit die Zeile ausweist.
- **NEW-Marke** fuer Meldungen der letzten Stunde, Fusszeile mit Feed-Alter
  und Archivgroesse plus Sprung in den News-Tab.

**⚠ Layout-Falle dabei:** bei zweizeiligen Titeln stiess die Auslassung an
die rechte Spalte ("... ahead of...Yahoo Personal ..."). Der Grid-Abstand von
9px reichte nicht, wenn BEIDE Spalten ihre Breite voll ausschoepfen. Jetzt
14px Abstand und `minmax(0,1fr)` fuer die Titelspalte. Geprueft wird das
seither mit einem Rechteck-Vergleich Titel gegen Meta-Block (Soll: 0
Ueberschneidungen) - bei kuenftigen Aenderungen an der Zeile mitlaufen lassen.

### Terminal-Griffe: Statuszeile, Sitzungen, Tastatur, Dichte (2026-08-20)

- **Statuszeile** ueber dem Dashboard (`renderDashStatus`, aufgerufen aus
  `renderDash` direkt vor `equalizeDashColumns`): staerkste/schwaechste
  Waehrung, Risiko-Regime, naechster High-Impact-Termin, Leitthema. JEDER
  Wert kommt aus einer bestehenden Funktion (`symScoreCmp`, `riskOnOffState`,
  `calEvts`, `NEWS_DATA.topic`) - nichts zusaetzlich gerechnet.
- **Sitzungs-Streifen** (`FX_SESSIONS`, UTC-Kernzeiten). ⚠ Sommerzeit ist
  bewusst NICHT modelliert - London und New York verschieben sich dadurch um
  eine Stunde. Das steht im Tooltip, statt eine Zeitzonendatenbank
  nachzubauen. Ueberlappung wird eigens markiert (tiefste Liquiditaet).
- **Tastatur** (`KEY_TABS`, Akkord "g" + Buchstabe): greift nur, wenn kein
  Eingabefeld fokussiert ist UND kein Modal offen ist (`keyNavAktiv`) -
  sonst schluckt es Escape/Enter der Fenster.
- **Dichte-Schalter** (`denseMode`): eigener Schalter fuer die Dashboard-
  Karten, unabhaengig vom Kompakt-Regler der Indikator-Zeilen. Vier Ecken
  angebunden.

### ⚠ Der Waechter darf nicht am Diff-Text haengen (2026-08-20)

Regel 6 (neuer persistierter Zustand) hat bei `fxpro_dense` FALSCH
angeschlagen: sie prueft, ob die Woerter "cloudPush"/"cloudPull" im Diff
vorkommen. Wer mitten in eine Funktion schreibt, aendert deren Namenszeile
aber nicht mit - der Fehlalarm war garantiert.

Jetzt holt die Regel den KOERPER beider Funktionen aus dem aktuellen
`index.html` (Klammer-Zaehlung), sucht die Variable, die aus dem neuen
Schluessel gelesen wird (`let X=localStorage.getItem('fxpro_...')`), und
prueft, ob diese Variable in beiden Koerpern vorkommt. Gegenprobe gefahren:
Anbindung an `cloudPull` entfernt -> Regel meldet genau `cloudPull`,
wiederhergestellt -> gruen.

**Merksatz:** ein Waechter, der auf Diff-TEXT prueft statt auf den Zustand
des Codes, erzeugt Fehlalarme und verleitet dazu, ihn zu umgehen. Wo sich
die Eigenschaft am fertigen Code pruefen laesst, dort pruefen.

### Drei Auswertungen aus vorhandenen Daten (2026-08-20)

- **Surprise-Index mit Verlauf** (`esiSeries`, 90 Tage): rueckgerechnet aus
  `chartHist` mit derselben Alters-Gewichtung wie `esiForCcy` - keine zweite
  Formel. Sparkline je Waehrungszeile. ⚠ Der Layout-Waechter hat den ersten
  Anlauf gestoppt (64px Kurve liess die Karte auf dem kleinen Desktop 11px
  ueberlaufen) - jetzt 44px und schrumpfbar.
- **Terminstruktur** (`termStructureCardHtml`, Rate-Probabilities-Tab): der
  eingepreiste Zinspfad aller Notenbanken nebeneinander. Als TREPPE
  gezeichnet: ein Leitzins gilt bis zur naechsten Sitzung, eine Gerade
  dazwischen waere eine erfundene Zwischenstufe.
- **Korrelations-Regime** (`corrRegimeSeries`, Matrix-Tab): rollierendes r
  ueber die Zeit statt einer Zahl. Gemessen EUR/GBP: 773 Fenster seit
  2023-09, aktuell +0,88, Spanne 0,45 ueber den Zeitraum.

### ⚠ Edge-Tab: die Rueckrechnung ist NICHT der Live-Score

`edgeScoreSeries` bildet die KLASSISCHE Gewichtung ab. Die Normierung des
Modus `normalized` haengt an `indMarketWeight` und `indDecayWeight` - beide
messen etwas, das es fuer einen vergangenen Tag nicht rekonstruierbar gibt
(die Marktrelevanz wuerde die Zukunft des jeweiligen Tages mitbenutzen).
Das steht in der Karte und im Info-Text. Bei kuenftigen Aenderungen am
Score-Modell nicht versuchen, die Rueckrechnung "genauer" zu machen, indem
man die Normierung nachbaut - das waere ein Blick in die Zukunft.

**⚠ Non-FX braucht die same/inverse-Umrechnung.** Ohne sie summiert die
Rueckrechnung die rohen US-Signale und Gold laeuft verkehrt herum (im Test
genau so aufgetreten). `check/score.js` prueft das Vorzeichen jetzt gegen
`effDeriveRules`.

### ⚠ Dashboard: Karten mit VARIABLER Laenge gehoeren gedeckelt (2026-08-20)

Nutzer-Wunsch: "ordne die anderen so an das sie sich besser einfuegen und
verlaenger sie nicht unnoetig - Benachrichtigungen und andere Karten die
extrem lang sind lass sie mittel lang und mach das man den Rest durch
scrollen sieht".

Drei Aenderungen, alle gemessen statt geschaetzt:

1. **Die reine Deko-Karte ist weg** (`motivation`): aus `DASH_DEFAULTS`,
   `mkWidgets()`, `ZONE_OF_TYPE`, `DASH_RANK`, dem Widget-Katalog, dem
   Render-Zweig und der CSS - und in `DASH_DROP`, damit sie auch bei allen
   verschwindet, die sie im gespeicherten Layout haben. **Kein `DASH_V`-Bump
   noetig**: `DASH_DROP` wirkt unabhaengig von `dashV`, und die Zone kommt
   aus `ZONE_OF_TYPE` (wird nicht gespeichert). Ein Bump haette hier nur
   eigene Umsortierungen der Nutzer zurueckgesetzt.
2. **Der Kalender ist aus der vierten Spalte in die untere Reihe gezogen.**
   Zwei Gruende: die untere Reihe traegt damit drei Karten desselben
   Charakters ("was passiert gerade") statt zwei plus Fuellsel, und die
   vierte Spalte verliert die 428 Pixel, mit denen sie zuvor die Hoehe
   ALLER vier Spalten bestimmte (`equalizeDashColumns` gleicht auf die
   LAENGSTE Spalte an).
3. **`.dw-cap`**: die Liste einer langen Karte wird bei `--dw-cap`
   gedeckelt und scrollt darin. Angewendet in `renderDash()` ueber
   `DASH_CAPPED` (String-Replace auf dem fertigen Karten-HTML, dasselbe
   Muster wie `DASH_SHRINKABLE`), die Hoehe je Typ steht als `--dw-cap` in
   der CSS - so landen keine Pixelwerte im Markup-String.

**⚠ Gedeckelt wird die LISTE, nie der Kartenkoerper.** Sonst muss man
scrollen, um an Umschalter, Filter oder die Fusszeile zu kommen. Karten mit
flachem Koerper haben dafuer eigens eine Huelle bekommen: `.mv-list`
(Movers), `.nb-list` (Benachrichtigungen), `.hl-list` (nur die
Schlagzeilen-ZEILEN - Fenster-Umschalter, Leitthema, Druck-Streifen, Chips,
Mehr-Knopf und Fusszeile bleiben stehen). Bei einer neuen gedeckelten Karte
zuerst pruefen, ob ihr Koerper eine solche Huelle hat.

**Welche Karten:** die, deren Laenge NICHT feststeht, sondern davon
abhaengt, was gerade anliegt - `notification` (jede veraltete Reihe, jeder
ausstehende Wert, jedes eingetroffene Event ist eine Zeile) und
`headlines`. Dazu die drei der unteren Reihe, damit sie sich nicht an der
laengsten ausrichtet. Karten mit fester Zeilenzahl brauchen keinen Deckel.

**Nur ab 1100px** (die Regeln stehen im bestehenden `@media`-Block).
Darunter stapelt das Dashboard einspaltig und die Seite scrollt ohnehin -
ein Innen-Scroller waere dort eine Touch-Falle.

Gemessen (1440px): untere Reihe 428 -> 335 Pixel, Spaltenhoehe 1156 ->
1129, `check/dashboard.js` weiterhin ohne Ueberlappung und ohne
Zonen-Ueberlauf.

**Merksatz:** `equalizeDashColumns()` gleicht auf die LAENGSTE Spalte an -
eine einzige Karte, die gerade viele Zeilen fuehrt, zieht damit das ganze
Dashboard in die Laenge. Bei JEDER neuen Karte, deren Zeilenzahl von der
Datenlage abhaengt statt fest zu sein, gleich `DASH_CAPPED` mitpflegen.

### Fehleranalyse der Neuerungen vom 16.-20.08. (Nutzer-Auftrag 2026-08-20)

Drei Durchgaenge mit VERSCHIEDENEN Methoden statt dreimal derselbe Blick:
statisch gegen die bekannten Fehlerklassen dieses Projekts, zur Laufzeit gegen
unabhaengig nachgerechnete Sollwerte, und gegen fehlende/unsinnige Daten.
Vier echte Fehler.

**1. Umfrage-Indikatoren an Waehrungen ohne Quelle.** `addSurveyInds` legte
die fuenf neuen Reihen bei ALLEN Assets an, obwohl im Workflow jede auf genau
eine Waehrung gegated ist (ZEW/Ifo auf EUR, NFIB/Michigan/Leading Index auf
USD). Gemessen: GBP, CHF, JPY, CAD, AUD, NZD trugen je FUENF Indikatoren, die
per Konstruktion nie einen Wert bekommen - und `symTrackedCount` zaehlt jeden
im Divisor von `symScoreCmp` (Test: 32 -> 31, sobald einer entfernt wird).
Genau die doppelte Bestrafung, die beim Thema Altersgrenze schon einmal
aufgeschrieben wurde. Jetzt waehrungsgenau ueber `effLinkCcy(sym)`, und
unberuehrte Karteileichen werden entfernt - eine mit Bias, Notiz oder Wert
bleibt stehen, das ist eine getroffene Entscheidung.

**⚠ Beim Fix selbst in die naechste Falle getreten:** der erste Wurf nutzte
`macroCcyFor(sym.id)`, das die ID in `syms` nachschlaegt. `addSurveyInds`
laeuft aber aus `migrateRubInds` waehrend `loadState()` - also BEVOR `syms`
zugewiesen ist. Die Absicherung `typeof syms!=='undefined'` dort hilft NICHT:
bei einer `let`-Variablen in der temporalen Todeszone WIRFT schon `typeof`
einen ReferenceError, statt 'undefined' zu liefern. Der komplette Boot stand
("Cannot access 'syms' before initialization"). `effLinkCcy(sym)` arbeitet
rein auf dem uebergebenen Objekt und ist sicher.

**2. Zwei tote Zeitraum-Filter.** `timeRangeCustomHtml` baut den Handlernamen
als STRING zusammen (`"<setFnName>Custom"`). Eine Suche nach dem fertigen
Namen findet deshalb nichts und die Funktion sieht tot aus.
`setIndHistRangeCustom` wurde beim Aufraeumen am 14.08. genau deshalb
geloescht - obwohl der CLAUDE.md-Eintrag desselben Tages vor dieser Falle
warnt. `setAaiiRangeCustom` wurde nie angelegt. Beide Male liess sich
"Custom" waehlen, die Datumsfelder erschienen, und die Eingabe tat still
nichts.

**3. Der Surprise-Index widersprach sich selbst.** In derselben Zeile endete
die Kurve bei CHF auf -0,204, waehrend die Zahl daneben -0,428 zeigte.
Ursache: `esiForCcy` verwirft einen Indikator, sobald sein AKTUELLER Release
keinen Forecast fuehrt; `esiSeries` wich stattdessen auf den letzten Release
MIT Forecast aus und speiste dadurch 7 Reihen statt 5. Massgeblich ist die
Live-Zahl - die Kurve richtet sich jetzt nach ihr. Ueber alle acht Waehrungen
gemessen: Abweichung 0.

**4. Das Schlagzeilen-Archiv versprach 35 Tage und hielt drei.** Haltezeit
35 Tage, Deckel aber 600 Eintraege - bei gemessenen ~200 Schlagzeilen/Tag war
der Bestand nach drei Tagen voll. "Week" und "Month" zeigten dasselbe wie
"Today", die Zaehler an den Knoepfen standen auf demselben Wert. Alles
vollstaendig zu halten waere die falsche Antwort (7000 Eintraege, 2,5 MB bei
JEDEM Seitenaufruf). Jetzt gestaffelt wie ein Archiv - 3 Tage vollstaendig,
bis 10 Tage ab MED, bis 35 Tage ab HIGH: 945 Eintraege, 0,34 MB, volle 35
Tage. Die Staffelung steht im Info-Text, sonst wundert man sich ueber
duennere alte Tage.

**Der Waechter hat drei der vier Faelle mitgelernt** (Merksatz "eine neue
Konvention gehoert als PRUEFUNG nach check/, nicht als Absatz hierher"):
- `check/structure.js` loest jetzt JEDEN Handlernamen aus inline-Handlern auf
  und kennt die zusammengesetzten `*Custom`-Namen. ⚠ Kommentarzeilen muessen
  ausgenommen werden - zwei Kommentare ERKLAEREN das Muster `onclick="fn(...)"`
  und lieferten sonst einen Fehlalarm auf "fn".
- `check/scoreSurface.js` zaehlt die Struktur-Migrationen zur Score-Oberflaeche.
  Eine Funktion, die die MENGE der Indikatoren aendert, verschiebt jeden
  angezeigten Score, ohne eine einzige Formel anzufassen - der Bump-Zwang fuer
  `SCORE_MODEL_VERSION` griff dort vorher nicht.

**⚠ Zwei Messfehler im eigenen Pruefwerkzeug**, beide meldeten faelschlich
"bestanden": (1) die Reihen-Funktionen liefern `[datum,wert]`-Tupel, mein
erster Test las `.d`/`.v` und bekam ueberall `undefined`; (2) `renderAaiiCard`
erwartet `D.aaii` mit `bull/neutral/bear` - ich uebergab eine erfundene
Struktur und traf immer den Leerzustand, drei "bestandene" Randfaelle hatten
nichts geprueft. **Bei jedem Randfall-Test zuerst nachweisen, dass er den Code
ueberhaupt erreicht** (hier: Laenge des Ergebnisses gegen den Leerzustand).

**Offen, weil Nutzer-Entscheidung:** `CORE_PAIRS` gruppiert seit dem 20.08.
`['ZEW Economic Sentiment','Ifo Business Climate']` - beide zaehlen dadurch
halb. Das ist derselbe Gedanke, den der Nutzer bei NFP+ADP ausdruecklich
ZURUECKGEWIESEN hat ("bewusst getrennte Indikatoren mit je voller ±1-Wirkung").
Nicht eigenmaechtig geaendert.

### Dashboard-Luecken, Schlagzeilen nach oben, Statuszeile raus (Nutzer-Bugreport 2026-08-21, per Screenshot)

Nutzer markierte per gelber Zeichnung eine grosse leere Flaeche unter den
kuerzeren Dashboard-Spalten. Dazu: Schlagzeilen groesser und ganz oben
rechts ("die ist wichtig"), und die Leiste oben weg.

**Die Luecke, gemessen:** Mitte 334px, links 152px, rechts 136px (bei
1194px Breite). `equalizeDashColumns()` gleicht alle Zonen an die LAENGSTE
an, die Karten darin standen aber auf `flex:0 0 auto` und wuchsen nicht mit -
der Rest der Zone blieb schlicht leer.

**⚠ Der naheliegende Fix ist falsch.** Die letzte Karte den Rest fuellen zu
lassen sieht aussen richtig aus und verschiebt die Luecke nur nach INNEN:
gemessen 284px Luft innerhalb der gestreckten Liste. Eine Liste mit 15
Zeilen hat nun einmal nicht mehr Zeilen - Strecken erzeugt Leerraum, nur an
einer anderen Stelle. **Bei jedem "fuellt die Karte?"-Fix deshalb IMMER die
Restluecke INNERHALB der Liste mitmessen** (letztes sichtbares Kind gegen
Listen-Unterkante), nicht nur die Karte gegen die Zone.

**Was funktioniert hat:** die Spalten inhaltlich gleich lang machen. Natuerliche
Hoehen vorher 1079/927/1126/1182 - Market Sentiment von der rechten
Aussenspalte in die Mitte verschoben und die Schlagzeilen vergroessert,
danach 1079/1107/1126/1087, also alle innerhalb von 47px. Genau dieser Rest
verteilt sich ueber `justify-content:space-between` auf die Abstaende
ZWISCHEN den Karten, wo er als Layout-Luft liest. Groesster Zwischenraum
ueber alle Breiten: 34px statt 334px.

**Ein zweiter Versuch, der zurueckgerollt wurde:** gedeckelte Karten (die
per Definition mehr Inhalt haben als Platz) den Rest aufnehmen zu lassen.
Das kehrt sich um - die Karte waechst unbegrenzt, wird selbst zur laengsten
Spalte und zwingt alle anderen auseinander (Abstaende sprangen von 34 auf
93px). `equalizeDashColumns` leitet die Hoehe aus dem Inhalt ab; eine Karte,
die sich nach dieser Hoehe richtet, ist ein Henne-Ei-Problem.

**⚠ Dabei aufgefallen: der `--dw-cap`-Deckel griff gar nicht mehr.** Beim
Umbau hatte ein Bereichs-Replace die Regel `max-height:var(--dw-cap)`
mitgeloescht - die Variablen-Definitionen blieben stehen, sahen also
plausibel aus, aber `getComputedStyle` lieferte `max-height:none` und die
Schlagzeilen-Karte wuchs unbegrenzt (786px statt 666px). Gefunden nur, weil
die gemessene Kartenhoehe nicht auf die Deckel-Aenderung reagierte.
**Merksatz:** wenn eine CSS-Variable gesetzt ist, heisst das nicht, dass die
Regel existiert, die sie benutzt - bei "die Aenderung wirkt nicht" immer den
COMPUTED-Wert der Eigenschaft pruefen, nicht die Variable.

**Statuszeile (`renderDashStatus`) komplett entfernt**, samt
`sessionStripHtml`/`FX_SESSIONS`/CSS - erst am 20.08. gebaut, jeder Wert
darin (staerkste/schwaechste Waehrung, Risiko-Regime, naechster Termin,
Leitthema) steht ohnehin in einer der Karten.

`DASH_V` auf 22, damit Bestandsnutzer die neue Anordnung bekommen.

### Schlagzeilen-Karte doppelt so breit + zwei Ueberlappungs-Fehler (2026-08-21)

Nutzer: "Headlines Karte doppelt so breit". Die rechte Aussenspalte steht
jetzt auf `2fr` (statt `1fr`), gemessen auf jeder Breite exakt das Doppelte
einer Standardspalte: 399/200, 527/263, 588/294, 711/356.

**⚠ Die Grid-Definition steht ZWEIMAL.** Ein zweiter `@media(min-width:1400px)`
setzt `grid-template-columns` erneut - wer nur die erste aendert, sieht die
Wirkung unterhalb von 1400px und wundert sich, dass daruber alles gleich
bleibt. Beide anpassen.

**Breiter heisst kuerzer:** die Titel brauchen weniger Zeilen, die Karte
schrumpfte von 774 auf 644px und in der Spalte klaffte wieder ein Spalt von
128px. Deshalb `NEWS_TOP_N` 12 -> 16 und der Deckel hoch - der Platz wird mit
echten Meldungen gefuellt, nicht mit Luft.

**Zwei echte Fehler dabei gefunden, beide schon vorher vorhanden:**

1. **`.hl-side` hatte `max-width:88px`, sein Inhalt wurde 114px breit.**
   Quelle UND Zeit stehen NEBENEINANDER (`.hl-side-r`); bei
   `align-items:flex-end` wandert der Ueberschuss nach LINKS - die Quelle
   ragte 22px aus ihrem eigenen Container und lag 8px ueber dem Titel. Auf
   JEDER Bildschirmbreite, seit dem Bau der Karte. Die Grid-Spalte ist ohnehin
   `auto`; begrenzt wird jetzt nur noch die Quelle selbst (Auslassung).
2. **`.wl-name` war auf 7px gequetscht**, der Text "CAD/CHF" lief quer ueber
   die Prozentspalte. Es hatte `min-width:0` und `white-space:nowrap`, aber
   kein `overflow:hidden`/`text-overflow:ellipsis`. Ausgeloest durch die
   schmalere linke Spalte (240px), die ich fuer die breiten Schlagzeilen
   gemacht hatte - zurueck auf 285px UND Ellipse als Absicherung.

**Der Waechter (`check/dashboard.js`) lernt beide Klassen mit:**
- **ueberlappender Text INNERHALB einer Karte** - bisher wurden nur Karten
  gegeneinander geprueft. ⚠ Zwei Filter sind dabei Pflicht, sonst ist der
  Waechter voller Fehlalarme: unsichtbare Elemente ausschliessen (die
  Bedien-Buttons des Bearbeitungsmodus liegen per `position:absolute` ueber
  dem Titel und haben `opacity:0`), und durch einen scrollenden Vorfahren
  GECLIPPTE Teile ausschliessen (sonst meldet er jede Zeile, die unter dem
  Fussbereich einer scrollbaren Liste weiterlaeuft). Ohne die Filter: 44
  Treffer, davon 0 echt.
- **Text, der sichtbar ueber sein eigenes Element hinauslaeuft**
  (`scrollWidth > clientWidth` bei `overflow:visible`). **Das findet kein
  Rechteck-Vergleich** - das Element bleibt klein, nur die Schrift steht
  heraus. Genau so war der Watchlist-Fall in jeder Kollisionsmessung
  unsichtbar und im Screenshot sofort zu sehen.

**Merksatz:** eine Ueberlappung, die man SIEHT, muss nicht als Ueberlappung
MESSBAR sein. Wer nur Rechtecke vergleicht, uebersieht ueberlaufenden Text
vollstaendig - beide Pruefungen gehoeren zusammen.

## ⚠ KONTRAST-UEBERARBEITUNG: "die Webseite ist zu weiss" (Nutzer-Wunsch 2026-08-21, per /goal)

Nutzer-Auftrag: Webseite wirkt insgesamt sehr weiss, auf Windows noch
schwaecher/kontrastaermer als auf dem Testgeraet gesehen. Konkret genannt:
Insights/Edge mit starkem Schwarz oder duennem Grau, teils zu kleine
Schrift; Karten sollen eine leichte Umrandung bekommen; Zwischen-
ueberschriften deutlicher; Ueberschriften-Hierarchie ueberall korrekt;
mehr starke graue Linien im Hintergrund statt nur der einen.

**Nachgemessen statt geraten (WCAG-Kontrastformel), bevor irgendetwas
geaendert wurde:**
| Paar | vorher | Bedeutung |
|---|---|---|
| Kartenrand (--bd) gegen weisse Karte | 1.31:1 | praktisch unsichtbar |
| Karte (--bg2) gegen Seite (--bg0) | 1.14:1 | kaum unterscheidbar |
| Sekundaertext (--t3) gegen weisse Karte | 3.39:1 | faellt AA-Text (<4.5) |

Erklaert auch den Windows-Effekt: bei Unterschieden von 1.05-1.31:1 reicht
schon ein anderes Gamma-/Farbprofil, um die Trennung ganz verschwinden zu
lassen - keine Rendering-Eigenart, sondern eine Palette, die von Haus aus
zu eng um Weiss geclustert war.

### Token-Ueberarbeitung (`:root`, ≈ Zeile 38)

Neue Werte, alle nachgerechnet gegen den tatsaechlichen Verwendungs-
Hintergrund:
- `--bg0`/`--bg1`/`--bg3`/`--bg4`/`--bg5`/`--bg6` global dunkler gezogen
  (Skala bleibt MONOTON - bg0 hellste, bg6 dunkelste, jede bestehende
  Verbrauchsstelle haengt nur an der Reihenfolge).
- `--bd`/`--bd2`: 1.97:1 / 2.71:1 gegen weisse Karte (sichtbar, aber
  bewusst "leicht" wie gewuenscht, kein schwarzer Rahmen).
- `--t1`/`--t2`/`--t3`: klar gestufte Rampe 10.5 / 6.7 / 4.8 : 1 gegen
  Karte - alle AA-fest fuer Fliesstext.
- `--shadow-card`/`--shadow-pop` Alpha leicht angehoben (Karten brauchen
  neben dem jetzt sichtbaren Rand noch eigene Tiefe).
- **Bias-/Statusfarben (Blau/Rot/Slate/Success) bewusst NICHT angefasst** -
  reine Graustufen-/Kontrast-Korrektur, keine Neu-Interpretation der
  Score-Farbsprache. Farbige Zahlen (z.B. "+2.35%" in Blau auf einem
  getoenten Chip) liegen teils unter 4.5:1, bleiben aber durch den
  Farbunterschied zum Grauton visuell klar erkennbar - anders als blasses
  Grau-auf-Grau, das buchstaeblich verschwindet. Aendern der Bias-Hex-Werte
  waere eine viel groessere, hier nicht angefragte Entscheidung (die Farbe
  IST die Bull/Bear-Sprache der ganzen App).

### Zwei app-weite Text-Idiome gefixt (je 13x im File)

Beide wurden per `grep -c` als exaktes wiederkehrendes Textmuster gefunden,
nicht einzeln geraten:
- **Card-Untertitel** (`font-weight:400;color:var(--t3);font-size:11px`,
  z.B. "Reconstructed from N days..." im Edge-Tab, "source: ... · updated"
  bei Rate Probabilities, AAII-Wochendatum): sitzt auf dem DUNKLEREN
  Kartenkopf-Verlauf (`--bg4`→`--bg3`), nicht auf der Karte selbst - dort
  ist `--t3` nur 2.9:1, faellt also trotz des globalen Tokens noch durch.
  Auf `--t2` umgestellt (`font-weight:500` fuer minimal mehr Praesenz).
- **Tab-Untertitel** (`font-size:12px;color:var(--t3);margin-top:1px`,
  z.B. "Does the score actually lead the price?" unter jedem Insights-Tab-
  Titel): sitzt DIREKT auf der Seite (Marmor-Hintergrund), dort war
  `--t3` nur 3.44:1. Auf `--t2` umgestellt - fixt die Untertitelzeile in
  JEDEM der 17 Tabs auf einen Schlag.

### 20 Eyebrow-Label-Klassen unter der eigenen 10px-Skalenuntergrenze

Die App hat eine dokumentierte 7-Stufen-Typoskala (`--fs-hero` bis
`--fs-2xs`=10px, siehe Abschnitt weiter oben). 20 Klassen (u.a.
`.res-lib-sec`, `.cmp-filter-lbl`, `.mx-rank-head`, `.rterm-tl-date`,
`.hl-more`, `.cal-news-btn`) lagen bei 8.5-9.5px - UNTER der eigenen
dokumentierten Untergrenze, kombiniert mit `--t3`. Alle auf 10px (bzw.
8.5→9.5px als kleinster Zwischenschritt) angehoben + `--t3`→`--t2`. Das
sind durchweg GROSSBUCHSTABEN-Zwischenueberschriften/Sektions-Label -
genau der "Zwischenueberschriften deutlicher machen"-Wunsch.

### Edge-Tab komplett von Off-Scale-Groessen befreit

`.edge-tbl` (11.5px→`--fs-sm`), `.edge-note` (10.5px→`--fs-xs`, `--t3`→
`--t2`), `.edge-dist-row` (11.5px→`--fs-sm`), `.aaii-tbl` (11.5px→
`--fs-sm`), `.hl-expand` (10.5px→`--fs-xs`, `--t3`→`--t2`). 11.5px/10.5px
waren nie ein gueltiger Skalenschritt - Off-Scale-Werte entstehen typischer-
weise, wenn beim Bauen einer neuen Karte "kurz mal" ein Zwischenwert
eingetippt wird, statt eine der sieben Variablen zu nehmen.

### Zwei Karten-Titel auf Fliesstextgroesse

`.cmp-title` (Compare-Tab) und `.mx-card-title` (Matrix-Tab) standen bei
13px = exakt `--fs-base` (Fliesstext) - obwohl sie strukturell identisch
zu `.cot-card-title` sind (gleicher Verlauf, gleiches Padding, gleicher
Rahmen), das app-weit bei 15px (`--fs-md`, "bewusst groesser als der
Fliesstext") liegt. Angeglichen. Kein neuer Fall der historisch
dokumentierten Kartentitel-Regression (Titel < Fliesstext) - hier war
Titel = Fliesstext, aber ebenso ein Bruch mit der eigenen Konvention.

### Hintergrund: 8 zusaetzliche Linien statt der einen

`body{background-image:...}` (≈ Zeile 21) bekam vor der Marmor-PNG acht
zusaetzliche `linear-gradient`-Haarlinien in variierenden Winkeln (128°,
35°, 162°, 73°, 15°, 100°, 145°, 50°) und Staerken (2 kraeftiger in
`--t1`-Ton, Rest in `--bd2`/mittlerem Grau, Alpha 0.07-0.16) - dieselbe
Technik, die der Intro-Screen (`#introOv`) bereits seit laengerem fuer
seine Risslinien nutzt (siehe Zeile ≈2439), hier nur wiederverwendet statt
neu erfunden. Bewusst CSS-Gradienten statt die Marmor-PNG neu zu generieren
- die PNG-Regenerierung ist laut fruehren Session-Eintraegen fehleranfaellig
(Periodizitaet, Banding, siehe Marmor-v1-v5-Historie oben), waehrend
CSS-Gradienten deterministisch und ohne Regressionsrisiko sind. **Wichtig
erkannt beim Verifizieren:** auf kartendichten Seiten (Dashboard) ist der
Grossteil der Flaeche von opaken weissen Karten bedeckt - die Linien sind
dort nur in den ~9px-Zwischenraeumen sichtbar. Auf kartenaermeren Seiten
(z.B. eine leere Assets-Uebersicht) sind sie klar sichtbar. Das ist so
gewollt (Karten muessen lesbar bleiben, koennen nicht durchscheinend sein) -
"mehr Linien im Hintergrund" heisst hier zwangslaeufig "mehr Linien DORT,
wo Hintergrund sichtbar ist", nicht "durch die Karten hindurch".

### Verifikationsmethode: alpha-korrekte Kontrastmessung, kein Rechteck-Raten

Ein erster automatisierter Sweep (naive `getComputedStyle().color` gegen
den ersten nicht-transparenten Vorfahren-Hintergrund) meldete faelschlich
ueber 1000 "Kontrastverstoesse" - fast alle waren Messfehler: (1) getoente
Chips/Badges (z.B. `.ticker-chip-pct`, "getoenter Chip"-Muster) setzen
Text UND Hintergrund oft in derselben Bias-Farbe, aber der Hintergrund nur
bei 8-15% Alpha - ein Script, das die rgba() OHNE Alpha-Kompositierung
gegen den darunterliegenden Layer liest, haelt das faelschlich fuer
"Farbe gegen dieselbe Farbe" (Ratio 1.0). Fix: echte rueckwaerts-
kompositierte Kette (Body → Karte → Chip-Tint → Text-Alpha) statt der
rohen rgba-Werte. (2) `.cot-card`/`.dw` nutzen `background:linear-
gradient(...)`, was `getComputedStyle().backgroundColor` als transparent
liest - das Script lief dadurch am Kartenhintergrund vorbei zur Seite
dahinter durch. Nach dem Alpha-Fix blieben nur noch die bereits oben
behandelten echten Faelle (Card-/Tab-Untertitel-Idiom, Eyebrow-Labels)
plus die bewusst unangetasteten Bias-Farben.

**Merksatz:** bei jeder kuenftigen automatisierten Kontrastpruefung IMMER
(a) Alpha-Kanaele echt kompositieren, nie roh vergleichen, und (b)
`background-image`-Gradienten mitbedenken, nicht nur `background-color` -
sonst produziert das Werkzeug selbst das Rauschen, das es eigentlich
aufdecken soll (dieselbe Lehre wie bei den frueheren Dashboard-
Ueberlappungs-Pruefungen: ein Test, der eine Ebene nicht sieht, kann in
genau dieser Ebene keinen Fehler finden).

### ⚠ Nutzer-Korrektur direkt im Anschluss: "einfach eine Menge Grau drauf gepackt" (2026-08-21)

Nutzer, nach dem Ansehen von V399: "Du hast jetzt einfach eine Menge Grau
drauf gepackt schau mal im Internet bei Experten wie man sowas richtig
macht teilweise geht auch Schrift über Karten drüber und so." Zwei
getrennte Ansprüche: ein Urteil über den GESTALTERISCHEN Ansatz (nicht nur
"mehr Kontrast", sondern "wie machen es Profis") und ein konkreter
Bugreport (Text läuft über Kartenränder).

**Recherche statt Vermutung** (WebSearch gegen Radix Colors, Vercel
Design-Tokens, Refactoring UI - alle drei unabhängig, alle drei bestätigen
dieselben zwei Punkte):
1. **Jeder Karte denselben kräftigen Rand zu geben ist ein benannter
   Anti-Pattern.** Refactoring UI wörtlich: "if you're already using
   different background colors... you might not need the border." Hierarchie
   soll primär über Typografie/Gewicht/Abstand laufen, Farbe/Rand ist die
   LETZTE, leiseste Ebene - nicht das Hauptwerkzeug.
2. **Dekorative Textur/Linien hinter dichten Zahlen-Tabellen wird
   einhellig abgelehnt**, nicht nur "abgeschwächt" - bei Finanz-/Dashboard-
   UIs (Bloomberg-Terminal-Philosophie eingeschlossen) gilt jede nicht-
   funktionale visuelle Neuerung als Risiko für Lesbarkeit.
3. Radix' 12-Stufen-Grau-Modell und Vercels tatsächliche Tokens (Canvas
   `#ffffff` → dezente Fläche `#fafafa` → Rand `#ebebeb`) arbeiten mit
   VIELEN kleinen Schritten, nicht mit einem grossen Sprung.

**Fix (V400), gezielt nur die zwei falschen Entscheidungen zurückgenommen,
die echten Lesbarkeits-Fixes aus V399 (Text-Idiome, Off-Scale-Groessen,
Karten-Titel-Konsistenz - siehe Eintrag oben) blieben unangetastet, das
waren nachweisbare WCAG-Bugs, keine Geschmacksfrage:**
- **Die acht diagonalen Hintergrund-Linien sind komplett wieder raus**
  (`body{background-image}` wieder nur die Marmor-Textur). Der urspüngliche
  Wunsch "mehr starke graue Linien im Hintergrund" wird dadurch NICHT
  erfuellt - das war nach der Recherche die falsche Uebersetzung des
  eigentlichen Wunsches (mehr Ausdruck/Kontrast insgesamt), nicht die
  richtige.
- **`--bd` von 1.97:1 auf 1.58:1 zurueckgenommen** (`#b3b9c2`→`#c9ced6`),
  `--bd2` von 2.71:1 auf 2.19:1 (`#969ea9`→`#a9b0ba`) - wirklich "leicht"
  wie im urspruenglichen Wunsch, nicht kastig. Der Schatten (`--shadow-card`,
  aus V399 bereits leicht kraeftiger) traegt jetzt einen groesseren Teil der
  Kartentrennung, statt dass der Rand allein dafuer sorgt.
- **`--bg0`/`--bg2`-Sprung (1.39:1) bewusst NICHT weiter verkleinert** - das
  war der Fix fuer eine echte 1.14:1-Unsichtbarkeit, kein Geschmacks-Sprung;
  die Recherche kritisiert die Zahl der Stufen zwischen Rand/Karte, nicht
  diesen einen Basiswert.

**Dem Bugreport "Schrift über Karten drüber" per Playwright/Screenshot
nachgegangen, nicht nur behauptet geloest.** `overlap_scan.js` (Scratchpad,
alle 17 Tabs × 5 Breiten, mit derselben Scroll-/Clip-Ausschluss-Logik wie
`check/dashboard.js`) meldete 20 Reste. Direkter Screenshot-Vergleich an
den drei konkretesten Verdachtsstellen (COT@820px, Seasonality@390px,
Rate Probabilities@1194px) zeigt **keinen neuen Ueberlapp** - alle drei
sind das bereits dokumentierte, app-weite Muster "zu breiter Karteninhalt
wird INNERHALB der Karte horizontal scrollbar" (`overflow-x:auto` am
Card-Container, siehe Grundsatz "Karten-Inhalt darf nie ueber den
Kartenrand hinausgehen" oben) - bei Seasonality@390px reisst der Text
("May", "67%") exakt an der Kante ab, weil die Karte per Default un-
gescrollt startet, aber `scrollWidth`/`clientWidth` bestaetigen: die Karte
IST scrollbar, der Rest ist per Wisch/Scroll erreichbar. Dasselbe Muster
zeigt auch die COT-"Details & weekly change"-Tabelle (Spalte "NET P..."
an der Kante abgeschnitten) - konsistent, nicht neu.

**Merksatz:** ein geometrischer Scan (Element X ragt ueber Element Y hinaus)
kann eine ABSICHTLICH scrollbare Flaeche nicht von einer kaputten
unterscheiden - beide sehen strukturell gleich aus (Inhalt breiter als
Container). Nur `scrollWidth>clientWidth` UND `overflow-x:auto` zusammen
beweisen "das ist Scroll, kein Bug"; ein reiner Bounding-Box-Vergleich
braucht danach IMMER noch einen echten Screenshot an der flaggierten
Stelle, bevor er als "Fund" gilt - die drei Stichproben hier waren alle
falsch-positiv.

---

## 2026-08-23 — History: Aufschluesselung der Tagesbewegung (VERSION-CHECK-434)

**Bugreport:** "Ergibt keinen sinn." Die in VERSION-CHECK-433 eingefuehrte
Zeile "Card changes" nannte fuer AUD `Inflation -0.1 · Labour Market -0.3 ·
Economic Growth -1` (Summe -1,4), waehrend die Kopfzeile desselben Tages
"Score moved -0.8" sagte.

**Ursache — zwei Skalen nebeneinander.** Der angezeigte Score ist
`symScoreCmp = symScore * symCmpFactor` (Fairness-Faktor gegen die
durchschnittliche Indikatorzahl der FX-Majors). Die je Tag aufgezeichneten
Kartenwerte kommen dagegen aus `rubScoreByName` und sind **roh**. Nebeneinander
gestellt behaupteten sie eine Summe, die es nie geben konnte. Zusaetzlich
waren nur 3 der 6 Karten aufgezeichnet, sodass auch bei gleicher Skala ein
unbenannter Rest geblieben waere.

**Was NICHT ging:** die Kartenwerte nachtraeglich hochskalieren. `symCmpFactor`
haengt von der Zahl nicht-veralteter Indikatoren am jeweiligen Tag ab — die
war nirgends gespeichert und ist rueckblickend nicht rekonstruierbar.

**Fix:** `recordScoreHist` schreibt zwei zusaetzliche Felder je Tag — `e[7]` =
`symCmpFactor`, `e[8]` = `symScore` (roh). Damit zerfaellt die Tagesbewegung
exakt:

```
tot_h - tot_v = cmp_h*(roh_h - roh_v)  +  roh_v*(cmp_h - cmp_v)
```

`histDeltaParts()` gibt daraus die Teile aus: die drei aufgezeichneten Karten
(jeweils mit `cmp_h` auf die Anzeigeskala gebracht), `Other cards` (Interest
Rates/COT/Risk als eine Zahl, weil sie nicht je Karte gespeichert sind),
`Comparability factor` und einen ausgewiesenen `Rounding`-Rest. Die
Rundungsfehler der Kartenwerte kuerzen sich im Kartenanteil algebraisch weg;
uebrig bleibt nur die 0,1-Rundung des Gesamtwerts, und genau die steht als
`Rounding` da — statt die Zeile still nicht aufgehen zu lassen.

Tage aus der Zeit davor tragen `e[7]`/`e[8]` nicht und bekommen **gar keine**
Aufschluesselung. Ebenso, wenn der Rest > 0,35 waere (`HIST_BRK_MAX_REST`).

**Geprueft (Nutzer-Wunsch 2026-08-23: "Bitte alle Aenderungen die du machst
ueberpruef das gruendlich und mach mehrere Tests"):**
- `check/score.js` Block H3, dauerhaft: 5 gezielte Faelle (einzelne Karte /
  nur nicht-aufgezeichnete Karten / nur Faktoraenderung / Altdaten ohne Felder
  / kein Delta), **3000 Zufallsfaelle** mit denselben Rundungen wie im
  Recorder, und ein Lauf ueber die **echte** aufgezeichnete Historie. Ergebnis:
  2986 Faelle mit Delta, 0 ohne Zerlegung, 0 Abweichungen.
- Ende-zu-Ende im Browser (Scratchpad, `t_hist2.js`): 4 Szenarien mit echten
  Symbolen, echtem `recomputeAuto()`/`recordScoreHist()` und aus dem **DOM
  gelesenen** Zahlen — 2 Karten gleichzeitig (Teile `-0.9 / -0.9 / Rounding
  -0.1` gegen Delta `-1.9`), nur eine nicht-aufgezeichnete Karte (`Other cards
  +1`), gemischt ueber alle Rubriken (`-1 / +1 / +2 / +1` gegen `+3`) und "gar
  nichts veraendert" (kein Delta, keine Teile). Alle vier: Summe der
  angezeigten Teile == angezeigtes Delta.
- `node check/all.js` komplett gruen (11 Waechter).

**Nebenbefund:** das `title` des VERSION-CHECK-Banners enthielt aus 433 ein
unmaskiertes `"` mitten im Attribut — das Attribut endete dort vorzeitig. Mit
korrigiert.

---

## 2026-08-23 — Carry in den Trends, Actual-Farben, AAII-Saeulen (VERSION-CHECK-435)

### Bugreport 1: "Bei Trends ist der Carry bei den Scores von den Paaren nicht eingepreist"

Stimmte. `renderTrendsPair` rechnete `be[1]-qe[1]` ohne `pairCarryAdj`, waehrend
`pairScore()` ihn ueberall sonst mitrechnet. Rueckwirkend geloest ueber die
datierte Beschluss-Historie der Zentralbanken aus `ind_data.json` (12-25
Beschluesse je Waehrung zurueck bis 2023, die Score-Historie beginnt erst
2026-07-20 - also vollstaendig abgedeckt). Details in `docs/navigation.md`.

**Nebenfund, groesser als der gemeldete Bug:** `rateInfo()` kannte den
Live-Feed gar nicht. Es las den kuratierten Recherche-Stand und den
Kalender - **alle acht Leitzinsen** waren dadurch veraltet oder aus einer
aelteren Quelle:

| | vorher | jetzt | Quelle vorher/jetzt |
|---|---|---|---|
| USD | 3,625% | 3,75% | research (Korridormitte) / feed |
| EUR | 2,00% | **2,40%** | research 2026-04-30 / feed 2026-07-23 |
| JPY | 0,75% | **1,00%** | research 2026-04-28 / feed 2026-07-31 |
| NZD | 2,25% | **2,50%** | research 2026-05-27 / feed 2026-07-08 |
| GBP/CHF/CAD/AUD | unveraendert | unveraendert | nur Quellenwechsel |

Fuenf von 35 Paar-Carrys drehten dadurch eine Stufe (EUR/USD −1 → −0,5,
USD/CAD +0,5 → +1, EUR/GBP −1 → −0,5, GBP/NZD +1 → +0,5, CAD/JPY +1 → +0,5),
fuenf Paar-Scores verschieben sich um 0,5.

### Bugreport 2: Actual-Farbe ignorierte die Karten-Einstellung

Bestaetigt und behoben - siehe `docs/navigation.md`. Der Score bleibt
unberuehrt, es ist reine Anzeige.

### AAII: neue Ansicht + Erklaerung neu

Sechste Ansicht "Weekly bars" nach Nutzer-Referenzbild. Erklaerung hinter dem
i-Knopf komplett neu geschrieben mit Begriffs-Glossar (Bullish/Neutral/Bearish/
Spread/pp/8-Wochen-Schnitt/Perzentil/Kapitulation-Sorglosigkeit) und einer
Beschreibung aller sechs Ansichten.

**Zwei falsche Schriftzuege mitkorrigiert.** Unter dem Lesebadge stand
*"Thresholds ±20pp. Long-run average +6.5pp, so they are not symmetric around
zero."* - beide Haelften falsch: die Schwellen SIND exakt symmetrisch um 0, und
die 520 hier aufgezeichneten Wochen (ab 2016-04-07) ergeben einen Mittelwert
von **+0,8pp**, nicht +6,5. Steht jetzt aus den eigenen Daten da und kann nie
wieder veralten. Derselbe Satz stand auch im Info-Text.

**Datenluecke sichtbar gemacht:** zwischen 2026-03-19 und 2026-08-12 fehlen
**20 Umfragewochen**, weil AAIIs veroeffentlichte Historien-Datei der eigenen
Live-Seite monatelang nachhing (dasselbe Problem, das 2026-08-19 zur
`AAII_STALE_DAYS`-Grenze gefuehrt hat). Die Saeulen sitzen in gleichem Abstand
nebeneinander - ohne Markierung las man aus der Achse einen lueckenlosen
Verlauf von Maerz bis August, den es nie gab.

### Neuer Waechter: `check/scorediff.js`

`rules.js` verlangte einen SCORE_MODEL_VERSION-Bump, weil `pairCarryAdj` und
`actualColor` im Diff standen. **Ein Bump waere hier falsch gewesen:**
`SCORE_MODEL_TAG` markiert damit die gesamte aufgezeichnete Historie als "aus
einem frueheren Modell", und die enthaelt ausschliesslich SYMBOL-Scores - die
sich nachweislich nicht geaendert haben.

Statt das zu behaupten, wird es jetzt nachgerechnet: `scorediff.js` rendert
`origin/main` und den Arbeitsbaum im selben Browser mit denselben Daten und
vergleicht jede Zahl.

```
  Symbol-Score (cmp)           0 von  16 veraendert
  Symbol-Score (roh)           0 von  16 veraendert
  Karten-Score                 0 von  96 veraendert
  Staerke 1-10                 0 von  16 veraendert
  Carry je Paar                5 von  35 veraendert
  Paar-Score                   5 von  35 veraendert
```

`rules.js` liest das Ergebnis und laesst den Bump nur dann entfallen. Fehlt es
(z.B. `--static`) oder ist es aelter als `index.html`, gilt die strenge Regel -
fail-closed. Die Regel ist damit **strenger** als vorher: bisher konnte man die
Nummer hochzaehlen, ohne dass sich etwas aendert, und niemand rechnete nach.

### Geprueft

Nutzer-Vorgabe steht: *"Bitte alle Aenderungen die du machst ueberpruef das
gruendlich und mach mehrere Tests."*

**Carry** (8 Pruefungen, 0 Abweichungen): Zinshistorie fuer alle 8 Waehrungen
vorhanden (12-25 Beschluesse); `rateAtDate` trifft jeden Beschlusstag exakt und
liefert am Vortag noch den alten Stand; vor dem aeltesten Beschluss `null`
statt einer geratenen Zahl; `carryStufe` an allen 11 Staffelgrenzen exakt;
`pairCarryAdj == pairCarryAdjAt(heute)` fuer **alle 28** FX-Paare;
Antisymmetrie `Carry(A/B) == -Carry(B/A)` fuer alle 56 geordneten Paare; der
heutige Punkt der Trends-Linie == `pairScore()` fuer alle 28 Paare; Panel
rendert mit Hinweistext.

**Actual-Farbe** (9 Pruefungen, 0 Abweichungen): `same` laesst die Rohrichtung,
`inverse` dreht sie exakt, `off` laesst sie; ohne Asset-Kontext immer die
Rohrichtung; Farbe und `ind.bias` widersprechen sich nicht mehr; Score stabil
ueber alle drei Einstellungen (3,4 → 3,4 → 3,4); FX-Waehrungen nie gedreht;
Nicht-Makro-Karten nie gedreht; **aus dem DOM gelesen**: 3 Farben drehen beim
Umschalten, 0 bleiben faelschlich stehen.

**AAII** (6 Ansichten × 5 Zeitraeume = 30 Renderlaeufe ohne Fehler): 96
Segmente = 32 Wochen × 3; alle Saeulen exakt gleich hoch (stapelt auf 100%);
jedes Bullish-Segment gegen den Datenwert geprueft (32/32); die drei
Beschriftungsstufen einzeln nachgewiesen (6M → 12 Dezimalwerte, 1J → 64
gerundete, MAX → keine); Luecken-Hinweis erscheint mit korrekter Wochenzahl;
Mittelwert und Anteil im Schwellensatz gegen die Rohdaten nachgerechnet;
Glossar auf 7 Pflichtbegriffe geprueft; Screenshots von Karte und Info-Modal
gesichtet.

**Eigener Fehler, vom eigenen Test gefunden:** `invalidateRateStepCache()`
wollte eine `const` neu zuweisen und warf still in einem `try/catch` von
`fetchIndData`. Folge: der Zinsstufen-Cache blieb auf dem `null` vom Boot
stehen, `rateSteps()` lieferte fuer alle acht Waehrungen `null` und der Carry
waere komplett ausgefallen. Ohne die Ende-zu-Ende-Pruefung waere das
unbemerkt live gegangen - `node --check` und der Syntax-Waechter sehen so etwas
nicht.

`node check/all.js` komplett gruen (12 Waechter).

---

## 2026-08-23 — Assets als Stapel in der Navigationsleiste (VERSION-CHECK-436)

Umbau nach Nutzer-Wunsch, Details in `docs/navigation.md`. Drei Punkte, die
beim Bauen nicht offensichtlich waren:

**1. Die Bias-Farben waren auf der Leiste unlesbar.** Vor dem ersten Rendern
gemessen: `BC.bull`/`BC.bear`/`BC.neu` kommen auf dem Chrome-Grund `#2A3757`
auf **1,98 / 1,94 / 1,89** — der Text waere praktisch unsichtbar gewesen.
`BC_NAV` mit aufgehellten Toenen derselben Familie liegt auf allen drei
Leisten-Untergruenden ueber 4,3:1.

**2. `check/nav.js` hat eine echte Annahme-Verletzung gemeldet.** Pruefung E
benutzte `fx` als Beispiel fuer "ein Tab ausserhalb jedes Stapels" - genau das
stimmt seit diesem Umbau nicht mehr. Der Test wurde **verschaerft** statt
entschaerft: er waehlt jetzt einen nachweislich stapelfreien Tab, prueft
gezielt den zuvor geoeffneten Stapel UND dass ueberhaupt keiner offen bleibt,
und bekommt mit E2 eine Gegenprobe (der Assets-Stapel MUSS auf der
Assets-Seite offen sein und Assets enthalten). Ohne E2 koennte eine spaetere
Verschaerfung von E den Stapel dauerhaft zuklappen, ohne dass es auffaellt.

**3. Aenderungsflaeche klein gehalten.** Das Zielelement behaelt die id
`sidebar` und die Zeilen `class="ab"`/`data-sym` - dadurch laufen
`updateSidebarSelection()`, die Score-Auffrischung und alle ~35
`renderSidebar()`-Aufrufer unveraendert weiter. Nur die Darstellung und die
CSS-Spezifitaet aendern sich.

**Geprueft** (10 Pruefungen, 0 Abweichungen): alte Spalte weg und `#sidebar`
haengt in der Navigationsleiste; alle **16** Assets im Stapel, 5 Kategorien;
jede Zeile hat Name/Score/Pfeil und der Score stimmt mit `symScoreCmp`; die
Farbe im DOM entspricht `navBiasCol` und ist **nirgends** eine der alten
dunklen `BC`-Farben; Klick navigiert und markiert genau einen Eintrag; der
Stapel klappt auf der Assets-Seite auf und auf anderen Seiten zu;
Bearbeitungsmodus aus = 0 Knoepfe, an = 42 Sortierknoepfe + Add + Done;
Sortieren wirkt und die DOM-Reihenfolge folgt dem Zustand; die aufgeklappte
Hoehe (558px) schneidet nichts ab. Dazu Screenshot-Sichtpruefung.

Tote Reste der alten Spalte entfernt: `.sb`, `.sb-lbl`, `.ab-move`, `.ab-del`,
`.add-sym`, `sbReorderId`, `sbCatReorder`, `sbCatClick`.

---

## 2026-08-23 — Asset-Zeilen: nur Namen, einfarbige Icons, keine Bias-Farben (VERSION-CHECK-437)

Drei Nutzer-Korrekturen am Tag zuvor gebauten Stapel, in dieser Reihenfolge:

1. *"mach die Asset Namen doch nur die Namen und mach davor die Flagge aber
   ohne Farben also eine Art icon aber schon die richtige Form und nicht
   animiert"* + *"entfern die Kategorien ... mach einfach wenn eine neue
   Kategorie anfaengt ganz bischen mehr Abstand nach unten"*
2. *"Also ich will alles in normalem Farben nicht in bias Farbe"*
3. *"Keine Abstaende zwischen den Kategorien"*

Endstand: Icon + Name, sonst nichts; normale Leisten-Farben; eine
durchgehende Liste ohne jede Gruppentrennung. Details in
`docs/navigation.md`.

**Der Icon-Satz ist neu gezeichnet, nicht entfaerbt.** Die vorhandenen
Flaggen bestehen aus farbigen Flaechen - auf eine Farbe gezwungen werden USA
und Japan zum selben gefuellten Rechteck. Jede Flagge ist deshalb als
GEOMETRIE neu gebaut. Beim ersten Wurf zu fein: bei 15px Hoehe ist eine
SVG-Einheit nur ~0,6px breit, 5 USD-Streifen und 11 EU-Sterne wurden zu einem
Fleck. Nach dem 3x-Screenshot vergroebert (3 Streifen, 8 Sterne, dickere
Striche) und auf 17px vergroessert.

**Zwei Waechter haben angeschlagen, beide zu Recht:**

- `check/display.js` las den Score aus dem sichtbaren Zeilentext - den es
  jetzt nicht mehr gibt. Die Pruefung wurde nicht entfernt, sondern **an die
  Stelle verschoben, an der die Zahl wirklich steht** (der Tooltip
  `data-tip`), und um eine Gegenprobe ergaenzt: in der Navigationsleiste darf
  **kein** `data-bv` mehr stehen, damit die Bias-Faerbung nicht durch die
  Hintertuer zurueckkommt.
- Beim Umbau von Runde 1 auf Runde 2 fiel ein **latenter Fehler** auf, den
  nur ein eigener Test gefunden hat: der Score-Sync (laeuft nach JEDEM
  `renderDetail`, ohne Neuaufbau der Leiste) schrieb `nm.style.color=BC[...]`
  - also die DUNKLEN Farbwerte. Nach der ERSTEN Bias-Aenderung im Betrieb
  waere der Name damit wieder auf 1,9:1 gelandet, obwohl er beim ersten
  Rendern korrekt aussah. Mit dem Wegfall der Bias-Faerbung hat der Sync fuer
  die Leiste jetzt ueberhaupt nichts mehr zu tun.

**Geprueft** (0 Abweichungen): 16 Assets; jede Zeile hat Name + Icon und
**kein** `.sb-score`/`.av` mehr; jedes Icon ist einfarbig (keine einzige
Farbangabe ausser `currentColor`), nicht animiert, ohne Verlauf/Referenz und
nicht leer; **alle** nicht ausgewaehlten Zeilen haben exakt EINE gemeinsame
Farbe (`rgb(148,163,192)`), die ausgewaehlte hebt sich ab und hat einen
Balken; ein Bias-Wechsel faerbt nichts mehr um; **alle Zeilenabstaende sind
gemessen gleich** (1px, keine Kategorie-Luecke); die Reihenfolge folgt
weiterhin der Kategorie-Sortierung; im Bearbeitungsmodus kommen die 5
Ueberschriften und 42 Sortierknoepfe zurueck. Dazu 3x-Screenshot aller 16
Icons auf dem Chrome-Grund. `node check/all.js` gruen (12 Waechter).

## 2026-08-23 — Kopfzeile: tiefes Blau, schmalere Suche, zentriertes Live/Version (VERSION-CHECK-438)

Nutzer-Wunsch: *„heb das FX in fx Analyst pro in einem tiefen kräftigen
dunklem blau heraus und mach auch den Kreis mit den Initialen oben rechts in
der Farbe und mach die suchleiste schmaler und zentrier das live und den
versioncheck. Und wenn man eine Kategorie auswählt wird die ja so
hervorgehoben mach das auch in diesem dunkelblau"*.

**Vier Änderungen, eine Variable.** FX-Logo, Profil-Kreis (jetzt immer blau,
nicht nur mit Sync-Initialen — vorher `--bg5`-Grau im Ruhezustand) und die
Auswahl-Markierung (aktiver Tab + aktive Asset-Zeile im neuen Stapel) tragen
alle `var(--blue)` (`#0B5FCC`). Die Auswahl-Markierung läuft über eine
gescopte `--accent`-Überschreibung (`.hdr,#navSidebar{--accent:var(--blue)}`),
nicht über eine neue Klasse — trifft dadurch automatisch beide Stellen
(`.np.on`, `#navSidebar .ab.np-asset.on`), ohne dass Bias-Farben im Inhalt
betroffen sind.

⚠ **Kehrt eine dokumentierte Vorentscheidung um.** Die Markierung war
bewusst Cyan, nicht Blau — Kommentar im Code seit dem dunklen Redesign:
„Blau ist im ganzen Rest der App die Bias-Farbe bullish, es als
Auswahl-Markierung zu verwenden macht die Zahlenfarbe mehrdeutig." Nutzer hat
das jetzt ausdrücklich so gewollt; Kommentar in `index.html` und
`docs/design-system.md` aktualisiert, damit die nächste Session weiß, dass
das eine bewusste Umkehr ist, kein übersehener Grundsatz.

**Kontrast unterhalb der sonst geforderten AA-Schwelle, absichtlich.**
`#0B5FCC` auf dem Header-Grund `#2A3757` misst nur ~2:1 (gegen `--bg4` sogar
~1,6:1) — das Dokument verlangt sonst ≥4,5:1 für Text. Hier gilt das nicht:
eine Auswahl-Markierung (Balken + Kreisfläche) ist kein Fließtext, und der
Effekt kommt aus Sättigung/Farbton, nicht aus Helligkeit — per Screenshot
geprüft (sichtbar deutlich abgesetzt), nicht nur per Zahl behauptet.

**Suchleiste + Live/Version-Cluster:** `.hdr-search` von `flex:1;max-width
480px` auf feste `320px` verkleinert; `.hdr-status` bekam `flex:1` +
`justify-content:center` und zentriert sich im so frei werdenden Platz.
Bleibt echtes Flex-Kind — keine absolute Positionierung, das führte laut
älterem Kommentar auf schmalen Screens zu Überlappungen mit Undo/Redo bzw.
dem Alarm-Zähler.

**Geprüft:** Kontrast/Farbwerte gemessen (Python, sRGB-Luminanz) statt
geschätzt; Playwright-Probe bestätigt `getComputedStyle` an allen vier
Stellen (`.logo-fx`, `#profileCircle`, `.np.on`-Rand/-Icon,
`#navSidebar .ab.np-asset.on`-Rand) exakt `rgb(11, 95, 204)`; Screenshots von
Kopfzeile (1440px und 1600px) und Navigationsleiste (Dashboard aktiv, Assets
mit ausgewähltem USD) — Logo, Kreis und beide Auswahl-Zustände sichtbar
deutlich abgesetzt, Suchleiste sichtbar schmaler, Live/Version-Cluster
sichtbar mittiger als vorher. `node check/all.js` komplett grün (12 Wächter,
inkl. `scorediff` — keine Score-Funktion angefasst, reines CSS).

## 2026-08-24 — Assets-Stapel: Animation, Bearbeitungsmodus sichtbar/erreichbar (VERSION-CHECK-439)

Nutzer-Bugreport: *„wenn man den ausklappt ist da keine Animation und man
kommt schnell in den Bearbeitungsmodus aber den sieht man nicht richtig und
man kommt nicht mehr raus."* Drei Fixes, alle im selben CSS-Mechanismus
verwurzelt. Vollstaendige technische Herleitung in `docs/navigation.md`
("Drei Fehler im aufgeklappten Stapel").

**1. Keine Animation:** `#navSidebar .np-sub-wrap.np-assets.open{max-height:
none}` liess sich nicht zu einem Pixelwert animieren, und `syncNavExpanded()`s
`scrollHeight`-Lesen zwang den Browser, genau diesen Zwischenzustand synchron
aufzuloesen - die Animation sprang seither direkt auf die Endgroesse.
Ersatzlos entfernt, da `syncNavExpanded()` ohnehin nach jedem Render die
exakte Hoehe inline setzt.

**2. Bearbeitungsmodus verschwand:** `.np-sub-wrap` hatte kein
`flex-shrink:0` - die Navigationsleiste (selbst ein Flex-Container) hat den
aufgeklappten Stapel bei zu wenig Platz einfach ZUSAMMENGEDRUECKT statt
selbst zu scrollen. Gemessen: `max-height` und `scrollHeight` korrekt auf
669px, tatsaechliche Rendergroesse aber nur 568px - der "Done"-Knopf war
genau um die fehlenden 101px lautlos abgeschnitten.

**3. Auto-Scroll traf den falschen Container:** die naheliegende Loesung
`row.scrollIntoView({block:'nearest'})` griff nachweislich `.np-sub-wrap`
selbst (das `overflow:hidden` fuer die Animation traegt), nicht die
tatsaechlich sichtbare `#navSidebar` - der Aufruf verschob lautlos einen
internen, fuer den Nutzer nicht existenten Scroll-Offset. Neue Funktion
`scrollIntoNav()` rechnet explizit gegen `#navSidebar`.

**Geprueft, jeweils am eigentlichen Mechanismus, nicht nur am Endzustand:**
Frame-fuer-Frame-Messung der Aufklapp-Animation (0 -> 112 -> 313 -> 420 ->
447px ueber ~160ms, statt sofortigem Sprung); Long-Press per echtem
Playwright-Mausereignis (nicht nur Funktionsaufruf) mit Positionsvergleich
der gedrueckten Zeile UND des Done-Knopfs gegen die tatsaechliche
`#navSidebar`-Bounding-Box (nicht gegen 0/clientHeight, dieser Fehler in der
ERSTEN Testfassung haette einen falschen Fehlalarm geliefert); Klick auf
Done fuehrt `sbEditMode` nachweislich auf `false` zurueck. `node check/all.js`
komplett gruen (12 Waechter).

## 2026-08-24 — Kategorien im Assets-Stapel zurueck, app-weit leicht kursiv (VERSION-CHECK-440)

Nutzer-Wunsch: *"Füg doch wieder die Kategorien hinzu aber füg überall bei
so Kategorien ein das das leicht kursiv geschrieben ist."* Kehrt die
Entfernung vom Vortag (VERSION-CHECK-437/438, "Keine Abstaende zwischen den
Kategorien") wieder um - dritter Zustandswechsel in Folge, Chronologie jetzt
in `docs/navigation.md` festgehalten, damit niemand das nochmal hin- und
herbaut.

**Kategorien wieder dauerhaft sichtbar.** FX/Crypto/Metals/Energy/Indices
stehen jetzt immer da, nicht mehr nur im Bearbeitungsmodus. Nur die
zugehoerigen ▲▼-Sortierknoepfe (fuer ganze Kategorien) bleiben
Bearbeitungsmodus-exklusiv. Die Gruppierung selbst (`computeSbCats`) war in
allen drei bisherigen Zustaenden unveraendert vorhanden - nur ihre
Sichtbarkeit als Ueberschrift wurde bewegt.

**Kursivierung systematisch, nicht pauschal.** "überall bei so Kategorien"
war als Regel zu verstehen, nicht als einzelne Klasse - im Code gesucht nach
ALLEN Labels mit exakt derselben Rolle wie `.np-cat-l` (eine Liste in
benannte Gruppen aufteilen), nicht nach jedem uppercase-Mikrolabel (davon
gibt es 60+, darunter Tabellenkoepfe und Formularlabel, die eine andere
Aufgabe haben). Gefunden und kursiv gemacht: `.search-grp` (Sucher-Modal:
Assets/Indicators/Events/Tabs), `.mover-group-hdr` (Dashboard:
Gainers/Losers), `.res-lib-sec` (Research-Bibliothek: Topics/Assets).
Bewusst NICHT angefasst: `.res-flbl` (Formularlabel im Notiz-Dialog),
Tabellenkoepfe, einzelne Seitenueberschriften - andere Rolle, keine
Listen-Gruppierung.

**Geprueft:** alle 5 Kategorien ausserhalb des Bearbeitungsmodus im DOM und
in der Sortier-Reihenfolge geprueft; `font-style:italic` an allen vier
Stellen per `getComputedStyle` bestaetigt; Sortierknoepfe aus (0) / an (5)
im Bearbeitungsmodus-Wechsel; Regressionscheck der Aufklapp-Animation vom
Vortag (Frame-fuer-Frame, 6 -> 574px ueber mehrere Zwischenwerte, nicht nur
ein Sprung) - der neue Header-HTML-Block haette denselben Zwischenzustands-
Fehler reproduzieren koennen, tut es nicht. `node check/all.js` komplett
gruen (12 Waechter).

## 2026-08-24 — Halbgewicht-Indikatoren wieder als Box dargestellt (VERSION-CHECK-441)

**Nutzer-Wunsch (woertlich):** "Ich habe ja paar Indikatoren also welche die
zusammengehören und sich das Gewicht teilen das war auch früher optisch
dargestellt mach das wieder."

**Befund vor dem Fix:** In `index.html` existierten `CORE_PAIRS` (halbiert
das Score-Gewicht bei CPI/Core CPI, PPI/Core PPI, PCE/Core PCE, ZEW/Ifo) und
`IND_PAIR_GROUPS` (dieselben Paare plus Net Bullish/Net Bearish Positioning
und die Anleiherenditen-Gruppe 2Y/10Y/Spread) bereits als Konstanten -
umgeben von mehreren Kommentarbloecken, die eine "gemeinsam umrandete
.ind-pair-group"-Box beschrieben. Diese Box war aber **nie tatsaechlich
implementiert**: `git log -S "ind-pair-group"` zeigt nur einen einzigen
Commit, der ausschliesslich Kommentartext hinzufuegte, keine CSS-Klasse und
keine Wrapping-Logik. `renderIndsTable()`/`renderIndRow()` (die aktuelle
Tabellen-Darstellung seit dem Kartenumbau vom 2026-07-28) zeichneten jede
Zeile vollkommen unabhaengig - die Box war reine Absichtserklaerung, kein
Code. Der Nutzer erinnerte sich richtig, dass es das mal gab (vermutlich aus
der alten Karten-Darstellung, dort aber ebenfalls nicht mehr im Code
auffindbar) - der Fehler lag darin, dass die Absicht beim Tabellen-Umbau nie
umgesetzt wurde.

**Fix:** Neue Funktion `indPairGroupPositions(inds)` (vor `renderIndsTable`)
scannt die tatsaechlich in einer Rubrik vorhandenen Indikatoren auf
**direkt benachbarte** Laeufe derselben `IND_PAIR_GROUPS`-Gruppe und liefert
pro Index `null`/`'first'`/`'mid'`/`'last'`. Nur Laeufe mit mindestens zwei
Mitgliedern zaehlen (steht z.B. nur CPI ohne Core CPI in der Liste, oder
stehen beide, aber nicht direkt nebeneinander, bleibt die Zeile ungruppiert
- genau das bestehende Kriterium aus `indIsCorePaired`). `renderIndRow()`
bekommt die Position als Parameter und setzt bei Treffer die Klassen
`ind-pair-row ind-pair-first/-mid/-last` auf die `<tr>`. CSS zeichnet daraus
eine Box: gemeinsamer Hintergrundton (`var(--bg5)`) ueber alle
Gruppenmitglieder, kein `border-bottom` zwischen den Mitgliedern (kein
Innen-Divider), dafuer ein kraeftigerer Rand oben an der ersten und unten an
der letzten Zeile (`var(--bd2)` statt des normalen `var(--bd)`). Bias, Score
und Stichpunkte jedes einzelnen Indikators bleiben komplett unangetastet -
nur die Umrandung ist neu.

**Geprueft (Playwright):** `indPairGroupPositions()` liefert fuer USD/
Inflation exakt die erwarteten Positionen (CPI+Core CPI, PPI+Core PPI,
PCE+Core PCE je first/last; Inflation Expectations ohne Partner bleibt
`null`; 2Y/10Y/Spread first/mid/last); die erzeugten DOM-Klassen stimmen
1:1 damit ueberein; `getComputedStyle` bestaetigt `border-top`/
`border-bottom` an erster/letzter Zeile und den gemeinsamen Hintergrund;
Net Bullish/Net Bearish Positioning (USD-COT-Rubrik) wird korrekt gruppiert.
Negativfaelle explizit gegengeprueft: CPI ohne Core CPI in der Liste bleibt
ungruppiert, CPI und Core CPI mit einem Indikator dazwischen (nicht direkt
benachbart) bleiben ebenfalls ungruppiert. Screenshot der Inflation-Rubrik
zeigt die drei Core-Paar-Boxen und die Bond-Yield-Box visuell klar von der
alleinstehenden Zeile "Inflation Expectations" abgesetzt. `node
check/all.js` komplett gruen.

## 2026-08-24 — Watchlist-Gruppe in Asset-Filtern + Set-ups Neutral-Spalte nach Score (VERSION-CHECK-442)

**Nutzer-Wunsch (woertlich):** "Ich will das in Asset filtern eine neue
Kategorie drinne isr die Watchlist heißt alle Assets die in der Watchlist
sind solle da automatisch immer hinein und raus gemacht werden und die
Kategorie soll im Filter ganz oben stehen. Und bei top set ups die Spalte
neutral bitte nach Score absteigend sortieren." Rueckfrage per
`AskUserQuestion` noetig, da "Asset filtern" auf mehrere Stellen im Code
passen konnte (Assets-Stapel in der Sidebar, `assetFilterSelect()`-Dropdowns
bei COT/Put-Call/Seasonality/Edge, Waehrungs-Chips bei Set-ups/Compare) -
Nutzer-Antwort: gemeint sind die Dropdown-Filter bei COT/Retail/Trends usw.
Zweite Rueckfrage zu FX-Waehrungen (die Watchlist fuehrt nur Paare/Nicht-FX-
Assets, keine einzelnen Waehrungen) - Antwort: nur Nicht-FX-Assets sollen in
der neuen Gruppe erscheinen, FX-Waehrungen bleiben aussen vor.

**Teil 1 - Watchlist-Gruppe in den Asset-Filtern.** Zwei parallele Helfer
bauen diese Dropdowns quer durchs Projekt: `assetFilterSelect()` (volles
`<select>`, genutzt bei COT/Retail, Put/Call, Net Options Flow, Seasonality,
Edge, Data-Linking) und `groupedAssetOptions()` (nur die `<optgroup>`s ohne
umgebendes `<select>`, genutzt bei Trends). Neue gemeinsame Funktion
`watchlistedAssetIds(ids)` filtert aus einer gegebenen Asset-ID-Liste die
Nicht-FX-Assets heraus, die gerade per `isWatched(watchPairNameForAsset(id))`
einzeln in der Watchlist stehen (Gold/Silber/Oel/BTC/ETH/Indizes - dieselbe
Ableitung, die schon an anderen Stellen "Watchlist als einzige Wahrheit"
nutzt). FX-Waehrungen (USD, EUR, ...) werden nie einzeln beobachtet, nur als
Teil eines Paars (z.B. EUR/USD) - sie bleiben deshalb bewusst aussen vor,
sonst stuende USD durch fast jedes beobachtete Paar praktisch immer in
dieser Gruppe. Beide Helfer stellen jetzt eine `optgroup label="Watchlist"`
VOR die normalen SB_CATS-/Klassen-Gruppen (FX/Crypto/Metals/Energy/
Indices/...) - ein beobachtetes Asset taucht dadurch bewusst doppelt auf
(einmal in der Watchlist-Gruppe oben, einmal in seiner regulaeren Kategorie
weiter unten, wie eine Favoriten-Zeile). Kein neuer persistenter Zustand:
rein aus `isWatched()` abgeleitet, ein Asset wandert automatisch rein/raus,
sobald es zur Watchlist hinzugefuegt oder entfernt wird.

**Teil 2 - Set-ups Neutral-Spalte nach Score.** `renderPairs()` sortierte die
drei Spalten Bullish/Neutral/Bearish bisher unterschiedlich: Bullish streng
nach Score absteigend, Bearish nach Score aufsteigend (am staerksten
bearish zuerst), Neutral aber nach `Math.abs(score)` absteigend - der am
staerksten negative Ausreisser stand dadurch neben dem staerksten positiven
ganz oben, was nicht "nach Score sortiert" liest. Jetzt schlicht
`(a,b)=>b.score-a.score` wie bei Bullish - die Spalte steigt jetzt
gleichmaessig von "am ehesten bullish" zu "am ehesten bearish" durch.

**Geprueft (Playwright):** `assetFilterSelect(COT_SYMS, ...)` zeigt vor dem
Beobachten von Gold/BTC keine Watchlist-Gruppe, danach eine mit genau Gold
und BTC (nicht EUR/USD trotz beobachtetem Paar), an erster Position vor
allen anderen Optgroups; nach dem Entfernen verschwindet die Gruppe wieder.
`groupedAssetOptions(trendAssets())` (Trends) ebenso geprueft. Fuer die
Neutral-Sortierung vier kuenstliche Paare mit Scores -3/+5/+0.5/-7 in eine
echte Set-ups-Kategorie gehaengt, `renderPairs()` echt aufgerufen und die
DOM-Reihenfolge der Namen in der Neutral-Spalte gelesen - Ergebnis
CCC/DDD(+5) → EEE/FFF(+0.5) → AAA/BBB(-3) → GGG/HHH(-7), exakt Score
absteigend. `node check/all.js` komplett gruen.

## 2026-08-24 — Nachtrag: Watchlist-Gruppe fehlte bei Retail Sentiment + Trends Pair-Modus (VERSION-CHECK-443)

**Nutzer-Bugreport (per Screenshot, Retail-Sentiment-Filter offen):** "Was
für Aufgaben laufen gerade noch und guck die Kategorie isr nicht da."

**Ursache:** VERSION-CHECK-442 hatte die Watchlist-Optgroup nur in den zwei
gemeinsamen Helfern eingebaut, die die meisten Asset-Filter im Projekt
teilen (`assetFilterSelect()` fuer COT/Put-Call/Net-Options-Flow/
Seasonality/Edge/Data-Linking, `groupedAssetOptions()` fuer den Trends-
Haupt-Filter `trendsCcySel`). Zwei Filter haben aber eine EIGENE, paar-
basierte Dropdown-Logik, weil ihre Optionen keine einzelnen Asset-IDs sind,
sondern PAARE: `sentFilterBar()` bei Retail Sentiment (Broker-Symbole wie
"EURUSD", eigene Gruppierung FX Pairs/Other Assets, siehe Kommentar dort:
"passt nicht 1:1 in SB_CATS") und der `trendsPairSel`-Select im Trends-Paar-
Modus (`ALL_PAIRS`/`FX_PAIRS`). Diese beiden hatte ich beim ersten Durchgang
uebersehen, weil sie strukturell nichts mit den beiden bearbeiteten Helfern
teilen - `grep "optgroup label="` haette sie sofort gezeigt, das haette ich
vor der ersten Umsetzung schon machen sollen statt erst jetzt.

**Fix.** `sentFilterBar()`: neue Funktion `sentSymWatched(sym)` uebersetzt
ein Broker-Symbol zurueck (Nicht-FX ueber `SENT_NONFX_PRICE_ID` + 
`watchPairNameForAsset()`, FX-Paare durch Slash-Einfuegen bei sym.slice(0,3)+
'/'+sym.slice(3)) und prueft `isWatched()`; die Watchlist-Gruppe steht jetzt
ganz oben vor "FX Pairs"/"Other Assets". `trendsPairSel`: baut die Optionen
jetzt bei JEDEM `renderTrends()`-Aufruf neu (vorher einmalig gecacht via
`dataset.opts`, was die Watchlist-Gruppe nach dem ersten Aufbau nie mehr
aktualisiert haette) und filtert `ALL_PAIRS` direkt mit `isWatched()` in eine
eigene Watchlist-Gruppe vor "FX Pairs"/"Other Assets".

**Bewusster Unterschied zu VERSION-CHECK-442:** bei diesen zwei paar-
basierten Filtern zaehlt ein beobachtetes FX-Paar selbst (z.B. EUR/USD),
nicht nur Nicht-FX-Assets - anders als bei den Einzel-Asset-Filtern (COT/
Trends-Hauptfilter/...), wo FX-Waehrungen bewusst ausgenommen sind, weil
sonst z.B. USD durch fast jedes beobachtete Paar staendig in der Gruppe
stuende. Hier ist die Einheit ohnehin schon das Paar - ein konkretes Paar in
der Watchlist ist eine gezielte Auswahl, das "USD ueberall"-Problem besteht
strukturell nicht.

**Geprueft (Playwright):** `sentFilterBar()` zeigt vor dem Beobachten keine
Watchlist-Gruppe, nach dem Beobachten von EUR/USD und Gold eine mit genau
"EURUSD" und "XAUUSD" ganz oben, verschwindet nach dem Entfernen wieder.
`trendsPairSel` (Trends im Paar-Modus) zeigt nach dem Beobachten von GBP/JPY
eine Watchlist-Gruppe mit "GBP/JPY" ganz oben vor "FX Pairs", verschwindet
nach dem Entfernen wieder. `node check/all.js` komplett gruen.

## 2026-08-24 — Neue Asset-Kategorie "Yields" + Quicklink-Audit (VERSION-CHECK-444, SCORE_MODEL_VERSION 7)

**Nutzer-Wunsch (woertlich):** "Füg bitte yields als neue Asset Kategorie
hinzu. Mach auch schon die Assets darein. Zur jeder Währung ein yield also
zB US-Yield, NZ-Yield usw also wie bei TradingView nur halt ohne die Jahres
Zahl und mit yield dahinter. Als Icon verwende ein bond oder yield Symbol
kombiniert mit dem Flaggen Icon. Verbinde die yields schonmal direkt mit
der Währung und mach interest Rates bullish, Inflation bullish,
labourmarket bullish, Economic Groth bullish und risk Sentiment wenn das
auf Full oder half steht ist das auch bullish. Die quicklinks führen dann
auch einfach zu den Daten wo dann die verknüpfte währung ausgewählt ist.
Und generell bei den quicklinks wenn man die vonden Assets benutzt ist
teilweise nicht schon die Währung ausgewählt Check das nochmal ob das
überall so ist."

**Rueckfrage vorab (AskUserQuestion):** "Asset filtern" aus einer fruehreren
Anfrage im selben Tag hatte sich als der `assetFilterSelect()`-Dropdown
(COT/Retail/Trends) herausgestellt, nicht der Assets-Stapel - fuer DIESE
Anfrage war "Asset Kategorie" dagegen eindeutig der Assets-Stapel selbst
(explizit "Kategorie" + "Assets darein"), keine Rueckfrage noetig. Vor der
Umsetzung aber ausgiebig recherchiert statt geraten: `git log -S
"ind-pair-group"`-artige Recherche zeigte, dass `linkCcy`/`MACRO_DERIVE_
RULES`/`RISK_ENV_DEFAULT_DIR` (das bestehende Gold/DAX/GER100-Ableitungs-
System) bereits GENAU die gewuenschte Automatik bereitstellen - kein neues
Score-System noetig, nur neue Eintraege im bestehenden.

**Die 8 neuen Assets.** Ein Asset pro FX-Major, ids `USYIELD/DEYIELD/
GBYIELD/CHYIELD/JPYIELD/CAYIELD/AUYIELD/NZYIELD`, Namen `US Yield/DE Yield/
GB Yield/CH Yield/JP Yield/CA Yield/AU Yield/NZ Yield` (TradingView-Bond-
Ticker-Konvention ohne die Laufzeitzahl - `DE10Y` -> "DE Yield"). EUR
bekommt bewusst "DE Yield" statt "EU Yield": `bond_data.json` fuehrt fuer
EUR den deutschen 10Y-Bund als Eurozone-Referenzwert (Quelle: investing.com/
germany-10-year-bond-yield) - "EU Yield" waere ein Aggregat vorgetaeuscht,
das in den Daten gar nicht existiert. Jedes Asset bekommt via `linkCcy`
seine Waehrung UND den vollen `mkRubs()`-Rubrik-Satz wie jedes andere Asset
(Inflation/Interest Rates/Labour Market/Economic Growth/COT Data/Risk
Environment) - dieselbe Struktur wie GOLD/DAX/GER100, kein Spezialfall.

**"Verbinde die yields direkt mit der Waehrung" + die vier Bullish-Regeln.**
`linkCcy` allein zieht ueber die BESTEHENDE Maschinerie automatisch: (a) die
echten 10Y/2Y/Spread-Werte im Inflation-Kartenblock (`applyBondDataFeed()`
liest ueber `macroCcyFor(id)`, exakt dieselbe Funktion, die jede Waehrung
selbst nutzt), (b) die Makro-Kartentexte/Zusammenfassungen (`syncMacroRub`/
`pullMacroFromCcy`). Fuer die vier Bullish-Regeln (Interest Rates/Inflation/
Labour Market/Economic Growth) neue `MACRO_DERIVE_RULES`-Eintraege je Yield-
Asset mit allen vier Rubriken auf `'same'` - starke Daten (heisse Inflation,
robuster Arbeitsmarkt, hawkishe Zinserwartung, starkes Wachstum) gelten fuer
ein Yield-Asset als bullish, genau wie fuer die Waehrung selbst. Fuer "Risk
Sentiment Full/Half = bullish" reichte ein neuer `RISK_ENV_DEFAULT_DIR`-
Eintrag `'bullish'` je Asset - 'bullish' bedeutet in diesem bereits
bestehenden System exakt das: der Regler wird bei Half/Full als bullisch
verbucht (Definition siehe `RISK_ENV_DIRS`), bei None ohne Wirkung.

**Icon.** `AI_GLYPHS` (Sidebar, einfarbig) und `AI_SYMBOLS` (grosser
animierter Kopf-Icon-Satz) bekommen je 8 neue Eintraege: die BESTEHENDE
Waehrungs-Zeichnung wird als Ganzes per `transform="scale(.78)"` verkleinert
(Ursprung oben links, dadurch bleibt sie am Eck verankert) - das gibt unten
rechts Platz fuer ein neues Anleihe-Abzeichen (Ticket-Umriss mit zwei
Linien, im Sidebar-Satz in `currentColor`, im grossen Satz in einer festen
dunklen Farbe mit weissen Linien, da der Flaggenhintergrund dort stark
wechselt und ein reines Konturzeichen auf hellen Flaggen wie CHF kaum
sichtbar waere). Keine einzige bestehende Flaggen-Pfad-Koordinate wurde
dafuer angefasst - deutlich weniger fehleranfaellig als jede Flagge einzeln
in ein Eck-Layout umzuzeichnen.

**Quicklinks zeigen die verknuepfte Waehrung.** `assetQuickGo()` loest fuer
Yield-Assets (`assetCls(id)==='yield'`) bei den fuenf "eigene Daten"-Zielen
(Seasonality/Trends/COT/Data/News) auf `macroCcyFor(id)` auf, weil diese
Systeme unter z.B. "USYIELD" keine eigenen Eintraege kennen (kein COT-
Kontrakt, keine Preishistorie) - anders als GOLD/BTC/DAX, die dort echte
eigene Daten haben und weiter mit ihrer eigenen ID verlinken.

**Nebenbefund 1 - Quicklink-Audit (Nutzer-Wunsch: "Check das nochmal ob das
ueberall so ist").** Von den 8 `ASSET_QUICK_LINKS` waren `sent`/`rate`/`cal`
bei JEDEM Asset (nicht nur den neuen Yields) nie vorgefiltert - sie fielen
in `assetQuickGo()` auf `showTab(tabId)` ohne jede Auswahl zurueck, weil sie
im if/else schlicht fehlten. Fix betrifft alle Assets gleichermassen:
`rate`/`cal` rufen jetzt `setRateProbCcy`/`setCalCcyFilter` mit
`macroCcyFor(id)` auf (fuer eine FX-Waehrung identisch mit sich selbst, fuer
GOLD z.B. weiterhin USD), `sent` wechselt zusaetzlich auf den Put/Call-
Unterreiter und setzt `pcAsset`.

**Nebenbefund 2 - Karten-Zusammenfassungen zeigten die ID statt des
Namens.** Beim Testen fiel auf, dass generierte Kartentexte "for USYIELD"
statt "for US Yield" sagten. Ursache: 8 Stellen in der Zusammenfassungs-
Engine (`assetVerdictClause`, `noSignalFallback`, `summarizeGeneric`, die
Risk-Environment-Saetze) bauten `for ${sym.id}` statt `for ${sym.name}` -
bei FX/GOLD/BTC unsichtbar (id === Name), bei GER100 bereits leise falsch
("for GER100" statt "for GER 100"), bei den neuen Yields (id sehr
verschieden vom Namen) deutlich sichtbar. Alle 8 Stellen auf `sym.name`
korrigiert.

**Cross-Device-Sync fuer bereits gespeicherten Zustand.** `loadState()` (der
normale Boot-Pfad) merged fehlende `DEF`-Eintraege schon lange automatisch
in gespeicherte `syms` (`DEF.map(def => saved-Version || {...def})`) - neue
eingebaute Assets erscheinen dadurch von selbst bei jedem Reload. `applySnap()`
(der gemeinsame Trichter fuer Cloud-Sync/Undo-Redo/Import laut CLAUDE.md-
Grundsatz) hatte diesen Mechanismus aber NICHT - ein alter Snapshot (anderes
Cloud-Geraet, ein Undo ueber die Einfuehrung hinweg) haette die neuen Assets
dort stillschweigend wieder entfernt. Neue Funktion `ensureBuiltinSyms()`
schliesst diese Luecke (nur echt fehlende `DEF`-ids werden ergaenzt, nichts
an vorhandenen/vom Nutzer veraenderten Symbolen angefasst).

**SCORE_MODEL_VERSION 6 -> 7.** `isNonFx()` bekam die neue Klasse `'yield'` -
`check/rules.js` flaggte das automatisch als Score-Formel-Aenderung, `check/
scorediff.js` zaehlte 72 geaenderte Stellen. Wichtig fuer kuenftiges
Nachvollziehen: das ist KEINE Formel-Aenderung fuer ein bestehendes Asset -
alle 72 Stellen sind die neuen Yield-Assets selbst (die vorher schlicht
nicht existierten). Trotzdem gebumpt, siehe Merksatz in `docs/score-
model.md`.

**Geprueft (Playwright, mehrere Durchgaenge):** alle 8 Yield-Assets in
`syms`/`computeSbCats()`/`getSbIds()` vorhanden, `assetCls`/`isNonFx`/
`CLS_CAT` korrekt; Icons liefern SVG ohne Fehler (Sidebar-Glyph + grosser
Kopf-Icon, Screenshot bestaetigt: verkleinerte Flagge + Anleihe-Abzeichen
klar erkennbar bei allen 8); `effDeriveRules`/`rubAutoDerived` liefern
ueberall `'same'`; `RISK_ENV_DEFAULT_DIR`/`riskEnvDirOf` liefern `'bullish'`;
echter 10Y-Bond-Yield-Wert im Inflation-Kartenblock bestaetigt (4,736% fuer
USYIELD, identisch mit `bond_data.json`); `symScoreCmp` wirft fuer keins der
8 einen Fehler. Alle 8 Quicklinks fuer US Yield geprueft (sieben davon
korrekt auf "USD" vorgefiltert, Sentiment korrekt auf Put/Call+USD) UND als
Regressionscheck bei GOLD (die 5 "eigenen Daten"-Ziele bleiben auf "GOLD"
selbst, die 3 reparierten zeigen jetzt "USD"). Migrations-Test: echten
gespeicherten Snapshot genommen, die 8 Yield-Assets simuliert entfernt (wie
ein Nutzer VOR diesem Feature), einmal per echtem Seiten-Reload
(`loadState()`) und einmal per direktem `applySnap()`-Aufruf (Cloud/Undo-
Pfad) - beide Male kamen alle 8 automatisch zurueck. `node check/all.js`
komplett gruen (inkl. `rules` nach dem SCORE_MODEL_VERSION-Bump).

## 2026-08-24 — Zwei Indikatoren entfernt (NFIB, Leading Index) + applySnap()-Migrationsluecke geschlossen (VERSION-CHECK-445, SCORE_MODEL_VERSION 8)

**Nutzer-Wunsch (woertlich):** "entfern überall die indikatoren Leading
Index und NFIB Small Business Optimism und sag mir als du diese
indikatoren hinzugefügt hast waren das nur die zwei oder noch mehr? und
entfern alles zu den indikatoren also auch den score impact alles."

**Antwort auf die Rueckfrage:** beide wurden am 2026-08-20 zusammen mit DREI
weiteren Umfrage-Indikatoren in einer Sammelaktion eingefuehrt
(`NEUE_UMFRAGEN_2026_08`): ZEW Economic Sentiment (EUR), Ifo Business
Climate (EUR) und Inflation Expectations (USD). Diese drei wurden NICHT mit
entfernt - nur die zwei ausdruecklich genannten.

**"Ueberall" bedeutete sechs Fundstellen in `index.html` plus zwei im
Workflow:** (1) `mkRubs()` - die Vorlage fuer ein frisches Profil, (2) eine
identische Kopie davon als Fallback, falls einer bestehenden Karte die
komplette Economic-Growth-Rubrik fehlt, (3) `NEUE_UMFRAGEN_2026_08` - die
Migration, die sie bei jedem Laden fuer USD nachtraegt, waere sie sonst bei
jedem Reload wieder aufgetaucht, (4) der Kalender-Event-Matcher (`IND_EVENT_
MATCHERS`-artige Map), der echte FF-Kalendertitel diesen Indikatoren
zuordnet - jetzt toter Verweis, entfernt, (5) neuer `RUB_IND_REMOVE
['Economic Growth']`-Eintrag fuer die AKTIVE Bereinigung bereits gespeicherter
Profile. Im Workflow (`update-ff-calendar.yml`) zwei Matcher-Zeilen, die
`ind_data.json` mit Werten fuer diese Indikatoren befuellt haetten.

**Nebenbefund - `applySnap()` hatte dieselbe Migrations-Luecke wie
`ensureBuiltinSyms()` in VERSION-CHECK-444.** `loadState()` (normaler
Boot-Pfad) ruft ueber `addMacroRub()` die VOLLE `migrateRubInds()` auf -
inklusive des `RUB_IND_REMOVE`-Filters. `applySnap()` (der gemeinsame
Trichter fuer Cloud-Sync/Undo-Redo/Import) rief bisher nur ein von Hand
abgeschriebenes TEILSTUECK auf (`stripGeopoliticsRub`/`migrateRiskEnvRub`/
`moveYieldIndsToInflation`/`addSurveyInds`/`cleanDeriveRules`, OHNE den
`RUB_IND_REMOVE`/Rename/Dedup-Schlussteil). Ein alter Cloud-Snapshot oder
ein Undo ueber die Entfernung hinweg haette die beiden Indikatoren (und
grundsaetzlich JEDEN kuenftigen `RUB_IND_REMOVE`-Eintrag) also nie bereinigt
bekommen. Fix: `applySnap()` ruft jetzt direkt `migrateRubInds(sy.rubrics,sy)`
pro Symbol auf statt der Teilkopie - dieselbe Korrektur wie bei
`ensureBuiltinSyms()`, nur fuer Indikator- statt Symbol-Vollstaendigkeit.

**SCORE_MODEL_VERSION 7 → 8** - siehe `docs/score-model.md`, diesmal ECHT
score-relevant (21 geaenderte Stellen laut `scorediff.js`), da sich die
Indikatorenzahl in USDs Economic-Growth-Karte aendert und das (Modus
`normalized`) auch die Staerke-Note anderer Waehrungen mitverschiebt.

**Geprueft (Playwright):** kein Symbol (FX oder Yield) fuehrt die beiden
Indikatoren noch in seiner Economic-Growth-Karte; `mkRubs()` baut sie nicht
mehr; ZEW/Ifo/Inflation Expectations unangetastet bestaetigt. Migrations-
Test: die zwei Indikatoren kuenstlich in USDs gespeicherte Karte
zurueckgeschrieben (wie ein alter Snapshot sie noch haette) und per
direktem `applySnap()`-Aufruf entfernt - vorher vorhanden, nachher weg.
`node check/all.js` komplett gruen (inkl. `rules` nach beiden Versions-Bumps).

## 2026-08-24 — Mehrfach-Waehrungsfilter bei COT/Retail/Trends + Score-Zahl im Assets-Stapel (VERSION-CHECK-446)

**Nutzer-Wunsch 1 (woertlich):** "bei set ups gibt es den filter nach
einzelnen währungen und all und fx ich will das du die optionen auch bei
anderen grafiken ergänzt wo so ein filter sinn macht auch wenn es schon ein
einezelen paar filter gibt und mach bitte da noch einen filter button hin
ähnlich wie fx einmal non fx und yields."

**Praezisierung per Rueckfrage.** Erste AskUserQuestion-Runde schlug COT +
Retail Sentiment vor (Balken-Listen mit allen Assets gleichzeitig) - Antwort
korrigierte das Verstaendnis: bei Retail Sentiment zeigt der UNGEFILTERTE
Zustand bereits viele Assets, der bestehende Einzel-Dropdown schraenkt aber
IMMER auf genau eins ein (mit mehr Detail, aber nur eine Ansicht). Der neue
Filter soll die Luecke dazwischen fuellen: MEHRERE gewaehlte Assets
gleichzeitig sehen (nur der aktuelle Tag, keine Einzel-Historie - akzeptiert
als Kompromiss). Zweite Runde bestaetigte "ergaenzen, nicht ersetzen".

**Wo umgesetzt (nach diesem Kriterium durchsucht):** COT (`renderCot` -
Balken+Tabelle fuer alle COT_SYMS), Retail Sentiment (`renderRetailBars` -
Balken fuer alle Myfxbook-Paare) und Trends (`renderTrends` im "All assets"/
"FX only"-Modus - mehrere ueberlagerte Linien). NICHT umgesetzt: Put/Call
Ratio, Net Options Flow, Seasonality, Edge (alle vier zeigen strukturell
IMMER nur eine Linie/Tabelle, markt-weit oder fuer genau ein Asset - kein
"mehrere gleichzeitig"-Zustand existiert dort, den man erweitern koennte).
Compare hat bereits sein eigenes vollwertiges Mehrfach-Chip-System - kein
Aenderungsbedarf, Yields tauchen dort automatisch unter "Assets" auf
(isNonFx() schliesst die Kategorie seit VERSION-CHECK-444 ein).

**Zwei neue Helfer** (`multiAssetFilterBarHtml`/`applyMultiAssetFilter`)
fuer COT und Trends, deren Listen bereits direkt einzelne Asset-IDs fuehren.
Retail Sentiment bekam eine EIGENE Variante (`sentMultiFilterBarHtml`/
`sentItemMatchesMulti`): die Listeneintraege dort sind Broker-PAARE
("EURUSD"), ein "USD"-Chip muss also jedes Paar treffen, das USD als eines
seiner beiden Beine fuehrt - eine andere Filterlogik als "ID exakt gleich".
Alle drei nutzen dieselbe `.cmp-filter`/`.cmp-chip`/`.cmp-quick`-Optik wie
Set-ups/Compare, keine neue CSS. Bewusst NICHT persistiert/cross-device-
synced - dieselbe Behandlung wie die schon bestehenden Einzel-Filter dieser
Seiten (`cotFilter`/`sentSym`/`pcAsset`/`trendsFilter` sind ebenfalls reiner
Browse-Zustand, anders als der persistierte Set-ups-Filter).

**Set-ups selbst** bekam die zwei neuen Quick-Buttons "Non-FX"/"Yields"
neben dem bestehenden "FX" (alle drei + Waehrungs-Chips schliessen sich
gegenseitig aus, wie "FX"/Chips es vorher schon taten) - inklusive
Cross-Device-Sync (`data.setupNonFxOnly`/`data.setupYieldsOnly`, an beiden
bestehenden Sync-Stellen ergaenzt, plus Restore-Pfad).

**Nebenbefund: Trends kannte die Yields-Kategorie noch gar nicht.**
`trendAssets()` war eine harte Liste (`[...FX,'GOLD','SILVER','OIL','BTC',
'SP500','NAS','DAX']`) ohne die 8 neuen Yield-Assets - fuer den neuen
Filter ergaenzt, gleichzeitig auch je eine `TREND_COLORS`-Linienfarbe
(dieselbe wie die zugrundeliegende Waehrung).

**Nutzer-Wunsch 2 (separate Anfrage, woertlich):** "im asset stapel direkt
neben dem asset namen bitte ergänz der kurz einfach noch kurz den score
also nur die zahl und nicht in bias farbe." Neue `.np-score`-Zeile
(`var(--t3)`, kein `BC[bias]`) direkt in der Assets-Stapel-Zeile, zusaetzlich
zum bisherigen Tooltip (der weiterhin den vollen "Name + Score"-Text
traegt). Bewusst gedaempft, damit die Zeile (die sonst keine Bias-Farbe
traegt, siehe `renderSidebar`-Kommentar) nicht durch die Score-Zahl allein
eine Farb-Konnotation bekommt. In `#navSidebar.nav-collapsed` (Icon-Leiste)
wie `.np-lbl` ausgeblendet.

**Geprueft (Playwright):** Sidebar-Score-Text stimmt exakt mit `symScoreCmp`
ueberein, Farbe ist `var(--t3)` (kein Bias-Rot/Blau). Set-ups "Yields"-
Filter zeigt exakt die 8 Yield-Zeilen, "Non-FX" keine reinen FX-Paare. COT-
Mehrfachfilter (USD+EUR) zeigt exakt diese zwei, COT "Non-FX"-Scope zeigt
keine Waehrungen. Retail Sentiment "JPY"-Filter zeigt alle 7 JPY-Kreuze
(nicht nur USDJPY - Musterkorrektur nach einem ersten falschen Test-
Assertion), "Non-FX"-Scope zeigt exakt die 6 non-FX-Symbole. Trends-
Mehrfachfilter (USD+EUR) zeigt in ALLEN VIER Chart-Karten (Total/Inflation/
Labour/Growth) konsistent genau USD+EUR; `trendAssets()` enthaelt jetzt
alle 8 Yield-IDs. `node check/all.js` komplett gruen.

## Live-Site-Bugreport: privates Repo blockiert alle zehn Daten-JSONs (2026-08-25)

Bugreport: "beim risk sentiment und beim performance ranking laden die
daten nicht" auf der Live-Seite. Lokale Reproduktion (Playwright, identischer
Code + identische Daten) zeigte BEIDE Widgets fehlerfrei mit aktuellen
Werten - der Bug lag also nicht im Code oder den Daten selbst.

**Diagnoseweg:** Konnte die Live-URL nicht direkt oeffnen (Sandbox blockt
`jo-brxxn.github.io` per Proxy-403). Ueber die GitHub-Actions-API geprueft:
der `pages-build-deployment`-Workflow hatte seit 2026-08-10 keinen neuen
Lauf mehr, obwohl taeglich weiter auf `main` gepusht wurde - zunaechst als
moegliche Ursache vermutet (GitHub Pages liefert bei privaten Repos auf dem
Free-Plan 404). Nutzer stellte klar: **die echte Produktionsadresse ist gar
nicht GitHub Pages**, sondern ein Cloudflare Worker
(`fx-final.jonathan-fa5.workers.dev`) - GitHub Pages ist nur ein zweiter,
ungeschuetzter Mirror. `docs/workflow.md` war an dieser Stelle veraltet/
irrefuehrend und wurde korrigiert (Details dort).

**Tatsaechliche Ursache:** unabhaengig vom Hosting laufen alle zehn
Live-Daten-JSONs (`ind_data.json` etc.) per anonymem `fetch()` direkt von
`raw.githubusercontent.com` - eingebaut, weil Cloudflare Pages' kostenloser
Plan nur 500 Builds/Monat erlaubt, der stuendliche Daten-Workflow aber ~720
Pushes/Monat erzeugt (Kommentar vor `DATA_BASE` in `index.html`). Ein
privates Repo blockiert diesen Raw-Endpunkt mit 404 - der Worker selbst
lief die ganze Zeit weiter, nur eben ohne Daten. Bestaetigt durch den
Nutzer: "hab github repo eben auf privat gestellt".

**Nutzer-Wunsch danach:** "ich will immer aktuelle daten nie veraltete also
mach bei den anderen daten wenn das passiert auch ein platzhalter hin" -
per `AskUserQuestion` geklaert, ob der alte (noch synchronisierte) Wert
komplett ersetzt oder nur zusaetzlich markiert werden soll → **zusaetzliche
Warnung** (Empfehlung, vom Nutzer bestaetigt), alter Wert bleibt sichtbar.

**Umsetzung (VERSION-CHECK-447):** neues `DATA_LIVE_OK`-Objekt (bei
`DATA_BASE` in `index.html`) trackt fuer alle acht Hintergrund-Feeds (`ind`/
`bond`/`cot`/`sentiment`/`price`/`news`/`risk`/`calendar`), ob der letzte
Abruf dieser Sitzung erfolgreich war - jede der acht Fetch-Funktionen setzt
das Flag jetzt explizit (vorher stille `catch(e){}`-Bloecke ohne jede
Spur). COT und Kalender haben je einen zweiten, repo-unabhaengigen
Live-Weg (CFTC direkt bzw. FF-Live-Proxys) - ihr Flag spiegelt den finalen
Erfolg NACH beiden Versuchen. Neue Funktion `dataFeedStaleNotifyHtml()`
zeigt bei mindestens einer fehlgeschlagenen Quelle eine Dashboard-
Notification-Karte, im selben `.stale-notify-card`-Muster wie die
bestehenden `staleNotifyHtml()`/`awaitingNotifyHtml()` (in dieselbe
`popups`-Kette der `notification`-Widget-Karte eingehaengt). Details:
`docs/data-sources.md`.

**Bewusst NICHT geloest:** ein privates Repo bleibt weiterhin kaputt fuer
diese zehn JSONs - die neue Warnung macht es nur sichtbar. Die echte Loesung
(serverseitiger Proxy im Cloudflare Worker mit einem GitHub-Token als
Secret) liegt ausserhalb dieses Repos (der Worker-Code ist hier nicht
vorhanden) und wurde dem Nutzer als naechster Schritt erklaert, nicht
umgesetzt.

**Geprueft (Playwright):** lokal laden alle acht Feeds erfolgreich
(`DATA_LIVE_OK` komplett `true`), keine Warnkarte. Nach manuellem Setzen von
`DATA_LIVE_OK.risk=false`/`DATA_LIVE_OK.price=false` erscheint sofort "Live
data unavailable: Prices, Risk index" in der Notifications-Karte, an
korrekter Position vor den bestehenden Veraltet-/Awaiting-Meldungen, ohne
Seitenfehler. `node check/all.js` komplett gruen.

## Start der Modul-Aufteilung: erste Kategorie ausgekoppelt (2026-08-25)

Nutzer-Wunsch (nach einer Rueckschau auf mehrere Fehler in dieser Sitzung):
"generell das Projekt in Kategorien machen ich denke das nicht nur Score
sehr wichtig ist" - per `AskUserQuestion` geklaert: OHNE Build-Tool, echte
ES-Module (`type="module"`, `import`/`export`), damit der bestehende
Zero-Build-Deploy (Cloudflare Worker + GitHub Pages liefern Dateien direkt
aus) unveraendert bleibt. Volles Vorgehen/Methodik: `docs/module-split.md`
(neue Datei, von CLAUDE.md referenziert).

**VERSION-CHECK-448, erste Kategorie:** `js/constants.js` (Farben/Bias-
Labels/FX-Liste/Flaggen-SVGs/Asset-Icon-System/Yield-Waehrungszuordnung) -
reine Daten/Geometrie ohne DOM-/onclick-Kopplung, deshalb als risikoärmste
Kategorie zuerst gewaehlt. Hauptskript auf `<script type="module">`
umgestellt.

**Zwei reale Fehler dabei gemacht und gefunden, bevor sie live gingen:**
1. Ein pauschaler `sed -i 's|^<script>$|<script type="module">|'` traf NICHT
   nur das Hauptskript, sondern auch ein zweites, kleines Inline-Skript
   (Intro-Overlay-Logik bei `#introOv`) - dessen eigener Kommentar erklaert,
   warum es bewusst SYNCHRON/klassisch laufen muss (entfernt das Overlay
   sofort, bevor es je sichtbar wird, wenn die Animation deaktiviert ist).
   Als Modul waere es dagegen verzoegert (deferred) gelaufen - sichtbares
   Aufblitzen des Overlays. Beim gezielten Nachpruefen der `<script`-Stellen
   gefunden und zurueckgesetzt, bevor es getestet/gepusht wurde.
2. `type="module"` macht ALLE ~1.200 Top-Level-Funktionen/-Variablen des
   verbleibenden Hauptskripts auf einen Schlag nicht mehr global - die App
   generiert ihre UI ueberwiegend als HTML-Strings mit `onclick="fooBar()"`
   direkt drin, was der Browser im globalen Scope aufloest. Ohne Brücke
   waere JEDE Interaktion in der GESAMTEN App kaputt gegangen, nicht nur die
   ausgekoppelte Kategorie. Erste Brücke per Zeilen-Regex gebaut, dabei zwei
   Klassen von Fehlern gemacht (Mehrfach-Deklarationen auf einer Zeile wie
   `let a=1,b=2;` verschluckten alle Namen ausser dem ersten - darunter
   zentrale State-Variablen wie `curPage`/`calEvts`/`widgets`/`pairs`/
   `research`; ein Anfuehrungszeichen INNERHALB eines Regex-Literals
   `/"/g` liess den handgeschriebenen String-Scanner entgleisen und einen
   erfundenen Namen `die` erzeugen). Beide durch `check/all.js` gefunden
   (`nav`-Waechter: `ReferenceError: curPage is not defined`) - NICHT durch
   eigene Sorgfalt beim Schreiben. Fix: echten JS-Parser (`acorn`, liegt
   unter der global installierten `eslint`-Abhaengigkeit) statt Regex
   benutzt, liefert 100% korrekte Top-Level-Namen. Details/Methodik fuer
   kuenftige Kategorien: `docs/module-split.md`.

**Bruecken-Mechanismus:** Funktionen/`const` per einmaligem
`Object.assign(window,{...})` (stabile Referenzen), `let`-Zustand per
LIVE `Object.defineProperty(window,name,{get,set})` - ein einmaliger
Kopier-Snapshot waere nach der ersten Neuzuweisung (z.B. `curPage='cur'`)
veraltet gewesen.

**Geprueft:** `node --check` + `acorn`-Parse auf den extrahierten
Hauptskript-Body, Playwright-Smoke-Test (u.a. `curPage` lesen/live
mitverfolgen ueber mehrere `showTab()`-Wechsel, Intro-Overlay-Login-Button
klicken - beide Skript-Kontexte durchquerend), danach `node check/all.js`
komplett gruen (alle 12 Waechter, inkl. `nav`, das den urspruenglichen
Bruecken-Fehler gefunden hatte).

## Modul-Aufteilung Runde 2: externes Hauptskript, Globus-Kategorie, Waechter-Skripte repariert (2026-08-25)

Nutzer-Wunsch nach der ersten Kategorie (constants.js): "Ja dann mach das
alles" - Fortsetzung der Aufteilung. Zweite Kategorie geplant: der rotierende
FX-Weltglobus + Intro-Boost-Sequenz. Dabei kam heraus, dass das bisherige
INLINE-Hauptskript (`<script type="module">` direkt in `index.html`, nur
`js/constants.js` war extern) fuer eine Kategorie mit ECHTER bidirektionaler
Abhaengigkeit nicht reicht - ein Inline-Modul hat keine eigene URL, andere
Dateien koennen nicht davon importieren. Deshalb zuerst das komplette
Hauptskript nach `js/main.js` verschoben (`<script type="module"
src="js/main.js">`), erst danach `js/globe.js` (62 Top-Level-Namen)
ausgekoppelt, mit einem zirkulaeren Import zwischen beiden Dateien.

**Drei weitere reale Fehler gemacht und VOR dem Push gefunden:**
1. Import-Bindings sind schreibgeschuetzt - main.js versuchte `_globeLon`
   (ein `let` aus globe.js) direkt zuzuweisen, was Acorn NICHT als
   Syntaxfehler erkennt (kracht erst im echten Browser). Fix: kleiner Setter
   `resetGlobeLon()` in globe.js statt Direktzugriff von aussen.
2. Trotz des bereits im ersten Schritt eingefuehrten AST-Parsers wurden die
   Export-/Import-Listen fuer globe.js von HAND aus der Konsolenausgabe
   abgetippt - dabei gingen alle unterstrich-praefigierten privaten
   Zustandsnamen (`_globeLon`, `_globeHosts`, ...) verloren, weil sie beim
   Ueberfliegen wie interne Details aussahen. Playwright-Fehler erst beim
   MEHRFACHEN Tab-Wechsel sichtbar (`_globeLon is not defined`), nicht beim
   ersten Laden. Fix: Namenslisten direkt aus der vom Skript geschriebenen
   Datei generieren, nie von Hand abtippen.
3. **Der schwerwiegendste Fund:** ein Regressionstest (`biasScore()`
   absichtlich falsch zurueckgeben lassen, ohne SCORE_MODEL_VERSION zu
   bumpen) zeigte, dass `node check/rules.js` trotzdem "ok" meldete - das
   Sicherheitsnetz war durch die Externalisierung LAUTLOS abgeschaltet.
   Ursache: fuenf Waechter-Skripte gingen implizit davon aus, dass aller
   Code inline in `index.html` liegt (`check/scoreSurface.js`s `inlineJs()`
   filtert `<script src=...>` explizit raus; `check/rules.js`s Diff war fest
   auf `-- index.html` verdrahtet; `check/structure.js` baute seine
   Funktions-Namensliste nur aus `index.html`; `check/scorediff.js` kopierte
   fuer den Basis-Vergleich nur `index.html` + `*.json`/`sw.js` in ein
   Temp-Verzeichnis, ohne `js/constants.js` - ein ES-Modul ist fail-fast,
   ein 404 auf einen Import laesst KEINE Top-Level-Variable entstehen, auch
   nicht die unbeteiligten). Alle vier repariert (js/*.js wird jetzt ueberall
   mitgelesen/mitkopiert/mitgedifft), plus zwei Nebenfehler im Test-Server
   von scorediff.js (Unterordner wurden von `path.basename()` gestrippt;
   `.js`-Dateien liefen als `text/html`, was Chrome fuer Modul-Skripte hart
   verweigert). Fuenfter Fund direkt daraus abgeleitet: `check/rules.js`s
   SUMMARY_ENGINE_VERSION-Regel hatte KEIN Gegenstueck zu `scorediff.js` -
   eine reine Datei-Umsortierung der `summarize*`-Funktionen haette den Bump
   erzwungen, obwohl sich der Text nicht aendert (laut eigenem
   Projektgrundsatz SCHAEDLICH). Neue Datei `check/summarydiff.js` (13.
   Waechter) schliesst diese Luecke nach demselben Muster wie `scorediff.js`.

**Damit ist die zuvor dokumentierte Sperre fuer Score-/Formulierungs-Logik
aufgehoben** - beide koennen jetzt wie jede andere Kategorie ausgekoppelt
werden. Volle Methodik, Fallen und der jetzt obligatorische
Regressionstest-Ablauf: `docs/module-split.md`.

**Geprueft:** Playwright-Smoke-Test (mehrfacher `showTab()`-Wechsel deckt
sowohl die live-let-Bruecke als auch den Globus-Start/Stop-Zyklus ab, 0
Seitenfehler), AST-basierte Symmetrie-Pruefung aller vier Import-/Export-
Listen zwischen main.js/globe.js, Regressionstest mit absichtlich kaputtem
`biasScore()` (schlaegt VOR der Reparatur nicht an, danach zuverlaessig bei
`scorediff.js` UND `rules.js`), danach `node check/all.js` komplett gruen
(jetzt 13 Waechter).

## Modul-Aufteilung Runde 3: Daten-Feeds ausgekoppelt, dritte Bruecken-Quelle gefunden (2026-08-25)

Dritte Kategorie: `js/data-feeds.js` - Indikator-/Anleiherenditen-/Preis-/
News-/Risk-Index-Live-Abrufe (`fetch*Data`/`apply*Feed`) plus die Asset-
Strength-Karten-Konfiguration, 45 Top-Level-Namen, bidirektional mit
`js/main.js` wie schon bei `js/globe.js`. Derselbe volle Ablauf wie zuvor
(AST-Extraktion, externe-Referenzen-Finder, Symmetrie-Pruefung,
Import-Bindung-Zuweisungs-Check) - diesmal ohne eigene neue Fehler beim Bau.

**Aber `node check/all.js` fand trotzdem etwas Neues:** `check/score.js`
ruft `applyIndDataFeed`/`applyBondDataFeed` direkt per `page.evaluate()` als
bloße Bezeichner auf (`const feeds={applyIndDataFeed,...}`) - exakt derselbe
globale Zugriff wie ein inline `onclick`, nur aus einem Node-Test-Skript
statt aus HTML-Markup, und deshalb von der bisherigen Handler-Namen-Suche
(die nur `index.html`+`js/*.js` nach `onclick=`-Mustern durchsucht) nicht
erfasst. Fix: beide Namen in `js/data-feeds.js`s eigene Selbst-Bruecke
aufgenommen. In `docs/module-split.md` als eigener, ab jetzt fester
Prüfschritt dokumentiert - `check/*.js` selbst nach den zu verschiebenden
Namen durchsuchen, nicht nur die HTML-Handler-Liste.

**Geprueft:** dieselbe volle Kette wie bei den vorigen zwei Kategorien
(Playwright-Smoke-Test inkl. Ccy-Config-Modal, AST-Symmetrie beider
Import-/Export-Paare, Import-Bindungs-Zuweisungs-Check beide Richtungen),
danach `node check/all.js` komplett gruen (13 Waechter) - der erste Lauf
schlug bei `score`/`score-cl` fehl (genau der oben beschriebene Fund), nach
der Selbst-Bruecken-Ergaenzung durchgehend gruen.

## Modul-Aufteilung Runde 4: die Score-Rechenkette selbst ausgekoppelt (2026-08-25)

Vierte Kategorie - und die, die den urspruenglichen Nutzer-Wunsch direkt
bedient ("es gibt eine Menge Probleme beim Score"): `js/score.js`, 104
Top-Level-Namen (Bias-Score, Normierung, Altersgrenze, Datenqualitaet,
eigene Historie/Staerke, Carry, Sidebar-Sync). Erste Kategorie, die NACH
Aufhebung der zuvor dokumentierten Score-Sperre (Runde 2) ausgekoppelt
wurde.

**Zwei Import-Binding-Schreibversuche gefunden** (dieselbe Fallenklasse wie
`_globeLon` in Runde 2, diesmal auf main.js-Seite): der Score-Bereich
schrieb direkt auf `_lsUpdatedSeen` und `_suppressBiasFlipAlerts`, beide
`let`-Zustand in main.js. Fix nach demselben Muster - zwei neue, in main.js
verbleibende Setter-Funktionen (`markLsUpdatedSeen()`/
`setSuppressBiasFlipAlerts()`), score.js ruft sie jetzt statt direkt
zuzuweisen.

**`check/rules.js`s eigene Regel 5 ("neue Score-Groesse ohne Pruefung")
schlug zu Recht an:** die neue Funktion `setSuppressBiasFlipAlerts` matcht
den Namensfilter (enthaelt "Bias"). Statt die Regel zu umgehen (z.B. mit
einer beliebigen check/-Datei-Beruehrung), einen ECHTEN Verhaltenstest in
`check/score.js` ergaenzt: `setSuppressBiasFlipAlerts(true)` muss
`_suppressBiasFlipAlerts` wirklich auf `true` setzen (und zurueck) - genau
das koennte bei der naechsten Extraktion kaputtgehen, ohne dass es sonst
auffiele.

**Regressionstest wiederholt, diesmal mit Score selbst in der neuen
Datei:** `biasScore()` in `js/score.js` absichtlich falsch zurueckgeben
lassen (`bull` gibt 999 statt 1) - `check/scorediff.js` UND `check/rules.js`
melden den Fehler weiterhin zuverlaessig, danach Originalzustand
wiederhergestellt und bestaetigt.

**Geprueft:** volle Kette wie bei den vorigen drei Kategorien
(AST-Extraktion, externe-Referenzen-Finder, Symmetrie-Pruefung,
Import-Bindungs-Zuweisungs-Check beide Richtungen, check/*.js-Suche nach
Direktreferenzen), Playwright-Smoke-Test (Score-Bruecke, Score-Mode-Toggle,
Score-Info-Modal), danach `node check/all.js` komplett gruen (13 Waechter),
plus der oben beschriebene Regressionstest.

## Modul-Aufteilung Runde 5: Kalender-Kategorie ausgekoppelt, ein aelterer Fehler dabei gefunden (2026-08-26)

Fuenfte Kategorie: `js/calendar.js` (VERSION-CHECK-453) - Kalender-Symbol-
Matching (`CAL_ALIASES`/`evtMatchesSym`) und die FF-Style Kalender-
Tabellenzeilen (Actual-vs-Forecast-Faerbung inkl. Asset-Bias-Umkehr,
`calTableHtml`/`calRowHtml`/`calToolbarHtml`, High-Impact-/Waehrungs-/
Kompaktansicht-Filter). 25 Top-Level-Namen exportiert, voll bidirektional
mit `js/main.js` (Grenze: Zeilen 458-801 des vorherigen `js/main.js`).

**Drei neue Import-Binding-Schreibversuche** gefunden und mit dem
etablierten Setter-Muster geloest: `calHighOnly`/`compactView`/
`calCcyFilter` (main.js-Zustand) wurden aus dem ausgekoppelten Bereich
heraus direkt zugewiesen - neue Setter `setCalHighOnlyVal()`/
`setCompactViewVal()`/`setCalCcyFilterVal()` in `js/main.js`. Zusaetzlich
drei Stellen gefunden, die noch direkt `_lsUpdatedSeen=...` zuwiesen statt
den in der score.js-Runde bereits eingefuehrten Setter `markLsUpdatedSeen()`
zu nutzen - korrigiert.

**Wichtigster Fund dieser Runde, aber nicht Teil der Kalender-Kategorie
selbst:** der routinemaessige Import-Bindungs-Zuweisungs-Check (AST-basiert,
beide Richtungen, laeuft ueber die GESAMTE main.js, nicht nur den gerade
extrahierten Bereich) fand zwei bestehende Direktzuweisungen auf `scoreMode`
in `importData()` und im `cd.scoreMode`-Zweig von `cloudPull()` - beide
schreiben seit der score.js-Runde (VERSION-CHECK-452) auf ein Import-Binding
aus `js/score.js` und waeren beim naechsten JSON-Import bzw. Cloud-Sync-
Konflikt mit einem Laufzeitfehler abgestuerzt. `node check/all.js` hatte das
nach Runde 4 nicht gefangen, weil kein bestehender Testlauf diese beiden
Codepfade ausloest. Mit einem vierten Setter (`setScoreModeVal()` in
`js/score.js`) behoben. `check/rules.js` Regel 5 flaggte den neuen Namen zu
Recht als "neue Score-Groesse ohne Pruefung" - echten Verhaltenstest in
`check/score.js` ergaenzt statt die Regel zu umgehen.

**Lehre:** der Import-Bindungs-Zuweisungs-Check ist nicht nur ein Test fuer
die GERADE bearbeitete Kategorie, sondern ein generelles Sicherheitsnetz,
das bei jeder Extraktion erneut ueber die gesamte Datei laufen sollte - er
kann aeltere, noch unentdeckte Faelle aus fruaheren Runden auffangen, auch
wenn die aktuelle Extraktion selbst gar keinen neuen Fall hat.

**Geprueft:** volle Kette wie bei den vorigen vier Kategorien
(AST-Extraktion, externe-Referenzen-Finder, Symmetrie-Pruefung ueber ALLE
sechs js/*.js-Dateien, Import-Bindungs-Zuweisungs-Check beide Richtungen,
check/*.js-Suche nach Direktreferenzen), Playwright-Smoke-Test (alle Tabs,
toggleCalHighOnly/toggleCompactView/setCalCcyFilter/todayStr), danach
`node check/all.js` komplett gruen (13 Waechter).

## Bugreport "History hat viele Fehler": Delta ueber Modell-Grenzen hinweg (2026-08-30, VERSION-CHECK-454)

**Bugreport:** "Check jetzt nochmal das Score System vorallem bei der
history von den Assets gibt es viele Fehler." Auf Rueckfrage bestaetigt:
gemeint sind die vielen gedimmten/mit `*` markierten Tage ohne Erklaerung
im History-Fenster.

**Untersuchung.** `node check/all.js` war vollstaendig gruen, und eine
automatisierte Nachrechnung von `histDeltaParts()` gegen die echte
aufgezeichnete Historie (alle Assets, 90-Tage-Fenster) fand 0 Abweichungen -
die Algebra selbst stimmte. Der Fehler lag woanders: `SCORE_MODEL_VERSION`
wurde in den letzten 3 Wochen 6-mal gebumpt (1→2→4→5→6→8, jeweils echte
Formel-Korrekturen). Jeder aufgezeichnete Tag traegt seinen Modell-Tag
(`SCORE_MODEL_TAG()` = Version+Modus), und ein Tag, dessen Tag nicht zum
AKTUELLEN Live-Tag passt, gilt als "nicht vergleichbar" (gedimmt, kein
Delta) - das ist beabsichtigt (verhindert genau den 2026-08-16-Bugreport-Typ:
ein Formel-Sprung als echte Marktbewegung).

**Der eigentliche Fehler:** die Vergleichbarkeitspruefung
(`renderSymHistoryPanel()`) verglich nur, ob DIESER Tag zum aktuellen
Live-Modell passt - nicht, ob er zum VORTAG passt, gegen den das Delta
berechnet wird. Am Tag eines Modellwechsels matcht der NEUE Tag das
Live-Modell (gilt also selbst nicht als "alt"), sein Vortag steht aber noch
unter der alten Version - das Delta wurde trotzdem berechnet und als
"Score moved -1,4 — no dated release" praesentiert, obwohl an dem Tag
schlicht nur die Formel gewechselt hatte. Bei 6 Versionswechseln x 27 Assets
ergab das ueber die letzten 3 Wochen rund 80 solcher erfundenen Spruenge in
der echten aufgezeichneten Historie (per Skript gezaehlt).

**Fix.** Neue, direkt testbare Funktion `histTagsComparable(a,b)` -
verlangt BEIDE Tage bekannt UND identisch, sonst `false` (auch "beide
unbekannt" zaehlt bewusst NICHT als vergleichbar - die taglose Fruehzeit vor
2026-08-09 traegt gar keinen Tag, "unbekannt" ist nicht "gleich"). Ersetzt
den bisherigen Delta-Gate. Bei einer ECHTEN Modellgrenze (beide Tage
bekannt, aber unterschiedlich) erscheint jetzt eine eigene Meldung ("The
score model changed on this day...") statt der erfundenen Score-Bewegung
oder eines irrefuehrenden "No change.".

**Nebeneffekt (gewollt, macht die History insgesamt informativer statt nur
korrekter):** zwei aufeinanderfolgende Tage unter DEMSELBEN aelteren Modell
zeigen jetzt wieder ein Delta zueinander - vorher verstummte JEDER nicht mit
dem Live-Tag uebereinstimmende Tag komplett, auch relativ zu seinen
eigenen alten Nachbartagen.

**Geprueft:** automatisierte Nachrechnung gegen die echte Historie (alle
Assets, 90 Tage) vor und nach dem Fix - 80 echte Modellgrenzen identifiziert,
alle zeigen danach die neue Meldung statt eines Deltas; 231 gleich-getaggte
Tagespaare zeigen weiterhin/wieder korrekt ihr Delta; Summe der
Aufschluesselungs-Teile stimmt in allen 180 gefundenen Delta-Faellen exakt
mit dem angezeigten Delta ueberein (0 Abweichungen). Playwright-Runtime-Test:
keine JS-Fehler beim Oeffnen der History fuer alle 27 Assets. Neuer
Regressionstest in `check/score.js` (H4-Block): 5 gezielte
`histTagsComparable()`-Faelle plus ein Lauf ueber die komplette echte
Historie, der garantiert, dass keine bekannte Modellgrenze faelschlich als
vergleichbar durchgeht. `node check/all.js` komplett gruen (13 Waechter).
Keine Score-Formel angefasst - `scorediff`/`summarydiff`: 0 Aenderungen,
`SCORE_MODEL_VERSION` unveraendert.

## 2026-08-30 — Notizen ueberarbeitet: mehrere Ordner, Bias-Farbe, globale Suche (VERSION-CHECK-455)

**Nutzer-Wunsch:** "Überall wo es Notizen gibt füg die Funktion hinzu in
Ordnern Unterordner zu erstellen und mach von Notizen das Aussehen deutlich
ob sie neutral bullish oder bearish sind und mach eine Suchleiste... Und man
soll die Möglichkeit haben wenn man eine Notiz schreibt diese in mehreren
Ordnern abzulegen also auch wenn man beim CAD eine Notiz schreibt diese auch
bei USD ablegen zu können."

**Bestandsaufnahme vor der Umsetzung** (per `AskUserQuestion` mit dem Nutzer
abgestimmt, da mehrere echte Design-Entscheidungen drinsteckten): Unterordner
gab es bereits technisch (Research-Ordnerbaum, `researchAddFolder`), aber
nur hinter einer 5-Sekunden-Long-Press-Geste versteckt - nicht der
gemeldete Mangel. Eine globale Suchleiste mit Hashtag-Filter existierte
ebenfalls schon im Code (`renderResearchNotes`/`resSetTag`), war aber toter
Code - `rerenderNotesHost()` ruft seit der Research-Terminal-Umstellung
(2026-08-04) nur noch `renderResearch()` auf, nie mehr diese Funktion.

**Umgesetzt (Nutzer-Antworten: alle drei Notiz-Oberflaechen, echte
Mehrfachzuordnung, manueller Bias-Picker, verschachtelter Baum):**
- **Mehrere Ordner gleichzeitig:** `n.fid` (ein Ordner) → `n.fids` (Array).
  Ein Asset wird jetzt aus den zugewiesenen Ordnern ABGELEITET
  (`resNoteAssetIds`, wandert die Baum-Ancestry jedes Ordners hoch) statt in
  einem separaten Einzelfeld gepflegt zu werden - eine Notiz mit einem
  CAD-Unterordner UND einem USD-Unterordner erscheint dadurch vollstaendig
  in beiden Assets. Notiz-Modal umgebaut: statt einem Asset-Select + einem
  Ordner-Select jetzt eine "Places"-Zeile (Asset waehlen → Ordner waehlen →
  "+ Add" → Chip, einzeln entfernbar), beliebig oft wiederholbar.
- **Bias-Farbe:** neues Feld `n.bias` (bull/bear/neu, ersetzt das alte
  `n.dir`, das nur bull/bear kannte) - manuell im Modal gewaehlt (3 Knoepfe,
  je in der eigenen Bias-Farbe wenn aktiv), faerbt die Notiz-Karte ueberall
  als linke Randlinie (`BC[n.bias]`) - Research-Terminal, Asset-Notizen-Karte,
  Watchlist-Pins, POV-Notizen im Paar-Modus.
- **Entfernt (Nutzer-Wunsch, Teil derselben Antwort):** die fruehere
  automatische "war die Richtung richtig"-Auswertung (`noteOutcome`/
  `noteHitStats`/`noteHitStatsHtml`/`noteOutcomeBadge` + die Kurs-Helfer
  `priceAtOrBefore`/`priceNBarsAfter`/Konstanten `NOTE_HORIZON_D`/
  `NOTE_FLAT_PCT`) - der Bias ist jetzt eine reine manuelle Einordnung ohne
  Kurs-Nachpruefung dahinter, ersetzt durch das schlichte `noteBiasBadge`
  (▲/▼, "neu" bekommt bewusst kein Abzeichen - die Randfarbe reicht).
- **Zwei getrennte Such-Kontexte** (Nutzer-Wunsch: "man kann überall suchen
  aber wenn man in einem Ordner sucht kann man nur die Notizen aus dem
  Ordner und den Unterordnern finden"):
  - Neue globale Suchleiste, immer oben in der Ordnerbaum-Sidebar sichtbar
    (`resGlobalQuery`/`researchGlobalSearchHtml`) - durchsucht ALLE Notizen
    unabhaengig von Asset/Ordner, Ergebniszeilen zeigen zusaetzlich, in
    welchen Ordnern/Assets die Notiz ueberall liegt.
  - Die bestehende ordnergebundene Suche (`researchNotesPanelHtml`) neu
    gefasst: reines Durchblaettern (keine Eingabe) zeigt NUR Notizen, die
    GENAU in diesem Ordner liegen (wie ein Datei-Browser) - eine Suche
    bezieht dagegen bewusst den Ordner UND alle Unterordner ein
    (`researchDescendantFolderIds`), aber NICHT mehr das ganze Asset (vorher:
    Ordner-Einschraenkung wurde bei jeder Eingabe komplett aufgehoben).
  - Hashtag-Klick (ueberall, auch aus der ordnergebundenen Ansicht) oeffnet
    IMMER die globale Suche mit diesem Tag als Filter (Nutzer-Wunsch: "dann
    werden alle Notizen dazu angezeigt") statt nur innerhalb des aktuellen
    Ordners zu filtern.
- **Migration:** `migrateResearchNoteFields()`, einmalig ueber `_noteSchemaV`
  abgesichert - `fid`→`fids`, `dir`→`bias` (unbekannt/fehlend wird `neu`),
  kein Datenverlust.

**Bewusst NICHT angetastet:** die alte, seit 2026-08-04 bereits tote
`renderResearchNotes()`/`renderResearchFolders()`/`resSelect`/`resSetTag`-
Familie (referenziert nach dieser Aenderung das entfernte `n.fid` und wuerde
bei einem Aufruf werfen) - bestaetigt unerreichbar von `rerenderNotesHost()`
und von keinem `onclick` im echten UI. Absichtlich nicht mit aufgeraeumt, um
den Umfang dieser Aenderung nicht zusaetzlich auszuweiten; als Aufraeum-
Kandidat fuer eine spaetere, eigene Runde vermerkt.

**Geprueft:** Playwright-Ende-zu-Ende (Unterordner unter CAD UND USD
angelegt, eine Notiz mit beiden Ordnern + Bias "bull" + Tags gespeichert,
bestaetigt: erscheint vollstaendig in CAD- UND USD-Notizen-Panel, fehlt
korrekt bei EUR, Bias-Randfarbe im HTML vorhanden, Hashtag-Klick oeffnet
globale Suche mit Treffer, globale Textsuche findet die Notiz inkl. Orte-
Anzeige); Ordner-vs-Unterordner-Scoping separat verifiziert (Notiz im
Wurzelordner erscheint nicht beim Durchblaettern eines Unterordners, aber
Notiz im Unterordner erscheint bei einer Suche vom uebergeordneten Ordner
aus). Alle Tabs + Notiz-Modal + Asset-Notizen-Unterseite durchgeklickt, 0
JS-Fehler. `node check/all.js` komplett gruen (13 Waechter, inkl. neuem
Verhaltenstest in `check/score.js` fuer resPickBias/noteBiasBadge, von
Regel 5 zu Recht als neue "Bias"-benannte Namen geflaggt). Keine
Score-Formel angefasst - `scorediff`/`summarydiff`: 0 Aenderungen.

## 2026-08-30 — Notizen Runde 2: Root-Bug behoben, alte Tabelle migriert+entfernt, Verhaltens-Notizen (VERSION-CHECK-456)

**Bugreport:** "Wenn man ein Asset auswählt sehe ich nicht mehr die
Notizen die ich geschrieben habe." Ursache in der letzten Runde (VERSION-
CHECK-455): eine Notiz im Wurzelordner ("General Notes") trug im alten
Schema `fid=''` (leer) - `migrateResearchNoteFields()` behandelte das
faelschlich wie "gar keinem Ordner zugewiesen" (`fids` blieb `[]`), obwohl
`n.asset` die richtige Zuordnung noch trug. Ein leeres Array matcht nie
einen Ordner-Filter, also verschwanden genau diese (meist die Mehrheit
der) Notizen aus der Asset-Ansicht. Fix: `_noteSchemaV` auf 2 erhoeht,
laeuft darum auch fuer bereits (fehlerhaft) migrierte Nutzer noch einmal
und rekonstruiert `fids` aus `n.asset`, wo `fids` leer aber `asset`
gesetzt ist - reine Reparatur, nichts erfunden.

**Alte Bullish/Bearish-Tabelle entfernt** (Nutzer-Wunsch: "entfern da die
free Notes... entfern dann diese Tabelle"): `renderNotesSubTab`/
`renderNoteRub` und rund 15 zugehoerige Aktions-Funktionen komplett aus
dem Code entfernt. Ihr Inhalt (die Bullish/Bearish-Tabelle `noteTable`,
die Kategorie-Karten `noteRubs`, das freie Notizfeld `notes` UND die
eingebauten Struktur-Argumente `genBull`/`genBear` aus den DEF-Assets)
wird ueber eine neue, einmalige Migration (`migrateLegacyAssetNotesIntoResearch`)
vollstaendig als einzelne Notizen in die General-Notes-Wurzel jedes Assets
uebernommen, bevor die alten Felder geleert werden - kein Datenverlust.

**Verhaltens-Notizen je Asset** (Nutzer-Wunsch, per `AskUserQuestion`
abgestimmt: Bloomberg/Citi-Style-Gliederung, einmalige automatische
Befuellung statt manuellem Import): jedes Asset bekommt 6 Themen-
Unterordner unter seiner General-Notes-Wurzel (Macro & Growth, Central
Bank & Rates, Risk Sentiment & Flows, Positioning & Technicals, Event
Risk & Catalysts, Seasonality & Structural Flows). Fuer USD/EUR/GBP/CHF
bereits mit je 90 handverfassten Notizen befuellt (6 bullish + 6 bearish +
3 neutral je Thema, `js/asset-notes-seed.js`) - reines zeitloses
Hintergrundwissen ohne Datum/Live-Bezug, keine Live-Marktdaten (siehe
docs/data-sources.md "nie schaetzen" gilt fuer Live-Werte, nicht fuer
zeitlose Verhaltens-Beobachtungen). `seedAssetBehaviorNotes()` ist PRO
ASSET gegattert (`research._behaviorNotesSeeded[assetId]`), nicht ein
einzelnes Bool-Flag - die restlichen 12 Assets koennen in einer
Folgerunde ergaenzt werden, ohne bereits befuellte Assets erneut
anzufassen.

**Beim Verdrahten gefunden:** `researchFolders` wurde in beiden
Lade-Pfaden (`applySnap`/`loadState`) ERST NACH `migrateResearch()`
zugewiesen - die neue Ordner-Erstellung in `seedAssetBehaviorNotes()`
schrieb dadurch auf den ALTEN `researchFolders`-Stand, der direkt danach
von der eigentlichen Zuweisung ueberschrieben worden waere (neu
angelegte Ordner waeren sofort wieder verschwunden). Zuweisungsreihenfolge
in beiden Pfaden getauscht - mit einem Zwei-Reload-Test bestaetigt (Ordner
UND Notizen bleiben stabil, keine Duplikate, kein Verlust). Der
komplett-frische Installationspfad (kein gespeicherter Zustand) rief
weder die Legacy-Tabellen-Migration noch (urspruenglich) die
Verhaltens-Notizen-Befuellung auf - beides dort separat ergaenzt.

**Suche:** Treffer werden jetzt gelb markiert (`<mark class="res-hl">`,
auf dem bereits escapten String, nie unescapten Nutzertext einfuegend).
Neuer Umschalter (Hashtag/Titel/Alles, `resSearchField`) gilt fuer beide
Suchboxen. Die ordnergebundene Suche durchsucht jetzt wieder wirklich nur
den Ordner (reines Durchblaettern) bzw. Ordner+Unterordner (bei aktiver
Texteingabe) statt wie zuvor bei jeder Eingabe das ganze Asset.

**Geprueft:** `node --check` aller geaenderten/neuen Dateien; End-zu-Ende-
Migrationstest (simulierte fehlerhaft-migrierte Notiz repariert, simulierte
Legacy-Tabelle korrekt in 9 Notizen umgewandelt inkl. Feld-Leerung);
Such-Highlighting und Feld-Filter per Playwright bestaetigt; alte Tabelle
im DOM nicht mehr vorhanden, neue Ordner-UI vorhanden; Zwei- und
Vier-Reload-Stabilitaetstest (Notizen-/Ordneranzahl bleibt exakt gleich,
keine Duplikate); alle 4 bereits verfassten Asset-Verhaltens-Notizen-
Datensaetze (USD/EUR/GBP/CHF) programmatisch auf exakt 6/6/3 je Thema
geprueft (90 Notizen je Asset). `node check/all.js` komplett gruen (13
Waechter). Keine Score-Formel angefasst.

**Noch offen:** die restlichen 12 Assets (JPY, CAD, AUD, NZD, BTC, GOLD,
SILVER, OIL, SP500, NAS, DAX, GER100) haben noch keine Verhaltens-Notizen -
folgt in einer weiteren Runde. Der 5s-Long-Press fuer eigene Unterordner
(Nutzer-Wunsch "Unterordner erstellen") war schon vor dieser Runde
vorhanden, nur wenig entdeckbar - unveraendert gelassen, nicht Teil dieses
Bugreports.

## 2026-08-31 — Notizen Runde 3 (Titel/Body/Hashtags/Unterordner) + Watchlist-Filter-Fixes + Watchlist-Quicklinks (VERSION-CHECK-457)

**Notiz-Inhaltsformat neu geschrieben (Nutzer-Wunsch):** jede der 90
Verhaltens-Notizen je Asset war bisher EIN langer Fliesssatz ohne
getrennten Titel, ohne Hashtags. Jetzt `{t,b,tags,sub}`: kurzer,
praeziser Titel (keine ganzen Saetze mehr, 3-8 Woerter), ein auf 2 (teils
3) Saetze erweiterter Erklaerungstext (Mechanismus/Groessenordnung/
Beispiel/Einschraenkung ergaenzt, nicht nur umformuliert), 2-4 Hashtags
mit fester Schreibweise je Konzept quer durch alle Assets (`fed`,
`safe-haven`, `positioning`, `seasonality`, ...), und `sub` (0/1) fuer die
neue zweite Ordnerebene. Titel werden jetzt ueberall vollstaendig
angezeigt (`.res-note-ti` von Ellipsis/nowrap auf Zeilenumbruch
umgestellt).

**Neue Unterordner-Ebene:** auf Nachfrage ("ist es schlau in Ordnern
Unterordner zu machen?") explizit gewaehlt: "nach Unterthema aufteilen".
Jeder der 6 Themen-Ordner bekommt jetzt 2 feste Unterthema-Unterordner
(`ASSET_BEHAVIOR_SUBTOPICS`, z.B. bei Central Bank & Rates: "Rate Path &
Forward Guidance" / "Balance Sheet, Liquidity & Policy Credibility") -
gleiche Struktur fuer alle 16 Assets, nur der Notizinhalt darunter ist
asset-spezifisch. `seedAssetBehaviorNotes()` versioniert jetzt per
`BEHAVIOR_NOTES_CONTENT_V` (=3) statt nur true/false: ein Versionssprung
ersetzt NUR die eigenen Seed-Notizen (`n.seed===true`, wird beim manuellen
Speichern in `saveResNote` geloescht) und deren jetzt leeren Ordner, echte
Notizen/Ordner des Nutzers bleiben unangetastet.

**Alle 16 Assets fertig:** die 4 bereits verfassten (USD/EUR/GBP/CHF, 360
Notizen) wurden ins neue Format konvertiert, die restlichen 12 (JPY, CAD,
AUD, NZD, BTC, GOLD, SILVER, OIL, SP500, NAS, DAX, GER100) komplett neu
verfasst (je 90) - macht 1440 Notizen insgesamt. Content-Erstellung lief
als Hintergrund-Task (grosser, klar spezifizierter Auftrag, erster Versuch
scheiterte an einem Session-Rate-Limit ohne etwas zu speichern, zweiter
Versuch erfolgreich). Eigene Nachpruefung (nicht nur der Eigenbericht des
Agents): alle 16 Assets x 6 Themen x (6 bull + 6 bear + 3 neutral) mit
nicht-leerem Titel, Body >= 80 Zeichen, 1-4 Kleinschreib-Hashtags, gueltigem
`sub` bestaetigt. **Bekannte Einschraenkung:** unter den am staerksten
verwandten Asset-Paaren (NAS/SP500, GOLD/SILVER, DAX/GER100) gibt es
gehaeuft wortgleiche oder fast wortgleiche Notizen (insgesamt 179 von 1440
Titeln kommen mehrfach vor, die meisten davon sind generische, wirklich
universelle Markt-Wahrheiten wie "CFTC-Daten sind ein Schnappschuss der
Vergangenheit" - unproblematisch; aber ca. 45 davon konzentrieren sich auf
genau diese 3 sehr aehnlichen Asset-Paare und sind teils fast
Copy-Paste). Noch nicht nachgebessert - Folgeauftrag bei Bedarf.

**Watchlist-Filter-Dropdowns zeigten ein Asset doppelt** (Bugreport,
loeste zwei getrennt gemeldete Symptome gleichzeitig): `assetFilterSelect`,
`groupedAssetOptions` und `sentFilterBar` bauten je ein Asset SOWOHL in
eine "Watchlist"-Gruppe ganz oben ALS AUCH in seine normale Kategorie ein -
eine am 2026-08-24 bewusst so gewollte Design-Entscheidung ("Schnellzugriff
wie eine Favoriten-Zeile"), die der Nutzer jetzt ausdruecklich zurueckgenommen
hat. Ursache fuer BEIDE gemeldeten Bugs zugleich: der native `<select>`
zeigt bei zwei `<option>` mit demselben `value` nur das SPAETERE als
"ausgewaehlt" an (kein Haken bei der fruehen Watchlist-Option) und
scrollt beim Oeffnen zu diesem spaeteren Vorkommen (man landet in der
normalen Kategorie weiter unten statt in der Watchlist-Gruppe). Fix: alle
drei Funktionen schliessen watchlistete Assets jetzt aus ihrer normalen
Kategorie-Gruppe aus - jedes Asset genau einmal im Dropdown, wandert
automatisch zwischen Watchlist-Gruppe und Kategorie je nach
Watchlist-Status.

**Retail-Sentiment-Balken zeigten bei extremen Splits (>90/<10%) die
kleinere Prozentzahl gar nicht** (Bugreport): das Label sass BINNEN dem
Balkensegment (`${L>=12?L+'%':''}`) und verschwand, wenn das Segment unter
12% Breite fiel. Fix: beide Prozentzahlen stehen jetzt in fixen 30px
breiten Labels AUSSERHALB der Balken, immer sichtbar unabhaengig von der
Segmentbreite. Zusaetzlich (Nutzer-Wunsch): Klick auf eine Balkenzeile
ruft jetzt `setSentSym()` auf und waehlt das Paar im Filter.

**GER100/DAX fehlte komplett bei Retail Sentiment** (Nutzer-Nachfrage "guck
mal ob es da vlt doch Daten gibt"): Myfxbook fuehrt den Index unter
wechselndem Brokernamen. 7 Kandidaten ergaenzt (GER40, GER30, DE40, DE30,
GRXEUR, DAX40, DAX30) in `update-ff-calendar.yml` + `SENT_NONFX_SYMS`/
`SENT_NONFX_PRICE_ID`/`COT_NAME` im Client - ob Myfxbook den Index
tatsaechlich fuehrt, zeigt erst der naechste stuendliche Live-Lauf. Die
bereits vorhandenen 34 Symbole (28 FX-Major-Paare + 6 Non-FX) sind bereits
die vollstaendige Abdeckung der 8 Major-Waehrungen - dort fehlte nichts.

**Watchlist-Karten haben jetzt eigene Quicklinks** (Nutzer-Wunsch, "im
gleichen Design wie bei den Assets aber nicht die gleichen... nur fuer
Kategorien wo man auch nach dem Asset filtern kann"): dieselben `.aql`-
Buttons wie `assetQuickRowHtml`, aber nur fuer die Kategorien, die fuer
das jeweilige Asset WIRKLICH nach dem Asset selbst filtern (nicht nur nach
seiner verknuepften Waehrung) - hergeleitet aus der bestehenden
Yield-Fallback-Logik in `applyAssetQuickFilter` (ex-`assetQuickGo`, jetzt
gemeinsam genutzt): `seas/trends/cot/data/news` filtern immer per
Asset-ID (ausser bei Yields), `rate/cal/sent` loesen IMMER ueber
`macroCcyFor(id)` auf und filtern damit nur bei echten FX-Waehrungen
wirklich "nach dem Asset". Ergebnis: FX-Paare (Basiswaehrung) bekommen
alle 8, echte Non-FX-Assets (Gold/BTC/Indizes) nur die 5 mit echten
eigenen Daten - per Playwright bestaetigt (EUR/USD: 8 Buttons, Gold: 5).
Fokus-Asset einer Zeile = Basiswaehrung bei FX-Paaren (gleiche Wahl wie
beim COT-Metric in der Zeile), sonst das Asset selbst. Neuer dritter
Zurueck-Pillen-Weg (`_quickReturnTab`, neben dem bestehenden
`_quickReturnAssetId`): fuehrt zurueck zum Watchlist-Tab statt zu einer
Asset-Seite, da es kein einzelnes Fokus-Asset gibt.

**Geprueft:** `node --check` aller geaenderten Dateien; eigenes
Verifikationsscript gegen alle 16 Asset-Notizdatensaetze (s.o.);
`node check/all.js` komplett gruen (13 Waechter); Playwright-Stichproben
bestaetigen Watchlist-Quicklinks (Buttonzahl + Klick + Zurueck-Pille),
Notiz-Struktur (Titel/Body/Tags/Unterordner-Kette), Retail-Sentiment-
Balken bei extremen Splits (z.B. 98%/2%, beide Zahlen sichtbar). Keine
Score-Formel angefasst.

## 2026-08-31 — Watchlist-Quicklinks: FX-Paar-Bug + News-Bug + Notiz-Dubletten nachgebessert

**Bugreport (direkt nach VERSION-CHECK-457):** "bei usdcad geht nicht
seasonality weil es da im Filter nicht usdcad gibt" + "wenn ich auf die
quicklinks gehe ist auch oft nicht direkt das Asset ausgewaehlt". Beides per
Playwright gegen das echte DOM nachvollzogen (nicht nur die JS-Variable
geprueft, sondern der tatsaechlich sichtbare `<select>`-Wert je Kategorie),
zwei getrennte Ursachen gefunden:

1. **FX-Paar-Zeilen bekamen Quicklinks zu Kategorien ohne Paar-Filter.**
   Die vorherige Fassung nahm bei einem FX-Paar (z.B. USD/CAD) die
   Basiswaehrung als Ersatz-Asset. Audit aller 8 `ASSET_QUICK_LINKS`-
   Kategorien zeigte: Seasonality/COT/Data/News/Rate Probabilities/
   Calendar/Put-Call filtern AUSNAHMSLOS nach einer einzelnen Waehrung oder
   einem einzelnen Asset - keine einzige hat eine "waehle dieses Paar"-
   Option. Einzige Ausnahme: Trends im Paar-Modus (`trendsPairSel`,
   ALL_PAIRS-Liste inkl. Watchlist-Gruppe). FX-Paar-Zeilen zeigen deshalb
   jetzt nur noch DIESEN einen Quicklink (`watchQuickGoPair()`, setzt
   `trendsFilter='PAIR'` + `trendsPairSel=name` direkt) - dafuer waehlt er
   das Paar dann auch wirklich exakt, statt nur eine Seite davon. Non-FX-
   Zeilen (Gold, BTC, Indizes - ein eindeutiges Einzel-Asset, keine
   Mehrdeutigkeit) unveraendert bei ihren bisherigen 5 Kategorien.
2. **News-Quicklink setzte die falsche Variable** (vorbestehender Bug, traf
   auch die alten Asset-Seiten-Quicklinks, nicht nur die neuen Watchlist-
   Quicklinks): `applyAssetQuickFilter()`s News-Zweig rief `setNewsAsset()`
   auf - das setzt `newsAssetSel`, den Filter des Dashboard-"Headlines"-
   Widgets. Der News-TAB selbst liest aber `newsTabAsset` (eigene
   Zustandsvariable, gesetzt ueber `setNewsTabAsset()` - derselbe Weg, den
   `gotoNewsFor()` vom Kalender aus schon nutzt). Der Tab blieb deshalb nach
   dem Klick bei "All assets" stehen. Fix: News-Zweig ruft jetzt
   `setNewsTabAsset()` auf. Alle anderen 7 Kategorien wurden einzeln gegen
   das DOM verifiziert und waren bereits korrekt.

**Notiz-Dubletten nachgebessert** (Nutzerfrage vorab beantwortet: keine
geteilte Notiz in mehreren Ordnern, sondern eigenstaendig umformulierter
Inhalt je Asset): 104 vom Vortag bekannte Dublettenpaare plus 8 beim
Ueberarbeiten zusaetzlich gefundene Gruppen (macht 235 einzelne Notizen)
in NAS/SP500, GOLD/SILVER, DAX/GER100 (und den Querueberschneidungen
dazwischen) neu geschrieben mit jeweils eigenem inhaltlichem Blickwinkel:
GOLD (Reserve-Asset/Zentralbank-Kauf-Boden) vs. SILVER (zusaetzlich
Industrienachfrage/PMI, kein Zentralbank-Boden, duennerer/volatilerer
Markt); NAS (Mega-Cap/AI-Capex/Duration-Sensitivitaet) vs. SP500 (breiter,
sektor-diversifizierter Referenzindex); DAX (der Kassa-Index/die
Unternehmens-Fundamentaldaten selbst) vs. GER100 (dasselbe Marktgeschehen,
aber als CFD/Futures-Handelsinstrument mit eigenen Mechaniken -
Finanzierungskosten, Roll-Termine, Wochenend-Gap-Risiko, duennere
Liquiditaet ausserhalb der Kassaboersen-Handelszeit). Eigene Nachpruefung
(nicht nur der Agent-Eigenbericht): 0 Dubletten-Titel mehr innerhalb dieses
6-Asset-Clusters, Struktur (6/6/3 je Thema, Titel/Body/Tags/Unterthema) fuer
alle 16 Assets weiterhin fehlerfrei.

**Geprueft:** `node --check` beider geaenderter Dateien; eigenes
Verifikationsscript (Struktur + Dubletten-Scan); `node check/all.js`
komplett gruen (13 Waechter); Playwright bestaetigt USD/CAD-Zeile jetzt nur
noch 1 Quicklink (Trends), Klick waehlt "USD/CAD" exakt im Paar-Filter
(JS-Variable UND sichtbarer DOM-Select-Wert geprueft), Gold-Zeile
weiterhin 5 Quicklinks, News-Quicklink setzt jetzt `newsTabAsset` korrekt.
Keine VERSION-CHECK-Nummer noetig (kein `index.html`-Diff diese Runde, nur
`js/main.js` + `js/asset-notes-seed.js`). Keine Score-Formel angefasst.

## 2026-08-31 — Watchlist-Quicklinks: alle zurueck + "welche Seite?"-Popup + 4 Sentiment-Kategorien + COT-Klick bleibt im Tab

Nutzer-Korrektur zur vorherigen Loesung ("FX-Paar-Zeilen bekommen nur noch
den Trends-Quicklink"): das war die falsche Richtung. Gewuenscht ist,
ALLE Quicklinks auf jeder Zeile zu zeigen - und dort, wo eine Kategorie
nicht das ganze Paar auswaehlen kann (z.B. USD/CAD -> nur USD ODER nur
CAD), erst ein kleines Fenster zu zeigen, das fragt, welche Seite man sehen
will.

**"Welche Seite?"-Popup (`openLegPicker`):** wiederverwendet exakt das
bestehende `.bias-picker`-Popover-Muster (`openBiasPicker`, sonst fuer die
Bias-Auswahl an Notizen) - selbe CSS-Klassen, am Klickpunkt verankertes
kleines Fenster statt eines grossen zentrierten Modals, schliesst bei Klick
daneben. Zeigt "View USD/CAD as…" mit zwei Buttons (USD, CAD); die Wahl
geht direkt in `watchQuickGo()`. Gilt fuer alle Kategorien, die
nachweislich (siehe `applyAssetQuickFilter`) nur eine einzelne
Waehrung/ein einzelnes Asset filtern koennen: Seasonality, COT, Data,
News, Rate Probabilities, Calendar, Put/Call Ratio, Net Options Flow.
**Zwei Kategorien koennen ein Paar dagegen direkt als Ganzes auswaehlen**
(kein Popup): Trends (Paar-Modus, unveraendert) und - neu - **Retail
Sentiment**, weil Myfxbook-Broker-Symbole selbst Paare sind (z.B. USDCAD).

**Sentiment in 4 eigene Quicklinks aufgeteilt** (vorher 1 gemeinsamer, ging
immer zu Put/Call): Retail Sentiment, Put/Call Ratio, Net Options Flow,
Volatility Indicators (VIX + Fear&Greed-Karten, vorher nicht per Quicklink
erreichbar). Alle vier landen auf demselben Tab (`sent`), nur der
Sentiment-Subtab wechselt (`QUICK_LINK_REAL_TAB`-Mapping, weil `showTab()`
sonst versucht haette, einen nicht existierenden Tab `retail`/`putcall`/
`netflow`/`feargreed` zu oeffnen). **Volatility Indicators nur bei
Non-FX-Assets, die die Karte inhaltlich abdeckt** (VIX = S&P 500/Nasdaq,
Crypto Fear&Greed = BTC) - Nutzer-Wunsch, ausdruecklich NICHT bei
Anleihen/Yields und NICHT bei Rohstoffen/Oel (`feargreedEligible()`,
Index/Crypto ja, Metal/Energy/FX/Yield nein). Gilt fuer die Watchlist-
Quicklinks UND die urspruenglichen Asset-Seiten-Quicklinks gleichermassen
(ein gemeinsames `ASSET_QUICK_LINKS`).

`ASSET_QUICK_LINKS` waechst dadurch von 8 auf 11 Eintraege - eine FX-Paar-
Zeile zeigt jetzt 10 (alles ausser Volatility Indicators), eine Non-FX-
Zeile mit abgedeckter Volatilitaets-Karte (Index/Crypto) alle 11, sonst
(Metal/Energy) 10.

**COT-Zeilenklick blieb bisher nicht in der Kategorie** (Nutzer-Wunsch:
"bei cot und anderen Kategorien wenn man da auf ein Asset klickt... mach
aber das man dann einfach in der Kategorie bleibt und zur detail ansicht
kommt"): die COT-Balken-Uebersicht UND die Detail-Tabelle sprangen beim
Klick auf eine Zeile per `gotoSym()` zur Asset-Seite, obwohl COT selbst
schon eine Einzel-Asset-Detailansicht hat (`pickCotFilter`, zeigt
Positionierungs-Historie + Report-Tabelle fuer genau dieses Asset, ohne
den Tab zu verlassen). Beide Zeilen rufen jetzt `pickCotFilter(id)` statt
`gotoSym(id)` auf. Alle anderen `gotoSym`-Aufrufe im Code wurden geprueft
(Dashboard-Widgets wie Performance-Ranking, Heat-Grid, Risk-Sentiment,
Matrix - keine davon hat eine eigene Einzel-Asset-Detailansicht wie COT,
"zur Asset-Seite springen" ist dort weiterhin die richtige, beabsichtigte
Aktion) - nur COT hatte dieses konkrete Muster.

**Geprueft:** `node --check`; Playwright bestaetigt fuer USD/CAD 10
Quicklinks (kein Volatility Indicators), Klick auf "Seasonality" oeffnet
das Popup mit "USD"/"CAD", Wahl von CAD setzt `seasAsset='CAD'` und
navigiert; "Retail Sentiment" waehlt direkt `sentSym='USDCAD'` ohne Popup;
Gold-Zeile 10 Quicklinks, S&P-500-Zeile 11 (inkl. Volatility Indicators);
COT-Zeilen- UND Tabellenklick bleiben auf `curPage==='cot'` und setzen
`cotFilter` korrekt; Asset-Seiten-Quicklinks fuer EUR (10, kein
Volatility Indicators) und BTC (11) korrekt gefiltert. `node check/all.js`
komplett gruen (13 Waechter). Keine VERSION-CHECK-Nummer noetig (kein
`index.html`-Diff). Keine Score-Formel angefasst.

## 2026-08-31 — Filter-Vereinheitlichung, Popover-Zentrierung, Sentiment-Picker, Stapel-Animation, Retail-Datenbug (VERSION-CHECK-458)

**Neue Standing-Regel (in `docs/workflow.md` verankert):** bei jeder
Bugfix-Anweisung ab jetzt IMMER erst reproduzieren (Playwright/Skript, das
den falschen Zustand konkret zeigt), dann fixen, dann hier dokumentieren
was die echte Ursache war - nicht nur "behoben". Alle Punkte unten wurden
so bearbeitet.

**1) Select-Fokusrahmen ("komische Umrandung beim ersten Klick", "erst
kommt nichts"):** reproduziert per `getComputedStyle(select).outlineStyle`
vor/nach `.focus()`: "none 0px" -> "auto 1px". `.btn` war als einzige der
interaktiven Klassen in `index.html` ohne `outline:none` (alle anderen -
`.quick-note`/`.ai`/`.nbox`/`.fsel`/... - unterdruecken den nativen
Fokusrahmen bereits konsequent) - bei einem `<select class="btn">` zeigt
Chromium den Ring schon beim reinen Anklicken, nicht erst bei Tastatur-
Fokus wie bei `<button>`. Der Wertwechsel selbst hat immer funktioniert
(`onchange` feuert normal) - das "nichts passiert"-Gefuehl kam vom
ploetzlichen, unpassenden System-Rahmen. Fix: `outline:none` auf `.btn` +
sauberer `:focus-visible`-Rahmen fuer Tastatur-Nutzer.

**2) Asset-Filter uneinheitlich (Position + Gruppierung):** Audit aller
Fundstellen zeigte DREI leicht unterschiedliche Aufbauten - `assetFilterSelect`
(SB_CATS-Gruppen: FX/Crypto/Metals/Energy/Indices/Yields), `groupedAssetOptions`
(eigene `CLS_LABELS`-Gruppen: "Currencies"/"Commodities" fasste Metals+Energy
zusammen), `sentFilterBar` ("FX Pairs"/ein grosser "Other Assets"-Topf ohne
Aufteilung). Und bei der POSITION: Retail/Put-Call/Net-Options-Flow sassen
bereits oben rechts im Karten-Titel, Seasonality/COT/Data dagegen als eigene
Zeile UEBER bzw. UNTER der Karte. Fix: neue gemeinsame `sbCatsOptgroups()`,
von allen drei Funktionen genutzt (CLS_LABELS entfernt); Seasonality/COT/Data
bekommen denselben Karten-Titel-Aufbau wie Retail Sentiment (Filter oben
rechts per `margin-left:auto`, Mehrfach-Waehrungs-Chips bei COT bleiben ein
eigenstaendiges Zusatzwerkzeug darunter, keine zweite "Asset Filter"-Instanz).
**Dabei ausgeloester Layout-Bug** (vom eigenen `node check/all.js`-Lauf
gefangen, nicht vom Nutzer gemeldet): die neuen Karten-Titel liessen die
`<select>`-Filter auf schmalen Bildschirmen ueber den Kartenrand laufen -
reproduziert/lokalisiert per `element.scrollWidth`: ein `<select>` ohne
feste Breite bemisst sich in Chromium an seiner BREITESTEN Option, nicht an
der sichtbaren, das kann bei vielen Assets/Indikatoren im Filter deutlich
breiter sein als eine schmale Karte. Fix: `min-width:0;max-width:100%` auf
`.cot-filterbar select` + `min-width:0` auf `.cot-filterbar` selbst, damit
es im Flex-Layout wirklich schrumpfen kann.

**3) Watchlist-Quicklinks, zweite Korrekturrunde:** Nutzer-Feedback zur
Vorrunde ("da ist jetzt bei usdcad zb net optionsflow aber es gibt das
nicht fuer cad nur fuer usd") - die vorherige Loesung zeigte bei FX-Paaren
entweder ALLE Kategorien (mit Rate-auf-eine-Seite) oder blendete sie ganz
aus; gewuenscht: IMMER alle Quicklinks zeigen, aber bei Kategorien ohne
Paar-Filter erst ein kleines Fenster fragen, welche Seite (USD oder CAD)
man sehen will (`openLegPicker`, wiederverwendet die `.bias-picker`-CSS).
Zusaetzlich Sentiment nochmal umgebaut: die 4 einzelnen Sentiment-
Quicklinks von vorhin sind wieder EIN gemeinsamer 'sent'-Quicklink -
Klick oeffnet `openSentPicker()`, ein kleines Fenster mit den zutreffenden
Unterkategorien (Retail/Put-Call/Net Options Flow/ggf. Volatility
Indicators). Darin waehlt Retail Sentiment weiterhin direkt das ganze Paar
(Broker-Symbole sind selbst Paare), die anderen drei gehen durch denselben
Seiten-Wahl-Popup wie jede andere leg-only Kategorie.

**4) Alle Popover jetzt zentriert statt am Klickpunkt** (Nutzer-Korrektur:
"immer wenn sich ein Fenster oeffnet... zentriert in der Mitte... nicht an
der Stelle wo man gedrueckt hat"): `.bias-picker` (Bias-Auswahl an Notizen,
Seiten-Wahl-Popup, Sentiment-Picker - alle drei teilen sich die Klasse)
positioniert sich jetzt per `position:fixed;top/left:50%+translate(-50%,-50%)`
statt per JS-berechnetem Klickpunkt-Anker; die bisherige Druckpunkt-Logik
(mw/mh/left/top/transformOrigin) ist komplett raus. Eigene Animations-
Keyframe (`popoverInCenter`) haelt den zentrierenden Transform waehrend der
Eintritts-Animation aufrecht, `.tab-menu` (das andere Popover im Projekt,
bleibt bewusst am Klickpunkt - ein Kontextmenü an einer Tab-Kachel) behaelt
seine eigene, unveraenderte Keyframe.

**5) Offener Kategorie-Stapel schloss beim Tab-Wechsel ohne Animation:**
reproduziert per Playwright - derselbe DOM-Knoten (`#sidebar`/`.np-sub-wrap`)
wurde beim Wechsel auf einen anderen Tab NICHT wiederverwendet, sondern
`showTab()` rief den vollen `renderTabBar()` auf, der die komplette
Navigationsleiste per `innerHTML` neu baut - ein frisch erzeugtes Element
hat keinen Vorher-Zustand und kann deshalb nie animieren (das war sogar
schon so kommentiert: "beim Tabwechsel also bewusst ohne Animation",
also eine fruehere ABSICHTLICHE Entscheidung, die der Nutzer jetzt
ausdruecklich zurueckgenommen hat). Fix: neue `syncNavActive()` (schaltet
nur `.on`/`.has-active`-Klassen an bestehenden Elementen um) ergaenzt das
bereits vorhandene `syncNavExpanded()` - `showTab()` nutzt beide zusammen
statt des vollen Rebuilds, ausser beim allerersten Aufbau (Leiste noch
leer). **Dabei vom eigenen `node check/all.js`-Lauf gefangener Regressions-
Bug:** der Assets-Stapel-Button ist KEIN Eintrag in `tabStacks` (eigener
Sonderfall `ASSET_STACK_ID`) - `syncNavActive()`s generische
`tabStacks.find(...)`-Suche fand ihn deshalb nie und liess `.has-active`
nie zu, "Assets-Stapel wird auf der Assets-Seite nicht hervorgehoben".
Sonderfall ergaenzt (`activeTabId==='fx'`, dieselbe Regel wie
`renderTabBar()`s eigener 'fx'-Zweig).

**6) Retail Sentiment: manche Assets dauerhaft 100% Long/Short.**
Reproduziert per Auswertung der gespeicherten `retailHistory`: US500 und
USOIL standen seit dem allerersten aufgezeichneten Tag (alle 50 Eintraege)
exakt bei 0%/100% - keine echte Positionierungs-Stichprobe rundet sich
ueber so viele Tage konstant auf einen exakten Rand, das jeweils ERSTE
Symbol in ihrer Kandidatenliste (`US500`, `USOIL`) existiert zwar bei
Myfxbook, hat dort aber praktisch keine echte Community-Stichprobe hinter
sich. Ursache: `update-ff-calendar.yml`s Retail-Fetch nahm bei mehreren
Broker-Namens-Kandidaten je Asset einfach den ERSTEN vorhandenen, ohne
die Plausibilitaet des Werts zu pruefen. Fix (Grundsatz "nie schaetzen"):
neue `plausible()`-Pruefung verwirft Werte mit exakt 0%/100% - bei NONFX-
Assets wird dann der naechste Kandidat probiert (z.B. SP500/SPX500 statt
US500), bei FX-Majors bleibt das Paar den Lauf einfach aussen vor. Die
bereits gespeicherten falschen Werte manuell bereinigt (`US500`/`USOIL`
aus `retail` entfernt, ihre komplette `retailHistory` geloescht - keine
einzige der 50 Eintraege war je echt, kein Backfill/Schaetzen noetig).
Erscheinen automatisch wieder, sobald ein Kandidat einen plausiblen Wert
liefert.

**Geprueft:** `node --check` aller geaenderten Dateien; Playwright bestaetigt
alle 6 Punkte einzeln (Fokusrahmen-Reproduktion, Filter-Gruppen bei
Seasonality/COT/Data/Retail identisch, kein Overflow mehr auf 390px-Breite,
Sentiment-Picker + Seiten-Wahl-Popup beide exakt zentriert (Delta 0px),
Stapel-DOM-Knoten wird beim Tab-Wechsel wiederverwendet statt neu gebaut,
Assets-Stapel-Hervorhebung); `node check/all.js` komplett gruen (13
Waechter, inkl. der zwei oben genannten Regressionen, die der Waechter-Lauf
selbst vor dem Push gefangen hat). Keine Score-Formel angefasst.

## 2026-08-31 — Watchlist: zweite Quicklink-Zeile mit Direktlinks zur Assets-Seite (VERSION-CHECK-459)

Nutzer-Wunsch: unter den bestehenden Kategorie-Quicklinks (Seasonality/
COT/Sentiment/...) noch eine zweite, farblich abgehobene Zeile, die direkt
zur vollen Assets-Detailseite fuehrt (`gotoSym()`, dieselbe Seite wie
ueberall sonst im Research-Terminal - keine gefilterte Unteransicht wie
COT/Seasonality, deshalb auch keine eigene Zurueck-Pille noetig, die
Asset-Seite hat ihre eigene Navigation). Bei einer FX-Paar-Zeile (z.B.
USD/CAD) je ein Button pro Seite ("USD Asset", "CAD Asset"), weil das
Paar zwei verschiedene Asset-Seiten hat; bei einem Non-FX-Asset (z.B.
Gold) nur einer ("Gold Asset"), weil es nur die eine Asset-Seite gibt.
Neue CSS-Klasse `.aql-asset` (blauer Akzent statt der neutralen
Kategorie-Optik) macht den Unterschied zum darueberliegenden Quicklink-
Typ auf den ersten Blick erkennbar.

**Geprueft:** `node --check`; Playwright bestaetigt USD/CAD zeigt genau 2
Direktlinks ("USD Asset", "CAD Asset"), Gold genau 1 ("Gold Asset"), Klick
auf "CAD Asset" navigiert korrekt zur Asset-Seite mit CAD ausgewaehlt
(`curPage==='cur'`, `getSym().id==='CAD'`); `node check/all.js` komplett
gruen (13 Waechter). Keine Score-Formel angefasst.

## 2026-08-31 — History als Zeitstrahl mit Wochen->Tage-Drill-down (VERSION-CHECK-460)

Nutzer-Wunsch: die Score-History je Asset (bisher eine vertikale Liste aus
Wochen-Karten mit Tages-Listen darunter) als horizontalen Zeitstrahl von
links nach rechts, mit Drill-down beim Anklicken. Vorher per
`AskUserQuestion` abgestimmt (95%-Sicherheits-Regel bei Design-
Entscheidungen): Balken statt Punkte/Linie, bestaetigt.

**Neue Struktur (`histTimelineChart()`, neue generische Funktion):**
Diverging Balken-Chart (Nulllinie mittig, positive Netto-Bewegung gruen
nach oben, negative rot nach unten) - gleiches Grundmuster wie
`seasBarChart()` bei Seasonality, hier aber mit Klick-Handler je Balken.
Oben EIN Zeitstrahl mit einem Balken je WOCHE (aeltester Balken links,
neuester rechts - `weeks` war intern neueste-zuerst sortiert, fuer den
Zeitstrahl umgedreht). Klick auf einen Wochen-Balken klappt darunter einen
zweiten Zeitstrahl mit einem Balken je TAG dieser Woche auf (eingezogen,
mit Akzentstrich als visuelle Hierarchie-Markierung). Klick auf einen
Tag-Balken zeigt darunter die BESTEHENDE Detail-Karte (Events, manuelle
Aenderungen, Score-Aufschluesselung) - deren Inhalt/Logik ist komplett
unveraendert, nur der Zugriffsweg ist neu (Zeitstrahl-Klick statt endloses
Scrollen). Zustand ueber zwei neue Variablen (`histExpandWeek`,
`histExpandDay`) - Klick auf denselben Balken klappt wieder zu.

Wochen-Balken-Wert = Netto-Score-Aenderung der Woche (Wochenanfang vs.
Wochenende, wie zuvor). Tages-Balken-Wert = Tages-Delta zum Vortag (dieselbe
Zahl, die vorher schon als "+/-X" neben jedem Tag stand) - konsistente
Bedeutung auf beiden Zoom-Stufen ("wie stark hat sich hier etwas bewegt").
Ein Balken ohne aufgezeichneten Wert wird als duenner grauer Strich auf der
Nulllinie gezeichnet statt unsichtbar zu bleiben. Die bisherigen, jetzt
toten CSS-Regeln fuer die alten Wochen-Karten (`.histp-week`,
`.histp-weekhdr`, `.histp-weeklbl`, `.histp-weeknet`, `.histp-weekcnt`)
entfernt, `.histp-weekempty` bleibt (wird jetzt fuer einen leeren
aufgeklappten Tag genutzt).

**Geprueft:** `node --check`; Playwright bestaetigt: 6 Wochen-Balken bei
30-Tage-Bereich, Klick auf die aktuelle Woche klappt einen Tages-Zeitstrahl
mit korrektem Label ("Mon, Aug 31 – Sun, Sep 6") auf, ein VOLLSTAENDIGER
Wochen-Balken zeigt 7 Tages-Balken, Klick auf einen Tag zeigt die
bestehende Detail-Karte mit korrektem Inhalt, erneuter Klick auf denselben
Wochen-Balken klappt wieder zu, SVG-`<title>`-Tooltips liefern korrekten
Text. `node check/all.js` komplett gruen (13 Waechter). Keine Score-Formel
angefasst (nur die Anzeige einer bereits bestehenden Zahl).

## 2026-09-01 — Kritischer Bugfix: Notizen in mehreren Ordnern verschwanden dauerhaft (Cross-Tab-Sync-Race)

Nutzer-Bugreport (dringend, Datenverlust): *"Ich habe Notizen geschrieben
und diese in mehrere Ordner abgelegt, jetzt sind sie weg - das ist nur mit
Notizen in mehreren Ordnern passiert."* Erste Rueckfrage ergab: Cloud-Sync
ist auf mehreren Geraeten aktiv, die Notiz war nach einem Neuladen noch da,
verschwand aber SPAETER von selbst (kein zweites Geraet dazwischen benutzt) -
und liess sich mit einer frisch angelegten Mehrfach-Ordner-Notiz erneut
ausloesen.

**Reproduktion (Pflicht laut der eigenen Regel weiter oben in dieser Datei,
"Bugfixes: IMMER erst reproduzieren"):** zwei zuerst gepruefte, plausible
Theorien (die `seedAssetBehaviorNotes()`-Aufraeumlogik der V2->V3-Migration;
ein einfacher Erstell->Speichern->Neuladen-Zyklus) wurden je per
Playwright-Skript nachgebaut und BEIDE widerlegt - die Notiz ueberlebte in
beiden Faellen intakt. Der tatsaechliche Ausloeser brauchte gar kein zweites
GERAET, nur einen zweiten TAB derselben App im selben Browser (z.B. ein
liegen gebliebener alter Tab, oder die App parallel als PWA-Icon UND im
Browser offen): Tab A bleibt im Hintergrund offen, Tab B legt eine Notiz mit
2 Ordnern an. Mit Playwright (zwei `page`-Objekte im selben Browser-Context,
`http://127.0.0.1:8935`, echte `localStorage`-`storage`-Events) liess sich
der Verlust ueber `save()`/`adoptExternalState()` zuverlaessig (bei einem
eng getakteten Ablauf nahezu 100%) nachstellen.

**Root Cause 1 - kein Merge, nur Overwrite:** `applySnap()` (der gemeinsame
Trichter fuer Cloud-Pull/Multi-Tab-Adopt/Undo/Redo/Backup/Import) ersetzte
`research`/`researchFolders` bei JEDEM Aufruf komplett, genau wie `syms`
etc. - anders als `scoreHist`, fuer das schon frueher extra ein
`mergeScoreHist()` gebaut wurde (siehe Kommentar dort: "die beiden Geraete
haben typischerweise DISJUNKTE Tage angesammelt ... ein Overwrite wuerde die
jeweils andere Historie loeschen"). Fuer Notizen gilt exakt dasselbe Muster,
war bisher aber nicht beruecksichtigt.

**Root Cause 2 - der Marker-Guard kann durch Cross-Tab-IPC-Verzoegerung
"luegen":** `save()`s Multi-Tab-Schutz vergleicht nur den Zeitstempel-Marker
`fxpro_updated` gegen den zuletzt gesehenen Wert, um zu entscheiden
"schreibe ich blind druber, oder adoptiere ich erst fremden Stand". Per
Playwright bis auf die Millisekunde nachgewiesen: ein anderer Tab schreibt
den eigentlichen Inhalt (`fxpro_v1`) und den Marker (`fxpro_updated`) als
ZWEI GETRENNTE `localStorage`-Aufrufe - diese werden cross-tab
UNTERSCHIEDLICH schnell sichtbar (gemessene Faelle mit >100ms Versatz, bei
denen der neue Inhalt hier schon lesbar war, der neue Marker aber noch
nicht). Ein Tab, der zufaellig GENAU in diesem Fenster seinen eigenen
automatischen (nicht selbst editierten) `save()` ausloest, haelt sich fuer
"auf dem neuesten Stand" (Marker stimmt noch) und ueberschreibt den
Plattenstand mit seinem eigenen, aelteren `research` - die fremde Notiz ist
weg, ohne dass irgendein Fehler sichtbar wird.

**Fix (drei Ebenen, alle in `js/main.js`):**
1. `mergeResearchNotes(base,override)` / `mergeResearchFolders(base,override)`
   (neu, neben `mergeScoreHist()`): Vereinigung nach `id`, bei einer
   Notiz-Kollision gewinnt die zuletzt bearbeitete (`n.up`). Wie bei
   `mergeScoreHist` bewusst kein echtes geraete-/tab-uebergreifendes Loeschen
   (eine ueber `delResNote()` geloeschte Notiz kann aus einem noch nicht
   synchronisierten Tab zurueckkehren) - ein bewusster, bereits akzeptierter
   Kompromiss, unendlich besser als der vorher gemeldete Totalverlust.
2. `applySnap()`: fuer die beiden PASSIVEN Sync-Pfade (`_flipCauseTag==='sync'`,
   also `adoptExternalState()`/`cloudPull()`) werden `research.notes`/
   `researchFolders` jetzt gemergt statt ersetzt. Fuer Undo/Redo/
   Backup-Restore/Import bleibt es bewusst ein echter Overwrite (dort IST
   das Ersetzen die gewollte Aktion).
3. `adoptExternalState()`: liest den Marker jetzt VOR dem Inhalt (statt wie
   bisher danach) und mit einem bis zu 4-fachen Settle-Loop, der nach
   `applySnap()` prueft, ob sich Inhalt/Marker seitdem nochmal geaendert
   haben. `save()`: als zweite, vom Marker-Timing UNABHAENGIGE
   Sicherheitsebene wird bei jedem automatischen (>=3s seit der letzten
   eigenen Aktion, dieselbe Schwelle wie beim bestehenden Marker-Guard)
   `save()` zusaetzlich der GERADE AUF DER PLATTE stehende Research-Stand
   direkt vor dem Schreiben gemergt - unabhaengig davon, was der
   Marker-Vergleich sagt, macht das ein Ueberschreiben fremder Notizen
   strukturell unmoeglich.

**Geprueft:** `node --check` (js/main.js als ESM). Drei unabhaengige
Playwright-Reproduktionen (Zwei-Tabs-Race mit `waitForTimeout`, Zwei-Tabs-Race
mit sofortigem `save()` ohne Wartezeit/staerkster Fall, Multi-Event-Trace mit
Zeitstempeln) liefen VOR dem Fix zuverlaessig rot (Notiz weg in 90-100% der
Laeufe je nach Szenario) und NACH dem Fix in insgesamt 43/43 Wiederholungen
gruen. `node check/all.js --static` gruen; voller `node check/all.js`
(inkl. Browser-Checks) ebenfalls gepruft. Keine Aenderung an `index.html` in
diesem Fix (nur `js/main.js`) - VERSION-CHECK-Banner daher unveraendert,
laut `docs/workflow.md` nur bei `index.html`-Aenderungen Pflicht.

**Zur Wiederherstellung bereits verlorener Notizen:** kein direkter
Zugriff auf die Daten des Nutzers moeglich. Empfohlener Weg: Einstellungen
-> "Backups"-Button -> `openBackupM()` zeigt bis zu 5 automatische lokale
Schnappschuesse (alle 10 Minuten + vor jedem Cloud-Download,
`localStorage`-Schluessel `fxpro_backups`) mit "Wiederherstellen"-Option -
falls einer davon von VOR dem beobachteten Verschwinden stammt, laesst sich
die Notiz darueber zurueckholen.

## 2026-09-01 — Notiz-Datenverlust ZWEITES Mal gemeldet: navigator.locks statt reinem Merge + Papierkorb (VERSION-CHECK-461)

Trotz des Merge-Fixes vom selben Tag (Eintrag direkt oberhalb) meldete der
Nutzer erneut eine verschwundene Notiz (diesmal mit fuer mehrere Assets neu
angelegten Ordnern). Laut "Bugfixes: IMMER erst reproduzieren"-Regel weiter
oben in dieser Datei: nicht direkt am Code herumgedoktert, sondern zuerst
gezielt nachgestellt.

**Reproduktion 1 (bestaetigt eine LUECKE im vorherigen Fix, nicht dessen
Widerlegung):** derselbe Zwei-Tab-Aufbau wie beim ersten Fix, aber mit einer
zweiten, aktiveren Variante - ein Hintergrund-Tab, der `save()` alle 150ms
aufruft (simuliert mehrere ueberlappende automatische Hintergrund-Ereignisse
statt nur eines). Ergebnis: 4 von 5 Laeufen verloren die Notiz TROTZ des
"gegen die Platte mergen"-Fixes. Root Cause: ein reiner "lies Disk, merge,
schreib"-Zyklus OHNE echte Sperre schliesst die Race nur statistisch, nicht
strukturell - der eigene Schreibvorgang liest sich selbst immer korrekt
zurueck, das sagt aber nichts darueber, ob ein ANDERER Tab GENAU IN DIESEM
MOMENT ebenfalls schreibt. Sobald Tab A einmal mit einem (noch) notizlosen
Stand gewinnt, bevor Tab B ueberhaupt geschrieben hat, ist die Notiz fuer
immer weg, weil niemand sie danach nochmal schreibt.

**Fix 1:** `navigator.locks.request('fxpro_sync_lock',...)` (Web Locks API,
seit 2022 breit unterstuetzt: Chrome/Edge 69+, Firefox 96+, Safari 15.4+) in
`save()` und `cloudPull()` - serialisiert den kompletten Lese-Merge-Schreib-
Zyklus ECHT ueber alle Tabs desselben Ursprungs hinweg, schliesst die Race
strukturell statt nur statistisch. **Erste Fassung dieses Fixes war
UNVOLLSTAENDIG** (per Playwright selbst widerlegt, bevor sie committet
wurde): nur AUTOMATISCHE Saves (>=3s seit der letzten eigenen Aktion) gingen
durch die Sperre, frische Nutzer-Edits blieben bewusst ungesperrt (um keine
Verzoegerung bei einer aktiven Aktion zu riskieren) - dadurch konnte ein
frischer Edit weiterhin MITTEN in den gesperrten Zyklus eines anderen Tabs
hineinschreiben, die Sperre schuetzt naemlich nur, wenn ALLE Schreiber
denselben Lock-Namen benutzen. Korrigiert: JEDER `save()`-Aufruf geht jetzt
durch dieselbe Sperre (bei einer unbeanspruchten Sperre praktisch sofort,
kein spuerbarer Unterschied). Nach der Korrektur: 43/43 Wiederholungen
gruen ueber drei verschiedene Szenarien (Zwei-Tab-Race mit Wartezeit, ohne
Wartezeit, mit 150ms-Hintergrund-Stress) plus die urspruenglichen Notizen-
mit-neu-angelegten-Ordnern-Faelle aus dem Nutzer-Bugreport.

**Zusaetzlich als eigener Wunsch gemeldet: ein Papierkorb.** Nutzer-Zitat:
*"Kannst du bitte das Problem lösen und noch einbauen das alles was auf der
Webseite verschwindet abgelegt wird in eine Art Müll Eimer... 30 Tagen
gelöscht werden. Zeig auch wie viele Tage pro müllstück verbleiben."*
**Scoping-Entscheidung** (nicht separat erfragt, da aus dem Gespraechs-
kontext eindeutig): auf Notizen + Ordner begrenzt (research.notes/
researchFolders) - das ist konkret das, was tatsaechlich verschwindet;
Symbole/Paare/Widgets haben eigene, bereits mit Bestaetigungsdialog
abgesicherte Loeschwege und waeren reines Scope-Aufblaehen ohne echten
Bezug zum gemeldeten Problem.

**Implementierung** (`js/main.js`):
- `research.trash` (neues Array, Teil von `research` -> laeuft automatisch
  über `snap()`/`applySnap()` mit): Eintraege `{id,kind:'note'|'folder',
  data:<vollstaendiges Objekt>,delAt:<ISO-Zeitstempel>}`.
- `trashResNote(n)`: von `delResNote()` aufgerufen, VOR dem eigentlichen
  Entfernen aus `research.notes`.
- `researchDelFolder(id)`: **zusaetzlicher Bugfix** (bisher unbemerkter,
  verwandter Fehler) - loeschte kaskadierend Ordner, bereinigte aber NIE die
  `fids`-Referenzen betroffener Notizen. Eine Notiz, deren EINZIGER Ordner
  geloescht wurde, blieb technisch in `research.notes` bestehen, war aber
  ueber keinen Ordner mehr erreichbar - praktisch identisch zum gemeldeten
  Datenverlust, nur ueber einen anderen Pfad. Jetzt: doomed-Ordner werden in
  den Papierkorb verschoben, `fids` aller betroffenen Notizen bereinigt, und
  eine Notiz, die dadurch KEINE Ordner-Referenz und kein `asset`-Tag mehr
  haette, wandert ebenfalls in den Papierkorb statt zu verwaisen.
- `pruneResearchTrash(trash)`: entfernt Eintraege mit `delAt` >30 Tage
  (`TRASH_TTL_MS`), laeuft bei jedem `migrateResearch()`-Durchlauf (Boot,
  Cloud-Pull, Multi-Tab-Adopt) - gleiches Muster wie `pruneEventAlerts()`/
  `pruneScoreLog()`.
- `mergeResearchTrash(base,override)`: derselbe Merge-statt-Overwrite wie
  bei `mergeResearchNotes`/`-Folders` (siehe `docs/state-sync.md`) - sonst
  waere der Papierkorb selbst wieder anfaellig fuer das Problem, vor dem er
  schuetzen soll.
- `openTrashM()`/`restoreTrashItem(id)`/`permaDeleteTrashItem(id)`: neues
  Modal `#mTrash` (Einstellungen -> "🗑 Trash"-Button neben "Backups"),
  zeigt je Eintrag Titel/Name, Art (Notiz/Ordner), verbleibende Tage
  ("`X days left`") und Loeschdatum, mit Wiederherstellen- (↩) und
  Endgueltig-loeschen-Knopf (✕). Ein wiederhergestellter Ordner, dessen
  Elternordner nicht mit wiederhergestellt wurde, haengt sich an die Wurzel
  statt unsichtbar zu bleiben.

**Bewusst NICHT im Papierkorb erfasst:** die automatische
`seedAssetBehaviorNotes()`-Bereinigung (routinemaessiges Ersetzen der
`seed:true`-Verhaltensnotizen bei einem Inhalts-Versionssprung) - das waere
reines Rauschen, keine echte Nutzer-Aktion.

**Geprueft:** `node --check`. Funktionaler Playwright-Test (5 Schritte):
Notiz anlegen -> loeschen -> im Papierkorb mit korrekter Restdauer sichtbar
-> wiederherstellen (zurueck in research.notes, raus aus dem Papierkorb) ->
Ordner-Kaskade (Notiz nur in einem neu angelegten Ordner, Ordner loeschen,
Notiz UND Ordner landen im Papierkorb statt zu verschwinden) -> 30-Tage-
Alters-Bereinigung (kuenstlich gealterter Eintrag verschwindet nach
`pruneResearchTrash()`) - alle 5 Schritte gruen. Sync-Race-Reproduktionen
erneut 20/20 gruen nach den Papierkorb-Aenderungen (keine Regression).
`node check/all.js --static` gruen; voller Lauf inkl. Browser-Checks
ebenfalls gepueft. `docs/state-sync.md` um den `research`/`researchFolders`/
`research.trash`-Sonderfall ergaenzt (analog zum bestehenden `scoreHist`-
Abschnitt, inkl. der Lock-Vollstaendigkeits-Falle als Warnung fuer
kuenftige aehnliche Faelle).

---

## 2026-09-01 — ZWEITE APP IM REPO: „Perfect Rezept" (REZEPT-CHECK-1, VERSION-CHECK-462)

Nutzer-Wunsch: beim Öffnen der Webseite soll ein Fenster kommen, in dem man
zwischen **FX Analyst Pro** und **Perfect Rezept** wählt; Perfect Rezept ist
eine eigene Webseite innerhalb derselben Website, mit hellbraunem Design,
aber demselben Aufbau (gleiche Kopfleiste, gleiche Kategorien-Sidebar links).

**Ausdrückliche Trennungs-Vorgabe (wörtlich):** *„es sind wirklich zwei
verschiedene Apps, also zwei verschiedene Webseiten … ich möchte auch, dass
du den ganzen Code in neuen Dateien schreibst und das im cloud.md-File
deutlich machst … wenn man am FX Analyst Pro arbeitet, sollen nicht die
anderen ganzen Dateien durchgelesen werden und andersrum. Allerdings sollst
du aus dem FX Analyst Pro rauskopieren und diese nutzen und die generelle
Struktur davon nutzen."* → Umgesetzt als `rezept.html` + `js/rezept/*.js`
mit eigener Doku `docs/rezept.md`; `CLAUDE.md` sagt jetzt in der ERSTEN
Sektion, welche Dateien zu welcher App gehören und was man bei welcher
Aufgabe NICHT lesen muss.

**Was gebaut wurde**
- **App-Weiche:** `#appChoiceOv` in `index.html` (nur beim allerersten
  Öffnen), Wahl in `localStorage['dmfx_app_choice']`, plus eine
  `location.replace()`-Weiche ganz oben im `<head>` — sonst würde der
  komplette FX-Boot laufen, nur um verworfen zu werden. Wechsel in BEIDEN
  Apps unter *Settings → Apps*.
- **Overview** mit drei Karten: `Today's Meal` und `Random Picker` als
  ausdrückliche Platzhalter, `Add New Meal` führt in die Kategorie *Recipes*
  UND öffnet dort direkt das Hinzufügen-Fenster.
- **Recipes:** Raster mit drei Karten pro Reihe (2 unter 1000px, 1 unter
  620px), Bild mit Titel darin, Dauer unten rechts, Favoriten-Stern oben
  rechts; Suche, Zeit-Filter, Tag-Filter, Favoriten-Filter.
- **Hinzufügen/Bearbeiten:** Titelbild (Pflicht), Titel, Dauer-Dropdown in
  5-Minuten-Schritten, Tags, Zutatenliste, und eine Zubereitung aus
  **Blöcken** — Text und Bild beliebig gemischt und sortierbar (Nutzer:
  *„entweder in die Zubereitung Text schreiben oder auch ein Bild hinzufügen
  und Text schreiben. Beides ist möglich"*).
- **Detailfenster:** Bild oben, Titel, Dauer/Tags, Zutaten, Zubereitung;
  Drei-Punkte-Menü oben rechts (Bearbeiten / Favorit / Papierkorb).
- **Papierkorb, 30 Tage**, Wiederherstellung unter *Settings → Trash*.
- **Vier braune Themes** (`clay`, `mocha`, `paper`, `sand`), umschaltbar
  unter *Settings → Appearance* — der Nutzer wollte sie alle ausprobieren
  können; Standard ist `clay` (Terracotta/Espresso).

**Die eine Entscheidung, die wirklich zählt — wohin die Bilder gehen.**
Der naheliegende Weg (Rezepte in `snap()`/`cloudPush()` des FX Analyst Pro
hängen) wäre ein Fehler gewesen: dieser Push schiebt bei JEDER Änderung den
kompletten Zustand als eine JSON-Zeile hoch — jeder beliebige FX-Autosave
(z. B. der stündliche Kalender-Refresh) hätte damit sämtliche Rezeptbilder
erneut hochgeladen. Stattdessen eigene Zeilen in der BESTEHENDEN
`fx_sync`-Tabelle (kein neues Supabase-Setup): `<syncId>:rez:index` fürs
Verzeichnis inkl. Mini-Thumbnails (ein Request rendert das ganze Raster),
`<syncId>:rez:r:<id>` je Rezept für die Vollbilder (erst beim Öffnen geholt,
in IndexedDB gecacht). Hochgeladen wird nur das GEÄNDERTE Rezept.
Bilder werden im Browser iterativ auf ein **Byte-Budget** gerechnet
(Titelbild ≤ 260 KB, Block ≤ 180 KB, Thumbnail ≤ 34 KB), nicht nur auf eine
Kantenlänge — bei 100 Rezepten sind das ~35 MB von 500 MB im Supabase-Free-
Tarif. localStorage schied für Bilder aus (~5 MB Limit), deshalb IndexedDB.

**Wiederholungsfalle vermieden:** `mergeIndex()` statt Overwrite, mit
Grabsteinen für gelöschte Rezepte und `navigator.locks` um den
Lies-Merge-Schreib-Zyklus — exakt das Muster, das bei `scoreHist`
(2026-07-20) und den Research-Notizen (2026-09-01) erst NACH einem
Datenverlust nachgerüstet werden musste. Hier von Anfang an drin, weil zwei
Geräte typischerweise unabhängig voneinander neue Rezepte anlegen.

**Wächter mitgezogen** (sonst wäre die halbe ausgelieferte Codebasis blind):
`check/syntax.js` prüft jetzt beide HTML-Seiten und `js/rezept/*`;
`check/rules.js` bekam Regel 1b (REZEPT-CHECK-Nummer muss bei jeder
Änderung an `rezept.html`/`js/rezept/*` steigen); alle neun Browser-Prüfungen
setzen `dmfx_app_choice='fx'` und entfernen `#appChoiceOv`, sonst hätte das
Auswahlfenster jeden Playwright-Lauf blockiert.

**Verifiziert per Playwright** (nicht nur „sieht gut aus"): Auswahlfenster →
Weiterleitung → Rezept mit echtem Bild-Upload anlegen → Karte im Raster →
Detailfenster mit Zutaten und Text-/Bild-Blöcken → Reload (Persistenz aus
IndexedDB) → Suche/Filter → Papierkorb + Wiederherstellen → App-Wechsel
zurück; dazu Überlauf-Messung auf 1920/1440/1100/900/700/500/390px
(3/3/3/2/2/1/1 Spalten, kein Überlauf, kein Text außerhalb einer Karte) und
null JS-Fehler.

**Offen/bewusst weggelassen:** die Funktion hinter `Today's Meal` und
`Random Picker` (ausdrücklich als Platzhalter bestellt); Perfect Rezept hat
keine PIN-Sperre (die Seite liegt ohnehin hinter Cloudflare Access, und
Rezepte sind keine schützenswerten Daten).

---

## 2026-09-01 (2) — ZWEI REPRODUZIERTE FEHLER, NACHFRAGE BEI UNGESPEICHERTEN EINGABEN, NEUE PALETTEN (VERSION-CHECK-463 / REZEPT-CHECK-2)

Nutzer-Meldung: *„Das speichern klappt nicht das Bild hinzufügen geht nicht …
mach das alle Buttons usw auch wirklich eine Funktion haben und auch
funktionieren aktuell klappt fast nix."* Beides zuerst reproduziert, dann
gefixt (CLAUDE.md-Regel), nicht anhand einer Vermutung repariert.

### Fehler 1 — „das Bild hinzufügen geht nicht": Datei-Dialog hing nicht im DOM

`pickFile()` in `js/rezept/app.js` hat einen frei erzeugten, **nicht
eingehängten** `<input type="file">` geklickt. Chromium öffnet den Dialog so
trotzdem — **iOS/macOS Safari nicht**, und genau darauf läuft die App des
Nutzers (iPad/iPhone). Der Klick verpufft dabei ohne jede Fehlermeldung.
Nachweis im Repro-Lauf: `document.body.contains(inp) === false`.
**Fix:** einhängen (unsichtbar, `position:fixed;left:-9999px`), klicken,
danach wieder entfernen; Aufräumen auch, wenn der Dialog abgebrochen wird.
**Folgefehler, der die zweite Meldung erklärt:** ohne Bild verweigert
`rezSaveForm()` das Speichern — für den Nutzer sah das aus wie „Speichern
klappt nicht", war aber nur die Pflicht-Prüfung nach dem ausgefallenen
Bild-Dialog.

### Fehler 2 — „das Speichern klappt nicht": stille Promise-Rejection

Der Speicherpfad hatte **kein einziges `try/catch`**. Per Playwright mit
blockierter IndexedDB-Transaktion (`QuotaExceededError`, wie im Privatmodus
oder bei vollem Speicher) reproduziert: das Hinzufügen-Fenster blieb offen,
es erschien KEINE Meldung, gespeichert wurde nichts — die Ausnahme landete
als unbehandelte Promise-Rejection nur in der Konsole.
**Fix, zwei Ebenen:** (1) jede IndexedDB-Operation fängt jetzt selbst ab und
fällt auf eine Speicher-Map zurück (`state.dbBroken`, Kopfzeile zeigt
„No local storage — cloud sync only") — der Cloud-Sync speichert weiter, die
Sitzung läuft; (2) `rezSaveForm()` fängt ab, zeigt die echte Fehlermeldung im
Formular und gibt `true`/`false` zurück, damit „Save & close" das Fenster
nicht schließt, wenn gar nicht gespeichert wurde.
**Merksatz:** eine unbehandelte Promise-Rejection sieht für den Nutzer exakt
aus wie „die App macht nichts". Kein Schreibpfad ohne sichtbare Meldung.

### Ungespeicherte Eingaben — in BEIDEN Apps

Nutzer: *„wenn man eine Notiz oder ein Rezept hinzufügt und man neben das
Fenster schließt, ist das was man eingegeben hat weg."* Ursache im FX Analyst
Pro: der generische Overlay-Klick-Handler (`js/main.js`, `_ovPressId`)
schließt JEDES `.ov`-Fenster sofort, ohne zu fragen. Statt einer Sonderlösung
je Fenster gibt es jetzt **`MODAL_GUARDS`** — eine Registrierstelle
`{dirty, save}` pro Fenster; `closeMGuarded()` zeigt bei ungespeicherten
Änderungen das zentrierte `#mUnsaved` mit drei Wegen: *Discard & close*
(rot = bearish), *Save & close* (grau), *Keep editing* (blau = bullish), also
in den Bias-Farben dieser App wie vom Nutzer verlangt. Registriert ist
zunächst der Notiz-Editor (`resNoteDirty`/`saveResNote`); **ein neues
Eingabe-Fenster gehört dort eingetragen**, nicht mit eigenem Code versehen.
In der Rezept-App macht `rezRequestClose()` dasselbe für Klick-daneben,
Escape und *Cancel*.
Verifiziert: leeres Formular schließt ohne Nachfrage; getipptes fragt nach;
*Keep editing* behält den Text; *Save & close* speichert wirklich;
*Discard & close* verwirft; der *Cancel*-Button geht denselben Weg.

**Nebenbefund, bewusst NICHT angefasst:** ein Klick neben ein frisch
geöffnetes, noch leeres Notiz-Fenster schließt es manchmal nicht — ein in der
Capture-Phase registrierter „Klick-außerhalb"-Handler eines Pickers
(`biasPickerOutside` & Verwandte) schluckt den ersten Klick. Verhalten ist
identisch auf `origin/main`, also nicht neu, und es scheitert SICHER (das
Fenster bleibt offen, nichts geht verloren). Ein Eingriff in die
Picker-Handler hätte echtes Regressionsrisiko für einen Fehler, der Daten
schützt statt sie zu kosten.

### Paletten: acht braun raus, neun weiß/grau rein

Nutzer-Wunsch: *„entfern die aktuellen Paletten außer papercookbook"* und
*„probier mal was weißes mit Grautönen … mach ruhig so 8 unterschiedliche"*.
`clay`/`mocha`/`sand` sind weg; neu sind `linear`, `notion`, `vercel`,
`github`, `stripe`, `ios`, `swiss`, `fog`, `graphite` — jede an einem real
existierenden Design-System orientiert statt frei erfunden. Standard ist
jetzt `linear`.
**Migration nicht vergessen:** ein Gerät mit `clay` im Speicher hätte GAR
KEIN `[data-rez-theme]`-Regelwerk getroffen und ohne eine einzige
Farbvariable dagestanden. Die Migrationsliste steht in der Früh-Weiche im
`<head>` und als `THEME_IDS` in `app.js`; `check/rezept.js` prüft den Fall
mit einem echten zweiten Seitenaufruf.
**Kontrast nachgerechnet, nicht geschätzt:** die erste Fassung hatte 25
Textfarben unter AA (bis hinunter auf 2,86:1) — alle 14 betroffenen Werte
wurden nachgezogen. Drei Stellen hingen außerdem noch an den alten braunen
Annahmen und wären bei hellen Paletten unsichtbar geworden: der Toast
(`var(--chrome-bg)` mit hellem Text → weiß auf weiß, jetzt fest dunkel), der
Profil-Kreis (`--avatar-bg`/`--avatar-fg`) und der LIVE-Punkt (`--live`).

### Neuer Wächter `check/rezept.js`

Fünf Stufen, weil beide Fehler oben von einer Prüfung hätten gefunden werden
können: **A** jeder Inline-Handler löst sich zu einer echten Funktion auf
(bei ES-Modulen ist eine vergessene Zeile in der `window`-Brücke der
häufigste Grund für „der Button tut nichts"), **B** jeder sichtbare Button
verändert wirklich den DOM, **C** der komplette Ablauf (anlegen mit echtem
Bild-Upload, bearbeiten, favorisieren, alle Filter, Papierkorb,
Wiederherstellen, alle Themes durchschalten, Theme-Migration), **D** die
Nachfrage bei ungespeicherten Eingaben, **E** Kontrast jeder Palette gegen
jede ihrer Flächen.
Der erste Lauf meldete 11 Punkte, davon **9 Messfehler des Wächters selbst** —
`event.stopPropagation()` ist keine globale Funktion; ein Schalter, der schon
in seinem Zielzustand steht, darf nichts ändern; und vor allem: Stufe B setzt
beim Durchklicken Filter, sodass der nächste Klick den Stern einer
AUSGEBLENDETEN Karte trifft und das sichtbare Raster gleich bleibt, obwohl
der Schalter korrekt arbeitet. Merksatz für künftige „klick alles"-Wächter:
**vor jedem Klick den Zustand zurücksetzen und die Elementliste neu abfragen**,
sonst misst man die Nachwirkungen des vorherigen Klicks.

---

## 2026-09-02 — VIER NEUE KATEGORIEN + REEL-IMPORT (REZEPT-CHECK-3)

Nutzer: *„Ja bau das alles ein aber achte auf Qualität ich hoffe du kannst das
umsetzen dass man Instagram Reels importieren kann und die automatisch zu
einem Rezept werden."*

### Instagram-Import — was geht und was nicht (bitte vor dem nächsten Anlauf lesen)

**Der Text eines Reels lässt sich aus dem Browser heraus NICHT automatisch
holen.** Drei unabhängige Gründe, keiner davon eine Einstellung, die man
umgehen kann: `fetch()` auf instagram.com scheitert an CORS (kein
`Access-Control-Allow-Origin`); die offizielle oEmbed-Schnittstelle verlangt
seit 2020 ein Meta-Business-Token, also einen eigenen Server; und der
Einbett-Rahmen zeigt das Video zwar an, sein Inhalt ist cross-origin und
damit für uns unlesbar. Wer es künftig doch automatisieren will, braucht
einen Serverdienst (z. B. GitHub Actions mit Meta-Token), der die Caption
holt und in die Supabase-Zeile schreibt — ohne den wäre jede „automatische"
Lösung geraten, und geraten wird hier nicht.

**Gebaut ist deshalb der Weg, der zu 100 % trägt:** einmal den kopierten
Beitragstext einfügen (Link und Caption dürfen im selben Block stehen), alles
Weitere läuft automatisch. `js/rezept/import.js` erkennt Instagram/TikTok/
YouTube samt Einbett-Adresse und zerlegt die Caption in Titel, Dauer,
Zutaten, Schritte und Tags — zweisprachig DE/EN, weil Koch-Captions oft
deutsch sind. Zwei Wege: mit Überschriften („Zutaten:"/„Zubereitung:") oder,
wenn keine da sind, nach Form (Mengenangabe = Zutat, Nummerierung = Schritt).
„Convert to recipe" öffnet den fertig ausgefüllten Formular-Entwurf
**sichtbar zum Korrigieren**, statt still zu speichern. Nichts wird erfunden:
fehlt die Dauer in der Caption, bleibt der Standard stehen.

### Vier neue Kategorien

- **Inspiration**: Reels/Links/Notizen sammeln, Video eingebettet (9:16,
  gedeckelt auf halbe Fensterhöhe), „Convert to recipe", Herkunftslink bleibt
  am erzeugten Rezept hängen (`source`, im Detailfenster als „Original post").
- **Week**: Wochenplan Mo–So, Woche vor/zurück, Rezepte zuweisen, und
  „Add ingredients to shopping list" für die ganze Woche.
- **Shopping**: abhakbare Liste, eigene Einträge, aus dem Plan füllbar.
  Zweimal übernehmen verdoppelt nichts (`normIngredient`).
- **Cooked**: Verlauf mit Sterne-Bewertung und „Cook again".

Damit haben **Today's Meal und Random Picker echte Funktion** statt
Platzhalter. Today's Meal ist bewusst kein eigenes Feld, sondern der erste
Eintrag im Wochenplan für heute — zwei Wahrheiten würden auseinanderlaufen,
sobald jemand die Woche umplant. Der Zufallsgenerator filtert nach Zeit und
Tag, meidet standardmäßig alles aus den letzten sieben Tagen (dafür ist der
Verlauf da) und zieht bei mehreren Kandidaten nie zweimal hintereinander
dasselbe.

### Merge: vier neue Bereiche, vier eigene Regeln

Ein pauschales „Cloud gewinnt" hätte hier wieder Daten gekostet (dieselbe
Falle wie `scoreHist` 2026-07-20 und die Research-Notizen 2026-09-01):
`inspo` nach id mit `up`; **`plan` mit einem Zeitstempel JE TAG** — sonst
verliert ein Gerät, das Montag plant, den Donnerstag des anderen;
`shopping.items` nach id, gelöschte bleiben sieben Tage als `del`-Marke
stehen, sonst legt ein länger nicht geöffnetes Gerät sie wieder an; `cooked`
als reines Anhängen. Grabsteine im Papierkorb tragen jetzt `kind`, damit ein
gelöschtes Rezept und eine gelöschte Idee unterscheidbar bleiben.
`normalizeIndex()` ergänzt fehlende Bereiche — ohne das wäre die App für
Bestandsnutzer sofort kaputt gewesen, obwohl bei einem Neustart alles ging.

### Zwei Regressionstests, die etwas gefunden haben

1. **Der Wächter ließ eine kaputte Zutaten-Erkennung durch.** Absichtlich
   kaputt gemacht → `check/rezept.js` meldete trotzdem „ok". Grund: die
   Test-Caption hatte Überschriften, und dieser Weg kommt ohne die
   Mengen-Erkennung aus — der zweite Weg war komplett ungeprüft. Neue Stufe H
   prüft beide Wege plus alle Dauer-Schreibweisen (`1h30`, `2 Std 30`,
   `ca. 20 Min`, `90 mins`, `1 hour`). **Merksatz: eine Prüfung, die nur den
   bequemen Pfad nimmt, ist keine Prüfung.** Die zweite Mutation (Wochenplan-
   Merge auf „Cloud gewinnt" zurückgedreht) wurde von Stufe G sofort gefangen.
2. **Import-Fenster zeigte erkannte Werte nicht an.** Link und Tags landeten
   still im Entwurf, während der Nutzer leere Felder sah — beim Tippen hätte
   er sie überschrieben, ohne es zu merken. Gefunden beim Ansehen des eigenen
   Screenshots, nicht durch den Wächter; Stufe F prüft es jetzt.

Ebenfalls nachgezogen: die Nachfrage bei ungespeicherten Eingaben deckt jetzt
**beide** Eingabemasken ab (`offeneEingabe()`). Die Inspirations-Maske war
beim Bau zunächst vergessen — dort hätte ein Klick daneben wieder alles
verworfen, obwohl das Rezept-Formular längst geschützt war.
