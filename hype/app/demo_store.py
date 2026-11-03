"""Process-local demo database. It is discarded when the service stops."""
import json
import sqlite3
import random
import time
from datetime import datetime, timezone
from threading import Lock

from . import config
from .schemas import Analysis, AnalyticsPoint, DemoAnalytics, DemoSentiment, SentimentPoint

_lock = Lock()
_db = sqlite3.connect(":memory:", check_same_thread=False)
_db.execute("CREATE TABLE demos (ticker TEXT PRIMARY KEY, analysis TEXT NOT NULL)")
_db.execute("CREATE TABLE analytics (tick INTEGER PRIMARY KEY, posts INTEGER, likes INTEGER, reposts INTEGER, views INTEGER)")
_db.execute("CREATE TABLE sentiment (tick INTEGER PRIMARY KEY, quote TEXT, score INTEGER, total INTEGER)")
_apple = Analysis.model_validate_json(
    (config.ROOT / "app" / "fixtures" / "apple_demo.json").read_text(encoding="utf-8")
)
_db.execute("INSERT INTO demos VALUES (?, ?)", (_apple.ticker, _apple.model_dump_json()))
_db.commit()


def get_demo(ticker: str) -> Analysis | None:
    with _lock:
        row = _db.execute("SELECT analysis FROM demos WHERE ticker = ?", (ticker.upper(),)).fetchone()
    return Analysis.model_validate(json.loads(row[0])) if row else None


def get_analytics(now: float | None = None) -> DemoAnalytics:
    """Generate shared fictional totals once per five-second interval, retaining 60 points."""
    tick = int((time.time() if now is None else now) // 5)
    with _lock:
        previous = _db.execute("SELECT * FROM analytics ORDER BY tick DESC LIMIT 1").fetchone()
        totals = list(previous[1:]) if previous else [3, 390, 103, 25200]
        start = max(previous[0] + 1, tick - 59) if previous else tick - 11
        for current in range(start, tick + 1):
            rng = random.Random(current)
            increments = [rng.randint(0, 2), rng.randint(5, 30), rng.randint(1, 8), rng.randint(100, 900)]
            totals = [total + increment for total, increment in zip(totals, increments)]
            _db.execute("INSERT INTO analytics VALUES (?, ?, ?, ?, ?)", (current, *totals))
        _db.execute("DELETE FROM analytics WHERE tick < ?", (tick - 59,))
        _db.commit()
        rows = _db.execute("SELECT * FROM analytics ORDER BY tick").fetchall()
    return DemoAnalytics(points=[AnalyticsPoint(
        timestamp=datetime.fromtimestamp(row[0] * 5, timezone.utc),
        posts=row[1], likes=row[2], reposts=row[3], views=row[4],
    ) for row in rows])


_REACTIONS = [
    ("The record revenue gives me more confidence in Apple's business.", 65),
    ("I'm still not convinced that AI features will drive a major upgrade cycle.", -55),
    ("Services growth is the strongest part of this quarter for me.", 70),
    ("China demand remains a concern despite the headline revenue number.", -75),
    ("The installed base looks like a solid foundation for future services growth.", 50),
    ("I'd like more evidence before assuming iPhone demand is accelerating.", -45),
]


def get_sentiment(now: float | None = None) -> DemoSentiment:
    """Fictional investor quotes with individual scores and a running sentiment total."""
    tick = int((time.time() if now is None else now) // 5)
    with _lock:
        previous = _db.execute("SELECT tick, total FROM sentiment ORDER BY tick DESC LIMIT 1").fetchone()
        total = previous[1] if previous else 0
        start = max(previous[0] + 1, tick - 59) if previous else tick - 11
        for current in range(start, tick + 1):
            quote, base_score = _REACTIONS[current % len(_REACTIONS)]
            score = base_score + random.Random(current).randint(-10, 10)
            total += score
            _db.execute("INSERT INTO sentiment VALUES (?, ?, ?, ?)", (current, quote, score, total))
        _db.execute("DELETE FROM sentiment WHERE tick < ?", (tick - 59,))
        _db.commit()
        rows = _db.execute("SELECT * FROM sentiment ORDER BY tick").fetchall()
    return DemoSentiment(points=[SentimentPoint(
        id=str(row[0]), timestamp=datetime.fromtimestamp(row[0] * 5, timezone.utc),
        quote=row[1], sentiment_score=row[2], total_sentiment_score=row[3],
    ) for row in rows])
