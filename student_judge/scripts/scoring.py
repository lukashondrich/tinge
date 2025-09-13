"""Score aggregation and OpenAI API helpers."""

from __future__ import annotations

import json
from statistics import mean
from typing import Any, Dict, List, Optional


def call_judge(client: Any, model: str, messages: List[Dict[str, str]], temperature: float = 0.0) -> Dict[str, Any]:
    """Call the OpenAI judge model and parse JSON response."""
    response = client.responses.create(
        model=model,
        messages=messages,
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    text = response.output[0].content[0].text if getattr(response, "output", None) else response.content[0].text
    return json.loads(text)


def aggregate_session(session: Dict[str, Any], metric_keys: List[str], rounding: int = 2) -> Dict[str, Any]:
    """Aggregate per-turn scores across the session."""
    turns = session.get("conversation_history", {})
    aggregates: Dict[str, Optional[float]] = {}
    for key in metric_keys:
        vals: List[float] = []
        for turn in turns.values():
            score = (turn.get("student_scores") or {}).get(key)
            if isinstance(score, (int, float)):
                vals.append(float(score))
        if vals:
            aggregates[key] = round(mean(vals), rounding)
        else:
            aggregates[key] = None
    return {"session_scores": aggregates}
