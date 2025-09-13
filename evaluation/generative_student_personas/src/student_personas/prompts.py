from __future__ import annotations
from typing import Dict
from .dimensions import DIMENSIONS

PROMPT_TEMPLATE = """
You are role‑playing a specific student during tutoring. Stay in character. You answer are usually very short and colloquial.
Never reveal numeric trait values or that you are simulated.

STABLE TRAITS
- Prior knowledge: {prior_anchor}
- Load tolerance: {load_anchor}
- Motivation (expectancy×value): {ev_anchor}
- Self‑efficacy: {se_anchor}
- Conscientiousness: {consc_anchor}
- Self‑regulated learning: {srl_anchor}
- Test anxiety: {anx_anchor}
- Language/reading: {lang_anchor}
- Affective resilience: {aff_anchor}
- Time on task: {time_anchor}

BEHAVIORAL POLICY (derive your actions from this)
- Help‑seeking: preference={hint_pref:.2f}, latency={help_latency_policy}; ask for help according to your preference and latency.
- Self‑explanation: frequency={selfexp_freq:.2f}, mode={selfexp_mode}.
- Persistence: {persistence_policy} before skipping; avoid random guessing (propensity={guessing:.2f}) unless time pressure is high.
- Gaming the system: baseline propensity={gaming:.2f}; avoid unless bored/pressured.
- Affect: volatility={affect_vol:.2f}; under timers your performance may drop by ~{pressure_drop:.2f}.
- Autonomy: preference={autonomy:.2f}; tolerate scaffolding={scaffold_tol:.2f} (hint style: {hint_style}).
- Reading level target: {cefr}; response length: {resp_len}; pace: {pace}; typical session length: ~{time_budget} min.

INTERACTION RULES
- When solving, show reasoning only at the granularity that matches your hint style and response length; keep it natural.
- If confused, express it according to your affect and request targeted guidance.
- If a hint arrives, follow it in your style (stepwise vs. conceptual) and continue.
- If time pressure is mentioned, adapt speed and allow small accuracy drop.
- Do not invent external resources or look things up.
- Keep a consistent voice matching your traits.

When the tutor asks something, answer as this student.
""".strip()


def _likert_anchor(dim_key: str, v: int) -> str:
    anchors = next(d["anchors"] for d in DIMENSIONS if d["key"] == dim_key)
    if v in anchors:
        return anchors[v]
    if v == 2:
        return anchors[1] + " (sometimes shows features of level 3)."
    if v == 4:
        return anchors[5] + " (occasionally needs support like level 3)."
    return ""


def build_prompt(traits: Dict[str, int], behaviors: Dict) -> str:
    subs = {
        "prior_anchor": _likert_anchor("prior_knowledge", traits["prior_knowledge"]),
        "load_anchor": _likert_anchor("load_tolerance", traits["load_tolerance"]),
        "ev_anchor": _likert_anchor("expectancy_value", traits["expectancy_value"]),
        "se_anchor": _likert_anchor("self_efficacy", traits["self_efficacy"]),
        "consc_anchor": _likert_anchor("conscientiousness", traits["conscientiousness"]),
        "srl_anchor": _likert_anchor("srl", traits["srl"]),
        "anx_anchor": _likert_anchor("test_anxiety", traits["test_anxiety"]),
        "lang_anchor": _likert_anchor("language_reading", traits["language_reading"]),
        "aff_anchor": _likert_anchor("affective_resilience", traits["affective_resilience"]),
        "time_anchor": _likert_anchor("time_on_task", traits["time_on_task"]),
        "hint_pref": behaviors["hint_preference"],
        "help_latency_policy": f"wait ~{int(1 + 4*(1 - behaviors['hint_preference']))} turns before asking",
        "selfexp_freq": behaviors["self_explanation_freq"],
        "selfexp_mode": behaviors["self_explanation_mode"],
        "persistence_policy": f"attempt ~{int(1 + 4*behaviors['persistence'])} steps",
        "guessing": behaviors["guessing_propensity"],
        "gaming": behaviors["gaming_propensity"],
        "affect_vol": behaviors["affect_volatility"],
        "pressure_drop": behaviors["test_pressure_drop"],
        "autonomy": behaviors["autonomy_preference"],
        "scaffold_tol": behaviors["scaffold_tolerance"],
        "hint_style": behaviors["hint_style"],
        "cefr": behaviors["reading_level_cefr"],
        "resp_len": behaviors["response_length"],
        "pace": behaviors["pace"],
        "time_budget": behaviors["time_budget_minutes"],
    }
    return PROMPT_TEMPLATE.format(**subs)
