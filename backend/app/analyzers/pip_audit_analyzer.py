"""
pip-audit analyzer — audits Python dependencies for known CVEs.
"""
import subprocess
import json
import logging
from typing import List
from app.schemas.schemas import NormalizedIssue
from app.models.database import Severity, Category

logger = logging.getLogger(__name__)


def _cvss_to_severity(cvss: float | None) -> Severity:
    if cvss is None:
        return Severity.MEDIUM
    if cvss >= 7.0:
        return Severity.HIGH
    elif cvss >= 4.0:
        return Severity.MEDIUM
    return Severity.LOW


def run_pip_audit(repo_path: str) -> List[NormalizedIssue]:
    """Run pip-audit against the requirements in repo_path and normalize results."""
    issues: List[NormalizedIssue] = []

    # pip-audit works best against a requirements file
    req_files = ["requirements.txt", "requirements/base.txt", "requirements/prod.txt"]
    req_path = None
    import os
    for rf in req_files:
        candidate = os.path.join(repo_path, rf)
        if os.path.exists(candidate):
            req_path = candidate
            break

    if req_path is None:
        logger.info("No requirements.txt found in %s; skipping pip-audit", repo_path)
        return issues

    cmd = [
        "pip-audit",
        "-r", req_path,
        "--format", "json",
        "--progress-spinner", "off",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
        )
        raw = result.stdout.strip()
        if not raw:
            return issues

        data = json.loads(raw)
        dependencies = data.get("dependencies", [])
        for dep in dependencies:
            package = dep.get("name", "unknown")
            version = dep.get("version", "?")
            for vuln in dep.get("vulns", []):
                # Try to pull CVSS score from aliases or description
                cvss_score = vuln.get("fix_versions")  # not a score, handle below
                description = vuln.get("description", "")
                vuln_id = vuln.get("id", "")

                issues.append(
                    NormalizedIssue(
                        file="requirements.txt",
                        line=None,
                        severity=Severity.HIGH,  # Dependency CVEs default HIGH
                        category=Category.DEPENDENCY,
                        tool="pip-audit",
                        message=(
                            f"{package}=={version} has vulnerability {vuln_id}: {description}"
                        ),
                        rule_id=vuln_id,
                    )
                )
    except subprocess.TimeoutExpired:
        logger.warning("pip-audit timed out on %s", repo_path)
    except json.JSONDecodeError as e:
        logger.warning("pip-audit JSON parse error: %s", e)
    except Exception as e:
        logger.error("pip-audit failed: %s", e, exc_info=True)

    return issues
