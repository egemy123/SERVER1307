// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtDecode } from 'jwt-decode'

const SESSION_COOKIE = '__acc_session'

const PUBLIC_ROUTES   = ['/', '/login', '/register']
const PUBLIC_PREFIXES = ['/verify', '/api/auth', '/_next', '/favicon', '/api/verify']

// Routes only supreme can access
const SUPREME_ONLY = ['/admin', '/audit']

// Routes only r4+ can access (within an alliance)
const R4_PLUS_PATHS = ['/verification', '/settings', '/attendance', '/transfers']

interface DecodedClaims {
  uid:            string
  role?:          string
  commander_uid?: string
  alliance_id?:   string
  alliance_tag?:  string
  commander_name?: string
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

  const { role, commander_uid, alliance_id, alliance_tag, commander_name } = claims

  // No role/uid = not yet verified — send to register
  if (!role || !commander_uid) {
    if (!pathname.startsWith('/verify') && pathname !== '/register') {
      return NextResponse.redirect(new URL('/register', request.url))
    }
    return NextResponse.next()
  }

  // ── Supreme-only routes ───────────────────────────────────────────────────
  // /admin and /audit are accessible ONLY by supreme
  if (SUPREME_ONLY.some(p => pathname.startsWith(p)) && role !== 'supreme') {
    return NextResponse.redirect(new URL('/dashboard?error=access_denied', request.url))
  }

  // ── R4+ routes ────────────────────────────────────────────────────────────
  // /verification and /settings inside an alliance require r4, r5, or supreme
  const isR4PlusPath = R4_PLUS_PATHS.some(p => pathname.includes(p))
  if (isR4PlusPath && !['r4', 'r5', 'supreme'].includes(role)) {
    const base = alliance_id ? `/alliance/${alliance_id}` : '/dashboard'
    return NextResponse.redirect(new URL(base, request.url))
  }

  // ── Alliance scope ────────────────────────────────────────────────────────
  // Prevent commanders from accessing another alliance's pages
  const allianceMatch = pathname.match(/^\/alliance\/([^/]+)/)
  if (allianceMatch && role !== 'supreme') {
    if (allianceMatch[1] !== alliance_id) {
      return NextResponse.redirect(new URL('/dashboard?error=wrong_alliance', request.url))
    }
  }

  // ── Pass session data to server components via headers ───────────────────
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-commander-uid',  commander_uid)
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
