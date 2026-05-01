from fastapi import FastAPI
from infrastructure.web.api.v1.routes.auth_router import router as auth_router
from infrastructure.web.api.v1.routes.book_router import router as book_router
from infrastructure.database.postgres.session import engine, Base
from infrastructure.database.postgres import models  # noqa: F401


def create_app() -> FastAPI:
    app = FastAPI(
        title='LingoStream Backend',
        version='0.1.0',
        description='Backend for LingoStream language learning platform'
    )
    
    @app.on_event("startup")
    async def startup_event() -> None:
        # Ensure ORM tables exist before handling requests.
        Base.metadata.create_all(bind=engine)

    # Include routers (/auth/* and /api/v1/auth/* — same handlers)
    app.include_router(auth_router)
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(book_router)  # Add book router
    
    @app.get('/')
    async def root():
        return {'message': 'Hey there! Welcome to LingoStream Backend'}
    
    return app
