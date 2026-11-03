# SimpliEarn: Hype vs. Reality (Tier 1)

Grok reads an earnings call, pulls out management's key claims, checks each one against live
X posts and the web, and scores the gap between the story and the market's reaction.

## Run it (2 minutes)

    pip install -r requirements.txt
    export XAI_API_KEY=xai-...            # no key = sample-data mode, UI still works
    uvicorn app.main:app --reload --port 8000

Open http://localhost:8000, click "Load sample call", then "Check the market's reaction".
Frontend devs can work without a key: `MOCK=1 uvicorn app.main:app --reload`.

## How it works

| Step | File | Grok tools | Typical time |
|---|---|---|---|
| 1. Extract 6-8 claims with quote, speaker, timestamp, tone, jargon | `app/pipeline/claims.py` | none | 5-15 s |
| 2. Verdict per claim + X evidence + next-day price move | `app/pipeline/reaction.py` | x_search, web_search | 30-120 s |
| 3. Hype Gap score (plain Python, explainable) | `app/pipeline/scoring.py` | none | instant |

`app/jobs.py` runs the steps in a background thread. The UI polls `/api/jobs/{id}` every 1.5 s,
so claims appear after step 1 and the verdict dots fill in when step 2 finishes.

Evidence links are marked verified only when the URL also appears in Grok's tool citations.
Unverified links get a warning in the UI. Click them before demoing.

## API

- `POST /api/analyze` `{ticker, company, call_date: "YYYY-MM-DD", transcript, refresh}` returns a job
- `GET  /api/jobs/{id}` returns `{stage, message, analysis, error}`
- `GET  /api/health` shows mock mode, model, and enabled modules
- `GET  /api/sample-transcript` returns a fictional test call

## Demo-day checklist

1. Confirm the model name at docs.x.ai and set `GROK_MODEL` if it differs from `grok-4.7`.
2. Run your demo ticker once before judging. Results cache in `cache/`, so the on-stage run is instant.
3. Open every evidence link on your demo ticker, especially unverified ones.
4. Keep a second ticker un-cached to show a live run if time allows.

## Adding Tier 2 and Tier 3

**Modules (Tier 2).** Each feature is one file in `app/modules/` with `NAME`, `TIER`, and
`run(ctx) -> dict`. Its output lands in `analysis.modules[NAME]`, and a renderer in
`MODULE_RENDERERS` in `frontend/app.js` draws it. A module that throws is skipped and shows its
error, so a broken feature can't break the demo. Two are already written:

- `who_split`: who is reacting (analysts vs. retail vs. journalists). Pure Python, free.
- `dodged`: topics X asked about that management never addressed. One extra x_search call.

Both are on by default (`MODULES=none` turns them off). `dodged` runs in parallel with the X
check, so it adds almost no wait time.

**Jargon hover (Tier 2).** Done. Terms Grok extracted are underlined in each claim and quote.

**Presenter mode.** Press P (or the Present button). Hides the input form and widens the layout.
Esc exits.

**Ask the call (Tier 3).** `POST /api/ask` is stubbed in `app/main.py`. Add
`app/pipeline/ask.py` that sends the question, `analysis.model_dump()`, and the transcript to
`grok.call(prompt, tools=[{"type": "x_search"}])`.

**Click to jump (Tier 3).** Every claim carries `timestamp`. In SimpliEarn's player, seek to it on
claim click.

## Moving into SimpliEarn's frontend

The backend allows any origin, so SimpliEarn's app can call it directly. In `frontend/app.js`
each `render*` function maps to one React component: `render` (hero), `renderClaims` and
`updateClaim` (claim rows), `renderModules` (Tier 2/3 panels). To keep this UI and point it at
another backend host, set `window.HYPE_API_BASE` before `app.js` loads.
