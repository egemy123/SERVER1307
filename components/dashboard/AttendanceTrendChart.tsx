// components/dashboard/AttendanceTrendChart.tsx
'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface TrendPoint {
  week: string
  attended: number
  total: number
  rate: number
}

interface Props {
  dsbData:    TrendPoint[]
  canyonData: TrendPoint[]
}

export default function AttendanceTrendChart({ dsbData, canyonData }: Props) {
  // Merge DSB and Canyon data by week
  const allWeeks = Array.from(new Set([
    ...dsbData.map(d => d.week),
    ...canyonData.map(d => d.week),
  ])).sort()

  const merged = allWeeks.map(week => ({
    week,
    dsb_rate:    dsbData.find(d => d.week === week)?.rate ?? null,
    canyon_rate: canyonData.find(d => d.week === week)?.rate ?? null,
  }))

  const hasData = dsbData.length > 0 || canyonData.length > 0

  return (
    <div className="glass-card p-5">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>
          Attendance Trend
        </p>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          DSB and Canyon attendance rates over recent weeks
        </p>
      </div>

      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 }}>
          No attendance data yet. Record attendance after battles to see trends.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={merged} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: '#64748B' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#64748B' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                fontSize: 13,
              }}
              formatter={(value: any) => [`${value}%`, '']}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
            />
            <Line
              type="monotone"
              dataKey="dsb_rate"
              name="DSB Attendance"
              stroke="#22C55E"
              strokeWidth={2.5}
              dot={{ fill: '#22C55E', r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="canyon_rate"
              name="Canyon Attendance"
              stroke="#6366F1"
              strokeWidth={2.5}
              dot={{ fill: '#6366F1', r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
