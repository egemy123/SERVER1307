// app/api/duel/import/route.ts
//
// Bulk Dual Screenshot Import — streaming endpoint.
// Accepts up to 50 base64-encoded screenshots, runs them through OCR/AI
// extraction with limited concurrency, fuzzy-matches every detected name
// against the alliance roster, resolves duplicates, and
// streams NDJSON progress events back to the client so the UI can show
// live "Processing image X of Y" without freezing.
//
// This endpoint ONLY returns reviewable rows. It never writes to
// duel_entries or duel_day_results — saving still goes through the normal
// Detailed Mode -> Alliance Result -> lock-day flow, so Victory/Defeat
// stays a manual decision every time, same as every other entry path.
//
// Requires at least one GEMINI_API_KEY_1 (and optionally _2, _3, ...) in the
// environment (see lib/duel-import/extract.ts and keyManager.ts).

import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractRowsFromImages } from '@/lib/duel-import/extract'
import { matchExtractedRows }     from '@/lib/duel-import/commanderMatch'
import { resolveDuplicates } from '@/lib/duel-import/dedupe'
import { IMPORT_LIMITS, type ImportProgressEvent, type ImportSummary } from '@/lib/duel-import/types'

export const runtime = 'nodejs'
export const maxDuration = 60 // Hobby plan max is 60s. Batches of 50 images at ~3-6s each with
                               // concurrency 3 can exceed this — if you upgrade to Pro (300s cap),
                               // raise this back up. Until then, encourage batches under ~20 images.

interface ImportRequestImage {
  name: string
  mediaType: string
  base64Data: string
}

function ndjson(event: ImportProgressEvent): string {
  return JSON.stringify(event) + '\n'
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth || !['r4', 'r5', 'supreme'].includes(auth.role)) {
    return new Response(ndjson({ type: 'error', message: 'Unauthorized' }), { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const allianceId: string | undefined = body?.alliance_id
  const images: ImportRequestImage[] = Array.isArray(body?.images) ? body.images : []

  if (!allianceId) {
    return new Response(ndjson({ type: 'error', message: 'alliance_id is required' }), { status: 400 })
  }
  if (auth.role !== 'supreme' && auth.alliance_id !== allianceId) {
    return new Response(ndjson({ type: 'error', message: 'Access denied' }), { status: 403 })
  }
  if (images.length === 0) {
    return new Response(ndjson({ type: 'error', message: 'No images provided' }), { status: 400 })
  }
  if (images.length > IMPORT_LIMITS.maxImages) {
    return new Response(ndjson({ type: 'error', message: `Maximum ${IMPORT_LIMITS.maxImages} images per batch` }), { status: 400 })
  }
  for (const img of images) {
    // Rough size check on the base64 payload (base64 is ~4/3 the size of raw bytes)
    const approxBytes = (img.base64Data.length * 3) / 4
    if (approxBytes > IMPORT_LIMITS.maxSizeBytes) {
      return new Response(ndjson({ type: 'error', message: `${img.name} exceeds the 10MB limit` }), { status: 400 })
    }
  }

  const supabase = createAdminClient()
  const { data: roster } = await supabase
    .from('commanders')
    .select('uid, name')
    .eq('alliance_id', allianceId)
    .eq('status', 'active')

  const startTime = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const failedImages: { sourceImageId: string; sourceImageName: string; reason: string }[] = []

      const imagesWithIds = images.map((img, i) => ({
        sourceImageId: `img_${i}_${Date.now()}`,
        sourceImageName: img.name,
        base64Data: img.base64Data,
        mediaType: img.mediaType,
      }))

      try {
        const rawRows = await extractRowsFromImages(
          imagesWithIds,
          (completedIndex, image) => {
            controller.enqueue(encoder.encode(ndjson({
              type: 'progress',
              imageIndex: completedIndex,
              totalImages: imagesWithIds.length,
              imageName: image.sourceImageName,
            })))
          },
          (image, reason) => {
            failedImages.push({
              sourceImageId: image.sourceImageId,
              sourceImageName: image.sourceImageName,
              reason,
            })
            controller.enqueue(encoder.encode(ndjson({
              type: 'image_failed',
              sourceImageId: image.sourceImageId,
              sourceImageName: image.sourceImageName,
              reason,
            })))
          },
        )

        const matched = matchExtractedRows(rawRows, roster ?? [])
        const { rows, duplicates } = resolveDuplicates(matched)

        const summary: ImportSummary = {
          imagesUploaded:      imagesWithIds.length,
          imagesProcessed:     imagesWithIds.length - failedImages.length,
          imagesFailed:        failedImages.length,
          rowsExtracted:       rawRows.length,
          uniqueCommanders:    new Set(rows.filter(r => !r.isDuplicate).map(r => r.matchedUid ?? r.rowId)).size,
          duplicateCommanders: duplicates.length,
          correctedNames:      rows.filter(r => r.matchedName && r.matchedName !== r.detectedName).length,
          reviewRequired:      rows.filter(r => r.status === 'review').length,
          manualRequired:      rows.filter(r => r.status === 'manual').length,
          failedRows:          rawRows.length - rows.length,
          processingTimeMs:    Date.now() - startTime,
        }

        controller.enqueue(encoder.encode(ndjson({
          type: 'done',
          rows,
          duplicates,
          failedImages,
          summary,
        })))
      } catch (err) {
        controller.enqueue(encoder.encode(ndjson({
          type: 'error',
          message: err instanceof Error ? err.message : 'Import failed unexpectedly',
        })))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}