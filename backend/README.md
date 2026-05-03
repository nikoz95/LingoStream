# LingoStream Backend

Backend implementation of LingoStream built with FastAPI and Clean Architecture.

## Project Structure

```
backend/
├── config/                  # Application settings (.env → pydantic-settings)
│   ├── settings.py
│   └── __init__.py
├── domain/                  # Core business logic (pure Python, no framework)
│   ├── entities/            # Business objects (User, Book, Chapter, Paragraph)
│   ├── repositories/        # Abstract repository interfaces (ABCs)
│   └── __init__.py
├── infrastructure/          # All framework / external-world code
│   ├── ai/                  # AI / LLM translation service
│   ├── database/
│   │   └── postgres/        # SQLAlchemy async models, session, repository impls, parsers
│   ├── security/            # JWT and password utilities (module-level functions)
│   └── web/
│       └── api/v1/          # FastAPI app factory, routes, schemas, dependencies
├── tests/                   # Test suite
├── main.py                  # Application entry point
├── init_db.py               # Database initialisation script
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Architecture Decisions

1. **Domain layer is pure Python** — no SQLAlchemy, no FastAPI, no external framework.
2. **Infrastructure implements domain interfaces** (Dependency Inversion).
3. **Module-level functions for stateless services** — `jwt_service.py` and `password_service.py` expose plain functions instead of classes.
4. **Lazy chapter parsing** — Chapter 1 is parsed immediately on upload; remaining chapters are parsed in the background via `BackgroundTasks`.
5. **Context-aware translation** — the LLM receives surrounding paragraphs for idiomatic literary translation into Georgian.

## Auth Endpoints

| Method | Path                    | Description                        |
|--------|-------------------------|------------------------------------|
| POST   | /api/v1/auth/register   | Register a new user                |
| POST   | /api/v1/auth/login      | Login, returns access + refresh    |
| POST   | /api/v1/auth/refresh    | Refresh an expired access token    |
| GET    | /api/v1/auth/me         | Get current user profile           |
| POST   | /api/v1/auth/logout     | Blacklist the current token        |

## Book Endpoints

| Method | Path                                              | Description                          |
|--------|---------------------------------------------------|--------------------------------------|
| POST   | /api/v1/books/register                            | Upload EPUB/PDF, register book       |
| GET    | /api/v1/books                                     | List all books                       |
| GET    | /api/v1/books/{id}                                | Book detail with chapter list        |
| GET    | /api/v1/books/{id}/chapters                       | All chapters for a book              |
| GET    | /api/v1/books/{id}/chapters/{ch_id}               | Chapter with its paragraphs          |
| GET    | /api/v1/books/{id}/chapters/{ch_id}/paragraphs    | Flat paragraph list for a chapter    |
| POST   | /api/v1/books/{id}/chapters/{ch_id}/translate     | Translate selected passage           |
| POST   | /api/v1/books/{id}/translate-text                 | Translate arbitrary selected text    |
| GET    | /api/v1/books/{id}/file?token=...                 | Serve the original PDF file          |
| DELETE | /api/v1/books/{id}                                | Delete book and its data             |

## Getting Started

```bash
# 1. Build and run with Docker
docker compose -f backend/docker-compose.yml up --build -d

# 2. Run database migrations / seeding
docker compose -f backend/docker-compose.yml exec api python init_db.py
```

Or run directly:

```bash
pip install -r backend/requirements.txt
python backend/main.py
```

## Testing

```bash
pytest backend/tests/