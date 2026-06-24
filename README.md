# LLM Observatory

A self-hosted proxy and monitoring dashboard for the Anthropic API. Every LLM call your application makes flows through it, gets logged to Postgres, and surfaces in a real-time dashboard — giving you full visibility into cost, latency, and token usage as it happens.

![Overview](https://res.cloudinary.com/dsvbbow4f/image/upload/v1782320091/Screenshot_2026-06-25_at_12.38.24_AM_sreq43.png)

![Video](https://res.cloudinary.com/dsvbbow4f/image/upload/v1782320091/Screenshot_2026-06-25_at_12.38.24_AM_sreq43.png)

LLM costs are billed per token and accumulate fast — a prompt that works fine in testing can get expensive at scale if it's longer than it needs to be, or if you're on a heavier model where a lighter one would do. Having spend broken down by model and feature, updating in real time, makes it possible to catch those issues early.

## Features

- **Proxy** — drop-in replacement for the Anthropic API endpoint, zero changes to your SDK calls
- **Cost tracking** — per-request cost in SGD, broken down by model and prompt ID
- **Latency metrics** — TTFT (time-to-first-token) and total latency tracked separately per query
- **Budget guard** — configurable monthly spend cap; blocks requests with 429 when exceeded
- **Query log** — full audit trail with prompt text, response text, tokens, cost, and latency per request
- **Chat playground** — send messages and see per-query stats live as the response streams in
- **SQL Explorer** — run read-only queries directly against the log table

## Quick start

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

docker compose up --build
```

- Dashboard: http://localhost:3000
- Backend API: http://localhost:8001

On first start, 50 realistic seed rows are inserted so the dashboard looks populated immediately.

## Point your app at the proxy

Replace `https://api.anthropic.com` with `http://localhost:8001` in your Anthropic client:

```python
import anthropic

client = anthropic.Anthropic(
    api_key="your-key",
    base_url="http://localhost:8001",
)

message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
    extra_headers={
        "X-Prompt-ID": "my-feature",  # tag by feature — visible in dashboard
        "X-User-ID": "alice",          # tag by user — visible in dashboard
    },
)
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Forwarded to Anthropic for all proxied requests |
| `BUDGET_LIMIT_SGD` | `10.00` | Monthly spend cap in SGD |
| `POSTGRES_URL` | set by compose | PostgreSQL connection string |

## Architecture

```
Your App
   │
   ▼
POST http://localhost:8001/v1/messages   ← FastAPI proxy
   │                    │
   │                    ▼
   ▼              llm_logs (Postgres)
Anthropic API          ▲
                  /analytics/* API
                        ▲
                        │
             http://localhost:3000  ← React + nginx
```

The proxy streams the Anthropic response back to the caller without buffering. Metrics are extracted from the SSE stream as it passes through and written to Postgres only after the stream completes, keeping the critical path clean.

## `llm_logs` schema

| Column | Type | Description |
|---|---|---|
| `id` | bigint | Auto-increment PK |
| `created_at` | timestamptz | Request time |
| `model` | text | Model name |
| `input_tokens` | int | Prompt tokens |
| `output_tokens` | int | Completion tokens |
| `cost_sgd` | numeric | Cost in SGD |
| `latency_ms` | int | End-to-end latency |
| `prompt_id` | text | From `X-Prompt-ID` header |
| `user_id` | text | From `X-User-ID` header |
| `prompt_text` | text | Full prompt |
| `response_text` | text | Full response |
| `is_error` | bool | Whether the request failed |
| `error_message` | text | Error detail if any |

## Stack

Python · FastAPI · PostgreSQL · asyncpg · React · Tailwind · Recharts · Docker Compose
