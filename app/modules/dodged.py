"""Tier 2: topics X was asking about that management never addressed. One extra x_search call."""
from .. import grok

NAME, TIER = "dodged", 2

PROMPT = """Earnings call: {company} (${ticker}) on {call_date}.
Here is what management talked about (claim list):
{claims}

Use x_search on posts from the week before through 3 days after the call. Find the 3-5 topics
investors were most asking about or worried about that management did NOT address on the call.
Paraphrase posts; never copy them.
Return ONLY JSON: {{"dodged": [{{"topic": "...", "why_it_matters": "one beginner-friendly sentence",
"evidence_url": "https://x.com/..."}}]}}"""


def run(ctx: dict) -> dict:
    a = ctx["analysis"]
    claims = "\n".join(f"- {c.claim}" for c in a.claims)
    data, cited = grok.call_json(PROMPT.format(company=a.company, ticker=a.ticker,
                                               call_date=a.call_date, claims=claims),
                                 tools=[{"type": "x_search"}])
    return {"items": data.get("dodged", [])[:5], "sources": cited}
