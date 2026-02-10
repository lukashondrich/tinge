from fastapi import FastAPI, HTTPException

from .models import (
    HealthResponse,
    IndexRequest,
    IndexResponse,
    SearchRequest,
    SearchResponse,
)
from .search import RetrievalService

app = FastAPI(title="Tinge Retrieval Service", version="0.1.0")
service = RetrievalService()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="retrieval-service",
        elasticsearch_reachable=service.ping(),
    )


@app.post("/index", response_model=IndexResponse)
def index_corpus(request: IndexRequest) -> IndexResponse:
    try:
        result = service.index_corpus(
            path=request.path,
            recreate_index=request.recreate_index,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
        )
        return IndexResponse(**result)
    except FileNotFoundError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except Exception as err:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Indexing failed: {err}") from err


@app.post("/search", response_model=SearchResponse)
def search(request: SearchRequest) -> SearchResponse:
    try:
        result = service.search(
            query_original=request.query_original,
            query_en=request.query_en,
            language=request.language,
            top_k=request.top_k,
        )
        return SearchResponse(**result)
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except Exception as err:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Search failed: {err}") from err

