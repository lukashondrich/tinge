from __future__ import annotations
from typing import Dict, Tuple, List, Any
import math
import numpy as np

def _norm01(v: int) -> float:
    return (float(v) - 1.0) / 4.0

BEHAVIOR_WEIGHTS = {
    "hint_preference": [("srl", +0.30), ("self_efficacy", -0.15), ("load_tolerance", -0.20), ("affective_resilience", -0.10), ("test_anxiety", +0.25)],
    "self_explanation_freq": [("srl", +0.40), ("conscientiousness", +0.25), ("expectancy_value", +0.15)],
    "persistence": [("conscientiousness", +0.35), ("self_efficacy", +0.25), ("affective_resilience", +0.15), ("test_anxiety", -0.15)],
    "guessing_propensity": [("conscientiousness", -0.35), ("srl", -0.20), ("affective_resilience", -0.10), ("test_anxiety", +0.15)],
    "help_seek_latency": [("self_efficacy", +0.25), ("srl", -0.25), ("test_anxiety", -0.15)],
    "gaming_propensity": [("affective_resilience", -0.40), ("expectancy_value", -0.20), ("conscientiousness", -0.25), ("time_on_task", -0.10)],
    "affect_volatility": [("affective_resilience", -0.45), ("test_anxiety", +0.30)],
    "scaffold_tolerance": [("load_tolerance", -0.50), ("prior_knowledge", -0.25), ("self_efficacy", -0.10)],
    "autonomy_preference": [("expectancy_value", +0.20), ("self_efficacy", +0.25), ("srl", +0.15), ("load_tolerance", +0.10)],
}


def _combine(weights: List[Tuple[str, float]], traits: Dict[str, int]) -> float:
    v = 0.0
    for k, w in weights:
        v += _norm01(traits[k]) * w
    v = 1 / (1 + math.exp(-3 * (v - 0.0)))
    return float(min(1.0, max(0.0, v)))


def traits_to_behavior(traits: Dict[str, int]) -> Dict[str, Any]:
    b = {name: _combine(w, traits) for name, w in BEHAVIOR_WEIGHTS.items()}

    # Derived
    lang = traits["language_reading"]
    if   lang <= 1: cefr = "A2"
    elif lang == 2: cefr = "B1"
    elif lang == 3: cefr = "B2"
    elif lang == 4: cefr = "C1"
    else:           cefr = "C2"

    long_score = np.mean([
        _norm01(traits["load_tolerance"]),
        _norm01(traits["affective_resilience"]),
        _norm01(traits["self_efficacy"]),
    ])
    if long_score < 0.33: resp_len = "short"
    elif long_score < 0.66: resp_len = "medium"
    else: resp_len = "long"

    pace_score = 0.5*(1-b["help_seek_latency"]) + 0.5*_norm01(traits["load_tolerance"]) 
    if pace_score < 0.33: pace = "slow"
    elif pace_score < 0.66: pace = "medium"
    else: pace = "fast"

    time_budget = {1: 10, 2: 20, 3: 30, 4: 45, 5: 60}[traits["time_on_task"]]

    pressure_drop = 0.7*_norm01(traits["test_anxiety"]) - 0.2*_norm01(traits["affective_resilience"]) 
    pressure_drop = float(min(1.0, max(0.0, pressure_drop)))

    if traits["language_reading"] <= 2 or traits["load_tolerance"] <= 2:
        hint_style = "brief-stepwise"
    elif traits["load_tolerance"] >= 4 and traits["language_reading"] >= 4:
        hint_style = "conceptual-minimal"
    else:
        hint_style = "balanced"

    selfexp_mode = "bullet-steps" if traits["srl"] >= 4 else "think-aloud"

    b.update({
        "reading_level_cefr": cefr,
        "response_length": resp_len,
        "pace": pace,
        "time_budget_minutes": time_budget,
        "test_pressure_drop": pressure_drop,
        "hint_style": hint_style,
        "self_explanation_mode": selfexp_mode,
    })
    return b
