import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Load hype/.env if present (KEY=value lines), without overriding real environment variables
_env = ROOT / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
GROK_MODEL = os.getenv("GROK_MODEL", "grok-4.7")          # confirm current name at docs.x.ai
GROK_FAST_MODEL = os.getenv("GROK_FAST_MODEL", GROK_MODEL)
MOCK = os.getenv("MOCK", "0") == "1" or not XAI_API_KEY
CACHE_DIR = ROOT / "cache"
CACHE_DIR.mkdir(exist_ok=True)
MAX_TRANSCRIPT_CHARS = int(os.getenv("MAX_TRANSCRIPT_CHARS", "150000"))
REQUEST_TIMEOUT = float(os.getenv("GROK_TIMEOUT", "240"))  # x_search can take 1-2 min
