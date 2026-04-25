"""
Scan orchestration service — coordinates analyzers, AI enrichment, and DB persistence.
"""
import logging
import asyncio
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import Scan, Issue, ScanStatus
from app.schemas.schemas import NormalizedIssue
from app.analyzers import run_pylint, run_flake8, run_bandit, run_pip_audit, run_secrets_scan
from app.services.ai_service import enrich_issue
from app.services.repo_service import clone_repo, cleanup_repo, detect_language

logger = logging.getLogger(__name__)


async def run_all_analyzers(repo_path: str, lang: str = "python") -> List[NormalizedIssue]:
    """Run all analyzers in a ThreadPoolExecutor and collect results."""
    loop = asyncio.get_running_loop()
    tasks = []

    # Cross-language tools
    tasks.append(loop.run_in_executor(None, run_secrets_scan, repo_path))

    # Python specific tools
    if lang == "python":
        tasks.append(loop.run_in_executor(None, run_pylint, repo_path))
        tasks.append(loop.run_in_executor(None, run_flake8, repo_path))
        tasks.append(loop.run_in_executor(None, run_bandit, repo_path))
        tasks.append(loop.run_in_executor(None, run_pip_audit, repo_path))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_issues: List[NormalizedIssue] = []
    for r in results:
        if isinstance(r, Exception):
            logger.error("Analyzer error: %s", r)
        elif isinstance(r, list):
            all_issues.extend(r)

    return all_issues


async def persist_issues(session: AsyncSession, scan_id: int, issues: List[NormalizedIssue]) -> None:
    """Persist normalized issues to the database."""
    db_issues = [
        Issue(
            scan_id=scan_id,
            file_path=issue.file,
            line_number=issue.line,
            severity=issue.severity,
            category=issue.category,
            tool=issue.tool,
            message=issue.message,
            rule_id=issue.rule_id,
            ai_explanation=issue.ai_explanation,
            suggested_fix=issue.suggested_fix,
            before_code=issue.before_code,
            after_code=issue.after_code,
        )
        for issue in issues
    ]
    session.add_all(db_issues)
    await session.commit()


async def update_scan_progress(session: AsyncSession, scan: Scan, progress: int, status_msg: str) -> None:
    """Helper to update scan progress and message."""
    scan.progress = progress
    scan.detailed_status = status_msg
    await session.commit()


async def run_scan(session: AsyncSession, scan: Scan) -> None:
    """
    Full scan pipeline with progress tracking and parallel enrichment.
    """
    repo_path = None
    try:
        # Step 1: Initialize
        scan.status = ScanStatus.RUNNING
        await update_scan_progress(session, scan, 5, "Preparing environment...")

        # Step 2: Clone
        await update_scan_progress(session, scan, 10, f"Cloning repository: {scan.repo.url}")
        repo_path = clone_repo(scan.repo.url, scan.id)

        # Step 3: Language check
        await update_scan_progress(session, scan, 20, "Detecting project language...")
        lang = detect_language(repo_path)
        
        # Step 4: Run analyzers
        msg = "Running cross-language security scans (Secrets)..."
        if lang == "python":
            msg = "Running security & quality tools (Pylint, Bandit, Secrets, Pip-audit)..."
        
        await update_scan_progress(session, scan, 30, msg)
        raw_issues = await run_all_analyzers(repo_path, lang)

        # Cap issues
        MAX_ISSUES = 200
        if len(raw_issues) > MAX_ISSUES:
            logger.warning("Capping issues from %d to %d", len(raw_issues), MAX_ISSUES)
            raw_issues = raw_issues[:MAX_ISSUES]

        # Step 5: AI Enrichment
        await update_scan_progress(session, scan, 60, f"Enriching {min(len(raw_issues), 30)} issues with AI insights...")
        from app.services.ai_service import batch_enrich_issues
        enriched = await batch_enrich_issues(raw_issues, limit=30)

        # Step 6: Persist
        await update_scan_progress(session, scan, 90, "Saving results to database...")
        await persist_issues(session, scan.id, enriched)

        # Finalize
        scan.status = ScanStatus.COMPLETED
        scan.progress = 100
        scan.detailed_status = "Scan completed successfully."
        await session.commit()

    except Exception as exc:
        logger.error("Scan %d failed: %s", scan.id, exc, exc_info=True)
        scan.status = ScanStatus.FAILED
        scan.progress = 0
        scan.detailed_status = f"Failed: {str(exc)}"
        scan.error_message = str(exc)
        await session.commit()
    finally:
        if repo_path:
            cleanup_repo(repo_path)

