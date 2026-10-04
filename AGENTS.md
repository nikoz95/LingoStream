# LingoStream — AI Agent Guide

LingoStream is a web app for streaming language content:
**Python (FastAPI/uvicorn) backend + React 19 / Vite / TypeScript frontend.**

## How to Approach Any New Task

1. **Understand first, then act.** Read the files involved before editing. For a
   bug: reproduce/trace it. For a feature: find the closest existing feature and
   imitate its pattern.
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
6. **Keep docs in sync.** If you add a feature, API endpoint, or change a
   command/config, update the matching doc below.
7. **Never:** commit `.env` or secrets, delete user data in `backend/uploads/`,
   or rewrite files wholesale when a small edit suffices.

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
