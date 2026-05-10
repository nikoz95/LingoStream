import { useCallback, useEffect, useRef } from 'react';
import type { PdfSearchState } from '../hooks/usePdfSearch';

interface SearchPanelProps {
  query: string;
  searchState: PdfSearchState | null;
  showSearch: boolean;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  onGoToMatch: (direction: 'next' | 'prev') => void;
  onClose: () => void;
  onNavToPage: (page: number) => void;
}

export default function SearchPanel({
  query,
  searchState,
  showSearch,
  onQueryChange,
  onSearch,
  onGoToMatch,
  onClose,
  onNavToPage,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showSearch]);

  // Keyboard: Enter for search/next, Shift+Enter for prev, Esc to close
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onGoToMatch('prev');
      } else if (query.trim()) {
        if (searchState && searchState.totalResults > 0) {
          onGoToMatch('next');
        } else {
          onSearch(query);
        }
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [query, searchState, onSearch, onGoToMatch, onClose]);

  // Debounced search on input change
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onQueryChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim()) {
      debounceRef.current = setTimeout(() => onSearch(val), 400);
    } else {
      // Clear search when input is empty
      onSearch('');
    }
  }, [onQueryChange, onSearch]);

  const handleClickMatch = useCallback((page: number) => {
    onNavToPage(page);
  }, [onNavToPage]);

  if (!showSearch) return null;

  const currentMatch = searchState?.currentMatchIndex ?? -1;
  const totalMatches = searchState?.totalResults ?? 0;
  const matches = searchState?.matches ?? [];

  // Group matches by page for display
  const matchesByPage = new Map<number, { pageIndex: number; texts: string[] }>();
  for (const m of matches) {
    if (!matchesByPage.has(m.pageIndex)) {
      matchesByPage.set(m.pageIndex, { pageIndex: m.pageIndex, texts: [] });
    }
    matchesByPage.get(m.pageIndex)!.texts.push(m.text);
  }

  return (
    <div className="absolute right-0 top-14 z-50 w-80 lg:w-96 max-h-[calc(100vh-4rem)]
      bg-gray-900/95 backdrop-blur-xl border-l border-white/10
      flex flex-col shadow-2xl">
      {/* Search input */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search in document…"
            className="w-full px-3 py-2 pr-8 rounded-lg text-sm
              bg-white/10 border border-white/20 text-white
              placeholder:text-white/30 focus:outline-none focus:border-purple-500
              transition-colors"
          />
          <button
            onClick={onClose}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5
              text-white/40 hover:text-white/80 transition-colors"
            title="Close search (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Searching indicator */}
        {searchState?.searching && (
          <p className="mt-2 text-xs text-white/40 italic">Searching…</p>
        )}

        {/* Error */}
        {searchState?.error && (
          <p className="mt-2 text-xs text-red-400">{searchState.error}</p>
        )}

        {/* Match counter & navigation */}
        {!searchState?.searching && totalMatches > 0 && (
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-white/50">
              {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-white/70 mr-1">
                {currentMatch + 1} / {totalMatches}
              </span>
              <button
                onClick={() => onGoToMatch('prev')}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Previous match (Shift+Enter)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={() => onGoToMatch('next')}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Next match (Enter)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* No results */}
        {!searchState?.searching && query.trim() && totalMatches === 0 && (
          <p className="mt-2 text-xs text-white/40">No results found</p>
        )}
      </div>

      {/* Results list — grouped by page */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto">
        {Array.from(matchesByPage.entries()).map(([pageIdx, group]) => (
          <div
            key={`page-group-${pageIdx}`}
            onClick={() => handleClickMatch(pageIdx)}
            className={`px-3 py-2.5 cursor-pointer border-b border-white/5 
              transition-colors text-sm
              ${matches.some(m => m.pageIndex === pageIdx)
                ? 'hover:bg-white/5'
                : ''}`}
          >
            <span className="text-[11px] font-medium text-purple-400 block mb-1">
              Page {pageIdx}
            </span>
            <span className="text-white/50 text-xs leading-relaxed line-clamp-2">
              {group.texts.slice(0, 3).join(' … ')}
              {group.texts.length > 3 && ' …'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}