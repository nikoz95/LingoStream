import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listBooks,
  registerBook,
  deleteBook,
  logout,
  getDiscoverFeed,
  importDiscoverItem,
  type BookListItem,
  type DiscoverFeedItem,
  type DiscoverMode,
  type CefrLevel,
} from '../lib/api';
import { useLanguage, type Translations } from '../lib/i18n';
import LanguageToggle from '../components/LanguageToggle';
import LoadingSpinner from '../components/LoadingSpinner';

const ACCEPTED_TYPES = '.pdf,.epub';
const ACCEPTED_MIME = ['application/pdf', 'application/epub+zip'];

interface UploadState {
  uploading: boolean;
  error: string;
  success: string;
}

interface CategoryOption {
  id: string;
  label: string;
  icon: string;
  group: 'tech' | 'general' | 'spoken';
}

const getCategories = (t: Translations): CategoryOption[] => [
  { id: 'ai', label: t.catAi, icon: '🤖', group: 'tech' },
  { id: 'dotnet', label: t.catDotnet, icon: '🟣', group: 'tech' },
  { id: 'python', label: t.catPython, icon: '🐍', group: 'tech' },
  { id: 'architecture', label: t.catArchitecture, icon: '🏗️', group: 'tech' },
  { id: 'world', label: t.catWorld, icon: '🌍', group: 'general' },
  { id: 'psychology', label: t.catPsychology, icon: '🧠', group: 'general' },
  { id: 'science', label: t.catScience, icon: '🔬', group: 'general' },
  { id: 'culture', label: t.catCulture, icon: '🎬', group: 'general' },
  { id: 'podcasts', label: t.catPodcasts, icon: '🎙️', group: 'spoken' },
  { id: 'stories', label: t.catStories, icon: '📖', group: 'spoken' },
];

const getCefrLevels = (t: Translations): { level: CefrLevel; label: string; desc: string }[] => [
  { level: 'A2', label: 'A2 (Pre-Intermediate)', desc: t.cefrA2Desc },
  { level: 'B1', label: 'B1 (Intermediate)', desc: t.cefrB1Desc },
  { level: 'B2', label: 'B2 (Upper-Intermediate)', desc: t.cefrB2Desc },
  { level: 'C1', label: 'C1 (Advanced)', desc: t.cefrC1Desc },
];

export default function LibraryPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<'library' | 'discover'>('library');
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<UploadState>({ uploading: false, error: '', success: '' });
  const [deleting, setDeleting] = useState<number | null>(null);
  const fileRef = useState<HTMLInputElement | null>(null);

  // Discover state
  const [selectedCategory, setSelectedCategory] = useState<string>('ai');
  const [feedItems, setFeedItems] = useState<DiscoverFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');

  // Modal / Import state
  const [selectedItem, setSelectedItem] = useState<DiscoverFeedItem | null>(null);
  const [importMode, setImportMode] = useState<DiscoverMode>('adapted');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>('B1');
  const [includeOriginal, setIncludeOriginal] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string>('');

  // Custom prompt generator state
  const [customTitle, setCustomTitle] = useState('');

  const categories = useMemo(() => getCategories(t), [t]);
  const cefrLevels = useMemo(() => getCefrLevels(t), [t]);

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

  const loadFeed = useCallback(async (category: string) => {
    try {
      setFeedLoading(true);
      setFeedError('');
      const res = await getDiscoverFeed(category);
      setFeedItems(res.items);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'discover') {
      loadFeed(selectedCategory);
    }
  }, [activeTab, selectedCategory, loadFeed]);

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
      if (e.target) e.target.value = '';
    }
  }, []);

  const handleDelete = useCallback(async (bookId: number, title: string) => {
    if (!window.confirm(`${t.deleteBookConfirm}\n"${title}"`)) return;

    setDeleting(bookId);
    try {
      await deleteBook(bookId);
      setBooks(prev => prev.filter(b => b.id !== bookId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  }, [t.deleteBookConfirm]);

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

  const openItemModal = useCallback((item: DiscoverFeedItem) => {
    setSelectedItem(item);
    setImportError('');
    if (item.item_type === 'story' || item.category === 'stories') {
      setImportMode('story');
    } else if (item.item_type === 'discussion' || item.category === 'podcasts') {
      setImportMode('podcast');
    } else {
      setImportMode('adapted');
    }
    setCefrLevel('B1');
  }, []);

  const handleOpenCustomModal = useCallback(() => {
    const trimmed = customTitle.trim();
    if (!trimmed) return;
    const isStoryCat = selectedCategory === 'stories';
    const isPodcastCat = selectedCategory === 'podcasts';
    setSelectedItem({
      id: `custom:${Date.now()}`,
      title: trimmed,
      summary: `Custom ${isStoryCat ? 'short story' : isPodcastCat ? 'podcast conversation' : 'article'} topic: ${trimmed}`,
      category: selectedCategory,
      source_name: 'Custom Topic',
      author: 'LingoStream AI',
      reading_time_minutes: 5,
      tags: ['Custom', 'B1-B2'],
      item_type: isStoryCat ? 'story' : isPodcastCat ? 'discussion' : 'article',
      raw_content: trimmed,
    });
    setImportMode(isStoryCat ? 'story' : isPodcastCat ? 'podcast' : 'adapted');
    setCefrLevel('B1');
    setImportError('');
  }, [customTitle, selectedCategory]);

  const handleConfirmImport = useCallback(async () => {
    if (!selectedItem) return;
    setImporting(true);
    setImportError('');
    try {
      const createdBook = await importDiscoverItem({
        item_id: selectedItem.id,
        title: selectedItem.title,
        summary: selectedItem.summary,
        category: selectedItem.category,
        source_name: selectedItem.source_name,
        author: selectedItem.author,
        url: selectedItem.url,
        raw_content: selectedItem.raw_content,
        mode: importMode,
        cefr_level: cefrLevel,
        include_original_chapter: includeOriginal,
      });
      setBooks(prev => [{
        id: createdBook.id,
        title: createdBook.title,
        author: createdBook.author,
        total_chapters: createdBook.total_chapters,
        language: createdBook.language,
        status: createdBook.status,
        created_at: createdBook.created_at,
      }, ...prev]);
      setSelectedItem(null);
      navigate(`/reader/${createdBook.id}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to prepare material');
    } finally {
      setImporting(false);
    }
  }, [selectedItem, importMode, cefrLevel, includeOriginal, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <LoadingSpinner message="Loading your library..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Header */}
      <header className="glass border-b border-white/10 px-4 lg:px-8 h-16 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          LingoStream
        </h1>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <button
            onClick={() => navigate('/writing')}
            className="px-4 py-2 text-sm rounded-xl border border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-400/50 transition-all duration-200 flex items-center gap-2 cursor-pointer"
          >
            <span>✍️</span>
            <span>{t.navWriting}</span>
          </button>
          <button
            onClick={() => navigate('/vocabulary')}
            className="px-4 py-2 text-sm rounded-xl border border-white/15 hover:bg-white/10 hover:border-purple-400/30 transition-all duration-200 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>{t.navVocabulary}</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {t.navSignOut}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
        {/* Top Mode Tabs: My Library vs Discover */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="inline-flex p-1.5 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setActiveTab('library')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'library'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>📚</span>
              <span>{t.myLibrary} ({books.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'discover'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>🌐</span>
              <span>{t.discoverContent}</span>
            </button>
          </div>
        </div>

        {activeTab === 'library' ? (
          <>
            {/* Upload area */}
            <div className="mb-8">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-2xl cursor-pointer hover:border-purple-400/50 transition-colors bg-white/5">
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div className="text-sm">
                    <span className="text-purple-400 font-medium">{t.clickToUpload}</span>
                    <span className="opacity-50"> {t.dragAndDrop}</span>
                  </div>
                  <span className="text-xs opacity-40">{t.pdfOrEpub}</span>
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
                  <LoadingSpinner message={t.uploadingAndProcessing} />
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
                <p className="text-lg opacity-50">{t.libraryEmpty}</p>
                <p className="text-sm opacity-40 mt-2">
                  {t.libraryEmptyDesc}{' '}
                  <button
                    onClick={() => setActiveTab('discover')}
                    className="text-purple-400 underline hover:text-purple-300 cursor-pointer"
                  >
                    🌐 {t.discoverContent}
                  </button>
                </p>
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
                        className="ml-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all disabled:opacity-50 cursor-pointer"
                        title={t.deleteBookTitle}
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
                      <span>{book.total_chapters} {t.booksCount}</span>
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
          </>
        ) : (
          /* ── DISCOVER & READ HUB ── */
          <div className="space-y-6">
            {/* Banner & Custom Topic Input */}
            <div className="glass rounded-2xl p-5 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>✨</span>
                  <span>{t.discoverBannerTitle}</span>
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  {t.discoverBannerDesc}
                </p>
              </div>
              <div className="flex items-center gap-2 w-full lg:w-auto">
                <input
                  type="text"
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleOpenCustomModal(); }}
                  placeholder={t.customTopicPlaceholder}
                  className="flex-1 lg:w-72 px-3.5 py-2 text-sm rounded-xl bg-black/30 border border-white/15 focus:outline-none focus:border-purple-400 text-white placeholder-white/40"
                />
                <button
                  onClick={handleOpenCustomModal}
                  disabled={!customTitle.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {t.createCustomBtn}
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                        isActive
                          ? 'bg-purple-600/30 border-purple-400 text-white shadow-sm shadow-purple-500/20'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feed Items Grid */}
            {feedLoading ? (
              <div className="py-16 flex justify-center">
                <LoadingSpinner message={t.feedLoading} />
              </div>
            ) : feedError ? (
              <div className="glass rounded-2xl p-8 text-center border border-red-500/20">
                <p className="text-red-400 text-sm mb-3">{feedError}</p>
                <button
                  onClick={() => loadFeed(selectedCategory)}
                  className="px-4 py-2 text-xs rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  {t.feedErrorRetry}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {feedItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => openItemModal(item)}
                    className="group glass rounded-2xl p-5 border border-white/10 hover:border-purple-400/50 hover:bg-white/10 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-purple-300/80 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-400/20 truncate">
                          {item.source_name}
                        </span>
                        <span className="text-white/40 whitespace-nowrap">
                          ⏱ {item.reading_time_minutes} {t.minRead}
                        </span>
                      </div>

                      <h3 className="font-semibold text-base text-white group-hover:text-purple-300 transition-colors line-clamp-2 mb-2">
                        {item.title}
                      </h3>

                      <p className="text-xs text-white/65 line-clamp-3 leading-relaxed mb-4">
                        {item.summary}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1 overflow-hidden">
                        {item.tags.slice(0, 2).map(tag => (
                          <span
                            key={tag}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-white/50"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs font-medium text-purple-400 group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
                        {t.selectAndRead}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── MODAL: Choose Reading Format (Original vs B1 Adapted vs Podcast vs Story) ── */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!importing) setSelectedItem(null); }}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-gray-900 border border-white/15 p-6 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/30">
                  {selectedItem.source_name}
                </span>
                <h3 className="text-lg font-bold text-white mt-2">{selectedItem.title}</h3>
                <p className="text-xs text-white/60 mt-1 line-clamp-3">{selectedItem.summary}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                disabled={importing}
                className="text-white/50 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Choose Format */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                {t.step1Format}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setImportMode('adapted')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    importMode === 'adapted'
                      ? 'bg-purple-600/25 border-purple-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>✨</span>
                    <span>{t.formatAdaptedTitle}</span>
                  </div>
                  <p className="text-[11px] text-white/60 mt-1">
                    {t.formatAdaptedDesc}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('original')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    importMode === 'original'
                      ? 'bg-purple-600/25 border-purple-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>📖</span>
                    <span>{t.formatOriginalTitle}</span>
                  </div>
                  <p className="text-[11px] text-white/60 mt-1">
                    {t.formatOriginalDesc}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('podcast')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    importMode === 'podcast'
                      ? 'bg-purple-600/25 border-purple-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>🎙️</span>
                    <span>{t.formatPodcastTitle}</span>
                  </div>
                  <p className="text-[11px] text-white/60 mt-1">
                    {t.formatPodcastDesc}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('story')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    importMode === 'story'
                      ? 'bg-purple-600/25 border-purple-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>📖</span>
                    <span>{t.formatStoryTitle}</span>
                  </div>
                  <p className="text-[11px] text-white/60 mt-1">
                    {t.formatStoryDesc}
                  </p>
                </button>
              </div>
            </div>

            {/* Step 2: Choose CEFR Level (when not Original) */}
            {importMode !== 'original' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  {t.step2Cefr}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {cefrLevels.map(item => (
                    <button
                      key={item.level}
                      type="button"
                      onClick={() => setCefrLevel(item.level)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        cefrLevel === item.level
                          ? 'bg-pink-600/25 border-pink-400 text-white font-semibold'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-sm">{item.level}</div>
                      <div className="text-[10px] text-white/50 truncate">{item.desc}</div>
                    </button>
                  ))}
                </div>

                {(importMode === 'adapted' || importMode === 'podcast') && (
                  <label className="flex items-center gap-2 pt-1 text-xs text-white/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeOriginal}
                      onChange={e => setIncludeOriginal(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    <span>{t.includeOriginalCheckbox}</span>
                  </label>
                )}
              </div>
            )}

            {importError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {importError}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                disabled={importing}
                className="px-4 py-2.5 text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg shadow-purple-500/25 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t.btnPreparing}</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>
                      {importMode === 'original'
                        ? t.btnOpenOriginal
                        : importMode === 'podcast'
                        ? t.btnOpenPodcast.replace('{level}', cefrLevel)
                        : importMode === 'story'
                        ? t.btnOpenStory.replace('{level}', cefrLevel)
                        : t.btnOpenAdapted.replace('{level}', cefrLevel)}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
