import { useCallback, useRef, useState, useEffect } from 'react';
import { Document, Page } from 'react-pdf';

interface ThumbnailSidebarProps {
  pdfBlobUrl: string;
  numPages: number | null;
  currentPage: number;
  onPageClick: (page: number) => void;
  visible: boolean;
}

export default function ThumbnailSidebar({
  pdfBlobUrl,
  numPages,
  currentPage,
  onPageClick,
  visible,
}: ThumbnailSidebarProps) {
  const [showThumbnails, setShowThumbnails] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current page thumbnail
  useEffect(() => {
    if (!containerRef.current || !showThumbnails) return;
    const el = containerRef.current.querySelector(`[data-thumb-page="${currentPage}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPage, showThumbnails]);

  const handleToggle = useCallback(() => {
    setShowThumbnails(prev => !prev);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Toggle button — left edge of screen */}
      <button
        onClick={handleToggle}
        className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1.5 rounded-r-xl 
          transition-all hover:bg-white/10
          ${showThumbnails ? 'bg-white/15' : 'bg-white/5'}`}
        title={showThumbnails ? 'Hide thumbnails' : 'Show thumbnails'}
        style={{ writingMode: 'vertical-rl' }}
      >
        <span className="text-[10px] opacity-50 tracking-wider">
          {showThumbnails ? '◀ HIDE' : '▶ PAGES'}
        </span>
      </button>

      {/* Sidebar strip */}
      <div
        ref={containerRef}
        className={`fixed left-0 top-14 bottom-0 z-20 w-24 overflow-y-auto 
          border-r border-white/10 transition-transform duration-200
          ${showThumbnails ? 'translate-x-0' : '-translate-x-full'}
          ${'bg-gray-900/80 backdrop-blur-md'}`}
      >
        <div className="p-2 space-y-2">
          <Document file={pdfBlobUrl}>
            {Array.from(new Array(numPages || 0), (_, i) => {
              const pageNum = i + 1;
              const isCurrent = pageNum === currentPage;
              return (
                <div
                  key={`thumb_${pageNum}`}
                  data-thumb-page={pageNum}
                  onClick={() => onPageClick(pageNum)}
                  className={`cursor-pointer rounded-lg overflow-hidden 
                    transition-all duration-150 border-2 
                    ${isCurrent
                      ? 'border-purple-500 shadow-lg shadow-purple-500/30'
                      : 'border-transparent hover:border-white/20'}`}
                >
                  <Page
                    pageNumber={pageNum}
                    width={80}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="bg-white"
                  />
                  <div className="text-center text-[10px] py-0.5 bg-black/40 text-white/70">
                    {pageNum}
                  </div>
                </div>
              );
            })}
          </Document>
        </div>
      </div>
    </>
  );
}