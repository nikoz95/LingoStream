import { createLogger } from '@infrastructure/logger.ts';
import type { Book, Chapter, Paragraph, TranslationResult, VocabularyItem, AuthTokens, ReadinessScore } from '@domain/entities/index.ts';

const log = createLogger('api-client');

const API_BASE = '/api/v1';

function getToken(): string | null {
  const stored = localStorage.getItem('lingostream_tokens');
  if (!stored) return null;
  try {
    const tokens: AuthTokens = JSON.parse(stored);
    log.debug('Token loaded from localStorage', { hasToken: !!tokens.access_token });
    return tokens.access_token;
  } catch {
    log.warn('Failed to parse token from localStorage');
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = options.method || 'GET';
  const bodyPreview = options.body
    ? (typeof options.body === 'string' ? options.body.substring(0, 200) : '[Binary/FormData]')
    : undefined;

  log.info(`➡️ ${method} ${endpoint}`, { bodyPreview });

  const startTime = performance.now();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  const elapsed = Math.round(performance.now() - startTime);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    log.error(`❌ ${method} ${endpoint} FAILED (${res.status}) in ${elapsed}ms`, { error: errorBody });
    throw new Error(errorBody.detail || `HTTP ${res.status}`);
  }

  log.info(`✅ ${method} ${endpoint} OK (${res.status}) in ${elapsed}ms`);
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    request<AuthTokens>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Books
  listBooks: () => request<Book[]>('/books'),

  registerBook: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    return fetch(`${API_BASE}/books/register`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `HTTP ${res.status}`);
      }
      return res.json() as Promise<Book>;
    });
  },

  getBook: (bookId: string) => request<Book>(`/books/${bookId}`),

  deleteBook: (bookId: string) =>
    fetch(`${API_BASE}/books/${bookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `HTTP ${res.status}`);
      }
    }),

  // Chapters
  listChapters: (bookId: string) =>
    request<Chapter[]>(`/books/${bookId}/chapters`),

  getChapter: (bookId: string, chapterId: string) =>
    request<Chapter>(`/books/${bookId}/chapters/${chapterId}`),

  // Paragraphs
  getParagraphs: (bookId: string, chapterId: string) =>
    request<Paragraph[]>(`/books/${bookId}/chapters/${chapterId}/paragraphs`),

  // Translation
  translate: (
    bookId: string,
    chapterId: string,
    selectedIndices: number[],
    leftContextCount: number = 2,
    rightContextCount: number = 2,
    sourceLanguage: string = 'en'
  ) =>
    request<TranslationResult>(
      `/books/${bookId}/chapters/${chapterId}/translate`,
      {
        method: 'POST',
        body: JSON.stringify({
          selected_indices: selectedIndices,
          left_context_count: leftContextCount,
          right_context_count: rightContextCount,
          source_language: sourceLanguage,
        }),
      }
    ),

  // Vocabulary
  listVocabulary: (bookId?: string) => {
    const params = bookId ? `?book_id=${bookId}` : '';
    return request<VocabularyItem[]>(`/vocabulary${params}`);
  },

  addVocabulary: (item: Omit<VocabularyItem, 'id' | 'created_at' | 'review_count' | 'next_review'>) =>
    request<VocabularyItem>('/vocabulary', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  // Readiness
  getReadinessScore: (bookId: string) =>
    request<ReadinessScore>(`/books/${bookId}/readiness`),
};