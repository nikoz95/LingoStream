"""Application settings loaded from environment via Pydantic BaseSettings."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration — loaded from .env file / environment.

    Groups:
        DB_*       → PostgreSQL connection
        LLM_*      → Default LLM (OpenAI-compatible)
        GEMINI_*   → Google Gemini provider
        DEEPSEEK_* → DeepSeek provider
        LOCAL_*    → Ollama local provider
        JWT_*      → JWT authentication
        REDIS_URL  → Redis connection
    """

    # ── Database ──────────────────────────────────────────────
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "lingostream"
    DB_PASSWORD: str = "lingostream"
    DB_NAME: str = "lingostream"
    DATABASE_URL: str = ""  # optional override

    @property
    def db_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    # ── LLM (default OpenAI-compatible) ───────────────────────
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_PROVIDER: str = "openai"

    # ── Gemini ────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # ── DeepSeek ──────────────────────────────────────────────
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    # ── Ollama (local) ────────────────────────────────────────
    LOCAL_BASE_URL: str = "http://localhost:11434"
    LOCAL_MODEL: str = "mistral"

    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Uploads ───────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()