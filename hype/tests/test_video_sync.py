from fastapi.testclient import TestClient

from app import demo_store
from app.main import app


def test_sentiment_follows_video_time():
    client = TestClient(app)
    assert client.get("/api/demo/apple/sentiment", params={"t": 0}).json()["points"] == []
    early = demo_store.get_sentiment_at(30)
    assert early.points and all(point.video_time <= 30 for point in early.points)
    assert early.points[0].quote.startswith("Good afternoon")
    for previous, current in zip(early.points, early.points[1:]):
        assert current.total_sentiment_score == previous.total_sentiment_score + current.sentiment_score
    late = demo_store.get_sentiment_at(1000)
    assert len(late.points) == 60 and late.points[-1].video_time <= 1000
    assert demo_store.get_sentiment_at(1000) == late


def test_analytics_follows_video_time():
    response = TestClient(app).get("/api/demo/apple/analytics", params={"t": 30})
    assert response.status_code == 200 and response.json()["points"][-1]["video_time"] == 30
    before, after = demo_store.get_analytics_at(500), demo_store.get_analytics_at(505)
    assert after.points[-2] == before.points[-1]
    assert after.points[-1].views > before.points[-1].views
    assert len(before.points) == 60
