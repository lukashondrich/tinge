#!/usr/bin/env bash
set -euo pipefail

# Run from repo root after installing (pip install -e .)
student-personas --n 10 --seed 42 --out personas.jsonl --strategy maxmin
