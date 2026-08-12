from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/careerprepai"
    secret_key: str = "change_this_to_a_long_random_string"
    access_token_expire_minutes: int = 1440
    cors_origins: str = "http://localhost:5173"

    # LLM provider for resume/JD extraction. "claude" or "openai".
    llm_provider: str = "claude"
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
