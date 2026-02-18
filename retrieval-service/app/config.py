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
        self.retrieval_corrective_rag_enabled = (
            str(os.getenv("RETRIEVAL_CORRECTIVE_RAG_ENABLED", "false")).strip().lower()
            in {"1", "true", "yes", "on"}
        )
        self.retrieval_corrective_max_attempts = int(
            os.getenv("RETRIEVAL_CORRECTIVE_MAX_ATTEMPTS", "2")
        )
        self.retrieval_corrective_budget_ms = int(
            os.getenv("RETRIEVAL_CORRECTIVE_BUDGET_MS", "3000")
        )
        self.retrieval_corrective_dialogue_turns = int(
            os.getenv("RETRIEVAL_CORRECTIVE_DIALOGUE_TURNS", "3")
        )
        self.retrieval_corrective_llm_enabled = (
            str(os.getenv("RETRIEVAL_CORRECTIVE_LLM_ENABLED", "true")).strip().lower()
            not in {"0", "false", "no", "off"}
        )
        self.retrieval_corrective_llm_model = os.getenv(
            "RETRIEVAL_CORRECTIVE_LLM_MODEL",
            "gpt-4o-mini",
        )
        self.retrieval_corrective_llm_timeout_ms = int(
            os.getenv("RETRIEVAL_CORRECTIVE_LLM_TIMEOUT_MS", "900")
        )


settings = Settings()
