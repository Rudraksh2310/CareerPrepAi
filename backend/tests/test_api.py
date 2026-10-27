import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.needs_db


@pytest.fixture(scope="module")
def client():
    from app.main import app
    from app.core import question_engine, evaluation, extraction

    def boom(*a, **k):
        raise RuntimeError("LLM disabled in tests")

    # Force the offline heuristic paths so tests are deterministic and need no API key.
    question_engine.call_llm_json = boom
    evaluation.call_llm_json = boom
    extraction.call_llm_json = boom
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    import uuid
    email = f"t{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"name": "Test User", "email": email, "password": "pw12345678"})
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_voice_config_without_keys(client, auth):
    r = client.get("/voice/config", headers=auth)
    assert r.status_code == 200
    assert r.json() == {"stt_server": False, "stt_provider": None, "tts_server": False, "tts_provider": "browser"}
    assert client.post("/voice/tts", json={"text": "hi"}, headers=auth).status_code == 501
    assert client.post("/voice/transcribe", files={"file": ("a.webm", b"123", "audio/webm")}, headers=auth).status_code == 501


def test_voice_requires_auth(client):
    assert client.get("/voice/config").status_code in (401, 403)


def test_resume_upload_falls_back_without_llm(client, auth):
    txt = open(__import__("os").path.join(__import__("os").path.dirname(__file__), "sample_resume.txt"), "rb").read()
    r = client.post("/resume/upload", files={"file": ("cv.txt", txt, "text/plain")}, headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "python" in [s.lower() for s in body["parsed_skills"]]
    assert body["parsed_projects"] == ["Smart Attendance System", "CareerPrepAI"]
    assert len(body["parsed_experience"]) == 2
    pytest.resume_id = body["id"]


def test_full_interview_flow(client, auth):
    r = client.post("/interview/start", json={"role": "Backend Engineer", "company": "Amazon", "resume_id": pytest.resume_id}, headers=auth)
    assert r.status_code == 200, r.text
    start = r.json()
    sid = start["id"]
    assert start["interviewer_name"] == "Aria" and "Test" in start["first_question"]
    assert [x["key"] for x in start["rounds"]] == ["technical", "resume"]
    assert start["max_questions"] == sum(x["max_questions"] for x in start["rounds"])
    assert start["round"] == "technical" and start["topic"]
    assert start["ai_engine"]["configured"] is False and start["ai_engine"]["engine"] == "heuristic"

    long = "I built a FastAPI backend with PostgreSQL for our college attendance system and deployed it with Docker, which cut manual work by 70 percent."
    seen_followup = seen_change = False
    rounds_seen = []
    n = 0
    while True:
        m = client.post(f"/interview/{sid}/message", json={"answer": long, "response_time": 12, "input_mode": "voice"}, headers=auth)
        assert m.status_code == 200, m.text
        body = m.json()
        n += 1
        if body["finished"]:
            assert body["closing"] and body["analysis"]  # the last answer is analysed too
            break
        assert body["analysis"] and 1 <= body["analysis"]["depth"] <= 5
        seen_followup |= body["is_followup"]
        if body["round_changed"]:
            seen_change = True
            assert body["round"] == "resume" and body["question"].startswith("That wraps up the technical round")
        rounds_seen.append(body["round"])
        assert body["round_question_number"] <= body["round_max_questions"]
        assert n < 40
    assert seen_followup and seen_change
    assert rounds_seen == sorted(rounds_seen, key=["technical", "resume"].index)
    # The canned answer is off-topic for some topics, and the engine now moves on after one redirect instead of
    # hammering the same topic, so the plan can finish before its cap. It must never exceed it, and both rounds run.
    assert n <= start["max_questions"] and set(rounds_seen) >= {"technical", "resume"}

    # state endpoint (used to rejoin after a refresh): all answered, nothing open
    st = client.get(f"/interview/{sid}", headers=auth).json()
    assert st["current_question"] is None and len(st["turns"]) == 2 * n and st["turns"][1]["analysis"]
    assert {t["round"] for t in st["turns"] if t["role"] == "ai"} == {"technical", "resume"}

    # double submit of the same answer must not create another question
    dup = client.post(f"/interview/{sid}/message", json={"answer": "again"}, headers=auth)
    assert dup.status_code == 409

    assert client.post(f"/interview/{sid}/end", headers=auth).status_code == 200
    assert client.post(f"/interview/{sid}/end", headers=auth).status_code == 200  # idempotent
    rep = client.get(f"/interview/{sid}/report", headers=auth).json()
    for k in ("technical", "communication", "confidence", "grammar", "overall", "clarity", "relevance", "structure"):
        assert 0 <= rep[k] <= 100
    assert rep["questions_answered"] == n and rep["per_question"] and rep["avg_response_time"] == "12s"
    assert [x["key"] for x in rep["rounds"]] == ["technical", "resume"]
    tech, res = rep["rounds"]
    assert tech["questions_answered"] + res["questions_answered"] == n
    assert tech["scores"]["knowledge"] >= 0 and res["scores"]["ownership"] >= 0
    assert tech["topics"] and res["topics"] and res["per_question"][0]["question"]

    hist = client.get("/dashboard/history", headers=auth).json()
    assert any(h["id"] == sid and h["overall_score"] == rep["overall"] for h in hist)


def test_rejoin_returns_open_question(client, auth):
    r = client.post("/interview/start", json={"role": "Frontend Developer"}, headers=auth).json()
    st = client.get(f"/interview/{r['id']}", headers=auth).json()
    assert st["current_question"] == r["first_question"] and st["status"] == "active" and st["question_number"] == 1


def test_other_users_cannot_touch_session(client, auth):
    import uuid
    r = client.post("/auth/register", json={"name": "B", "email": f"b{uuid.uuid4().hex[:6]}@example.com", "password": "pw12345678"})
    other = {"Authorization": f"Bearer {r.json()['token']}"}
    sid = client.post("/interview/start", json={"role": "Backend Engineer"}, headers=auth).json()["id"]
    assert client.post(f"/interview/{sid}/message", json={"answer": "x"}, headers=other).status_code == 404
    assert client.get(f"/interview/{sid}/report", headers=other).status_code == 404


def test_schema_upgrade_adds_missing_columns():
    from sqlalchemy import text, inspect
    from app.core.database import engine, ensure_schema
    with engine.begin() as c:
        c.execute(text("ALTER TABLE transcript_entries DROP COLUMN IF EXISTS analysis"))
        c.execute(text("ALTER TABLE transcript_entries DROP COLUMN IF EXISTS round"))
        c.execute(text("ALTER TABLE reports DROP COLUMN IF EXISTS details"))
    ensure_schema()
    ensure_schema()  # idempotent
    insp = inspect(engine)
    assert "analysis" in [c["name"] for c in insp.get_columns("transcript_entries")]
    assert {"round", "topic"} <= {c["name"] for c in insp.get_columns("transcript_entries")}
    assert "details" in [c["name"] for c in insp.get_columns("reports")]


def test_skip_to_round_two(client, auth):
    sid = client.post("/interview/start", json={"role": "Backend Engineer", "resume_id": pytest.resume_id}, headers=auth).json()["id"]
    m = client.post(f"/interview/{sid}/message", json={"skip_round": True}, headers=auth)
    assert m.status_code == 200, m.text
    b = m.json()
    assert b["round"] == "resume" and b["round_changed"] and b["question"].startswith("That wraps up the technical round")
    assert client.post(f"/interview/{sid}/message", json={"skip_round": True}, headers=auth).status_code == 400
    assert client.post(f"/interview/{sid}/message", json={"answer": "   "}, headers=auth).status_code == 422


def test_interviewer_choice_is_used_validated_and_remembered(client, auth):
    r = client.post("/interview/start", json={"role": "Backend Engineer", "interviewer": "daniel"}, headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["interviewer"] == "daniel" and body["interviewer_name"] == "Daniel"
    assert "I'm Daniel" in body["first_question"] and "Aria" not in body["first_question"]
    st = client.get(f"/interview/{body['id']}", headers=auth).json()  # rejoin after a refresh keeps the character
    assert st["interviewer"] == "daniel" and st["interviewer_name"] == "Daniel"

    default = client.post("/interview/start", json={"role": "Backend Engineer"}, headers=auth).json()
    assert default["interviewer"] == "aria" and "I'm Aria" in default["first_question"]

    assert client.post("/interview/start", json={"role": "Backend Engineer", "interviewer": "../../etc"}, headers=auth).status_code == 422


def test_tts_voice_field_is_bounded(client, auth):
    # unknown keys fall back to the default voice; an absurd value is rejected before any TTS work happens
    assert client.post("/voice/tts", json={"text": "hi", "voice": "x" * 50}, headers=auth).status_code == 422


def test_admin_stats_require_admin_flag_and_expose_only_aggregates(client, auth):
    import uuid
    from app.core.database import SessionLocal
    from app.models.models import User

    # no token / ordinary user: refused
    assert client.get("/admin/stats").status_code in (401, 403)
    assert client.get("/admin/stats", headers=auth).status_code == 403

    # admin flag is set directly in the database, exactly as the docs tell the owner to do
    email = f"adm{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"name": "Secret Admin Name", "email": email, "password": "pw12345678"})
    admin_h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/admin/stats", headers=admin_h).status_code == 403
    with SessionLocal() as db:
        db.query(User).filter(User.email == email).update({"is_admin": True})
        db.commit()

    r = client.get("/admin/stats", headers=admin_h)
    assert r.status_code == 200, r.text
    body = r.json()
    t = body["totals"]
    assert t["users"] >= 2 and t["signups_7d"] >= 2
    assert len(body["series"]) == body["days"] == 30
    assert sum(d["signups"] for d in body["series"]) >= 2
    assert body["series"][-1]["date"] == body["generated_at"][:10]
    # aggregates only: no personal or interview content anywhere in the payload
    raw = r.text
    assert email not in raw and "Secret Admin Name" not in raw and "pw12345678" not in raw
    # nothing here can grant the flag
    assert client.post("/auth/register", json={"name": "x y", "email": f"z{uuid.uuid4().hex[:6]}@example.com",
                                                "password": "pw12345678", "is_admin": True}).status_code in (200, 201, 422)
