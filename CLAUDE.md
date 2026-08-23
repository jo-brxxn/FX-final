# FX Analyst Pro — Projektkonventionen

Die App ist eine einzelne `index.html` (HTML + CSS + JS in einem File).

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
| Prüfskripte (`check/*.js`), was sie prüfen und warum | `check/README.md` |
| Volle Änderungshistorie (jeder Bugfix/jede Iteration mit Datum) | `docs/CHANGELOG.md` |

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
3. **VERSION-CHECK-Nummer bei JEDER `index.html`-Änderung bumpen** — auch bei
   kleinen Bugfixes ohne UI-Sichtbarkeit — und die neue Nummer als letzten
   Satz der Chat-Antwort nennen. Bei Score-Formel-Änderungen zusätzlich
   `SCORE_MODEL_VERSION`, bei Formulierungs-Logik `SUMMARY_ENGINE_VERSION`.
   Erzwungen von `check/rules.js`. Details: `docs/workflow.md`.
4. **Nie schätzen/raten/hart eintragen.** Fehlt ein echter Wert aus einer
   Live-Quelle, erzeugt das eine Dashboard-Meldung statt eines geschätzten
   Werts. Policy-Details: `docs/data-sources.md`.
5. **`node check/all.js` vor jedem Push** (bzw. `--static` für den schnellen
   Teil ohne Browser). Details: `check/README.md`.
6. **Immer auch auf `main` pushen** (das ist der von GitHub Pages live
   deployte Branch, nicht der Session-Dev-Branch). Details: `docs/workflow.md`.

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

**Antworten auf Deutsch.**

## Berichte gehoeren in den Chat

**Keine Artifact-/Befund-Dateien fuer Analysen und Berichte** (Nutzer-Wunsch
2026-08-23: *"warum schickst du mir so eine Befund datei. Das kannst du auch
einfach als Chat Nachricht machen"*). Auch ein umfangreicher Befund mit
Tabellen und Messwerten wird als Chat-Antwort geschrieben, nicht als eigene
Seite verlinkt. Artifacts nur, wenn der Nutzer ausdruecklich danach fragt.
