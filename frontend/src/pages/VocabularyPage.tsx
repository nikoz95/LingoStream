import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import AppLayout from '../components/AppLayout';
import SettingsModal from '../components/SettingsModal';
import {
  listVocabularyWords,
  deleteVocabularyWord,
  updateVocabularyWord,
  listBooks,
  type VocabularyWord,
  type BookListItem,
} from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

type GameType = 'quiz' | 'flashcards';

export default function VocabularyPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const settings = useSettings();
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBookFilter, setSelectedBookFilter] = useState<'all' | number | 'unassigned'>('all');

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    word: string;
    phonetic: string;
    definition: string;
    sentence_context: string;
    sentence_context_translated: string;
    translation: string;
  }>({
    word: '',
    phonetic: '',
    definition: '',
    sentence_context: '',
    sentence_context_translated: '',
    translation: '',
  });

  // Mini-Game state
  const [isGameOpen, setIsGameOpen] = useState(false);
  const [gameBookScope, setGameBookScope] = useState<'all' | number | 'unassigned'>('all');
  const [gameType, setGameType] = useState<GameType>('quiz');
  const [gameQueue, setGameQueue] = useState<VocabularyWord[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [gameFinished, setGameFinished] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [vocabRes, booksRes] = await Promise.all([
        listVocabularyWords(),
        listBooks().catch(() => [] as BookListItem[]),
      ]);
      setWords(vocabRes.words);
      setBooks(booksRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const speakWord = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  }, []);

  const bookMap = useMemo(() => {
    const map = new Map<number, BookListItem>();
    for (const b of books) {
      map.set(b.id, b);
    }
    return map;
  }, [books]);

  const groupedByBook = useMemo(() => {
    const groups = new Map<number | 'unassigned', VocabularyWord[]>();
    for (const w of words) {
      const key = w.book_id ?? 'unassigned';
      const arr = groups.get(key) || [];
      arr.push(w);
      groups.set(key, arr);
    }
    return groups;
  }, [words]);

  const handleToggleMastered = useCallback(async (word: VocabularyWord) => {
    const nextMastered = !word.is_mastered;
    setWords((prev) =>
      prev.map((w) => (w.id === word.id ? { ...w, is_mastered: nextMastered } : w)),
    );
    try {
      const updated = await updateVocabularyWord(word.id, { is_mastered: nextMastered });
      setWords((prev) => prev.map((w) => (w.id === word.id ? updated : w)));
    } catch {
      setWords((prev) =>
        prev.map((w) => (w.id === word.id ? { ...w, is_mastered: word.is_mastered } : w)),
      );
    }
  }, []);

  const handleDelete = useCallback(async (wordId: number) => {
    try {
      await deleteVocabularyWord(wordId);
      setWords((prev) => prev.filter((w) => w.id !== wordId));
    } catch {
      // ignore
    }
  }, []);

  const startEditing = useCallback((word: VocabularyWord) => {
    setEditingId(word.id);
    setEditForm({
      word: word.word,
      phonetic: word.phonetic || '',
      definition: word.definition || '',
      sentence_context: word.sentence_context || '',
      sentence_context_translated: word.sentence_context_translated || '',
      translation: word.translation || '',
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleEditChange = useCallback((field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(
    async (wordId: number) => {
      try {
        const updated = await updateVocabularyWord(wordId, {
          word: editForm.word,
          phonetic: editForm.phonetic || null,
          definition: editForm.definition || null,
          sentence_context: editForm.sentence_context || null,
          sentence_context_translated: editForm.sentence_context_translated || null,
          translation: editForm.translation || null,
        });
        setWords((prev) => prev.map((w) => (w.id === wordId ? updated : w)));
        setEditingId(null);
      } catch {
        // ignore
      }
    },
    [editForm],
  );

  const generateQuizOptions = useCallback(
    (targetWord: VocabularyWord, allWordsPool: VocabularyWord[]) => {
      const correct = targetWord.translation || targetWord.definition || '—';
      const others = allWordsPool
        .filter((w) => w.id !== targetWord.id && (w.translation || w.definition))
        .map((w) => w.translation || w.definition || '')
        .filter((t) => t && t !== correct);

      const uniqueOthers = Array.from(new Set(others));
      const shuffledOthers = uniqueOthers.sort(() => Math.random() - 0.5).slice(0, 3);
      const fallbackPool = [
        'სიჩუმე, სიმშვიდე',
        'გადაწყვეტილების მიღება',
        'უცნაური, მოულოდნელი',
        'სწრაფად გაქცევა',
      ];
      for (const fb of fallbackPool) {
        if (shuffledOthers.length >= 3) break;
        if (fb !== correct && !shuffledOthers.includes(fb)) {
          shuffledOthers.push(fb);
        }
      }
      return [correct, ...shuffledOthers].sort(() => Math.random() - 0.5);
    },
    [],
  );

  const startGame = useCallback(
    (scope: 'all' | number | 'unassigned', mode: GameType = gameType) => {
      setGameBookScope(scope);
      setGameType(mode);

      const eligible = words.filter((w) => {
        if (w.is_mastered) return false;
        if (scope === 'all') return true;
        if (scope === 'unassigned') return w.book_id == null;
        return w.book_id === scope;
      });

      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      setGameQueue(shuffled);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setSelectedAnswer(null);
      setScore({ correct: 0, total: 0 });
      setGameFinished(false);
      setIsGameOpen(true);

      if (shuffled.length > 0) {
        setQuizOptions(generateQuizOptions(shuffled[0], words));
      }
    },
    [words, gameType, generateQuizOptions],
  );

  const currentGameWord = gameQueue[currentCardIndex] || null;

  const advanceToNextCard = useCallback(
    (nextQueue: VocabularyWord[], nextIdx: number) => {
      if (nextIdx >= nextQueue.length) {
        setGameFinished(true);
      } else {
        setCurrentCardIndex(nextIdx);
        setIsFlipped(false);
        setSelectedAnswer(null);
        setQuizOptions(generateQuizOptions(nextQueue[nextIdx], words));
      }
    },
    [generateQuizOptions, words],
  );

  const handleSelectQuizOption = useCallback(
    (option: string) => {
      if (selectedAnswer !== null || !currentGameWord) return;
      setSelectedAnswer(option);
      const correctAns = currentGameWord.translation || currentGameWord.definition || '—';
      const isCorrect = option === correctAns;
      setScore((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));
    },
    [selectedAnswer, currentGameWord],
  );

  const handleMarkMasteredInGame = useCallback(
    async (word: VocabularyWord) => {
      await handleToggleMastered(word);
      const updatedQueue = gameQueue.filter((w) => w.id !== word.id);
      setGameQueue(updatedQueue);
      if (updatedQueue.length === 0 || currentCardIndex >= updatedQueue.length) {
        setGameFinished(true);
      } else {
        setIsFlipped(false);
        setSelectedAnswer(null);
        setQuizOptions(generateQuizOptions(updatedQueue[currentCardIndex], words));
      }
    },
    [handleToggleMastered, gameQueue, currentCardIndex, generateQuizOptions, words],
  );

  const totalWordsCount = words.length;
  const masteredCount = words.filter((w) => w.is_mastered).length;
  const learningCount = totalWordsCount - masteredCount;

  const visibleGroups = useMemo(() => {
    const entries = Array.from(groupedByBook.entries());
    if (selectedBookFilter === 'all') return entries;
    return entries.filter(([key]) => key === selectedBookFilter);
  }, [groupedByBook, selectedBookFilter]);

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
    <AppLayout
      headerActions={
        learningCount > 0 ? (
          <button
            onClick={() => startGame(selectedBookFilter, 'quiz')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors"
            style={{
              backgroundColor: 'var(--app-accent)',
              color: '#ffffff',
            }}
          >
            <span>🎮</span>
            <span className="hidden sm:inline">
              {selectedBookFilter === 'all'
                ? `${t.vocabPlayAll} (${learningCount})`
                : t.vocabPlayBook}
            </span>
          </button>
        ) : undefined
      }
    >
      {/* Top Stats Bar */}
      <div
        className="rounded-xl p-4 sm:p-5 border mb-6 flex flex-wrap items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div>
          <h1 className="text-base sm:text-lg font-bold" style={{ color: 'var(--app-text)' }}>
            {t.vocabTitle}
          </h1>
          <div className="flex items-center gap-3 text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
            <span>
              {t.vocabTotal}: <strong style={{ color: 'var(--app-text)' }}>{totalWordsCount}</strong>
            </span>
            <span>·</span>
            <span className="text-emerald-400 font-medium">
              {t.vocabMastered}: {masteredCount}
            </span>
            <span>·</span>
            <span style={{ color: 'var(--app-accent)' }}>
              {t.vocabLearning}: {learningCount}
            </span>
          </div>
        </div>

        {learningCount > 0 && (
          <button
            onClick={() => startGame(selectedBookFilter, 'quiz')}
            className="sm:hidden px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--app-accent)',
              color: '#ffffff',
            }}
          >
            <span>🎮</span>
            <span>{t.vocabPlayAll}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 mb-6 rounded-xl border text-xs text-red-400 bg-red-500/10 border-red-500/20">
          {error}
        </div>
      )}

      {words.length === 0 ? (
        <div
          className="text-center py-16 px-4 rounded-2xl border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <p className="text-base font-medium" style={{ color: 'var(--app-text)' }}>
            {t.vocabEmpty}
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--app-text-muted)' }}>
            {t.vocabEmptyDesc}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Book Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedBookFilter('all')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border whitespace-nowrap shrink-0"
              style={{
                backgroundColor: selectedBookFilter === 'all' ? 'var(--app-accent-subtle)' : 'var(--bg-surface)',
                borderColor: selectedBookFilter === 'all' ? 'var(--app-accent)' : 'var(--border-subtle)',
                color: selectedBookFilter === 'all' ? 'var(--app-accent)' : 'var(--app-text-muted)',
              }}
            >
              {t.vocabAllBooks} ({words.length})
            </button>

            {Array.from(groupedByBook.entries()).map(([bookKey, groupWords]) => {
              const bookObj = typeof bookKey === 'number' ? bookMap.get(bookKey) : null;
              const label =
                bookObj?.title || (bookKey === 'unassigned' ? 'Writing Studio' : `#${bookKey}`);
              const active = selectedBookFilter === bookKey;

              return (
                <button
                  key={String(bookKey)}
                  onClick={() => setSelectedBookFilter(bookKey)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: active ? 'var(--app-accent-subtle)' : 'var(--bg-surface)',
                    borderColor: active ? 'var(--app-accent)' : 'var(--border-subtle)',
                    color: active ? 'var(--app-accent)' : 'var(--app-text-muted)',
                  }}
                >
                  <span className="truncate max-w-[140px]">{label}</span>
                  <span className="text-[10px] opacity-70">({groupWords.length})</span>
                </button>
              );
            })}
          </div>

          {/* Grouped Word Lists */}
          <div className="space-y-6">
            {visibleGroups.map(([bookKey, groupWords]) => {
              const bookObj = typeof bookKey === 'number' ? bookMap.get(bookKey) : null;
              const bookTitle =
                bookObj?.title || (bookKey === 'unassigned' ? 'Writing Studio & Free Vocabulary' : `#${bookKey}`);
              const bookAuthor = bookObj?.author;
              const masteredInGroup = groupWords.filter((w) => w.is_mastered).length;
              const unmasteredInGroup = groupWords.length - masteredInGroup;

              return (
                <section
                  key={String(bookKey)}
                  className="rounded-xl border p-4 sm:p-5 space-y-4"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {/* Group Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm sm:text-base font-bold" style={{ color: 'var(--app-text)' }}>
                          {bookTitle}
                        </h2>
                        {typeof bookKey === 'number' && (
                          <button
                            onClick={() => navigate(`/reader/${bookKey}`)}
                            className="text-xs underline font-medium cursor-pointer"
                            style={{ color: 'var(--app-accent)' }}
                          >
                            {t.vocabGoToBook}
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                        {bookAuthor ? `${bookAuthor} · ` : ''}
                        {t.vocabTotal} {groupWords.length} ·{' '}
                        <span className="text-emerald-400">{masteredInGroup} {t.vocabMastered}</span> ·{' '}
                        <span>{unmasteredInGroup} {t.vocabLearning}</span>
                      </p>
                    </div>

                    {unmasteredInGroup > 0 && (
                      <button
                        onClick={() => startGame(bookKey, 'quiz')}
                        className="px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-canvas)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--app-text)',
                        }}
                      >
                        🎯 {t.vocabPracticeWords} ({unmasteredInGroup})
                      </button>
                    )}
                  </div>

                  {/* Words Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {groupWords.map((word) => {
                      const isMastered = Boolean(word.is_mastered);

                      return (
                        <div
                          key={word.id}
                          className="rounded-xl p-3.5 border transition-all"
                          style={{
                            backgroundColor: isMastered ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-canvas)',
                            borderColor: isMastered ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-subtle)',
                          }}
                        >
                          {editingId === word.id ? (
                            /* Edit mode */
                            <div className="space-y-2.5">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editForm.word}
                                  onChange={(e) => handleEditChange('word', e.target.value)}
                                  placeholder="Word"
                                  className="w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--app-text)',
                                  }}
                                />
                                <input
                                  type="text"
                                  value={editForm.phonetic}
                                  onChange={(e) => handleEditChange('phonetic', e.target.value)}
                                  placeholder="Phonetic"
                                  className="w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--app-text)',
                                  }}
                                />
                              </div>
                              <input
                                type="text"
                                value={editForm.translation}
                                onChange={(e) => handleEditChange('translation', e.target.value)}
                                placeholder="Translation"
                                className="w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--app-text)',
                                }}
                              />
                              <textarea
                                value={editForm.definition}
                                onChange={(e) => handleEditChange('definition', e.target.value)}
                                rows={2}
                                placeholder="Definition"
                                className="w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none resize-none"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--app-text)',
                                }}
                              />
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  onClick={cancelEditing}
                                  className="px-2.5 py-1 text-xs rounded-lg border cursor-pointer"
                                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--app-text-muted)' }}
                                >
                                  {t.cancel}
                                </button>
                                <button
                                  onClick={() => handleSave(word.id)}
                                  className="px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer"
                                  style={{ backgroundColor: 'var(--app-accent)', color: '#ffffff' }}
                                >
                                  {t.save}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* View mode */
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3
                                    className="text-sm sm:text-base font-bold truncate"
                                    style={{ color: isMastered ? '#10b981' : 'var(--app-text)' }}
                                  >
                                    {word.word}
                                  </h3>
                                  <button
                                    onClick={() => speakWord(word.word)}
                                    className="p-1 rounded-md text-xs cursor-pointer hover:bg-white/5"
                                    style={{ color: 'var(--app-text-muted)' }}
                                    title={t.vocabPronounce}
                                  >
                                    🔊
                                  </button>
                                  {word.phonetic && (
                                    <span className="text-[11px] font-mono" style={{ color: 'var(--app-text-muted)' }}>
                                      /{word.phonetic}/
                                    </span>
                                  )}
                                </div>

                                {word.translation && (
                                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--app-text)' }}>
                                    {word.translation}
                                  </p>
                                )}

                                {word.definition && (
                                  <p className="text-[11px] line-clamp-2 mb-1.5" style={{ color: 'var(--app-text-muted)' }}>
                                    {word.definition}
                                  </p>
                                )}

                                {word.sentence_context && (
                                  <p className="text-[11px] italic line-clamp-2" style={{ color: 'var(--app-text-muted)' }}>
                                    "{word.sentence_context}"
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleToggleMastered(word)}
                                  className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                    isMastered
                                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                      : 'hover:border-strong'
                                  }`}
                                  style={{
                                    borderColor: isMastered ? undefined : 'var(--border-subtle)',
                                    color: isMastered ? undefined : 'var(--app-text-muted)',
                                  }}
                                  title={isMastered ? t.vocabLearned : t.vocabMarkLearned}
                                >
                                  {isMastered ? '✓' : '○'}
                                </button>
                                <button
                                  onClick={() => startEditing(word)}
                                  className="p-1.5 rounded-lg border text-xs cursor-pointer hover:border-strong"
                                  style={{
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--app-text-muted)',
                                  }}
                                  title={t.edit}
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleDelete(word.id)}
                                  className="p-1.5 rounded-lg border text-xs cursor-pointer hover:border-red-500/30 hover:text-red-400"
                                  style={{
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--app-text-muted)',
                                  }}
                                  title={t.delete}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Mini-Game Modal */}
      {isGameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-2xl border p-5 sm:p-6 space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-accent)' }}>
                🎮 {gameType === 'quiz' ? 'Quiz Challenge' : 'Flashcards'}
              </span>
              <button
                onClick={() => setIsGameOpen(false)}
                className="p-1 rounded-lg text-xs cursor-pointer"
                style={{ color: 'var(--app-text-muted)' }}
              >
                ✕
              </button>
            </div>

            {gameFinished ? (
              <div className="text-center py-6 space-y-3">
                <div className="text-4xl">🏆</div>
                <h4 className="text-base font-bold" style={{ color: 'var(--app-text)' }}>
                  რაუნდი დასრულდა!
                </h4>
                {gameType === 'quiz' && (
                  <p className="text-xs font-semibold" style={{ color: 'var(--app-accent)' }}>
                    შედეგი: {score.correct} / {score.total} სწორი
                  </p>
                )}
                <div className="flex justify-center gap-2.5 pt-2">
                  <button
                    onClick={() => startGame(gameBookScope, gameType)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                    style={{ backgroundColor: 'var(--app-accent)', color: '#ffffff' }}
                  >
                    🔄 თავიდან
                  </button>
                  <button
                    onClick={() => setIsGameOpen(false)}
                    className="px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--app-text-muted)' }}
                  >
                    დახურვა
                  </button>
                </div>
              </div>
            ) : (
              currentGameWord && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    <span>
                      {currentCardIndex + 1} / {gameQueue.length}
                    </span>
                    {gameType === 'quiz' && (
                      <span className="font-semibold text-emerald-400">
                        {score.correct} / {score.total}
                      </span>
                    )}
                  </div>

                  <div
                    className="rounded-xl border p-5 text-center space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-canvas)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <h2 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>
                        {currentGameWord.word}
                      </h2>
                      <button
                        onClick={() => speakWord(currentGameWord.word)}
                        className="p-1.5 rounded-lg text-xs cursor-pointer hover:bg-white/5"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        🔊
                      </button>
                    </div>
                    {currentGameWord.phonetic && (
                      <p className="text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>
                        /{currentGameWord.phonetic}/
                      </p>
                    )}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 gap-2">
                    {quizOptions.map((opt, idx) => {
                      const correctAns = currentGameWord.translation || currentGameWord.definition || '—';
                      const isSelected = selectedAnswer === opt;
                      const isCorrect = opt === correctAns;

                      let customStyle: React.CSSProperties = {
                        backgroundColor: 'var(--bg-canvas)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--app-text)',
                      };

                      if (selectedAnswer !== null) {
                        if (isCorrect) {
                          customStyle = {
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            borderColor: '#10b981',
                            color: '#10b981',
                            fontWeight: 600,
                          };
                        } else if (isSelected) {
                          customStyle = {
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            borderColor: '#ef4444',
                            color: '#ef4444',
                          };
                        } else {
                          customStyle = {
                            opacity: 0.4,
                            backgroundColor: 'var(--bg-canvas)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--app-text-muted)',
                          };
                        }
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectQuizOption(opt)}
                          disabled={selectedAnswer !== null}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl border text-xs transition-all cursor-pointer"
                          style={customStyle}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      onClick={() => handleMarkMasteredInGame(currentGameWord)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border text-emerald-400 border-emerald-500/30"
                    >
                      ✓ ვიცი
                    </button>
                    <button
                      onClick={() => advanceToNextCard(gameQueue, currentCardIndex + 1)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ backgroundColor: 'var(--app-accent)', color: '#ffffff' }}
                    >
                      შემდეგი →
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <SettingsModal isOpen={settings.isSettingsOpen} onClose={settings.closeSettings} />
    </AppLayout>
  );
}
