# LingoStream — Feature-to-File Map

Use this file to jump directly to the files implementing a feature without searching the directory tree.

## 1. Authentication & Users
- **Frontend UI:** `frontend/src/pages/LoginPage.tsx`
- **Frontend Auth Context:** `frontend/src/lib/auth.tsx`, `frontend/src/lib/api.ts` (`login`, `register`, `refreshAccessToken`, `logout`, `getMe`)
- **Backend Routes:** `backend/infrastructure/web/api/v1/routes/auth_router.py`
- **Backend Security/JWT:** `backend/infrastructure/security/`, `backend/infrastructure/web/api/v1/dependencies.py`
- **ORM Model:** `UserORM` in `backend/infrastructure/database/postgres/models.py`

## 2. Book Library, Upload & Discover Hub (`/library`)
- **Frontend UI:** `frontend/src/pages/LibraryPage.tsx`
  - **My Books Tab:** Upload and manage `.pdf` and `.epub` books.
  - **Discover & Read Hub (`🌐 აღმოაჩინე მასალა`):** Browse live articles, discussions, and short stories across **Tech** (`AI & LLMs`, `.NET & C#`, `Python`, `System Design`), **General** (`World & News`, `Psychology & Habits`, `Science & Space`, `Culture & Life`), **Spoken** (`🎙️ Podcasts & Discussions`), and **Fiction** (`📖 მოთხრობები / Short Stories`), plus custom topic creation.
  - **Reading Format & Level Selector Modal:** Open any item in the Reader as **Original**, **Adapted to Level (`A2`/`B1`/`B2`/`C1`)**, **2-Host Podcast Dialogue**, or **Modern Short Story** (with optional Chapter 2 containing the original text).
- **Frontend API:** `frontend/src/lib/api.ts` (`listBooks`, `registerBook`, `deleteBook`, `getBookBlob`, `getDiscoverFeed`, `importDiscoverItem`)
- **Backend Routes:**
  - Books: `backend/infrastructure/web/api/v1/routes/book_router.py`
  - Discover & Smart Import: `backend/infrastructure/web/api/v1/routes/discover_router.py`
- **Backend Discover & EPUB Service:** `backend/infrastructure/ai/discover_service.py`
- **Parsers:**
  - EPUB: `backend/infrastructure/database/postgres/epub_parser.py`
  - PDF: `backend/infrastructure/database/postgres/pdf_parser.py`
- **ORM Models:** `BookORM`, `ChapterORM`, `ParagraphORM` in `backend/infrastructure/database/postgres/models.py`

## 3. Reader (EPUB & PDF) + Inline Translation
- **Frontend Page:** `frontend/src/pages/ReaderPage.tsx`
- **EPUB Engine:** `frontend/src/components/EpubViewer.tsx`, `frontend/src/lib/reader/EpubEngine.ts`
- **PDF Engine:** `frontend/src/components/PageRenderer.tsx`, `backend/infrastructure/web/api/v1/routes/page_router.py`
- **Text Selection & Word Picking:** `frontend/src/lib/textPicker.ts`, `frontend/src/components/MobileLoupe.tsx`
- **Translation UI:** `frontend/src/components/TranslationPanel.tsx`, `frontend/src/components/MobileTranslationSheet.tsx`
- **Backend Translation Routes & AI:**
  - Routes: `backend/infrastructure/web/api/v1/routes/translation_router.py`
  - Service: `backend/infrastructure/ai/translation_service.py`

## 4. Writing & Speaking Studio (`/writing`)
- **Frontend Page:** `frontend/src/pages/WritingPage.tsx`
  - **Free Writing Studio:** Mixed Georgian/English writing support, localStorage draft auto-save, voice dictation (`SpeechRecognition`), 3-tier AI rewrites (`Natural Spoken`, `Grammar Corrected`, `Elevated`), clickable word lookup, speaking connectors.
  - **AI Roleplay & Live Chat:** Interactive scenario conversations with inline coaching cards and audio playback (`speechSynthesis`).
  - **Saved Writings History & Weak Spots Diagnostic (`📜 თემები & ანალიზი`):** Lists saved essays from PostgreSQL (`writing_submissions`), reloads any past essay into the studio, and runs AI pattern diagnostics across essays with interactive **Micro-Drills** to fix recurring mistakes.
  - **Contextual Deep-Dive Tutor (`🔍 რატომ? / ჩაეძიე`):** Inline expandable grammar & nuance Q&A thread on any correction, phrase, or micro-drill.
- **Frontend API:** `frontend/src/lib/api.ts` (`evaluateWriting`, `listWritingSubmissions`, `deleteWritingSubmission`, `analyzeWritingPatterns`, `sendWritingChat`, `explainWritingDeepDive`, `translateWritingWord`)
- **Backend Routes:** `backend/infrastructure/web/api/v1/routes/writing_router.py`
- **Backend Schemas:** `backend/infrastructure/web/api/v1/schemas/writing_schemas.py`
- **Backend AI Service:** `backend/infrastructure/ai/writing_service.py`
- **ORM Model:** `WritingSubmission` (`writing_submissions`) in `backend/infrastructure/database/postgres/models.py`

## 5. Vocabulary & Mini-Games (`/vocabulary`)
- **Frontend Page:** `frontend/src/pages/VocabularyPage.tsx`
  - Displays saved words grouped by book (`book_id`) or Writing Studio (`book_id = null` / `'unassigned'`).
  - Includes `is_mastered` toggle, inline word editing, audio pronunciation, and Quiz / Flashcards mini-games.
- **Frontend API:** `frontend/src/lib/api.ts` (`listVocabularyWords`, `saveVocabularyWord`, `updateVocabularyWord`, `checkVocabularyWord`, `deleteVocabularyWord`)
- **Backend Routes:** `backend/infrastructure/web/api/v1/routes/vocabulary_router.py`
- **ORM Model:** `VocabularyWordORM` in `backend/infrastructure/database/postgres/models.py`

## 6. UI Internationalization & Language Switcher
- **Frontend i18n Context & Dictionary:** `frontend/src/lib/i18n.tsx` (`LanguageProvider`, `useLanguage`, type-safe translations dictionary)
- **UI Language Switcher Component:** `frontend/src/components/LanguageToggle.tsx` (toggle between Georgian `ka` 🇬🇪 and English `en` 🇬🇧, persisted in `localStorage`)
- **Covered Views:** Header navigation, Library & Discover Hub (`LibraryPage.tsx`), Vocabulary (`VocabularyPage.tsx`), Writing Studio (`WritingPage.tsx`).
