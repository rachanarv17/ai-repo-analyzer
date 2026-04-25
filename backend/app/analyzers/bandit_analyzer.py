"""
Bandit analyzer — runs bandit on a directory and normalizes security results.
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
    "LOW": Severity.LOW,
    "MEDIUM": Severity.MEDIUM,
    "HIGH": Severity.HIGH,
}


def run_bandit(repo_path: str) -> List[NormalizedIssue]:
    """Run bandit on the given repo directory and return normalized security issues."""
    issues: List[NormalizedIssue] = []

    cmd = [
        "bandit",
        "-r",
        "-f", "json",
        "-q",
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
        for item in data.get("results", []):
            file_path = item.get("filename", "unknown")
            try:
                rel = str(Path(file_path).relative_to(repo_path))
            except ValueError:
                rel = file_path

            raw_severity = item.get("issue_severity", "MEDIUM").upper()
            severity = SEVERITY_MAP.get(raw_severity, Severity.MEDIUM)

            issues.append(
                NormalizedIssue(
                    file=rel,
                    line=item.get("line_number"),
                    severity=severity,
                    category=Category.SECURITY,
                    tool="bandit",
                    message=item.get("issue_text", ""),
                    rule_id=item.get("test_id", ""),
                )
            )
    except subprocess.TimeoutExpired:
        logger.warning("bandit timed out on %s", repo_path)
    except json.JSONDecodeError as e:
        logger.warning("bandit JSON parse error: %s", e)
    except Exception as e:
        logger.error("bandit failed: %s", e, exc_info=True)

    return issues
