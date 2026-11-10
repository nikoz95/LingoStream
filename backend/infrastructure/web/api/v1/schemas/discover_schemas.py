"""Pydantic schemas for the Content Discovery, Level Adaptation, Podcast & Story Hub."""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class DiscoverFeedItem(BaseModel):
    id: str
    title: str
    summary: str
    category: str
    source_name: str
    author: str = "LingoStream Feed"
    url: Optional[str] = None
    published_at: Optional[str] = None
    reading_time_minutes: int = 4
    tags: List[str] = Field(default_factory=list)
    item_type: Literal["article", "discussion", "story"] = "article"
    raw_content: Optional[str] = None


class DiscoverFeedResponse(BaseModel):
    category: str
    items: List[DiscoverFeedItem]


class DiscoverImportRequest(BaseModel):
    item_id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=300)
    summary: str = ""
    category: str = "general"
    source_name: str = "Online Feed"
    author: str = "LingoStream"
    url: Optional[str] = None
    raw_content: Optional[str] = None
    mode: Literal["original", "adapted", "podcast", "story"] = "adapted"
    cefr_level: Literal["A2", "B1", "B2", "C1"] = "B1"
    include_original_chapter: bool = True
    provider: Optional[str] = None
