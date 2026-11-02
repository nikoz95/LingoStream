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
  onTranslate: () => void;
  onClose: () => void;
  onSaveToVocabulary: () => void;
  savedToVocabulary: boolean;
  existingWord: VocabularyWord | null;
  checkingExisting: boolean;
  onVocabularyUpdated: (word: VocabularyWord) => void;
}

export default function TranslationPanel({
  selectedText,
  translationResult,
  wordResult,
  translationError,
  translating,
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
  const [editTranslation, setEditTranslation] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Audio pronunciation
  const speakWord = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const saveEdit = async () => {
    if (!editingWord) return;
    setSavingEdit(true);
    try {
      const updated = await updateVocabularyWord(editingWord.id, {
        translation: editTranslation || null,
      });
      onVocabularyUpdated(updated);
      setEditingWord(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="w-80 lg:w-96 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-5 text-white animate-fadeIn flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          <span className="text-xs font-semibold tracking-wider text-white/50 uppercase">
            Translation
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Loading state */}
      {translating && (
        <div className="py-8 flex flex-col items-center justify-center">
          <LoadingSpinner message="Translating..." light />
        </div>
      )}

      {/* Selected text - ready to translate */}
      {selectedText && !translationResult && !wordResult && !translating && (
        <div className="space-y-3">
          <div className="text-sm text-white/80 font-medium leading-relaxed bg-white/5 p-3 rounded-xl">
            "{selectedText}"
          </div>
          <button
            onClick={onTranslate}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition-all hover:scale-[1.01]"
          >
            Translate to Georgian
          </button>
        </div>
      )}

      {/* Word Result View */}
      {showWordDetails && wordResult && !translating && (
        <div className="space-y-4">
          {/* Main Word + Audio */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">{wordResult.original}</h3>
              {wordResult.phonetic && (
                <span className="text-xs font-mono text-purple-300 opacity-80 mt-0.5 block">
                  /{wordResult.phonetic}/
                </span>
              )}
            </div>
            <button
              onClick={() => speakWord(wordResult.original)}
              className="p-2 rounded-xl bg-white/10 hover:bg-purple-500/20 text-white/80 hover:text-purple-300 transition-colors flex-shrink-0"
              title="Pronounce"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            </button>
          </div>

          {/* Georgian Meaning */}
          <div className="text-base font-semibold text-purple-300 leading-snug">
            {wordResult.translation}
          </div>

          {/* Definition */}
          {wordResult.definition && (
            <div className="text-xs text-white/70 leading-relaxed border-l-2 border-white/20 pl-3">
              {wordResult.definition}
            </div>
          )}

          {/* Context Sentence */}
          {wordResult.sentence_context && (
            <div className="space-y-1.5 pt-1 text-xs">
              <p className="text-white/80 italic leading-relaxed">
                "{wordResult.sentence_context}"
              </p>
              {wordResult.sentence_context_translated && (
                <p className="text-amber-200/90 leading-relaxed">
                  "{wordResult.sentence_context_translated}"
                </p>
              )}
            </div>
          )}

          {/* Already Saved indicator */}
          {existingWord && !checkingExisting && (
            <div className="flex items-center justify-between text-xs text-blue-300 bg-blue-500/10 px-3 py-2 rounded-xl">
              <span>Already in vocabulary</span>
              <button
                onClick={() => {
                  setEditingWord(existingWord);
                  setEditTranslation(existingWord.translation || '');
                }}
                className="underline hover:text-white"
              >
                Edit
              </button>
            </div>
          )}

          {/* Add to Vocabulary Button */}
          {!existingWord && !checkingExisting && (
            <button
              onClick={onSaveToVocabulary}
              disabled={savedToVocabulary}
              className={`w-full py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                savedToVocabulary
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 hover:scale-[1.01]'
              }`}
            >
              {savedToVocabulary ? '✓ Saved to Vocabulary' : '+ Add to Vocabulary'}
            </button>
          )}
        </div>
      )}

      {/* Passage Result View */}
      {!showWordDetails && translationResult && !translating && (
        <div className="space-y-3">
          <div className="text-xs text-white/60 leading-relaxed italic max-h-36 overflow-y-auto pr-1">
            "{translationResult.original}"
          </div>
          <div className="text-sm font-medium text-purple-200 leading-relaxed border-t border-white/10 pt-2.5">
            {translationResult.translation}
          </div>
        </div>
      )}

      {/* Error state */}
      {translationError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {translationError}
        </div>
      )}

      {/* Edit modal */}
      {editingWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/15 rounded-2xl p-5 w-full max-w-sm mx-4 space-y-4 shadow-2xl">
            <h4 className="font-semibold text-sm">Edit Translation</h4>
            <input
              type="text"
              value={editTranslation}
              onChange={(e) => setEditTranslation(e.target.value)}
              className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
            />
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs font-semibold text-white transition-colors"
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingWord(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
