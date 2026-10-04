// Project Architecture

Frontend Monorepo Structure:
- frontend/ - Main application directory
  - node_modules/ - Dependencies (read-only)
  - src/ - Source code (to be added to chat)

Key Boundaries:
1. React Component Layer
2. State Management Layer
3. API Service Layer
4. Utility/Helper Layer

Build System:
- Vite (frontend/node_modules/vite)
- TypeScript (frontend/node_modules/typescript)
- PDF.js (frontend/node_modules/pdfjs-dist)

External Dependencies:
- React/ReactDOM
- Tailwind CSS
- Electron (via node-addon-api)
