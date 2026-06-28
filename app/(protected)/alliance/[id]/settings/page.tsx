// app/(protected)/alliance/[id]/settings/page.tsx

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

async function saveAllianceSettings(formData: FormData) {
  'use server'

  const allianceId = formData.get('allianceId') as string
  const performedByUid = formData.get('performedByUid') as string
  const performedByName = formData.get('performedByName') as string

  const giftLevel = parseInt(formData.get('gift_level') as string, 10)
  const target1 = (formData.get('target_1') as string).trim()
  const target2 = (formData.get('target_2') as string).trim()
  const target3 = (formData.get('target_3') as string).trim()
  const target4 = (formData.get('target_4') as string).trim()
  const target5 = (formData.get('target_5') as string).trim()

  if (!allianceId || !performedByUid) return

  const supabase = createAdminClient()

  await supabase
    .from('alliances')
    .update({
      gift_level: isNaN(giftLevel) ? 1 : giftLevel,
      target_1: target1 || null,
      target_2: target2 || null,
      target_3: target3 || null,
      target_4: target4 || null,
      target_5: target5 || null,
    })
    .eq('id', allianceId)

  await supabase.from('audit_logs').insert({
    action: 'alliance_settings_updated',
    performed_by_uid: performedByUid,
    performed_by_display: performedByName,
    target_alliance_id: allianceId,
  })

  redirect(`/alliance/${allianceId}/settings?saved=1`)
}

export default async function AllianceSettingsPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { saved?: string }
}) {
  const headersList = await headers()

  const role = headersList.get('x-commander-role') as Role | null
  const allianceId = headersList.get('x-alliance-id')
  const commanderUid = headersList.get('x-commander-uid')
  const commanderName = headersList.get('x-commander-name') ?? 'Officer'

  if (!role || !allianceId || !commanderUid) {
    redirect('/dashboard')
  }

  const canManage = ['r4', 'r5', 'supreme'].includes(role)
  if (!canManage) {
    redirect('/dashboard')
  }

  const supabase = createAdminClient()

  const { data: alliance } = await supabase
    .from('alliances')
    .select(`
      name,
      tag,
      gift_level,
      target_1,
      target_2,
      target_3,
      target_4,
      target_5
    `)
    .eq('id', allianceId)
    .single()

  const saved = searchParams?.saved === '1'

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="page-title">Alliance Settings</h1>
        <p className="page-subtitle">
          {alliance?.name ?? 'Alliance'} · Manage targets and gift level
        </p>
      </div>

      {/* Success Banner */}
      {saved && (
        <div className="glass-card p-4 border border-green-300 bg-green-50/30 flex items-center gap-3">
          <span className="text-green-500 text-lg">✓</span>
          <p className="text-sm font-medium text-green-800">
            Settings saved successfully
          </p>
        </div>
      )}

      {/* Settings Form */}
      <form action={saveAllianceSettings}>

        {/* Hidden fields */}
        <input type="hidden" name="allianceId" value={allianceId} />
        <input type="hidden" name="performedByUid" value={commanderUid} />
        <input type="hidden" name="performedByName" value={commanderName} />

        <div className="glass-card p-5 flex flex-col gap-5">

          {/* Gift Level */}
          <div>
            <label className="block text-xs font-medium text-tactical-500 mb-1.5">
              Gift Level
            </label>
            <input
              name="gift_level"
              type="number"
              min={1}
              max={30}
              defaultValue={alliance?.gift_level ?? 1}
              className="w-full rounded-xl border border-tactical-200 bg-surface-overlay px-4 py-3 text-tactical-900 text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-tactical-100" />

          {/* Targets */}
          <p className="text-xs font-medium text-tactical-500 -mb-2">
            Weekly Targets
          </p>

          {[
            { name: 'target_1', value: alliance?.target_1, label: 'Target 1' },
            { name: 'target_2', value: alliance?.target_2, label: 'Target 2' },
            { name: 'target_3', value: alliance?.target_3, label: 'Target 3' },
            { name: 'target_4', value: alliance?.target_4, label: 'Target 4' },
            { name: 'target_5', value: alliance?.target_5, label: 'Target 5' },
          ].map((target) => (
            <div key={target.name}>
              <label className="block text-xs font-medium text-tactical-500 mb-1.5">
                {target.label}
              </label>
              <input
                name={target.name}
                type="text"
                defaultValue={target.value ?? ''}
                placeholder="Leave empty to hide"
                className="w-full rounded-xl border border-tactical-200 bg-surface-overlay px-4 py-3 text-tactical-900 text-sm placeholder:text-tactical-300 focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}

          {/* Save */}
          <button
            type="submit"
            className="w-full rounded-xl bg-accent text-white py-3 font-semibold text-sm hover:opacity-90 transition-opacity mt-1"
          >
            Save Changes
          </button>

        </div>
      </form>

    </div>
  )
}