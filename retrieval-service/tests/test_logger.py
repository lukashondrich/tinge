import os
import unittest

from app.logger import get_logger


class RetrievalLoggerTests(unittest.TestCase):
    def test_logger_defaults_to_warning_without_debug_flag(self):
        original = os.environ.get("TINGE_RETRIEVAL_DEBUG_LOGS")
        os.environ["TINGE_RETRIEVAL_DEBUG_LOGS"] = "0"
        try:
            logger = get_logger("retrieval-test-warning")
            self.assertEqual(logger.level, 30)  # logging.WARNING
        finally:
            if original is None:
                os.environ.pop("TINGE_RETRIEVAL_DEBUG_LOGS", None)
            else:
                os.environ["TINGE_RETRIEVAL_DEBUG_LOGS"] = original

    def test_logger_uses_info_level_with_debug_flag(self):
        original = os.environ.get("TINGE_RETRIEVAL_DEBUG_LOGS")
        os.environ["TINGE_RETRIEVAL_DEBUG_LOGS"] = "1"
        try:
            logger = get_logger("retrieval-test-info")
            self.assertEqual(logger.level, 20)  # logging.INFO
        finally:
            if original is None:
                os.environ.pop("TINGE_RETRIEVAL_DEBUG_LOGS", None)
            else:
                os.environ["TINGE_RETRIEVAL_DEBUG_LOGS"] = original


if __name__ == "__main__":
    unittest.main()
