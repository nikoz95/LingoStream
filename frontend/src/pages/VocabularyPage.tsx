import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/i18n';
import LanguageToggle from '../components/LanguageToggle';
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
  const { logout } = useAuth();
  const { t } = useLanguage();
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

  // Audio pronunciation helper
  const speakWord = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  }, []);

  // Book lookup map
  const bookMap = useMemo(() => {
    const map = new Map<number, BookListItem>();
    for (const b of books) {
      map.set(b.id, b);
    }
    return map;
  }, [books]);

  // Group words by book_id
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

  // Toggle "is_mastered" (learned status)
  const handleToggleMastered = useCallback(async (word: VocabularyWord) => {
    const nextMastered = !word.is_mastered;
    // Optimistic update
    setWords((prev) =>
      prev.map((w) => (w.id === word.id ? { ...w, is_mastered: nextMastered } : w)),
    );
    try {
      const updated = await updateVocabularyWord(word.id, { is_mastered: nextMastered });
      setWords((prev) => prev.map((w) => (w.id === word.id ? updated : w)));
    } catch {
      // Revert on failure
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
      // silently fail
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
        // silently fail
      }
    },
    [editForm],
  );

  // ── Mini-Game Logic ──────────────────────────────────────────────────────

  const generateQuizOptions = useCallback(
    (targetWord: VocabularyWord, allWordsPool: VocabularyWord[]) => {
      const correct = targetWord.translation || targetWord.definition || '—';
      const others = allWordsPool
        .filter((w) => w.id !== targetWord.id && (w.translation || w.definition))
        .map((w) => w.translation || w.definition || '')
        .filter((t) => t && t !== correct);

      // Unique distractors
      const uniqueOthers = Array.from(new Set(others));
      const shuffledOthers = uniqueOthers.sort(() => Math.random() - 0.5).slice(0, 3);

      // Fallback generic distractors if user has fewer than 4 words saved
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

      // Filter only UNMASTERED words (!is_mastered) for the chosen book or all books
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

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleBack = useCallback(() => {
    navigate('/library');
  }, [navigate]);

  // Statistics
  const totalWordsCount = words.length;
  const masteredCount = words.filter((w) => w.is_mastered).length;
  const learningCount = totalWordsCount - masteredCount;

  // Filtered groups to display
  const visibleGroups = useMemo(() => {
    const entries = Array.from(groupedByBook.entries());
    if (selectedBookFilter === 'all') return entries;
    return entries.filter(([key]) => key === selectedBookFilter);
  }, [groupedByBook, selectedBookFilter]);

  return (
    <div className="min-h-screen from-gray-950 via-purple-950/60 to-gray-950 bg-gradient-to-br text-white">
      {/* Header */}
      <header className="glass sticky top-0 z-40 px-6 py-4 border-b border-white/10">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
              title={t.back}
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">{t.vocabTitle}</h1>
              <p className="text-xs text-white/50">
                {t.vocabTotal}: {totalWordsCount} • <span className="text-emerald-400">{t.vocabMastered}: {masteredCount}</span> •{' '}
                <span className="text-purple-300">{t.vocabLearning}: {learningCount}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle />
            <button
              onClick={() => navigate('/writing')}
              className="px-4 py-2 text-sm rounded-xl border border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/20 text-white font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
              <span>✍️</span>
              <span>{t.navWriting}</span>
            </button>
            {learningCount > 0 && (
              <button
                onClick={() => startGame(selectedBookFilter, 'quiz')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>🎮</span>
                <span>
                  {selectedBookFilter === 'all'
                    ? `${t.vocabPlayAll} (${learningCount})`
                    : t.vocabPlayBook}
                </span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              {t.navSignOut}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner message="ლექსიკონი იტვირთება..." />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && words.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-white/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <p className="text-lg text-white/50 mb-2">{t.vocabEmpty}</p>
            <p className="text-sm text-white/30">{t.vocabEmptyDesc}</p>
          </div>
        )}

        {!loading && !error && words.length > 0 && (
          <>
            {/* Book Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedBookFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                  selectedBookFilter === 'all'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/25'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                }`}
              >
                📚 {t.vocabAllBooks} ({words.length})
              </button>

              {Array.from(groupedByBook.entries()).map(([bookKey, groupWords]) => {
                const bookObj = typeof bookKey === 'number' ? bookMap.get(bookKey) : null;
                const label =
                  bookObj?.title || (bookKey === 'unassigned' ? 'Writing / General' : `#${bookKey}`);
                const active = selectedBookFilter === bookKey;
                const unmasteredInBook = groupWords.filter((w) => !w.is_mastered).length;

                return (
                  <button
                    key={String(bookKey)}
                    onClick={() => setSelectedBookFilter(bookKey)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border flex items-center gap-2 cursor-pointer ${
                      active
                        ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/25'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <span className="truncate max-w-[180px]">📖 {label}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-black/30 text-[10px]">
                      {groupWords.length} ({unmasteredInBook} {t.vocabLearning})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Grouped Word Sections */}
            <div className="space-y-10">
              {visibleGroups.map(([bookKey, groupWords]) => {
                const bookObj = typeof bookKey === 'number' ? bookMap.get(bookKey) : null;
                const bookTitle =
                  bookObj?.title || (bookKey === 'unassigned' ? 'Writing & General Vocabulary' : `#${bookKey}`);
                const bookAuthor = bookObj?.author;
                const masteredInGroup = groupWords.filter((w) => w.is_mastered).length;
                const unmasteredInGroup = groupWords.length - masteredInGroup;

                return (
                  <section
                    key={String(bookKey)}
                    className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 space-y-5"
                  >
                    {/* Group Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg">
                          📖
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-white">{bookTitle}</h2>
                            {typeof bookKey === 'number' && (
                              <button
                                onClick={() => navigate(`/read/${bookKey}`)}
                                className="text-xs text-purple-400 hover:text-purple-300 underline"
                              >
                                {t.vocabGoToBook}
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-white/50">
                            {bookAuthor ? `${bookAuthor} • ` : ''}
                            {t.vocabTotal} {groupWords.length} •{' '}
                            <span className="text-emerald-400">{masteredInGroup} {t.vocabMastered}</span> •{' '}
                            <span className="text-amber-300">{unmasteredInGroup} {t.vocabLearning}</span>
                          </p>
                        </div>
                      </div>

                      {unmasteredInGroup > 0 && (
                        <button
                          onClick={() => startGame(bookKey, 'quiz')}
                          className="px-3.5 py-2 rounded-xl bg-purple-600/25 hover:bg-purple-600 border border-purple-500/40 text-xs font-semibold text-purple-200 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>🎯</span>
                          <span>{t.vocabPracticeWords} ({unmasteredInGroup})</span>
                        </button>
                      )}
                    </div>

                    {/* Words Grid */}
                    <div className="grid gap-3">
                      {groupWords.map((word) => {
                        const isMastered = Boolean(word.is_mastered);

                        return (
                          <div
                            key={word.id}
                            className={`rounded-xl p-4 border transition-all duration-200 ${
                              isMastered
                                ? 'bg-emerald-950/30 border-emerald-500/40 shadow-sm shadow-emerald-500/5'
                                : 'glass border-white/10 hover:border-purple-500/30'
                            }`}
                          >
                            {editingId === word.id ? (
                              /* ---- Edit mode ---- */
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs text-white/40 mb-1">Word</label>
                                    <input
                                      type="text"
                                      value={editForm.word}
                                      onChange={(e) => handleEditChange('word', e.target.value)}
                                      className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-white/40 mb-1">Phonetic</label>
                                    <input
                                      type="text"
                                      value={editForm.phonetic}
                                      onChange={(e) => handleEditChange('phonetic', e.target.value)}
                                      className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs text-white/40 mb-1">Translation</label>
                                  <input
                                    type="text"
                                    value={editForm.translation}
                                    onChange={(e) => handleEditChange('translation', e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-white/40 mb-1">Definition</label>
                                  <textarea
                                    value={editForm.definition}
                                    onChange={(e) => handleEditChange('definition', e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50 resize-none"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    onClick={cancelEditing}
                                    className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                  >
                                    გაუქმება
                                  </button>
                                  <button
                                    onClick={() => handleSave(word.id)}
                                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
                                  >
                                    შენახვა
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* ---- View mode ---- */
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h3
                                      className={`text-lg font-bold ${
                                        isMastered ? 'text-emerald-300' : 'text-white'
                                      }`}
                                    >
                                      {word.word}
                                    </h3>
                                    <button
                                      onClick={() => speakWord(word.word)}
                                      className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
                                      title="გამოთქმა"
                                    >
                                      🔊
                                    </button>
                                    {word.phonetic && (
                                      <span className="text-xs text-white/50 font-mono">
                                        /{word.phonetic}/
                                      </span>
                                    )}
                                    {isMastered && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        ✓ ვიცი (ნასწავლია)
                                      </span>
                                    )}
                                  </div>

                                  {word.translation && (
                                    <div className="mb-1.5">
                                      <span
                                        className={`font-semibold ${
                                          isMastered ? 'text-emerald-200' : 'text-amber-400'
                                        }`}
                                      >
                                        {word.translation}
                                      </span>
                                    </div>
                                  )}

                                  {word.definition && (
                                    <p className="text-sm text-white/70 mb-1.5">{word.definition}</p>
                                  )}

                                  {word.sentence_context && (
                                    <div className="mt-1 border-l-2 border-white/15 pl-3">
                                      <p className="text-xs text-white/50 italic">
                                        "{word.sentence_context}"
                                      </p>
                                      {word.sentence_context_translated && (
                                        <p className="text-xs text-amber-300/70 mt-0.5">
                                          "{word.sentence_context_translated}"
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Right Action Buttons: Mark as Known (Green) + Edit + Delete */}
                                <div className="flex-shrink-0 flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleToggleMastered(word)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer flex items-center gap-1 ${
                                      isMastered
                                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/20'
                                        : 'bg-white/5 hover:bg-emerald-600/20 text-white/70 hover:text-emerald-300 border-white/10 hover:border-emerald-500/40'
                                    }`}
                                    title={
                                      isMastered
                                        ? 'მონიშნულია როგორც ნასწავლი (დააჭირეთ სასწავლ სიაში დასაბრუნებლად)'
                                        : 'მონიშნეთ მწვანედ როგორც უკვე ნასწავლი (აღარ შეგხვდებათ თამაშში)'
                                    }
                                  >
                                    <span>✓</span>
                                    <span>{isMastered ? 'ნასწავლია' : 'ვიცი'}</span>
                                  </button>

                                  <button
                                    onClick={() => startEditing(word)}
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                    title="რედაქტირება"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>

                                  <button
                                    onClick={() => handleDelete(word.id)}
                                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                                    title="წაშლა"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
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
          </>
        )}
      </div>

      {/* ── Vocabulary Memorization Game Modal ── */}
      {isGameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-gray-900 border border-white/15 rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-6 relative">
            {/* Modal Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>🎮</span>
                  <span>სიტყვების სწავლა და დაზეპირება</span>
                </h3>
                <p className="text-xs text-white/50">
                  მწვანედ მონიშნული („ვიცი“) სიტყვები თამაშში არ მონაწილეობს
                </p>
              </div>

              <button
                onClick={() => setIsGameOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Game Controls: Book Scope + Game Mode */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Scope selector: All Books vs Specific Book */}
              <select
                value={String(gameBookScope)}
                onChange={(e) => {
                  const val = e.target.value;
                  const parsed =
                    val === 'all' ? 'all' : val === 'unassigned' ? 'unassigned' : Number(val);
                  startGame(parsed, gameType);
                }}
                className="bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="all" className="bg-gray-900">
                  📚 ყველა წიგნის სიტყვები
                </option>
                {Array.from(groupedByBook.keys()).map((k) => {
                  const b = typeof k === 'number' ? bookMap.get(k) : null;
                  const title = b?.title || (k === 'unassigned' ? 'ზოგადი სიტყვები' : `წიგნი #${k}`);
                  return (
                    <option key={String(k)} value={String(k)} className="bg-gray-900">
                      📖 {title}
                    </option>
                  );
                })}
              </select>

              {/* Mode Switcher: Quiz vs Flashcards */}
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
                <button
                  onClick={() => startGame(gameBookScope, 'quiz')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    gameType === 'quiz' ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  🧠 ქვიზი (4 სავარაუდო)
                </button>
                <button
                  onClick={() => startGame(gameBookScope, 'flashcards')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    gameType === 'flashcards'
                      ? 'bg-purple-600 text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  🃏 ბარათები (Flashcards)
                </button>
              </div>
            </div>

            {/* Game Body */}
            {gameQueue.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="text-4xl">🎉</div>
                <h4 className="text-lg font-bold text-emerald-300">
                  ყველა სიტყვა უკვე ნასწავლი გაქვთ!
                </h4>
                <p className="text-xs text-white/50">
                  ამ კატეგორიაში სასწავლი სიტყვები აღარ დარჩა.
                </p>
              </div>
            ) : gameFinished ? (
              <div className="py-10 text-center space-y-4">
                <div className="text-5xl">🏆</div>
                <h4 className="text-xl font-bold text-white">რაუნდი დასრულდა!</h4>
                {gameType === 'quiz' && (
                  <p className="text-sm text-purple-300 font-semibold">
                    შედეგი: {score.correct} სწორი პასუხი {score.total}-დან
                  </p>
                )}
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => startGame(gameBookScope, gameType)}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all"
                  >
                    🔄 თავიდან დაწყება
                  </button>
                  <button
                    onClick={() => setIsGameOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
                  >
                    დახურვა
                  </button>
                </div>
              </div>
            ) : (
              currentGameWord && (
                <div className="space-y-5">
                  {/* Progress indicator */}
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>
                      სიტყვა {currentCardIndex + 1} / {gameQueue.length}
                    </span>
                    {gameType === 'quiz' && (
                      <span className="text-emerald-400 font-semibold">
                        ქულა: {score.correct} / {score.total}
                      </span>
                    )}
                  </div>

                  {/* Word Card */}
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <h2 className="text-3xl font-extrabold text-white tracking-tight">
                        {currentGameWord.word}
                      </h2>
                      <button
                        onClick={() => speakWord(currentGameWord.word)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-purple-500/30 text-white transition-colors"
                        title="მოსმენა"
                      >
                        🔊
                      </button>
                    </div>
                    {currentGameWord.phonetic && (
                      <p className="text-xs font-mono text-purple-300">
                        /{currentGameWord.phonetic}/
                      </p>
                    )}
                    {currentGameWord.sentence_context && (
                      <p className="text-xs text-white/50 italic max-w-md mx-auto">
                        "{currentGameWord.sentence_context}"
                      </p>
                    )}
                  </div>

                  {/* QUIZ MODE */}
                  {gameType === 'quiz' && (
                    <div className="grid grid-cols-1 gap-2.5">
                      {quizOptions.map((option, idx) => {
                        const correctAns =
                          currentGameWord.translation || currentGameWord.definition || '—';
                        const isSelected = selectedAnswer === option;
                        const isCorrect = option === correctAns;

                        let btnClass =
                          'bg-white/5 hover:bg-white/10 border-white/10 text-white/90';
                        if (selectedAnswer !== null) {
                          if (isCorrect) {
                            btnClass =
                              'bg-emerald-600/30 border-emerald-400 text-emerald-200 font-semibold';
                          } else if (isSelected) {
                            btnClass = 'bg-red-600/30 border-red-400 text-red-200';
                          } else {
                            btnClass = 'bg-white/5 border-white/5 text-white/40';
                          }
                        }

                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectQuizOption(option)}
                            disabled={selectedAnswer !== null}
                            className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer ${btnClass}`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* FLASHCARD MODE */}
                  {gameType === 'flashcards' && (
                    <div className="text-center">
                      {!isFlipped ? (
                        <button
                          onClick={() => setIsFlipped(true)}
                          className="w-full py-6 rounded-2xl border border-dashed border-purple-400/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 text-sm font-semibold transition-all cursor-pointer"
                        >
                          👁️ დააჭირეთ თარგმანის სანახავად
                        </button>
                      ) : (
                        <div className="p-5 rounded-2xl bg-purple-950/40 border border-purple-500/30 space-y-2 animate-fadeIn">
                          <div className="text-lg font-bold text-amber-300">
                            {currentGameWord.translation}
                          </div>
                          {currentGameWord.definition && (
                            <p className="text-xs text-white/70">{currentGameWord.definition}</p>
                          )}
                          {currentGameWord.sentence_context_translated && (
                            <p className="text-xs text-amber-200/80 italic">
                              "{currentGameWord.sentence_context_translated}"
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom Game Actions */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                    <button
                      onClick={() => handleMarkMasteredInGame(currentGameWord)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>✓</span>
                      <span>უკვე ვიცი (მწვანედ მონიშვნა)</span>
                    </button>

                    <button
                      onClick={() => advanceToNextCard(gameQueue, currentCardIndex + 1)}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all cursor-pointer"
                    >
                      შემდეგი სიტყვა →
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
