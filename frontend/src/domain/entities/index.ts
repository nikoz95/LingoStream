export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  language: string;
  total_chapters: number;
  total_paragraphs: number;
  file_path: string;
  upload_date: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  title: string;
  sequence_index: number;
  paragraph_count: number;
}

export interface Paragraph {
  id: string;
  book_id: string;
  chapter_id: string;
  index: number;
  content: string;
  phonetic_transcription: string | null;
}

export interface TranslationResult {
  original: string;
  translation: string;
  phonetic: string;
  left_context: string[];
  right_context: string[];
}

export interface VocabularyItem {
  id: string;
  user_id: string;
  word: string;
  translation: string;
  phonetic: string;
  book_id: string;
  chapter_index: number;
  paragraph_index: number;
  original_context: string;
  created_at: string;
  review_count: number;
  next_review: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface ReadinessScore {
  score: number;
  known_words: number;
  total_unique_words: number;
  new_words: number;
}