// components/dashboard/WeeklySummaryTable.tsx
'use client'

interface WeekSummary {
  week_key:            string
  duel_passed:         number
  duel_absent:         number
  duel_below:          number
  dsb_attendance_rate: number | null
}

export default function WeeklySummaryTable({ data }: { data: WeekSummary[] }) {
  return (
    <div className="glass-card p-5">
      <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
        Weekly Summary
      </p>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
        Duel and DSB performance per week
      </p>

      {data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8', fontSize: 14 }}>
          No weekly data yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['Week','Duel Passed','Below Min','Absent','DSB Rate'].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, color: '#64748B',
                    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.week_key} style={{
                  borderBottom: '1px solid #F1F5F9',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(248,250,252,0.5)',
                }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#0F172A' }}>
                    {row.week_key}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: '#DCFCE7', color: '#15803D',
                      padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: 12,
                    }}>
                      {row.duel_passed}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: row.duel_below > 0 ? '#FEF3C7' : '#F1F5F9',
                      color: row.duel_below > 0 ? '#B45309' : '#64748B',
                      padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: 12,
                    }}>
                      {row.duel_below}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: row.duel_absent > 0 ? '#FEE2E2' : '#F1F5F9',
                      color: row.duel_absent > 0 ? '#B91C1C' : '#64748B',
                      padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: 12,
                    }}>
                      {row.duel_absent}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {row.dsb_attendance_rate !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          flex: 1, height: 6, background: '#F1F5F9',
                          borderRadius: 3, overflow: 'hidden', minWidth: 60,
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${row.dsb_attendance_rate}%`,
                            background: row.dsb_attendance_rate >= 70 ? '#22C55E' :
                                        row.dsb_attendance_rate >= 40 ? '#F59E0B' : '#EF4444',
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                          {row.dsb_attendance_rate}%
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
