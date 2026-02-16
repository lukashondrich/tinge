import logging
import os

_ENABLED_VALUES = {"1", "true", "yes", "on"}


def _debug_enabled(env=None) -> bool:
    source = os.environ if env is None else env
    value = str(source.get("TINGE_RETRIEVAL_DEBUG_LOGS", "")).strip().lower()
    return value in _ENABLED_VALUES


def get_logger(name: str = "retrieval-service") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("[%(name)s] %(message)s"))
        logger.addHandler(handler)
        logger.propagate = False

    logger.setLevel(logging.INFO if _debug_enabled() else logging.WARNING)
    return logger
