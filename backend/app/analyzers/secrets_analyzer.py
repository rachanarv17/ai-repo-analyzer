"""
Secrets analyzer — scans files for hardcoded API keys, tokens, and credentials using regex.
"""
import re
import logging
from pathlib import Path
from typing import List
from app.schemas.schemas import NormalizedIssue
from app.models.database import Severity, Category

logger = logging.getLogger(__name__)

# Patterns for common secrets
PATTERNS = {
    "Generic API Key": r'(?i)(?:key|api|token|secret|password|auth|access)(?:|_|-)((?:key|api|token|secret|password|auth|access)[_\\-]?){0,2}[:=]\s*["\']([a-zA-Z0-9]{16,})["\']',
    "AWS Access Key ID": r"AKIA[0-9A-Z]{16}",
    "AWS Secret Access Key": r"(?i)aws_secret_access_key[:=]\s*['\"]([a-zA-Z0-9/+=]{40})['\"]",
    "GitHub Personal Access Token": r"ghp_[a-zA-Z0-9]{36}",
    "Slack Webhook": r"https://hooks.slack.com/services/T[a-zA-Z0-9_]{8}/B[a-zA-Z0-9_]{8}/[a-zA-Z0-9_]{24}",
    "Google API Key": r"AIza[0-9A-Za-z-_]{35}",
    "Private Key": r"-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----",
    "Database URL": r"(?i)(?:postgres|mysql|mongodb|redis|sqlite)://[a-zA-Z0-9_]+:[a-zA-Z0-9_]+@[a-zA-Z0-9_.-]+:[0-9]+/[a-zA-Z0-9_]+",
}

def run_secrets_scan(repo_path: str) -> List[NormalizedIssue]:
    """Scans all files in the repo for potential secrets."""
    issues: List[NormalizedIssue] = []
    base_path = Path(repo_path)
    
    # Files to ignore (e.g., .git, binary files, large lockfiles)
    ignore_suffixes = {'.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.db', '.sqlite'}
    ignore_names = {'.git', 'node_modules', 'venv', '__pycache__', 'package-lock.json', 'yarn.lock'}

    try:
        for path in base_path.rglob('*'):
            if not path.is_file():
                continue
            if path.suffix.lower() in ignore_suffixes:
                continue
            if any(name in path.parts for name in ignore_names):
                continue
                
            try:
                content = path.read_text(errors='ignore')
                rel_path = str(path.relative_to(base_path))
                
                for name, pattern in PATTERNS.items():
                    for match in re.finditer(pattern, content):
                        # Find line number
                        line_no = content.count('\n', 0, match.start()) + 1
                        
                        issues.append(
                            NormalizedIssue(
                                file=rel_path,
                                line=line_no,
                                severity=Severity.HIGH,
                                category=Category.SECURITY,
                                tool="secrets-analyzer",
                                message=f"Potential hardcoded secret detected: {name}",
                                rule_id=f"SECRET-{name.replace(' ', '-').upper()}",
                            )
                        )
            except Exception as e:
                logger.debug("Failed to scan %s for secrets: %s", path, e)
                
    except Exception as e:
        logger.error("Secrets scan failed: %s", e, exc_info=True)

    return issues
