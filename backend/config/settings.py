from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Database ──
    DB_URL: str = "postgresql+asyncpg://user:password@localhost:5432/lingostream"

    # ── JWT ──
    JWT_SECRET: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Redis ──
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── LLM / Translation ──
    LLM_PROVIDER: str = "local"               # "openai" or "local"
    LLM_API_KEY: str = ""                     # OpenAI API key (only for "openai")
    LLM_MODEL: str = "mistral:7b"             # e.g. "gpt-4o-mini", "mistral:7b", "llama3.2"
    LLM_BASE_URL: str = "http://host.docker.internal:11434"  # base URL for local/OpenAI-compatible API
    LLM_MAX_CONTEXT_CHARS: int = 3000         # max chars for left/right context windows

    # ── App ──
    DEBUG: bool = False
    APP_NAME: str = "LingoStream"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()