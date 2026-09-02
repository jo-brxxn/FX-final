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
