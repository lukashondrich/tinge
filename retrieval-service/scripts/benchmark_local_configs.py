#!/usr/bin/env python3
"""
Run local retrieval benchmarks across preset configs and print a compact table.

This script starts a temporary local uvicorn process per config, reindexes corpus,
runs eval_retrieval, and compares quality/latency metrics.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List
from urllib import error, request


ROOT_DIR = Path(__file__).resolve().parents[2]
RETRIEVAL_DIR = ROOT_DIR / "retrieval-service"
EVAL_SCRIPT = RETRIEVAL_DIR / "scripts" / "eval_retrieval.py"


PRESET_CONFIGS: Dict[str, Dict[str, str]] = {
    "bm25": {
        "RETRIEVAL_DENSE_ENABLED": "false",
        "RETRIEVAL_WRITE_EMBEDDINGS": "false",
        "RETRIEVAL_DENSE_TOP_K": "0",
    },
    "hybrid_k5": {
        "RETRIEVAL_DENSE_ENABLED": "true",
        "RETRIEVAL_WRITE_EMBEDDINGS": "true",
        "RETRIEVAL_DENSE_TOP_K": "5",
    },
    "hybrid_k8": {
        "RETRIEVAL_DENSE_ENABLED": "true",
        "RETRIEVAL_WRITE_EMBEDDINGS": "true",
        "RETRIEVAL_DENSE_TOP_K": "8",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark local retrieval configs.")
    parser.add_argument(
        "--python-bin",
        default=str(RETRIEVAL_DIR / ".venv" / "bin" / "python"),
        help="Python binary used to run uvicorn and eval script.",
    )
    parser.add_argument(
        "--base-port",
        type=int,
        default=3014,
        help="Port used by temporary uvicorn process (default: 3014).",
    )
    parser.add_argument(
        "--corpus-path",
        default=str(RETRIEVAL_DIR / "data" / "corpus.jsonl"),
        help="Corpus path for indexing.",
    )
    parser.add_argument(
        "--queries",
        default=str(RETRIEVAL_DIR / "data" / "eval_broad_wiki.json"),
        help="Eval query file path.",
    )
    parser.add_argument(
        "--min-pass-rate",
        type=float,
        default=0.0,
        help="Eval gate during benchmark (default 0.0 so all variants complete).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=90,
        help="Startup timeout per config.",
    )
    parser.add_argument(
        "--configs",
        default="bm25,hybrid_k5,hybrid_k8",
        help="Comma-separated preset configs.",
    )
    parser.add_argument(
        "--embed-model",
        default="sentence-transformers/all-MiniLM-L6-v2",
        help="Embedding model for dense configs.",
    )
    return parser.parse_args()


def wait_for_health(base_url: str, timeout_seconds: int) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with request.urlopen(f"{base_url}/health", timeout=2.0) as resp:
                if int(resp.status) == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def post_json(url: str, payload: Dict[str, Any], timeout: float = 30.0) -> Dict[str, Any]:
    req = request.Request(
        url=url,
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


def run_eval(
    python_bin: str,
    base_url: str,
    queries_path: str,
    min_pass_rate: float,
) -> Dict[str, Any]:
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".json", delete=False) as tmp:
        report_path = tmp.name
    try:
        cmd = [
            python_bin,
            str(EVAL_SCRIPT),
            "--base-url",
            base_url,
            "--queries",
            queries_path,
            "--ignore-doc-id-checks",
            "--min-pass-rate",
            str(min_pass_rate),
            "--output-json",
            report_path,
        ]
        subprocess.run(cmd, check=True, cwd=str(ROOT_DIR))
        with open(report_path, "r", encoding="utf-8") as handle:
            report = json.load(handle)
        return report
    finally:
        try:
            os.remove(report_path)
        except OSError:
            pass


def format_pct(value: float) -> str:
    return f"{value * 100.0:.1f}%"


def print_table(rows: List[Dict[str, Any]]) -> None:
    print("")
    print("Benchmark Results")
    print("-" * 94)
    print(
        f"{'config':<12} {'pass':<8} {'avg_ms':<10} {'p95_ms':<10} {'max_ms':<10} "
        f"{'hit@5':<8} {'mrr':<8} {'status':<8}"
    )
    print("-" * 94)
    for row in rows:
        print(
            f"{row['config']:<12} {row['pass_rate']:<8} {row['lat_avg']:<10} "
            f"{row['lat_p95']:<10} {row['lat_max']:<10} {row['hit_at_5']:<8} "
            f"{row['mrr']:<8} {row['status']:<8}"
        )
    print("-" * 94)


def main() -> int:
    args = parse_args()
    python_bin = Path(args.python_bin)
    if not python_bin.is_absolute():
        python_bin = (ROOT_DIR / python_bin).resolve()
    if not python_bin.exists():
        print(f"Python binary not found: {python_bin}")
        return 1

    selected = [c.strip() for c in args.configs.split(",") if c.strip()]
    invalid = [name for name in selected if name not in PRESET_CONFIGS]
    if invalid:
        print(f"Unknown config(s): {', '.join(invalid)}")
        print(f"Available: {', '.join(PRESET_CONFIGS.keys())}")
        return 1

    base_url = f"http://localhost:{args.base_port}"
    rows: List[Dict[str, Any]] = []

    for config_name in selected:
        cfg = PRESET_CONFIGS[config_name]
        print(f"\n[run] config={config_name}")
        env = os.environ.copy()
        env.update(
            {
                "ELASTICSEARCH_URL": "http://localhost:9200",
                "DEFAULT_CORPUS_PATH": str(args.corpus_path),
                "RETRIEVAL_QUERY_JOIN_MODE": "reciprocal_rank_fusion",
                "RETRIEVAL_LOG_TIMING": "false",
                "RETRIEVAL_EMBED_MODEL": args.embed_model,
                **cfg,
            }
        )

        log_file = tempfile.NamedTemporaryFile(mode="w+", suffix=".log", delete=False)
        log_path = Path(log_file.name)
        log_file.close()
        proc = None
        try:
            proc = subprocess.Popen(
                [
                    str(python_bin),
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    str(args.base_port),
                ],
                cwd=str(RETRIEVAL_DIR),
                env=env,
                stdout=open(log_path, "w", encoding="utf-8"),
                stderr=subprocess.STDOUT,
            )
            if not wait_for_health(base_url, args.timeout_seconds):
                print(f"[fail] startup timeout for config={config_name}")
                if proc.poll() is None:
                    proc.terminate()
                try:
                    tail = log_path.read_text(encoding="utf-8")[-2000:]
                except OSError:
                    tail = "(unable to read log)"
                print(tail)
                return 1

            post_json(
                f"{base_url}/index",
                {
                    "recreate_index": True,
                    "path": str(args.corpus_path),
                },
                timeout=120.0,
            )
            report = run_eval(
                python_bin=str(python_bin),
                base_url=base_url,
                queries_path=args.queries,
                min_pass_rate=args.min_pass_rate,
            )
            summary = report.get("summary", {})
            rows.append(
                {
                    "config": config_name,
                    "pass_rate": format_pct(float(summary.get("pass_rate", 0.0))),
                    "lat_avg": f"{float(summary.get('latency_ms_avg', 0.0)):.1f}",
                    "lat_p95": f"{float(summary.get('latency_ms_p95', 0.0)):.1f}",
                    "lat_max": f"{float(summary.get('latency_ms_max', 0.0)):.1f}",
                    "hit_at_5": format_pct(float(summary.get("hit_at_5", 0.0))),
                    "mrr": f"{float(summary.get('mrr', 0.0)):.3f}",
                    "status": "ok",
                }
            )
        except subprocess.CalledProcessError as err:
            rows.append(
                {
                    "config": config_name,
                    "pass_rate": "-",
                    "lat_avg": "-",
                    "lat_p95": "-",
                    "lat_max": "-",
                    "hit_at_5": "-",
                    "mrr": "-",
                    "status": f"fail({err.returncode})",
                }
            )
        finally:
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
            try:
                log_path.unlink(missing_ok=True)
            except OSError:
                pass

    print_table(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
