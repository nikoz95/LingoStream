from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from infrastructure.web.api.v1.routes.auth_router import router as auth_router
from infrastructure.web.api.v1.routes.book_router import router as book_router
from infrastructure.database.postgres.session import engine, Base
from infrastructure.database.postgres import models  # noqa: F401
from config.settings import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version='0.5.3',
        description='AI-native reading platform for language acquisition'
    )
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def startup_event() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(book_router, prefix="/api/v1/books", tags=["books"])

    @app.get("/")
    async def root():
        return {"message": "LingoStream v5.3 — Ready for learning 🚀"}
    return app


