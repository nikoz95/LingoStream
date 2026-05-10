/**
 * useWordPositions — fetches and caches word-level bounding box positions
 * from the backend for each page of a PDF book.
 *
 * Backend extracts these via PyMuPDF during lazy parsing. The frontend
 * uses these coordinates to place transparent click zones over each word
 * in the PDF.js rendered page.
 *
 * Cache is kept in a Map<pageIndex, WordPositionsPageResponse> so that
 * scrolling back and forth does not re-fetch.
 */
import { useState, useCallback, useRef } from 'react';
import {
  getWordPositions,
  getBookPageCount,
  type WordPositionsPageResponse,
  type PageCountResponse,
} from '../lib/api';

interface UseWordPositionsReturn {
  /** Cached positions for a given page — fetches if not cached yet */
  getPositions: (pageIndex: number) => Promise<WordPositionsPageResponse | null>;
  /** Total page count for the book */
  pageCount: number | null;
  /** Loading flag for any ongoing fetch */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Pre-load positions for a range of pages (e.g. visible + buffer) */
  preloadRange: (start: number, end: number) => Promise<void>;
  /** Clear all cached positions */
  clearCache: () => void;
}

export function useWordPositions(bookId: number | null): UseWordPositionsReturn {
  const cacheRef = useRef<Map<number, WordPositionsPageResponse>>(new Map());
  const pendingRef = useRef<Set<number>>(new Set());
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPositions = useCallback(async (pageIndex: number): Promise<WordPositionsPageResponse | null> => {
    if (!bookId) return null;

    // Check cache first
    const cached = cacheRef.current.get(pageIndex);
    if (cached) return cached;

    // Prevent duplicate concurrent requests for the same page
    if (pendingRef.current.has(pageIndex)) {
      // Wait briefly for the other request to finish
      await new Promise((r) => setTimeout(r, 300));
      const retry = cacheRef.current.get(pageIndex);
      if (retry) return retry;
    }

    pendingRef.current.add(pageIndex);
    setLoading(true);
    setError(null);

    try {
      const data = await getWordPositions(bookId, pageIndex);
      cacheRef.current.set(pageIndex, data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to load word positions');
      return null;
    } finally {
      pendingRef.current.delete(pageIndex);
      setLoading(false);
    }
  }, [bookId]);

  const fetchPageCount = useCallback(async () => {
    if (!bookId) return;
    try {
      const data: PageCountResponse = await getBookPageCount(bookId);
      setPageCount(data.total_pages);
    } catch (err: any) {
      setError(err.message || 'Failed to load page count');
    }
  }, [bookId]);

  const preloadRange = useCallback(async (start: number, end: number) => {
    if (!bookId) return;
    const promises = [];
    for (let i = start; i <= end; i++) {
      if (!cacheRef.current.has(i) && !pendingRef.current.has(i)) {
        promises.push(getPositions(i));
      }
    }
    await Promise.allSettled(promises);
  }, [bookId, getPositions]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  // Fetch page count on mount if bookId available
  if (bookId && pageCount === null && !loading) {
    fetchPageCount();
  }

  return {
    getPositions,
    pageCount,
    loading,
    error,
    preloadRange,
    clearCache,
  };
}