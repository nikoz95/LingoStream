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
    # Default provider config (fallback)
    LLM_PROVIDER: str = "openai"           # "openai" or "local"
    LLM_API_KEY: str = ""                  # OpenAI/Gemini API key (default)
    LLM_MODEL: str = "gemini-2.5-flash"    # e.g. "gpt-4o-mini", "mistral:7b", "llama3.2"
    LLM_BASE_URL: str = ""                 # base URL for OpenAI-compatible API

    # Gemini provider config
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    # DeepSeek provider config
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    LLM_MAX_CONTEXT_CHARS: int = 3000      # max chars for left/right context windows

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