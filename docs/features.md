// Feature-to-File Mappings

PDF Processing:
- PDF rendering: pdfjs-dist
- PDF manipulation: pdfjs-dist/legacy

UI Components:
- React components: src/components/
- Pages: src/pages/ (LibraryPage, ReaderPage, VocabularyPage, WritingPage)
- Styling: Tailwind CSS (frontend/node_modules/@tailwindcss)

Writing & Speaking Studio:
- Frontend: frontend/src/pages/WritingPage.tsx
- Backend AI service: backend/infrastructure/ai/writing_service.py
- Backend routes: backend/infrastructure/web/api/v1/routes/writing_router.py

Build System:
- Vite config: vite.config.js (to be added)
- TypeScript config: tsconfig.json (to be added)

Electron Integration:
- Native modules: node-addon-api
