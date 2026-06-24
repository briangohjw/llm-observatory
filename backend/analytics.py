import os
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import get_pool

router = APIRouter(prefix="/analytics")

BUDGET_LIMIT_SGD = float(os.environ.get("BUDGET_LIMIT_SGD", "10.00"))

_BLOCKED = re.compile(
    r"\b(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|exec|execute|pg_|information_schema)\b",
    re.IGNORECASE,
)


def _since_to_dt(since: str) -> datetime:
    match = re.fullmatch(r"(\d+)([dh])", since)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid since param. Use e.g. 7d or 24h")
    value, unit = int(match.group(1)), match.group(2)
    delta = timedelta(days=value) if unit == "d" else timedelta(hours=value)
    return datetime.now(timezone.utc) - delta


@router.get("/summary")
async def summary(since: str = "7d"):
    since_dt = _since_to_dt(since)
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT
            DATE(created_at AT TIME ZONE 'UTC') AS day,
            COALESCE(SUM(cost_sgd), 0)          AS cost,
            COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
            COUNT(*)                             AS requests,
            COALESCE(AVG(latency_ms), 0)         AS avg_latency,
            COALESCE(SUM(CASE WHEN is_error THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0) AS error_rate
        FROM llm_logs
        WHERE created_at >= $1
        GROUP BY day
        ORDER BY day
        """,
        since_dt,
    )
    return [dict(r) for r in rows]


@router.get("/models")
async def models():
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT
            model,
            COUNT(*)                  AS requests,
            SUM(input_tokens)         AS input_tokens,
            SUM(output_tokens)        AS output_tokens,
            COALESCE(SUM(cost_sgd), 0)AS cost_sgd,
            COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
        FROM llm_logs
        WHERE is_error = FALSE
        GROUP BY model
        ORDER BY cost_sgd DESC
        """
    )
    return [dict(r) for r in rows]


@router.get("/prompts")
async def prompts():
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT
            COALESCE(prompt_id, '(none)') AS prompt_id,
            COUNT(*)                      AS requests,
            COALESCE(SUM(cost_sgd), 0)   AS cost_sgd,
            COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
        FROM llm_logs
        GROUP BY prompt_id
        ORDER BY cost_sgd DESC
        """
    )
    return [dict(r) for r in rows]


@router.get("/budget")
async def budget():
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    if now.month == 12:
        next_month = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        next_month = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)

    spent = await pool.fetchval(
        "SELECT COALESCE(SUM(cost_sgd), 0) FROM llm_logs WHERE created_at >= $1 AND is_error = FALSE",
        first_of_month,
    )
    spent = float(spent)
    remaining = max(0.0, BUDGET_LIMIT_SGD - spent)
    percent_used = round((spent / BUDGET_LIMIT_SGD) * 100, 1) if BUDGET_LIMIT_SGD > 0 else 0

    return {
        "limit": BUDGET_LIMIT_SGD,
        "spent": round(spent, 4),
        "remaining": round(remaining, 4),
        "percent_used": percent_used,
        "resets_on": next_month.strftime("%Y-%m-%d"),
    }


@router.get("/queries")
async def queries(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    model: Optional[str] = None,
    prompt_id: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
):
    pool = await get_pool()

    conditions = []
    params: list = []
    idx = 1

    if model:
        conditions.append(f"model = ${idx}")
        params.append(model)
        idx += 1
    if prompt_id:
        conditions.append(f"prompt_id = ${idx}")
        params.append(prompt_id)
        idx += 1
    if since:
        conditions.append(f"created_at >= ${idx}")
        params.append(_since_to_dt(since))
        idx += 1
    if until:
        conditions.append(f"created_at <= ${idx}")
        params.append(datetime.fromisoformat(until))
        idx += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total = await pool.fetchval(f"SELECT COUNT(*) FROM llm_logs {where}", *params)
    rows = await pool.fetch(
        f"""SELECT id, created_at, model, prompt_id, user_id,
                   input_tokens, output_tokens, cost_sgd, latency_ms,
                   prompt_text, response_text, is_error, error_message
            FROM llm_logs {where}
            ORDER BY created_at DESC
            LIMIT ${idx} OFFSET ${idx+1}""",
        *params, limit, offset,
    )
    return {"total": total, "rows": [dict(r) for r in rows]}


class MockLogBody(BaseModel):
    model: str
    input_tokens: int
    output_tokens: int
    cost_sgd: float
    latency_ms: int
    prompt_id: Optional[str] = None
    user_id: Optional[str] = None
    prompt_text: Optional[str] = None
    response_text: Optional[str] = None


@router.post("/mock-log")
async def mock_log(body: MockLogBody):
    pool = await get_pool()
    await pool.execute(
        """INSERT INTO llm_logs
           (model, input_tokens, output_tokens, cost_sgd, latency_ms,
            prompt_id, user_id, prompt_text, response_text, is_error, error_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,NULL)""",
        body.model, body.input_tokens, body.output_tokens, body.cost_sgd,
        body.latency_ms, body.prompt_id, body.user_id,
        body.prompt_text, body.response_text,
    )
    return {"ok": True}


class RunQueryBody(BaseModel):
    query: str


@router.post("/run-query")
async def run_query(body: RunQueryBody):
    q = body.query.strip()

    if not q.lower().startswith("select"):
        raise HTTPException(status_code=400, detail="Only SELECT statements are allowed.")

    if _BLOCKED.search(q):
        raise HTTPException(status_code=400, detail="Query contains disallowed keywords.")

    pool = await get_pool()
    import time
    start = time.monotonic()
    try:
        rows = await pool.fetch(q)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    elapsed_ms = int((time.monotonic() - start) * 1000)
    if not rows:
        return {"columns": [], "rows": [], "row_count": 0, "elapsed_ms": elapsed_ms}

    columns = list(rows[0].keys())
    data = [list(r.values()) for r in rows]

    def _serialize(v):
        if isinstance(v, (datetime,)):
            return v.isoformat()
        return v

    data = [[_serialize(v) for v in row] for row in data]
    return {"columns": columns, "rows": data, "row_count": len(data), "elapsed_ms": elapsed_ms}
