import { useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY_PREFIX = 'lingostream_progress_';

interface ReadingProgress {
  lastPage: number;
  scrollPercent: number;
  totalPages: number;
}

export function useReadingProgress(
  bookId: string | undefined,
  numPages: number | null,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<ReadingProgress>({ lastPage: 1, scrollPercent: 0, totalPages: 0 });

  /** Save progress to localStorage on scroll */
  const saveProgress = useCallback((page: number, percent: number) => {
    if (!bookId || !numPages) return;
    const data: ReadingProgress = { lastPage: page, scrollPercent: percent, totalPages: numPages };
    progressRef.current = data;
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${bookId}`, JSON.stringify(data));
    } catch {
      // localStorage full or unavailable — ignore
    }
  }, [bookId, numPages]);

  /** Load saved progress from localStorage */
  const loadProgress = useCallback((): ReadingProgress | null => {
    if (!bookId) return null;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${bookId}`);
      if (raw) return JSON.parse(raw) as ReadingProgress;
    } catch {
      // ignore
    }
    return null;
  }, [bookId]);

  /** Scroll to saved progress position */
  const scrollToSaved = useCallback(() => {
    const saved = loadProgress();
    if (!saved || !containerRef.current) return;

    const container = containerRef.current;
    if (saved.lastPage > 1) {
      // Try to find the page element
      const pageEl = container.querySelector(`[data-page-number="${saved.lastPage}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // Fallback: scroll by percentage
        container.scrollTop = (container.scrollHeight - container.clientHeight) * (saved.scrollPercent / 100);
      }
    }
  }, [loadProgress]);

  return {
    containerRef,
    saveProgress,
    loadProgress,
    scrollToSaved,
    progressRef,
  };
}