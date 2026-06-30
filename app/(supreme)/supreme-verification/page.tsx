// app/(supreme)/supreme-verification/page.tsx
import { headers }          from 'next/headers'
import { redirect }         from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import VerificationClient    from './VerificationClient'

export default async function SupremeVerificationPage() {
  const headersList  = await headers()
  const role         = headersList.get('x-commander-role')
  const commanderUid = headersList.get('x-commander-uid')
  const commanderName = headersList.get('x-commander-name') ?? 'Supreme'

  if (!commanderUid) redirect('/login')
  if (role !== 'supreme') redirect('/dashboard')

  const supabase = createAdminClient()

  const [{ data: commanders }, { data: alliances }] = await Promise.all([
    supabase
      .from('commanders')
      .select(`
        uid, name, role, verification_status, alliance_id,
        alliances ( tag, name ),
        verification_codes ( code, expires_at, used, attempt_count )
      `)
      .not('verification_status', 'in', '("linked")')
      .order('verification_status', { ascending: true }),

    supabase
      .from('alliances')
      .select('id, tag, name')
      .order('tag'),
  ])

  const mapped = (commanders ?? []).map((c: any) => ({
    uid:                  c.uid,
    name:                 c.name,
    role:                 c.role,
    verification_status:  c.verification_status,
    alliance_id:          c.alliance_id,
    alliance_tag:         c.alliances?.tag ?? null,
    alliance_name:        c.alliances?.name ?? null,
    code_record: Array.isArray(c.verification_codes)
      ? c.verification_codes[0] ?? null
      : c.verification_codes ?? null,
  }))

  return (
    <VerificationClient
      initialCommanders={mapped}
      alliances={alliances ?? []}
      performedByUid={commanderUid}
      performedByName={commanderName}
    />
  )
}