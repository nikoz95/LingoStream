# LingoStream Backend

Backend implementation of LingoStream using Clean Architecture principles.

## Project Structure

```
lingostream/backend/
├── domain/               # Enterprise Business Rules
│   ├── entities/         # Business objects
│   ├── usecases/         # Application Business Rules
│   ├── repositories/     # Interfaces (abstract base classes)
│   └── interfaces/       # Other abstractions (AI, cache)
├── infrastructure/       # Frameworks & Drivers
│   ├── database/         # Database implementations
│   ├── ai/               # AI service implementations
│   ├── cache/            # Cache implementations
│   └── web/              # Web framework implementations
├── config/               # Configuration
├── tests/                # Unit and integration tests
├── main.py               # Entry point
└── requirements.txt      # Dependencies
```

## Clean Architecture Principles Applied

1. **Domain Layer**: Pure Python, no dependencies on infrastructure
2. **Dependency Inversion**: Infrastructure implements domain interfaces
3. **Dependency Injection**: All dependencies are injected, no global state
4. **Separation of Concerns**: Clear boundaries between layers

## Authentication Module

The authentication module implements the following components:

### Domain Layer
- `User` entity with id, email, hashed_password, created_at, updated_at
- `UserRepository` interface with abstract methods for user operations
- `RegisterUser` use case for user registration
- `LoginUser` use case for user authentication

### Infrastructure Layer
- SQLAlchemy `User` model mapping to database
- `UserRepositoryImpl` implementing the repository interface
- Password hashing service using PBKDF2
- JWT service for token generation and verification

### Web Layer
- Pydantic schemas for request/response validation
- Auth router with endpoints for register, login, and get current user
- Dependency injection for authentication middleware

## Getting Started

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up database:
```bash
# Create PostgreSQL database
createdb lingostream
```

3. Run the application:
```bash
python main.py
```

## API Endpoints

- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and get JWT token
- `GET /auth/me` - Get current user information (protected)

## Testing

Run tests with:
```bash
pytest tests/
```