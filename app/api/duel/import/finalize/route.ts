// app/api/duel/import/finalize/route.ts
//
// Second half of the per-image import pipeline. Once the client has
// collected RawExtractedRow[] from every successfully-processed image
// (via /api/duel/import/extract-image, looped client-side), it posts
// them all here in one small, image-free payload. This step just runs
// fuzzy commander matching + duplicate/rank resolution — no images, no
// AI calls, so this request is always fast regardless of batch size.

import { NextResponse }              from 'next/server'
import { requireAuth }               from '@/lib/firebase/serverAuth'
import { createAdminClient }         from '@/lib/supabase/admin'
import { matchExtractedRows }        from '@/lib/duel-import/commanderMatch'
import { resolveDuplicates }         from '@/lib/duel-import/dedupe'
import type { RawExtractedRow } from '@/lib/duel-import/types'

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth || !['r4', 'r5', 'supreme'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const allianceId: string | undefined = body?.alliance_id
    const rawRows: RawExtractedRow[] = Array.isArray(body?.rows) ? body.rows : []

    if (!allianceId) {
      return NextResponse.json({ error: 'alliance_id is required' }, { status: 400 })
    }
    if (auth.role !== 'supreme' && auth.alliance_id !== allianceId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const { data: roster } = await supabase
      .from('commanders')
      .select('uid, name')
      .eq('alliance_id', allianceId)
      .eq('status', 'active')

    const matched = matchExtractedRows(rawRows, roster ?? [])
    const { rows, duplicates } = resolveDuplicates(matched)

    return NextResponse.json({
      rows,
      duplicates,
      rowsExtracted:       rawRows.length,
      uniqueCommanders:    new Set(rows.filter(r => !r.isDuplicate).map(r => r.matchedUid ?? r.rowId)).size,
      duplicateCommanders: duplicates.length,
      correctedNames:      rows.filter(r => r.matchedName && r.matchedName !== r.detectedName).length,
      reviewRequired:      rows.filter(r => r.status === 'review').length,
      manualRequired:      rows.filter(r => r.status === 'manual').length,
      failedRows:          rawRows.length - rows.length,
    })
  } catch (err) {
    console.error('[DUEL IMPORT FINALIZE]', err)
    return NextResponse.json({ error: 'Failed to finalize import' }, { status: 500 })
  }
}