from typing import List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    elasticsearch_reachable: bool


class IndexRequest(BaseModel):
    path: Optional[str] = None
    recreate_index: bool = False
    chunk_size: int = Field(default=900, ge=200, le=2000)
    chunk_overlap: int = Field(default=100, ge=0, le=400)


class IndexResponse(BaseModel):
    indexed_documents: int
    indexed_chunks: int
    index_name: str


class SearchRequest(BaseModel):
    query_original: str = Field(min_length=1)
    query_en: Optional[str] = None
    language: Optional[str] = Field(default=None, pattern="^(en|es)$")
    top_k: Optional[int] = Field(default=None, ge=1, le=20)


class SearchResult(BaseModel):
    chunk_id: str
    doc_id: str
    score: float
    snippet: str
    title: str
    url: str
    source: str
    language: str
    published_at: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[SearchResult]
    used_queries: List[str]
    index_name: str

