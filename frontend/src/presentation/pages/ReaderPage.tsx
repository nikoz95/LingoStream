import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBookStore } from '@infrastructure/store/bookStore.ts';
import { useThemeStore } from '@infrastructure/store/themeStore.ts';
import { useTranslation } from '@presentation/hooks/useTranslation.ts';
import { BookOpen, ArrowLeft, ChevronLeft, ChevronRight, Sun, Moon, Languages, BookmarkPlus, Sparkles } from 'lucide-react';

export function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const {
    currentBook, chapters, paragraphs, currentChapter,
    fetchChapters, fetchParagraphs, selectChapter,
  } = useBookStore();
  const { themeId, setTheme } = useThemeStore();
  const {
    translate, result, isLoading: isTranslating, error: translateError,
    selectedIndices, translatedIndices, toggleSelection, clearSelection, clearResult,
  } = useTranslation();

  const [showSidebar, setShowSidebar] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [leftCtx, setLeftCtx] = useState(2);
  const [rightCtx, setRightCtx] = useState(2);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bookId) {
      fetchChapters(bookId);
    }
  }, [bookId, fetchChapters]);

  useEffect(() => {
    if (chapters.length > 0 && !currentChapter) {
      selectChapter(chapters[0]);
    }
  }, [chapters, currentChapter, selectChapter]);

  useEffect(() => {
    if (currentChapter && bookId) {
      fetchParagraphs(bookId, currentChapter.id);
      clearResult();
      clearSelection();
    }
  }, [currentChapter, bookId, fetchParagraphs, clearResult, clearSelection]);


  const currentChapterIndex = currentChapter
    ? chapters.findIndex((c) => c.id === currentChapter.id)
    : -1;

  const goToChapter = useCallback(
    (index: number) => {
      if (index >= 0 && index < chapters.length) {
        selectChapter(chapters[index]);
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      }
    },
    [chapters, selectChapter]
  );

  const handleTranslate = useCallback(async () => {
    if (!bookId || !currentChapter || selectedIndices.length === 0) return;
    await translate(
      bookId,
      currentChapter.id,
      selectedIndices.sort((a, b) => a - b),
      leftCtx,
      rightCtx,
      currentBook?.language || 'en'
    );
  }, [bookId, currentChapter, selectedIndices, translate, leftCtx, rightCtx, currentBook]);

  const handleAddVocabulary = useCallback((word: string) => {
    // Placeholder for vocabulary feature
    console.log('Add vocabulary:', word);
  }, []);

  if (!bookId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--ls-text-muted)' }}>Book not found</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header
        className="shrink-0 backdrop-blur-xl z-50"
        style={{
          backgroundColor: 'var(--ls-glass-bg)',
          borderBottom: '1px solid var(--ls-glass-border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/library')}
              className="p-2 rounded-xl transition-all duration-200"
              style={{ color: 'var(--ls-text-secondary)' }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--ls-accent)' }}
              >
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {currentBook?.title || 'Loading...'}
                </p>
                <p className="text-xs" style={{ color: 'var(--ls-text-muted)' }}>
                  {currentChapter?.title || ''}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 rounded-xl transition-all duration-200"
              style={{
                color: showSidebar ? 'var(--ls-accent)' : 'var(--ls-text-secondary)',
                backgroundColor: showSidebar ? 'var(--ls-bg-hover)' : 'transparent',
              }}
              title="Toggle chapters"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTheme(themeId === 'sepia' ? 'deepNight' : 'sepia')}
              className="p-2 rounded-xl transition-all duration-200"
              style={{ color: 'var(--ls-text-secondary)' }}
              title="Toggle theme"
            >
              {themeId === 'sepia' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chapter Sidebar */}
        {showSidebar && (
          <aside
            className="w-64 shrink-0 overflow-y-auto border-r backdrop-blur-xl"
            style={{
              backgroundColor: 'var(--ls-glass-bg)',
              borderColor: 'var(--ls-glass-border)',
            }}
          >
            <div className="p-3">
              <h3
                className="text-sm font-semibold px-2 pb-2"
                style={{ color: 'var(--ls-text-muted)', fontFamily: 'Inter, sans-serif' }}
              >
                Chapters
              </h3>
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  onClick={() => goToChapter(idx)}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-200"
                  style={{
                    backgroundColor:
                      currentChapter?.id === ch.id ? 'var(--ls-bg-hover)' : 'transparent',
                    color:
                      currentChapter?.id === ch.id
                        ? 'var(--ls-accent)'
                        : 'var(--ls-text-secondary)',
                  }}
                >
                  <span className="text-xs opacity-50 mr-2">{idx + 1}.</span>
                  {ch.title || `Chapter ${idx + 1}`}
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Main Reading Area */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto"
          style={{ fontFamily: 'Literata, Georgia, serif' }}
        >
          <div className="max-w-[800px] mx-auto px-8 py-8">
            {paragraphs.length === 0 ? (
              <div className="text-center py-20">
                <p style={{ color: 'var(--ls-text-muted)' }}>
                  {currentChapter ? 'Loading paragraphs...' : 'Select a chapter to start reading'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {paragraphs.map((para) => {
                  const paraIdx = para.index;
                  const isSelected = selectedIndices.includes(paraIdx);
                  const isTranslated = translatedIndices.includes(paraIdx);
                  return (
                    <div
                      key={para.id}
                      onClick={() => toggleSelection(paraIdx)}
                      className="group relative p-3 -mx-3 rounded-xl cursor-pointer transition-all duration-200"
                  style={{
                    position: 'relative',
                    backgroundColor: isSelected ? 'var(--ls-bg-hover)' : isTranslated ? 'rgba(34, 197, 94, 0.06)' : 'transparent',
                    border: isSelected ? '2px solid var(--ls-accent)' : '2px solid transparent',
                    borderLeft: isTranslated ? '4px solid rgba(34, 197, 94, 0.5)' : isSelected ? '2px solid var(--ls-accent)' : '2px solid transparent',
                    lineHeight: '1.6',
                    fontSize: '1.125rem',
                  }}
                    >
                      <p style={{ color: 'var(--ls-text)' }}>
                        {para.content}
                      </p>
                      {/* Quick action bar */}
                      <div
                        className="absolute -top-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1"
                      >
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            toggleSelection(paraIdx);
                            setShowTranslation(true);
                            clearResult();
                            if (bookId && currentChapter) {
                              await translate(
                                bookId,
                                currentChapter.id,
                                [paraIdx],
                                leftCtx,
                                rightCtx,
                                currentBook?.language || 'en'
                              );
                            }
                          }}
                          className="p-1.5 rounded-lg text-xs font-medium backdrop-blur-xl transition-all hover:scale-110"
                          style={{
                            backgroundColor: 'var(--ls-glass-bg)',
                            border: '1px solid var(--ls-glass-border)',
                            color: 'var(--ls-accent)',
                          }}
                          title="Select for translation"
                        >
                          <Languages className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const words = para.content.split(/\s+/).slice(0, 3).join(' ');
                            handleAddVocabulary(words);
                          }}
                          className="p-1.5 rounded-lg text-xs font-medium backdrop-blur-xl transition-all hover:scale-110"
                          style={{
                            backgroundColor: 'var(--ls-glass-bg)',
                            border: '1px solid var(--ls-glass-border)',
                            color: 'var(--ls-accent)',
                          }}
                          title="Add to vocabulary"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Navigation */}
            {chapters.length > 0 && (
              <div className="flex items-center justify-between mt-12 pb-8">
                <button
                  onClick={() => goToChapter(currentChapterIndex - 1)}
                  disabled={currentChapterIndex <= 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-30"
                  style={{
                    backgroundColor: 'var(--ls-bg-card)',
                    border: '1px solid var(--ls-border)',
                    color: 'var(--ls-text-secondary)',
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-xs" style={{ color: 'var(--ls-text-muted)' }}>
                  {currentChapterIndex + 1} / {chapters.length}
                </span>
                <button
                  onClick={() => goToChapter(currentChapterIndex + 1)}
                  disabled={currentChapterIndex >= chapters.length - 1}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-30"
                  style={{
                    backgroundColor: 'var(--ls-bg-card)',
                    border: '1px solid var(--ls-border)',
                    color: 'var(--ls-text-secondary)',
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Translation Panel */}
        {showTranslation && (
          <aside
            className="w-96 shrink-0 overflow-y-auto border-l backdrop-blur-xl"
            style={{
              backgroundColor: 'var(--ls-glass-bg)',
              borderColor: 'var(--ls-glass-border)',
            }}
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="text-sm font-semibold flex items-center gap-2"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <Languages className="w-4 h-4" style={{ color: 'var(--ls-accent)' }} />
                  Translation
                </h3>
                <button
                  onClick={() => setShowTranslation(false)}
                  className="p-1.5 rounded-lg hover:bg-opacity-50"
                  style={{ color: 'var(--ls-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              {/* Context sliders */}
              <div className="space-y-3 mb-4 p-3 rounded-xl" style={{ backgroundColor: 'var(--ls-bg-card)' }}>
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--ls-text-secondary)' }}>
                    Left context: {leftCtx}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={leftCtx}
                    onChange={(e) => setLeftCtx(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: 'var(--ls-accent)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--ls-text-secondary)' }}>
                    Right context: {rightCtx}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={rightCtx}
                    onChange={(e) => setRightCtx(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: 'var(--ls-accent)' }}
                  />
                </div>
              </div>

              {/* Translate button */}
              <button
                onClick={handleTranslate}
                disabled={selectedIndices.length === 0 || isTranslating}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200 disabled:opacity-50 mb-4 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--ls-accent)' }}
              >
                {isTranslating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Translating...
                  </>
                ) : selectedIndices.length === 1
                  ? 'Translate'
                  : `Translate ${selectedIndices.length} paragraphs`}
              </button>

              {/* Results */}
              {translateError && (
                <div
                  className="p-3 rounded-xl text-sm mb-3"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  {translateError}
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--ls-text-muted)' }}>
                      Original ({currentBook?.language || 'English'})
                    </p>
                    <p
                      className="text-sm p-3 rounded-xl"
                      style={{
                        backgroundColor: 'var(--ls-bg-card)',
                        color: 'var(--ls-text)',
                      }}
                    >
                      {result.original}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--ls-text-muted)' }}>
                      Georgian Translation
                    </p>
                    <p
                      className="text-sm p-3 rounded-xl leading-relaxed"
                      style={{
                        backgroundColor: 'var(--ls-bg-card)',
                        borderLeft: '3px solid var(--ls-accent)',
                        color: 'var(--ls-text)',
                      }}
                    >
                      {result.translation}
                    </p>
                  </div>

                  {result.phonetic && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--ls-text-muted)' }}>
                        Phonetic
                      </p>
                      <p
                        className="text-sm p-3 rounded-xl"
                        style={{
                          backgroundColor: 'var(--ls-bg-card)',
                          color: 'var(--ls-text-secondary)',
                          fontStyle: 'italic',
                        }}
                      >
                        {result.phonetic}
                      </p>
                    </div>
                  )}

                  {/* Vocabulary quick-add */}
                  {result.translation && (
                    <button
                      onClick={() => {
                        const words = result.original.split(/\s+/).slice(0, 5).join(' ');
                        handleAddVocabulary(words);
                      }}
                      className="w-full py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid var(--ls-accent)',
                        color: 'var(--ls-accent)',
                      }}
                    >
                      <BookmarkPlus className="w-4 h-4" />
                      Add to vocabulary
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}