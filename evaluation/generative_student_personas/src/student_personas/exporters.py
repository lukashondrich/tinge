from __future__ import annotations
import json
from typing import List, Dict

try:
    import yaml  # type: ignore
except Exception:
    yaml = None


def export(personas: List[Dict], path: str) -> None:
    if path.endswith(".jsonl"):
        with open(path, "w", encoding="utf-8") as f:
            for p in personas:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")
    elif path.endswith(".json"):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(personas, f, ensure_ascii=False, indent=2)
    elif path.endswith((".yaml", ".yml")):
        if yaml is None:
            raise RuntimeError("pyyaml not installed; run: pip install pyyaml")
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(personas, f, sort_keys=False, allow_unicode=True)
    else:
        raise ValueError("Unsupported extension. Use .jsonl, .json, or .yaml")
