import logging
import textwrap
import json
import asyncio
from typing import List, Optional

from app.config import get_settings
from app.schemas.schemas import NormalizedIssue

logger = logging.getLogger(__name__)

_client = None
# Limit concurrent AI calls to avoid hitting rate limits and consuming too many resources
AI_SEMAPHORE = asyncio.Semaphore(5)


def _get_client():
    global _client
    if _client is not None:
        return _client
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    except ImportError:
        logger.warning("openai package not installed; AI features disabled")
    return _client


async def _chat(prompt: str, system: str = "") -> Optional[str]:
    """Call the OpenAI chat completion API."""
    client = _get_client()
    if client is None:
        return None
    settings = get_settings()
    try:
        response = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": system or "You are an expert Python code reviewer."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=1024,
            temperature=0.3,
            response_format={"type": "json_object"} if "json" in system.lower() or "json" in prompt.lower() else None
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning("OpenAI call failed: %s", e)
        return None


async def enrich_issue(issue: NormalizedIssue) -> NormalizedIssue:
    """
    Enrich a single NormalizedIssue with AI-generated explanation, fix, and diff.
    Uses a single OpenAI call for maximum efficiency.
    """
    async with AI_SEMAPHORE:
        prompt = textwrap.dedent(f"""
            Analyze this Python code issue flagged by "{issue.tool}":

            File: {issue.file}
            Line: {issue.line}
            Rule ID: {issue.rule_id}
            Message: {issue.message}
            Category: {issue.category}
            Severity: {issue.severity}

            Provide:
            1. An explanation in 2-3 sentences for a junior developer (why it matters).
            2. A concise actionable fix suggestion.
            3. A minimal 'before' and 'after' code example showing the fix.

            Respond in this exact JSON format:
            {{
              "explanation": "...",
              "suggestion": "...",
              "before_code": "...",
              "after_code": "..."
            }}
        """).strip()

        result = await _chat(
            prompt,
            system="You are an expert Python security and quality reviewer. Always respond with valid JSON."
        )

        if result:
            try:
                data = json.loads(result)
                return issue.model_copy(update={
                    "ai_explanation": data.get("explanation", issue.ai_explanation),
                    "suggested_fix": data.get("suggestion", issue.suggested_fix),
                    "before_code": data.get("before_code", issue.before_code),
                    "after_code": data.get("after_code", issue.after_code),
                })
            except Exception as e:
                logger.error("Failed to parse AI response: %s", e)

        # Fallback if AI fails
        return issue


async def batch_enrich_issues(issues: List[NormalizedIssue], limit: int = 30) -> List[NormalizedIssue]:
    """
    Enrich multiple issues in parallel with a concurrency limit.
    """
    # Sort by severity to prioritize high-risk issues
    priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    sorted_issues = sorted(issues, key=lambda i: priority_order.get(i.severity, 2))

    to_enrich = sorted_issues[:limit]
    remaining = sorted_issues[limit:]

    tasks = [enrich_issue(issue) for issue in to_enrich]
    enriched = await asyncio.gather(*tasks)

    return list(enriched) + remaining

