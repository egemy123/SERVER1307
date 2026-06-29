// app/(protected)/admin/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = createAdminClient()

  const [
    { count: commanderCount },
    { count: allianceCount },
    { count: pendingTransfers },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from('commanders').select('*', { count: 'exact', head: true }),
    supabase.from('alliances').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('transfer_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('audit_logs').select('id, action, performed_by_display, created_at').order('created_at', { ascending: false }).limit(5),
  ])

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="page-header">
        <h1 className="page-title">Supreme Command</h1>
        <p className="page-subtitle">Platform administration and global management</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card">
          <span className="text-xs text-tactical-500">Commanders</span>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">
            {commanderCount ?? 0}
          </p>
          <p className="text-xs text-tactical-500 mt-1">registered</p>
        </div>

        <div className="stat-card">
          <span className="text-xs text-tactical-500">Active Alliances</span>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">
            {allianceCount ?? 0}
          </p>
          <p className="text-xs text-tactical-500 mt-1">on platform</p>
        </div>

        <div className={`stat-card ${
          (pendingTransfers ?? 0) > 0
            ? 'border border-amber-300 bg-amber-50/40'
            : ''
        }`}>
          <span className="text-xs text-tactical-500">Pending Transfers</span>
          <p className={`text-2xl font-semibold mt-1 ${
            (pendingTransfers ?? 0) > 0 ? 'text-amber-700' : 'text-tactical-900'
          }`}>
            {pendingTransfers ?? 0}
          </p>
          <p className="text-xs text-tactical-500 mt-1">awaiting approval</p>
        </div>

        <div className="stat-card">
          <span className="text-xs text-tactical-500">Recent Activity</span>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">
            {(recentLogs ?? []).length}
          </p>
          <p className="text-xs text-tactical-500 mt-1">last actions</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Link href="/admin/commanders"
              className="glass-card p-5 flex items-center gap-4 hover:shadow-glass-md transition-all duration-150 group">
          <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center shrink-0
                          group-hover:bg-accent group-hover:text-white transition-colors duration-150">
            <span className="text-2xl text-accent-deep group-hover:text-white">◉</span>
          </div>
          <div>
            <p className="font-semibold text-tactical-900">Manage Commanders</p>
            <p className="text-sm text-tactical-500 mt-0.5">Add, edit, disable commanders</p>
          </div>
          <span className="ml-auto text-tactical-300 group-hover:text-accent transition-colors">→</span>
        </Link>

        <Link href="/admin/alliances"
              className="glass-card p-5 flex items-center gap-4 hover:shadow-glass-md transition-all duration-150 group">
          <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center shrink-0
                          group-hover:bg-accent transition-colors duration-150">
            <span className="text-2xl text-accent-deep group-hover:text-white">◈</span>
          </div>
          <div>
            <p className="font-semibold text-tactical-900">Manage Alliances</p>
            <p className="text-sm text-tactical-500 mt-0.5">Create and configure alliances</p>
          </div>
          <span className="ml-auto text-tactical-300 group-hover:text-accent transition-colors">→</span>
        </Link>

        <Link href="/admin/audit"
              className="glass-card p-5 flex items-center gap-4 hover:shadow-glass-md transition-all duration-150 group">
          <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center shrink-0
                          group-hover:bg-accent transition-colors duration-150">
            <span className="text-2xl text-accent-deep group-hover:text-white">≡</span>
          </div>
          <div>
            <p className="font-semibold text-tactical-900">Global Audit Log</p>
            <p className="text-sm text-tactical-500 mt-0.5">All platform activity</p>
          </div>
          <span className="ml-auto text-tactical-300 group-hover:text-accent transition-colors">→</span>
        </Link>

        <div className="glass-card p-5 flex items-center gap-4 opacity-50 cursor-not-allowed">
          <div className="w-12 h-12 rounded-2xl bg-surface-overlay flex items-center justify-center shrink-0">
            <span className="text-2xl text-tactical-400">📊</span>
          </div>
          <div>
            <p className="font-semibold text-tactical-700">Global Analytics</p>
            <p className="text-sm text-tactical-400 mt-0.5">Coming in Phase 5</p>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="glass-card p-5">
        <p className="font-semibold text-tactical-900 mb-4">Recent Platform Activity</p>
        {(recentLogs ?? []).length === 0 ? (
          <p className="text-sm text-tactical-400 text-center py-6">No activity yet</p>
        ) : (
          <div className="flex flex-col divide-y divide-tactical-100">
            {(recentLogs ?? []).map((log: any) => (
              <div key={log.id} className="py-3 flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tactical-800">
                    <span className="font-medium">{log.performed_by_display}</span>
                    {' · '}
                    {log.action.replace(/_/g, ' ')}
                  </p>
                </div>
                <p className="text-xs text-tactical-400 shrink-0">
                  {new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}