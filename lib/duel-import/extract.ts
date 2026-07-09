// lib/duel-import/extract.ts
// SERVER-ONLY. Calls Claude's vision API to read rank/name/score triplets
// off a Last War Dual leaderboard screenshot.
//
// Requires ANTHROPIC_API_KEY in the environment. Add it to .env.local and
// to your Vercel project's environment variables — this module throws a
// clear error if it's missing rather than failing silently.

import type { RawExtractedRow } from './types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

const EXTRACTION_SYSTEM_PROMPT = `You read Last War: Survival "Dual" leaderboard screenshots and extract every row as structured data.

Each row has three fields, left to right: Rank (integer), Commander Name, Dual Score (integer, may contain commas/periods as thousands separators).

CRITICAL — Unicode preservation:
Commander names frequently use stylized Unicode: diacritics (Š, Ø, Ò, etc.), decorative bracket glyphs (『』, ꧁꧂, 【】), and other symbols. Transcribe names EXACTLY as shown, character for character. Do not simplify, translate, or convert to plain ASCII. Do not strip decorative brackets.

For every row, also return a confidence score from 0-100 reflecting how legible/certain you are about that row's name and score specifically (not the image as a whole). Use lower confidence for: blurry text, partially cut-off rows, ambiguous characters, or low contrast.

Respond with ONLY a JSON array, no other text, no markdown fences. Each element:
{"rank": number | null, "name": string, "score": number | null, "confidence": number}

If a screenshot contains no readable leaderboard rows at all, respond with an empty array: []`

interface ExtractImageInput {
  sourceImageId: string
  sourceImageName: string
  base64Data: string
  mediaType: string
}

export class ExtractionError extends Error {}

export async function extractRowsFromImage(
  image: ExtractImageInput,
): Promise<RawExtractedRow[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new ExtractionError(
      'ANTHROPIC_API_KEY is not configured. Add it to your environment to enable Bulk Import.',
    )
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: image.base64Data,
              },
            },
            {
              type: 'text',
              text: 'Extract every rank/name/score row from this Dual leaderboard screenshot as a JSON array.',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new ExtractionError(`Vision API error (${response.status}): ${body.slice(0, 300)}`)
  }

  const data = await response.json()
  const textBlock = (data.content ?? []).find((b: any) => b.type === 'text')
  if (!textBlock) {
    throw new ExtractionError('No text response from vision API')
  }

  let parsed: any[]
  try {
    const cleaned = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    throw new ExtractionError('Could not parse extraction result as JSON')
  }

  if (!Array.isArray(parsed)) {
    throw new ExtractionError('Extraction result was not a JSON array')
  }

  return parsed.map((row): RawExtractedRow => ({
    sourceImageId:   image.sourceImageId,
    sourceImageName: image.sourceImageName,
    rank:            typeof row.rank === 'number' ? row.rank : null,
    detectedName:    typeof row.name === 'string' ? row.name : '',
    score:           typeof row.score === 'number' ? row.score : null,
    ocrConfidence:   typeof row.confidence === 'number'
                       ? Math.max(0, Math.min(100, row.confidence))
                       : 50,
  })).filter(row => row.detectedName.length > 0)
}

/**
 * Processes multiple images with limited concurrency (Claude's API has
 * per-minute rate limits; 3 in flight at a time keeps this well within
 * normal limits for a batch of up to 50 screenshots) and reports progress
 * as each one finishes via onProgress.
 */
export async function extractRowsFromImages(
  images: ExtractImageInput[],
  onProgress: (completedIndex: number, image: ExtractImageInput) => void,
  onImageFailed: (image: ExtractImageInput, reason: string) => void,
  concurrency = 3,
): Promise<RawExtractedRow[]> {
  const allRows: RawExtractedRow[] = []
  let completed = 0
  let cursor = 0

  async function worker() {
    while (cursor < images.length) {
      const myIndex = cursor++
      const image = images[myIndex]
      try {
        const rows = await extractRowsFromImage(image)
        allRows.push(...rows)
      } catch (err) {
        onImageFailed(image, err instanceof Error ? err.message : 'Unknown extraction error')
      } finally {
        completed++
        onProgress(completed, image)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, images.length) }, () => worker())
  await Promise.all(workers)

  return allRows
}