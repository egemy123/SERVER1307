// app/api/duel/lock-day/route.ts
import { NextResponse }       from 'next/server'
import { requireAuth }        from '@/lib/firebase/serverAuth'
import { createAdminClient }  from '@/lib/supabase/admin'
import { writeAuditLog }      from '@/lib/utils/audit'

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      duel_week_id,
      day,
      minimum_score,
      participated,   // string[] — UIDs who submitted score           (Simple Mode)
      below_minimum,  // string[] — UIDs who scored below minimum      (Simple Mode)
      absent,         // string[] — auto-calculated                    (Simple Mode)
      scores,         // { commander_uid, score }[]                    (Detailed Mode)
      result,         // 'victory' | 'defeat' — Alliance Victory Track (REQUIRED, both modes)
    } = await req.json()

    if (!duel_week_id || !day) {
      return NextResponse.json({ error: 'duel_week_id and day required' }, { status: 400 })
    }

    if (result !== 'victory' && result !== 'defeat') {
      return NextResponse.json({ error: 'result (victory or defeat) is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify week exists and get alliance_id
    const { data: week, error: weekErr } = await supabase
      .from('duel_weeks').select('*').eq('id', duel_week_id).single()

    if (weekErr || !week) {
      return NextResponse.json({ error: 'Duel week not found' }, { status: 404 })
    }

    // Verify R4+ of this alliance
    if (auth.role !== 'supreme' && auth.alliance_id !== week.alliance_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check day not already locked
    const { data: existingLocked } = await supabase
      .from('duel_entries')
      .select('id')
      .eq('duel_week_id', duel_week_id)
      .eq('day', day)
      .eq('day_locked', true)
      .limit(1)

    if (existingLocked && existingLocked.length > 0) {
      return NextResponse.json({ error: 'Day is already locked' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const min = typeof minimum_score === 'number' ? minimum_score : null

    // ── Build Commander Performance Track entries (participation only — NO points) ──
    // These are informational: used for warnings/analytics/leadership review.
    // They must never be read as a source of duel points.
    const entries: any[] = []

    if (Array.isArray(scores) && scores.length > 0) {
      // ── Detailed Mode: derive status from actual scores ──
      for (const { commander_uid, score } of scores) {
        let status: 'passed' | 'below_minimum' | 'absent'
        if (!score || score === 0) status = 'absent'
        else if (min !== null && score < min) status = 'below_minimum'
        else status = 'passed'

        entries.push({
          duel_week_id,
          commander_uid,
          day,
          status,
          score:      score ?? 0,
          day_locked: true,
          locked_at:  now,
          locked_by:  auth.commander_uid,
        })
      }
    } else {
      // ── Simple Mode: leadership already classified everyone via cascade ──
      for (const uid of (participated ?? []).filter((u: string) => !(below_minimum ?? []).includes(u))) {
        entries.push({
          duel_week_id, commander_uid: uid, day,
          status: 'passed', day_locked: true, locked_at: now, locked_by: auth.commander_uid,
        })
      }
      for (const uid of (below_minimum ?? [])) {
        entries.push({
          duel_week_id, commander_uid: uid, day,
          status: 'below_minimum', day_locked: true, locked_at: now, locked_by: auth.commander_uid,
        })
      }
      for (const uid of (absent ?? [])) {
        entries.push({
          duel_week_id, commander_uid: uid, day,
          status: 'absent', day_locked: true, locked_at: now, locked_by: auth.commander_uid,
        })
      }
    }

    // Upsert Commander Performance Track entries
    if (entries.length > 0) {
      const { error: upsertErr } = await supabase
        .from('duel_entries')
        .upsert(entries, { onConflict: 'duel_week_id,commander_uid,day' })

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 })
      }
    }

    // ── Alliance Victory Track — the ONLY source of duel points ──
    // Independent of every commander's performance above.
    const { error: resultErr } = await supabase
      .from('duel_day_results')
      .upsert({
        duel_week_id,
        day,
        minimum_score: min,
        result,
        decided_by:    auth.commander_uid,
        decided_at:    now,
      }, { onConflict: 'duel_week_id,day' })

    if (resultErr) {
      return NextResponse.json({ error: resultErr.message }, { status: 500 })
    }

    // Flag absent members as inactive (Commander Performance Track side-effect only)
    const absentUids = Array.isArray(scores) && scores.length > 0
      ? entries.filter(e => e.status === 'absent').map(e => e.commander_uid)
      : (absent ?? [])

    if (absentUids.length > 0) {
      await supabase
        .from('commanders')
        .update({ inactive_flagged: true, inactive_flagged_at: now })
        .in('uid', absentUids)
        .eq('alliance_id', week.alliance_id)
        .eq('inactive_flagged', false)

      const notifInserts = absentUids.map(async (uid: string) => {
        const { data: cmd } = await supabase
          .from('commanders').select('name, inactive_flagged').eq('uid', uid).single()
        if (cmd && !cmd.inactive_flagged) {
          await supabase.from('notifications').insert({
            type:           'inactive_flag',
            commander_uid:  uid,
            commander_name: cmd.name,
            alliance_id:    week.alliance_id,
            message:        `${cmd.name} was marked absent on ${day} and has been flagged inactive.`,
          })
        }
      })
      await Promise.allSettled(notifInserts)
    }

    await writeAuditLog({
      action:               'duel_day_locked',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_alliance_id:   week.alliance_id,
      metadata: {
        day,
        week_key:      week.week_key,
        result,
        passed:        entries.filter(e => e.status === 'passed').length,
        below_minimum: entries.filter(e => e.status === 'below_minimum').length,
        absent:        absentUids.length,
        minimum_score: min,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DUEL LOCK DAY]', err)
    return NextResponse.json({ error: 'Failed to lock day' }, { status: 500 })
  }
}