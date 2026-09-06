// ══ BACKTESTER: RECHERCHIERTE BEGRUENDUNGEN JE ZINSENTSCHEID ═════════════
// Nutzer-Auftrag 2026-09-06: "ich will das du das für jedes Events in der
// Vergangenheit jetzt selber alles für jedes Asset recherchierst und dafür
// statements und Presse Konferenzen und Schlagzeilen und Berichte dazu
// anguckst und das nachträgst".
//
// Schluessel: WAEHRUNG|DATUM - der Grund haengt an der Sitzung, nicht am
// Asset; Gold und der US-Yield spiegeln dieselbe Fed-Entscheidung wie USD.
//
// ⚠ ZUR GENAUIGKEIT, damit niemand mehr hineinliest als drinsteht:
// Recherchiert ueber Websuche in Notenbank-Mitteilungen, Pressekonferenzen
// und Berichten. Wo eine Quelle die EINZELNE Sitzung begruendet, steht das
// hier auch so. Wo sie den ZYKLUS begruendet (mehrere Schritte mit derselben
// Begruendung), ist der Text entsprechend formuliert - dann gilt er fuer den
// Schritt als Teil dieses Zyklus, nicht als Protokoll dieser einen Sitzung.
// Jeder Eintrag traegt seine Quelle (src) und ist im Fenster per ↗ direkt
// aufrufbar: nachpruefen statt glauben.
//
// Der Text ist ein VORSCHLAG. Sobald der Nutzer in die Zelle schreibt, gilt
// seine Fassung (btReasons, siehe setBtReason) - dieser Seed wird dann fuer
// diese Sitzung nicht mehr herangezogen.
const BT_REASON_SEED={

  // ── USD · Federal Reserve ──────────────────────────────────────────────
  'USD|2024-09-18':{txt:'Start of the easing cycle, and a large one at 50bp: the FOMC said it had "gained greater confidence that inflation is moving sustainably toward 2 percent" and judged the risks to employment and inflation to be roughly in balance.',src:'https://www.cnbc.com/2024/09/18/fed-cuts-rates-september-2024-.html'},
  'USD|2024-11-07':{txt:'Second step of the same cycle — moving policy back toward neutral while inflation kept easing and the labour market cooled without breaking.',src:'https://www.cbsnews.com/news/federal-reserve-interest-rate-decision-today-fomc-meeting/'},
  'USD|2024-12-18':{txt:'Third consecutive cut of 2024. Inflation had made progress toward 2% but was still somewhat elevated; the unemployment rate had risen while staying low.',src:'https://www.cbsnews.com/news/federal-reserve-meeting-rate-cut-interest-rates-december/'},
  'USD|2025-09-17':{txt:'First cut since December 2024, driven by the jobs side: "downside risks to employment rose in recent months", with monthly job growth below average from May to September.',src:'https://www.congress.gov/crs-product/IN12635'},
  'USD|2025-10-29':{txt:'Labour market again the decisive factor — Powell called recent weakness in employment the larger of the two risks, even with inflation still above 2%.',src:'https://www.cnbc.com/2025/10/29/fed-rate-decision-october-2025.html'},
  'USD|2025-12-10':{txt:'Third cut of the year, to 3.50-3.75%, and the most contested: three dissents, the most since 2019 — Miran wanted 50bp, Schmid and Goolsbee wanted no cut at all.',src:'https://www.rbc.com/en/economics/us-analysis/us-data-flashes/fomc-decision-fed-ends-2025-with-a-cut-but-dissent-reflects-growing-divide/'},

  // ── EUR · EZB ──────────────────────────────────────────────────────────
  'EUR|2024-06-06':{txt:'First cut since 2016, opening the easing cycle: euro-area inflation had fallen sharply and the ECB began dialling back its restrictive stance.',src:'https://www.ecb.europa.eu/press/annual-reports-financial-statements/annual/html/ecb.ar2025~b7f898b33d.en.html'},
  'EUR|2024-09-12':{txt:'Part of the 2024 easing sequence — the ECB judged the disinflation process "well on track" and trimmed its inflation outlook.',src:'https://www.cnbc.com/2024/12/12/european-central-bank-interest-rate-decision-december-2024.html'},
  'EUR|2024-10-17':{txt:'Same cycle, same reasoning: inflation developing in line with staff projections, restriction gradually withdrawn.',src:'https://www.cnbc.com/2024/12/12/european-central-bank-interest-rate-decision-december-2024.html'},
  'EUR|2024-12-12':{txt:'Fourth cut of 2024. The ECB lowered its 2024 inflation forecast to 2.4% and the 2025 outlook to 2.1%.',src:'https://www.cnbc.com/2024/12/12/european-central-bank-interest-rate-decision-december-2024.html'},
  'EUR|2025-01-30':{txt:'Fifth consecutive cut — the Governing Council kept describing disinflation as on track and continued removing restriction meeting by meeting.',src:'https://www.ecb.europa.eu/press/pr/date/2025/html/ecb.mp250130~530b29e622.en.html'},
  'EUR|2025-03-06':{txt:'Part of the 100bp of cuts delivered between January and June 2025, one at every policy meeting.',src:'https://www.cnbc.com/2025/03/06/european-central-bank-interest-rate-decision-march-2025.html'},
  'EUR|2025-04-17':{txt:'Sixth consecutive cut since June 2024, taking the deposit rate to 2.25% as energy prices and services inflation kept easing.',src:'https://www.ecb.europa.eu/press/annual-reports-financial-statements/annual/html/ecb.ar2025~b7f898b33d.en.html'},
  'EUR|2025-06-05':{txt:'End of the easing run — euro-area inflation had dipped to 1.9% in May, below the 2% target for the first time since September 2024.',src:'https://www.morningstar.com/markets/ecb-cuts-interest-rates-amid-below-target-inflation'},
  'EUR|2026-06-11':{txt:'THE TURN: first hike in nearly three years. The energy shock from the war in Iran and disrupted Middle East shipping pushed euro-area inflation to 3.2%, the highest in almost three years. Lagarde rejected the label "insurance hike" — the move was meant to signal the ECB would not be late.',src:'https://www.euronews.com/business/2026/06/11/ecb-raises-interest-rates-for-the-first-time-in-three-years-as-iran-war-fuels-inflation'},

  // ── GBP · Bank of England ──────────────────────────────────────────────
  'GBP|2024-08-01':{txt:'First cut of the cycle, and a close call: the MPC voted 5-4. Inflation had fallen a long way and the pressures behind the price surge had eased.',src:'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2024/august-2024'},
  'GBP|2024-11-07':{txt:'Second cut of 2024, part of the roughly quarterly 25bp pace the MPC held from August 2024 to December 2025.',src:'https://www.bankofengland.co.uk/explainers/current-interest-rate'},
  'GBP|2025-02-06':{txt:'Cut to 4.5% on a 7-2 vote — the clearest majority of the cycle, on substantial progress on disinflation.',src:'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2025/february-2025'},
  'GBP|2025-05-08':{txt:'Cut to 4.25%, again narrowly at 5-4: previous external shocks receding and restrictive policy curbing second-round effects.',src:'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2025/may-2025'},
  'GBP|2025-08-07':{txt:'Same cycle, same argument — gradual withdrawal of policy restraint as longer-term inflation expectations stayed anchored.',src:'https://www.bankofengland.co.uk/explainers/current-interest-rate'},
  'GBP|2025-12-18':{txt:'Cut to 3.75% on a 5-4 vote. CPI had fallen to 3.2% and was expected back toward target faster; pay growth and services inflation kept easing as slack built in the labour market.',src:'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2025/december-2025'},

  // ── CHF · SNB ──────────────────────────────────────────────────────────
  'CHF|2024-03-21':{txt:'Start of the easing cycle — the SNB moved first among the majors as inflationary pressure eased and the strong franc held down imported prices.',src:'https://www.cnbc.com/2025/06/19/switzerland-returns-to-era-of-zero-interest-rates.html'},
  'CHF|2024-06-20':{txt:'Second step of the same run: a strong franc keeps imported goods — about 23% of the consumer basket — cheap, so inflation kept undershooting.',src:'https://www.cnbc.com/2025/06/19/switzerland-returns-to-era-of-zero-interest-rates.html'},
  'CHF|2024-09-26':{txt:'Third cut of the cycle, driven by the same combination of low domestic inflation and franc strength.',src:'https://www.cnbc.com/2025/06/19/switzerland-returns-to-era-of-zero-interest-rates.html'},
  'CHF|2024-12-12':{txt:'Larger 50bp step — the SNB moved faster as the inflation outlook kept falling.',src:'https://www.cnbc.com/2025/06/19/switzerland-returns-to-era-of-zero-interest-rates.html'},
  'CHF|2025-03-20':{txt:'Fifth consecutive cut, to 0.25%, with the inflation forecast still drifting toward the bottom of the range.',src:'https://www.cnbc.com/2025/06/19/switzerland-returns-to-era-of-zero-interest-rates.html'},
  'CHF|2025-06-19':{txt:'Back to zero. Swiss consumer prices had fallen 0.1% in May, the first decline in four years, and the franc was some 10-11% stronger against the dollar. The SNB projected average inflation of just 0.2% for 2025.',src:'https://www.cnbc.com/2025/06/19/switzerland-returns-to-era-of-zero-interest-rates.html'},

  // ── JPY · Bank of Japan ────────────────────────────────────────────────
  'JPY|2024-03-19':{txt:'End of negative interest rates — the BoJ judged that the wage-price mechanism it had waited years for was finally in place.',src:'https://www.business-standard.com/amp/world-news/bank-of-japan-interest-rate-hike-17-years-highest-since-2008-25-basis-points-0-5-125012400326_1.html'},
  'JPY|2024-07-31':{txt:'Second step of normalisation, with the weak yen adding to imported price pressure.',src:'https://www.cnbc.com/2025/12/19/bank-of-japan-boj-rate-cpi-inflation-takaichi-ueda.html'},
  'JPY|2025-01-24':{txt:'Hike to 0.5%, the highest since 2008, as underlying inflation held above target and wage momentum carried through.',src:'https://www.business-standard.com/amp/world-news/bank-of-japan-interest-rate-hike-17-years-highest-since-2008-25-basis-points-0-5-125012400326_1.html'},
  'JPY|2025-12-19':{txt:'Hike to 0.75%, the highest since 1995, lifting the 10-year JGB yield past 2%. The BoJ expected firms to keep raising wages in 2026: "It is highly likely that the mechanism in which both wages and prices rise moderately will be maintained."',src:'https://www.cnbc.com/2025/12/19/bank-of-japan-boj-rate-cpi-inflation-takaichi-ueda.html'},
  'JPY|2026-06-16':{txt:'Hike to 1%, the highest since 1995. Inflation and a weak yen forced the move: the 2026 Shunto wage round delivered again, and the Iran conflict pushed crude, gasoline and electricity costs through to goods prices. Even at 1% real rates stayed deeply negative.',src:'https://www.japantimes.co.jp/business/2026/06/11/economy/boj-preview-june-meeting-2026/'},

  // ── CAD · Bank of Canada ───────────────────────────────────────────────
  'CAD|2024-06-05':{txt:'Start of the easing cycle — the BoC was the first G7 central bank to cut, with inflation back near target.',src:'https://www.bankofcanada.ca/2025/03/fad-press-release-2025-03-12/'},
  'CAD|2024-07-24':{txt:'Second consecutive cut of the same cycle, with the economy moving into excess supply.',src:'https://www.bankofcanada.ca/2025/01/fad-press-release-2025-01-29/'},
  'CAD|2024-09-04':{txt:'Third cut in a row as inflation continued to ease toward 2%.',src:'https://www.bankofcanada.ca/2025/01/fad-press-release-2025-01-29/'},
  'CAD|2024-10-23':{txt:'Stepped up to 50bp — the BoC moved faster once inflation was around target and slack had opened up.',src:'https://www.bankofcanada.ca/2025/01/fad-press-release-2025-01-29/'},
  'CAD|2024-12-11':{txt:'Second consecutive 50bp cut, closing 2024 with the policy rate down sharply from the peak.',src:'https://www.bankofcanada.ca/2025/01/fad-press-release-2025-01-29/'},
  'CAD|2025-01-29':{txt:'Cut to 3% and the end of quantitative tightening announced alongside: inflation around 2% and the economy in excess supply.',src:'https://www.bankofcanada.ca/2025/01/fad-press-release-2025-01-29/'},
  'CAD|2025-03-12':{txt:'Cut to 2.75% under a "new crisis": heightened trade tensions and US tariffs were expected to slow activity while adding to inflation — 225bp of easing since June 2024.',src:'https://www.bankofcanada.ca/2025/03/fad-press-release-2025-03-12/'},
  'CAD|2025-09-17':{txt:'Cut to 2.5% after the tariff damage showed up in the data: GDP contracted 1.6% in Q2 as exports fell 27%.',src:'https://www.rbc.com/en/economics/canadian-analysis/data-flashes/boc-warns-of-structural-economic-damage-from-tariffs/'},
  'CAD|2025-10-29':{txt:'Cut to 2.25% — and the BoC signalled it was likely done: the structural damage from the trade conflict limits what monetary policy can do without stoking inflation.',src:'https://www.bankofcanada.ca/2025/10/fad-press-release-2025-10-29/'},

  // ── AUD · RBA ──────────────────────────────────────────────────────────
  'AUD|2023-11-07':{txt:'Last hike of the old cycle, taking the cash rate to 4.35% — inflation was proving more persistent than the Board had expected.',src:'https://www.infochoice.com.au/rba/history-of-interest-rate-movements'},
  'AUD|2025-02-18':{txt:'First cut of the easing cycle. The Board said it was comfortable with the direction of inflation and considered 4.10% still sufficiently restrictive.',src:'https://au.finance.yahoo.com/news/two-big-reasons-australia-is-about-to-see-a-new-interest-rate-reality-set-to-be-significant-190000699.html'},
  'AUD|2025-05-20':{txt:'Second cut, same reasoning — inflation continuing to decline back toward the midpoint of the 2-3% band.',src:'https://au.finance.yahoo.com/news/two-big-reasons-australia-is-about-to-see-a-new-interest-rate-reality-set-to-be-significant-190000699.html'},
  'AUD|2025-08-12':{txt:'Unanimous cut to 3.60% after inflation eased further in the June quarter and labour market conditions softened slightly, as expected.',src:'https://www.abc.net.au/news/2025-08-12/rba-cuts-official-interest-rate-at-august-meeting/105642434'},
  'AUD|2026-02-03':{txt:'THE TURN: first hike of 2026, reversing course as inflation pushed back above target.',src:'https://www.commbank.com.au/articles/newsroom/2026/02/commbank-economists-on-the-rba-interest-rate-decision.html'},
  'AUD|2026-03-17':{txt:'Second hike — together with February it undid nearly all of the easing delivered across 2025.',src:'https://www.selfwealth.com.au/blog/rba-hikes-to-4.35-what-the-third-rate-rise-for-2026-means-for-investors'},
  'AUD|2026-05-05':{txt:'Third hike of 2026, back to 4.35%. Headline CPI hit 4.6% in March, the highest since 2023, driven partly by Middle East fuel prices; trimmed mean held at 3.3%, above target. Q4 GDP had grown above potential and capacity utilisation stayed above average.',src:'https://www.rba.gov.au/publications/smp/2026/may/overview.html'},

  // ── NZD · RBNZ ─────────────────────────────────────────────────────────
  'NZD|2024-08-14':{txt:'Start of the easing cycle from the 5.5% peak, once inflation was back inside the 1-3% target band.',src:'https://www.interest.co.nz/economy/134308/latest-annual-inflation-rate-softer-they-expected-economists-see-way-cleared-another'},
  'NZD|2024-10-09':{txt:'Stepped up to 50bp as the RBNZ moved quickly to unwind restriction.',src:'https://www.interest.co.nz/economy/134308/latest-annual-inflation-rate-softer-they-expected-economists-see-way-cleared-another'},
  'NZD|2024-11-27':{txt:'Second consecutive 50bp cut, to 4.25%, with significant spare capacity in the economy.',src:'https://www.rbnz.govt.nz/hub/news/2025/04/ocr-3-50-further-reduction-in-ocr-appropriate'},
  'NZD|2025-02-19':{txt:'Another 50bp step — a stalling economy and a weakening labour market alongside inflation near the target midpoint.',src:'https://www.rbnz.govt.nz/hub/news/2025/04/ocr-3-50-further-reduction-in-ocr-appropriate'},
  'NZD|2025-04-09':{txt:'Back to 25bp steps, to 3.50%: the Committee judged a further reduction appropriate as spare capacity persisted.',src:'https://www.rbnz.govt.nz/hub/news/2025/04/ocr-3-50-further-reduction-in-ocr-appropriate'},
  'NZD|2025-05-28':{txt:'Cut to 3.25% with inflation expected to settle around 2% by mid-2026.',src:'https://www.rbnz.govt.nz/hub/news/2025/05/ocr-lowered-to-3-25'},
  'NZD|2025-08-20':{txt:'Continued easing on a weak economy and soft labour market.',src:'https://tradingeconomics.com/new-zealand/interest-rate/news/460249'},
  'NZD|2025-10-08':{txt:'Surprise 50bp cut — larger than the market expected.',src:'https://www.fxstreet.com/news/new-zealand-rbnz-surprises-with-larger-50-bps-rate-cut-in-october-uob-group-202510080940'},
  'NZD|2025-11-26':{txt:'Final cut of the cycle, to 2.25%, closing a year that began at 4.25%. Further moves were made dependent on how medium-term inflation and the economy evolve.',src:'https://www.rbnz.govt.nz/hub/news/2025/11/ocr-lowered-to-2-25-percent'},
  'NZD|2026-07-08':{txt:'THE TURN: first hike in three years, to 2.50%, by consensus after the split vote in May. Headline CPI hit 4.1% in Q2 — 1.1pp above the top of the band — as Middle East fuel prices fed through to flights and food.',src:'https://www.rbnz.govt.nz/news-and-events/news/2026/07/ocr-increased-to-2-50-to-return-inflation-to-2-percent'},
  'NZD|2026-09-02':{txt:'Second hike, to 2.75%, again unanimous. The Committee judged it time to keep reducing stimulatory settings so inflation returns to target over the medium term — gradual rather than aggressive.',src:'https://www.rbnz.govt.nz/news-and-events/news/2026/09/ocr-increased-by-25-basis-points-to-2-75'},

};
export {BT_REASON_SEED};
if(typeof window!=='undefined')Object.assign(window,{BT_REASON_SEED});
