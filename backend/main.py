import uvicorn
from infrastructure.web.api.v1.app import create_app
from config.settings import settings

app = create_app()


def main():
    """Main entry point for the application"""
    if settings.DEBUG:
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="debug",
        )
    else:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
        )


if __name__ == "__main__":
    main()