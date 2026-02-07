#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[embedding-service] Python: $PYTHON_BIN"
"$PYTHON_BIN" --version

if [ ! -d ".venv" ]; then
  echo "[embedding-service] Creating virtualenv at .venv"
  "$PYTHON_BIN" -m venv .venv
fi

echo "[embedding-service] Upgrading pip/setuptools/wheel"
.venv/bin/python -m pip install --upgrade pip setuptools wheel

echo "[embedding-service] Installing pinned dependencies"
.venv/bin/python -m pip install -r requirements.txt

echo "[embedding-service] Verifying imports"
.venv/bin/python - <<'PY'
import numpy
import scipy
import gensim
import sklearn
print("numpy:", numpy.__version__)
print("scipy:", scipy.__version__)
print("gensim:", gensim.__version__)
print("sklearn:", sklearn.__version__)
PY

echo "[embedding-service] Setup complete. Start the stack with: npm run dev"
