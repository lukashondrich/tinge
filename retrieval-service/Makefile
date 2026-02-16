.PHONY: format lint test typecheck data-policy check

PYTHON ?= python3
SOURCE_PATHS ?= app scripts tests

format:
	$(PYTHON) -m black $(SOURCE_PATHS)

lint:
	$(PYTHON) -m ruff check $(SOURCE_PATHS)

test:
	$(PYTHON) -m unittest discover -s tests -p "test_*.py"

typecheck:
	$(PYTHON) -m mypy app --ignore-missing-imports

data-policy:
	$(PYTHON) scripts/check_data_policy.py

check: lint test typecheck data-policy
