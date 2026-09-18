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
| `display.js` meldete im vollen Lauf EINEN Treffer (`NAS dom=+0.2 soll=+0.1`), war allein und wiederholt aber gruen - ein roter Lauf ohne echten Fund | nichts - der Waechter wartete stur 5s. Gemessen im 250-ms-Raster: die Nav-Leiste wird beim Start einmal VOR den Live-Feeds gezeichnet (t=645ms: alle 24 Assets weichen ab; t=1349ms: keines mehr; alle acht Feeds beantwortet nach 2383ms im Leerlauf). Unter Last rutscht das Ende der Feeds ueber die feste Frist. Seither wartet `check/warten.js` auf das echte Fertig-Signal, `rules.js` Regel 7 erzwingt das fuer jeden Waechter, der Score-Zahlen liest. ⚠ Merksatz: ein Waechter, der ohne Fund rot wird, wird irgendwann weggeklickt - das ist so schaedlich wie einer, der nichts findet |
| Das sechste Netz von `structure.js` meldete ein Feld namens `text` in `snap()` - das es nirgends gibt | nichts, im Gegenteil: der Waechter selbst war der Fehler. `snap()` bekam ein zweites Argument (`SNAP_REPLACER`), das Muster verlangte aber `});}` direkt hinter der Klammer - und lief mit `[\s\S]*?` bis zu einem ganz anderen `});}` weiter unten weiter. Das Ergebnis war kein ehrliches "nicht gefunden", sondern ein FREI ERFUNDENES Feld aus fremdem Code. Muster jetzt mit optionalem zweiten Argument und `[^{}]*?`, damit die Suche das Objektliteral nicht mehr verlassen KANN. ⚠ Merksatz: ein nicht-gieriges `[\s\S]*?` in einem Waechter ist eine Falle - findet es sein Ende nicht, hoert es nicht auf, sondern nimmt das naechste |
| `TARGET_CHUNKS=119` fragte stuendlich 37 Zeitfenster ab, in denen nachweislich nichts liegt | nichts - Regel 8 prueft den Abruf gegen das, was die Leiste ANBIETET (2007), und haette den Leerlauf sogar erzwungen. Gemessen (Workflow "Probe indicator history depth"): die Quelle antwortet fuer 2006-2012 mit HTTP 200 und NULL Events, ihr Kalender beginnt 2013. Regel 8 prueft seither gegen die BINDENDE Grenze (spaeteres Datum aus Angebot und gemessener Quellgrenze) und meldet BEIDE Richtungen - zu wenig UND ins Leere. ⚠ Merksatz: eine Grenze, die man nicht gemessen hat, gehoert nicht in einen Waechter |
| AUD GDP wurde DREIMAL als "keine Daten oder Historie" gemeldet, obwohl die Rohdaten jedes Mal vollstaendig waren (0,4 % vom 2026-09-02, 54 Punkte ab 2013) | nichts - der Feed-Abgleich haengt am NAMEN und schnitt nur die Kurzform des Zeitraums ab: "GDP Growth QoQ q/q" traf, "GDP Growth q/q" traf nicht, und zwar ohne Wert, ohne Historie und ohne Meldung. `display.js` prueft seither (2d), dass kein Indikator eine VORHANDENE Feed-Reihe still verliert - eine echte Luecke der Quelle (NZD PPI) faerbt bewusst nicht rot, sonst waere der Waechter dauerhaft rot und damit wertlos. ⚠ Merksatz: wenn dieselbe Meldung dreimal kommt und die Daten jedes Mal da sind, liegt es daran, WORUEBER Daten und Anzeige einander finden |
| Der Zeitfilter der Daten-Seite bekam 5Y/8Y/12Y und "Max = 2007" - die Rohhistorie reichte aber nur bis 2023-09-12 (18 von 18 Haeppchen, 0 Punkte davor), alle vier laengsten Stufen haetten dasselbe Bild gezeigt | nichts - kein Waechter verglich, was die Oberflaeche ANBIETET mit dem, was der Workflow HOLT und BEHAELT. `rules.js` Regel 8 prueft die drei Werte seither gegeneinander, der Haeppchen-Teil gegen das heutige Datum. ⚠ Merksatz: ein Filter, der einen Zeitraum anbietet, den niemand einsammelt, sieht aus wie Daten und ist keine |
| Der `watch`-Tab wurde von jedem Browser-Waechter geprueft - aber die Watchlist ist frisch LEER, es lief also immer nur der Leerzustand durch, keine einzige `.wt-card` | nichts - aufgefallen beim Umbau auf zwei Karten je Zeile (2026-09-07): ein erster Versuch mit `repeat(auto-fill,minmax(520px,1fr))` zwang die Karte im 390px-Fenster auf 520px Breite, 200px aus dem Inhaltsbereich heraus, und kein Lauf haette das gemeldet. `cards.js` befuellt die Liste jetzt selbst (vier FX-Paare + zwei Non-FX-Assets) und prueft `.wt-card` mit. ⚠ Merksatz: ein Tab, dessen Inhalt der Nutzer erst anlegt, ist im Waechter per Voreinstellung LEER - das sieht gruen aus und ist blind |
| Modul-Aufteilung (2026-08-25, `docs/module-split.md`): `scoreSurface.js`/`rules.js`/`structure.js`/`scorediff.js` lasen bisher fest nur `index.html` - nach dem Auslagern des Hauptskripts nach `js/main.js` fanden sie fast nichts mehr, `rules.js` meldete "ok" sogar bei einem absichtlich kaputt gemachten `biasScore()` | nichts - erst ein gezielter Regressionstest (Score-Bug einbauen, `check/rules.js` muss ihn melden) deckte es auf, nicht der normale Lauf |

Jede Pruefung hier existiert, weil der zugehoerige Fehler schon einmal beim
Nutzer angekommen ist.

## Die Pruefungen

| Datei | Prueft | Browser |
|---|---|---|
| `warten.js` | kein eigener Waechter, sondern das gemeinsame Warte-Signal: `wartenBisDatenDa(page)` wartet, bis alle acht Live-Feeds in `DATA_LIVE_OK` geantwortet haben (mit Daten ODER mit einem Fehlschlag) und danach neu gezeichnet wurde. Wird von `display.js`, `score.js`, `scorediff.js` und `summarydiff.js` benutzt | - |
| `scoreSurface.js` | leitet die score-relevanten Funktionen und Konstanten bei jedem Lauf aus dem Code ab (Wurzeln: Rechenkette + fuenf Bias-Pfade, zwei Ebenen tief) - dadurch waechst die Abdeckung automatisch mit | nein |
| `syntax.js` | JS aller `<script>`-Bloecke **beider Seiten** (`index.html` UND `rezept.html`) plus `js/rezept/*.js`, jede Workflow-YAML, jeder `run`-Block per `bash -n` | nein |
| `rules.js` | Versions-Bumps und Workflow-Ausgaben (siehe unten) | nein |
| `structure.js` | doppelte `id`s, woertlich wiederholte HTML-Bloecke, Handler ohne Funktion/ohne window-Bruecke, und **jedes `var(--x)` ohne Rueckfallwert muss irgendwo definiert sein**. ⚠ Letzteres ist eine eigene Fehlerklasse: CSS meldet ein unbekanntes Token NICHT, es wirft die ganze Deklaration weg ("invalid at computed-value time"). Gemessen 2026-09-13: `--card` war an drei Stellen benutzt und nirgends definiert - vier Kartenarten standen auf `rgba(0,0,0,0)`, also voellig durchsichtig, und der Nutzer sah "alles noch so weiss". Der Kontrast-Waechter konnte das nie sehen, der prueft DEFINIERTE Tokens. Geprueft wird nur echtes CSS (`<style>`-Bloecke und `style="..."`), nicht die ganze Datei - sonst stolpert die Pruefung ueber das Wort `var(--x)` im Erklaertext des Versions-Banners. **Seit 2026-09-14 zusaetzlich die einheitliche Restzeit** (Nutzer-Regel: aus *Tomorrow* wird `1d`, heute bekommt ein auffaelliges `!`): keine Restzeit-Beschriftung in `js/*.js` darf wieder "Tomorrow" sagen, `countdownHtml()` muss existieren und `span.cd-heute` setzen, und `.cd-heute` muss in `index.html` formatiert sein - ein `<span>` ohne CSS-Regel waere unsichtbar, also das Gegenteil von auffaellig. ⚠ Die Kette stand an VIER Stellen als eigene Kopie, mit vier Schreibweisen; drei waren von Hand zu finden, die vierte fand erst dieser Waechter. Fliesstext ("check back tomorrow for a trend line") ist erlaubt, geprueft wird nur ein Textstueck, das im Wesentlichen aus dem Wort besteht | nein |
| `scorediff.js` | rechnet JEDEN Score (Symbol, Karte, Staerke, Carry, Paar) des Arbeitsbaums gegen `origin/main` nach - selber Browser, selbe Daten. Liefert `rules.js` die Tatsachengrundlage fuer die SCORE_MODEL_VERSION-Regel | ja |
| `summarydiff.js` | vergleicht den generierten Kartentext (`summarizeRub()`) JEDER Karte jedes Symbols gegen `origin/main` - selbes Muster wie `scorediff.js`, nur fuer Text statt Zahlen. Liefert `rules.js` die Tatsachengrundlage fuer die SUMMARY_ENGINE_VERSION-Regel | ja |
| `score.js` | Additivitaet der Rechenkette, Drift je geoeffnetem Asset, `_symId` nach Boot/`save`/`applySnap`, jeder Bias gegen seine Rohdaten, Karten-Badges, Idempotenz aller vier Feeds, Aufzeichnung automatischer Score-Ursachen, Aufschluesselung der Tagesbewegung in der History | ja |
| `display.js` | angezeigte Scores in Sidebar, Asset-Kopf und Score-Fenster gegen den Sollwert | ja |
| `runtime.js` | alle Tabs, Modals und Zustaende ohne JS-Fehler | ja |
| `layout.js` | Ueberlauf ueber mehrere Viewports (Seite/App-Shell/`#pageArea` UND Karten) | ja |
| `dashboard.js` | ueberlappende Karten, Zonen-Ueberlauf, 8 Breiten (nur Dashboard-Tab) | ja |
| `theme.js` | **Design-Vorlagen des FX Analyst Pro:** je Vorlage Kontrast JEDER Textstufe gegen JEDE Flaeche (AA 4,5:1), Bias-/Akzentfarben als Zahlenfarbe (3:1), Text auf Akzentflaeche, Kopfzeilentext gegen Chrome-Grund; dazu die BEDEUTUNG - bullish bleibt blau, bearish bleibt rot (Farbton-ABSTAND >= 90 Grad, NICHT Helligkeit), neutral bleibt entsaettigt; und statisch, dass jede Vorlage jedes Pflicht-Token wirklich setzt | ja |
| `typo.js` | **Schrifthierarchie** in ALLEN Fenstern UND (seit 2026-09-16) allen SEITEN: keine Groesse ausserhalb der 8-stufigen Skala, und keine zwei Textbloecke direkt uebereinander, deren Groessen sich um weniger als 1px unterscheiden ohne gleich zu sein (das liest sich als Fehler, nicht als Hierarchie). ⚠ Er holte seine Liste bis dahin aus `.ov[id^="m"]`, also ausschliesslich FENSTERN - 34 Fenster mit 301 Textelementen, waehrend allein der Kalender 531 hat. Der Anlass der Regel (Nutzer 2026-09-08) nennt aber woertlich "und generell allen Seiten". Ein neuer Tab war damit von keiner Typo-Pruefung angesehen. Jetzt zusaetzlich 18 Seiten mit 3275 Textelementen. Ausgenommen: SVG-Beschriftungen (folgen der Chart-Geometrie, gemessen 6,5/9/26px) und drei Bestandswerte namentlich mit Datum und Grund. ⚠ Die Skala hat 24px als --fs-xl; docs/design-system.md fuehrte bis 2026-09-16 faelschlich 22 - 22px existiert nur als harter Wert an zwei Stellen | ja |
| `historie.js` | **Historie** (`renderSymHistoryPanel`, Fenster + Karte auf der Asset-Seite, Neubau 2026-09-17). Geprueft wird nicht der Geschmack, sondern die Aussagen: (A) die Score-Linie hat ihre Nulllinie IM Bild, genau zwei Bias-Farben, beide an der Nulllinie beschnitten (sonst springt die Farbe erst am naechsten Datenpunkt), und eine Luecke UNTERBRICHT sie statt ueberbrueckt zu werden; (B) Klick auf einen Punkt markiert die RICHTIGE Zeile, aus dem onclick gelesen; (C) **die Alterung wird unabhaengig nachgerechnet** - Zyklus (Median der echten Abstaende bzw. Intervalltext), letztes Release vor dem Stichtag, die Grenze IND_STALE_CYCLES=2 und dass der Tag DAVOR sie noch nicht gerissen hatte; (D) der Alterungs-Schalter wirkt (Regel 6); (E) jeder Tag hat eine eigene Zeile, leere sagen "No data released", und es gibt genau EINE Spaltenkopfzeile (vorher stand sie pro Woche da); (F) kein Ueberlauf auf fuenf Breiten, Kopf klebt. ⚠ ABSCHNITT C WAR ZUERST LEER-GRUEN: er suchte die Indikatoren ueber den Anzeigenamen in ind_data.json, meldete 6 Wechsel und rechnete 0 davon nach - diese Indikatoren kommen im Feed gar nicht vor (EUR "JOLTS Job Openings" hat chartHist.length 0 und lebt von research.date plus "quarterly"). Er zaehlt deshalb jetzt mit, WIE VIELE Faelle er wirklich nachgerechnet hat, und faellt rot, wenn das 0 ist. Zwei Gegenproben melden rot - die zur Luecken-Ueberbrueckung brauchte eine ERZWUNGENE Luecke in der Mitte des Fensters, am Rand unterscheidet sie nichts | ja |
| `backtester.js` | **Backtester** (`btRender`, Neubau 2026-09-17), gegen die ROHEN Feed-Dateien: (A) alle 108 USD-Sitzungen inkl. der 76 Holds stehen mit Richtung, Satz und Vorwert in ind_data.json['Central Bank Rate'].historyFull - der Fed-KORRIDOR wird dabei wie im Produktivcode auf die Mitte gerechnet, sonst verschiebt sich jeder Satz um 0,125; (B) die Releases je Bereich wertgenau gegen ind_data.json, und ⚠ **kein Wert aus der Zukunft der Sitzung** - der schwerste denkbare Fehler in einem Rueckblick; (C) die Ueberraschungsfarbe nur wo ein Forecast dasteht UND mit richtigem Vorzeichen (bei Arbeitslosigkeit/Claims gedreht); (D) die Kursreaktion gegen price_data.json, in DATENPUNKTEN gezaehlt, `invert` beachtet; (E) alle sechs Steuerungs-Handler mit sichtbarer Wirkung (Regel 6); (F) der Zinspfad ist eine echte **Treppe** - jedes Segment teilt mit seinem Vorgaenger x oder y, 0 schraege Verbindungen - und der Markerklick trifft die richtige Zeile; (G) kein Ueberlauf auf vier Breiten. ⚠ Der Waechter hatte selbst einen Messfehler: er ordnete Zellen ueber den Spaltenindex zu und lag nach dem Einschieben der "Price after"-Spalte um eins daneben - 310 gemeldete Vorzeichenfehler gehoerten alle ihm. Zuordnung jetzt ueber BT_AREAS. Drei Gegenproben melden rot | ja |
| `regime.js` | **Regime Radar** (`js/regime.js`, Tab "Regime"): liest bond_data, ind_data und risk_index IN NODE und rechnet Kurve, Realzins und Perzentile NOCH EINMAL mit eigenem Code nach - 16 Werte ueber acht Waehrungen. Eine Zahl, die nur gegen sich selbst geprueft wird, ist nicht geprueft. ⚠ Die Falle, die das aufdeckt: den Realzins mit `CPI` statt `CPI (Headline)` zu rechnen - der erste ist in diesem Feed die MONATSrate. Das haette +4,57pp statt +1,58pp ergeben, eine voellig falsche Aussage, die trotzdem wie eine Zahl aussieht. Dazu die drei Schutzregeln: "Not measured" faellt aus dem Nenner und nennt seinen Grund; ein Szenario mit fehlender KERNbedingung kann nie fuehrendes Regime sein (ungeschuetzt stand Funding Squeeze mit 100% an der Spitze, obwohl genau die zwei entscheidenden Bedingungen fehlten); unter drei messbaren Bedingungen gibt es keinen Prozentwert (ungeschuetzt stand Productivity Upswing bei JPY auf 100% aus EINER Bedingung). Plus: echter Mausklick auf die Waehrungswahl, kein Ueberlauf auf fuenf Breiten. Drei Gegenproben melden rot | ja |
| `rezept.js` | **Zweite App (Perfect Rezept):** acht Stufen - Handler loesen sich zu echten Funktionen auf (A), jeder sichtbare Button veraendert wirklich den DOM auf ALLEN sechs Kategorien (B), kompletter Ablauf mit echtem Bild-Upload (C), Nachfrage bei ungespeicherten Eingaben (D), Kontrast jeder Palette gegen jede Flaeche (E), die vier neuen Kategorien inhaltlich inkl. Reel-Import und "Convert to recipe" (F), Merge-Regeln fuer zwei Geraete (G), der Caption-Parser auf BEIDEN Wegen (H), die Einkaufsliste mit Abteilungen/Vorschlaegen/Mengen (I), Bewegung und Typografie (J: Staffelung gedeckelt, Bilder werden sichtbar geschaltet, gleitende Auswahl-Markierung, Fenster raeumen ihren DOM wirklich auf, Schalter greift, reduced-motion, Typo-Tokens je Theme, keine nachgeladene Schrift), Kochmodus/Timer/Portionen/Notizen/Suche/Vorschlag/Massenimport (K), Bilder ueberall sichtbar und das Reel-Vorschaubild (L), das Titelbild-Fenster mit YouTube-Standbildern, Bildschirmfoto und Zuschnitt (M), die taeglichen Essensvorschlaege - Themen-Erkennung, Zerlegen der vier Quellen, Dreierreihe mit Nachlade-Knopf, Filter nach Quelle und Art, "Add as recipe", Verhalten ohne Vorschlags-Datei (N), plus statisch: die Sync-Kopfzeilen muessen zum FX Analyst Pro passen, der Service Worker darf den Programmcode nicht cachen, die Zerlege-Logik der Vorschlaege darf nicht doppelt existieren, und ein `"pro"` an einer einzelnen Quelle muss vom Werkzeug auch ausgewertet werden (sonst waere die staerkere Gewichtung neuer Quellen still wirkungslos) | ja |
| `nav.js` | die Sidebar-Regeln gegen BEIDE Zeigerarten - Maus mit echtem `hover()` davor, Touch ueber `hasTouch`/`tap()`. **Am PC bleibt die Leiste seit 2026-09-13 dauerhaft offen** (Nutzer-Wunsch): geprueft werden beide Ausloeser einzeln (Klick UND Scrollen im Inhalt), die Breite in Pixeln und nicht nur die Klasse (eine Media Query koennte sie auch ohne Klasse schmal machen), dass jeder Klick sofort navigiert, dass sie unter 760px weiterhin einklappt, und dass sie nach dem Vergroessern des Fensters von selbst wieder aufgeht. Auf Touch gilt weiter der Zwei-Klick-Mechanismus (erster Tipper verstellt nur die Leiste). Dazu, dass ein Tab-Stapel nicht ausgewaehlt bleibt. **⚠ Seit 2026-09-14 Abschnitt F: ein ECHTER Mausklick auf einen Knopf IM INHALT** (History auf der Asset-Seite), auf zwei PC-Breiten und auf dem iPad, mit unterschiedlicher Erwartung - am PC muss der ERSTE Klick wirken, auf Touch erst der zweite. Anlass: am PC war JEDER Klick im Inhalt tot, weil der Schluck-Merker des Zwei-Klick-Mechanismus das Einklappen unterstellt statt geprueft hat und die Leiste dort seit dem 13.09. dauerhaft offen bleibt. ⚠ KEIN bestehender Waechter konnte das sehen: A-E pruefen die Leiste selbst, alle anderen rufen die Funktionen ueber p.evaluate() direkt auf - ein geschluckter Mausklick ist fuer sie unsichtbar. Gegenprobe mit der alten Zeile: vier Fehler | ja |
| `kerzen.js` | **die vier Kerzen-Dauerregeln** (`docs/design-system.md`): eine Kerze = ein Tag ohne Dopplungen, kein Samstag/Sonntag ausser bei Krypto, Kerzenfarben aus `--cndl-up`/`--cndl-dn` statt aus den Bias-Farben, und kein Docht ohne echtes High/Low in der Reihe. Gemessen ueber 8 Preisreihen und, fuer die Farben, ueber alle 5 dunklen Vorlagen (dort fand er beim ersten Lauf, dass das Kerzen-Blau gegen nords Kartenflaeche nur 2,96:1 erreicht). ⚠ Die Wochenend-Regel ist nicht kosmetisch: die Feeds TRAGEN Wochenendtage und wiederholen dort den Freitagsschluss - 107 im EUR, je 22 in USD/Gold/Oel/S&P/Nasdaq auf drei Jahre | ja |
| `cards.js` | Text/Elemente verlassen nie den Kartenrand - Kartenrand-Ueberlauf, Text-vs-Text-Ueberlappung, Text-vs-eigenes-Element-Ueberlauf, PLUS Seiten-Ebene-Ueberlauf; auf allen 17 Tabs, 5 Breiten; befuellt vorher die Watchlist, weil sie sonst leer ist und keine `.wt-card` je geprueft wuerde (Generalisierung von `dashboard.js`s bewaehrter Logik, siehe CLAUDE.md "NEUE REGEL: Kartenrand") | ja |
| `seasretail.js` | **Score B + C** (Saisonalitaet ±0,5 und Retail-Positionierung): 28 Schwellenfaelle auf eingespeisten Werten, halbe Gewichte, Deckel, Geisterzeilen in beide Richtungen, Kachel gegen `indScore`, kein Veroeffentlichungsdatum, und die Markierung des laufenden Monats im DOM gemessen. **⚠ Seit 2026-09-14 zusaetzlich Abschnitt 6: jede angezeigte Retail-Zeile gegen den rohen Feed** (56 Zeilen ueber acht FX-Assets). Anlass war ein gemeldeter Widerspruch aus zwei Bildschirmfotos: Sentiment-Tab "NZDJPY 95% long", JPY-Kachel daneben "5%". Beide Zahlen waren richtig gerechnet - die Kachel drehte jedes Paar auf die Asset-Seite - und trotzdem eine Falle, weil neben der 5 der echte Ticker stand. ⚠ FEHLERKLASSE: dieselbe Groesse an zwei Stellen in zwei Blickrichtungen, ohne dass die Beschriftung den Unterschied traegt. Das faellt in keinem Diff und in keiner Rechenprobe auf - beide Zahlen SIND ja richtig; nur der direkte Vergleich mit der Quelle zeigt es. Geprueft wird jetzt: die Prozentzahl neben "NZD/JPY" ist die des Brokers, das eigene Kuerzel ist im Paarnamen hervorgehoben, und die gedrehte Zusammenfassung (Kopfzahl, Fusszeile) nennt das Asset ausdruecklich. Gegenprobe mit der alten Drehung: 14 Fehler | ja |
| `putcall.js` | **Put/Call: eine Schwellen-Wahrheit, und sie muss zur eigenen Reihe passen.** Schneidet die DOM-freie Rechenlogik aus `js/main.js` (`pcThresholds`/`pcClassify`/`pcReading`/`pcSmoothSeries`/`pcGapWorkdays`/`pcQuantile`) und faehrt sie gegen `sentiment_data.json`. ⚠ FEHLERKLASSE, nicht Einzelzahl: (a) ZWEI Stellen entschieden unabhaengig dasselbe - `pcThresholds()` fuer den Chart (HI 1,8 / LO 0,8), feste Zahlen in `sentEval()` fuer Score und Dashboard (HI 1,0 / LO 0,7) - und stuften denselben Wert an 40,5% der Tage verschieden ein; (b) die festen Zahlen stammten aus der CBOE-**Total**-Welt (Median ~0,95), die Reihe ist aber eine OCC-Summe ueber alle US-Boersen (Median 0,76). Ergebnis: `>=1,0` an 0 von 84 Tagen erreicht (Reihenmaximum 0,93), `<=0,8` an 66,7%. Geprueft wird deshalb strukturell, dass `sentEval(putCall)` `pcReading()` ruft und KEINE festen Zahlenvergleiche mehr enthaelt (Kommentare ausgenommen - dort stehen die alten Zahlen als Begruendung), dass die Zonen an 3-20% der Tage anschlagen, dass keine Reihe mit Zonen den Roh-Spread `PC_MAX_SPREAD` reisst, dass Fr->Mo keine Luecke ist und 04.09.->10.09. drei, dass der SMA die Streuung wirklich senkt und die Reihe nicht verkuerzt, und dass eine Lesung aelter als `PC_STALE_DAYS` nicht mehr zaehlt. **Fuenf Gegenproben** - eine davon hat einen Fehler im Waechter-Gegenstand selbst gefunden: `PC_MAX_SPREAD` mass zuerst den GEGLAETTETEN Spread, und eine Reihe, die taeglich zwischen 0,5 und 40 springt, mittelt sich auf glatte 20 und haette mit 1,00x bestanden. Seitdem wird der Roh-Spread gemessen. Rueckbau-Test: alle drei wiederhergestellten Altfehler melden Exit 1 | nein |
| `datum.js` | **Jedes Datum mit Jahr, und zwar zweistellig** (Nutzer-Regel 2026-09-05, am 2026-09-17 ein zweites Mal gesetzt). Drei Stufen: (1) statisch ueber alle FX-Quellen - jeder toLocaleDateString/toLocaleString-Aufruf mit Datumsanteil muss einer der vier zentralen Formatierer sein oder `year:'2-digit'` mitgeben; (2) die AUSGABE der vier Formatierer wird in der Seite geprueft (Schreibweise sagt nicht, was herauskommt); (3) der sichtbare Text auf 17 Seiten, **inklusive SVG-Achsen**. ⚠ WARUM ES DEN WAECHTER GIBT: die Regel stand ab 05.09. als Kommentar in js/calendar.js und war am 17.09. an 13 Stellen unterlaufen - 8x Jahr ganz weg, 5x vierstellig, durchweg ueber `toLocaleString()` ohne Optionen. ⚠ UND STUFE 3 WAR ZUERST LEER-GRUEN: sie rief `go(seite)`, eine Funktion, die es nicht gibt (sie heisst showTab), und hat elfmal dasselbe Dashboard gemessen, auf dem gar kein Datum mit Monatsnamen steht - 1640 Elemente, 0 Treffer. Ausserdem war SVG-Text ausgeschlossen (aus typo.js uebernommen, wo das richtig ist) und das Muster verlangte den Monatsnamen direkt vor dem Jahr, uebersah also "Mar 4, 2026". Ausnahmen: Nachrichten-Ueberschriften (Fremdtext von Marketaux - ein zitiertes Datum umzuschreiben waere eine Faelschung der Quelle) und `// datum-ok: <warum>` mit Begruendung. Gegenprobe meldet alle drei Stufen rot | ja |
| `html.js` | **Kein zerbrochenes HTML-Attribut.** Anlass: Nutzer-Bugreport 2026-09-18 mit Bildschirmfoto - in der Kopfleiste stand zwischen den Statusanzeigen ein Textfetzen. Ursache, gemessen: der VERSION-CHECK-524-Bannertext stand in einem title-Attribut und enthielt **32 rohe doppelte Anfuehrungszeichen**; das ERSTE schliesst das Attribut, alles danach liest der Parser als weitere Attribute und schliesslich als Textinhalt. Im DOM standen hunderte Pseudo-Attribute (`sind=`, `ueberhaupt=`, `alterungsfaehig.=`, `(368=`). Zwei Stufen: (1) statisch ueber index.html - endet ein title/alt/placeholder/aria-label mitten im Fliesstext, ist es abgerissen; (2) im DOM ueber alle 17 Seiten (12273 Elemente) - kein Element darf einen Attributnamen tragen, den es in HTML/SVG/ARIA nicht gibt. ⚠ Die zweite Stufe ist die tragende, und zwar bewusst: der Bruch kann auch aus einem Template-Literal ohne escH kommen (gemessen 41 von 119 Attribut-Interpolationen in js/*.js ohne escH/escJH, einige davon mit freiem Feed-Text). Am DOM zu pruefen faengt jeden Bruch, egal woher - der Browser IST der Parser. ⚠ Zwei Fehlalarme der ersten Fassung waren echte SVG-Attribute (maskContentUnits, pathLength): sie fehlten in der Liste, und weil der Vergleich kleinschreibt, muessen camelCase-Namen dort klein stehen. Gegenprobe: das eine Anfuehrungszeichen wieder eingesetzt - Stufe 1 nennt die Zeile, Stufe 2 meldet 255 Funde am #verBanner. **Stufe 3** (seit 2026-09-18, zweiter Bugreport „die Zahlen die sind so breit"): kein SVG mit `<text>` darf seine Schrift verzerren. `preserveAspectRatio="none"` streckt ein SVG auf die Containerbreite und damit ALLES darin, auch Buchstaben und Kreise - gemessen 3,17x in der Score-Linie, 0,84x im Zinspfad, 1,43x im Seasonality-Chart, waehrend 12 weitere SVGs mit Text unverzerrt und 14 gestreckte ohne Text unproblematisch waren. Der Ausweg ist NICHT, das Strecken zu lassen (dann fuellt der Chart die Breite nicht), sondern die Beschriftung als HTML darueberzulegen (chartAchsenHtml/chartPunkteHtml). Geprueft ueber 17 Seiten und beide Fenster, 153 SVGs mit Text; Gegenprobe nennt den Faktor | ja |
| `feedgroesse.js` | **Wie gross darf ein Live-Feed werden** - 900 KB je Datei, 3500 KB zusammen, keine Einrueckung in den grossen Dateien, kein Gleitkomma-Rauschen in O/H/L, jeder Docht umschliesst seinen Koerper, und alle zwoelf Abrufe benutzen DIESELBE Frist-Konstante. Anlass: ein eigener Backfill hatte `price_data.json` auf 1299 KB gebracht und damit die Abruffrist gerissen - beim Nutzer sah das nicht nach einem Fehler aus, sondern nach fehlenden Charts | nein |
| `kartenlook.js` | **Karten heben sich ab** - am Bildschirmpixel, nicht am Token. ⚠ Zwei GETRENNTE Untergrenzen seit 2026-09-14: die Schattenkante unter der Karte (`MIN_SCHATTENKANTE = 1.28`) als das, was die Karte wirklich hebt, und die Kartenflaeche (`MIN_KONTRAST = 1.10`) nur noch als Grenze, ab der sie ueberhaupt verschwunden waere. Grund: der Nutzer hat den Kartenton ausdruecklich zurueckgenommen - haette ich nur `MIN_KONTRAST` nachgesenkt, waere der Waechter stumpf gewesen und haette gar nichts mehr geschuetzt. Der Schatten ist vom Kartenton unabhaengig (1,340:1 bei beiden Toenen gemessen). Dazu: mindestens 3 gestapelte Schattenlagen, EINE Kartenfarbe fuer alle Kartenarten. ⚠ Die sechs Pruefungen auf die Kopfleiste (.ahead) sind am 2026-09-14 mit ihr wieder GEGANGEN - sie war genau eine Version lang da; ein Waechter auf ein Element, das es nicht mehr geben SOLL, meldet sonst dauerhaft rot fuer den gewuenschten Zustand. An ihrer Stelle steht, was den Rueckbau ueberleben muss: keine .ahead, eine .dmeta mit vier Knoepfen, der PRICE-Streifen IN der Preis-Karte (er ist schon einmal gewandert) und die Reihen-Ueberschriften mit ihrer Obergrenze - auf 30 Kombinationen aus 5 Fensterbreiten x 6 Assets. **Seit 2026-09-16 zusaetzlich der "Go to <Kategorie>"-Verweis** an JEDER der zehn Karten: genau einer je Karte, seine Lage unten rechts (2-28px vom Kartenboden, 2-30px vom rechten Rand), ein Ziel, das assetQuickGo() kennt, und ein ECHTER Klick mit Pruefung, dass die Zielseite offen und die Zurueck-Pille aktiv ist. ⚠ Die Lage wird mitgemessen, nicht nur die Existenz: beim Bauen sass der Knopf in den drei Makro-Karten 1px, 95px und 102px ueber dem Boden - drei Hoehen in einer Reihe, weil `.rub-card` display:block war und margin-top:auto deshalb nicht griff. Ein "unten rechts", das je Karte woanders sitzt, ist keins. Zwei Gegenproben melden rot | ja |

## Die Regeln in `rules.js`

Sie uebersetzen Konventionen, die bisher nur Prosa waren, in ein Abbruch-Kriterium:

1. **VERSION-CHECK** - jede Aenderung an `index.html` zaehlt die Banner-Nummer hoch.
2. **SCORE_MODEL_VERSION** - wird die Score-Formel angefasst, muss die Modell-Version steigen. Sonst vergleichen History, Trends und die Staerke-Note still zwei verschiedene Rechnungen.
3. **SUMMARY_ENGINE_VERSION** - wird die Formulierungs-Logik angefasst, muss sie steigen. `rubSummarySig()` haengt nur an den Rohdaten und erkennt eine reine Text-Aenderung nie.
4. **Workflow-Ausgaben** - erzeugt ein Workflow eine `.json`, muss sie in einem `git add` desselben Workflows stehen (ausser er loescht sie selbst wieder als Zwischendatei).
5. **Warten auf ein Signal, nicht auf die Uhr** - wer im Browser Score-Zahlen liest (`symScoreCmp`/`rubScore`/`pairScore`), darf davor nicht bloss eine feste Zeit warten, sondern muss `wartenBisDatenDa()` aus `check/warten.js` aufrufen. Sonst misst der Waechter unter Last in den Startvorgang hinein und wird rot, ohne dass etwas kaputt ist.
6. **Zeitfilter und Datenabruf zusammen** - was die Zeitraum-Leiste als `Max` anbietet (`IND_HIST_MAX_FROM`), muss der Workflow auch behalten (`HIST_FULL_FROM`) und tief genug holen (`TARGET_CHUNKS`). Der Haeppchen-Test rechnet gegen das HEUTIGE Datum, meldet sich also von selbst, wenn die Zahl mit den Jahren zu klein wird.

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

## `score.js`, Abschnitt E2: OUT OF DATE nur bei bekanntem Zyklus (seit 2026-09-06)

**Anlass:** Bugreport „Aud gdp immernoch out of Date und generell ohne
Historie" — die zweite Runde zu demselben Indikator. Erreicht der Feed ein
Gerät nicht, bleibt `chartHist` leer (kein Chart) *und* `indCycleDaysCalc()`
rät pauschale 30 Tage, sobald auch `ind.interval` fehlt. Ein Quartalswert
fällt damit nach zwei Monaten fälschlich auf OUT OF DATE.

Zwei Netze: das erste prüft den Bestand (kein Indikator mit geratenem Zyklus
darf veraltet sein), das zweite stellt den Ausfall an **Kopien** echter
Indikatoren nach (`chartHist:[]`, `interval:undefined`) — sonst hinge das
erste leer in der Luft, weil im normalen Lauf ja alles da ist. Die Kopien
lassen das Original unangetastet, damit die folgenden Abschnitte weiter auf
dem echten Stand rechnen.

Gegenprobe: 117 geprüft, **0** Befunde; `indCycleIsGuess`-Zeile wieder
ausgebaut → **10** Befunde; zurück → 0.

## `layout.js`, viertes Netz: verrutschte Flex-Kinder (seit 2026-09-06)

**Anlass:** Screenshot-Bugreport, COT Report — der Refresh-Knopf sass 7px
tiefer als das Dropdown daneben. Nicht die Ausrichtung (`align-items:center`
war gesetzt), sondern ein `margin-bottom` am Kind: in einer Flex-Zeile zählt
der Margin zur Aussenbox, zentriert wird die vergrösserte Box, die sichtbare
klebt oben.

Entscheidend für die Wächter-Entscheidung: diese Kollision war zu dem
Zeitpunkt bereits **dreimal einzeln weggepatcht** worden, ohne dass jemand
die Ursache entfernt hat — ein Muster, das sich ohne roten Lauf beliebig oft
wiederholt.

Das Netz prüft über alle Viewports und Tabs: Flex-Zeile mit
`align-items:center`, mindestens zwei sichtbare Kinder auf derselben Zeile,
mindestens eines mit Block-Margin, Mittenversatz ≥ 3px → Befund.

Gegenprobe: Margin zurückgebaut → 2 Treffer (`cot-ctrl-r`, `data-ctrls`),
Margin raus → 0.

## `display.js`, Abschnitt 2b: Event-Sektion auf jedem Asset (seit 2026-09-06)

**Anlass:** Bugreport „Bei Assets bei cad gibt es kein minimalender". Die
Event-Sektion der Asset-Seite hing an `symEvts.length` und verschwand ganz,
sobald kein Event ins Fenster (-10 bis +7 Tage) fiel. CAD war das einzige
betroffene Asset (0 im Fenster, alle anderen 1–19).

Der Kern des Fehlers war nicht die leere Liste, sondern dass mit ihr die
Kopfzeile mit „Next Event" wegfiel — und die trug eine Information, die
vorlag: CADs nächster High-Impact-Release am 14.09., acht Tage entfernt und
damit knapp ausserhalb des Fensters.

Das Netz prüft die Sektion auf **allen 24 Assets**, nicht nur auf dem einen,
das aufgefallen ist. Gegenprobe: Fehler zurückgebaut → 2 Treffer (CAD und
sein Yield-Spiegel), Fix zurück → 0.

## `structure.js`, sechstes Netz: snap()-Feld ohne Gegenstück in loadState() (seit 2026-09-07)

**Anlass:** zweimal am selben Tag dieselbe Falle. `btReasons` (Backtester-
Begründungen) und `seedNoteFlags` standen in `snap()` und in `applySnap()`,
aber **nicht** in `loadState()`. Der Wert wird gespeichert — und beim nächsten
Start kommentarlos verworfen. Still verlorene Nutzereingaben, der
unangenehmste Fehler überhaupt, und beim Speichern merkt man nichts davon.

Das Netz zieht die Feldnamen aus `snap()` und verlangt für jedes ein Lesen aus
dem gespeicherten Stand (`d.<feld>`) innerhalb von `loadState()`.

⚠ Beim ersten Wurf zu schwach: er suchte nach *irgendeiner* Zuweisung, und
`loadState()` hat einen zweiten Zweig für neue Nutzer, der jedes Feld auf den
Leerwert setzt (`seedNoteFlags={};`). Der hat die Gegenprobe verschluckt — der
Wächter war grün, obwohl das Laden fehlte. Deshalb wird jetzt ausdrücklich
`d.<feld>` verlangt.

Gegenprobe: Ladezeile entfernt → `STRUKTURFEHLER: … seedNoteFlags`; wieder
eingesetzt → grün.
