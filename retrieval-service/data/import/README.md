# Import Folder Guide

Place new source files in this folder, then run:

```bash
make rag-scale-loop
```

Accepted formats:
- `.jsonl`: one JSON object per line
- `.json`: JSON array of objects or object with `records`/`items`/`data`/`documents` list

Preferred record fields:
- `id` (optional but recommended)
- `title`
- `url`
- `source`
- `language` (`en` for current EN-only corpus)
- `published_at` (`YYYY-MM-DD`, optional)
- `content`

Supported aliases (auto-normalized):
- `doc_id`, `document_id` -> `id`
- `headline`, `name` -> `title`
- `link`, `source_url`, `canonical_url` -> `url`
- `publisher`, `site`, `domain` -> `source`
- `lang`, `locale` -> `language`
- `published`, `published_date`, `date` -> `published_at`
- `text`, `body`, `snippet`, `description` -> `content`

Deduplication defaults:
- key: `url + language`
- duplicate merge keeps the higher-quality content record

Practical batch workflow:
1. Add files under `retrieval-service/data/import/`.
2. Run `make rag-scale-loop`.
3. Review eval metrics and decide to keep/revert batch.

Data policy note:
- large generated import files should normally live outside the repository
  working tree and be passed to merge commands via explicit path.
- run `cd retrieval-service && make data-policy` before committing retrieval
  data changes.
- top-level wiki fetch defaults to external output path:
  `/tmp/tinge-rag-data/wiki_en_articles.jsonl` (override via `WIKI_EN_OUTPUT`).

Build a real EN Wikipedia batch (recommended for large-scale corpus):

```bash
make rag-fetch-wiki-en WIKI_EN_TARGET_DOCS=10000
```

Then rebuild corpus as EN-only from that batch:

```bash
make rag-scale-wiki-en WIKI_EN_TARGET_DOCS=10000
```

Seed profile options:
- `WIKI_EN_SEED_PROFILE=iberia_latam` (default, more diverse incl. Latin America)
- `WIKI_EN_SEED_PROFILE=spain_core` (Spain-heavy)
- `WIKI_EN_MAX_FALLBACK_REQUESTS=-1` (default unlimited single-page fallback retries)

Seed batch generator (optional):

```bash
python3 retrieval-service/scripts/generate_seed_batch.py --overwrite --target-records 252
```

Then scale loop with ID-based dedupe for that run:

```bash
make rag-scale-loop DEDUPE_KEY=id
```
