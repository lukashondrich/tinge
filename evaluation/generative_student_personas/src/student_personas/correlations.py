from __future__ import annotations
from typing import Dict, Tuple, List
import numpy as np
from .dimensions import KEYS, IDX

PAIRWISE_R: Dict[Tuple[str, str], float] = {
    ("conscientiousness", "srl"): 0.45,
    ("self_efficacy", "expectancy_value"): 0.50,
    ("self_efficacy", "test_anxiety"): -0.45,
    ("prior_knowledge", "self_efficacy"): 0.30,
    ("prior_knowledge", "language_reading"): 0.20,
    ("load_tolerance", "prior_knowledge"): 0.20,
    ("affective_resilience", "test_anxiety"): -0.25,
    ("affective_resilience", "self_efficacy"): 0.20,
    ("time_on_task", "expectancy_value"): 0.30,
    ("time_on_task", "conscientiousness"): 0.25,
    ("srl", "self_efficacy"): 0.30,
}


def load_pairwise_from_yaml(path: str | None) -> Dict[Tuple[str, str], float]:
    if not path:
        return PAIRWISE_R
    import yaml
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    out: Dict[Tuple[str, str], float] = {}
    for k, v in raw.items():
        a, b = [s.strip() for s in k.split(",", 1)]
        out[(a, b)] = float(v)
    return out


def build_corr(keys: List[str] = KEYS, overrides: Dict[Tuple[str, str], float] | None = None) -> np.ndarray:
    pairs = dict(PAIRWISE_R)
    if overrides:
        pairs.update(overrides)
    k = len(keys)
    R = np.eye(k)
    for (a, b), r in pairs.items():
        i, j = IDX[a], IDX[b]
        R[i, j] = r
        R[j, i] = r
    # Nearest PSD via eigenvalue flooring
    eigvals, eigvecs = np.linalg.eigh(R)
    eigvals[eigvals < 1e-6] = 1e-6
    R_psd = (eigvecs @ np.diag(eigvals) @ eigvecs.T)
    d = np.sqrt(np.diag(R_psd))
    R_psd = (R_psd / d).T / d
    return R_psd
