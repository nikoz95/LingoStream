import { useState } from 'react';
import type { WordTranslationResult } from '../hooks/useTranslation';

interface MobileTranslationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  word: string;
  translation: WordTranslationResult | null;
  loading: boolean;
  error?: string | null;
  onSaveToVocabulary: () => Promise<void>;
  savedToVocabulary?: boolean;
}

export default function MobileTranslationSheet({
  isOpen,
  onClose,
  word,
  translation,
  loading,
  error,
  onSaveToVocabulary,
  savedToVocabulary = false,
}: MobileTranslationSheetProps) {
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveToVocabulary();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity pointer-events-auto"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div className="relative w-full max-h-[75vh] bg-stone-900 border-t border-stone-800 rounded-t-2xl p-5 shadow-2xl pointer-events-auto flex flex-col gap-3 animate-in slide-in-from-bottom duration-200">
        {/* Drag handle pill */}
        <div className="w-12 h-1.5 bg-stone-700 rounded-full mx-auto mb-1" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-stone-100 font-serif capitalize">
              {word}
            </h3>
            {translation?.phonetic && (
              <p className="text-xs text-purple-400 font-mono mt-0.5">
                {translation.phonetic}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-200 hover:bg-stone-800"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body content */}
        <div className="overflow-y-auto space-y-3 py-1 text-sm text-stone-300">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-purple-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Translating...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}

          {translation && (
            <>
              {/* Primary Translation */}
              <div className="bg-stone-800/80 rounded-xl p-3 border border-stone-700/60">
                <span className="text-xs text-stone-400 uppercase tracking-wider block font-medium mb-1">
                  Translation
                </span>
                <p className="text-base font-semibold text-amber-200">
                  {translation.translation}
                </p>
              </div>

              {/* Definition */}
              {translation.definition && (
                <div className="text-stone-300 text-xs leading-relaxed">
                  <span className="text-stone-500 block font-medium mb-0.5">Definition</span>
                  {translation.definition}
                </div>
              )}

              {/* Sentence Context */}
              {translation.sentence_context && (
                <div className="bg-stone-800/40 rounded-lg p-2.5 border border-stone-800 text-xs space-y-1">
                  <p className="text-stone-300 italic">"{translation.sentence_context}"</p>
                  {translation.sentence_context_translated && (
                    <p className="text-amber-300/90 font-medium">
                      "{translation.sentence_context_translated}"
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {translation && (
          <div className="pt-2 border-t border-stone-800 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || savedToVocabulary}
              className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                savedToVocabulary
                  ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
              }`}
            >
              {savedToVocabulary ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Saved in Vocabulary</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>{saving ? 'Saving...' : 'Save Word'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
