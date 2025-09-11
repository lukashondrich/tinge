from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class Persona:
    id: str
    traits: Dict[str, int]
    behaviors: Dict[str, Any]
    prompt: str
