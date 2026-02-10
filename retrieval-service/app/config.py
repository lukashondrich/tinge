import os


class Settings:
    def __init__(self) -> None:
        self.host = os.getenv("HOST", "0.0.0.0")
        self.port = int(os.getenv("PORT", "3004"))
        self.elasticsearch_url = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
        self.elasticsearch_index = os.getenv("ELASTICSEARCH_INDEX", "tinge_knowledge_v1")
        self.default_top_k = int(os.getenv("DEFAULT_TOP_K", "5"))
        self.max_top_k = int(os.getenv("MAX_TOP_K", "10"))
        self.default_corpus_path = os.getenv(
            "DEFAULT_CORPUS_PATH",
            "/app/data/corpus.jsonl",
        )
        self.retrieval_query_join_mode = os.getenv(
            "RETRIEVAL_QUERY_JOIN_MODE",
            "reciprocal_rank_fusion",
        )
        self.retrieval_branch_top_k = int(os.getenv("RETRIEVAL_BRANCH_TOP_K", "0"))
        self.retrieval_log_timing = (
            str(os.getenv("RETRIEVAL_LOG_TIMING", "true")).strip().lower()
            not in {"0", "false", "no", "off"}
        )
        self.retrieval_dense_enabled = (
            str(os.getenv("RETRIEVAL_DENSE_ENABLED", "false")).strip().lower()
            in {"1", "true", "yes", "on"}
        )
        self.retrieval_write_embeddings = (
            str(os.getenv("RETRIEVAL_WRITE_EMBEDDINGS", "true")).strip().lower()
            not in {"0", "false", "no", "off"}
        )
        self.retrieval_embed_model = os.getenv(
            "RETRIEVAL_EMBED_MODEL",
            "sentence-transformers/all-MiniLM-L6-v2",
        )
        self.retrieval_dense_top_k = int(os.getenv("RETRIEVAL_DENSE_TOP_K", "8"))


settings = Settings()
