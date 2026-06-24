import React, { useState, useEffect } from 'react'
import Overview from './components/Overview'
import Models from './components/Models'
import Queries from './components/Queries'
import SQLExplorer from './components/SQLExplorer'
import Settings from './components/Settings'
import Chat from './components/Chat'

const TABS = ['Overview', 'Chat', 'Models', 'Queries', 'SQL Explorer', 'Settings']

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-slate-400 text-sm">
      {now.toISOString().replace('T', ' ').slice(0, 19)} UTC
    </span>
  )
}

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
    </span>
  )
}

export default function App() {
  const [tab, setTab] = useState('Overview')

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/95 sticky top-0 z-50 backdrop-blur">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold text-lg tracking-tight">
              ◈ LLM Observatory
            </span>
            <PulseDot />
          </div>
          <div className="flex-1" />
          <Clock />
        </div>
        {/* Tab bar */}
        <div className="max-w-screen-2xl mx-auto px-4 flex gap-1 pb-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === t
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Page */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6">
        {tab === 'Overview' && <Overview />}
        {tab === 'Chat' && <Chat />}
        {tab === 'Models' && <Models />}
        {tab === 'Queries' && <Queries />}
        {tab === 'SQL Explorer' && <SQLExplorer />}
        {tab === 'Settings' && <Settings />}
      </main>
    </div>
  )
}
