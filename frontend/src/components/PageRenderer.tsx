/**
 * PageRenderer — renders a single PDF page using react-pdf canvas.
 *
 * A transparent click-zone overlay is positioned over each word using
 * backend-extracted bounding box coordinates (PyMuPDF). No invisible
 * text nodes — selection is coordinate-based via useClickSelection hook
 * which maps mouse/touch viewport coordinates to PDF bboxes.
 */
import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { WordPositionsPageResponse, WordPositionResponse } from '../lib/api';
import LoadingSpinner from './LoadingSpinner';

interface PageRendererProps {
  pdf: PDFDocumentProxy | null;
  pageIndex: number;
  width: number;
  className?: string;
  /** Backend-extracted word positions for click-zone overlays */
  wordPositions: WordPositionsPageResponse | null;
  /** Whether word positions are still loading */
  wordPositionsLoading: boolean;
  /** Fired when PDF renders successfully — gives actual rendered dims */
  onRender?: (widthPx: number, heightPx: number) => void;
}

const PageRenderer = memo(function PageRenderer({
  pdf,
  pageIndex,
  width,
  className = '',
  wordPositions,
  wordPositionsLoading,
  onRender,
}: PageRendererProps) {
  const pageNumber = pageIndex + 1;
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(false);
  const [pageWidthPx, setPageWidthPx] = useState(0);
  const [pageHeightPx, setPageHeightPx] = useState(0);
  const [pageScale, setPageScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLoadSuccess = useCallback((page: any) => {
    setPageLoading(false);
    setPageError(false);
    const viewport = page.getViewport({ scale: 1 });
    setPageWidthPx(viewport.width);
    setPageHeightPx(viewport.height);
    onRender?.(viewport.width, viewport.height);
  }, [onRender]);

  const handleLoadError = useCallback(() => {
    setPageLoading(false);
    setPageError(true);
  }, []);

  // Compute scale from rendered page width vs original PDF points width
  useEffect(() => {
    if (pageWidthPx > 0 && width > 0) {
      setPageScale(width / pageWidthPx);
    }
  }, [pageWidthPx, width]);

  const isUpdating = pageLoading || wordPositionsLoading;

  if (!pdf) {
    return <LoadingSpinner message="Loading PDF..." />;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Loading state */}
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <LoadingSpinner
            message={pageLoading ? `Loading page ${pageNumber}...` : 'Loading word positions...'}
            light
          />
        </div>
      )}

      {/* Error state */}
      {pageError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-red-400 text-sm bg-gray-900/80 px-4 py-2 rounded-lg">
            Failed to load page {pageNumber}
          </div>
        </div>
      )}

      {/* react-pdf Page — canvas only, no built-in TextLayer */}
      <Page
        pdf={pdf}
        pageNumber={pageNumber}
        width={width}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        className="pdf-page"
      />

      {/* Word-level click zones from backend coordinates */}
      {!isUpdating &&
        wordPositions &&
        wordPositions.words.length > 0 &&
        pageScale > 0 && (
        <div
          className="pdf-word-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${pageWidthPx * pageScale}px`,
            height: `${pageHeightPx * pageScale}px`,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {wordPositions.words.map((wp: WordPositionResponse, idx: number) => {
            // Transform PDF points to CSS pixels
            const x = wp.x0 * pageScale;
            const y = wp.y0 * pageScale;
            const w = (wp.x1 - wp.x0) * pageScale;
            const h = (wp.y1 - wp.y0) * pageScale;

            // Skip zero-size zones
            if (w <= 0 || h <= 0) return null;

            // Selection highlight: check if this word is part of the currently selected text
            // (handled via CSS class from useClickSelection)
            return (
              <span
                key={`wz-${idx}`}
                className="pdf-word-zone"
                data-word={wp.word}
                data-word-index={wp.word_index}
                data-line-index={wp.line_index}
                data-block-index={wp.block_index}
                data-page-index={pageIndex}
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${w}px`,
                  height: `${h}px`,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  background: 'transparent',
                }}
              >
              </span>
            );
          })}
        </div>
      )}

      {/* No-text indicator */}
      {!pageLoading &&
        !wordPositionsLoading &&
        wordPositions &&
        wordPositions.words.length === 0 &&
        !pageError && (
        <div className="absolute bottom-2 right-2 text-[10px] text-white/20 pointer-events-none">
          (no selectable text)
        </div>
      )}
    </div>
  );
});

export default PageRenderer;