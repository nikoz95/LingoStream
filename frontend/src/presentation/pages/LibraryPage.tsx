import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import { useBookStore } from '@infrastructure/store/bookStore.ts';
import { useAuthStore } from '@infrastructure/store/authStore.ts';
import { useThemeStore } from '@infrastructure/store/themeStore.ts';
import { Book, Plus, LogOut, Sun, Moon, Upload, BookOpen, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function LibraryPage() {
  const navigate = useNavigate();
  const { books, isLoading, fetchBooks, registerBook } = useBookStore();
  const { logout } = useAuthStore();
  const { themeId, setTheme } = useThemeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const book = await registerBook(file);
      navigate(`/reader/${book.id}`);
    } catch {
      // error is set in the store
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{
          backgroundColor: 'var(--ls-glass-bg)',
          borderBottom: '1px solid var(--ls-glass-border)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--ls-accent)' }}
            >
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1
              className="text-lg font-semibold"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              LingoStream
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(themeId === 'sepia' ? 'deepNight' : 'sepia')}
              className="p-2.5 rounded-xl transition-all duration-200"
              style={{
                color: 'var(--ls-text-secondary)',
                backgroundColor: 'var(--ls-bg-card)',
              }}
              title={`Switch to ${themeId === 'sepia' ? 'Deep Night' : 'Sepia'} theme`}
            >
              {themeId === 'sepia' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button
              onClick={logout}
              className="p-2.5 rounded-xl transition-all duration-200"
              style={{
                color: 'var(--ls-text-secondary)',
                backgroundColor: 'var(--ls-bg-card)',
              }}
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Upload Section */}
        <div className="mb-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full p-8 rounded-2xl border-2 border-dashed transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            style={{
              borderColor: 'var(--ls-border)',
              backgroundColor: 'var(--ls-bg-card)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--ls-accent)' }}
              >
                <Upload className="w-6 h-6 text-white" />
              </div>
              <div>
                <p
                  className="text-lg font-medium"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {uploading ? 'Uploading...' : 'Upload a book'}
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--ls-text-muted)' }}>
                  EPUB or PDF format supported
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Books Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{
                borderColor: 'var(--ls-border)',
                borderTopColor: 'var(--ls-accent)',
              }}
            />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--ls-bg-card)' }}
            >
              <Book className="w-8 h-8" style={{ color: 'var(--ls-text-muted)' }} />
            </div>
            <p className="text-lg font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              No books yet
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--ls-text-muted)' }}>
              Upload an EPUB or PDF to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => (
              <button
                key={book.id}
                onClick={() => navigate(`/reader/${book.id}`)}
                className="text-left p-5 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--ls-bg-card)',
                  border: '1px solid var(--ls-border)',
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--ls-accent)' }}
                  >
                    <Book className="w-5 h-5 text-white" />
                  </div>
                  <ChevronRight className="w-5 h-5" style={{ color: 'var(--ls-text-muted)' }} />
                </div>
                <h3
                  className="font-semibold text-base mb-1 line-clamp-1"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {book.title}
                </h3>
                <p className="text-sm" style={{ color: 'var(--ls-text-muted)' }}>
                  {book.author} &middot; {book.total_chapters} chapters
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}