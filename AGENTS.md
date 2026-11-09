# LingoStream — AI Agent Guide

LingoStream is a web app for streaming language content:
**Python (FastAPI/uvicorn) backend + React 19 / Vite / TypeScript frontend.**

## How to Approach Any New Task

1. **Understand first, then act (Token-Efficient Navigation).** Before running
   exploratory `dir` or search commands, check `docs/features.md`, `docs/api.md`,
   and `docs/architecture.md` to jump directly to the exact file paths. Read only
   the files involved before editing.
2. **Locate the right layer** using the map below. Backend is DDD-style:
   `domain/` (entities, repositories — no framework imports) →
   `infrastructure/` (web, database, ai, security) → `main.py` (entry point).
   Frontend: `pages/` → `components/` → `lib/` (API services) → `hooks/`.
3. **Change only what the task requires.** No refactors, renames, or "drive-by"
   fixes in unrelated files.
4. **Respect boundaries:** `domain/` must never import from `infrastructure/` or
   the web layer. Frontend pages must not fetch APIs directly — go through `lib/`.
5. **Verify before done:**
   - Backend: `cd backend && python -m pytest tests/` (or the relevant test).
   - Frontend: `cd frontend && npm run build` (type-checks + bundles).
6. **Keep docs in sync (Mandatory).** Whenever you add a new feature, page, API
   endpoint, or make a core architectural/config change, you **MUST** review and
   update the corresponding files in `docs/` (`features.md`, `api.md`,
   `architecture.md`, `deployment.md`) and `AGENTS.md` before finishing.
7. **Strict Git Policy — NO Auto-Commit or Push:**
   - **NEVER** run `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard`, or switch/create branches on your own.
   - Only stage, commit, or push when the user **explicitly** commands it in that exact turn.
8. **Database, Docker & Data Safety:**
   - **NEVER** run `docker-compose down -v` or delete Docker volumes (`postgres_data`, `minio_data`), `backend/uploads/`, or `.env`.
   - Database migrations in `backend/infrastructure/web/api/v1/app.py` must be strictly additive (`ADD COLUMN IF NOT EXISTS`). Never drop user tables or columns with user data.
   - Do not rewrite files wholesale when a targeted edit suffices.
9. **Module Boundaries (Reader / Writing / Vocabulary):**
   - `Reader` (`ReaderPage.tsx`) and `Writing` (`WritingPage.tsx`) are independent modules; never acoplish features by tightly coupling them to each other.
   - `Vocabulary` (`VocabularyPage.tsx`) is the shared dictionary layer that receives saved words from both `Reader` (`book_id` set) and `Writing` (`book_id = null`).
10. **Dual Docker Build Synchronization (Local Docker vs Koyeb/Render):**
    - The project has two Docker setups: local multi-container (`docker-compose.yml` + `frontend/Dockerfile` + `backend/Dockerfile`) and single-container cloud deployment (root `Dockerfile` + `Dockerfile.koyeb`, which copies `frontend/dist` directly into `/app/frontend/dist`).
    - Whenever you modify anything in `frontend/`, you **MUST** run `cd frontend && npm.cmd run build` so `frontend/dist` stays in sync for cloud deployments, and ensure `frontend/Dockerfile` also builds cleanly.

## Quick Map

| Area | Location |
|---|---|
| Backend entry | `backend/main.py` |
| Domain (entities, repository contracts) | `backend/domain/` |
| Web/API layer | `backend/infrastructure/web/` |
| Database | `backend/infrastructure/database/` |
| AI integrations | `backend/infrastructure/ai/` |
| Auth/security | `backend/infrastructure/security/` |
| Backend tests | `backend/tests/` |
| Frontend app | `frontend/src/` (`App.tsx`, `pages/`, `components/`, `hooks/`, `lib/`) |
| Frontend config | `frontend/vite.config.ts`, `frontend/tsconfig.json` |
| Docker | root `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` + `nginx.conf` |
| Local start/stop | `start.bat` / `stop.bat` |

## Commands

```bash
# Backend (port 8000, hot reload)
cd backend && python main.py            # or: uvicorn main:app --reload

# Frontend (dev server)
cd frontend && npm run dev
cd frontend && npm run build            # production build + type check
```

## Conventions (summary)

- Backend: Python 3, type hints, async where the framework already is async.
- Frontend: TypeScript strict mode, React 19, Tailwind CSS 4, `react-pdf`/`pdfjs-dist` for PDFs.
- Naming: components PascalCase, files kebab-case (frontend), snake_case (backend).
- Full standards: see `docs/conventions.md`.

## Detailed Context

All docs live in `docs/` (navigation map: `docs/index.md`).

| Doc | Use it when |
|---|---|
| `docs/architecture.md` | You need project structure and boundaries |
| `docs/features.md` | You need to know which files implement a feature |
| `docs/api.md` | You are touching endpoints, data flow, or integrations |
| `docs/conventions.md` | You are writing new code and unsure of style |
| `docs/testing.md` | You are running or adding tests |
| `docs/deployment.md` | You are changing builds, Docker, or config |

> If a doc contradicts the code, **the code wins** — then fix the doc.
