"""
Pylint analyzer — runs pylint on a directory and normalizes results.
"""
import subprocess
import json
import logging
from pathlib import Path
from typing import List
from app.schemas.schemas import NormalizedIssue
from app.models.database import Severity, Category

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "convention": Severity.LOW,
    "refactor": Severity.LOW,
    "warning": Severity.MEDIUM,
    "error": Severity.HIGH,
    "fatal": Severity.HIGH,
}


def run_pylint(repo_path: str) -> List[NormalizedIssue]:
    """Run pylint on the given repo directory and return normalized issues."""
    issues: List[NormalizedIssue] = []

    cmd = [
        "pylint",
        "--output-format=json",
        "--recursive=y",
        repo_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        raw = result.stdout.strip()
        if not raw:
            return issues

        data = json.loads(raw)
        for item in data:
            pylint_type = item.get("type", "warning").lower()
            severity = SEVERITY_MAP.get(pylint_type, Severity.MEDIUM)
            file_path = item.get("path", "unknown")
            # Make path relative to repo root
            try:
                rel = str(Path(file_path).relative_to(repo_path))
            except ValueError:
                rel = file_path

            issues.append(
                NormalizedIssue(
                    file=rel,
                    line=item.get("line"),
                    severity=severity,
                    category=Category.QUALITY,
                    tool="pylint",
                    message=item.get("message", ""),
                    rule_id=item.get("message-id", ""),
                )
            )
    except subprocess.TimeoutExpired:
        logger.warning("pylint timed out on %s", repo_path)
    except json.JSONDecodeError as e:
        logger.warning("pylint JSON parse error: %s", e)
    except Exception as e:
        logger.error("pylint failed: %s", e, exc_info=True)

    return issues
