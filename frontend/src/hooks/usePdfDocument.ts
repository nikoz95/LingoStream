/**
 * Hook: Load a PDF document from the backend file URL.
 * Uses usePdfLoader to get the blob URL, then loads it via pdfjs-dist getDocument().
 * Exposes the PDFDocumentProxy for use with react-pdf Page components.
 */
import { useState, useCallback, useEffect } from 'react';
import { usePdfLoader } from './usePdfLoader';
import { getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfDocumentState {
  loading: boolean;
  error: string;
  pdfBlobUrl: string;
  numPages: number | null;
  documentRef: PDFDocumentProxy | null;
}

export function usePdfDocument(bookId: string | undefined) {
  const { book, loading: blobLoading, error: blobError, pdfBlobUrl } = usePdfLoader(bookId);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [documentRef, setDocumentRef] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const onLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    setDocumentRef(pdf);
    setNumPages(pdf.numPages);
  }, []);

  const onLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err);
    setError(err.message || 'Failed to load PDF');
  }, []);

  // Load the PDF document via pdfjs-dist when the blob URL becomes available
  useEffect(() => {
    if (!pdfBlobUrl) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    const loadingTask = getDocument({ url: pdfBlobUrl });
    loadingTask.promise.then((pdf: PDFDocumentProxy) => {
      if (!cancelled) {
        onLoadSuccess(pdf);
        setLoading(false);
      }
    }).catch((err: Error) => {
      if (!cancelled) {
        onLoadError(err);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [pdfBlobUrl, onLoadSuccess, onLoadError]);

  return {
    book,
    loading: loading || blobLoading,
    error: error || blobError,
    pdfBlobUrl,
    numPages,
    documentRef,
    onLoadSuccess,
    onLoadError,
  };
}