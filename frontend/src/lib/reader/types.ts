/**
 * ReaderEngine interface and types.
 *
 * Provides a common abstraction over different document formats:
 * - PdfEngine (PDF.js + TextLayer)
 * - EpubEngine (foliate-js in iframe)
 *
 * Allows ReaderPage and UI controls to remain completely agnostic
 * of whether the active book is a PDF or an EPUB.
 */
import type { TextPick } from '../textPicker';

export type BookFormat = 'pdf' | 'epub';

export type Locator =
  | { kind: 'pdf'; page: number; offset?: number; length?: number }
  | { kind: 'epub'; cfi: string };

export interface TocItem {
  id: string | number;
  title: string;
  locator: Locator;
  children?: TocItem[];
}

export interface ReaderEngine {
  readonly format: BookFormat;

  /** Initialize and load the document from a Blob */
  open(fileBlob: Blob): Promise<void>;

  /** Navigate to a specific location */
  goTo(locator: Locator): Promise<void>;

  /** Current active location in the document */
  getCurrentLocator(): Locator;

  /** Total pages (for PDF) or estimated locations */
  getTotalPages(): number;

  /** Extract table of contents */
  getToc(): Promise<TocItem[]>;

  /** Subscribe to text selection/click events from the reading layer */
  onTextPick(callback: (pick: TextPick) => void): () => void;

  /** Apply highlights for saved vocabulary words */
  highlight(locators: Locator[]): void;

  /** Clean up resources (workers, iframes, memory) */
  destroy(): void;
}
