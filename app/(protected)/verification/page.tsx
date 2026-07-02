// app/(protected)/verification/page.tsx
//
// Unified verification queue.
// - Supreme: sees commanders across ALL alliances, with an alliance filter.
// - R4 / R5: sees only their own alliance's queue (allianceId is forced).
// Replaces the old alliance-scoped app/(protected)/alliance/[id]/verification/page.tsx,
// which was a dead link for Supreme (Supreme has no fixed allianceId).

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

async function verifyCommander(formData: FormData) {
  'use server'

  const commanderUid    = formData.get('commanderUid') as string
  const performedByUid  = formData.get('performedByUid') as string
  const performedByName = formData.get('performedByName') as string
  const targetAllianceId = formData.get('targetAllianceId') as string
  const returnTo        = (formData.get('returnTo') as string) || '/verification'

  if (!commanderUid || !performedByUid) return

  const supabase = createAdminClient()

  await supabase
    .from('commanders')
    .update({ verification_status: 'verified' })
    .eq('uid', commanderUid)

  await supabase
    .from('verification_codes')
    .update({ used: true })
    .eq('commander_uid', commanderUid)

  await supabase.from('audit_logs').insert({
    action: 'verification_completed',
    performed_by_uid: performedByUid,
    performed_by_display: performedByName,
    target_commander_uid: commanderUid,
    target_alliance_id: targetAllianceId || null,
  })

  redirect(returnTo)
}

async function rejectCommander(formData: FormData) {
  'use server'

  const commanderUid    = formData.get('commanderUid') as string
  const performedByUid  = formData.get('performedByUid') as string
  const performedByName = formData.get('performedByName') as string
  const targetAllianceId = formData.get('targetAllianceId') as string
  const returnTo        = (formData.get('returnTo') as string) || '/verification'

  if (!commanderUid || !performedByUid) return

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
    target_alliance_id: targetAllianceId || null,
  })

  redirect(returnTo)
}

const STATUS_STYLES: Record<string, string> = {
  code_sent:  'bg-blue-100 text-blue-700 border border-blue-300',
  pending:    'bg-amber-100 text-amber-700 border border-amber-300',
  rejected:   'bg-red-100 text-red-700 border border-red-300',
  unverified: 'bg-gray-100 text-gray-600 border border-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  code_sent:  'Code Sent',
  pending:    'Pending',
  rejected:   'Rejected',
  unverified: 'Unverified',
}

// Derives the code state for a commander row, plus a sort priority so the
// people ACTIVELY waiting on an officer right now (valid, unexpired code)
// float to the top — ahead of expired codes, and well ahead of commanders
// who haven't even started the flow yet.
//   0 = active code, waiting on officer   (most urgent)
//   1 = code expired, needs re-request
//   2 = no code requested yet
//   3 = rejected                          (least urgent)
function getCodeState(commander: {
  verification_status: string
  verification_codes: any
}) {
  const codeRecord = Array.isArray(commander.verification_codes)
    ? commander.verification_codes[0]
    : commander.verification_codes

  const hasActiveCode =
    !!codeRecord &&
    !codeRecord.used &&
    new Date(codeRecord.expires_at) > new Date()

  const isExpired =
    !!codeRecord &&
    !codeRecord.used &&
    new Date(codeRecord.expires_at) <= new Date()

  let priority = 2
  if (commander.verification_status === 'rejected') priority = 3
  else if (hasActiveCode) priority = 0
  else if (isExpired) priority = 1

  return { codeRecord, hasActiveCode, isExpired, priority }
}

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ alliance?: string }>
}) {
  const headersList   = await headers()
  const role          = headersList.get('x-commander-role') as Role | null
  const allianceId    = headersList.get('x-alliance-id')
  const commanderUid  = headersList.get('x-commander-uid')
  const commanderName = headersList.get('x-commander-name') ?? 'Officer'

  if (!role || !commanderUid) {
    redirect('/dashboard')
  }

  const canVerify = ['r4', 'r5', 'supreme'].includes(role)
  if (!canVerify) {
    redirect('/dashboard')
  }

  const isSupreme = role === 'supreme'
  const { alliance: filterAllianceId } = await searchParams

  // R4/R5 are locked to their own alliance. Supreme can filter, or see all.
  const effectiveAllianceId = isSupreme ? (filterAllianceId || null) : allianceId

  const returnTo = isSupreme && filterAllianceId
    ? `/verification?alliance=${filterAllianceId}`
    : '/verification'

  const supabase = createAdminClient()

  // Supreme needs the alliance list for the filter chips AND a tag lookup —
  // fetched separately rather than as an embedded join on commanders,
  // since embedded joins require a recognized FK relationship in Supabase
  // and silently return nothing if that relationship isn't set up.
  const alliances = isSupreme
    ? (await supabase.from('alliances').select('id, tag, name').order('tag')).data ?? []
    : []

  const allianceTagById = new Map(alliances.map((a) => [a.id, a.tag]))

  let query = supabase
    .from('commanders')
    .select(`
      uid,
      name,
      role,
      alliance_id,
      verification_status,
      verification_codes (
        code,
        expires_at,
        used,
        attempt_count
      )
    `)
    .neq('verification_status', 'linked')
    .neq('verification_status', 'verified')
    .order('verification_status', { ascending: true })

  if (effectiveAllianceId) {
    query = query.eq('alliance_id', effectiveAllianceId)
  }

  const { data: commanders, error: commandersError } = await query

  if (commandersError) {
    console.error('[VERIFICATION PAGE] commanders query failed:', commandersError.message)
  }

  // Active code requests first (they're waiting on an officer right now),
  // then expired codes, then not-yet-started, then rejected last.
  const sortedCommanders = [...(commanders ?? [])].sort(
    (a, b) => getCodeState(a).priority - getCodeState(b).priority
  )

  const pendingCount = sortedCommanders.filter(
    (c) => c.verification_status === 'code_sent' || c.verification_status === 'pending'
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

      {/* Alliance filter — Supreme only */}
      {isSupreme && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/verification"
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              !filterAllianceId
                ? 'bg-tactical-900 text-white'
                : 'bg-surface-overlay text-tactical-500 border border-tactical-100'
            }`}
          >
            All Alliances
          </Link>
          {alliances.map((a) => (
            <Link
              key={a.id}
              href={`/verification?alliance=${a.id}`}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filterAllianceId === a.id
                  ? 'bg-tactical-900 text-white'
                  : 'bg-surface-overlay text-tactical-500 border border-tactical-100'
              }`}
            >
              [{a.tag}] {a.name}
            </Link>
          ))}
        </div>
      )}

      {/* Queue */}
      <div className="glass-card p-5">

        {sortedCommanders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-tactical-900">
              No pending verifications
            </p>
            <p className="text-sm text-tactical-400 mt-1">
              {isSupreme && !filterAllianceId
                ? 'No alliance has anyone waiting on verification'
                : 'All commanders in your alliance are verified'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-tactical-100">
            {sortedCommanders.map((commander) => {
              const { codeRecord, hasActiveCode, isExpired } = getCodeState(commander)

              const allianceTag = commander.alliance_id
                ? allianceTagById.get(commander.alliance_id)
                : undefined

              return (
                <div key={commander.uid} className="py-4 flex flex-col gap-3">

                  {/* Top row — name, role, alliance (supreme only), status */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-tactical-900 truncate">
                        {commander.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-tactical-500 uppercase font-medium">
                          {commander.role}
                        </span>
                        {isSupreme && allianceTag && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-tactical-100 text-tactical-600 font-medium">
                            [{allianceTag}]
                          </span>
                        )}
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

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">

                      <form action={verifyCommander}>
                        <input type="hidden" name="commanderUid" value={commander.uid} />
                        <input type="hidden" name="performedByUid" value={commanderUid} />
                        <input type="hidden" name="performedByName" value={commanderName} />
                        <input type="hidden" name="targetAllianceId" value={commander.alliance_id ?? ''} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          className="text-xs px-3 py-1.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                        >
                          ✓ Verify
                        </button>
                      </form>

                      {commander.verification_status !== 'rejected' && (
                        <form action={rejectCommander}>
                          <input type="hidden" name="commanderUid" value={commander.uid} />
                          <input type="hidden" name="performedByUid" value={commanderUid} />
                          <input type="hidden" name="performedByName" value={commanderName} />
                          <input type="hidden" name="targetAllianceId" value={commander.alliance_id ?? ''} />
                          <input type="hidden" name="returnTo" value={returnTo} />
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

                  {/* Verification code box */}
                  {hasActiveCode && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-blue-600 font-medium mb-0.5">
                          Verification Code — send this in-game
                        </p>
                        <p className="font-mono text-xl font-bold text-blue-800 tracking-[0.3em]">
                          {codeRecord.code}
                        </p>
                        <p className="text-xs text-blue-500 mt-0.5">
                          Expires{' '}
                          {new Date(codeRecord.expires_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' · '}
                          {codeRecord.attempt_count}/{3} attempts used
                        </p>
                      </div>
                      <span className="text-2xl">📨</span>
                    </div>
                  )}

                  {isExpired && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
                      <p className="text-xs text-amber-700 font-medium">
                        ⏱ Code expired — commander must request a new one from{' '}
                        <span className="font-mono">/verify/{commander.uid}</span>
                      </p>
                    </div>
                  )}

                  {!codeRecord && commander.verification_status !== 'rejected' && (
                    <div className="rounded-xl border border-tactical-100 bg-surface-overlay px-4 py-3">
                      <p className="text-xs text-tactical-400">
                        No code requested yet — commander hasn't started verification
                      </p>
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        )}

      </div>

    </div>
  )
}
