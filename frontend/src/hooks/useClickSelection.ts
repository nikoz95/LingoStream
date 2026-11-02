/**
 * useClickSelection — hybrid word and passage selection for PDF canvas.
 *
 * 1. Single click on a word:
 *    Uses PyMuPDF backend word bounding boxes (findWordAtPoint) to pinpoint
 *    the exact dictionary word, lemma, and position.
 *    Renders a clean purple highlight overlay over that single word.
 *
 * 2. Drag selection (multiple words / sentences / paragraphs):
 *    Uses browser's native text selection (Selection / Range API).
 *    Reads the continuous flow of text lines in order (not an arbitrary rectangle).
 *    Leaves native browser selection highlight active.
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

  /** Find the word at a given viewport point by checking backend bboxes */
  const findWordAtPoint = useCallback(
    (viewportX: number, viewportY: number): { word: string; pageIndex: number; rect: SelectionRect } | null => {
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
        if (pdfX >= w.x0 - 2 && pdfX <= w.x1 + 2 && pdfY >= w.y0 - 2 && pdfY <= w.y1 + 2) {
          const rect: SelectionRect = {
            left: pageRect.left + w.x0 / scaleX,
            top: pageRect.top + w.y0 / scaleY,
            width: (w.x1 - w.x0) / scaleX,
            height: (w.y1 - w.y0) / scaleY,
          };
          return { word: w.word, pageIndex: pageIdx, rect };
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

  // ── Mouse handlers ──

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
    },
    [enabled],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;

      const sel = window.getSelection();
      const rawSelectedText = sel?.toString().trim() || '';

      // Check if user dragged across multiple characters or words
      const isDrag = mouseDownPos.current
        ? Math.abs(e.clientX - mouseDownPos.current.x) > 6 ||
          Math.abs(e.clientY - mouseDownPos.current.y) > 6
        : false;

      mouseDownPos.current = null;

      // Only allow selection if the mouse interaction originated within an actual PDF page
      const targetEl = e.target as HTMLElement | null;
      const isInsidePdfPage = !!targetEl?.closest('[data-page-number]');

      // 1. Passage Drag Selection: let the browser text flow speak!
      if (isDrag && sel && !sel.isCollapsed && rawSelectedText.length > 0 && isInsidePdfPage) {
        setSelectedText(rawSelectedText);
        const wordCount = rawSelectedText.split(/\s+/).length;
        setIsWordClick(wordCount === 1);
        setLeftContext('');
        setRightContext('');

        try {
          if (sel.rangeCount > 0) {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            setSelectionRect({
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
            });
          }
        } catch {
          setSelectionRect(null);
        }
        return;
      }

      // Clear any accidental selection outside of PDF pages
      if (isDrag && !isInsidePdfPage) {
        sel?.removeAllRanges();
        return;
      }

      // 2. Single Click: use PyMuPDF exact bounding boxes
      if (!isDrag) {
        const result = findWordAtPoint(e.clientX, e.clientY);
        if (result) {
          // Clean browser native selection range so it doesn't fight the overlay
          sel?.removeAllRanges();

          setSelectedText(result.word);
          setIsWordClick(true);
          const ctx = getWordContext(result.word, result.pageIndex);
          setLeftContext(ctx.left);
          setRightContext(ctx.right);
          setSelectionRect(result.rect);
        } else {
          // Click on margin / empty space
          setSelectedText('');
          setSelectionRect(null);
          setIsWordClick(false);
          setLeftContext('');
          setRightContext('');
          sel?.removeAllRanges();
        }
      }
    },
    [enabled, findWordAtPoint, getWordContext],
  );

  // ── Touch handlers ──

  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      touchMoved.current = false;
    },
    [enabled],
  );

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
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
          setSelectionRect(result.rect);
        }
      }
      touchStartPos.current = null;
    },
    [findWordAtPoint, getWordContext],
  );

  // ── Event listeners ──

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, enabled, handleMouseDown, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

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
    window.getSelection()?.removeAllRanges();
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
