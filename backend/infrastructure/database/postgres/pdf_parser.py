"""
PDF Parser — lazy page-by-page parsing (same interface as EPUBParser).

Uses PyMuPDF (fitz) to extract text and images from PDF files.
Chapters are inferred from built-in TOC; falls back to scanning for
headings or treating each page as a chapter.

Supports server-side page rendering (render_page) and bbox-aware
paragraph extraction (parse_page_with_positions) for the image+overlay
reader approach.
"""

import base64
import io
import os
import re
from typing import List, Optional, Tuple

import fitz


class PDFParser:
    """Parser for PDF files with lazy page-by-page processing."""

    RENDER_DPI = 150
    THUMB_DPI = 72

    def __init__(self) -> None:
        self._doc_cache: dict[str, fitz.Document] = {}

    def _get_doc(self, file_path: str) -> fitz.Document:
        """Return cached Document or open it once."""
        if file_path not in self._doc_cache:
            self._doc_cache[file_path] = fitz.open(file_path)
        return self._doc_cache[file_path]

    def close(self) -> None:
        """Close all cached documents."""
        for doc in self._doc_cache.values():
            doc.close()
        self._doc_cache.clear()

    @staticmethod
    def _normalize_title(raw: str) -> str:
        """Collapse whitespace in a chapter/section title."""
        return re.sub(r"\s+", " ", raw).strip()

    @staticmethod
    def _is_chapter_heading(text: str) -> bool:
        """Heuristic: detect if text looks like a chapter heading."""
        if not text or len(text) > 200:
            return False
        t = text.strip()
        patterns = [
            r"^(chapter|part|section|lesson|unit)\s",
            r"^[IVXLCDM]+\..*",
            r"^\d+(\.\d+)*\s",
        ]
        return any(re.match(p, t, re.IGNORECASE) for p in patterns)

    def extract_metadata(self, file_path: str) -> dict:
        """Extract title, author, and language from the PDF metadata."""
        doc = self._get_doc(file_path)
        meta = doc.metadata
        title = (meta.get("title") or "").strip()
        author = (meta.get("author") or "").strip()
        language = (meta.get("language") or "en").strip()
        return {
            "title": title or file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0],
            "author": author or "Unknown Author",
            "language": language if len(language) <= 3 else "en",
        }

    def extract_toc(self, file_path: str) -> List[dict]:
        """
        Extract TOC as [{title, spine_index}, ...].

        Tries the built-in PDF TOC first; falls back to scanning pages for
        headings, and if still empty treats each page as a separate chapter.
        """
        doc = self._get_doc(file_path)
        chapters: List[dict] = []

        # Try built-in TOC
        toc = doc.get_toc()
        if toc:
            chapters = [
                {"title": self._normalize_title(title), "spine_index": page - 1}
                for level, title, page in toc
                if level == 1
            ]
            if chapters:
                return chapters

        # Fallback: scan first 200 pages for headings
        max_pages = min(len(doc), 200)
        for page_num in range(max_pages):
            page = doc[page_num]
            text = page.get_text("text")
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            for line in lines[:10]:
                if self._is_chapter_heading(line):
                    chapters.append(
                        {"title": self._normalize_title(line), "spine_index": page_num}
                    )
                    break

        # Last resort: each page is a chapter
        if not chapters:
            chapters = [
                {"title": f"Page {i + 1}", "spine_index": i}
                for i in range(max_pages)
            ]

        return chapters

    def _extract_image_block_html(
        self, doc: fitz.Document, page: fitz.Page, block: dict
    ) -> str:
        """Return a base64 <img> tag for a dict-mode image block, or empty string."""
        bbox = fitz.Rect(block["bbox"])
        if (bbox.x1 - bbox.x0) < 20 or (bbox.y1 - bbox.y0) < 20:
            return ""

        # Try direct extraction from page images
        images = page.get_images(full=True)
        for img in images:
            xref = img[0]
            try:
                base_img = doc.extract_image(xref)
                b64 = base64.b64encode(base_img["image"]).decode()
                return (
                    f'<img src="data:image/{base_img["ext"]};base64,{b64}" '
                    f'alt="Illustration" />'
                )
            except Exception:
                continue

        # Fallback: render the bounding box as a PNG
        try:
            pix = page.get_pixmap(dpi=96, clip=bbox)
            if pix.width > 20 and pix.height > 20:
                png_bytes = pix.tobytes("png")
                b64 = base64.b64encode(png_bytes).decode()
                return f'<img src="data:image/png;base64,{b64}" alt="Illustration" />'
        except Exception:
            pass

        return ""

    @staticmethod
    def _extract_text_from_block(block: dict) -> str:
        """Extract combined text from a dict-mode text block."""
        parts: List[str] = []
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            line_text = " ".join(s.get("text", "") for s in spans if s.get("text"))
            parts.append(line_text)
        return "\n".join(parts)

    def parse_chapter(
        self, file_path: str, spine_index: int, start_global_index: int = 0
    ) -> List[Tuple[int, str]]:
        """
        Parse a single PDF page into (global_index, text) tuples.

        Images are embedded as base64 <img> tags. Blocks are sorted top-to-bottom
        then left-to-right by their bounding boxes.
        """
        doc = self._get_doc(file_path)

        if spine_index < 0 or spine_index >= len(doc):
            return []

        page = doc[spine_index]
        blocks = page.get_text("dict")["blocks"]
        blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))

        paragraphs: List[Tuple[int, str]] = []
        idx = start_global_index

        for block in blocks:
            if block.get("type", 0) == 1:  # image block
                img_html = self._extract_image_block_html(doc, page, block)
                if img_html:
                    paragraphs.append((idx, img_html))
                    idx += 1
                continue

            text = self._extract_text_from_block(block).strip()
            if not text or len(text) <= 10:
                continue

            lines = text.split("\n")
            meaningful = [l for l in lines if l.strip() and len(l.strip()) > 3]
            if meaningful:
                paragraphs.append((idx, " ".join(meaningful)))
                idx += 1

        return paragraphs

    # ────────────────────────────────────────────────────────────────────────
    # Methods for server-side page image rendering + bbox extraction
    # ────────────────────────────────────────────────────────────────────────

    def get_page_count(self, file_path: str) -> int:
        """Return total number of pages in the PDF."""
        doc = self._get_doc(file_path)
        return len(doc)

    def render_page(self, file_path: str, page_index: int, dpi: Optional[int] = None) -> bytes:
        """
        Render a single PDF page as a PNG image (bytes).

        Args:
            file_path: Path to the PDF file.
            page_index: 0-based page index.
            dpi: Resolution for rendering (defaults to RENDER_DPI=150).

        Returns:
            PNG image bytes.
        """
        doc = self._get_doc(file_path)
        if page_index < 0 or page_index >= len(doc):
            raise ValueError(f"Page index {page_index} out of range (0-{len(doc) - 1})")

        page = doc[page_index]
        pix = page.get_pixmap(dpi=dpi or self.RENDER_DPI)
        return pix.tobytes("png")

    def get_page_dimensions(self, file_path: str, page_index: int) -> Optional[Tuple[float, float]]:
        """Get the width and height of a page in points."""
        doc = self._get_doc(file_path)
        if page_index < 0 or page_index >= len(doc):
            return None
        page = doc[page_index]
        rect = page.rect
        return (float(rect.width), float(rect.height))

    def render_thumbnail(self, file_path: str, page_index: int) -> bytes:
        """
        Render a single PDF page as a small PNG thumbnail (bytes).

        Args:
            file_path: Path to the PDF file.
            page_index: 0-based page index.

        Returns:
            PNG thumbnail bytes (72 DPI, max 320px wide).
        """
        doc = self._get_doc(file_path)
        if page_index < 0 or page_index >= len(doc):
            raise ValueError(f"Page index {page_index} out of range (0-{len(doc) - 1})")

        page = doc[page_index]
        # Determine zoom to constrain width to ~320px
        rect = page.rect
        zoom = min(320.0 / rect.width, 2.0)  # scale but cap at 2x
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        return pix.tobytes("png")

    def parse_page_with_positions(
        self, file_path: str, spine_index: int, page_index: int, start_global_index: int = 0
    ) -> List[Tuple[int, str, float, float, float, float]]:
        """
        Parse a single PDF page into paragraphs with bounding box coordinates.

        Args:
            file_path: Path to the PDF file.
            spine_index: The spine index (page number in 1-chapter=1-page layout).
            page_index: The global 0-based page index (same as spine_index for now).
            start_global_index: Starting index for paragraph numbering.

        Returns:
            List of tuples: (global_index, text, bbox_x0, bbox_y0, bbox_x1, bbox_y1)

        The bbox coordinates are in PDF page coordinate space (points).
        The frontend will scale them by (rendered_width / page_rect.width).
        """
        doc = self._get_doc(file_path)
        if spine_index < 0 or spine_index >= len(doc):
            return []

        page = doc[spine_index]
        page_rect = page.rect  # page dimensions in points
        blocks = page.get_text("dict")["blocks"]
        blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))

        paragraphs: List[Tuple[int, str, float, float, float, float]] = []
        idx = start_global_index

        for block in blocks:
            if block.get("type", 0) == 1:  # image block — skip for text overlay
                continue

            text = self._extract_text_from_block(block).strip()
            if not text or len(text) <= 10:
                continue

            lines = text.split("\n")
            meaningful = [l for l in lines if l.strip() and len(l.strip()) > 3]
            if not meaningful:
                continue

            combined = " ".join(meaningful)
            bbox = block["bbox"]  # [x0, y0, x1, y1] in PDF points

            paragraphs.append((
                idx,
                combined,
                float(bbox[0]),
                float(bbox[1]),
                float(bbox[2]),
                float(bbox[3]),
            ))
            idx += 1

        return paragraphs