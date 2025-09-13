"""Utility functions for YAML IO and helpers."""

from __future__ import annotations

import copy
import yaml
from typing import Any, Dict, List


def read_yaml(path: str) -> Dict[str, Any]:
    """Read a YAML file and return its contents."""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def write_yaml(path: str, data: Dict[str, Any]) -> None:
    """Write a dictionary to a YAML file."""
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)


def deep_copy(obj: Any) -> Any:
    """Return a deep copy of any Python object."""
    return copy.deepcopy(obj)


def load_rubric(path: str) -> Dict[str, Any]:
    """Load a rubric YAML file."""
    return read_yaml(path)


def sorted_turn_keys(turns: Dict[str, Any]) -> List[str]:
    """Return conversation turn keys sorted numerically when possible."""
    def turn_key(k: str) -> Any:
        try:
            return int(k)
        except (ValueError, TypeError):
            return k

    return sorted(turns.keys(), key=turn_key)
