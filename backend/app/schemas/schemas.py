"""
Pydantic schemas for request/response validation and serialization.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, HttpUrl, field_validator
from app.models.database import ScanStatus, Severity, Category


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class ScanCreateRequest(BaseModel):
    repo_url: str

    @field_validator("repo_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("https://github.com/"):
            raise ValueError("Only public GitHub URLs are supported (https://github.com/...)")
        return v


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class RepoOut(BaseModel):
    id: int
    url: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanOut(BaseModel):
    id: int
    repo_id: int
    status: ScanStatus
    progress: int
    detailed_status: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    repo: Optional[RepoOut] = None

    model_config = {"from_attributes": True}


class IssueOut(BaseModel):
    id: int
    scan_id: int
    file_path: str
    line_number: Optional[int] = None
    severity: Severity
    category: Category
    tool: str
    message: str
    rule_id: Optional[str] = None
    ai_explanation: Optional[str] = None
    suggested_fix: Optional[str] = None
    before_code: Optional[str] = None
    after_code: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanDetailOut(ScanOut):
    issues: List[IssueOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Normalized issue dict (internal, used between analyzers & DB storage)
# ---------------------------------------------------------------------------

class NormalizedIssue(BaseModel):
    file: str
    line: Optional[int] = None
    severity: Severity
    category: Category
    tool: str
    message: str
    rule_id: Optional[str] = None
    ai_explanation: Optional[str] = None
    suggested_fix: Optional[str] = None
    before_code: Optional[str] = None
    after_code: Optional[str] = None
