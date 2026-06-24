import React from 'react'
import { useApi } from '../hooks/useApi'

const PRICING = {
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.00  },
  'claude-opus-4-6':    { input: 15.00, output: 75.00 },
}
const USD_TO_SGD = 1.35

function CodeBlock({ children }) {
  return (
    <pre className="bg-slate-900 border border-slate-700 rounded p-4 text-xs text-emerald-300 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3">
      <div className="text-slate-400 text-xs uppercase tracking-widest border-b border-slate-700 pb-2">{title}</div>
      {children}
    </div>
  )
}

export default function Settings() {
  const { data: budget } = useApi('/analytics/budget')

  const proxyUrl = 'http://localhost:8001/v1/messages'

  return (
    <div className="space-y-5 max-w-3xl">
      <Section title="Budget Configuration">
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm">Monthly limit:</span>
          <span className="text-cyan-400 font-bold text-lg">
            SGD {budget?.limit?.toFixed(2) ?? '—'}
          </span>
        </div>
        <p className="text-slate-500 text-xs">
          Set via <code className="text-emerald-300">BUDGET_LIMIT_SGD</code> env var in{' '}
          <code className="text-emerald-300">.env</code>. Resets on the 1st of each month.
        </p>
      </Section>

      <Section title="Proxy Endpoint">
        <p className="text-slate-400 text-sm">Point your app at this URL instead of the Anthropic API:</p>
        <CodeBlock>{proxyUrl}</CodeBlock>
      </Section>

      <Section title="How to Use This Proxy">
        <p className="text-slate-400 text-sm">Python (Anthropic SDK):</p>
        <CodeBlock>{`import anthropic

client = anthropic.Anthropic(
    api_key="your-anthropic-key",
    base_url="http://localhost:8000",
)

message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
    extra_headers={
        "X-Prompt-ID": "my-feature",
        "X-User-ID": "alice",
    },
)
`}</CodeBlock>

        <p className="text-slate-400 text-sm mt-3">cURL:</p>
        <CodeBlock>{`curl http://localhost:8000/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "X-Prompt-ID: test" \\
  -d '{"model":"claude-sonnet-4-6","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'
`}</CodeBlock>
      </Section>

      <Section title="Model Pricing Table (USD per million tokens → SGD)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-widest border-b border-slate-700">
                <th className="text-left pb-2">Model</th>
                <th className="text-right pb-2">Input (USD/M)</th>
                <th className="text-right pb-2">Output (USD/M)</th>
                <th className="text-right pb-2">Input (SGD/M)</th>
                <th className="text-right pb-2">Output (SGD/M)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(PRICING).map(([model, rates]) => (
                <tr key={model} className="border-b border-slate-700/40">
                  <td className="py-2 text-cyan-400">{model}</td>
                  <td className="py-2 text-right text-slate-300">${rates.input.toFixed(2)}</td>
                  <td className="py-2 text-right text-slate-300">${rates.output.toFixed(2)}</td>
                  <td className="py-2 text-right text-emerald-400">${(rates.input * USD_TO_SGD).toFixed(2)}</td>
                  <td className="py-2 text-right text-emerald-400">${(rates.output * USD_TO_SGD).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-slate-600 text-xs">USD→SGD rate: {USD_TO_SGD}</p>
      </Section>
    </div>
  )
}
