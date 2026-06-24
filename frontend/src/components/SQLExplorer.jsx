import React, { useState } from 'react'
import { apiFetch } from '../hooks/useApi'

const EXAMPLE_QUERIES = [
  {
    label: 'Top 5 most expensive prompts',
    sql: `SELECT prompt_id, SUM(cost_sgd) AS total_cost, COUNT(*) AS requests
FROM llm_logs
WHERE prompt_id IS NOT NULL
GROUP BY prompt_id
ORDER BY total_cost DESC
LIMIT 5;`,
  },
  {
    label: 'Average latency by model',
    sql: `SELECT model, AVG(latency_ms) AS avg_latency_ms, COUNT(*) AS requests
FROM llm_logs
GROUP BY model
ORDER BY avg_latency_ms DESC;`,
  },
  {
    label: 'Requests per hour today',
    sql: `SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*) AS requests
FROM llm_logs
WHERE created_at >= CURRENT_DATE
GROUP BY hour
ORDER BY hour;`,
  },
  {
    label: 'Error rate last 7 days',
    sql: `SELECT DATE(created_at) AS day,
       COUNT(*) AS total,
       SUM(CASE WHEN is_error THEN 1 ELSE 0 END) AS errors,
       ROUND(SUM(CASE WHEN is_error THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) AS error_pct
FROM llm_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY day
ORDER BY day;`,
  },
]

export default function SQLExplorer() {
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0].sql)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiFetch('/analytics/run-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  }

  return (
    <div className="space-y-4">
      {/* Example queries */}
      <div>
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-2">Example Queries</div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map(ex => (
            <button
              key={ex.label}
              onClick={() => setQuery(ex.sql)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-cyan-600 rounded text-xs text-slate-300 hover:text-cyan-400 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-800/80">
          <span className="text-slate-400 text-xs uppercase tracking-widest">SQL Editor</span>
          <div className="flex items-center gap-3">
            <span className="text-slate-600 text-xs">Ctrl+Enter to run</span>
            <button
              onClick={run}
              disabled={loading}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-xs font-bold text-white transition-colors"
            >
              {loading ? 'Running…' : '▶ Run'}
            </button>
          </div>
        </div>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
          rows={10}
          className="w-full bg-slate-900 text-emerald-300 text-sm p-4 resize-y focus:outline-none font-mono"
          style={{ fontFamily: '"JetBrains Mono", Consolas, monospace' }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-700 text-xs text-slate-400">
            <span>{result.row_count} row{result.row_count !== 1 ? 's' : ''}</span>
            <span>{result.elapsed_ms} ms</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {result.columns.map(col => (
                    <th key={col} className="text-left px-3 py-2 text-xs uppercase tracking-widest text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-700/40 hover:bg-slate-700/30">
                    {row.map((val, j) => (
                      <td key={j} className="px-3 py-2 text-slate-300 whitespace-nowrap">
                        {val === null ? <span className="text-slate-600">NULL</span> : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
