from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List

from openai import OpenAI


def simulate_student(
    persona: Dict[str, Any],
    context_path: str,
    model: str = "gpt-4o-mini",
    temperature: float = 0.7,
    return_metadata: bool = False,
) -> str | Dict[str, Any]:
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
    persona_data: Dict[str, Any] = {}
    with open(personas_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            if data.get("id") == persona_id:
                prompt = data.get("prompt")
                persona_data = data  # Store full persona data
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

    # Enhance system prompt with topic context for more realistic behavior
    topic = context.get("topic", "")
    enhanced_prompt = prompt
    if topic:
        enhanced_prompt = f"{prompt}\n\nLEARNING CONTEXT:\n This is the context: {topic}. Remember to stay in character as a student, and speak in your mother tongue, depending on your mastery of the other languges."

    messages: List[Dict[str, str]] = [{"role": "system", "content": enhanced_prompt}]
    
    # Convert custom tutor/student roles back to standard OpenAI roles for API call
    for msg in history:
        role = msg.get("role")
        if role == "tutor" or role == "assistant":
            # Tutor messages become assistant (the AI responding)
            messages.append({"role": "assistant", "content": msg.get("content")})
        elif role == "student" or role == "user":
            # Student messages become user (the human asking)
            messages.append({"role": "user", "content": msg.get("content")})
        else:
            messages.append(msg)  # Keep other roles as-is
    
    # Current tutor message becomes user input (what the tutor is saying to the student)
    messages.append({"role": "user", "content": question})

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
            )
            content = response.choices[0].message.content
            
            if return_metadata:
                return {
                    "response": content,
                    "enhanced_prompt": enhanced_prompt,
                    "persona_traits": persona_data.get("traits", {}),
                    "persona_behaviors": persona_data.get("behaviors", {})
                }
            return content
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

    raise RuntimeError("Failed to generate response")
