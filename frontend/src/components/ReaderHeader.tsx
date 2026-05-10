import { useState, useCallback, useRef } from 'react';

export type Theme = 'sepia' | 'night';
export type ViewMode = 'scroll' | 'single' | 'spread';

interface ReaderHeaderProps {
  title: string | undefined;
  currentPage: number;
  numPages: number | null;
  theme: Theme;
  showSidebar: boolean;
  zoomLevel: number;
  viewMode: ViewMode;
  progressPercent: number;
  isMobile?: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onBack: () => void;
  onLogout: () => void;
  onJumpToPage: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSearch: () => void;
}

export default function ReaderHeader({
  title,
  currentPage,
  numPages,
  theme,
  showSidebar,
  zoomLevel,
  viewMode,
  progressPercent,
  isMobile,
  onToggleTheme,
  onToggleSidebar,
  onBack,
  onLogout,
  onJumpToPage,
  onZoomChange,
  onViewModeChange,
  onToggleSearch,
}: ReaderHeaderProps) {
  const [pageInput, setPageInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleJump = useCallback(() => {
    const page = parseInt(pageInput, 10);
    if (page >= 1 && numPages && page <= numPages) {
      onJumpToPage(page);
    }
    setPageInput('');
    inputRef.current?.blur();
  }, [pageInput, numPages, onJumpToPage]);

  const handlePageKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJump();
    if (e.key === 'Escape') {
      setPageInput('');
      inputRef.current?.blur();
    }
  }, [handleJump]);

  const viewModeIcons: Record<ViewMode, string> = {
    scroll: '≡',
    single: '☰',
    spread: '∥',
  };

  return (
    <header className={`flex-shrink-0 glass border-b border-white/10 flex flex-col ${isMobile ? 'px-2 h-12' : 'px-3 h-14'}`}>
      {/* Main row */}
      <div className={`flex items-center justify-between ${isMobile ? 'h-12' : 'h-14'}`}>
        {/* Left */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0"
            title="Back to Library"
          >
            <svg className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className={`font-medium truncate ${isMobile ? 'text-xs max-w-[80px]' : 'text-sm max-w-[120px] sm:max-w-md'}`}>
            {title || 'Reading'}
          </h1>
          {numPages && (
            <span className={`opacity-40 flex-shrink-0 ${isMobile ? 'text-[10px]' : 'text-xs hidden sm:inline'}`}>
              {currentPage}/{numPages}
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1">
          {/* Jump to page — desktop only */}
          {!isMobile && (
            <div className="hidden sm:flex items-center gap-1">
              <input
                ref={inputRef}
                type="number"
                min={1}
                max={numPages || 1}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={handlePageKeyDown}
                placeholder="Page #"
                className="w-16 px-2 py-1 rounded text-xs bg-white/10 border border-white/20
                  text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500
                  transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                  [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={handleJump}
                className="px-2 py-1 text-xs rounded-lg bg-purple-600/50 hover:bg-purple-600/80
                  transition-colors"
              >
                Go
              </button>
            </div>
          )}

          {/* Search */}
          <button
            onClick={onToggleSearch}
            className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
            title="Search in document (Ctrl+F)"
          >
            <svg className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* View mode */}
          <button
            onClick={() => {
              const modes: ViewMode[] = ['scroll', 'single', 'spread'];
              const idx = (modes.indexOf(viewMode) + 1) % modes.length;
              onViewModeChange(modes[idx]);
            }}
            className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
            title={`View mode: ${viewMode}`}
          >
            <span className={`font-mono ${isMobile ? 'text-xs' : 'text-sm'}`}>{viewModeIcons[viewMode]}</span>
          </button>

          {/* Zoom controls — hide on mobile */}
          {!isMobile && (
            <>
              <button
                onClick={() => onZoomChange(Math.max(0.5, zoomLevel - 0.1))}
                className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
                title="Zoom out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>

              <span className="text-xs text-white/50 w-8 text-center tabular-nums">
                {Math.round(zoomLevel * 100)}%
              </span>

              <button
                onClick={() => onZoomChange(Math.min(3.0, zoomLevel + 0.1))}
                className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
                title="Zoom in"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              <button
                onClick={() => onZoomChange(1)}
                className="px-2 py-1 text-[10px] rounded-lg hover:bg-white/10 transition-colors hidden sm:block"
                title="Reset zoom to 100%"
              >
                Fit
              </button>
            </>
          )}

          {/* Theme — hide on mobile, use system default */}
          {!isMobile && (
            <button
              onClick={onToggleTheme}
              className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
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
          )}

          {/* Sign Out — icon only on mobile */}
          <button
            onClick={onLogout}
            className={`rounded-xl hover:bg-white/10 transition-colors ${isMobile ? 'p-1.5' : 'px-3 py-1.5 text-xs border border-white/15'}`}
            title="Sign Out"
          >
            {isMobile ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            ) : (
              'Sign Out'
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {numPages && numPages > 0 && (
        <div className="h-0.5 bg-white/5 -mx-3">
          <div
            className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
      )}
    </header>
  );
}