// app/(public)/page.tsx
import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col"
         style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F7 100%)' }}>

      {/* Tactical grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.025]"
           style={{
             backgroundImage: 'linear-gradient(#22C55E 1px, transparent 1px), linear-gradient(90deg, #22C55E 1px, transparent 1px)',
             backgroundSize: '48px 48px',
           }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center"
               style={{ boxShadow: '0 0 0 1px rgba(34,197,94,0.3)' }}>
            <span className="text-white font-bold">◈</span>
          </div>
          <div>
            <p className="text-sm font-bold text-tactical-900 leading-none">ACC #7C</p>
            <p className="text-xs text-tactical-500 leading-none mt-0.5">Command Center</p>
          </div>
        </div>
        <Link href="/login" className="btn-primary text-sm py-2 px-4">
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-4xl mx-auto w-full">

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-light border border-accent/20 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-soft" />
          <span className="text-xs font-medium text-accent-deep">Last War: Survival · Server Management</span>
        </div>

        <h1 className="text-4xl lg:text-6xl font-bold text-tactical-900 leading-tight mb-6">
          1307 Alliance
          <br />
          <span className="text-accent">Command Center</span>
        </h1>

        <p className="text-lg text-tactical-500 max-w-2xl mb-10 leading-relaxed">
          A tactical operations platform for managing alliances, tracking
          duel performance, coordinating DSB and Canyon Storm battles, and
          maintaining full commander accountability.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <Link href="/login" className="btn-primary text-base px-8 py-3">
            Enter Command Center →
          </Link>
          <Link href="/register" className="btn-secondary text-base px-8 py-3">
            Verify My Commander
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
          {[
            { icon: '◈', title: 'Alliance Management', desc: 'Multi-alliance governance with full role hierarchy' },
            { icon: '◎', title: 'Duel Tracking', desc: 'Quick entry chip selector with auto absence detection' },
            { icon: '◆', title: 'DSB System', desc: 'Task force registration with real-time roster sync' },
            { icon: '◇', title: 'Canyon Storm', desc: 'Side selection, slot management, attendance recording' },
            { icon: '⇄', title: 'Transfers', desc: 'Commander transfers with full alliance history' },
            { icon: '≡', title: 'Audit Logs', desc: 'Immutable activity logs visible to all members' },
          ].map(f => (
            <div key={f.title} className="glass-card p-4 text-left">
              <span className="text-2xl text-accent-deep block mb-2">{f.icon}</span>
              <p className="font-semibold text-tactical-900 text-sm">{f.title}</p>
              <p className="text-xs text-tactical-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-tactical-400">
        1307 Alliance Command Center #7C · Last War: Survival · UTC-2
      </footer>
    </div>
  )
}