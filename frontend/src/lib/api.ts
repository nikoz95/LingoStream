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
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  if (!(options.body instanceof FormData)) {
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
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

  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/books/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to upload book');
  }

  return res.json();
}

export async function deleteBook(bookId: number): Promise<void> {
  return request(`/books/${bookId}`, { method: 'DELETE' });
}

export function getBookFileUrl(bookId: number): string {
  const token = getAccessToken();
  if (!token) return '';
  return `${API_BASE}/books/${bookId}/file?token=${encodeURIComponent(token)}`;
}

export function translateStreamUrl(bookId: number, selectedText: string): string {
  const token = getAccessToken();
  if (!token) return '';
  const base = `${API_BASE}/books/${bookId}/translate-text-stream`;
  return `${base}?token=${encodeURIComponent(token)}&selected_text=${encodeURIComponent(selectedText)}`;
}

// ── Translation API ──

export interface TranslateTextRequest {
  selected_text: string;
  left_context: string;
  right_context: string;
  book_title: string;
  source_language: string;
}

export interface TranslateTextResponse {
  original: string;
  translation: string;
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
