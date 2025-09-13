"""Build messages for the judge model."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import json


def make_messages(
    system_prompt: str,
    rubric: Dict[str, Any],
    topic: Optional[str],
    language: str,
    convo_so_far: List[Dict[str, str]],
    prev_tutor_text: Optional[str],
    current_student_text: str,
    metric_keys: List[str],
) -> Dict[str, Any]:
    """Construct messages for OpenAI judging call."""
    user_parts: List[str] = []
    if topic:
        user_parts.append(f"Topic: {topic}")
    if prev_tutor_text:
        user_parts.append(f"Tutor: {prev_tutor_text}")
    user_parts.append(f"Student: {current_student_text}")
    user_parts.append("\nMetrics to score: " + ", ".join(metric_keys))

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "\n".join(user_parts)},
    ]
    return {"messages": messages}
