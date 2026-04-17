"""Structured logging configuration for ChromaKnit.

Call setup_logging() once at application startup. Emits JSON lines to stdout
so deployment platforms (Render, Railway) can ingest them and later profiling
spans can be parsed without regex scraping.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone

# LogRecord attributes that are stdlib internals or already represented as
# top-level fields — excluded from the JSON output so only caller-supplied
# `extra={...}` fields survive.
_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "asctime", "taskName",
}


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Preserves `extra={...}` fields verbatim."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def setup_logging(level: str | None = None) -> None:
    """Configure the root logger to emit JSON to stdout. Idempotent.

    Level resolves from the `level` argument, then $LOG_LEVEL, then INFO.
    """
    resolved = (level or os.getenv("LOG_LEVEL") or "INFO").upper()

    root = logging.getLogger()
    root.setLevel(resolved)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    for noisy in ("multipart", "PIL", "matplotlib"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
