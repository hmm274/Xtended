"""Tier 2: who is reacting, and do they believe management? Pure Python over Tier 1 evidence."""
from collections import Counter

NAME, TIER = "who_split", 2
OFFLINE = True    # needs no API calls
PHASE = "late"    # needs verdicts
# Agreement with management, per post: believing a claim = +1, contradicting it = -1.
AGREE = {"BELIEVED": 1, "IGNORED": 0, "DOUBTED": -0.5, "CONTRADICTED": -1}
ORDER = ["analyst", "journalist", "retail", "employee_or_customer", "company", "other"]


def run(ctx: dict) -> dict:
    counts, agree = Counter(), Counter()
    for c in ctx["analysis"].claims:
        for e in c.evidence:
            counts[e.who] += 1
            agree[e.who] += AGREE.get(c.verdict or "IGNORED", 0)
    groups = [{"who": w, "posts": counts[w], "agreement": round(agree[w] / counts[w], 2)}
              for w in ORDER if counts[w]]
    return {"groups": groups}
