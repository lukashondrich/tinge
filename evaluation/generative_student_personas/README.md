## Student Personas

Generate a small set of **coverage-optimized** student personas from top learning dimensions (Likert 1–5), map them to behavioral policies, and emit **LLM-ready prompts**.

### Quickstart (Linux/macOS)
```bash
# 1) create project
mkdir -p ~/projects && cd ~/projects
cp -R path/to/student-personas ./student-personas
cd student-personas

# 2) create venv
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3) install
pip install -e .

# 4) generate 10 personas (JSONL)
student-personas --n 10 --seed 42 --out personas.jsonl
```

### Options
- `--strategy {maxmin,kmedoids}`: coverage (default **maxmin**) or distribution-representative (**kmedoids**).
- `--pool`: candidate pool size before selection (default 5000).
- `--corr-config`: optional YAML to override pairwise correlations.
```
