# Cross-Device-Sync für persistierten State

Referenziert von `CLAUDE.md` — dortige Kernregel: **jeder neue Zustand, den
ein Nutzer ändern kann und der erhalten bleiben soll, muss geräteübergreifend
synchronisiert werden**, nicht nur in `localStorage` abgelegt werden. (Genau
dieser Fehler ist bei `tabStacks` einmal passiert: nur localStorage → kam
nicht auf anderen Geräten an.)

## Beim Anlegen von neuem persistentem State IMMER prüfen/anbinden

1. **Gehört es in `snap()`?** `snap()` (≈ Zeile 2855) serialisiert den Kern-State
   und wird für Speichern, Undo UND Cloud-Sync genutzt. Wenn der State ins
   Undo/in den normalen Save gehört → Feld zu `snap()` UND `applySnap()`
   hinzufügen. Fertig (Sync läuft dann automatisch mit).

2. **Soll es NICHT ins Undo (UI-Präferenz, Flags)?** Dann nach dem Muster von
   `greenDismissed` / `tabStacks` anbinden — alle vier Stellen:
   - **`cloudPush`** (≈ 3049): `data.<feld>=<feld>;`
   - **`cloudPull`** (≈ 3093): `if(cd.<feld>){<feld>=cd.<feld>; localStorage.setItem(...); <neu rendern>;}`
   - **Save-Funktion des Felds**: `localStorage.setItem('fxpro_updated', new Date().toISOString());`
     und `cloudAutoSync();` aufrufen, damit die Änderung als neue Version in die
     Cloud geht. (Die *Default*-Anlage bleibt rein lokal, ohne Sync-Anstoß.)
   - **`exportData`** (≈ 2989) und **`importData`** (≈ 2993): Feld mit
     exportieren bzw. beim Import anwenden.

Der Sync vergleicht Versionen über `fxpro_updated` (Gleichheits-Check gegen
`fxpro_cloud_seen`). Wenn eine Änderung `fxpro_updated` nicht bumpt, propagiert
sie NICHT — deshalb in der Save-Funktion bumpen.

Nach diesem Muster angebundene Felder: `greenDismissed`, `tabStacks`,
`compactLevel` (+Legacy-Boolean `compactView`), `pinEnabled`, `designHue`
(Designer/🎨: null = Auto-Risk-Sentiment-Färbung der Aurora, Zahl 0–360 =
Nutzer-Farbton; beim Pull `!==undefined`-Check, damit auch "zurück auf
Auto" = null ankommt), `setupCcyFilter`/`setupFxOnly`
(Set-ups-Waehrungsfilter/FX-Quick-Filter), `calHighOnly`/`calCcyFilter`
(Kalender-Filter), `telegramEnabled`,
`newsSeenTs`, `denseMode`, `appBg` (Hintergrund-Wahl: leer = Current,
sonst `white`/`marble-light`/`marble-vivid`/`marble-dark`; ⚠ die erlaubten
Werte stehen doppelt — in `APP_BGS` in `js/main.js` und in der Frueh-Weiche
im `<head>` von `index.html`, die den Wert setzen muss, BEVOR die erste
CSS-Regel greift), `assetAnimEnabled` (und die drei weiteren
Animations-Schalter aus demselben Vier-Schalter-Satz), `dashboards`/
`activeDashId` (siehe `docs/navigation.md`, Mehrfach-Dashboards — laufen
über `snap()`/`applySnap()`, kein manuelles Wiring nötig). Details/
Fundgeschichte einzelner Felder ggf. in `docs/CHANGELOG.md` nachschlagen.

## Sonderfall `scoreHist`: Merge statt Overwrite

**`scoreHist` (Score-Verlauf für Trends/History, Stand 2026-07-20) ist ein
Sonderfall des Musters:** normalerweise gewinnt beim Pull einfach der
Cloud-Stand (`cd.<feld>` übernehmen). Bei `scoreHist` würde das aber Historie
LÖSCHEN, weil zwei Geräte typischerweise DISJUNKTE Tage angesammelt haben
(jedes Gerät schreibt nur Tage, an denen es tatsächlich offen war) — ein
simples Overwrite hätte genau den gemeldeten Bug verursacht (Handy nur 2 Tage
Historie, obwohl das iPad viel mehr hatte). Deshalb **`mergeScoreHist(base,
override)`** (bei `SCOREHIST_KEY`, ≈ Zeile 8688): vereinigt beide Objekte je
Symbol nach Datum, `override` gewinnt nur bei einer echten Datums-Kollision
(typischerweise "heute", falls beide Geräte am selben Tag schon einen
Eintrag geschrieben haben — dann gewinnt der lokale, weil der gerade frisch
per Live-Feed korrigiert wurde). Bei künftigen `scoreHist`-artigen Feldern
(Log/Historie, die auf mehreren Geräten UNABHÄNGIG voneinander waechst)
immer prüfen, ob ein Merge statt Overwrite nötig ist, statt blind dem
Standard-Muster zu folgen. Die Save-Funktion ist hier `recordScoreHist()`
selbst (nicht `save()`, da `scoreHist` bewusst außerhalb von `snap()` liegt
und `save()`s eigener Change-Diff es daher nicht automatisch erkennt) —
bumpt `fxpro_updated`+ruft `cloudAutoSync()` selbst auf, wenn sich etwas
geändert hat.

## Sonderfall `research`/`researchFolders` (Notizen/Ordner/Papierkorb): Merge statt Overwrite + `navigator.locks`

**Zweiter Sonderfall genau der Art, vor der der `scoreHist`-Abschnitt oben
warnt** (Nutzer-Bugreport 2026-09-01, zweimal hintereinander gemeldeter
Notiz-Datenverlust, per Playwright reproduziert): `research.notes`/
`research.trash`/`researchFolders` liegen zwar in `snap()`/`applySnap()`
(laufen also grundsätzlich automatisch mit), litten aber am selben Problem
wie `scoreHist` vor dessen Merge-Fix — zwei Tabs/Geräte können UNABHÄNGIG
voneinander neue Notizen anlegen, ein simples Overwrite bei
`adoptExternalState()`/`cloudPull()` hätte die jeweils andere Seite gelöscht.
Fix, zwei Ebenen:

1. **`mergeResearchNotes(base,override)`/`mergeResearchFolders(base,override)`/
   `mergeResearchTrash(base,override)`** (neben `mergeScoreHist`, ≈ Zeile
   11170): Vereinigung nach `id`, bei einer Notiz-Kollision gewinnt die
   zuletzt bearbeitete (`n.up`). Angewendet in `applySnap()` (nur für die
   PASSIVEN Sync-Pfade, `_flipCauseTag==='sync'` — Undo/Redo/Backup-Restore/
   Import bleiben bewusst echter Overwrite) UND zusätzlich direkt im
   Schreibpfad von `save()`/`cloudPull()` gegen den GERADE AUF DER PLATTE
   stehenden Inhalt, unmittelbar vor dem eigentlichen Schreiben.
2. **`navigator.locks`** (Web Locks API, `save()`/`cloudPull()`, Lock-Name
   `'fxpro_sync_lock'`): selbst ein "lies Disk, merge, schreib"-Ablauf OHNE
   echte Sperre lässt eine kleine, aber unter Last (per Playwright mit
   künstlich hoher Hintergrund-Save-Frequenz reproduzierbar) reale Lücke
   zwischen zwei GLEICHZEITIG schreibenden Tabs. `navigator.locks.request()`
   serialisiert den kompletten Lese-Merge-Schreib-Zyklus ECHT über alle Tabs
   desselben Ursprungs hinweg (seit 2022 breit unterstützt: Chrome/Edge 69+,
   Firefox 96+, Safari 15.4+), Fallback (kein `navigator.locks`): der alte,
   direkte synchrone Ablauf. **Wichtig, falls das Muster auf ein neues Feld
   übertragen wird:** die Sperre schützt nur, wenn WIRKLICH JEDER Schreiber
   denselben Lock-Namen benutzt — ein "nur für automatische Saves gesperrt,
   frische Nutzer-Edits bleiben ungesperrt"-Kompromiss (erste, per Playwright
   widerlegte Fassung dieses Fixes) lässt die Race weiter offen, weil beide
   Seiten sich gegenseitig unterlaufen können.

Details/Reproduktionsmethode: `docs/CHANGELOG.md`, Einträge vom 2026-09-01.

## `markPrefEdit()` in der Save-Funktion nicht vergessen

**Zusätzlich in der Save-Funktion `markPrefEdit()` aufrufen** (2. Ursache des
"Hide-Button springt zurück"-Bugs, gefixt 2026-07-07): Ohne das Flag stuft die
optimistische Versionsprüfung in `cloudPush()` den Toggle als "nur
Auto-Refresh" ein, ersetzt den Push durch einen Pull und zieht die alte
Cloud-Stufe drüber, sobald irgendein anderes Gerät zwischen Toggle und
1,5-s-Push gepusht hat. `cloudPull` lässt bei gesetztem Pending-Flag die
lokalen Präferenz-Felder (Kompakt-Stufe, designHue) in Ruhe und schiebt sie
danach als neue Version hoch; ein MANUELLER Download übernimmt weiter alles.

## Regel: was nur ein Live-Feed füllt, muss nach `applySnap()` neu darübergelegt werden

`applySnap()` ist der EINE gemeinsame Trichter für Cloud-Sync, Undo/Redo,
Backup-Restore und Import — und er ersetzt `syms` **komplett** durch den
Snapshot. Alles, was normalerweise erst ein Feed-Abruf in `syms` hineinschreibt,
ist danach also auf dem Stand des Snapshots, nicht auf dem der Quelle.

Betroffen sind heute vier Feeds mit ihren Zielfeldern:

| Feed | `apply*`-Funktion | schreibt in |
|---|---|---|
| `ind_data.json` | `applyIndDataFeed()` | `ind.research`, `ind.chartHist`, `ind.valHist`, Bias |
| `bond_data.json` | `applyBondDataFeed()` | `ind.research` der Renditen |
| `cot_data.json` | `applyCotDataFeed()` | `ind.research` der COT-Indikatoren |
| `sentiment_data.json` | `applySentimentFeed()` | `ind.research` der Sentiment-Indikatoren |

Deshalb ruft `applySnap()` seit VERSION-CHECK-472 `reapplyLiveFeeds()` direkt
vor `recomputeAuto()` auf. **Kommt ein fünfter Feed dazu, der in `syms`
schreibt, gehört er dort hinein** — sonst zieht der nächste Cloud-Pull die App
still auf einen alten Stand zurück, und zwar sichtbar als „OUT OF DATE" plus
leerem Verlaufschart (so 2026-09-06 an AUD GDP gemeldet, siehe
`docs/CHANGELOG.md`).

Voraussetzung, damit der Aufruf in jedem Pfad unschädlich bleibt: jede
`apply*`-Funktion muss **idempotent** sein und mit `false` aussteigen, solange
ihr Feed nicht geladen ist (`if(!X_FEED)return false`) — ein Import auf einem
frisch geöffneten Tab darf nichts kaputtmachen.

## `btReasons` (Backtester: „Decisive factor") — Fall 1, über `snap()`

Die selbst geschriebenen Begründungen je Zinsentscheid laufen über
`snap()`/`applySnap()` und brauchen deshalb **kein** manuelles Sync-Wiring —
Cloud-Sync, Undo/Redo, Export und Import laufen automatisch mit.

Schlüssel ist **Währung + Datum** (`btReasonKey`), nicht Asset + Datum: der
Grund gehört zur Entscheidung, und Gold, die Yields und die Indizes spiegeln
dieselbe Notenbanksitzung wie ihre verbundene Währung.

Zwei Feinheiten, die beim Anfassen leicht kaputtgehen:

- `btReasonText()` prüft auf **`undefined`**, nicht auf Wahrheitswert. Ein
  leeres eigenes Feld ist eine Entscheidung des Nutzers und muss den
  recherchierten Seed schlagen; mit einem Wahrheitswert-Check käme der Seed
  zurück, sobald jemand das Feld leert.
- Setzt der Nutzer den Text exakt auf den Seed-Text, **löscht**
  `setBtReason()` den Eintrag. Sonst friert eine spätere Korrektur der
  Recherche für diesen Nutzer für immer ein.

## Seed-Notizen stehen NICHT im gespeicherten Zustand (seit 2026-09-07)

Die 1.440 mitgelieferten Verhaltensnotizen (`js/asset-notes-seed.js`) werden
bei jedem Start neu erzeugt und von `researchForSnap()` aus `snap()`
herausgefiltert. Grund: gemessen 679 KB von 1.421 KB — 48 % des Zustands, der
sonst in `localStorage`, jeden Cloud-Push, jede Sicherungskopie und bis zu 60
Undo-Schritte kopiert wurde.

Was der Nutzer an einer Seed-Notiz tut, überlebt über **drei** Wege — alle drei
müssen halten, sonst geht eigene Arbeit verloren:

| Aktion | wo es landet |
|---|---|
| **bearbeiten** | `saveResNote` macht `delete n.seed` → normale eigene Notiz, voll gespeichert. `replacesSeed` merkt die Id des Originals, damit die Seed-Fassung nicht zusätzlich erscheint. |
| **anpinnen / favorisieren** | `seedNoteFlags[id] = {pin,fav}` — löscht das seed-Flag nicht, braucht also einen eigenen Platz |
| **löschen** | `seedNoteFlags[id] = {del:true}` — sonst ist sie beim nächsten Start wieder da |

Drei Fallstricke, die beim Bau je einen echten Datenverlust erzeugt haben:

1. **Die Id muss aus dem Seed kommen, nicht aus dem Zustand.**
   `seedNoteId()` benutzt den Index **innerhalb der Bias-Gruppe**. Der erste
   Wurf nahm `r.notes.length` — sobald der Nutzer eine eigene Notiz hatte,
   verschoben sich alle folgenden Ids, Pins zeigten ins Leere.
2. **`applySeedNoteFlags()` läuft NACH dem Laden**, weil `seedNoteFlags` in
   `applySnap()` später zugewiesen wird als `research` erzeugt wird.
3. **Neue Felder in `snap()` müssen auch in `loadState()` gelesen werden.**
   `loadState()` weist einzeln zu, `applySnap()` übernimmt einen Snapshot —
   wer nur eine der beiden Stellen ergänzt, merkt beim Speichern nichts und
   verliert den Wert beim nächsten Start. Geprüft vom sechsten Netz in
   `check/structure.js`.

## Was NICHT in den Schnappschuss gehört

Zwei Dinge werden bewusst **nicht** gespeichert, obwohl sie im Zustand stehen:

| Feld | Warum nicht | Gemessen |
|---|---|---|
| mitgelieferte Notizen (`n.seed`) | stehen ohnehin im Code, siehe `researchForSnap()` | −679 KB (2026-09-05) |
| `ind.chartHist` | reine Feed-Ableitung, `adoptChartHist()` baut sie bei jedem Start neu auf | −258 KB von 748 KB, 35 % (2026-09-07) |

Beides läuft über `snap()`: die Notizen über `researchForSnap()`, die
Chart-Historie über `SNAP_REPLACER` (ein JSON-Replacer, der den Schlüssel
`chartHist` überall verwirft — kein Kopieren des Baums nötig).

**Regel daraus:** ein Feld, das bei jedem Start ohnehin aus einer Quelle neu
entsteht, gehört nicht zusätzlich in localStorage, in jeden Cloud-Push, in
jede Sicherungskopie und in 60 Undo-Schritte. Prüfen lässt sich das an einer
Frage: *Ginge etwas verloren, das der Nutzer selbst getan hat?* Bei
`chartHist` lautet die Antwort nein — nach `applySnap(snap())` sind alle 346
Reihen mit 10 746 Punkten wieder da (`reapplyLiveFeeds()`), und kein Score
ändert sich. Was der Nutzer an mitgelieferten Notizen getan hat, steht dagegen
in `seedNoteFlags` — winzig, aber gespeichert.
