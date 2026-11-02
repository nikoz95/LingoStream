/**
 * EpubEngine — implements ReaderEngine for EPUB, MOBI, FB2 using foliate-js.
 *
 * Renders EPUB files with full preservation of typography, themes, layout modes
 * (paginated single, paginated two-page spread, or continuous scroll),
 * table of contents, progress tracking, and single-click / drag text selection.
 */
import type { ReaderEngine, BookFormat, Locator, TocItem } from './types';
import { extractPickFromNode, pickTextFromPoint, type TextPick } from '../textPicker';

// Register foliate-view web component
import 'foliate-js/view.js';

export type EpubLayoutMode = 'paginated-single' | 'paginated-spread' | 'scrolled';
export type EpubTheme = 'night' | 'sepia' | 'light';
export type EpubFontFamily = 'literata' | 'sans' | 'georgia' | 'mono';

export interface EpubStyleOptions {
  fontSize: number;
  theme: EpubTheme;
  fontFamily: EpubFontFamily;
  lineHeight: number;
  layoutMode: EpubLayoutMode;
  maxWidth: number;
}

export interface EpubRelocateInfo {
  cfi: string;
  fraction: number;
  currentPage: number;
  totalPages: number;
  chapterTitle: string;
}

const THEME_PALETTES: Record<EpubTheme, { bg: string; fg: string; heading: string; selection: string; link: string }> = {
  night: {
    bg: '#141518',
    fg: '#E2E4E9',
    heading: '#F3F4F6',
    selection: 'rgba(168, 85, 247, 0.42)',
    link: '#C084FC',
  },
  sepia: {
    bg: '#F4ECD8',
    fg: '#3B2E1E',
    heading: '#261C10',
    selection: 'rgba(168, 85, 247, 0.30)',
    link: '#7E22CE',
  },
  light: {
    bg: '#FAF9F5',
    fg: '#1F2937',
    heading: '#111827',
    selection: 'rgba(168, 85, 247, 0.28)',
    link: '#7E22CE',
  },
};

const FONT_STACKS: Record<EpubFontFamily, string> = {
  literata: "'Literata', 'Georgia', 'Times New Roman', serif",
  georgia: "'Georgia', 'Cambria', 'Times New Roman', serif",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
};

export class EpubEngine implements ReaderEngine {
  readonly format: BookFormat = 'epub';

  private viewElement: any = null;
  private container: HTMLElement | null = null;
  private pickListeners: Array<(pick: TextPick) => void> = [];
  private relocateListeners: Array<(info: EpubRelocateInfo) => void> = [];
  private keydownListeners: Array<(key: string) => void> = [];
  private currentCfi: string = '';
  private toc: TocItem[] = [];
  private activePickedWord: string = '';
  private styleOptions: EpubStyleOptions = {
    fontSize: 110,
    theme: 'night',
    fontFamily: 'literata',
    lineHeight: 1.75,
    layoutMode: 'paginated-single',
    maxWidth: 760,
  };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async open(fileBlob: Blob, initialCfi?: string, initialStyles?: Partial<EpubStyleOptions>): Promise<void> {
    if (!this.container) throw new Error('Epub container not mounted');

    if (initialStyles) {
      this.styleOptions = { ...this.styleOptions, ...initialStyles };
    }

    // Create <foliate-view>
    this.viewElement = document.createElement('foliate-view');
    this.viewElement.style.width = '100%';
    this.viewElement.style.height = '100%';
    this.viewElement.style.display = 'block';

    this.container.innerHTML = '';
    this.container.appendChild(this.viewElement);

    const file = new File([fileBlob], 'book.epub', { type: 'application/epub+zip' });
    await this.viewElement.open(file);

    const book = this.viewElement.book;
    if (book?.toc) {
      this.toc = this.mapToc(book.toc);
    }

    // Apply layout and styles before first render
    this.applySettings(this.styleOptions);

    // Attach listeners on section loads
    this.viewElement.addEventListener('load', (e: any) => {
      const doc = e.detail?.doc;
      if (!doc) return;
      this.applySettings(this.styleOptions);
      this.setupTextEvents(doc);
    });

    // Critical fix for foliate-js paginator:
    // Foliate's internal relocate listener calls `setSelectionTo(detail.range, -1)` which
    // programmatically selects the entire visible page on iOS/WebKit! Clear it immediately.
    this.viewElement.addEventListener('relocate', (e: any) => {
      const detail = e.detail || {};
      try {
        const contents = this.viewElement?.renderer?.getContents?.() || [];
        for (const content of contents) {
          content.doc?.getSelection?.()?.removeAllRanges?.();
        }
      } catch {
        // ignore
      }

      if (detail.cfi) {
        this.currentCfi = detail.cfi;
      }
      const fraction = typeof detail.fraction === 'number' && !isNaN(detail.fraction) ? detail.fraction : 0;
      const locCurrent = detail.location?.current != null ? detail.location.current + 1 : Math.max(1, Math.round(fraction * 100));
      const locTotal = detail.location?.total || 100;
      const chapterTitle = detail.tocItem?.label || '';

      const info: EpubRelocateInfo = {
        cfi: this.currentCfi,
        fraction,
        currentPage: locCurrent,
        totalPages: locTotal,
        chapterTitle,
      };
      for (const cb of this.relocateListeners) {
        cb(info);
      }
    });

    await this.viewElement.init({
      lastLocation: initialCfi || undefined,
      showTextStart: !initialCfi,
    });
  }

  applySettings(opts: Partial<EpubStyleOptions>): void {
    this.styleOptions = { ...this.styleOptions, ...opts };
    const renderer = this.viewElement?.renderer;
    if (!renderer) return;

    const { fontSize, theme, fontFamily, lineHeight, layoutMode, maxWidth } = this.styleOptions;
    const palette = THEME_PALETTES[theme] || THEME_PALETTES.night;
    const fontStack = FONT_STACKS[fontFamily] || FONT_STACKS.literata;

    try {
      // 1. Configure paginator layout attributes
      const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
      renderer.setAttribute('animated', '');
      if (layoutMode === 'scrolled') {
        renderer.setAttribute('flow', 'scrolled');
        renderer.setAttribute('max-inline-size', `${maxWidth}px`);
        renderer.setAttribute('margin', isSmallScreen ? '48px' : '32px');
      } else if (layoutMode === 'paginated-spread') {
        renderer.setAttribute('flow', 'paginated');
        renderer.setAttribute('max-column-count', '2');
        renderer.setAttribute('max-inline-size', `${Math.min(maxWidth, 640)}px`);
        renderer.setAttribute('gap', '6%');
        renderer.setAttribute('margin', '56px');
      } else {
        // paginated-single
        renderer.setAttribute('flow', 'paginated');
        renderer.setAttribute('max-column-count', '1');
        renderer.setAttribute('max-inline-size', `${maxWidth}px`);
        renderer.setAttribute('gap', isSmallScreen ? '6%' : '5%');
        renderer.setAttribute('margin', isSmallScreen ? '72px' : '56px');
      }

      // 2. Inject CSS into loaded EPUB documents
      renderer.setStyles?.(`
        html, body {
          background-color: ${palette.bg} !important;
          color: ${palette.fg} !important;
          font-family: ${fontStack} !important;
          font-size: ${fontSize}% !important;
          line-height: ${lineHeight} !important;
          -webkit-font-smoothing: antialiased;
          -webkit-touch-callout: none !important;
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        p, li, blockquote, dd, dt, span, div {
          font-family: ${fontStack} !important;
          line-height: ${lineHeight} !important;
          color: ${palette.fg} !important;
          -webkit-touch-callout: none !important;
        }
        p {
          margin: 0 0 0.85em 0 !important;
          text-align: justify !important;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: ${fontStack} !important;
          color: ${palette.heading} !important;
          line-height: 1.3 !important;
        }
        a {
          color: ${palette.link} !important;
        }
        ::selection {
          background: ${palette.selection} !important;
        }
        .ls-clicked-word {
          background-color: ${palette.selection} !important;
          border-radius: 3px;
        }
      `);

      // Force paginator re-render so column counts/inline sizes take effect immediately
      renderer.render?.();
    } catch (err) {
      console.warn('Could not apply EPUB styles:', err);
    }
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
    // Forward keyboard navigation from inside the iframe
    doc.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.prevPage();
      } else {
        for (const cb of this.keydownListeners) cb(e.key);
      }
    });

    // Suppress native context menu on touch devices so it doesn't collide with our reader UI
    doc.addEventListener('contextmenu', (e: MouseEvent) => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isTouch) {
        e.preventDefault();
      }
    });

    let downX = 0;
    let downY = 0;
    let downTime = 0;
    let selectionSettleTimer: any = null;
    let isUserInteracting = false;
    let lastNotifiedText = '';

    const emitViewportPick = (pick: TextPick, clientX: number, clientY: number, rawRect?: DOMRect) => {
      const frameEl = doc.defaultView?.frameElement as HTMLElement | null;
      const frameRect = frameEl?.getBoundingClientRect() || new DOMRect(0, 0, 0, 0);
      const viewportRect = new DOMRect(
        frameRect.left + (rawRect?.width ? rawRect.left : clientX),
        frameRect.top + (rawRect?.height ? rawRect.top : clientY - 12),
        rawRect?.width || 24,
        rawRect?.height || 20,
      );
      pick.rects = [viewportRect];
      lastNotifiedText = pick.text;
      this.activePickedWord = pick.text;
      this.notifyPick(pick);
    };

    // Listen to native selection changes (when user holds long and drags selection handles to pick a sentence)
    doc.addEventListener('selectionchange', () => {
      if (!isUserInteracting) return;

      if (selectionSettleTimer) clearTimeout(selectionSettleTimer);
      selectionSettleTimer = setTimeout(() => {
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const selectedStr = sel.toString().trim();
        if (!selectedStr || selectedStr.length < 2 || selectedStr.length > 800) return;
        if (selectedStr === lastNotifiedText) return;

        // Only auto-stage from selectionchange when user selects multiple words (a phrase/sentence)
        const wordCount = selectedStr.split(/\s+/).length;
        if (wordCount < 2) return;

        const range = sel.getRangeAt(0);
        const rawRect = range.getBoundingClientRect();
        const pick = extractPickFromNode(range.startContainer, range.startOffset);
        if (pick) {
          pick.text = selectedStr;
          emitViewportPick(pick, rawRect.left, rawRect.top, rawRect);
        } else {
          emitViewportPick(
            {
              text: selectedStr,
              sentence: selectedStr,
              leftContext: '',
              rightContext: '',
              offsetInSentence: 0,
              rects: [],
            },
            rawRect.left,
            rawRect.top,
            rawRect,
          );
        }
      }, 450);
    });

    doc.addEventListener('pointerdown', (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downTime = Date.now();
      isUserInteracting = true;
      lastNotifiedText = '';
    });

    doc.addEventListener('pointerup', (e: PointerEvent) => {
      // Keep isUserInteracting true for 2.5s after pointerup so dragging iOS blue selection handles continues to work
      setTimeout(() => {
        isUserInteracting = false;
      }, 2500);

      if (e.button !== 0) return;

      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest?.('a[href]')) return;

      const sel = doc.getSelection();
      const selectedStr = sel && !sel.isCollapsed ? sel.toString().trim() : '';

      // 1. Multi-word / sentence selection (after long-press + drag) -> stage sentence & offer translation
      if (sel && selectedStr && selectedStr.split(/\s+/).length >= 2 && selectedStr.length <= 800) {
        if (selectionSettleTimer) clearTimeout(selectionSettleTimer);
        const range = sel.getRangeAt(0);
        const rawRect = range.getBoundingClientRect();
        const pick = extractPickFromNode(range.startContainer, range.startOffset);
        if (pick) {
          pick.text = selectedStr;
          emitViewportPick(pick, e.clientX, e.clientY, rawRect);
        } else {
          emitViewportPick(
            {
              text: selectedStr,
              sentence: selectedStr,
              leftContext: '',
              rightContext: '',
              offsetInSentence: 0,
              rects: [],
            },
            e.clientX,
            e.clientY,
            rawRect,
          );
        }
        return;
      }

      // 2. Quick tap (< 380ms, no swipe):
      // If something is already selected/open, tapping anywhere dismisses it first!
      // Otherwise tapping a word shows the "თარგმნა" button.
      const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
      const pressDuration = Date.now() - downTime;

      if (moveDist < 10 && pressDuration < 380) {
        doc.getSelection()?.removeAllRanges();

        if (this.activePickedWord) {
          this.activePickedWord = '';
          lastNotifiedText = '';
          this.notifyPick({
            text: '',
            sentence: '',
            leftContext: '',
            rightContext: '',
            offsetInSentence: 0,
            rects: [],
          });
          return;
        }

        const pick = pickTextFromPoint(e.clientX, e.clientY, doc);
        if (pick && pick.text) {
          this.activePickedWord = pick.text;
          emitViewportPick(pick, e.clientX, e.clientY);
        } else {
          this.activePickedWord = '';
          this.notifyPick({
            text: '',
            sentence: '',
            leftContext: '',
            rightContext: '',
            offsetInSentence: 0,
            rects: [],
          });
        }
      }
    });
  }

  clearActivePick(): void {
    this.activePickedWord = '';
    try {
      const contents = this.viewElement?.renderer?.getContents?.() || [];
      for (const content of contents) {
        content.doc?.getSelection?.()?.removeAllRanges?.();
      }
    } catch {
      // ignore
    }
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

  async goToHref(href: string): Promise<void> {
    if (this.viewElement && href) {
      await this.viewElement.goTo(href);
    }
  }

  async goToFraction(fraction: number): Promise<void> {
    if (this.viewElement) {
      await this.viewElement.goToFraction(Math.max(0, Math.min(1, fraction)));
    }
  }

  getCurrentLocator(): Locator {
    return { kind: 'epub', cfi: this.currentCfi };
  }

  getTotalPages(): number {
    return 100;
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

  onRelocate(callback: (info: EpubRelocateInfo) => void): () => void {
    this.relocateListeners.push(callback);
    return () => {
      this.relocateListeners = this.relocateListeners.filter((cb) => cb !== callback);
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
    this.relocateListeners = [];
    this.keydownListeners = [];
    try {
      this.viewElement?.close?.();
    } catch {
      // ignore
    }
    if (this.viewElement && this.viewElement.parentElement) {
      this.viewElement.parentElement.removeChild(this.viewElement);
    }
    this.viewElement = null;
    this.container = null;
  }
}
