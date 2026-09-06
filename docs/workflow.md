# Arbeits-Workflow

Referenziert von `CLAUDE.md`. Details zu den Prüfskripten selbst:
`check/README.md`.

## Agent/Modell-Triage (Nutzer-Wunsch 2026-07-12)

Bei jeder neuen Top-Level-Anfrage zuerst kurz die Komplexität einschätzen,
dann entscheiden, ob und mit welchem Agent/Modell delegiert wird — Ziel:
bestes Ergebnis bei geringstem Tokenverbrauch, nicht Delegation um der
Delegation willen:
- Kleinkram (einzelner Grep, kurzer Fix, ein Log lesen) selbst erledigen —
  ein Sub-Agent-Spawn kostet hier mehr Overhead als er spart.
- Echte Bulk-/Recherche-Teilaufgaben (breite Codebase-Suche, unabhängige
  Parallel-Checks, reine Recherche ohne Syntheseaufwand) an `Explore` oder
  `general-purpose` delegieren.
- Modellwahl nach Schwierigkeit: Haiku für simple/mechanische Suchen, Sonnet
  als Standard, Opus nur wenn wirklich komplexes Urteilsvermögen gebraucht
  wird.

## Vor Code-Änderungen erst das OK des Nutzers einholen (Nutzer-Wunsch 2026-07-21)

Bei einer neuen Anfrage NICHT sofort in `index.html`/den Workflow-Dateien
loseditieren. Stattdessen zuerst den geplanten Ansatz MIT KONKRETEN
BEISPIELEN vorstellen (z. B. Beispiel-Sätze bei Text-/Formulierungs-
Änderungen, Vorher/Nachher-Werte bei Logik-Änderungen, Mockup-Beschreibung
bei UI-Änderungen) und auf die Bestätigung des Nutzers warten, bevor der
Code tatsächlich angefasst wird. Gilt für inhaltliche/funktionale
Änderungen — offensichtliche, eindeutig beschriebene Bugfixes ohne
Interpretationsspielraum sind hiervon nicht automatisch ausgenommen, im
Zweifel lieber einmal zu viel nachfragen als ungefragt loslegen.

**⚠️ Verschärfung 2026-08-21 (Nutzer-Wunsch, nach der als "einfach eine
Menge Grau drauf gepackt" kritisierten Kontrast-Aktion):** vor JEDER
Änderung muss ich zu 95 % sicher sein, dass ich die Anfrage vollständig
und richtig verstanden habe — bei Design-/Geschmacksentscheidungen
ausdrücklich eingeschlossen, nicht nur bei funktionalen Änderungen.
Solange diese Sicherheit nicht erreicht ist, so lange nachfragen (per
`AskUserQuestion`, mit konkreten Optionen/Beispielen/Referenzen statt
offener Fragen), bis sie erreicht ist — dann erst anfangen. Ein einzelner
Bild-Screenshot kann mehrere unabhängige Änderungswünsche gleichzeitig
zeigen (Beispiel dazu: `docs/navigation.md`, "KOYFIN-FARBABGLEICH V2") —
immer in einzelne Fragen zerlegen statt den Umfang aus dem Bild selbst zu
erraten.

## VERSION-CHECK/LIVE-Banner bei JEDER Änderung an `index.html` bumpen

Ausnahmslos, auch bei kleinen/reinen Bugfixes ohne UI-Sichtbarkeit.
Zentriert in derselben Zeile wie das Logo (`.hdr-livebanner`,
`id="verBanner"`), Name/Nummer in `#hlbName` (z.B. `VERSION-CHECK-234`) +
`title`-Tooltip mit Kurzbeschreibung der Änderung hochzählen. Farbe (roter
Punkt/„LIVE"-Text) ist fest, nicht Teil des Änderungssignals. Die eigene
Chat-Antwort muss nach jeder Änderung als LETZTEN Satz explizit nennen,
wie die neue Nummer lautet (z. B. „Aktuelle Version ist jetzt
VERSION-CHECK-243.") — nicht nur im Code bumpen, auch im Chat mitteilen.
Wird zusätzlich von `check/rules.js` erzwungen (siehe `check/README.md`) —
ebenso `SCORE_MODEL_VERSION` (bei Score-Formel-Änderungen, siehe
`docs/score-model.md`) und `SUMMARY_ENGINE_VERSION` (bei
Formulierungs-Logik-Änderungen).

## Bugfixes: IMMER erst reproduzieren, dann dokumentieren (Nutzer-Wunsch 2026-08-31)

Bei jeder Anweisung, einen Bug/Fehler zu beheben: NIE direkt anhand einer
vermuteten Ursache im Code herumdoktern. Erst den gemeldeten Fehler
tatsächlich reproduzieren — per Playwright/Browser-Test, der den falschen
Zustand konkret zeigt (Screenshot/DOM-Wert/Konsolenausgabe), oder ein
kleines Skript, das den falschen Wert nachweist. Reproduktion nennt die
ECHTE Ursache (die Code-Stelle, die es auslöst), nicht nur eine plausible
Theorie — erst danach fixen. Nach dem Fix in `docs/CHANGELOG.md`
dokumentieren: was die konkrete Ursache war (mit Code-Stelle/Zeile) und wie
der Fix verhindert, dass genau dieses Muster nochmal auftritt — nicht nur
"behoben", sondern WARUM es passiert ist, damit ein späterer Blick ins
CHANGELOG das Muster wiedererkennt statt denselben Fehler nochmal zu bauen.
Gilt auch, wenn der Nutzer mehrere Bugs in einer Nachricht gleichzeitig
meldet — jeder einzeln reproduzieren, nicht nur den ersten und den Rest
vermuten.

## KEIN Apostroph in einem `node -e '...'`-Block der Workflow-YAML

Auch nicht im Kommentar. Der gesamte Node-Code steckt in einem
einfach-quotierten Shell-String; ein `'` darin beendet ihn, der Rest wird
als Shell interpretiert und der Schritt stirbt mit
`syntax error near unexpected token '('` (Exit 2). Passiert 2026-08-09
durch einen deutschen Kommentar mit `Japan's`. Der Schritt hat
`continue-on-error`, faellt also nur dadurch auf, dass die erzeugte Datei
fehlt (`ENOENT`) - nicht dadurch, dass der Lauf rot wird. **`node --check`
findet das NICHT** (es prueft den bereits extrahierten JS-Code). Deshalb
nach JEDER Aenderung an einem Workflow-Schritt zusaetzlich
`bash -n <extrahierter run-Block>` laufen lassen, nicht nur
`yaml.safe_load` + `node --check`.

## JS-Syntax-Check vor jedem Push

Von `index.html`: `<script>`-Blöcke extrahieren, zusammenfügen, `node --check`
laufen lassen. Für die Workflow-YAML zusätzlich
`python3 -c "import yaml; yaml.safe_load(...)"` und das eingebettete
Node-Skript via `node --check` prüfen (plus `bash -n` s.o.).

## IMMER auch auf `main` pushen (Nutzer-Wunsch 2026-07-26, nach einem Vorfall)

**⚠ Korrektur 2026-08-24 (vorheriger Absatz nannte nur GitHub Pages als
Live-Deploy — das war unvollstaendig/irrefuehrend):** `main` speist ZWEI
Adressen, nicht nur eine:

- **Die eigentliche Produktionsadresse ist ein Cloudflare Worker**
  (`fx-final.jonathan-fa5.workers.dev`), hinter Cloudflare Access — dort
  kommt zuerst eine E-Mail-Code-Abfrage, danach die App. Das ist die, die
  der Nutzer tatsaechlich benutzt/verlinkt.
- **`jo-brxxn.github.io/FX-final/`** (GitHub Pages) ist ein zweiter,
  UNGESCHUETZTER Mirror, der automatisch und garantiert direkt aus `main`
  ausgeliefert wird — ohne Build-Schritt, jeder Push ist sofort live.
- Wie/ob der Cloudflare Worker selbst bei einem `main`-Push automatisch
  neu deployt, ist aus diesem Repo NICHT ersichtlich — es liegt weder
  `wrangler.toml` noch eine `CNAME`-Datei hier. Nicht raten, im
  Cloudflare-Dashboard nachsehen (Workers & Pages → `fx-final` →
  Deployments), falls das fuer eine Aufgabe relevant wird.
- **Die zehn Daten-JSONs laufen bei BEIDEN Adressen ausserhalb dieses
  Deploy-Mechanismus:** `index.html` (Abschnitt `DATA_BASE`, bei
  `const SK='fxpro_v1'`) holt sie zur Laufzeit per anonymem
  Browser-`fetch()` direkt von `raw.githubusercontent.com` — auf jeder
  Herkunft ausser `github.io`/`localhost`. Voraussetzung dafuer: das
  Repo muss OEFFENTLICH bleiben, sonst liefert der Raw-Endpunkt 404 und
  die App (auch die Worker-Version) bleibt leer, obwohl der Worker selbst
  weiterlaeuft. Details: `docs/CHANGELOG.md`, "Wo die App tatsaechlich
  liegt".

Der Session-Dev-Branch (Name wechselt je Task/Session, z. B.
`claude/new-session-...`) ist NICHT das, was der Nutzer auf der echten
Webseite sieht. Vorfall 2026-07-26: eine ganze Feature-Session
(Retail-Sentiment-Historie) wurde nur auf den Dev-Branch gepusht —
Nutzer meldete "Ich seh nix auf der Webseite", weil `main` unveraendert
blieb. Ab sofort bei JEDEM Push (nicht nur am Ende einer Session): zuerst
`git fetch origin main` + `git merge origin/main` (oder Fast-Forward
pruefen) in den Dev-Branch, dann sowohl auf den Dev-Branch ALS AUCH auf
`main` pushen (`git push origin <dev-branch>` UND
`git push origin <dev-branch>:main` bzw. `git push origin main` nach
einem lokalen Merge/Checkout) — nicht erst fragen, ob das gewuenscht ist,
das ist ab jetzt Standard-Verhalten fuer dieses Projekt.

## Weitere feste Punkte

- **Browser-Verifikation** für UI-Änderungen: lokaler `http.server` +
  Playwright (`/opt/node22/lib/node_modules/playwright`, Chromium). Vor dem
  Rendern `#introOv` und `#lockScreen` entfernen (Intro/PIN-Sperre).
- **Antworten auf Deutsch.**
- Commit-Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` +
  `Claude-Session: …`.
- **`node check/all.js` vor JEDEM Push** (bzw. `--static` für den schnellen
  Teil ohne Browser). Läuft zusätzlich automatisch bei jedem Push
  (`.github/workflows/checks.yml`). Details/volle Liste der Prüfungen:
  `check/README.md`.

## Gezeigte Bugs: der Ablauf (Nutzer-Regel 2026-09-06)

Zeigt der Nutzer einen Fehler — per Screenshot, Beschreibung oder
Sprachnachricht — gilt immer derselbe Ablauf. Kurzfassung steht als Regel 8
in `CLAUDE.md`; hier das Warum.

**1. Reproduzieren, nicht raten.** Den Fehler im Browser herstellen und
messen, bevor eine Zeile geändert wird. Am 2026-09-06 wurde zweimal
hintereinander ein Bugreport zu AUD GDP aus dem Code heraus "erklärt" und
gefixt — und der Nutzer meldete beide Male, dass er noch da ist. Erst die
Messung mit blockiertem Feed zeigte die echte Ursache. Eine aus dem Code
abgeleitete Vermutung ist keine Reproduktion.

**2. Ursache belegen und an der Wurzel beheben.** Beispiel vom selben Tag:
der Refresh-Knopf im COT-Report sass 7px zu tief. Die naheliegende Erklärung
(Ausrichtung fehlt) war falsch — `align-items:center` war gesetzt. Gemessen
war es ein `margin-bottom` AM KIND, der in einer Flex-Zeile die Aussenbox
aufbläht. **Steht an einer Stelle schon ein Einzel-Patch für dasselbe
Problem, lebt die Wurzel noch:** hier war die Kollision bereits dreimal mit
`margin:0` weggepatcht worden (`.data-ctrls`, `.sent-toolbar>`,
`.cot-card-title`), die vierte Stelle war schlicht vergessen worden.

**3. Dokumentieren** mit den Messwerten in `docs/CHANGELOG.md` — nicht nur
"behoben", sondern die Zahlen, an denen man es wiedererkennt.

**4. Fehlerklasse suchen.** Danach gezielt prüfen, wo derselbe Fehler sonst
noch auftreten kann. Beim Legenden-Bug (`:last-child` färbte das einzige
verbliebene Element falsch, wenn der Forecast-Eintrag wegfiel) hiess das:
alle positionsabhängigen Selektoren durchgehen, die eine FARBE setzen, und
prüfen, ob dort ein Element bedingt gerendert wird. Vier weitere Fundstellen
geprüft, alle unkritisch (Elemente immer fest im Markup) — auch dieses
Ergebnis gehört ins Changelog, damit niemand dieselbe Suche zweimal macht.

**5. Wächter ergänzen**, wo die Klasse automatisch prüfbar ist — mit
Gegenprobe, dass er den Fehler wirklich rot meldet. Ein Absatz erinnert
niemanden, ein roter Lauf schon.
