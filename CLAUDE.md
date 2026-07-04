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

### Bekannte, diagnostizierte Datenlücken (kein Bug, echte Quellen-Lücke)

- **Manufacturing PMI ohne Trend** (EUR/GBP/JPY/CAD/AUD/NZD): `actual` bleibt
  `null`, weil keine der 4 integrierten Quellen (TradingView wide/recent-
  Fenster, FXStreet, ForexFactory-Website-Scrape, Trading-Economics-Guest-API)
  den S&P-Global/HCOB-Composite-Wert liefert. Die `NAME_ALIASES`-Zuordnung im
  Workflow ist korrekt (`"final manufacturing pmi"` → S&P/HCOB-Aliase) — das
  ist also kein Matching-Bug. Nur USD (ISM, andere Quelle) und CHF
  (procure.ch/UBS, andere Quelle) bekommen zuverlässig einen `actual`.
  Nutzer hat konditional eine 5. Quelle freigegeben (z. B. investing.com-
  Scrape analog zum FF-Website-Scrape), MUSS aber vollautomatisch
  funktionieren (jede zukünftige Veröffentlichung ohne manuelles Zutun) —
  noch NICHT umgesetzt.
- **Viele Yields ohne Trend** (GBP/CHF/JPY/AUD/NZD): `bond_data.json` hat für
  diese 5 nur ~21 Tage Historie (täglicher Einzelpunkt seit 2026-06-14, kein
  Backfill), während USD/EUR/CAD ~35 Tage haben (Backfill via US Treasury
  Direct/BoC Valet API/ECB SDW, alle ohne API-Key). Der Yields-Trend braucht
  25 Tage Vergleich → löst sich für die 5 fehlenden Währungen automatisch in
  ~5 Tagen auf (ab 2026-07-04), oder per Backfill sofort schließbar
  (angedachte Quellen: Bank of England, Japan MoF, RBA, RBNZ, SNB — noch
  ungeprüft, ob deren Formate/URLs wie erwartet funktionieren). Ebenfalls
  konditional freigegeben, noch NICHT umgesetzt.

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
