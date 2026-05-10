import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { saveVocabularyWord } from '../lib/api';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { useContainerWidth } from '../hooks/useContainerWidth';
import { useClickSelection } from '../hooks/useClickSelection';
import { useTranslation } from '../hooks/useTranslation';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { usePdfSearch } from '../hooks/usePdfSearch';
import { useWordPositions } from '../hooks/useWordPositions';
import ReaderHeader from '../components/ReaderHeader';
import type { ViewMode } from '../components/ReaderHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import MobileLoupe from '../components/MobileLoupe';
import TranslationPanel from '../components/TranslationPanel';
import ThumbnailSidebar from '../components/ThumbnailSidebar';
import SearchPanel from '../components/SearchPanel';
import PageRenderer from '../components/PageRenderer';

const PAGE_GAP = 24;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  // ── Core refs ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const spreadContainerRef = useRef<HTMLDivElement>(null);
  const pageNumberRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isScrollingRef = useRef(false);
  const wordPositionsLoadingRef = useRef<Set<number>>(new Set());

  // ── Word positions cache ──
  const [wordPositionsCache, setWordPositionsCache] = useState<Record<number, any>>({});

  // ── PDF Document ──
  const {
    book: pdfBook,
    loading: pdfLoading,
    error: pdfError,
    numPages,
    documentRef: pdfDocument,
    onLoadSuccess,
    onLoadError,
  } = usePdfDocument(bookId);

  // ── Coordinate-based click/drag selection ──
  const {
    selectedText,
    selectionRect,
    isWordClick,
    leftContext,
    rightContext,
    clearSelection,
    selectWord,
  } = useClickSelection({
    containerRef: scrollContainerRef,
    wordPositionsCache,
  });

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
  } = useTranslation(pdfBook, bookId);

  const [savedToVocabulary, setSavedToVocabulary] = useState(false);
  const [translateIconPos, setTranslateIconPos] = useState<{ top: number; left: number } | null>(null);

  // ── Mobile detection ──
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showMobileTranslation, setShowMobileTranslation] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-show mobile translation panel when result comes in
  useEffect(() => {
    if (isMobile && (translationResult || wordResult)) {
      setShowMobileTranslation(true);
    }
  }, [isMobile, translationResult, wordResult]);

  // ── Core state ──
  const [currentPage, setCurrentPage] = useState(1);
  const [theme, setTheme] = useState<'sepia' | 'night'>('night');
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [zoomLevel, setZoomLevel] = useState(isMobile ? 0.7 : 1.0);
  const [viewMode, setViewMode] = useState<ViewMode>('scroll');

  const effectiveSidebarVisible = isMobile ? false : showSidebar;

  const { ref: containerWidthRef, width: containerWidth } = useContainerWidth();

  // ── Word positions (backend-extracted click zones) ──
  const {
    getPositions: getWordPositionsForPage,
    loading: wordPositionsLoading,
    error: wordPositionsError,
    preloadRange: preloadWordPositions,
    clearCache: clearWordPositionsCache,
  } = useWordPositions(bookId ? Number(bookId) : null);

  // Fetch word positions for the current page + buffer
  useEffect(() => {
    if (!numPages || !bookId) return;
    const start = Math.max(0, currentPage - 2);
    const end = Math.min(numPages, currentPage + 3);
    for (let i = start; i <= end; i++) {
      const pageIdx = i - 1;
      if (!wordPositionsCache[pageIdx] && !wordPositionsLoadingRef.current.has(pageIdx)) {
        wordPositionsLoadingRef.current.add(pageIdx);
        getWordPositionsForPage(pageIdx).then(data => {
          wordPositionsLoadingRef.current.delete(pageIdx);
          if (data) {
            setWordPositionsCache(prev => ({ ...prev, [pageIdx]: data }));
          }
        });
      }
    }
  }, [currentPage, numPages, bookId, getWordPositionsForPage, wordPositionsCache]);

  // ── Dark mode detection ──
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'night' : 'sepia');
    const listener = (e: MediaQueryListEvent) => setTheme(e.matches ? 'night' : 'sepia');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', listener);
    return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', listener);
  }, []);

  // ── Reading progress ──
  const {
    containerRef: progressContainerRef,
    saveProgress,
    scrollToSaved,
  } = useReadingProgress(bookId, numPages);

  // ── Client-side PDF search ──
  const {
    query,
    matches,
    totalResults,
    currentMatchIndex,
    searching,
    error: searchError,
    currentMatch,
    debouncedSearch,
    nextMatch,
    prevMatch,
    clearSearch,
  } = usePdfSearch(pdfDocument);

  const [showSearch, setShowSearch] = useState(false);

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => !prev);
  }, []);

  const runSearch = useCallback((q: string) => {
    debouncedSearch(q);
  }, [debouncedSearch]);

  const goToMatch = useCallback((direction: 'next' | 'prev') => {
    if (direction === 'next') nextMatch();
    else prevMatch();
  }, [nextMatch, prevMatch]);

  const setQuery = useCallback((q: string) => {
    debouncedSearch(q);
  }, [debouncedSearch]);

  // Restore progress after PDF loads
  useEffect(() => {
    if (numPages && numPages > 0 && !pdfLoading) {
      scrollToSaved();
    }
  }, [numPages, pdfLoading, scrollToSaved]);

  // ── Page tracking via IntersectionObserver ──
  useEffect(() => {
    if (!numPages || !scrollContainerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
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
          const percent = (mostVisible / numPages) * 100;
          saveProgress(mostVisible, percent);
        }
      },
      { threshold: [0.1, 0.3, 0.6], rootMargin: '-50px 0px' },
    );

    const map = pageNumberRefs.current;
    map.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [numPages, saveProgress]);

  // Observe page refs as they mount
  const observePageRef = useCallback((pageNum: number) => (el: HTMLDivElement | null) => {
    if (el) {
      pageNumberRefs.current.set(pageNum, el);
    } else {
      pageNumberRefs.current.delete(pageNum);
    }
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      if (e.key === 'Escape' && showSearch) {
        e.preventDefault();
        setShowSearch(false);
        return;
      }

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
  }, [currentPage, numPages, showSearch, toggleSearch]);

  // ── Scroll to page helper ──
  const scrollToPage = useCallback((page: number) => {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(page, numPages));
    setCurrentPage(clamped);

    if (viewMode === 'spread' && spreadContainerRef.current) {
      const pairIndex = Math.floor((clamped - 1) / 2);
      const spreadEl = spreadContainerRef.current;
      const spreadChildren = spreadEl.children;
      for (let i = 0; i < spreadChildren.length; i++) {
        const child = spreadChildren[i] as HTMLElement;
        if (child.dataset && child.dataset.pairIndex === String(pairIndex)) {
          requestAnimationFrame(() => {
            child.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          return;
        }
      }
    }

    const el = pageNumberRefs.current.get(clamped);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages, viewMode]);

  // ── Zoom with Ctrl+Wheel ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    setZoomLevel(prev => {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
    });
  }, []);

  // ── Auto-clear translation panel on new selection ──
  useEffect(() => {
    if (selectedText) {
      closeTranslation();
      setSavedToVocabulary(false);
    }
  }, [selectedText]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Floating translate icon position ──
  useEffect(() => {
    if (selectionRect && selectedText) {
      setTranslateIconPos({
        top: selectionRect.top - 48,
        left: selectionRect.left + selectionRect.width / 2,
      });
    } else {
      setTranslateIconPos(null);
    }
  }, [selectionRect, selectedText]);


  // ── Callbacks ──
  const handleTranslate = useCallback(() => {
    translate(selectedText, isWordClick, leftContext, rightContext);
    setTranslateIconPos(null);
  }, [translate, selectedText, isWordClick, leftContext, rightContext]);

  const handleCloseTranslation = useCallback(() => {
    closeTranslation();
    clearSelection();
    setSavedToVocabulary(false);
    setShowMobileTranslation(false);
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
  }, [scrollToPage]);

  // ── Clear search highlights when search closes ──
  const handleCloseSearch = useCallback(() => {
    setShowSearch(false);
    clearSearch();
    document.querySelectorAll('.search-highlight').forEach(el => {
      el.classList.remove('search-highlight');
    });
  }, [clearSearch]);

  // ── Compute page dimensions ──
  const pageWidth = viewMode === 'spread'
    ? Math.min(containerWidth * 0.45 * zoomLevel, 600)
    : Math.min(containerWidth, isMobile ? 1000 : 800) * zoomLevel;

  const progressPercent = numPages ? (currentPage / numPages) * 100 : 0;

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

  // ── Build search state for SearchPanel ──
  const searchState = {
    query,
    matches,
    totalResults,
    currentMatchIndex,
    searching,
    error: searchError,
  };

  // ── MobileLoupe word selected handler ──
  const handleLoupeWordSelected = useCallback((word: string, pageX: number, pageY: number) => {
    // Set the word as selected via useClickSelection's selectWord
    // Find which page the point is on
    const elements = document.elementsFromPoint(pageX, pageY);
    const pageEl = elements.find(el => el.closest('[data-page-number]'))?.closest('[data-page-number]') as HTMLElement | undefined;
    const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber) - 1 : 0;

    selectWord(word, pageIndex, pageX, pageY);
    translate(word, true, '', '');
    setTranslateIconPos(null);
    setShowMobileTranslation(true);
  }, [translate, selectWord]);

  // ── Render functions ──
  const renderPage = (pageNum: number) => {
    const active = isCurrentPage(pageNum);

    return (
      <div
        key={`page_${pageNum}`}
        data-page-number={pageNum}
        ref={observePageRef(pageNum)}
        className={`rounded-2xl shadow-2xl mx-auto transition-all duration-200
          ${theme === 'sepia' ? 'shadow-amber-900/20' : 'shadow-black/40'}
          hover:shadow-2xl
          ${active ? 'ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/10' : ''}`}
          style={isMobile ? {
            overflow: 'visible',
            width: viewMode === 'spread' ? `${pageWidth}px` : 'fit-content',
            maxWidth: 'calc(100vw - 32px)',
            marginBottom: viewMode === 'single' ? '0' : `${PAGE_GAP}px`,
            marginTop: viewMode === 'single' ? '0' : '0',
          } : {
            overflow: 'hidden',
            width: viewMode === 'spread' ? `${pageWidth}px` : 'fit-content',
            maxWidth: `calc(100vw - ${effectiveSidebarVisible ? 384 + 96 + 60 : 96 + 60}px)`,
            marginBottom: viewMode === 'single' ? '0' : `${PAGE_GAP}px`,
            marginTop: viewMode === 'single' ? '0' : '0',
          }}
      >
        <PageRenderer
          pdf={pdfDocument}
          pageIndex={pageNum - 1}
          width={pageWidth}
          wordPositions={wordPositionsCache[pageNum - 1] || null}
          wordPositionsLoading={wordPositionsLoadingRef.current.has(pageNum - 1)}
          selectedText={selectedText}
        />
      </div>
    );
  };

  const renderScrollView = () => (
    <div className="flex flex-col items-center py-4 px-2 md:px-0">
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

  if (pdfLoading && !pdfDocument) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <LoadingSpinner message="Loading PDF..." />
      </div>
    );
  }

  if (pdfError) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">{pdfError}</p>
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

  const sidebarOffset = showSidebar ? 384 : 0;

  return (
    <div className={`h-screen flex flex-col ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
      <ReaderHeader
        title="PDF Reader"
        currentPage={currentPage}
        numPages={numPages}
        theme={theme}
        showSidebar={effectiveSidebarVisible}
        zoomLevel={zoomLevel}
        viewMode={viewMode}
        progressPercent={progressPercent}
        isMobile={isMobile}
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
        {/* Thumbnail sidebar — hidden on mobile */}
        {!isMobile && (
          <ThumbnailSidebar
            pdf={pdfDocument}
            totalPages={numPages || 0}
            currentPage={currentPage}
            onPageClick={scrollToPage}
            visible={!showSidebar}
          />
        )}

        {/* Page Viewer (react-pdf) */}
        <div
          ref={(node) => {
            scrollContainerRef.current = node;
            progressContainerRef.current = node;
            containerWidthRef.current = node;
          }}
          className="flex-1 overflow-y-auto overflow-x-hidden relative"
          onWheel={handleWheel}
        >
          {/* View mode backdrop for single/spread */}
          {(viewMode === 'single' || viewMode === 'spread') && (
            <div className="fixed inset-0 bg-black/40 pointer-events-none z-0" />
          )}

          {/* Search Panel */}
          <SearchPanel
            query={query}
            searchState={searchState}
            showSearch={showSearch}
            onQueryChange={setQuery}
            onSearch={runSearch}
            onGoToMatch={goToMatch}
            onClose={handleCloseSearch}
            onNavToPage={handleNavToPage}
          />

          {/* Pages */}
          <div className={`relative z-10 ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
            {numPages && numPages > 0 ? (
              <>
                {viewMode === 'scroll' && renderScrollView()}
                {viewMode === 'single' && renderSingleView()}
                {viewMode === 'spread' && renderSpreadView()}
              </>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="text-center">
                  <p className="opacity-50 mb-4">No pages loaded</p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Loupe — only active on mobile */}
          <MobileLoupe
            containerRef={scrollContainerRef}
            onWordSelected={handleLoupeWordSelected}
            getWordAtPoint={(vpX, vpY) => {
              // Inline: find the word at a viewport point using wordPositionsCache
              const elements = document.elementsFromPoint(vpX, vpY);
              const pageEl = elements.find(el => el.closest('[data-page-number]'))?.closest('[data-page-number]') as HTMLElement | undefined;
              if (!pageEl) return null;
              const pageIdx = Number(pageEl.dataset.pageNumber) - 1;
              const pageData = wordPositionsCache[pageIdx];
              if (!pageData || !pageData.words) return null;
              const pageRect = pageEl.getBoundingClientRect();
              const scaleX = pageData.page_width / (pageRect.width || 1);
              const scaleY = pageData.page_height / (pageRect.height || 1);
              const pdfX = (vpX - pageRect.left) * scaleX;
              const pdfY = (vpY - pageRect.top) * scaleY;
              for (const w of pageData.words) {
                if (pdfX >= w.x0 && pdfX <= w.x1 && pdfY >= w.y0 && pdfY <= w.y1) return w.word;
              }
              return null;
            }}
            pageZoom={zoomLevel}
            enabled={isMobile}
          />

          {/* Floating page navigation (bottom-right) */}
          <div
            className="fixed bottom-6 z-40 flex items-center gap-2"
            style={{
              right: isMobile
                ? '1rem'
                : showSidebar ? `calc(1.5rem + ${sidebarOffset}px)` : '1.5rem'
            }}
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

        {/* Desktop Translation Sidebar */}
        {!isMobile && showSidebar && (
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

        {/* Mobile Translation Bottom Sheet */}
        {isMobile && showMobileTranslation && (
          <div className="fixed inset-x-0 bottom-0 z-50">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm mobile-bottom-sheet-backdrop"
              onClick={handleCloseTranslation}
            />

            {/* Sheet */}
            <div className="relative bg-gray-900 rounded-t-2xl border-t border-white/10 shadow-2xl max-h-[70vh] overflow-y-auto mobile-bottom-sheet">
              <div className="sticky top-0 bg-gray-900 pt-3 pb-2 px-4 flex items-center justify-between border-b border-white/10">
                <span className="text-sm font-semibold opacity-70 uppercase tracking-wider">Translation</span>
                <button
                  onClick={handleCloseTranslation}
                  className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}