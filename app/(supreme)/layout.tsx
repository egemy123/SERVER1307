import Link               from 'next/link'
import SupremeBottomNav   from '@/components/layout/SupremeBottomNav'

export default function SupremeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* Sidebar — desktop only */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 p-5 flex-col gap-2">

        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">
            1307 COMMAND CENTER
          </h1>
          <p className="text-sm text-slate-500">
            Supreme Console
          </p>
        </div>

        <Link href="/supreme-dashboard" className="p-3 rounded-lg hover:bg-slate-100">
          ⌂ Dashboard
        </Link>

        <Link href="/supreme-commanders" className="p-3 rounded-lg hover:bg-slate-100">
          ◉ Commanders
        </Link>

        <Link href="/supreme-alliances" className="p-3 rounded-lg hover:bg-slate-100">
          ◈ Alliances
        </Link>

        <Link href="/supreme-verification" className="p-3 rounded-lg hover:bg-slate-100">
          ✅ Verification
        </Link>

        <Link href="/supreme-audit" className="p-3 rounded-lg hover:bg-slate-100">
          ≡ Audit Log
        </Link>

        <Link href="/supreme-admin" className="p-3 rounded-lg hover:bg-slate-100">
          👑 Admin
        </Link>

      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 pb-24 lg:pb-6">
        {children}
      </main>

      {/* Bottom nav — mobile only */}
      <SupremeBottomNav />

    </div>
  )
}
