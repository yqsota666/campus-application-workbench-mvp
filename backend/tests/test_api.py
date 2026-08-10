from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_capture_review_auth_prefill_flow():
    client.post("/api/dev/reset")

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True

    capture = client.post("/api/capture/run")
    assert capture.status_code == 200
    jobs = capture.json()["jobs"]
    assert jobs

    job_id = jobs[0]["id"]
    reviewed = client.post(
        f"/api/capture/jobs/{job_id}/review",
        json={
            "source_confirmed": True,
            "fields_confirmed": True,
            "deadline_confirmed": True,
            "fit_confirmed": True,
            "notes": "测试确认",
        },
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "job_ready"

    auth = client.post("/api/auth-sessions", json={"job_id": job_id})
    assert auth.status_code == 200
    session_id = auth.json()["id"]

    confirmed = client.post(f"/api/auth-sessions/{session_id}/confirm", json={"confirmed_by_user": True})
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "auth_ready"

    draft = client.post(f"/api/prefill/{job_id}/draft")
    assert draft.status_code == 200
    assert draft.json()["questions"]


def test_review_cannot_rewrite_job_after_auth_started():
    client.post("/api/dev/reset")
    capture = client.post("/api/capture/run")
    job_id = capture.json()["jobs"][0]["id"]

    reviewed = client.post(
        f"/api/capture/jobs/{job_id}/review",
        json={
            "source_confirmed": True,
            "fields_confirmed": True,
            "deadline_confirmed": True,
            "fit_confirmed": True,
        },
    )
    assert reviewed.status_code == 200

    auth = client.post("/api/auth-sessions", json={"job_id": job_id})
    assert auth.status_code == 200

    second_review = client.post(
        f"/api/capture/jobs/{job_id}/review",
        json={
            "source_confirmed": False,
            "fields_confirmed": False,
            "deadline_confirmed": False,
            "fit_confirmed": False,
        },
    )
    assert second_review.status_code == 409
