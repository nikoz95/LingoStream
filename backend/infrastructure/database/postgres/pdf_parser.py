"""PDF parser using PyMuPDF (fitz). Same interface as EPUBParser.

Extracts word-level bounding box coordinates for precise click-zone overlays.
No page image rendering — the frontend renders PDF via PDF.js directly.
"""
import base64
import io
import json
import os
import re

from domain.entities.book import Book, Chapter, Paragraph
from infrastructure.database.postgres.epub_parser import EPUBParser

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


class PDFParser(EPUBParser):
    """Parses PDF files using PyMuPDF (fitz).
    
    Implements the same interface as EPUBParser:
    - lazy chapter-by-chapter parsing (chapters = pages in PDF context)
    - image embedding as base64 <img> tags
    - word-level bounding box extraction for transparent click-zone overlays
    """

    def __init__(self, file_path: str):
        if fitz is None:
            raise ImportError(
                "PyMuPDF (fitz) is required for PDF parsing. "
                "Install it with: pip install PyMuPDF"
            )
        self.file_path = file_path
        self._doc: fitz.Document | None = None
        self._page_count: int | None = None

    @property
    def doc(self) -> "fitz.Document":
        if self._doc is None:
            self._doc = fitz.open(self.file_path)
            self._page_count = self._doc.page_count
        return self._doc

    def get_page_count(self) -> int:
        """Return total number of pages."""
        _ = self.doc  # ensure open
        return self._page_count or 0

    def get_total_pages(self) -> int:
        """Alias for get_page_count()."""
        return self.get_page_count()

    def get_page_dimensions(self, page_index: int) -> dict[str, float]:
        """Return page width and height in points."""
        page = self.doc[page_index]
        rect = page.rect
        return {"width": rect.width, "height": rect.height}

    # ── Word-level extraction (new architecture) ────────────────────────

    def extract_words_with_positions(self, page_index: int) -> list[dict]:
        """Extract every word on a page with its exact bounding box in PDF points.

        PyMuPDF's get_text("words") returns tuples of:
            (x0, y0, x1, y1, "word", block_no, line_no, word_no)

        Returns:
            list of dicts, each with:
                - word: str (the text of the word)
                - x0, y0, x1, y1: float (bounding box in PDF points)
                - block_index: int
                - line_index: int
                - word_index: int
        """
        page = self.doc[page_index]
        raw_words = page.get_text("words")

        results = []
        for w in raw_words:
            results.append({
                "word": w[4],
                "x0": round(w[0], 2),
                "y0": round(w[1], 2),
                "x1": round(w[2], 2),
                "y1": round(w[3], 2),
                "block_index": w[5] if len(w) > 5 else 0,
                "line_index": w[6] if len(w) > 6 else 0,
                "word_index": w[7] if len(w) > 7 else 0,
            })

        return results

    def extract_words_for_all_pages(self) -> dict[int, list[dict]]:
        """Extract word positions for all pages in the PDF.

        Returns:
            dict mapping page_index (int) → list of word position dicts
        """
        total = self.get_page_count()
        result = {}
        for i in range(total):
            result[i] = self.extract_words_with_positions(i)
        return result

    # ── Legacy methods kept for EPUB compatibility ──────────────────────

    def parse_page_with_positions(self, page_index: int) -> list[dict[str, any]]:
        """Parse a page and return paragraphs with bounding box coordinates.

        This is used by the page router to provide text overlay data
        for matching words to positions in the rendered image.
        """
        page = self.doc[page_index]
        blocks = page.get_text("blocks")
        
        paragraphs = []
        para_idx = 0
        for block in blocks:
            # block = (x0, y0, x1, y1, "lines", block_type, block_no)
            x0, y0, x1, y1 = block[0], block[1], block[2], block[3]
            
            if len(block) < 5 or not isinstance(block[4], str):
                continue
            
            text = block[4].strip()
            if not text or text == "":
                continue
            
            # Split block text into smaller paragraphs on actual line breaks
            sub_blocks = text.split('\n')
            
            for sub_text in sub_blocks:
                sub_text = sub_text.strip()
                if not sub_text or len(sub_text) < 2:
                    continue
                
                paragraphs.append({
                    "content": sub_text,
                    "page_index": page_index,
                    "bbox_x0": x0,
                    "bbox_y0": y0,
                    "bbox_x1": x1,
                    "bbox_y1": y1,
                })
                para_idx += 1
        
        return paragraphs

    def extract_metadata(self) -> dict[str, str]:
        """Extract PDF metadata."""
        try:
            meta = self.doc.metadata
            title = (meta.get("title") or "").strip()
            author = (meta.get("author") or "").strip()
            
            # Fallback to filename if metadata is empty
            if not title:
                base = os.path.basename(self.file_path)
                title = os.path.splitext(base)[0].replace("_", " ").replace("-", " ")
            
            return {
                "title": title or "Unknown",
                "author": author or "Unknown",
                "language": "auto",  # PDF doesn't always have language metadata
                "total_pages": self.get_page_count(),
            }
        except Exception:
            base = os.path.basename(self.file_path)
            title = os.path.splitext(base)[0]
            return {"title": title, "author": "Unknown", "language": "auto", "total_pages": self.get_page_count()}

    def extract_toc(self) -> list[dict[str, any]]:
        """Extract table of contents."""
        try:
            toc = self.doc.get_toc()
            if not toc:
                return self._default_toc()
            
            return [
                {
                    "title": item[1],
                    "level": item[0],
                    "play_order": i,
                    "href": f"page_{item[2] - 1}"  # 1-based to 0-based
                }
                for i, item in enumerate(toc)
            ]
        except Exception:
            return self._default_toc()

    def _default_toc(self) -> list[dict[str, any]]:
        """Default TOC: one entry per page."""
        n = self.get_page_count()
        return [
            {
                "title": f"Page {i + 1}",
                "level": 1,
                "play_order": i,
                "href": f"page_{i}"
            }
            for i in range(n)
        ]

    def parse_chapter(self, chapter_index: int) -> str:
        """Parse a page as a chapter.
        
        Returns page text with inline base64 <img> tags for images.
        """
        page = self.doc[chapter_index]
        
        # Get text blocks
        blocks = page.get_text("blocks")
        
        # Sort blocks by vertical then horizontal position
        blocks = sorted(blocks, key=lambda b: (b[1], b[0]))
        
        parts = []
        for block in blocks:
            # block = (x0, y0, x1, y1, "text", block_type, block_no)
            if len(block) < 6:
                continue
            
            x0, y0, x1, y1 = block[0], block[1], block[2], block[3]
            block_type = block[5] if len(block) > 5 else 0
            
            if block_type == 1:  # Image block
                # Extract and embed the image
                img_html = self._extract_image_html(page, (x0, y0, x1, y1))
                if img_html:
                    parts.append(img_html)
            elif block_type == 0:  # Text block
                text = block[4] if isinstance(block[4], str) else ""
                if text.strip():
                    # Wrap in paragraph tag
                    parts.append(f'<p class="pdf-paragraph">{text.strip()}</p>')
        
        return "\n".join(parts)

    def get_total_chapters(self) -> int:
        """Return total number of pages (= chapters)."""
        return self.get_page_count()

    def _extract_image_html(self, page: "fitz.Page", bbox: tuple) -> str | None:
        """Extract image from a region and return as HTML img tag with base64 data."""
        try:
            # Render the image region at higher resolution
            zoom = 2.0
            mat = fitz.Matrix(zoom, zoom)
            clip = fitz.Rect(bbox)
            pix = page.get_pixmap(matrix=mat, clip=clip)
            
            # Convert to base64 PNG
            img_bytes = pix.tobytes("png")
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            return f'<img src="data:image/png;base64,{b64}" class="pdf-image" />'
        except Exception:
            return '<p class="pdf-image-placeholder">[Image]</p>'

    def close(self):
        """Close the PDF document."""
        if self._doc:
            self._doc.close()
            self._doc = None
            self._page_count = None

    def get_page_text(self, page_index: int) -> str:
        """Get clean text content of a page."""
        page = self.doc[page_index]
        return page.get_text("text")

    def search(self, query: str) -> list[dict[str, any]]:
        """Full-text search across all pages.
        
        Returns list of matches with page index and context.
        """
        results = []
        query_lower = query.lower()
        
        for page_idx in range(self.get_page_count()):
            page = self.doc[page_idx]
            text = page.get_text("text")
            text_lower = text.lower()
            
            idx = 0
            while True:
                pos = text_lower.find(query_lower, idx)
                if pos == -1:
                    break
                
                # Get context (up to 100 chars before and after)
                ctx_start = max(0, pos - 50)
                ctx_end = min(len(text), pos + len(query) + 50)
                context = text[ctx_start:ctx_end].strip().replace("\n", " ")
                
                results.append({
                    "page_index": page_idx,
                    "position": pos,
                    "context": f"...{context}...",
                    "match_text": text[pos:pos + len(query)]
                })
                
                idx = pos + 1
        
        return results