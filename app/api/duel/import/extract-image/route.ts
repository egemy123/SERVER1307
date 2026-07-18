// app/api/duel/import/extract-image/route.ts
//
// Processes exactly ONE screenshot per request. This is the fix for two
// separate real bugs:
//   1. "Request Entity Too Large" — bundling many base64 images into one
//      request body blew past Vercel's request size limit. One image per
//      request keeps every payload small regardless of batch size.
//   2. Function timeouts on 15-20 image batches — one long-lived request
//      running many sequential AI calls could exceed the platform's
//      function duration limit outright. One image per request means
//      each call only ever does (at most) one NVIDIA pass + one Gemini
//      call — a few seconds, nowhere near any timeout — and the CLIENT
//      loops over images itself, so one slow/failed image never takes
//      down the rest of the batch.
//
// Pipeline per image: try NVIDIA NIM's free meta/llama-3.2-11b-vision-instruct
// first (no cost, real semantic image understanding — unlike a plain OCR
// engine, it actually reads stylized game names the way a person would).
// Only escalate to Gemini if NVIDIA's rows don't ALL clear a strict
// fuzzy-match bar against the roster — see lib/duel-import/nvidiaExtract.ts
// for exactly why that bar exists and why it escalates the whole image
// rather than trying to salvage individual rows.

import { NextResponse }             from 'next/server'
import { requireAuth }              from '@/lib/firebase/serverAuth'
import { createAdminClient }        from '@/lib/supabase/admin'
import { attemptNvidiaExtraction }  from '@/lib/duel-import/nvidiaExtract'
import { extractRowsFromImage, ExtractionError } from '@/lib/duel-import/extract'
import { IMPORT_LIMITS } from '@/lib/duel-import/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth || !['r4', 'r5', 'supreme'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const allianceId: string | undefined = body?.alliance_id
    const sourceImageId: string | undefined = body?.source_image_id
    const name: string | undefined = body?.name
    const mediaType: string | undefined = body?.mediaType
    const base64Data: string | undefined = body?.base64Data

    if (!allianceId || !sourceImageId || !name || !mediaType || !base64Data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (auth.role !== 'supreme' && auth.alliance_id !== allianceId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const approxBytes = (base64Data.length * 3) / 4
    if (approxBytes > IMPORT_LIMITS.maxSizeBytes) {
      return NextResponse.json({ error: `${name} exceeds the 10MB limit` }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: roster } = await supabase
      .from('commanders')
      .select('uid, name')
      .eq('alliance_id', allianceId)
      .eq('status', 'active')

    // ── Try NVIDIA first — free, real vision-language understanding ──
    const nvidiaResult = await attemptNvidiaExtraction(sourceImageId, name, base64Data, mediaType, roster ?? [])

    if (nvidiaResult.accepted) {
      return NextResponse.json({
        rows: nvidiaResult.rows,
        source: 'nvidia',
      })
    }

    // ── NVIDIA wasn't confident enough — escalate the whole image to Gemini ──
    try {
      const aiRows = await extractRowsFromImage({
        sourceImageId,
        sourceImageName: name,
        base64Data,
        mediaType,
      })

      return NextResponse.json({
        rows: aiRows,
        source: 'ai',
      })
    } catch (err) {
      const message = err instanceof ExtractionError
        ? err.message
        : (err instanceof Error ? err.message : 'Unknown extraction error')
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (err) {
    console.error('[DUEL IMPORT EXTRACT-IMAGE]', err)
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
  }
}