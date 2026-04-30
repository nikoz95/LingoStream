from fastapi import FastAPI
from infrastructure.web.api.v1.routes.auth_router import router as auth_router
from infrastructure.database.postgres.session import engine, Base


def create_app() -> FastAPI:
    app = FastAPI(
        title='LingoStream Backend',
        version='0.1.0',
        description='Backend for LingoStream language learning platform'
    )
    
    # Include routers
    app.include_router(auth_router)
    
    @app.get('/')
    async def root():
        return {'message': 'Welcome to LingoStream Backend'}
    
    return app
