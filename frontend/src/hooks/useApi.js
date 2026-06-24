import { useState, useEffect, useCallback } from 'react'

const BASE = ''

export function useApi(path, interval = null) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(BASE + path)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    fetch_()
    if (!interval) return
    const id = setInterval(fetch_, interval)
    return () => clearInterval(id)
  }, [fetch_, interval])

  return { data, error, loading, refresh: fetch_ }
}

export async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  const json = await res.json()
  if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
  return json
}
