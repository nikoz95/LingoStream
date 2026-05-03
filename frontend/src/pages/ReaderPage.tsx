import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

// Vite-compatible: use ?url import for worker file
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import {
  getBookDetail,
  getBookFileUrl,
  translateSelectedText,
  translateStreamUrl,
  type BookDetailResponse,
} from '../lib/api';
import TranslationPanel from '../components/TranslationPanel';


type Theme = 'sepia' | 'night';

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [book, setBook] = useState<BookDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<Theme>('sepia');
  const [numPages, setNumPages] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Translation state
  const [selectedText, setSelectedText] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<{ original: string; translation: string } | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [translationProvider, setTranslationProvider] = useState('');

  // PDF blob URL for CORS isolation
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!bookId) return;

    async function init() {
      try {
        const detail = await getBookDetail(Number(bookId));
        setBook(detail);

        const fileUrl = getBookFileUrl(Number(bookId));
        if (fileUrl) {
          // Fetch and create blob URL for cross-origin isolation
          try {
            const resp = await fetch(fileUrl);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            setPdfBlobUrl(url);
          } catch {
            // Fallback to direct URL
            setPdfBlobUrl(fileUrl);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load book');
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      if (pdfBlobUrl && pdfBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [bookId]);

  // Track container width for responsive PDF
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }

    selectionTimeoutRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const selText = sel.toString().trim();
        if (selText) {
          setSelectedText(selText);
          setShowTranslation(true);
          setTranslationResult(null);
          setStreamingText('');
          setTranslationError('');
        }
      }
    }, 300);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
      if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
    };
  }, [handleTextSelection]);

  // Cancel any in-flight streaming request
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleTranslate() {
    if (!selectedText || !bookId || !book) return;

    setTranslating(true);
    setTranslationError('');
    setStreamingText('');

    // Try streaming first
    try {
      const url = translateStreamUrl(Number(bookId), selectedText);
      abortRef.current = new AbortController();

      const response = await fetch(url, {
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error('Stream failed, falling back');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulated += content;
                setStreamingText(accumulated);
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }

      setTranslationResult({
        original: selectedText,
        translation: accumulated,
      });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Fall back to regular translate
    }

    // Fallback: non-streaming translate
    try {
      const result = await translateSelectedText(Number(bookId), {
        selected_text: selectedText,
        left_context: '',
        right_context: '',
        book_title: book.title,
        source_language: book.language || 'en',
        provider: translationProvider || null,
      });
      setTranslationResult(result);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setTranslating(false);
    }
  }

  function toggleTheme() {
    setTheme((prev) => (prev === 'sepia' ? 'night' : 'sepia'));
  }

  function closeTranslation() {
    setShowTranslation(false);
    setSelectedText('');
    setTranslationResult(null);
    setStreamingText('');
    abortRef.current?.abort();
  }

  if (loading) {
    return (
      <div className="min-h-screen theme-sepia flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-sepia-text/30 border-t-sepia-text rounded-full animate-spin" />
          <p className="text-sepia-text/60 text-sm">Loading book...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen theme-sepia flex items-center justify-center">
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

  return (
    <div className={`h-screen flex flex-col ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
      {/* Header */}
      <header className="flex-shrink-0 glass border-b border-white/10 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/library')}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            title="Back to Library"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-medium text-sm truncate max-w-[200px] sm:max-w-md">
            {book?.title || 'Reading'}
          </h1>
          {numPages && (
            <span className="text-xs opacity-40 hidden sm:inline">
              {numPages} pages
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            title="Toggle theme"
          >
            {theme === 'sepia' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* Sidebar toggle */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-xl transition-colors ${showSidebar ? 'bg-white/15' : 'hover:bg-white/10'}`}
            title="Toggle translation panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5h12M3 12h18M3 19h6" />
            </svg>
          </button>

          <button
            onClick={() => logout()}
            className="px-3 py-1.5 text-xs rounded-xl border border-white/15 hover:bg-white/10 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          {pdfBlobUrl ? (
            <Document
              file={pdfBlobUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-sepia-text/30 border-t-sepia-text rounded-full animate-spin" />
                    <p className="text-sm opacity-50">Loading PDF...</p>
                  </div>
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
                    width: Math.min(containerWidth - 40, 800),
                    maxWidth: 'calc(100vw - 40px)',
                  }}
                >
                  <Page
                    pageNumber={index + 1}
                    width={Math.min(containerWidth - 40, 800)}
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
              translationResult={streamingText ? { original: selectedText, translation: streamingText } : translationResult}
              translationError={translationError}
              translating={translating}
              isStreaming={!!streamingText && !translationResult}
              provider={translationProvider}
              onProviderChange={setTranslationProvider}
              onTranslate={handleTranslate}
              onClose={closeTranslation}
            />
          </div>
        )}
      </div>
    </div>
  );
}