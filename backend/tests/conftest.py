import os

import pytest

# Must be set before the app is imported. Tests need a throwaway PostgreSQL database:
#   TEST_DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/careerprepai_test pytest
_url = os.environ.get("TEST_DATABASE_URL")
if _url:
    os.environ["DATABASE_URL"] = _url
os.environ.setdefault("RAG_BACKEND", "local")  # fast + offline; Chroma has its own optional test
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["TTS_PROVIDER"] = "browser"
os.environ["RATE_LIMIT_ENABLED"] = "false"  # test_security.py switches it on where it is the subject


def pytest_collection_modifyitems(config, items):
    if _url:
        return
    skip = pytest.mark.skip(reason="set TEST_DATABASE_URL to a throwaway PostgreSQL database to run API tests")
    for item in items:
        if "needs_db" in item.keywords:
            item.add_marker(skip)
