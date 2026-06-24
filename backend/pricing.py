PRICING = {
    "claude-sonnet-4-6":        {"input": 3.00,  "output": 15.00},
    "claude-haiku-4-5":         {"input": 0.80,  "output": 4.00},
    "claude-opus-4-6":          {"input": 15.00, "output": 75.00},
    "claude-opus-4-5":          {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-5":        {"input": 3.00,  "output": 15.00},
    "claude-haiku-4-5-20251001":{"input": 0.80,  "output": 4.00},
}

USD_TO_SGD = 1.35


def calculate_cost_sgd(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = PRICING.get(model, {"input": 3.00, "output": 15.00})
    cost_usd = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
    return round(cost_usd * USD_TO_SGD, 6)
