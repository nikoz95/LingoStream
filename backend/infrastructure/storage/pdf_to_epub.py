"""Converter from PDF to clean, structured, book-grade EPUB.

Uses PyMuPDF (fitz) to extract text, detect repeating running headers/footers,
merge paragraphs split across page boundaries, preserve true chapter titles,
and extract embedded illustrations, creating a true reflowable EPUB for the e-reader.
"""
from collections import Counter
import html
import io
import logging
import re
from typing import Any

import fitz  # PyMuPDF
from ebooklib import epub

logger = logging.getLogger(__name__)

# Patterns for standalone page numbers or promotional watermarks
PAGE_NUM_RE = re.compile(r"^\s*(?:-\s*)?\d+(?:\s*-)?\s*$|^\s*page\s+\d+(?:\s+of\s+\d+)?\s*$", re.IGNORECASE)
URL_WATERMARK_RE = re.compile(r"https?://\S+|www\.\S+|more\s+books\s+on\b", re.IGNORECASE)
CHAPTER_HEADING_RE = re.compile(
    r"^(?:chapter|part|prologue|epilogue|book|section|act)\b",
    re.IGNORECASE,
)
TERMINAL_PUNCT = (".", "!", "?", ":", ";", '"', "'", "”", "’", "…", ")", "]")


class PdfToEpubConverter:
    """Converts a PDF binary or file to clean, book-grade EPUB bytes."""

    @staticmethod
    def _normalize_line(text: str) -> str:
        """Normalize a line for repeating header/footer comparison."""
        cleaned = re.sub(r"\d+", "#", text.strip().lower())
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned

    @classmethod
    def _find_repeating_margin_texts(cls, doc: fitz.Document) -> set[str]:
        """Scan top and bottom 14% of pages to identify running headers/footers."""
        margin_counts: Counter[str] = Counter()
        total_pages = len(doc)
        if total_pages < 3:
            return set()

        for page in doc:
            rect = page.rect
            page_h = rect.height or 1.0
            top_cutoff = rect.y0 + page_h * 0.14
            bottom_cutoff = rect.y1 - page_h * 0.14

            blocks = page.get_text("blocks")
            seen_on_page: set[str] = set()
            for b in blocks:
                if b[6] != 0:
                    continue
                y0, y1, raw_text = b[1], b[3], b[4].strip()
                if not raw_text:
                    continue
                if y1 <= top_cutoff or y0 >= bottom_cutoff:
                    for line in raw_text.splitlines():
                        norm = cls._normalize_line(line)
                        if norm and len(norm) < 120:
                            seen_on_page.add(norm)
            for norm in seen_on_page:
                margin_counts[norm] += 1

        threshold = max(3, int(total_pages * 0.25))
        return {norm for norm, count in margin_counts.items() if count >= threshold}

    @classmethod
    def _compute_median_font_size(cls, doc: fitz.Document) -> float:
        """Determine the dominant body text font size weighted by character count."""
        size_weights: Counter[float] = Counter()
        sample_step = max(1, len(doc) // 20)
        for p_idx in range(0, len(doc), sample_step):
            page_dict = doc[p_idx].get_text("dict")
            for b in page_dict.get("blocks", []):
                if b.get("type") != 0:
                    continue
                for line in b.get("lines", []):
                    for span in line.get("spans", []):
                        txt = span.get("text", "").strip()
                        if txt:
                            sz = round(float(span.get("size", 11.0)), 1)
                            size_weights[sz] += len(txt)
        if not size_weights:
            return 11.0
        return size_weights.most_common(1)[0][0]

    @classmethod
    def _is_noise_line(
        cls,
        text: str,
        is_margin: bool,
        repeating_margins: set[str],
    ) -> bool:
        """Return True if a line is a running header/footer, URL watermark, or page number."""
        stripped = text.strip()
        if not stripped:
            return True
        if URL_WATERMARK_RE.search(stripped) and len(stripped) < 120:
            return True
        if is_margin and PAGE_NUM_RE.match(stripped):
            return True
        norm = cls._normalize_line(stripped)
        if norm in repeating_margins:
            return True
        return False

    @classmethod
    def convert(cls, pdf_bytes: bytes, title: str = "Book", author: str = "Unknown") -> bytes:
        """Parse PDF document and construct a clean, reflowable EPUB returning its bytes."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)

        book = epub.EpubBook()
        book.set_identifier(f"lingostream-{abs(hash(title))}")
        book.set_title(title)
        book.set_language("en")
        book.add_author(author)

        repeating_margins = cls._find_repeating_margin_texts(doc)
        body_font_size = cls._compute_median_font_size(doc)

        # Clean, theme-friendly semantic CSS (no hardcoded colors so night/sepia/light themes work)
        style = epub.EpubItem(
            uid="style_nav",
            file_name="style/nav.css",
            media_type="text/css",
            content=b"""
            body {
                line-height: 1.75;
                margin: 0 auto;
                padding: 1.2rem 1.5rem;
                text-rendering: optimizeLegibility;
            }
            h1 {
                font-size: 1.6em;
                font-weight: 700;
                text-align: center;
                margin: 1.8em 0 0.8em 0;
                line-height: 1.3;
            }
            h2 {
                font-size: 1.3em;
                font-weight: 600;
                text-align: center;
                margin: 1.4em 0 0.8em 0;
                line-height: 1.35;
            }
            p {
                margin: 0 0 0.95em 0;
                text-align: justify;
                text-indent: 1.2em;
                orphans: 2;
                widows: 2;
            }
            h1 + p, h2 + p, hr + p {
                text-indent: 0;
            }
            hr.scene-break {
                border: none;
                text-align: center;
                margin: 1.5em 0;
            }
            hr.scene-break::before {
                content: "* * *";
                letter-spacing: 0.3em;
                opacity: 0.65;
            }
            .book-image {
                display: block;
                max-width: 100%;
                height: auto;
                margin: 1.2em auto;
                border-radius: 6px;
            }
            """,
        )
        book.add_item(style)

        # Extract structured items across all pages:
        # Each item is dict: {"kind": "h1"|"h2"|"p"|"hr"|"img", "text": str, "page": int}
        items: list[dict[str, Any]] = []
        image_counter = 0

        for p_num in range(total_pages):
            page = doc[p_num]
            rect = page.rect
            page_h = rect.height or 1.0
            top_cutoff = rect.y0 + page_h * 0.14
            bottom_cutoff = rect.y1 - page_h * 0.14

            page_dict = page.get_text("dict")
            blocks = page_dict.get("blocks", [])

            for b in blocks:
                b_type = b.get("type")
                bbox = b.get("bbox", (0, 0, 0, 0))
                y0, y1 = bbox[1], bbox[3]
                is_margin = (y1 <= top_cutoff) or (y0 >= bottom_cutoff)

                # Image block
                if b_type == 1:
                    img_bytes = b.get("image")
                    ext = b.get("ext", "png")
                    width = b.get("width", 0)
                    height = b.get("height", 0)
                    if img_bytes and width >= 60 and height >= 60:
                        image_counter += 1
                        img_filename = f"images/img_{image_counter:03d}.{ext}"
                        media_type = f"image/{'jpeg' if ext == 'jpg' else ext}"
                        img_item = epub.EpubItem(
                            uid=f"img_{image_counter:03d}",
                            file_name=img_filename,
                            media_type=media_type,
                            content=img_bytes,
                        )
                        book.add_item(img_item)
                        items.append({
                            "kind": "img",
                            "text": img_filename,
                            "page": p_num,
                        })
                    continue

                if b_type != 0:
                    continue

                lines = b.get("lines", [])
                clean_lines: list[str] = []
                max_span_size = 0.0
                is_bold = False

                for line in lines:
                    spans = line.get("spans", [])
                    line_text = "".join(s.get("text", "") for s in spans).strip()
                    if not line_text:
                        continue
                    if cls._is_noise_line(line_text, is_margin, repeating_margins):
                        continue
                    for s in spans:
                        if s.get("text", "").strip():
                            sz = float(s.get("size", body_font_size))
                            if sz > max_span_size:
                                max_span_size = sz
                            flags = int(s.get("flags", 0))
                            if flags & 16:  # Bold flag in PyMuPDF
                                is_bold = True
                    clean_lines.append(line_text)

                if not clean_lines:
                    continue

                # Join lines within the block, healing hyphenated line breaks
                joined = ""
                for ln in clean_lines:
                    if not joined:
                        joined = ln
                    elif joined.endswith("-") and len(joined) > 1 and joined[-2].isalpha() and ln[0].islower():
                        joined = joined[:-1] + ln
                    else:
                        joined = joined + " " + ln

                joined = re.sub(r"\s+", " ", joined).strip()
                if not joined:
                    continue

                # Scene break detection (e.g., "* * *", "***")
                if re.match(r"^[\*\•\-\~\s]{3,15}$", joined) and "*" in joined:
                    items.append({"kind": "hr", "text": "", "page": p_num})
                    continue

                # Heading detection:
                # 1. Matches explicit "CHAPTER 1", "PART I", etc. and is short
                # 2. Font size is noticeably larger than body font size (>= body + 1.5pt) and short
                # 3. Bold short title line without terminal sentence period
                is_chapter_kw = bool(CHAPTER_HEADING_RE.match(joined)) and len(joined) < 90
                is_large_font = max_span_size >= (body_font_size + 1.8) and len(joined) < 120
                is_sub_heading = (
                    (max_span_size >= (body_font_size + 0.8) or is_bold)
                    and len(joined) < 70
                    and not joined.endswith((".", ",", ";"))
                    and joined[0].isupper()
                )

                if is_chapter_kw or is_large_font:
                    items.append({"kind": "h1", "text": joined, "page": p_num})
                elif is_sub_heading and p_num == 0:
                    items.append({"kind": "h2", "text": joined, "page": p_num})
                elif is_sub_heading and items and items[-1]["kind"] == "h1":
                    # Subtitle right after "CHAPTER 1" (e.g., "Gluttony")
                    items.append({"kind": "h2", "text": joined, "page": p_num})
                else:
                    items.append({"kind": "p", "text": joined, "page": p_num})

        # Second pass: Merge paragraphs that were split across page or block boundaries!
        merged_items: list[dict[str, Any]] = []
        for item in items:
            if (
                item["kind"] == "p"
                and merged_items
                and merged_items[-1]["kind"] == "p"
            ):
                prev_text: str = merged_items[-1]["text"]
                curr_text: str = item["text"]
                # If previous paragraph did NOT end with terminal punctuation,
                # merge it with the current paragraph seamlessly.
                if not prev_text.endswith(TERMINAL_PUNCT):
                    if prev_text.endswith("-") and len(prev_text) > 1 and prev_text[-2].isalpha() and curr_text[0].islower():
                        merged_items[-1]["text"] = prev_text[:-1] + curr_text
                    else:
                        merged_items[-1]["text"] = prev_text + " " + curr_text
                    continue
            merged_items.append(item)

        # Group into chapters based on H1 headings (or PDF TOC if available)
        chapters_data: list[tuple[str, list[dict[str, Any]]]] = []
        current_ch_title = title or "Chapter 1"
        current_ch_items: list[dict[str, Any]] = []

        for item in merged_items:
            if item["kind"] == "h1":
                # If we already have substantial content in the current chapter, start a new chapter
                has_paragraphs = any(x["kind"] == "p" for x in current_ch_items)
                if has_paragraphs:
                    chapters_data.append((current_ch_title, current_ch_items))
                    current_ch_title = item["text"]
                    current_ch_items = [item]
                else:
                    # Still in frontmatter / title page before first real chapter body
                    if CHAPTER_HEADING_RE.match(item["text"]):
                        current_ch_title = item["text"]
                    current_ch_items.append(item)
            else:
                # If previous item was "CHAPTER X" (h1) and this item is its subtitle (h2, e.g. "Gluttony"),
                # combine them in the TOC title for a cleaner Table of Contents
                if (
                    item["kind"] == "h2"
                    and current_ch_items
                    and current_ch_items[-1]["kind"] == "h1"
                    and CHAPTER_HEADING_RE.match(current_ch_items[-1]["text"])
                ):
                    current_ch_title = f"{current_ch_items[-1]['text']} — {item['text']}"
                current_ch_items.append(item)

        if current_ch_items:
            chapters_data.append((current_ch_title, current_ch_items))

        # Fallback if PDF had no text
        if not chapters_data:
            chapters_data = [(title, [{"kind": "p", "text": "No extractable text found in PDF.", "page": 0}])]

        epub_chapters = []
        for idx, (ch_title, ch_items) in enumerate(chapters_data):
            html_parts: list[str] = []
            for item in ch_items:
                kind = item["kind"]
                escaped = html.escape(item["text"])
                if kind == "h1":
                    html_parts.append(f"<h1>{escaped}</h1>")
                elif kind == "h2":
                    html_parts.append(f"<h2>{escaped}</h2>")
                elif kind == "hr":
                    html_parts.append('<hr class="scene-break" />')
                elif kind == "img":
                    html_parts.append(f'<img class="book-image" src="{escaped}" alt="Illustration" />')
                else:
                    html_parts.append(f"<p>{escaped}</p>")

            ch_content = "\n".join(html_parts)
            ch_file_name = f"chap_{idx + 1:02d}.xhtml"
            chapter = epub.EpubHtml(
                title=ch_title,
                file_name=ch_file_name,
                lang="en",
            )
            chapter.content = f"<html><head><link rel='stylesheet' href='style/nav.css' type='text/css'/></head><body>{ch_content}</body></html>"
            chapter.add_item(style)

            book.add_item(chapter)
            epub_chapters.append(chapter)

        # Table of contents and spine
        book.toc = tuple(epub_chapters)
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())
        book.spine = ["nav"] + epub_chapters

        out_buffer = io.BytesIO()
        epub.write_epub(out_buffer, book, {})
        return out_buffer.getvalue()
