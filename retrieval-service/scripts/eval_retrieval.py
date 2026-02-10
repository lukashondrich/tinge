#!/usr/bin/env python3
"""
Evaluate retrieval quality against a labeled query set.

The eval file is a JSON array with entries like:
{
  "id": "barcelona_architecture_en",
  "query_original": "Tell me about architecture in Barcelona",
  "query_en": "optional helper english query",
  "language": "en",
  "top_k": 5,
  "min_results": 1,
  "max_latency_ms": 1200,
  "expected_doc_ids_any": ["barcelona_gaudi_en", "barcelona_sagrada_en"],
  "expected_doc_ids_all": [],
  "expected_sources_any": ["Wikipedia"],
  "expected_url_contains_any": ["antoni_gaud", "sagrada_fam"],
  "expected_terms_any": ["gaudi", "sagrada", "modernisme"]
}
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib import error, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate retrieval quality against labeled queries.")
    parser.add_argument(
        "--base-url",
        default="http://localhost:3004",
        help="Retrieval service base URL (default: http://localhost:3004)",
    )
    parser.add_argument(
        "--queries",
        default="data/eval_queries.json",
        help="Path to eval query JSON file (default: data/eval_queries.json)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=8.0,
        help="HTTP timeout in seconds (default: 8.0)",
    )
    parser.add_argument(
        "--output-json",
        default="",
        help="Optional path to write full eval report JSON.",
    )
    parser.add_argument(
        "--history-jsonl",
        default="",
        help="Optional path to append eval summary history as JSONL.",
    )
    parser.add_argument(
        "--corpus-path",
        default="",
        help="Optional corpus path for history context (doc count + language distribution).",
    )
    parser.add_argument(
        "--label",
        default="",
        help="Optional run label stored in history entries (e.g. 'batch_03').",
    )
    parser.add_argument(
        "--min-pass-rate",
        type=float,
        default=1.0,
        help="Minimum passing-case ratio required for success, from 0.0 to 1.0 (default: 1.0).",
    )
    parser.add_argument(
        "--max-failures",
        type=int,
        default=-1,
        help="Optional absolute failure cap. Set >=0 to enforce; -1 disables (default: -1).",
    )
    parser.add_argument(
        "--ignore-doc-id-checks",
        action="store_true",
        help="Skip expected_doc_ids_any/all checks (useful when corpus IDs are regenerated).",
    )
    return parser.parse_args()


def post_json(url: str, payload: Dict[str, Any], timeout: float) -> Tuple[int, Dict[str, Any], float]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
    )

    started = time.perf_counter()
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            status = int(resp.status)
            data = json.loads(resp.read().decode("utf-8"))
            latency_ms = (time.perf_counter() - started) * 1000.0
            return status, data, latency_ms
    except error.HTTPError as err:
        payload = err.read().decode("utf-8", errors="replace")
        latency_ms = (time.perf_counter() - started) * 1000.0
        return int(err.code), {"error": payload}, latency_ms
    except error.URLError as err:
        latency_ms = (time.perf_counter() - started) * 1000.0
        return 0, {"error": str(err)}, latency_ms


def as_lower_set(values: Sequence[Any]) -> set[str]:
    return {str(v).strip().lower() for v in values if str(v).strip()}


def as_lower_list(values: Sequence[Any]) -> List[str]:
    return [str(v).strip().lower() for v in values if str(v).strip()]


def percentile(values: Sequence[float], pct: float) -> float:
    if not values:
        return 0.0
    if pct <= 0:
        return float(min(values))
    if pct >= 100:
        return float(max(values))
    ordered = sorted(values)
    rank = (pct / 100.0) * (len(ordered) - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return float(ordered[lo])
    weight = rank - lo
    return float(ordered[lo] * (1.0 - weight) + ordered[hi] * weight)


def has_any_substring(haystack_values: Sequence[str], needles: Sequence[str]) -> bool:
    haystack = [v.lower() for v in haystack_values]
    for needle in needles:
        n = needle.lower()
        if any(n in value for value in haystack):
            return True
    return False


def to_text_blob(results: List[Dict[str, Any]]) -> str:
    pieces: List[str] = []
    for result in results:
        pieces.append(str(result.get("doc_id", "")))
        pieces.append(str(result.get("title", "")))
        pieces.append(str(result.get("snippet", "")))
        pieces.append(str(result.get("source", "")))
        pieces.append(str(result.get("url", "")))
    return " ".join(pieces).lower()


def first_relevant_rank(doc_ids: Sequence[str], relevant_ids: set[str]) -> Optional[int]:
    if not relevant_ids:
        return None
    for idx, doc_id in enumerate(doc_ids, start=1):
        if doc_id.lower() in relevant_ids:
            return idx
    return None


@dataclass
class CaseResult:
    case_id: str
    ok: bool
    http_status: int
    latency_ms: float
    result_count: int
    first_relevant_rank: Optional[int]
    checks: Dict[str, bool]
    errors: List[str]
    payload: Dict[str, Any]


def evaluate_case(
    base_url: str,
    timeout: float,
    case: Dict[str, Any],
    *,
    ignore_doc_id_checks: bool = False,
) -> CaseResult:
    case_id = str(case.get("id", "unknown"))
    payload = {
        "query_original": str(case.get("query_original", "")).strip(),
        "top_k": int(case.get("top_k", 5)),
    }
    if case.get("query_en"):
        payload["query_en"] = str(case["query_en"])
    if case.get("language"):
        payload["language"] = str(case["language"])

    if not payload["query_original"]:
        return CaseResult(
            case_id=case_id,
            ok=False,
            http_status=0,
            latency_ms=0.0,
            result_count=0,
            first_relevant_rank=None,
            checks={"query_present": False},
            errors=["query_original is required"],
            payload=payload,
        )

    status, data, latency_ms = post_json(f"{base_url.rstrip('/')}/search", payload, timeout)
    if status != 200:
        return CaseResult(
            case_id=case_id,
            ok=False,
            http_status=status,
            latency_ms=latency_ms,
            result_count=0,
            first_relevant_rank=None,
            checks={"http_200": False},
            errors=[f"HTTP {status}: {data.get('error', 'unknown error')}"],
            payload=payload,
        )

    results = data.get("results", [])
    if not isinstance(results, list):
        results = []

    doc_ids = [str(r.get("doc_id", "")).strip() for r in results]
    sources = [str(r.get("source", "")).strip() for r in results]
    urls = [str(r.get("url", "")).strip() for r in results]
    text_blob = to_text_blob(results)

    expected_doc_any = as_lower_set(case.get("expected_doc_ids_any", []))
    expected_doc_all = as_lower_set(case.get("expected_doc_ids_all", []))
    if ignore_doc_id_checks:
        expected_doc_any = set()
        expected_doc_all = set()
    expected_sources_any = as_lower_set(case.get("expected_sources_any", []))
    expected_url_contains_any = as_lower_list(case.get("expected_url_contains_any", []))
    expected_terms_any = as_lower_list(case.get("expected_terms_any", []))

    min_results = int(case.get("min_results", 1))
    requested_language = str(case.get("language", "")).strip().lower()
    max_latency_ms = case.get("max_latency_ms")
    max_latency = float(max_latency_ms) if max_latency_ms is not None else None

    checks: Dict[str, bool] = {
        "http_200": True,
        "min_results": len(results) >= min_results,
    }

    if requested_language:
        checks["top1_language_match"] = bool(results) and str(results[0].get("language", "")).strip().lower() == requested_language

    if expected_doc_any:
        checks["expected_doc_ids_any"] = any(doc_id.lower() in expected_doc_any for doc_id in doc_ids)

    if expected_doc_all:
        returned = {d.lower() for d in doc_ids}
        checks["expected_doc_ids_all"] = expected_doc_all.issubset(returned)

    if expected_sources_any:
        checks["expected_sources_any"] = any(source.lower() in expected_sources_any for source in sources)

    if expected_url_contains_any:
        checks["expected_url_contains_any"] = has_any_substring(urls, expected_url_contains_any)

    if expected_terms_any:
        checks["expected_terms_any"] = any(term in text_blob for term in expected_terms_any)

    if max_latency is not None:
        checks["max_latency_ms"] = latency_ms <= max_latency

    relevant_for_rank = set(expected_doc_any) | set(expected_doc_all)
    rank = first_relevant_rank(doc_ids, relevant_for_rank)

    errors = [name for name, ok in checks.items() if not ok]
    return CaseResult(
        case_id=case_id,
        ok=len(errors) == 0,
        http_status=status,
        latency_ms=latency_ms,
        result_count=len(results),
        first_relevant_rank=rank,
        checks=checks,
        errors=errors,
        payload=payload,
    )


def summarize(case_results: List[CaseResult]) -> Dict[str, Any]:
    total = len(case_results)
    passed = sum(1 for result in case_results if result.ok)
    failed = total - passed

    latencies = [result.latency_ms for result in case_results if result.http_status == 200]
    result_counts = [result.result_count for result in case_results if result.http_status == 200]

    relevance_cases = [
        result for result in case_results
        if "expected_doc_ids_any" in result.checks or "expected_doc_ids_all" in result.checks
    ]
    relevant_den = len(relevance_cases)

    hits_at_1 = 0
    hits_at_3 = 0
    hits_at_5 = 0
    reciprocal_ranks: List[float] = []
    for result in relevance_cases:
        rank = result.first_relevant_rank
        if rank is not None and rank <= 1:
            hits_at_1 += 1
        if rank is not None and rank <= 3:
            hits_at_3 += 1
        if rank is not None and rank <= 5:
            hits_at_5 += 1
        reciprocal_ranks.append(0.0 if rank is None else 1.0 / float(rank))

    top1_language_cases = [r for r in case_results if "top1_language_match" in r.checks]
    top1_language_den = len(top1_language_cases)
    top1_language_match = sum(1 for r in top1_language_cases if r.checks["top1_language_match"])

    source_cases = [r for r in case_results if "expected_sources_any" in r.checks]
    source_den = len(source_cases)
    source_match = sum(1 for r in source_cases if r.checks["expected_sources_any"])

    summary = {
        "total_cases": total,
        "passed_cases": passed,
        "failed_cases": failed,
        "pass_rate": (passed / total) if total else 0.0,
        "http_success_rate": (
            sum(1 for r in case_results if r.http_status == 200) / total if total else 0.0
        ),
        "latency_ms_avg": statistics.fmean(latencies) if latencies else 0.0,
        "latency_ms_p95": percentile(latencies, 95.0),
        "latency_ms_max": max(latencies) if latencies else 0.0,
        "avg_result_count": statistics.fmean(result_counts) if result_counts else 0.0,
        "relevance_denominator": relevant_den,
        "hit_at_1": (hits_at_1 / relevant_den) if relevant_den else 0.0,
        "hit_at_3": (hits_at_3 / relevant_den) if relevant_den else 0.0,
        "hit_at_5": (hits_at_5 / relevant_den) if relevant_den else 0.0,
        "mrr": (statistics.fmean(reciprocal_ranks) if reciprocal_ranks else 0.0),
        "top1_language_match_rate": (top1_language_match / top1_language_den) if top1_language_den else 0.0,
        "source_coverage_rate": (source_match / source_den) if source_den else 0.0,
    }
    return summary


def print_case_line(result: CaseResult) -> None:
    status = "PASS" if result.ok else "FAIL"
    rank_text = "-" if result.first_relevant_rank is None else str(result.first_relevant_rank)
    errors = "" if result.ok else f" checks_failed={','.join(result.errors)}"
    print(
        f"[{status}] {result.case_id} "
        f"http={result.http_status} "
        f"latency={result.latency_ms:.0f}ms "
        f"results={result.result_count} "
        f"first_rel_rank={rank_text}{errors}"
    )


def print_summary(summary: Dict[str, Any]) -> None:
    print("-" * 90)
    print(
        "Summary: "
        f"pass={summary['passed_cases']}/{summary['total_cases']} "
        f"({summary['pass_rate'] * 100.0:.1f}%) | "
        f"http_ok={summary['http_success_rate'] * 100.0:.1f}%"
    )
    print(
        "Latency: "
        f"avg={summary['latency_ms_avg']:.1f}ms "
        f"p95={summary['latency_ms_p95']:.1f}ms "
        f"max={summary['latency_ms_max']:.1f}ms"
    )
    print(f"Result count: avg={summary['avg_result_count']:.2f}")

    rel_den = int(summary["relevance_denominator"])
    if rel_den > 0:
        print(
            "Ranking: "
            f"hit@1={summary['hit_at_1'] * 100.0:.1f}% "
            f"hit@3={summary['hit_at_3'] * 100.0:.1f}% "
            f"hit@5={summary['hit_at_5'] * 100.0:.1f}% "
            f"mrr={summary['mrr']:.3f} "
            f"(n={rel_den})"
        )
    print(f"Top1 language match rate: {summary['top1_language_match_rate'] * 100.0:.1f}%")
    print(f"Source coverage rate: {summary['source_coverage_rate'] * 100.0:.1f}%")


def load_corpus_context(corpus_path: str) -> Dict[str, Any]:
    if not corpus_path:
        return {}
    path = Path(corpus_path)
    if not path.exists():
        return {"corpus_path": str(path), "corpus_error": "not_found"}

    total_docs = 0
    language_counts: Dict[str, int] = {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                total_docs += 1
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                lang = str(obj.get("language", "")).strip().lower() or "unknown"
                language_counts[lang] = language_counts.get(lang, 0) + 1
    except OSError:
        return {"corpus_path": str(path), "corpus_error": "unreadable"}

    return {
        "corpus_path": str(path),
        "corpus_total_docs": total_docs,
        "corpus_language_counts": language_counts,
    }


def append_history_entry(
    history_path: str,
    *,
    base_url: str,
    queries_path: str,
    label: str,
    summary: Dict[str, Any],
    corpus_context: Dict[str, Any],
) -> None:
    if not history_path:
        return

    path = Path(history_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "label": label or None,
        "base_url": base_url,
        "queries_path": queries_path,
        "summary": summary,
        **corpus_context,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry))
        handle.write("\n")
    print(f"Appended eval history: {path}")


def main() -> int:
    args = parse_args()
    if args.min_pass_rate < 0.0 or args.min_pass_rate > 1.0:
        print("--min-pass-rate must be between 0.0 and 1.0")
        return 1
    if args.max_failures < -1:
        print("--max-failures must be -1 (disabled) or a non-negative integer")
        return 1

    queries_path = Path(args.queries)
    if not queries_path.exists():
        print(f"Eval query file not found: {queries_path}")
        return 1

    queries_raw = json.loads(queries_path.read_text(encoding="utf-8"))
    if not isinstance(queries_raw, list) or not queries_raw:
        print("Eval query file must be a non-empty JSON array.")
        return 1

    queries: List[Dict[str, Any]] = []
    for idx, entry in enumerate(queries_raw, start=1):
        if not isinstance(entry, dict):
            print(f"Eval case at index {idx} must be an object.")
            return 1
        queries.append(entry)

    print(f"Eval target: {args.base_url}")
    print(f"Loaded eval cases: {len(queries)}")
    print("-" * 90)

    case_results: List[CaseResult] = []
    for idx, case in enumerate(queries, start=1):
        if "id" not in case:
            case["id"] = f"case_{idx}"
        result = evaluate_case(
            args.base_url,
            args.timeout,
            case,
            ignore_doc_id_checks=args.ignore_doc_id_checks,
        )
        case_results.append(result)
        print_case_line(result)

    summary = summarize(case_results)
    print_summary(summary)
    corpus_context = load_corpus_context(args.corpus_path)

    if args.output_json:
        report_path = Path(args.output_json)
        report = {
            "base_url": args.base_url,
            "queries_path": str(queries_path),
            "summary": summary,
            "cases": [
                {
                    "id": result.case_id,
                    "ok": result.ok,
                    "http_status": result.http_status,
                    "latency_ms": round(result.latency_ms, 3),
                    "result_count": result.result_count,
                    "first_relevant_rank": result.first_relevant_rank,
                    "checks": result.checks,
                    "errors": result.errors,
                    "payload": result.payload,
                }
                for result in case_results
            ],
        }
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Wrote eval report: {report_path}")

    append_history_entry(
        args.history_jsonl,
        base_url=args.base_url,
        queries_path=str(queries_path),
        label=args.label,
        summary=summary,
        corpus_context=corpus_context,
    )

    gate_failures: List[str] = []
    if summary["pass_rate"] < args.min_pass_rate:
        gate_failures.append(
            f"pass_rate {summary['pass_rate'] * 100.0:.1f}% < required {args.min_pass_rate * 100.0:.1f}%"
        )
    if args.max_failures >= 0 and int(summary["failed_cases"]) > args.max_failures:
        gate_failures.append(
            f"failed_cases {int(summary['failed_cases'])} > max_failures {args.max_failures}"
        )

    if gate_failures:
        print("Gate: FAIL")
        for failure in gate_failures:
            print(f" - {failure}")
        return 1

    print("Gate: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
