import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listBooks,
  registerBook,
  deleteBook,
  logout,
  type BookListItem,
} from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

const ACCEPTED_TYPES = '.pdf,.epub';
const ACCEPTED_MIME = ['application/pdf', 'application/epub+zip'];

interface UploadState {
  uploading: boolean;
  error: string;
  success: string;
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<UploadState>({ uploading: false, error: '', success: '' });
  const [deleting, setDeleting] = useState<number | null>(null);
  const fileRef = useState<HTMLInputElement | null>(null);

  const fetchBooks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      console.error('Failed to load books:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_MIME.includes(file.type) && !file.name.match(/\.(pdf|epub)$/i)) {
      setUpload({ uploading: false, error: 'Only PDF and EPUB files are supported', success: '' });
      return;
    }

    setUpload({ uploading: true, error: '', success: '' });

    try {
      const result = await registerBook(file);
      setBooks(prev => [{
        id: result.id,
        title: result.title,
        author: result.author,
        total_chapters: result.total_chapters,
        language: result.language,
        status: result.status,
        created_at: result.created_at,
      }, ...prev]);
      setUpload({ uploading: false, error: '', success: `"${result.title}" uploaded successfully` });
      setTimeout(() => setUpload(prev => ({ ...prev, success: '' })), 3000);
    } catch (err) {
      setUpload({ uploading: false, error: err instanceof Error ? err.message : 'Upload failed', success: '' });
    } finally {
      // Reset file input so re-uploading the same file works
      if (e.target) e.target.value = '';
    }
  }, []);

  const handleDelete = useCallback(async (bookId: number, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;

    setDeleting(bookId);
    try {
      await deleteBook(bookId);
      setBooks(prev => prev.filter(b => b.id !== bookId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    navigate('/login');
  }, [navigate]);

  const handleRead = useCallback((bookId: number) => {
    navigate(`/reader/${bookId}`);
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <LoadingSpinner message="Loading your library..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <header className="glass border-b border-white/10 px-4 lg:px-8 h-16 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          LingoStream
        </h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-colors"
        >
          Sign Out
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
        {/* Upload area */}
        <div className="mb-8">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-2xl cursor-pointer hover:border-purple-400/50 transition-colors bg-white/5">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="text-sm">
                <span className="text-purple-400 font-medium">Click to upload</span>
                <span className="opacity-50"> or drag and drop</span>
              </div>
              <span className="text-xs opacity-40">PDF or EPUB files only</span>
            </div>
            <input
              ref={ref => { if (ref) fileRef[1](ref); }}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleUpload}
              disabled={upload.uploading}
            />
          </label>

          {upload.uploading && (
            <div className="mt-4">
              <LoadingSpinner message="Uploading and processing..." />
            </div>
          )}
          {upload.error && (
            <p className="mt-2 text-sm text-red-400">{upload.error}</p>
          )}
          {upload.success && (
            <p className="mt-2 text-sm text-green-400">{upload.success}</p>
          )}
        </div>

        {/* Books grid */}
        {books.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg opacity-50">Your library is empty</p>
            <p className="text-sm opacity-30 mt-1">Upload a PDF or EPUB to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map(book => (
              <div
                key={book.id}
                className="group glass rounded-2xl p-5 hover:bg-white/10 transition-all cursor-pointer"
                onClick={() => handleRead(book.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{book.title}</h3>
                    {book.author && (
                      <p className="text-xs opacity-50 mt-0.5">{book.author}</p>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(book.id, book.title); }}
                    disabled={deleting === book.id}
                    className="ml-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all disabled:opacity-50"
                    title="Delete book"
                  >
                    {deleting === book.id ? (
                      <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs opacity-40">
                  <span className="capitalize">{book.language}</span>
                  <span>·</span>
                  <span>{book.total_chapters} chapters</span>
                  {book.status === 'ready' && (
                    <>
                      <span>·</span>
                      <span className="text-green-400">Ready</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}