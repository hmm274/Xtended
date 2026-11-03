from fastapi.testclient import TestClient
import time

from app import demo_store, jobs
from app.main import app
from app.schemas import AnalyzeRequest, Job


def test_apple_demo_returns_simulated_data_without_provider():
    response = TestClient(app).get("/api/demo/apple")
    assert response.status_code == 200
    demo = response.json()
    assert (demo["ticker"], demo["company"], demo["call_date"]) == ("AAPL", "Apple", "2025-01-30")
    assert demo["mock"] is True
    assert demo["hype_gap"] == 48
    assert len(demo["demo_posts"]) == 3
    assert [post["published_date"] for post in demo["demo_posts"]] == ["2025-01-30", "2025-01-31", "2025-02-01"]
    assert sum(post["likes"] for post in demo["demo_posts"]) == 390
    assert sum(post["reposts"] for post in demo["demo_posts"]) == 103
    assert sum(post["views"] for post in demo["demo_posts"]) == 25200
    assert all(e["url"] is None and not e["verified"] for claim in demo["claims"] for e in claim["evidence"])
    assert demo_store.get_demo("MISSING") is None


def test_mock_apple_request_does_not_return_fictional_northwind():
    request = AnalyzeRequest(ticker="AAPL", company="Apple", call_date="2025-01-30", transcript="x" * 200)
    job = Job(id="test", stage="queued")
    jobs._mock(job, request)
    assert job.stage == "done"
    assert job.analysis and job.analysis.ticker == "AAPL" and job.analysis.mock


def test_simulated_analytics_updates_once_per_tick_and_keeps_bounded_history():
    response = TestClient(app).get("/api/demo/apple/analytics")
    assert response.status_code == 200 and response.json()["mock"] is True
    now = (int(time.time() // 5) + 1) * 5
    before = demo_store.get_analytics(now)
    assert demo_store.get_analytics(now) == before
    after = demo_store.get_analytics(now + 5)
    assert after.points[-1].timestamp > before.points[-1].timestamp
    for metric in ("posts", "likes", "reposts", "views"):
        assert getattr(after.points[-1], metric) >= getattr(before.points[-1], metric)
    assert after.points[-1].views > before.points[-1].views
    assert len(demo_store.get_analytics(now + 600).points) == 60


def test_sentiment_points_include_quotes_and_correct_running_totals():
    response = TestClient(app).get("/api/demo/apple/sentiment")
    assert response.status_code == 200 and response.json()["mock"] is True
    now = (int(time.time() // 5) + 1) * 5
    before = demo_store.get_sentiment(now)
    assert demo_store.get_sentiment(now) == before
    assert all(point.quote and -100 <= point.sentiment_score <= 100 for point in before.points)
    assert any(point.sentiment_score < 0 for point in before.points)
    assert any(point.sentiment_score > 0 for point in before.points)
    for previous, current in zip(before.points, before.points[1:]):
        assert current.total_sentiment_score == previous.total_sentiment_score + current.sentiment_score
    after = demo_store.get_sentiment(now + 5)
    assert after.points[-2] == before.points[-1]
    assert after.points[-1].total_sentiment_score == before.points[-1].total_sentiment_score + after.points[-1].sentiment_score
    assert len(demo_store.get_sentiment(now + 600).points) == 60
