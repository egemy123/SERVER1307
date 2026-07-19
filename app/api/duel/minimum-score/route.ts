// app/api/duel/minimum-score/route.ts
//
// Live, pre-lock minimum-score selector persistence. Lets R4/R5/Supreme
// set the minimum score for a specific day BEFORE that day is locked,
// with the value saved immediately so every alliance member sees the
// same number (not just whoever is mid-entry on their own device).
//
// This is intentionally decoupled from /api/duel/lock-day — locking a
// day still sends its own minimum_score value at lock time (unchanged
// behavior), this route just keeps a shared "draft" in sync beforehand.

import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'

const EDITOR_ROLES = ['r4', 'r5', 'supreme']

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!EDITOR_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Only R4, R5, or Supreme can set the minimum score' }, { status: 403 })
    }

    const { duel_week_id, day, minimum_score } = await req.json()

    if (!duel_week_id || !day) {
      return NextResponse.json({ error: 'duel_week_id and day are required' }, { status: 400 })
    }
    if (!Number.isInteger(minimum_score) || minimum_score <= 0) {
      return NextResponse.json({ error: 'minimum_score must be a positive integer' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: week, error: weekErr } = await supabase
      .from('duel_weeks')
      .select('id, alliance_id, draft_minimum_scores')
      .eq('id', duel_week_id)
      .single()

    if (weekErr || !week) {
      return NextResponse.json({ error: 'Duel week not found' }, { status: 404 })
    }
    if (auth.role !== 'supreme' && auth.alliance_id !== week.alliance_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const updated = { ...(week.draft_minimum_scores ?? {}), [day]: minimum_score }

    const { error: updateErr } = await supabase
      .from('duel_weeks')
      .update({ draft_minimum_scores: updated })
      .eq('id', duel_week_id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft_minimum_scores: updated })
  } catch (err) {
    console.error('[DUEL MINIMUM SCORE PATCH]', err)
    return NextResponse.json({ error: 'Failed to save minimum score' }, { status: 500 })
  }
}