// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtDecode } from 'jwt-decode'
import { createClient } from '@supabase/supabase-js'

const SESSION_COOKIE = '__acc_session'

const PUBLIC_ROUTES   = ['/', '/login', '/register']
const PUBLIC_PREFIXES = ['/verify', '/api/auth', '/_next', '/favicon', '/api/verify', '/api/fcm/send']

// Routes only supreme can access
const SUPREME_ONLY = ['/admin']

// Routes only r4+ can access (within an alliance).
// /audit and /analytics are included here — audit's page scopes non-Supreme
// roles to their own alliance's log (Supreme sees everything); analytics
// is a leadership reporting tool, same tier as Settings/Verification.
const R4_PLUS_PATHS = ['/verification', '/settings', '/attendance', '/transfers', '/audit', '/analytics']

// Only the permanent identity comes from the session cookie now. role,
// alliance_id, alliance_tag, and name used to also live here as a frozen
// snapshot taken at login — that's what caused "must relogin to see my new
// role/alliance" symptoms. Those are now looked up live from Supabase on
// every request instead (see fetchLiveCommander below).
interface DecodedClaims {
  uid:            string
  commander_uid?: string
  exp:            number
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

function decodeSession(cookie: string): DecodedClaims | null {
  try {
    const decoded = jwtDecode<DecodedClaims>(cookie)
    if (decoded.exp * 1000 < Date.now()) return null
    return decoded
  } catch {
    return null
  }
}

// Lightweight Supabase client for middleware (Edge runtime) — no realtime,
// no session persistence, just a plain REST lookup.
function getSupabaseEdgeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

interface LiveCommander {
  role:           string
  alliance_id:    string | null
  alliance_tag:   string | null
  commander_name: string
  status:         string
}

// Two plain queries instead of one nested join — a nested `alliances(tag)`
// join here can silently fail if Supabase can't resolve the relationship
// unambiguously, which would take down every protected route at once.
// Safer to keep it simple for something this critical.
async function fetchLiveCommander(commanderUid: string): Promise<LiveCommander | null> {
  const supabase = getSupabaseEdgeClient()

  const { data: commander, error } = await supabase
    .from('commanders')
    .select('role, alliance_id, name, status')
    .eq('uid', commanderUid)
    .single()

  if (error || !commander) return null

  let allianceTag: string | null = null
  if (commander.alliance_id) {
    const { data: alliance } = await supabase
      .from('alliances')
      .select('tag')
      .eq('id', commander.alliance_id)
      .single()
    allianceTag = alliance?.tag ?? null
  }

  return {
    role:           commander.role,
    alliance_id:    commander.alliance_id,
    alliance_tag:   allianceTag,
    commander_name: commander.name,
    status:         commander.status,
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files and public routes
  if (pathname.includes('.') || isPublic(pathname)) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value

  if (!sessionCookie) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  const claims = decodeSession(sessionCookie)

  if (!claims) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    const res = NextResponse.redirect(url)
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  // commander_uid is the one thing safe to trust from the cookie — it's a
  // permanent identity that never changes after registration.
  const commanderUid = claims.commander_uid

  if (!commanderUid) {
    if (!pathname.startsWith('/verify') && pathname !== '/register') {
      return NextResponse.redirect(new URL('/register', request.url))
    }
    return NextResponse.next()
  }

  const live = await fetchLiveCommander(commanderUid)

  // No commander row / not linked yet = not verified
  if (!live || !live.role) {
    if (!pathname.startsWith('/verify') && pathname !== '/register') {
      return NextResponse.redirect(new URL('/register', request.url))
    }
    return NextResponse.next()
  }

  // Disabled commanders are blocked the moment Supreme disables them —
  // no waiting for their session to expire or for them to relogin.
  if (live.status === 'disabled') {
    const url = new URL('/login', request.url)
    url.searchParams.set('error', 'disabled')
    const res = NextResponse.redirect(url)
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  const { role, alliance_id, alliance_tag, commander_name } = live

  // ── Supreme-only routes ───────────────────────────────────────────────────
  if (SUPREME_ONLY.some(p => pathname.startsWith(p)) && role !== 'supreme') {
    return NextResponse.redirect(new URL('/dashboard?error=access_denied', request.url))
  }

  // ── R4+ routes ────────────────────────────────────────────────────────────
  const isR4PlusPath = R4_PLUS_PATHS.some(p => pathname.includes(p))
  if (isR4PlusPath && !['r4', 'r5', 'supreme'].includes(role)) {
    const base = alliance_id ? `/alliance/${alliance_id}` : '/dashboard'
    return NextResponse.redirect(new URL(base, request.url))
  }

  // ── Alliance scope ────────────────────────────────────────────────────────
  const allianceMatch = pathname.match(/^\/alliance\/([^/]+)/)
  if (allianceMatch && role !== 'supreme') {
    if (allianceMatch[1] !== alliance_id) {
      return NextResponse.redirect(new URL('/dashboard?error=wrong_alliance', request.url))
    }
  }

  // ── Pass LIVE session data to server components via headers ──────────────
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-commander-uid',  commanderUid)
  requestHeaders.set('x-commander-role', role)
  requestHeaders.set('x-alliance-id',    alliance_id     ?? '')
  requestHeaders.set('x-alliance-tag',   alliance_tag    ?? '')
  requestHeaders.set('x-commander-name', commander_name  ?? '')

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}