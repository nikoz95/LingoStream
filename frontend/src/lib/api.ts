/**
 * LingoStream API client
 * Handles all communication with the FastAPI backend.
 */

const API_BASE = '/api/v1';

// ── Token storage ──

const ACCESS_KEY = 'ls_access_token';
const REFRESH_KEY = 'ls_refresh_token';
const USER_KEY = 'ls_user';

export interface StoredUser {
  id: number;
  email: string;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveTokens(access: string, refresh: string, user: StoredUser): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Fetch wrapper ──

async function request<T>(
  url: string,
  options: RequestInit = {},
  auth: boolean = true,
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed with status ${res.status}`);
  }

  return res.json();
}

// ── Auth API ──

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: StoredUser;
}

export interface AuthError {
  detail: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
}

export async function register(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
}

export async function refreshAccessToken(): Promise<LoginResponse> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  return request<LoginResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, false);
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
  clearTokens();
}

export async function getMe(): Promise<StoredUser> {
  return request<StoredUser>('/auth/me');
}

// ── Books API ──

export interface BookListItem {
  id: number;
  title: string;
  author: string;
  total_chapters: number;
  language: string;
  status: string;
  created_at: string;
}

export interface ChapterResponse {
  id: number;
  book_id: number;
  title: string;
  spine_index: number;
  sequence_start: number;
  sequence_end: number;
  paragraph_count: number;
  is_parsed: boolean;
  created_at: string;
}

export interface BookDetailResponse {
  id: number;
  title: string;
  author: string;
  file_path: string;
  total_chapters: number;
  language: string;
  status: string;
  chapters: ChapterResponse[];
  created_at: string;
  updated_at: string;
}

export interface RegisterBookResponse {
  id: number;
  title: string;
  author: string;
  total_chapters: number;
  language: string;
  status: string;
  created_at: string;
}

export async function listBooks(): Promise<BookListItem[]> {
  return request<BookListItem[]>('/books');
}

export async function getBookDetail(bookId: number): Promise<BookDetailResponse> {
  return request<BookDetailResponse>(`/books/${bookId}`);
}

export async function registerBook(file: File): Promise<RegisterBookResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return request<RegisterBookResponse>('/books/register', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteBook(bookId: number): Promise<void> {
  return request(`/books/${bookId}`, { method: 'DELETE' });
}

export function getBookFileUrl(bookId: number): string {
  const token = getAccessToken();
  if (!token) return '';
  return `${API_BASE}/books/${bookId}/file?token=${encodeURIComponent(token)}`;
}

// ── Translation API ──

export interface TranslateTextRequest {
  text: string;
  language?: string | null;
  provider?: string | null;
}

export interface TranslateTextResponse {
  source_text: string;
  translated_text: string;
  provider: string;
}

export async function translateSelectedText(
  bookId: number,
  req: TranslateTextRequest,
): Promise<TranslateTextResponse> {
  return request<TranslateTextResponse>(`/books/${bookId}/translate-text`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Word Translation API ──

export interface TranslateWordRequest {
  word: string;
  left_context?: string;
  right_context?: string;
  book_title?: string;
  source_language?: string;
  provider?: string | null;
}

export interface TranslateWordResponse {
  word: string;
  translation: string;
  phonetic: string;
  definition: string;
  sentence_context: string;
  sentence_context_translated: string;
  provider: string;
}

export async function translateWord(
  bookId: number,
  req: TranslateWordRequest,
): Promise<TranslateWordResponse> {
  return request<TranslateWordResponse>(`/books/${bookId}/translate-word`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Vocabulary API ──

export interface VocabularyWord {
  id: number;
  word: string;
  phonetic: string | null;
  definition: string | null;
  sentence_context: string | null;
  sentence_context_translated: string | null;
  translation: string | null;
  book_id: number | null;
  created_at: string | null;
}

export interface VocabularyListResponse {
  words: VocabularyWord[];
  total: number;
}

export interface CreateVocabularyWordRequest {
  book_id?: number | null;
  word: string;
  phonetic?: string | null;
  definition?: string | null;
  sentence_context?: string | null;
  sentence_context_translated?: string | null;
  translation?: string | null;
}

export async function listVocabularyWords(bookId?: number): Promise<VocabularyListResponse> {
  const query = bookId !== undefined ? `?book_id=${bookId}` : '';
  return request<VocabularyListResponse>(`/vocabulary/words${query}`);
}

export async function saveVocabularyWord(req: CreateVocabularyWordRequest): Promise<VocabularyWord> {
  return request<VocabularyWord>('/vocabulary/words', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function updateVocabularyWord(
  wordId: number,
  req: Partial<CreateVocabularyWordRequest>,
): Promise<VocabularyWord> {
  return request<VocabularyWord>(`/vocabulary/words/${wordId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  });
}

export interface CheckVocabularyResponse {
  exists: boolean;
  word: VocabularyWord | null;
}

export async function checkVocabularyWord(word: string): Promise<CheckVocabularyResponse> {
  return request<CheckVocabularyResponse>(
    `/vocabulary/words/check?word=${encodeURIComponent(word)}`,
  );
}

export async function deleteVocabularyWord(wordId: number): Promise<void> {
  return request(`/vocabulary/words/${wordId}`, { method: 'DELETE' });
}

