# Navigation, Sidebar & Dashboard-Layout (Koyfin-Umbau)

Referenziert von `CLAUDE.md`. Chronologische Iterationsgeschichte des
Koyfin-Stil-Umbaus (dunkle Sidebar, Header V2, Mehrfach-Dashboards,
Abstands-Skala, Klick-/Animationsregeln) inkl. der dabei gefundenen
Layout-Bugs und Waechter-Erweiterungen. Für Schrift/Typo-Skala/generische
UI-Bausteine siehe `docs/design-system.md`.

## ⚠ NAVIGATION: dunkle Koyfin-Sidebar statt horizontaler Tab-Leiste

Nutzer-Wunsch per `/goal`, mit drei Koyfin.com-Screenshots als Referenz
(WebFetch war fuer praktisch jede externe Domain in dieser Umgebung
`EGRESS_BLOCKED` - org-weite Netzwerk-Policy, kein CLI/MCP-Problem; der
Nutzer hat die Screenshots stattdessen direkt in den Chat geschickt).
Wörtlich: "schwarz aussenrum machen, innendrin weiss, den Marmor-Look im
Hintergrund beibehalten, Kategorien links untereinander".

**Umsetzung:** die horizontale `.tabbar` ist komplett durch eine vertikale
`#navSidebar` ersetzt (App-Shell-Umbau: `.hdr` bleibt oben durchgehend,
darunter liegen `#navSidebar` und `#pageArea` als Flex-Row nebeneinander -
alle 17 `pgXxx`-Seiten stecken jetzt in `#pageArea` statt direkt in
`<body>`). Icon je Tab (`TAB_ICONS`, Feather/Lucide-Stroke-Stil), aktiver
Eintrag ueber blauen linken Rand + blaues Icon + fette weisse Schrift.

**⚠ Dunkle Farbgebung NUR ueber gescopte CSS-Variablen-Ueberschreibung**,
nicht durch Anfassen einzelner Stellen: `.hdr,#navSidebar{--bg0:...;--t0:...;
...}` ueberschreibt die Palette-Variablen NUR innerhalb dieses Teilbaums -
jede der rund 200 Stellen, die bereits `var(--t0)`/`var(--bg3)`/... nutzt,
faerbt sich dadurch automatisch um. Ohne dieses Muster haette jede Buchse
(Buttons, Icons, Logo, Live-Banner, Profil-Avatar) einzeln anfasst werden
muessen. **Bei kuenftigen dunklen/hellen Teilbereichen zuerst pruefen, ob
ein solcher gescopter Variablen-Override reicht**, bevor Einzelstellen
angefasst werden.

Der bestehende Tab-Stack-Mechanismus (`tabStacks`, drag-to-reorder,
`openStackMenu` als Flyout) ist FUNKTIONAL unveraendert geblieben - nur
`renderTabBar()` zielt jetzt auf `#navSidebar` statt `#tabbar` und baut
`.np`-Buttons (Icon+Label) statt `.tp`-Buttons, und `openStackMenu()`
oeffnet das Flyout jetzt RECHTS neben dem Stack-Button statt darunter
(mit Ruecksprung auf "darunter", wenn rechts kein Platz mehr ist) - passt
zu einer vertikalen statt horizontalen Leiste. `.tab-menu`/`.tab-menu-item`
selbst bleiben bewusst HELL (werden per `document.body.appendChild()`
ausserhalb von `#navSidebar` gerendert, erben die dunklen Variablen also
nicht) - ein helles Flyout ueber einer dunklen Sidebar-Kante ist auch bei
Koyfin selbst das uebliche Muster, kein Fehler. (`openStackMenu` wurde in
einer spaeteren Iteration durch ein Inline-Akkordeon ersetzt, siehe unten.)

**Mobile (<760px, Nutzer-Entscheid):** Sidebar wird zu einer reinen 56px-
Icon-Leiste (`.np-lbl{display:none}`), Labels bleiben nur noch als
`title`-Tooltip erreichbar. Bewusst NICHT gewaehlt: Hamburger-Drawer oder
Bottom-Nav (beide waeren groesserer Umbau bzw. zusaetzliche zweite
Nav-Struktur).

**Marmor-Hintergrund bleibt unveraendert** im Content-Bereich (`#pageArea`
setzt keinen eigenen Hintergrund, `body{background-image}` scheint weiter
durch) - nur `.hdr`/`#navSidebar` sind jetzt opak dunkel und verdecken ihn
dort. Bias-Farben (Blau=bullish/Rot=bearish) und der Kartenrand-Wert aus
der Kontrast-Korrektur (V400, 1.58:1) sind unveraendert - reine
Navigations-/Chrome-Aenderung, keine neue Kontrast-Iteration.

## ⚠ NAVIGATION/HEADER V2: Feinschliff nach dem ersten Koyfin-Umbau

Direkt im Anschluss an die dunkle Koyfin-Sidebar kam eine lange, konkrete
Punktliste vom Nutzer per `/goal` - Kernaenderungen, die bei kuenftigen
Aufgaben zu beachten sind:

**Inbox komplett entfernt** (nicht nur ausgeblendet): Button, Badge,
Modal, UND der komplette Postfach-Code - `mkEventNotif`/`syncEvtNotifs`,
`mkScoreNotif`/`syncIndNotifs`, `pruneInbox`, `updInboxBadge`, `openInboxM`,
`renderInbox`, `gotoIndicatorByNotif`, `delInboxItem`, `clearInbox`, das
`inbox`-Array aus `snap()`/`applySnap()`/beiden Initialisierungen/
`cloudPull`. **Wichtig fuer kuenftige "entfern X komplett"-Auftraege:** so
ein Feature ist oft an mehr Stellen verdrahtet als der sichtbare Button -
IMMER nach dem Datenfeld selbst suchen (hier: `inbox`), nicht nur nach dem
UI-Einstiegspunkt. Zwei Nachbar-Features blieben bewusst stehen, weil nicht
explizit genannt: `eventAlerts`/`priceAlerts` (Alarm-KONFIGURATION, feuert
weiterhin serverseitig per Telegram) und das Dashboard-"notification"-
Widget (zeigt weiterhin COT/Stale/Awaiting-Popups, nur der `inbox`-
gespeiste `evtRows`-Teil ist raus, da er nach der Inbox-Entfernung ohnehin
nie mehr etwas liefern konnte).

**Kopfzeile jetzt EINE Reihe** (`display:flex` statt 2-Zeilen-Grid): Logo
→ `.hdr-search` (breites Suchfeld links, Koyfin-Referenz, oeffnet weiter
dasselbe `#mSearch`-Modal) → `.hdr-status` (Saved + Live-Banner, direkt
nebeneinander) → `.hdr-r` (Undo/Redo/Help/Settings, `margin-left:auto`
haelt sie rechts). Die Bull/Bear/Neutral-Zaehlzeile (`updateStat()`,
`#statLine`) ist ersatzlos raus. "Data" (Export/Import/Backups) ist kein
eigenes Header-Dropdown mehr, sondern die erste Zeile im vormaligen
"☁ Cloud Synchronization"-Modal (`#mCloud`), das jetzt schlicht
"⚙ Settings" heisst - Cloud-Sync ist darin nur noch EIN Abschnitt
(eigene `<h3>☁ Cloud Sync</h3>`-Zwischenueberschrift). Bei kuenftigen neuen
Einstellungen: hier rein, nicht wieder einen eigenen Header-Button bauen.

**Sidebar-Breite passt sich dem Inhalt an** statt eines festen Werts:
`#navSidebar{width:max-content;min-width:150px;max-width:230px}` +
`.np{width:100%}` auf den Kindern - der Container sizet sich auf die
intrinsische Breite des breitesten Labels, alle anderen strecken sich
exakt darauf. Standardmuster fuer "Spalte so breit wie noetig, nicht
mehr" - bei kuenftigen aehnlichen Wuenschen (Sidebar, Dropdown-Breite)
zuerst pruefen, ob dieses Muster reicht, bevor ein fester Pixelwert
geraten wird. (Spaeter praezisiert, siehe "NAV-LEISTE: konstante Breite"
unten - die Breite darf sich beim Bedienen nicht mehr NACHTRAEGLICH
aendern.)

**"Insights" (und jeder andere Tab-Stapel) klappt jetzt INLINE auf**,
nicht mehr als Flyout: `renderTabBar()` haengt bei offenem Stapel die
Mitglieder-Buttons (`.np-sub`, kleinere Schrift, eingerueckt) direkt nach
dem Stapel-Button in denselben Sidebar-Fluss. `openStackMenu()` (das
frueher ein `document.body`-Flyout baute) ist komplett entfernt -
`onStackClick()` toggelt nur noch `expandedStack` + `renderTabBar()`.
`showTab()` klappt den Stapel des jeweils aktiven Tabs automatisch auf
(egal ueber welchen Weg navigiert wurde - Klick, Suche, Tastenkuerzel),
damit die aktive Sektion immer sichtbar bleibt (Koyfin-Muster).

**Sidebar klappt automatisch auf Icon-Breite ein**, sobald im Inhalt
(`#pageArea`) gescrollt oder getippt/geklickt wird - und wieder aus, sobald
die Sidebar selbst beruehrt wird (`pointerenter`/`focusin`). Klasse
`.nav-collapsed` auf `#navSidebar` nutzt dieselben CSS-Regeln wie die
Mobil-Icon-Leiste (<760px), nur durch JS statt durch eine Media Query
ausgeloest - bei kuenftigen "Icon-only bei Bedarf"-Wuenschen dieses Muster
wiederverwenden statt eine dritte Regel-Kopie zu bauen. (Die Klick-Regel
dazu ist mehrfach nachgebessert worden, siehe die beiden eigenen
Abschnitte weiter unten - "NAVIGATION V3" und "SIDEBAR-KLICKREGEL".)

**⚠ Kopfzeile/Sidebar sind NICHT mehr dunkel** - direkte Korrektur der
V401-Entscheidung, nachdem der Nutzer das Ergebnis gesehen hatte: "die
dunkel eingefaerbte Spalte links und die Zeile oben soll in dem gleichen
Grauton sein wie bei Assets die Hintergrundfarbe der Karten". Diese Karten
(`.rub-card`) nutzten `--bg3` = `#d7dbe0` - genau dieser Wert ist jetzt
FEST (nicht ueber die Variable) der Hintergrund von `.hdr`/`#navSidebar`.
Weil derselbe Ton nicht gleichzeitig als Kartenfarbe im Inhalt UND als
Chrome-Farbe auftauchen soll ("tausch dann auch ueberall im Inhalt wo
dieses Grau verwendet die Farbe aus durch ein helleres Grau"), wurde die
`--bg3`-VARIABLE selbst auf `#e3e6ea` (= `--bg1`) anghoben - das faerbt
automatisch alle ~60 Verbrauchsstellen (Buttons, `.rub-card`, Badges) im
Inhalt heller, ohne dass jede einzeln angefasst werden musste. Text/Icons
in Kopfzeile/Sidebar sind wieder normale helle-Theme-Tokens (kein
Weiss-auf-Dunkel-Override mehr noetig). (Auch diese Farbe wurde in
spaeteren Iterationen mehrfach nachjustiert, siehe unten.)

**Merksatz fuer den naechsten Farbwunsch dieser Art:** wenn ein Nutzer
"derselbe Grauton wie bei X" sagt, IMMER zuerst den echten Hex-Wert an X
nachschlagen (hier: `.rub-card{background:var(--bg3)}` → `#d7dbe0`) statt
zu schaetzen - der Unterschied zwischen "ungefaehr passend" und "exakt
derselbe Wert" ist bei einem expliziten Farbabgleich-Wunsch genau der
Punkt der Anfrage.

**⚠ Nachtrag Minuten spaeter: "mach das grau aussenrum deutlich
dunkler".** Die eben beschriebene helle #d7dbe0-Angleichung war also nur
ein Zwischenschritt - der Nutzer wollte die Chrome-Flaeche insgesamt
kraeftiger abgesetzt sehen, nicht heller. Jetzt `#454b53`, ein bewusst
NEUTRALES dunkles Grau (kein Blau-/Navy-Stich wie beim ersten
Koyfin-Anlauf - der Nutzer sagte diesmal "grau", nicht "schwarz"). Text/
Icons in `.hdr`/`#navSidebar` sind dafuer wieder auf helle Tokens
umgestellt (`--t0` bis `--t3`, plus `--bg2`-`--bg5`/`--bd`/`--bd2` fuer
Buttons/Suchfeld/Profil-Kreis darin), Kontrast gegen Weiss nachgerechnet:
8.8:1. **Merksatz:** Farbentscheidungen bei einem laufenden `/goal` koennen
sich innerhalb derselben Sitzung mehrfach aendern, wenn der Nutzer das
Zwischenergebnis sieht und nachjustiert - das ist normales iteratives
Feinjustieren, kein Widerspruch zur vorherigen Entscheidung. Immer den
NEUESTEN expliziten Wunsch umsetzen, nicht die aeltere Begruendung
verteidigen.

## ⚠ WAECHTER: check/cards.js + zwei echte Layout-Funde

Nutzer-Wunsch per `/goal`: (1) Sidebar-Klick beim Ein-/Ausklappen darf
nicht gleichzeitig navigieren, (2) Performance-Check, (3) Karten sollen
rechts denselben Abstand haben wie links, (4) "stell durch eine NEUE
REGEL sicher, dass Text oder andere Elemente zu keiner Zeit den Rand der
Karte verlassen".

**Sidebar-Klick-Fix:** `pointerenter`/`focusin` klappt die Sidebar zwar
meist schon VOR einem Klick aus (Hover kommt zeitlich zuerst) - bei Touch/
Trackpad ohne echtes Vor-Hover oder einem sehr schnellen Klick reicht das
nicht. Fix: ein Capture-Phase-Click-Listener auf `#navSidebar` faengt den
Klick ab, SOLANGE `.nav-collapsed` gesetzt ist (`preventDefault`+
`stopPropagation`, bevor der Button-eigene `onclick` greift) und klappt
nur aus - navigiert nicht. Ein zweiter Klick (Sidebar jetzt ausgeklappt)
navigiert normal. Getestet per `dispatchEvent('click')` ohne vorheriges
Hover-Event (simuliert genau den Touch-Fall — dieser Test war spaeter
selbst die Fehlerursache, siehe "SIDEBAR-KLICKREGEL" unten).

**⚠ Echter Layout-Bug gefunden, der Ursache fuer "Karten haben rechts
keine Luecke" war:** `#pageArea{display:flex;flex-direction:column}` und
`.pc`/`.body` (ihre Flex-Kinder) hatten kein `min-width:0`. Flex-Items
haben per Default `min-width:auto` (= "nie kleiner als der Content-
Minimalbreite") - ein breiter Chart (Rate-Probabilities-Track, inline-
block mit voller intrinsischer Breite) zwang dadurch `.pc`, `#pageArea`
UND `.app-shell` ueber den Viewport hinaus, obwohl der Chart selbst brav
in einem `overflow:hidden`-Viewport sass. Die ganze SEITE wurde dadurch
111px breiter als der Viewport und horizontal scrollbar - der rechte
Karten-Randabstand war schlicht nicht mehr sichtbar, weil man ihn erst
nach dem Wegscrollen gesehen haette. Fix: `min-width:0` auf `#pageArea`,
`.pc` UND `.body`. **Merksatz: bei JEDEM neuen `display:flex`-Container in
dieser App - ob Zeile oder Spalte - IMMER pruefen, ob seine Kinder
`min-width:0` (bzw. bei `flex-direction:row` `min-height:0`) brauchen,
sobald sie selbst wieder Inhalt mit intrinsischer Breite enthalten
koennten (Charts, lange Tabellen, `white-space:nowrap`).**

**⚠ Der bestehende `layout.js`-Waechter hatte genau diesen Bug NICHT
gefunden, obwohl er "Seiten-Ueberlauf" bereits prueft** - zwei eigene
Bugs im Waechter selbst:
1. Er maß `document.documentElement.scrollWidth`. `body` ist in dieser
   App `position:fixed` (verhindert iOS-Bounce-Scroll) - dadurch traegt
   KEIN Kind jemals zu `documentElement`s Scroll-Groesse bei, ganz gleich
   wie sehr es ueberlaeuft. Fix: direkt `document.body`/`.app-shell`/
   `#pageArea` messen.
2. Seine `TABS`-Liste hatte veraltete/falsche Ids (`fx` statt `cur`,
   `matrix` statt `mx`, `compare` statt `cmp`, `setups` statt `pairs`,
   ein nicht existierendes `research`) UND liess `edge`/`news`/`carry`
   komplett aus. `showTab()` schluckt eine unbekannte Id per try/catch
   still - der Test lief dadurch mehrfach auf dem zuletzt gueltigen Tab
   statt auf den gemeinten. **Merksatz: die Tab-Id-Liste in JEDEM
   `check/*.js` muss exakt `PAGE_IDS` aus `index.html` spiegeln - bei
   einer neuen Kategorie dort IMMER auch alle `check/*.js`-Dateien mit
   einer eigenen Tab-Liste durchgehen.**

**Neuer Waechter `check/cards.js`:** generalisiert `dashboard.js`s
bewaehrte Logik (Kartenrand-Ueberlauf, Text-vs-Text-Ueberlappung mit
Scroll-Clip-Ausschluss, Text-vs-eigenes-Element-Ueberlauf) von "nur
`#dashWidgets .dw` auf dem Dashboard-Tab" auf ALLE 17 Tabs und ein
breiteres Karten-Klassen-Set, PLUS eine neue Seiten-Ebene-Pruefung (Punkt
0, faengt genau den obigen Fund). Beim ersten echten Lauf sofort einen
zweiten, unabhaengigen Fund geliefert: EUR/CAD-Endpunkt-Labels im
"Implied policy path"-Chart (`termStructureCardHtml()`) ueberlappten sich,
wenn die eingepreisten Zinspfade zweier Notenbanken nah beieinander
liegen - keine Mindestabstand-Logik vorhanden. Gefixt nach demselben
Muster wie beim Rate-Probabilities-Mehrlinien-Chart (siehe
`docs/design-system.md`, "Elemente duerfen sich NIEMALS so ueberlappen"):
Endpunkt-Y-Werte sortieren, von oben nach unten einen Mindestabstand
(12px) erzwingen.

**Performance-Check (Playwright):** DOMContentLoaded ~320ms, alle 17 Tab-
Wechsel unter 220ms (meist <100ms), 20 aufeinanderfolgende Scroll-Events
(Sidebar-Auto-Einklapp-Listener) in 29ms ohne spuerbares Ruckeln, JS-Heap
17/30 MB - unauffaellig. Die einzigen Konsolen-Fehler waren
`ERR_TUNNEL_CONNECTION_FAILED` fuer externe FF-Kalender-Fetches - das ist
die dokumentierte Netzwerk-Einschraenkung dieser Sandbox (siehe
`docs/data-sources.md`), kein echter Bug.

## ⚠ KOYFIN-FARBABGLEICH V2 + Klaerung per AskUserQuestion

Nutzer schickte ein zweites, deutlich detaillierteres Koyfin-Screenshot
(Laptop-Mockup: dunkle Kopfzeile+Sidebar mit "DASHBOARDS"-Abschnitt +
"+NEW"-Button + benannter "My Dashboards"-Liste, 4 weisse Panels mit
Kopfleisten-Toolbar-Icons) mit "so will ich das haben... frag mich so
lange bis du dir komplett sicher bist wie es die Regel sagst" - explizite
Berufung auf die 95%-Sicherheits-Regel (siehe `docs/workflow.md`). Der
Screenshot buendelte mind. 4 Aenderungen unterschiedlichen Umfangs
(Panel-Design, Drag/Resize/Close, Chart-Zeichenwerkzeuge,
Mehrfach-Dashboards) - deshalb 4 gezielte Fragen per `AskUserQuestion`
statt zu raten. Ergebnis, **bindend fuer diese und kuenftige Sitzungen zu
diesem Thema**:
- Umfang: **alle 17 Tabs**, nicht nur Dashboard.
- Tiefe: **nur Design/Farben** ("Mir geht es nur um das seiten leisten
  design und generell die Farben die dort benutzt wurden und die innen
  benutzt wurden") - AUSDRUECKLICH KEIN Drag/Resize/Schliessen(×) fuer
  Karten.
- Chart-Werkzeuge: **keine** neuen Zeichen-/Annotations-Icons.
- Mehrere Dashboards: **ja, neues Feature** - mehrere eigene benannte
  Dashboards wie Koyfins "My Dashboards" + "+NEW".

**Farb-Ergebnis:** die Chrome-Farbe (siehe Abschnitt "NAVIGATION/HEADER
V2" oben) ist am ECHTEN zweiten Referenzfoto nochmal nachgemessen worden -
das dort sichtbare Anthrazit ist NAHEZU SCHWARZ, deutlich dunkler als das
zuvor "geratene" `#454b53`. Jetzt `#14171c` (Kontrast 17.96:1 gegen
Weiss), per Playwright-Screenshot (Dashboard- und Assets-Tab, 1440px)
gegen die Referenz verifiziert - Kopfzeile/Sidebar/aktiver-Nav-Eintrag
sehen dem Foto jetzt sehr nah.

**Merksatz zur 95%-Regel bei Bildreferenzen:** ein einzelner Screenshot
kann mehrere unabhaengige Aenderungswuensche gleichzeitig zeigen (hier:
Farben + Interaktion + neues Feature) - IMMER in einzelne Fragen zerlegen
statt den Umfang aus dem Bild selbst zu erraten, auch wenn "so will ich
das haben" pauschal klingt.

## ⚠ MEHRERE EIGENE DASHBOARDS

Neues Feature, direkte Folge der Klaerung oben (Koyfin-Vorbild "My
Dashboards" + "+NEW"). Nach zwei weiteren `AskUserQuestion`-Fragen bestaetigt:
Liste **inline unter dem 'Dashboard'-Sidebar-Eintrag** (wie der bestehende
"Insights"-Stapel), Umbenennen/Loeschen ueber den **bestehenden Long-Press-
Mechanismus** (den die Tab-Stapel bereits fuer ihr eigenes Rename/Dissolve-
Menue nutzen - `tabPressStart`/`openTabMenu`, neuer `kind:'dashitem'`).

**UI:** `dash` ist jetzt ein Hybrid aus Navigations-Tab und Stapel (`dashBtnHtml`,
≈ Zeile 20759 ff.): Klick auf den Knopf-Koerper navigiert wie bisher
(`onTabClick`), der separate Pfeil (`toggleDashExpand`, `stopPropagation`)
klappt NUR die Liste auf/zu - kein `stackOf('dash')`-Eintrag in `tabStacks`,
eigener Zweig ganz am Anfang von `renderTabBar()`s `TAB_ORDER`-Schleife.
`showTab('dash')` klappt die Liste automatisch auf (`expandedDash=true`),
gleiches Koyfin-Muster wie beim aktiven Tab-Stapel.

**Datenmodell (Kernregel "persistierter State MUSS in den Cross-
Device-Sync", siehe `docs/state-sync.md`):** `dashboards:[{id,name,
widgets,dashRemovedTypes}]` + `activeDashId` sind neue Top-Level-Felder in
`snap()`/`applySnap()` - dadurch automatisch in Undo, lokalem Save UND
Cloud-Sync (kein manuelles `cloudPush`/`cloudPull`-Wiring noetig, da
`cloudPush` sein Objekt aus `JSON.parse(snap())` baut und `cloudPull`
unconditional durch `applySnap()` laeuft - beides bereits bestehende
Aufrufketten).

**Bewusst NICHT die ~40 bestehenden Stellen angefasst, die `widgets`/
`dashRemovedTypes` direkt lesen/schreiben** (Widget hinzufuegen/entfernen/
umbenennen/verschieben, `migrateDash`, `renderDash`, ...): diese beiden
Globals bleiben unveraendert die Arbeitskopie des AKTIVEN Dashboards.
`dashboards[]` ist die Quelle der Wahrheit, aber synchronisiert wird nur an
EINER Stelle - `syncActiveDashboard()`, aufgerufen ganz am Anfang von
`snap()` (dem gemeinsamen Kern-Speicherpunkt fuer Save/Undo/Cloud-Push).
`switchDashboard`/`createDashboard`/`deleteDashboard` laden dafuer beim
Wechsel die Ziel-Widgets in dieselben Globals und rufen `migrateDash()`
erneut auf (damit auch ein lange nicht geoeffnetes Dashboard nachtraeglich
neue Default-Karten bekommt). **Merksatz fuer aehnliche "mehrere benannte
Varianten eines bestehenden Einzel-State"-Wuensche:** dieses Muster (Quelle
der Wahrheit als Array + die bestehenden Globals als Arbeitskopie + EIN
Sync-Punkt in `snap()`) spart massiv Aenderungsflaeche gegenueber dem
Durchfaedeln aller Mutationsstellen - immer zuerst pruefen, ob der State
tatsaechlich nur an einer zentralen Stelle (hier `snap()`) zusammenlaeuft,
bevor man jede einzelne Mutationsfunktion anfasst.

**⚠ RUECKGAENGIG GEMACHT (Nutzer-Wunsch 2026-08-22):** "mach aus dem
Dashboard-Stapel keinen Stapel mehr, sondern einfach eine Kategorie, in der
wie vorher alles zu sehen ist - die taegliche Vorlage bitte loeschen."
Dashboard ist wieder ein normaler, einzelner Sidebar-Tab wie jeder andere
(`tabBtnHtml('dash',false)`, kein `.np-stack`, kein Pfeil, kein Long-Press-
Rename/Delete-Menue mehr - long-press bietet jetzt das normale "zu Stapel
hinzufuegen"). `dashboards[]`/`activeDashId`/`dashSeedV` sowie
`switchDashboard`/`createDashboard`/`renameDashboard`/`deleteDashboard`/
`ensureDashboards`/`syncActiveDashboard`/`fadeDash`/das schlanke
"Taeglich"-Dashboard (`DAILY_KEEP`/`mkDailyWidgets`/`dailyDropTypes`/
`ZONE_LEAN`/`isLeanDash`/`body.dash-lean`) sind komplett entfernt -
`widgets`/`dashRemovedTypes` sind wieder der alleinige, direkte State dafuer,
genau wie vor diesem Feature. **Migration:** `restoreAlltimeDashboard()`
(ersetzt `ensureDashboards()` in `loadState()` UND `applySnap()`) sucht in
einem noch gespeicherten alten `dashboards[]`-Array gezielt den
NICHT-`builtin:'daily'`-Eintrag (= die urspruengliche "Alles"-Sammlung) und
uebernimmt dessen `widgets`/`dashRemovedTypes` - bewusst NICHT einfach den
zuletzt aktiven Stand, da ein Nutzer beim Wegfall des Features gerade
"Taeglich" aktiv gehabt haben kann und sonst dessen reduzierte Kartenauswahl
faelschlich zum neuen Dauerzustand geworden waere. Mit Playwright gegen ein
kunstlich altes `dashboards[]`-Objekt (aktiv=Taeglich) fuer beide
Migrationspfade verifiziert: volle 13-Karten-Auswahl kommt zurueck, nicht
die reduzierte.

## ⚠ VIER FUNDE AUS EINEM NUTZER-FOTO

Nutzer schickte einen iPad-Screenshot (1194px) mit gelben und schwarzen
Markierungen und verwies ausdruecklich auf die 95%-Regel. Farben wurden
vorab per `AskUserQuestion` geklaert (Chrome #2b3038, Karten #eef0f3, alle
abgeschnittenen Texte) - die Bugs selbst waren explizit beauftragt.

**1. Sidebar wurde nie dunkel (gelb markiert) - Kaskaden-Fehler.**
`.hdr,#navSidebar{background:#14171c}` stand VOR der eigentlichen
`#navSidebar`-Regel, die ihrerseits nochmal `background:var(--bg1)` setzte.
Beide haben genau EINEN id-Selektor, also gleiche Spezifitaet - die
SPAETERE gewinnt. Die Kopfzeile (`.hdr`) wurde dunkel, weil ihre
Basis-Regel oberhalb steht; die Sidebar blieb hell. Die Farbe lebt jetzt in
`--chrome-bg` und wird an genau einer Stelle je Element gesetzt.
**Merksatz:** bei einem gescopten Farb-Override IMMER pruefen, ob das Ziel
weiter unten dieselbe Eigenschaft nochmal setzt - gleiche Spezifitaet
entscheidet allein ueber die Reihenfolge im File.

**2. Karten ohne Luecke zum rechten Rand (schwarz markiert) - px-Mindest-
breiten im Raster.** `#dashWidgets.dash-layout` hatte
`minmax(285px,1fr) minmax(230px,1.2fr) minmax(200px,1fr) minmax(360px,2fr)`
= 1075px + 3x9px Luecke = **1102px Mindestbreite**. Ein Grid-Item kann unter
seine minmax-Untergrenze nicht schrumpfen, das Raster war also immer
mindestens 1102px breit. Der Breakpoint `min-width:1100px` rechnete mit der
vollen FENSTERbreite - seit dem Sidebar-Umbau belegt die Sidebar aber
56-230px und `.pc` weitere 44px. Gemessen: **-179px bei 1100, -99px bei
1180, -85px bei 1194** (Geraet des Nutzers), sauber erst ab 1280; zweites
kaputtes Band **1400-1419** aus derselben Ursache im 1400er-Breakpoint.
Fix: `minmax(0,...)` statt px-Untergrenzen (das Raster kann strukturell nie
breiter werden als sein Container) plus Spaltenzahl am Platz (vier Spalten
ab 1320px, darunter zwei). Der 1400er-Breakpoint ist ersatzlos entfallen -
sein einziger Unterschied waren hoehere px-Untergrenzen.
**Merksatz:** eine px-Untergrenze in `grid-template-columns` ist eine
Ueberlauf-GARANTIE, keine Schutzmassnahme. Spaltenzahl gehoert an den
Breakpoint, Breite an `fr`-Anteile. Und: **jede Media Query, die vor dem
Sidebar-Umbau geschrieben wurde, rechnet zu gross** - die Sidebar war
frueher waagerecht und kostete keine Breite.

**Container Queries waeren die saubere Loesung - gehen hier aber NICHT.**
`container-type:inline-size` impliziert `contain:layout`, und damit wird
das Element zum Containing Block fuer `position:fixed`-Nachfahren. In
`#pageArea` liegen `#mPriceAlert`, `#mResNote` (beide `.ov`-Modals) und
`#dashAurora` - die waeren dadurch aus dem Viewport-Bezug gefallen. Vor
einem kuenftigen Container-Query-Versuch also zuerst auf
`position:fixed`-Nachfahren pruefen.

**3. Abgeschnittene Texte (schwarz eingekreist).** Ueber alle 17 Tabs und
8 Breiten gemessen und behoben: Watchlist-Paarnamen, Set-up-Paarnamen,
Kalender-Terminnamen, Nachrichtenquellen, Indikatornamen, Dashboard-
Ereignisnamen, schmale Zahlenspalten. Zwei Muster, bewusst getrennt:
*Fliesstext* (Termine, Indikatoren, Ereignisse) bricht jetzt UM
(`overflow-wrap:anywhere`) statt zu kuerzen - Umbruch kann strukturell nie
ueber den Kartenrand laufen, mehr Breite schon. *Namen, die nicht umbrechen
duerfen* (Waehrungspaare wie `CAD/CHF` - ein Umbruch am Schraegstrich waere
unlesbar) bekommen stattdessen eine echte Mindestbreite in ihrer
Grid-Spalte.
**Der schlimmste Einzelfall:** `.wl-name` war auf **0px** zusammengefallen,
vom Paarnamen war nur das Ellipsis-Zeichen uebrig. Ursache: in einer
Flex-Zeile waren Flaggen, Kursaenderung, Score und Knopf ALLE
`flex-shrink:0` - der Name war das einzige flexible Element und trug die
gesamte Platznot allein. **Merksatz: in einer Flex-Zeile, deren uebrige
Kinder `flex-shrink:0` sind, braucht das flexible Element zwingend eine
Mindestbreite - sonst wird es auf null gequetscht.**

**4. Warum KEIN Waechter das gefunden hat - und was jetzt anders ist.**
`cards.js` und `layout.js` pruefen Ueberlauf ueber `scrollWidth >
clientWidth`. Diese Groesse waechst aber NUR, wenn der Ueberlauf auch
scrollbar ist: wird das herausragende Element von einem
`overflow:hidden`-Vorfahren sauber weggeclippt, bleibt `scrollWidth ===
clientWidth` und beide melden gruen - bei einem 179px-Ueberlauf. `cards.js`
misst deshalb jetzt zusaetzlich die **echte Geometrie** (Kartenkante gegen
die Content-Box von `#pageArea`) und erkennt **auf 0px gequetschten Text**.
Gegenprobe gegen den Stand VOR dem Fix gefahren: der neue Waechter meldet
dort 3 Befunde mit exakt den gemessenen 99px bei 1180 - ein Waechter, der
den echten Verstoss nicht rot meldet, ist wertlos.
**Merksatz:** `scrollWidth` misst SCROLLBAREN Ueberlauf, nicht sichtbaren.
Fuer "steht etwas ueber der Kante?" immer `getBoundingClientRect()` gegen
die Kante des Containers vergleichen. Und beim Schreiben eines Suchlaufs
nie `clientWidth > 0` verlangen - genau der Extremfall (auf null
gequetscht) faellt sonst heraus.

## ⚠ NAVIGATION V3 + ABSTANDS-SKALA

Vier Nutzer-Meldungen, alle bestaetigt und gefixt.

**1. Ein Tab-Stapel blieb dauerhaft ausgewaehlt.** `showTab()` hatte
`const _st=stackOf(activeTabId); if(_st)expandedStack=_st.id;` - **ohne
else-Zweig**. Wer "Insights" oeffnete und danach auf "Assets" wechselte,
liess `expandedStack` auf dem alten Wert stehen; der Stapel blieb
aufgeklappt und hervorgehoben. Jetzt `expandedStack=_st?_st.id:null`, und
`expandedDash=(tab==='dash')` nach demselben Muster. **Merksatz:** ein
`if(x)y=...` ohne else ist bei EXKLUSIVEN Zustaenden (genau einer darf offen
sein) fast immer ein Fehler - der alte Zustand ueberlebt still.

**2. "Erster Klick verstellt nur die Leiste" griff mit Maus nie.** Die
Regel prueft im click-Handler, ob die Leiste GERADE `nav-collapsed` ist.
Mit Maus feuert aber vorher `pointerenter` und klappt aus - zum
Klickzeitpunkt ist die Klasse weg, die Bedingung falsch, der Klick
navigiert sofort. Nur bei Touch (kein Hover) funktionierte es, weshalb es
beim Bau als "getestet" durchging. Jetzt wird der ZUSTANDSWECHSEL gemerkt
(`ebenAusgeklappt`), nicht der Zustand abgefragt; `pointerleave` verwirft
das Merkmal wieder, damit ein spaeterer Klick auf die laengst offene
Leiste normal navigiert. **Merksatz:** wenn Hover denselben Zustand
aendert, den ein Klick-Handler abfragt, ist die Abfrage zum Klickzeitpunkt
grundsaetzlich wertlos - den Uebergang festhalten, nicht den Zustand. Und:
eine Interaktionsregel IMMER mit echtem `hover()` vor `click()` testen,
nicht nur mit `dispatchEvent('click')`. (Der Fix hatte selbst noch eine
Touch-Luecke, siehe "SIDEBAR-KLICKREGEL" unten.)

**3. Gegenrichtung ergaenzt (Nutzer-Wunsch):** ist die Leiste ausgeklappt,
klappt der erste Klick im Inhalt sie nur ein - erst der zweite bedient den
Inhalt. Bewusst nur oberhalb 760px: darunter ist die Leiste per Media
Query dauerhaft schmal OHNE die Klasse zu tragen, dort wuerde sonst jeder
erste Tipper im Inhalt geschluckt.

**4. Abstands-Skala `--gap-block` (12px).** Auf der Assets-Seite standen
untereinander **11 / 11 / 9 / 0 / 22px**, im Raster zusaetzlich 24px
senkrecht gegen 36px waagerecht. Der Nullwert: `.masonry` hatte kein
`margin-bottom` und `.rub-card` kein `margin-top`, die News-Karte klebte
dadurch direkt am Raster. Alle Stellen ziehen jetzt aus einer Variablen.
**Merksatz:** Abstaende gehoeren wie die Schriftgroessen (`--fs-*`) auf
eine Skala. Bei einer neuen Karte/einem neuen Block IMMER `--gap-block`
verwenden statt einen Wert zu waehlen, der "ungefaehr passt" - genau so
sind die fuenf verschiedenen Werte entstanden.

## ⚠ SCHLANKES TAGES-DASHBOARD

Nutzer-Frage: "Wie wuerden Profis das Dashboard gestalten? Nur zwei Karten
nebeneinander finde ich wenig. Manche Informationen brauche ich nicht
taeglich, die kann ich in den Kategorien nachschauen."

**Der Befund, der die Richtung vorgab:** 14 Karten, 2685px hoch - auf einem
1194px-iPad **3,4 Bildschirme Scrollen**. Ein Dashboard, durch das man
scrollen muss, ist per Definition keines mehr (Stephen Few, *Information
Dashboard Design* - dieselbe Quelle, die schon die Typo-Skala begruendet):
"auf einen Blick" setzt voraus, dass alles gleichzeitig sichtbar ist. Die
Headlines-Karte allein war 776px, also fast ein ganzer Bildschirm fuer
etwas, das einen eigenen Tab hat.

**Auswahlkriterium (woertlich vom Nutzer, auf Rueckfrage):** "Es sollen die
Dinge bleiben die sich taeglich veraendern, grossen Einfluss haben und
wichtig sind direkt zu sehen und im Blick zu haben." Danach wurde jede
Karte einzeln geprueft - siehe die Begruendung je Karte im Kommentar bei
`DAILY_KEEP`. Der Leitsatz dahinter: **was einen eigenen Tab hat, gehoert
aufs Dashboard nur als Ausnahme-Meldung, nicht als vollstaendige Kopie**;
und was sich nur alle paar Wochen bewegt (Korrelation, Carry), ist zum
Nachschlagen da, nicht zum Ueberwachen.

**Umsetzung ueber die Mehrfach-Dashboard-Funktion statt destruktiv:** ein
zweites Dashboard `builtin:'daily'` namens "Taeglich" wird einmalig
ausgesaet und aktiv gesetzt, das bisherige bleibt unveraendert als "Alles"
erhalten. Ergebnis 7 Karten, 1427px. Aussaat ueber `DASH_SEED_V`/`dashSeedV`
und NICHT ueber "gibt es schon ein Taeglich?" - sonst kaeme es nach dem
Loeschen beim naechsten Laden zurueck.

**⚠ Zwei Layout-Fallen, die dabei aufgeflogen sind:**

1. **`grid-template-areas` war nie wirksam.** Nur `.dash-zone-bottom` trug
   ein `grid-area`; die vier anderen Zonen lagen per Auto-Platzierung und
   trafen den in der Vorlage beschriebenen Ort beim Vierspalter nur
   ZUFAELLIG. Aufgefallen erst, als eine neue Vorlage (drei Spalten)
   wirkungslos blieb. **Merksatz: `grid-template-areas` platziert nichts -
   ohne `grid-area` am Kind ist die Vorlage ein Kommentar.**
2. **Zeilenueberspannende Bereiche ziehen beide Zeilen hoch.** Eine Zone
   ueber zwei Zeilen (`"left center right" "left center right2"`) machte
   aus 305px-Karten 685px-Zeilen - rund 350px verschenkt. Jede Zone belegt
   jetzt genau eine Zelle.

**Zonen-Verteilung ist im schlanken Dashboard eine andere** (`ZONE_LEAN`,
greift ueber `isLeanDash()` in `dashZoneOf()`): mit der normalen Zuordnung
sammelte sich alles Lange in Spalte 1 und alles Kurze in Spalte 2/3 -
gemessen 685 gegen 330px, also eine grosse sichtbare Luecke. Jetzt
685/665/640, die Schlagzeilen bekommen die zweite Zeile ganz.
**Merksatz:** eine feste Typ→Zone-Tabelle taugt nur fuer EINE
Kartenzusammenstellung; aendert sich die Auswahl, muss die Verteilung
mitgedacht werden, sonst entstehen tote Flaechen.

**Drei-Spalten-Stufe ab 1160px** ergaenzt (vorher sprang das Raster von
zwei direkt auf vier) - auf dem iPad des Nutzers bleiben nach Sidebar und
Padding rund 995px, das traegt drei Spalten von je etwa 310px bequem.

## ⚠ LOCH IM DASHBOARD: justify-content:space-between

Nutzer-Foto, gelb markiert: mitten im Dashboard klaffte zwischen der oberen
und der unteren Kartenreihe eine Luecke von mehreren hundert Pixeln.

**Ursache:** `.dash-zone-*` trug `justify-content:space-between`. Der
Hoehenrest einer kuerzeren Spalte wurde damit auf die Abstaende ZWISCHEN
ihren Karten verteilt. Das war bewusst so gebaut und ging auf, solange alle
vier Spalten innerhalb von rund 50px lagen (der alte Kommentar an der Stelle
begruendet das ausdruecklich). Sobald aber EINE Spalte deutlich hoeher wird -
eine gefuellte Watchlist mit acht Paaren, oder schlicht die andere
Kartenauswahl des schlanken Tages-Dashboards - verteilt sich ein Rest von
mehreren hundert Pixeln auf zwei Karten, und aus "Layout-Luft" wird ein Loch.

**Fix:** `justify-content:flex-start`. Die Karten sammeln sich oben, der Rest
landet unten am Spaltenende, wo keine Karte mehr steht und er als normale
Spalten-Raggedness liest. Gemessen mit gefuellter Watchlist: Abstaende
innerhalb aller Spalten jetzt einheitlich 9px statt bis zu 380px.

Das ist zugleich genau die schon dokumentierte Entscheidung ("Karten sollen
gleich abschliessen, ohne dass eine gestreckt aussieht, nur um die Luecke
zu schliessen", siehe `docs/design-system.md` "NICHTS wird gestreckt") -
`space-between` war ein Rueckfall dahinter.

**Merksatz:** eine Layout-Regel, die einen Hoehenrest "unsichtbar" verteilt,
haelt nur so lange, wie der Rest klein ist. Sie ist damit an eine
Karten-Zusammenstellung gebunden, nicht an das Layout - und bricht, sobald
sich die Zusammenstellung aendert. Rest lieber sichtbar ans Ende legen, wo
er nicht stoert, als ihn zwischen Inhalte zu verteilen.

**Zweiter, unabhaengiger Fund im selben Lauf** (`check/cards.js`): im
Fed-Funds-Chart der Rate-Seite ueberlappten sich zwei Sitzungstermine
("16 SEP" / "28 OCT") um 2px. Die Achsen-Ausduennung (`histStep`) galt nur
fuer die HISTORIE; die Termine wurden immer in voller Groesse gezeichnet und
brauchten bei 34px Slotbreite rund 36px. Ein Termin darf nicht weggelassen
werden - er ist der Inhalt des Charts - deshalb skaliert jetzt die
Schriftgroesse mit der Slotbreite (7,5-10,5px), und erst unterhalb 26px
Slotbreite wird zusaetzlich jeder zweite Termin ausgelassen. Der Fund kam
rein datenbedingt hoch (neue Sitzungstermine aus dem stuendlichen Feed) -
ein gutes Beispiel dafuer, warum die Waechter bei JEDEM Push laufen und
nicht nur nach UI-Aenderungen.

## ⚠ SIDEBAR-KLICKREGEL: zweimal am TEST gescheitert, nicht an der Logik

Die Regel "der erste Klick verstellt nur die Leiste, erst der zweite wirkt"
ist ZWEIMAL beim Nutzer angekommen, obwohl sie beide Male als geprueft galt.
Beide Male war die Logik richtig gedacht und die TESTMETHODE falsch:

1. **Erster Anlauf, mit `dispatchEvent('click')` geprueft.** Damit feuert
   kein `pointerenter`. Mit echter Maus klappt `pointerenter` die Leiste
   aber schon beim Hinbewegen aus - zum Klickzeitpunkt war `nav-collapsed`
   also weg, die Abfrage falsch, der Klick navigierte sofort.
2. **Zweiter Anlauf, mit `hover()+click()` geprueft** (Maus damit korrekt) -
   aber auf dem iPad lautet die Ereignisfolge
   **`pointerenter` → `pointerdown` → `pointerup` → `pointerleave` → `click`**.
   Der Finger "verlaesst" das Element also IMMER vor dem Klick. Das
   `pointerleave`, das bei der Maus sinnvoll das verbrauchte Ausklappen
   zuruecksetzt, loeschte bei Touch das Merkmal, bevor der Klick-Handler es
   lesen konnte. Deshalb navigierte der erste Tipper weiterhin.
   Fix: das Zuruecksetzen gilt nur noch fuer `ev.pointerType==='mouse'`.

**Merksatz:** eine Interaktionsregel IMMER mit der Eingabeart testen, die
der Nutzer tatsaechlich benutzt. `dispatchEvent` laesst die Pointer-Events
ganz aus, `hover()+click()` deckt nur die Maus ab. Bei Touch kommt
`pointerleave` VOR dem `click` - jeder Handler, der sich auf einen dort
zurueckgesetzten Zustand verlaesst, sieht ihn nie.

**Neuer Waechter `check/nav.js`** (11. Pruefung): faehrt die Regel in beiden
Richtungen gegen BEIDE Zeigerarten - Touch ueber
`newContext({hasTouch:true})`+`tap()`, Maus mit echtem `hover()` vor dem
Klick - plus die Gegenprobe, dass ein Klick bei bereits offener Leiste NICHT
geschluckt wird, und dass ein Tab-Stapel nicht ausgewaehlt bleibt. Gegen den
Stand VOR dem Fix gegengeprueft: meldet dort genau den vom Nutzer
beschriebenen Fehler.

**Merksatz zum Waechter selbst:** wenn dieselbe Regel zweimal bricht, ist
ein weiterer Absatz in dieser Datei die falsche Antwort - sie gehoert als
ausfuehrbare Pruefung nach `check/`.

## ⚠ NAVIGATIONS-ANIMATIONEN

Nutzer-Wunsch: Seitenleiste und Insights-Kategorie sollen beim Ein-/Ausklappen
animiert sein, "damit das Ganze cleaner aussieht" - plus die Aufforderung,
selbst zu pruefen, welche der neu gebauten Funktionen ebenfalls eine
Animation brauchen. Umgesetzt sind drei Bewegungen, alle kurz (0,13-0,26s)
und ohne Verzoegerung, damit sich die Bedienung nicht zaeh anfuehlt:

1. **Akkordeon** fuer Tab-Stapel UND die Dashboard-Liste (`.np-sub-wrap`),
   Pfeil dreht sich statt Zeichentausch (▸/▾ → `rotate(90deg)`).
2. **Beschriftungen** der Leiste blenden beim Ein-/Ausklappen weich aus,
   statt per `display:none` zu verschwinden.
3. **Dashboard-Wechsel** blendet den Inhalt ein - bewusst dieselbe
   `page-fade-in`, die schon der Tabwechsel nutzt, statt eines zweiten
   Musters (`fadeDash()`).

**⚠ Die Struktur-Aenderung, ohne die nichts davon moeglich war:** die
Stapel-Mitglieder wurden bisher nur gerendert, WENN der Stapel offen war -
`renderTabBar()` baut die Leiste per `innerHTML` neu. Ein frisch erzeugtes
Element hat keinen Vorher-Zustand und animiert deshalb NIE. Die Mitglieder
stehen jetzt dauerhaft im DOM; nur die Klasse `.open` am Wrapper steuert sie,
und `syncNavExpanded()` schaltet beim Auf-/Zuklappen ausschliesslich diese
Klasse um, ohne neu zu bauen. `renderTabBar()` baut weiterhin mit dem
richtigen Zustand auf - beim Tabwechsel also bewusst ohne Animation, dort
aendert sich ohnehin die ganze Leiste.
**Merksatz:** eine CSS-Transition ist unmoeglich, solange das Element bei
jeder Zustandsaenderung neu erzeugt wird. Erst Zustand von Aufbau trennen,
dann animieren.

**⚠ Zwei Fallen, die dabei zugeschlagen haben:**
1. **`overflow:hidden` entfernt ein Element NICHT aus der intrinsischen
   Breite.** `#navSidebar` ist `width:max-content`; die jetzt dauerhaft
   vorhandenen Mitglieder-Labels ("Rate Probabilities") zogen die Leiste
   permanent auf ihre Breite auf - gemessen so weit, dass ein Klick neben
   der ersten Karte schon auf der Leiste landete und die
   Einklapp-Automatik nicht mehr ausgeloest wurde (`check/nav.js` hat genau
   das rot gemeldet). Der zugeklappte Wrapper braucht deshalb `max-width:0`
   (spaeter wieder entfernt, siehe naechster Abschnitt).
2. **Vor dem Messen der Zielhoehe muss `.open` bereits gesetzt sein.** Im
   zugeklappten Zustand ist der Wrapper 0 breit, jede Zeile bricht um und
   `scrollHeight` liefert einen viel zu grossen Wert.

`syncNavExpanded()` setzt die **exakt gemessene** Zielhoehe als Inline-Wert;
der CSS-Wert ist nur Rueckfall fuer Zustaende ohne Umschalten. Mit einem
pauschalen Deckel (520px gegen 285px echten Inhalt) war die sichtbare
Bewegung nach rund 90ms vorbei, weil die Kurve vorzeitig am Deckel ankam -
gemessen laeuft sie jetzt ueber die vollen ~240ms in beide Richtungen.

**Beide Nutzer-Schalter sind angebunden:** `body.no-ui-anim` (Animations-
Schalter in den Einstellungen) und `prefers-reduced-motion` - dieselbe
Pflicht wie bei der Gleiter/Boost-Sequenz, die genau daran schon einmal
gescheitert ist.

## ⚠ NAV-LEISTE: konstante Breite + gleichmaessige Icon-Abstaende

Nutzer-Foto, zwei gelbe Markierungen.

**1. Die Leistenbreite sprang beim Aufklappen von Insights** (155 → 171px),
weil der lange Mitgliedsname "Rate Probabilities" erst dann zur
`width:max-content`-Berechnung beitrug. Woertlich: "Ich will nicht, dass sich
die Breite aendert, sondern dass sie von Anfang an so breit ist." Das
`max-width:0` am zugeklappten Wrapper (einen Tag zuvor eingebaut, um 16px zu
sparen) ist deshalb wieder RAUS - die Untereintraege zaehlen jetzt immer mit,
die Leiste ist konstant 171px. **Merksatz:** eine Leiste, die sich beim
Bedienen selbst verbreitert, verschiebt den gesamten Inhalt daneben - ein
paar gesparte Pixel sind das nie wert.

**2. Ungleiche Symbol-Abstaende in der eingeklappten Icon-Leiste.** Dort blieb
die Dashboard-Liste logisch aufgeklappt und schob einen 83px hohen Block mit
drei kaum unterscheidbaren Icons ("Alles", "Taeglich", "+ Neu") zwischen zwei
Hauptsymbole, waehrend alle uebrigen sauber 36px auseinander lagen. In der
Icon-Leiste werden Untereintraege jetzt gar nicht mehr angezeigt - ein
Untereintrag ohne Beschriftung traegt ohnehin keine Information, zwei
Dashboards sehen als blosses Icon identisch aus. Gemessen jetzt durchgehend
36px ueber alle sieben Symbole.

**⚠ Warum die CSS-Regel dafuer zunaechst wirkungslos blieb:**
`syncNavExpanded()` setzt die gemessene Zielhoehe als **Inline-Stil** - und
Inline-Stile schlagen jeden Selektor, auch einen mit id. Die Regel
`#navSidebar.nav-collapsed .np-sub-wrap{max-height:0}` war damit chancenlos,
sobald der Nutzer vorher einmal auf- oder zugeklappt hatte. In der Icon-Leiste
raeumt `syncNavExpanded()` die Inline-Hoehe deshalb ab, statt sie zu setzen;
`collapse()`/`expand()` rufen die Funktion mit auf, damit der Wechsel in
beide Richtungen greift.
**Merksatz:** wer eine Groesse in JS als Inline-Stil setzt, muss JEDEN
Zustand mitbedienen, in dem CSS sie eigentlich ueberschreiben wollte -
Spezifitaet hilft dort nicht weiter.

## ⚠ ICON-AUSRICHTUNG, ANHEFTEN, EIGENE TOOLTIPS, SCROLL-GEGEN-HOVER

Mehrere Nutzer-Meldungen ueber zwei Sitzungen, alle die eingeklappte
Icon-Leiste betreffend.

**1. Stapel-Icons 15px nach links verschoben.** `.np-arrow` (der unsichtbare
▸-Pfeil bei Stapel-/Dashboard-Buttons) trug weiterhin `margin-left:auto`,
obwohl er im eingeklappten Zustand `max-width:0`/`opacity:0` hatte - ein
Auto-Margin frisst den freien Flex-Platz aber auch bei 0 Breite und schob
Icon+Label nach links. Per Playwright nachgemessen: -15px bei allen
`.np-stack`-Buttons, 0px ueberall sonst. Fix: `margin-left:0` zusaetzlich in
beiden Icon-Leiste-Regeln (Mobil-Media-Query UND `.nav-collapsed`).

**2. Anheften (`navPinned`).** Recherche zu anderen Klapp-Seitenleisten
(VS Code, Slack, Linear) ergab: die reine Hover-Automatik ohne manuellen
Pin ist unueblich. Neuer Pin-Knopf ganz oben in der Leiste (`navPinBtnHtml()`,
ausserhalb von `TAB_ORDER`) schaltet `navPinned` um - `collapse()` in der
Auto-Einklapp-IIFE prueft das zuerst und tut sonst nichts. Volle
Vier-Ecken-Anbindung (`fxpro_nav_pinned`) wie `pinEnabled`/`denseMode` -
**Achtung, Namenskollision vermeiden:** `pinEnabled` ist die PIN-CODE-Sperre,
`navPinned` das Sidebar-Anheften, komplett getrennte Features.

**3. Eigene Tooltips.** `title`-Attribute auf allen `.np`-Buttons durch
`data-tip`/`aria-label` ersetzt (title haette den langsamen, uneinheitlichen
Browser-Tooltip zusaetzlich ausgeloest). Eigenes `#navTooltip`-Element,
delegierte `pointerover`/`pointerout` auf `#navSidebar`, nur aktiv wenn
`nav-collapsed` ODER Viewport <760px. **Eingeschraenkte Wirkung:** auf breiten
Bildschirmen greift der Tooltip in der Praxis kaum, weil `pointerenter` auf
`nav` die Leiste sofort komplett aufklappt (Punkt "Sidebar klappt automatisch
auf" oben) - das Label steht dann eh als Text da, bevor der Tooltip (300ms
Verzoegerung) ueberhaupt erscheinen koennte. Nur bei Viewports <760px (dort
bleibt die Leiste dauerhaft Icon-only, keine Hover-Automatik) tatsaechlich
sichtbar - mit Playwright bestaetigt (0px Sidebar-Breite waehrend
Tooltip-Anzeige).

**4. `overNav`-Merker gegen Scroll-Nachbeben.** Nutzer-Meldung: "kann die
Leiste nicht ausklappen, wenn der Inhalt sich noch bewegt". Ursache: der
`scroll`-Listener auf `#pageArea` feuert bei Momentum-/Traegheits-Scrolling
(Trackpad) noch mehrfach nach, waehrend der Zeiger laengst auf der Leiste
ruht - jedes Nachbeben rief `collapse()` erneut auf. Fix: `overNav` wird bei
`pointerenter`/`focusin` auf der Leiste gesetzt und unterdrueckt `collapse()`,
solange es `true` ist; zurueckgesetzt bei `pointerleave` UND `focusout`
(sonst bliebe es nach Tastatur-Fokuswechsel dauerhaft haengen und die
Auto-Einklapp-Automatik wuerde nie wieder greifen). Das `scroll`-Event selbst
bleibt unangetastet - der Inhalt scrollt weiter ungebremst.

**5. Anheft-Knopf von der Klick-Schluck-Regel ausgenommen (⚠ ÜBERHOLT, siehe
unten).** Direkte Folge-Meldung: "ich kann die Leiste oeffnen, aber sie
schliesst sich gleich wieder." Ursache damals: die "erster Klick verstellt
nur die Leiste"-Regel (siehe "SIDEBAR-KLICKREGEL" oben) schluckte JEDEN
ersten Klick nach einem Hover-Aufklappen per `stopPropagation()` in der
Capture-Phase auf `nav` - auch den auf den Pin-Knopf. Der Knopf reagierte
dadurch beim ersten Klick scheinbar gar nicht (kein Toggle), nur die normale
Auto-Einklapp-Automatik lief unbeeinflusst weiter. Fix damals: der Pin-Knopf
wurde per `ev.target.closest('.nav-pin-btn')`-Fruehausstieg von der Regel
ausgenommen. **Kurz danach hat eine parallel laufende zweite Sitzung
dieselbe Nutzer-Meldung root-cause-naeher geloest** (die Anheften-Funktion
komplett entfernt, stattdessen die Klickregel geraeteabhaengig gemacht:
PC/Maus navigiert der erste Klick sofort, da Hover die Leiste dort ohnehin
schon vorher oeffnet - `hatMausHover`, `matchMedia('(hover:hover) and
(pointer:fine)')`). Beim Zusammenfuehren beider Sitzungen wurde diese
Loesung uebernommen, der Anheft-Knopf existiert seither nicht mehr - Punkt 5
hier nur noch als Fund-Historie stehen gelassen.
**Merksatz (bleibt gueltig):** eine "erster Klick zaehlt nicht"-Regel, die
pauschal auf einen ganzen Container gelegt wird, trifft auch Buttons, fuer
die sie nie gedacht war - bei neuen Buttons in einem so geschuetzten
Container immer pruefen, ob sie tatsaechlich navigieren (Regel gilt) oder
nur umschalten (Regel muss explizit ausgenommen werden).

**6. `overNav` selbst in dieselbe Touch-Falle getappt wie `ebenAusgeklappt`
vorher.** Nutzer-Meldung (nach Punkt 4, spezifisch aufs iPad bezogen): "wenn
ich auf die Leiste druecke, damit sie sich ausklappt, klappt sie sich ganz
kurz aus, aber direkt wieder rein, da das System denkt ich habe den Inhalt
beruehrt, obwohl es immer noch das Scrollen ist." Der `overNav`-Fix aus
Punkt 4 setzte `overNav=false` bei `pointerleave` **unbedingt**, also auch
bei Touch - dort feuert `pointerleave` aber schon VOR dem Klick
(`pointerenter -> pointerdown -> pointerup -> pointerleave -> click`, exakt
dieselbe Ereignisfolge, die `ebenAusgeklappt` schon einmal hereingelegt hat,
siehe "SIDEBAR-KLICKREGEL" oben). Der Schutz war beim Antippen der Leiste
also schon wieder weg, BEVOR das naechste Momentum-Scroll-Nachbeben
ankam - `collapse()` griff sofort erneut durch, die Leiste klappte "kurz
aus, dann sofort wieder zu". Fix: `overNav` wird bei `pointerleave` jetzt
nur noch fuer die Maus zurueckgesetzt (`if(!ev.pointerType||
ev.pointerType==='mouse')`, identischer Guard wie bei `ebenAusgeklappt`);
fuer Touch/Stift stattdessen bei `pageArea`s eigenem `pointerdown` -
zeigerunabhaengig der zuverlaessigste Punkt, an dem der Zeiger nachweislich
im INHALT und nicht mehr auf der Leiste ist. Verifiziert, indem die exakte
Touch-Ereignisfolge manuell per `dispatchEvent` nachgebaut und ein
Scroll-Nachbeben genau in die Luecke zwischen `pointerleave` und `click`
gelegt wurde - blieb offen.
**Merksatz:** JEDER neue Zustand, der bei `pointerenter`/`pointerleave` auf
der Leiste gesetzt/zurueckgesetzt wird, braucht denselben Maus-only-Guard
wie `ebenAusgeklappt` - die Touch-Ereignisfolge dieser App ist an dieser
Stelle mittlerweile dreimal zur Falle geworden (Klickregel selbst, dann
`overNav` unten in Punkt 4, jetzt hier noch einmal). Ein synthetischer
`page.tap()`-Test in Playwright reproduziert dieses Zeitfenster NICHT
zuverlaessig (deckt sich mit der bereits dokumentierten Erfahrung bei der
urspruenglichen Klickregel) - fuer diese Klasse Bug reicht nur ein manuell
per `dispatchEvent` nachgebauter, exakter Ereignis-Zeitplan.

## Assets-Detailseite: eine Spalte + Schnellzugriffszeile (2026-08-23)

Ein zwischenzeitlicher Umbau auf vier Sektionen (Overview/Macro/News/Notes)
wurde auf Nutzer-Wunsch **zurückgenommen**: die Seite zeigt wieder alle Karten
in *einer* Spalte. Wer das erneut anfasst, sollte das wissen — die
Sektions-Aufteilung war bereits da und ist bewusst wieder raus.

Reihenfolge in `renderSpecTab`:
Schnellzugriffszeile → Kursperformance → Score-Kacheln → Bias & Notes →
Rubrik-Detailkarten → News → „Add Rubric".

### Die Schnellzugriffszeile (`assetQuickRowHtml`)
Links `ASSET_QUICK_LINKS` (7 Analyseseiten, jeweils mit vorgewähltem Asset über
`assetQuickGo`), rechts der **Notes**-Umschalter. Die Zeile steht in *beiden*
Ansichten, damit die Sprünge überall erreichbar sind. Bewusst nur an dieser
einen Stelle — nicht zusätzlich in der Bias-&-Notes-Karte.

Von der Zielseite führt die rote Zurück-Pille zu genau diesem Asset zurück
(`_quickReturnAssetId`); ohne gesetzte Asset-ID geht sie ins Research-Terminal.

### Notes-Ansicht (`curSub === 'notes'`)
Ordner links, Notizen rechts — **dieselbe Datenbasis und derselbe Renderer wie
im Research-Terminal** (`researchNotesFolderOptions` / `researchNotesPanelHtml`),
kein zweiter Nachbau, keine zweite Speicherform. Ordner hängen unter der
Wurzel `asset:<id>:gen`.

⚠ Darunter steht weiterhin die ältere Bullish/Bearish-Tabelle
(`renderNotesSubTab`). Sie trägt Nutzerinhalte und wäre sonst nicht mehr
erreichbar — nicht „aufräumen", ohne vorher zu fragen.

⚠ `rerenderNotesHost()` statt `renderResearch()`: die Ordner- und
Notizfunktionen werden jetzt von *zwei* Seiten benutzt. Ein fester
`renderResearch()`-Aufruf würde von der Assets-Seite auf die Research-Seite
springen. Bei neuen Notiz-Aktionen ebenfalls `rerenderNotesHost()` verwenden.

### Bekannte Eigenheit beim Testen
Der erste Klick im Inhaltsbereich direkt nach einem Seitenwechsel wird vom
Einklapp-Schutz der Navigationsleiste (`ebenEingeklappt`) absichtlich
geschluckt. In Playwright-Tests deshalb zweimal klicken — sonst sieht es wie
ein Fehler aus, ist aber gewolltes Verhalten.

## Notizen: Pins, Assets-Karte und Watchlist (2026-08-23)

Pro Asset lassen sich **bis zu 3 Notizen anpinnen** (`ASSET_PIN_MAX`). Der Pin
hängt als Feld `n.pin` am Notiz-Objekt — genau wie `n.fav` — und liegt damit
**automatisch im Cross-Device-Sync**, ohne zweite Speicherform.

Sichtbar sind die Pins an zwei Stellen, beide aus derselben Quelle
(`assetPinnedNotes`):
- **Assets-Seite**: die Notes-Karte rechts in der Schnellzugriffszeile
  (`assetNotesCardHtml`). Ohne Pins steht dort ein Platzhalter.
- **Watchlist**: `watchAssetNotesHtml` zeigt je beteiligtem Asset einen Block.
  Bei einem FX-Paar sind das **beide Seiten** (USD/CAD → USD und CAD),
  bei einem Non-FX-Eintrag das Asset selbst (`watchInvolvedAssets`).

Über „＋ Note" in der Watchlist legt man eine Notiz **für das jeweilige Asset**
an (`newResNoteForAsset`) — sie landet am Asset selbst, nicht am Paar. Ist noch
ein Pin-Platz frei, wird sie direkt angepinnt: sonst hätte man eine Notiz genau
dort angelegt, wo sie danach nicht auftaucht.

⚠ `rerenderNotesHost()` kennt jetzt drei Ziele (Assets / Watchlist /
Research-Terminal). Bei neuen Notiz-Aktionen immer diese Funktion nutzen, nie
`renderResearch()` fest verdrahten.

## History (2026-08-23)

Zeitregler `HIST_RANGES` (1W/2W/1M/2M/3M), Gruppierung nach Wochen ab Montag,
je Tag das Delta gegen den zuletzt aufgezeichneten Wert.

**Automatische Score-Ursachen werden beim Auftreten protokolliert**
(`_logAutoScoreShifts`, ausgelöst in `recomputeAuto`). Vorher war die Ursache
nur flüchtig bekannt (`_flipCauseTag`) — die Telegram-Nachricht konnte sie
nennen, die History nicht.

Zwei Eigenschaften sind bewusst so und werden von `check/score.js` geprüft:
- Der Score-Schnappschuss wird **nur** gezogen, wenn eine Ursache gesetzt ist.
  `recomputeAuto()` läuft sehr oft; sonst wäre das Dauerlast.
- Ohne echte Score-Änderung wird **nichts** geschrieben. Wo eine Bewegung nicht
  belegbar ist, sagt die History das ausdrücklich, statt einen Grund zu
  erfinden.

`pruneScoreLog` hält `HIST_MAX_RANGE+2` Tage — gedeckelt, weil `scoreLog` im
Cross-Device-Sync hängt.

### Aufschlüsselung der Tagesbewegung (`histDeltaParts`)

⚠ **Der angezeigte Score und die Kartenwerte liegen NICHT auf derselben
Skala.** `symScoreCmp = symScore * symCmpFactor` — der Gesamtwert trägt den
Fairness-Faktor, `rubScore` trägt ihn nicht. Rohe Kartenwerte neben den
Gesamtscore zu stellen ergibt deshalb eine Summe, die nie zur Kopfzeile passt
(Nutzer-Bugreport 2026-08-23 „Ergibt keinen sinn": Kopfzeile −0,8,
Kartenzeile in Summe −1,4). **Wer hier etwas ändert, muss jede Zahl auf die
Skala des angezeigten Scores bringen.**

Damit die Zerlegung überhaupt möglich ist, speichert `recordScoreHist` je Tag
zwei zusätzliche Felder: `e[7]` = `symCmpFactor`, `e[8]` = `symScore` (roh).
Der Eintrag ist damit `[Datum, Gesamt, Infl, Labour, Growth, Bias, Modell-Tag,
Faktor, Rohscore]`. Die Rechnung ist algebraisch exakt:

```
tot_h − tot_v = cmp_h·(roh_h − roh_v)  +  roh_v·(cmp_h − cmp_v)
                └── Kartenanteil ──┘      └── Faktoranteil ──┘
```

Angezeigte Teile: die drei aufgezeichneten Karten, `Other cards` (Interest
Rates / COT Data / Risk Environment — die werden nicht je Karte je Tag
gespeichert), `Comparability factor` und ein ausgewiesener `Rounding`-Rest.
Die Rundungsfehler der Kartenwerte kürzen sich im Kartenanteil exakt weg; übrig
bleibt nur die 0,1-Rundung des Gesamtwerts.

Zwei Regeln, beide von `check/score.js` (Block H3) geprüft:
- **Die angezeigten Teile ergeben immer exakt die angezeigte
  Tagesveränderung.** Bleibt ein Rest > `HIST_BRK_MAX_REST` (0,35), wird
  **gar keine** Zerlegung gezeigt — lieber nichts als eine Rechnung, die nicht
  aufgeht.
- **Tage ohne `e[7]`/`e[8]` (vor VERSION-CHECK-434 aufgezeichnet) bekommen
  keine Zerlegung.** Der Faktor ist nachträglich nicht rekonstruierbar; er
  hängt von der damaligen Zahl nicht-veralteter Indikatoren ab, und die ist
  nirgends gespeichert.

## Trends: Paar-Score enthält den Carry (2026-08-23)

`renderTrendsPair` rechnete `be[1] − qe[1]` — Basis minus Kurswährung **ohne**
`pairCarryAdj`. Überall sonst rechnet `pairScore()` mit Carry. Die Trends-Linie
zeigte damit eine andere Zahl als Set-ups, Watchlist und Score-Fenster.

**Rückwirkend ist der Carry exakt rekonstruierbar**, und deshalb wird er es
auch: `ind_data.json` führt je Währung die datierte Beschluss-Historie der
Zentralbank (`Central Bank Rate` → `historyFull`, 12–25 Beschlüsse zurück bis
2023). Ein Leitzins ist eine Treppenfunktion — er gilt vom Beschlusstag bis zum
nächsten Beschluss. `rateAtDate(ccy, datum)` bildet genau das ab,
`pairCarryAdjAt(base, quote, datum)` daraus den Carry jenes Tages.

Drei Regeln, alle von `check/scorediff.js` bzw. den Session-Tests gedeckt:
- **`carryStufe(diff)` ist die EINE Staffel.** `pairCarryAdj` (heute) und
  `pairCarryAdjAt` (Historie) rufen beide sie auf — sie können nicht
  auseinanderlaufen.
- **`pairCarryAdjAt` liefert `null`, nicht `0`**, wenn für eine Seite an dem Tag
  kein Zins bekannt ist. Der Aufrufer muss „kein Carry" von „Carry unbekannt"
  unterscheiden können; die Karte weist die Zahl solcher Tage aus.
- **Vor dem ältesten bekannten Beschluss wird nicht hochgerechnet.** Der heutige
  Zins wird nicht rückwärts fortgeschrieben (Grundsatz: nie schätzen).

⚠ **`rateInfo()` MUSS dieselbe Quelle sehen wie `rateAtDate()`**, sonst rechnet
der heutige Punkt der Trends-Linie mit einem anderen Carry als der Paar-Score.
`rateInfo` kannte den Live-Feed vorher gar nicht und nahm den kuratierten
Recherche-Stand — **alle acht Leitzinsen lagen daneben** (EUR 2,00 statt 2,40 %,
JPY 0,75 statt 1,00 %, NZD 2,25 statt 2,50 %, USD 3,625 statt 3,75 %). Der
Research-Eintrag gewinnt jetzt nur noch, wenn er das jüngere Datum trägt.

## Actual-Farbe folgt der Karten-Einstellung (2026-08-23)

In den Asset-Einstellungen lässt sich je Makro-Karte einstellen, ob starke Daten
der verknüpften Währung für dieses Asset **Bullish** (`same`) oder **Bearish**
(`inverse`) sind. `deriveMacroBiasAll()` drehte Karten- und Indikator-Bias
korrekt um — die **Farbe des Actual-Werts** kannte die Einstellung aber nicht.
Bei GOLD mit Inflation auf „Bearish" stand ein heißer CPI grün da, während
GOLDs eigener Bias für denselben Indikator bearish war.

`actualColor(ev, assetId)` nimmt jetzt einen **optionalen** Asset-Kontext.
`actualColorRaw(ev)` ist die unveränderte Rohrichtung.

⚠ **Nur ANZEIGE-Aufrufer bekommen den Kontext** — Indikator-Tabelle,
Asset-Kalender, History-Panel, Compare-Matrix. Die **bias-ableitenden** Aufrufer
(`indBiasFromEvent`, `researchBias`) und `surpriseIndex` bekommen ihn **nicht**:
dort dreht bereits `deriveMacroBiasAll()`, ein zweites Drehen würde die Umkehr
doppelt anwenden. Wer hier etwas ergänzt, muss diese Trennung halten.

Weitere Grenzen, alle getestet: FX-Währungen werden nie gedreht; COT Data und
Risk Environment werden nie gedreht (asset-eigene Daten, nicht in
`MACRO_DERIVE_RUBS`); ohne `assetId` bleibt immer die Rohrichtung (der
allgemeine Kalender hat kein Asset, dessen Einstellung gelten könnte);
synthetische Events mit `ev.bias` werden nicht gedreht (deren Richtung IST
schon der fertige `ind.bias`). Der Score ändert sich dadurch **nicht** — die
Farbe ist reine Anzeige.

## AAII: Ansicht „Weekly bars" (2026-08-23)

Sechste Ansicht: gestapelte Wochensäulen mit dem Prozentwert in jedem Segment,
darunter der Bullish-Verlauf als eigene Linie. Säulen statt Fläche mit Absicht —
die Umfrage erscheint **einmal pro Woche**, das sind einzelne Messpunkte und
kein stetiger Verlauf.

- **Beschriftung in drei Stufen** nach Säulenbreite: ≥30px → `35.5%`, ≥17px →
  `36` (gerundet), darunter gar nichts. Lieber keine Zahl als eine, die über die
  Nachbarsäule läuft.
- **`setAaiiView('bars')` wählt den Zeitraum datengetrieben** (`aaiiBarsRange()`:
  engster Zeitraum mit ≥10 Umfragewochen), nicht fest. Grund: die AAII-Reihe hat
  eine echte Lücke, ein fester „3 Monate" hätte dort **zwei** Säulen gezeigt.
- ⚠ **Lücken werden in der Zeichnung markiert**, nicht nur im Text: gestrichelter
  Bruch mit „N missing", beide Randwochen bekommen ein Pflicht-Datum in
  Signalfarbe, und die Bullish-Linie wird an der Lücke **unterbrochen** statt
  durchgezogen. Die Säulen sitzen in gleichem Abstand nebeneinander — ohne
  Markierung liest man aus der Achse einen lückenlosen Verlauf, den es nie gab.
  (Konkret fehlen 19.03.2026–12.08.2026 zwanzig Umfragen, weil AAIIs
  veröffentlichte Historien-Datei der eigenen Live-Seite monatelang nachhing.)

## Assets sind ein Stapel in der Navigationsleiste (2026-08-23)

Nutzer-Wunsch: *„mach aus der Kategorie Assets einen Stapel und pack bitte auch
mit bias Farben die ganzen Assets darein also die verschwinden dann aus der
Kategorie"*. Die eigene 138px-Spalte (`.sb#sidebar`) auf der Assets-Seite ist
**weg** — die Detailansicht bekommt die volle Breite. Die Assets hängen als
Stapel-Inhalt unter dem Navigationseintrag „Assets".

Nach `AskUserQuestion` festgelegt: **Name in Bias-Farbe + Score + Richtungspfeil**
(keine Sparkline, dafür ist die Leiste zu schmal), **Kategorie-Zwischen­über­schriften
bleiben** (FX / Crypto / Metals / Energy / Indices), und Hinzufügen/Umsortieren/
Löschen erscheinen **nur im Bearbeitungsmodus**.

### Nur Namen, ein einfarbiges Icon davor, keine Bias-Farben

Nach zwei Korrekturrunden (Nutzer, 2026-08-23) sieht eine Zeile so aus:
**Icon + Name**, sonst nichts. Score und Richtungspfeil sind raus — der Score
steht weiter im Tooltip (`data-tip`), und `check/display.js` prüft ihn genau
dort statt im sichtbaren Text.

⚠ **Die Liste färbt NICHT nach Bias.** Alle Zeilen tragen `--t2`, die
ausgewählte `--t0` mit Cyan-Balken links — also exakt das Verhalten eines
aktiven Tabs. Cyan ist in der App ausschließlich Interaktion und kollidiert
deshalb nicht mit den Bias-Farben im Inhalt. `check/display.js` prüft
zusätzlich, dass in der Leiste **kein** `data-bv` mehr steht, damit die
Färbung nicht durch die Hintertür zurückkommt.

Der Grund, warum das überhaupt eine Frage war: `BC` (`#0B5FCC` / `#C50F1A` /
`#55617A`) ist für **helle** Flächen gebaut und kommt auf dem Chrome-Grund
`#2A3757` auf **1,98 / 1,94 / 1,89** — praktisch unlesbar. Wer dort je doch
eine Bias-Farbe einsetzen will, misst sie vorher gegen Grund, Hover **und**
offenen Stapel.

### Der einfarbige Icon-Satz (`AI_GLYPHS` / `assetGlyphHtml`)

Ein **zweiter**, bewusst reduzierter Satz. Der farbige, animierte
(`AI_FLAGS` / `AI_SYMBOLS` / `assetIconHtml`) bleibt unangetastet und steht
weiter im Asset-Kopf und auf der Dashboard-Karte.

⚠ **Warum nicht einfach dem alten Satz die Farbe nehmen:** die Flaggen bestehen
aus farbigen *Flächen*. Zwingt man sie auf eine Farbe, wird aus den USA ein
gefülltes Rechteck und aus Japan dasselbe — genau die Unterscheidbarkeit geht
verloren, die den Sinn ausmacht. Jede Flagge ist deshalb neu als **Geometrie**
gezeichnet: Sternenfeld + Streifen, Sternenkreis, Union-Jack-Kreuze,
Schweizerkreuz, Sonnenscheibe, Ahornblatt zwischen zwei Randbalken, Kreuz des
Südens. Dazu Barrenstapel für Gold, ein **einzelner** Barren für Silber (so
bleiben die beiden unterscheidbar), Tropfen für Öl, Münze für BTC und ein
Kursverlauf für alle Indizes — die teilen sich wie im farbigen Satz eine
Zeichnung, eine eigene Metapher je Index wäre Bedeutung, die es nicht gibt.

Alles in `currentColor`, keine Verläufe, keine Animation, keine `url(#…)`.

⚠ **Zeichengröße beachten:** bei 17px Höhe ist eine SVG-Einheit des 36×24-
Viewports nur ~0,7px breit. Jede Linie dünner als etwa **1,8 Einheiten** fällt
unter ein Gerätepixel, und feine Details werden zu Rauschen statt zu Form. Die
erste Fassung hatte 5 Streifen für USD und 11 Sterne für EUR — bei 15px war
davon nur noch ein Fleck übrig. Wer ein Icon ergänzt: wenige, dicke Elemente,
und danach mit einem 3×-Screenshot gegenprüfen.

### Keine Kategorien in der Liste

Außerhalb des Bearbeitungsmodus ist von den Kategorien **nichts** zu sehen —
weder Überschrift noch Abstand, eine durchgehende Liste (Nutzer-Wunsch, zweite
Korrektur). Die Gruppierung existiert intern weiter und steuert nur noch
Reihenfolge und Sortieren. **Im Bearbeitungsmodus kommen die Überschriften
zurück**, sonst wäre nicht erkennbar, *was* die ▲▼ dort verschieben.

### Warum kein Eintrag in `tabStacks`

Der Stapel benutzt bewusst **denselben Mechanismus** wie die echten Tab-Stapel
(`expandedStack`, `.np-sub-wrap`, die Höhenmessung in `syncNavExpanded()`),
steht aber **nicht** in `tabStacks` — die id ist die Konstante
`ASSET_STACK_ID = '__assets'`. Folge: `openTabMenu()` findet sie nicht und bietet
kein Umbenennen/Auflösen für eine Systemkategorie an, und
`addTabToStack`/`dissolveStack` können sie nie versehentlich anfassen.
Zwei Stellen kennen sie explizit:
- `renderTabBar()` — eigener Zweig für `id==='fx'` vor dem `stackOf`-Lookup.
- `showTab()` — `expandedStack = (activeTabId==='fx') ? ASSET_STACK_ID : …`

### Warum das Zielelement weiter `id="sidebar"` heißt

`renderSidebar()` schreibt nach wie vor in ein Element mit dieser id — es wird
nur an anderer Stelle erzeugt (von `renderTabBar()`). Dadurch bleiben
**`updateSidebarSelection()`, die Score-Auffrischung und alle ~35
`renderSidebar()`-Aufrufer unverändert**. Die Asset-Zeilen behalten aus demselben
Grund `class="ab"` und `data-sym`. Die generischen `.ab`-Regeln sind aber für die
helle Spalte gebaut (u. a. `var(--bg5)`, das der Chrome-Scope **nicht**
überschreibt — das wäre eine weiße Zeile auf Navy), deshalb überschreiben
`#navSidebar .ab…`-Regeln sie mit höherer Spezifität.

Zwei Reihenfolge-Regeln:
- `renderTabBar()` ruft am **Ende** `renderSidebar()` — das Zielelement entsteht
  ja erst in diesem Aufruf.
- `renderSidebar()` ruft am Ende `syncNavExpanded()`. Die aufgeklappte Höhe steht
  als **Inline-Wert** und muss nach jeder Inhaltsänderung neu gemessen werden,
  sonst schneidet sie ab (z. B. sobald der Bearbeitungsmodus zwei Knöpfe ergänzt).

### Bearbeitungsmodus

`sbEditMode` (Boolean, bewusst **nicht** persistiert — temporärer Zustand wie der
Dashboard-Bearbeitungsmodus, kein Nutzer-Inhalt). Ein langer Druck auf den
Assets-Kopf **oder** auf ein Asset schaltet ihn ein, „Done" wieder aus. Erst dann
erscheinen ▲▼ je Asset und je Kategorie, × bei eigenen Symbolen und „Add symbol".
Ein Klick auf ein Asset navigiert auch im Bearbeitungsmodus ganz normal und
**lässt den Modus an**, damit sich mehrere Einträge hintereinander sortieren
lassen. Ersetzt die früheren Einzel-Zustände `sbReorderId`/`sbCatReorder` (bei
denen man für jeden Eintrag neu drücken musste); sie sind samt `sbCatClick` und
den toten CSS-Regeln `.sb`/`.sb-lbl`/`.ab-move`/`.ab-del`/`.add-sym` entfernt.

### Drei Fehler im aufgeklappten Stapel (2026-08-24)

Nutzer-Bugreport: *„wenn man den ausklappt ist da keine Animation und man
kommt schnell in den Bearbeitungsmodus aber den sieht man nicht richtig und
man kommt nicht mehr raus."* Alle drei hingen zusammen — beide Wurzeln lagen
im selben CSS-Mechanismus (`.np-sub-wrap` in `#navSidebar`).

**1. Keine Aufklapp-Animation.** `#navSidebar .np-sub-wrap.np-assets.open
{max-height:none}` sollte die generische `520px`-Basisdeckelung für den
langen Assets-Stapel aufheben. `syncNavExpanded()` liest dafür
`w.scrollHeight`, um danach die exakte Pixelhöhe inline zu setzen — und genau
dieses Lesen **zwingt den Browser, den Stil vorher synchron aufzulösen**. In
exakt diesem Zwischenzustand (Klasse `.open` schon gesetzt, Inline-Wert noch
nicht) griff diese `none`-Regel. Von `none` lässt sich nicht zu einem
Pixelwert animieren — der Übergang sprang seither ohne jede Animation direkt
auf die Endgröße. Andere Stapel (z. B. „Insights") waren nicht betroffen: für
sie greift im selben Zwischenzustand nur die generische `520px`-Regel, und
zwischen zwei numerischen Werten kann der Browser sehr wohl interpolieren.
**Fix:** die `none`-Regel ist ersatzlos entfernt — unnötig, denn
`syncNavExpanded()` setzt nach *jedem* `renderSidebar()`-Aufruf ohnehin eine
exakte Inline-Höhe, die die `520px`-Deckelung automatisch schlägt.

**2. Bearbeitungsmodus unsichtbar/unerreichbar.** `.np-sub-wrap` hatte kein
`flex-shrink:0`. `#navSidebar` ist selbst ein Flex-Container mit begrenzter
Höhe — ohne diese Eigenschaft wurde der aufgeklappte Assets-Stapel von den
Nachbar-Einträgen (Dashboard, Insights, …) **zusammengedrückt**, statt dass
die Leiste selbst scrollt (sie ist `overflow-y:auto`). Gemessen: der Wrapper
hatte `max-height` **und** `scrollHeight` korrekt auf `669px` im
Bearbeitungsmodus, wurde aber trotzdem nur `568px` hoch gerendert — die
fehlenden 101px waren exakt der „Done"-Knopf, lautlos abgeschnitten durch das
eigene `overflow:hidden`. **Fix:** `flex-shrink:0` auf `.np-sub-wrap` — die
Navigationsleiste scrollt jetzt korrekt, sobald der Bearbeitungsmodus mehr
Platz braucht, statt Inhalt unsichtbar zu verlieren
(`navSidebarScrollHeight` wich danach messbar von `clientHeight` ab, vorher
waren beide identisch — der Beweis, dass vorher nie echter Überlauf
entstand, weil alles hineingequetscht wurde).

**3. `scrollIntoView()` traf den falschen Vorfahren.** Für die dritte
Verbesserung — die gedrückte Zeile beim Einstieg in den Bearbeitungsmodus
automatisch ins Sichtfeld holen — lag der naheliegende Ansatz
`row.scrollIntoView({block:'nearest'})` nahe. Per Playwright nachgestellt:
das griff **nicht** `#navSidebar` (das einzige für den Nutzer sichtbare
`overflow-y:auto`), sondern `.np-sub-wrap`/`#sidebar` selbst — das trägt
`overflow:hidden` für die Aufklapp-Animation, und `overflow:hidden` zählt für
`scrollIntoView()` als gültiges Scroll-Ziel, obwohl es für den Nutzer gar
keinen Scrollbalken hat. Der Aufruf verschob lautlos dessen **internen**
`scrollTop`, während die tatsächlich sichtbare Navigationsleiste
unverändert blieb — die Zeile blieb weiterhin verdeckt.
**Fix:** eine eigene Funktion `scrollIntoNav(el)`, die explizit gegen
`#navSidebar` rechnet (Vergleich der `getBoundingClientRect()`-Werte gegen
die Leiste selbst, nicht gegen `0`/`clientHeight`), statt sich auf die
Vorfahren-Suche des Browsers zu verlassen. Wird zweimal aufgerufen — sofort
und nochmal nach 300ms, weil der Wrapper beim Wechsel in den
Bearbeitungsmodus über denselben `max-height`-Übergang wächst und die Zeile
sich dabei verschiebt.

⚠ **Merksatz für künftige `.np-sub-wrap`-Änderungen:** jede Sonderregel, die
den generischen `.open`-Zustand überschreibt (Farbe, Deckelung, Höhe, …),
kann `syncNavExpanded()`s `scrollHeight`-Lesen mitten in einem
Zwischenzustand erwischen. Vor jeder solchen Änderung mit Playwright prüfen,
ob der Übergang noch **animiert** (Frame-für-Frame-Messung wie im
Scratchpad-Test, nicht nur der Endzustand) — ein Snap-to-final sieht in
einem einzelnen Screenshot identisch aus wie eine erfolgreiche Animation.

### Was `check/nav.js` jetzt prüft

Prüfung **E** zielte früher auf `fx` als „Tab außerhalb jedes Stapels" — seit
diesem Umbau ist `fx` selbst einer, und dass er aufklappt, ist gewollt. Sie wählt
jetzt einen Tab, der **nachweislich** in keinem Stapel steckt, und prüft gezielt,
dass genau der zuvor geöffnete Stapel wieder zu ist **und** dass überhaupt keiner
offen bleibt — strenger als vorher. Neu dazu **E2** als Gegenprobe: der
Assets-Stapel klappt beim Wechsel auf die Assets-Seite auf, wird hervorgehoben und
enthält mindestens ein Asset. Ohne E2 könnte eine spätere Verschärfung von E den
Stapel dauerhaft zuklappen, ohne dass es auffällt.
