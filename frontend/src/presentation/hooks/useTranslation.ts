import { useState, useCallback } from 'react';
import { createLogger } from '@infrastructure/logger.ts';
import type { TranslationResult } from '@domain/entities/index.ts';
import { api } from '@infrastructure/api/client.ts';

const log = createLogger('useTranslation');

interface UseTranslationReturn {
  translate: (
    bookId: string,
    chapterId: string,
    selectedIndices: number[],
    leftContextCount?: number,
    rightContextCount?: number,
    sourceLanguage?: string
  ) => Promise<void>;
  result: TranslationResult | null;
  isLoading: boolean;
  error: string | null;
  selectedIndices: number[];
  toggleSelection: (index: number) => void;
  clearSelection: () => void;
  clearResult: () => void;
}

export function useTranslation(): UseTranslationReturn {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelection = useCallback((index: number) => {
    log.debug('toggleSelection', { index });
    setSelectedIndices((prev: number[]) => {
      const newVal = prev.includes(index)
        ? prev.filter((i: number) => i !== index)
        : [...prev, index];
      log.debug('selectedIndices updated', { newVal });
      return newVal;
    });
  }, []);

  const clearSelection = useCallback(() => {
    log.debug('clearSelection');
    setSelectedIndices([]);
  }, []);

  const translate = useCallback(
    async (
      bookId: string,
      chapterId: string,
      indices: number[],
      leftContextCount = 2,
      rightContextCount = 2,
      sourceLanguage = 'English'
    ) => {
      log.info('translate START', {
        bookId, chapterId, indices, leftContextCount, rightContextCount, sourceLanguage,
      });
      setIsLoading(true);
      setError(null);
      try {
        const translationResult = await api.translate(
          bookId,
          chapterId,
          indices,
          leftContextCount,
          rightContextCount,
          sourceLanguage
        );
        log.info('translate SUCCESS', {
          resultLength: translationResult.translation?.length,
          hasOriginal: !!translationResult.original,
          hasTranslation: !!translationResult.translation,
          translationPreview: translationResult.translation?.substring(0, 100),
        });
        setResult(translationResult);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Translation failed';
        log.error('translate FAILED', { error: msg, err });
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearResult = useCallback(() => {
    log.debug('clearResult');
    setResult(null);
    setError(null);
  }, []);

  return {
    translate,
    result,
    isLoading,
    error,
    selectedIndices,
    toggleSelection,
    clearSelection,
    clearResult,
  };
}
