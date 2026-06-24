import random
import asyncpg
from datetime import datetime, timedelta, timezone
from pricing import calculate_cost_sgd

MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-6"]
PROMPT_IDS = ["summarizer", "classifier", "extractor", "qa-bot", "code-gen", None]
USER_IDS = ["alice", "bob", "charlie", "dave", None]

SAMPLE_PROMPTS = [
    "Summarize the following article in 3 bullet points: ...",
    "Classify this customer feedback as positive, neutral, or negative.",
    "Extract all named entities from this text.",
    "Answer the following question based on the document: What is the refund policy?",
    "Write a Python function that parses a JSON file and returns a list of unique values.",
    "Translate the following paragraph to French.",
    "What are the key risks mentioned in this financial report?",
    "Generate a product description for a wireless keyboard with RGB lighting.",
    "Debug this code: for i in range(10) print(i)",
    "Create a SQL query to find the top 10 customers by revenue last month.",
]

SAMPLE_RESPONSES = [
    "Here are 3 key bullet points from the article:\n• Point one about the main topic\n• Point two about implications\n• Point three about conclusions",
    "The sentiment of this feedback is: Positive. The customer expressed satisfaction with the product.",
    "Named entities found: Organization: Acme Corp, Person: John Smith, Location: Singapore",
    "Based on the document, the refund policy allows returns within 30 days of purchase.",
    "```python\nimport json\n\ndef parse_unique_values(filepath):\n    with open(filepath) as f:\n        data = json.load(f)\n    return list(set(data.values()))\n```",
    "Voici la traduction du paragraphe en français: ...",
    "The key risks identified in the report are: 1) Market volatility 2) Regulatory changes 3) Supply chain disruption",
    "Introducing the UltraType Pro Wireless Keyboard — experience seamless typing with vibrant RGB lighting that adapts to your mood.",
    "The error is a missing colon after `range(10)`. Corrected: `for i in range(10): print(i)`",
    "SELECT customer_id, SUM(revenue) as total_revenue FROM orders WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') GROUP BY customer_id ORDER BY total_revenue DESC LIMIT 10;",
]


async def seed_if_empty(pool: asyncpg.Pool):
    count = await pool.fetchval("SELECT COUNT(*) FROM llm_logs")
    if count and count > 0:
        return

    now = datetime.now(timezone.utc)
    rows = []
    for i in range(50):
        days_ago = random.randint(0, 29)
        hours_ago = random.randint(0, 23)
        created_at = now - timedelta(days=days_ago, hours=hours_ago, minutes=random.randint(0, 59))

        model = random.choices(MODELS, weights=[5, 3, 2])[0]
        input_tokens = random.randint(100, 4000)
        output_tokens = random.randint(50, 1500)
        latency_ms = random.randint(200, 4000)
        is_error = random.random() < 0.05
        prompt_id = random.choice(PROMPT_IDS)
        user_id = random.choice(USER_IDS)
        cost = calculate_cost_sgd(model, input_tokens, output_tokens)

        rows.append((
            created_at,
            model,
            input_tokens,
            output_tokens,
            cost,
            latency_ms,
            prompt_id,
            user_id,
            random.choice(SAMPLE_PROMPTS),
            None if is_error else random.choice(SAMPLE_RESPONSES),
            is_error,
            "API timeout" if is_error else None,
        ))

    await pool.executemany(
        """INSERT INTO llm_logs
           (created_at, model, input_tokens, output_tokens, cost_sgd, latency_ms,
            prompt_id, user_id, prompt_text, response_text, is_error, error_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
        rows,
    )
    print(f"Seeded {len(rows)} rows into llm_logs")
