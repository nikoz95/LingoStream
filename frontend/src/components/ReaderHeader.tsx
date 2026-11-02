import { useState, useCallback, useRef, useEffect } from 'react';
import type { EpubFontFamily, EpubLayoutMode, EpubTheme } from '../lib/reader/EpubEngine';
import type { TocItem } from '../lib/reader/types';

export type Theme = EpubTheme;
export type ViewMode = 'scroll' | 'single' | 'spread';

interface ReaderHeaderProps {
  title: string | undefined;
  chapterTitle?: string;
  currentPage: number;
  numPages: number | null;
  theme: Theme;
  showSidebar: boolean;
  zoomLevel: number;
  viewMode: ViewMode;
  progressPercent: number;
  isMobile?: boolean;
  isEpubMode?: boolean;
  epubLayout?: EpubLayoutMode;
  fontSize?: number;
  fontFamily?: EpubFontFamily;
  lineHeight?: number;
  maxWidth?: number;
  toc?: TocItem[];
  onToggleEpubMode?: () => void;
  onEpubLayoutChange?: (layout: EpubLayoutMode) => void;
  onThemeChange?: (theme: Theme) => void;
  onFontSizeChange?: (size: number) => void;
  onFontFamilyChange?: (family: EpubFontFamily) => void;
  onLineHeightChange?: (lh: number) => void;
  onMaxWidthChange?: (w: number) => void;
  onSelectTocItem?: (href: string) => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onBack: () => void;
  onLogout: () => void;
  onJumpToPage: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSearch: () => void;
  onOpenSettings: () => void;
}

export default function ReaderHeader({
  title,
  chapterTitle,
  currentPage,
  numPages,
  theme,
  showSidebar,
  zoomLevel,
  progressPercent,
  isMobile,
  isEpubMode = true,
  epubLayout = 'paginated-single',
  fontSize = 110,
  fontFamily = 'literata',
  lineHeight = 1.75,
  maxWidth = 760,
  toc = [],
  onToggleEpubMode,
  onEpubLayoutChange,
  onThemeChange,
  onFontSizeChange,
  onFontFamilyChange,
  onLineHeightChange,
  onMaxWidthChange,
  onSelectTocItem,
  onToggleSidebar,
  onBack,
  onLogout,
  onJumpToPage,
  onZoomChange,
  onToggleSearch,
  onOpenSettings,
}: ReaderHeaderProps) {
  const [pageInput, setPageInput] = useState('');
  const [showAppearance, setShowAppearance] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleJump = useCallback(() => {
    const page = parseInt(pageInput, 10);
    if (page >= 1 && numPages && page <= numPages) {
      onJumpToPage(page);
    }
    setPageInput('');
    inputRef.current?.blur();
  }, [pageInput, numPages, onJumpToPage]);

  const handlePageKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleJump();
      if (e.key === 'Escape') {
        setPageInput('');
        inputRef.current?.blur();
      }
    },
    [handleJump],
  );

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!showToc && !showAppearance) return;
    const closeMenus = () => {
      setShowToc(false);
      setShowAppearance(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      closeMenus();
    };
    // Also close when user taps inside the EPUB iframe (which causes window blur)
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', closeMenus);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', closeMenus);
    };
  }, [showToc, showAppearance]);

  return (
    <header
      ref={headerRef}
      className={`flex-shrink-0 glass border-b border-white/10 flex flex-col relative ${
        showToc || showAppearance ? 'z-50' : 'z-30'
      } pt-[env(safe-area-inset-top)] ${
        isMobile ? 'px-2' : 'px-4'
      }`}
    >
      {/* Main row */}
      <div className={`flex items-center justify-between ${isMobile ? 'h-13' : 'h-14'}`}>
        {/* Left: Back + Title + TOC + Progress */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0"
            title="ბიბლიოთეკაში დაბრუნება"
          >
            <svg className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Table of Contents Dropdown Trigger */}
          {isEpubMode && toc.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowToc((v) => !v);
                  setShowAppearance(false);
                }}
                className={`p-1.5 rounded-xl transition-colors flex items-center gap-1 text-xs ${
                  showToc ? 'bg-purple-600/30 text-purple-300' : 'hover:bg-white/10 text-white/80'
                }`}
                title="სარჩევი (Table of Contents)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </button>

              {showToc && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowToc(false)} />
                  <div className="absolute left-0 top-10 z-50 w-72 max-h-96 overflow-y-auto bg-gray-900/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-2 text-white">
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 border-b border-white/10">
                      სარჩევი (Chapters)
                    </div>
                    <div className="py-1 space-y-0.5">
                      {toc.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.locator.kind === 'epub' && item.locator.cfi) {
                              onSelectTocItem?.(item.locator.cfi);
                            }
                            setShowToc(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-purple-600/20 hover:text-purple-200 transition-colors truncate"
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col min-w-0">
            <h1 className={`font-semibold truncate ${isMobile ? 'text-xs max-w-[90px]' : 'text-sm max-w-[180px] sm:max-w-xs'}`}>
              {title || 'Reading'}
            </h1>
            {isEpubMode && chapterTitle && !isMobile && (
              <span className="text-[10px] text-purple-300/80 truncate max-w-[220px]">
                {chapterTitle}
              </span>
            )}
          </div>

          <span className={`opacity-50 flex-shrink-0 tabular-nums ${isMobile ? 'text-[10px]' : 'text-xs hidden sm:inline ml-1'}`}>
            {isEpubMode ? `${Math.round(progressPercent)}%` : numPages ? `${currentPage}/${numPages}` : ''}
          </span>
        </div>

        {/* Center: Practical EPUB Layout Switcher */}
        {!isMobile && isEpubMode && onEpubLayoutChange && (
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 gap-0.5">
            <button
              onClick={() => onEpubLayoutChange('paginated-single')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                epubLayout === 'paginated-single'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title="1 გვერდი (გადაფურცვლა)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>1 გვერდი</span>
            </button>

            <button
              onClick={() => onEpubLayoutChange('paginated-spread')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                epubLayout === 'paginated-spread'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title="2 გვერდი (გაშლილი წიგნი)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>2 გვერდი</span>
            </button>

            <button
              onClick={() => onEpubLayoutChange('scrolled')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                epubLayout === 'scrolled'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title="უწყვეტი სქროლი (Scroll)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>სქროლი</span>
            </button>
          </div>
        )}

        {/* Right Controls */}
        <div className="flex items-center gap-1.5">
          {/* Typography & Appearance Popover (Aa) */}
          {isEpubMode && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowAppearance((v) => !v);
                  setShowToc(false);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 border ${
                  showAppearance
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-white/5 hover:bg-white/10 text-white/90 border-white/10'
                }`}
                title="კითხვის პარამეტრები (შრიფტი, ფერი, ზომა)"
              >
                <span className="font-serif text-sm leading-none">Aa</span>
              </button>

              {showAppearance && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAppearance(false)} />
                  <div className="absolute right-0 top-11 z-50 w-80 bg-gray-900/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-4 text-white space-y-4">
                    {/* Mobile Layout Switcher inside Aa menu */}
                    {isMobile && onEpubLayoutChange && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                          განლაგება (Layout)
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => onEpubLayoutChange('paginated-single')}
                            className={`py-1.5 rounded-xl text-xs font-medium border ${
                              epubLayout === 'paginated-single'
                                ? 'border-purple-500 bg-purple-600/30 text-white'
                                : 'border-white/10 bg-white/5 text-white/70'
                            }`}
                          >
                            გვერდები
                          </button>
                          <button
                            onClick={() => onEpubLayoutChange('scrolled')}
                            className={`py-1.5 rounded-xl text-xs font-medium border ${
                              epubLayout === 'scrolled'
                                ? 'border-purple-500 bg-purple-600/30 text-white'
                                : 'border-white/10 bg-white/5 text-white/70'
                            }`}
                          >
                            სქროლი
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Theme Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                        ფონის ფერი (Theme)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'night' as Theme, label: 'ღამე', bg: '#141518', fg: '#E2E4E9' },
                          { id: 'sepia' as Theme, label: 'სეპია', bg: '#F4ECD8', fg: '#3B2E1E' },
                          { id: 'light' as Theme, label: 'დღე', bg: '#FAF9F5', fg: '#1F2937' },
                        ].map((t) => (
                          <button
                            key={t.id}
                            onClick={() => onThemeChange?.(t.id)}
                            style={{ backgroundColor: t.bg, color: t.fg }}
                            className={`py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                              theme === t.id ? 'border-purple-500 scale-[1.02] shadow-lg' : 'border-white/15 opacity-80 hover:opacity-100'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font Family */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                        შრიფტი (Font)
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'literata' as EpubFontFamily, label: 'Literata (Serif)' },
                          { id: 'georgia' as EpubFontFamily, label: 'Georgia (Classic)' },
                          { id: 'sans' as EpubFontFamily, label: 'Inter (Sans)' },
                          { id: 'mono' as EpubFontFamily, label: 'Mono (Code)' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => onFontFamilyChange?.(f.id)}
                            className={`py-1.5 px-2.5 rounded-xl text-xs font-medium border text-left truncate transition-all ${
                              fontFamily === f.id
                                ? 'border-purple-500 bg-purple-500/20 text-white'
                                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font Size */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                          შრიფტის ზომა
                        </label>
                        <span className="text-xs text-purple-400 font-semibold">{fontSize}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onFontSizeChange?.(Math.max(70, fontSize - 10))}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors"
                        >
                          A-
                        </button>
                        <input
                          type="range"
                          min="70"
                          max="180"
                          step="10"
                          value={fontSize}
                          onChange={(e) => onFontSizeChange?.(Number(e.target.value))}
                          className="flex-1 accent-purple-500"
                        />
                        <button
                          onClick={() => onFontSizeChange?.(Math.min(180, fontSize + 10))}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors"
                        >
                          A+
                        </button>
                      </div>
                    </div>

                    {/* Line Spacing */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                        სტრიქონებს შორის დაშორება
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { val: 1.45, label: 'მჭიდრო' },
                          { val: 1.75, label: 'სტანდარტული' },
                          { val: 2.05, label: 'ფართო' },
                        ].map((lh) => (
                          <button
                            key={lh.val}
                            onClick={() => onLineHeightChange?.(lh.val)}
                            className={`py-1.5 rounded-xl text-xs font-medium border transition-all ${
                              Math.abs(lineHeight - lh.val) < 0.05
                                ? 'border-purple-500 bg-purple-500/20 text-white'
                                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                            }`}
                          >
                            {lh.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Page Width */}
                    {!isMobile && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                          ტექსტის სიგანე
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { val: 620, label: 'ვიწრო' },
                            { val: 780, label: 'საშუალო' },
                            { val: 980, label: 'ფართო' },
                          ].map((pw) => (
                            <button
                              key={pw.val}
                              onClick={() => onMaxWidthChange?.(pw.val)}
                              className={`py-1.5 rounded-xl text-xs font-medium border transition-all ${
                                Math.abs(maxWidth - pw.val) < 40
                                  ? 'border-purple-500 bg-purple-500/20 text-white'
                                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                              }`}
                            >
                              {pw.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* EPUB / Original PDF Toggle */}
          {onToggleEpubMode && (
            <button
              onClick={onToggleEpubMode}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                isEpubMode
                  ? 'bg-purple-600/20 border-purple-500/40 text-purple-300 hover:bg-purple-600/30'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title={isEpubMode ? 'ორიგინალი PDF-ის ნახვა' : 'EPUB რეჟიმზე გადასვლა'}
            >
              {isEpubMode ? 'EPUB' : 'PDF'}
            </button>
          )}

          {/* PDF Controls when in fallback PDF mode */}
          {!isEpubMode && !isMobile && (
            <>
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
                    transition-colors"
                />
                <button
                  onClick={handleJump}
                  className="px-2 py-1 text-xs rounded-lg bg-purple-600/50 hover:bg-purple-600/80 transition-colors"
                >
                  Go
                </button>
              </div>

              <button
                onClick={onToggleSearch}
                className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
                title="Search in PDF (Ctrl+F)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <button
                onClick={() => onZoomChange(Math.max(0.5, zoomLevel - 0.1))}
                className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
                title="Zoom out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-xs opacity-60 w-10 text-center select-none tabular-nums">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => onZoomChange(Math.min(2.0, zoomLevel + 0.1))}
                className="p-1.5 rounded-xl hover:bg-white/10 transition-colors"
                title="Zoom in"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </>
          )}

          {/* Toggle Right-Side Translation Panel */}
          {!isMobile && (
            <button
              onClick={onToggleSidebar}
              className={`p-1.5 rounded-xl transition-colors ${
                showSidebar ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/10 text-white/50'
              }`}
              title="თარგმანის გვერდითა პანელის ჩართვა/გამორთვა"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </button>
          )}

          {/* ⚙️ AI & Reader Settings Modal trigger */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-purple-400 hover:text-purple-300"
            title="AI თარგმანის პარამეტრები"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Sign Out */}
          <button
            onClick={onLogout}
            className={`rounded-xl hover:bg-white/10 transition-colors ${
              isMobile ? 'p-1.5' : 'px-3 py-1.5 text-xs border border-white/15'
            }`}
            title="გასვლა"
          >
            {isMobile ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            ) : (
              'Sign Out'
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5 -mx-4">
        <div
          className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </header>
  );
}
