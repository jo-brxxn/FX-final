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

## Bereits ausgekoppelt

- `js/constants.js` (VERSION-CHECK-448): `BC`/`BL`/`FX`/`FX_FLAG`, das
  komplette Asset-Icon-System (`AI_*`, `aiStar`/`aiStars`/`aiIndex`),
  `YIELD_CCY`. Reine Daten/Geometrie-Helfer ohne DOM-/onclick-Kopplung -
  deshalb als erste, risikoärmste Kategorie gewählt. Keine eigene
  window-Brücke nötig (verifiziert: keiner der 15 Exports taucht in der
  Handler-Namen-Liste auf).
