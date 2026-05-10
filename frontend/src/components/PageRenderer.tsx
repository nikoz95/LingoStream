/**
 * PageRenderer — renders a single PDF page using react-pdf canvas.
 *
 * A transparent click-zone overlay is positioned over each word using
 * backend-extracted bounding box coordinates (PyMuPDF). No invisible
 * text nodes — selection is coordinate-based via useClickSelection hook
 * which maps mouse/touch viewport coordinates to PDF bboxes.
 */
import { useState, useCallback, memo, useRef } from 'react';
import { Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import LoadingSpinner from './LoadingSpinner';

interface PageRendererProps {
  pdf: PDFDocumentProxy | null;
  pageIndex: number;
  width: number;
  className?: string;
  /** Fired when PDF renders successfully — gives actual rendered dims */
  onRender?: (widthPx: number, heightPx: number) => void;
}

const PageRenderer = memo(function PageRenderer({
  pdf,
  pageIndex,
  width,
  className = '',
  onRender,
}: PageRendererProps) {
  const pageNumber = pageIndex + 1;
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleLoadSuccess = useCallback((page: any) => {
    setPageLoading(false);
    setPageError(false);
    onRender?.(page.width, page.height);
  }, [onRender]);

  const handleLoadError = useCallback(() => {
    setPageLoading(false);
    setPageError(true);
  }, []);

  const isUpdating = pageLoading;

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

      {/* react-pdf Page with built-in TextLayer for native text selection */}
      <Page
        pdf={pdf}
        pageNumber={pageNumber}
        width={width}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        renderTextLayer={true}
        renderAnnotationLayer={false}
        className="pdf-page"
      />
    </div>
  );
});

export default PageRenderer;