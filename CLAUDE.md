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
