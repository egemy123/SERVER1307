// components/dashboard/TopContributors.tsx
'use client'

interface Contributor {
  uid:   string
  name:  string
  total: number
}

export default function TopContributors({ data }: { data: Contributor[] }) {
  const max = data[0]?.total ?? 1

  return (
    <div className="glass-card p-5">
      <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
        Top Contributors
      </p>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
        Highest duel scores across all tracked weeks
      </p>

      {data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8', fontSize: 14 }}>
          No score data yet. Use Full Manual Entry mode to track scores.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.map((c, i) => (
            <div key={c.uid} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Rank */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: i === 0 ? '#DCFCE7' : i === 1 ? '#F1F5F9' : '#F8FAFC',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                color: i === 0 ? '#15803D' : '#64748B',
              }}>
                {i + 1}
              </div>

              {/* Name + bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748B', fontFamily: 'monospace', flexShrink: 0, marginLeft: 8 }}>
                    {(c.total / 1_000_000).toFixed(1)}M
                  </span>
                </div>
                <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(c.total / max) * 100}%`,
                    background: i === 0 ? '#22C55E' : '#94A3B8',
                    borderRadius: 3,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}