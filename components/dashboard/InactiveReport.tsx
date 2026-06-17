// components/dashboard/InactiveReport.tsx
'use client'
import Link from 'next/link'

interface InactiveMember {
  uid:                string
  name:               string
  role:               string
  inactive_flagged_at: string | null
}

interface Props {
  members:    InactiveMember[]
  allianceId: string
}

const ROLE_COLOR: Record<string, string> = {
  r5: '#15803D', r4: '#1D4ED8', r3: '#64748B',
  r2: '#64748B', r1: '#64748B', supreme: '#7C3AED',
}

export default function InactiveReport({ members, allianceId }: Props) {
  return (
    <div className="glass-card p-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>
            Inactive Members
          </p>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Currently flagged inactive
          </p>
        </div>
        {members.length > 0 && (
          <span style={{
            background: '#FEF3C7', color: '#B45309',
            padding: '2px 10px', borderRadius: 9999,
            fontSize: 12, fontWeight: 600,
          }}>
            {members.length} flagged
          </span>
        )}
      </div>

      {members.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>✓</p>
          <p style={{ fontSize: 14, color: '#22C55E', fontWeight: 600 }}>
            No inactive members
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            All members are active
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {members.map(m => (
              <div key={m.uid} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10,
                background: '#FFFBEB', border: '1px solid #FDE68A',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#FEF3C7', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#B45309', flexShrink: 0,
                  }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{m.name}</p>
                    <p style={{ fontSize: 11, color: ROLE_COLOR[m.role] ?? '#64748B', textTransform: 'uppercase', fontWeight: 500 }}>
                      {m.role}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 11, color: '#B45309', fontWeight: 500,
                  }}>
                    ⚠ Inactive
                  </span>
                  {m.inactive_flagged_at && (
                    <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                      {new Date(m.inactive_flagged_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short'
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Link
            href={`/alliance/${allianceId}/members`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 12, padding: '8px 16px', borderRadius: 10,
              border: '1px solid #CBD5E1', background: 'rgba(255,255,255,0.8)',
              fontSize: 13, fontWeight: 500, color: '#334155',
              textDecoration: 'none', transition: 'all 150ms ease',
            }}
          >
            View All Members →
          </Link>
        </>
      )}
    </div>
  )
}