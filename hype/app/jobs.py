"""Runs the pipeline in a background thread so the UI can show claims before X results arrive."""
import json, threading, time, uuid
from concurrent.futures import ThreadPoolExecutor
from . import cache, config, demo_store, modules
from .pipeline import claims as claims_step, reaction, scoring
from .schemas import Analysis, AnalyzeRequest, Job

JOBS: dict[str, Job] = {}
_lock = threading.Lock()


def _set(job: Job, **kw):
    with _lock:
        for k, v in kw.items():
            setattr(job, k, v)


def _mock(job: Job, req: AnalyzeRequest):
    if req.ticker.upper().lstrip("$") == "AAPL" and req.call_date == "2025-01-30":
        _set(job, stage="done", message="Apple demo data", analysis=demo_store.get_demo("AAPL"))
        return
    if req.ticker.upper().lstrip("$") != "NWRB":
        raise ValueError("No demo data for this call. Configure an AI provider for live analysis.")
    data = json.loads((config.ROOT / "app" / "fixtures" / "demo_analysis.json").read_text())
    full = Analysis(**data)
    _set(job, stage="extracting", message="Reading the call")
    time.sleep(1.2)
    partial = full.model_copy(deep=True)
    for c in partial.claims:
        c.verdict = c.x_sentiment = c.reason = c.gap = None
        c.evidence = []
    partial.story = partial.price_move_pct = partial.overall_x_sentiment = None
    partial.hype_gap = partial.hype_label = None
    _set(job, stage="checking_market", message="Checking reactions on X", analysis=partial)
    time.sleep(2.5)
    # Fixture holds sample output for API-backed modules; offline modules are computed for real
    fixture_mods = {k: v for k, v in full.modules.items() if k in {m.NAME for m in modules.enabled()}}
    full.modules = {**fixture_mods, **modules.run_all({"analysis": full, "transcript": req.transcript}, offline_only=True)}
    _set(job, stage="done", message="Done", analysis=full)


def _run(job: Job, req: AnalyzeRequest):
    try:
        if config.MOCK:
            return _mock(job, req)
        tkr = req.ticker.upper().lstrip("$")
        ck = cache.key(tkr, req.call_date, req.transcript)
        hit = None if req.refresh else cache.get(ck)
        if hit:
            _set(job, stage="done", message="Loaded from cache", analysis=Analysis(**hit))
            return

        a = Analysis(ticker=tkr, company=req.company, call_date=req.call_date)
        _set(job, stage="extracting", message="Reading the call", analysis=a)
        a.claims = claims_step.extract(tkr, req.company, req.call_date, req.transcript)
        _set(job, stage="checking_market", message="Checking investor reactions online (can take 1-2 min)",
             analysis=a.model_copy(deep=True))

        # Modules that only need the claims (e.g. "dodged") run in parallel with the slow X check,
        # so Tier 2 adds almost no wait time on stage.
        ctx = {"analysis": a, "transcript": req.transcript}
        with ThreadPoolExecutor(max_workers=2) as pool:
            early = pool.submit(modules.run_all, ctx, phase="early")
            r = reaction.check(tkr, req.company, req.call_date, a.claims)
            a.story, a.price_move_pct = r["story"], r["price_move_pct"]
            a.overall_x_sentiment, a.sources = r["overall_x_sentiment"], r["sources"]
            a.hype_gap, a.hype_label = scoring.score(a.claims)
            if not early.done():
                _set(job, stage="running_modules", message="Finishing extra analysis",
                     analysis=a.model_copy(deep=True))
            a.modules = {**early.result(), **modules.run_all(ctx, phase="late")}

        cache.put(ck, a.model_dump())
        _set(job, stage="done", message="Done", analysis=a)
    except Exception as e:
        _set(job, stage="error", error=str(e), message="Analysis failed")


def start(req: AnalyzeRequest) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], stage="queued")
    JOBS[job.id] = job
    threading.Thread(target=_run, args=(job, req), daemon=True).start()
    return job
