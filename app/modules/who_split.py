"""Tier 2: who is reacting? Pure Python over Tier 1 evidence, so it costs no extra API calls."""
from collections import Counter

NAME, TIER = "who_split", 2
OFFLINE = True  # needs no API calls
MARKET = {"BELIEVED": 1, "IGNORED": 0, "DOUBTED": -0.5, "CONTRADICTED": -1}


def run(ctx: dict) -> dict:
    counts, lean = Counter(), Counter()
    for c in ctx["analysis"].claims:
        for e in c.evidence:
            counts[e.who] += 1
            lean[e.who] += MARKET.get(c.verdict or "IGNORED", 0)
    return {who: {"posts": n, "avg_lean": round(lean[who] / n, 2)} for who, n in counts.items()}
