/**
 * EpubEngine — implements ReaderEngine for EPUB, MOBI, FB2 using foliate-js.
 *
 * Renders EPUB files with 100% preservation of original fonts, styles, and images
 * inside a sandboxed iframe. Text selection/clicking hooks directly into the common
 * TextPicker utility.
 */
import type { ReaderEngine, BookFormat, Locator, TocItem } from './types';
import { extractPickFromNode, type TextPick } from '../textPicker';

// Register foliate-view web component
import 'foliate-js/view.js';

export class EpubEngine implements ReaderEngine {
  readonly format: BookFormat = 'epub';

  private viewElement: any = null;
  private container: HTMLElement | null = null;
  private pickListeners: Array<(pick: TextPick) => void> = [];
  private currentCfi: string = '';
  private toc: TocItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async open(fileBlob: Blob): Promise<void> {
    if (!this.container) throw new Error('Epub container not mounted');

    // Create <foliate-view>
    this.viewElement = document.createElement('foliate-view');
    this.viewElement.style.width = '100%';
    this.viewElement.style.height = '100%';
    this.viewElement.style.display = 'block';

    this.container.innerHTML = '';
    this.container.appendChild(this.viewElement);

    const file = new File([fileBlob], 'book.epub', { type: 'application/epub+zip' });
    await this.viewElement.open(file);
    await this.viewElement.init({ showTextStart: true });
    const book = this.viewElement.book;

    // Extract TOC
    if (book.toc) {
      this.toc = this.mapToc(book.toc);
    }

    // Attach listeners on page loads
    this.viewElement.addEventListener('load', (e: any) => {
      const doc = e.detail?.doc || this.viewElement.contentDocument;
      if (!doc) return;

      this.setupTextEvents(doc);
    });

    // Track relocation/progress
    this.viewElement.addEventListener('relocate', (e: any) => {
      if (e.detail?.cfi) {
        this.currentCfi = e.detail.cfi;
      }
    });
  }

  private mapToc(tocEntries: any[]): TocItem[] {
    return tocEntries.map((item, index) => ({
      id: item.id || `toc_${index}`,
      title: item.label || item.title || `Chapter ${index + 1}`,
      locator: { kind: 'epub', cfi: item.href || item.cfi || '' },
      children: item.subitems ? this.mapToc(item.subitems) : undefined,
    }));
  }

  private setupTextEvents(doc: Document): void {
    // Pointerup / click in iframe
    doc.addEventListener('pointerup', () => {
      const sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();

      if (text && !sel.isCollapsed) {
        // Drag selection
        const pick = extractPickFromNode(range.startContainer, range.startOffset);
        if (pick) {
          pick.text = text; // user explicitly dragged this text
          this.notifyPick(pick);
        }
      } else if (sel.isCollapsed) {
        // Single word click
        const pick = extractPickFromNode(range.startContainer, range.startOffset);
        if (pick) {
          this.notifyPick(pick);
        }
      }
    });
  }

  private notifyPick(pick: TextPick): void {
    for (const listener of this.pickListeners) {
      listener(pick);
    }
  }

  async goTo(locator: Locator): Promise<void> {
    if (locator.kind === 'epub' && locator.cfi && this.viewElement) {
      await this.viewElement.goTo(locator.cfi);
    }
  }

  getCurrentLocator(): Locator {
    return { kind: 'epub', cfi: this.currentCfi };
  }

  getTotalPages(): number {
    return 0; // EPUB has dynamic pagination depending on viewport width & font size
  }

  async getToc(): Promise<TocItem[]> {
    return this.toc;
  }

  onTextPick(callback: (pick: TextPick) => void): () => void {
    this.pickListeners.push(callback);
    return () => {
      this.pickListeners = this.pickListeners.filter((cb) => cb !== callback);
    };
  }

  highlight(locators: Locator[]): void {
    // foliate-js overlayer can be connected here for saved vocabulary annotations
  }

  nextPage(): void {
    this.viewElement?.next();
  }

  prevPage(): void {
    this.viewElement?.prev();
  }

  destroy(): void {
    this.pickListeners = [];
    if (this.viewElement && this.viewElement.parentElement) {
      this.viewElement.parentElement.removeChild(this.viewElement);
    }
    this.viewElement = null;
    this.container = null;
  }
}
