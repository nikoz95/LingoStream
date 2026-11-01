# LingoStream — Project Context (AI fast-start)

> Snapshot: 2026-11-02, commit `471a486`. Purpose: let an agent make decisions
> **without re-reading the whole repo**. Read this first; open source files only
> for the area you touch. If code contradicts this file, code wins — update here.

## 1. What the product is

PDF/EPUB reader for learning a language **through Georgian**. User uploads a book,
reads it in a PDF.js viewer, clicks/selects words or text → LLM returns Georgian
translation (+ phonetic, definition, example sentence for single words) → user
saves words to a personal **vocabulary** list. Multi-user, JWT auth.

## 2. Stack & runtime facts

| Item | Value |
|---|---|
| Backend | Python 3.13 (Docker image), FastAPI 0.115, SQLAlchemy 2 async + asyncpg, PyMuPDF, ebooklib, openai SDK, httpx, Redis |
| Frontend | React 19, Vite 6, TS 5.6 strict, Tailwind 4, pdfjs-dist ^4 + react-pdf 9, react-router 7 |
| DB | PostgreSQL 15 (schema via `create_all` + ad-hoc `MIGRATIONS` list in `app.py`; **Alembic is installed but unused**) |
| Redis | Only for JWT blacklist (logout / refresh rotation) |
| Main run mode | `start.bat` → root `docker-compose.yml` (db, redis, backend:8000, frontend nginx:80). `backend/docker-compose.yml` = dev variant (vite :5173) |
| Local host env | **No Python on host** (`python`/`py` not found) → backend only runs in Docker. Node is present; use `npm.cmd` in PowerShell (`npm.ps1` blocked by execution policy) |
| Frontend build | `cd frontend; npm.cmd run build` ✅ passes (1 warning: 668 kB single chunk) |
| Backend tests | **None real.** `backend/tests/run_test.py` is only an import/env smoke script; `test_auth` exists only as stale `.pyc` |
| Size | ~7.5k LOC total. Backend ~2.3k, frontend ~4.6k |

## 3. Backend map (`backend/`)

```
main.py                         uvicorn entry (reload=True)
config/settings.py              Pydantic Settings: DB_*, DATABASE_URL, LLM_*, GEMINI_*, DEEPSEEK_*, LOCAL_*, JWT_*, REDIS_URL, UPLOAD_DIR
domain/entities/{book,user}.py  dataclasses: User, Book, Chapter, Paragraph
domain/repositories/*.py        abstract repo contracts (Book/Chapter/Paragraph/User)
infrastructure/
  web/api/v1/app.py             create_app(): CORS *, routers, lifespan (create_all + MIGRATIONS)
  web/api/v1/dependencies.py    authenticate_request (Bearer OR ?token=), get_current_user, get_blacklist_service
  web/api/v1/routes/
    auth_router.py              /api/v1/auth: register, login, refresh (rotates), me, logout
    book_router.py              /api/v1/books: register(upload), list, detail, chapters, chapter+paragraphs (lazy parse), file, delete
    translation_router.py       /api/v1/books/{id}: chapters/{ch}/translate, translate-text, translate-word
    vocabulary_router.py        /api/v1/vocabulary/words: POST, GET(?book_id), GET check?word=, PUT/{id}, DELETE/{id}
    page_router.py              /api/v1/pages/{book_id}: word-positions/{page_index} (lazy PyMuPDF index → DB), page-count
  web/api/v1/schemas/           auth_schemas.py, book_schemas.py (book, translate, vocab DTOs)
  database/postgres/
    session.py                  engine, async_session_factory, Base, get_session
    models.py                   ORM: users, books, chapters, paragraphs, word_positions, translation_records(unused), vocabulary_words
    repositories.py             *RepositoryImpl (Book, Chapter, Paragraph, User, WordPosition, Vocabulary) — each method commits
    pdf_parser.py               PDFParser(EPUBParser): metadata, toc(=pages), words with bbox, page dims, search
    epub_parser.py              EPUBParser: metadata, toc(spine), paragraphs from HTML
  ai/translation_service.py     translate(), translate_word() → OpenAI-compatible client or Ollama /api/chat; prompts hardcode target=Georgian
  security/                     jwt_service (python-jose, HS256, jti), password_service (passlib bcrypt), token_blacklist (Redis)
```

**Patterns to imitate**
- New endpoint: router in `routes/`, DTO in `schemas/book_schemas.py`, repo method in `repositories.py`, register router in `app.py`, add client fn + types in `frontend/src/lib/api.ts`.
- Ownership check: `_get_owned_book(book_id, user_id, db)` (duplicated in book_router & page_router; `_verify_book_ownership` in translation_router).
- Schema change: add model column in `models.py` **and** an `ALTER TABLE ... IF NOT EXISTS` line to `MIGRATIONS` in `app.py`.
- LLM provider: request field `provider` = `gemini|deepseek|local|None(default LLM_*)`; see `_resolve_provider`.
- Note: domain entities are mapped from ORM for Book/Chapter/Paragraph/User, but WordPosition & Vocabulary repos return ORM objects directly.

## 4. Frontend map (`frontend/src/`)

```
main.tsx            Router + AuthProvider; pdf.js worker from unpkg CDN pinned 4.8.69
App.tsx             routes: /login, /library, /reader/:bookId, /vocabulary (ProtectedRoute)
lib/api.ts          ALL HTTP calls (fetch wrapper `request`, tokens in localStorage ls_*)
lib/auth.tsx        AuthContext (login/register/logout, validates via /auth/me)
pages/
  LoginPage.tsx  LibraryPage.tsx (upload/list/delete)  VocabularyPage.tsx
  ReaderPage.tsx    716 LOC orchestrator — zoom, scroll observer, theme, sidebar, search, translation, mobile loupe
components/         ReaderHeader, PageRenderer, ThumbnailSidebar, SearchPanel, TranslationPanel(386), MobileLoupe(327), LoadingSpinner
hooks/              usePdfDocument→usePdfLoader (fetch /file?token), useTextSelection, useTranslation, useWordPositions,
                    usePdfSearch, useReadingProgress (localStorage), useContainerWidth
                    UNUSED: useClickSelection.ts, usePageTextContent.ts
index.css           Tailwind 4 + themes (sepia etc.)
```

## 5. Known issues (prioritized) — decide from here

### 🔴 Security / correctness
1. **IDOR:** `GET /books/{id}/file` (`get_book_file`) has **no ownership check** → any logged-in user can download any book.
2. **IDOR (minor):** `GET /books/{id}/chapters` (`list_chapters`) no ownership check; `translate_passage` doesn't verify `chapter_id` belongs to `book_id`.
3. **Root `.env` is committed to git** (contains placeholder `JWT_SECRET`, DB_URL). Real API key lives in untracked `backend/.env` (OK). Compose hardcodes `JWT_SECRET=your-secret-key-here`, default in settings `change-me-in-production`.
4. CORS `allow_origins=["*"]` + `allow_credentials=True` (prod goes through nginx proxy so it's not needed).
5. JWT in `?token=` query for file endpoint (leaks to logs/history). Tokens in localStorage.
6. No upload size limit in backend (nginx caps 50M), no password rules, no rate-limit on login / LLM endpoints.
7. **No auto-refresh on 401** in frontend: `refreshAccessToken()` exists but is never used → user is silently logged out after 30 min.

### 🟠 Functional gaps
8. **EPUB is accepted on upload but the reader is PDF.js-only** → EPUB books can't be opened in UI (backend EPUB paragraph API exists, unused by UI).
9. `translation_records` table never written; no caching of translations (every click = paid LLM call).
10. `word_index`/positions: lazy indexing per page on first request; PDFs without text layer (scans) return empty — no OCR.
11. `book.total_pages` never set on upload (stays 0); `/pages/{id}/page-count` opens the PDF each call.

### 🟡 Performance / tech debt
12. Sync PyMuPDF/ebooklib parsing + `file.read()` inside `async` handlers → blocks event loop.
13. New `AsyncOpenAI` client and new Redis connection **per request**.
14. Every repo method commits → multi-step operations are not atomic (e.g. upload: book + chapters + paragraphs).
15. No Alembic; migrations = hardcoded SQL list run at every startup.
16. Frontend single 668 kB chunk; pdf worker from CDN with version possibly ≠ installed `pdfjs-dist` (local copies in `public/` unused) → breaks offline / on version drift.
17. Repo hygiene: tracked `frontend/dist/`, `frontend/tsconfig.tsbuildinfo`, `backend/tests/__pycache__/*.pyc`, `backend/task_progress.md` (stale log).
18. Duplicated helpers (`_get_owned_book` ×2 + `_verify_book_ownership`); translation_service has 4 near-identical call functions.

### 📄 Docs status
`docs/api.md`, `architecture.md`, `conventions.md`, `deployment.md`, `testing.md`, `features.md` are **generic/wrong** (mention Electron, Node/Express, Jest, "Dockerfile to be added"). `backend/README.md` mentions non-existent `init_db.py` and BackgroundTasks parsing (not implemented). Actual frontend file naming is **PascalCase** for components and camelCase for hooks (not kebab-case as AGENTS.md says). Trust this file + code.

## 6. Verification commands (Windows host)

```powershell
cd frontend; npm.cmd run build          # type-check + bundle (build rewrites tracked dist/ → `git checkout -- frontend/dist` after)
docker-compose up --build -d            # full stack; backend checks need Docker (no host Python)
docker-compose exec backend python -m pytest tests/   # once real tests exist (pytest not in requirements.txt!)
```

## 7. Suggested decision menu (pick by number)

| # | Task | Effort | Value |
|---|---|---|---|
| A | Fix IDOR #1–2 + untrack root `.env` + CORS tighten | S | 🔴 High |
| B | Frontend 401 → refresh token retry in `lib/api.ts` | S | High UX |
| C | Translation cache (DB/Redis, key = text+context+provider) | M | Cost ↓ |
| D | Block or implement EPUB in reader | S (block) / L (implement) | Correctness |
| E | Real pytest suite (auth, ownership, vocab) + add pytest to reqs | M | Safety net |
| F | Run parsing in threadpool, shared OpenAI/Redis clients | S–M | Perf |
| G | Alembic migration baseline | M | Maintainability |
| H | Rewrite `docs/*` from this file; clean tracked build artifacts | S | Agent cost ↓ |
| I | Code-split ReaderPage / pdf.js, local worker | S | Load time |
