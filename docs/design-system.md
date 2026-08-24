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

## Design-System (Nutzer-Vorgabe 2026-08-23) — verbindlich

Hell, nach einer vom Nutzer geschickten Vorlage. **Farben, Abstände und Radien
werden nicht frei erfunden** — immer diese Werte verwenden.

### Flächen
| Rolle | Wert | Token |
|---|---|---|
| Seite | `#E9EAF6` | `--bg0` |
| Karte | `#FFFFFF` | `--bg2` |
| Fläche in der Karte | `#F2F3F9` | `--bg1` / `--bg3` |
| Hover | `#EAECF4` | `--bg4` |
| Auswahl / Betonung | `#DDE1EC` | `--bg5` |
| Kopfzeile + Nav-Sidebar | `#212C49` | `--chrome-bg` |
| Schnellzugriffe | `#2C3A5E` | fest in `.asec-link` |

Kopfzeile und Sidebar bleiben **dunkel**, während der Inhalt hell ist
(Nutzer-Entscheid). Die Schnellzugriffe sind dunkelblau, aber eine Spur
heller als Kopfzeile/Sidebar.

⚠ **In `.hdr` und `#navSidebar` werden die Textstufen umgedreht.** Dort MUSS
`color` explizit gesetzt werden: geerbt wird der *berechnete* Wert von `body`
(dunkel auf hell), nicht die var-Referenz — sonst steht dunkler Text auf
dunklem Grund.

### Text und Semantik
`--t0` `#141B2E` · `--t1` `#33405C` · `--t2` `#5A6885` · `--t3` `#57637B`
Bullish `#25619D` · Bearish `#B33633` · Neutral `#55617A` ·
Live `#D93A34` · Success `#137036` · Akzent `--accent` `#2E8FB0`.

### Kontrast wird nachgerechnet, nicht geschätzt
**Gegen die dunkelste helle Fläche (`--bg5`) prüfen, nicht nur gegen Weiß.**
Beim Umstieg fielen sonst Blau (4,27:1), Rot (3,89:1), Neutral (4,38:1) und
Success (4,20:1) durch — auf Weiß hatten alle vier bestanden. Aktuell liegen
alle Textfarben bei ≥ 4,6:1 gegen jede Fläche.

Prüfung: `scan_contrast.mjs` läuft über alle 16 Tabs und meldet jeden
Blattknoten mit Text unter AA gegen seinen *tatsächlichen* Hintergrund.

### Farbliterale im Code
Ein Palettenwechsel über die Tokens erfasst **nicht** die fest eingetragenen
Hex-Werte (SVG-Verläufe, `cotColor`, `bRC`, Balkenbeschriftungen). Beim
letzten Wechsel waren das 43 Stellen. Immer mitsuchen.

Besonders heikel: Beschriftung **in** gefüllten Balken. Im dunklen Design
waren die Balken hell und trugen dunklen Text; hell ist es umgekehrt.

### Abstände, Karten, Typografie
4px-Raster (4/8/12/16/20/24/32). `--gap-block` **14px**, Kartenpolster
**16px**, keine großen Leerflächen.
Radius `--r` **12px**, kleine Bedienelemente `--rs` **8px** / `--rss` **6px**,
1px Rand, keine schweren Schatten (`0 1px 3px rgba(20,27,46,.09)`).
Seitentitel 28–32px · Widget-Titel 16–18px · Hauptkennzahlen 24–32px ·
Fließtext 13–14px · Beschriftungen 11–12px · Zeilenhöhe ~1.4 ·
Finanzwerte mit `tabular-nums`.

### Kategorie-Akzente
`--a-infl` `#B5791C` · `--a-rate` `#7250B8` · `--a-lab` `#1A8477` ·
`--a-grow` `#BE6320` · `--a-cot` `#1F7F9E` · `--a-risk` `#A94578` —
nur als schmale Kante oder Punkt, nie als Zahlenfarbe.

### Drei Literale, eine Farbe
`theme-color` (Meta), `manifest.json` und `--chrome-bg` müssen denselben Wert
tragen. Bei Änderung zusätzlich `CACHE_VERSION` in `sw.js` erhöhen, sonst
liefert der Service Worker das alte Manifest weiter (Cache-First-Zweig).

### Kopfzeile: tiefes Blau als EINE Akzentfarbe (Nutzer-Wunsch 2026-08-23)

FX-Logo, Profil-Kreis (immer, nicht nur mit Sync-Initialen) und die aktive
Tab-/Asset-Markierung in der Navigationsleiste tragen alle `var(--blue)`
(`#0B5FCC`) — bewusst **eine** Variable, nicht drei separate Literale.

⚠ Kehrt eine frühere, dokumentierte Entscheidung um: die Auswahl-Markierung
in `.hdr`/`#navSidebar` war absichtlich **Cyan** (`--accent`), nicht Blau,
damit sie nicht mit der bullish-Bias-Farbe kollidiert (Blau ist sonst
überall die Farbe für „bullish"). Der Nutzer wollte das jetzt ausdrücklich
so — Wert selbst gesetzt, nicht spekuliert. Umgesetzt über eine **gescopte**
Variable, nicht durch Ändern von `BC` oder `--blue` selbst:

```css
.hdr,#navSidebar{ --accent:var(--blue); /* … */ }
```

Das trifft **nur** `.np.on` (aktiver Tab) und `#navSidebar .ab.np-asset.on`
(aktive Asset-Zeile im Stapel) — beides referenziert `var(--accent)` und
liegt innerhalb dieser beiden Container. Bias-Farben im **Inhalt** (Karten,
Score-Zahlen, Actual-Werte) bleiben unberührt: die laufen über `BC`/root
`--accent`, nicht über diese gescopte Variable.

**Kontrast bewusst niedriger als sonst gefordert:** `#0B5FCC` auf dem
Header-Grund `#2A3757` liegt nur bei ~2:1 (gegen die hellere Hover-Fläche
`--bg4` sogar ~1,6:1) — deutlich unter der AA-Regel weiter oben in diesem
Dokument. Das ist hier **kein Fehler**: eine Auswahl-Markierung ist kein
Fließtext, die AA-Kontrastregel gilt für Text gegen seinen Hintergrund. Der
Effekt kommt aus dem Sättigungs-/Farbton-Unterschied (kräftiges Sattblau auf
gedecktem Blaugrau), nicht aus Helligkeitskontrast — geprüft per Screenshot,
nicht nur per Zahl.

Suchleiste + Status-Cluster, gleicher Anlass: `.hdr-search` ist jetzt fest
`320px` (vorher `flex:1;max-width:480px` — wuchs auf den gesamten freien
Platz). `.hdr-status` (Saved/Offline/LIVE/VERSION-CHECK) bekam `flex:1` +
`justify-content:center` und zentriert sich dadurch im so frei gewordenen
Platz. Bleibt ein echtes Flex-Kind im normalen Fluss — **keine** absolute
Positionierung, das führte früher auf schmalen Screens zu Überlappungen mit
Undo/Redo bzw. dem Alarm-Zähler.
