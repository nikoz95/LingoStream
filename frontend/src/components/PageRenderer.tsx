/**
 * PageRenderer — renders a single PDF page using react-pdf.
 * Uses custom text overlay (via pdfjs-dist getTextContent) instead of
 * react-pdf's built-in TextLayer, because the built-in TextLayer CSS
 * often fails to render/position text spans correctly.
 *
 * Each text item from getTextContent is rendered as a positioned <span>
 * so that the browser's native selection works properly.
 */
import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePageTextContent } from '../hooks/usePageTextContent';
import LoadingSpinner from './LoadingSpinner';

interface PageRendererProps {
  pdf: PDFDocumentProxy | null;
  pageIndex: number; // 0-based internally, react-pdf uses pageNumber (1-based)
  width: number;
  className?: string;
}

const PageRenderer = memo(function PageRenderer({
  pdf,
  pageIndex,
  width,
  className = '',
}: PageRendererProps) {
  const pageNumber = pageIndex + 1;
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(false);
  const [pageWidthPx, setPageWidthPx] = useState(0);
  const [pageHeightPx, setPageHeightPx] = useState(0);
  const [pageScale, setPageScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract text content with bounding boxes
  const { items, loading: textLoading } = usePageTextContent(pdf, pageIndex);

  const handleLoadSuccess = useCallback((page: any) => {
    setPageLoading(false);
    setPageError(false);
    // Get the actual rendered dimensions
    const viewport = page.getViewport({ scale: 1 });
    setPageWidthPx(viewport.width);
    setPageHeightPx(viewport.height);
  }, []);

  const handleLoadError = useCallback(() => {
    setPageLoading(false);
    setPageError(true);
  }, []);

  // Compute scale from the rendered page width vs original width
  useEffect(() => {
    if (pageWidthPx > 0 && width > 0) {
      setPageScale(width / pageWidthPx);
    }
  }, [pageWidthPx, width]);

  if (!pdf) {
    return <LoadingSpinner message="Loading PDF..." />;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Loading state */}
      {pageLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <LoadingSpinner message={`Loading page ${pageNumber}...`} light />
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

      {/* Custom text overlay — positioned spans matching PDF text positions */}
      {!textLoading && items.length > 0 && pageScale > 0 && (
        <div
          className="pdf-custom-textlayer"
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
          {items.map((item, idx) => (
            <span
              key={`txt-${idx}`}
              className="pdf-text-item"
              data-text={item.str}
              style={{
                position: 'absolute',
                left: `${item.x * pageScale}px`,
                top: `${item.y * pageScale}px`,
                fontSize: `${item.h * pageScale}px`,
                lineHeight: `${item.h * pageScale}px`,
                whiteSpace: 'pre',
                pointerEvents: 'auto',
                cursor: 'text',
                color: 'transparent',
                // Slight opacity so user can see the text cursor position
                background: 'transparent',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                msUserSelect: 'text',
                MozUserSelect: 'text',
              }}
            >
              {item.str}
            </span>
          ))}
        </div>
      )}

      {/* TextLayer fallback message if no items on a loaded page */}
      {!pageLoading && !textLoading && items.length === 0 && !pageError && (
        <div
          className="absolute bottom-2 right-2 text-[10px] text-white/20 pointer-events-none"
        >
          (no selectable text)
        </div>
      )}
    </div>
  );
});

export default PageRenderer;