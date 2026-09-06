# Projektkonventionen

## ⚠ ZUERST: dieses Repo liefert ZWEI eigenständige Apps aus

Nutzer-Vorgabe 2026-09-01: *„es sind wirklich zwei verschiedene Apps, also
zwei verschiedene Webseiten … wenn man am FX Analyst Pro arbeitet, sollen
nicht die anderen ganzen Dateien durchgelesen werden und andersrum."*

| App | Einstieg | Code | Doku |
|---|---|---|---|
| **FX Analyst Pro** | `index.html` | `js/*.js` (main, score, calendar, globe, constants, data-feeds, asset-notes-seed) | diese Datei + `docs/*` |
| **Perfect Rezept** | `rezept.html` | `js/rezept/*.js` | **nur** `docs/rezept.md` |

**Bei einer Rezept-Aufgabe: `docs/rezept.md` lesen und sonst nichts** aus der
Tabelle unten — Score-Modell, Datenquellen, Navigation und State-Sync des FX
Analyst Pro sind dort ohne Bedeutung. Umgekehrt genauso: bei einer
FX-Aufgabe ist `docs/rezept.md`/`js/rezept/` irrelevant.

Geteilt wird nur: Repo, `sw.js`, Icons/`manifest.json` und die
Supabase-Zugangsdaten (`fxpro_cloud_cfg`). Welche App beim Öffnen startet,
entscheidet das Auswahlfenster in `index.html`, gemerkt PRO GERÄT in
`localStorage['dmfx_app_choice']` — bewusst nicht gesynct.

**Alles auf der Oberfläche ist Englisch — in BEIDEN Apps** (Nutzer-Regel
2026-09-01, ausdrücklich als Dauerregel gesetzt).

---

# FX Analyst Pro — Projektkonventionen

Die App ist primär eine `index.html` (HTML + CSS + Hauptskript), die seit
2026-08-25 schrittweise in Kategorie-Module (`js/*.js`, ES-Module, KEIN
Build-Schritt) aufgeteilt wird — Details/Vorgehen: `docs/module-split.md`.

**Diese Datei ist ein Router, kein Nachschlagewerk.** Sie sagt, WO etwas
steht, nicht in voller Länge, WAS dort steht. Grund: jedes Detail als Prosa
hier hineinzuschreiben hat die Datei auf ~25% des Kontextfensters
aufgebläht — bei JEDER Aufgabe geladen, auch wenn sie nur eine von zehn
Themenspalten betraf. Die Themendateien werden dagegen nur gezielt per
Read/Grep nachgeschlagen, wenn die jeweilige Aufgabe sie tatsächlich
betrifft.

## Wo was steht

| Thema | Datei |
|---|---|
| Cross-Device-Sync für persistierten State (Muster + gebundene Felder) | `docs/state-sync.md` |
| Score-Modell (Formel, Normierung, Altersgrenze, Stärke 1-10, Versionierung) | `docs/score-model.md` |
| Indikator-Datenquellen (Investing.com/Fallback-Policy, PMI/Trading-Economics-Scraping, Awaiting-Value, allgemeine Daten-Grundsätze) | `docs/data-sources.md` |
| Design-System (Schrift, Typografie-Skala, wiederkehrende UI-Bausteine) | `docs/design-system.md` |
| Navigation/Sidebar/Dashboard-Layout (Koyfin-Umbau, Mehrfach-Dashboards, Klick-/Animationsregeln) | `docs/navigation.md` |
| Arbeits-Workflow (OK einholen, Version-Bump, Push-Regeln, Syntax-Checks) | `docs/workflow.md` |
| Modul-Aufteilung von `index.html` in `js/*.js` (Vorgehen, window-Bruecke, AST-Verifikation) | `docs/module-split.md` |
| Prüfskripte (`check/*.js`), was sie prüfen und warum | `check/README.md` |
| Volle Änderungshistorie (jeder Bugfix/jede Iteration mit Datum) | `docs/CHANGELOG.md` |
| **Perfect Rezept (die andere App)** — Trennung, Datenmodell, Bild-Budgets, Themes | `docs/rezept.md` |

Bei einem Bugreport, der nach einem bekannten Muster riecht, oder um zu
prüfen, ob eine Entscheidung schon bewusst getroffen wurde: gezielt in der
passenden Datei (oder `docs/CHANGELOG.md`) nachschlagen, nicht raten.

## ⚠️ Die Regeln, die IMMER gelten (deshalb hier statt in einer Themendatei)

1. **Persistenter State → Cross-Device-Sync, nie nur `localStorage`.** Jeder
   neue Zustand, den ein Nutzer ändern kann und der erhalten bleiben soll,
   MUSS geräteübergreifend synchronisiert werden. Muster + gebundene Felder:
   `docs/state-sync.md`.
2. **Vor Code-/Design-Änderungen erst das OK des Nutzers einholen.** 95%
   sicher sein, dass die Anfrage vollständig verstanden ist — bei
   Design-/Geschmacksentscheidungen ausdrücklich eingeschlossen. Sonst per
   `AskUserQuestion` mit konkreten Optionen nachfragen. Details:
   `docs/workflow.md`.
3. **VERSION-CHECK-Nummer bei JEDER `index.html`-Änderung bumpen** (bzw.
   **REZEPT-CHECK bei jeder Änderung an `rezept.html`/`js/rezept/*`**) — auch bei
   kleinen Bugfixes ohne UI-Sichtbarkeit — und die neue Nummer als letzten
   Satz der Chat-Antwort nennen. Bei Score-Formel-Änderungen zusätzlich
   `SCORE_MODEL_VERSION`, bei Formulierungs-Logik `SUMMARY_ENGINE_VERSION`.
   Erzwungen von `check/rules.js`. Details: `docs/workflow.md`.
4. **Nie schätzen/raten/hart eintragen.** Fehlt ein echter Wert aus einer
   Live-Quelle, erzeugt das eine Dashboard-Meldung statt eines geschätzten
   Werts. Policy-Details: `docs/data-sources.md`.
5. **`node check/all.js` vor jedem Push** (bzw. `--static` für den schnellen
   Teil ohne Browser). Details: `check/README.md`.
6. **Jedes Bedienelement muss auch wirklich etwas tun.** Ein Button, dessen
   Handler auf keine (exportierte) Funktion zeigt, wirft beim Klick still ein
   `ReferenceError` und sieht für den Nutzer einfach kaputt aus — bei
   ES-Modulen der häufigste Grund dafür ist eine vergessene Zeile in der
   `window`-Brücke. Ebenso gilt: **kein Speicher-/Schreibpfad ohne
   `try/catch` mit sichtbarer Meldung** — eine unbehandelte
   Promise-Rejection sieht für den Nutzer exakt aus wie „die App macht
   nichts". Beides wird geprüft (`check/structure.js` für den FX Analyst
   Pro, `check/rezept.js` für Perfect Rezept).
7. **Immer auch auf `main` pushen** (das ist der Branch, der die
   Produktivadresse — ein Cloudflare Worker hinter Cloudflare Access,
   NICHT primär GitHub Pages — sowie den ungeschützten GitHub-Pages-Mirror
   speist; nicht der Session-Dev-Branch). Details: `docs/workflow.md`.
8. **Gezeigte Bugs immer nach demselben Ablauf** (Nutzer-Regel 2026-09-06,
   ausdrücklich als Dauerregel gesetzt — gilt für Screenshots, beschriebene
   Fehler und Sprachnachrichten gleichermaßen):
   1. **Reproduzieren, nicht raten.** Den Fehler im Browser herstellen und
      MESSEN (Playwright, Bounding-Boxen, `getComputedStyle`), bevor
      irgendeine Zeile geändert wird. Eine aus dem Code abgeleitete
      Vermutung ist keine Reproduktion.
   2. **Ursache belegen.** Erst wenn die Messung die Ursache zeigt, wird
      korrigiert — und zwar an der Wurzel, nicht am Symptom. Steht an einer
      Stelle schon ein Einzel-Patch für dasselbe Problem, ist das ein
      Hinweis, dass die Wurzel noch lebt.
   3. **Dokumentieren** mit den Messwerten in `docs/CHANGELOG.md`.
   4. **Fehlerklasse suchen.** Danach gezielt prüfen, wo derselbe Fehler
      sonst noch auftreten kann, und die Fundstellen mitbeheben.
   5. **Wächter ergänzen**, wo die Klasse automatisch prüfbar ist
      (`check/`) — mit Gegenprobe, dass er den Fehler wirklich rot meldet.

## Meta-Grundsatz: wo eine neue Regel hingehört

**Jede dauerhafte Nutzer-Präferenz muss dokumentiert werden** (Nutzer-Wunsch
2026-07-12) — bei Unsicherheit, ob dauerhaft oder einmalig gemeint: lieber
dokumentieren als auslassen. Faustregel für WOHIN:
- **"Gilt das ab jetzt immer?"** → kompakte Regel in die passende
  Themendatei aus der Tabelle oben (oder, falls sie an keine bestehende
  Themendatei passt, kurz hier in `CLAUDE.md`).
- **"So kam es dazu?"** (Datum, was ausprobiert wurde, Screenshots,
  Messwerte) → `docs/CHANGELOG.md`.
- **Eine neue Konvention, die man automatisch prüfen kann** → als Prüfung
  nach `check/` (siehe `check/README.md`) statt als Absatz irgendwo. Ein
  Absatz erinnert niemanden; ein roter Lauf schon.

## Sprache

**Antworten auf Deutsch. Die Oberfläche beider Apps ist Englisch** — jeder
neue Text, jedes neue Label, jede neue Meldung wird auf Englisch geschrieben,
ohne Rückfrage (Nutzer-Regel 2026-09-01).

**⚠ Deutsche Begriffe des Nutzers werden automatisch übersetzt** (Nutzer-Regel
2026-09-01, wörtlich: *„selbst wenn ich dir deutsche Begriffe nenne übersetz
sie automatisch"*). Nennt der Nutzer eine Kategorie „Zufallsgenerator", einen
Button „Weiterbearbeiten" oder eine Karte „Heutiges Essen", steht in der App
`Random Picker`, `Keep editing`, `Today's Meal` — **ohne Rückfrage**, es ist
keine Interpretationsentscheidung. Die deutsche Formulierung des Nutzers
gehört in den Code-Kommentar bzw. ins `docs/CHANGELOG.md`, damit später
nachvollziehbar bleibt, was gemeint war; auf der Oberfläche erscheint sie nie.
Das gilt auch für Beschriftungen, die aus einem Screenshot oder einer
Sprachnachricht übernommen werden.

## Berichte gehoeren in den Chat

**Keine Artifact-/Befund-Dateien fuer Analysen und Berichte** (Nutzer-Wunsch
2026-08-23: *"warum schickst du mir so eine Befund datei. Das kannst du auch
einfach als Chat Nachricht machen"*). Auch ein umfangreicher Befund mit
Tabellen und Messwerten wird als Chat-Antwort geschrieben, nicht als eigene
Seite verlinkt. Artifacts nur, wenn der Nutzer ausdruecklich danach fragt.
