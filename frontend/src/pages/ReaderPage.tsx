import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import { saveVocabularyWord, getBookBlob } from '../lib/api';
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
import EpubViewer, { type EpubViewerHandle } from '../components/EpubViewer';
import SettingsModal from '../components/SettingsModal';
import type {
  EpubFontFamily,
  EpubLayoutMode,
  EpubRelocateInfo,
  EpubTheme,
} from '../lib/reader/EpubEngine';
import type { TocItem } from '../lib/reader/types';
import type { TextPick } from '../lib/textPicker';

const PAGE_GAP = 24;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const settings = useSettings();

  // ── Core refs ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const spreadContainerRef = useRef<HTMLDivElement>(null);
  const epubViewerRef = useRef<EpubViewerHandle>(null);
  const pageNumberRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isScrollingRef = useRef(false);
  const wordPositionsLoadingRef = useRef<Set<number>>(new Set());

  // ── Word positions cache (for PDF fallback) ──
  const [wordPositionsCache, setWordPositionsCache] = useState<Record<number, any>>({});

  // ── PDF Document (also loads book metadata) ──
  const {
    book: pdfBook,
    loading: pdfLoading,
    error: pdfError,
    numPages,
    documentRef: pdfDocument,
  } = usePdfDocument(bookId);

  // ── EPUB Mode & Practical Reading Options (Default: EPUB!) ──
  const [isEpubMode, setIsEpubMode] = useState(true);
  const [epubBlob, setEpubBlob] = useState<Blob | null>(null);
  const [epubLoading, setEpubLoading] = useState(true);
  const [epubToc, setEpubToc] = useState<TocItem[]>([]);
  const [epubChapterTitle, setEpubChapterTitle] = useState('');
  const [epubFraction, setEpubFraction] = useState(0);
  const [epubPageInfo, setEpubPageInfo] = useState({ current: 1, total: 100 });

  // Typography & Layout Preferences (synced with settings and persisted in localStorage)
  const [epubLayout, setEpubLayout] = useState<EpubLayoutMode>(
    () => (localStorage.getItem('ls_epub_layout') as EpubLayoutMode) || 'paginated-single',
  );
  const [theme, setTheme] = useState<EpubTheme>(
    () => (localStorage.getItem('ls_epub_theme') as EpubTheme) || 'night',
  );
  const [readerFontSize, setReaderFontSize] = useState(
    () => Number(localStorage.getItem('ls_reader_font_size')) || Number(localStorage.getItem('ls_font_size')) || settings.readerFontSize || 110,
  );
  const [fontFamily, setFontFamily] = useState<EpubFontFamily>(
    () => (localStorage.getItem('ls_reader_font_family') as EpubFontFamily) || (localStorage.getItem('ls_font_family') as EpubFontFamily) || settings.readerFontFamily || 'literata',
  );
  const [lineHeight, setLineHeight] = useState(
    () => Number(localStorage.getItem('ls_line_height')) || 1.75,
  );
  const [maxWidth, setMaxWidth] = useState(
    () => Number(localStorage.getItem('ls_max_width')) || 780,
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [targetLang, setTargetLang] = useState(
    () => localStorage.getItem('ls_target_lang') || settings.targetLang || 'ka',
  );

  // Sync state if settings change elsewhere
  useEffect(() => {
    if (settings.readerFontSize && settings.readerFontSize !== readerFontSize) {
      setReaderFontSize(settings.readerFontSize);
    }
  }, [settings.readerFontSize]);

  useEffect(() => {
    if (settings.readerFontFamily && settings.readerFontFamily !== fontFamily) {
      setFontFamily(settings.readerFontFamily);
    }
  }, [settings.readerFontFamily]);

  // Handlers for persisting EPUB reading options
  const handleEpubLayoutChange = useCallback((layout: EpubLayoutMode) => {
    setEpubLayout(layout);
    localStorage.setItem('ls_epub_layout', layout);
  }, []);

  const handleThemeChange = useCallback((newTheme: EpubTheme) => {
    setTheme(newTheme);
    localStorage.setItem('ls_epub_theme', newTheme);
  }, []);

  const handleFontSizeChange = useCallback((size: number) => {
    setReaderFontSize(size);
    localStorage.setItem('ls_font_size', String(size));
    localStorage.setItem('ls_reader_font_size', String(size));
    settings.setReaderFontSize(size);
  }, [settings]);

  const handleFontFamilyChange = useCallback((family: EpubFontFamily) => {
    setFontFamily(family);
    localStorage.setItem('ls_font_family', family);
    localStorage.setItem('ls_reader_font_family', family);
    settings.setReaderFontFamily(family);
  }, [settings]);

  const handleLineHeightChange = useCallback((lh: number) => {
    setLineHeight(lh);
    localStorage.setItem('ls_line_height', String(lh));
  }, []);

  const handleMaxWidthChange = useCallback((w: number) => {
    setMaxWidth(w);
    localStorage.setItem('ls_max_width', String(w));
  }, []);

  const handleTargetLangChange = useCallback((lang: string) => {
    setTargetLang(lang);
    localStorage.setItem('ls_target_lang', lang);
    settings.setTargetLang(lang);
  }, [settings]);

  // Load EPUB blob from backend (MinIO)
  useEffect(() => {
    if (!bookId || !isEpubMode) return;
    let cancelled = false;
    setEpubLoading(true);
    getBookBlob(Number(bookId), 'epub')
      .then((blob) => {
        if (!cancelled) {
          setEpubBlob(blob);
          setEpubLoading(false);
        }
      })
      .catch((err) => {
        console.warn('EPUB fetch failed, falling back to PDF view:', err);
        if (!cancelled) {
          setEpubLoading(false);
          setIsEpubMode(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, isEpubMode]);

  // ── Native browser text selection (for PDF fallback) ──
  const {
    selectedText: pdfSelectedText,
    selectionRect,
    isWordClick,
    leftContext: pdfLeftContext,
    rightContext: pdfRightContext,
    clearSelection,
    selectWord,
  } = useClickSelection({
    containerRef: scrollContainerRef,
    wordPositionsCache,
    enabled: !isEpubMode,
  });

  // Active selection text (works for both EPUB and PDF)
  const [epubPickedText, setEpubPickedText] = useState('');
  const [epubPickedContext, setEpubPickedContext] = useState<{ left: string; right: string }>({
    left: '',
    right: '',
  });
  const activeSelectedText = isEpubMode ? epubPickedText : pdfSelectedText;

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
  const [showSidebar, setShowSidebar] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(isMobile ? 0.7 : 1.0);
  const [viewMode, setViewMode] = useState<ViewMode>('scroll');

  const effectiveSidebarVisible = isMobile ? false : showSidebar;

  const { ref: containerWidthRef, width: containerWidth } = useContainerWidth();

  // ── Word positions (backend-extracted click zones for PDF mode) ──
  const {
    getPositions: getWordPositionsForPage,
  } = useWordPositions(bookId ? Number(bookId) : null);

  useEffect(() => {
    if (isEpubMode || !numPages || !bookId) return;
    const start = Math.max(0, currentPage - 2);
    const end = Math.min(numPages, currentPage + 3);
    for (let i = start; i <= end; i++) {
      const pageIdx = i - 1;
      if (!wordPositionsCache[pageIdx] && !wordPositionsLoadingRef.current.has(pageIdx)) {
        wordPositionsLoadingRef.current.add(pageIdx);
        getWordPositionsForPage(pageIdx).then((data) => {
          wordPositionsLoadingRef.current.delete(pageIdx);
          if (data) {
            setWordPositionsCache((prev) => ({ ...prev, [pageIdx]: data }));
          }
        });
      }
    }
  }, [isEpubMode, currentPage, numPages, bookId, getWordPositionsForPage, wordPositionsCache]);

  // ── Reading progress (for PDF fallback) ──
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
    debouncedSearch,
    nextMatch,
    prevMatch,
    clearSearch,
  } = usePdfSearch(pdfDocument);

  const [showSearch, setShowSearch] = useState(false);

  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => !prev);
  }, []);

  const runSearch = useCallback(
    (q: string) => {
      debouncedSearch(q);
    },
    [debouncedSearch],
  );

  const goToMatch = useCallback(
    (direction: 'next' | 'prev') => {
      if (direction === 'next') nextMatch();
      else prevMatch();
    },
    [nextMatch, prevMatch],
  );

  const setQuery = useCallback(
    (q: string) => {
      debouncedSearch(q);
    },
    [debouncedSearch],
  );

  // Restore PDF progress when in PDF mode
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isEpubMode && numPages && numPages > 0 && !pdfLoading && !restoredRef.current) {
      restoredRef.current = true;
      scrollToSaved();
    }
  }, [isEpubMode, numPages, pdfLoading, scrollToSaved]);

  const observePageRef = useCallback(
    (pageNum: number) => (el: HTMLDivElement | null) => {
      if (el) {
        pageNumberRefs.current.set(pageNum, el);
      } else {
        pageNumberRefs.current.delete(pageNum);
      }
    },
    [],
  );

  // ── Scroll to PDF page helper ──
  const scrollTimeoutRef = useRef<number | null>(null);

  const scrollToPage = useCallback(
    (page: number) => {
      if (isEpubMode) {
        const total = epubPageInfo.total || 100;
        const frac = Math.max(0, Math.min(1, (page - 1) / total));
        epubViewerRef.current?.goToFraction(frac);
        return;
      }
      if (!numPages) return;
      const clamped = Math.max(1, Math.min(page, numPages));
      setCurrentPage(clamped);
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(() => {
        isScrollingRef.current = false;
      }, 800);

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

      const el =
        pageNumberRefs.current.get(clamped) ||
        scrollContainerRef.current?.querySelector<HTMLElement>(`[data-page-number="${clamped}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [isEpubMode, epubPageInfo.total, numPages, viewMode],
  );

  // ── Unified Prev / Next Page actions (works for both EPUB and PDF) ──
  const handlePrevPage = useCallback(() => {
    if (isEpubMode) {
      epubViewerRef.current?.prevPage();
    } else {
      scrollToPage(currentPage - 1);
    }
  }, [isEpubMode, currentPage, scrollToPage]);

  const handleNextPage = useCallback(() => {
    if (isEpubMode) {
      epubViewerRef.current?.nextPage();
    } else {
      scrollToPage(currentPage + 1);
    }
  }, [isEpubMode, currentPage, scrollToPage]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isEpubMode) {
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
          handleNextPage();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          handlePrevPage();
          break;
        case 'Home':
          e.preventDefault();
          if (isEpubMode) epubViewerRef.current?.goToFraction(0);
          else scrollToPage(1);
          break;
        case 'End':
          e.preventDefault();
          if (isEpubMode) epubViewerRef.current?.goToFraction(1);
          else scrollToPage(numPages || 1);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEpubMode, showSearch, toggleSearch, handleNextPage, handlePrevPage, scrollToPage, numPages]);

  // ── Zoom with Ctrl+Wheel (PDF mode) ──
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (isEpubMode) {
        setReaderFontSize((prev) => {
          const next = e.deltaY > 0 ? Math.max(70, prev - 10) : Math.min(180, prev + 10);
          localStorage.setItem('ls_font_size', String(next));
          return next;
        });
      } else {
        setZoomLevel((prev) => {
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
          return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
        });
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [isEpubMode]);

  // ── EPUB Text Pick Handler (stable callback so EpubViewer never re-inits) ──
  // Stages the picked word/passage and shows the "თარგმნა" button without auto-translating,
  // waiting for the user to click "თარგმნა".
  const handleEpubTextPick = useCallback(
    (pick: TextPick) => {
      const cleaned = pick.text.trim();
      if (!cleaned) {
        closeTranslation();
        setEpubPickedText('');
        setTranslateIconPos(null);
        setShowMobileTranslation(false);
        return;
      }
      closeTranslation();
      setEpubPickedText(cleaned);
      setEpubPickedContext({
        left: pick.sentence || pick.leftContext || '',
        right: pick.rightContext || '',
      });
      setSavedToVocabulary(false);
      setShowSidebar(true);

      const isMobileNow = window.innerWidth < 768 || 'ontouchstart' in window;
      if (isMobileNow) {
        // On mobile: we show a dedicated sticky floating action bar at the bottom of the screen
        // with the picked word/sentence and a big "თარგმნა" button so it never disappears on tap
        setTranslateIconPos(null);
        setShowMobileTranslation(false);
      } else {
        const rect = pick.rects?.[0];
        if (rect) {
          setTranslateIconPos({
            top: Math.max(68, rect.top - 36),
            left: Math.min(window.innerWidth - 80, Math.max(80, rect.left + rect.width / 2)),
          });
        }
      }
    },
    [closeTranslation],
  );

  // ── EPUB Relocate Handler ──
  const handleEpubRelocate = useCallback((info: EpubRelocateInfo) => {
    closeTranslation();
    epubViewerRef.current?.clearActivePick();
    setTranslateIconPos(null);
    setEpubPickedText('');
    setShowMobileTranslation(false);
    setEpubFraction(info.fraction);
    setEpubPageInfo({ current: info.currentPage, total: info.totalPages });
    if (info.chapterTitle) {
      setEpubChapterTitle(info.chapterTitle);
    }
  }, [closeTranslation]);

  // ── Auto-clear translation panel on new PDF selection ──
  useEffect(() => {
    if (!isEpubMode && pdfSelectedText) {
      closeTranslation();
      setSavedToVocabulary(false);
    }
  }, [isEpubMode, pdfSelectedText, closeTranslation]);

  // ── Floating translate icon position (PDF mode) ──
  useEffect(() => {
    if (isEpubMode) return;
    if (selectionRect && pdfSelectedText) {
      setTranslateIconPos({
        top: selectionRect.top - 48,
        left: selectionRect.left + selectionRect.width / 2,
      });
    } else {
      setTranslateIconPos(null);
    }
  }, [isEpubMode, selectionRect, pdfSelectedText]);

  // ── Callbacks ──
  const handleTranslate = useCallback(() => {
    setTranslateIconPos(null);
    if (isEpubMode) {
      if (epubPickedText) {
        const isSingleWord = epubPickedText.split(/\s+/).length <= 1;
        translate(
          epubPickedText,
          isSingleWord,
          epubPickedContext.left,
          epubPickedContext.right,
        );
        if (isMobile) {
          setShowMobileTranslation(true);
        }
      }
    } else {
      translate(pdfSelectedText, isWordClick, pdfLeftContext, pdfRightContext);
    }
  }, [
    isEpubMode,
    epubPickedText,
    epubPickedContext,
    translate,
    isMobile,
    pdfSelectedText,
    isWordClick,
    pdfLeftContext,
    pdfRightContext,
  ]);

  const handleCloseTranslation = useCallback(() => {
    closeTranslation();
    clearSelection();
    epubViewerRef.current?.clearActivePick();
    setEpubPickedText('');
    setTranslateIconPos(null);
    setSavedToVocabulary(false);
    setShowMobileTranslation(false);
  }, [closeTranslation, clearSelection]);

  // ── Dismiss open translation / action bar when clicking outside on main document ──
  const floatingUiRef = useRef<HTMLDivElement>(null);
  const hasActiveTranslation = Boolean(activeSelectedText || translationResult || wordResult || translating);
  useEffect(() => {
    if (!hasActiveTranslation && !showMobileTranslation) return;
    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (floatingUiRef.current?.contains(target)) return;
      if (target.closest('header')) return;
      if (target.closest('foliate-view')) return;
      handleCloseTranslation();
    };
    window.addEventListener('pointerdown', onPointerDownOutside);
    return () => window.removeEventListener('pointerdown', onPointerDownOutside);
  }, [hasActiveTranslation, showMobileTranslation, handleCloseTranslation]);

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

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'night' ? 'sepia' : prev === 'sepia' ? 'light' : 'night';
      localStorage.setItem('ls_epub_theme', next);
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => setShowSidebar((prev) => !prev), []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleBack = useCallback(() => navigate('/library'), [navigate]);

  const handleNavToPage = useCallback(
    (page: number) => {
      scrollToPage(page);
    },
    [scrollToPage],
  );

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false);
    clearSearch();
    document.querySelectorAll('.search-highlight').forEach((el) => {
      el.classList.remove('search-highlight');
    });
  }, [clearSearch]);

  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = useCallback(() => {
    if (isEpubMode) return;
    clearSelection();
    setTranslateIconPos(null);

    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll > 0) {
      const pct = (container.scrollTop / maxScroll) * 100;
      setScrollProgress(Math.min(100, Math.max(0, pct)));
    }

    const renderedPages = container.querySelectorAll<HTMLElement>('[data-page-number]');
    if (renderedPages.length > 0) {
      const cTop = container.scrollTop;
      let activeP = 1;
      const threshold = cTop + 150;
      for (let i = 0; i < renderedPages.length; i++) {
        const pageEl = renderedPages[i];
        const pageTop = pageEl.offsetTop;
        const pageNum = Number(pageEl.dataset.pageNumber);
        if (pageTop <= threshold) {
          activeP = pageNum;
        } else {
          break;
        }
      }

      if (activeP > 0) {
        setCurrentPage((prev) => {
          if (prev !== activeP) {
            if (numPages) saveProgress(activeP, (activeP / numPages) * 100);
            return activeP;
          }
          return prev;
        });
      }
    }
  }, [isEpubMode, clearSelection, numPages, saveProgress]);

  // ── Compute page dimensions & progress ──
  const pageWidth =
    viewMode === 'spread'
      ? Math.min(containerWidth * 0.45 * zoomLevel, 600)
      : Math.min(containerWidth, isMobile ? 1000 : 800) * zoomLevel;

  const progressPercent = isEpubMode
    ? epubFraction * 100
    : viewMode === 'scroll' && scrollProgress > 0
      ? scrollProgress
      : numPages
        ? (currentPage / numPages) * 100
        : 0;

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

  const searchState = {
    query,
    matches,
    totalResults,
    currentMatchIndex,
    searching,
    error: searchError,
  };

  const handleLoupeWordSelected = useCallback(
    (word: string, pageX: number, pageY: number) => {
      const elements = document.elementsFromPoint(pageX, pageY);
      const pageEl = elements.find((el) => el.closest('[data-page-number]'))?.closest('[data-page-number]') as
        | HTMLElement
        | undefined;
      const pageIndex = pageEl ? Number(pageEl.dataset.pageNumber) - 1 : 0;

      selectWord(word, pageIndex, pageX, pageY);
      translate(word, true, '', '');
      setTranslateIconPos(null);
      setShowMobileTranslation(true);
    },
    [translate, selectWord],
  );

  // ── PDF Render functions ──
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
        style={
          isMobile
            ? {
                overflow: 'visible',
                width: viewMode === 'spread' ? `${pageWidth}px` : 'fit-content',
                maxWidth: 'calc(100vw - 32px)',
                marginBottom: viewMode === 'single' ? '0' : `${PAGE_GAP}px`,
              }
            : {
                overflow: 'hidden',
                width: viewMode === 'spread' ? `${pageWidth}px` : 'fit-content',
                maxWidth: `calc(100vw - ${effectiveSidebarVisible ? 384 + 96 + 60 : 96 + 60}px)`,
                marginBottom: viewMode === 'single' ? '0' : `${PAGE_GAP}px`,
              }
        }
      >
        <PageRenderer pdf={pdfDocument} pageIndex={pageNum - 1} width={pageWidth} />
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
          <div key={`single_${p}`}>{renderPage(p)}</div>
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
      <div ref={spreadContainerRef} className="flex flex-col items-center justify-center min-h-full py-4">
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

  if (!isEpubMode && pdfLoading && !pdfDocument) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <LoadingSpinner message={t.readerLoadingPdf} />
      </div>
    );
  }

  if (!isEpubMode && pdfError) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">{pdfError}</p>
          <button
            onClick={() => navigate('/library')}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            {t.readerBackToLibrary}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-[100dvh] overflow-hidden flex flex-col ${theme === 'sepia' ? 'theme-sepia' : 'theme-night'}`}>
      <ReaderHeader
        title={pdfBook?.title || t.readerDefaultTitle}
        chapterTitle={epubChapterTitle}
        currentPage={isEpubMode ? epubPageInfo.current : currentPage}
        numPages={isEpubMode ? epubPageInfo.total : numPages}
        theme={theme}
        showSidebar={effectiveSidebarVisible}
        zoomLevel={zoomLevel}
        viewMode={viewMode}
        progressPercent={progressPercent}
        isMobile={isMobile}
        isEpubMode={isEpubMode}
        epubLayout={epubLayout}
        fontSize={readerFontSize}
        fontFamily={fontFamily}
        lineHeight={lineHeight}
        maxWidth={maxWidth}
        toc={epubToc}
        onToggleEpubMode={() => setIsEpubMode((v) => !v)}
        onEpubLayoutChange={handleEpubLayoutChange}
        onThemeChange={handleThemeChange}
        onFontSizeChange={handleFontSizeChange}
        onFontFamilyChange={handleFontFamilyChange}
        onLineHeightChange={handleLineHeightChange}
        onMaxWidthChange={handleMaxWidthChange}
        onSelectTocItem={(href) => epubViewerRef.current?.goToHref(href)}
        onToggleTheme={toggleTheme}
        onToggleSidebar={toggleSidebar}
        onBack={handleBack}
        onLogout={handleLogout}
        onJumpToPage={scrollToPage}
        onZoomChange={setZoomLevel}
        onViewModeChange={setViewMode}
        onToggleSearch={toggleSearch}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Thumbnail sidebar — only in PDF mode on desktop */}
        {!isMobile && !isEpubMode && (
          <ThumbnailSidebar
            pdf={pdfDocument}
            totalPages={numPages || 0}
            currentPage={currentPage}
            onPageClick={scrollToPage}
            visible={!showSidebar}
          />
        )}

        {/* Main Reader Area */}
        <div
          ref={(node) => {
            scrollContainerRef.current = node;
            progressContainerRef.current = node;
            containerWidthRef.current = node;
          }}
          className={`flex-1 relative ${isEpubMode ? 'overflow-hidden flex flex-col' : 'overflow-y-auto overflow-x-hidden'}`}
          onScroll={handleScroll}
        >
          {isEpubMode ? (
            /* ── EPUB READER (Primary Mode) ── */
            <div className="w-full h-full flex-1 relative">
              {epubLoading && !epubBlob ? (
                <div className="w-full h-full flex items-center justify-center bg-[#141518]">
                  <LoadingSpinner message={t.readerPreparingEpub} light />
                </div>
              ) : (
                <EpubViewer
                  ref={epubViewerRef}
                  bookId={bookId}
                  bookBlob={epubBlob}
                  fontSize={readerFontSize}
                  theme={theme}
                  fontFamily={fontFamily}
                  lineHeight={lineHeight}
                  layoutMode={epubLayout}
                  maxWidth={maxWidth}
                  onTextPick={handleEpubTextPick}
                  onRelocate={handleEpubRelocate}
                  onTocLoaded={setEpubToc}
                />
              )}

              {/* Left / Right Subtle Page Turn Buttons for Paginated EPUB Mode */}
              {epubLayout !== 'scrolled' && !isMobile && (
                <>
                  <button
                    onClick={handlePrevPage}
                    className="fixed left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/25 hover:bg-purple-600/80 text-white/50 hover:text-white border border-white/10 backdrop-blur-md transition-all hover:scale-110 shadow-lg"
                    title={t.readerPrevPage}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleNextPage}
                    className="fixed right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/25 hover:bg-purple-600/80 text-white/50 hover:text-white border border-white/10 backdrop-blur-md transition-all hover:scale-110 shadow-lg"
                    title={t.readerNextPage}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            /* ── ORIGINAL PDF VIEWER (Fallback Mode) ── */
            <>
              {(viewMode === 'single' || viewMode === 'spread') && (
                <div className="fixed inset-0 bg-black/40 pointer-events-none z-0" />
              )}

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
                      <p className="opacity-50 mb-4">{t.readerNoPages}</p>
                    </div>
                  </div>
                )}
              </div>

              <MobileLoupe
                containerRef={scrollContainerRef}
                onWordSelected={handleLoupeWordSelected}
                getWordAtPoint={(vpX, vpY) => {
                  const elements = document.elementsFromPoint(vpX, vpY);
                  const pageEl = elements.find((el) => el.closest('[data-page-number]'))?.closest('[data-page-number]') as
                    | HTMLElement
                    | undefined;
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
            </>
          )}

          {/* Floating page/progress navigation (bottom-right) */}
          <div
            className="fixed right-4 z-30 flex items-center gap-2 select-none"
            style={{ bottom: 'max(14px, calc(env(safe-area-inset-bottom) + 6px))' }}
          >
            <div className="glass rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs shadow-xl border border-white/10">
              <span className="text-white/80 tabular-nums font-medium">
                {isEpubMode
                  ? `${Math.round(progressPercent)}%`
                  : `${currentPage} / ${numPages || '?'}`}
              </span>
              <button
                onClick={handlePrevPage}
                disabled={!isEpubMode && (!numPages || currentPage <= 1)}
                className="p-1 rounded-lg hover:bg-white/15 disabled:opacity-30 transition-colors"
                title={t.readerPrevPage}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleNextPage}
                disabled={!isEpubMode && (!numPages || currentPage >= numPages)}
                className="p-1 rounded-lg hover:bg-white/15 disabled:opacity-30 transition-colors"
                title={t.readerNextPage}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Word Highlight Overlay on top of PDF */}
        {!isEpubMode && isWordClick && selectionRect && pdfSelectedText && (
          <div
            className="fixed z-30 pointer-events-none rounded transition-all duration-150"
            style={{
              top: `${selectionRect.top}px`,
              left: `${selectionRect.left}px`,
              width: `${selectionRect.width}px`,
              height: `${selectionRect.height}px`,
              backgroundColor: 'rgba(168, 85, 247, 0.4)',
              boxShadow: '0 0 0 2px rgba(168, 85, 247, 0.6)',
            }}
          />
        )}

        {/* Floating / Mobile Translation Overlays Container */}
        <div ref={floatingUiRef}>
          {/* Floating Translate Button right at the selected word/phrase (Desktop) */}
          {translateIconPos && activeSelectedText && !translationResult && !wordResult && !translating && (
            <button
              onClick={handleTranslate}
              className="fixed z-50 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xl shadow-purple-900/40 border border-purple-400/30 flex items-center gap-1.5 transition-all duration-150 hover:scale-105 cursor-pointer"
              style={{
                top: `${translateIconPos.top}px`,
                left: `${translateIconPos.left}px`,
                transform: 'translate(-50%, -50%)',
              }}
              title={t.readerTranslateBtn}
            >
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
              <span>{t.readerTranslateBtn}</span>
            </button>
          )}

          {/* Mobile Floating "თარგმნა" Action Bar (appears when tapping a word or selecting a sentence) */}
          {isMobile && activeSelectedText && !showMobileTranslation && !translationResult && !wordResult && !translating && (
            <div
              className="fixed inset-x-3 z-50 animate-fadeIn flex items-center justify-between gap-2.5 bg-gray-900/95 backdrop-blur-xl border border-purple-500/40 rounded-2xl px-3.5 py-2.5 shadow-2xl shadow-black/70"
              style={{ bottom: 'max(14px, calc(env(safe-area-inset-bottom) + 6px))' }}
            >
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold block">
                  {activeSelectedText.split(/\s+/).length > 1 ? t.readerSelectedSentence : t.readerSelectedWord}
                </span>
                <p className="text-xs sm:text-sm text-white font-medium truncate">
                  "{activeSelectedText}"
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={handleTranslate}
                  className="px-4 py-2 rounded-xl bg-purple-600 active:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/40 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  <span>{t.readerTranslateBtn}</span>
                </button>
                <button
                  onClick={handleCloseTranslation}
                  className="p-2 rounded-xl bg-white/5 active:bg-white/15 text-white/60"
                  title={t.close}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Desktop Floating Translation Widget (Right Side) */}
          {!isMobile && showSidebar && hasActiveTranslation && (
            <div className="fixed right-6 top-20 z-40 max-h-[80vh] overflow-y-auto">
              <TranslationPanel
                selectedText={activeSelectedText}
                translationResult={translationResult}
                wordResult={wordResult}
                translationError={translationError}
                translating={translating}
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
            <div className="fixed inset-x-0 bottom-0 z-50 animate-slideUp">
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-[2px] mobile-bottom-sheet-backdrop"
                onClick={handleCloseTranslation}
              />

              <div className="relative bg-gray-900/95 backdrop-blur-xl rounded-t-3xl border-t border-white/15 shadow-2xl max-h-[78dvh] overflow-y-auto mobile-bottom-sheet pb-[max(16px,env(safe-area-inset-bottom))]">
                <div className="sticky top-0 z-10 bg-gray-900/95 pt-2.5 pb-2 px-4 flex flex-col items-center border-b border-white/10">
                  <div className="w-10 h-1 rounded-full bg-white/20 mb-2" />
                  <div className="w-full flex items-center justify-between">
                    <span className="text-xs font-bold opacity-80 uppercase tracking-wider text-purple-300">
                      {wordResult || translationResult ? t.readerTranslation : t.readerSelectedText}
                    </span>
                    <button
                      onClick={handleCloseTranslation}
                      className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 transition-colors"
                      title={t.close}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="p-3 sm:p-4 flex justify-center">
                  <TranslationPanel
                    selectedText={activeSelectedText}
                    translationResult={translationResult}
                    wordResult={wordResult}
                    translationError={translationError}
                    translating={translating}
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

      {/* Reader Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        provider={provider || settings.translationEngine}
        onProviderChange={(p) => {
          setProvider(p);
          settings.setTranslationEngine(p);
        }}
        targetLang={targetLang || settings.targetLang}
        onTargetLangChange={handleTargetLangChange}
        fontSize={readerFontSize}
        onFontSizeChange={handleFontSizeChange}
      />
    </div>
  );
}
