from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List

import openai
from openai.error import OpenAIError


def simulate_student(
    persona: Dict[str, Any],
    context_path: str,
    model: str = "gpt-4o-mini",
    temperature: float = 0.7,
) -> str:
    """Simulate a student response using an OpenAI chat model.

    Parameters
    ----------
    persona:
        Dictionary containing at least ``id`` and a path to a JSONL file
        with persona definitions (``path`` or ``file``).
    context_path:
        Path to a JSON file containing the conversation context.
    model:
        OpenAI model name.
    temperature:
        Sampling temperature for generation.

    Returns
    -------
    str
        Text content of the assistant's reply.
    """

    personas_path = persona.get("path") or persona.get("file") or persona.get("persona_path")
    if not personas_path:
        raise ValueError("Persona dictionary must include 'path' or 'file' to personas JSONL")

    persona_id = persona.get("id")
    if not persona_id:
        raise ValueError("Persona dictionary must include an 'id'")

    prompt: str | None = None
    with open(personas_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            if data.get("id") == persona_id:
                prompt = data.get("prompt")
                break
    if prompt is None:
        raise ValueError(f"Persona with id {persona_id} not found in {personas_path}")

    with open(context_path, "r", encoding="utf-8") as f:
        context = json.load(f)
    history: List[Dict[str, str]] = context.get("history", [])
    question = context.get("question") or context.get("latest_question") or context.get("tutor_question")
    if question is None and history:
        question = history[-1].get("content")
    if question is None:
        raise ValueError("Context does not contain a tutor question")

    messages: List[Dict[str, str]] = [{"role": "system", "content": prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": question})

    openai.api_key = os.getenv("OPENAI_API_KEY")

    for attempt in range(3):
        try:
            response = openai.ChatCompletion.create(
                model=model,
                messages=messages,
                temperature=temperature,
            )
            return response["choices"][0]["message"]["content"]
        except OpenAIError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

    raise RuntimeError("Failed to generate response")
