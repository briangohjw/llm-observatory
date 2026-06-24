import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../hooks/useApi'

const PAGE_SIZE = 20

function Drawer({ row, onClose }) {
  if (!row) return null
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-700 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="text-cyan-400 text-sm font-bold">Query Detail</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <Meta label="Time" value={new Date(row.created_at).toLocaleString()} />
          <Meta label="Model" value={row.model} />
          <Meta label="Prompt ID" value={row.prompt_id ?? '—'} />
          <Meta label="User ID" value={row.user_id ?? '—'} />
          <Meta label="Tokens" value={`${row.input_tokens} in / ${row.output_tokens} out`} />
          <Meta label="Cost SGD" value={Number(row.cost_sgd).toFixed(6)} />
          <Meta label="Latency" value={`${row.latency_ms} ms`} />
          <Meta label="Status" value={row.is_error ? '✗ Error' : '✓ OK'} color={row.is_error ? 'text-red-400' : 'text-emerald-400'} />
          {row.error_message && <Meta label="Error" value={row.error_message} color="text-red-400" />}

          <div>
            <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">Prompt</div>
            <pre className="bg-slate-800 border border-slate-700 rounded p-3 text-xs text-slate-300 whitespace-pre-wrap break-words">
              {row.prompt_text ?? '(none)'}
            </pre>
          </div>
          <div>
            <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">Response</div>
            <pre className="bg-slate-800 border border-slate-700 rounded p-3 text-xs text-slate-300 whitespace-pre-wrap break-words">
              {row.response_text ?? '(none)'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value, color = 'text-slate-200' }) {
  return (
    <div>
      <div className="text-slate-500 text-xs uppercase tracking-widest">{label}</div>
      <div className={`text-sm ${color}`}>{value}</div>
    </div>
  )
}

export default function Queries() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)

  const [filterModel, setFilterModel] = useState('')
  const [filterPromptId, setFilterPromptId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      if (filterModel) params.set('model', filterModel)
      if (filterPromptId) params.set('prompt_id', filterPromptId)
      const data = await apiFetch(`/analytics/queries?${params}`)
      setRows(data.rows)
      setTotal(data.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, filterModel, filterPromptId])

  useEffect(() => { load() }, [load])

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {selected && <Drawer row={selected} onClose={() => setSelected(null)} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48"
          placeholder="Filter by model…"
          value={filterModel}
          onChange={e => { setFilterModel(e.target.value); setPage(0) }}
        />
        <input
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48"
          placeholder="Filter by prompt ID…"
          value={filterPromptId}
          onChange={e => { setFilterPromptId(e.target.value); setPage(0) }}
        />
        <button
          onClick={load}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200"
        >
          Refresh
        </button>
        <span className="text-slate-500 text-sm self-center">{total} total</span>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-widest">
              <th className="text-left px-3 py-3">Time</th>
              <th className="text-left px-3 py-3">Model</th>
              <th className="text-left px-3 py-3">Prompt ID</th>
              <th className="text-left px-3 py-3">User</th>
              <th className="text-right px-3 py-3">In / Out Tok</th>
              <th className="text-right px-3 py-3">Cost SGD</th>
              <th className="text-right px-3 py-3">ms</th>
              <th className="text-center px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-slate-500 text-sm px-3 py-6 text-center">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-slate-500 text-sm px-3 py-6 text-center">No rows.</td></tr>
            ) : rows.map(r => (
              <tr
                key={r.id}
                className="border-b border-slate-700/50 hover:bg-slate-700/40 cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-cyan-400">{r.model}</td>
                <td className="px-3 py-2 text-slate-300">{r.prompt_id ?? <span className="text-slate-600">—</span>}</td>
                <td className="px-3 py-2 text-slate-300">{r.user_id ?? <span className="text-slate-600">—</span>}</td>
                <td className="px-3 py-2 text-right text-slate-400">{r.input_tokens} / {r.output_tokens}</td>
                <td className="px-3 py-2 text-right text-emerald-400 font-bold">{Number(r.cost_sgd).toFixed(6)}</td>
                <td className="px-3 py-2 text-right text-slate-400">{r.latency_ms}</td>
                <td className="px-3 py-2 text-center">
                  {r.is_error
                    ? <span className="text-red-400">✗</span>
                    : <span className="text-emerald-400">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end text-sm">
        <button
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded"
        >
          ← Prev
        </button>
        <span className="text-slate-400">Page {page + 1} / {Math.max(pages, 1)}</span>
        <button
          disabled={page + 1 >= pages}
          onClick={() => setPage(p => p + 1)}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
