"""
EPUB Parser — Lazy parsing architecture.

Key design:
- register_book(): extracts metadata + TOC/chapter list only (fast, <1s)
- parse_chapter(): parses only ONE chapter at a time (lazy)
- parse_chapter_range(): parses a range of chapters (for batch)
"""
import ebooklib
from ebooklib import epub
from typing import List, Tuple, Optional
from bs4 import BeautifulSoup


class EPUBParser:
    """Parser for EPUB files with lazy chapter-by-chapter processing.

    Caches the opened EpubBook so that multiple calls to parse_chapter()
    do NOT re-read the entire EPUB file each time.
    """

    def __init__(self):
        self._book_cache: dict[str, epub.EpubBook] = {}

    def _get_book(self, file_path: str) -> epub.EpubBook:
        """Return cached EpubBook or open+parse it once."""
        if file_path not in self._book_cache:
            self._book_cache[file_path] = epub.read_epub(file_path)
        return self._book_cache[file_path]

    def extract_metadata(self, file_path: str) -> dict:
        """Extract book metadata (title, author, language) without parsing content."""
        book = self._get_book(file_path)
        return {
            "title": self._get_metadata(book, "title", "Unknown Title"),
            "author": self._get_metadata(book, "creator", "Unknown Author"),
            "language": self._get_metadata(book, "language", "en"),
        }

    def extract_toc(self, file_path: str) -> List[dict]:
        """
        Extract Table of Contents (chapters) from EPUB without parsing paragraph content.
        Returns list of {title, spine_index} dicts.
        """
        book = self._get_book(file_path)
        chapters = []

        # Try TOC first (nav.xhtml / toc.ncx)
        toc_items = self._flatten_toc(book.toc)

        # Build spine-indexed list of document items
        doc_items = []
        for spine_item in book.spine:
            item_href = spine_item[0] if isinstance(spine_item, tuple) else spine_item.get("href", "")
            # Find the actual item
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    item_name = item.get_name()
                    if item_href in item_name or item_name.endswith(item_href):
                        doc_items.append((len(doc_items), item))
                        break

        if toc_items:
            # Map TOC titles to spine positions
            for toc_entry in toc_items:
                toc_href = toc_entry.get("href", "")
                for spine_idx, spine_item in enumerate(book.spine):
                    spine_href = spine_item[0] if isinstance(spine_item, tuple) else spine_item.get("href", "")
                    if toc_href and (toc_href in spine_href or spine_href in toc_href):
                        chapters.append({
                            "title": toc_entry.get("title", f"Chapter {len(chapters) + 1}"),
                            "spine_index": spine_idx,
                        })
                        break
                else:
                    chapters.append({
                        "title": toc_entry.get("title", f"Chapter {len(chapters) + 1}"),
                        "spine_index": -1,
                    })

        # Fallback: if no TOC found, treat each document as a chapter
        if not chapters:
            for idx, item in doc_items:
                title = self._extract_title_from_html(item.get_content().decode("utf-8"))
                chapters.append({
                    "title": title or f"Chapter {idx + 1}",
                    "spine_index": idx,
                })

        return chapters

    def parse_chapter(self, file_path: str, spine_index: int, start_global_index: int = 0) -> List[Tuple[int, str]]:
        """
        Parse paragraphs from a single chapter (spine item) only.
        Returns list of (global_index, content) tuples.
        """
        book = self._get_book(file_path)

        # Find the document item at the given spine index
        target_item = None
        if spine_index < len(book.spine):
            spine_entry = book.spine[spine_index]
            spine_href = spine_entry[0] if isinstance(spine_entry, tuple) else spine_entry.get("href", "")
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    item_name = item.get_name()
                    if spine_href in item_name or item_name.endswith(spine_href):
                        target_item = item
                        break

        if target_item is None:
            return []

        html_content = target_item.get_content().decode("utf-8")
        return self._extract_paragraphs(html_content, start_global_index)

    def parse_chapter_range(
        self, file_path: str, spine_start: int, spine_end: int, start_global_index: int = 0
    ) -> List[Tuple[int, str]]:
        """Parse paragraphs from a range of chapters (uses cached book)."""
        all_paragraphs: List[Tuple[int, str]] = []
        current_index = start_global_index

        for spine_idx in range(spine_start, spine_end + 1):
            chapter_pars = self.parse_chapter(file_path, spine_idx, current_index)
            all_paragraphs.extend(chapter_pars)
            current_index += len(chapter_pars)

        return all_paragraphs

    # ── Private helpers ──

    def _get_metadata(self, book: epub.EpubBook, key: str, default: str) -> str:
        """Safely extract metadata from EPUB."""
        values = book.get_metadata("DC", key)
        if values:
            return str(values[0][0])
        return default

    def _flatten_toc(self, toc, prefix: str = "") -> List[dict]:
        """Flatten nested TOC into a simple list."""
        items = []
        for entry in toc:
            if isinstance(entry, tuple):
                item, sub_items = entry
                title = item.get("title", "").strip() if isinstance(item, dict) else str(item)
                href = item.get("href", "") if isinstance(item, dict) else ""
                items.append({"title": title, "href": href})
                if sub_items:
                    items.extend(self._flatten_toc(sub_items, prefix))
            elif hasattr(entry, "title"):
                items.append({"title": entry.title, "href": entry.href or ""})
            elif isinstance(entry, dict):
                items.append({"title": entry.get("title", ""), "href": entry.get("href", "")})
        return items

    def _extract_title_from_html(self, html_content: str) -> Optional[str]:
        """Extract <title> tag from HTML content."""
        soup = BeautifulSoup(html_content, "html.parser")
        title_tag = soup.find("title")
        if title_tag:
            return title_tag.get_text(strip=True)
        # Fallback: try h1
        h1 = soup.find("h1")
        if h1:
            return h1.get_text(strip=True)
        return None

    def _extract_paragraphs(self, html_content: str, start_index: int) -> List[Tuple[int, str]]:
        """Extract clean paragraphs from HTML content."""
        soup = BeautifulSoup(html_content, "html.parser")

        # Remove script, style, nav elements
        for tag in soup(["script", "style", "nav"]):
            tag.decompose()

        paragraphs = []
        index = start_index

        # Find all <p> tags
        for p in soup.find_all("p"):
            text = p.get_text(strip=True)
            if text:
                paragraphs.append((index, text))
                index += 1

        # If no <p> tags found, treat text blocks as paragraphs
        if not paragraphs:
            # Try div > text, or body > direct text
            body = soup.find("body")
            if body:
                for child in body.children:
                    if child.name is None:
                        text = child.strip()
                        if text:
                            paragraphs.append((index, text))
                            index += 1
                    elif child.name in ("div", "section", "span"):
                        text = child.get_text(strip=True)
                        if text:
                            paragraphs.append((index, text))
                            index += 1

        return paragraphs