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

## Design-Vorlagen (Nutzer-Wunsch 2026-09-04)

Zehn Vorlagen, umschaltbar in den Einstellungen unter **Appearance**: fünf
helle (**Terminal Pro** = das bisherige Design, Linear Light, Stripe Slate,
Swiss Editorial, Notion Warm) und fünf dunkle (Carbon Dark, Midnight
Terminal, Graphite Dark, Nordic Dark, Solarized Dark).

⚠ **Das bisherige Design ist der Standard und trägt KEIN
`[data-fx-theme]`-Regelwerk** — es steht weiter in `:root`. Ein Gerät mit
einem unbekannten oder gelöschten Wert landet dadurch automatisch dort,
statt ohne eine einzige Farbvariable dazustehen. Wird eine Vorlage entfernt,
muss die Früh-Weiche im `<head>` den alten Wert migrieren; dort steht
dieselbe Liste wie in `FX_THEMES`.

⚠ **Farben mit Bedeutung bleiben Bedeutung.** `--green` ist in **jeder**
Vorlage ein Blau (bullish), `--red` ein Rot (bearish), `--amber`/`--star` ein
entsättigtes Grau (neutral). Angepasst werden nur Helligkeit und Sättigung —
auf dunklem Grund wäre `#C50F1A` kaum lesbar. `check/theme.js` rechnet das
nach: **Farbton-Abstand ≥ 90°** zwischen bullish und bearish, Sättigung des
Neutraltons ≤ 28 %.

⚠ **Bedeutung wird NICHT über den Helligkeitskontrast geprüft.** Blau und Rot
können gleich hell und trotzdem sofort unterscheidbar sein. Der erste Wurf
des Wächters rechnete mit WCAG und erklärte damit das seit Monaten bewährte
Design für kaputt (bullish/bearish 1,02:1) — ein Fehler der Prüfung, nicht
der Farben.

⚠ **Pflicht-Tokens werden STATISCH geprüft**, nicht über `getComputedStyle`.
Ein Regelwerk, das ein Token nicht setzt, erbt es still von `:root`; der
Browser liefert brav einen Wert und die Prüfung sähe nichts. Im
Mutationstest genau so aufgefallen.

Erzeugt werden die Regelwerke von **`tools/fx-themes.mjs`** (`--pruefe` zeigt
die Kontrastwerte). Das ist **kein Build-Schritt** — die App bleibt eine
Datei ohne Werkzeugkette; das Skript ist Nachvollziehbarkeit. Grund für den
Generator: die `-rgb`-Varianten müssen zur Farbe passen, und eine von Hand
abgetippte falsche rgb-Zeile färbt woanders falsch, ohne dass ein
Kontrast-Wächter etwas merkt.

### Chrome- und HUD-Tokens (2026-09-04)
Kopfzeile und Sidebar hatten ihre Farben als Literale verstreut
(`#35456B`, `#2C3A5E`, `#1d2127`) — in einer Vorlage mit hellem Chrome wären
das dunkle Ränder auf hellem Grund. Jetzt: `--chrome-bd` (Trennlinie),
`--chrome-line` (Rand der Bedienelemente), `--chrome-quick`
(Schnellzugriffe), `--on-accent` (Text **auf** einer Akzentfläche — nicht
„weiß", sondern „was darauf lesbar ist"; die dunklen Vorlagen haben helle
Akzente und brauchen dort dunklen Text). Globus und Scan-Anzeige liegen immer
auf dunklem Grund und tragen `--hud` / `--hud-warm` / `--hud-bg0` /
`--hud-bg1`.

### ⚠ Zwei Kontrastmängel im Bestand (2026-09-04 gefunden)
Der neue Wächter fand sie nicht in einer neuen Vorlage, sondern im
**bisherigen Design** — die Angabe weiter unten („alle Textfarben ≥ 4,6:1")
stimmte nicht mehr:

| Token | auf `--bg5` | vorher | jetzt |
|---|---|---|---|
| `--t2` | `#DDE1EC` | `#5A6885` 4,28:1 | `#56637F` **4,60:1** |
| `--accent` | `#DDE1EC` | `#2E8FB0` 2,83:1 | `#2C89A9` **3,05:1** |

Farbton und Charakter bleiben, nur die Helligkeit ist eine Spur
zurückgenommen.

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
Läuft seit 2026-09-04 als `check/theme.js` über **alle** Vorlagen — vorher
war es ein einmaliges Skript, und genau deshalb konnten zwei Werte
unbemerkt unter AA rutschen (siehe oben).
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

## ⚠️ Badge neben schrumpfbarem Text: immer `flex-wrap` + Mindestbreite

Merksatz aus dem Bugreport 2026-09-05 (Details: `docs/CHANGELOG.md`): eine
Flex-Zeile aus **Text + Badge** kippt lautlos, sobald es eng wird.

Das Muster, das den Fehler erzeugt:
- Das Badge hat `white-space:nowrap` (soll ja nicht umbrechen) → seine
  Mindestbreite ist die volle Badge-Breite, es schrumpft **nie**.
- Der Text hat `min-width:0` (damit er ueberhaupt schrumpfen darf) und
  `overflow-wrap:anywhere`/`break-word` (damit lange Namen umbrechen).

Ergebnis: das Badge nimmt sich seinen Platz zuerst, der Text bekommt den
Rest — gemessen 10px von 128px — und bricht dann Zeichen fuer Zeichen um.
Die Zeile wuchs dadurch von 50px auf 360px.

**Regel fuer jede solche Zeile (Indikatorname, Notiztitel, Watchlist-Zeile,
Kartenkopf):**
1. Container `flex-wrap:wrap`, damit das Badge notfalls in die naechste
   Zeile rutscht, statt dem Text den Platz zu nehmen.
2. Text `min-width` in `em` (nicht `0`), gross genug fuer ein paar Zeichen
   und klein genug, dass er die schmalste Spaltenstufe nicht aufzieht.
3. Badge `flex-shrink:0` **plus** `max-width:100%` mit Ellipsis — es gibt
   nichts mehr ab, sprengt aber auch nichts, wenn die Spalte einmal
   schmaler ist als das Badge selbst.

Gegenprobe beim Testen: Badge in JEDE Zeile setzen und bei 390/430/520/820px
messen (`scrollWidth` vs `clientWidth` von Tabelle UND Karte, hoechste
Zeilenhoehe) — ein einzelner Screenshot in Standardbreite zeigt den Fehler
nicht, weil dort genug Platz ist.

## Chart-Cursor (`chartHoverWrap`/`attachChartHovers`) — ein Muster für alle Diagramme

Regel seit 2026-09-05 (Nutzer-Wunsch): **Solange der Zeiger im Diagramm ist,
ist IMMER der nächstgelegene Datenpunkt ausgewählt** — kein Ausblenden am
linken/rechten Rand (`fx` wird auf 0…1 geklemmt), und `mouseenter` zeigt ihn
schon beim Betreten. Die graue Führungslinie läuft **vom gewählten Punkt
senkrecht bis zum Boden** des Diagramms, nicht über die volle Höhe: `top` und
`height` werden im JS gesetzt (`bot = Höhe − 22`, die 22 px sind die
Datumsbeschriftung), sie gewinnen gegen das `bottom` in `.chv-line`.

Jedes neue Diagramm nutzt `chartHoverWrap(svg, pts)` + `attachChartHovers(el)`
statt eigener Hover-Logik. Stehen **mehrere Diagramme nebeneinander, die
denselben Zeitraum zeigen** (Insights > Data, bis zu 4 Panels), bekommen sie
über den vierten Parameter dieselbe Gruppe (`chartHoverWrap(svg,pts,null,'data')`
→ `data-chv-group`): alle zeigen dann denselben Zeitpunkt. Vier Charts mit vier
unabhängigen Cursorn kann man nicht vergleichen — genau dafür stehen sie da.

## Wert-Labels in Diagrammen: über ALLEM, was in derselben Spalte liegt

Regel seit 2026-09-05: Ein Zahlenlabel wird nie nur relativ zu *einer* Ebene
positioniert. Trägt ein Chart mehrere Ebenen an derselben x-Position (Balken =
Actual **und** Forecast-Punkt/-Linie darüber), steht die Zahl über dem
**höheren von beidem** — `Math.min(barTop, forecastTop) - 5`, geklemmt auf den
oberen Rand der viewBox. Zusätzlich ein Halo in Kartenfarbe
(`paint-order:stroke; stroke:var(--bg1); stroke-width:3`), weil eine
Verbindungslinie zwischen zwei Punkten auch dann schräg durch ein Label laufen
kann, wenn beide Endpunkte tiefer liegen.

Ein Radius/Abstand, der an zwei Stellen gebraucht wird (Punktgröße beim
Zeichnen, Punktgröße bei der Label-Position), gehört in **eine** Variable —
zwei Literale laufen beim nächsten Anfassen auseinander.

## Ein globaler Zurück-Button gehört in den Seitenfluss, nicht darüber

Regel seit 2026-09-05 (Nutzer-Wunsch: *„er muss sich ins Menü einfügen und darf
nichts verdecken"*): Die Zurück-Leiste (`#resBackBar`) wird von `showTab()` als
erstes Kind in die gerade sichtbare Seite gehängt und steht dort oben rechts
unter der Kopfleiste. Sie schiebt den Inhalt herunter und scrollt mit, statt
als `position:fixed`-Pille darüber zu schweben. Optik: getönter Button des
Design-Systems (`rgba(var(--red-rgb),.08)` auf `.3`-Rand), keine Vollton-Pille.

⚠ Nicht in Flex-Row-Seiten einhängen (`'cur'` = Sidebar + Detail) — eine Leiste
als Flex-Kind reißt die Spalten auseinander.

## Mehrfachauswahl: Popup mit Chips, nie ein `<select>`

Soll der Nutzer in EINEM Zug mehrere Dinge wählen, ist ein `<select>` das
falsche Bauteil — es schließt nach jeder einzelnen Auswahl. Muster stattdessen
(`.data-picker` im Data-Tab): Button mit Zähler `n/max` → Popup am `<body>`
(`position:fixed`, weil Kartencontainer `overflow` haben), Chips in derselben
Gruppierung wie jeder andere Asset-Filter, **jeder Klick wird sofort
übernommen**, restliche Chips werden beim Maximum `disabled`, und das Popup
schließt bei Erreichen des Maximums oder per `pointerdown`-Capture-Listener
außerhalb — der erst im nächsten Tick registriert wird, sonst schließt der
öffnende Klick es selbst wieder.
