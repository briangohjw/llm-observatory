import json
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from database import get_pool
from pricing import calculate_cost_sgd

router = APIRouter()

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
BUDGET_LIMIT_SGD = float(os.environ.get("BUDGET_LIMIT_SGD", "10.00"))



async def get_monthly_spend(pool) -> float:
    now = datetime.now(timezone.utc)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    result = await pool.fetchval(
        "SELECT COALESCE(SUM(cost_sgd), 0) FROM llm_logs WHERE created_at >= $1 AND is_error = FALSE",
        first_of_month,
    )
    return float(result)


def _extract_text(body: dict) -> str:
    messages = body.get("messages", [])
    parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if isinstance(content, str):
            parts.append(f"{role}: {content}")
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(f"{role}: {block.get('text', '')}")
    return "\n\n".join(parts)


@router.post("/v1/messages")
async def proxy_messages(
    request: Request,
    x_prompt_id: str = Header(None, alias="X-Prompt-ID"),
    x_user_id: str = Header(None, alias="X-User-ID"),
):
    pool = await get_pool()

    spend = await get_monthly_spend(pool)
    if spend >= BUDGET_LIMIT_SGD:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "monthly_budget_exceeded",
                "message": f"Monthly budget of SGD {BUDGET_LIMIT_SGD:.2f} exceeded. Spent: SGD {spend:.2f}.",
                "spent_sgd": spend,
                "limit_sgd": BUDGET_LIMIT_SGD,
            },
        )

    body_bytes = await request.body()
    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    model = body.get("model", "claude-sonnet-4-6")
    prompt_text = _extract_text(body)
    stream = body.get("stream", False)

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    start_ms = time.monotonic()

    if stream:
        return await _handle_streaming(
            body, body_bytes, headers, model, prompt_text,
            x_prompt_id, x_user_id, pool, start_ms
        )
    else:
        return await _handle_non_streaming(
            body_bytes, headers, model, prompt_text,
            x_prompt_id, x_user_id, pool, start_ms
        )


async def _handle_non_streaming(
    body_bytes, headers, model, prompt_text,
    prompt_id, user_id, pool, start_ms
):
    is_error = False
    error_message = None
    input_tokens = 0
    output_tokens = 0
    response_text = None

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(ANTHROPIC_API_URL, content=body_bytes, headers=headers)
        latency_ms = int((time.monotonic() - start_ms) * 1000)

        resp_body = resp.json()

        if resp.status_code != 200:
            is_error = True
            error_message = resp_body.get("error", {}).get("message", resp.text)
        else:
            usage = resp_body.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            content_blocks = resp_body.get("content", [])
            response_text = " ".join(
                b.get("text", "") for b in content_blocks if b.get("type") == "text"
            )

    except Exception as e:
        latency_ms = int((time.monotonic() - start_ms) * 1000)
        is_error = True
        error_message = str(e)
        resp_body = {"error": {"type": "proxy_error", "message": error_message}}
        resp = None

    cost = calculate_cost_sgd(model, input_tokens, output_tokens)

    await pool.execute(
        """INSERT INTO llm_logs
           (model, input_tokens, output_tokens, cost_sgd, latency_ms,
            prompt_id, user_id, prompt_text, response_text, is_error, error_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
        model, input_tokens, output_tokens, cost, latency_ms,
        prompt_id, user_id, prompt_text, response_text, is_error, error_message,
    )

    from fastapi.responses import JSONResponse
    status = resp.status_code if resp is not None else 500
    return JSONResponse(content=resp_body, status_code=status)


async def _handle_streaming(
    body, body_bytes, headers, model, prompt_text,
    prompt_id, user_id, pool, start_ms
):
    collected_text = []
    input_tokens = 0
    output_tokens = 0
    is_error = False
    error_message = None

    async def event_generator():
        nonlocal input_tokens, output_tokens, is_error, error_message

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", ANTHROPIC_API_URL, content=body_bytes, headers=headers) as resp:
                    if resp.status_code != 200:
                        raw = await resp.aread()
                        try:
                            err_msg = json.loads(raw).get("error", {}).get("message", f"HTTP {resp.status_code}")
                        except Exception:
                            err_msg = f"HTTP {resp.status_code}: {raw.decode()[:200]}"
                        is_error = True
                        error_message = err_msg
                        yield f"data: {json.dumps({'type': 'error', 'error': {'message': err_msg}})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line:
                            yield "\n"
                            continue
                        yield line + "\n"
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                continue
                            try:
                                data = json.loads(data_str)
                                etype = data.get("type", "")
                                if etype == "content_block_delta":
                                    delta = data.get("delta", {})
                                    if delta.get("type") == "text_delta":
                                        collected_text.append(delta.get("text", ""))
                                elif etype == "message_delta":
                                    usage = data.get("usage", {})
                                    output_tokens = usage.get("output_tokens", output_tokens)
                                elif etype == "message_start":
                                    msg = data.get("message", {})
                                    usage = msg.get("usage", {})
                                    input_tokens = usage.get("input_tokens", 0)
                                elif etype == "error":
                                    is_error = True
                                    error_message = data.get("error", {}).get("message", "stream error")
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            is_error = True
            error_message = str(e)
            yield f"data: {json.dumps({'type': 'error', 'error': {'message': str(e)}})}\n"

        latency_ms = int((time.monotonic() - start_ms) * 1000)
        response_text = "".join(collected_text) or None
        cost = calculate_cost_sgd(model, input_tokens, output_tokens)

        await pool.execute(
            """INSERT INTO llm_logs
               (model, input_tokens, output_tokens, cost_sgd, latency_ms,
                prompt_id, user_id, prompt_text, response_text, is_error, error_message)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            model, input_tokens, output_tokens, cost, latency_ms,
            prompt_id, user_id, prompt_text, response_text, is_error, error_message,
        )

    return StreamingResponse(event_generator(), media_type="text/event-stream")
