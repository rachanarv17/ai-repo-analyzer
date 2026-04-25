"""
Repo service — handles cloning, cleanup, and language detection.
"""
import logging
import os
import shutil
import re
from pathlib import Path
from urllib.parse import urlparse
from app.config import get_settings

logger = logging.getLogger(__name__)


def extract_repo_name(url: str) -> str:
    """Extract '<owner>/<repo>' from a GitHub URL."""
    # Normalize: strip trailing .git or slashes
    url = url.rstrip("/").removesuffix(".git")
    parsed = urlparse(url)
    parts = parsed.path.strip("/").split("/")
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}"
    return parts[0] if parts else "unknown"


def clone_repo(url: str, scan_id: int) -> str:
    """
    Clone a GitHub repository to a local temp directory.
    Returns the path to the cloned repository.
    Raises RuntimeError on failure.
    """
    import git  # GitPython

    settings = get_settings()
    clone_dir = settings.CLONE_BASE_DIR
    os.makedirs(clone_dir, exist_ok=True)

    # Sanitize repo name for safe directory name
    repo_name = extract_repo_name(url)
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", repo_name)
    target = os.path.join(clone_dir, f"scan_{scan_id}_{safe_name}")

    if os.path.exists(target):
        shutil.rmtree(target)

    logger.info("Cloning %s → %s", url, target)
    try:
        git.Repo.clone_from(url, target, depth=1, single_branch=True)
    except git.GitCommandError as e:
        raise RuntimeError(f"Failed to clone repo {url}: {e.stderr}") from e

    return target


def cleanup_repo(repo_path: str) -> None:
    """Remove a cloned repository from disk."""
    if repo_path and os.path.exists(repo_path):
        shutil.rmtree(repo_path, ignore_errors=True)
        logger.info("Cleaned up repo at %s", repo_path)


def detect_language(repo_path: str) -> str:
    """
    Simple file-extension-based language detection.
    Returns the dominant language, defaulting to 'python'.
    """
    counts: dict[str, int] = {}
    for root, _, files in os.walk(repo_path):
        for f in files:
            ext = Path(f).suffix.lower()
            counts[ext] = counts.get(ext, 0) + 1

    ext_lang = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".go": "go",
        ".java": "java",
        ".rb": "ruby",
        ".rs": "rust",
    }

    dominant = max(counts, key=lambda k: counts[k], default=".py")
    return ext_lang.get(dominant, "python")
