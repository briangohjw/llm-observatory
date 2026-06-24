import asyncpg
import os
from typing import Optional

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.environ["POSTGRES_URL"],
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS llm_logs (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model           TEXT NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_sgd        NUMERIC(12, 6) NOT NULL DEFAULT 0,
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    prompt_id       TEXT,
    user_id         TEXT,
    prompt_text     TEXT,
    response_text   TEXT,
    is_error        BOOLEAN NOT NULL DEFAULT FALSE,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS llm_logs_created_at_idx ON llm_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS llm_logs_model_idx ON llm_logs (model);
CREATE INDEX IF NOT EXISTS llm_logs_prompt_id_idx ON llm_logs (prompt_id);
"""
