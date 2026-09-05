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
`newsSeenTs`, `denseMode`, `assetAnimEnabled` (und die drei weiteren
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
