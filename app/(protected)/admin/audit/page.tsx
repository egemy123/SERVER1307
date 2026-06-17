// app/admin/audit/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const PAGE_SIZE = 30
  const page      = parseInt(pageParam ?? '1')
  const from      = (page - 1) * PAGE_SIZE
  const to        = from + PAGE_SIZE - 1

  const supabase = createAdminClient()

  const { data: logs, count } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="page-header">
        <h1 className="page-title">Global Audit Log</h1>
        <p className="page-subtitle">{count ?? 0} total entries · Supreme view</p>
      </div>

      <div className="glass-card overflow-hidden">
        {(logs ?? []).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-tactical-400">No audit entries yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-glass">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Alliance</th>
                </tr>
              </thead>
              <tbody>
                {(logs ?? []).map((log: any) => (
                  <tr key={log.id}>
                    <td className="font-mono text-xs text-tactical-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="font-medium text-tactical-900 text-sm">
                      {log.performed_by_display}
                      <span className="ml-1 text-xs text-tactical-400 uppercase">({log.performed_by_role})</span>
                    </td>
                    <td>
                      <span className="text-xs font-mono bg-surface-overlay px-2 py-0.5 rounded-lg text-tactical-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-tactical-500">
                      {log.target_commander_uid ?? '—'}
                    </td>
                    <td className="font-mono text-xs text-tactical-500">
                      {log.target_alliance_id ? log.target_alliance_id.slice(0, 8) + '...' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <a href={`/admin/audit?page=${page - 1}`} className="btn-secondary text-sm py-1.5 px-4">
              ← Prev
            </a>
          )}
          <span className="text-sm text-tactical-500">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a href={`/admin/audit?page=${page + 1}`} className="btn-secondary text-sm py-1.5 px-4">
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  )
}