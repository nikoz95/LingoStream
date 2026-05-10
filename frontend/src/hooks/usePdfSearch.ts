/**
 * Hook: Client-side PDF text search using pdfjs-dist textContent.
 * Replaces the old backend-based search.
 */
import { useState, useCallback, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface SearchMatch {
  pageIndex: number; // 1-based
  text: string;
  // We'll store the match index on the page for highlighting
}

export interface PdfSearchState {
  query: string;
  matches: SearchMatch[];
  totalResults: number;
  currentMatchIndex: number;
  searching: boolean;
  error: string | null;
}

export function usePdfSearch(pdfDocument: PDFDocumentProxy | null) {
  const [state, setState] = useState<PdfSearchState>({
    query: '',
    matches: [],
    totalResults: 0,
    currentMatchIndex: 0,
    searching: false,
    error: null,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setState({
        query: '',
        matches: [],
        totalResults: 0,
        currentMatchIndex: 0,
        searching: false,
        error: null,
      });
      return;
    }

    if (!pdfDocument) return;

    setState(prev => ({ ...prev, query: trimmed, searching: true, error: null }));

    try {
      const allMatches: SearchMatch[] = [];
      const numPages = pdfDocument.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map((item: any) => item.str).join(' ');

        // Simple case-insensitive search
        const lowerQuery = trimmed.toLowerCase();
        const lowerText = fullText.toLowerCase();
        let idx = 0;
        while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
          allMatches.push({
            pageIndex: pageNum,
            text: fullText.substring(idx, idx + trimmed.length),
          });
          idx += 1;
        }
      }

      setState({
        query: trimmed,
        matches: allMatches,
        totalResults: allMatches.length,
        currentMatchIndex: 0,
        searching: false,
        error: null,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        searching: false,
        error: err instanceof Error ? err.message : 'Search failed',
      }));
    }
  }, [pdfDocument]);

  const debouncedSearch = useCallback((q: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      search(q);
    }, 400);
  }, [search]);

  const nextMatch = useCallback(() => {
    setState(prev => {
      if (prev.totalResults === 0) return prev;
      const next = (prev.currentMatchIndex + 1) % prev.totalResults;
      return { ...prev, currentMatchIndex: next };
    });
  }, []);

  const prevMatch = useCallback(() => {
    setState(prev => {
      if (prev.totalResults === 0) return prev;
      const prevIdx = (prev.currentMatchIndex - 1 + prev.totalResults) % prev.totalResults;
      return { ...prev, currentMatchIndex: prevIdx };
    });
  }, []);

  const clearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setState({
      query: '',
      matches: [],
      totalResults: 0,
      currentMatchIndex: 0,
      searching: false,
      error: null,
    });
  }, []);

  const currentMatch = state.matches[state.currentMatchIndex] || null;

  return {
    ...state,
    currentMatch,
    search,
    debouncedSearch,
    nextMatch,
    prevMatch,
    clearSearch,
  };
}