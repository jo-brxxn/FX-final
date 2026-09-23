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
`--fs-hero` 30 · `--fs-xl` **24** · `--fs-lg` 17 · `--fs-md` 15 (KARTENTITEL) ·
`--fs-base` 13 · `--fs-sm` 12 · `--fs-xs` 11 · `--fs-2xs` 10.

⚠ **Korrigiert am 2026-09-16:** hier stand `--fs-xl` 22 — im Code ist der
Token aber `24px`. Die Doku nannte damit eine Stufe, die es nicht gibt. 22px
existiert tatsächlich, aber als **harter Wert an zwei Stellen** (Seitenkopf
von Trends, und `.rub-inp/.nc-inp/.pcc-name` in einer Media Query), nicht als
Token — in `check/typo.js` entsprechend als benannte Ausnahme geführt.

⚠ **Achtung, `.ab-cards` bildet die ganze Skala kleiner ab**
(`--fs-hero:24 · --fs-xl:17 · --fs-lg:15 · --fs-md:13 · --fs-base:12 ·
--fs-sm:11 · --fs-xs:10`). Ein `var(--fs-md)` bedeutet dort also 13px, nicht
15px. Wer eine Karte AUSSERHALB der Asset-Seite baut, bekommt die globale
Skala — beim Kopieren einer Regel aus dem Asset-Bereich ändert sich damit
still die Größe.

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

## ⚠️ Karten-Farbe: sie folgt dem BIAS, nie einer anderen Größe (seit 2026-09-16)

Anlass: auf der Gold-Seite stand „2Y Bond Yield 4.67 %" in **blau** (bullish),
während dieselbe Zeile `bias: bear` trug und **−0,5** auf den Score gab.
Ursache war ein Feld mit **zwei Bedeutungen**: `bondColor` hielt die
*Richtung* der Rendite (steigt/fällt), wurde aber als *Bewertung* eingefärbt.
Bei Währungen fallen beide zusammen, bei Gold/Öl/Indizes nicht.

**Dauerregel:** was farblich eine Aussage macht (bullish/bearish/neutral),
wird aus dem **Bias der Zeile** abgeleitet — nicht aus der Rohrichtung, nicht
aus dem Vorzeichen einer Veränderung, nicht aus einem zweiten Feld. Wo eine
Richtung *zusätzlich* gezeigt wird (der Erklärtext im Info-Fenster), ist sie
ausdrücklich als Richtung beschriftet und die Score-Wirkung kommt aus
`indScore()`.

⚠ Gilt genauso für erklärende Texte: das Info-Fenster behauptete
„counting +0.5" aus der Richtung, wo −0,5 galt.

## ⚠️ Datum: immer mit Jahr, immer zweistellig — und es gibt VIER Formatierer

Nutzer-Regel, **zweimal** gesetzt (2026-09-05 und 2026-09-17, wörtlich:
*„bei allen grafiken oder tabellen oder überall wo datums stehen will ich das
dort auch die jahreszahl steht aber nicht zb 2026 sonder 26"*).

Der Grund, dass sie zweimal kommen musste: sie stand ab dem 05.09. als
Kommentar in `js/calendar.js` — und war am 17.09. an **13 Stellen** unterlaufen.
8× fehlte das Jahr ganz (Kerzen-Hover, zwei Chart-Achsen, Zinspfad-Kacheln),
5× stand es vierstellig da (Sicherungen, Papierkorb, Cloud-Status, drei
„updated"-Zeilen) — durchweg über `toLocaleString()` **ohne Optionen**, also
genau die Aufrufform, die man beim Schreiben nicht als Datumsformat wahrnimmt.

Deshalb gibt es jetzt genau **vier** Formatierer in `js/calendar.js`, und keine
weiteren `toLocaleDateString`-Aufrufe mit Datumsanteil:

| Formatierer | Ausgabe | wofür |
|---|---|---|
| `fmtDayHdr(d[,utc])` | `Wed, Mar 4, 26` | Tagesköpfe, Tooltips, Tageszeilen |
| `fmtDayShort(d[,utc])` | `Mar 4, 26` | Chart-Achsen, Tabellenzellen |
| `fmtMonShort(d[,utc])` | `Mar '26` | Achsen über ~400 Tage |
| `fmtStamp(ts)` | `Mar 4, 26, 15:07` | Sicherungen, Cloud-Status, „updated" |

**⚠ `fmtMonShort` setzt den Apostroph**, und das ist kein Schmuck: ohne ihn
bringt die Monatsform die Verwechslung durch die Hintertür zurück — auf der
Zinspfad-Achse des Backtesters stand `May 13` für den **Mai 2013** und war vom
**13. Mai** nicht zu unterscheiden. Genau diese Verwechslung ist der
ursprüngliche Anlass der Regel.

**Ausgenommen sind Fremdtexte.** Nachrichten-Überschriften kommen von
Marketaux („Gold price today, Thursday, September 17, 2026: …"). Ein zitiertes
Datum umzuschreiben wäre eine Fälschung der Quelle — die Regel gilt für
Datumsangaben, die die App **setzt**.

Wer ein Datum anders formatieren muss, setzt `// datum-ok: <warum>` dazu und
schreibt hin, woher das Jahr sonst kommt (z. B. `fmtDate()` in `js/score.js`
gibt es als eigenes Feld `yr` zurück, weil die Achse Tag, Monat und Jahr
getrennt setzt). Erzwungen von **`check/datum.js`** in drei Stufen: statisch
über alle Quellen, die Ausgabe der vier Formatierer, und der sichtbare Text
auf 17 Seiten inklusive SVG-Achsen.

## ⚠️ Beschriftung gehört NICHT in ein gestrecktes SVG

Nutzer-Bugreport 2026-09-18 mit Bildschirmfoto: *„guck mal die Zahlen die sind
so breit"*.

`preserveAspectRatio="none"` streckt ein SVG auf die Containerbreite — und
damit **alles** darin: Kurven, Balken, **Schrift und Kreise**. Für die Kurve
ist das genau richtig (sie soll die Breite füllen), für Buchstaben nicht.

Gemessen (Streckfaktor = Breite/viewBox-Breite ÷ Höhe/viewBox-Höhe):

| Chart | viewBox | gerendert | Faktor |
|---|---|---|---|
| Historie, Score-Linie | 434 × 182 | 1374 × 182 | **3,17×** |
| Backtester, Zinspfad | 1670 × 168 | 1399 × 168 | 0,84× |
| Seasonality-Balken | 880 × 260 | 1256 × 260 | 1,43× |

12 weitere SVGs mit Text waren unverzerrt, die 14 gestreckten **ohne** Text
unproblematisch — betroffen ist genau die Kombination aus beidem.

**Der Ausweg ist nicht, das Strecken zu lassen** (dann füllt der Chart die
Breite nicht), sondern die Beschriftung als **HTML über das SVG** zu legen:
`chartAchsenHtml(yL, xL, opt)` und `chartPunkteHtml(pkte)` in `js/main.js`.
Beide positionieren prozentual, wandern also beim Strecken mit der Kurve mit
und behalten trotzdem ihre Größe. Dasselbe Muster benutzen die Preis-Kacheln
seit jeher (`.ab-chart` + `.ab-xax`) — es ist hier nur verallgemeinert.

⚠ Zwei Fallen dabei, beide gemessen:
- **Die y-Beschriftung braucht einen Streifen fester Breite**, keine Position.
  Als Position mit `translateX(-100%)` ragte sie in der schmalen Karte der
  Asset-Seite links aus dem Container und wurde von dessen `overflow:hidden`
  abgeschnitten — aus `+4.9` wurde `4.9`.
- **Kreise werden zu Ellipsen.** Die Klickpunkte der Score-Linie waren
  sichtbar eiförmig. Sie liegen deshalb ebenfalls als HTML darüber; als echte
  Knöpfe ist ihr Klickbereich sogar größer als ein 3-px-Kreis.

Erzwungen von `check/html.js` Stufe 3, mit Gegenprobe.

## ⚠️ Score-Vorzeichen ist eine BIAS-Aussage, keine Kerzen-Aussage

`--cndl-up` / `--cndl-dn` gelten für die Richtung eines **Tages** (siehe
Kerzen-Regel 3 weiter unten). Die Score-Linie der Historie liegt über oder
unter Null, und das ist eine Aussage über das **Asset** — also `BC.bull`
(blau) darüber, `BC.bear` (rot) darunter, nicht die Kerzen-Tokens.

**⚠ Der Farbwechsel gehört an die Nulllinie, nicht an den nächsten
Datenpunkt.** Umgesetzt mit zwei Kopien derselben Polyline, je eine an der
Nulllinie beschnitten (`clipPath`). Ohne das springt die Farbe erst beim
nächsten aufgezeichneten Tag um, und ein Nulldurchgang am Dienstag sieht aus
wie einer am Mittwoch.

**⚠ Eine Lücke unterbricht die Linie.** Ein Tag ohne aufgezeichneten Score
wird nicht überbrückt — eine durchgezogene Gerade darüber behauptet Werte, die
nie aufgezeichnet wurden (Regel 4). Dieselbe Überlegung trägt die Treppenkurve
des Zinspfads: ein Leitzins springt an der Sitzung und liegt dazwischen fest,
eine schräge Verbindung behauptete Zwischenwerte.

Beides erzwungen von `check/historie.js` (A) und `check/backtester.js` (F),
beide mit Gegenprobe.

## ⚠️ Zahlen-Genauigkeit: die Quelle bestimmt sie NICHT (seit 2026-09-16)

`fmtYield()` machte `toFixed(3)` und schnitt dann die Nullen ab — je nach Wert
**eine bis drei** Stellen. In einer Spalte stand dadurch `4.67 %` neben
`5.0 %`, und in „Previous" (das ist die SMA21, ein Mittelwert) drei Stellen.

**Dauerregel:** eine Spalte hat **eine** feste Anzahl Dezimalstellen. Renditen
zwei (Marktnotation). Wer eine Quelle anzapft, formatiert am Rand — nie „so
genau, wie es gerade kommt". Dieselbe Klasse wie das Gleitkomma-Rauschen in
`price_data.json` (2026-09-14), nur in der Anzeige statt in der Datei.

## „Go to <Kategorie>" unten rechts in jeder Karte (seit 2026-09-16)

Nutzer-Wunsch: *„füg bei den karten unten rechts in klein hinzu go to und
dann der name und dann öffnet sich die kategorie und man hat das back
zeichen."*

- **Ein Baustein:** `abGoToHtml(ziel[,stopp])`. Das Ziel wird **übergeben**,
  nicht aus dem Kartentitel abgeleitet — sonst verliert ein Umbenennen den
  Knopf still.
- **Navigation nicht nachbauen:** `assetQuickGo(tab)` setzt Filter,
  Zurück-Pille und Seite. Ein zweiter Weg wäre dieselbe Größe in zwei Kopien.
- `stopp` (stopPropagation) für Karten, die selbst einen `onclick` tragen —
  die Kalenderkarte öffnet als Ganze ein Fenster.
- **Lage:** `margin-top:auto` am Kartenfuß. ⚠ Das setzt eine **Flex-Spalte**
  voraus. In den Makro-Karten (`display:block`) saß der Knopf dadurch 1 px,
  95 px und 102 px über dem Boden — drei Höhen in einer Reihe, weil die Karten
  von ihrer Zeile auf gleiche Höhe gestreckt werden.
- Geprüft von `check/kartenlook.js` (genau einer je Karte, Lage, gültiges
  Ziel, echter Klick mit Zurück-Pille).

## ⓘ neben dem Kartennamen — Erklärungen stehen NIE im Kartenkörper (seit 2026-09-18)

Nutzer-Regel, wörtlich: *„Auf der Karte steht eine Erklärung unten die nimmt
viel Platz mach die Erklärung so das man sie sieht wenn man auf ein i mit
einem Kreis herum drückt das steht neben dem Namen. Leg das auch als Regel
fest und setz das überall um die Erklärung öffnet sich dann zentriert als
Fenster und muss übersichtlich sein."*

**Gilt für jede neue Karte, ohne Rückfrage.** Ein Erklärabsatz am Kartenfuß
ist ab jetzt ein Fehler, kein Stilmittel.

- **Ein Baustein:** `abTile(titel,zusatz,inhalt,extra,ziel,erkl)` bzw.
  `abTileZ(ziel,titel,zusatz,inhalt,extra,erkl)`. `erkl` ist ein String oder
  ein **Array von Absätzen** — ein Absatz je Gedanke, das ist das
  „übersichtlich". Karten mit eigenem Kopf (History, Kalender, Dashboard)
  rufen `abInfoBtn(titel,erkl[,klasse])` direkt auf.
- **Der Text wird am Titel verschlüsselt** (`abInfoKey`), nicht hochgezählt:
  Karten werden bei jeder Änderung neu gebaut, ein Zähler würde bei jedem
  Rendern neue Einträge anlegen und die alten als Müll stehen lassen.
- **Dynamischer Text** (Jahre, Anzahl Reports, Feed-Zeitraum) gehört genauso
  hinter das ⓘ — die Erklärung wird bei jedem Rendern neu registriert.
- **Was NICHT hinter das ⓘ gehört:** Zustandsaussagen. „Nothing pinned yet",
  „Showing the majors", der Hinweis welcher Filter gerade greift — das sagt,
  was *gerade* gilt, und ist keine Erklärung. Faustregel: ändert sich der Satz
  mit den Daten, ist er Inhalt; erklärt er, wie man die Karte liest, ist er
  Erklärung.
  ⚠ Diese Trennung ist beim ersten Anlauf schiefgegangen und wurde gefangen:
  die Kalenderkarte trug unten *„Covers 15. Sep – 28. Sep. Dimmed days are not
  published yet."* — ein Satz, zwei Sorten. Der **Zeitraum** ändert sich
  täglich, ist also Inhalt und bleibt auf der Karte (`.abc-foot.abc-range`);
  nur der erklärende Teil ist gewandert. `check/display.js` verlangt den
  Zeitraum ausdrücklich, weil ein leerer Tag ohne ihn wie „nichts los"
  aussieht statt wie „weiß noch niemand" — und hat den Rückbau prompt rot
  gemeldet.
- **stopPropagation ist Pflicht** — manche Karten tragen selbst einen
  `onclick` (die Kalenderkarte öffnet das volle Fenster). `abInfoBtn` setzt es.
- **Das Fenster:** `#mCardInfo`, Klasse `.modal.ci-modal`, 540 px statt der
  720 px Standardbreite. ⚠ `.modal.ci-modal` schreiben, nicht `.ci-modal` —
  bei gleicher Spezifität gewinnt sonst die weiter unten stehende
  `.modal`-Regel (gemessen: 720 px statt 540 px; dieselbe Falle ist bei
  `.modal.acm-modal` schon einmal dokumentiert).
- ⚠ **`mInfo`/`mInfoTitle` sind vergeben** — sie gehören dem
  Indikator-Info-Fenster (`openInfoM`). Die erste Fassung hat die id ein
  zweites Mal vergeben; `getElementById` liefert dann das zuerst im Dokument
  stehende, und die Indikator-Erklärungen wären stumm geworden.
- Es gibt **drei** Erklärwege mit demselben ⓘ: `openCardInfo` (Karten),
  `openInfoM` (Indikatoren), `openSentInfoM` (Sentiment). Alle drei öffnen ein
  zentriertes `.ov`-Fenster. Ein `alert()` erfüllt die Regel **nicht** — das
  Dashboard hatte genau das und wurde umgestellt.
- Geprüft von `check/erklaerung.js`: die abgeschafften Klassen (`ab-note`,
  `abc-foot`, `histp-modelnote`) dürfen weder im Code noch im DOM vorkommen,
  und **jedes** ⓘ wird angeklickt — es muss genau ein zentriertes Fenster mit
  Text öffnen.

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
  (gilt wieder seit dem Bild-Design 2026-09-22 - die Navy-Köpfe von
  VERSION-CHECK-538 hatten es für einen halben Tag aufgehoben)
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
| Kopfzeile + Nav-Sidebar | `#0D1B2F` (seit 2026-09-22, vorher `#212C49`) | `--chrome-bg` |
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
Bullish `#25619D` · Bearish `#B33633` (⚠ überholt: seit 2026-09-23 `#DC2430`) · Neutral `#55617A` ·
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

## ⚠️ BILD-DESIGN: die gültige Optik seit 2026-09-22 (VERSION-CHECK-539)

Nutzer mit einem Bild als Vorlage: *„Ich will das du die Webseite von Farben
Aufteilung Formen usw so baust. Jedes Detail so … es geht nur um Aussehen keine
Funktion das bleibt alles erhalten"*. Per Rückfrage festgelegt (alles „ganze
App"):

| Baustein | Regel |
|---|---|
| Seite | getönter Grund `--bg0` `#E9F0F8` |
| Karte | fast weiß `--card` `#F8FAFD`, 1-px-Rand `--bd` `#DBE5F3`, Radius `--r` 14 px |
| Kartenkopf | **Symbol + Titel** (`abTileIcon()`), kein eigener Hintergrund, keine Linie; Titel `--fs-md` 700 |
| Zeitraum-Umschalter & neutrale Chips | hellgrau `--ctl-bg`, **aktiv = `--ui-act` gefüllt, weiße Schrift** |
| Knöpfe/Dropdowns zweiter Ebene | Kartenfläche mit feinem Rand (wie „Aging" im Bild) |
| Kopfzeile + Leiste | `--chrome-bg`/`--rail-bg` `#0D1B2F`, Kante `--rail-edge`, aktive Kachel `--rail-on` `#0B3C74` |
| Schrift | **Zahlen in derselben Sans** (`--ff-num: var(--ff-text)`), gleich breite Ziffern über `tabular-nums` |
| Asset-Kopf | eigene Karte `.ahead`; Motiv je Gruppe rechts hinter den Tabs (siehe unten) |
| Asset-Kopfreihe | **2×2** (Price / Calendar, Pinned notes / History), globale Schriftskala |

Alle Werte am **Bildpixel gemessen**, nicht geschätzt. ⚠ Das Blau aus dem Bild
(`#0C75FD`) hält mit weißer Schrift nur 4,2:1 — `--ui-act` ist `#0B6BEA`
(4,8:1), sichtbar gleich.

**Bedeutung bleibt Bedeutung:** Chips mit Bedeutungsfarbe (bull/bear-Segmente,
Non-FX lila, Zinsschritte) bekommen den neutralen Aktivzustand NICHT. Bias-
Werte im Kartenkopf (Score-Abzeichen, Preisänderung) stehen auf einer
getönten Insel ihrer eigenen Farbe.

**Bewusst NICHT aus dem Bild übernommen:**
- der dauerhafte Unterstrich unter „Price chart": die vier Tabs öffnen
  Fenster, einen aktiven Tab gibt es nicht. Unterstrich bei Hover/Fokus.
- das Sonnen-Symbol am Schalter: der Schalter ist die Kompaktansicht, kein
  Hell/Dunkel — ein Sonnen-Symbol würde etwas Falsches versprechen.
- die Reihen-Überschrift „Overview" ist ausgeblendet (im Bild nicht vorhanden,
  der Asset-Kopf ist jetzt selbst der Anfang); „Macro" bleibt.

### Motive im Asset-Kopf (`assetMotivHtml`)
Vorher schon einmal da (2026-09-14) und am selben Tag entfernt. Diesmal
ausdrücklich gewünscht: **je Gruppe** — FX die große Flagge der Währung
(`assetIconHtml(id,340)`, weht wie die kleine), Crypto ₿-Münze, Metalle Barren,
Energie Ölfass, Indizes/Aktien/Renditen Bulle & Bär. Selbst gezeichnete SVGs in
den Blautönen der Berge aus dem Bild (`MOTIV_F1..3`, `MOTIV_ST`), „nicht zu
blass", **rechts hinter den Tabs** (Nutzerwahl, trotz der Ablehnung von Schrift
auf Textur 2026-09-04). Nach links ausgeblendet per Maske.
⚠ Beim Bau zweimal gemessen korrigiert: die Motive skalierten auf die BREITE
(wurden höher als der Kopf) — jetzt auf die Höhe; die Flagge war 225 px breit
und stand als harter Block da — jetzt 510 px, die Maske greift.

### Flaggen (seit 2026-09-23): ein Stück, Welle nur am Umriss
Nie wieder zerschneiden: Streifen, die einzeln bewegt werden, reißen Lücken
auf. Bewegt werden nur der gemeinsame Umriss `#aiWave` (SMIL) und der
Faltenverlauf `#aiFoldG`; Glanz/Falten liegen IN der Welle; `.ai-rim` als Rand;
Weiß in Flaggen = `AI_FLAG_WHITE`. Geprüft von `check/symbole.js`.

### Wisch-Übergang und Kartensymbole (seit 2026-09-23)
Jeder Seitenwechsel wischt (1,0 s seit dem Nachtrag 2026-09-23, vorher 0,5 s; Bild = Flagge/Motiv/Szene), Fenster nicht.
Alle Einblendungen beim Wechsel (Seite, Asset-Inhalt, Dashboard-Karten, Datenbalken, Trend-Linien, Listen) laufen `var(--enter-dur)` = 1 s wie der Wisch; `anim-enter` bleibt 1,3 s. Ausnahme per Nutzerwahl: das Stapel-Panel (0,18 s).
⚠ Der Wisch klont KEIN DOM und zeigt KEINE leere Fläche: die alte Seite selbst (Originalknoten an ihrem Platz, volles CSS) bleibt 1 s obenauf und wird an der Bildmitte weggeschnitten. Geklonte Seiten verlieren außerhalb ihrer Vorfahren das CSS (543 → 544), ein Vorhang in Seitenfarbe sah aus wie ein weißer Hänger.
⚠ Die FX-Flagge im Wisch ist ein eigenständiges `<img>` (SVG-Daten-URL mit kopierten Defs, `wischFlaggeHtml`) — als Inline-SVG mit Verweisen in die geteilten Defs, Mischmodus und Seiten-CSS in einer bewegten Ebene zeichnete Safari/iPad sie nicht (545).
⚠ Flaggen: Sterne sind Sterne (`aiStars`), nie Punkte — auch klein. Die Kopf-Flagge ist ein STATISCHES breites Band (`flaggenBandHtml`): Flagge unverzerrt rechts, eine Randspalte nach links gezogen (USD: rechte Spalte), Maske lässt es in die Kartenfarbe auslaufen. Keine Welle/kein Glanz oben rechts, auch nicht im Wisch (546). Der Flaggenrand (`#aiRim`) trägt `vector-effect` am Defs-Pfad, sonst wächst er mit der Flagge.
Jeder Kartenkopf trägt genau EIN Symbol aus `ICONS`, zugeordnet über
`KARTEN_ICONS` — bei einer neuen Karte ggf. dort eine Regel ergänzen, sonst
bekommt sie das neutrale `layers`. Keine Emojis in Reitern/Titeln.

### Vorlagen
Die neuen Tokens (`--ctl-*`, `--ui-act*`, `--rail-*`) stehen in JEDEM
Vorlagen-Block; die dunklen nehmen `--accent` als Aktivfarbe. Die Formen gelten
überall, die Farben kommen aus der Vorlage.

### Die Navy-Köpfe von VERSION-CHECK-538 sind zurückgebaut
Am selben Tag davor gebaut (dunkle Kartenköpfe/Umschalter, `--frame-*`,
`tools/fx-themes.mjs --rahmen`), durch das Bild abgelöst — Nutzerwahl „wie im
Bild". Der Wächter `check/rahmen.js` bleibt: er prüft weiter jeden Text in
Kartenkopf und Bedienelement gegen seinen echten Hintergrund.

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

## ⚠️ Schriftgrößen kommen aus der Skala — nirgends eine freie Zahl

Regel seit 2026-09-05 (Nutzer-Wunsch: *„mach alles in einem schicken Design mit
richtiger Schriften hierachie usw. Kontrolliere das auch nochmal bei den
letzten Änderungen und im Rest der Webseite und halte das als Regel fest"*).

Es gibt **eine** Skala, sie steht als Token in `index.html`:

| Token | Größe | Wofür |
|---|---|---|
| `--fs-hero` | 30px | Hero-Zahl einer Karte (Score, Kurs) |
| `--fs-xl` | 24px | Seitentitel |
| `--fs-lg` | 17px | Abschnittstitel |
| `--fs-md` | 15px | Kartentitel |
| `--fs-base` | 13px | Fließtext |
| `--fs-sm` | 12px | Buttons, dichte Tabellenzeilen |
| `--fs-xs` | 11px | Sekundärtext in Karten |
| `--fs-2xs` | 10px | Label, Meta, Achsenbeschriftung |

**Fünf Rollen, jede mit fester Kombination** — daran hängt die Hierarchie, nicht
an der Größe allein:

1. **Titel** — `--fs-md`/`--fs-lg`, `font-weight:700`, `var(--t0)`.
2. **Label** (Spalten-/Gruppenüberschrift) — `--fs-2xs`, `700`,
   `text-transform:uppercase`, `letter-spacing:.7px`, `var(--t2)`.
3. **Body** — `--fs-base`/`--fs-xs`, `400–500`, `var(--t1)`.
4. **Zahl** (die Aussage der Karte) — eine Stufe größer als der Body, `800`,
   `var(--ff-num)`, Bedeutungsfarbe.
5. **Meta** (Forecast/Previous, Quelle, Zeitstempel) — `--fs-2xs`, `400`,
   `var(--t3)`.

Praktisch heißt das: `font: <weight> var(--fs-x)/<line-height> var(--ff-*)` als
**eine** Kurzschreibweise statt verstreuter `font-size`/`font-weight`-Zeilen.
Ein `font-size:12.5px` oder `font-size:10.5px` ist immer ein Fehler — es gibt
keine Zwischenstufe, und wer eine erfindet, bricht die Hierarchie für alle
danebenliegenden Elemente.

**Bei jeder Änderung mitprüfen**, nicht nur beim neuen Baustein: die Zeile
daneben, die Karte darüber. Beim Preischart-Umbau (2026-09-05) sind dabei vier
Altlasten aus den Änderungen der Vortage aufgefallen und mitkorrigiert worden
(Zurück-Pille 12.5px, Popup-Fußzeile 10.5px, Popup-Kopf und die Unterzeile der
Data-Kopfkarte mit freien px-Werten).

## `--due`: eigener Ton für „Termin steht bevor" (seit 2026-09-06)

`--amber` ist in diesem Design **kein Orange**, sondern ein neutrales
Schiefergrau (`#55617A`) — die gelbliche Neutralfarbe wurde am 2026-08-21
ersetzt, und `check/theme.js` erzwingt darauf eine Sättigung ≤ 28 %. Wer
Orange braucht, darf `--amber` deshalb **nicht** umbiegen.

Dafür gibt es `--due` (hell `#B45309`, dunkel `#F0913A`, je Vorlage nach der
Helligkeit ihres `--bg2`). Verwendung: ein bevorstehender Termin, heute die
Next-Spalte und die Next-Angabe über den Vergleichs-Charts ab
`IND_NEXT_SOON_D`=7 Tagen.

**Nicht** für Bedeutung im Score-Sinn: bullish ist `--green`/`--blue`, bearish
`--red`, neutral `--amber`. Ein naher Termin ist keine Richtung. `--due` wird
von `check/theme.js` auf denselben Kontrast (≥ 3:1 gegen `--bg2` und `--bg5`)
geprüft wie die Bedeutungsfarben.

## Karten-Raster: nach der Breite des BEHÄLTERS messen, nicht des Fensters (seit 2026-09-07)

Regel für jede mehrspaltige Kartenliste (erstmals in der Watchlist,
`.wt-grid`/`.wt-card`): sobald Karten **nebeneinander** stehen können, sagt die
Fensterbreite nichts mehr über den Platz *in* einer Karte. Bei 1600 px Fenster
ist eine Watchlist-Karte nur ~530 px breit — eine `@media`-Abfrage hätte dort
die Innenaufteilung der vollen Breite (~1380 px) benutzt und die Kacheln
zusammengequetscht. Umgekehrt ändert das Ein-/Ausklappen der Navigationsleiste
die verfügbare Breite, ohne dass sich das Fenster ändert.

Deshalb:

1. Der Listen-Behälter bekommt `container: <name>/inline-size`, die Karte
   ebenfalls (eigener Name). Die Namen sind Pflicht — bei verschachtelten
   Containern greift eine unbenannte Abfrage sonst am nächstgelegenen
   Vorfahren, was beim Umbauen still kippt.
2. Wie viele **Spalten**, entscheidet die Abfrage am Listen-Behälter.
3. Wie der **Karteninhalt** aufgeteilt wird, entscheidet die Abfrage an der
   Karte.
4. **Höchstens so viele Spalten wie gewollt** — `repeat(auto-fill,minmax(Xpx,1fr))`
   ist hier die falsche Wahl: es liefert bei genug Platz eine dritte Spalte,
   und unterhalb von `X` zwingt es die Karte auf `X` px Breite, also aus dem
   Inhaltsbereich heraus (gemessen: 200 px über den Rand im 390-px-Fenster).
   Stattdessen `1fr` als Grundzustand und die zweite Spalte per
   Container-Abfrage dazuschalten.
5. Ein Raster kann sich **nicht** überlappen — jede Karte hat ihre Zelle.
   `align-items:start`, damit eine kurze Karte neben einer langen nicht auf
   deren Höhe aufgeblasen wird, und `margin-bottom:0` an den Karten im Raster,
   sonst kommt der Rasterabstand zum Aussenabstand hinzu.

Gegenprobe beim Testen: an mindestens sieben Breiten (1920/1600/1440/1280/1180/820/390)
Kartenbreite, Karten je Zeile, Überlappung Karte-gegen-Karte, Überlauf aus der
Karte **und** `scrollWidth > clientWidth` an jedem Textelement messen — ein
Screenshot in Standardbreite zeigt keinen dieser Fälle.

---

## Kerzen-Charts: die vier Dauerregeln

Nutzer-Vorgabe 2026-09-13, ausdrücklich als Dauerregel gesetzt: *„leg generell
bei den charts als regel fest das es keine kerzen für samstag und sontag gibt
außer bei crypto"*.

1. **Eine Kerze = ein Tag.** Kein Zusammenfassen, kein Ausdünnen bei langen
   Zeiträumen.
2. **Kein Samstag, kein Sonntag — außer bei Krypto.** ⚠ Die Feeds *tragen*
   Wochenendtage, und zwar ohne eigene Bewegung: gemessen 2026-09-13 stehen im
   EUR Fr 11.09., Sa 12.09. und So 13.09. alle drei auf `1.15978`, weil der
   Sammellauf am Wochenende den letzten Schluss noch einmal notiert. Über drei
   Jahre sind das 107 Wochenendtage im EUR und je 22 in USD, Gold, Öl, S&P und
   Nasdaq. BTC hat in denselben drei Jahren an allen sieben Wochentagen je 157
   Werte — dort ist das Wochenende ein echter Handelstag und bleibt.
   Die Ausnahme hängt an der **Asset-Klasse** (`KERZEN_WOCHENENDE_OK`), nicht
   an einer ID-Liste, und an der Klasse der **Reihe**, nicht der angezeigten
   Seite: auf der BTC-Seite zeigt die Dollar-Kachel den Dollar, und der
   handelt auch dann nicht am Sonntag, wenn BTC es tut.
3. **Eigene Farb-Tokens `--cndl-up` / `--cndl-dn`**, nie `--bias-bull` /
   `--bias-bear`. Bias ist eine Aussage über die Richtung des *Assets*, die
   Kerzenfarbe nur über die Richtung eines *Tages*. Auf den dunklen Vorlagen
   dreht `--cndl-dn` auf den hellen Gegenpol — ein fast schwarzer Körper auf
   `#161616` wäre unsichtbar.
4. **Dochte nur aus echtem High/Low — aber der Körper bleibt close-to-close.**
   Ein Eintrag ist `[Datum, Close]` oder `[Datum, Close, Open, High, Low]`; nur
   im zweiten Fall gibt es einen Docht. Alles andere wäre eine erfundene Zahl
   (Regel 4).
   ⚠ **Der Körper wird NICHT aus der Eröffnung gezeichnet, obwohl sie dasteht.**
   Gemessen 2026-09-14: der Schluss kommt vom TradingView-Scanner, die Eröffnung
   aus dem Yahoo-Backfill. Zwischen Vortagesschluss und Eröffnung liegt dadurch
   an **100 % aller Tage** ein Sprung (EUR 710/710, Gold 778/779, S&P 777/777) —
   ein Markt springt nicht jeden Tag, das ist ein Quellen-Artefakt: die beiden
   schneiden den Handelstag verschieden. Vom Open aus gezeichnet wechselten
   **352 von 710 EUR-Kerzen (50 %)** ihre Farbe. Der Docht dagegen trägt keine
   Richtungsaussage — er darf aus der zweiten Quelle kommen, der Körper nicht.
   Also: Körper = Vortagesschluss → Schluss (eine Quelle), Docht = gemessenes
   Tageshoch/-tief, auf den Körper geklemmt.
   ⚠ **Beim Kehrwert tauschen Hoch und Tief die Rolle.** USD/JPY, USD/CHF und
   USD/CAD stehen als `invert` in `price_data.json` — der Tageshöchstkurs von
   USD/JPY ist der *tiefste* Yen-Kurs des Tages. Ohne das Tauschen zeigt der
   Docht nach innen.
5. **Woher die Dochte kommen** (gemessen, `probe-ohlc-sources.yml`):

   | Quelle | Ergebnis |
   |---|---|
   | TradingView-Scanner `open/high/low/close` | ✅ Preise 15/15, Renditen 16/16 — im Sammellauf, aber nur *vorwärts* |
   | Yahoo-Chart-API | ✅ 15/15, ~5 Jahre — der Rückwärts-Backfill (`backfill-ohlc.yml`) |
   | Stooq | ❌ HTTP 200, HTML-Sperrseite, 17/17 |
   | Binance | ❌ HTTP 451, von GitHubs Standort gesperrt |

   Für **Staatsanleihen gibt es keine erreichbare Historienquelle** — die
   Renditen-Charts bekommen Dochte ab dem 2026-09-14, einen Tag pro Tag. Die
   Kachel schreibt darunter, wie viele ihrer Kerzen ein gemessenes Hoch/Tief
   tragen.

Alle vier prüft `check/kerzen.js` (mit Gegenprobe in beide Richtungen).

## `var(--x)` auf ein Token, das es nicht gibt

⚠ CSS meldet das **nicht**. Die ganze Deklaration fällt lautlos weg („invalid
at computed-value time"), das Element bleibt ohne diese Eigenschaft.

Gemessen 2026-09-13: `--card` wurde an drei Stellen als
`background:var(--card)` benutzt und war nirgends definiert — `.ab-tile`,
`.ab-ktile`, `.abc-cal` und `.aql-col` standen auf `rgba(0,0,0,0)`, also
vollständig durchsichtig. Auf dem weissen App-Hintergrund war die Asset-Seite
dadurch genau das, was der Nutzer beschrieben hat: *„bei den karten das ist
alles noch so weiß"*.

Der Kontrast-Wächter konnte das nie sehen: der prüft **definierte** Tokens,
nicht **benutzte**. Seit 2026-09-13 nimmt `check/structure.js` die andere
Richtung — jedes `var(--x)` ohne Rückfallwert muss irgendwo definiert sein.
Beim ersten Lauf fand es vier weitere tote Tokens in CSS-Regeln, die auf allen
14 Seiten null Treffer haben.

## Karten-Erhebung: weiße Seite, getönte Karte, gestapelte Schatten (seit 2026-09-14)

Nutzer-Vorgabe: *„mach jetzt den generellen Hintergrund weis und die Karten
dunkler … mach so einen Effekt das es so aussieht als ob sich die Karten vom
Hintergrund abheben"*.

**Die Rollen, monoton nach innen:**

| Rolle | Token | Standard-Vorlage |
|---|---|---|
| Seite | `--bg0` | `#FFFFFF` |
| **jede Karte** | `--card` | `#E0E5F1` |
| Kachel *in* der Karte | `--bg2` | `#F4F6FB` |

⚠ **`--card` ist die Fläche JEDER Karte** — `.ab-tile/.ab-ktile/.ab-ntile/
.ab-ptile`, `.rub-card`, `.dw`, `.abc-cal`. Zwei Töne für dieselbe Rolle
entwickeln sich bei der nächsten Palettenänderung auseinander; `.rub-card` hing
bis 2026-09-14 auf `--bg3` und hatte gar keinen Schatten. `check/kartenlook.js`
erzwingt die eine Farbe, `check/theme.js` erzwingt `--card` als Pflicht-Token
in **allen zehn** Vorlagen (ohne das erben die dunklen still die helle Fläche).

**⚠ Der Kartenkontrast ist ein Pixelwert, kein Tokenwert.** Die Aurora
(`#dashAurora`, der Risk-Sentiment-Schleier hinter allem) tönt die weiße Seite
auf `rgb(248,247,247)`. Gerechnet ergab `#E4E8F3` 1,23:1 — gemessen waren es
1,146. Jede Änderung an der Palette gehört deshalb am Bildschirmfoto
nachgemessen, nicht an den Variablen.

**Der Schatten** folgt Tobias Ahlin / Josh Comeau und Material 3: tonale
Erhöhung **plus** Schatten, und der Schatten in **vier gestapelten Lagen**, bei
denen sich Versatz und Weichzeichnung je Lage verdoppeln (1/2/5/10 px bei
2/5/12/26 px). Ein einzelner Schatten fällt linear ab und wirkt wie ein
aufgemalter Rand. Die Schattenfarbe ist das **Blauschwarz der App**
(`20,27,46`), kein reines Schwarz — grau auf getöntem Grund sieht ausgewaschen
aus.

**⚠ Der SCHATTEN trägt die Trennung, nicht der Farbton** (seit 2026-09-14,
nachdem der Nutzer den Kartenton ausdrücklich zurückgenommen hat: *„mach
weniger stark die hintergrundfarbe der Karten"*). Gemessen an der
Schattenkante direkt unter der Karte gegen den freien Grund: **1,340:1 — und
zwar bei `#D6DCEC` genauso wie bei `#E0E5F1`**. Die Fläche selbst kam dabei
von 1,230 auf 1,131:1 herunter.

Daraus die Regel für jede künftige Palettenänderung: **den Kartenton darf man
verschieben, den Schattenstapel nicht.** `check/kartenlook.js` prüft beides
getrennt — `MIN_SCHATTENKANTE = 1.28` als die eigentliche Trennung,
`MIN_KONTRAST = 1.10` nur noch als Grenze, ab der die Fläche überhaupt
verschwunden wäre. Einen Wächter einfach auf den gerade gesetzten Wert
nachzuziehen macht ihn stumpf; er muss weiter etwas prüfen, was nicht von
derselben Änderung abhängt.

## Restzeit bis zu einem Termin: EIN Baustein, überall gleich (seit 2026-09-14)

Nutzer-Regel: *„Wenn ein Event tomorrow ist dann schreib 1d und nicht tomorrow
und wenn es heute ist dann mach ein auffälliges Ausrufezeichen dahin."*

| Abstand | Anzeige |
|---|---|
| heute | `Today` + rotes `!` (`span.cd-heute`) |
| morgen | `1d` |
| in n Tagen | `{n}d` |
| gestern | `1d ago` |
| in n Tagen zurück | `{n}d ago` |

`Today` bleibt ein **Wort** — eine Null wäre dort keine Auskunft. *Tomorrow*
und *Yesterday* verschwinden dagegen beide, sonst hätte das Muster genau eine
Ausnahme in die falsche Richtung.

**Zwei Funktionen, beide in `js/calendar.js`:**

- `countdownLbl(d)` → reiner Text. **Für `title`-Attribute**, dort darf kein
  Markup stehen.
- `countdownHtml(d)` → dasselbe fürs Auge, mit dem `!` bei heute. **Für alles,
  was im Inhalt steht.**

⚠ Wer `countdownHtml()` einbaut, darf das Ergebnis **nicht** noch einmal durch
`escH()` schicken — sonst steht das `<span>` als Text auf der Seite.

**Zwei bewusste Ausnahmen:** die Erwartung aus dem eigenen Turnus behält ihre
Tilde (`~1d`) und bekommt **kein** `!` — sie ist kein bestätigter Termin. Der
Kalender-Tageskopf behält sein `🔥 TODAY`, ein zweites Zeichen wäre doppelt.

`--live` (Rot) für das `!` ist **kein** Bruch der Bedeutungsfarben: es markiert
keinen Datenwert und keine Richtung, sondern „passiert jetzt" — dieselbe Rolle
wie der Live-Punkt. `--red` wäre *bearish* gewesen. `aria-hidden`, weil das
Wort daneben die Information schon vollständig trägt.

⚠ Die Kette stand vorher an **vier** Stellen als eigene Kopie, mit vier
Schreibweisen (`in 21d`, `21d`, `Tomorrow`, `tomorrow`). Drei waren von Hand
zu finden, die vierte fand erst der Wächter — `check/structure.js` meldet
jede Restzeit-Beschriftung, die wieder „Tomorrow" sagt.

## ~~Blasse Asset-Motive im Kopfbereich~~ — am 2026-09-14 wieder ENTFERNT

⚠ **Es gibt keine Asset-Motive mehr.** Der Nutzer hat sie am selben Tag wieder
abbestellt (*„entfern die Bilder komplett wieder"*) — erst die gezeichneten
Embleme, dann auch die Schein-Fotos als breites Band. Code, Bilddateien und die
zugehörigen Wächter-Abschnitte sind raus. Der Abschnitt bleibt als **Fundgrube
für die drei Lehren** stehen, die unabhängig vom Motiv gelten; er beschreibt
nicht den heutigen Stand.

Was damals gebaut war: jedes Asset hatte ein selbst gezeichnetes SVG-Motiv (`ASSET_ART`/`assetArtUrl`):
Geldschein mit Währungszeichen, Barrenstapel, Ölfass, Münze, Kerzenchart,
Anleihe-Urkunde. **Keine Fotos** — die Seite läuft offline aus dem Cache,
sechzehn Fotos wären mehrere Megabyte, und für Geldscheine bräuchte es Rechte.
Je Motiv ein paar hundert Byte.

⚠ **Die Position wird GEMESSEN, nie fest verdrahtet** (`positioniereAssetArt`).
Sie liegt in der Lücke zwischen Asset-Titel und Knopfleiste und wird bei jedem
Render *und* jedem Resize neu berechnet. Drei Anläufe lagen daneben: 330 px
hoch verschwand zu 70 % hinter den Karten (frei sind genau 103 px), rechts oben
lag es hinter der Knopfleiste, und eine feste `x=214` war auf `USD` gerechnet —
bei `S&P 500 -3.8` lag das Motiv auf dem Score-Abzeichen. **Ist die Lücke
schmaler als das Motiv, gibt es kein Motiv** statt einer Kollision.

**Schrift auf Textur bleibt verboten** (Nutzer-Entscheid 2026-09-04, die acht
Dekorlinien). Das Motiv steht *neben* dem Text, nie darunter, und blendet im
SVG selbst nach unten aus. `check/kartenlook.js` prüft das auf 45
Kombinationen aus fünf Fensterbreiten × neun Assets.

⚠ **CSS-Falle:** `background-position: var(--x) top 6px` ist **ungültig** —
sobald eine Achse eine blanke Länge ist, darf die andere kein Schlüsselwort mit
Offset mehr sein. Der Browser wirft die ganze Deklaration weg und fällt auf
`0% 0%` zurück. Gemessen: die Variable stand korrekt auf 422 px, das Motiv
klebte trotzdem links. Zwei-Wert-Form (`var(--x) 6px`) behebt es.


---

## ⚠️ Achsen: der Schritt bestimmt die Beschriftung, nicht umgekehrt (2026-09-19)

**Regel aus einem Bildvergleich des Nutzers** („das aktuelle ist irgendwie
schlecht und falsch"): Eine Y-Achse wird **nie** durch Halbieren des größten
Werts aufgeteilt. Das Muster

```js
[maxA, maxA/2, 0, -maxA/2, -maxA]   // ⚠ so nicht
```

erzeugt nur bei geradem `maxA` runde Zahlen — in jedem anderen Fall steht
dort etwas, das man nicht ablesen kann, und mit `Math.round()` werden die
Abstände zwischen den Strichen sogar **ungleich**. Gemessen, vor dem Fix:

```
Retail-Netto EURUSD   +67%  +33%  0%  -33%  -67%
Retail-Netto GBPUSD   +81%  +40%  0%  -40%  -80%   ← oben 81, unten 80
```

Die zweite Zeile ist der Grund, warum das keine Geschmacksfrage ist: bei
`maxA = 80,5` rundet die obere Hälfte auf 81 und die untere auf −80.

**Stattdessen, in dieser Reihenfolge:**

1. **Schritt** aus der Spanne: `pcNiceStep(spanne, zielLinien)` → 1/2/5/10
   mal einer Zehnerpotenz. **Ohne 2,5** — das ergab auf einer realen Reihe
   den Schritt 0,025, und zwei Nachkommastellen machen daraus
   `+0,13 +0,10 +0,07` (`0.075` rundet in JS auf `0.07`).
2. **Achsengrenze** auf ein Vielfaches dieses Schritts aufrunden, damit auch
   der Rand rund ist.
3. **Nachkommastellen** aus dem Schritt ableiten: `pcNiceDecimals(step)`.
   Eine feste Stellenzahl ist immer irgendwo falsch.
4. Bei einer Achse mit Nulllinie: `pcNiceTicks(maxA, ziel)` — liefert die
   Teilstriche symmetrisch, also garantiert spiegelgleich.

Geprüft von `check/achsen.js` über alle Ansichten mit Zahlenachse; eine neue
Grafik, die das alte Muster kopiert, fällt dort auf.

## Kalender-Karte der Asset-Seite: vergangene Tage (Nutzer 2026-09-23)

- Vergangene Tage sind grau/blass (Zahl Deckkraft .38, wie „nicht
  veröffentlicht"), **der Punkt bleibt in voller Farbe**.
- Einträge vergangener Tage stehen mit Actual/Forecast/Previous im
  Tagesfenster, nur blasser (`.abc-e.vorbei`).
- Tage VOR dem Feed-Beginn (der Feed kennt nur ~3 Tage zurück) werden aus
  der Indikator-Historie rekonstruiert (`abCalRekonstruiert`,
  `ind_data.json` historyFull) — per Rückfrage „Aus Indikator-Historie".
  Nur Indikatoren mit Kalender-Zuordnung (`CAL_RESEARCH_MATCHERS`, in der
  App „high"); keine geratene Wichtigkeit, keine erfundene Uhrzeit.
- „Not published yet" gilt nur für die Zukunft jenseits des Feeds.
Geprüft in `check/kalender.js`.
