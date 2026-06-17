// middleware.ts (root level)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtDecode } from 'jwt-decode'

const SESSION_COOKIE = '__acc_session'

const PUBLIC_ROUTES   = ['/', '/login', '/register']
const PUBLIC_PREFIXES = ['/verify', '/api/auth', '/_next', '/favicon', '/api/verify']
const SUPREME_ONLY    = ['/admin']
const R4_PATHS        = ['/register', '/attendance', '/transfers']

interface DecodedClaims {
  uid:            string
  role?:          string
  commander_uid?: string
  alliance_id?:   string
  alliance_tag?:  string
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

  const { role, commander_uid, alliance_id } = claims

  if (!role || !commander_uid) {
    if (!pathname.startsWith('/verify') && pathname !== '/register') {
      return NextResponse.redirect(new URL('/register', request.url))
    }
    return NextResponse.next()
  }

  // Supreme-only routes
  if (SUPREME_ONLY.some(p => pathname.startsWith(p)) && role !== 'supreme') {
    return NextResponse.redirect(new URL('/dashboard?error=access_denied', request.url))
  }

  // R4+ routes
  const isR4Route = R4_PATHS.some(p => pathname.includes(p))
  if (isR4Route && !['r4','r5','supreme'].includes(role)) {
    const base = alliance_id ? `/alliance/${alliance_id}` : '/dashboard'
    return NextResponse.redirect(new URL(base, request.url))
  }

  // Alliance scope
  const allianceMatch = pathname.match(/^\/alliance\/([^/]+)/)
  if (allianceMatch && role !== 'supreme') {
    if (allianceMatch[1] !== alliance_id) {
      return NextResponse.redirect(new URL('/dashboard?error=wrong_alliance', request.url))
    }
  }

  // ── CRITICAL FIX: pass headers to server components ──
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-commander-uid',  commander_uid)
  requestHeaders.set('x-commander-role', role)
  requestHeaders.set('x-alliance-id',    alliance_id ?? '')

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}