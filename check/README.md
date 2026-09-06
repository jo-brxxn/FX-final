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
| Bild-Dialog oeffnete auf iOS Safari nicht (`<input type=file>` nicht im DOM) und jede Ausnahme im Speicherpfad endete als stille Promise-Rejection - fuer den Nutzer sah beides aus wie "die App macht nichts" | nichts - `rezept.js` (2026-09-01 neu) prueft seither Handler, Buttons und den kompletten Ablauf; Chromium zeigt den iOS-Fehler nicht, deshalb prueft Stufe C zusaetzlich direkt den Quelltext |
| Zutaten-Erkennung des Caption-Parsers absichtlich kaputt gemacht - der Waechter meldete trotzdem "ok" | nichts - die Test-Caption hatte Ueberschriften ("Zutaten:"), und dieser Weg kommt ohne Mengen-Erkennung aus. Der zweite Weg war ungeprueft. Stufe H prueft seither BEIDE Wege. Merksatz: eine Pruefung, die nur den bequemen Pfad nimmt, ist keine Pruefung |
| Sync der Rezept-App scheiterte mit "HTTP 401", waehrend der FX Analyst Pro mit DEMSELBEN Schluessel lief | nichts - die Rezept-App schickte zusaetzlich `Authorization: Bearer <key>`, was bei heutigen Supabase-Schluesseln kein gueltiges JWT ist. `rezept.js` vergleicht die Sync-Kopfzeilen beider Apps seither statisch |
| Nach dem Diagnose-Fix blieb die Frage "warum geht FX und Rezept nicht" offen, weil der Test nur "geht nicht" sagte | nichts - der Test meldet seither JEDE Stufe einzeln (Read / Update existing row / Create new row / Delete). Die Update-Stufe beweist, dass Schluessel und Tabelle stimmen, und grenzt den Fehler auf INSERT ein |
| Sync scheiterte erneut, diesmal an einer fehlenden RLS-Policy - die App meldete trotzdem "API key rejected (401)" und der Verbindungstest sagte "Connection works" | nichts - PostgREST antwortet auf RLS-Verstoesse ANONYM mit 401 (nicht 403), und der Test las nur. `rezept.js` verlangt seither, dass `httpFehler()` den Fehlercode im Rumpf VOR dem Status auswertet und dass `testConnection()` wirklich schreibt. Merksatz: ein Lesetest beweist nichts ueber das Schreiben |
| Ein Theme in ZWEI :root-Bloecken (beim Einfuehren der Typo-Tokens passiert) - fuer den Browser egal, fuer jede Pruefung ein halbes Theme | die Kontrast-Stufe meldete ploetzlich fehlende Tokens; `rezept.js` verlangt seither genau EINEN Inhalts-Block je Theme |
| Klick neben den Notiz-Editor verwarf alles Getippte | nichts - der generische `.ov`-Klick-Handler schloss jedes Fenster kommentarlos; seit `MODAL_GUARDS` fragt `#mUnsaved` nach, `rezept.js` Stufe D prueft dasselbe in der Rezept-App |
| Ein Vorschlag zeigte ein Foto, das daraus gebaute Rezept eine GEZEICHNETE Karte, die gemerkte Idee gar kein Bild | nichts - ein Fremdbild laesst sich im Browser nur einbetten, wenn die fremde Seite CORS erlaubt; Foodblogs tun das nicht, und der Rueckfall war ein erzeugtes Titelbild. `rezept.js` beantwortet die Bildadresse jetzt OHNE CORS-Kopfzeile (frueher ein hartes abort(), damit fiel der Fall gar nicht auf) und verlangt, dass Rezept und Idee die Adresse des Vorschlags tragen; statisch muss das Werkzeug die Bilder neben den Vorrat legen und wieder aufraeumen |
| Der Lauf war rot wegen Fehlern aus dem eingebetteten Instagram-Reel (`ErrorUtils … fburl.com/debugjs`) | nichts - fremder Code, auf den die App keinen Einfluss hat. `rezept.js` bewertet Konsolenfehler seither nach ihrer HERKUNFT: kommt das Skript nicht von unserer Adresse, zaehlt der Fehler nicht (ohne URL bleibt es streng). Ein Textmuster je Fremdmeldung haette den Waechter Stueck fuer Stueck stumpf gemacht |
| Der Lauf war rot wegen `Permissions policy violation: compute-pressure` | nichts - der eingebettete YouTube-Player fragt diese Berechtigung an, unsere iframes geben sie bewusst nicht (sie verraet die CPU-Auslastung). `rezept.js` nimmt genau diese Meldung aus, keine Policy-Verletzungen allgemein; erlauben waere die falsche Richtung |
| "Load new ones" im Hinweis "You have been through everything" gab keine Rueckmeldung - der Runner meldete "Button ohne Wirkung", lokal war alles gruen | nichts - `feedNachladen()` setzte seine Ladeanzeige auf `#fdMore`, den es in diesem Zustand gar nicht gibt; ohne Netz verdeckte der sofortige Fehler-Toast das. `rezept.js` laesst TheMealDB in Stufe N4b jetzt LANGSAM antworten statt zu scheitern und verlangt binnen 400 ms eine sichtbare Aenderung. ⚠ Zwei Rateversuche hat das gekostet, weil die Meldung nur den Namen des Knopfes nannte - Stufe B gibt bei einem toten `rezFeedMore` deshalb den gesehenen Zustand mit aus (Karten, Knopftext, Zaehler, Hinweis) |
| "Show 3 more" tat auf einem Geraet MIT Netz sekundenlang nichts - der Runner meldete "Button ohne Wirkung", lokal war alles gruen | nichts - `renderInspo()` stand hinter `await markFeedSeen()`, das auf IndexedDB wartet und den Cloud-Abgleich anstoesst. `rezept.js` bremst IndexedDB jetzt kuenstlich und verlangt, dass der Knopf trotzdem binnen 400 ms umblaettert; ohne die Bremse ist der Fall ohne Netz nicht ausloesbar |
| Zwei Kontrastwerte im BESTAND-Design lagen unter AA (`--t2` 4,28:1, `--accent` 2,83:1 gegen `--bg5`), obwohl die Doku "alle >= 4,6:1" behauptete | nichts - der Kontrast lief als einmaliges Skript, nicht als Waechter. `theme.js` rechnet ihn seither bei JEDEM Lauf ueber ALLE Vorlagen nach; gefunden wurden die beiden Werte beim ersten Lauf |
| Der erste Wurf von `theme.js` erklaerte das seit Monaten bewaehrte Design fuer kaputt (bullish/bearish "1,02:1") | nichts - die Pruefung selbst war falsch: sie mass Helligkeitskontrast, aber Blau und Rot unterscheiden sich durch den FARBTON. Seither Farbton-Abstand + Saettigung. ⚠ Merksatz: eine Pruefung, die den funktionierenden Bestand fuer kaputt erklaert, ist meistens selbst der Fehler |
| Eine Vorlage ohne `--chrome-quick` blieb gruen, weil das Token still von `:root` erbt und `getComputedStyle` brav einen Wert liefert | nichts - Pflicht-Tokens werden seither STATISCH im CSS-Text geprueft. Im Mutationstest aufgefallen, nicht im Betrieb |
| Reparaturen kamen beim Nutzer nicht an ("es ist wie davor"): `sw.js` lieferte `js/rezept/*.js` aus dem Cache, der neue Code wirkte erst beim uebernaechsten Oeffnen | nichts - kein Waechter sah die Auslieferung an. `rezept.js` prueft seither statisch, dass Skripte im Netz-zuerst-Zweig liegen |
| Im Waechter kamen Testdaten nie an: der Service Worker beantwortete die Anfragen selbst, `page.route()` griff nicht | nichts - der Lauf las stillschweigend die echte Datei und meldete "ok". Der Browser startet jetzt mit `serviceWorkers: 'block'` |
| Zweite App im Repo (2026-09-01, Perfect Rezept): `rezept.html` + `js/rezept/*` waeren von jedem Waechter unbemerkt geblieben, und `#appChoiceOv` haette jeden Browser-Lauf blockiert | nichts - `syntax.js` prueft seither beide Seiten, `rules.js` erzwingt die REZEPT-CHECK-Nummer (Regel 1b), alle Browser-Pruefungen setzen `dmfx_app_choice='fx'` |
| Modul-Aufteilung (2026-08-25, `docs/module-split.md`): `scoreSurface.js`/`rules.js`/`structure.js`/`scorediff.js` lasen bisher fest nur `index.html` - nach dem Auslagern des Hauptskripts nach `js/main.js` fanden sie fast nichts mehr, `rules.js` meldete "ok" sogar bei einem absichtlich kaputt gemachten `biasScore()` | nichts - erst ein gezielter Regressionstest (Score-Bug einbauen, `check/rules.js` muss ihn melden) deckte es auf, nicht der normale Lauf |

Jede Pruefung hier existiert, weil der zugehoerige Fehler schon einmal beim
Nutzer angekommen ist.

## Die Pruefungen

| Datei | Prueft | Browser |
|---|---|---|
| `scoreSurface.js` | leitet die score-relevanten Funktionen und Konstanten bei jedem Lauf aus dem Code ab (Wurzeln: Rechenkette + fuenf Bias-Pfade, zwei Ebenen tief) - dadurch waechst die Abdeckung automatisch mit | nein |
| `syntax.js` | JS aller `<script>`-Bloecke **beider Seiten** (`index.html` UND `rezept.html`) plus `js/rezept/*.js`, jede Workflow-YAML, jeder `run`-Block per `bash -n` | nein |
| `rules.js` | Versions-Bumps und Workflow-Ausgaben (siehe unten) | nein |
| `structure.js` | doppelte `id`s, woertlich wiederholte HTML-Bloecke | nein |
| `scorediff.js` | rechnet JEDEN Score (Symbol, Karte, Staerke, Carry, Paar) des Arbeitsbaums gegen `origin/main` nach - selber Browser, selbe Daten. Liefert `rules.js` die Tatsachengrundlage fuer die SCORE_MODEL_VERSION-Regel | ja |
| `summarydiff.js` | vergleicht den generierten Kartentext (`summarizeRub()`) JEDER Karte jedes Symbols gegen `origin/main` - selbes Muster wie `scorediff.js`, nur fuer Text statt Zahlen. Liefert `rules.js` die Tatsachengrundlage fuer die SUMMARY_ENGINE_VERSION-Regel | ja |
| `score.js` | Additivitaet der Rechenkette, Drift je geoeffnetem Asset, `_symId` nach Boot/`save`/`applySnap`, jeder Bias gegen seine Rohdaten, Karten-Badges, Idempotenz aller vier Feeds, Aufzeichnung automatischer Score-Ursachen, Aufschluesselung der Tagesbewegung in der History | ja |
| `display.js` | angezeigte Scores in Sidebar, Asset-Kopf und Score-Fenster gegen den Sollwert | ja |
| `runtime.js` | alle Tabs, Modals und Zustaende ohne JS-Fehler | ja |
| `layout.js` | Ueberlauf ueber mehrere Viewports (Seite/App-Shell/`#pageArea` UND Karten) | ja |
| `dashboard.js` | ueberlappende Karten, Zonen-Ueberlauf, 8 Breiten (nur Dashboard-Tab) | ja |
| `theme.js` | **Design-Vorlagen des FX Analyst Pro:** je Vorlage Kontrast JEDER Textstufe gegen JEDE Flaeche (AA 4,5:1), Bias-/Akzentfarben als Zahlenfarbe (3:1), Text auf Akzentflaeche, Kopfzeilentext gegen Chrome-Grund; dazu die BEDEUTUNG - bullish bleibt blau, bearish bleibt rot (Farbton-ABSTAND >= 90 Grad, NICHT Helligkeit), neutral bleibt entsaettigt; und statisch, dass jede Vorlage jedes Pflicht-Token wirklich setzt | ja |
| `rezept.js` | **Zweite App (Perfect Rezept):** acht Stufen - Handler loesen sich zu echten Funktionen auf (A), jeder sichtbare Button veraendert wirklich den DOM auf ALLEN sechs Kategorien (B), kompletter Ablauf mit echtem Bild-Upload (C), Nachfrage bei ungespeicherten Eingaben (D), Kontrast jeder Palette gegen jede Flaeche (E), die vier neuen Kategorien inhaltlich inkl. Reel-Import und "Convert to recipe" (F), Merge-Regeln fuer zwei Geraete (G), der Caption-Parser auf BEIDEN Wegen (H), die Einkaufsliste mit Abteilungen/Vorschlaegen/Mengen (I), Bewegung und Typografie (J: Staffelung gedeckelt, Bilder werden sichtbar geschaltet, gleitende Auswahl-Markierung, Fenster raeumen ihren DOM wirklich auf, Schalter greift, reduced-motion, Typo-Tokens je Theme, keine nachgeladene Schrift), Kochmodus/Timer/Portionen/Notizen/Suche/Vorschlag/Massenimport (K), Bilder ueberall sichtbar und das Reel-Vorschaubild (L), das Titelbild-Fenster mit YouTube-Standbildern, Bildschirmfoto und Zuschnitt (M), die taeglichen Essensvorschlaege - Themen-Erkennung, Zerlegen der vier Quellen, Dreierreihe mit Nachlade-Knopf, Filter nach Quelle und Art, "Add as recipe", Verhalten ohne Vorschlags-Datei (N), plus statisch: die Sync-Kopfzeilen muessen zum FX Analyst Pro passen, der Service Worker darf den Programmcode nicht cachen, die Zerlege-Logik der Vorschlaege darf nicht doppelt existieren, und ein `"pro"` an einer einzelnen Quelle muss vom Werkzeug auch ausgewertet werden (sonst waere die staerkere Gewichtung neuer Quellen still wirkungslos) | ja |
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

## `structure.js`, viertes Netz: Handler ohne window-Brücke (seit 2026-09-06)

Ein inline-`onclick="fn()"` wird im **globalen** Scope ausgewertet. Eine in
`js/*.js` definierte Funktion ist dort nur sichtbar, wenn sie in der
window-Brücke steht (`Object.assign(window,{…})` oder
`Object.defineProperty(window,'x',…)`). Fehlt der Export, ist die Funktion
sauber definiert — das dritte Netz („Handler ohne Funktion") ist zufrieden —,
aber der Klick wirft still einen `ReferenceError` und der Button sieht für den
Nutzer einfach kaputt aus.

Genau das ist beim Data-Modus-Umschalter passiert (2026-09-06, `setDataMode`).
CLAUDE.md Regel 6 nennt diese Fehlerklasse ausdrücklich; seitdem wird sie
geprüft statt nur beschrieben.

Der Wächter sammelt dafür alle Brücken-Blöcke aus `js/*.js` (ab
`Object.assign(window,{` bis zur schließenden Zeile) und meldet jeden
Handler-Namen, der nur in `js/*.js` definiert ist und dort nicht vorkommt. In
`index.html` selbst definierte Funktionen sind ausgenommen — die stehen ohnehin
global.

## `structure.js`, fünftes Netz: Feed fehlt in `reapplyLiveFeeds()` (seit 2026-09-06)

**Anlass:** Bugreport „bei AUD bei GDP steht out of date, aber es gibt schon
neue Daten, und es gibt auch keine Historie da". `applySnap()` — der gemeinsame
Trichter für Cloud-Sync, Undo/Redo, Backup-Restore und Import — ersetzt `syms`
komplett, also auch `ind.research` (Actual/Forecast/Datum) und `ind.chartHist`
(die Chartpunkte). Beide Felder füllt **ausschließlich** ein Live-Feed, und der
wurde danach nie wieder darübergelegt. Ein Snapshot von einem Gerät ohne
erfolgreichen Feed-Abruf zog die App still auf dessen alten Stand zurück.

Der Fix ist `reapplyLiveFeeds()` in `applySnap()`. Der hält aber nur, solange
ein **später dazukommender** Feed dort auch eingetragen wird — und genau das
ist die Sorte Regel, die ein Absatz in `docs/state-sync.md` niemandem in
Erinnerung ruft. Deshalb als Netz: jede `function apply…Feed()` in `js/*.js`
muss namentlich im Rumpf von `reapplyLiveFeeds()` vorkommen.

Ausnahmen stehen als `FEED_AUSNAHMEN` **mit Begründung** im Prüfskript, nicht
als stiller Eintrag — heute nur `applyScoreHistServerFeed` (schreibt in
`scoreHist`, nicht in `syms`).

Gegenprobe gemacht: `applyCotDataFeed()` aus `reapplyLiveFeeds()` entfernt →
`STRUKTURFEHLER: Feed fehlt in reapplyLiveFeeds() … applyCotDataFeed`; wieder
eingesetzt → grün. Auf dem Bestand meldet das Netz **0** Fälle.
