# Student Judge

A small module for evaluating student dialogue turns against a rubric.

## Setup

1. Put the `student_judge/` folder in your project root and change into it:
   ```bash
   cd /path/to/your/project/student_judge
   ```
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate    # Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install openai pyyaml
   ```
4. Set your OpenAI key in this shell:
   ```bash
   export OPENAI_API_KEY=sk-...   # PowerShell:  $env:OPENAI_API_KEY="sk-..."
   ```
5. Run the judge on a conversation YAML:
   ```bash
   python scripts/judge_cli.py \
     --in /path/to/conversation.yaml \
     --out results/conversation_judged.yaml \
     --model gpt-4o-mini
   ```
