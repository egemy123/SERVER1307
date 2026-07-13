// app/(protected)/layout.tsx
import { headers }   from 'next/headers'
import { redirect }  from 'next/navigation'
import Sidebar          from '@/components/layout/Sidebar'
import BottomNav        from '@/components/layout/BottomNav'
import RoleSyncProvider from '@/components/providers/RoleSyncProvider'
import FCMProvider      from '@/components/providers/FCMProvider'
import type { Role }  from '@/lib/types'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList  = await headers()
  const role         = headersList.get('x-commander-role') as Role | null
  const allianceId   = headersList.get('x-alliance-id')
  const commanderUid = headersList.get('x-commander-uid')
  const commanderName = headersList.get('x-commander-name') ?? 'Commander'
  const allianceTag  = headersList.get('x-alliance-tag')

  if (!commanderUid || !role) redirect('/login')

  return (
    <div className="min-h-screen bg-surface-base">

      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar
          role={role}
          allianceId={allianceId}
          commanderName={commanderName}
          allianceTag={allianceTag}
        />
      </div>

      {/* Main content */}
      {/* lg:pl-64 = sidebar width on desktop | pb-20 = room for bottom nav on mobile */}
      <main className="lg:pl-64 min-h-screen">
        <div className="p-4 lg:p-6 pb-24 lg:pb-6">
          <RoleSyncProvider
            commanderUid={commanderUid}
            currentRole={role}
            currentAllianceId={allianceId}
          >
            <FCMProvider commanderId={commanderUid}>
              {children}
            </FCMProvider>
          </RoleSyncProvider>
        </div>
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav role={role} allianceId={allianceId} />

    </div>
  )
}