After running judge_cli.py, your evaluated YAML files will be written here.
Example usage (run from the student_judge/ folder):

python3 -m venv .venv
source .venv/bin/activate # Windows: .venv\Scripts\activate
pip install openai pyyaml
python scripts/judge_cli.py --in ../your_convo.yaml --out results/your_convo_judged.yaml

The output mirrors the input file and adds per-turn `student_scores`, `evidence`,
and `confidence`, plus session-level aggregates.
