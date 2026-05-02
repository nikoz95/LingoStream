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