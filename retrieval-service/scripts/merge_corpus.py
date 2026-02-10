#!/usr/bin/env python3
"""
Merge and deduplicate corpus records from one or more JSON/JSONL inputs.

This script normalizes fields into the retrieval schema used by this project:
  id, title, url, source, language, published_at, content

Typical usage:
  python3 scripts/merge_corpus.py \
    --inputs data/corpus.jsonl data/import \
    --output data/corpus.jsonl \
    --overwrite
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple
from urllib.parse import urlsplit, urlunsplit


FIELD_ALIASES = {
    "id": ("id", "doc_id", "document_id"),
    "title": ("title", "headline", "name"),
    "url": ("url", "link", "source_url", "canonical_url"),
    "source": ("source", "publisher", "site", "domain"),
    "language": ("language", "lang", "locale"),
    "published_at": ("published_at", "published", "published_date", "date"),
    "content": ("content", "text", "body", "snippet", "description"),
}

OUTPUT_FIELDS = ("id", "title", "url", "source", "language", "published_at", "content")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SLUG_RE = re.compile(r"[^a-z0-9]+")
ALLOWED_EXTENSIONS = {".jsonl", ".json"}
WILDCARD_CHARS = set("*?[]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge and deduplicate retrieval corpus records.")
    parser.add_argument(
        "--inputs",
        nargs="+",
        required=True,
        help="Input files, directories, or glob patterns (.jsonl/.json).",
    )
    parser.add_argument(
        "--output",
        default="data/corpus.jsonl",
        help="Output JSONL path (default: data/corpus.jsonl).",
    )
    parser.add_argument(
        "--dedupe-key",
        choices=("url_lang", "url", "id"),
        default="url_lang",
        help="Primary dedupe key (default: url_lang).",
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        default=["en", "es"],
        help="Allowed languages (default: en es).",
    )
    parser.add_argument(
        "--min-content-chars",
        type=int,
        default=80,
        help="Drop records with content shorter than this threshold (default: 80).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting output file if it exists.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run pipeline and print stats without writing output.",
    )
    return parser.parse_args()


def has_wildcard(value: str) -> bool:
    return any(ch in WILDCARD_CHARS for ch in value)


def iter_paths(inputs: Sequence[str]) -> Iterator[Path]:
    seen: set[Path] = set()
    for raw in inputs:
        candidate = Path(raw)
        matched: List[Path] = []

        if has_wildcard(raw):
            matched.extend(sorted(Path(".").glob(raw)))
        elif candidate.is_dir():
            for ext in ALLOWED_EXTENSIONS:
                matched.extend(sorted(candidate.rglob(f"*{ext}")))
        else:
            matched.append(candidate)

        for path in matched:
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            yield path


def load_jsonl(path: Path) -> Iterator[Tuple[Dict[str, Any], str]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                raise ValueError(f"{path}:{line_no}: invalid JSON") from None
            if not isinstance(obj, dict):
                raise ValueError(f"{path}:{line_no}: expected JSON object, got {type(obj).__name__}")
            yield obj, f"{path}:{line_no}"


def load_json(path: Path) -> Iterator[Tuple[Dict[str, Any], str]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if isinstance(payload, list):
        for idx, obj in enumerate(payload, start=1):
            if isinstance(obj, dict):
                yield obj, f"{path}:{idx}"
        return

    if isinstance(payload, dict):
        for key in ("records", "items", "data", "documents"):
            value = payload.get(key)
            if isinstance(value, list):
                for idx, obj in enumerate(value, start=1):
                    if isinstance(obj, dict):
                        yield obj, f"{path}:{idx}"
                return

    raise ValueError(f"{path}: expected JSON array or object with records/items/data/documents list")


def iter_raw_records(paths: Iterable[Path]) -> Iterator[Tuple[Dict[str, Any], str]]:
    for path in paths:
        if not path.exists():
            raise FileNotFoundError(f"Input path not found: {path}")
        if path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        if path.suffix.lower() == ".jsonl":
            yield from load_jsonl(path)
        else:
            yield from load_json(path)


def first_value(record: Dict[str, Any], aliases: Sequence[str]) -> Optional[Any]:
    for key in aliases:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def normalize_language(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        return ""
    value = value.replace("_", "-")
    if value in ("english",):
        return "en"
    if value in ("spanish", "espanol", "español", "castellano"):
        return "es"
    if "-" in value:
        value = value.split("-", 1)[0]
    return value


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = SLUG_RE.sub("_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "doc"


def normalize_url(raw_url: str) -> str:
    if not raw_url:
        return ""
    try:
        parsed = urlsplit(raw_url.strip())
    except ValueError:
        return ""
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/")
    if not path:
        path = "/"
    if scheme not in ("http", "https") or not netloc:
        return ""
    return urlunsplit((scheme, netloc, path, "", ""))


def host_from_url(url: str) -> str:
    try:
        return urlsplit(url).netloc.lower()
    except ValueError:
        return ""


def normalize_published_at(raw_value: Any) -> Optional[str]:
    value = str(raw_value or "").strip()
    if not value:
        return None
    if ISO_DATE_RE.match(value):
        return value
    if len(value) >= 10 and ISO_DATE_RE.match(value[:10]):
        return value[:10]
    return None


def build_id(base_seed: str, language: str, url: str, title: str) -> str:
    seed = f"{base_seed}|{language}|{url}|{title}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:8]
    root = slugify(base_seed or title or url or "doc")
    lang_suffix = language or "xx"
    return f"{root}_{lang_suffix}_{digest}"


def normalize_record(
    raw: Dict[str, Any],
    origin: str,
    *,
    allowed_languages: set[str],
    min_content_chars: int,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    candidate: Dict[str, Any] = {}
    for field, aliases in FIELD_ALIASES.items():
        candidate[field] = first_value(raw, aliases)

    title = normalize_whitespace(str(candidate.get("title") or "").strip())
    url = normalize_url(str(candidate.get("url") or "").strip())
    source = normalize_whitespace(str(candidate.get("source") or "").strip())
    language = normalize_language(candidate.get("language"))
    content = normalize_whitespace(str(candidate.get("content") or "").strip())
    published_at = normalize_published_at(candidate.get("published_at"))

    if not language:
        return None, f"{origin}: missing language"
    if language not in allowed_languages:
        return None, f"{origin}: language '{language}' not allowed"
    if not content:
        return None, f"{origin}: missing content"
    if len(content) < min_content_chars:
        return None, f"{origin}: content shorter than {min_content_chars}"
    if not title:
        return None, f"{origin}: missing title"
    if not url:
        return None, f"{origin}: missing/invalid url"
    if not source:
        source = host_from_url(url) or "unknown"

    raw_id = normalize_whitespace(str(candidate.get("id") or "").strip())
    if raw_id:
        record_id = re.sub(r"\s+", "_", raw_id).strip("_")
    else:
        base_seed = title or url
        record_id = build_id(base_seed=base_seed, language=language, url=url, title=title)

    normalized = {
        "id": record_id,
        "title": title,
        "url": url,
        "source": source,
        "language": language,
        "published_at": published_at,
        "content": content,
    }
    return normalized, None


def record_quality(record: Dict[str, Any]) -> Tuple[int, int, int, int]:
    return (
        len(record.get("content", "")),
        1 if record.get("published_at") else 0,
        1 if record.get("title") else 0,
        1 if record.get("source") else 0,
    )


def merge_records(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    primary = a if record_quality(a) >= record_quality(b) else b
    secondary = b if primary is a else a
    merged = dict(primary)
    for field in ("title", "url", "source", "language", "published_at", "content"):
        if not merged.get(field) and secondary.get(field):
            merged[field] = secondary[field]
    return merged


def dedupe_key(record: Dict[str, Any], strategy: str) -> str:
    if strategy == "id":
        return record["id"]
    if strategy == "url":
        return record["url"] or record["id"]
    return f"{record['url']}|{record['language']}"


def ensure_unique_ids(records: List[Dict[str, Any]]) -> None:
    seen: set[str] = set()
    for record in records:
        base_id_raw = str(record.get("id") or "").strip()
        if base_id_raw:
            base_id = re.sub(r"\s+", "_", base_id_raw)
            base_id = re.sub(r"[^\w\-]+", "_", base_id).strip("_")
        else:
            base_id = build_id(
                base_seed=record.get("title", "") or record.get("url", "") or "doc",
                language=record.get("language", ""),
                url=record.get("url", ""),
                title=record.get("title", ""),
            )
        if not base_id:
            base_id = "doc"
        final_id = base_id
        idx = 2
        while final_id in seen:
            final_id = f"{base_id}_{idx}"
            idx += 1
        record["id"] = final_id
        seen.add(final_id)


def write_jsonl(path: Path, records: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            ordered = OrderedDict((field, record.get(field)) for field in OUTPUT_FIELDS)
            handle.write(json.dumps(ordered, ensure_ascii=False))
            handle.write("\n")


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    allowed_languages = {normalize_language(lang) for lang in args.languages if normalize_language(lang)}
    if not allowed_languages:
        print("No valid languages provided.")
        return 1

    paths = list(iter_paths(args.inputs))
    if not paths:
        print("No input files matched.")
        return 1

    if output_path.exists() and not args.overwrite and not args.dry_run:
        print(f"Output file exists: {output_path}. Use --overwrite to replace it.")
        return 1

    raw_total = 0
    accepted_total = 0
    duplicate_total = 0
    dropped_reasons: Counter[str] = Counter()
    language_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()
    deduped: OrderedDict[str, Dict[str, Any]] = OrderedDict()

    try:
        raw_records = iter_raw_records(paths)
        for raw_record, origin in raw_records:
            raw_total += 1
            normalized, err = normalize_record(
                raw_record,
                origin,
                allowed_languages=allowed_languages,
                min_content_chars=args.min_content_chars,
            )
            if normalized is None:
                dropped_reasons[err or "unknown"] += 1
                continue

            key = dedupe_key(normalized, args.dedupe_key)
            if key in deduped:
                duplicate_total += 1
                deduped[key] = merge_records(deduped[key], normalized)
            else:
                deduped[key] = normalized
                accepted_total += 1
    except (FileNotFoundError, ValueError) as err:
        print(f"Input error: {err}")
        return 1

    records = list(deduped.values())
    ensure_unique_ids(records)
    records.sort(key=lambda rec: (rec.get("language", ""), rec.get("source", ""), rec.get("id", "")))

    for rec in records:
        language_counts[rec.get("language", "")] += 1
        source_counts[rec.get("source", "")] += 1

    print("Merge summary")
    print("-" * 80)
    print(f"Input files: {len(paths)}")
    print(f"Raw records read: {raw_total}")
    print(f"Accepted records: {accepted_total}")
    print(f"Duplicates merged: {duplicate_total}")
    print(f"Output records: {len(records)}")
    print(f"Language distribution: {dict(language_counts)}")
    print(f"Top sources: {dict(source_counts.most_common(10))}")

    if dropped_reasons:
        print("\nDropped records by reason:")
        for reason, count in dropped_reasons.most_common():
            print(f"- {count:>4} | {reason}")

    if args.dry_run:
        print("\nDry run mode: no output written.")
        return 0

    write_jsonl(output_path, records)
    print(f"\nWrote merged corpus: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
