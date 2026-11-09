# LingoStream — Repository Architecture

## Core Product Model

LingoStream consists of two independent language-acquisition pillars that feed into a shared dictionary:

```
📖 Reader (EPUB / PDF) ──┐
                         ├──► 🗂️ Vocabulary (Shared Dictionary & Flashcards/Quiz)
✍️ Writing & Speaking  ──┘
```

- **Reader** (`ReaderPage.tsx`) and **Writing** (`WritingPage.tsx`) are independent modules. Never tightly couple them to each other.
- **Vocabulary** (`VocabularyPage.tsx`) stores words saved from books (`book_id` set) and from the Writing Studio (`book_id = null`).

---

## Backend Structure (`backend/`)

FastAPI + SQLAlchemy 2.0 (async `asyncpg`) + Pydantic v2.

```
backend/
├── main.py                                         # Uvicorn entry point (imports create_app)
├── config/
│   └── settings.py                                 # Env settings (DB, JWT, S3/MinIO, LLM providers)
├── domain/
│   ├── entities/                                   # Pure domain models (book.py, user.py)
│   └── repositories/                               # Abstract repository interfaces
└── infrastructure/
    ├── ai/
    │   ├── translation_service.py                  # Passage & word translation (Gemini/DeepSeek/OpenAI/Local)
    │   └── writing_service.py                      # Writing evaluation, Roleplay chat, Deep-Dive grammar tutor
    ├── database/postgres/
    │   ├── session.py                              # AsyncSession & SQLAlchemy engine
    │   ├── models.py                               # ORM tables: users, books, chapters, paragraphs, vocabulary_words, writing_submissions
    │   ├── repositories.py                         # SQLAlchemy repository implementations
    │   ├── epub_parser.py                          # EPUB ingestion & chapter extraction
    │   └── pdf_parser.py                           # PyMuPDF (fitz) PDF word-position & text parser
    ├── security/                                   # JWT token creation/verification & password hashing
    └── web/api/v1/
        ├── app.py                                  # FastAPI factory, CORS, startup migrations, SPA static serving
        ├── dependencies.py                         # authenticate_request dependency
        ├── schemas/
        │   ├── auth_schemas.py                     # Auth Pydantic models
        │   ├── book_schemas.py                     # Book, Chapter, Translation, Vocabulary Pydantic models
        │   └── writing_schemas.py                  # Writing & Speaking Studio Pydantic models
        └── routes/
            ├── auth_router.py                      # /api/v1/auth/*
            ├── book_router.py                      # /api/v1/books/*
            ├── translation_router.py               # /api/v1/books/{id}/translate*
            ├── page_router.py                      # /api/v1/pages/* (PDF word bounding boxes)
            ├── vocabulary_router.py                # /api/v1/vocabulary/*
            └── writing_router.py                   # /api/v1/writing/*
```

---

## Frontend Structure (`frontend/`)

React 19 + TypeScript (strict) + Vite 6 + Tailwind CSS 4.

```
frontend/src/
├── main.tsx                                        # React root with BrowserRouter + AuthProvider
├── App.tsx                                         # Route definitions (/login, /library, /reader/:bookId, /vocabulary, /writing)
├── index.css                                       # Tailwind CSS + custom theme variables
├── pages/
│   ├── LoginPage.tsx                               # Login & registration UI
│   ├── LibraryPage.tsx                             # Book upload (PDF/EPUB), list, delete, navigation
│   ├── ReaderPage.tsx                              # Unified EPUB & PDF reader with word/sentence translation
│   ├── VocabularyPage.tsx                          # Saved words grouped by book/Writing + Quiz & Flashcard games
│   └── WritingPage.tsx                             # Free Writing Studio, AI Roleplay Chat, Deep-Dive grammar tutor
├── components/
│   ├── EpubViewer.tsx                              # foliate-js EPUB renderer wrapper
│   ├── PageRenderer.tsx                            # PDF.js page canvas + word click overlay
│   ├── ReaderHeader.tsx                            # Reader top bar, settings, TOC, progress
│   ├── TranslationPanel.tsx                        # Desktop sidebar for word/passage translations
│   ├── MobileTranslationSheet.tsx                  # Mobile bottom sheet for translations
│   ├── MobileLoupe.tsx                             # Touch magnifier for mobile text selection
│   ├── SearchPanel.tsx                             # In-book search sidebar
│   ├── SettingsModal.tsx                           # Typography, theme, and AI provider settings
│   ├── ThumbnailSidebar.tsx                        # Chapter/page navigation sidebar
│   └── LoadingSpinner.tsx                          # Reusable spinner component
└── lib/
    ├── api.ts                                      # All backend API calls & token refresh interceptor
    ├── auth.tsx                                    # AuthContext & useAuth hook
    ├── textPicker.ts                               # Word & sentence boundary detection on click/drag
    └── reader/
        ├── EpubEngine.ts                           # foliate-js integration & styling engine
        └── types.ts                                # Shared reader interfaces
```
