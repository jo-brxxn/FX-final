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
| Rate-Probabilities-Seite wuchs 111px ueber den Viewport hinaus (fehlendes `min-width:0` an `#pageArea`/`.pc`/`.body` als Flex-Kinder), rechter Kartenabstand dadurch weg | `layout.js` mass `document.documentElement.scrollWidth` - das sieht NIE einen Ueberlauf, weil `body` `position:fixed` ist |
| EUR/CAD-Endpunkt-Labels im "Implied policy path"-Chart ueberlappten sich bei nah beieinander liegenden Zinspfaden | nichts - `cards.js` (2026-08-21 neu) hat genau das beim ersten Lauf gefunden |
| 4-Spalten-Dashboard-Raster stand bis zu 179px ueber den rechten Rand (px-Mindestbreiten summierten sich auf 1102px, Breakpoint rechnete ohne die Nav-Sidebar) - kaputt bei 1100-1279 und 1400-1419 | nichts - `scrollWidth` waechst bei GECLIPPTEM Ueberlauf nicht, `cards.js` und `layout.js` meldeten beide gruen. `cards.js` misst seither zusaetzlich die echte Geometrie |
| Watchlist-Paarname auf 0px zusammengequetscht (alle Nachbarn `flex-shrink:0`), nur noch das Ellipsis-Zeichen sichtbar | nichts - der Text-Check verlangte `clientWidth > 0` und schloss damit genau den Extremfall aus |
| "Erster Klick verstellt nur die Leiste" navigierte trotzdem - zweimal beim Nutzer angekommen: erst mit der Maus (`pointerenter` klappt schon beim Hinbewegen aus), nach dem Fix dann auf dem iPad (`pointerleave` feuert bei Touch VOR dem `click` und loeschte das Merkmal) | nichts - beide Male war die Testmethode das Problem, nicht die Logik. `nav.js` prueft die Regel seither mit Maus UND Touch |
| Modul-Aufteilung (2026-08-25, `docs/module-split.md`): `scoreSurface.js`/`rules.js`/`structure.js`/`scorediff.js` lasen bisher fest nur `index.html` - nach dem Auslagern des Hauptskripts nach `js/main.js` fanden sie fast nichts mehr, `rules.js` meldete "ok" sogar bei einem absichtlich kaputt gemachten `biasScore()` | nichts - erst ein gezielter Regressionstest (Score-Bug einbauen, `check/rules.js` muss ihn melden) deckte es auf, nicht der normale Lauf |

Jede Pruefung hier existiert, weil der zugehoerige Fehler schon einmal beim
Nutzer angekommen ist.

## Die Pruefungen

| Datei | Prueft | Browser |
|---|---|---|
| `scoreSurface.js` | leitet die score-relevanten Funktionen und Konstanten bei jedem Lauf aus dem Code ab (Wurzeln: Rechenkette + fuenf Bias-Pfade, zwei Ebenen tief) - dadurch waechst die Abdeckung automatisch mit | nein |
| `syntax.js` | JS aller `<script>`-Bloecke, jede Workflow-YAML, jeder `run`-Block per `bash -n` | nein |
| `rules.js` | Versions-Bumps und Workflow-Ausgaben (siehe unten) | nein |
| `structure.js` | doppelte `id`s, woertlich wiederholte HTML-Bloecke | nein |
| `scorediff.js` | rechnet JEDEN Score (Symbol, Karte, Staerke, Carry, Paar) des Arbeitsbaums gegen `origin/main` nach - selber Browser, selbe Daten. Liefert `rules.js` die Tatsachengrundlage fuer die SCORE_MODEL_VERSION-Regel | ja |
| `summarydiff.js` | vergleicht den generierten Kartentext (`summarizeRub()`) JEDER Karte jedes Symbols gegen `origin/main` - selbes Muster wie `scorediff.js`, nur fuer Text statt Zahlen. Liefert `rules.js` die Tatsachengrundlage fuer die SUMMARY_ENGINE_VERSION-Regel | ja |
| `score.js` | Additivitaet der Rechenkette, Drift je geoeffnetem Asset, `_symId` nach Boot/`save`/`applySnap`, jeder Bias gegen seine Rohdaten, Karten-Badges, Idempotenz aller vier Feeds, Aufzeichnung automatischer Score-Ursachen, Aufschluesselung der Tagesbewegung in der History | ja |
| `display.js` | angezeigte Scores in Sidebar, Asset-Kopf und Score-Fenster gegen den Sollwert | ja |
| `runtime.js` | alle Tabs, Modals und Zustaende ohne JS-Fehler | ja |
| `layout.js` | Ueberlauf ueber mehrere Viewports (Seite/App-Shell/`#pageArea` UND Karten) | ja |
| `dashboard.js` | ueberlappende Karten, Zonen-Ueberlauf, 8 Breiten (nur Dashboard-Tab) | ja |
| `nav.js` | die Sidebar-Klickregel (erster Klick verstellt nur die Leiste) gegen BEIDE Zeigerarten - Maus mit echtem `hover()` davor, Touch ueber `hasTouch`/`tap()`; dazu, dass ein Tab-Stapel nicht ausgewaehlt bleibt | ja |
| `cards.js` | Text/Elemente verlassen nie den Kartenrand - Kartenrand-Ueberlauf, Text-vs-Text-Ueberlappung, Text-vs-eigenes-Element-Ueberlauf, PLUS Seiten-Ebene-Ueberlauf; auf allen 17 Tabs, 5 Breiten (Generalisierung von `dashboard.js`s bewaehrter Logik, siehe CLAUDE.md "NEUE REGEL: Kartenrand") | ja |

## Die Regeln in `rules.js`

Sie uebersetzen Konventionen, die bisher nur Prosa waren, in ein Abbruch-Kriterium:

1. **VERSION-CHECK** - jede Aenderung an `index.html` zaehlt die Banner-Nummer hoch.
2. **SCORE_MODEL_VERSION** - wird die Score-Formel angefasst, muss die Modell-Version steigen. Sonst vergleichen History, Trends und die Staerke-Note still zwei verschiedene Rechnungen.
3. **SUMMARY_ENGINE_VERSION** - wird die Formulierungs-Logik angefasst, muss sie steigen. `rubSummarySig()` haengt nur an den Rohdaten und erkennt eine reine Text-Aenderung nie.
4. **Workflow-Ausgaben** - erzeugt ein Workflow eine `.json`, muss sie in einem `git add` desselben Workflows stehen (ausser er loescht sie selbst wieder als Zwischendatei).

## Warum sich der Waechter selbst verbessert

`rules.js` hatte anfangs eine **handgepflegte** Liste score-relevanter
Funktionen. Die veraltet zwangslaeufig: wer eine neue Hilfsfunktion in die
Rechenkette einbaut und die Liste nicht ergaenzt, umgeht den
`SCORE_MODEL_VERSION`-Zwang, ohne es zu merken.

`scoreSurface.js` leitet die Menge deshalb bei **jedem Lauf** neu aus
`index.html` ab: ausgehend von festen Wurzeln (`indScoreParts`, `rubScore`,
`symScoreCmp`, `pairScore`, die fuenf Bias-Pfade, `sentEval` ...) werden alle
von dort aufgerufenen Funktionen eingesammelt - zwei Ebenen tief - plus die
dort verwendeten Konstanten (nur solche, die im File auch wirklich deklariert
sind, sonst landen deutsche Kommentarwoerter in der Liste). Aktuell sind das
**71 Funktionen und 26 Konstanten**.

Gegengeprueft: eine Aenderung an `roundSc` - das in keiner Handliste stand -
wird seither erkannt und verlangt den Versions-Bump.

Zwei weitere Regeln sorgen dafuer, dass die Pruefungen selbst mitwachsen:
eine neue Funktion mit `Score`/`Bias`/`Weight`/`Norm`/`Strength` im Namen
verlangt, dass im selben Commit eine Datei unter `check/` angefasst wurde;
ein neuer `fxpro_*`-Schluessel verlangt, dass `cloudPush` UND `cloudPull`
angefasst wurden.

## Beim Erweitern beachten

- **Neue Score-Groesse = neue Pruefung**, nicht nur ein Eintrag in der `CLAUDE.md`.
- `rubScore`/`indScore`/`symScore` **runden auf zwei Stellen**. Eine Toleranz von `1e-6` meldet dutzende Phantom-Fehler; richtig sind ~0,011 je Rundungsstufe.
- Der Score steht am **Ende** einer Zeile. Namen wie "S&P 500" oder "GER 100" tragen selbst Ziffern - ein Regex von vorn liest "500" als Score.
- Ein Pruefskript, das ein Element **entfernt**, um an den Rest zu kommen (z.B. `lockScreen`), kann in genau diesem Element nichts mehr finden. Diesen Bereich getrennt pruefen.
- `execSync` braucht ein grosses `maxBuffer`: `git show HEAD:index.html` liefert ~1,5 MB, der Node-Default liegt bei 1 MB. Ohne das schlaegt der Aufruf fehl und eine Regel wird **still** uebersprungen - genau so hat `rules.js` beim ersten Test einen echten Verstoss durchgelassen.
- **`scrollWidth` misst SCROLLBAREN Ueberlauf, nicht sichtbaren.** Ragt ein Element heraus und wird von einem `overflow:hidden`-Vorfahren weggeclippt, bleibt `scrollWidth === clientWidth` - der Ueberlauf ist unsichtbar fuer jeden Test, der auf diese Groesse baut. Fuer "steht etwas ueber der Kante?" immer `getBoundingClientRect()` gegen die Content-Box des Containers vergleichen (siehe `cards.js` Punkt 0b).
- **Eine Interaktionsregel IMMER mit der echten Eingabeart testen, die der Nutzer benutzt.** `dispatchEvent('click')` laesst `pointerenter`/`pointerleave` komplett aus, `hover()+click()` deckt nur die Maus ab. Bei Touch lautet die Reihenfolge `pointerenter -> pointerdown -> pointerup -> pointerleave -> click` - ein Handler, der sich auf einen in `pointerleave` zurueckgesetzten Zustand verlaesst, sieht ihn nie. Playwright: `newContext({hasTouch:true})` + `tap()`.
- **Nie `clientWidth > 0` als Vorbedingung in einem Text-Suchlauf.** Ein auf null gequetschtes Element ist der SCHLIMMSTE Fall, nicht der uninteressanteste - genau er faellt durch diese Bedingung heraus (`cards.js` Punkt 5 fangt ihn getrennt ab).
- **Nie `document.documentElement.scrollWidth`/`clientWidth` fuer Seiten-Ueberlauf pruefen** - `body` ist in dieser App `position:fixed` (verhindert iOS-Bounce-Scroll), dadurch traegt kein Kind jemals zu `documentElement`s Scroll-Groesse bei, ganz gleich wie sehr es ueberlaeuft. Stattdessen `document.body.scrollWidth`/`clientWidth` (oder direkt den konkreten Container wie `.app-shell`/`#pageArea`) messen. Gefunden, nachdem `layout.js` einen echten 111px-Ueberlauf auf der Rate-Probabilities-Seite durchgelassen hatte.
- **`scoreSurface.js`s Aufruf-Erkennung scannt den rohen Funktionskoerper OHNE Kommentare zu entfernen.** Diese Codebasis zitiert Funktionsnamen in Kommentaren durchgehend als `` `funcName()` `` (Backtick-Code-Span) - ohne Ausschluss liest die `NAME(`-Regex das als echten Aufruf. Gefunden 2026-08-21: ein Kommentar in `addSurveyInds` (Score-Wurzel) mit `` `loadState()` `` zog dessen komplette, score-fremde Aufrufkette (13 Funktionen, u.a. `migrateDash`/`recomputeAuto`) in die Score-Oberflaeche - ein neuer Fund haette faelschlich `SCORE_MODEL_VERSION` verlangt. Fix: ein `NAME(`-Treffer zaehlt nicht, wenn ihm direkt ein Backtick vorausgeht.


## SCORE_MODEL_VERSION: Verdacht gegen Nachweis (2026-08-23)

`rules.js` verlangt einen Bump, sobald eine Funktion der abgeleiteten
Score-Flaeche im Diff auftaucht. Das ist ein **Verdacht**, kein Beweis - die
Flaeche enthaelt auch Funktionen, die nur den PAAR-Score beruehren, und
Signatur-Aenderungen, die gar nichts rechnen.

`scorediff.js` rechnet deshalb nach: es rendert den Stand von `origin/main`
und den Arbeitsbaum im selben Browser mit denselben `*.json`-Daten (verglichen
wird die RECHNUNG, nicht der Datenstand - sonst faende der Vergleich nur den
stuendlichen Bot-Commit) und stellt jede Zahl gegenueber. Das Ergebnis landet
in `check/.scorediff.json` (gitignored), `rules.js` liest es.

- **Symbol-Score unveraendert** -> kein Bump noetig. Ein Bump waere hier sogar
  schaedlich: `SCORE_MODEL_TAG` markiert damit die gesamte aufgezeichnete
  Historie als "aus einem frueheren Modell", obwohl sie es nicht ist.
  Nur der SYMBOL-Score liegt in `scoreHist` - History, Trends und die
  Staerke-Note vergleichen ausschliesslich den.
- **Symbol-Score veraendert** -> Bump Pflicht, und die Meldung nennt jetzt die
  Zahl der betroffenen Stellen.
- **Kein Ergebnis vorhanden** (z.B. `--static`, oder aelter als `index.html`)
  -> es gilt die strenge Regel. Fail-closed, nie fail-open.

Anlass: der Carry-Fix vom 2026-08-23 fasste `pairCarryAdj`/`actualColor` an
(beide in der Flaeche), liess aber 0 von 16 Symbol-Scores, 0 von 96
Karten-Scores und 0 von 16 Staerke-Noten unveraendert. Veraendert haben sich
nur 5 von 35 Paar-Scores - und die stehen nirgends in `scoreHist`.
