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
from infrastructure.web.api.v1.routes.page_router import router as page_router


MIGRATIONS = [
    "ALTER TABLE vocabulary_words ADD COLUMN IF NOT EXISTS sentence_context_translated TEXT",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS page_index INTEGER",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_x0 DOUBLE PRECISION",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_y0 DOUBLE PRECISION",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_x1 DOUBLE PRECISION",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_y1 DOUBLE PRECISION",
    "ALTER TABLE books ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup, run migrations, clean up on shutdown."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in MIGRATIONS:
            await conn.execute(text(stmt))
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
    app.include_router(page_router, prefix="/api/v1/pages", tags=["pages"])

    @app.get("/")
    async def root():
        return {"message": "LingoStream v5.4 — Image+Overlay Reader Ready 🚀"}

    return app