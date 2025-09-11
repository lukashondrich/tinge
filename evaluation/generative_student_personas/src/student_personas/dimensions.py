from __future__ import annotations
from typing import List, Dict

DIMENSIONS: List[Dict] = [
    {"key": "prior_knowledge", "label": "Prior knowledge (per domain)", "anchors": {
        1: "Minimal basics; frequent misconceptions; needs placement scaffolds.",
        3: "Some fundamentals; mixed accuracy; benefits from targeted review.",
        5: "Solid foundation; mostly accurate; ready for challenge problems.",
    }},
    {"key": "load_tolerance", "label": "Working-memory / cognitive load tolerance", "anchors": {
        1: "Overwhelmed by multi-step info; needs chunking and worked examples.",
        3: "Handles 2–3 elements if paced; prefers stepwise guidance.",
        5: "Comfortable with complex, integrated tasks; enjoys minimal guidance.",
    }},
    {"key": "expectancy_value", "label": "Expectancy × value (and perceived cost)", "anchors": {
        1: "Low expectancy and value; high cost; reluctant engagement.",
        3: "Mixed value; will engage if tasks feel useful/relevant.",
        5: "High value and expectancy; sees clear purpose; self-initiates.",
    }},
    {"key": "self_efficacy", "label": "Self-efficacy (domain-specific)", "anchors": {
        1: "Often doubts ability; avoids challenge without strong support.",
        3: "Moderate confidence; tries with reassurance and hints.",
        5: "Confident; persists after setbacks; attempts harder items.",
    }},
    {"key": "conscientiousness", "label": "Conscientiousness (discipline/reliability)", "anchors": {
        1: "Inconsistent; skips steps; low follow-through.",
        3: "Usually completes tasks; occasional lapses.",
        5: "Highly organized; completes practice thoroughly.",
    }},
    {"key": "srl", "label": "Self-regulated learning (planning/monitoring/help-seeking)", "anchors": {
        1: "Rare planning; weak monitoring; avoids asking for help.",
        3: "Some planning; asks for help when stuck for a while.",
        5: "Plans, monitors, self-explains; asks for targeted help.",
    }},
    {"key": "test_anxiety", "label": "Test anxiety (worry/arousal)", "anchors": {
        1: "Calm under pressure; performance stable.",
        3: "Some worry; mild time-pressure drops.",
        5: "High worry; performance drops with timers/evaluations.",
    }},
    {"key": "language_reading", "label": "Language & reading level", "anchors": {
        1: "Needs simplified language (CEFR ~A2).",
        3: "Comfortable with standard explanations (CEFR ~B2).",
        5: "Handles dense/technical prose (CEFR ~C1/C2).",
    }},
    {"key": "affective_resilience", "label": "Affective resilience (boredom↓, confusion tolerance↑)", "anchors": {
        1: "Bored quickly; low tolerance for confusion; may game/quit.",
        3: "Tolerates brief confusion; needs progress cues.",
        5: "Sees confusion as productive; stays engaged through struggle.",
    }},
    {"key": "time_on_task", "label": "Context: time-on-task & constraints", "anchors": {
        1: "Very limited time; short, irregular sessions.",
        3: "Moderate time; steady weekly rhythm.",
        5: "Generous time; consistent daily sessions.",
    }},
]

KEYS = [d["key"] for d in DIMENSIONS]
IDX = {k: i for i, k in enumerate(KEYS)}
