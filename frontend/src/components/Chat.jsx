import React, { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../hooks/useApi'

const MODELS = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-opus-4-6',
]

const MODEL_COLORS = {
  'claude-sonnet-4-6': 'text-cyan-400',
  'claude-haiku-4-5':  'text-emerald-400',
  'claude-opus-4-6':   'text-amber-400',
}

// Realistic mock responses keyed loosely by topic
const MOCK_RESPONSES = [
  {
    match: /haiku|fast|cheap|cost/i,
    text: `claude-haiku-4-5 is optimised for speed and low cost. It uses a smaller parameter count than Sonnet or Opus, which means:

• **TTFT** is typically 200–400ms (vs 600–900ms for Sonnet)
• **Throughput** runs at 80–120 tok/s on uncongested API
• **Cost** is ~15× cheaper than Opus per token

Best for: classification, extraction, short Q&A, high-volume pipelines where quality tolerance is moderate.`,
    inputTokens: 38,
    outputTokens: 92,
  },
  {
    match: /ttft|latency|slow|performance/i,
    text: `**Time-to-first-token (TTFT)** and **total latency** measure different things:

- **TTFT** — how long before the *first* output token arrives. Driven by model size, prompt length, and server load. This is what users *feel* as "thinking time".
- **Total latency** — full round-trip until the last token. TTFT + (output_tokens / throughput).

For streaming UIs, optimise TTFT first — users tolerate slow generation far better than a frozen screen. For batch jobs, total latency matters more.

Rule of thumb: if TTFT > 1.5s, either your prompt is too long or you should switch to Haiku.`,
    inputTokens: 52,
    outputTokens: 148,
  },
  {
    match: /token|prompt|context|input/i,
    text: `Token costs scale linearly with input length, so prompt bloat is the #1 cost driver in production.

Common culprits:
1. Injecting entire documents when only a section is needed
2. Accumulating chat history without truncation
3. Verbose system prompts repeated every call

Mitigation strategies:
- Use retrieval (RAG) to inject only relevant chunks
- Summarise history beyond N turns instead of raw replay
- Keep system prompts under 500 tokens — measure with \`anthropic.count_tokens()\`

At claude-sonnet-4-6 rates (SGD 4.05/M input), a 10k-token prompt on every call costs ~SGD 0.04 each. At 1,000 calls/day that's SGD 40/day just in prompt overhead.`,
    inputTokens: 61,
    outputTokens: 187,
  },
  {
    match: /sql|database|query|postgres/i,
    text: `The SQL Explorer in this dashboard runs read-only SELECT queries directly against the \`llm_logs\` table. Useful for ad-hoc analysis:

\`\`\`sql
-- Cost per hour today
SELECT DATE_TRUNC('hour', created_at) AS hour,
       SUM(cost_sgd) AS cost,
       COUNT(*) AS requests
FROM llm_logs
WHERE created_at >= CURRENT_DATE
GROUP BY 1 ORDER BY 1;
\`\`\`

The proxy blocks INSERT/UPDATE/DELETE/DROP at the regex level before the query hits Postgres. For production, you'd want a read-only DB user as a second layer of defence.`,
    inputTokens: 44,
    outputTokens: 134,
  },
  {
    match: /budget|cost|expensive|price|sgd|money/i,
    text: `The budget system works on a rolling calendar-month window:

1. Before proxying each request, the backend sums \`cost_sgd\` for all non-error rows since the 1st of the current month.
2. If \`spent >= BUDGET_LIMIT_SGD\`, it returns HTTP 429 immediately — the request never reaches Anthropic.
3. The limit resets at midnight on the 1st.

Set it via \`BUDGET_LIMIT_SGD=25.00\` in your \`.env\`. The budget meter on the Overview tab colour-shifts cyan → amber → red as you approach the limit.

For teams: consider setting per-environment limits (dev=5, staging=20, prod=unlimited) by running separate proxy instances.`,
    inputTokens: 57,
    outputTokens: 156,
  },
  {
    // default fallback
    match: /.*/,
    text: `This is a **mock response** — the Anthropic API key isn't configured, so the Chat tab simulates realistic LLM behaviour for demo purposes.

The stats below (TTFT, latency, tokens/sec, cost) are calculated from real timing of this simulated stream, then logged to Postgres exactly as a real request would be. Switch to the **Queries** tab and you'll see this conversation appear in the log.

To use the real API: add \`ANTHROPIC_API_KEY=sk-ant-...\` to your \`.env\` file and restart with \`docker compose down && docker compose up\`.`,
    inputTokens: 74,
    outputTokens: 201,
  },
]

// Model-specific timing profiles (ms per token for streaming simulation)
const MODEL_PROFILE = {
  'claude-sonnet-4-6': { ttft: [500, 900],  msPerToken: [8, 14]  },
  'claude-haiku-4-5':  { ttft: [150, 350],  msPerToken: [5, 9]   },
  'claude-opus-4-6':   { ttft: [800, 1500], msPerToken: [14, 22] },
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickResponse(text) {
  return MOCK_RESPONSES.find(r => r.match.test(text)) ?? MOCK_RESPONSES[MOCK_RESPONSES.length - 1]
}

function StatPill({ label, value, color = 'text-slate-300', highlight = false }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded ${highlight ? 'bg-slate-700' : 'bg-slate-800'}`}>
      <span className="text-slate-500 text-xs uppercase tracking-widest leading-none mb-0.5">{label}</span>
      <span className={`font-bold text-sm tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const s = msg.stats

  // Render markdown-lite: bold, code blocks, bullet points
  const renderText = (text) => {
    return text.split('\n').map((line, i) => {
      // code block lines
      if (line.startsWith('```') || line.startsWith('    ')) {
        return <code key={i} className="block bg-slate-900 rounded px-2 py-0.5 text-emerald-300 text-xs my-0.5">{line.replace(/```\w*/, '').trim() || line}</code>
      }
      // bold **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g)
      return (
        <span key={i} className="block leading-relaxed">
          {parts.map((p, j) =>
            p.startsWith('**') && p.endsWith('**')
              ? <strong key={j} className="text-slate-100">{p.slice(2, -2)}</strong>
              : p
          )}
        </span>
      )
    })
  }

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-slate-700 text-slate-100'
          : 'bg-slate-800 border border-slate-700 text-slate-300'
      }`}>
        {msg.content
          ? (isUser ? msg.content : renderText(msg.content))
          : <span className="animate-pulse text-slate-500">▋</span>}
      </div>

      {!isUser && s && (
        <div className="flex flex-wrap gap-1.5 max-w-[82%]">
          {s.ttft != null && (
            <StatPill
              label="TTFT"
              value={`${s.ttft}ms`}
              color={s.ttft < 500 ? 'text-emerald-400' : s.ttft < 1200 ? 'text-amber-400' : 'text-red-400'}
              highlight
            />
          )}
          {s.latency != null && (
            <StatPill label="Latency" value={`${s.latency}ms`} color="text-slate-300" />
          )}
          {s.tokensPerSec != null && (
            <StatPill label="tok/s" value={s.tokensPerSec} color="text-cyan-400" />
          )}
          {s.inputTokens != null && (
            <StatPill label="In tok" value={s.inputTokens} color="text-slate-400" />
          )}
          {s.outputTokens != null && (
            <StatPill label="Out tok" value={s.outputTokens} color="text-emerald-400" />
          )}
          {s.cost != null && (
            <StatPill label="Cost SGD" value={s.cost.toFixed(5)} color="text-amber-400" highlight />
          )}
          {s.model && (
            <StatPill label="Model" value={s.model} color={MODEL_COLORS[s.model] ?? 'text-slate-300'} />
          )}
          {s.mock && (
            <div className="flex items-center px-2 py-1 rounded bg-slate-800 text-slate-600 text-xs">
              simulated
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [promptId, setPromptId] = useState('playground')
  const [userId, setUserId] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const bottomRef = useRef(null)
  const abortRef  = useRef(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    cancelRef.current = false

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    const assistantId = Date.now()
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      stats: { streaming: true, model },
    }])
    setStreaming(true)

    const profile   = MODEL_PROFILE[model]
    const mock      = pickResponse(text)
    const fullText  = mock.text
    const inputToks = mock.inputTokens + Math.floor(text.length / 4)
    const outputToks = mock.outputTokens

    const startMs = performance.now()

    // Simulate TTFT delay
    const ttftMs = rand(...profile.ttft)
    await new Promise(r => setTimeout(r, ttftMs))
    if (cancelRef.current) return

    const ttft = Math.round(performance.now() - startMs)

    // Stream text token-by-token with realistic per-token delay
    const words = fullText.split('')
    let accText = ''
    const msPerChar = rand(...profile.msPerToken) / 4  // chars ≈ tokens/4

    for (let i = 0; i < words.length; i++) {
      if (cancelRef.current) break
      accText += words[i]

      const elapsed   = (performance.now() - startMs) / 1000
      const charsOut  = i + 1
      const tps       = elapsed > 0 ? Math.round((charsOut / 4) / elapsed) : 0
      const cost      = calcCost(model, inputToks, Math.round(charsOut / 4))

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? {
          ...m,
          content: accText,
          stats: { streaming: true, model, ttft, inputTokens: inputToks, outputTokens: Math.round(charsOut / 4), tokensPerSec: tps, cost },
        } : m
      ))

      // batch chars for smoother render
      const batchSize = rand(2, 5)
      if (i % batchSize === 0) {
        await new Promise(r => setTimeout(r, msPerChar * batchSize))
      }
    }

    if (cancelRef.current) {
      setStreaming(false)
      return
    }

    const latency    = Math.round(performance.now() - startMs)
    const finalTps   = latency > 0 ? Math.round(outputToks / (latency / 1000)) : 0
    const finalCost  = calcCost(model, inputToks, outputToks)

    setMessages(prev => prev.map(m =>
      m.id === assistantId ? {
        ...m,
        content: fullText,
        streaming: false,
        stats: { mock: true, model, ttft, latency, inputTokens: inputToks, outputTokens: outputToks, tokensPerSec: finalTps, cost: finalCost },
      } : m
    ))

    // Log to backend so it appears in Queries / Overview
    try {
      await apiFetch('/analytics/mock-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input_tokens: inputToks,
          output_tokens: outputToks,
          cost_sgd: finalCost,
          latency_ms: latency,
          prompt_id: promptId || null,
          user_id: userId || null,
          prompt_text: text,
          response_text: fullText,
        }),
      })
    } catch (_) { /* non-fatal */ }

    setStreaming(false)
  }

  const stop = () => {
    cancelRef.current = true
    setStreaming(false)
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m))
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className={`bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 ${MODEL_COLORS[model]}`}
        >
          {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <button
          onClick={() => setShowConfig(v => !v)}
          className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded text-xs text-slate-400"
        >
          {showConfig ? '▲ Tags' : '▼ Tags'}
        </button>

        <div className="ml-2 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-500">
          ⚡ simulated — no API key needed
        </div>

        <div className="flex-1" />
        <button
          onClick={() => !streaming && setMessages([])}
          disabled={streaming}
          className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-500 disabled:opacity-40 rounded text-xs text-slate-400"
        >
          Clear
        </button>
      </div>

      {showConfig && (
        <div className="flex gap-3 mb-3 p-3 bg-slate-800/60 border border-slate-700 rounded-lg">
          <div className="flex-1">
            <label className="text-xs text-slate-500 uppercase tracking-widest block mb-1">X-Prompt-ID</label>
            <input
              value={promptId}
              onChange={e => setPromptId(e.target.value)}
              placeholder="playground"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-600"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 uppercase tracking-widest block mb-1">X-User-ID</label>
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="your name"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-600"
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-3">
            <span className="text-3xl">◈</span>
            <span>Ask anything — stats appear per message, responses log to Postgres.</span>
            <div className="flex gap-2 mt-1 flex-wrap justify-center">
              {[
                'Why is haiku faster than sonnet?',
                'Explain TTFT vs total latency',
                'How does the budget system work?',
                'Show me a useful SQL query',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-cyan-700 rounded text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => <MessageBubble key={msg.id ?? i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={streaming}
          rows={3}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          className="flex-1 bg-slate-800 border border-slate-700 focus:border-cyan-600 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-none disabled:opacity-50"
        />
        <button
          onClick={streaming ? stop : send}
          className={`px-5 py-3 rounded-lg text-sm font-bold transition-colors ${
            streaming
              ? 'bg-red-900 hover:bg-red-800 text-red-300'
              : 'bg-cyan-700 hover:bg-cyan-600 text-white'
          }`}
        >
          {streaming ? '■ Stop' : '▶ Send'}
        </button>
      </div>
    </div>
  )
}

const PRICING = {
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.00  },
  'claude-opus-4-6':   { input: 15.00, output: 75.00 },
}
const USD_TO_SGD = 1.35

function calcCost(model, inputTok, outputTok) {
  const r = PRICING[model] ?? { input: 3.00, output: 15.00 }
  return ((inputTok * r.input + outputTok * r.output) / 1_000_000) * USD_TO_SGD
}
