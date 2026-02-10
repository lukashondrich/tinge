#!/usr/bin/env python3
"""
Build an EN-only corpus from real English Wikipedia articles.

This script crawls category trees with the MediaWiki API, collects article
page IDs, fetches article extracts, and writes retrieval-ready JSONL records.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
from collections import OrderedDict, deque
from pathlib import Path
from typing import Any, Dict, Iterable, List, MutableMapping, Optional, Tuple
from urllib import error, request


WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
SEED_CATEGORY_PROFILES = {
    "spain_core": [
        "Category:Barcelona",
        "Category:Catalonia",
        "Category:Spain",
        "Category:Spanish culture",
        "Category:Spanish cuisine",
        "Category:History of Spain",
        "Category:Tourism in Spain",
        "Category:Architecture in Spain",
    ],
    "iberia_latam": [
        # Spain / Iberia
        "Category:Barcelona",
        "Category:Catalonia",
        "Category:Spain",
        "Category:Spanish culture",
        "Category:Spanish cuisine",
        "Category:History of Spain",
        "Category:Tourism in Spain",
        "Category:Architecture in Spain",
        # Latin America (broad + country anchors)
        "Category:Latin America",
        "Category:Culture of Latin America",
        "Category:History of Latin America",
        "Category:Tourism in South America",
        "Category:Tourism in Central America",
        "Category:Mexico",
        "Category:Argentina",
        "Category:Chile",
        "Category:Colombia",
        "Category:Peru",
        "Category:Uruguay",
        "Category:Ecuador",
        "Category:Bolivia",
        "Category:Paraguay",
        "Category:Venezuela",
        "Category:Cuba",
        "Category:Dominican Republic",
        "Category:Costa Rica",
        "Category:Guatemala",
        "Category:Panama",
    ],
}
DEFAULT_SEED_PROFILE = "iberia_latam"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch EN Wikipedia corpus into JSONL.")
    parser.add_argument(
        "--output",
        default="retrieval-service/data/import/wiki_en_articles.jsonl",
        help="Output JSONL file path (default: retrieval-service/data/import/wiki_en_articles.jsonl)",
    )
    parser.add_argument(
        "--target-docs",
        type=int,
        default=10000,
        help="How many records to write (default: 10000)",
    )
    parser.add_argument(
        "--seed-profile",
        choices=tuple(SEED_CATEGORY_PROFILES.keys()),
        default=DEFAULT_SEED_PROFILE,
        help=(
            "Named root-category profile. "
            f"Default: {DEFAULT_SEED_PROFILE}"
        ),
    )
    parser.add_argument(
        "--seed-categories",
        nargs="+",
        default=[],
        help=(
            "Additional root categories to include (e.g. "
            "'Category:Brazil Category:Andean_culture')."
        ),
    )
    parser.add_argument(
        "--max-subcategories",
        type=int,
        default=6000,
        help="Maximum distinct categories to crawl (default: 6000)",
    )
    parser.add_argument(
        "--max-extract-chars",
        type=int,
        default=2600,
        help="Maximum extract chars fetched from Wikipedia (default: 2600)",
    )
    parser.add_argument(
        "--min-content-chars",
        type=int,
        default=220,
        help="Drop records below this content length after cleanup (default: 220)",
    )
    parser.add_argument(
        "--request-timeout",
        type=float,
        default=20.0,
        help="HTTP timeout per request in seconds (default: 20)",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=75,
        help="Sleep between API requests in milliseconds (default: 75)",
    )
    parser.add_argument(
        "--fetch-batch-size",
        type=int,
        default=40,
        help="Page IDs per extract/info fetch request (default: 40).",
    )
    parser.add_argument(
        "--fallback-single-page",
        action="store_true",
        help="Retry missing extracts via one-page requests.",
    )
    parser.add_argument(
        "--max-fallback-requests",
        type=int,
        default=-1,
        help="Cap fallback single-page requests (-1 means unlimited, default: -1).",
    )
    parser.add_argument(
        "--fallback-sleep-ms",
        type=int,
        default=15,
        help="Sleep between fallback requests in milliseconds (default: 15).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite output file if it exists.",
    )
    return parser.parse_args()


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def normalize_category(value: str) -> str:
    title = normalize_whitespace(value.replace("_", " ").strip())
    if not title:
        return ""
    if not title.lower().startswith("category:"):
        title = f"Category:{title}"
    return title


def dedupe_preserve_order(values: Iterable[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def as_iso_date(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    if len(text) >= 10:
        maybe_date = text[:10]
        if DATE_RE.match(maybe_date):
            return maybe_date
    return None


def api_get(
    params: MutableMapping[str, Any],
    *,
    timeout: float,
    max_retries: int = 4,
) -> Dict[str, Any]:
    query: Dict[str, Any] = {
        "format": "json",
        "formatversion": 2,
        **params,
    }
    url = f"{WIKIPEDIA_API_URL}?{urllib.parse.urlencode(query, doseq=True)}"
    req = request.Request(url=url, method="GET", headers={"User-Agent": "tinge-retrieval-corpus-builder/1.0"})

    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            with request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                if not isinstance(payload, dict):
                    raise RuntimeError("Wikipedia API returned non-object payload")
                return payload
        except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_error = err
            if attempt >= max_retries:
                break
            backoff = 0.5 * (2 ** (attempt - 1))
            time.sleep(backoff)
    raise RuntimeError(f"Wikipedia API request failed after {max_retries} attempts: {last_error}")


def collect_page_ids_from_categories(
    *,
    target_docs: int,
    seed_categories: Iterable[str],
    max_subcategories: int,
    timeout: float,
    sleep_seconds: float,
) -> "OrderedDict[int, str]":
    queue = deque()
    visited_categories = set()
    page_ids: "OrderedDict[int, str]" = OrderedDict()

    for raw in seed_categories:
        category = normalize_category(raw)
        if category:
            queue.append(category)

    processed = 0
    while queue and len(page_ids) < target_docs and len(visited_categories) < max_subcategories:
        category = queue.popleft()
        if category in visited_categories:
            continue
        visited_categories.add(category)
        processed += 1

        cmcontinue: Optional[str] = None
        while len(page_ids) < target_docs:
            params: Dict[str, Any] = {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": category,
                "cmtype": "page|subcat",
                "cmnamespace": "0|14",
                "cmlimit": 200,
            }
            if cmcontinue:
                params["cmcontinue"] = cmcontinue

            payload = api_get(params, timeout=timeout)
            members = payload.get("query", {}).get("categorymembers", [])
            if not isinstance(members, list):
                members = []

            for member in members:
                ns = int(member.get("ns", -1))
                if ns == 0:
                    page_id = member.get("pageid")
                    title = str(member.get("title", "")).strip()
                    if isinstance(page_id, int) and page_id > 0 and title:
                        if page_id not in page_ids:
                            page_ids[page_id] = title
                            if len(page_ids) >= target_docs:
                                break
                elif ns == 14 and len(visited_categories) + len(queue) < max_subcategories:
                    subcat = normalize_category(str(member.get("title", "")))
                    if subcat and subcat not in visited_categories:
                        queue.append(subcat)

            if len(page_ids) >= target_docs:
                break

            continuation = payload.get("continue", {})
            if not isinstance(continuation, dict) or "cmcontinue" not in continuation:
                break
            cmcontinue = str(continuation["cmcontinue"])
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

        if processed % 25 == 0:
            print(
                f"[crawl] categories={processed} visited={len(visited_categories)} "
                f"queued={len(queue)} page_ids={len(page_ids)}"
            )

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    print(
        f"[crawl] finished categories={processed} visited={len(visited_categories)} "
        f"queued={len(queue)} page_ids={len(page_ids)}"
    )
    return page_ids


def collect_random_page_ids(
    *,
    target_docs: int,
    existing_page_ids: "OrderedDict[int, str]",
    timeout: float,
    sleep_seconds: float,
) -> None:
    attempts = 0
    max_attempts = 2500

    while len(existing_page_ids) < target_docs and attempts < max_attempts:
        attempts += 1
        payload = api_get(
            {
                "action": "query",
                "list": "random",
                "rnnamespace": 0,
                "rnlimit": 50,
            },
            timeout=timeout,
        )
        entries = payload.get("query", {}).get("random", [])
        if not isinstance(entries, list):
            entries = []

        for entry in entries:
            page_id = entry.get("id")
            title = str(entry.get("title", "")).strip()
            if isinstance(page_id, int) and page_id > 0 and title:
                if page_id not in existing_page_ids:
                    existing_page_ids[page_id] = title
                    if len(existing_page_ids) >= target_docs:
                        break

        if attempts % 25 == 0:
            print(f"[random] attempts={attempts} page_ids={len(existing_page_ids)}")

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    print(f"[random] finished attempts={attempts} page_ids={len(existing_page_ids)}")


def chunked(values: List[int], size: int) -> Iterable[List[int]]:
    for idx in range(0, len(values), size):
        yield values[idx : idx + size]


def build_article_url(title: str) -> str:
    slug = title.replace(" ", "_")
    return f"https://en.wikipedia.org/wiki/{urllib.parse.quote(slug, safe=':_()%-')}"


def fetch_extract_for_page_id(
    *,
    page_id: int,
    max_extract_chars: int,
    timeout: float,
) -> Optional[str]:
    payload = api_get(
        {
            "action": "query",
            "pageids": str(page_id),
            "prop": "extracts",
            "explaintext": 1,
            "exchars": max_extract_chars,
        },
        timeout=timeout,
    )
    pages = payload.get("query", {}).get("pages", [])
    if not isinstance(pages, list) or not pages:
        return None
    page = pages[0]
    if not isinstance(page, dict) or "extract" not in page:
        return None
    text = normalize_whitespace(str(page.get("extract", "")).strip())
    return text or None


def fetch_page_records(
    *,
    page_ids: List[int],
    max_extract_chars: int,
    min_content_chars: int,
    fetch_batch_size: int,
    fallback_single_page: bool,
    max_fallback_requests: int,
    fallback_sleep_seconds: float,
    timeout: float,
    sleep_seconds: float,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    records: List[Dict[str, Any]] = []
    seen_urls = set()
    stats = {
        "requested_pages": len(page_ids),
        "written_records": 0,
        "skipped_disambiguation": 0,
        "skipped_short_or_empty": 0,
        "skipped_missing_url": 0,
        "skipped_redirect_like": 0,
        "skipped_duplicate_url": 0,
        "missing_extract_field": 0,
        "fallback_requests": 0,
        "fallback_success": 0,
        "fallback_failed": 0,
    }

    batch_size = max(1, int(fetch_batch_size))
    fallback_limit = max_fallback_requests if int(max_fallback_requests) >= 0 else None

    for batch_index, batch in enumerate(chunked(page_ids, batch_size), start=1):
        payload = api_get(
            {
                "action": "query",
                "pageids": "|".join(str(page_id) for page_id in batch),
                "prop": "extracts|info|pageprops",
                "inprop": "url",
                "explaintext": 1,
                "exchars": max_extract_chars,
                # Without exlimit, MediaWiki may only return extracts for one
                # page in a multi-page query.
                "exlimit": "max",
            },
            timeout=timeout,
        )

        pages = payload.get("query", {}).get("pages", [])
        if not isinstance(pages, list):
            pages = []

        for page in pages:
            page_id = page.get("pageid")
            if not isinstance(page_id, int) or page_id <= 0:
                continue

            pageprops = page.get("pageprops")
            if isinstance(pageprops, dict) and "disambiguation" in pageprops:
                stats["skipped_disambiguation"] += 1
                continue

            title = normalize_whitespace(str(page.get("title", "")).strip())
            full_url = normalize_whitespace(str(page.get("fullurl", "")).strip()) or build_article_url(title)
            if not full_url:
                stats["skipped_missing_url"] += 1
                continue

            content: Optional[str] = None
            if "extract" in page:
                content = normalize_whitespace(str(page.get("extract", "")).strip())
            else:
                stats["missing_extract_field"] += 1
                if fallback_single_page and (fallback_limit is None or stats["fallback_requests"] < fallback_limit):
                    stats["fallback_requests"] += 1
                    content = fetch_extract_for_page_id(
                        page_id=page_id,
                        max_extract_chars=max_extract_chars,
                        timeout=timeout,
                    )
                    if content:
                        stats["fallback_success"] += 1
                    else:
                        stats["fallback_failed"] += 1
                    if fallback_sleep_seconds > 0:
                        time.sleep(fallback_sleep_seconds)

            if not content or len(content) < min_content_chars:
                stats["skipped_short_or_empty"] += 1
                continue
            if content.lower().startswith("#redirect"):
                stats["skipped_redirect_like"] += 1
                continue

            if full_url in seen_urls:
                stats["skipped_duplicate_url"] += 1
                continue
            seen_urls.add(full_url)

            record = {
                "id": f"wiki_en_{page_id}",
                "title": title or f"Wikipedia article {page_id}",
                "url": full_url,
                "source": "Wikipedia",
                "language": "en",
                "published_at": as_iso_date(page.get("touched")),
                "content": content,
            }
            records.append(record)
            stats["written_records"] += 1

        if batch_index % 20 == 0:
            print(f"[fetch] batches={batch_index} records={len(records)}")

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    return records, stats


def write_jsonl(path: Path, records: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False))
            handle.write("\n")


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    if output_path.exists() and not args.overwrite:
        print(f"Output exists: {output_path}. Use --overwrite to replace.")
        return 1
    if args.target_docs <= 0:
        print("--target-docs must be > 0")
        return 1

    sleep_seconds = max(0.0, float(args.sleep_ms) / 1000.0)
    profile_categories = SEED_CATEGORY_PROFILES.get(args.seed_profile, [])
    seed_categories_raw = list(profile_categories) + list(args.seed_categories or [])
    seed_categories = [normalize_category(cat) for cat in seed_categories_raw]
    seed_categories = dedupe_preserve_order([cat for cat in seed_categories if cat])

    print(f"Target docs: {args.target_docs}")
    print(f"Seed profile: {args.seed_profile}")
    print(f"Seed categories: {len(seed_categories)}")
    print(f"Output: {output_path}")

    page_ids = collect_page_ids_from_categories(
        target_docs=args.target_docs,
        seed_categories=seed_categories,
        max_subcategories=max(1, args.max_subcategories),
        timeout=args.request_timeout,
        sleep_seconds=sleep_seconds,
    )

    if len(page_ids) < args.target_docs:
        print("[crawl] category crawl under target; filling with random EN pages.")
        collect_random_page_ids(
            target_docs=args.target_docs,
            existing_page_ids=page_ids,
            timeout=args.request_timeout,
            sleep_seconds=sleep_seconds,
        )

    selected_ids = list(page_ids.keys())[: args.target_docs]
    print(f"[fetch] requesting details for {len(selected_ids)} pages")
    records, stats = fetch_page_records(
        page_ids=selected_ids,
        max_extract_chars=max(400, args.max_extract_chars),
        min_content_chars=max(50, args.min_content_chars),
        fetch_batch_size=max(1, args.fetch_batch_size),
        fallback_single_page=bool(args.fallback_single_page),
        max_fallback_requests=int(args.max_fallback_requests),
        fallback_sleep_seconds=max(0.0, float(args.fallback_sleep_ms) / 1000.0),
        timeout=args.request_timeout,
        sleep_seconds=sleep_seconds,
    )

    records.sort(key=lambda item: item["id"])
    write_jsonl(output_path, records)

    print("Done.")
    print(json.dumps({"output": str(output_path), **stats}, indent=2))
    if not records:
        print("No records were written.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
