// app/(protected)/transfers/page.tsx
// Server component — reads role from headers, passes to client
import { headers }  from 'next/headers'
import { redirect } from 'next/navigation'
import type { Role } from '@/lib/types'
import TransfersClient from './TransfersClient'

export default async function TransfersPage() {
  const headersList  = await headers()
  const commanderUid = headersList.get('x-commander-uid')
  const role         = headersList.get('x-commander-role') as Role | null
  const allianceId   = headersList.get('x-alliance-id') || null

  if (!commanderUid || !role) redirect('/login')

  return (
    <TransfersClient
      role={role}
      commanderUid={commanderUid}
      allianceId={allianceId}
    />
  )
}