"""Application entry point for LingoStream backend."""
import uvicorn
from infrastructure.web.api.v1.app import create_app

app = create_app()


def main() -> None:
    """Run the uvicorn server with hot-reload enabled."""
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()