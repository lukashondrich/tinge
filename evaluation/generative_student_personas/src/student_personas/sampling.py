from __future__ import annotations

import numpy as np
from math import erf

from .dimensions import KEYS
from .correlations import build_corr


_vec_erf = np.vectorize(erf)


def _std_normal_cdf(x: np.ndarray) -> np.ndarray:
    """Compute the CDF of the standard normal distribution.

    Uses :func:`math.erf` via :func:`numpy.vectorize` to support array
    inputs without relying on deprecated ``numpy.erf``.

    Parameters
    ----------
    x : array_like
        Values at which to evaluate the CDF.

    Returns
    -------
    array_like
        The CDF evaluated at each value in ``x``.
    """
    return 0.5 * (1.0 + _vec_erf(x / np.sqrt(2.0)))


def sample_likert_pool(
    n_pool: int, seed: int = 0, corr_override: dict | None = None
) -> np.ndarray:
    """Draw a pool of correlated Likert-scale samples.

    Parameters
    ----------
    n_pool:
        Number of candidate samples to generate.
    seed:
        Seed for the random number generator.
    corr_override:
        Optional dictionary of pairwise correlation overrides passed to
        :func:`build_corr`.
    """

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


__all__ = ["_std_normal_cdf", "sample_likert_pool"]
