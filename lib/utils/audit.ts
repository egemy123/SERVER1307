// lib/utils/audit.ts
// Audit log writer — server-side only
// Always uses admin client (bypasses RLS)
// Clients can NEVER write audit logs directly

import type { AuditAction, Role } from '@/lib/types'

interface AuditParams {
  action:               AuditAction
  performed_by:         string
  performed_by_role:    Role | 'system'
  performed_by_display: string
  target_commander_uid?: string | null
  target_alliance_id?:   string | null
  metadata?:             Record<string, unknown>
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const { error } = await supabase.from('audit_logs').insert({
      action:               params.action,
      performed_by:         params.performed_by,
      performed_by_role:    params.performed_by_role,
      performed_by_display: params.performed_by_display,
      target_commander_uid: params.target_commander_uid ?? null,
      target_alliance_id:   params.target_alliance_id   ?? null,
      metadata:             params.metadata ?? {},
      created_at:           new Date().toISOString(),
    })

    if (error) {
      // Audit failures must never break the main operation
      console.error('[AUDIT LOG FAILURE]', error.message, params)
    }
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err, params)
  }
}

export async function writeSystemLog(
  action: AuditAction,
  targetAllianceId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await writeAuditLog({
    action,
    performed_by:         'SYSTEM',
    performed_by_role:    'system',
    performed_by_display: 'SYSTEM',
    target_alliance_id:   targetAllianceId,
    metadata,
  })
}