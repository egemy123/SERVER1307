// lib/supabase/admin.ts
// Supabase SERVICE ROLE client — server-side ONLY
// Bypasses RLS — use ONLY after Firebase auth is verified
// NEVER import this in client components

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken:  false,
        persistSession:    false,
      },
    }
  )
}