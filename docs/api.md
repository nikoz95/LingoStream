# LingoStream — API Reference & Data Flow

All backend endpoints are mounted under `/api/v1` in `backend/infrastructure/web/api/v1/app.py`.
All frontend requests go through `frontend/src/lib/api.ts` (never call `fetch` directly inside React pages).

---

## 1. Auth (`/api/v1/auth` — `auth_router.py`)
- `POST /api/v1/auth/register` — Register user and return JWT access/refresh tokens.
- `POST /api/v1/auth/login` — Authenticate user and return JWT access/refresh tokens.
- `POST /api/v1/auth/refresh` — Exchange refresh token for a new token pair.
- `POST /api/v1/auth/logout` — Invalidate session.
- `GET /api/v1/auth/me` — Get current authenticated user.

## 2. Books & Chapters (`/api/v1/books` — `book_router.py`)
- `GET /api/v1/books` — List user's uploaded books.
- `POST /api/v1/books/register` — Upload and parse a `.pdf` or `.epub` file (stores in S3/MinIO + Postgres).
- `GET /api/v1/books/{book_id}` — Get book metadata and chapter list.
- `GET /api/v1/books/{book_id}/file` — Stream the original PDF/EPUB binary.
- `DELETE /api/v1/books/{book_id}` — Delete book and associated records.

## 3. Translation (`/api/v1/books` — `translation_router.py`)
- `POST /api/v1/books/{book_id}/chapters/{chapter_id}/translate` — Translate chapter paragraphs with surrounding context.
- `POST /api/v1/books/{book_id}/translate-text` — Translate arbitrary selected text from a book.
- `POST /api/v1/books/{book_id}/translate-word` — Translate a single word with lemma, phonetic, definition, and example sentence.

## 4. PDF Page Positions (`/api/v1/pages` — `page_router.py`)
- `GET /api/v1/pages/{book_id}/page-count` — Return total pages of a PDF book.
- `GET /api/v1/pages/{book_id}/word-positions/{page_index}` — Return bounding-box coordinates for clickable words on a PDF page.

## 5. Vocabulary (`/api/v1/vocabulary` — `vocabulary_router.py`)
- `GET /api/v1/vocabulary/words` — List saved words (optional `?book_id=` filter). Words saved from Writing have `book_id = null`.
- `POST /api/v1/vocabulary/words` — Save a new word (`book_id` is optional/nullable).
- `GET /api/v1/vocabulary/words/check?word=...` — Check if a word already exists in user's vocabulary.
- `PUT /api/v1/vocabulary/words/{word_id}` — Update word fields or toggle `is_mastered`.
- `DELETE /api/v1/vocabulary/words/{word_id}` — Delete a saved word.

## 6. Writing & Speaking Studio (`/api/v1/writing` — `writing_router.py`)
- `POST /api/v1/writing/evaluate` — Evaluate free writing (supports mixed Georgian/English input) AND persist the submission in `writing_submissions`. Returns `submission_id`, `corrected_text`, `natural_spoken_text`, `elevated_text`, `cefr_level`, `overall_feedback`, `speaking_connectors`, `corrections`, and `suggested_words`.
- `GET /api/v1/writing/submissions` — List the user's saved writing submissions (newest first).
- `DELETE /api/v1/writing/submissions/{submission_id}` — Delete a saved writing submission.
- `POST /api/v1/writing/analyze-patterns` — Analyze recurring error patterns across the user's saved writings and return diagnostic weak spots, golden rules, and interactive micro-drills.
- `POST /api/v1/writing/chat` — Interactive roleplay/conversation turn. Returns AI `reply`, `reply_translation`, and `user_feedback` on the user's message.
- `POST /api/v1/writing/explain` — Contextual Deep-Dive Tutor (`🔍 რატომ? / ჩაეძიე`). Explains grammatical rules, nuances, and contrast examples for a specific correction or phrase.
- `POST /api/v1/writing/translate-word` — Look up a single word/phrase in context from the Writing Studio without requiring a `book_id`.
