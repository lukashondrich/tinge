#!/usr/bin/env python3
"""
Validate corpus.jsonl shape and quality before indexing.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List


REQUIRED_FIELDS = {"id", "title", "url", "source", "language", "content"}
ALLOWED_LANGUAGES = {"en", "es"}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate retrieval corpus JSONL file.")
    parser.add_argument(
        "--path",
        default="data/corpus.jsonl",
        help="Path to corpus JSONL file (default: data/corpus.jsonl)",
    )
    parser.add_argument(
        "--min-content-chars",
        type=int,
        default=80,
        help="Warn if content is shorter than this threshold.",
    )
    return parser.parse_args()


def load_lines(path: Path) -> List[str]:
    if not path.exists():
        raise FileNotFoundError(f"Corpus file not found: {path}")
    return path.read_text(encoding="utf-8").splitlines()


def main() -> int:
    args = parse_args()
    path = Path(args.path)
    lines = load_lines(path)

    errors: List[str] = []
    warnings: List[str] = []
    seen_ids = set()
    lang_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()

    for line_no, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line:
            warnings.append(f"Line {line_no}: empty line ignored")
            continue

        try:
            rec: Dict = json.loads(line)
        except json.JSONDecodeError as err:
            errors.append(f"Line {line_no}: invalid JSON ({err})")
            continue

        missing = REQUIRED_FIELDS - rec.keys()
        if missing:
            errors.append(f"Line {line_no}: missing required fields: {sorted(missing)}")
            continue

        rec_id = str(rec.get("id", "")).strip()
        if not rec_id:
            errors.append(f"Line {line_no}: id is empty")
        elif rec_id in seen_ids:
            errors.append(f"Line {line_no}: duplicate id '{rec_id}'")
        else:
            seen_ids.add(rec_id)

        title = str(rec.get("title", "")).strip()
        if not title:
            errors.append(f"Line {line_no}: title is empty")

        url = str(rec.get("url", "")).strip()
        if not url:
            errors.append(f"Line {line_no}: url is empty")
        elif not (url.startswith("http://") or url.startswith("https://")):
            errors.append(f"Line {line_no}: url must start with http:// or https://")

        source = str(rec.get("source", "")).strip()
        if not source:
            errors.append(f"Line {line_no}: source is empty")
        else:
            source_counts[source] += 1

        language = str(rec.get("language", "")).strip().lower()
        if language not in ALLOWED_LANGUAGES:
            errors.append(
                f"Line {line_no}: language '{language}' not allowed; expected one of {sorted(ALLOWED_LANGUAGES)}"
            )
        else:
            lang_counts[language] += 1

        published_at = rec.get("published_at")
        if published_at not in (None, ""):
            published_at = str(published_at).strip()
            if not ISO_DATE_RE.match(published_at):
                warnings.append(
                    f"Line {line_no}: published_at '{published_at}' is not YYYY-MM-DD (allowed but non-standard)"
                )

        content = str(rec.get("content", "")).strip()
        if not content:
            errors.append(f"Line {line_no}: content is empty")
        elif len(content) < args.min_content_chars:
            warnings.append(
                f"Line {line_no}: content length {len(content)} is below min threshold {args.min_content_chars}"
            )

    print(f"Checked file: {path}")
    print(f"Total non-empty records: {len([ln for ln in lines if ln.strip()])}")
    print(f"Unique IDs: {len(seen_ids)}")
    print(f"Language distribution: {dict(lang_counts)}")
    print(f"Top sources: {dict(source_counts)}")

    if warnings:
        print("\nWarnings:")
        for msg in warnings:
            print(f"- {msg}")

    if errors:
        print("\nErrors:")
        for msg in errors:
            print(f"- {msg}")
        print(f"\nValidation FAILED with {len(errors)} error(s).")
        return 1

    print("\nValidation PASSED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

