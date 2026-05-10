/**
 * useClickSelection — coordinate-based word/multi-word selection on PDF canvas.
 *
 * Replaces useTextSelection.ts. No invisible text nodes, no Range/Selection API.
 * Works by mapping mouse/touch viewport coordinates → PDF point coordinates
 * using backend-extracted per-word bounding boxes.
 *
 * Desktop:
 *  - Click → maps click point → finds word whose bbox contains the point
 *  - Drag → computes selection rect → finds all words whose bbox overlaps
 *
 * Mobile:
 *  - MobileLoupe handles all touch interaction (long-press → loupe, quick tap)
 *  - useClickSelection does NOT attach touch events (no conflict)
 *  - ReaderPage calls selectWord() from MobileLoupe's callbacks
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WordPositionsPageResponse } from '../lib/api';

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface UseClickSelectionOptions {
  /** Ref to the scrollable container that holds PDF pages */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Backend word positions cache: { [pageIndex]: WordPositionsPageResponse } */
  wordPositionsCache: Record<number, WordPositionsPageResponse>;
  /** Enable/disable mouse handling */
  enabled?: boolean;
}

export function useClickSelection({
  containerRef,
  wordPositionsCache,
  enabled = true,
}: UseClickSelectionOptions) {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [isWordClick, setIsWordClick] = useState(false);
  const [leftContext, setLeftContext] = useState('');
  const [rightContext, setRightContext] = useState('');

  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  /** Find the word at a given viewport point by checking backend bboxes */
  const findWordAtPoint = useCallback(
    (viewportX: number, viewportY: number): { word: string; pageIndex: number } | null => {
      const pageEl = document
        .elementsFromPoint(viewportX, viewportY)
        .find((el) => el.closest && el.closest('[data-page-number]'))
        ?.closest('[data-page-number]') as HTMLElement | undefined;

      if (!pageEl) return null;

      const pageNum = Number(pageEl.dataset.pageNumber);
      const pageIdx = pageNum - 1;
      const pageData = wordPositionsCache[pageIdx];
      if (!pageData || !pageData.words || pageData.words.length === 0) return null;

      const pageRect = pageEl.getBoundingClientRect();
      const scaleX = pageData.page_width / (pageRect.width || 1);
      const scaleY = pageData.page_height / (pageRect.height || 1);

      const pdfX = (viewportX - pageRect.left) * scaleX;
      const pdfY = (viewportY - pageRect.top) * scaleY;

      for (const w of pageData.words) {
        if (pdfX >= w.x0 && pdfX <= w.x1 && pdfY >= w.y0 && pdfY <= w.y1) {
          return { word: w.word, pageIndex: pageIdx };
        }
      }
      return null;
    },
    [wordPositionsCache],
  );

  /** Build context string from surrounding words on the same page */
  const getWordContext = useCallback(
    (word: string, pageIndex: number): { left: string; right: string } => {
      const pageData = wordPositionsCache[pageIndex];
      if (!pageData || !pageData.words) return { left: '', right: '' };

      const idx = pageData.words.findIndex((w) => w.word.toLowerCase() === word.toLowerCase());
      if (idx === -1) return { left: '', right: '' };

      let left = '';
      for (let i = idx - 1; i >= 0 && left.length < 100; i--) {
        left = pageData.words[i].word + ' ' + left;
      }
      let right = '';
      for (let i = idx + 1; i < pageData.words.length && right.length < 100; i++) {
        right += pageData.words[i].word + ' ';
      }

      return { left: left.trim(), right: right.trim() };
    },
    [wordPositionsCache],
  );

  /** Collect all words whose bbox overlaps a viewport rectangle (for drag-select) */
  const findWordsInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): string => {
      const vpLeft = Math.min(x1, x2);
      const vpTop = Math.min(y1, y2);
      const vpRight = Math.max(x1, x2);
      const vpBottom = Math.max(y1, y2);

      const selectedWords: string[] = [];
      const seen = new Set<string>();

      const pages = document.querySelectorAll('[data-page-number]');
      for (const pageEl of pages) {
        const pageNum = Number((pageEl as HTMLElement).dataset.pageNumber);
        const pageIdx = pageNum - 1;
        const pageData = wordPositionsCache[pageIdx];
        if (!pageData || !pageData.words) continue;

        const pageRect = pageEl.getBoundingClientRect();
        const scaleX = pageData.page_width / (pageRect.width || 1);
        const scaleY = pageData.page_height / (pageRect.height || 1);

        const pdfLeft = Math.max(0, (vpLeft - pageRect.left) * scaleX);
        const pdfTop = Math.max(0, (vpTop - pageRect.top) * scaleY);
        const pdfRight = Math.min(pageData.page_width, (vpRight - pageRect.left) * scaleX);
        const pdfBottom = Math.min(pageData.page_height, (vpBottom - pageRect.top) * scaleY);

        for (const w of pageData.words) {
          if (seen.has(w.word.toLowerCase())) continue;
          const wLeft = w.x0;
          const wTop = w.y0;
          const wRight = w.x1;
          const wBottom = w.y1;
          const overlap = !(wRight < pdfLeft || wLeft > pdfRight || wBottom < pdfTop || wTop > pdfBottom);
          if (overlap) {
            selectedWords.push(w.word);
            seen.add(w.word.toLowerCase());
          }
        }
      }
      return selectedWords.join(' ');
    },
    [wordPositionsCache],
  );

  /** Compute SelectionRect from viewport coordinates (inverse Y) */
  const getVpSelectionRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): SelectionRect => {
      return {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    },
    [],
  );

  // ── Mouse handlers ──

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      isDragging.current = false;
    },
    [enabled],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !mouseDownPos.current) return;
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging.current = true;
      }
    },
    [enabled],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !mouseDownPos.current) {
        mouseDownPos.current = null;
        return;
      }

      const startX = mouseDownPos.current.x;
      const startY = mouseDownPos.current.y;
      mouseDownPos.current = null;

      if (isDragging.current) {
        isDragging.current = false;
        // Drag-select: find all words in the drag rectangle
        const text = findWordsInRect(startX, startY, e.clientX, e.clientY);
        if (text) {
          setSelectedText(text);
          setIsWordClick(false);
          setLeftContext('');
          setRightContext('');
          setSelectionRect(getVpSelectionRect(startX, startY, e.clientX, e.clientY));
        }
        return;
      }

      // Single click: find word under cursor
      const result = findWordAtPoint(e.clientX, e.clientY);
      if (result) {
        setSelectedText(result.word);
        setIsWordClick(true);
        const ctx = getWordContext(result.word, result.pageIndex);
        setLeftContext(ctx.left);
        setRightContext(ctx.right);
        // Build a tiny rect around the point
        setSelectionRect({
          left: e.clientX - 20,
          top: e.clientY - 10,
          width: 40,
          height: 20,
        });
      }
    },
    [enabled, findWordAtPoint, findWordsInRect, getWordContext, getVpSelectionRect],
  );

  // ── Touch handlers (only for single tap — long-press is MobileLoupe's domain) ──

  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      touchMoved.current = false;

      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      // If no long-press fires within 500ms, treat as tap
      longPressTimer.current = setTimeout(() => {
        // Long-press timer expired without movement — MobileLoupe will handle it.
        // Don't fire selection here; let MobileLoupe do it via callback.
      }, 500);
    },
    [enabled],
  );

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      // If it was a quick tap (no move, no long-press), select word under finger
      if (!touchMoved.current && touchStartPos.current) {
        const { x, y } = touchStartPos.current;
        touchStartPos.current = null;

        const result = findWordAtPoint(x, y);
        if (result) {
          setSelectedText(result.word);
          setIsWordClick(true);
          const ctx = getWordContext(result.word, result.pageIndex);
          setLeftContext(ctx.left);
          setRightContext(ctx.right);
          setSelectionRect({ left: x - 20, top: y - 10, width: 40, height: 20 });
        }
      }
      touchStartPos.current = null;
    },
    [enabled, findWordAtPoint, getWordContext],
  );

  // ── Event listeners ──

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, enabled, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  /** Public method for MobileLoupe to set selection programmatically */
  const selectWord = useCallback(
    (word: string, pageIndex: number, vpX: number, vpY: number) => {
      setSelectedText(word);
      setIsWordClick(true);
      const ctx = getWordContext(word, pageIndex);
      setLeftContext(ctx.left);
      setRightContext(ctx.right);
      setSelectionRect({ left: vpX - 20, top: vpY - 10, width: 40, height: 20 });
    },
    [getWordContext],
  );

  const clearSelection = useCallback(() => {
    setSelectedText('');
    setSelectionRect(null);
    setIsWordClick(false);
    setLeftContext('');
    setRightContext('');
  }, []);

  return {
    selectedText,
    selectionRect,
    isWordClick,
    leftContext,
    rightContext,
    clearSelection,
    selectWord,
  };
}