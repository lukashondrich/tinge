#!/usr/bin/env python3
"""
Run retrieval smoke tests against /search endpoint.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib import error, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run retrieval smoke queries.")
    parser.add_argument(
        "--base-url",
        default="http://localhost:3004",
        help="Retrieval service base URL (default: http://localhost:3004)",
    )
    parser.add_argument(
        "--queries",
        default="data/smoke_queries.json",
        help="Path to smoke query JSON file (default: data/smoke_queries.json)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=8.0,
        help="HTTP timeout in seconds (default: 8.0)",
    )
    return parser.parse_args()


def post_json(url: str, payload: Dict[str, Any], timeout: float) -> Tuple[int, Dict[str, Any]]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            status = int(resp.status)
            data = json.loads(resp.read().decode("utf-8"))
            return status, data
    except error.HTTPError as err:
        payload = err.read().decode("utf-8", errors="replace")
        return int(err.code), {"error": payload}
    except error.URLError as err:
        return 0, {"error": str(err)}


def normalize_text(results: List[Dict[str, Any]]) -> str:
    parts = []
    for r in results:
        parts.append(str(r.get("title", "")))
        parts.append(str(r.get("snippet", "")))
        parts.append(str(r.get("source", "")))
    return " ".join(parts).lower()


def run_case(base_url: str, timeout: float, case: Dict[str, Any]) -> Tuple[bool, str]:
    payload = {
        "query_original": case["query_original"],
        "top_k": int(case.get("top_k", 5)),
    }
    if case.get("query_en"):
        payload["query_en"] = case["query_en"]
    if case.get("language"):
        payload["language"] = case["language"]

    status, data = post_json(f"{base_url.rstrip('/')}/search", payload, timeout)
    if status != 200:
        return False, f"HTTP {status}: {data.get('error', 'unknown error')}"

    results = data.get("results", [])
    min_results = int(case.get("min_results", 1))
    if len(results) < min_results:
        return False, f"results={len(results)} < min_results={min_results}"

    expected_language = case.get("language")
    if expected_language:
        same_lang = [r for r in results if str(r.get("language", "")).lower() == expected_language.lower()]
        if len(same_lang) == 0:
            return False, f"no results in expected language '{expected_language}'"

    must_terms = [str(t).lower() for t in case.get("must_contain_any", [])]
    if must_terms:
        full_text = normalize_text(results)
        if not any(term in full_text for term in must_terms):
            return False, f"none of must_contain_any terms found: {must_terms}"

    top = results[0] if results else {}
    top_label = f"{top.get('title', 'n/a')} ({top.get('source', 'n/a')})"
    return True, f"results={len(results)} top={top_label}"


def main() -> int:
    args = parse_args()
    queries_path = Path(args.queries)
    if not queries_path.exists():
        print(f"Queries file not found: {queries_path}")
        return 1

    queries = json.loads(queries_path.read_text(encoding="utf-8"))
    if not isinstance(queries, list) or not queries:
        print("Queries file must be a non-empty JSON array.")
        return 1

    failures = 0
    print(f"Smoke test target: {args.base_url}")
    print(f"Loaded cases: {len(queries)}")
    print("-" * 80)

    for idx, case in enumerate(queries, start=1):
        case_id = case.get("id", f"case_{idx}")
        ok, detail = run_case(args.base_url, args.timeout, case)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {case_id}: {detail}")
        if not ok:
            failures += 1

    print("-" * 80)
    print(f"Summary: {len(queries) - failures} passed, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

