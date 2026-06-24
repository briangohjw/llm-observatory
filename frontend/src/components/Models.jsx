import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useApi } from '../hooks/useApi'

const COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-slate-800 border border-slate-600 rounded p-2 text-xs">
      <div style={{ color: d.payload.fill }}>{d.name}</div>
      <div className="text-slate-300">SGD {Number(d.value).toFixed(4)}</div>
    </div>
  )
}

export default function Models() {
  const { data, loading } = useApi('/analytics/models')

  if (loading) return <div className="text-slate-500 text-sm">Loading...</div>
  if (!data?.length) return <div className="text-slate-500 text-sm">No data yet.</div>

  const pieData = data.map((r, i) => ({
    name: r.model,
    value: Number(r.cost_sgd),
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-widest">
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-right px-4 py-3">Reqs</th>
                <th className="text-right px-4 py-3">In Tok</th>
                <th className="text-right px-4 py-3">Out Tok</th>
                <th className="text-right px-4 py-3">Cost SGD</th>
                <th className="text-right px-4 py-3">Avg ms</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={r.model} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-3">
                    <span style={{ color: COLORS[i % COLORS.length] }}>{r.model}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">{Number(r.requests).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{Number(r.input_tokens).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{Number(r.output_tokens).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-cyan-400 font-bold">{Number(r.cost_sgd).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{Number(r.avg_latency_ms).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Donut chart */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase tracking-widest mb-4">Cost Split by Model</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
