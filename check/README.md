# Waechter

Ein Befehl, der vor jedem Push gruen sein muss:

```bash
python3 -m http.server 8935 --directory . &    # einmal pro Sitzung
node check/all.js                               # ~2,5 Minuten
node check/all.js --static                      # ~1 Sekunde, ohne Browser
```

Dieselben Pruefungen laufen bei jedem Push automatisch
(`.github/workflows/checks.yml`) - der Waechter haengt also nicht daran,
dass jemand daran denkt.

## Warum es diesen Ordner gibt

Bis zum 2026-08-16 lagen alle Pruefskripte dieses Projekts in einem
Sitzungs-Scratchpad und waren nach der Sitzung weg. Die Projektregeln standen
nur als Prosa in der `CLAUDE.md`. Prosa-Regeln werden vergessen - und genau
das ist mehrfach passiert:

| Fehler | Was ihn haette fangen muessen |
|---|---|
| `SCORE_MODEL_VERSION` nicht hochgezaehlt, History zeigte zwei Rechnungen nebeneinander | nichts - die Regel stand nur in der CLAUDE.md |
| Doppelter HTML-Block, PIN-Feld nahm keine Eingabe an | `node --check` war gruen; beide Pruefskripte entfernten beim Start genau dieses Element |
| Untere Dashboard-Reihe von den Spalten darueber ueberlappt | die Layout-Pruefung sah Seiten-Ueberlauf, nicht Karte-ueber-Karte |
| History-Effekt hartcodiert `±1` statt echtem Beitrag | keine Pruefung verglich Anzeige und Rechnung |
| `risk_index.json` erzeugt, aber nie committet | der Workflow-Schritt meldete "success" |

Jede Pruefung hier existiert, weil der zugehoerige Fehler schon einmal beim
Nutzer angekommen ist.

## Die Pruefungen

| Datei | Prueft | Browser |
|---|---|---|
| `syntax.js` | JS aller `<script>`-Bloecke, jede Workflow-YAML, jeder `run`-Block per `bash -n` | nein |
| `rules.js` | Versions-Bumps und Workflow-Ausgaben (siehe unten) | nein |
| `structure.js` | doppelte `id`s, woertlich wiederholte HTML-Bloecke | nein |
| `score.js` | Additivitaet der Rechenkette, Drift je geoeffnetem Asset, `_symId` nach Boot/`save`/`applySnap`, jeder Bias gegen seine Rohdaten, Karten-Badges, Idempotenz aller vier Feeds | ja |
| `display.js` | angezeigte Scores in Sidebar, Asset-Kopf und Score-Fenster gegen den Sollwert | ja |
| `runtime.js` | alle Tabs, Modals und Zustaende ohne JS-Fehler | ja |
| `layout.js` | Ueberlauf ueber mehrere Viewports | ja |
| `dashboard.js` | ueberlappende Karten, Zonen-Ueberlauf, 8 Breiten | ja |

## Die Regeln in `rules.js`

Sie uebersetzen Konventionen, die bisher nur Prosa waren, in ein Abbruch-Kriterium:

1. **VERSION-CHECK** - jede Aenderung an `index.html` zaehlt die Banner-Nummer hoch.
2. **SCORE_MODEL_VERSION** - wird die Score-Formel angefasst, muss die Modell-Version steigen. Sonst vergleichen History, Trends und die Staerke-Note still zwei verschiedene Rechnungen.
3. **SUMMARY_ENGINE_VERSION** - wird die Formulierungs-Logik angefasst, muss sie steigen. `rubSummarySig()` haengt nur an den Rohdaten und erkennt eine reine Text-Aenderung nie.
4. **Workflow-Ausgaben** - erzeugt ein Workflow eine `.json`, muss sie in einem `git add` desselben Workflows stehen (ausser er loescht sie selbst wieder als Zwischendatei).

## Beim Erweitern beachten

- **Neue Score-Groesse = neue Pruefung**, nicht nur ein Eintrag in der `CLAUDE.md`.
- `rubScore`/`indScore`/`symScore` **runden auf zwei Stellen**. Eine Toleranz von `1e-6` meldet dutzende Phantom-Fehler; richtig sind ~0,011 je Rundungsstufe.
- Der Score steht am **Ende** einer Zeile. Namen wie "S&P 500" oder "GER 100" tragen selbst Ziffern - ein Regex von vorn liest "500" als Score.
- Ein Pruefskript, das ein Element **entfernt**, um an den Rest zu kommen (z.B. `lockScreen`), kann in genau diesem Element nichts mehr finden. Diesen Bereich getrennt pruefen.
- `execSync` braucht ein grosses `maxBuffer`: `git show HEAD:index.html` liefert ~1,5 MB, der Node-Default liegt bei 1 MB. Ohne das schlaegt der Aufruf fehl und eine Regel wird **still** uebersprungen - genau so hat `rules.js` beim ersten Test einen echten Verstoss durchgelassen.
