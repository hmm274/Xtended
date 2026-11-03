"""Data shapes shared by every tier. Tier 2/3 add fields or modules; nothing here needs to change."""
from typing import Literal, Optional
from pydantic import BaseModel, Field

Verdict = Literal["BELIEVED", "DOUBTED", "IGNORED", "CONTRADICTED"]
Who = Literal["analyst", "retail", "journalist", "employee_or_customer", "company", "other"]


class Jargon(BaseModel):
    term: str
    plain: str


class Evidence(BaseModel):
    summary: str
    url: Optional[str] = None
    who: Who = "other"
    verified: bool = False          # True when the URL also appears in Grok's tool citations


class Claim(BaseModel):
    id: str
    claim: str
    quote: str
    speaker: Optional[str] = None
    timestamp: Optional[str] = None
    category: str = "other"
    ceo_tone: int = 0               # -1 bearish, 0 neutral, +1 bullish
    jargon: list[Jargon] = []       # extracted now, displayed in Tier 2
    # filled in by the reaction step
    verdict: Optional[Verdict] = None
    x_sentiment: Optional[int] = None
    reason: Optional[str] = None
    evidence: list[Evidence] = []
    gap: Optional[float] = None     # 0..1 distance between management tone and market verdict


class AnalyzeRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=10)
    company: str
    call_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    transcript: str = Field(..., min_length=200)
    refresh: bool = False


class Analysis(BaseModel):
    ticker: str
    company: str
    call_date: str
    story: Optional[str] = None
    price_move_pct: Optional[float] = None
    overall_x_sentiment: Optional[int] = None
    hype_gap: Optional[int] = None
    hype_label: Optional[str] = None
    claims: list[Claim] = []
    sources: list[str] = []         # every URL Grok cited
    modules: dict = {}              # Tier 2/3 outputs land here, keyed by module name
    mock: bool = False


class Job(BaseModel):
    id: str
    stage: Literal["queued", "extracting", "checking_market", "running_modules", "done", "error"]
    message: str = ""
    analysis: Optional[Analysis] = None   # partial results stream in as stages finish
    error: Optional[str] = None
