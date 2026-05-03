import { useState, useEffect } from 'react';
import { getBookFileUrl, getBookDetail, type BookDetailResponse } from '../lib/api';

export function usePdfLoader(bookId: string | undefined) {
  const [book, setBook] = useState<BookDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');

  useEffect(() => {
    if (!bookId) return;

    let canceled = false;

    async function init() {
      try {
        const detail = await getBookDetail(Number(bookId));
        if (canceled) return;
        setBook(detail);

        const fileUrl = getBookFileUrl(Number(bookId));
        if (fileUrl) {
          try {
            const resp = await fetch(fileUrl);
            const blob = await resp.blob();
            if (!canceled) setPdfBlobUrl(URL.createObjectURL(blob));
          } catch {
            if (!canceled) setPdfBlobUrl(fileUrl);
          }
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : 'Failed to load book');
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    init();

    return () => {
      canceled = true;
    };
  }, [bookId]);

  return { book, loading, error, pdfBlobUrl };
}