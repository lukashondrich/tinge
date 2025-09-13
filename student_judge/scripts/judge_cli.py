"""CLI for scoring student turns in a conversation."""

from __future__ import annotations

import argparse
from openai import OpenAI

from io_utils import read_yaml, write_yaml, load_rubric, deep_copy, sorted_turn_keys
from prompt_builder import make_messages
from scoring import call_judge, aggregate_session


def main() -> None:
    ap = argparse.ArgumentParser(description="Judge student responses in a conversation YAML.")
    ap.add_argument("--in", dest="in_path", required=True, help="Input conversation YAML")
    ap.add_argument("--out", dest="out_path", required=True, help="Output judged YAML path")
    ap.add_argument("--rubric", default="prompts/rubric_v1.yaml", help="Rubric YAML path")
    ap.add_argument("--system", default="prompts/judge_system.yaml", help="System prompt YAML path")
    ap.add_argument("--model", default="gpt-4o-mini", help="OpenAI chat model name")
    ap.add_argument("--temperature", type=float, default=0.0)
    args = ap.parse_args()

    # Load inputs
    convo = read_yaml(args.in_path)
    rubric = load_rubric(args.rubric)
    system_prompt = read_yaml(args.system).get("system", "")

    # Set up OpenAI client (expects OPENAI_API_KEY in env)
    client = OpenAI()

    # Prepare output copy
    out = deep_copy(convo)
    out["rubric_version"] = rubric.get("version", "v1")
    out["judge_model"] = args.model
    out["judge_config"] = {
        "metrics": rubric["metric_keys"],
        "abstain_is_null": rubric.get("abstain_is_null", True),
    }

    turns = out.get("conversation_history", {})
    topic = (out.get("topic") or out.get("initial_context", {}).get("topic"))

    # Iterate turns
    prev_tutor_text = None
    ordered = sorted_turn_keys(turns)
    for tkey in ordered:
        turn = turns[tkey]
        student_text = (turn or {}).get("student", "")
        tutor_text = (turn or {}).get("tutor", None)

        # Build judge messages
        messages_dict = make_messages(
            system_prompt=system_prompt,
            rubric=rubric,
            topic=topic,
            language=rubric.get("language", "de"),
            convo_so_far=[],  # kept minimal to avoid leakage; extend if needed
            prev_tutor_text=prev_tutor_text,
            current_student_text=student_text,
            metric_keys=rubric["metric_keys"],
        )

        result = call_judge(client, args.model, messages_dict["messages"], temperature=args.temperature)

        # Attach to turn
        turn["student_scores"] = result.get("scores", {})
        turn["evidence"] = result.get("evidence", {})
        turn["confidence"] = result.get("confidence", {})

        # Update prev tutor for next turn
        prev_tutor_text = tutor_text

    # Aggregates
    agg = aggregate_session(
        out,
        rubric["metric_keys"],
        rounding=int(rubric.get("aggregation", {}).get("rounding", 2)),
    )
    out.update(agg)

    # Write output
    write_yaml(args.out_path, out)
    print(f"[OK] Wrote judged YAML → {args.out_path}")


if __name__ == "__main__":
    main()
