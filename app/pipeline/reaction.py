"""Step 2: check each claim against live X posts + the web. Slow (x_search can take 1-2 min)."""
import json
from datetime import date, timedelta
from .. import grok
from ..schemas import Claim, Evidence

VERDICTS = {"BELIEVED", "DOUBTED", "IGNORED", "CONTRADICTED"}
WHO = {"analyst", "retail", "journalist", "employee_or_customer", "company", "other"}

PROMPT = """Earnings call: {company} (${ticker}) held on {call_date}.
Management made these claims:
{claims}

Use x_search to find how investors, analysts, journalists, and the fintwit crowd reacted to EACH
claim in posts from {call_date} to {end_date}. Use web_search to find the stock's percentage
move on the first full trading day after the call, and to confirm facts.

Verdict definitions:
- BELIEVED: reaction mostly accepts or celebrates the claim
- DOUBTED: meaningful skepticism, but not disproven
- CONTRADICTED: posts or reported numbers directly conflict with the claim
- IGNORED: almost no one discussed it

Rules: use only real posts you actually found. Paraphrase posts, never copy them. Give 2-3
pieces of evidence per claim when they exist, each with the post URL. If you found nothing for a
claim, mark it IGNORED with an empty evidence list.

Return ONLY a JSON object:
{{
  "price_move_pct": number (e.g. -6.2) or null if unknown,
  "overall_x_sentiment": integer from -100 (very negative) to 100 (very positive),
  "story": "one sentence a beginner understands: what the market concluded and why",
  "claims": [{{
    "id": "c1",
    "verdict": "BELIEVED | DOUBTED | IGNORED | CONTRADICTED",
    "x_sentiment": integer -100..100,
    "reason": "1-2 sentences explaining the verdict",
    "evidence": [{{"summary": "paraphrase of the post", "url": "https://x.com/...",
                   "who": "analyst | retail | journalist | employee_or_customer | company | other"}}]
  }}]
}}"""


def _clamp(v, lo=-100, hi=100):
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return None


def _norm_url(u: str) -> str:
    return u.lower().replace("twitter.com", "x.com").replace("www.", "").rstrip("/").split("?")[0]


def check(ticker: str, company: str, call_date: str, claims: list[Claim]) -> dict:
    end = (date.fromisoformat(call_date) + timedelta(days=3)).isoformat()
    slim = [{"id": c.id, "claim": c.claim, "quote": c.quote} for c in claims]
    prompt = PROMPT.format(ticker=ticker, company=company, call_date=call_date, end_date=end,
                           claims=json.dumps(slim, indent=1))
    data, cited = grok.call_json(prompt, tools=[{"type": "x_search"}, {"type": "web_search"}])

    cited_norm = {_norm_url(u) for u in cited}
    by_id = {r.get("id"): r for r in data.get("claims", []) if isinstance(r, dict)}
    for c in claims:
        r = by_id.get(c.id, {})
        v = str(r.get("verdict", "IGNORED")).upper()
        c.verdict = v if v in VERDICTS else "IGNORED"
        c.x_sentiment = _clamp(r.get("x_sentiment"))
        c.reason = r.get("reason")
        c.evidence = []
        for e in (r.get("evidence") or [])[:3]:
            if not isinstance(e, dict) or not e.get("summary"):
                continue
            url = e.get("url") if str(e.get("url", "")).startswith(("http://", "https://")) else None
            who = e.get("who") if e.get("who") in WHO else "other"
            c.evidence.append(Evidence(summary=e["summary"], url=url, who=who,
                                       verified=bool(url and _norm_url(url) in cited_norm)))

    move = data.get("price_move_pct")
    try:
        move = round(float(move), 2) if move is not None else None
    except (TypeError, ValueError):
        move = None
    return {"price_move_pct": move,
            "overall_x_sentiment": _clamp(data.get("overall_x_sentiment")),
            "story": data.get("story"),
            "sources": cited}
