.PHONY: dev-rag rag-up rag-wait rag-index rag-smoke rag-eval rag-eval-log rag-eval-strict rag-eval-log-strict rag-merge-corpus rag-scale-loop rag-fetch-wiki-en rag-scale-wiki-en rag-status rag-down rag-local-run rag-local-index rag-local-smoke rag-local-eval rag-local-loop rag-local-benchmark

DEDUPE_KEY ?= url_lang
RAG_MIN_PASS_RATE ?= 0.875
RAG_EVAL_BROAD_QUERIES ?= retrieval-service/data/eval_broad_wiki.json
RAG_EVAL_STRICT_QUERIES ?= retrieval-service/data/eval_precision_local.json
WIKI_EN_TARGET_DOCS ?= 10000
RAG_LARGE_DATA_DIR ?= /tmp/tinge-rag-data
WIKI_EN_OUTPUT ?= $(RAG_LARGE_DATA_DIR)/wiki_en_articles.jsonl
WIKI_EN_SEED_PROFILE ?= iberia_latam
WIKI_EN_MAX_FALLBACK_REQUESTS ?= -1
RAG_LOCAL_BASE_URL ?= http://localhost:3004
RAG_LOCAL_CORPUS_PATH ?= $(CURDIR)/retrieval-service/data/corpus.jsonl
RAG_LOCAL_ELASTICSEARCH_URL ?= http://localhost:9200
RAG_LOCAL_DENSE_ENABLED ?= true
RAG_LOCAL_WRITE_EMBEDDINGS ?= true
RAG_LOCAL_EMBED_MODEL ?= sentence-transformers/all-MiniLM-L6-v2
RAG_LOCAL_DENSE_TOP_K ?= 8
RAG_BENCH_BASE_PORT ?= 3014
RAG_BENCH_CONFIGS ?= bm25,hybrid_k5,hybrid_k8

dev-rag: rag-up rag-wait rag-index rag-smoke
	@echo "RAG stack ready."

rag-up:
	docker compose up -d --build elasticsearch retrieval-service backend

rag-wait:
	@echo "Waiting for retrieval-service health..."
	@for i in $$(seq 1 30); do \
		if curl -fsS http://localhost:3004/health >/dev/null 2>&1; then \
			echo "retrieval-service is healthy."; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "retrieval-service did not become healthy in time."; \
	exit 1

rag-index:
	curl -sS -X POST http://localhost:3004/index \
		-H "Content-Type: application/json" \
		-d '{"recreate_index":true}'
	@echo ""

rag-smoke:
	python3 retrieval-service/scripts/smoke_test.py \
		--base-url http://localhost:3004 \
		--queries retrieval-service/data/smoke_queries.json

rag-eval:
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url http://localhost:3004 \
		--queries $(RAG_EVAL_BROAD_QUERIES) \
		--ignore-doc-id-checks \
		--min-pass-rate $(RAG_MIN_PASS_RATE)

rag-eval-log:
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url http://localhost:3004 \
		--queries $(RAG_EVAL_BROAD_QUERIES) \
		--ignore-doc-id-checks \
		--min-pass-rate $(RAG_MIN_PASS_RATE) \
		--corpus-path retrieval-service/data/corpus.jsonl \
		--history-jsonl retrieval-service/data/eval_history.jsonl

rag-eval-strict:
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url http://localhost:3004 \
		--queries $(RAG_EVAL_STRICT_QUERIES) \
		--min-pass-rate $(RAG_MIN_PASS_RATE)

rag-eval-log-strict:
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url http://localhost:3004 \
		--queries $(RAG_EVAL_STRICT_QUERIES) \
		--min-pass-rate $(RAG_MIN_PASS_RATE) \
		--corpus-path retrieval-service/data/corpus.jsonl \
		--history-jsonl retrieval-service/data/eval_history.jsonl

rag-merge-corpus:
	python3 retrieval-service/scripts/merge_corpus.py \
		--inputs retrieval-service/data/corpus.jsonl retrieval-service/data/import \
		--dedupe-key $(DEDUPE_KEY) \
		--output retrieval-service/data/corpus.jsonl \
		--overwrite

rag-scale-loop: rag-merge-corpus
	python3 retrieval-service/scripts/validate_corpus.py --path retrieval-service/data/corpus.jsonl
	curl -sS -X POST http://localhost:3004/index \
		-H "Content-Type: application/json" \
		-d '{"recreate_index":true}'
	@echo ""
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url http://localhost:3004 \
		--queries $(RAG_EVAL_BROAD_QUERIES) \
		--ignore-doc-id-checks \
		--min-pass-rate $(RAG_MIN_PASS_RATE) \
		--corpus-path retrieval-service/data/corpus.jsonl \
		--history-jsonl retrieval-service/data/eval_history.jsonl

rag-fetch-wiki-en:
	python3 retrieval-service/scripts/fetch_wikipedia_en.py \
		--output $(WIKI_EN_OUTPUT) \
		--seed-profile $(WIKI_EN_SEED_PROFILE) \
		--target-docs $(WIKI_EN_TARGET_DOCS) \
		--fallback-single-page \
		--max-fallback-requests $(WIKI_EN_MAX_FALLBACK_REQUESTS) \
		--overwrite

rag-scale-wiki-en: rag-fetch-wiki-en
	python3 retrieval-service/scripts/merge_corpus.py \
		--inputs $(WIKI_EN_OUTPUT) \
		--languages en \
		--dedupe-key url_lang \
		--output retrieval-service/data/corpus.jsonl \
		--overwrite
	python3 retrieval-service/scripts/validate_corpus.py --path retrieval-service/data/corpus.jsonl
	curl -sS -X POST http://localhost:3004/index \
		-H "Content-Type: application/json" \
		-d '{"recreate_index":true}'
	@echo ""
	python3 retrieval-service/scripts/smoke_test.py \
		--base-url http://localhost:3004 \
		--queries retrieval-service/data/smoke_queries.json
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url http://localhost:3004 \
		--queries $(RAG_EVAL_BROAD_QUERIES) \
		--ignore-doc-id-checks \
		--min-pass-rate $(RAG_MIN_PASS_RATE) \
		--corpus-path retrieval-service/data/corpus.jsonl \
		--history-jsonl retrieval-service/data/eval_history.jsonl

rag-status:
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

rag-down:
	docker compose down

rag-local-run:
	cd retrieval-service && . .venv/bin/activate && \
		ELASTICSEARCH_URL=$(RAG_LOCAL_ELASTICSEARCH_URL) \
		DEFAULT_CORPUS_PATH=$(RAG_LOCAL_CORPUS_PATH) \
		RETRIEVAL_DENSE_ENABLED=$(RAG_LOCAL_DENSE_ENABLED) \
		RETRIEVAL_WRITE_EMBEDDINGS=$(RAG_LOCAL_WRITE_EMBEDDINGS) \
		RETRIEVAL_EMBED_MODEL=$(RAG_LOCAL_EMBED_MODEL) \
		RETRIEVAL_DENSE_TOP_K=$(RAG_LOCAL_DENSE_TOP_K) \
		python -m uvicorn app.main:app --host 0.0.0.0 --port 3004

rag-local-index:
	curl -sS -X POST $(RAG_LOCAL_BASE_URL)/index \
		-H "Content-Type: application/json" \
		-d "{\"recreate_index\":true,\"path\":\"$(RAG_LOCAL_CORPUS_PATH)\"}"
	@echo ""

rag-local-smoke:
	python3 retrieval-service/scripts/smoke_test.py \
		--base-url $(RAG_LOCAL_BASE_URL) \
		--queries retrieval-service/data/smoke_queries.json

rag-local-eval:
	python3 retrieval-service/scripts/eval_retrieval.py \
		--base-url $(RAG_LOCAL_BASE_URL) \
		--queries $(RAG_EVAL_BROAD_QUERIES) \
		--ignore-doc-id-checks \
		--min-pass-rate $(RAG_MIN_PASS_RATE)

rag-local-loop: rag-local-index rag-local-smoke rag-local-eval

rag-local-benchmark:
	python3 retrieval-service/scripts/benchmark_local_configs.py \
		--python-bin "$$(pwd)/retrieval-service/.venv/bin/python" \
		--base-port $(RAG_BENCH_BASE_PORT) \
		--corpus-path $(RAG_LOCAL_CORPUS_PATH) \
		--queries $(RAG_EVAL_BROAD_QUERIES) \
		--configs $(RAG_BENCH_CONFIGS)
