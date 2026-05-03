import { useState, useRef, useCallback } from 'react';
import {
  translateSelectedText,
  translateStreamUrl,
  type BookDetailResponse,
} from '../lib/api';

export function useTranslation(book: BookDetailResponse | null, bookId: string | undefined) {
  const [translating, setTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<{
    original: string;
    translation: string;
  } | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [provider, setProvider] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const translate = useCallback(async (selectedText: string) => {
    if (!selectedText || !bookId || !book) return;

    setTranslating(true);
    setTranslationError('');
    setStreamingText('');
    setTranslationResult(null);

    // Try streaming first
    try {
      const url = translateStreamUrl(Number(bookId), selectedText);
      abortRef.current = new AbortController();

      const response = await fetch(url, {
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error('Stream failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulated += content;
                setStreamingText(accumulated);
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }

      setTranslationResult({
        original: selectedText,
        translation: accumulated,
      });
      setTranslating(false);
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setTranslating(false);
        return;
      }
      // Fall back to regular translate
    }

    // Fallback: non-streaming translate
    try {
      const result = await translateSelectedText(Number(bookId), {
        selected_text: selectedText,
        left_context: '',
        right_context: '',
        book_title: book.title,
        source_language: book.language || 'en',
        provider: provider || null,
      });
      setTranslationResult(result);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setTranslating(false);
    }
  }, [book, bookId, provider]);

  const closeTranslation = useCallback(() => {
    setTranslationResult(null);
    setStreamingText('');
    setTranslationError('');
    abortRef.current?.abort();
  }, []);

  return {
    translating,
    translationResult,
    streamingText,
    translationError,
    provider,
    setProvider,
    translate,
    closeTranslation,
  };
}