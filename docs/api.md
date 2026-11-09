// API and Data Flows

External APIs:
- PDF.js for document rendering
- Electron for native functionality

Data Flow:
1. User input → React components
2. Component state → Service layer
3. Service layer → External APIs
4. Results → UI updates

Key Data Structures:
- PDF documents (pdfjs-dist)
- Electron messages (node-addon-api)

Writing & Speaking Studio API (`/api/v1/writing`):
- `POST /api/v1/writing/evaluate` — Evaluate free writing (supports mixed Georgian/English), returning 3-level rewrites, corrections, speaking connectors, and suggested vocabulary.
- `POST /api/v1/writing/chat` — Interactive roleplay & conversation turn with coaching feedback.
- `POST /api/v1/writing/explain` — Contextual deep-dive ("რატომ? / ჩაეძიე") grammar & nuance explanation.
- `POST /api/v1/writing/translate-word` — Word lookup in context for 1-click saving to Vocabulary.
