import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  listVocabularyWords,
  deleteVocabularyWord,
  updateVocabularyWord,
  type VocabularyWord,
} from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function VocabularyPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const fetchWords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listVocabularyWords();
      setWords(result.words);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWords();
  }, [fetchWords]);

  const handleDelete = useCallback(async (wordId: number) => {
    try {
      await deleteVocabularyWord(wordId);
      setWords(prev => prev.filter(w => w.id !== wordId));
    } catch (err) {
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

  const handleEditChange = useCallback(
    (field: string, value: string) => {
      setEditForm(prev => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSave = useCallback(async (wordId: number) => {
    try {
      const updated = await updateVocabularyWord(wordId, {
        word: editForm.word,
        phonetic: editForm.phonetic || null,
        definition: editForm.definition || null,
        sentence_context: editForm.sentence_context || null,
        sentence_context_translated: editForm.sentence_context_translated || null,
        translation: editForm.translation || null,
      });
      setWords(prev => prev.map(w => (w.id === wordId ? updated : w)));
      setEditingId(null);
    } catch (err) {
      // silently fail
    }
  }, [editForm]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleBack = useCallback(() => {
    navigate('/library');
  }, [navigate]);

  return (
    <div className="min-h-screen from-gray-900 via-purple-900 to-gray-900 bg-gradient-to-br">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-6 py-4 border-b border-white/10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
              title="Back to Library"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-white">My Vocabulary</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner message="Loading vocabulary..." />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {!loading && !error && words.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-white/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-lg text-white/50 mb-2">Your vocabulary is empty</p>
            <p className="text-sm text-white/30">Translate words in the reader to save them here</p>
          </div>
        )}

        {!loading && !error && words.length > 0 && (
          <div className="grid gap-4">
            {words.map((word) => (
              <div
                key={word.id}
                className="glass rounded-xl p-5 border border-white/10 hover:border-purple-500/30 transition-all duration-200"
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
                          placeholder="/pronunciation/"
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
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Sentence Context</label>
                        <textarea
                          value={editForm.sentence_context}
                          onChange={(e) => handleEditChange('sentence_context', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 mb-1">Context Translated</label>
                        <textarea
                          value={editForm.sentence_context_translated}
                          onChange={(e) => handleEditChange('sentence_context_translated', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50 resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(word.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ---- View mode ---- */
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-white">{word.word}</h3>
                        {word.phonetic && (
                          <span className="text-xs text-white/50 italic">/{word.phonetic}/</span>
                        )}
                      </div>

                      {word.translation && (
                        <div className="mb-2">
                          <span className="text-amber-400 font-medium">{word.translation}</span>
                        </div>
                      )}

                      {word.definition && (
                        <p className="text-sm text-white/70 mb-1">{word.definition}</p>
                      )}

                      {word.sentence_context && (
                        <div className="mt-1">
                          <p className="text-xs text-white/40 italic">
                            "{word.sentence_context}"
                          </p>
                          {word.sentence_context_translated && (
                            <p className="text-xs text-amber-400/60 mt-0.5">
                              {word.sentence_context_translated}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 flex flex-col gap-1">
                      <button
                        onClick={() => startEditing(word)}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
                        title="Edit word"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(word.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                        title="Remove from vocabulary"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}