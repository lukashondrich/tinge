import os
import unittest

from app.config import Settings


class SettingsTests(unittest.TestCase):
    def test_defaults_are_loaded(self):
        settings = Settings()
        self.assertEqual(settings.port, 3004)
        self.assertEqual(settings.default_top_k, 5)
        self.assertEqual(settings.max_top_k, 10)
        self.assertFalse(settings.retrieval_dense_enabled)

    def test_dense_flag_parsing(self):
        original = os.environ.get("RETRIEVAL_DENSE_ENABLED")
        os.environ["RETRIEVAL_DENSE_ENABLED"] = "true"
        try:
            settings = Settings()
            self.assertTrue(settings.retrieval_dense_enabled)
        finally:
            if original is None:
                os.environ.pop("RETRIEVAL_DENSE_ENABLED", None)
            else:
                os.environ["RETRIEVAL_DENSE_ENABLED"] = original


if __name__ == "__main__":
    unittest.main()
