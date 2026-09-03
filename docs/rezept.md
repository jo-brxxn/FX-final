# Perfect Rezept — die ZWEITE App in diesem Repo

> **⚠ Wenn du am FX Analyst Pro arbeitest, brauchst du diese Datei nicht.**
> Und umgekehrt: wer an Perfect Rezept arbeitet, muss `index.html`,
> `js/main.js`, `docs/score-model.md`, `docs/navigation.md`,
> `docs/data-sources.md` und `docs/state-sync.md` NICHT lesen.

## Was hier getrennt ist — und was nicht

Nutzer-Vorgabe 2026-09-01, wörtlich: *„es sind wirklich zwei verschiedene
Apps, also zwei verschiedene Webseiten. Die beiden Webseiten unterscheiden
sich komplett … ich möchte auch, dass du den ganzen Code in neuen Dateien
schreibst … wenn man am FX Analyst Pro arbeitet, sollen nicht die anderen
ganzen Dateien durchgelesen werden und andersrum."*

| | FX Analyst Pro | Perfect Rezept |
|---|---|---|
| Einstiegsseite | `index.html` | `rezept.html` |
| Code | `js/main.js`, `js/score.js`, `js/calendar.js`, `js/globe.js`, `js/constants.js`, `js/data-feeds.js`, `js/asset-notes-seed.js` | `js/rezept/store.js`, `js/rezept/app.js` |
| CSS | inline in `index.html` | inline in `rezept.html` |
| Zustand | `localStorage` `fxpro_*` + Supabase-Zeile `<syncId>` | IndexedDB `perfect_rezept` + Supabase-Zeilen `<syncId>:rez:*` |
| Versions-Banner | `VERSION-CHECK-<n>` (`#hlbName`) | `REZEPT-CHECK-<n>` (`#rezVerName`) |

**Geteilt wird ausschließlich:** das Git-Repo, `sw.js` (ein Service Worker
für beide Seiten), die Icons/`manifest.json` — und die **Supabase-Zugangs-
daten** aus `localStorage['fxpro_cloud_cfg']`. Letzteres bewusst: der Nutzer
soll den Sync nicht zweimal einrichten. Perfect Rezept LIEST diese Zugangs-
daten nur; eingerichtet werden sie weiterhin im FX Analyst Pro.

Kein gemeinsames CSS, kein gemeinsames Skript, kein gemeinsamer Zustand.
Eine Änderung an der einen App darf die andere nie anfassen.

## Die App-Weiche

Beim allerersten Öffnen zeigt `index.html` das Auswahlfenster `#appChoiceOv`
(FX Analyst Pro / Perfect Rezept). Die Wahl landet in
`localStorage['dmfx_app_choice']`.

- **Bewusst NICHT per Cloud synchronisiert** — Ausnahme von der
  CLAUDE.md-Kernregel 1, mit Grund: die Wahl ist gerätespezifisch
  (Nutzer-Wunsch: *„es sich das Ganze für das jeweilige Gerät merkt"*).
  Ein Sync würde dem Handy die App des iPads aufzwingen.
- Ein `<script>` ganz oben im `<head>` von `index.html` leitet bei
  `'rezept'` sofort per `location.replace()` weiter — **vor** dem FX-Boot,
  sonst lädt die ganze FX-App nur, um verworfen zu werden.
- Gewechselt wird in **beiden** Apps unter *Settings → Apps*
  (`switchToRezept()` in `index.html`, `rezSwitchApp()` in `js/rezept/app.js`).
- Die Browser-Prüfungen unter `check/` setzen `dmfx_app_choice='fx'` per
  `addInitScript` und entfernen `#appChoiceOv` — sonst würde das Fenster
  jeden einzelnen Playwright-Lauf des FX Analyst Pro blockieren.

## Datenmodell und Sync

Alles liegt in der **bestehenden** Supabase-Tabelle `fx_sync` — kein neues
Setup, keine neue Tabelle, kein Storage-Bucket:

```
<syncId>              FX-Analyst-Pro-Zustand   (unangetastet)
<syncId>:rez:index    Verzeichnis: Titel, Zeit, Tags, Favorit, Thumbnail, Papierkorb, Theme
<syncId>:rez:r:<id>   EIN Rezept: Vollbild, Zutaten, Zubereitungs-Blöcke
```

**Warum nicht in den FX-Blob:** `cloudPush()` des FX Analyst Pro schiebt bei
jeder Änderung den KOMPLETTEN Zustand hoch. Rezeptbilder darin würden bei
jedem beliebigen FX-Autosave (z. B. dem stündlichen Kalender-Refresh)
komplett neu hochgeladen. Getrennte Zeilen heißen: hochgeladen wird nur das
geänderte Rezept, und der FX-Push bleibt so klein wie vorher.

**Warum Thumbnails im Verzeichnis:** ein einziger Request rendert damit das
gesamte Raster. Die Vollbilder kommen erst beim Öffnen eines Rezepts
(`getFull()`), gecacht in IndexedDB.

**Bild-Budgets** (`store.js`, `IMG_COVER`/`IMG_BLOCK`/`IMG_THUMB`): jedes Bild
wird im Browser iterativ heruntergerechnet, bis es ein BYTE-Budget einhält
(Titelbild ≤ 260 KB, Block-Bild ≤ 180 KB, Thumbnail ≤ 34 KB) — nicht nur auf
eine Kantenlänge. Grund: Supabase Free hat 500 MB Datenbank, Base64 bläht
zusätzlich um 33 % auf. Bei 100 Rezepten landet man so bei ~35 MB.
**Beim Erhöhen eines Budgets vorher hochrechnen, nicht schätzen.**

**⚠ Merge statt Overwrite** — dieselbe Falle wie bei `scoreHist` und
`research` im FX Analyst Pro (siehe `docs/state-sync.md`): zwei Geräte legen
unabhängig voneinander Rezepte an, ein simples „Cloud gewinnt" würde die
jeweils andere Seite löschen. `mergeIndex()` vereinigt nach `id`, bei einer
Kollision gewinnt der zuletzt bearbeitete Eintrag (`up`). Papierkorb-
Einträge sind **Grabsteine**: ein auf Gerät A gelöschtes Rezept darf nicht
dadurch wiederauferstehen, dass Gerät B es noch im Verzeichnis hat — außer
es wurde dort NACH dem Löschen bearbeitet. Der komplette
Lies-Merge-Schreib-Zyklus läuft unter `navigator.locks`.

**IndexedDB statt localStorage:** localStorage liegt bei ~5 MB, ein einziges
Titelbild frisst davon 5 %. Für Bilder ist das keine Option.

## Einkaufsliste

Nach **Abteilungen** gruppiert, wie man durch den Laden läuft — `Fruit & Veg`,
`Bakery`, `Dairy & Eggs`, `Meat & Fish`, `Pantry`, `Frozen`, `Drinks`,
`Household`, `Other`. Die Zuordnung kommt aus `js/rezept/groceries.js`.

**Sprache:** die Oberfläche ist Englisch (feste Projektregel), der Nutzer
tippt aber deutsch. Deshalb trägt jeder Wörterbuch-Eintrag einen **englischen
Anzeigenamen und deutsche Suchwörter**: „Milch" findet „Milk", „zwie" findet
„Onions". Wer frei tippt, behält seinen eigenen Text — ersetzt wird nur, was
aus der Vorschlagsliste ausgewählt wird.

**Nichts wird geraten:** was das Wörterbuch nicht kennt, landet in `Other` und
nicht in einer plausibel klingenden Abteilung. Die Zuordnung ist je Eintrag
über das Bearbeiten-Fenster korrigierbar (`item.cat` schlägt die automatische
Erkennung).

Erkennungsstufen in `categorize()`, in dieser Reihenfolge: ganzer Text →
Mehrwort-Begriff (längste Treffer zuerst, damit „olivenoel" nicht an „oel"
hängen bleibt) → wortweise inkl. grober Einzahl-Form → zusammengesetzte
Wörter. Zwei Fallen, die beim ersten Test zugeschlagen haben und deshalb
Tests haben: **Bindestriche werden zu Leerzeichen** (sonst findet „Bio-Zitrone"
die Zitrone nicht), und **verarbeitete Produkte brauchen einen eigenen
Eintrag** (sonst schiebt die Zusammensetzungs-Regel „Tomatensauce" zum Gemüse).

Weitere Funktionen: Mengen werden vom Namen getrennt angezeigt (`500 g Mehl` →
Badge `500 g`), Fortschrittsbalken, Sortierung nach Abteilung oder Alter,
alles abhaken, erledigte löschen, häufig gekaufte Artikel als Schnellwahl,
Abteilungen einklappbar, Pfeiltasten + Enter in der Vorschlagsliste.

## Typografie und Bewegung

**Keine Web-Fonts über ein CDN** — dieselbe Entscheidung wie im FX Analyst
Pro: die App muss offline laufen (Service Worker), eine nachzuladende Schrift
wäre genau dort weg, wo sie am meisten stört. Stattdessen stehen die
`ui-*`-Familien **zuerst** im Stapel: das sind die echten System-Schnitte des
Geräts, auf iPhone/iPad/Mac also SF Pro Text bzw. SF Pro Display, auf Windows
Segoe UI Variable. Kostet nichts, lädt nichts nach, sieht deutlich besser aus
als ein fester Stapel. `check/rezept.js` Stufe J prüft, dass keine Schrift
nachgeladen wird.

Vier Rollen statt einer: `--ff-text` (Fließtext), `--ff-title`
(Überschriften, **je Theme anders** — Serife bei `paper`, `ui-rounded` bei
`ios`, enge Grotesk bei `swiss`), `--ff-num` (dieselbe Familie, dicktengleich)
und `--ff-mono`.

Auf einer Skala liegen jetzt auch **Zeilenhöhen** (`--lh-tight/snug/base/loose`)
und **Laufweiten** (`--ls-title` negativ für große Schrift, `--ls-label` weit
für Versal-Beschriftungen) — vorher stand an jeder Stelle ein eigener Wert.
Die Größen sind fluid (`clamp()`), atmen also mit der Fensterbreite statt
einen zweiten Satz Media Queries zu brauchen.

**Bewegung: eine Animation erklärt, WOHER etwas kommt und WOHIN es geht. Was
nichts erklärt, bewegt sich nicht.** Dauern (`--t-fast/base/slow`) und Kurven
(`--e-out/in/spring`) kommen aus Tokens, keine frei gewählten Werte. Alles
über ~250 ms fühlt sich bei täglicher Nutzung nach Warten an.

⚠ **Animiert werden nur `transform` und `opacity`.** Alles andere (width,
top, height) lässt den Browser bei jedem Bild neu rechnen und ruckelt auf dem
Handy. Einzige Ausnahme: der Fortschrittsbalken, dessen Breite die Aussage
ist.

⚠ **Zwei Abschalter, beide ernst gemeint:** `prefers-reduced-motion` (eine
Barrierefreiheits-Anforderung, keine Geschmacksfrage) und ein eigener Schalter
in den Einstellungen (`body.no-anim`, gesynct). Beide werden geprüft.

⚠ **`afterRender()` nach JEDEM Neuzeichnen aufrufen.** Es setzt die
Staffelung (`--i`, gedeckelt bei 14 — sonst erschiene die letzte von 40
Karten erst nach über einer Sekunde) und schaltet Bilder sichtbar. Das CSS
setzt Bilder auf `opacity:0`; eine vergessene Stelle heißt **unsichtbare
Bilder**, nicht nur eine fehlende Animation. Stufe J prüft es.

⚠ **Fenster haben einen echten Abgang.** `rezCloseModal()` räumt den Zustand
**sofort** und den DOM erst nach 140 ms — andersherum hätte man kurz ein
Fenster, das noch Eingaben annimmt, obwohl es logisch schon zu ist.

## Bilder eines Rezepts

**Eine Quelle für alle drei Stellen** (`recipeImages(doc)`): Titelbild zuerst,
dann die Bilder aus den Zubereitungs-Blöcken in ihrer Reihenfolge.

| Wo | Was zu sehen ist |
|---|---|
| Karte im Raster | Titelbild + Zähler-Abzeichen (`+N`), wenn es mehr als ein Foto gibt |
| Detailfenster | Titelbild, Bilderstreifen aller Fotos, jedes Bild öffnet die Großansicht |
| Kochmodus | Bild **beim** Schritt + Fotostreifen in der Seitenspalte |

⚠ **Der Zähler steht im VERZEICHNIS** (`meta.imgs`), nicht im Volldokument —
die Karte im Raster hat das Volldokument gar nicht geladen. `getFull()` trägt
das Feld bei Bestandsdaten beim ersten Öffnen nach; ohne dieses Nachtragen
bliebe das Abzeichen bei allen älteren Rezepten für immer aus.

⚠ **Ein Bild in der Zubereitung wird an den vorhergehenden Schritt geheftet**,
statt ein eigener, textloser Schritt zu werden. Vorher musste man im Kochmodus
am Bild vorbeiblättern, um die zugehörige Anweisung zu lesen — Bild und Text
gehören zusammen. Nur ein Bild ganz am Anfang bleibt ein eigener Schritt.

⚠ **Großansicht und Video-Fenster hängen an eigenen Hosts** (`#rezLight`,
`#rezVideo`) außerhalb der App-Shell: sie müssen auch aus dem Kochmodus heraus
funktionieren, und der liegt bereits darüber. Escape schließt in der
Großansicht **nur** die Großansicht (Handler in der Capture-Phase mit
`stopPropagation`) — sonst wäre man mit einem Tastendruck zwei Ebenen weg.

## Titelbild aus einem Reel

Drei Stufen, in dieser Reihenfolge:

1. Ein eigenes Bild an der Idee gewinnt immer.
2. **YouTube**: echtes Vorschaubild über `img.youtube.com/vi/<id>/hqdefault.jpg`
   — öffentlich und ohne Schlüssel. Wird versucht lokal einzulesen
   (`crossOrigin='anonymous'` + Canvas), damit das Rezept auch offline ein
   Bild hat; scheitert das an CORS, greift Stufe 3.
   `hqdefault` bewusst statt `maxres`: das gibt es für **jedes** Video.
3. **Instagram/TikTok**: deren Vorschaubilder sind **nicht** öffentlich
   abrufbar — kurzlebig signierte Adressen, nur über eine API mit
   Konto-Token. ⚠ Statt eine Adresse zu raten, die später als kaputtes Bild
   beim Nutzer landet, baut `makeCoverCard()` ein **erkennbar erzeugtes**
   Titelbild aus Titel, Künstler und Plattform — mit dem Hinweis „Tap to add
   your own photo". `check/rezept.js` Stufe L schlägt fehl, wenn für Instagram
   doch eine Adresse gebildet wird.

Nebenwirkung, bewusst: ein aus einer Inspiration erzeugtes Rezept hat damit
**immer** ein Titelbild und wird beim Speichern nicht mehr abgelehnt. Ein von
Hand angelegtes Rezept ohne Foto wird weiterhin abgelehnt (beides geprüft).

### Titelbild selbst wählen: das Cover-Fenster (seit REZEPT-CHECK-8)

Nutzer-Wunsch 2026-09-02: *„Screenshot aus dem Reel als Titelbild direkt in
der App auswählbar machen."* Erreichbar über **„Cover from the video"** im
Rezept-Formular und **„Set cover"** im Inspirations-Fenster; eigener Host
`#rezCover`, der **über** dem Formular liegt — das Formular darunter bleibt
offen und ungespeichert, `Escape` schließt nur die obere Ebene.

| Plattform | Was das Fenster anbietet |
|---|---|
| YouTube | **echte Standbilder** aus dem Video (`frameUrls()`: `maxresdefault`, `hqdefault`, `1/2/3.jpg` = erstes, mittleres, letztes Drittel) — anklicken genügt |
| Instagram / TikTok | das Reel läuft **links im selben Fenster**; rechts Bildschirmfoto per Klick, Ziehen-und-Ablegen oder ⌘V/Strg+V einfügen |

⚠ **Warum es bei Instagram/TikTok kein „Bild aus dem Video holen" gibt:** das
Video läuft in einem cross-origin `<iframe>`. Weder Auslesen noch Abmalen auf
eine Canvas ist erlaubt (Same-Origin-Regel — keine Einstellung, die man
umlegen könnte), und die Vorschaubilder liegen hinter kurzlebig signierten
Adressen. Ein Knopf „Frame übernehmen" wäre dort eine **Attrappe**; deshalb
steht stattdessen der Bildschirmfoto-Weg da, und `frameUrls()` gibt für diese
Plattformen bewusst eine **leere Liste** zurück (Stufe M schlägt fehl, wenn
doch Adressen entstehen).

**Zuschneiden** gehört dazu: ein Handy-Screenshot ist hochkant und hat die
Telefonleisten mit drauf. Der Ausschnitt wird in **Bildpunkten des Originals**
gerechnet (nicht in Bildschirmpunkten — sonst hinge die Schärfe an der
Fenstergröße), mit festen Verhältnissen (frei, 4:3, 3:4, 1:1, 16:9, 9:16).
Das Ergebnis läuft durch dieselben Bild-Budgets wie jedes andere Foto.

⚠ **Die Zwischenablage kann fehlschlagen** (`navigator.clipboard.read()` gibt
es nicht überall und sie fragt um Erlaubnis). Dann sagt die App **warum** und
nennt den Weg, der immer geht — kein stilles Nichts.

## Kochmodus, Timer und Portionen (`js/rezept/cook.js`)

**Kochmodus** ist Vollbild mit großer Schrift, weil das Gerät beim Kochen
zwei Meter weg steht und man nasse Hände hat. `wakeLock` hält den Bildschirm
an — und wird nach der Rückkehr aus dem Hintergrund **neu angefordert**, weil
das System sie dort freigibt.

**Layout seit REZEPT-CHECK-8 — drei Spalten** (Nutzer-Wunsch 2026-09-02:
*„links die Zutaten, dann in der Mitte das Bild oder das Video … und dann
rechts die Zubereitung und oben mittig die Timer Funktion"*):

| Bereich | Inhalt |
|---|---|
| Kopfzeile | Schließen · Titel · **Timer (mittig)** · Portionsregler |
| links | Zutaten mit Häkchen (auf die eingestellten Portionen gerechnet) + Fotostreifen |
| Mitte | Bild **oder** Video des Rezepts, umschaltbar |
| rechts | **alle** Schritte als Liste, der aktive hervorgehoben, darunter Timer-Knöpfe und Zurück/Weiter |

Zwei Punkte, die dabei leicht kaputtgehen und deshalb geprüft werden:

- ⚠ **Das Medienfeld nimmt das Seitenverhältnis des Bildes an** (`--ck-ar`,
  gesetzt beim `load` des Bildes). Ein fester 16:9-Kasten lässt ein
  hochkantes Reel-Bild wie einen Fehler aussehen.
- ⚠ **Der Video-Rahmen wird beim Schrittwechsel aus dem DOM gelöst und wieder
  eingehängt**, statt neu geschrieben zu werden — sonst springt das Video bei
  jedem Klick an den Anfang. Aus demselben Grund schreibt das Timer-Ereignis
  **nur** die Timer-Zeile neu, nicht den ganzen Kochmodus.
- ⚠ Im Kochmodus ist die **untere** Timer-Leiste ausgeblendet
  (`body.cooking #rezTimers`) — dieselbe Uhr an zwei Stellen ist doppelt, und
  genau die untere Leiste verdeckte früher „Back/Next".

**Portionen skalieren** (`scaleIngredient`): erkennt Zahl, Komma-Wert,
Schreibbruch (`1 1/2`) und Unicode-Bruch (`½`). ⚠ **Steht keine Zahl da
(„Salz & Pfeffer"), bleibt die Zeile unverändert** — eine erfundene Menge
wäre schlimmer als keine. Ergebnisse werden als Bruch (½, ⅓, ¾) oder mit
höchstens einer Nachkommastelle ausgegeben; „0,6666 Zwiebeln" hilft niemandem.

**Timer** werden aus dem Schritt gelesen (`findTimers`): *alle* Zeitangaben
eines Schrittes, damit „5 Minuten anbraten, dann 20 Minuten schmoren" **zwei**
Knöpfe ergibt. Bei einer Spanne („15–20 Minuten") gewinnt die **obere** Zahl —
lieber einmal nachsehen als etwas anbrennen lassen. Unplausibles (< 5 s,
> 6 h) und Temperaturen werden ignoriert.

⚠ **Die Restzeit wird aus der Zielzeit gerechnet, nicht heruntergezählt.**
Ein Intervall wird im Hintergrund-Tab gedrosselt; ein Zähler wäre danach
falsch.

### Ton und der Stumm-Hinweis — was geht und was nicht

Der Klingelton wird per WebAudio **erzeugt**, nicht als Datei geladen: die App
muss offline laufen, und eine fehlende `mp3` wäre genau beim Klingeln weg.

⚠ **Es gibt keine Browser-Schnittstelle, die den Stummschalter eines iPhones
abfragt.** Weder WebAudio noch das Media-API liest den Ringer-Switch.
Erkennbar ist nur, ob die Wiedergabe überhaupt *erlaubt/gestartet* wurde
(`AudioContext` bleibt `suspended`). Genau das wird geprüft, und **nur dann**
erscheint der Hinweis — wie vom Nutzer gewünscht („wenn das Gerät auf stumm
ist auch ein Hinweis, sonst nicht"). Bei einem stummgeschalteten iPhone läuft
der Kontext allerdings normal weiter, man hört nur nichts. Deshalb klingelt
der Timer **immer zusätzlich sichtbar** und vibriert, wo unterstützt. Auf eine
Erkennung, die es nicht gibt, wird sich nicht verlassen.

## Video-Wiedergabe: nur YouTube ist steuerbar

⚠ Der Einbett-Rahmen ist cross-origin. **Instagram und TikTok bieten keine
Schnittstelle, um von außen zu spulen, anzuhalten oder die Position zu
lesen** — dort bleibt nur die Bedienung im Video selbst, und die App sagt das
sichtbar, statt eine Leiste vorzutäuschen, die nichts tut. **YouTube** hat
eine dokumentierte `postMessage`-Schnittstelle (`enablejsapi=1`); nur dort
gibt es Play/Pause, Position und ±10 s. Deren Skript wird **nicht**
nachgeladen (Offline-Regel) — die Befehle gehen direkt per `postMessage`.
Meldet sich der Player binnen 3 s nicht, **verschwindet die Leiste wieder**:
lieber keine Leiste als eine, die nichts bewirkt.

## Modal-Generation

⚠ Mehrere Fenster-Öffner laden erst nach (`getFull`, Bilder) und zeichnen
danach. Ohne Zähler springt ein Fenster Sekunden später von selbst auf oder
überschreibt ein inzwischen geöffnetes anderes. Jeder asynchrone Öffner merkt
sich `modalGen()` und bricht ab, wenn sich die Generation geändert hat.

## ⚠ Der Service Worker darf den Programmcode nicht cachen

Nutzer-Bugreport 2026-09-02 (*„es ist wie davor"*) — und die Ursache lag
**nicht** in der App: `sw.js` lieferte `js/rezept/*.js` über den
**Cache-First**-Zweig aus. Nach einem Push bekam das Gerät weiter den **alten
Code**; der neue wurde nur im Hintergrund nachgeladen und wirkte frühestens
beim **übernächsten** Öffnen. Von außen sieht das exakt aus wie ein nicht
behobener Fehler — und kostet eine komplette Runde Fehlersuche an der
falschen Stelle.

Seit `fxpro-v11` laufen `.js`, `.mjs` und `.css` über den **Netz-zuerst**-Zweig
(Cache nur als Offline-Rückfall). Bilder, Icons und `manifest.json` bleiben
Cache-zuerst. ⚠ Der Seiten-Rückfall (`rezept.html`/`index.html`) gilt **nur
für Navigationen** — für eine fehlende `.js`-Datei HTML auszuliefern wäre
schlimmer als der Fehler selbst. `check/rezept.js` prüft das statisch, damit
diese Falle nicht zurückkommt.

## Feste Regeln dieser App

1. **Alles auf der Oberfläche ist Englisch** — wie im FX Analyst Pro
   (Nutzer-Regel 2026-09-01, ausdrücklich als Dauerregel gesetzt).
2. **`REZEPT-CHECK`-Nummer bei JEDER Änderung an `rezept.html` oder
   `js/rezept/*` hochzählen** (`#rezVerName` + `title`-Tooltip) und die neue
   Nummer als letzten Satz der Chat-Antwort nennen — dieselbe Pflicht wie
   `VERSION-CHECK` drüben, erzwungen von `check/rules.js` (Regel 1b).
3. **Struktur folgt dem FX Analyst Pro**: Kopfzeile, dunkle Nav-Sidebar
   links, Seitenbereich rechts, dieselben Karten-/Modal-Bausteine, dieselbe
   Typo-/Abstands-Skala aus `docs/design-system.md`. Übernommen werden die
   Bauteile, nicht die Dateien.
4. **Farben nur über die Theme-Tokens.** Zehn Paletten (`linear`, `notion`,
   `vercel`, `github`, `stripe`, `ios`, `swiss`, `fog`, `graphite` und als
   einzige braune `paper`), umschaltbar unter *Settings → Appearance*, je
   zwei CSS-Blöcke (Inhalt + Chrome-Bereich). Ein Theme-Wechsel ist ein
   reiner Token-Tausch — **nie eine Einzelstelle einfärben**.
   - **Jeder Block muss ALLE Tokens setzen** (`--chrome-bg`, `--bg0`…`--bg5`,
     `--bd`/`--bd2`, `--t0`…`--t3`, `--accent`, `--accent-soft`, `--live`,
     `--avatar-bg`, `--avatar-fg`). Fehlt eins, erbt das Theme still den Wert
     des vorherigen — so entstehen „fast richtige" Paletten mit einem
     falschen Grauton drin. `check/rezept.js` prüft das.
   - **Beim ENTFERNEN eines Themes migrieren.** Ein Gerät mit dem alten Namen
     im Speicher trifft sonst gar kein `[data-rez-theme]`-Regelwerk und steht
     ohne eine einzige Farbvariable da. Die Migrationsliste steht doppelt:
     in der Früh-Weiche im `<head>` von `rezept.html` und als `THEME_IDS` in
     `js/rezept/app.js`.
   - **Kontrast wird nachgerechnet, nicht geschätzt** (wie im FX Analyst Pro,
     siehe `docs/design-system.md`): jede Textstufe ≥ 4,5:1 gegen JEDE Fläche
     ihres Blocks, erzwungen von `check/rezept.js` Stufe E.
5. **Bild ist Pflicht, Text ist freiwillig** (Nutzer-Wunsch: *„Wichtig ist,
   dass man immer Bilder macht, aber man kann auch Text schreiben"*).
6. **Löschen = Papierkorb, 30 Tage** (`TRASH_DAYS`), Wiederherstellung unter
   *Settings → Trash* — gleiches Muster wie die Research-Notizen im FX
   Analyst Pro.
7. **Overlays gehören an den `body`** (`position:fixed`), nicht in den
   scrollenden Modal-Container — sonst werden sie am Rand abgeschnitten
   (`.rd-menu`, siehe `docs/design-system.md`).
8. **Dauer in 5-Minuten-Schritten** (`DURATIONS`, 5–180 min, darüber 4/5/6 h).
9. **Der `<input type="file">` muss im Dokument hängen.** iOS Safari öffnet
   den Dateidialog sonst nicht — der Klick verpufft ohne Fehlermeldung.
   Genau das war der Bugreport „das Bild hinzufügen geht nicht" vom
   2026-09-01. `pickFile()` hängt ihn ein, klickt, entfernt ihn wieder;
   `check/rezept.js` prüft die Stelle direkt im Quelltext, weil Chromium
   den Fehler nicht zeigt.
10. **Kein Schreibpfad ohne `try/catch` mit sichtbarer Meldung.** Eine
   unbehandelte Promise-Rejection sieht für den Nutzer exakt aus wie „die App
   macht nichts" (Bugreport „das Speichern klappt nicht", 2026-09-01). Die
   lokale Ablage ist ausdrücklich BEST EFFORT: fällt IndexedDB aus
   (Privatmodus, Speicherkontingent), läuft die App auf einer Speicher-Map
   weiter, `state.dbBroken` wird gesetzt und die Kopfzeile sagt
   „No local storage — cloud sync only".
11. **⚠ Beim Sprechen mit Supabase die Kopfzeilen NICHT neu erfinden — beim
   FX Analyst Pro abschreiben.** Diese App schickte zusätzlich
   `Authorization: Bearer <key>`; bei den heutigen Supabase-Schlüsseln
   (`sb_publishable_…`) ist das kein gültiges JWT, der Gateway prüft den
   Header sobald er da ist und antwortet **401** — mit demselben Schlüssel,
   mit dem der FX Analyst Pro (nur `apikey`) einwandfrei arbeitet. Gemessen
   gegen einen nachgebauten Endpunkt: nur `apikey` → 200, `apikey` + Bearer
   `sb_publishable_…` → 401, `apikey` + Bearer `eyJ…` → 200.
   `check/rezept.js` vergleicht die Kopfzeilen beider Apps statisch.
12. **HTTP-Codes werden zu Meldungen, mit denen der Nutzer etwas anfangen
   kann** (`httpFehler()`): 401 nennt den Weg zu den Zugangsdaten, 403 die
   RLS-Regeln, 404 die Tabelle. „HTTP 401" allein sagt niemandem, wo er
   nachsieht. Zugangsdaten und ein Verbindungstest stehen in den
   Einstellungen **beider** Apps — eine Reparatur darf keinen App-Wechsel
   verlangen.
12b. **⚠ Der Statuscode allein lügt — erst den Fehlercode im Rumpf lesen.**
   PostgREST beantwortet eine verletzte Row-Level-Security-Regel nur dann
   mit **403**, wenn ein JWT mitkam; bei einer anonymen Anfrage (nur
   `apikey` — genau so sprechen beide Apps) mit **401**. Der Bugreport vom
   2026-09-02 lautete deshalb wörtlich „API key rejected (401)… `{"code":
   "42501", … "new row violates row-level security policy for table
   \"fx_sync\""}`" — der Schlüssel war die ganze Zeit in Ordnung, die App
   schickte den Nutzer trotzdem einen neuen holen. `httpFehler()` wertet
   seither **zuerst** `code`/`message` aus dem Rumpf aus (`42501` → RLS,
   `42P01`/404 → Tabelle fehlt) und erst danach den Status;
   `check/rezept.js` prüft die Reihenfolge statisch.
12c. **Der Verbindungstest meldet JEDE Stufe einzeln** — *Read* / *Update
   existing row* / *Create new row* / *Delete*. Genau diese Aufschlüsselung
   beantwortet die Rückfrage des Nutzers (*„bei FX Analyst Pro geht es ja,
   was ist da überhaupt anders"*): Die Update-Stufe schreibt die `id` der
   FX-Zeile auf sich selbst (ändert also nichts) und beweist, dass Schlüssel,
   URL und Tabelle in Ordnung sind; scheitert nur *Create new row*, fehlt
   ausschließlich das INSERT-Recht. Der FX Analyst Pro kommt ohne aus, weil
   seine Zeile existiert — die Rezept-App nicht.
   **⚠ Nicht wegprogrammierbar:** Rezeptdaten stattdessen in die vorhandene
   FX-Zeile zu schreiben scheitert doppelt — `cloudPush()` des FX Analyst Pro
   ersetzt `data` bei jedem Push komplett (die Rezepte wären beim nächsten
   FX-Autosave weg), und die Bilder lägen wieder im FX-Blob, den jeder
   Kalender-Refresh neu hochlädt. Eine INSERT-Policy ist der einzige Weg.
   Vorgeschichte dazu: Ein reiner `select`-Test meldete „Connection works",
   während jeder Upload scheiterte — ein Lesetest beweist nichts über das
   Schreiben. `testConnection()` legt deshalb eine echte Probezeile an
   (`…:rez:selftest:<zufall>`) und räumt sie wieder weg.
12d. **Die Datenbank-Regeln stehen als SQL in der App**, unter *Settings →
   Cloud sync → Database setup* (`SETUP_SQL` in `js/rezept/store.js`, Knopf
   *Copy SQL*). Der Abschnitt klappt bei erkanntem Regel-Fehler von selbst
   auf (`state.rlsBlocked`). Das SQL legt `fx_sync` an, erteilt `anon` die Tabellenrechte, **entfernt
   per `DO`-Block JEDE vorhandene Policy** (eine einzige übrig gebliebene —
   erst recht eine restriktive — blockiert weiter das Anlegen) und setzt eine
   `for all`-Policy — mehrfaches Ausführen ist harmlos. Wer den
   publishable Key hat, kann diese Zeilen lesen und schreiben; das ist die
   Architektur beider Apps (der Schlüssel steht im Browser) und steht als
   Hinweis direkt neben dem SQL.
12e. **Kein stiller Upload-Fehlschlag.** `pushRecipe()` gab im Fehlerfall
   nur `false` zurück — das Verzeichnis ging danach hoch, oben stand
   „Synced", und auf dem zweiten Gerät fehlte das Rezept. Der Fehler landet
   jetzt in `state.lastError`, das Rezept bleibt in `_dirtyRecipes` (nächster
   Versuch) und `flushSync()` meldet „N recipes could not be uploaded: …"
   statt „Synced".
13. **Ungespeicherte Eingaben werden nie kommentarlos verworfen.** Klick
   daneben, Escape und *Cancel* laufen alle über `rezRequestClose()`; bei
   Änderungen erscheint das zentrierte Fenster mit *Discard & close* (rot),
   *Save & close* (grau), *Keep editing* (blau). Im FX Analyst Pro macht
   `MODAL_GUARDS` in `js/main.js` dasselbe — **ein neues Eingabe-Fenster
   gehört dort registriert**, statt eine eigene Sonderlösung zu bauen.

## Die sechs Kategorien

| Kategorie | Was sie tut | Wo im Code |
|---|---|---|
| **Overview** | Today's Meal (= erster Eintrag im Wochenplan für heute), Random Picker, Add New Meal | `renderOverview`, `todayCardHtml`, `randomCardHtml` |
| **Recipes** | Rezept-Raster, Suche/Zeit-/Tag-/Favoritenfilter, Hinzufügen/Bearbeiten/Detail | `renderRecipes`, `renderForm`, `rezOpenDetail` |
| **Inspiration** | Reels/Links/Notizen sammeln, Video einbetten, **Convert to recipe** | `renderInspo`, `rezOpenInspo`, `rezInspoToRecipe` |
| **Week** | Wochenplan Mo–So, Woche vor/zurück, Zutaten in die Einkaufsliste | `renderWeek`, `rezWeekToShopping` |
| **Shopping** | Einkaufsliste, abhakbar, eigene Einträge, aus dem Plan füllen | `renderShopping` |
| **Cooked** | Verlauf mit Bewertung, „Cook again" | `renderCooked` |

**Today's Meal ist bewusst KEIN eigenes Feld**, sondern der erste Eintrag im
Wochenplan für heute (`S.todaysMeal()`). Zwei Wahrheiten würden auseinander-
laufen, sobald jemand die Woche umplant.

**Der Zufallsgenerator meidet standardmäßig alles, was in den letzten sieben
Tagen schon auf dem Tisch stand** — dafür gibt es den Koch-Verlauf. Er zieht
bei mehreren Kandidaten nie zweimal hintereinander dasselbe, sonst wirkt er
kaputt, obwohl der Zufall korrekt ist.

**Ein gemeinsamer Auswahl-Baustein** (`openRecipePicker`) bedient alle
Stellen, die ein Rezept brauchen (Today's Meal, Wochenplan). Beim Anlegen
einer weiteren solchen Stelle zuerst prüfen, ob er passt, statt eine zweite,
leicht andere Liste zu bauen (Regel aus `docs/design-system.md`).

## Reel-Import: was geht und was NICHT

**Der Text eines Instagram-Reels lässt sich aus dem Browser heraus nicht
automatisch holen.** Drei unabhängige Gründe, alle nicht umgehbar:

1. `fetch()` auf `instagram.com` scheitert an CORS — Instagram sendet keinen
   `Access-Control-Allow-Origin`-Header.
2. Die offizielle oEmbed-Schnittstelle verlangt seit 2020 ein
   Meta-Business-Token, also einen eigenen Server mit Anmeldedaten.
3. Der Einbett-Rahmen zeigt das Video zwar, sein Inhalt ist cross-origin —
   Text daraus zu lesen verbietet der Browser.

**Wer das künftig doch automatisieren will, braucht einen Serverdienst**
(z. B. einen GitHub-Actions-Lauf mit Meta-Token), der die Caption holt und in
die Supabase-Zeile schreibt. Ohne den ist jede „automatische" Lösung geraten
— und geraten wird in diesem Projekt nicht.

**Was stattdessen gebaut ist** (`js/rezept/import.js`): der Nutzer fügt
**einmal** den kopierten Beitragstext ein (Link und Caption dürfen im selben
Block stehen), der Rest läuft automatisch:

- `detectLink()` erkennt Instagram, TikTok, YouTube und beliebige Links und
  liefert Einbett- und Öffnen-Adresse.
- `parseCaption()` zerlegt die Caption in **Titel, Dauer, Zutaten, Schritte,
  Tags** — zweisprachig DE/EN, weil Koch-Captions häufig deutsch sind. Zwei
  Wege: mit Überschriften („Zutaten:"/„Zubereitung:") oder, wenn keine da
  sind, nach Form (Mengenangaben = Zutat, Nummerierung = Schritt).
- `captionToRecipe()` baut daraus den Formular-Entwurf; „Convert to recipe"
  öffnet ihn **sichtbar zum Korrigieren**, statt still zu speichern.

**Nichts wird erfunden:** steht keine Dauer in der Caption, bleibt der
Formular-Standard und der Nutzer wählt selbst. Reine Reichweiten-Hashtags
(`#reels`, `#fyp`, `#foodporn`, …) fliegen raus, sonst müllen sie die
Filterleiste zu.

**⚠ Die FORM einer Zeile entscheidet mit, wo die Zutaten aufhören**
(Bugreport 2026-09-02 per Screenshot: *„du siehst die caption wird nicht
richtig zerlegt"*). Reproduziert: eine Caption mit `Ingredients:`, aber **ohne
eigene Überschrift für die Zubereitung**, schrieb die komplette Anleitung als
elfte „Zutat" in die Liste — der Überschriften-Weg lief bis zum Textende, weil
er auf eine nächste Überschrift wartete, die nie kam. Seither gilt zusätzlich:

- `istZutat()` / `istFliesstext()`: eine lange Zeile oder mehrere Sätze
  beenden den Zutaten-Abschnitt, auch ohne Überschrift.
- ⚠ **Zweiter Bugreport am selben Tag** (*„er schreibt die Zubereitung immer
  noch als Ingredient … er erkennt auch Sachen wie enjoy als Ingredient"*):
  die erste Reparatur erkannte nur **lange** Absätze. Reels schreiben die
  Zubereitung aber meist in **kurzen Zeilen** („Sear the chicken for 5
  minutes."), die alle als Zutat durchrutschten. Seither zählt zusätzlich
  (`wirktWieAnweisung()`): eine Zeile, die **auf `.` `!` `?` endet** — Zutaten
  schreibt niemand mit Punkt —, oder die **mit einem Kochverb beginnt**
  (`KOCHVERB`, Deutsch und Englisch, inklusive „enjoy"/„Guten Appetit").
  ⚠ Das Verb zählt **nur am Zeilenanfang**: „Fresh basil to serve" und
  „Petersilie zum Servieren" sind echte Zutaten und müssen Zutaten bleiben —
  als Gegenprobe im Wächter.
- `trenneMehrfach()`: zwei Zutaten in **einer** Zeile werden getrennt
  (`½ tsp black pepper 150 g baby spinach` → zwei Einträge) — passiert, wenn
  beim Kopieren ein Zeilenumbruch verloren geht. ⚠ Nur bei Zeilen, die **mit
  einer Menge beginnen**; in „Bake at 200 C for 25 minutes" wäre Trennen
  falsch. Mengen dürfen dabei mit **Unicode-Bruch** anfangen (`½`, `⅓`, `¾`)
  — die erste Fassung erkannte nur ASCII-Ziffern und ließ genau diese Zeile
  zusammen.
- Ein Anleitungs-Absatz länger als 170 Zeichen wird in Sätze zerlegt, damit
  im Kochmodus lesbare Schritte stehen.

Die Caption aus dem Screenshot steht als Testfall in `check/rezept.js` Stufe H.

**⚠ Beide Parser-Wege gehören geprüft.** Ein Regressionstest hat gezeigt: die
Mengen-Erkennung absichtlich kaputtzumachen blieb unbemerkt, weil die
Test-Caption Überschriften hatte und dieser Weg ohne Mengen auskommt.
`check/rezept.js` Stufe H prüft seither beide Wege plus alle
Dauer-Schreibweisen.

## Was noch fehlt (bewusste Platzhalter)

Stand 2026-09-02: **keine.** `Today's Meal` und `Random Picker` waren bis
REZEPT-CHECK-2 Platzhalter und haben seit REZEPT-CHECK-3 echte Funktion.

Naheliegende nächste Schritte, falls das Thema wieder aufkommt:
- Mengen auf der Einkaufsliste zusammenrechnen. **Bewusst NICHT gebaut:**
  „1 EL Öl" und „200 g Öl" zu addieren wäre geraten. Aktuell wird nur eine
  exakte Wiederholung übersprungen (`normIngredient`).
- Reel-Caption serverseitig holen (siehe oben — braucht Meta-Token).
- Vorratskammer/„was habe ich da" als Gegenstück zur Einkaufsliste.
