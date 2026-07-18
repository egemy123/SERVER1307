// lib/duel-import/extract.ts
// SERVER-ONLY. Calls Google's Gemini vision API to read commander
// name/score pairs off a Last War Dual leaderboard screenshot.
//
// This is the ONLY extraction path — NVIDIA NIM was removed (see git
// history) after its free-tier access proved unreliable to depend on.
// Resilience instead comes from rotating across every configured
// GEMINI_API_KEY_* (see keyManager.ts) — register keys from multiple
// Google accounts to multiply your effective free-tier quota.
//
// On a transient error (429 rate limit, 503 overloaded, or a network
// timeout), retries with the NEXT configured key, with exponential
// backoff between attempts. Non-transient errors (bad request, invalid
// key, malformed response) fail immediately without burning retries or
// other keys' quota. If every configured key is exhausted, this throws a
// clear ExtractionError — a fresh screenshot just fails and gets reported
// to the user, same as before; nothing is silently dropped.

import { GoogleGenAI } from '@google/genai'
import type { RawExtractedRow } from './types'
import { getKeySequence, getKeyCount, type SelectedKey } from './keyManager'

// gemini-3.5-flash: Google's current GA multimodal model. See git history /
// prior migration notes for why this replaced gemini-2.5-flash.
const MODEL = 'gemini-3.5-flash'

const MAX_KEY_ATTEMPTS_PER_IMAGE = 6 // raised from 3 now that Gemini is the only extraction path (NVIDIA removed) — with a 10-key pool, trying only 3 wastes most of the redundancy the extra keys exist for
const BASE_BACKOFF_MS = 400
const MAX_BACKOFF_MS = 2500 // was 8000 — a batch of many images can't afford long waits under Vercel Hobby's 60s function limit
const REQUEST_TIMEOUT_MS = 20000 // hard cap per API call — a hung request now fails fast instead of blocking a worker slot indefinitely

const EXTRACTION_SYSTEM_PROMPT = `You read Last War: Survival "Dual" leaderboard screenshots and extract every row as structured data.

Each row has three fields you need: Rank (the row's position number, an integer), Commander Name, and Dual Score (integer, may contain commas/periods as thousands separators).

CRITICAL — Alliance tags:
Some rows may show an alliance tag or prefix immediately before the commander's own name — typically in brackets, e.g. "[IMC] Roy", "【7C】Xòm", "(GMG) Serfe". This tag identifies the alliance, not the commander. EXCLUDE it entirely from the name field — return ONLY the commander's own name, with no leading bracket, tag, or alliance identifier of any kind. "[IMC] Roy" must be returned as "Roy", not "[IMC] Roy" and not "IMC Roy".

CRITICAL — Unicode preservation:
Once the alliance tag (if any) is stripped, commander names frequently use stylized Unicode: diacritics (Š, Ø, Ò, etc.), decorative bracket glyphs (『』, ꧁꧂, 【】) THAT ARE PART OF THE NAME ITSELF (not an alliance tag), and other symbols. Transcribe the name exactly as shown, character for character, aside from the alliance-tag removal above. Do not simplify, translate, or convert to plain ASCII. Decorative brackets that are part of the commander's own styling (e.g. "꧁ROY꧂") are NOT alliance tags and must be kept — only a leading alliance-identifier prefix gets removed.

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

/** Internal only — a response-format hiccup (empty text, malformed JSON,
 *  non-array). Distinct from ExtractionError so the retry loop below
 *  treats it as retryable instead of bailing out on the first attempt.
 *  responseMimeType: 'application/json' should almost always produce
 *  clean JSON; when it doesn't, it's usually a one-off glitch worth
 *  retrying, not a reason to fail the whole image immediately. */
class RetryableParseError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt)
  // full jitter: random between 0 and exp, avoids every worker retrying in lockstep
  return Math.floor(Math.random() * exp)
}

/**
 * Inspects a thrown error and decides whether it's worth retrying with a
 * different key. Only rate-limit (429), overloaded (503), and network
 * timeout/connection errors are transient — everything else (bad request,
 * invalid API key, auth failure, malformed response) fails immediately,
 * since switching keys or waiting won't fix those.
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true // our own REQUEST_TIMEOUT_MS firing

  const status =
    (err as any)?.status ??
    (err as any)?.code ??
    (err as any)?.error?.code

  if (status === 429 || status === 503) return true

  const message = err instanceof Error ? err.message : String(err)
  if (/"code":\s*(429|503)\b/.test(message)) return true
  if (/RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(message)) return true
  if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|network timeout|AbortError/i.test(message)) return true

  return false
}

async function callGemini(image: ExtractImageInput, selected: SelectedKey) {
  const ai = new GoogleGenAI({ apiKey: selected.key })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: image.mediaType,
                data: image.base64Data,
              },
            },
            {
              text: 'Extract every commander name and score row from this Dual leaderboard screenshot as a JSON array.',
            },
          ],
        },
      ],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        abortSignal: controller.signal,
      },
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function extractRowsFromImage(
  image: ExtractImageInput,
): Promise<RawExtractedRow[]> {
  const keyCount = getKeyCount()
  if (keyCount === 0) {
    throw new ExtractionError(
      'No Gemini API keys configured. Set GEMINI_API_KEY_1 (and optionally _2, _3, ...) in your environment to enable Bulk Import.',
    )
  }

  const attempts = Math.min(MAX_KEY_ATTEMPTS_PER_IMAGE, keyCount)
  const keySequence = getKeySequence(attempts)

  let lastError: unknown = null

  for (let attempt = 0; attempt < keySequence.length; attempt++) {
    const selected = keySequence[attempt]
    try {
      const response = await callGemini(image, selected)
      console.log(`[gemini-extract] key #${selected.index} succeeded for "${image.sourceImageName}"`)

      const text = response.text
      if (!text) {
        throw new RetryableParseError('No text response from vision API')
      }

      let parsed: any[]
      try {
        const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
        parsed = JSON.parse(cleaned)
      } catch {
        throw new RetryableParseError('Could not parse extraction result as JSON')
      }
      if (!Array.isArray(parsed)) {
        throw new RetryableParseError('Extraction result was not a JSON array')
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

    } catch (err) {
      lastError = err

      if (err instanceof ExtractionError) {
        // Genuinely fatal — not a network/format hiccup, no point retrying.
        throw err
      }

      const retryable = err instanceof RetryableParseError || isTransientError(err)
      if (!retryable) {
        // Bad request, invalid key, auth error, etc. — a different key
        // won't fix this, and retrying just wastes time and quota.
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[gemini-extract] key #${selected.index} failed (non-transient) for "${image.sourceImageName}": ${message.slice(0, 200)}`)
        throw new ExtractionError(`Vision API error: ${message.slice(0, 300)}`)
      }

      const message = err instanceof Error ? err.message : String(err)
      const reason = err instanceof RetryableParseError ? 'format hiccup' : 'transient'
      console.error(`[gemini-extract] key #${selected.index} failed (${reason}) for "${image.sourceImageName}", attempt ${attempt + 1}/${keySequence.length}: ${message.slice(0, 200)}`)

      const isLastAttempt = attempt === keySequence.length - 1
      if (!isLastAttempt) {
        await sleep(backoffDelay(attempt))
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new ExtractionError(
    `All ${keySequence.length} attempt(s) failed for "${image.sourceImageName}". Last error: ${message.slice(0, 200)}`,
  )
}

/**
 * Processes multiple images with limited concurrency and reports progress
 * as each one finishes via onProgress. Concurrency stays modest (3) even
 * with multiple keys configured, since the retry-with-backoff logic inside
 * extractRowsFromImage already spreads load across keys per image — high
 * outer concurrency plus multi-key retry inside each call would multiply
 * requests-per-second beyond what backoff is meant to protect against.
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