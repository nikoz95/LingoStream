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

    def parse_chapter(self, file_path: str, spine_index: int, start_global_index: int = 0) -> List[Tuple[int, str]]:
        """
        Parse paragraph-sized text blocks from a single PDF page.
        Returns list of (global_index, content) tuples.
        """
        doc = self._get_doc(file_path)
        paragraphs: List[Tuple[int, str]] = []

        if spine_index < 0 or spine_index >= len(doc):
            return []

        page = doc[spine_index]
        # Get text blocks (preserves reading order)
        blocks = page.get_text("blocks")
        # Sort blocks by vertical then horizontal position
        blocks.sort(key=lambda b: (b[1], b[0]))  # y0, then x0

        idx = start_global_index
        for block in blocks:
            # block = (x0, y0, x1, y1, text, block_type, ...)
            text = block[4].strip() if len(block) > 4 else ""
            if text and len(text) > 20:  # Skip short fragments
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

    def parse_chapter_range(
        self, file_path: str, spine_start: int, spine_end: int, start_global_index: int = 0
    ) -> List[Tuple[int, str]]:
        """Parse paragraphs from a range of pages (uses cached doc)."""
        all_paragraphs: List[Tuple[int, str]] = []
        current_index = start_global_index

        for spine_idx in range(spine_start, spine_end + 1):
            chapter_pars = self.parse_chapter(file_path, spine_idx, current_index)
            all_paragraphs.extend(chapter_pars)
            current_index += len(chapter_pars)

        return all_paragraphs
