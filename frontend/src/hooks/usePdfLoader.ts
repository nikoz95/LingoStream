import { useState, useEffect } from 'react';
import { getBookBlob, getBookDetail, type BookDetailResponse } from '../lib/api';

export function usePdfLoader(bookId: string | undefined) {
  const [book, setBook] = useState<BookDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');

  useEffect(() => {
    if (!bookId) return;

    let canceled = false;
    let createdUrl = '';

    async function init() {
      try {
        const detail = await getBookDetail(Number(bookId));
        if (canceled) return;
        setBook(detail);

        const blob = await getBookBlob(Number(bookId));
        if (!canceled) {
          createdUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(createdUrl);
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
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [bookId]);

  return { book, loading, error, pdfBlobUrl };
}