import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { listBooks, registerBook, deleteBook, type BookListItem } from '../lib/api';

export default function LibraryPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function loadBooks() {
    try {
      setLoading(true);
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBooks();
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pdf')) {
      setError('Only PDF files are supported');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError('');

    try {
      await registerBook(file);
      await loadBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(bookId: number, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;

    try {
      await deleteBook(bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="min-h-screen theme-sepia">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-sepia-text/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-sepia-text">
              LingoStream
            </h1>
            <span className="hidden sm:inline text-sm text-sepia-text/40">|</span>
            <span className="hidden sm:inline text-sm text-sepia-text/50">
              Library
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-sepia-text/60">{user?.email}</span>
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 text-sm rounded-xl border border-sepia-text/15 
                text-sepia-text/70 hover:text-sepia-text hover:border-sepia-text/30
                transition-all duration-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Upload Card */}
        <div className="glass rounded-2xl p-8 mb-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 4v12m0 0l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
            </div>

            <div>
              <p className="text-sepia-text font-medium mb-1">
                Upload a PDF to start reading
              </p>
              <p className="text-sepia-text/50 text-sm">
                Drag and drop or click to browse
              </p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-6 py-2.5 rounded-xl bg-sepia-text text-sepia-bg font-medium
                hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-sm"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-sepia-bg/30 border-t-sepia-bg rounded-full animate-spin" />
                  Uploading...
                </span>
              ) : (
                'Choose PDF File'
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-left">
              {error}
            </div>
          )}
        </div>

        {/* Books Grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-sepia-text/30 border-t-sepia-text rounded-full animate-spin" />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-amber-100/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-sepia-text/60">No books yet. Upload your first PDF above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => (
              <div
                key={book.id}
                className="glass rounded-2xl p-5 hover:bg-glass-hover transition-all duration-200 cursor-pointer group"
                onClick={() => navigate(`/reader/${book.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(book.id, book.title);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 
                      text-sepia-text/30 hover:text-red-500 transition-all duration-200"
                    title="Delete book"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <h3 className="font-medium text-sepia-text truncate mb-1">
                  {book.title}
                </h3>
                {book.author && (
                  <p className="text-sm text-sepia-text/50 truncate mb-3">{book.author}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-sepia-text/40">
                  <span>{book.total_chapters} chapters</span>
                  <span className="w-1 h-1 rounded-full bg-sepia-text/20" />
                  <span className="capitalize">{book.language}</span>
                  <span className="w-1 h-1 rounded-full bg-sepia-text/20" />
                  <span className="capitalize">{book.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}