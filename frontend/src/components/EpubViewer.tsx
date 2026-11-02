import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  EpubEngine,
  type EpubFontFamily,
  type EpubLayoutMode,
  type EpubRelocateInfo,
  type EpubTheme,
} from '../lib/reader/EpubEngine';
import type { TocItem } from '../lib/reader/types';
import type { TextPick } from '../lib/textPicker';
import LoadingSpinner from './LoadingSpinner';

export interface EpubViewerHandle {
  nextPage: () => void;
  prevPage: () => void;
  goToFraction: (fraction: number) => void;
  goToHref: (href: string) => void;
  clearActivePick: () => void;
}

interface EpubViewerProps {
  bookId: string | undefined;
  bookBlob: Blob | null;
  fontSize: number;
  theme: EpubTheme;
  fontFamily: EpubFontFamily;
  lineHeight: number;
  layoutMode: EpubLayoutMode;
  maxWidth: number;
  onTextPick: (pick: TextPick) => void;
  onRelocate?: (info: EpubRelocateInfo) => void;
  onTocLoaded?: (toc: TocItem[]) => void;
  className?: string;
}

const THEME_BG: Record<EpubTheme, string> = {
  night: '#141518',
  sepia: '#F4ECD8',
  light: '#FAF9F5',
};

const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(function EpubViewer(
  {
    bookId,
    bookBlob,
    fontSize,
    theme,
    fontFamily,
    lineHeight,
    layoutMode,
    maxWidth,
    onTextPick,
    onRelocate,
    onTocLoaded,
    className = '',
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EpubEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Store callbacks in refs so updating parent state never re-initializes the EPUB!
  const onTextPickRef = useRef(onTextPick);
  onTextPickRef.current = onTextPick;

  const onRelocateRef = useRef(onRelocate);
  onRelocateRef.current = onRelocate;

  const onTocLoadedRef = useRef(onTocLoaded);
  onTocLoadedRef.current = onTocLoaded;

  const initialStylesRef = useRef({
    fontSize,
    theme,
    fontFamily,
    lineHeight,
    layoutMode,
    maxWidth,
  });
  initialStylesRef.current = {
    fontSize,
    theme,
    fontFamily,
    lineHeight,
    layoutMode,
    maxWidth,
  };

  useImperativeHandle(
    ref,
    () => ({
      nextPage: () => engineRef.current?.nextPage(),
      prevPage: () => engineRef.current?.prevPage(),
      goToFraction: (fraction: number) => {
        engineRef.current?.goToFraction(fraction);
      },
      goToHref: (href: string) => {
        engineRef.current?.goToHref(href);
      },
      clearActivePick: () => {
        engineRef.current?.clearActivePick();
      },
    }),
    [],
  );

  // Initialize EPUB Engine ONLY when bookBlob changes
  useEffect(() => {
    if (!containerRef.current || !bookBlob) return;

    let isCancelled = false;
    setLoading(true);
    setError(null);

    const savedCfi = bookId ? localStorage.getItem(`ls_epub_cfi_${bookId}`) || undefined : undefined;

    const initEngine = async () => {
      try {
        const engine = new EpubEngine(containerRef.current!);
        engineRef.current = engine;

        engine.onTextPick((pick) => {
          onTextPickRef.current(pick);
        });

        engine.onRelocate((info) => {
          if (bookId && info.cfi) {
            localStorage.setItem(`ls_epub_cfi_${bookId}`, info.cfi);
          }
          onRelocateRef.current?.(info);
        });

        await engine.open(bookBlob, savedCfi, initialStylesRef.current);

        if (!isCancelled) {
          const toc = await engine.getToc();
          onTocLoadedRef.current?.(toc);
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to open EPUB in Foliate:', err);
          setError(err instanceof Error ? err.message : 'Failed to load EPUB');
          setLoading(false);
        }
      }
    };

    initEngine();

    return () => {
      isCancelled = true;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [bookBlob, bookId]);

  // Apply dynamic reading settings without reloading the book
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.applySettings({
      fontSize,
      theme,
      fontFamily,
      lineHeight,
      layoutMode,
      maxWidth,
    });
  }, [fontSize, theme, fontFamily, lineHeight, layoutMode, maxWidth]);

  return (
    <div
      className={`relative w-full h-full flex flex-col transition-colors duration-200 ${className}`}
      style={{ backgroundColor: THEME_BG[theme] || THEME_BG.night }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40 backdrop-blur-xs">
          <LoadingSpinner message="წიგნი იტვირთება (EPUB)..." light />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-red-400 text-sm bg-gray-900/90 px-5 py-4 rounded-2xl border border-red-500/20 shadow-xl">
            {error}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full flex-1 overflow-hidden"
        style={{
          backgroundColor: THEME_BG[theme] || THEME_BG.night,
        }}
      />
    </div>
  );
});

export default EpubViewer;
