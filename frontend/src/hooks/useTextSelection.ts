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
import { extractPickFromNode } from '../lib/textPicker';

export interface SelectionInfo {
  text: string;
  rect: DOMRect | null;
  isWordClick: boolean;
  leftContext: string;
  rightContext: string;
  bookId: number;
}

const TEXT_LAYER_SELECTOR = '.textLayer, .textLayer span, .react-pdf__Page__textContent, .react-pdf__Page__textContent span, .pdf-page span, [class*="textLayer"]';

export function useTextSelection() {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [isWordClick, setIsWordClick] = useState(false);
  const [leftContext, setLeftContext] = useState('');
  const [rightContext, setRightContext] = useState('');

  const mousedownPos = useRef<{ x: number; y: number } | null>(null);

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
  const selectWordAtOffset = useCallback((textNode: Node, offset: number, clickX?: number, clickY?: number) => {
    let node = textNode;
    let charOffset = offset;

    // 1. If click coordinates are provided, caretPositionFromPoint / caretRangeFromPoint pinpoint exact character position
    if (clickX !== undefined && clickY !== undefined) {
      const doc = document as any;
      if (doc.caretPositionFromPoint) {
        const pos = doc.caretPositionFromPoint(clickX, clickY);
        if (pos && pos.offsetNode) {
          node = pos.offsetNode;
          charOffset = pos.offset;
        }
      } else if (doc.caretRangeFromPoint) {
        const r = doc.caretRangeFromPoint(clickX, clickY);
        if (r && r.startContainer) {
          node = r.startContainer;
          charOffset = r.startOffset;
        }
      }
    }

    if (node.nodeType !== Node.TEXT_NODE) {
      if (node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
        node = node.firstChild;
        charOffset = 0;
      } else {
        return;
      }
    }

    const textContent = node.textContent || '';
    if (!textContent) return;

    charOffset = Math.max(0, Math.min(charOffset, textContent.length));

    // If offset is pointing to the space after a word, nudge backwards
    if (charOffset > 0 && !/[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[charOffset] || '') &&
        /[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[charOffset - 1] || '')) {
      charOffset--;
    }

    let start = charOffset;
    let end = charOffset;

    // Check if on word char, or immediately adjacent
    if (!/[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[start] || '')) {
      if (start + 1 < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[start + 1])) {
        start++;
        end = start;
      } else if (start > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[start - 1])) {
        start--;
        end = start;
      }
    }

    // Expand backwards
    while (start > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[start - 1])) {
      start--;
    }
    // Expand forwards
    while (end < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u10A0-\u10FF]/.test(textContent[end])) {
      end++;
    }

    const clickedWord = textContent.slice(start, end).trim();
    if (!clickedWord) return;

    // Build precise range for this word
    try {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);

      // Highlight precisely this word in the browser
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }

      setSelectionRect(range.getBoundingClientRect());
    } catch {
      setSelectionRect(null);
    }

    console.log("[DEBUG]", { clickedWord, textContent, start, end });
    setSelectedText(clickedWord);
    setIsWordClick(true);

    // Get surrounding context from the paragraph/block
    const pick = extractPickFromNode(node, charOffset);
    if (pick) {
      setLeftContext(pick.leftContext ? `${pick.leftContext} ` : '');
      setRightContext(pick.rightContext ? ` ${pick.rightContext}` : '');
    }
  }, []);

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
    const sel = window.getSelection();
    if (!sel) return;

    const rawSelectedText = sel.toString().trim();

    // 1. If user highlighted/dragged multiple characters/words across the page
    if (!sel.isCollapsed && rawSelectedText.length > 0) {
      setSelectedText(rawSelectedText);
      // If more than 1 word, treat as passage translation
      const wordCount = rawSelectedText.split(/\s+/).length;
      setIsWordClick(wordCount === 1);
      setLeftContext('');
      setRightContext('');

      try {
        if (sel.rangeCount > 0) {
          setSelectionRect(sel.getRangeAt(0).getBoundingClientRect());
        }
      } catch {
        setSelectionRect(null);
      }
      return;
    }

    // 2. Single click (no drag selection active)
    if (!isInTextLayer(e.target)) return;

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const textNode = range.startContainer;
      const offset = range.startOffset;

      if (sel.isCollapsed) {
        selectWordAtOffset(textNode, offset, e.clientX, e.clientY);
      }
    }
  }, [isInTextLayer, selectWordAtOffset]);

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseUp]);

  const clearSelection = useCallback(() => {
    setSelectedText('');
    setSelectionRect(null);
    setIsWordClick(false);
    setLeftContext('');
    setRightContext('');
    window.getSelection()?.removeAllRanges();
  }, []);

  /** Programmatic word selection for mobile loupe */
  const selectWord = useCallback((word: string, _pageIndex: number, vpX: number, vpY: number) => {
    setSelectedText(word);
    setIsWordClick(true);

    // Find the nearest word zone span to get context
    const el = document.elementFromPoint(vpX, vpY);
    const span = el?.closest('.pdf-word-zone') as HTMLElement | null;
    if (span?.firstChild?.nodeType === Node.TEXT_NODE) {
      const ctx = getContextAroundWord(span.firstChild, Math.floor((span.firstChild.textContent?.length || 0) / 2));
      setLeftContext(ctx.left);
      setRightContext(ctx.right);
    } else {
      setLeftContext('');
      setRightContext('');
    }

    setSelectionRect(new DOMRect(vpX - 20, vpY - 10, 40, 20));
  }, [getContextAroundWord]);

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