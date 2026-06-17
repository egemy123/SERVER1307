// components/dashboard/DuelPerformanceChart.tsx
'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface DuelPoint {
  week:   string
  passed: number
  absent: number
  below:  number
  total:  number
  rate:   number
}

export default function DuelPerformanceChart({ data }: { data: DuelPoint[] }) {
  return (
    <div className="glass-card p-5">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>
          Duel Performance
        </p>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          Weekly breakdown — passed, below minimum, absent
        </p>
      </div>

      {data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 }}>
          No duel data yet. Start tracking weekly duels to see performance.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
              <Bar dataKey="passed" name="Passed"        fill="#22C55E" radius={[4,4,0,0]} />
              <Bar dataKey="below"  name="Below Minimum" fill="#F59E0B" radius={[4,4,0,0]} />
              <Bar dataKey="absent" name="Absent"        fill="#EF4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Pass rate summary */}
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: '#F8FAFC', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>Average pass rate</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#15803D' }}>
              {data.length > 0
                ? Math.round(data.reduce((s, d) => s + d.rate, 0) / data.length) + '%'
                : '—'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}