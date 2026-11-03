"""Plug-in modules for Tier 2/3. Each module adds one key to analysis.modules.

To add a feature:
  1. Create app/modules/<name>.py with NAME, TIER, and run(ctx) -> dict
  2. Add it to REGISTRY below
  3. Turn it on with MODULES=name1,name2 (or MODULES=all)
  4. Render analysis.modules[NAME] in frontend/app.js (see renderModules)

ctx = {"analysis": Analysis, "transcript": str}. A module that raises is skipped and its
error is recorded, so one broken feature never breaks the demo.
"""
import os
from . import who_split, dodged

REGISTRY = [who_split, dodged]


def enabled():
    raw = os.getenv("MODULES", "who_split,dodged").strip()   # Tier 2 on by default; MODULES=none to disable
    if raw == "all":
        return REGISTRY
    names = {n.strip() for n in raw.split(",") if n.strip()}
    return [m for m in REGISTRY if m.NAME in names]


def run_all(ctx: dict, offline_only: bool = False, phase: str | None = None) -> dict:
    """offline_only=True runs just the modules that need no API calls (used in MOCK mode)."""
    out = {}
    for m in enabled():
        if offline_only and not getattr(m, "OFFLINE", False):
            continue
        if phase and getattr(m, "PHASE", "late") != phase:   # early = needs claims only; late = needs verdicts
            continue
        try:
            out[m.NAME] = {"tier": m.TIER, "data": m.run(ctx)}
        except Exception as e:
            out[m.NAME] = {"tier": m.TIER, "error": str(e)}
    return out
