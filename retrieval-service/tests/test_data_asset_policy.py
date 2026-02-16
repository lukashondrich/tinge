import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class DataAssetPolicyScriptTests(unittest.TestCase):
    def setUp(self):
        self.script = (
            Path(__file__).resolve().parents[1] / "scripts" / "check_data_policy.py"
        )

    def run_check(self, data_dir: Path, allowlist_path: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(self.script),
                "--data-dir",
                str(data_dir),
                "--allowlist",
                str(allowlist_path),
                "--max-file-mb",
                "0.001",
                "--max-import-file-mb",
                "0.001",
                "--max-corpus-file-mb",
                "0.001",
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_fails_for_oversized_file_without_allowlist(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            (data_dir / "import").mkdir(parents=True, exist_ok=True)
            (data_dir / "import" / "too_big.jsonl").write_text("x" * 4000, encoding="utf-8")
            allowlist = data_dir / "allowlist.txt"
            allowlist.write_text("", encoding="utf-8")

            result = self.run_check(data_dir, allowlist)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("too_big.jsonl", result.stdout)
            self.assertIn("FAIL", result.stdout)

    def test_passes_when_oversized_file_is_allowlisted(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            (data_dir / "import").mkdir(parents=True, exist_ok=True)
            (data_dir / "import" / "too_big.jsonl").write_text("x" * 4000, encoding="utf-8")
            allowlist = data_dir / "allowlist.txt"
            allowlist.write_text("import/too_big.jsonl\n", encoding="utf-8")

            result = self.run_check(data_dir, allowlist)

            self.assertEqual(result.returncode, 0)
            self.assertIn("PASS", result.stdout)


if __name__ == "__main__":
    unittest.main()
