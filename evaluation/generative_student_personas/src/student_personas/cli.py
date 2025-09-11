from __future__ import annotations
import argparse
import json
from typing import Dict, List
import numpy as np

from .dimensions import KEYS
from .sampling import sample_likert_pool
from .selection import farthest_point_subset, pam_kmedoids
from .behavior import traits_to_behavior
from .prompts import build_prompt
from .exporters import export
from .persona import Persona
from .correlations import load_pairwise_from_yaml


def _row_to_traits(row: np.ndarray) -> Dict[str, int]:
    return {k: int(row[i]) for i, k in enumerate(KEYS)}


def _coverage_stats(rows: List[np.ndarray]) -> Dict[str, float]:
    if len(rows) < 2:
        return {"avg_pairwise_L1": 0.0, "min_pairwise_L1": 0.0}
    dists = []
    for i in range(len(rows)):
        for j in range(i+1, len(rows)):
            dists.append(int(np.abs(rows[i]-rows[j]).sum()))
    return {"avg_pairwise_L1": float(np.mean(dists)), "min_pairwise_L1": float(np.min(dists))}


def main(argv: List[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Generate LLM-ready student personas")
    ap.add_argument("--n", type=int, default=10, help="Number of personas")
    ap.add_argument("--pool", type=int, default=5000, help="Candidate pool size before selection")
    ap.add_argument("--seed", type=int, default=42, help="Random seed")
    ap.add_argument("--out", type=str, default="personas.jsonl", help="Output path (.jsonl/.json/.yaml)")
    ap.add_argument("--strategy", choices=["maxmin", "kmedoids"], default="maxmin", help="Selection strategy")
    ap.add_argument("--corr-config", type=str, default=None, help="Optional YAML file with pairwise correlations")
    args = ap.parse_args(argv)

    corr = load_pairwise_from_yaml(args.corr_config)
    pool = sample_likert_pool(args.pool, seed=args.seed, corr_override=corr)

    if args.strategy == "maxmin":
        selected = farthest_point_subset(pool, k=args.n, seed=args.seed)
    else:
        selected = pam_kmedoids(pool, k=args.n, seed=args.seed)

    personas: List[dict] = []
    for i, row in enumerate(selected, 1):
        traits = _row_to_traits(row)
        behaviors = traits_to_behavior(traits)
        prompt = build_prompt(traits, behaviors)
        p = Persona(id=f"persona_{i:02d}", traits=traits, behaviors=behaviors, prompt=prompt)
        personas.append({"id": p.id, "traits": p.traits, "behaviors": p.behaviors, "prompt": p.prompt})

    stats = _coverage_stats([selected[i] for i in range(selected.shape[0])])
    print(json.dumps({"coverage": stats, "n": len(personas), "strategy": args.strategy}, indent=2))

    export(personas, args.out)
    print(f"Saved {len(personas)} personas to {args.out}")

if __name__ == "__main__":
    main()
