import { useState, useCallback } from 'react';
import {
  translateSelectedText,
  translateWord,
  checkVocabularyWord,
  type BookDetailResponse,
  type VocabularyWord,
} from '../lib/api';

export interface WordTranslationResult {
  original: string;
  translation: string;
  phonetic: string;
  definition: string;
  sentence_context: string;
  sentence_context_translated: string;
}

export function useTranslation(book: BookDetailResponse | null, bookId: string | undefined) {
  const [translating, setTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<{
    original: string;
    translation: string;
  } | null>(null);
  const [wordResult, setWordResult] = useState<WordTranslationResult | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [provider, setProvider] = useState('');
  const [existingWord, setExistingWord] = useState<VocabularyWord | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [savedVocabularyId, setSavedVocabularyId] = useState<number | null>(null);

  const translate = useCallback(async (
    selectedText: string,
    isWord?: boolean,
    leftContext?: string,
    rightContext?: string,
  ) => {
    if (!selectedText || !bookId || !book) return;

    setTranslating(true);
    setTranslationError('');
    setStreamingText('');
    setTranslationResult(null);
    setWordResult(null);
    setExistingWord(null);
    setSavedVocabularyId(null);

    try {
      if (isWord && selectedText.split(/\s+/).length <= 1) {
        // Word translation with phonetic, definition, sentence_context
        const result = await translateWord(Number(bookId), {
          word: selectedText,
          left_context: leftContext || '',
          right_context: rightContext || '',
          book_title: book.title,
          source_language: book.language || 'en',
          provider: provider || null,
        });
        setWordResult({
          original: result.word,
          translation: result.translation,
          phonetic: result.phonetic,
          definition: result.definition,
          sentence_context: result.sentence_context,
          sentence_context_translated: result.sentence_context_translated,
        });

        // Auto-check if word already exists in vocabulary
        setCheckingExisting(true);
        try {
          const checkResult = await checkVocabularyWord(selectedText.trim());
          if (checkResult.exists && checkResult.word) {
            setExistingWord(checkResult.word);
          }
        } catch {
          // Silently ignore check failures (feature is optional)
        } finally {
          setCheckingExisting(false);
        }
      } else {
        // Regular text translation
        const result = await translateSelectedText(Number(bookId), {
          text: selectedText,
          language: book.language || 'en',
          provider: provider || null,
        });
        setTranslationResult({
          original: result.source_text,
          translation: result.translated_text,
        });
      }
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setTranslating(false);
    }
  }, [book, bookId, provider]);

  const onVocabularySaved = useCallback((wordId: number) => {
    // Update the existingWord to reflect it's now saved (for subsequent clicks)
    setSavedVocabularyId(wordId);
    if (wordResult && existingWord === null) {
      // Re-check after save to get the full record
      checkVocabularyWord(wordResult.original).then((res) => {
        if (res.exists && res.word) {
          setExistingWord(res.word);
        }
      }).catch(() => {});
    }
  }, [wordResult, existingWord]);

  const onVocabularyUpdated = useCallback((updated: VocabularyWord) => {
    setExistingWord(updated);
  }, []);

  const closeTranslation = useCallback(() => {
    setTranslationResult(null);
    setWordResult(null);
    setStreamingText('');
    setTranslationError('');
    setExistingWord(null);
    setSavedVocabularyId(null);
  }, []);

  return {
    translating,
    translationResult,
    wordResult,
    streamingText,
    translationError,
    provider,
    setProvider,
    existingWord,
    checkingExisting,
    savedVocabularyId,
    translate,
    onVocabularySaved,
    onVocabularyUpdated,
    closeTranslation,
  };
}