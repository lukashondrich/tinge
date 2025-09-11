from __future__ import annotations
import math
import numpy as np
from .dimensions import KEYS
from .correlations import build_corr


def _std_normal_cdf(x: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + np.erf(x / math.sqrt(2)))


def sample_likert_pool(n_pool: int, seed: int = 0, corr_override: dict | None = None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    R = build_corr(KEYS, corr_override)
    try:
        L = np.linalg.cholesky(R)
    except np.linalg.LinAlgError:
        w, V = np.linalg.eigh(R)
        w[w < 1e-9] = 1e-9
        L = V @ np.diag(np.sqrt(w))
    z = rng.standard_normal(size=(n_pool, len(KEYS))) @ L.T
    u = _std_normal_cdf(z)
    bins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    likert = np.digitize(u, bins, right=True)
    likert = np.clip(likert, 1, 5).astype(np.int8)
    uniq = np.unique(likert, axis=0)
    return uniq
