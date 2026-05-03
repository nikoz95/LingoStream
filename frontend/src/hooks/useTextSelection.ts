import { useState, useEffect, useRef, useCallback } from 'react';

export interface SelectionInfo {
  text: string;
  rect: DOMRect | null;
  isWordClick: boolean;
  leftContext: string;
  rightContext: string;
  bookId: number;
}

export function useTextSelection() {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [isWordClick, setIsWordClick] = useState(false);
  const [leftContext, setLeftContext] = useState('');
  const [rightContext, setRightContext] = useState('');

  const mousedownPos = useRef<{ x: number; y: number } | null>(null);
  const mouseupPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const lastClickTime = useRef(0);
  const lastClickTarget = useRef<EventTarget | null>(null);

  const getWordAtPoint = useCallback((node: Node, offset: number): string => {
    const textContent = node.textContent || '';
    if (!textContent) return '';

    // Find word boundaries
    let start = offset;
    let end = offset;

    // Go backward to find start of word
    while (start > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[start - 1])) {
      start--;
    }
    // Go forward to find end of word
    while (end < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[end])) {
      end++;
    }

    return textContent.slice(start, end).trim();
  }, []);

  const getContextAroundWord = useCallback((node: Node, offset: number): { left: string; right: string } => {
    const textContent = node.textContent || '';
    if (!textContent) return { left: '', right: '' };

    // Find word boundaries
    let start = offset;
    let end = offset;
    while (start > 0 && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[start - 1])) {
      start--;
    }
    while (end < textContent.length && /[\w\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]/.test(textContent[end])) {
      end++;
    }

    // Get context (up to 100 chars each side)
    const left = textContent.slice(Math.max(0, start - 100), start).trim();
    const right = textContent.slice(end, Math.min(textContent.length, end + 100)).trim();

    return { left, right };
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Ignore clicks outside PDF text layer (e.g., translate icon, header, sidebar, search panel)
    const target = e.target as HTMLElement;
    if (!target.closest('.react-pdf__Page__textContent')) return;

    mousedownPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Ignore clicks outside PDF text layer (e.g., translate icon, header, sidebar, search panel)
    const target = e.target as HTMLElement;
    if (!target.closest('.react-pdf__Page__textContent')) return;

    mouseupPos.current = { x: e.clientX, y: e.clientY };

    // Detect click vs drag (within 5px threshold)
    if (mousedownPos.current) {
      const dx = e.clientX - mousedownPos.current.x;
      const dy = e.clientY - mousedownPos.current.y;
      isDragging.current = Math.abs(dx) > 5 || Math.abs(dy) > 5;
    }

    const sel = window.getSelection();

    if (isDragging.current) {
      // Drag selection - use the selected text as-is
      if (sel && !sel.isCollapsed) {
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
      // Click (no drag) - auto-select the word under cursor
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // Get the word at the cursor position
        const textNode = range.startContainer;
        const offset = range.startOffset;
        const word = getWordAtPoint(textNode, offset);

        if (word) {
          setSelectedText(word);
          setIsWordClick(true);

          // Get context around the word
          const context = getContextAroundWord(textNode, offset);
          setLeftContext(context.left);
          setRightContext(context.right);

          try {
            // Create a new range to accurately get the word's bounding rect
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
        }
      }
    }
  }, [getWordAtPoint, getContextAroundWord]);

  // ── Word hover highlight (mouseenter/mouseleave) ──────────────────
  const hoveredSpan = useRef<HTMLElement | null>(null);

  const handleMouseEnter = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only apply to text spans inside PDF text content layer
    if (!target.closest('.react-pdf__Page__textContent')) return;
    if (target.tagName === 'SPAN' || target.tagName === 'span') {
      // Remove highlight from previous span
      if (hoveredSpan.current && hoveredSpan.current !== target) {
        hoveredSpan.current.classList.remove('word-hover-highlight');
      }
      target.classList.add('word-hover-highlight');
      hoveredSpan.current = target;
    }
  }, []);

  const handleMouseLeave = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'SPAN' || target.tagName === 'span') {
      target.classList.remove('word-hover-highlight');
    }
    // Also clear if the mouse leaves the text content layer entirely
    if (!target.closest('.react-pdf__Page__textContent') && hoveredSpan.current) {
      hoveredSpan.current.classList.remove('word-hover-highlight');
      hoveredSpan.current = null;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseenter', handleMouseEnter, true);
    document.addEventListener('mouseleave', handleMouseLeave, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseenter', handleMouseEnter, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      // Clean up any lingering highlight
      if (hoveredSpan.current) {
        hoveredSpan.current.classList.remove('word-hover-highlight');
      }
    };
  }, [handleMouseDown, handleMouseUp, handleMouseEnter, handleMouseLeave]);

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
  };
}