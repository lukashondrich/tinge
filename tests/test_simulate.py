import json
import os
import sys
import types
import importlib.util

# Create a minimal stub for the openai module so tests do not require the real package
openai_stub = types.ModuleType("openai")

class _ChatCompletion:
    @staticmethod
    def create(**kwargs):
        return {"choices": [{"message": {"content": "stub"}}]}

openai_stub.ChatCompletion = _ChatCompletion

error_module = types.ModuleType("openai.error")

class OpenAIError(Exception):
    pass

error_module.OpenAIError = OpenAIError
openai_stub.error = error_module

sys.modules["openai"] = openai_stub
sys.modules["openai.error"] = error_module
import openai  # type: ignore

simulate_path = os.path.join(
    os.path.dirname(__file__),
    "..",
    "evaluation",
    "generative_student_personas",
    "src",
    "student_personas",
    "simulate.py",
)
spec = importlib.util.spec_from_file_location("simulate", simulate_path)
simulate = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(simulate)  # type: ignore
simulate_student = simulate.simulate_student


def test_simulate_student(monkeypatch, tmp_path):
    persona_entry = {"id": "p1", "prompt": "You are a helpful student."}
    personas_file = tmp_path / "personas.jsonl"
    with personas_file.open("w") as f:
        f.write(json.dumps(persona_entry) + "\n")

    context = {
        "topic": "math",
        "history": [{"role": "assistant", "content": "Hi"}],
        "question": "What is 2+2?",
    }
    context_file = tmp_path / "context.json"
    with context_file.open("w") as f:
        json.dump(context, f)

    monkeypatch.setenv("OPENAI_API_KEY", "test")

    def mock_create(**kwargs):
        return {"choices": [{"message": {"content": "4"}}]}

    monkeypatch.setattr(openai.ChatCompletion, "create", mock_create)

    result = simulate_student({"id": "p1", "path": str(personas_file)}, str(context_file), model="gpt-test")
    assert result == "4"
