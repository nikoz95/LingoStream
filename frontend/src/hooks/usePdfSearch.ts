import { useState, useCallback, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface SearchMatch {
  pageIndex: number;       // 0-based
  pageNumber: number;      // 1-based
  text: string;
  matchIndex: number;      // index within page's text content
}

export interface SearchResult {
  matches: SearchMatch[];
  currentMatchIndex: number;
  totalMatches: number;
}

export function usePdfSearch(pdfDoc: PDFDocumentProxy | null) {
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const pageTextCache = useRef<Map<number, string>>(new Map());

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResult(null);
    setShowSearch(false);
    pageTextCache.current.clear();
  }, []);

  const runSearch = useCallback(async (searchQuery: string) => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchResult(null);
      return;
    }

    const q = searchQuery.toLowerCase();
    const matches: SearchMatch[] = [];
    const totalPages = pdfDoc.numPages;

    for (let i = 1; i <= totalPages; i++) {
      let pageText = pageTextCache.current.get(i);
      if (!pageText) {
        try {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          pageText = content.items.map((item: any) => item.str).join(' ');
          pageTextCache.current.set(i, pageText);
        } catch {
          continue;
        }
      }

      // Find all occurrences in this page
      let idx = 0;
      let matchIdx = 0;
      const lowerPageText = pageText.toLowerCase();
      let pos = lowerPageText.indexOf(q, idx);
      while (pos !== -1) {
        const start = Math.max(0, pos - 20);
        const end = Math.min(pageText.length, pos + q.length + 40);
        const contextText = (pos > 0 ? '…' : '') +
          pageText.slice(start, end) +
          (end < pageText.length ? '…' : '');

        matches.push({
          pageIndex: i - 1,
          pageNumber: i,
          text: contextText,
          matchIndex: matchIdx++,
        });
        pos = lowerPageText.indexOf(q, pos + 1);
      }
    }

    setQuery(searchQuery);
    setSearchResult({
      matches,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
      totalMatches: matches.length,
    });
  }, [pdfDoc]);

  const goToMatch = useCallback((direction: 'next' | 'prev') => {
    if (!searchResult || searchResult.totalMatches === 0) return searchResult;

    let newIndex = searchResult.currentMatchIndex;
    if (direction === 'next') {
      newIndex = (newIndex + 1) % searchResult.totalMatches;
    } else {
      newIndex = (newIndex - 1 + searchResult.totalMatches) % searchResult.totalMatches;
    }

    const newResult = { ...searchResult, currentMatchIndex: newIndex };
    setSearchResult(newResult);
    return newResult;
  }, [searchResult]);

  const setCurrentMatchByPage = useCallback((page: number) => {
    if (!searchResult || searchResult.totalMatches === 0) return;
    const idx = searchResult.matches.findIndex(m => m.pageNumber === page);
    if (idx !== -1) {
      const newResult = { ...searchResult, currentMatchIndex: idx };
      setSearchResult(newResult);
    }
  }, [searchResult]);

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => {
      if (prev) {
        setQuery('');
        setSearchResult(null);
      }
      return !prev;
    });
  }, []);

  return {
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
  };
}