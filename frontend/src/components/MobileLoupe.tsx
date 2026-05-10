/**
 * MobileLoupe — circular magnifier that shows a zoomed view of the area
 * under the user's finger on long-press.
 *
 * Behaviour:
 * - Appears above the finger after a 500ms long-press.
 * - Follows finger position while held.
 * - Highlights the word whose bounding box contains the finger point.
 * - Disappears on touch end, leaving the word selected.
 * - Repositions below the finger if near the top edge of the viewport.
 *
 * Zoom is relative to the current page zoom level (i.e. if the PDF is
 * already zoomed 2x, the loupe adds 1.5x on top, not 3x absolute).
 *
 * Canvas capture:
 *   On each render cycle, the loupe finds the PDF <canvas> element under
 *   the finger and draws a zoomed portion of it into its own canvas.
 *   This is safe because PDF.js renders same-origin blobs.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ── Configuration ──
const LOUPE_RADIUS = 60;           // px radius of the loupe circle
const LOUPE_ZOOM_RELATIVE = 1.8;   // relative zoom factor on top of page zoom
const VERTICAL_OFFSET = 80;        // px above the finger; flips below if near top
const EDGE_THRESHOLD = 150;        // px from top edge where loupe flips downward
const LONG_PRESS_MS = 500;         // ms to trigger long-press

export interface LoupeState {
  visible: boolean;
  x: number;
  y: number;
  pageZoom: number;
  highlightedWord: string | null;
}

interface MobileLoupeProps {
  /** The container element that holds the PDF page canvas/scroller */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Callback when a word is selected via loupe */
  onWordSelected: (word: string, pageX: number, pageY: number) => void;
  /** Check if a point (in viewport coords) is inside any word zone and return the word */
  getWordAtPoint: (viewportX: number, viewportY: number) => string | null;
  /** Current page zoom level (for relative loupe zoom) */
  pageZoom: number;
  /** Whether loupe is active */
  enabled: boolean;
}

export default function MobileLoupe({
  containerRef,
  onWordSelected,
  getWordAtPoint,
  pageZoom,
  enabled,
}: MobileLoupeProps) {
  const [state, setState] = useState<LoupeState>({
    visible: false,
    x: 0,
    y: 0,
    pageZoom: 1,
    highlightedWord: null,
  });

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const lastHighlightedWord = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const updateLoupePosition = useCallback((clientX: number, clientY: number) => {
    const word = getWordAtPoint(clientX, clientY);
    lastHighlightedWord.current = word;

    setState(prev => ({
      ...prev,
      x: clientX,
      y: clientY,
      visible: true,
      pageZoom,
      highlightedWord: word,
    }));
  }, [getWordAtPoint, pageZoom]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    if (!containerRef.current?.contains(e.target as Node)) return;

    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPressRef.current = false;
    lastHighlightedWord.current = null;

    longPressTimer.current = setTimeout(() => {
      isLongPressRef.current = true;
      updateLoupePosition(touch.clientX, touch.clientY);
    }, LONG_PRESS_MS);
  }, [enabled, containerRef, updateLoupePosition]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    if (!isLongPressRef.current) {
      if (touchStartPos.current) {
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartPos.current.x;
        const dy = touch.clientY - touchStartPos.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
      }
      return;
    }

    e.preventDefault();
    const touch = e.touches[0];
    updateLoupePosition(touch.clientX, touch.clientY);
  }, [enabled, updateLoupePosition]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isLongPressRef.current) {
      e.preventDefault();
      const word = lastHighlightedWord.current;
      if (word) {
        onWordSelected(word, state.x, state.y);
      }
      isLongPressRef.current = false;
      lastHighlightedWord.current = null;
      setState(prev => ({ ...prev, visible: false, highlightedWord: null }));
    }

    touchStartPos.current = null;
  }, [enabled, onWordSelected, state.x, state.y]);

  const handleTouchCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    isLongPressRef.current = false;
    touchStartPos.current = null;
    lastHighlightedWord.current = null;
    setState(prev => ({ ...prev, visible: false, highlightedWord: null }));
  }, []);

  // Attach touch event listeners to the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  // Draw loupe content when visible with requestAnimationFrame for smooth updates
  useEffect(() => {
    if (!state.visible) return;

    let rafId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      drawLoupeContent(canvas, state.x, state.y, pageZoom);
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [state.visible, state.x, state.y, pageZoom]);

  // ── Position & Style ──
  const isNearTop = state.y < EDGE_THRESHOLD;

  if (!state.visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 9999,
        top: isNearTop
          ? `${state.y + VERTICAL_OFFSET}px`
          : `${state.y - VERTICAL_OFFSET}px`,
        left: `${state.x}px`,
        transform: 'translate(-50%, -50%)',
        width: `${LOUPE_RADIUS * 2}px`,
        height: `${LOUPE_RADIUS * 2}px`,
        borderRadius: '50%',
        overflow: 'hidden',
        pointerEvents: 'none',
        background: 'rgba(30, 30, 40, 0.92)',
        border: '2px solid rgba(168, 85, 247, 0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 4px rgba(168,85,247,0.15)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      {/* Zoomed canvas */}
      <canvas
        ref={canvasRef}
        width={LOUPE_RADIUS * 2}
        height={LOUPE_RADIUS * 2}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          display: 'block',
        }}
      />

      {/* Crosshair */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '2px',
          height: '20px',
          background: 'rgba(168, 85, 247, 0.8)',
          borderRadius: '1px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '20px',
          height: '2px',
          background: 'rgba(168, 85, 247, 0.8)',
          borderRadius: '1px',
          pointerEvents: 'none',
        }}
      />

      {/* Word label */}
      {state.highlightedWord && (
        <div
          style={{
            position: 'absolute',
            bottom: '-28px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(168, 85, 247, 0.9)',
            color: 'white',
            padding: '2px 10px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {state.highlightedWord}
        </div>
      )}
    </div>
  );
}

/**
 * Draw the zoomed PDF canvas area into the loupe canvas.
 *
 * Strategy: use document.elementsFromPoint to find the PDF <canvas>
 * beneath the finger, then drawImage from it at higher scale.
 */
function drawLoupeContent(
  canvas: HTMLCanvasElement,
  centerX: number,
  centerY: number,
  pageZoom: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = canvas.width;
  const radius = size / 2;
  const effectiveZoom = LOUPE_ZOOM_RELATIVE / pageZoom;
  const sourceRadius = radius / effectiveZoom;

  // Clear
  ctx.clearRect(0, 0, size, size);

  // Find the PDF canvas under the finger point
  const elements = document.elementsFromPoint(centerX, centerY);
  const pdfCanvas = elements.find(
    (el) =>
      el.tagName === 'CANVAS' &&
      (el as HTMLCanvasElement).width > 100 &&
      (el as HTMLCanvasElement).height > 100 &&
      el.closest('.pdf-page'),
  ) as HTMLCanvasElement | undefined;

  if (!pdfCanvas) {
    // No PDF canvas found — show placeholder
    ctx.fillStyle = 'rgba(40, 40, 50, 0.9)';
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔍', radius, radius);
    return;
  }

  // Get the page's bounding rect in viewport coords
  const pageRect = pdfCanvas.getBoundingClientRect();
  const scaleX = pdfCanvas.width / pageRect.width;
  const scaleY = pdfCanvas.height / pageRect.height;

  // Source pixel coords on the PDF canvas
  const sourceX = (centerX - pageRect.left) * scaleX;
  const sourceY = (centerY - pageRect.top) * scaleY;
  const srcR = sourceRadius * scaleX; // use X scale for radius (Y should be similar)

  // Clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
  ctx.clip();

  // Draw zoomed
  ctx.drawImage(
    pdfCanvas,
    sourceX - srcR,
    sourceY - srcR,
    srcR * 2,
    srcR * 2,
    0,
    0,
    size,
    size,
  );

  ctx.restore();
}