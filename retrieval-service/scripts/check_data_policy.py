#!/usr/bin/env python3
"""Validate retrieval data files against repository size policy."""

from __future__ import annotations

import argparse
import fnmatch
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PolicyLimits:
    default_limit_bytes: int
    import_limit_bytes: int
    corpus_limit_bytes: int


@dataclass
class FileCheck:
    relative_path: str
    size_bytes: int
    limit_bytes: int
    allowlisted: bool
    reason: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check retrieval data asset size policy")
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parents[1] / "data"),
        help="Path to retrieval data directory (default: retrieval-service/data)",
    )
    parser.add_argument(
        "--allowlist",
        default=str(Path(__file__).resolve().parents[1] / "data" / "data_asset_allowlist.txt"),
        help="Path to allowlist file with glob patterns (one per line)",
    )
    parser.add_argument(
        "--max-file-mb",
        type=float,
        default=1.0,
        help="Default max file size in MB for data files",
    )
    parser.add_argument(
        "--max-import-file-mb",
        type=float,
        default=0.5,
        help="Max file size in MB for data/import files",
    )
    parser.add_argument(
        "--max-corpus-file-mb",
        type=float,
        default=15.0,
        help="Max file size in MB for data/corpus.jsonl",
    )
    return parser.parse_args()


def mb_to_bytes(value_mb: float) -> int:
    return int(value_mb * 1024 * 1024)


def load_allowlist(path: Path) -> list[str]:
    if not path.exists():
        return []

    patterns: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line)
    return patterns


def is_allowlisted(relative_path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(relative_path, pattern) for pattern in patterns)


def determine_limit(relative_path: str, limits: PolicyLimits) -> tuple[int, str]:
    if relative_path == "corpus.jsonl":
        return limits.corpus_limit_bytes, "corpus"
    if relative_path.startswith("import/"):
        return limits.import_limit_bytes, "import"
    return limits.default_limit_bytes, "default"


def collect_file_checks(data_dir: Path, limits: PolicyLimits, allowlist_patterns: list[str]) -> list[FileCheck]:
    checks: list[FileCheck] = []

    for path in sorted(data_dir.rglob("*")):
        if not path.is_file():
            continue

        relative_path = path.relative_to(data_dir).as_posix()
        if relative_path in {"import/.gitkeep"}:
            continue

        limit_bytes, reason = determine_limit(relative_path, limits)
        checks.append(
            FileCheck(
                relative_path=relative_path,
                size_bytes=path.stat().st_size,
                limit_bytes=limit_bytes,
                allowlisted=is_allowlisted(relative_path, allowlist_patterns),
                reason=reason,
            )
        )

    return checks


def format_bytes(value: int) -> str:
    return f"{value / (1024 * 1024):.2f}MB"


def validate_policy(checks: list[FileCheck]) -> list[FileCheck]:
    return [
        check
        for check in checks
        if check.size_bytes > check.limit_bytes and not check.allowlisted
    ]


def main() -> int:
    args = parse_args()

    data_dir = Path(args.data_dir).resolve()
    allowlist = Path(args.allowlist).resolve()

    if not data_dir.exists():
        print(f"Data directory does not exist: {data_dir}")
        return 1

    limits = PolicyLimits(
        default_limit_bytes=mb_to_bytes(args.max_file_mb),
        import_limit_bytes=mb_to_bytes(args.max_import_file_mb),
        corpus_limit_bytes=mb_to_bytes(args.max_corpus_file_mb),
    )

    allowlist_patterns = load_allowlist(allowlist)
    checks = collect_file_checks(data_dir, limits, allowlist_patterns)
    violations = validate_policy(checks)

    print("Retrieval data policy check")
    print(f"- data dir: {data_dir}")
    print(f"- allowlist: {allowlist}")
    print(f"- files checked: {len(checks)}")

    allowlisted_oversized = [
        check for check in checks if check.size_bytes > check.limit_bytes and check.allowlisted
    ]
    if allowlisted_oversized:
        print("- allowlisted oversized files:")
        for check in allowlisted_oversized:
            print(
                "  - "
                f"{check.relative_path}: {format_bytes(check.size_bytes)} "
                f"(limit {format_bytes(check.limit_bytes)}, reason={check.reason})"
            )

    if not violations:
        print("PASS: data asset policy is satisfied.")
        return 0

    print("FAIL: found oversized files not in allowlist:")
    for check in violations:
        print(
            "  - "
            f"{check.relative_path}: {format_bytes(check.size_bytes)} "
            f"(limit {format_bytes(check.limit_bytes)}, reason={check.reason})"
        )
    print(
        "Hint: move generated large files outside repository data/ "
        "or add intentional exceptions to data_asset_allowlist.txt"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
