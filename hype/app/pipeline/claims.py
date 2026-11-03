"""Step 1: pull management's key claims out of the transcript. No tools, so it's fast (~5-15s)."""
from .. import config, grok
from ..schemas import Claim

PROMPT = """You are an equity analyst preparing notes for first-time investors.
Below is the {company} (${ticker}) earnings call transcript from {call_date}.

Extract the 6-8 MOST IMPORTANT claims management made: guidance, growth promises, margin
statements, product/AI bets, cost plans, capital returns, and any risk they downplayed.
Skip pleasantries and operator lines. Prefer claims the market could agree or disagree with.

Return ONLY a JSON object:
{{"claims": [{{
  "claim": "one plain-English sentence a beginner understands (no undefined jargon)",
  "quote": "exact words from the transcript, under 25 words",
  "speaker": "name and/or role, e.g. 'Jane Doe, CEO'",
  "timestamp": "timestamp or section label if the transcript has one, else null",
  "category": "revenue | margins | guidance | product | costs | capital_return | risk | other",
  "ceo_tone": 1 if management framed it bullishly, 0 if neutral, -1 if bearish,
  "jargon": [{{"term": "finance term used in the quote", "plain": "short plain-English definition"}}]
}}]}}

TRANSCRIPT:
{transcript}"""


def extract(ticker: str, company: str, call_date: str, transcript: str) -> list[Claim]:
    prompt = PROMPT.format(ticker=ticker, company=company, call_date=call_date,
                           transcript=transcript[: config.MAX_TRANSCRIPT_CHARS])
    data, _ = grok.call_json(prompt, model=config.GROK_FAST_MODEL)
    claims = []
    for i, raw in enumerate(data.get("claims", [])[:8], start=1):
        raw["id"] = f"c{i}"
        try:
            raw["ceo_tone"] = max(-1, min(1, int(raw.get("ceo_tone", 0))))
        except (TypeError, ValueError):
            raw["ceo_tone"] = 0
        claims.append(Claim(**{k: v for k, v in raw.items() if k in Claim.model_fields}))
    if not claims:
        raise grok.GrokError("No claims found. Check that the transcript is the full call.")
    return claims
