import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listBooks,
  registerBook,
  deleteBook,
  getDiscoverFeed,
  importDiscoverItem,
  type BookListItem,
  type DiscoverFeedItem,
  type DiscoverMode,
  type CefrLevel,
} from '../lib/api';
import { useLanguage, type Translations } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import AppLayout from '../components/AppLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import SettingsModal from '../components/SettingsModal';

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
  const { t } = useLanguage();
  const settings = useSettings();
  const [activeTab, setActiveTab] = useState<'library' | 'discover'>('library');
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<UploadState>({ uploading: false, error: '', success: '' });
  const [deleting, setDeleting] = useState<number | null>(null);

  // Discover state
  const [selectedCategory, setSelectedCategory] = useState<string>('ai');
  const [feedItems, setFeedItems] = useState<DiscoverFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');

  // Modal / Import state
  const [selectedItem, setSelectedItem] = useState<DiscoverFeedItem | null>(null);
  const [importMode, setImportMode] = useState<DiscoverMode>('adapted');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>(settings.targetCefr || 'B1');
  const [includeOriginal, setIncludeOriginal] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string>('');

  useEffect(() => {
    if (settings.targetCefr) {
      setCefrLevel(settings.targetCefr);
    }
  }, [settings.targetCefr]);

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
      setBooks(prev => [
        {
          id: result.id,
          title: result.title,
          author: result.author,
          total_chapters: result.total_chapters,
          language: result.language,
          status: result.status,
          created_at: result.created_at,
        },
        ...prev,
      ]);
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
      setBooks(prev => [
        {
          id: createdBook.id,
          title: createdBook.title,
          author: createdBook.author,
          total_chapters: createdBook.total_chapters,
          language: createdBook.language,
          status: createdBook.status,
          created_at: createdBook.created_at,
        },
        ...prev,
      ]);
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
      <AppLayout>
        <div className="min-h-[50vh] flex items-center justify-center">
          <LoadingSpinner message={t.loading} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Top Segmented Controls: Library vs Discover */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div
          className="inline-flex p-1 rounded-xl border self-start"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            onClick={() => setActiveTab('library')}
            className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'library' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'library' ? 'var(--app-text)' : 'var(--app-text-muted)',
              border: activeTab === 'library' ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}
          >
            <span>📚</span>
            <span>
              {t.myLibrary} ({books.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('discover')}
            className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'discover' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'discover' ? 'var(--app-text)' : 'var(--app-text-muted)',
              border: activeTab === 'discover' ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}
          >
            <span>🌐</span>
            <span>{t.discoverContent}</span>
          </button>
        </div>

        {activeTab === 'library' && (
          <label
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border transition-colors cursor-pointer self-start sm:self-auto"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--app-text)',
            }}
          >
            <span>⬆️</span>
            <span>{t.clickToUpload} (.epub, .pdf)</span>
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleUpload}
              disabled={upload.uploading}
            />
          </label>
        )}
      </div>

      {upload.uploading && (
        <div className="mb-6 p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <LoadingSpinner message={t.uploadingAndProcessing} />
        </div>
      )}
      {upload.error && (
        <div className="mb-6 p-3 rounded-xl border text-xs text-red-400 bg-red-500/10 border-red-500/20">
          {upload.error}
        </div>
      )}
      {upload.success && (
        <div className="mb-6 p-3 rounded-xl border text-xs text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
          {upload.success}
        </div>
      )}

      {activeTab === 'library' ? (
        <>
          {books.length === 0 ? (
            <div
              className="text-center py-16 px-4 rounded-2xl border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-base font-medium" style={{ color: 'var(--app-text)' }}>
                {t.libraryEmpty}
              </p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--app-text-muted)' }}>
                {t.libraryEmptyDesc}{' '}
                <button
                  onClick={() => setActiveTab('discover')}
                  className="font-medium underline cursor-pointer"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {t.discoverContent}
                </button>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {books.map(book => (
                <div
                  key={book.id}
                  className="group rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                  onClick={() => handleRead(book.id)}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--app-text)' }}>
                        {book.title}
                      </h3>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(book.id, book.title);
                        }}
                        disabled={deleting === book.id}
                        className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/15 cursor-pointer text-red-400"
                        title={t.deleteBookTitle}
                      >
                        {deleting === book.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                    </div>

                    {book.author && (
                      <p className="text-xs truncate mb-3" style={{ color: 'var(--app-text-muted)' }}>
                        {book.author}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--app-text-muted)' }}>
                    <span className="uppercase tracking-wider">{book.language}</span>
                    <span>·</span>
                    <span>
                      {book.total_chapters} {t.booksCount}
                    </span>
                    {book.status === 'ready' && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-400 font-medium">Ready</span>
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
          {/* Custom Search / Topic Generator */}
          <div
            className="rounded-xl p-4 sm:p-5 border flex flex-col md:flex-row md:items-center justify-between gap-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div>
              <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                <span>✨</span>
                <span>{t.discoverBannerTitle}</span>
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                {t.discoverBannerDesc}
              </p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleOpenCustomModal();
                }}
                placeholder={t.customTopicPlaceholder}
                className="flex-1 md:w-64 px-3.5 py-2 text-xs sm:text-sm rounded-lg border focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--app-text)',
                }}
              />
              <button
                onClick={handleOpenCustomModal}
                disabled={!customTitle.trim()}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--app-accent)',
                  color: '#ffffff',
                }}
              >
                {t.createCustomBtn}
              </button>
            </div>
          </div>

          {/* Categories Pill Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {categories.map(cat => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: isActive ? 'var(--app-accent-subtle)' : 'var(--bg-surface)',
                    borderColor: isActive ? 'var(--app-accent)' : 'var(--border-subtle)',
                    color: isActive ? 'var(--app-accent)' : 'var(--app-text-muted)',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}

            {settings.customTopics.map(ct => {
              const isActive = selectedCategory === ct;
              return (
                <button
                  key={ct}
                  onClick={() => setSelectedCategory(ct)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: isActive ? 'var(--app-accent-subtle)' : 'var(--bg-surface)',
                    borderColor: isActive ? 'var(--app-accent)' : 'var(--border-subtle)',
                    color: isActive ? 'var(--app-accent)' : 'var(--app-text-muted)',
                  }}
                >
                  <span>⭐</span>
                  <span>{ct}</span>
                </button>
              );
            })}
          </div>

          {/* Feed Content */}
          {feedLoading ? (
            <div className="py-12">
              <LoadingSpinner message={t.feedLoading} />
            </div>
          ) : feedError ? (
            <div className="text-center py-8">
              <p className="text-xs text-red-400 mb-2">{feedError}</p>
              <button
                onClick={() => loadFeed(selectedCategory)}
                className="text-xs underline font-medium cursor-pointer"
                style={{ color: 'var(--app-accent)' }}
              >
                {t.feedErrorRetry}
              </button>
            </div>
          ) : feedItems.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--app-text-muted)' }}>
              <p className="text-xs">მასალა ვერ მოიძებნა</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {feedItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => openItemModal(item)}
                  className="rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between hover:border-strong"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-2" style={{ color: 'var(--app-text-muted)' }}>
                      <span className="font-medium truncate max-w-[65%]">{item.source_name}</span>
                      <span>
                        {item.reading_time_minutes} {t.minRead}
                      </span>
                    </div>

                    <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-2" style={{ color: 'var(--app-text)' }}>
                      {item.title}
                    </h3>

                    <p className="text-xs line-clamp-3 mb-3 leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
                      {item.summary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-1.5">
                      {item.tags.slice(0, 2).map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[10px] border"
                          style={{
                            backgroundColor: 'var(--bg-canvas)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--app-text-muted)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <span className="font-semibold text-xs flex items-center gap-1" style={{ color: 'var(--app-accent)' }}>
                      <span>{t.selectAndRead}</span>
                      <span>→</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Format & Level Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className="w-full max-w-lg rounded-2xl border p-5 sm:p-6 space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-accent)' }}>
                  {t.modalTitle}
                </span>
                <h3 className="text-sm sm:text-base font-bold mt-0.5 line-clamp-2" style={{ color: 'var(--app-text)' }}>
                  {selectedItem.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg text-xs cursor-pointer"
                style={{ color: 'var(--app-text-muted)' }}
              >
                ✕
              </button>
            </div>

            {/* Step 1: Format */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                {t.step1Format}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('adapted')}
                  className="p-2.5 rounded-xl border text-left transition-all cursor-pointer"
                  style={{
                    backgroundColor: importMode === 'adapted' ? 'var(--app-accent-subtle)' : 'var(--bg-canvas)',
                    borderColor: importMode === 'adapted' ? 'var(--app-accent)' : 'var(--border-subtle)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: importMode === 'adapted' ? 'var(--app-accent)' : 'var(--app-text)' }}>
                    {t.formatAdaptedTitle}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                    {t.formatAdaptedDesc}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('podcast')}
                  className="p-2.5 rounded-xl border text-left transition-all cursor-pointer"
                  style={{
                    backgroundColor: importMode === 'podcast' ? 'var(--app-accent-subtle)' : 'var(--bg-canvas)',
                    borderColor: importMode === 'podcast' ? 'var(--app-accent)' : 'var(--border-subtle)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: importMode === 'podcast' ? 'var(--app-accent)' : 'var(--app-text)' }}>
                    {t.formatPodcastTitle}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                    {t.formatPodcastDesc}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('story')}
                  className="p-2.5 rounded-xl border text-left transition-all cursor-pointer"
                  style={{
                    backgroundColor: importMode === 'story' ? 'var(--app-accent-subtle)' : 'var(--bg-canvas)',
                    borderColor: importMode === 'story' ? 'var(--app-accent)' : 'var(--border-subtle)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: importMode === 'story' ? 'var(--app-accent)' : 'var(--app-text)' }}>
                    {t.formatStoryTitle}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                    {t.formatStoryDesc}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('original')}
                  className="p-2.5 rounded-xl border text-left transition-all cursor-pointer"
                  style={{
                    backgroundColor: importMode === 'original' ? 'var(--app-accent-subtle)' : 'var(--bg-canvas)',
                    borderColor: importMode === 'original' ? 'var(--app-accent)' : 'var(--border-subtle)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: importMode === 'original' ? 'var(--app-accent)' : 'var(--app-text)' }}>
                    {t.formatOriginalTitle}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                    {t.formatOriginalDesc}
                  </div>
                </button>
              </div>
            </div>

            {/* Step 2: Level */}
            {importMode !== 'original' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                  {t.step2Cefr}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {cefrLevels.map(item => (
                    <button
                      key={item.level}
                      type="button"
                      onClick={() => setCefrLevel(item.level)}
                      className="p-2 rounded-xl border text-center transition-all cursor-pointer"
                      style={{
                        backgroundColor: cefrLevel === item.level ? 'var(--app-accent-subtle)' : 'var(--bg-canvas)',
                        borderColor: cefrLevel === item.level ? 'var(--app-accent)' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="text-xs font-bold" style={{ color: cefrLevel === item.level ? 'var(--app-accent)' : 'var(--app-text)' }}>
                        {item.level}
                      </div>
                      <div className="text-[9px] truncate" style={{ color: 'var(--app-text-muted)' }}>
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>

                {(importMode === 'adapted' || importMode === 'podcast') && (
                  <label className="flex items-center gap-2 pt-1 text-xs cursor-pointer" style={{ color: 'var(--app-text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={includeOriginal}
                      onChange={e => setIncludeOriginal(e.target.checked)}
                      className="rounded"
                    />
                    <span>{t.includeOriginalCheckbox}</span>
                  </label>
                )}
              </div>
            )}

            {importError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-2.5">
                {importError}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                disabled={importing}
                className="px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--app-text-muted)',
                }}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--app-accent)',
                  color: '#ffffff',
                }}
              >
                {importing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t.btnPreparing}</span>
                  </>
                ) : (
                  <span>
                    {importMode === 'original'
                      ? t.btnOpenOriginal
                      : importMode === 'podcast'
                      ? t.btnOpenPodcast.replace('{level}', cefrLevel)
                      : importMode === 'story'
                      ? t.btnOpenStory.replace('{level}', cefrLevel)
                      : t.btnOpenAdapted.replace('{level}', cefrLevel)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsModal isOpen={settings.isSettingsOpen} onClose={settings.closeSettings} />
    </AppLayout>
  );
}
