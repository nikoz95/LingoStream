import { create, type StoreApi } from 'zustand';
import { createLogger } from '@infrastructure/logger.ts';
import type { Book, Chapter, Paragraph } from '@domain/entities/index.ts';
import { api } from '@infrastructure/api/client.ts';

const log = createLogger('bookStore');

interface BookState {
  books: Book[];
  currentBook: Book | null;
  chapters: Chapter[];
  paragraphs: Paragraph[];
  currentChapter: Chapter | null;
  isLoading: boolean;
  error: string | null;
  fetchBooks: () => Promise<void>;
  registerBook: (file: File) => Promise<Book>;
  selectBook: (book: Book) => void;
  fetchChapters: (bookId: string) => Promise<void>;
  selectChapter: (chapter: Chapter) => void;
  fetchParagraphs: (bookId: string, chapterId: string) => Promise<void>;
  clearError: () => void;
}

export const useBookStore = create<BookState>((set: StoreApi<BookState>['setState'], get: StoreApi<BookState>['getState']) => ({
  books: [],
  currentBook: null,
  chapters: [],
  paragraphs: [],
  currentChapter: null,
  isLoading: false,
  error: null,

  fetchBooks: async () => {
    log.info('fetchBooks START');
    set({ isLoading: true, error: null });
    try {
      const books = await api.listBooks();
      log.info('fetchBooks SUCCESS', { count: books.length });
      set({ books, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch books';
      log.error('fetchBooks FAILED', { error: msg });
      set({
        isLoading: false,
        error: msg,
      });
    }
  },

  registerBook: async (file: File) => {
    log.info('registerBook START', { fileName: file.name, fileSize: file.size, fileType: file.type });
    set({ isLoading: true, error: null });
    try {
      const book = await api.registerBook(file);
      log.info('registerBook SUCCESS', { bookId: book.id, title: book.title });
      set((state: BookState) => ({
        books: [book, ...state.books],
        isLoading: false,
      }));
      return book;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register book';
      log.error('registerBook FAILED', { error: msg });
      set({
        isLoading: false,
        error: msg,
      });
      throw err;
    }
  },

  selectBook: (book: Book) => {
    log.info('selectBook', { bookId: book.id, title: book.title });
    set({ currentBook: book, chapters: [], paragraphs: [], currentChapter: null });
  },

  fetchChapters: async (bookId: string) => {
    log.info('fetchChapters START', { bookId });
    set({ isLoading: true, error: null });
    try {
      const chapters = await api.listChapters(bookId);
      log.info('fetchChapters SUCCESS', { bookId, count: chapters.length });
      set({ chapters, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch chapters';
      log.error('fetchChapters FAILED', { bookId, error: msg });
      set({
        isLoading: false,
        error: msg,
      });
    }
  },

  selectChapter: (chapter: Chapter) => {
    log.info('selectChapter', { chapterId: chapter.id, title: chapter.title });
    set({ currentChapter: chapter, paragraphs: [] });
  },

  fetchParagraphs: async (bookId: string, chapterId: string) => {
    log.info('fetchParagraphs START', { bookId, chapterId });
    set({ isLoading: true, error: null });
    try {
      const paragraphs = await api.getParagraphs(bookId, chapterId);
      log.info('fetchParagraphs SUCCESS', { bookId, chapterId, count: paragraphs.length });
      set({ paragraphs, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch paragraphs';
      log.error('fetchParagraphs FAILED', { bookId, chapterId, error: msg });
      set({
        isLoading: false,
        error: msg,
      });
    }
  },

  clearError: () => {
    log.debug('clearError');
    set({ error: null });
  },
}));
