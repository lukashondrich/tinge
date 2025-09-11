from __future__ import annotations
import random
import numpy as np


def l1_dist(a: np.ndarray, b: np.ndarray) -> int:
    return int(np.abs(a - b).sum())


def farthest_point_subset(X: np.ndarray, k: int, seed: int = 0) -> np.ndarray:
    """Greedy max–min (Gonzalez) in L1; good coverage, fast, deterministic."""
    rng = random.Random(seed)
    n = X.shape[0]
    if k >= n:
        return X
    med = np.median(X, axis=0)
    start_idx = max(range(n), key=lambda i: l1_dist(X[i], med) + rng.random()*1e-6)
    selected = [start_idx]
    min_dists = np.array([l1_dist(X[i], X[start_idx]) for i in range(n)], dtype=np.int32)
    for _ in range(1, k):
        next_idx = int(np.argmax(min_dists))
        selected.append(next_idx)
        new_d = np.array([l1_dist(X[i], X[next_idx]) for i in range(n)], dtype=np.int32)
        min_dists = np.minimum(min_dists, new_d)
    return X[selected]


def pam_kmedoids(X: np.ndarray, k: int, seed: int = 0) -> np.ndarray:
    """Simple PAM k-medoids with L1 distance; returns the k medoid points.
    More representative of the *distribution* than max–min.
    """
    rng = np.random.default_rng(seed)
    n = X.shape[0]
    if k >= n:
        return X
    # init with k farthest points for a good start
    meds = farthest_point_subset(X, k, seed)
    # indices of medoids within X
    # Map medoid rows to indices
    def rows_to_idx(rows: np.ndarray) -> list[int]:
        # rely on exact matches because X is integer grid
        idxs = []
        for r in rows:
            matches = np.where((X == r).all(axis=1))[0]
            idxs.append(int(matches[0]))
        return idxs
    med_idx = rows_to_idx(meds)

    def d(i, j):
        return int(np.abs(X[i] - X[j]).sum())

    improved = True
    while improved:
        improved = False
        for mi in range(k):
            for j in range(n):
                if j in med_idx:
                    continue
                trial = med_idx.copy()
                trial[mi] = j
                # cost = sum distance to nearest medoid
                cost = 0
                for i in range(n):
                    cost += min(d(i, m) for m in trial)
                # baseline cost
                base = 0
                for i in range(n):
                    base += min(d(i, m) for m in med_idx)
                if cost < base:
                    med_idx = trial
                    improved = True
        # Loop until no improvement
    return X[med_idx]
