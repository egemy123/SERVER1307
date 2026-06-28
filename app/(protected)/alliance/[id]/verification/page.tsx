// app/(protected)/alliance/[id]/verification/page.tsx

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

async function verifyCommander(formData: FormData) {
  'use server'

  const commanderUid = formData.get('commanderUid') as string
  const performedByUid = formData.get('performedByUid') as string
  const performedByName = formData.get('performedByName') as string
  const allianceId = formData.get('allianceId') as string

  if (!commanderUid || !performedByUid || !allianceId) return

  const supabase = createAdminClient()

  await supabase
    .from('commanders')
    .update({ verification_status: 'verified' })
    .eq('uid', commanderUid)

  await supabase.from('audit_logs').insert({
    action: 'verification_completed',
    performed_by_uid: performedByUid,
    performed_by_display: performedByName,
    target_commander_uid: commanderUid,
    target_alliance_id: allianceId,
  })

  redirect(`/alliance/${allianceId}/verification`)
}

async function rejectCommander(formData: FormData) {
  'use server'

  const commanderUid = formData.get('commanderUid') as string
  const performedByUid = formData.get('performedByUid') as string
  const performedByName = formData.get('performedByName') as string
  const allianceId = formData.get('allianceId') as string

  if (!commanderUid || !performedByUid || !allianceId) return

  const supabase = createAdminClient()

  await supabase
    .from('commanders')
    .update({ verification_status: 'rejected' })
    .eq('uid', commanderUid)

  await supabase.from('audit_logs').insert({
    action: 'verification_rejected',
    performed_by_uid: performedByUid,
    performed_by_display: performedByName,
    target_commander_uid: commanderUid,
    target_alliance_id: allianceId,
  })

  redirect(`/alliance/${allianceId}/verification`)
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border border-amber-300',
  rejected: 'bg-red-100 text-red-700 border border-red-300',
  unverified: 'bg-gray-100 text-gray-600 border border-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  rejected: 'Rejected',
  unverified: 'Unverified',
}

export default async function VerificationPage({
  params,
}: {
  params: { id: string }
}) {
  const headersList = await headers()

  const role = headersList.get('x-commander-role') as Role | null
  const allianceId = headersList.get('x-alliance-id')
  const commanderUid = headersList.get('x-commander-uid')
  const commanderName = headersList.get('x-commander-name') ?? 'Officer'

  if (!role || !allianceId || !commanderUid) {
    redirect('/dashboard')
  }

  const canVerify = ['r4', 'r5', 'supreme'].includes(role)
  if (!canVerify) {
    redirect('/dashboard')
  }

  const supabase = createAdminClient()

  const { data: commanders } = await supabase
    .from('commanders')
    .select('uid, name, role, verification_status')
    .eq('alliance_id', allianceId)
    .neq('verification_status', 'verified')
    .order('verification_status', { ascending: true })

  const pendingCount = (commanders ?? []).filter(
    (c) => c.verification_status === 'pending'
  ).length

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="page-title">Verification Queue</h1>
        <p className="page-subtitle">
          {pendingCount > 0
            ? `${pendingCount} commander${pendingCount !== 1 ? 's' : ''} awaiting verification`
            : 'All commanders verified'}
        </p>
      </div>

      {/* Queue */}
      <div className="glass-card p-5">

        {!commanders || commanders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-tactical-900">
              No pending verifications
            </p>
            <p className="text-sm text-tactical-400 mt-1">
              All commanders in your alliance are verified
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-tactical-100">
            {commanders.map((commander) => (
              <div
                key={commander.uid}
                className="py-4 flex items-center justify-between gap-4"
              >
                {/* Commander Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-tactical-900 truncate">
                    {commander.name}
                  </p>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-tactical-500 uppercase font-medium">
                      {commander.role}
                    </span>

                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_STYLES[commander.verification_status] ??
                        STATUS_STYLES.unverified
                      }`}
                    >
                      {STATUS_LABELS[commander.verification_status] ??
                        commander.verification_status}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">

                  {/* Verify */}
                  <form action={verifyCommander}>
                    <input type="hidden" name="commanderUid" value={commander.uid} />
                    <input type="hidden" name="performedByUid" value={commanderUid} />
                    <input type="hidden" name="performedByName" value={commanderName} />
                    <input type="hidden" name="allianceId" value={allianceId} />

                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                    >
                      ✓ Verify
                    </button>
                  </form>

                  {/* Reject — only if not already rejected */}
                  {commander.verification_status !== 'rejected' && (
                    <form action={rejectCommander}>
                      <input type="hidden" name="commanderUid" value={commander.uid} />
                      <input type="hidden" name="performedByUid" value={commanderUid} />
                      <input type="hidden" name="performedByName" value={commanderName} />
                      <input type="hidden" name="allianceId" value={allianceId} />

                      <button
                        type="submit"
                        className="text-xs px-3 py-1.5 rounded-xl border border-red-300 text-red-600 font-medium hover:bg-red-50 transition-colors"
                      >
                        ✕ Reject
                      </button>
                    </form>
                  )}

                </div>
              </div>
            ))}
          </div>
        )}

      </div>

    </div>
  )
}