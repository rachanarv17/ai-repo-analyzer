"""
RQ worker tasks.
Each task is a synchronous wrapper that runs the async scan pipeline.
"""
import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import Scan, async_session_factory
from app.services.scan_service import run_scan

logger = logging.getLogger(__name__)


def perform_scan(scan_id: int) -> None:
    """
    Entry point called by the RQ worker.
    Runs the async scan pipeline synchronously.
    """
    async def _inner():
        async with async_session_factory() as session:
            result = await session.execute(
                select(Scan).where(Scan.id == scan_id).join(Scan.repo)
            )
            scan = result.scalars().first()
            if scan is None:
                logger.error("Scan %d not found", scan_id)
                return
            # Eagerly load repo relationship
            from sqlalchemy.orm import selectinload
            result = await session.execute(
                select(Scan)
                .options(selectinload(Scan.repo))
                .where(Scan.id == scan_id)
            )
            scan = result.scalars().first()
            await run_scan(session, scan)

    asyncio.run(_inner())
