from fastapi import FastAPI
from infrastructure.web.api.v1.routes.auth_router import router as auth_router
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

    # Include routers
    app.include_router(auth_router)
    
    @app.get('/')
    async def root():
        return {'message': 'Welcome to LingoStream Backend'}
    
    return app
