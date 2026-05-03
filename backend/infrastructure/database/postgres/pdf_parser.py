"""
PDF Parser — Lazy parsing architecture (same interface as EPUBParser).

Uses PyMuPDF (fitz) to extract text and structure from PDF files.
Chapters are inferred from page breaks and section headings.
"""
import fitz  # PyMuPDF
from typing import List, Tuple, Optional
import re


# ── Helpers shared across methods ──


def _normalize_title(raw: str) -> str:
    """Clean up a chapter/section title."""
    return re.sub(r"\s+", " ", raw).strip()


def _is_chapter_heading(text: str) -> bool:
    """Heuristic: detect if text looks like a chapter heading."""
    t = text.strip()
    if not t or len(t) > 200:
        return False
    # "Chapter 12", "CHAPTER 12", "Chapter XII"
    if re.match(r"^(chapter|part|section|lesson|unit)\s", t, re.IGNORECASE):
        return True
    # "1.", "12.", "1.2", "I.", "II." (Roman numerals)
    if re.match(r"^[IVXLCDM]+\..*", t):
        return True
    if re.match(r"^\d+(\.\d+)*\s", t):
        return True
    return False


# ── Parser class ──


class PDFParser:
    """Parser for PDF files with lazy chapter-by-chapter processing.

    Caches the opened fitz.Document so that multiple calls to parse_chapter()
    do NOT re-open the PDF file each time.
    """

    def __init__(self):
        self._doc_cache: dict[str, fitz.Document] = {}

    def _get_doc(self, file_path: str) -> fitz.Document:
        """Return cached Document or open it once."""
        if file_path not in self._doc_cache:
            self._doc_cache[file_path] = fitz.open(file_path)
        return self._doc_cache[file_path]

    def extract_metadata(self, file_path: str) -> dict:
        """Extract book metadata without parsing full content."""
        doc = self._get_doc(file_path)
        meta = doc.metadata
        title = meta.get("title", "") or ""
        author = meta.get("author", "") or ""
        language = meta.get("language", "en") or "en"
        return {
            "title": title if title else file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0],
            "author": author if author else "Unknown Author",
            "language": language if len(language) <= 3 else "en",
        }

    def extract_toc(self, file_path: str) -> List[dict]:
        """
        Extract Table of Contents from PDF.
        First tries the built-in PDF TOC; falls back to page scanning.
        Returns list of {title, spine_index} where spine_index = page_number (0-based).
        """
        doc = self._get_doc(file_path)
        chapters: List[dict] = []

        # Try built-in TOC first
        toc = doc.get_toc()
        if toc:
            for level, title, page in toc:
                if level == 1:  # Only top-level chapters
                    chapters.append({
                        "title": _normalize_title(title),
                        "spine_index": page - 1,  # PyMuPDF pages are 1-based
                    })
            if chapters:
                return chapters

        # Fallback: scan pages for chapter headings
        # Sample first 200 pages or entire document
        max_pages = min(len(doc), 200)
        for page_num in range(max_pages):
            page = doc[page_num]
            text = page.get_text("text")
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            for line in lines[:10]:  # Check first 10 lines of each page
                if _is_chapter_heading(line):
                    chapters.append({
                        "title": _normalize_title(line),
                        "spine_index": page_num,
                    })
                    break

        # If still nothing found, treat each page as a chapter
        if not chapters:
            chapters = [
                {"title": f"Page {i + 1}", "spine_index": i}
                for i in range(min(len(doc), max_pages))
            ]

        return chapters

    def _extract_image_block_html(self, doc: fitz.Document, page: fitz.Page, block: dict) -> str:
        """Try to extract a dict-mode image block as an HTML <img> with base64-encoded data.
        
        Returns empty string if no image could be extracted.
        """
        import base64
        bbox = fitz.Rect(block["bbox"])
        # Skip very small blocks (likely noise)
        if (bbox.x1 - bbox.x0) < 20 or (bbox.y1 - bbox.y0) < 20:
            return ""

        # Check if this image is extractable via xref
        images = page.get_images(full=True)
        for img in images:
            xref = img[0]
            try:
                base_img = doc.extract_image(xref)
                b64 = base64.b64encode(base_img["image"]).decode()
                return f'<img src="data:image/{base_img["ext"]};base64,{b64}" alt="Illustration" />'
            except Exception:
                continue

        # Fallback: render the bbox region as PNG
        try:
            pix = page.get_pixmap(dpi=96, clip=bbox)
            if pix.width > 20 and pix.height > 20:
                png_bytes = pix.tobytes("png")
                b64 = base64.b64encode(png_bytes).decode()
                return f'<img src="data:image/png;base64,{b64}" alt="Illustration" />'
        except Exception:
            pass

        return ""

    def _extract_text_from_block(self, block: dict) -> str:
        """Extract combined text from a dict-mode text block."""
        lines = block.get("lines", [])
        parts = []
        for line in lines:
            spans = line.get("spans", [])
            line_parts = []
            for span in spans:
                text = span.get("text", "")
                if text:
                    line_parts.append(text)
            parts.append(" ".join(line_parts))
        return "\n".join(parts)

    def parse_chapter(self, file_path: str, spine_index: int, start_global_index: int = 0) -> List[Tuple[int, str]]:
        """
        Parse paragraph-sized text blocks from a single PDF page.
        Also embeds images as base64 <img> tags (using dict-mode blocks).
        Returns list of (global_index, content) tuples.
        """
        doc = self._get_doc(file_path)
        paragraphs: List[Tuple[int, str]] = []

        if spine_index < 0 or spine_index >= len(doc):
            return []

        page = doc[spine_index]
        # Use dict mode to get both text (type=0) and image (type=1) blocks
        blocks = page.get_text("dict")["blocks"]
        # Sort blocks by vertical then horizontal position
        blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))  # y0, then x0

        idx = start_global_index
        for block in blocks:
            block_type = block.get("type", 0)

            if block_type == 1:
                # Image block — try to embed as HTML <img>
                img_html = self._extract_image_block_html(doc, page, block)
                if img_html:
                    paragraphs.append((idx, img_html))
                    idx += 1
                continue

            # Text block (type=0)
            text = self._extract_text_from_block(block).strip()
            if not text:
                continue

            # Skip very short fragments (likely page numbers / headers)
            if len(text) <= 10:
                continue

            # Skip page headers/footers (short centered lines)
            lines = text.split("\n")
            meaningful = [
                l for l in lines
                if l.strip() and len(l.strip()) > 3
            ]
            if meaningful:
                clean = " ".join(meaningful)
                paragraphs.append((idx, clean))
                idx += 1

        return paragraphs

