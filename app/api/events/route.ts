// app/api/events/route.ts
import { NextResponse }      from 'next/server'
import { z }                 from 'zod'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { REMINDER_OFFSETS }  from '@/lib/events/types'

const LEADERSHIP_ROLES = ['r4', 'r5', 'supreme']

const CreateEventSchema = z.object({
  title:        z.string().min(1).max(150),
  description:  z.string().max(2000).optional(),
  notes:        z.string().max(2000).optional(),
  category:     z.enum([
    'desert_storm','canyon_storm','duel','winter_storm','zombie_siege',
    'marshal_guard','capitol_war','alliance_meeting','alliance_mail','alliance_gift',
    'research_finish','construction_finish','training_finish','shield_expiry','custom_reminder',
    'custom',
  ]),
  priority:     z.enum(['low','medium','high']).default('medium'),
  visibility:   z.enum(['public','alliance','private']).default('alliance'),
  event_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:   z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  end_time:     z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  all_day:      z.boolean().default(false),
  location:     z.string().max(200).optional(),
  color:        z.string().max(20).optional(),
  icon:         z.string().max(10).optional(),
  repeat_rule:  z.enum(['none','daily','weekly','monthly']).default('none'),
  repeat_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reminder_offsets: z.array(
    z.number().refine(v => REMINDER_OFFSETS.some(o => o.minutes === v))
  ).max(5).default([]),
  alarm_enabled: z.boolean().default(true),
  alarm_sound:   z.string().max(30).default('default'),
})

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const search    = searchParams.get('search')?.trim()
  const category  = searchParams.get('category')
  const priority  = searchParams.get('priority')
  const onlyMine  = searchParams.get('only_mine') === 'true'
  const pinned    = searchParams.get('pinned') === 'true'
  const favorite  = searchParams.get('favorite') === 'true'
  const completed = searchParams.get('completed')
  const includeArchived = searchParams.get('include_archived') === 'true'

  const supabase = createAdminClient()

  let query = supabase
    .from('calendar_events')
    .select('*, calendar_event_participants(commander_uid, response), calendar_event_reminders(id, commander_uid, offset_minutes, alarm_enabled)')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (auth.alliance_id) {
    query = query.or(
      `visibility.eq.public,and(visibility.eq.alliance,alliance_id.eq.${auth.alliance_id}),and(visibility.eq.private,created_by.eq.${auth.commander_uid})`
    )
  } else {
    query = query.or(`visibility.eq.public,and(visibility.eq.private,created_by.eq.${auth.commander_uid})`)
  }

  if (from) query = query.gte('event_date', from)
  if (to)   query = query.lte('event_date', to)
  if (category) query = query.eq('category', category)
  if (priority) query = query.eq('priority', priority)
  if (onlyMine) query = query.eq('created_by', auth.commander_uid)
  if (pinned)   query = query.eq('is_pinned', true)
  if (favorite) query = query.eq('is_favorite', true)
  if (completed === 'true')  query = query.eq('is_completed', true)
  if (completed === 'false') query = query.eq('is_completed', false)
  if (!includeArchived) query = query.eq('is_archived', false)
  if (search) query = query.ilike('title', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: data })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = CreateEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data

  if (input.visibility === 'alliance' && !LEADERSHIP_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Only R4, R5, or Supreme can create alliance events' }, { status: 403 })
  }
  if (input.visibility === 'alliance' && !auth.alliance_id) {
    return NextResponse.json({ error: 'You are not assigned to an alliance' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert({
      alliance_id:  input.visibility === 'alliance' ? auth.alliance_id : null,
      created_by:   auth.commander_uid,
      title:        input.title,
      description:  input.description ?? null,
      notes:        input.notes ?? null,
      category:     input.category,
      priority:     input.priority,
      visibility:   input.visibility,
      event_date:   input.event_date,
      start_time:   input.all_day ? null : (input.start_time ?? null),
      end_time:     input.all_day ? null : (input.end_time ?? null),
      all_day:      input.all_day,
      location:     input.location ?? null,
      color:        input.color ?? null,
      icon:         input.icon ?? null,
      repeat_rule:  input.repeat_rule,
      repeat_until: input.repeat_until ?? null,
    })
    .select()
    .single()

  if (error || !event) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create event' }, { status: 500 })
  }

  if (input.reminder_offsets.length > 0) {
    const reminderRows = input.reminder_offsets.map(minutes => ({
      event_id:       event.id,
      commander_uid:  null,
      offset_minutes: minutes,
      alarm_enabled:  input.alarm_enabled,
      alarm_sound:    input.alarm_sound,
    }))
    await supabase.from('calendar_event_reminders').insert(reminderRows)
  }

  return NextResponse.json({ event }, { status: 201 })
}