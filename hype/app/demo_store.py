"""Process-local demo database. It is discarded when the service stops."""
import json
import sqlite3
import random
import time
from datetime import datetime, timedelta, timezone
from threading import Lock

from . import config
from .schemas import Analysis, AnalyticsPoint, DemoAnalytics, DemoSentiment, SentimentPoint

_lock = Lock()
_db = sqlite3.connect(":memory:", check_same_thread=False)
_db.execute("CREATE TABLE demos (ticker TEXT PRIMARY KEY, analysis TEXT NOT NULL)")
_db.execute("CREATE TABLE analytics (tick INTEGER PRIMARY KEY, posts INTEGER, likes INTEGER, reposts INTEGER, views INTEGER)")
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
            # Engagement follows activity: new posts bring views (plus a long tail on older posts),
            # likes are a few percent of views, and reposts are a fraction of likes.
            posts = rng.choice([0, 1, 1, 2, 2, 3, 4])
            views = posts * rng.randint(300, 900) + rng.randint(150, 400)
            likes = round(views * rng.uniform(0.02, 0.035))
            reposts = round(likes * rng.uniform(0.15, 0.3))
            totals = [total + increment for total, increment in zip(totals, [posts, likes, reposts, views])]
            _db.execute("INSERT INTO analytics VALUES (?, ?, ?, ?, ?)", (current, *totals))
        _db.execute("DELETE FROM analytics WHERE tick < ?", (tick - 59,))
        _db.commit()
        rows = _db.execute("SELECT * FROM analytics ORDER BY tick").fetchall()
    return DemoAnalytics(points=[AnalyticsPoint(
        timestamp=datetime.fromtimestamp(row[0] * 5, timezone.utc),
        posts=row[1], likes=row[2], reposts=row[3], views=row[4],
    ) for row in rows])


# Every sentence of Apple's Q1 2025 call, scored by FinBERT (see hype/scripts/score_call.py)
_CALL = json.loads((config.ROOT / "app" / "fixtures" / "apple_call_sentiment.json").read_text(encoding="utf-8"))["sentences"]
_PREFIX = [0]
for _sentence in _CALL:
    _PREFIX.append(_PREFIX[-1] + _sentence["score"])
_START = int(time.time() // 5) - 11  # the replay starts at the top of the call when the service starts


def _total(i: int) -> int:
    """Running total through sentence i of the replay; it keeps accumulating if the call loops."""
    loops, pos = divmod(i, len(_CALL))
    return loops * _PREFIX[-1] + _PREFIX[pos + 1]


def get_sentiment(now: float | None = None) -> DemoSentiment:
    """Replays the call one sentence per five seconds, retaining the latest 60 points."""
    tick = int((time.time() if now is None else now) // 5)
    points = []
    for current in range(max(_START, tick - 59), tick + 1):
        i = current - _START
        sentence = _CALL[i % len(_CALL)]
        points.append(SentimentPoint(
            id=str(current), timestamp=datetime.fromtimestamp(current * 5, timezone.utc),
            quote=sentence["text"], speaker=sentence["speaker"],
            sentiment_score=sentence["score"], total_sentiment_score=_total(i),
        ))
    return DemoSentiment(points=points)


# Video mode: the charts follow the player. t is seconds into the call's video.
_CALL_START = datetime(2025, 1, 30, 22, 0, tzinfo=timezone.utc)  # 5:00 PM ET


def _at(seconds: float) -> datetime:
    return _CALL_START + timedelta(seconds=seconds)


def get_sentiment_at(t: float) -> DemoSentiment:
    """Every sentence spoken by video time t, retaining the latest 60."""
    spoken = sum(1 for sentence in _CALL if sentence["start"] <= t)
    return DemoSentiment(points=[SentimentPoint(
        id=str(i), timestamp=_at(_CALL[i]["start"]), video_time=_CALL[i]["start"],
        quote=_CALL[i]["text"], speaker=_CALL[i]["speaker"],
        sentiment_score=_CALL[i]["score"], total_sentiment_score=_PREFIX[i + 1],
    ) for i in range(max(0, spoken - 60), spoken)])


def get_analytics_at(t: float) -> DemoAnalytics:
    """Fictional X activity for each five seconds of the call up to video time t, retaining 60 points.
    Activity rises while a strongly positive or negative sentence is being spoken."""
    last = int(max(t, 0) // 5)
    totals, rows = [3, 390, 103, 25200], []
    for tick in range(last + 1):
        rng = random.Random(f"video-{tick}")
        window = [abs(s["score"]) for s in _CALL if tick * 5 <= s["start"] < tick * 5 + 5]
        posts = rng.choice([0, 1, 1, 2]) + (2 if window and max(window) >= 60 else 0)
        views = posts * rng.randint(300, 900) + rng.randint(150, 400)
        likes = round(views * rng.uniform(0.02, 0.035))
        reposts = round(likes * rng.uniform(0.15, 0.3))
        totals = [total + increment for total, increment in zip(totals, [posts, likes, reposts, views])]
        rows.append((tick, *totals))
    return DemoAnalytics(points=[AnalyticsPoint(
        timestamp=_at(row[0] * 5), video_time=row[0] * 5,
        posts=row[1], likes=row[2], reposts=row[3], views=row[4],
    ) for row in rows[-60:]])
