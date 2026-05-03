 import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import { getBookFileUrl } from '../lib/api';
import { usePdfLoader } from '../hooks/usePdfLoader';
import { useContainerWidth } from '../hooks/useContainerWidth';
import { useTextSelection } from '../hooks/useTextSelection';
import { useTranslation } from '../hooks/useTranslation';
import ReaderHeader from '../components/ReaderHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import TranslationPanel from '../components/TranslationPanel';

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { book, loading, error, pdfBlobUrl } = usePdfLoader(bookId);
  const { selectedText, clearSelection } = useTextSelection();
  const {
    translating,
    translationResult,
    streamingText,
    translationError,
    provider,
    setProvider,
    translate,
    closeTranslation,
  } = useTranslation(book, bookId);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [theme, setTheme] = useState<'sepia' | 'night'>('sepia');
  const [showSidebar, setShowSidebar] = useState(true);
  const { ref: containerRef, width: containerWidth } = useContainerWidth();

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => setNumPages(pages),
    [],
  );

  const handleTranslate = useCallback(() => {
    translate(selectedText);
  }, [translate, selectedText]);

  const handleCloseTranslation = useCallback(() => {
    closeTranslation();
    clearSelection();
  }, [closeTranslation, clearSelection]);

  const toggleTheme = useCallback(
    () => setTheme(prev => (prev === 'sepia' ? 'night' : 'sepia')),
    [],
  );

  const toggleSidebar = useCallback(
    () => setShowSidebar(prev => !prev),
    [],
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl && pdfBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <LoadingSpinner message="Loading book..." />
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/library')}
            className="px-4 py-2 rounded-xl bg-sepia-text text-sepia-bg font-medium"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // --- Main render ---
  return (
    <div className={`h-screen flex flex-col ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
      <ReaderHeader
        title={book?.title}
        numPages={numPages}
        theme={theme}
        showSidebar={showSidebar}
        onToggleTheme={toggleTheme}
        onToggleSidebar={toggleSidebar}
        onBack={() => navigate('/library')}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          {pdfBlobUrl ? (
            <Document
              file={pdfBlobUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex items-center justify-center py-20">
                  <LoadingSpinner message="Loading PDF..." />
                </div>
              }
              error={
                <div className="flex items-center justify-center py-20 text-red-500">
                  Failed to load PDF
                </div>
              }
              className="flex flex-col items-center py-4"
            >
              {Array.from(new Array(numPages || 0), (_, index) => (
                <div
                  key={`page_${index + 1}`}
                  className="mb-6 rounded-2xl overflow-hidden shadow-lg"
                  style={{
                    width: '100%',
                    maxWidth: 'calc(100vw - 40px)',
                  }}
                >
                  <Page
                    pageNumber={index + 1}
                    width={Math.min(containerWidth, 800)}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                    className="bg-white"
                  />
                </div>
              ))}
            </Document>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="opacity-50 mb-4">Unable to load PDF viewer</p>
                <a
                  href={getBookFileUrl(Number(bookId))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-sepia-text text-sepia-bg font-medium text-sm"
                >
                  Download PDF
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Translation Sidebar */}
        {showSidebar && (
          <div className="w-80 lg:w-96 flex-shrink-0 border-l border-white/10 overflow-y-auto">
            <TranslationPanel
              selectedText={selectedText}
              translationResult={
                streamingText && !translationResult
                  ? { original: selectedText, translation: streamingText }
                  : translationResult
              }
              translationError={translationError}
              translating={translating}
              isStreaming={!!streamingText && !translationResult}
              provider={provider}
              onProviderChange={setProvider}
              onTranslate={handleTranslate}
              onClose={handleCloseTranslation}
            />
          </div>
        )}
      </div>
    </div>
  );
}