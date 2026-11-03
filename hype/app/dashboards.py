"""Maps SimpliEarn's preloaded dashboard ids to the transcripts already in RAG/transcripts.
Call dates come from each transcript's header (the X search window starts on this date)."""
from . import config

RAG_TRANSCRIPTS = config.ROOT.parent / "RAG" / "transcripts"

DASHBOARDS = {
    "1": ("AAPL", "Apple", "2025-01-30", "apple_seeking_alpha.txt"),
    "2": ("CVS", "CVS Health", "2025-02-12", "cvs_seeking_alpha.txt"),
    "3": ("GOOGL", "Alphabet", "2025-02-04", "alphabet_seeking_alpha.txt"),
    "4": ("SHEL", "Shell", "2025-01-30", "shell_seeking_alpha.txt"),
    "5": ("TSLA", "Tesla", "2025-01-29", "tesla_seeking_alpha.txt"),
    "6": ("WMT", "Walmart", "2025-02-20", "walmart_seeking_alpha.txt"),
}


def resolve(dashboard_id: str) -> dict | None:
    row = DASHBOARDS.get(dashboard_id)
    if not row:
        return None
    ticker, company, call_date, filename = row
    path = RAG_TRANSCRIPTS / filename
    if not path.exists():
        return None
    return {"ticker": ticker, "company": company, "call_date": call_date,
            "transcript": path.read_text(encoding="utf-8", errors="ignore")}
