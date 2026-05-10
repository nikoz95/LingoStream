/**
 * Hook: Extract text content from a PDF page with bounding-box coordinates.
 * Uses pdfjs-dist's getTextContent() directly, returning items with their
 * transform/width/height for precise positioning.
 *
 * Each text item has:
 *  - str: the text string
 *  - transform: [a, b, c, d, tx, ty] (standard PDF transformation matrix)
 *  - width, height: dimensions in PDF coordinate space
 *  - fontName: the font used
 *
 * We expose items in a normalized format with x, y, w, h for overlay rendering.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface TextContentItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Original transform matrix from pdfjs */
  transform: number[];
}

export interface PageTextContentResult {
  items: TextContentItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Extract text content from a single PDF page with bounding boxes.
 * Uses the same page.getTextContent() API that react-pdf's TextLayer uses internally.
 */
export function usePageTextContent(
  pdfDocument: PDFDocumentProxy | null,
  pageIndex: number
): PageTextContentResult {
  const [items, setItems] = useState<TextContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastPageRef = useRef<number>(-1);

  const extract = useCallback(async (pdf: PDFDocumentProxy, pageNum: number) => {
    setLoading(true);
    setError(null);

    try {
      const page = await pdf.getPage(pageNum + 1); // pdfjs uses 1-based
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;
      const textContent = await page.getTextContent();

      const extracted: TextContentItem[] = textContent.items
        .filter((item: any) => item.str && item.str.trim())
        .map((item: any) => {
          const tx = item.transform[4];
          const ty = item.transform[5];
          const itemHeight = item.height || 12;
          // PDF origin is bottom-left, CSS origin is top-left.
          // Invert Y: PDF ty=0 (bottom) → CSS top = pageHeight - h
          // PDF ty=pageHeight - h (top of text) → CSS top = 0
          const cssY = pageHeight - ty - itemHeight;
          return {
            str: item.str,
            x: tx,
            y: cssY,
            w: item.width,
            h: itemHeight,
            transform: item.transform,
          };
        });

      setItems(extracted);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract text');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pdfDocument || pageIndex < 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Avoid re-extracting the same page
    if (lastPageRef.current === pageIndex && items.length > 0) {
      return;
    }

    lastPageRef.current = pageIndex;
    extract(pdfDocument, pageIndex);
  }, [pdfDocument, pageIndex, extract, items.length]);

  return { items, loading, error };
}