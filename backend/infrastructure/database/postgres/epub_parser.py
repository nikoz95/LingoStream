import ebooklib
from ebooklib import epub
from typing import List, Tuple
from sqlalchemy.orm import Session
from .models import Book, Paragraph


class EPUBParser:
    """Parser for EPUB files that preserves paragraph indexing"""
    
    def __init__(self, db_session: Session):
        self.db_session = db_session
    
    def parse_epub(self, file_path: str) -> List[Tuple[int, str]]:
        """
        Parse EPUB file and return list of (index, content) tuples
        preserving paragraph structure
        """
        book = epub.read_epub(file_path)
        paragraphs = []
        index = 0
        
        # Get all items from the book
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                # Parse HTML content
                content = item.get_content().decode('utf-8')
                # Extract paragraphs while preserving order
                paragraphs.extend(self._extract_paragraphs(content, index))
                index += len(paragraphs)
        
        return paragraphs
    
    def _extract_paragraphs(self, html_content: str, start_index: int) -> List[Tuple[int, str]]:
        """Extract paragraphs from HTML content"""
        import re
        
        # Simple paragraph extraction
        # This can be enhanced based on specific requirements
        paragraphs = []
        # Extract text between <p> tags
        p_tags = re.findall(r'<p[^>]*>(.*?)</p>', html_content, re.DOTALL)
        
        for i, p_content in enumerate(p_tags):
            # Clean up the content
            clean_content = re.sub(r'<[^>]+>', '', p_content).strip()
            if clean_content:
                paragraphs.append((start_index + i, clean_content))
        
        return paragraphs
    
    def save_book_paragraphs(self, book_id: int, file_path: str) -> None:
        """Parse EPUB and save paragraphs to database"""
        paragraphs = self.parse_epub(file_path)
        
        for index, content in paragraphs:
            # Create paragraph model and save
            paragraph = Paragraph(
                book_id=book_id,
                content=content,
                index=index
            )
            self.db_session.add(paragraph)
        
        self.db_session.commit()
