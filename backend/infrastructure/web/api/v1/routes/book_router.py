from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.epub_parser import EPUBParser
from infrastructure.database.postgres.models import Book

router = APIRouter(prefix="/books", tags=["Books"])

@router.post("/parse-epub")
async def parse_epub(
    file_path: str,
    db: Session = Depends(get_db)
):
    """Parse EPUB file and save paragraphs to database"""
    try:
        parser = EPUBParser(db)
        # Create book entry
        book = Book(
            title="Parsed Book",
            author="Unknown",
            file_path=file_path
        )
        db.add(book)
        db.commit()
        db.refresh(book)
        
        # Parse and save paragraphs
        parser.save_book_paragraphs(book.id, file_path)
        
        return {"message": "EPUB parsed successfully", "book_id": book.id}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
