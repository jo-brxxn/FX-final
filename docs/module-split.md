# Modul-Aufteilung von index.html in Kategorien

Referenziert von `CLAUDE.md`.

## Warum und Rahmen (Nutzer-Wunsch 2026-08-25)

Nutzer-Wunsch, ausgeloest durch wiederkehrende Score-Bugs: "generell das
Projekt in Kategorien machen ich denke das nicht nur Score sehr wichtig
ist". Vorgabe aus dem Klärgespräch: **ohne Build-Tool** — echte ES-Module
(`<script type="module">`, `import`/`export`), keine Bundler/npm-Toolchain,
damit der Deploy exakt so bleibt wie bisher (Cloudflare Worker + GitHub
Pages liefern weiterhin nur Dateien direkt aus, kein Build-Schritt, jeder
Push sofort live — siehe `docs/workflow.md`).

**Bewusst inkrementell, eine Kategorie pro Schritt**, nicht ein einziger
großer Umbau: das Hauptskript ist ~19.400 Zeilen mit über 1.200 Top-Level-
Deklarationen für eine live genutzte Finanz-App ohne menschliches Code-
Review jedes Diffs — ein Fehler kann direkt beim Nutzer landen. Nach jeder
Kategorie: vollständiger `node check/all.js`-Lauf (alle 12 Wächter grün),
erst dann committen/pushen.

## Die zentrale Falle: `type="module"` ist global, nicht partiell

Sobald `<script>` zu `<script type="module">` wird, sind **alle**
Top-Level-Funktionen/-Variablen dieses Skripts sofort NICHT mehr
automatisch im globalen `window`-Scope erreichbar — Module haben ihren
eigenen Scope. Das betrifft **das ganze verbleibende Hauptskript auf
einmal**, nicht nur die gerade ausgekoppelte Kategorie. Diese App generiert
ihre UI aber ganz überwiegend als HTML-STRINGS mit `onclick="fooBar()"`
etc. direkt drin (kein `addEventListener`) — der Browser wertet diese
Attribut-Handler im GLOBALEN Scope aus. Ohne Gegenmaßnahme bricht damit
**jeder Button/jede Interaktion in der gesamten App auf einen Schlag**,
nicht nur die extrahierte Kategorie.

**Lösung: Kompatibilitäts-Brücke.** Am Ende des Hauptskripts (vor
`</script>`) werden alle verbliebenen Top-Level-Namen explizit auf `window`
gehängt:
- Funktionen + `const` → einmalig per `Object.assign(window,{name1,name2,...})`
  (stabile Referenzen, kein Nachziehen nötig).
- `let`-Variablen (echter, sich änderender Zustand wie `syms`, `widgets`,
  `curPage`, `calEvts`) → **live** per
  `Object.defineProperty(window,'name',{get:()=>name,set:v=>{name=v;},configurable:true})`.
  Ein einmaliger Kopier-Snapshot (`Object.assign`) würde nach der nächsten
  Neuzuweisung (`curPage='x'`) veraltet bleiben — genau das hat
  `check/nav.js` beim ersten Versuch mit `ReferenceError: curPage is not
  defined` aufgedeckt (die Variable fehlte komplett in der Brücke, siehe
  unten warum).

Das ist eine bewusste Kompromiss-Entscheidung: keine "saubere" Kapselung,
sondern 1:1 dasselbe globale Verhalten wie vorher, nur mit dem Code jetzt
in sauber getrennten Dateien. Bei jeder neu ausgekoppelten Kategorie-Datei
wandert deren Anteil aus der Brücke raus — die Datei bridged ihre eigenen
onclick-relevanten Exports dann selbst (Beispiel: `js/constants.js` brauchte
gar keine Brücke, da nichts von dort per `onclick` referenziert wird —
vorher per Cross-Check gegen die Handler-Namen-Liste verifizieren, siehe
unten).

## ⚠️ Namen NIEMALS per Regex/Handschrift sammeln — echten Parser benutzen

Der erste Versuch, alle Top-Level-Namen für die Brücke zu sammeln, lief über
Zeilen-Regex (`^function `, `^const `, `^let `). Zwei Klassen von Fehlern
kamen dabei raus, beide real und beide erst durch den vollen `check/all.js`-
Lauf gefunden:
1. **Mehrfach-Deklarationen auf einer Zeile** (`let selId='USD',curSub=...,
   curPage='dash',curFxMode='fx';`) — die Regex fand nur den ERSTEN Namen
   pro Zeile, alle weiteren (u.a. `curPage`, `calEvts`, `widgets`, `pairs`,
   `research` — zentrale State-Variablen) fehlten in der Brücke komplett.
2. **Anführungszeichen INNERHALB von Regex-Literalen** (`escH=s=>...
   .replace(/"/g,'&quot;')...`) — ein handgeschriebener Zeichen-Scanner, der
   String-Grenzen selbst nachbaut, hält das `"` in `/"/g` fälschlich für den
   Beginn eines echten Strings und verschluckt dabei unkontrolliert Teile
   des restlichen Codes (erzeugte einen erfundenen Namen `die` aus einem
   Kommentarwort).

**Fix: echten JS-Parser benutzen, nicht raten.** `acorn` liegt bereits unter
`eslint`'s Abhängigkeiten global installiert:
```js
const acorn = require('/opt/node22/lib/node_modules/eslint/node_modules/acorn');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' });
// ast.body durchgehen: FunctionDeclaration → node.id.name,
// VariableDeclaration (kind const/let) → node.declarations[].id (ggf.
// Object-/Array-Pattern rekursiv auflösen für Destrukturierung).
```
Das lieferte 100% korrekte Namen (verifiziert per Diff gegen die Regex-
Liste) und deckte den bis dahin unbemerkten Fehler sofort auf. Bei jeder
künftigen Kategorie-Extraktion **immer** so vorgehen, nie wieder per
Zeilen-Regex.

## Wie eine Handler-Namen-Liste ergänzend hilft

Zusätzlich zur "brücke einfach alles"-Strategie: ein Scan aller
`on[a-z]+="..."`-Attributwerte (inkl. dynamisch zusammengesetzter Handler
wie `onclick="${fn}(...)"` oder `onchange="${setFnName}Custom(...)"` — bei
Letzterem MUSS die Ziel-Funktion `<setFnName>Custom` als eigene, echte
Funktion existieren, auch wenn keine direkte Textsuche sie findet, siehe
Kommentar bei `timeRangeCustomHtml` in `index.html`) bestätigt, welche Namen
wirklich aus generiertem HTML heraus aufgerufen werden. Nützlich als
Cross-Check (z.B. um zu bestätigen, dass eine frisch ausgekoppelte Datei
wie `js/constants.js` KEINE eigene Brücke braucht), aber NICHT als alleinige
Quelle — dynamisch zusammengesetzte Namen und Mehrfach-Statement-Handler
(`onclick="event.stopPropagation();fooBar()"`) macht das unvollständig.
"Brücke alles, was im Modul-Top-Level steht" ist robuster als "brücke nur,
was ich per Suche gefunden habe".

**⚠️ Zweite Quelle, die genauso zwingend ist: die `check/*.js`-Skripte
selbst.** Bei der Daten-Feeds-Kategorie (VERSION-CHECK-451) rief
`check/score.js` `applyIndDataFeed`/`applyBondDataFeed` per `page.evaluate()`
als bloße Bezeichner auf (`const feeds={applyIndDataFeed,...}`) - das ist
GENAU derselbe globale Zugriff wie ein inline `onclick`, taucht aber in
keiner HTML-Handler-Liste auf, weil es aus einem Node-Skript kommt, nicht
aus dem Browser-Markup. `node check/all.js` hat das sofort gefunden
(`score`/`score-cl`: `ReferenceError: applyIndDataFeed is not defined`).
**Vor jeder Extraktion deshalb zusätzlich `check/*.js` nach den zu
verschiebenden Namen durchsuchen** (Wortgrenzen beachten - eine naive
Substring-Suche findet z.B. `FX` auch in `FX-final`):
```js
const checkFiles = fs.readdirSync('check').filter(f=>f.endsWith('.js'))
  .map(f=>fs.readFileSync('check/'+f,'utf8')).join('\n');
const treffer = kandidatenNamen.filter(n =>
  new RegExp('(^|[^A-Za-z0-9_$.])'+n+'(\\W|$)').test(checkFiles));
```
Jeder Treffer braucht dieselbe Selbst-Brücke wie ein onclick-Name.

## Ablauf pro Kategorie (Checkliste)

1. Abschnitt per Kommentar-Banner (`// ══ NAME ══`) im Hauptskript
   identifizieren, exakte Zeilengrenzen bestimmen.
2. Neue Datei `js/<kategorie>.js` anlegen, Inhalt 1:1 rüberkopieren, jede
   Top-Level-Deklaration mit `export` versehen.
3. Im Hauptskript den Block durch `import {...} from './js/<kategorie>.js';`
   ersetzen (Namen exakt mit den Exports abgleichen, siehe Diff-Skript-
   Muster oben).
4. Prüfen, ob irgendein exportierter Name in der Handler-Namen-Liste
   auftaucht — falls ja, in der neuen Datei selbst
   `if(typeof window!=='undefined')Object.assign(window,{...})` ergänzen.
5. `node --check` auf den extrahierten Hauptskript-Body (Zeilenbereich
   zwischen den `<script type="module">`/`</script>`-Tags in eine `.mjs`-
   Datei kopieren) UND auf die neue Datei.
6. Die window-Brücke am Ende des Hauptskripts per AST (siehe oben) NEU
   generieren (Namen ändern sich mit jeder Extraktion) und ersetzen.
7. Playwright-Smoke-Test: Seite laden, `typeof <ein paar bekannte
   Kern-Namen>` pruefen, mehrfach `showTab()` zwischen Tabs wechseln (deckt
   die live-let-Brücke ab, nicht nur den einmaligen Ladezustand).
8. `node check/all.js` komplett (nicht `--static` — `nav`/`cards`/
   `dashboard`/`runtime` sind genau die, die echte Klick-Interaktionen und
   damit fehlende Brücken-Einträge aufdecken).
9. Erst bei komplett grünem Lauf committen/pushen (dev-Branch + `main`).

## Hauptskript ist ein ECHTES externes Modul (seit VERSION-CHECK-449)

Ursprünglich blieb das Hauptskript INLINE (`<script type="module">...
</script>` direkt in `index.html`), nur `js/constants.js` war eine externe
Datei. Das genügt für eine EINSEITIGE Abhängigkeit (Hauptskript importiert
von `constants.js`), bricht aber bei einer Kategorie, die auch das
Hauptskript zurück braucht: ein `<script type="module">` OHNE `src` hat
keine eigene URL, andere Dateien können nicht `import {...} from` diesem
Inline-Block. Genau das brauchte die Globus-Kategorie (Dashboard ruft
`globeSkeleton()`/`startGlobes()` auf, der Globus braucht umgekehrt
`syms`/`curPage`/`symScoreCmp`/... zurück).

**Fix:** das komplette verbleibende Hauptskript nach `js/main.js` verschoben,
`index.html` laedt es jetzt per `<script type="module" src="js/main.js">`.
Inhaltlich reine Ortsverschiebung (keine Verhaltensaenderung), macht aber
JEDE weitere Kategorie-Datei zu einem gleichberechtigten Modul mit eigener
URL - `js/main.js` und z.B. `js/globe.js` koennen sich seitdem GEGENSEITIG
importieren (zirkulaerer Import, siehe naechster Abschnitt).

## Zirkulaerer Import zwischen Kategorie-Datei und js/main.js

ES-Module erlauben zirkulaere Imports (A importiert von B, B importiert von
A) - Funktionsdeklarationen sind gehoisted, funktionieren also auch wenn die
importierende Datei zur Ladezeit noch nicht "fertig" ist, solange NIEMAND
am eigenen Modul-Top-Level (ausserhalb von Funktionskoerpern) versucht, den
Wert SOFORT zu lesen. In der Praxis: `js/globe.js` importiert `syms`/
`curPage`/... aus `js/main.js`, `js/main.js` importiert `startGlobes`/...
aus `js/globe.js` zurueck - beide referenzieren die importierten Namen NUR
innerhalb von Funktionskoerpern, nie beim Laden selbst, das reicht.

**⚠️ Import-Bindings sind SCHREIBGESCHUETZT von aussen.** Ein `let`, das ein
anderes Modul importiert, darf dort NICHT direkt zugewiesen werden (`import
{_globeLon} from './globe.js'; _globeLon = 0;` ist ein Laufzeitfehler -
Acorns Standard-Parser meldet das NICHT als Syntaxfehler, `node --check`
faengt es also nicht ab, es kracht erst im echten Browser beim Ausfuehren).
Gefunden per Playwright-Test (`ReferenceError`/`TypeError` beim Tab-Wechsel),
nicht per Syntax-Check. Fix: fuer den einen Schreib-Zugriff (`_globeLon=
GLOBE_HOME_LON` beim `showTab('dash')`) einen kleinen Setter `resetGlobeLon()`
IN globe.js ergaenzt und exportiert, statt das Feld von aussen zu beschreiben
- der allgemeine Grundsatz: mutable State bleibt in SEINEM eigenen Modul,
andere Module rufen eine Funktion auf, statt das Feld direkt zu setzen.
**Vor jeder neuen Kategorie mit Zustand pruefen** (per AST, nicht Auge):
gibt es irgendwo in der ANDEREN Datei eine direkte Zuweisung an einen
importierten Namen? (`AssignmentExpression`/`UpdateExpression` mit
`left`/`argument` als `Identifier`, dessen Name im Import steht.)

## ⚠️ Handschriftliche Namenslisten NIE manuell abtippen

Selbst mit dem AST-Parser aus dem Abschnitt oben ist noch ein Fehler
passiert: die Export-/Import-Listen fuer `js/globe.js` wurden von Hand aus
der Skript-Konsolenausgabe abgetippt (nur die "wichtig aussehenden" Namen
uebernommen) - dabei sind ALLE unterstrich-praefigierten privaten
Zustandsnamen (`_globeLon`, `_globeHosts`, `_globeMode`, ...) verloren
gegangen, weil sie beim Ueberfliegen wie interne Details aussahen. Das
Ergebnis war ein Playwright-Fehler beim Tab-Wechsel (`_globeLon is not
defined`), NICHT beim Laden - der Bug haette leicht unbemerkt bleiben
koennen, waere der Smoke-Test nicht ausdruecklich durch mehrere `showTab()`-
Wechsel gegangen. **Fix: die vom Skript geschriebene `.txt`-Datei direkt
per Node einlesen und die Export-/Import-Bloecke daraus GENERIEREN, nie
von Hand aus der Konsolenausgabe abtippen** - genau dieselbe Lehre wie beim
ersten Regex-vs-Parser-Fund oben, nur eine Ebene weiter: auch ein korrektes
Werkzeug hilft nichts, wenn sein Ergebnis am Ende per Hand kopiert wird.

## ⚠️ Die Waechter-Skripte selbst lasen bisher NUR index.html

Fuenf `check/*.js`-Skripte gingen (unabhaengig von der window-Bruecke oben)
implizit davon aus, dass der GESAMTE App-Code inline in `index.html` liegt -
jedes davon wurde durch die Modul-Aufteilung BLIND, nicht laut kaputt:

1. **`check/scoreSurface.js`**: `inlineJs()` liest nur `<script>`-Bloecke
   OHNE `src`-Attribut aus `index.html`. Sobald die Score-Funktionen extern
   liegen, findet es keine der WURZEL-Funktionskoerper mehr -> die
   abgeleitete Score-Flaeche ist leer -> `check/rules.js`s SCORE_MODEL_
   VERSION-Zwang (Regel 2) greift NIE MEHR, unabhaengig davon was sich
   wirklich aendert. **Bestaetigt per Regressionstest** (siehe unten) - vor
   dem Fix meldete `node check/rules.js` "ok", obwohl `biasScore()`
   absichtlich kaputt gemacht wurde. Fix: `ableiten()` haengt jetzt den
   Inhalt aller `js/*.js`-Dateien an den inline-JS-String an, bevor die
   Funktionskoerper-Suche laeuft.
2. **`check/rules.js`**: `git diff -U0 ${BASE} -- index.html` war fest auf
   eine Datei verdrahtet - eine Aenderung in `js/main.js` erschien in
   `diffText` NIE, egal was SCORE_FN/SUM_FN enthalten. Ebenso lasen `wert()`/
   die SCORE_MODEL_VERSION-/SUMMARY_ENGINE_VERSION-Konstantensuche und Regel
   5/6 (neue Score-Funktion/neuer persistierter Key) ausschliesslich
   `index.html`. Fix: `-- index.html js` im Diff-Aufruf, plus zwei neue
   Helfer `aktuellerCode()`/`basisCode()` (index.html + alle js/*.js,
   Arbeitsbaum bzw. per `git show BASE:...`), die jetzt ueberall dort
   eingesetzt sind, wo vorher nur `index.html` gelesen wurde.
3. **`check/structure.js`** ("Handler ohne Funktion"): baute die Menge
   bekannter Funktionsnamen NUR aus `index.html` - nach der Externalisierung
   fast leer, meldete ~68 voellig unbeteiligte Handler faelschlich als
   "ohne Funktion". Fix: `def`/`HANDLER`-Suche laeuft jetzt ueber
   `index.html` + den Inhalt von `js/*.js` zusammen (die id-/Block-
   Dopplungspruefungen bleiben bewusst nur auf `index.html`, da js/*.js kein
   statisches HTML enthaelt).
4. **`check/scorediff.js`**: kopierte fuer den BASIS-Stand nur `index.html`
   + `*.json`/`sw.js` in ein Temp-Verzeichnis - `js/constants.js` fehlte
   dort komplett. Ein ES-Modul ist fail-fast: ein 404 auf einen Import wirft
   und laesst KEINE einzige Top-Level-Variable des Moduls entstehen, auch
   nicht die voellig unbeteiligten. Ergebnis: `ReferenceError: syms is not
   defined` beim Laden der ALTEN (Basis-)Version - fuer JEDEN Vergleich, ab
   dem Moment, an dem `origin/main` selbst schon `js/constants.js` brauchte,
   nicht erst ab dieser Session. Fix: `git ls-tree -r --name-only ${BASE}
   -- js` + `git show ${BASE}:<datei>` fuer jede gefundene Datei, dazu
   zwei Nebenfehler im winzigen Test-HTTP-Server behoben: `path.basename()`
   strippte Unterordner (`js/main.js` -> gesucht wurde `main.js` direkt im
   Temp-Root) - jetzt `path.normalize()` mit `..`-Schutz; und `.js`-Dateien
   wurden als `text/html` ausgeliefert - Chrome verweigert `<script
   type="module" src="...">` dann hart (falscher MIME-Typ), jetzt
   `text/javascript` fuer `.js`.
5. **`check/rules.js` Regel 3 (SUMMARY_ENGINE_VERSION)** hatte KEIN
   Gegenstueck zu `scorediff.js` - eine reine Datei-Umsortierung der
   `summarize*`-Funktionen (kein Text-Unterschied) haette den Bump zwingend
   verlangt, obwohl das laut Projekt-Grundsatz SCHAEDLICH waere (markiert
   synchronisierte Texte faelschlich als veraltet). Neue Datei
   `check/summarydiff.js` (identisches Muster wie `scorediff.js`, vergleicht
   `summarizeRub(sym,rub)` fuer jede Karte jedes Symbols statt Score-Zahlen)
   dient jetzt als Nachrechnung, genau wie `scorediffErgebnis()` es fuer
   Regel 2 tut.

**Regressionstest-Verfahren (jetzt Standard-Praxis, nicht nur einmalig):**
`biasScore()` in `js/main.js` testweise kaputt machen (z.B. `bull` gibt 999
statt 1 zurueck), `node check/scorediff.js` + `node check/rules.js` laufen
lassen, bestaetigen dass BEIDE den Fehler korrekt melden, DANACH erst den
Originalzustand wiederherstellen. Ohne dieses Verfahren waere Fund 1 (der
schwerwiegendste - ein komplett stummes Sicherheitsnetz) unbemerkt geblieben,
da `node check/rules.js` schlicht "ok" meldete.

**Damit ist die Score-/Formulierungs-Sperre aufgehoben** - `js/score.js`/
`js/summary.js` koennen jetzt genauso wie jede andere Kategorie ausgekoppelt
werden. Trotzdem: nach JEDER weiteren Kategorie-Extraktion (nicht nur bei
Score/Summary) den Regressionstest oben wiederholen, um sicherzugehen, dass
kein SECHSTER blinder Fleck in einem der Check-Skripte lauert.

## Bereits ausgekoppelt

- `js/constants.js` (VERSION-CHECK-448): `BC`/`BL`/`FX`/`FX_FLAG`, das
  komplette Asset-Icon-System (`AI_*`, `aiStar`/`aiStars`/`aiIndex`),
  `YIELD_CCY`. Reine Daten/Geometrie-Helfer ohne DOM-/onclick-Kopplung -
  deshalb als erste, risikoärmste Kategorie gewählt. Keine eigene
  window-Brücke nötig (verifiziert: keiner der 15 Exports taucht in der
  Handler-Namen-Liste auf). Einseitige Abhängigkeit (nur index.html
  importiert von hier) - brauchte deshalb noch kein externes js/main.js.
- `js/globe.js` (VERSION-CHECK-449): rotierender FX-Weltglobus + Intro-
  Boost-Sequenz (Ladebildschirm-Animation), 62 Top-Level-Namen. Erste
  Kategorie mit ECHTER bidirektionaler Abhängigkeit zum Hauptskript - hat
  die Externalisierung von index.html nach js/main.js ausgeloest (siehe
  oben) und beide oben dokumentierten Fallen (Import-Binding-Schreibschutz,
  handschriftlich abgetippte Namenslisten) zuerst getroffen.
- `js/data-feeds.js` (VERSION-CHECK-451): Indikator-/Anleiherenditen-/
  Preis-/News-/Risk-Index-Live-Abrufe (`fetch*Data`/`apply*Feed`) + die
  Asset-Strength-Karten-Konfiguration (`ccyAllOptions`/`openCcyCfgM`/...,
  thematisch direkt benachbart im selben Abschnitt), 45 Top-Level-Namen,
  wie bei globe.js voll bidirektional. Hat die dritte Bruecken-Fallgrube
  gefunden: `check/score.js` ruft `applyIndDataFeed`/`applyBondDataFeed`
  direkt als globalen Namen per `page.evaluate()` auf - siehe den
  "check/*.js selbst durchsuchen"-Abschnitt oben.
- `js/score.js` (VERSION-CHECK-452): die eigentliche Score-Rechenkette -
  Bias-Score, Normierung (Ueberraschung/Aktualitaet/Marktreaktion),
  Altersgrenze, Datenqualitaet/Gewichtung, eigene Historie/Staerke 1-10,
  Carry, Sidebar-Synchronisation. 104 Top-Level-Namen, voll bidirektional.
  Erste Kategorie NACH Aufhebung der Score-Sperre - zwei Import-Binding-
  Schreibversuche gefunden (main.js-Zustand `_lsUpdatedSeen`/
  `_suppressBiasFlipAlerts` wurde direkt aus dem Score-Bereich heraus
  zugewiesen), nach demselben `resetGlobeLon`-Muster mit zwei neuen
  Settern (`markLsUpdatedSeen()`/`setSuppressBiasFlipAlerts()`) geloest.
  `check/rules.js` Regel 5 flaggte die neue `setSuppressBiasFlipAlerts`
  zu Recht als "neue Score-Groesse ohne Pruefung" (Name enthaelt "Bias") -
  statt die Regel zu umgehen, einen echten Verhaltenstest in
  `check/score.js` ergaenzt (`setSuppressBiasFlipAlerts(true)` muss
  `_suppressBiasFlipAlerts` wirklich auf `true` setzen). Regressionstest
  (biasScore() absichtlich falsch, in `js/score.js` diesmal) bestaetigt:
  Sicherheitsnetz haelt auch mit Score jetzt in eigener Datei.
- `js/calendar.js` (VERSION-CHECK-453): Kalender-Symbol-Matching
  (`CAL_ALIASES`/`evtMatchesSym`) + FF-Style Kalender-Tabellenzeilen
  (Actual-vs-Forecast-Faerbung inkl. Asset-Bias-Umkehr, `calTableHtml`/
  `calRowHtml`/`calToolbarHtml`, High-Impact-/Waehrungs-/Kompaktansicht-
  Filter). 25 Top-Level-Namen exportiert, voll bidirektional. Drei
  Import-Binding-Schreibversuche gefunden (main.js-Zustand `calHighOnly`/
  `compactView`/`calCcyFilter` wurde direkt aus dem ausgekoppelten Bereich
  heraus zugewiesen), nach demselben Muster mit drei neuen Settern
  (`setCalHighOnlyVal()`/`setCompactViewVal()`/`setCalCcyFilterVal()`)
  geloest - plus drei weitere Stellen, die den bereits vorhandenen Setter
  `markLsUpdatedSeen()` (aus der score.js-Runde) haetten nutzen muessen,
  aber noch direkt `_lsUpdatedSeen=...` zuwiesen.
  **Dabei einen echten, seit der score.js-Runde bestehenden Fehler
  gefunden**, der nichts mit dieser Kategorie zu tun hatte: `importData()`
  und `cloudPull()` in `js/main.js` schrieben an zwei Stellen direkt auf
  `scoreMode` (ein Import-Binding aus `js/score.js`, seit VERSION-CHECK-452)
  statt einen Setter zu nutzen - waere beim naechsten JSON-Import bzw. beim
  naechsten Cloud-Sync-Konflikt mit einem Laufzeitfehler ("Assignment to
  constant variable"/Import-Binding-Fehler) abgestuerzt. `node check/all.js`
  hatte das nach der score.js-Runde NICHT gefangen, weil kein Testlauf
  jemals `importData()`/den `cd.scoreMode`-Zweig von `cloudPull()` ausloest.
  Gefunden durch den in dieser Runde routinemaessig laufenden Import-
  Bindungs-Zuweisungs-Check (AST-basiert, beide Richtungen) - **dieser
  Check faengt also nicht nur Fehler der GERADE bearbeiteten Kategorie,
  sondern auch aeltere, noch unentdeckte Faelle in bereits verschobenem
  Code** - deshalb bleibt er fester Bestandteil des Ablaufs, auch wenn die
  aktuelle Extraktion selbst keinen neuen Fall hat. Behoben mit einem
  vierten Setter (`setScoreModeVal()` in `js/score.js`), `check/rules.js`
  Regel 5 flaggte ihn zu Recht ("neue Score-Groesse") - echter
  Verhaltenstest in `check/score.js` ergaenzt statt die Regel zu umgehen.
