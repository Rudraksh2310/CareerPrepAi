import logging

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "change_this_to_a_long_random_string"


class Settings(BaseSettings):
    # "development" (default) or "production". Production refuses to start with a weak SECRET_KEY, hides the
    # interactive API docs and sends HSTS.
    environment: str = "development"

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/careerprepai"
    secret_key: str = DEFAULT_SECRET
    access_token_expire_minutes: int = 1440
    cors_origins: str = "http://localhost:5173"

    # LLM provider for extraction, follow-ups and scoring. "claude", "openai", or "groq".
    llm_provider: str = "claude"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    groq_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    openai_model: str = "gpt-4o"
    groq_model: str = "openai/gpt-oss-120b"
    llm_timeout_s: float = 25.0  # a live voice interview cannot wait minutes for a reply

    # ---- RAG (Phase 2) ----
    # "auto" = ChromaDB if it works, else local TF-IDF. "chroma" = require Chroma. "local" = TF-IDF only.
    rag_backend: str = "auto"
    rag_persist_dir: str = "./.chroma"

    # ---- Voice (Phase 3) ----
    # Speech-to-text used when the browser has no built-in recogniser (or the user forces it).
    # "groq" (whisper-large-v3-turbo, free tier) | "openai" (whisper-1) | "none"
    stt_provider: str = "groq"
    # Text-to-speech for the interviewer's voice.
    # "edge" (free, no key, needs internet) | "openai" | "elevenlabs" | "browser" (client-side voice, no server audio)
    tts_provider: str = "edge"
    tts_voice_edge: str = "en-US-AriaNeural"
    tts_voice_openai: str = "alloy"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"

    # ---- Hardening ----
    max_upload_bytes: int = 5 * 1024 * 1024  # resume uploads; enforced server-side while reading the body
    max_json_body_bytes: int = 256 * 1024  # every other request body
    rate_limit_enabled: bool = True  # in-memory, per process: put a shared limiter (e.g. at the proxy) in front for multi-worker deploys
    trust_proxy: bool = False  # only set true behind a proxy you control: then X-Forwarded-For is used for client IPs

    # ---- Interview behaviour ----
    # Round 1 (technical): this many questions in total, spread over `technical_topics` topics.
    technical_questions: int = 10
    technical_topics: int = 5
    # Round 2 (resume): every experience / project / education entry gets at least one question; follow-ups
    # are added on top of that up to this cap (the cap never cuts below one question per resume item).
    resume_max_questions: int = 5  # EXACT size of the resume round (extra items beyond it are not asked about)
    max_followups_per_topic: int = 3

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in ("production", "prod")

    @model_validator(mode="after")
    def _check_secret(self):
        weak = self.secret_key == DEFAULT_SECRET or len(self.secret_key) < 32
        if weak and self.is_production:
            raise ValueError("SECRET_KEY must be set to a random value of at least 32 characters when ENVIRONMENT=production")
        if weak:
            logging.getLogger("config").warning("SECRET_KEY is the default/weak value: fine for local development, never for production.")
        return self

    @model_validator(mode="after")
    def _pick_provider(self):
        """If the chosen LLM_PROVIDER has no key but exactly one other provider does, use that one (otherwise the
        app would silently fall back to the offline engine just because LLM_PROVIDER was left at its default)."""
        keys = {"claude": self.anthropic_api_key, "openai": self.openai_api_key, "groq": self.groq_api_key}
        have = [name for name, k in keys.items() if (k or "").strip()]
        current = (self.llm_provider or "").lower()
        if have and current not in have and len(have) == 1:
            logging.getLogger("config").warning("LLM_PROVIDER=%s has no key; using %s because only its key is set.", current, have[0])
            self.llm_provider = have[0]
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
