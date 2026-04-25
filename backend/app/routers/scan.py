"""
FastAPI router for scan endpoints.

Routes:
  POST /scan          — submit a new scan
  GET  /scan/{id}     — get scan status
  GET  /scan/{id}/issues — get issues for a scan (with filters)
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.database import Repo, Scan, Issue, ScanStatus, get_db
from app.schemas.schemas import (
    ScanCreateRequest, ScanOut, IssueOut, ScanDetailOut
)
from app.services.repo_service import extract_repo_name
from app.config import get_settings

from app.main import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scan", tags=["scans"])


def _get_queue():
    pass

async def async_perform_scan(scan_id: int):
    async with get_db() as session:
        result = await session.execute(
            select(Scan).options(selectinload(Scan.repo)).where(Scan.id == scan_id)
        )
        scan = result.scalars().first()
        if scan:
            from app.services.scan_service import run_scan
            await run_scan(session, scan)

@router.post("", response_model=ScanOut, status_code=202)
@limiter.limit("10/hour")
async def create_scan(
    request: Request,
    body: ScanCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a GitHub repository URL for analysis.
    Returns immediately with a scan ID for status polling.
    """
    url = body.repo_url.rstrip("/").removesuffix(".git")

    # Upsert repo
    result = await db.execute(select(Repo).where(Repo.url == url))
    repo = result.scalars().first()
    if repo is None:
        repo = Repo(url=url, name=extract_repo_name(url))
        db.add(repo)
        await db.flush()

    # Create scan record
    scan = Scan(repo_id=repo.id, status=ScanStatus.PENDING)
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    # Enqueue BackgroundTask
    try:
        from app.models.database import async_session_factory
        from app.services.scan_service import run_scan
        
        async def run_scan_bg(scan_id: int):
            async with async_session_factory() as session:
                res = await session.execute(
                    select(Scan).options(selectinload(Scan.repo)).where(Scan.id == scan_id)
                )
                bg_scan = res.scalars().first()
                if bg_scan:
                    await run_scan(session, bg_scan)
                    
        background_tasks.add_task(run_scan_bg, scan.id)
        logger.info("Enqueued scan job for scan_id=%d", scan.id)
    except Exception as exc:
        logger.error("Failed to enqueue scan: %s", exc)
        # Don't fail the request; the scan is in PENDING and can be retried

    # Reload with repo relationship
    result = await db.execute(
        select(Scan).options(selectinload(Scan.repo)).where(Scan.id == scan.id)
    )
    scan = result.scalars().first()
    return scan


@router.get("/{scan_id}", response_model=ScanOut)
async def get_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get scan status and metadata by ID."""
    result = await db.execute(
        select(Scan).options(selectinload(Scan.repo)).where(Scan.id == scan_id)
    )
    scan = result.scalars().first()
    if scan is None:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")
    return scan


@router.get("/{scan_id}/issues", response_model=List[IssueOut])
async def get_scan_issues(
    scan_id: int,
    severity: Optional[str] = Query(None, description="Filter by severity: LOW, MEDIUM, HIGH"),
    file: Optional[str] = Query(None, description="Filter by file path substring"),
    tool: Optional[str] = Query(None, description="Filter by tool name"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all issues for a scan with optional filtering and pagination.
    """
    # Verify scan exists
    scan_result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = scan_result.scalars().first()
    if scan is None:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    query = select(Issue).where(Issue.scan_id == scan_id)

    if severity:
        query = query.where(Issue.severity == severity.upper())
    if file:
        query = query.where(Issue.file_path.ilike(f"%{file}%"))
    if tool:
        query = query.where(Issue.tool.ilike(f"%{tool}%"))

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{scan_id}/sarif")
async def get_scan_sarif(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and return a SARIF 2.1.0 report for a scan.
    """
    result = await db.execute(
        select(Scan).options(selectinload(Scan.repo)).where(Scan.id == scan_id)
    )
    scan = result.scalars().first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != ScanStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Scan not yet completed")

    issues_result = await db.execute(select(Issue).where(Issue.scan_id == scan_id))
    issues = issues_result.scalars().all()

    # Minimal SARIF build
    repo_url = scan.repo.url.rstrip("/") + "/"
    sarif = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Documents/CommitteeSpecifications/2.1.0/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "AI Repository Analyzer",
                    "version": "1.0.0",
                    "rules": []
                }
            },
            "results": [
                {
                    "ruleId": issue.rule_id or issue.tool,
                    "level": "error" if issue.severity == "HIGH" else "warning" if issue.severity == "MEDIUM" else "note",
                    "message": {"text": issue.message},
                    "locations": [{
                        "physicalLocation": {
                            "artifactLocation": {"uri": issue.file_path},
                            "region": {"startLine": issue.line_number} if issue.line_number else None
                        }
                    }]
                } for issue in issues
            ]
        }]
    }
    return sarif
