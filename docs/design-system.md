# Design-System: Schrift, Typografie, wiederkehrende UI-Bausteine

Referenziert von `CLAUDE.md`. Für die Koyfin-Navigation/Sidebar/Dashboard-
Layout-Iterationen siehe `docs/navigation.md`.

## ⚠️ SCHRIFT

Zwei Variablen: `--ff-text` (Oberflaechentext) und `--ff-num` (alle
Zahlen). Bei neuen Stellen IMMER eine der beiden verwenden, nie einen
eigenen Stapel.

**Die echte Bloomberg-Schrift ist nicht verfuegbar.** "Bloomberg Prop
Unicode" wurde bei Matthew Carter angefertigt, ist bei Carter & Cone
markenrechtlich geschuetzt, kommerziell lizenziert und exklusiv fuer
Bloomberg. Die "Free Download"-Seiten dazu sind Raubkopien. Eine
Web-Schrift ueber ein CDN scheidet ohnehin aus - die App ist eine einzelne
Datei, die per Service Worker offline laufen muss.

Nachgebaut ist deshalb das, was den Terminal-Charakter ausmacht - die
ZIFFERN: `font-feature-settings:'tnum' 1,'zero' 1,'ss01' 1` plus
`font-variant-numeric:tabular-nums slashed-zero` auf `body`. Dicktengleiche
Ziffern lassen Zahlenspalten optisch einrasten, ohne dass man Linien
zeichnen muss (Tuftes Data-Ink-Gedanke, und der Grund, warum Bloomberg
ueberhaupt eine eigene Mono anfertigen liess); die geschlitzte Null trennt
0 von O.

**Historie, damit es nicht nochmal passiert:** ein frueherer Nutzer-Wunsch
"ueberall Arial" war als globales
`*,*::before,*::after{font-family:Arial...!important}` umgesetzt. Das hat
ALLE 200 Monospace-Deklarationen der App stillschweigend ueberschrieben -
die Zahlen waren nie dicktengleich. Der Stern setzt jetzt weiterhin die
einheitliche Textfamilie, aber OHNE `!important`: ein Selektor aus lauter
Sternen hat Spezifitaet 0, jede Klassenregel schlaegt ihn automatisch.
**Nie wieder ein globales `!important` auf font-family setzen.**

## ⚠️ TYPOGRAFISCHE SKALA (Dashboard)

Sieben feste Stufen als CSS-Variablen statt frei gewaehlter Werte:
`--fs-hero` 30 · `--fs-xl` 22 · `--fs-lg` 17 · `--fs-md` 15 (KARTENTITEL) ·
`--fs-base` 13 · `--fs-sm` 12 · `--fs-xs` 11 · `--fs-2xs` 10.

Vor dem Umbau kamen 33 verschiedene Groessen/Gewichts-Kombinationen vor
(8 bis 32px, dazwischen 9,5 / 10,5 / 11,5 / 12,5) - keine Skala, sondern
pro Stelle ad hoc gewaehlt. Der Kartentitel war mit 11px KLEINER als der
Fliesstext daneben (12px), die Hierarchie also umgekehrt.

Grundsatz (Stephen Few, *Information Dashboard Design*): wenige Stufen
erzwingen Hierarchie, viele loesen sie auf. Bei neuen Elementen IMMER eine
der sieben Stufen verwenden, keine neue Zwischengroesse einfuehren.

Ebenso als Skala zu behandeln: **`--gap-block`** (Abstands-Skala, siehe
`docs/navigation.md`) — bei einem neuen Block/einer neuen Karte immer die
Variable verwenden statt einen "ungefaehr passenden" Wert zu waehlen.

Karten-Abschluss: NICHTS wird gestreckt, um Luecken zu fuellen
(`align-items:start` ueberall, bzw. `justify-content:flex-start` in
Flex-Spalten — siehe "Loch im Dashboard" in `docs/navigation.md`). Die
Spalten duerfen unterschiedlich hoch enden wie Zeitungsspalten; eine
Haarlinie ueber der Fussleiste zieht den Schlussstrich.

## ⚠️ GRUNDSATZ: wiederkehrende UI-Bausteine müssen einheitlich sein

**Nutzer-Wunsch 2026-07-12:** Elemente, die an mehreren Stellen der Webseite
vorkommen (Kalender, Filter-Dropdowns, usw.), müssen überall gleich aufgebaut
sein — gleiche Optik, gleiches Verhalten. Unterschiede sind nur ok, wenn sie
sachlich begründet sind (z.B. filtert die eine Stelle nach etwas anderem als
die andere) — das ist selbstverständlich kein Widerspruch zur Regel.

Umgesetztes Beispiel: `assetFilterSelect(ids, selected, onChange, allLabel,
titleAttr, labelFn)` (≈ Zeile 1701, direkt nach `SB_CATS`) ist der EINE
gemeinsame Helper für alle Asset-Filter-Dropdowns (COT, Put/Call, Net Options
Flow, Seasonality) — gruppiert nach `SB_CATS`-Kategorie (FX/Crypto/Metals/
Energy/Indices/Stocks), einheitliche Größe über `.cot-filterbar select` in
der CSS (nicht mehr `#cotFilterSel`-only). Retail Sentiment filtert nach
Broker-PAAR statt Asset-ID (passt nicht in `SB_CATS`) und bekommt daher eine
eigene, aber optisch gleich aussehende Zweifach-Gruppierung (FX Pairs /
Other Assets). Beim Anlegen eines NEUEN Filters immer zuerst prüfen, ob
`assetFilterSelect` passt, statt einen eigenen `<select>` zu bauen.

Weitere bereits geltende Cross-Cutting-UI-Regeln (durchgehend, nicht nur wo
gerade dran gearbeitet wird):
- **Charts mit mehreren Datenpunkten**: überall Hover/Touch mit Linie + Punkt
  + Tooltip-Fenster (Muster: `chartHoverWrap()` + `attachChartHovers()`,
  ≈ Zeile 8845) — Fenster verschwindet, sobald Finger/Maus weg ist. Charts
  dürfen NICHT horizontal wegwischbar/verschiebbar sein.
- **Karten-Inhalt darf nie über den Kartenrand hinausgehen.** Ist der Inhalt
  zu breit, wird er INNERHALB der Karte horizontal scrollbar gemacht (nicht
  abgeschnitten, nicht die Karte selbst verschoben) — alles bleibt zu jeder
  Zeit exakt untereinander ausgerichtet, nichts "rutscht". Durchgesetzt von
  `check/cards.js` (siehe `docs/navigation.md` und `check/README.md`).
- **⚠️ Elemente dürfen sich NIEMALS so überlappen, dass etwas dadurch
  unsichtbar/unlesbar wird** (Nutzer-Grundsatz 2026-07-20, per Screenshot:
  im Rate-Probabilities-Mehrlinien-Chart überlappten sich Endpunkt-Labels
  bei nah beieinander liegenden Werten, und ein Hover-Tooltip wurde vom
  `overflow:hidden`-Slide-Viewport oben abgeschnitten). Gilt generell, nicht
  nur für diesen einen Chart — bei JEDEM neuen UI-Element mit mehreren
  dynamisch positionierten Beschriftungen/Overlays (Chart-Labels, Tooltips,
  Badges, Dropdowns) immer eine Kollisions-/Clipping-Prüfung einbauen
  (Muster: Labels an ähnlicher Position gruppieren, sortieren, Mindestabstand
  erzwingen; bei Tooltips/Overlays in einem `overflow:hidden`-Container genug
  eigene Innen-Freiheit einplanen, statt sich auf den Container-Rand zu
  verlassen). Verwandtes Problem, dieselbe Klasse: jedes Dropdown/Overlay,
  das aus einer `backdrop-filter`-Leiste (`.hdr`/`.tabbar`/`.sb`)
  herausragen könnte, gehört per `document.body.appendChild()` +
  `position:fixed` gebaut (Muster: `openStackMenu`, mittlerweile ersetzt
  durch das Inline-Akkordeon aus `docs/navigation.md`) — ein simples
  `z-index` auf einem statischen Kind-Element reicht nicht, weil die Leiste
  ihren eigenen Stacking-Context aufmacht (Fundgeschichte: `docs/CHANGELOG.md`,
  Stichwort "Data"-Dropdown).
- **Score-/Asset-Karten**: kalmes Design statt Farbflut — Bias wird NUR über
  einen linken Rand-Streifen gezeigt (`.rub-card` 4px, `.ind-card`/
  `.pair-card`/`.sym-row` 3px) auf neutralem 1px-Rahmen, `glow-*`-Klassen
  setzen ausschliesslich `border-left-color`, keinerlei Hintergrund-Tint.
  Ein Hintergrund-Glow wurde mehrfach probiert und vom Nutzer nach Ansehen
  jedes Mal wieder verworfen (Details in `docs/CHANGELOG.md`, Stichwort
  "Glow") — **bei einem erneuten "Glow zurück"-Wunsch zuerst nachfragen**,
  welche Kartentypen genau gemeint sind, statt direkt umzusetzen.
- **`.dw` (Dashboard-Widgets) bewusst OHNE Koyfin-Kopfleisten-Hintergrund**
  gelassen — keine Lücke, sondern eine am 2026-07-25 explizit getroffene
  Nutzer-Entscheidung ("Keine Ueberschrift einfach so", Code-Kommentar bei
  `.dw-hdr`). Bei einem "Karten sehen nicht einheitlich aus"-Einwand zu
  `.dw` zuerst diese Entscheidung nachschlagen, bevor sie neu aufgerollt
  wird — dieselbe Vorsicht wie beim "Glow"-Punkt oben.

## Farbwelt: dunkles Terminal (Nutzer-Vorlage 2026-08-23)

Die App steht auf **tiefem Marineblau**, nicht mehr auf Hellgrau. Vorlage war
ein vom Nutzer geschicktes Finanz-Dashboard; der Seitenaufbau wurde bewusst
NICHT davon übernommen, nur die Farbwelt und einzelne Element-Ideen.

**Die Grauskala liest sich auf Dunkel umgekehrt — aber die Ordnung bleibt.**
`--bg2` (Karte) ist die *hellste* Fläche, `--bg0` (Seite) die dunkelste.
`--bg4/5/6` gehen deshalb **heller** statt dunkler. Der Merksatz dahinter ist
unverändert: sie bedeuten „ein Schritt weiter weg von der Karte" — auf Hell
hieß das dunkler, auf Dunkel heller. Jede Verbrauchsstelle, die nur an der
Reihenfolge hängt (Farbverläufe, Badges, Hover), stimmt dadurch weiter.

**`--accent` (Cyan `#22d3ee`) ist ausschließlich Interaktion.** Aktiver Tab,
ausgewählter Filter, Fokus. NIE ein Datenwert — Blau ist im ganzen Rest der App
die Bias-Farbe „bullish", und ein Cyan daneben würde die Zahlenfarbe
mehrdeutig machen.

**`--a-infl` / `--a-rate` / `--a-lab` / `--a-grow` / `--a-cot` / `--a-risk`** sind
Akzentfarben je Makro-Kategorie. Nur als schmale Kante oder Punkt einsetzen,
nie als Zahlenfarbe. Ihre Farbtöne liegen absichtlich weg von Blau und Rot.

**Kontrast wird nachgerechnet, nicht geschätzt.** Beim Umstieg musste `--t3`
angepasst werden, weil die hellere Karte den Kontrast sonst unter AA gedrückt
hätte. Aktuell gegen die Karte: Text 5.2–10.3:1, Blau 5.6:1, Rot 5.6:1,
Slate 6.1:1 — alle AA-fest.

**`theme-color` (Meta), `manifest.json` und `--chrome-bg` müssen denselben Wert
tragen.** Drei Literale, eine Farbe. Bei Änderung zusätzlich `CACHE_VERSION`
in `sw.js` erhöhen, sonst liefert der Service Worker das alte Manifest weiter
(Cache-First-Zweig).
