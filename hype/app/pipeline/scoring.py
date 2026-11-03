"""Step 3: the Hype Gap. Pure Python so the number is explainable on stage.

Each claim gets a management tone t in {-1, 0, +1} and a market score m from its verdict:
BELIEVED +1, IGNORED 0, DOUBTED -0.5, CONTRADICTED -1.
For bullish claims the gap is (t - m) / 2, which runs 0..1. A believed bullish claim scores 0,
a contradicted bullish claim scores 1. For bearish claims the gap is |t - (-m)| / 2, so the market
"believing" bad news still counts as no gap. Neutral claims are skipped.
Hype Gap = mean gap x 100, rounded.
"""
from ..schemas import Claim

MARKET = {"BELIEVED": 1.0, "IGNORED": 0.0, "DOUBTED": -0.5, "CONTRADICTED": -1.0}


def claim_gap(c: Claim) -> float | None:
    if c.verdict is None or c.ceo_tone == 0:
        return None
    m = MARKET[c.verdict]
    target = m if c.ceo_tone > 0 else -m   # what the market would say if it fully agreed
    return round(abs(c.ceo_tone - target) / 2, 3)


def label(score: int) -> str:
    if score < 20: return "Market buys the story"
    if score < 40: return "Mostly believed"
    if score < 60: return "Mixed reception"
    if score < 80: return "Market is skeptical"
    return "Market rejects the story"


def score(claims: list[Claim]) -> tuple[int | None, str | None]:
    gaps = []
    for c in claims:
        c.gap = claim_gap(c)
        if c.gap is not None:
            gaps.append(c.gap)
    if not gaps:
        return None, None
    s = round(100 * sum(gaps) / len(gaps))
    return s, label(s)
