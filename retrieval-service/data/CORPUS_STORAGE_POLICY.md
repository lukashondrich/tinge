# Canonical Corpus Storage Policy

## Decision (2026-02-15)

Keep the canonical retrieval corpus (`retrieval-service/data/corpus.jsonl`) tracked
in-repo for now.

Rationale:
- current corpus size is within the enforced policy limit (`<= 15MB`),
- local developer workflows depend on immediate reproducibility,
- generated large import batches are already externalized by default and blocked
  from accidental re-tracking.

## Current Guardrails

- size policy checker: `retrieval-service/scripts/check_data_policy.py`
- allowlist: `retrieval-service/data/data_asset_allowlist.txt`
- CI enforcement: `.github/workflows/ci.yml`
- generated wiki batch default output: `/tmp/tinge-rag-data/wiki_en_articles.jsonl`

## Revisit Triggers

Re-open this decision and consider moving canonical corpus storage to an external,
versioned artifact workflow if one or more conditions are met:

1. canonical corpus exceeds 15MB policy cap and cannot be reduced without
   harming retrieval quality;
2. repository clone/CI performance degrades materially due to corpus growth;
3. frequent large corpus churn causes unacceptable git history bloat.

## If Externalization Is Chosen Later

Implement all of the following in the same change set:

1. Add deterministic bootstrap command to fetch/build local corpus.
2. Keep a small in-repo baseline corpus fixture for smoke tests.
3. Preserve `check_data_policy.py` guardrails and minimize allowlist entries.
4. Update `retrieval-service/README.md`, `docs/tech_debt_register.md`, and
   `AGENTS.md`.
