/**
 * PageRenderer — renders a single PDF page using react-pdf.
 * Includes native TextLayer for text selection (controlled via renderTextLayer prop).
 * The TextLayer is used by useTextSelection for word selection + translation.
 */
import { useState, useCallback, memo } from 'react';
import { Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
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

  const handleLoadSuccess = useCallback(() => {
    setPageLoading(false);
    setPageError(false);
  }, []);

  const handleLoadError = useCallback(() => {
    setPageLoading(false);
    setPageError(true);
  }, []);

  if (!pdf) {
    return <LoadingSpinner message="Loading PDF..." />;
  }

  return (
    <div className={`relative ${className}`}>
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

      {/* react-pdf Page with native TextLayer */}
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