// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F7 100%)' }}>
      <div className="glass-card-raised p-10 text-center max-w-sm w-full animate-fade-in">
        <p className="text-6xl font-bold text-tactical-200 mb-4">404</p>
        <p className="font-semibold text-tactical-900 text-lg mb-2">Page not found</p>
        <p className="text-sm text-tactical-500 mb-6">
          This route does not exist or you don't have access.
        </p>
        <Link href="/dashboard" className="btn-primary w-full">
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}