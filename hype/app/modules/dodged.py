"""Tier 2: topics X was asking about that management never addressed. One extra x_search call."""
from .. import grok

NAME, TIER = "dodged", 2
PHASE = "early"  # only needs the claims, so it runs alongside the X check

PROMPT = """Earnings call: {company} (${ticker}) on {call_date}.
Here is what management talked about (claim list):
{claims}

End of the transcript, including analyst Q&A (use it to judge whether a topic was raised and dodged):
{qa}

Use x_search on posts from the week before through 3 days after the call. Find the 3 topics
investors were most asking about or worried about that management did NOT address, or deflected,
on the call. Rank by how much investors were talking about it. Paraphrase posts; never copy them.
Return ONLY JSON: {{"dodged": [{{
  "topic": "short headline, under 8 words",
  "why_it_matters": "one sentence a first-time investor understands",
  "heat": "high | medium | low (how much X was discussing it)",
  "deflected": true if management was asked and avoided answering, false if never raised,
  "evidence_url": "https://x.com/... a real post you found"
}}]}}"""


def run(ctx: dict) -> dict:
    a = ctx["analysis"]
    claims = "\n".join(f"- {c.claim}" for c in a.claims)
    data, cited = grok.call_json(PROMPT.format(company=a.company, ticker=a.ticker,
                                               call_date=a.call_date, claims=claims,
                                               qa=ctx["transcript"][-40000:]),
                                 tools=[{"type": "x_search"}])
    items = []
    for i in data.get("dodged", [])[:3]:
        if not isinstance(i, dict) or not i.get("topic"):
            continue
        url = i.get("evidence_url") if str(i.get("evidence_url", "")).startswith("http") else None
        items.append({"topic": i["topic"], "why_it_matters": i.get("why_it_matters", ""),
                      "heat": i.get("heat") if i.get("heat") in {"high", "medium", "low"} else "medium",
                      "deflected": bool(i.get("deflected")), "evidence_url": url})
    return {"items": items, "sources": cited}
