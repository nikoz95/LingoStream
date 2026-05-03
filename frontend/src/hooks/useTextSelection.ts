import { useState, useEffect, useRef, useCallback } from 'react';

export function useTextSelection() {
  const [selectedText, setSelectedText] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelection = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const text = sel.toString().trim();
        if (text) {
          setSelectedText(text);
        }
      }
    }, 300);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection);
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleSelection]);

  const clearSelection = useCallback(() => {
    setSelectedText('');
  }, []);

  return { selectedText, clearSelection };
}