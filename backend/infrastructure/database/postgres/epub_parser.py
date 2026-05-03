"""
EPUB Parser — Lazy parsing architecture.

Key design:
- register_book(): extracts metadata + TOC/chapter list only (fast, <1s)
- parse_chapter(): parses only ONE chapter at a time (lazy)
- parse_chapter_range(): parses a range of chapters (for batch)

HTML preservation:
- Headings (<h1>-<h6>) are preserved with a CSS class "ls-heading-N"
- Inline formatting (<b>, <i>, <em>, <strong>, etc.) is preserved
- Images are extracted from the EPUB and embedded as base64 data URIs
- Block-level structure (paragraphs, blockquotes, lists) is preserved
"""
import html
import base64
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
            for idx, item in enumerate(book.get_items()):
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    title = self._extract_title_from_html(item.get_content().decode("utf-8"))
                    chapters.append({
                        "title": title or f"Chapter {idx + 1}",
                        "spine_index": idx,
                    })

        return chapters

    def parse_chapter(self, file_path: str, spine_index: int, start_global_index: int = 0) -> List[Tuple[int, str]]:
        """
        Parse content from a single chapter (spine item) only.
        Returns list of (global_index, html_content) tuples,
        where html_content preserves headings, inline formatting, and images.
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
        return self._extract_content_blocks(html_content, start_global_index, book)

    def parse_chapter_range(
        self, file_path: str, spine_start: int, spine_end: int, start_global_index: int = 0
    ) -> List[Tuple[int, str]]:
        """Parse content from a range of chapters (uses cached book)."""
        all_blocks: List[Tuple[int, str]] = []
        current_index = start_global_index

        for spine_idx in range(spine_start, spine_end + 1):
            chapter_blocks = self.parse_chapter(file_path, spine_idx, current_index)
            all_blocks.extend(chapter_blocks)
            current_index += len(chapter_blocks)

        return all_blocks

    # ── Private helpers ──

    def _get_metadata(self, book: epub.EpubBook, key: str, default: str) -> str:
        """Safely extract metadata from EPUB."""
        values = book.get_metadata("DC", key)
        if values:
            return str(values[0][0])
        return default

    def _flatten_toc(self, toc: list, prefix: str = "") -> List[dict]:
        """Flatten nested TOC structure into a list of {title, href} dicts."""
        items = []
        for entry in toc:
            if isinstance(entry, epub.Link):
                items.append({"title": entry.title, "href": entry.href})
            elif isinstance(entry, epub.Section):
                items.append({"title": entry.title, "href": entry.href or ""})
            elif isinstance(entry, tuple) and len(entry) >= 2:
                title = str(entry[0])
                href = entry[1] if len(entry) > 1 else ""
                items.append({"title": title, "href": href})
                # Check for nested children
                if len(entry) > 2 and isinstance(entry[2], list):
                    items.extend(self._flatten_toc(entry[2], prefix))
        return items

    @staticmethod
    def _extract_title_from_html(html_content: str) -> Optional[str]:
        """Extract the first <h1> or <h2> or <title> from HTML content."""
        soup = BeautifulSoup(html_content, "html.parser")
        for tag in ["h1", "h2", "title"]:
            el = soup.find(tag)
            if el and el.get_text(strip=True):
                return el.get_text(strip=True)
        return None

    @staticmethod
    def _replace_img_with_base64(soup: BeautifulSoup, book: epub.EpubBook) -> None:
        """
        Replace all <img> tags with inline base64 data URIs.
        Searches the EPUB's items for matching image files.
        """
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if not src:
                continue

            # Normalize src (remove "../" prefixes, etc.)
            # Try to find the image item by matching the filename
            img_data = None
            img_mime = "image/png"

            # Get just the filename part
            src_filename = src.split("/")[-1].split("\\")[-1]

            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_IMAGE:
                    item_name = item.get_name()
                    # Match by filename or full path
                    if src_filename and src_filename in item_name:
                        img_data = item.get_content()
                        # Determine mime type from file extension
                        ext = item_name.rsplit(".", 1)[-1].lower() if "." in item_name else "png"
                        mime_map = {
                            "png": "image/png",
                            "jpg": "image/jpeg",
                            "jpeg": "image/jpeg",
                            "gif": "image/gif",
                            "svg": "image/svg+xml",
                            "webp": "image/webp",
                        }
                        img_mime = mime_map.get(ext, "image/png")
                        break

            if img_data:
                b64 = base64.b64encode(img_data).decode("ascii")
                img["src"] = f"data:{img_mime};base64,{b64}"
            else:
                # If image not found, remove the tag to avoid broken images
                img.decompose()

    def _extract_content_blocks(
        self, html_content: str, start_index: int, book: epub.EpubBook
    ) -> List[Tuple[int, str]]:
        """
        Parse HTML content and extract block-level elements as individual content blocks.
        Each block is: (global_index, html_string)
        Headings (<h1>-<h6>) get a CSS class "ls-heading-N" for frontend styling.
        Images are embedded as base64 data URIs.
        """
        soup = BeautifulSoup(html_content, "html.parser")

        # Remove scripts, styles, nav, and other non-content elements
        for tag in soup(["script", "style", "nav", "aside", "noscript"]):
            tag.decompose()

        # Embed images as base64
        self._replace_img_with_base64(soup, book)

        blocks: List[Tuple[int, str]] = []
        idx = start_index

        # Iterate over all top-level block elements in the body
        # If no <body>, use the root element
        body = soup.find("body") or soup

        for element in body.children:
            # Skip navigational elements and empty text nodes
            if isinstance(element, str):
                text = element.strip()
                if text:
                    # Plain text outside block tags — wrap in <p>
                    escaped = html.escape(text)
                    blocks.append((idx, f"<p>{escaped}</p>"))
                    idx += 1
                continue

            tag_name = element.name
            if tag_name is None:
                continue

            # Only process block-level elements
            block_tags = {
                "p", "div", "blockquote", "pre",
                "h1", "h2", "h3", "h4", "h5", "h6",
                "ul", "ol", "li", "dl", "dt", "dd",
                "table", "tr", "td", "th",
                "section", "article", "figure", "figcaption",
                "hr",
            }

            if tag_name.lower() not in block_tags:
                # Inline elements at top level — wrap in <p>
                inner_html = str(element)
                blocks.append((idx, f"<p>{inner_html}</p>"))
                idx += 1
                continue

            # Handle headings: add CSS class
            if tag_name.lower() in ("h1", "h2", "h3", "h4", "h5", "h6"):
                level = tag_name[1]  # "1", "2", etc.
                heading_classes = element.get("class", [])
                heading_classes.append(f"ls-heading-{level}")
                element["class"] = heading_classes

            # Handle <img> that might not have been caught by _replace_img_with_base64
            # (e.g., images inside block-level wrappers)
            if tag_name.lower() == "img":
                self._replace_img_with_base64(soup, book)

            # Handle <figure> with images
            if tag_name.lower() == "figure":
                self._replace_img_with_base64(soup, book)

            # Convert the element to a clean HTML string
            inner_html = str(element).strip()
            if inner_html:
                blocks.append((idx, inner_html))
                idx += 1

        # Handle <img> elements that are direct children of body
        for img in body.find_all("img", recursive=False):
            inner_html = str(img).strip()
            if inner_html:
                blocks.append((idx, inner_html))
                idx += 1

        return blocks

    @staticmethod
    def strip_html_to_text(html_content: str) -> str:
        """
        Strip all HTML tags and return plain text.
        Useful for translation endpoints where we only want text.
        """
        soup = BeautifulSoup(html_content, "html.parser")
        return soup.get_text(separator="\n").strip()