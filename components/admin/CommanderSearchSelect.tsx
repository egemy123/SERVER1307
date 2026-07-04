'use client'
// components/admin/CommanderSearchSelect.tsx
//
// Searchable commander picker — replaces a plain <select> for R5 assignment.
// Debounces input, calls /api/admin/commanders/search, renders live results.
// Scales to 1000+ commanders since it never loads the full list client-side.

import { useState, useEffect, useRef } from 'react'

export interface SearchedCommander {
  uid:          string
  name:         string
  role:         string
  status:       string
  alliance_id:  string | null
  alliance_tag: string | null
}

interface Props {
  value:        SearchedCommander | null
  onChange:     (commander: SearchedCommander | null) => void
  placeholder?: string
}

const STATUS_BADGE: Record<string, string> = {
  active:     'bg-accent-light text-accent-deep',
  inactive:   'bg-tactical-100 text-tactical-500',
  unassigned: 'bg-amber-100 text-amber-700',
  former:     'bg-tactical-100 text-tactical-400',
}

export default function CommanderSearchSelect({ value, onChange, placeholder }: Props) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchedCommander[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 1) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/admin/commanders/search?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setResults(data.commanders ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (c: SearchedCommander) => {
    onChange(c)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const clear = () => {
    onChange(null)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        <div className="flex items-center justify-between p-3 rounded-xl bg-accent-light border border-accent/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">{value.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tactical-900 truncate">{value.name}</p>
              <p className="text-xs text-tactical-500 font-mono truncate">
                {value.uid} · {value.role.toUpperCase()} · {value.alliance_tag ? `[${value.alliance_tag}]` : 'No alliance'}
              </p>
            </div>
          </div>
          <button type="button" onClick={clear} className="text-tactical-400 hover:text-tactical-600 text-sm shrink-0 ml-2">
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            className="input-base"
            placeholder={placeholder ?? 'Search commander by name or UID...'}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />

          {open && query.trim().length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-tactical-100 bg-white shadow-lg">
              {loading ? (
                <div className="p-4 text-center text-sm text-tactical-400">Searching...</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-sm text-tactical-400">No eligible commanders found</div>
              ) : (
                <div className="divide-y divide-tactical-100">
                  {results.map(c => (
                    <button
                      key={c.uid}
                      type="button"
                      onClick={() => select(c)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-overlay transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-accent-deep">{c.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-tactical-900 truncate">{c.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs font-mono text-tactical-500">{c.uid}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-tactical-100 text-tactical-600 uppercase font-medium">
                            {c.role}
                          </span>
                          <span className="text-xs font-mono text-tactical-500">
                            {c.alliance_tag ? `[${c.alliance_tag}]` : 'No alliance'}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[c.status] ?? 'bg-tactical-100 text-tactical-500'}`}>
                            {c.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
