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

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(undefined);
    }
  });
  failedQueue = [];
};

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

  // Handle 401 Unauthorized with token refresh (only if auth was required and not calling /auth/login or /auth/refresh)
  if (res.status === 401 && auth && !url.startsWith('/auth/')) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await refreshAccessToken();
          saveTokens(refreshRes.access_token, refreshRes.refresh_token, refreshRes.user);
          processQueue(null);
        } catch (refreshErr) {
          processQueue(refreshErr);
          clearTokens();
          window.location.href = '/login';
          throw refreshErr;
        } finally {
          isRefreshing = false;
        }
      } else {
        // Wait for active refresh to finish
        await new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
      }

      // Retry original request with new access token
      const newToken = getAccessToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
      }
      const retryRes = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers,
      });
      if (retryRes.status === 204) return undefined as T;
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ detail: retryRes.statusText }));
        throw new Error(err.detail || `Request failed with status ${retryRes.status}`);
      }
      return retryRes.json();
    } else {
      clearTokens();
      window.location.href = '/login';
    }
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

export async function getBookBlob(bookId: number, format: 'original' | 'epub' = 'original'): Promise<Blob> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}/books/${bookId}/file?format=${format}`, { headers });

  if (res.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await refreshAccessToken();
        saveTokens(refreshRes.access_token, refreshRes.refresh_token, refreshRes.user);
        headers['Authorization'] = `Bearer ${refreshRes.access_token}`;
        res = await fetch(`${API_BASE}/books/${bookId}/file`, { headers });
      } catch {
        clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
  }

  if (!res.ok) {
    throw new Error(`Failed to download book file: ${res.statusText}`);
  }

  return res.blob();
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
  book_id: number | null; is_mastered?: boolean;
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
  translation?: string | null; is_mastered?: boolean;
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

// ── Word Position API (PDF click overlays) ──

export interface WordPositionResponse {
  word: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  word_index: number;
  line_index: number;
  block_index: number;
}

export interface WordPositionsPageResponse {
  book_id: number;
  page_index: number;
  page_width: number;
  page_height: number;
  words: WordPositionResponse[];
}

export interface PageCountResponse {
  book_id: number;
  total_pages: number;
}

export async function getWordPositions(
  bookId: number,
  pageIndex: number,
): Promise<WordPositionsPageResponse> {
  return request<WordPositionsPageResponse>(
    `/pages/${bookId}/word-positions/${pageIndex}`
  );
}

export async function getBookPageCount(bookId: number): Promise<PageCountResponse> {
  return request<PageCountResponse>(`/pages/${bookId}/page-count`);
}

// ── Writing & Speaking Studio API ──

export interface SuggestedWordItem {
  word: string;
  phonetic?: string;
  translation?: string;
  definition?: string;
  sentence_context?: string;
  sentence_context_translated?: string;
}

export interface CorrectionItem {
  original: string;
  corrected: string;
  type: string;
  short_explanation: string;
}

export interface SpeakingConnectorItem {
  phrase: string;
  meaning: string;
  example: string;
}

export interface EvaluateWritingRequest {
  text: string;
  topic?: string;
  target_language?: string;
  native_language?: string;
  provider?: string | null;
}

export interface EvaluateWritingResponse {
  submission_id?: number | null;
  corrected_text: string;
  natural_spoken_text: string;
  elevated_text: string;
  cefr_level: string;
  overall_feedback: string;
  speaking_connectors: SpeakingConnectorItem[];
  corrections: CorrectionItem[];
  suggested_words: SuggestedWordItem[];
}

export interface WritingSubmissionItem {
  id: number;
  topic?: string;
  original_text: string;
  corrected_text: string;
  natural_spoken_text: string;
  elevated_text: string;
  cefr_level: string;
  overall_feedback: string;
  speaking_connectors: SpeakingConnectorItem[];
  corrections: CorrectionItem[];
  suggested_words: SuggestedWordItem[];
  created_at?: string | null;
}

export interface WritingSubmissionListResponse {
  submissions: WritingSubmissionItem[];
  total: number;
}

export interface UserExamplePair {
  wrong: string;
  right: string;
}

export interface MicroDrillItem {
  prompt_ka: string;
  hint?: string;
  correct_answer: string;
  explanation_ka?: string;
}

export interface WeakSpotItem {
  category: string;
  frequency_label?: string;
  why_it_happens: string;
  golden_rule: string;
  user_examples: UserExamplePair[];
  drills: MicroDrillItem[];
}

export interface PatternAnalysisResponse {
  overall_summary: string;
  level_trend: string;
  weak_spots: WeakSpotItem[];
}

export interface WritingChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatUserFeedback {
  is_perfect: boolean;
  corrected: string;
  natural_alternative: string;
  short_explanation: string;
  corrections: CorrectionItem[];
  suggested_words: SuggestedWordItem[];
}

export interface WritingChatRequest {
  messages: WritingChatMessage[];
  scenario: string;
  target_language?: string;
  native_language?: string;
  provider?: string | null;
}

export interface WritingChatResponse {
  reply: string;
  reply_translation: string;
  user_feedback: ChatUserFeedback | null;
}

export interface DeepDiveExampleItem {
  correct: string;
  translation: string;
  wrong_variant?: string;
}

export interface DeepDiveExplainRequest {
  original_text: string;
  corrected_text: string;
  context_sentence?: string;
  question?: string;
  history?: WritingChatMessage[];
  target_language?: string;
  native_language?: string;
  provider?: string | null;
}

export interface DeepDiveExplainResponse {
  answer: string;
  grammar_rule_title: string;
  examples: DeepDiveExampleItem[];
  suggested_words: SuggestedWordItem[];
}

export async function evaluateWriting(req: EvaluateWritingRequest): Promise<EvaluateWritingResponse> {
  return request<EvaluateWritingResponse>('/writing/evaluate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function sendWritingChat(req: WritingChatRequest): Promise<WritingChatResponse> {
  return request<WritingChatResponse>('/writing/chat', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function explainWritingDeepDive(
  req: DeepDiveExplainRequest,
): Promise<DeepDiveExplainResponse> {
  return request<DeepDiveExplainResponse>('/writing/explain', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function translateWritingWord(
  word: string,
  sentenceContext: string = '',
): Promise<TranslateWordResponse> {
  return request<TranslateWordResponse>('/writing/translate-word', {
    method: 'POST',
    body: JSON.stringify({
      word,
      sentence_context: sentenceContext,
      source_language: 'en',
      target_language: 'ka',
    }),
  });
}

export async function listWritingSubmissions(): Promise<WritingSubmissionListResponse> {
  return request<WritingSubmissionListResponse>('/writing/submissions');
}

export async function deleteWritingSubmission(submissionId: number): Promise<void> {
  return request<void>(`/writing/submissions/${submissionId}`, {
    method: 'DELETE',
  });
}

export async function analyzeWritingPatterns(): Promise<PatternAnalysisResponse> {
  return request<PatternAnalysisResponse>('/writing/analyze-patterns', {
    method: 'POST',
  });
}



