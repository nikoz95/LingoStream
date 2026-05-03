"""FastAPI application factory with lifespan lifecycle management."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from infrastructure.database.postgres.session import engine, Base
from infrastructure.database.postgres import models  # noqa: F401 — register ORM models
from infrastructure.web.api.v1.routes.auth_router import router as auth_router
from infrastructure.web.api.v1.routes.book_router import router as book_router
from infrastructure.web.api.v1.routes.translation_router import router as translation_router
from infrastructure.web.api.v1.routes.vocabulary_router import router as vocabulary_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup, run migrations, clean up on shutdown."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migration: add sentence_context_translated column if not present
        await conn.execute(
            text(
                "ALTER TABLE vocabulary_words "
                "ADD COLUMN IF NOT EXISTS sentence_context_translated TEXT"
            )
        )
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="LingoStream",
        version="0.5.3",
        description="AI-native reading platform for language acquisition",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(book_router, prefix="/api/v1/books", tags=["books"])
    app.include_router(translation_router, prefix="/api/v1/books", tags=["translation"])
    app.include_router(vocabulary_router, prefix="/api/v1/vocabulary", tags=["vocabulary"])

    @app.get("/")
    async def root():
        return {"message": "LingoStream v5.3 — Ready for learning 🚀"}

    return app