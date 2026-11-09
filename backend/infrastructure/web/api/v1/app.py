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
    "ALTER TABLE vocabulary_words ADD COLUMN IF NOT EXISTS is_mastered BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS page_index INTEGER",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_x0 DOUBLE PRECISION",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_y0 DOUBLE PRECISION",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_x1 DOUBLE PRECISION",
    "ALTER TABLE paragraphs ADD COLUMN IF NOT EXISTS bbox_y1 DOUBLE PRECISION",
    "ALTER TABLE books ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0",
    "DROP TABLE IF EXISTS page_images",
    "DROP TABLE IF EXISTS pdf_words",
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

    # Health check for deployment platforms (Render, Koyeb, Docker)
    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    # ── Serve pre-built Frontend SPA (Nginx-less architecture) ──
    import os
    import mimetypes
    from fastapi.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("application/javascript", ".mjs")

    frontend_dir = os.environ.get("FRONTEND_DIST_DIR", "/app/frontend/dist")
    if not os.path.exists(frontend_dir):
        candidate = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../frontend/dist"))
        if os.path.exists(candidate):
            frontend_dir = candidate

    if os.path.exists(frontend_dir):
        assets_dir = os.path.join(frontend_dir, "assets")
        if os.path.exists(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            target = os.path.join(frontend_dir, full_path)
            if full_path and os.path.isfile(target):
                return FileResponse(target)
            index_file = os.path.join(frontend_dir, "index.html")
            if os.path.isfile(index_file):
                return FileResponse(index_file)
            return {"message": "LingoStream v0.5.3"}
    else:
        @app.get("/")
        async def root():
            return {"message": "LingoStream v6.0 — PDF.js + Word Click Zones Reader"}

    return app
