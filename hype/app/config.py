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
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Provider: OpenAI if an OpenAI key is set (override with LLM_PROVIDER=xai), else xAI/Grok
PROVIDER = os.getenv("LLM_PROVIDER") or ("openai" if OPENAI_API_KEY else "xai")
if PROVIDER == "openai":
    API_KEY, BASE_URL = OPENAI_API_KEY, None
    _default_model = "gpt-4.1-mini"   # cheap and supports the web_search tool; override with LLM_MODEL
else:
    API_KEY, BASE_URL = XAI_API_KEY, "https://api.x.ai/v1"
    _default_model = "grok-4.7"
GROK_MODEL = os.getenv("LLM_MODEL") or os.getenv("GROK_MODEL") or _default_model
GROK_FAST_MODEL = os.getenv("LLM_FAST_MODEL") or os.getenv("GROK_FAST_MODEL") or GROK_MODEL
MOCK = os.getenv("MOCK", "0") == "1" or not API_KEY
CACHE_DIR = ROOT / "cache"
CACHE_DIR.mkdir(exist_ok=True)
MAX_TRANSCRIPT_CHARS = int(os.getenv("MAX_TRANSCRIPT_CHARS", "150000"))
REQUEST_TIMEOUT = float(os.getenv("GROK_TIMEOUT", "240"))  # x_search can take 1-2 min
