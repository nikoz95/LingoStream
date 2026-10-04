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
