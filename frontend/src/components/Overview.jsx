import React from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useApi } from '../hooks/useApi'

function StatCard({ label, value, sub, color = 'cyan' }) {
  const colors = {
    cyan: 'text-cyan-400 border-cyan-800',
    emerald: 'text-emerald-400 border-emerald-800',
    amber: 'text-amber-400 border-amber-800',
    red: 'text-red-400 border-red-800',
  }
  return (
    <div className={`bg-slate-800 border rounded-lg p-4 border-l-2 ${colors[color]}`}>
      <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color].split(' ')[0]}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  )
}

function BudgetMeter({ spent, limit, remaining, percent }) {
  const color =
    percent >= 90 ? 'bg-red-500' :
    percent >= 70 ? 'bg-amber-400' :
    'bg-cyan-400'
  const textColor =
    percent >= 90 ? 'text-red-400' :
    percent >= 70 ? 'text-amber-400' :
    'text-cyan-400'

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-slate-400 text-xs uppercase tracking-widest">Monthly Budget</span>
        <span className={`text-sm font-bold ${textColor}`}>{percent}% used</span>
      </div>
      <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className={`font-bold ${textColor}`}>SGD {spent?.toFixed(2)} / {limit?.toFixed(2)}</span>
        <span className="text-slate-400">SGD {remaining?.toFixed(2)} remaining</span>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded p-2 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
        </div>
      ))}
    </div>
  )
}

export default function Overview() {
  const { data: summary } = useApi('/analytics/summary?since=7d', 10000)
  const { data: budget } = useApi('/analytics/budget', 10000)

  const totalCost = summary?.reduce((s, r) => s + Number(r.cost), 0) ?? 0
  const totalReqs = summary?.reduce((s, r) => s + Number(r.requests), 0) ?? 0
  const avgLatency = summary?.length
    ? summary.reduce((s, r) => s + Number(r.avg_latency), 0) / summary.length
    : 0
  const errorRate = summary?.length
    ? summary.reduce((s, r) => s + Number(r.error_rate), 0) / summary.length
    : 0

  const chartData = (summary || []).map(r => ({
    day: r.day?.slice(5) ?? '',
    cost: Number(r.cost).toFixed(4),
    requests: Number(r.requests),
  }))

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Cost (7d)"
          value={`SGD ${totalCost.toFixed(4)}`}
          sub="This week"
          color="cyan"
        />
        <StatCard
          label="Total Requests (7d)"
          value={totalReqs.toLocaleString()}
          sub="This week"
          color="emerald"
        />
        <StatCard
          label="Avg Latency"
          value={`${avgLatency.toFixed(0)} ms`}
          sub="7-day average"
          color={avgLatency > 3000 ? 'amber' : 'cyan'}
        />
        <StatCard
          label="Error Rate"
          value={`${(errorRate * 100).toFixed(1)}%`}
          sub="7-day average"
          color={errorRate > 0.05 ? 'red' : 'emerald'}
        />
      </div>

      {/* Budget meter */}
      {budget && (
        <BudgetMeter
          spent={budget.spent}
          limit={budget.limit}
          remaining={budget.remaining}
          percent={budget.percent_used}
        />
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase tracking-widest mb-4">Cost / Day (SGD)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis stroke="#475569" tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ fill: '#22d3ee', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase tracking-widest mb-4">Requests / Day</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis stroke="#475569" tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="requests" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="text-slate-600 text-xs text-right">Auto-refreshes every 10s</div>
    </div>
  )
}
