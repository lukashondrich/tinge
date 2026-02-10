from __future__ import annotations

from collections import OrderedDict
from time import perf_counter
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .config import settings
from .indexing import build_chunk_records, load_corpus_records


class RetrievalService:
    def __init__(self) -> None:
        self._document_store = None
        self._retriever = None
        self._pipeline_single = None
        self._pipeline_dual = None
        self._dense_retriever = None
        self._pipeline_dense_single = None
        self._pipeline_dense_dual = None
        self._query_embedder = None
        self._document_embedder = None
        self._index_name = settings.elasticsearch_index
        self._bootstrap_error: Optional[str] = None
        self._pipeline_warning: Optional[str] = None
        self._dense_warning: Optional[str] = None
        self._init_haystack()

    def _init_haystack(self) -> None:
        try:
            from haystack_integrations.components.retrievers.elasticsearch import (
                ElasticsearchBM25Retriever,
            )
            from haystack_integrations.document_stores.elasticsearch import (
                ElasticsearchDocumentStore,
            )
        except Exception as err:  # pragma: no cover - env dependent
            self._bootstrap_error = (
                "Haystack Elasticsearch integrations unavailable. "
                f"Install dependencies and restart. Detail: {err}"
            )
            return

        self._document_store = ElasticsearchDocumentStore(
            hosts=settings.elasticsearch_url,
            index=self._index_name,
        )
        self._retriever = ElasticsearchBM25Retriever(document_store=self._document_store)
        self._pipeline_warning = None

        try:
            from haystack import Pipeline
            from haystack.components.joiners import DocumentJoiner
        except Exception as err:
            self._pipeline_single = None
            self._pipeline_dual = None
            self._pipeline_warning = (
                "Haystack pipeline components unavailable; using direct BM25 fallback. "
                f"Detail: {err}"
            )
            if settings.retrieval_log_timing:
                print(f"[retrieval] {self._pipeline_warning}")
            self._bootstrap_error = None
            return

        try:
            single = Pipeline()
            single.add_component(
                "bm25",
                ElasticsearchBM25Retriever(document_store=self._document_store),
            )

            dual = Pipeline()
            dual.add_component(
                "bm25_original",
                ElasticsearchBM25Retriever(document_store=self._document_store),
            )
            dual.add_component(
                "bm25_en",
                ElasticsearchBM25Retriever(document_store=self._document_store),
            )
            dual.add_component(
                "join",
                DocumentJoiner(join_mode=settings.retrieval_query_join_mode),
            )
            dual.connect("bm25_original.documents", "join.documents")
            dual.connect("bm25_en.documents", "join.documents")

            self._pipeline_single = single
            self._pipeline_dual = dual
        except Exception as err:
            # Keep service available even if pipeline graph init fails.
            self._pipeline_single = None
            self._pipeline_dual = None
            self._pipeline_warning = (
                "Haystack pipeline graph unavailable; using direct BM25 fallback. "
                f"Detail: {err}"
            )
            if settings.retrieval_log_timing:
                print(f"[retrieval] {self._pipeline_warning}")

        self._dense_retriever = None
        self._pipeline_dense_single = None
        self._pipeline_dense_dual = None
        self._query_embedder = None
        self._document_embedder = None
        self._dense_warning = None

        if settings.retrieval_dense_enabled:
            try:
                from haystack import Pipeline
                from haystack.components.embedders import (
                    SentenceTransformersDocumentEmbedder,
                    SentenceTransformersTextEmbedder,
                )
                from haystack.components.joiners import DocumentJoiner
                from haystack_integrations.components.retrievers.elasticsearch import (
                    ElasticsearchEmbeddingRetriever,
                )

                self._query_embedder = SentenceTransformersTextEmbedder(
                    model=settings.retrieval_embed_model
                )
                self._document_embedder = SentenceTransformersDocumentEmbedder(
                    model=settings.retrieval_embed_model
                )
                # Warmup may download/load model; keep service alive if this fails.
                self._query_embedder.warm_up()
                self._document_embedder.warm_up()
                self._dense_retriever = ElasticsearchEmbeddingRetriever(
                    document_store=self._document_store
                )

                dense_single = Pipeline()
                dense_single.add_component("query_embedder", self._query_embedder)
                dense_single.add_component(
                    "dense",
                    ElasticsearchEmbeddingRetriever(document_store=self._document_store),
                )
                dense_single.connect("query_embedder.embedding", "dense.query_embedding")

                dense_dual = Pipeline()
                dense_dual.add_component(
                    "query_embedder_original",
                    SentenceTransformersTextEmbedder(model=settings.retrieval_embed_model),
                )
                dense_dual.add_component(
                    "query_embedder_en",
                    SentenceTransformersTextEmbedder(model=settings.retrieval_embed_model),
                )
                dense_dual.add_component(
                    "dense_original",
                    ElasticsearchEmbeddingRetriever(document_store=self._document_store),
                )
                dense_dual.add_component(
                    "dense_en",
                    ElasticsearchEmbeddingRetriever(document_store=self._document_store),
                )
                dense_dual.add_component(
                    "join",
                    DocumentJoiner(join_mode=settings.retrieval_query_join_mode),
                )
                dense_dual.connect("query_embedder_original.embedding", "dense_original.query_embedding")
                dense_dual.connect("query_embedder_en.embedding", "dense_en.query_embedding")
                dense_dual.connect("dense_original.documents", "join.documents")
                dense_dual.connect("dense_en.documents", "join.documents")

                self._pipeline_dense_single = dense_single
                self._pipeline_dense_dual = dense_dual
            except Exception as err:
                self._dense_warning = (
                    "Dense retrieval unavailable; using BM25 only. "
                    f"Detail: {err}"
                )
                if settings.retrieval_log_timing:
                    print(f"[retrieval] {self._dense_warning}")

        self._bootstrap_error = None

    def ping(self) -> bool:
        if self._document_store is None:
            return False
        try:
            self._document_store.count_documents()
            return True
        except Exception:  # pragma: no cover - network dependent
            return False

    @property
    def index_name(self) -> str:
        return self._index_name

    @property
    def bootstrap_error(self) -> Optional[str]:
        return self._bootstrap_error

    @property
    def pipeline_warning(self) -> Optional[str]:
        return self._pipeline_warning

    @property
    def dense_warning(self) -> Optional[str]:
        return self._dense_warning

    def index_corpus(
        self,
        path: Optional[str] = None,
        recreate_index: bool = False,
        chunk_size: int = 900,
        chunk_overlap: int = 100,
    ) -> Dict[str, Any]:
        if self._document_store is None:
            raise RuntimeError(self._bootstrap_error or "Document store not initialized")

        records = load_corpus_records(path or settings.default_corpus_path)
        chunks = build_chunk_records(records, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        from haystack import Document
        from haystack.document_stores.types import DuplicatePolicy

        if recreate_index:
            self._reset_index_hard()

        docs = []
        for chunk in chunks:
            meta = {
                "chunk_id": chunk["chunk_id"],
                "doc_id": chunk["doc_id"],
                "chunk_index": chunk["chunk_index"],
                "title": chunk["title"],
                "url": chunk["url"],
                "source": chunk["source"],
                "language": chunk["language"],
                "published_at": chunk["published_at"],
            }
            docs.append(Document(content=chunk["content"], meta=meta))

        docs = self._maybe_embed_documents(docs)
        self._document_store.write_documents(docs, policy=DuplicatePolicy.OVERWRITE)
        return {
            "indexed_documents": len(records),
            "indexed_chunks": len(docs),
            "index_name": self._index_name,
        }

    def _reset_index_hard(self) -> None:
        """
        Hard-reset index so stale docs from prior runs cannot leak into results.
        """
        try:
            from elasticsearch import Elasticsearch

            client = Elasticsearch(settings.elasticsearch_url)
            client.indices.delete(index=self._index_name, ignore_unavailable=True)
            client.close()
        except Exception:
            # Fall back to document-store deletion if direct index delete is unavailable.
            try:
                self._document_store.delete_documents()
            except Exception:
                pass

        # Reinitialize store/retriever so they point to a fresh index state.
        self._init_haystack()

    def _maybe_embed_documents(self, docs: List[Any]) -> List[Any]:
        if not docs:
            return docs
        if not settings.retrieval_dense_enabled or not settings.retrieval_write_embeddings:
            return docs
        if self._document_embedder is None:
            return docs
        try:
            started = perf_counter()
            output = self._document_embedder.run(documents=docs)
            embedded_docs = output.get("documents", docs)
            if settings.retrieval_log_timing:
                elapsed = (perf_counter() - started) * 1000.0
                print(
                    f"[retrieval] mode=dense_index_embeddings docs={len(embedded_docs)} "
                    f"model={settings.retrieval_embed_model} elapsed_ms={elapsed:.1f}"
                )
            return embedded_docs
        except Exception as err:
            if settings.retrieval_log_timing:
                print(f"[retrieval] dense document embedding failed; indexing BM25-only docs ({err})")
            return docs

    def _resolve_branch_top_k(self, final_top_k: int) -> int:
        if settings.retrieval_branch_top_k <= 0:
            return final_top_k
        return min(max(final_top_k, settings.retrieval_branch_top_k), settings.max_top_k)

    @staticmethod
    def _doc_chunk_id(doc: Any) -> str:
        meta = doc.meta or {}
        return str(meta.get("chunk_id") or f"{meta.get('doc_id', 'unknown')}::chunk::na")

    def _run_legacy_bm25(self, queries: Sequence[str], top_k: int) -> List[Any]:
        merged: "OrderedDict[str, Any]" = OrderedDict()

        for query in queries:
            result = self._retriever.run(query=query, top_k=top_k)
            docs = result.get("documents", [])
            for doc in docs:
                key = self._doc_chunk_id(doc)
                existing = merged.get(key)
                if existing is None or float(doc.score or 0.0) > float(existing.score or 0.0):
                    merged[key] = doc

        return sorted(merged.values(), key=lambda doc: float(doc.score or 0.0), reverse=True)

    def _run_pipeline_bm25(self, queries: Sequence[str], top_k: int) -> List[Any]:
        if self._pipeline_single is None:
            return self._run_legacy_bm25(queries, top_k)

        try:
            if len(queries) == 1:
                started = perf_counter()
                output = self._pipeline_single.run(
                    data={"bm25": {"query": queries[0], "top_k": top_k}},
                    include_outputs_from={"bm25"},
                )
                docs = output.get("bm25", {}).get("documents", [])
                if settings.retrieval_log_timing:
                    elapsed = (perf_counter() - started) * 1000.0
                    print(
                        f"[retrieval] mode=bm25_pipeline_single "
                        f"query_len={len(queries[0])} docs={len(docs)} elapsed_ms={elapsed:.1f}"
                    )
                return docs

            if self._pipeline_dual is None:
                return self._run_legacy_bm25(queries, top_k)

            branch_top_k = self._resolve_branch_top_k(top_k)
            started = perf_counter()
            output = self._pipeline_dual.run(
                data={
                    "bm25_original": {"query": queries[0], "top_k": branch_top_k},
                    "bm25_en": {"query": queries[1], "top_k": branch_top_k},
                },
                include_outputs_from={"bm25_original", "bm25_en", "join"},
            )
            docs = output.get("join", {}).get("documents", [])
            if settings.retrieval_log_timing:
                elapsed = (perf_counter() - started) * 1000.0
                count_original = len(output.get("bm25_original", {}).get("documents", []))
                count_en = len(output.get("bm25_en", {}).get("documents", []))
                print(
                    f"[retrieval] mode=bm25_pipeline_dual join={settings.retrieval_query_join_mode} "
                    f"branch_top_k={branch_top_k} original_docs={count_original} "
                    f"query_en_docs={count_en} merged_docs={len(docs)} elapsed_ms={elapsed:.1f}"
                )
            return docs
        except Exception as err:
            if settings.retrieval_log_timing:
                print(f"[retrieval] pipeline run failed; falling back to legacy bm25 ({err})")
            return self._run_legacy_bm25(queries, top_k)

    def _run_pipeline_dense(self, queries: Sequence[str], top_k: int) -> List[Any]:
        if not settings.retrieval_dense_enabled:
            return []
        if self._pipeline_dense_single is None:
            return []
        try:
            if len(queries) == 1:
                started = perf_counter()
                output = self._pipeline_dense_single.run(
                    data={
                        "query_embedder": {"text": queries[0]},
                        "dense": {"top_k": top_k},
                    },
                    include_outputs_from={"dense"},
                )
                docs = output.get("dense", {}).get("documents", [])
                if settings.retrieval_log_timing:
                    elapsed = (perf_counter() - started) * 1000.0
                    print(
                        f"[retrieval] mode=dense_pipeline_single model={settings.retrieval_embed_model} "
                        f"query_len={len(queries[0])} docs={len(docs)} elapsed_ms={elapsed:.1f}"
                    )
                return docs

            if self._pipeline_dense_dual is None:
                return []

            started = perf_counter()
            output = self._pipeline_dense_dual.run(
                data={
                    "query_embedder_original": {"text": queries[0]},
                    "query_embedder_en": {"text": queries[1]},
                    "dense_original": {"top_k": top_k},
                    "dense_en": {"top_k": top_k},
                },
                include_outputs_from={"dense_original", "dense_en", "join"},
            )
            docs = output.get("join", {}).get("documents", [])
            if settings.retrieval_log_timing:
                elapsed = (perf_counter() - started) * 1000.0
                count_original = len(output.get("dense_original", {}).get("documents", []))
                count_en = len(output.get("dense_en", {}).get("documents", []))
                print(
                    f"[retrieval] mode=dense_pipeline_dual model={settings.retrieval_embed_model} "
                    f"join={settings.retrieval_query_join_mode} original_docs={count_original} "
                    f"query_en_docs={count_en} merged_docs={len(docs)} elapsed_ms={elapsed:.1f}"
                )
            return docs
        except Exception as err:
            if settings.retrieval_log_timing:
                print(f"[retrieval] dense pipeline failed; using BM25-only ({err})")
            return []

    def _rrf_merge_documents(self, ranked_lists: Sequence[Tuple[str, List[Any]]]) -> List[Any]:
        k = 60.0
        scores: Dict[str, float] = {}
        docs_by_chunk: Dict[str, Any] = {}
        source_by_chunk: Dict[str, str] = {}

        for source_name, ranked_docs in ranked_lists:
            for rank, doc in enumerate(ranked_docs, start=1):
                chunk_id = self._doc_chunk_id(doc)
                scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
                if chunk_id not in docs_by_chunk:
                    docs_by_chunk[chunk_id] = doc
                    source_by_chunk[chunk_id] = source_name

        ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        fused_docs: List[Any] = []
        for chunk_id, fused_score in ordered:
            doc = docs_by_chunk[chunk_id]
            try:
                doc.score = fused_score
            except Exception:
                pass
            fused_docs.append(doc)

        if settings.retrieval_log_timing:
            counts = ", ".join(f"{name}:{len(docs)}" for name, docs in ranked_lists)
            print(
                f"[retrieval] mode=rrf_merge lists=[{counts}] fused_docs={len(fused_docs)} "
                f"k={k:.0f}"
            )
        return fused_docs

    def search(
        self,
        query_original: str,
        query_en: Optional[str] = None,
        language: Optional[str] = None,
        top_k: Optional[int] = None,
    ) -> Dict[str, Any]:
        if self._retriever is None:
            raise RuntimeError(self._bootstrap_error or "Retriever not initialized")

        k = min(top_k or settings.default_top_k, settings.max_top_k)
        queries = [query_original.strip()]
        if query_en and query_en.strip() and query_en.strip() not in queries:
            queries.append(query_en.strip())

        bm25_docs = self._run_pipeline_bm25(queries=queries, top_k=k)
        dense_top_k = min(max(k, settings.retrieval_dense_top_k), settings.max_top_k)
        dense_docs = self._run_pipeline_dense(queries=queries, top_k=dense_top_k)
        if dense_docs:
            docs = self._rrf_merge_documents(
                ranked_lists=[
                    ("bm25", bm25_docs),
                    ("dense", dense_docs),
                ]
            )
        else:
            docs = bm25_docs
        merged: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()

        for doc in docs:
            meta = doc.meta or {}
            if language and meta.get("language") and meta.get("language") != language:
                continue
            chunk_id = self._doc_chunk_id(doc)
            score = float(doc.score or 0.0)
            existing = merged.get(chunk_id)
            if existing and existing["score"] >= score:
                continue
            merged[chunk_id] = {
                "chunk_id": chunk_id,
                "doc_id": str(meta.get("doc_id", "unknown")),
                "score": score,
                "snippet": (doc.content or "")[:420],
                "title": str(meta.get("title", "")),
                "url": str(meta.get("url", "")),
                "source": str(meta.get("source", "")),
                "language": str(meta.get("language", "en")),
                "published_at": meta.get("published_at"),
            }

        sorted_results = sorted(merged.values(), key=lambda item: item["score"], reverse=True)
        return {
            "results": sorted_results[:k],
            "used_queries": queries,
            "index_name": self._index_name,
        }
