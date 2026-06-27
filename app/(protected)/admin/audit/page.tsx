// app/(protected)/admin/audit/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'

const ACTION_LABELS: Record<string, string> = {
  commander_created:          'Commander added',
  commander_updated:          'Commander updated',
  commander_disabled:         'Account disabled',
  commander_enabled:          'Account enabled',
  google_account_reset:       'Google account reset',
  role_changed:               'Role changed',
  alliance_created:           'Alliance created',
  alliance_updated:           'Alliance updated',
  member_added:               'Member added',
  member_removed:             'Member removed',
  transfer_requested:         'Transfer requested',
  transfer_approved:          'Transfer approved',
  transfer_rejected:          'Transfer rejected',
  verification_completed:     'Commander verified',
  duel_day_locked:            'Duel day locked',
  minimum_score_set:          'Minimum score set',
  dsb_team_updated:           'DSB roster updated',
  dsb_attendance_recorded:    'DSB attendance recorded',
  canyon_team_updated:        'Canyon roster updated',
  canyon_attendance_recorded: 'Canyon attendance recorded',
  inactive_flagged:           'Inactive flag set',
}

function formatMetadata(action: string, metadata: Record<string, any>): string | null {
  if (!metadata || Object.keys(metadata).length === 0) return null
  switch (action) {
    case 'canyon_team_updated':
    case 'dsb_team_updated': {
      const act  = metadata.action === 'added' ? 'Added' : metadata.action === 'finalized' ? 'Finalized' : 'Updated'
      const tf   = metadata.task_force ? `TF-${metadata.task_force}` : ''
      const role = metadata.roster_role ? ` as ${metadata.roster_role}` : ''
      const slot = metadata.slot ? ` · Slot ${metadata.slot}` : ''
      return `${act} ${tf}${role}${slot}`.trim() || null
    }
    case 'canyon_attendance_recorded':
    case 'dsb_attendance_recorded': {
      const tf     = metadata.task_force ? `TF-${metadata.task_force}` : ''
      const status = metadata.status ?? ''
      return `${tf} · ${status}`.trim() || null
    }
    case 'duel_day_locked':
      return metadata.day ? `Day: ${String(metadata.day).charAt(0).toUpperCase() + String(metadata.day).slice(1)}` : null
    case 'role_changed': {
      const from = metadata.from_role ?? ''
      const to   = metadata.role ?? metadata.to_role ?? ''
      if (from && to) return `${from.toUpperCase()} → ${to.toUpperCase()}`
      if (to) return `New role: ${to.toUpperCase()}`
      return null
    }
    case 'commander_created':
      return metadata.role ? `Role: ${metadata.role.toUpperCase()}` : null
    case 'alliance_created':
      return metadata.tag ? `[${metadata.tag}] ${metadata.name ?? ''}`.trim() : null
    case 'minimum_score_set':
      return metadata.minimum_score != null ? `Score: ${metadata.minimum_score}` : null
    default:
      return null
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>
}) {
  const { page: pageParam, action: actionFilter } = await searchParams
  const PAGE_SIZE = 30
  const page      = parseInt(pageParam ?? '1')
  const from      = (page - 1) * PAGE_SIZE
  const to        = from + PAGE_SIZE - 1

  const supabase = createAdminClient()

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (actionFilter) query = query.eq('action', actionFilter)

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="page-header">
        <h1 className="page-title">Global Audit Log</h1>
        <p className="page-subtitle">{count ?? 0} total entries · Supreme view</p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        <a href="/admin/audit"
           className={`chip ${!actionFilter ? 'chip-participated' : 'chip-unselected'}`}>
          All
        </a>
        {['commander_created','alliance_created','transfer_approved','inactive_flagged','dsb_team_updated','canyon_team_updated'].map(a => (
          <a key={a} href={`/admin/audit?action=${a}`}
             className={`chip ${actionFilter === a ? 'chip-participated' : 'chip-unselected'}`}>
            {ACTION_LABELS[a] ?? a}
          </a>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        {(logs ?? []).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-tactical-400">No audit entries yet</p>
          </div>
        ) : (
          <div className="divide-y divide-tactical-100">
            {(logs ?? []).map((log: any) => {
              const summary = formatMetadata(log.action, log.metadata ?? {})
              return (
                <div key={log.id}
                     className="px-5 py-3 flex items-start gap-3 hover:bg-white/40 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-medium text-tactical-900 text-sm">
                          {log.performed_by_display}
                        </span>
                        <span className="text-tactical-400 text-xs ml-1 uppercase">
                          ({log.performed_by_role})
                        </span>
                        <span className="text-tactical-500 text-sm"> · </span>
                        <span className="text-sm font-medium text-tactical-700">
                          {ACTION_LABELS[log.action] ?? log.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-xs text-tactical-400 shrink-0 font-mono whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {summary && (
                      <p className="text-xs text-tactical-500 mt-0.5">{summary}</p>
                    )}
                    {log.target_commander_uid && (
                      <p className="text-xs text-tactical-400 mt-0.5">
                        Commander: <span className="font-medium text-tactical-600">{log.target_commander_uid}</span>
                      </p>
                    )}
                    {log.target_alliance_id && (
                      <p className="text-xs text-tactical-400 mt-0.5">
                        Alliance: <span className="font-mono text-tactical-600">{log.target_alliance_id.slice(0, 8)}...</span>
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <a href={`/admin/audit?page=${page - 1}${actionFilter ? `&action=${actionFilter}` : ''}`}
               className="btn-secondary text-sm py-1.5 px-4">← Prev</a>
          )}
          <span className="text-sm text-tactical-500">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a href={`/admin/audit?page=${page + 1}${actionFilter ? `&action=${actionFilter}` : ''}`}
               className="btn-secondary text-sm py-1.5 px-4">Next →</a>
          )}
        </div>
      )}
    </div>
  )
}