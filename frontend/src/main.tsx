import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { AuthProvider } from './lib/auth';
import App from './App';
import './index.css';

// Import react-pdf TextLayer CSS for native text selection
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure pdfjs-dist worker for Vite bundling
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);