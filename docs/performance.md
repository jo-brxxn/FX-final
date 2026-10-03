# Performance — Dauerregeln

Anlass: Nutzer 2026-10-03, *„Die Webseite hat Performance Probleme also es
ruckelt manchmal und Animationen und so sind einfach nicht clean und es hakt
und braucht teilweise länger zu laden"*. Messwerte und Verlauf:
`docs/CHANGELOG.md`, VERSION-CHECK-587. Geprüft von `check/performance.js`
(zählt, statt Zeiten zu stoppen — Zeiten schwanken mit der Last, Zählwerte
nicht).

## 1. Endlos-Animationen bewegen nur `transform`/`opacity`

`box-shadow`, `background-position`, `filter`, Größen, Farben … malen in
JEDEM Bild neu. Ein einziger box-shadow-Puls (COT-Hinweiskarte) kostete auf
dem Dashboard 608 ms Paint je 4 s Leerlauf. Gleicher Look geht fast immer
GPU-freundlich:
- Schatten-Puls → zweiter Schatten auf `::after`, dessen `opacity` pulst.
- Ring aus `box-shadow`-spread → Scheibe auf `::after`, `transform:scale` + `opacity`.
- wandernde Streifen per `background-position` → Streifenfläche auf `::before`
  (um eine Periode höher, Eltern `overflow:hidden`), `transform:translateY`.
Ausnahmen nur mit Grund in `ERLAUBT_MALEND` (`check/performance.js` S).
⚠ Innerhalb eines Inline-SVG wird nie auf der GPU animiert — auch
`transform` auf einem SVG-Kind malt das SVG neu. Deshalb sparsam.

## 2. Viele gleichartige Elemente nie einzeln animieren

Trend-Punkte, Balken, Listenzeilen: EINE Animation auf der Gruppe (`<g>`,
Container), nicht eine pro Element mit Versatz. 3292 Punkt-Animationen auf
Trends = 2,1 s PrePaint und ~250 ms je Bild, solange sie liefen.
Grenze im Wächter: 400 gleichzeitige Animationen je Seite.

## 3. Einblendungen enden mit `fill-mode: backwards`

Wenn der Endzustand der natürliche ist (opacity 1, keine Verschiebung), nicht
`both`/`forwards` — eine fertige Animation mit `both` bleibt als Effekt am
Element hängen. Nur wo der Endwert vom Normalzustand abweicht (z. B.
`.tr-halo-fade` endet bei .7), bleibt `both`.

## 4. Ticker schreiben Text, nie Element-HTML

Was sich jede Sekunde oder jedes Bild ändert (Uhr, Countdown, Globus-
Beschriftung, Zähler): Gerüst EINMAL bauen, danach nur `textContent`
bestehender Elemente — und nur, wenn sich der Text wirklich ändert. Ein
`innerHTML` mit Elementen ist eine Element-Mutation und weckt die
Seiten-Beobachter (`kartenIconsNachtragen`, `infoKnoepfeEinordnen`,
`kopfTitelEinpassen`, `lgAlleKarten`), die dann die ganze Seite vermessen.
Reine Textwechsel filtern sie seit 2026-10-03 heraus (`nurTextMutation`).

## 5. Eine Seite wird EINMAL aufgebaut

Zustand (z. B. `selId`) VOR `showTab` setzen, statt `showTab` die alte Seite
zeichnen zu lassen und danach die neue (`gotoSym`, `sbClick`). Nachladende
Daten, die nur eine Karte betreffen, tauschen nur diese Karte
(`calpNeuZeichnen` → Kalenderkarte), nicht `renderDetail`.

## 6. Erst alles messen, dann alles schreiben

Abwechselnd lesen (`getBoundingClientRect`, `getComputedStyle` auf
Layout-Werte, `offsetWidth`) und schreiben erzwingt nach jedem Schreiben ein
neues Layout. Schleifen messen zuerst alle Elemente, dann setzen sie alle
(`lgAlleKarten`). Billige Prüfungen VOR teuren Lesungen (`tagName` vor
`getComputedStyle`, `infoKnoepfeEinordnen`). Probier-Schleifen halbieren
statt Stufe für Stufe (`kopfTitelEinpassen`).

## 7. Pro Bild nichts neu rechnen, was sich nicht pro Bild ändert

Globus: Scores der Labels höchstens einmal je Sekunde, feste
Winkelfunktionen der Küstenpunkte einmal je Ring (`globeRingPre`).
Score-Zwischenwerte, die für alle Indikatoren eines Assets gleich sind,
einmal je Asset und Datenstand (`mktMovesFor`).

## 8. Dauerbewegung = Filmstreifen, nie Live-Animation in geteilten Vorlagen

Nutzer 2026-10-03 auf die Frage, ob die Asset-Animationen kürzer laufen
sollen: *„Das kann nicht sein dann baust du das falsch die Animationen werden
nur ganz am Anfang einmal geladen dann nur wiederholt das ist nicht
anspruchsvoll. Bau das besser"*. Gemessen bestätigt: Die Animationen liefen
live in den GETEILTEN Vorlagen (`#aiDefs`, SMIL-Welle + CSS in `<symbol>`s),
auch für unsichtbare Symbole — selbst mit allen Symbolen ausgeblendet 557 ms
je 4 s, mit einem sichtbaren Symbol 1439 ms (Paint/PrePaint/Layerize/Layout
über die ganze Seite in jedem Bild).

Regel: Eine Dauerbewegung wird EINMAL als Filmstreifen vorberechnet
(`aiFilm`, 30 Bilder/s, aus denselben Formeln/Keyframes) und per
`transform` + `steps()` abgespielt — Arbeit pro Bild: null auf dem
Hauptthread. Alle Filme laufen auf der gemeinsamen Uhr (negative
`animation-delay` aus `performance.now()`), ein Neuzeichnen setzt sie nicht
zurück. Filme werden im Leerlauf gebaut (`aiFilmeNachziehen`), nie im
Render-Pfad (5 ms je Film). Nachher: Asset-Seite und Dashboard 0 %
Hauptthread im Leerlauf (vorher 28 %/33 %), Wisch bei 4× Drossel Median
17 ms je Bild (vorher 50). Geprüft: `check/performance.js` E,
`check/symbole.js` A/B.

⚠ Nicht in WebKit gemessen (Download in der Cloud-Umgebung gesperrt) — die
iPad-Prüfung steht beim Nutzer aus (Stand 2026-10-03).
