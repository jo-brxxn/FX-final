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
4. **Farben nur über die Theme-Tokens.** Vier braune Paletten (`clay`,
   `mocha`, `paper`, `sand`), umschaltbar unter *Settings → Appearance*, je
   zwei CSS-Blöcke (heller Inhalt + dunkler Chrome-Bereich). Ein Theme-
   Wechsel ist ein reiner Token-Tausch — **nie eine Einzelstelle einfärben**.
5. **Bild ist Pflicht, Text ist freiwillig** (Nutzer-Wunsch: *„Wichtig ist,
   dass man immer Bilder macht, aber man kann auch Text schreiben"*).
6. **Löschen = Papierkorb, 30 Tage** (`TRASH_DAYS`), Wiederherstellung unter
   *Settings → Trash* — gleiches Muster wie die Research-Notizen im FX
   Analyst Pro.
7. **Overlays gehören an den `body`** (`position:fixed`), nicht in den
   scrollenden Modal-Container — sonst werden sie am Rand abgeschnitten
   (`.rd-menu`, siehe `docs/design-system.md`).
8. **Dauer in 5-Minuten-Schritten** (`DURATIONS`, 5–180 min, darüber 4/5/6 h).

## Was noch fehlt (bewusste Platzhalter)

`Today's Meal` und `Random Picker` auf der Overview sind ausdrückliche
Platzhalter (Nutzer: *„Mach nur einen Platzhalter hin. Die Funktion kommt
noch."*). Sie zeigen bewusst KEINEN erfundenen Inhalt — das entspricht auch
der Projektregel „nie schätzen/raten/hart eintragen". Beim Ausbau: der
Zufallsgenerator kann über die bereits vorhandenen Tags gefiltert werden.
