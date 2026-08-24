# FX Analyst Pro

Single-file web app (`index.html`) for discretionary FX / macro analysis: per-currency
indicator scoring, COT, sentiment, seasonality, rate probabilities and more. Data JSONs
are produced hourly by the GitHub Actions workflow `.github/workflows/update-ff-calendar.yml`.

**Live deploy is a Cloudflare Worker** (`fx-final.jonathan-fa5.workers.dev`, behind
Cloudflare Access) — **not** GitHub Pages. `jo-brxxn.github.io/FX-final/` exists as an
unprotected secondary mirror, served straight from `main`. `index.html` tells the two
apart at runtime (`DATA_BASE` in `index.html`, `const SK='fxpro_v1'` section): on
`github.io`/`localhost` it fetches the data JSONs same-origin (relative path); on every
other hostname — including the Worker — it fetches them from
`raw.githubusercontent.com` directly, since the Worker serves a static snapshot instead
of rebuilding on every hourly data push.

**⚠ This means the data JSONs must stay world-readable via GitHub's raw endpoint.** If
the repo is made private, `raw.githubusercontent.com` starts rejecting the browser's
anonymous fetch and the Worker-hosted app goes blank (no calendar, no indicators, no
prices) even though the Worker itself keeps running — it just has no code path to fetch
authenticated data from a private repo without embedding a token in client-side JS
(which would defeat the point of making it private). Full writeup:
`docs/CHANGELOG.md`, "Wo die App tatsaechlich liegt".

## How Claude communicates with the user (IMPORTANT)

**Never estimate, guess, or hard-code a value that should come from a live source.**
If a real value cannot be obtained, do **not** invent one — instead surface a **message on
the dashboard** describing the situation. The dashboard message is the channel through
which the app (and Claude) tells the user something needs attention. This applies to any
case where real data is missing, a source is unavailable, or a decision needs the user.

## Indicator data-source policy (macro indicators only)

Applies to the "normal" macro indicators (CPI, GDP, PPI, PMI, NFP, Retail Sales, Consumer
Confidence, employment, …). It does **not** apply to COT, bond yields, put/call, risk
sentiment, or other non-calendar feeds — those keep their own dedicated sources.

1. **Primary source: Investing.com.** All of actual, forecast and previous for a given
   macro indicator come from Investing.com's economic calendar.
2. **Fallback only when Investing.com is blocked.** Investing.com is intermittently
   Cloudflare-blocked even from GitHub runners. If a fetch fails after several retries, the
   workflow falls back — **per indicator** — to whichever alternative source
   (ForexFactory / Trading Economics / FXStreet / TradingView) supplies a complete
   actual+forecast+previous.
3. **Fallback values are flagged as non-authoritative.** When a value did **not** come from
   Investing.com, it is highlighted in the UI and a **dashboard pop-up** lists which
   indicator(s) currently use a different source. A dedicated `*/10`-minute workflow keeps
   retrying Investing.com **only while a fallback is active** (no-op otherwise); once
   Investing.com returns, the value is written back and the highlight/pop-up clear
   automatically.
4. **Two distinct dashboard messages:**
   - *Temporary block* — Investing.com is expected to carry the indicator but is currently
     blocked → highlight + self-clearing pop-up.
   - *Permanent gap* — Investing.com never carries the indicator → its own persistent
     dashboard message so the user can decide how to handle it (the user manages these).

## Conventions

Project conventions, scoring logic and the full change history live in `CLAUDE.md`.
