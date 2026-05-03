import { useState } from 'react';
import type { WordTranslationResult } from '../hooks/useTranslation';
import type { VocabularyWord } from '../lib/api';
import { updateVocabularyWord } from '../lib/api';
import LoadingSpinner from './LoadingSpinner';

interface TranslationPanelProps {
  selectedText: string;
  translationResult: { original: string; translation: string } | null;
  wordResult: WordTranslationResult | null;
  translationError: string;
  translating: boolean;
  provider: string;
  onProviderChange: (provider: string) => void;
  onTranslate: () => void;
  onClose: () => void;
  onSaveToVocabulary: () => void;
  savedToVocabulary: boolean;
  existingWord: VocabularyWord | null;
  checkingExisting: boolean;
  onVocabularyUpdated: (word: VocabularyWord) => void;
}

const PROVIDERS = [
  { value: '', label: 'Default' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
];

export default function TranslationPanel({
  selectedText,
  translationResult,
  wordResult,
  translationError,
  translating,
  provider,
  onProviderChange,
  onTranslate,
  onClose,
  onSaveToVocabulary,
  savedToVocabulary,
  existingWord,
  checkingExisting,
  onVocabularyUpdated,
}: TranslationPanelProps) {
  const showWordDetails = wordResult !== null;
  const [editingWord, setEditingWord] = useState<VocabularyWord | null>(null);
  const [editPhonetic, setEditPhonetic] = useState('');
  const [editDefinition, setEditDefinition] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editContextTranslated, setEditContextTranslated] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const openEditModal = (word: VocabularyWord) => {
    setEditingWord(word);
    setEditPhonetic(word.phonetic || '');
    setEditDefinition(word.definition || '');
    setEditContext(word.sentence_context || '');
    setEditContextTranslated(word.sentence_context_translated || '');
    setEditTranslation(word.translation || '');
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editingWord) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const updated = await updateVocabularyWord(editingWord.id, {
        phonetic: editPhonetic || null,
        definition: editDefinition || null,
        sentence_context: editContext || null,
        sentence_context_translated: editContextTranslated || null,
        translation: editTranslation || null,
      });
      onVocabularyUpdated(updated);
      setEditingWord(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold opacity-70 uppercase tracking-wider">
          Translation
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors opacity-50 hover:opacity-100"
          title="Close panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* No selection state */}
      {!selectedText && !translationResult && !wordResult && (
        <div className="flex flex-col items-center justify-center h-48 text-center opacity-40">
          <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 5h12M3 12h18M3 19h6" />
          </svg>
          <p className="text-sm">Click any word or select text to translate it</p>
        </div>
      )}

      {/* Selected text - ready to translate */}
      {selectedText && !translationResult && !wordResult && !translating && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Selected Text
            </label>
            <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed">
              {selectedText}
            </div>
          </div>

          <button
            onClick={onTranslate}
            className="w-full py-2.5 rounded-xl bg-white/20 hover:bg-white/30 font-medium text-sm
              transition-all duration-200"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5h12M3 12h18M3 19h6" />
              </svg>
              Translate to Georgian
            </span>
          </button>
        </div>
      )}

      {/* Translating state */}
      {translating && (
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner message="Translating..." />
        </div>
      )}

      {/* Word translation result (with phonetic + definition) */}
      {showWordDetails && wordResult && (
        <div className="space-y-4">
          {/* Word + Translation */}
          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Word
            </label>
            <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed">
              <span className="font-semibold text-lg">{wordResult.original}</span>
              {wordResult.phonetic && (
                <span className="ml-2 text-xs opacity-60">/{wordResult.phonetic}/</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Translation
            </label>
            <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/20 text-sm leading-relaxed">
              {wordResult.translation}
            </div>
          </div>

          {/* Definition */}
          {wordResult.definition && (
            <div>
              <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
                Definition
              </label>
              <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed">
                {wordResult.definition}
              </div>
            </div>
          )}

          {/* Sentence context */}
          {wordResult.sentence_context && (
            <div>
              <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
                In Context
              </label>
              <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed italic">
                {wordResult.sentence_context}
              </div>
              {wordResult.sentence_context_translated && (
                <div className="p-3 mt-1 rounded-xl bg-amber-500/10 text-sm leading-relaxed">
                  {wordResult.sentence_context_translated}
                </div>
              )}
            </div>
          )}

          {/* Already in vocabulary indicator */}
          {checkingExisting && (
            <div className="text-xs opacity-50 text-center py-1">Checking vocabulary...</div>
          )}

          {existingWord && !checkingExisting && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-blue-300 text-xs font-medium">Already in vocabulary</span>
              </div>
              {(existingWord.phonetic || existingWord.definition) && (
                <div className="space-y-1 text-xs opacity-80 mt-1">
                  {existingWord.phonetic && <div>Phonetic: {existingWord.phonetic}</div>}
                  {existingWord.definition && <div>Definition: {existingWord.definition}</div>}
                </div>
              )}
              <button
                onClick={() => openEditModal(existingWord)}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Edit existing entry
              </button>
            </div>
          )}

          {/* Save to Vocabulary / Edit button */}
          {!existingWord && !checkingExisting && (
            <button
              onClick={onSaveToVocabulary}
              disabled={savedToVocabulary}
              className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                savedToVocabulary
                  ? 'bg-green-500/20 text-green-400 cursor-default'
                  : 'bg-purple-500/30 hover:bg-purple-500/50 border border-purple-500/30'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {savedToVocabulary ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  )}
                </svg>
                {savedToVocabulary ? 'Saved to Vocabulary' : 'Save to Vocabulary'}
              </span>
            </button>
          )}

          <button
            onClick={onClose}
            className="text-xs opacity-40 hover:opacity-70 transition-opacity block w-full text-center"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Regular translation result */}
      {translationResult && !showWordDetails && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Original
            </label>
            <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed">
              {translationResult.original}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Translation
            </label>
            <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/20 text-sm leading-relaxed">
              {translationResult.translation}
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-xs opacity-40 hover:opacity-70 transition-opacity"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Provider selector */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
          Translation Engine
        </label>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => onProviderChange(p.value)}
              className={`flex-1 py-1.5 text-xs rounded-xl font-medium transition-all duration-200 ${
                provider === p.value
                  ? 'bg-white/20 border border-white/20'
                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {translationError && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {translationError}
        </div>
      )}

      {/* Edit Modal */}
      {editingWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold mb-1">Edit Vocabulary Entry</h3>
            <p className="text-sm opacity-60 mb-4">"{editingWord.word}"</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium opacity-60 block mb-1">Phonetic</label>
                <input
                  type="text"
                  value={editPhonetic}
                  onChange={(e) => setEditPhonetic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:border-purple-500/50 transition-colors"
                  placeholder="/fəˈnetɪk/"
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-60 block mb-1">Definition</label>
                <textarea
                  value={editDefinition}
                  onChange={(e) => setEditDefinition(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
                  placeholder="The meaning of the word..."
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-60 block mb-1">Sentence Context</label>
                <textarea
                  value={editContext}
                  onChange={(e) => setEditContext(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
                  placeholder="Example sentence..."
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-60 block mb-1">Context Translated</label>
                <textarea
                  value={editContextTranslated}
                  onChange={(e) => setEditContextTranslated(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
                  placeholder="Georgian translation of the sentence..."
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-60 block mb-1">Translation</label>
                <input
                  type="text"
                  value={editTranslation}
                  onChange={(e) => setEditTranslation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm focus:outline-none focus:border-purple-500/50 transition-colors"
                  placeholder="Georgian translation of the word..."
                />
              </div>
            </div>

            {editError && (
              <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {editError}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditingWord(null)}
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="flex-1 py-2 rounded-xl bg-purple-500/30 hover:bg-purple-500/50 border border-purple-500/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}