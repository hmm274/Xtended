from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from . import config, dashboards, demo_store, jobs, modules
from .schemas import Analysis, AnalyzeRequest, DemoAnalytics, DemoSentiment, Job

app = FastAPI(title="SimpliEarn: Hype vs. Reality")
# Open CORS so SimpliEarn's own frontend (any port) can call this API during the hackathon
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"ok": True, "mock": config.MOCK, "provider": config.PROVIDER, "model": config.GROK_MODEL,
            "modules": [m.NAME for m in modules.enabled()]}


@app.get("/api/demo/apple", response_model=Analysis)
def apple_demo():
    """Return the seeded Apple demo without calling an AI provider."""
    demo = demo_store.get_demo("AAPL")
    if demo is None:
        raise HTTPException(404, "Apple demo is unavailable")
    return demo


@app.get("/api/demo/apple/analytics", response_model=DemoAnalytics)
def apple_demo_analytics(t: float | None = None):
    """With ?t=<seconds into the video>, follow the video; without it, follow the wall clock."""
    return demo_store.get_analytics() if t is None else demo_store.get_analytics_at(t)


@app.get("/api/demo/apple/sentiment", response_model=DemoSentiment)
def apple_demo_sentiment(t: float | None = None):
    """With ?t=<seconds into the video>, follow the video; without it, replay on the wall clock."""
    return demo_store.get_sentiment() if t is None else demo_store.get_sentiment_at(t)


@app.post("/api/analyze", response_model=Job)
def analyze(req: AnalyzeRequest):
    return jobs.start(req)


class DashboardRequest(BaseModel):
    dashboard_id: str
    refresh: bool = False


@app.get("/api/dashboards")
def list_dashboards():
    """Which SimpliEarn dashboards Hype vs. Reality can analyze."""
    return {k: {"ticker": v[0], "company": v[1], "call_date": v[2]} for k, v in dashboards.DASHBOARDS.items()}


@app.post("/api/analyze-dashboard", response_model=Job)
def analyze_dashboard(req: DashboardRequest):
    """SimpliEarn's dashboard calls this with ?id=..., so it never has to send the transcript."""
    d = dashboards.resolve(req.dashboard_id)
    if not d:
        raise HTTPException(404, f"No transcript for dashboard {req.dashboard_id}. Preloaded calls 1-6 are supported.")
    return jobs.start(AnalyzeRequest(**d, refresh=req.refresh))


@app.get("/api/jobs/{job_id}", response_model=Job)
def job(job_id: str):
    j = jobs.JOBS.get(job_id)
    if not j:
        raise HTTPException(404, "Job not found. The server may have restarted; run the analysis again.")
    return j


@app.get("/api/sample-transcript")
def sample_transcript():
    p = config.ROOT / "app" / "fixtures" / "sample_transcript.txt"
    return {"ticker": "NWRB", "company": "Northwind Robotics", "call_date": "2026-10-28",
            "transcript": p.read_text()}


# Tier 3 placeholder: "Ask the call" chat. Implement in app/pipeline/ask.py and wire it here.
@app.post("/api/ask")
def ask():
    raise HTTPException(501, "Ask the call is a Tier 3 feature and isn't built yet.")


FRONTEND = config.ROOT / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")
