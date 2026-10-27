"""Security-focused tests: upload validation, input validation, auth edge cases, rate limiting, headers, data deletion."""
import io
import uuid
import zipfile

import pytest

from app.core import upload_guard as ug


# ----------------------------------------------------------------- pure unit tests (no database)

def _pdf(text="Hello resume") -> bytes:
    import fitz
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), text)
    return doc.tobytes()


def _docx(text="Hello resume") -> bytes:
    from docx import Document
    d = Document()
    d.add_paragraph(text)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_valid_files_are_accepted():
    assert ug.validate_resume("cv.pdf", _pdf(), 1_000_000)[1] == "pdf"
    assert ug.validate_resume("cv.docx", _docx(), 1_000_000)[1] == "docx"
    assert ug.validate_resume("cv.txt", "Résumé\nPython".encode(), 1_000_000)[1] == "txt"


@pytest.mark.parametrize("name,content,status", [
    ("cv.exe", b"MZ\x90\x00", 400),                       # extension not allowed
    ("cv.pdf", b"", 400),                                  # empty
    ("cv.pdf", b"just some text, not a pdf", 415),         # extension lies
    ("cv.txt", _pdf(), 415),                               # pdf renamed to .txt
    ("cv.docx", _pdf(), 415),                              # pdf renamed to .docx
    ("cv.pdf", _docx(), 415),                              # docx renamed to .pdf
    ("cv.txt", b"abc\x00\x01\x02binary", 415),             # binary
    ("cv.txt", b"\xff\xfe\xfa not utf8", 415),             # not UTF-8
    ("cv.pdf", b"x" * 2_000, 413),                         # over the (tiny) limit used below
])
def test_invalid_files_are_rejected(name, content, status):
    with pytest.raises(ug.UploadError) as e:
        ug.validate_resume(name, content, 1_500 if status == 413 else 1_000_000)
    assert e.value.status == status


def test_zip_that_is_not_a_docx_is_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("evil.txt", "x")
    with pytest.raises(ug.UploadError):
        ug.validate_resume("cv.docx", buf.getvalue(), 1_000_000)


def test_zip_with_too_many_entries_is_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "x")
        z.writestr("word/document.xml", "x")
        for i in range(ug.MAX_ZIP_ENTRIES + 1):
            z.writestr(f"f{i}", "")
    with pytest.raises(ug.UploadError):
        ug.validate_resume("cv.docx", buf.getvalue(), 10_000_000)


def test_filename_is_sanitised():
    assert ug.safe_filename("../../etc/passwd.pdf") == "passwd.pdf"
    assert ug.safe_filename("C:\\Users\\me\\cv\x00.pdf") == "cv.pdf"
    assert len(ug.safe_filename("a" * 500 + ".pdf")) <= 120


def test_schema_validation():
    from pydantic import ValidationError
    from app.schemas.schemas import UserRegister, InterviewStartRequest
    ok = UserRegister(name="  Asha   Rao ", email="Asha@Example.COM", password="longenough1")
    assert ok.name == "Asha Rao" and ok.email == "asha@example.com"
    for bad in ({"password": "short"}, {"password": "é" * 40}, {"password": " " * 10}, {"name": "   "}, {"name": "x" * 81}):
        with pytest.raises(ValidationError):
            UserRegister(**{"name": "A", "email": "a@b.co", "password": "longenough1", **bad})
    with pytest.raises(ValidationError):
        InterviewStartRequest(role="Engineer", resume_id="not-a-uuid")
    assert InterviewStartRequest(role="  Data   Analyst ", company="  ").company is None


# ----------------------------------------------------------------- API tests (need the throwaway database)

needs_db = pytest.mark.needs_db


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core import extraction

    def boom(*a, **k):
        raise RuntimeError("LLM disabled in tests")
    extraction.call_llm_json = boom
    with TestClient(app) as c:
        yield c


def _register(client, email=None, pw="pw12345678"):
    email = email or f"s{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"name": "Sec Test", "email": email, "password": pw})
    assert r.status_code == 200, r.text
    return email, {"Authorization": f"Bearer {r.json()['token']}"}


@needs_db
def test_email_is_case_insensitive_and_normalised(client):
    email, _ = _register(client, f"MiXeD{uuid.uuid4().hex[:6]}@Example.com")
    assert client.post("/auth/login", json={"email": email.upper(), "password": "pw12345678"}).status_code == 200
    assert client.post("/auth/register", json={"name": "Dup", "email": email.lower(), "password": "pw12345678"}).status_code == 400


@needs_db
def test_weak_and_oversized_passwords_are_rejected(client):
    for pw in ("short", "x" * 129, "é" * 40):
        r = client.post("/auth/register", json={"name": "A", "email": f"{uuid.uuid4().hex[:8]}@example.com", "password": pw})
        assert r.status_code == 422, (pw, r.text)


@needs_db
def test_login_failures_are_uniform(client):
    email, _ = _register(client)
    wrong_pw = client.post("/auth/login", json={"email": email, "password": "nope-nope-1"})
    no_user = client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-1"})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()


@needs_db
def test_garbage_and_foreign_tokens_are_rejected(client):
    from app.core.security import create_access_token
    for tok in ("garbage", create_access_token("not-a-uuid"), create_access_token(str(uuid.uuid4()))):
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


@needs_db
def test_malformed_ids_are_clean_errors_not_500(client):
    _, h = _register(client)
    assert client.get("/interview/not-a-uuid", headers=h).status_code == 404
    assert client.get("/interview/not-a-uuid/report", headers=h).status_code == 404
    assert client.post("/interview/start", json={"role": "Engineer", "resume_id": "zzz"}, headers=h).status_code == 422
    assert client.post("/interview/start", json={"role": "E"}, headers=h).status_code == 422
    assert client.post("/interview/start", json={"role": "x" * 101}, headers=h).status_code == 422


@needs_db
def test_users_cannot_read_each_others_sessions_or_resumes(client):
    _, a = _register(client)
    _, b = _register(client)
    sid = client.post("/interview/start", json={"role": "Backend Engineer"}, headers=a).json()["id"]
    assert client.get(f"/interview/{sid}", headers=b).status_code == 404
    assert client.get(f"/interview/{sid}/report", headers=b).status_code == 404
    assert client.post(f"/interview/{sid}/message", json={"answer": "hi"}, headers=b).status_code == 404
    assert client.post(f"/interview/{sid}/end", headers=b).status_code == 404
    rid = client.post("/resume/upload", files={"file": ("cv.txt", b"Skills: Python", "text/plain")}, headers=a).json()["id"]
    assert client.post("/interview/start", json={"role": "Engineer", "resume_id": rid}, headers=b).status_code == 404
    assert client.get("/dashboard/history", headers=b).json() == []


@needs_db
def test_upload_endpoint_validates_content_not_headers(client):
    _, h = _register(client)
    up = lambda name, data, ctype: client.post("/resume/upload", files={"file": (name, data, ctype)}, headers=h)
    # a lying Content-Type / extension is rejected
    assert up("cv.pdf", b"<html>not a pdf</html>", "application/pdf").status_code == 415
    assert up("cv.exe", b"MZ", "application/pdf").status_code == 400
    assert up("cv.docx", _pdf(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document").status_code == 415
    # real files are accepted even with a useless Content-Type (the browser/Windows quirk behind the old bug)
    assert up("cv.pdf", _pdf("Python FastAPI developer"), "application/octet-stream").status_code == 200
    assert up("cv.docx", _docx("Python FastAPI developer"), "").status_code == 200
    # stored name is sanitised
    assert up("../../x/cv.txt", b"Skills: Python", "text/plain").status_code == 200


@needs_db
def test_upload_size_limit_is_enforced_server_side(client, monkeypatch):
    from app.core.config import settings
    _, h = _register(client)
    monkeypatch.setattr(settings, "max_upload_bytes", 2000)
    big = b"Skills: Python\n" * 400
    r = client.post("/resume/upload", files={"file": ("cv.txt", big, "text/plain")}, headers=h)
    assert r.status_code == 413
    # and from the declared Content-Length, before the body is read
    r = client.post("/resume/upload", content=b"x" * (2000 + 70_000), headers={**h, "Content-Type": "multipart/form-data; boundary=x"})
    assert r.status_code == 413


@needs_db
def test_json_body_limit(client):
    _, h = _register(client)
    r = client.post("/interview/start", content=b'{"role":"' + b"a" * 300_000 + b'"}', headers={**h, "Content-Type": "application/json"})
    assert r.status_code == 413


@needs_db
def test_security_headers_and_cors(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert client.get("/auth/me").status_code in (401, 403)
    assert client.get("/health/ready").json() == {"status": "ok"}
    pre = client.options("/auth/login", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert pre.headers.get("access-control-allow-origin") == "http://localhost:5173"
    evil = client.options("/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in evil.headers


@needs_db
def test_rate_limit_blocks_login_brute_force(client, monkeypatch):
    from app.core import rate_limit
    from app.core.config import settings
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    rate_limit.reset()
    codes = [client.post("/auth/login", json={"email": "x@example.com", "password": "wrong-pass"}).status_code for _ in range(25)]
    assert codes[:20] == [401] * 20 and codes[20:] == [429] * 5
    r = client.post("/auth/login", json={"email": "x@example.com", "password": "wrong-pass"})
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    rate_limit.reset()


@needs_db
def test_server_errors_do_not_leak_internals(client, monkeypatch):
    from app.routers import voice
    _, h = _register(client)
    monkeypatch.setattr(voice, "_stt_ready", lambda: True)

    def explode(*a, **k):
        raise RuntimeError("sk-secret-provider-key-123 at /srv/app/voice.py")
    monkeypatch.setattr(voice, "_transcribe_sync", explode)
    r = client.post("/voice/transcribe", files={"file": ("a.webm", b"123", "audio/webm")}, headers=h)
    assert r.status_code == 502 and "secret" not in r.text and "/srv" not in r.text


@needs_db
def test_delete_account_removes_everything(client):
    from app.core.database import SessionLocal
    from app.models.models import User, Resume, InterviewSession, TranscriptEntry
    email, h = _register(client)
    client.post("/resume/upload", files={"file": ("cv.txt", b"Skills: Python", "text/plain")}, headers=h)
    sid = client.post("/interview/start", json={"role": "Backend Engineer"}, headers=h).json()["id"]
    client.post(f"/interview/{sid}/message", json={"answer": "I would use a hash set for constant time lookups."}, headers=h)
    client.post(f"/interview/{sid}/end", headers=h)
    assert client.request("DELETE", "/auth/me", json={"password": "wrong-pass-1"}, headers=h).status_code == 403
    assert client.request("DELETE", "/auth/me", json={"password": "pw12345678"}, headers=h).status_code == 204
    assert client.get("/auth/me", headers=h).status_code == 401
    assert client.post("/auth/login", json={"email": email, "password": "pw12345678"}).status_code == 401
    with SessionLocal() as db:
        assert db.query(User).filter(User.email == email).count() == 0
        assert db.query(InterviewSession).filter(InterviewSession.id == sid).count() == 0
        assert db.query(TranscriptEntry).filter(TranscriptEntry.session_id == sid).count() == 0


@needs_db
def test_export_contains_own_data_only_and_no_password_hash(client):
    email, h = _register(client)
    _, other = _register(client)
    client.post("/resume/upload", files={"file": ("cv.txt", b"Skills: Python", "text/plain")}, headers=h)
    sid = client.post("/interview/start", json={"role": "Backend Engineer"}, headers=h).json()["id"]
    client.post("/interview/start", json={"role": "Someone Else's Role"}, headers=other)
    r = client.get("/auth/me/export", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["account"]["email"] == email and [i["id"] for i in body["interviews"]] == [sid]
    assert len(body["resumes"]) == 1 and "password" not in r.text.lower()
    assert client.get("/auth/me/export").status_code in (401, 403)


def test_production_refuses_weak_secret():
    from pydantic import ValidationError
    from app.core.config import Settings
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="change_this_to_a_long_random_string")
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="too-short")
    assert Settings(environment="production", secret_key="x" * 40).is_production
