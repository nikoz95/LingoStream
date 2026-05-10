/**
 * useTextSelection — observes text selection on react-pdf's native TextLayer.
 *
 * Works with react-pdf's `.react-pdf__Page__textContent` layer.
 * - Native browser selection (double-click word, drag multi-word, triple-click line)
 * - Auto-selects word on single click (click without drag)
 * - Long-press on mobile (500ms) to select word under finger
 *
 * Output: selectedText, selectionRect, isWordClick, leftContext, rightContext,
 *         isLongPress, clearSelection(), resetLongPress()
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface SelectionInfo {
  text: string;
  rect: DOMRect | null;
  isWordClick: boolean;
  leftContext: string;
  rightContext: string;
  bookId: number;
}

/**
 * CSS selector for the custom word-level click zones.
 * Since we use backend-extracted coordinates (not react-pdf's TextLayer),
 * selection works on invisible text nodes inside .pdf-word-zone spans.
 */
const TEXT_LAYER_SELECTOR = '.pdf-word-zone';

export function useTextSelection() {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [isWordClick, setIsWordClick] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const [leftContext, setLeftContext] = useState('');
  const [rightContext, setRightContext] = useState('');

  const mousedownPos = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  // ── Touch / long-press refs ──
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Get the word at a text node offset */
  const getWordAtPoint = useCallback((node: Node, offset: number): string => {
    const textContent = node.textContent || '';
    if (!textContent) return '';
    let start = offset;
    let end = offset;
    while (start > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[start - 1])) {
      start--;
    }
    while (end < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[end])) {
      end++;
    }
    return textContent.slice(start, end).trim();
  }, []);

  /** Get context (up to 100 chars) around a word at given offset */
  const getContextAroundWord = useCallback((node: Node, offset: number): { left: string; right: string } => {
    const textContent = node.textContent || '';
    if (!textContent) return { left: '', right: '' };
    let start = offset;
    let end = offset;
    while (start > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[start - 1])) {
      start--;
    }
    while (end < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[end])) {
      end++;
    }
    const left = textContent.slice(Math.max(0, start - 100), start).trim();
    const right = textContent.slice(end, Math.min(textContent.length, end + 100)).trim();
    return { left, right };
  }, []);

  /** Auto-select the word at a given text node offset & dispatch selection state */
  const selectWordAtOffset = useCallback((textNode: Node, offset: number) => {
    const word = getWordAtPoint(textNode, offset);
    if (!word) return;

    setSelectedText(word);
    setIsWordClick(true);

    const context = getContextAroundWord(textNode, offset);
    setLeftContext(context.left);
    setRightContext(context.right);

    // Build a Range for the word to get a bounding rect
    try {
      const wordRange = document.createRange();
      const textContent = textNode.textContent || '';
      let wordStart = offset;
      let wordEnd = offset;
      while (wordStart > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[wordStart - 1])) {
        wordStart--;
      }
      while (wordEnd < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[wordEnd])) {
        wordEnd++;
      }
      wordRange.setStart(textNode, wordStart);
      wordRange.setEnd(textNode, wordEnd);
      setSelectionRect(wordRange.getBoundingClientRect());
    } catch {
      setSelectionRect(null);
    }
  }, [getWordAtPoint, getContextAroundWord]);

  /** Check if event target is inside the PDF text layer */
  const isInTextLayer = useCallback((target: EventTarget | null): boolean => {
    if (!target) return false;
    return (target as HTMLElement).closest(TEXT_LAYER_SELECTOR) !== null;
  }, []);

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!isInTextLayer(e.target)) return;
    mousedownPos.current = { x: e.clientX, y: e.clientY };
  }, [isInTextLayer]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isInTextLayer(e.target)) return;
    if (longPressFired.current) return;

    const sel = window.getSelection();
    if (!sel) return;

    // Detect click vs drag
    const isDrag = mousedownPos.current
      ? Math.abs(e.clientX - mousedownPos.current.x) > 5 ||
        Math.abs(e.clientY - mousedownPos.current.y) > 5
      : false;

    if (isDrag) {
      // Drag selection — use selected text as-is
      if (!sel.isCollapsed) {
        const text = sel.toString().trim();
        if (text) {
          setSelectedText(text);
          setIsWordClick(false);
          setLeftContext('');
          setRightContext('');
          try {
            setSelectionRect(sel.getRangeAt(0).getBoundingClientRect());
          } catch {
            setSelectionRect(null);
          }
        }
      }
    } else {
      // Click (no drag) — auto-select word under cursor
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const textNode = range.startContainer;
        const offset = range.startOffset;

        // If the selection already selected something by native means (double-click),
        // prefer that. Otherwise auto-select the word at cursor.
        if (sel.isCollapsed) {
          selectWordAtOffset(textNode, offset);
        } else {
          // Could be a native double-click selection — use as-is if short
          const text = sel.toString().trim();
          if (text && text.split(/\s+/).length <= 3) {
            setSelectedText(text);
            setIsWordClick(true);
            // Try to get context from the start container
            const ctx = getContextAroundWord(textNode, offset);
            setLeftContext(ctx.left);
            setRightContext(ctx.right);
            try {
              setSelectionRect(sel.getRangeAt(0).getBoundingClientRect());
            } catch {
              setSelectionRect(null);
            }
          }
        }
      }
    }
  }, [isInTextLayer, selectWordAtOffset, getContextAroundWord]);

  // ── Touch / long-press ──
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isInTextLayer(e.target)) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressFired.current = false;

    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;

      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!el || !isInTextLayer(el)) return;

      const textLayer = (el as HTMLElement).closest(TEXT_LAYER_SELECTOR);
      if (!textLayer) return;

      // Find the nearest span with text
      const span = el.tagName === 'SPAN' ? el as HTMLElement : (el as HTMLElement).closest('span');
      if (!span || !span.textContent) return;

      const spanRect = span.getBoundingClientRect();
      const relativeX = touch.clientX - spanRect.left;
      const ratio = relativeX / spanRect.width;
      const textLen = span.textContent.length;
      const offset = Math.round(ratio * textLen);
      const clampedOffset = Math.max(0, Math.min(offset, textLen - 1));

      const textNode = span.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

      selectWordAtOffset(textNode, clampedOffset);
      setIsLongPress(true);
    }, 500);
  }, [isInTextLayer, selectWordAtOffset]);

  const handleTouchMove = useCallback((_e: TouchEvent) => {
    if (touchStartPos.current && !longPressFired.current) {
      clearTimeout(longPressTimer.current!);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  }, []);

  // ── Word hover highlight on TextLayer spans ──
  const hoveredSpan = useRef<HTMLElement | null>(null);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!isInTextLayer(target)) return;
    if (target.tagName === 'SPAN') {
      if (hoveredSpan.current && hoveredSpan.current !== target) {
        hoveredSpan.current.classList.remove('word-hover-highlight');
      }
      target.classList.add('word-hover-highlight');
      hoveredSpan.current = target;
    }
  }, [isInTextLayer]);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (target.tagName === 'SPAN') {
      if (relatedTarget && isInTextLayer(relatedTarget)) return;
      target.classList.remove('word-hover-highlight');
    }
    if (!isInTextLayer(target) && hoveredSpan.current) {
      hoveredSpan.current.classList.remove('word-hover-highlight');
      hoveredSpan.current = null;
    }
  }, [isInTextLayer]);

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      if (hoveredSpan.current) {
        hoveredSpan.current.classList.remove('word-hover-highlight');
      }
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [handleMouseDown, handleMouseUp, handleMouseOver, handleMouseOut, handleTouchStart, handleTouchMove, handleTouchEnd]);

  const clearSelection = useCallback(() => {
    setSelectedText('');
    setSelectionRect(null);
    setIsWordClick(false);
    setIsLongPress(false);
    setLeftContext('');
    setRightContext('');
    window.getSelection()?.removeAllRanges();
  }, []);

  const resetLongPress = useCallback(() => {
    setIsLongPress(false);
  }, []);

  return {
    selectedText,
    selectionRect,
    isWordClick,
    isLongPress,
    leftContext,
    rightContext,
    clearSelection,
    resetLongPress,
  };
}