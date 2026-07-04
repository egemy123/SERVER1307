// app/api/admin/commanders/search/route.ts
//
// Searchable commander lookup for R5 assignment (alliance creation / R5
// reassignment). Replaces loading every commander into a <select> — this
// returns only the top 20 matches for whatever's been typed so far.
import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/commanders/search?q=test
//
// Eligible = status != 'disabled' AND role != 'supreme' AND role != 'r5'
// (a commander who is already R5 somewhere can't also become R5 elsewhere).
// Existing alliance members ARE included — this app allows transfers, so an
// R4/R1/etc from another alliance can still be picked; their current
// alliance is shown, and picking them moves them (same as the Move/Transfer
// feature on the admin commanders page).
export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim()

    if (q.length < 1) {
      return NextResponse.json({ commanders: [] })
    }

    const supabase = createAdminClient()

    // Escape % and _ so a literal search term (e.g. a UID containing an
    // underscore) can't be misread as an ILIKE wildcard.
    const safeQ = q.replace(/[%_]/g, (m) => `\\${m}`)

    const { data: commanders, error } = await supabase
      .from('commanders')
      .select('uid, name, role, status, alliance_id')
      .neq('status', 'disabled')
      .neq('role', 'supreme')
      .neq('role', 'r5')
      .or(`name.ilike.%${safeQ}%,uid.ilike.%${safeQ}%`)
      .order('name')
      .limit(20)

    if (error) {
      console.error('[COMMANDER SEARCH]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Resolve alliance tags with a separate batch query rather than a nested
    // join — a nested `alliances(tag)` join can fail silently if Supabase
    // can't resolve the relationship unambiguously (this exact issue broke
    // the verification page earlier in this project).
    const allianceIds = [...new Set((commanders ?? [])
      .map(c => c.alliance_id)
      .filter((id): id is string => !!id))]

    let tagById: Record<string, string> = {}
    if (allianceIds.length > 0) {
      const { data: alliances } = await supabase
        .from('alliances')
        .select('id, tag')
        .in('id', allianceIds)
      tagById = Object.fromEntries((alliances ?? []).map(a => [a.id, a.tag]))
    }

    const results = (commanders ?? []).map(c => ({
      uid:          c.uid,
      name:         c.name,
      role:         c.role,
      status:       c.status,
      alliance_id:  c.alliance_id,
      alliance_tag: c.alliance_id ? (tagById[c.alliance_id] ?? null) : null,
    }))

    return NextResponse.json({ commanders: results })
  } catch (err) {
    console.error('[COMMANDER SEARCH]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
