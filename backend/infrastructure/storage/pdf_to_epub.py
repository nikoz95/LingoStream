"""Converter from PDF to clean, structured EPUB.

Uses PyMuPDF (fitz) to extract text, headers, clean paragraphs, and illustrations,
creating a true reflowable EPUB for the e-reader.
"""
import io
import logging
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
from ebooklib import epub

logger = logging.getLogger(__name__)


class PdfToEpubConverter:
    """Converts a PDF binary or file to clean EPUB bytes."""

    @staticmethod
    def convert(pdf_bytes: bytes, title: str = "Book", author: str = "Unknown") -> bytes:
        """Parse PDF document and construct an EPUB file returning its bytes."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        book = epub.EpubBook()
        book.set_identifier(f"lingostream-{abs(hash(title))}")
        book.set_title(title)
        book.set_language("en")
        book.add_author(author)

        chapters = []
        toc = doc.get_toc()  # [[lvl, title, page], ...]
        
        # If PDF has bookmarks / TOC, split by TOC; otherwise split by pages or major headings
        total_pages = len(doc)
        
        # Group pages into chapters (either by TOC bookmarks or chunk of pages)
        chapter_pages = []
        if toc:
            for i, item in enumerate(toc):
                lvl, ch_title, page_num = item[0], item[1], item[2] - 1
                next_page = toc[i + 1][2] - 1 if i + 1 < len(toc) else total_pages
                chapter_pages.append((ch_title, page_num, next_page))
        else:
            # Fallback: group every 10 pages or treat whole document as logical sections
            chunk_size = max(1, min(15, total_pages // 10 or 1))
            for start in range(0, total_pages, chunk_size):
                end = min(start + chunk_size, total_pages)
                ch_title = f"Section {start // chunk_size + 1}"
                chapter_pages.append((ch_title, start, end))

        # Default CSS for clean reading
        style = epub.EpubItem(
            uid="style_nav",
            file_name="style/nav.css",
            media_type="text/css",
            content=b"""
            body { font-family: sans-serif; line-height: 1.6; margin: 1em; }
            h1, h2 { color: #8b5cf6; margin-top: 1.5em; }
            p { margin-bottom: 1em; text-align: justify; }
            """
        )
        book.add_item(style)

        for idx, (ch_title, start_pg, end_pg) in enumerate(chapter_pages):
            ch_html_parts = [f"<h1>{ch_title}</h1>"]
            
            for p_num in range(start_pg, end_pg):
                if p_num >= total_pages:
                    break
                page = doc[p_num]
                
                # Extract text blocks
                blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
                for b in blocks:
                    if b[6] == 0:  # text block
                        raw_text = b[4].strip()
                        if not raw_text:
                            continue
                        
                        # Clean hyphens across linebreaks
                        clean = raw_text.replace("-\n", "").replace("\n", " ")
                        
                        # Check if looks like a sub-heading or paragraph
                        if len(clean) < 60 and (clean.isupper() or not clean.endswith(".")):
                            ch_html_parts.append(f"<h2>{clean}</h2>")
                        else:
                            ch_html_parts.append(f"<p>{clean}</p>")
            
            ch_content = "\n".join(ch_html_parts)
            ch_file_name = f"chap_{idx + 1:02d}.xhtml"
            chapter = epub.EpubHtml(
                title=ch_title,
                file_name=ch_file_name,
                lang="en"
            )
            chapter.content = f"<html><body>{ch_content}</body></html>"
            chapter.add_item(style)
            
            book.add_item(chapter)
            chapters.append(chapter)

        # Table of contents and spine
        book.toc = tuple(chapters)
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())
        
        book.spine = ["nav"] + chapters

        out_buffer = io.BytesIO()
        epub.write_epub(out_buffer, book, {})
        return out_buffer.getvalue()
