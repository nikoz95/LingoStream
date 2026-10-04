# Repository Architecture

## Frontend Monorepo Structure

- `frontend/` — Main application directory
  - `node_modules/` — Dependencies (read-only)
  - `src/` — Source code

Key frontend boundaries (top → bottom):
1. React Component Layer (`src/pages/`, `src/components/`)
2. State Management Layer (`src/hooks/`)
3. API Service Layer (`src/lib/`)
4. Utility/Helper Layer

Build system (frontend):
- Vite (bundler + dev server)
- TypeScript (strict type checking)
- PDF.js (`pdfjs-dist`) for PDF rendering

External dependencies: React/ReactDOM, Tailwind CSS.

## Project Structure

The repository follows a standard frontend/backend separation with the following key directories:

- `frontend/` - Contains all client-side code and assets
- `backend/` - Contains server-side code and API endpoints
- `docs/` - Documentation files (including this architecture document)
- `Dockerfile` - Container configuration
- `docker-compose.yml` - Service orchestration

## Frontend/Backend Boundaries

### Frontend
- Built with modern JavaScript frameworks (React, Vue, or similar)
- Serves static assets and handles user interactions
- Communicates with backend via RESTful API or GraphQL
- Located in `/frontend` directory

### Backend
- Node.js/Express or similar framework
- Provides API endpoints for frontend
- Handles business logic and database operations
- Located in `/backend` directory

## Main Components

### Frontend Components
- UI components (React/Vue components)
- State management (Redux, Vuex, or similar)
- Routing configuration
- API service layer

### Backend Components
- API controllers
- Service layer (business logic)
- Database models/repositories
- Middleware (authentication, validation)
- Configuration management

## Data Flow

1. User interacts with frontend UI
2. Frontend dispatches action to state management
3. Frontend makes API request to backend
4. Backend processes request through controllers
5. Business logic executed in service layer
6. Database operations performed via repositories
7. Response sent back to frontend
8. Frontend updates UI based on response

## Docker Architecture

The project uses Docker for containerization with the following components:

- `Dockerfile` - Defines the application container
- `docker-compose.yml` - Orchestrates multiple services:
  - Frontend service (development server)
  - Backend service (Node.js server)
  - Database service (PostgreSQL/MySQL)
  - Optional: Redis for caching

## Important Dependencies

### Frontend Dependencies
- React/Vue core packages
- Routing libraries
- State management
- UI component libraries
- Build tools (Webpack, Vite, etc.)
- Testing frameworks

### Backend Dependencies
- Express or similar web framework
- Database drivers (pg, mysql2, etc.)
- Authentication libraries (Passport, JWT)
- Validation libraries (Joi, Zod)
- Testing frameworks (Jest, Mocha)

### Shared Dependencies
- TypeScript (for type checking)
- ESLint/Prettier (for code formatting)
- Husky (for Git hooks)

## Key Extension Points

1. **API Endpoints** - Backend can be extended with new routes
2. **Middleware** - Custom middleware can be added for authentication, logging, etc.
3. **Frontend Components** - New UI components can be added following existing patterns
4. **State Management** - New reducers/actions can be added to manage additional state
5. **Database Models** - New models can be created following existing patterns
6. **Docker Services** - Additional services can be added to docker-compose.yml
7. **Configuration** - Environment variables can be extended for new features
