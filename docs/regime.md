# Regime Radar (Tab „Regime", seit 2026-09-15)

Referenziert von `CLAUDE.md`. Code: `js/regime.js` (Rechnung) +
`renderRegime()` in `js/main.js` (Darstellung). Wächter: `check/regime.js`.

Anlass, wörtlich: *„Stell mir mal zusammen so Szenarien generell z.B. Crash
was könnte man beobachten für Indikatoren z.B. Produktivität usw … und wie
könnte man das auf der Webseite hinzufügen."* Abgestimmt per Rückfrage:
**Stufe 1 als eigener Tab, ohne neue Datenquelle.**

---

## ⚠️ Die drei Regeln, die dieses Modul tragen

### 1. Kein Score-Eingriff — niemals

Ein Regime ist **Kontext für die Deutung**, keine dreizehnte Stimme in
derselben Summe. Genau das war „Risk Environment", und es ist am 2026-09-13
auf Nutzer-Wunsch wieder ausgebaut worden. `js/regime.js` liest nur; es
schreibt nirgends einen Bias, kein Score-Feld, keine History.

**Wer hier eine Score-Anbindung einbauen will, baut damit Risk Environment
nach** — und das war eine bewusste Entscheidung des Nutzers, keine
Nachlässigkeit.

### 2. Nichts wird geschätzt (Grundsatz 4)

Eine Bedingung ohne echte Live-Quelle liefert `null`, erscheint als
**„Not measured"** mit ihrem Grund daneben (nicht in einem Tooltip — auf dem
iPad gibt es kein Hover), zählt weder als erfüllt noch als nicht erfüllt und
**fällt aus dem Nenner**.

### 3. Jede Schwelle gegen die eigene Historie

„VIX über 20" altert; „VIX über seinem eigenen 80. Perzentil" nicht. Wo eine
absolute Schwelle steht (Kurve unter null, PMI unter 50), ist sie
**definitorisch** und nicht kalibriert — und auch das ist im Code vermerkt.

---

## Die drei Schutzregeln gegen zu selbstbewusste Zahlen

Zwei davon sind **Befunde aus dem ersten Live-Lauf**, nicht Theorie.

| Regel | Wo | Was ohne sie passierte |
|---|---|---|
| „Not measured" fällt aus dem Nenner | `regimeAuswerten()` | ein halb belegtes Regime sähe schwach aus statt unvollständig |
| **Kernbedingung** (`kern:true`): fehlt sie, kann das Szenario nie führendes Regime sein | `regimeStand()` + `renderRegime()` | **Funding Squeeze stand mit 100 % an der Spitze**, obwohl genau die zwei Bedingungen fehlten, die es von gewöhnlichem Risk-off unterscheiden (Cross-Currency-Basis, SOFR-OIS). Drei erfüllte Nebenbedingungen ergaben eine glatte 100 |
| **`REGIME_MIN_BED = 3`**: darunter gar kein Prozentwert | `regimeAuswerten()` | **Productivity Upswing stand bei JPY auf 100 %** — aus einer einzigen zutreffenden Bedingung |

⚠ Die gemeinsame Fehlerklasse: **eine Zahl, die mehr behauptet, als die
Datenlage hergibt.** Das ist derselbe Fehler wie ein geschätzter Wert, nur
schwerer zu sehen, weil jede Einzelrechnung stimmt.

---

## Die Bausteine (alle aus vorhandenen Feeds)

| Funktion | Rechnet | Quelle |
|---|---|---|
| `rgKurve(ccy)` | 10Y − 2Y, Perzentil, 3-Monats-Änderung | `bond_data` |
| `rgRealzins(ccy)` | 10Y − CPI y/y | `bond_data` + `ind_data` |
| `rgVol(id,n)` | annualisierte realisierte Vol + Perzentil | `price_data` |
| `rgDrawdown(id,n)` | Abstand zum n-Tage-Hoch | `price_data` |
| `rgRendite(id,n)` | Rendite über n Handelstage | `price_data` |
| `rgVix()` | Stand, Perzentil, **5-Tage-Schub** | `sentiment_data` |
| `rgPutCall()` | Stand + Perzentil | `sentiment_data` |
| `rgRisk()` | fertiger Risk-Index | `risk_index` |
| `rgHafen()` | (JPY+CHF+Gold)/3 − (AUD+NZD)/2 über 5 Tage | `price_data` |
| `rgDollarBreite()` | gegen wie viele von 7, und ob auch gegen JPY **und** CHF | `price_data` |
| `rgUeberraschung(ccy,name,n)` | wie viele der letzten n über Forecast | `ind_data.historyFull` |
| `rgArbeitslos(ccy)` | Quote minus eigenes 12-Meldungs-Tief (Sahm) | `ind_data` |
| `rgClaims(ccy)` | 4-Wochen-Schnitt gegen zwei Monate davor | `ind_data` |
| `rgSpreizung()` | Spannweite der 2Y-Renditen über 8 Währungen | `bond_data` |
| `rgCpiTrend(ccy)` | CPI y/y jetzt gegen vor 6 Meldungen | `ind_data` |
| `rgProduktivitaet(ccy)` | **Näherung**: GDP q/q gegen Beschäftigungsentwicklung | `ind_data` |

### ⚠️ Die Falle: `CPI` ist NICHT die Jahresrate

In `ind_data.json` ist der Eintrag **`CPI` die Monatsrate** (`period: "m/m"`).
Die Jahresrate steht unter **`CPI (Headline)`** (`period: "y/y"`).

Mit der falschen gerechnet ergibt der US-Realzins **+4,57pp statt +1,58pp** —
eine völlig falsche Aussage, die trotzdem wie eine Zahl aussieht. `rgRealzins()`
nennt den Eintrag deshalb ausdrücklich, und `check/regime.js` hat dafür eine
eigene Meldung („MONATSRATE STATT JAHRESRATE").

---

## Die sieben Szenarien

| Szenario | Kerngedanke |
|---|---|
| **Risk-Off Shock** | nicht „Aktien fallen", sondern Korrelationen, die in eine Richtung zusammenfallen. ⚠ Kernbedingung (Kreditspreads) fehlt |
| **Funding Squeeze** | Dollar-Knappheit: Dollar fest gegen **alles**, Gold fällt **mit** den Aktien. ⚠ Kernbedingung (Basis) fehlt |
| **Inflation Shock** | Richtung und Überraschungen, nicht das Niveau; entscheidend ist der **Realzins** |
| **Growth Slowdown** | ⚠ Das Rezessionssignal ist die **Rückversteilerung** aus der Inversion, nicht die Inversion |
| **Policy Divergence** | 2Y-Spread als marktimplizite Politikdifferenz |
| **Soft Landing** | bewusst ein **eigenes** Szenario, nicht „keines der anderen" — sonst liest das Radar einen völlig normalen Markt als Informationsmangel |
| **Productivity Upswing** | strukturell, über Quartale. ⚠ Kernbedingung (BLS) fehlt, die Näherung ist gekennzeichnet |

**Warum `rate_probabilities.json` bewusst NICHT benutzt wird:** die Bedeutung
der Prozentzahl je Sitzung wäre erst zu verifizieren. Eine schmalere, aber
sicher verstandene Größe (der 2Y-Spread) ist besser als eine breitere, die
falsch gelesen werden könnte.

---

## Was der App fehlt (und ausdrücklich dasteht)

| Fehlt | Szenario | Warum es zählt |
|---|---|---|
| US-HY-Kreditspreads | Risk-Off (**Kern**) | der Unterschied zwischen Korrektur und Systemstress |
| Cross-Currency-Basis | Funding (**Kern**) | der Dollar-Knappheitsindikator |
| SOFR-OIS | Funding | |
| BLS-Produktivität | Productivity (**Kern**) | |
| Lohnstückkosten | Productivity | Brücke zwischen Löhnen und Inflation |

Alle fünf gibt es bei FRED kostenlos — ein Workflow nach dem Muster des
bestehenden Bond-Scrapers wäre der nächste sinnvolle Schritt, wenn der Nutzer
ihn will.

## Zustand

Einziger persistierter Zustand: **`regimeCcy`** (Währung für Kurve, Realzins,
CPI, Arbeitsmarkt). Nach dem Muster von `abChartRange` an allen vier Stellen
gerätweit gesynct — `cloudPush` (×2), `cloudPull`, `importData`, siehe
`docs/state-sync.md`.
