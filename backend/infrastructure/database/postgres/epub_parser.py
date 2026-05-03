"""
EPUB Parser — lazy chapter-by-chapter extraction.

Uses ebooklib to open EPUB files and BeautifulSoup to extract text.
Chapters are parsed one at a time on demand, and the open EpubBook
reference is cached so parsing many chapters does not re-open the file.
"""

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
from typing import List, Tuple


class EPUBParser:
    """Parser for EPUB files with lazy chapter-by-chapter processing."""

    def __init__(self) -> None:
        self._book_cache: dict[str, epub.EpubBook] = {}

    def _get_book(self, file_path: str) -> epub.EpubBook:
        """Return cached EpubBook or open it once."""
        if file_path not in self._book_cache:
            self._book_cache[file_path] = epub.read_epub(file_path)
        return self._book_cache[file_path]

    @staticmethod
    def extract_metadata(file_path: str) -> dict:
        """Extract title, author, and language without parsing full content."""
        book = epub.read_epub(file_path)
        title = book.get_metadata("DC", "title")
        author = book.get_metadata("DC", "creator")
        language = book.get_metadata("DC", "language")
        return {
            "title": title[0][0]
            if title
            else file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0],
            "author": author[0][0] if author else "Unknown Author",
            "language": language[0][0] if language else "en",
        }

    @staticmethod
    def extract_toc(file_path: str) -> List[dict]:
        """Extract table-of-contents as [{title, spine_index}, ...]."""
        book = epub.read_epub(file_path)
        chapters: List[dict] = []
        for i, item in enumerate(book.toc):
            if isinstance(item, epub.Link):
                chapters.append({"title": item.title, "spine_index": i})
            elif isinstance(item, tuple):
                chapters.append({"title": item[0].title, "spine_index": i})
        return chapters

    @staticmethod
    def _extract_text_from_html(html_content: bytes) -> str:
        """Strip HTML tags and return plain text."""
        soup = BeautifulSoup(html_content, "html.parser")
        for tag in soup(["script", "style", "nav"]):
            tag.decompose()
        return soup.get_text(separator="\n")

    @staticmethod
    def _split_into_paragraphs(text: str) -> List[str]:
        """Split text into ~300-character paragraph-sized chunks."""
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        paragraphs: List[str] = []
        current: List[str] = []
        for line in lines:
            if len(line) < 3:
                continue
            current.append(line)
            if len(" ".join(current)) > 300:
                paragraphs.append(" ".join(current))
                current = []
        if current:
            paragraphs.append(" ".join(current))
        return paragraphs if paragraphs else [" ".join(lines)]

    def parse_chapter(
        self, file_path: str, spine_index: int, start_global_index: int = 0
    ) -> List[Tuple[int, str]]:
        """Parse a single EPUB chapter into (global_index, text) tuples."""
        book = self._get_book(file_path)
        items = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

        if spine_index < 0 or spine_index >= len(items):
            return []

        html_content = items[spine_index].get_content()
        text = self._extract_text_from_html(html_content)
        raw_paragraphs = self._split_into_paragraphs(text)

        return [
            (start_global_index + i, p) for i, p in enumerate(raw_paragraphs)
        ]