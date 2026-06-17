// lib/supabase/client.ts
// Supabase CLIENT — browser only
// Used ONLY for realtime subscriptions
// Auth is disabled — Firebase handles all authentication
// Never use this for mutations or sensitive reads

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (client) return client

  client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession:     false,
        autoRefreshToken:   false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    }
  )

  return client
}

// ── REALTIME HELPERS ──────────────────────────

/** Subscribe to DSB roster changes — for simultaneous R4 editing */
export function subscribeToDSBRoster(eventId: string, onUpdate: () => void) {
  const sb = createClient()
  const channel = sb
    .channel(`dsb_roster_${eventId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'event_roster',
      filter: `event_id=eq.${eventId}`,
    }, onUpdate)
    .subscribe()
  return () => sb.removeChannel(channel)
}

/** Subscribe to Canyon roster changes */
export function subscribeToCanyonRoster(eventId: string, onUpdate: () => void) {
  const sb = createClient()
  const channel = sb
    .channel(`canyon_roster_${eventId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'event_roster',
      filter: `event_id=eq.${eventId}`,
    }, onUpdate)
    .subscribe()
  return () => sb.removeChannel(channel)
}

/** Subscribe to notifications for an alliance (R4/R5 inactive alerts) */
export function subscribeToNotifications(allianceId: string, onUpdate: () => void) {
  const sb = createClient()
  const channel = sb
    .channel(`notifications_${allianceId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `alliance_id=eq.${allianceId}`,
    }, onUpdate)
    .subscribe()
  return () => sb.removeChannel(channel)
}

/** Subscribe to transfer requests for an alliance */
export function subscribeToTransfers(allianceId: string, onUpdate: () => void) {
  const sb = createClient()
  const channel = sb
    .channel(`transfers_${allianceId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'transfer_requests',
      filter: `to_alliance_id=eq.${allianceId}`,
    }, onUpdate)
    .subscribe()
  return () => sb.removeChannel(channel)
}