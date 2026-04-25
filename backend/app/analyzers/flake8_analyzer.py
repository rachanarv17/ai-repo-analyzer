"""
Flake8 analyzer — runs flake8 on a directory and normalizes results.
"""
import subprocess
import logging
from pathlib import Path
from typing import List
from app.schemas.schemas import NormalizedIssue
from app.models.database import Severity, Category

logger = logging.getLogger(__name__)


def _code_to_severity(code: str) -> Severity:
    """Map flake8 error codes to severity levels."""
    if not code:
        return Severity.LOW
    prefix = code[0].upper()
    if prefix == "E":
        # E1xx-E7xx are errors; most are MEDIUM
        return Severity.MEDIUM
    elif prefix == "W":
        return Severity.LOW
    elif prefix == "F":
        # PyFlakes: undefined names etc. are high risk
        return Severity.HIGH
    elif prefix == "C":
        return Severity.LOW
    return Severity.LOW


def run_flake8(repo_path: str) -> List[NormalizedIssue]:
    """Run flake8 on the given repo directory and return normalized issues."""
    issues: List[NormalizedIssue] = []

    cmd = [
        "flake8",
        "--format=%(path)s::%(row)d::%(col)d::%(code)s::%(text)s",
        "--max-line-length=120",
        repo_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        for raw_line in result.stdout.splitlines():
            parts = raw_line.split("::")
            if len(parts) < 5:
                continue
            file_path, row, _col, code, text = parts[0], parts[1], parts[2], parts[3], parts[4]

            try:
                rel = str(Path(file_path).relative_to(repo_path))
            except ValueError:
                rel = file_path

            issues.append(
                NormalizedIssue(
                    file=rel,
                    line=int(row) if row.isdigit() else None,
                    severity=_code_to_severity(code),
                    category=Category.QUALITY,
                    tool="flake8",
                    message=text.strip(),
                    rule_id=code.strip(),
                )
            )
    except subprocess.TimeoutExpired:
        logger.warning("flake8 timed out on %s", repo_path)
    except Exception as e:
        logger.error("flake8 failed: %s", e, exc_info=True)

    return issues
