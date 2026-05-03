import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { pdfjs, Document, Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import { getBookFileUrl, saveVocabularyWord } from '../lib/api';
import { usePdfLoader } from '../hooks/usePdfLoader';
import { useContainerWidth } from '../hooks/useContainerWidth';
import { useTextSelection } from '../hooks/useTextSelection';
import { useTranslation } from '../hooks/useTranslation';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { usePdfSearch } from '../hooks/usePdfSearch';
import ReaderHeader from '../components/ReaderHeader';
import type { ViewMode } from '../components/ReaderHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import TranslationPanel from '../components/TranslationPanel';
import ThumbnailSidebar from '../components/ThumbnailSidebar';
import SearchPanel from '../components/SearchPanel';

const PAGE_GAP = 24;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { book, loading, error, pdfBlobUrl } = usePdfLoader(bookId);
  const {
    selectedText,
    selectionRect,
    isWordClick,
    leftContext,
    rightContext,
    clearSelection,
  } = useTextSelection();
  const {
    translating,
    translationResult,
    wordResult,
    translationError,
    provider,
    setProvider,
    translate,
    closeTranslation,
    existingWord,
    checkingExisting,
    savedVocabularyId,
    onVocabularySaved,
    onVocabularyUpdated,
  } = useTranslation(book, bookId);
  const [savedToVocabulary, setSavedToVocabulary] = useState(false);
  const [translateIconPos, setTranslateIconPos] = useState<{ top: number; left: number } | null>(null);

  // ---- Core state ----
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [theme, setTheme] = useState<'sepia' | 'night'>('night');
  const [showSidebar, setShowSidebar] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [viewMode, setViewMode] = useState<ViewMode>('scroll');
  const { ref: containerWidthRef, width: containerWidth } = useContainerWidth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const spreadContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const isScrollingRef = useRef(false);

  // ---- Dark mode detection ----
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'night' : 'sepia');
    const listener = (e: MediaQueryListEvent) => setTheme(e.matches ? 'night' : 'sepia');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', listener);
    return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', listener);
  }, []);

  // ---- Reading progress hook ----
  const {
    containerRef: progressContainerRef,
    saveProgress,
    scrollToSaved,
    progressRef,
  } = useReadingProgress(bookId, numPages);

  // ---- PDF search hook ----
  const {
    query,
    searchResult,
    showSearch,
    setQuery,
    runSearch,
    goToMatch,
    setCurrentMatchByPage,
    clearSearch,
    toggleSearch,
    setShowSearch,
  } = usePdfSearch(pdfDocRef.current);

  // ---- PDF loaded ----
  const onDocumentLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      setNumPages(pdf.numPages);
      pdfDocRef.current = pdf;
    },
    [],
  );

  // Restore progress after PDF loads
  useEffect(() => {
    if (numPages && numPages > 0 && !loading) {
      scrollToSaved();
    }
  }, [numPages, loading, scrollToSaved]);

  // ---- Page tracking via IntersectionObserver ----
  useEffect(() => {
    if (!numPages || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        // Only track if user isn't actively scrolling via keyboard nav
        if (isScrollingRef.current) return;

        let mostVisible = 0;
        let maxRatio = 0;

        for (const entry of entries) {
          const pageNum = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisible = pageNum;
          }
        }

        if (mostVisible > 0) {
          setCurrentPage(mostVisible);
          // Save progress on page change
          const percent = (mostVisible / numPages) * 100;
          saveProgress(mostVisible, percent);
        }
      },
      { threshold: [0.1, 0.3, 0.6], rootMargin: '-50px 0px' },
    );

    const map = pageElementsRef.current;
    map.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [numPages, saveProgress]);

  // ---- Scroll handler for progress (fallback when no page elements observed) ----
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !numPages) return;
    isScrollingRef.current = false;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
    if (scrollPercent >= 0 && scrollPercent <= 100) {
      saveProgress(currentPage, scrollPercent);
    }
  }, [numPages, currentPage, saveProgress]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+F → search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // Escape → close search
      if (e.key === 'Escape' && showSearch) {
        e.preventDefault();
        setShowSearch(false);
        return;
      }

      // Don't intercept if typing in an input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          isScrollingRef.current = true;
          scrollToPage(currentPage + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          isScrollingRef.current = true;
          scrollToPage(currentPage - 1);
          break;
        case 'Home':
          e.preventDefault();
          isScrollingRef.current = true;
          scrollToPage(1);
          break;
        case 'End':
          e.preventDefault();
          isScrollingRef.current = true;
          scrollToPage(numPages || 1);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, numPages, showSearch, toggleSearch, setShowSearch]);

  // ---- Scroll to page helper ----
  const scrollToPage = useCallback((page: number) => {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(page, numPages));
    setCurrentPage(clamped);

    // In spread mode, scroll the spread container into view
    if (viewMode === 'spread' && spreadContainerRef.current) {
      const pairIndex = Math.floor((clamped - 1) / 2);
      const spreadEl = spreadContainerRef.current;
      const spreadChildren = spreadEl.children;
      for (let i = 0; i < spreadChildren.length; i++) {
        const child = spreadChildren[i] as HTMLElement;
        if (child.dataset && child.dataset.pairIndex === String(pairIndex)) {
          // Wait for DOM update then scroll
          requestAnimationFrame(() => {
            child.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          return;
        }
      }
    }

    // Default: scroll page element into view
    const el = pageElementsRef.current.get(clamped);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages, viewMode]);

  // ---- Zoom with Ctrl+Wheel ----
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    setZoomLevel(prev => {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
    });
  }, []);

  // ---- Auto-clear translation panel on new selection ----
  useEffect(() => {
    if (selectedText) {
      closeTranslation();
      setSavedToVocabulary(false);
    }
  }, [selectedText]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Floating translate icon position ----
  useEffect(() => {
    if (selectionRect && selectedText) {
      // Position icon above the selected text
      const scrollY = window.scrollY || window.pageYOffset;
      setTranslateIconPos({
        top: selectionRect.top + scrollY - 48,
        left: selectionRect.left + selectionRect.width / 2,
      });
    } else {
      setTranslateIconPos(null);
    }
  }, [selectionRect, selectedText]);

  // ---- Callbacks ----
  const handleTranslate = useCallback(() => {
    translate(selectedText, isWordClick, leftContext, rightContext);
    setTranslateIconPos(null);
  }, [translate, selectedText, isWordClick, leftContext, rightContext]);

  const handleCloseTranslation = useCallback(() => {
    closeTranslation();
    clearSelection();
    setSavedToVocabulary(false);
  }, [closeTranslation, clearSelection]);

  const handleSaveToVocabulary = useCallback(async () => {
    if (!wordResult || !bookId) return;
    try {
      const saved = await saveVocabularyWord({
        book_id: Number(bookId),
        word: wordResult.original,
        phonetic: wordResult.phonetic || null,
        definition: wordResult.definition || null,
        sentence_context: wordResult.sentence_context || null,
        sentence_context_translated: wordResult.sentence_context_translated || null,
        translation: wordResult.translation,
      });
      setSavedToVocabulary(true);
      // Notify hook so it can update existingWord / savedVocabularyId
      onVocabularySaved(saved.id);
    } catch {
      // silently fail
    }
  }, [wordResult, bookId, onVocabularySaved]);

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
  const handleBack = useCallback(() => navigate('/library'), [navigate]);

  const handleNavToPage = useCallback((page: number) => {
    scrollToPage(page);
    // Also update search match index if search is active
    if (searchResult && searchResult.totalMatches > 0) {
      setCurrentMatchByPage(page);
    }
  }, [scrollToPage, searchResult, setCurrentMatchByPage]);

  // ---- Clear search highlights when search closes ----
  const handleCloseSearch = useCallback(() => {
    setShowSearch(false);
    clearSearch();
    // Remove all highlights
    document.querySelectorAll('.search-highlight').forEach(el => {
      el.classList.remove('search-highlight');
    });
  }, [setShowSearch, clearSearch]);

  // ---- Highlight search matches in PDF text layer ----
  const highlightRef = useRef<(() => void) | null>(null);

  const applySearchHighlight = useCallback(() => {
    // Clean up previous highlights
    document.querySelectorAll('.search-highlight').forEach(el => {
      el.classList.remove('search-highlight');
    });

    if (!searchResult || searchResult.totalMatches === 0) return;

    const currentMatch = searchResult.matches[searchResult.currentMatchIndex];
    if (!currentMatch) return;

    // Find the text layer for the current page
    const pageEl = document.querySelector(`[data-page-number="${currentMatch.pageNumber}"]`);
    if (!pageEl) return;

    const textLayer = pageEl.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return;

    // Extract the search text (strip leading/trailing … and whitespace)
    const rawText = currentMatch.text;
    const searchText = rawText.replace(/^…\s*/, '').replace(/\s*…$/, '').trim().toLowerCase();
    if (!searchText) return;

    // Find matching spans
    const spans = textLayer.querySelectorAll('span');
    for (const span of spans) {
      const spanText = (span.textContent || '').toLowerCase();
      if (spanText.includes(searchText)) {
        span.classList.add('search-highlight');
      }
    }
  }, [searchResult]);

  // Watch for search result changes to apply highlights
  useEffect(() => {
    if (!searchResult || searchResult.totalMatches === 0) return;

    // Small timeout to let the PDF text layer re-render
    const timer = setTimeout(() => {
      applySearchHighlight();
    }, 200);

    return () => clearTimeout(timer);
  }, [searchResult, applySearchHighlight]);

  // Cleanup highlights on unmount
  useEffect(() => {
    return () => {
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight');
      });
    };
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl && pdfBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // ---- Compute page dimensions ----
  const pageWidth = viewMode === 'spread'
    ? Math.min(containerWidth * 0.45 * zoomLevel, 600)
    : Math.min(containerWidth, 800) * zoomLevel;

  const progressPercent = numPages ? (currentPage / numPages) * 100 : 0;

  // ---- Active page check ----
  const isCurrentPage = (pageNum: number): boolean => {
    if (viewMode === 'scroll') return pageNum === currentPage;
    if (viewMode === 'single') return pageNum === currentPage;
    if (viewMode === 'spread') {
      const pairIndex = Math.floor((currentPage - 1) / 2);
      const leftPage = pairIndex * 2 + 1;
      const rightPage = leftPage + 1;
      return pageNum === leftPage || pageNum === rightPage;
    }
    return false;
  };

  // ---- Render functions ----
  const renderPage = (pageNum: number) => {
    const active = isCurrentPage(pageNum);
    return (
      <div
        key={`page_${pageNum}`}
        data-page-number={pageNum}
        ref={(el) => {
          if (el) pageElementsRef.current.set(pageNum, el);
          else pageElementsRef.current.delete(pageNum);
        }}
        className={`rounded-2xl overflow-hidden shadow-2xl mx-auto transition-all duration-200
          ${theme === 'sepia' ? 'shadow-amber-900/20' : 'shadow-black/40'}
          hover:shadow-2xl
          ${active ? 'ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/10' : ''}`}
        style={{
          width: viewMode === 'spread' ? `${pageWidth}px` : 'fit-content',
          maxWidth: `calc(100vw - ${showSidebar ? 384 + 96 + 60 : 96 + 60}px)`,
          marginBottom: viewMode === 'single' ? '0' : `${PAGE_GAP}px`,
          marginTop: viewMode === 'single' ? '0' : '0',
        }}
      >
        <Page
          pageNumber={pageNum}
          width={pageWidth}
          renderTextLayer={true}
          renderAnnotationLayer={false}
          className="bg-white"
        />
      </div>
    );
  };

  const renderScrollView = () => (
    <div className="flex flex-col items-center py-4">
      {Array.from(new Array(numPages || 0), (_, i) => renderPage(i + 1))}
    </div>
  );

  const renderSingleView = () => {
    const pages: number[] = [];
    if (currentPage > 1) pages.push(currentPage - 1);
    pages.push(currentPage);
    if (numPages && currentPage < numPages) pages.push(currentPage + 1);

    return (
      <div className="flex flex-col items-center justify-center min-h-full py-4">
        {pages.map((p) => (
          <div key={`single_${p}`}>
            {renderPage(p)}
          </div>
        ))}
      </div>
    );
  };

  const renderSpreadView = () => {
    const pairs: [number, number | null][] = [];
    const total = numPages || 0;
    for (let i = 1; i <= total; i += 2) {
      pairs.push([i, i + 1 <= total ? i + 1 : null]);
    }
    // Show spread centered around current page
    const currentPairIndex = Math.floor((currentPage - 1) / 2);
    const start = Math.max(0, currentPairIndex - 1);
    const end = Math.min(pairs.length, currentPairIndex + 2);
    const visiblePairs = pairs.slice(start, end);

    return (
      <div
        ref={spreadContainerRef}
        className="flex flex-col items-center justify-center min-h-full py-4"
      >
        {visiblePairs.map(([left, right], idx) => (
          <div
            key={`spread_${start + idx}`}
            data-pair-index={start + idx}
            className="flex items-start justify-center gap-4 scroll-mt-20"
            style={{ marginBottom: `${PAGE_GAP}px` }}
          >
            {renderPage(left)}
            {right && renderPage(right)}
          </div>
        ))}
      </div>
    );
  };

  // =========== RENDER ===========

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <LoadingSpinner message="Loading book..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/library')}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  const sidebarOffset = showSidebar ? 384 : 0; // w-96 = 384px

  return (
    <div className={`h-screen flex flex-col ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
      <ReaderHeader
        title={book?.title}
        currentPage={currentPage}
        numPages={numPages}
        theme={theme}
        showSidebar={showSidebar}
        zoomLevel={zoomLevel}
        viewMode={viewMode}
        progressPercent={progressPercent}
        onToggleTheme={toggleTheme}
        onToggleSidebar={toggleSidebar}
        onBack={handleBack}
        onLogout={handleLogout}
        onJumpToPage={scrollToPage}
        onZoomChange={setZoomLevel}
        onViewModeChange={setViewMode}
        onToggleSearch={toggleSearch}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Thumbnail sidebar */}
        <ThumbnailSidebar
          pdfBlobUrl={pdfBlobUrl || ''}
          numPages={numPages}
          currentPage={currentPage}
          onPageClick={scrollToPage}
          visible={!showSidebar}
        />

        {/* PDF Viewer */}
        <div
          ref={(node) => {
            scrollContainerRef.current = node;
            progressContainerRef.current = node;
            containerWidthRef.current = node;
          }}
          className="flex-1 overflow-y-auto overflow-x-hidden relative"
          onScroll={handleScroll}
          onWheel={handleWheel}
        >
          {/* View mode backdrop for single/spread */}
          {(viewMode === 'single' || viewMode === 'spread') && (
            <div className="fixed inset-0 bg-black/40 pointer-events-none z-0" />
          )}

          {/* Search Panel */}
          <SearchPanel
            query={query}
            searchResult={searchResult}
            showSearch={showSearch}
            onQueryChange={setQuery}
            onSearch={runSearch}
            onGoToMatch={goToMatch}
            onClose={handleCloseSearch}
            onNavToPage={handleNavToPage}
          />

          {/* Document */}
          <div className={`relative z-10 ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
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
              >
                {viewMode === 'scroll' && renderScrollView()}
                {viewMode === 'single' && renderSingleView()}
                {viewMode === 'spread' && renderSpreadView()}
              </Document>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="text-center">
                  <p className="opacity-50 mb-4">Unable to load PDF viewer</p>
                  <a
                    href={getBookFileUrl(Number(bookId))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-colors"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Floating page navigation (bottom-right) — position relative to sidebar */}
          <div
            className="fixed bottom-6 z-40 flex items-center gap-2"
            style={{ right: showSidebar ? `calc(1.5rem + ${sidebarOffset}px)` : '1.5rem' }}
          >
            <div className="glass rounded-xl px-3 py-2 flex items-center gap-2 text-xs">
              <span className="text-white/70 tabular-nums">
                {currentPage} / {numPages || '?'}
              </span>
              <button
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={!numPages || currentPage <= 1}
                className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
                title="Previous page (←)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={!numPages || currentPage >= numPages}
                className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
                title="Next page (→)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

      {/* Floating Translate Icon */}
      {translateIconPos && selectedText && !translationResult && !wordResult && !translating && (
        <button
          onClick={handleTranslate}
          className="fixed z-50 p-2 rounded-full bg-purple-600 hover:bg-purple-500 shadow-lg
            transition-all duration-200 hover:scale-110 animate-bounce"
          style={{
            top: `${translateIconPos.top}px`,
            left: `${translateIconPos.left}px`,
            transform: 'translate(-50%, -50%)',
          }}
          title="Translate"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 5h12M3 12h18M3 19h6" />
          </svg>
        </button>
      )}

      {/* Translation Sidebar */}
        {showSidebar && (
          <div className="w-80 lg:w-96 flex-shrink-0 border-l border-white/10 overflow-y-auto">
            <TranslationPanel
              selectedText={selectedText}
              translationResult={translationResult}
              wordResult={wordResult}
              translationError={translationError}
              translating={translating}
              provider={provider}
              onProviderChange={setProvider}
              onTranslate={handleTranslate}
              onClose={handleCloseTranslation}
              onSaveToVocabulary={handleSaveToVocabulary}
              savedToVocabulary={savedToVocabulary}
              existingWord={existingWord}
              checkingExisting={checkingExisting}
              onVocabularyUpdated={onVocabularyUpdated}
            />
          </div>
        )}
      </div>
    </div>
  );
}