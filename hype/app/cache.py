import hashlib, json
from . import config


def key(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:20]


def get(k: str):
    p = config.CACHE_DIR / f"{k}.json"
    return json.loads(p.read_text()) if p.exists() else None


def put(k: str, value):
    (config.CACHE_DIR / f"{k}.json").write_text(json.dumps(value, indent=2))
    return value
