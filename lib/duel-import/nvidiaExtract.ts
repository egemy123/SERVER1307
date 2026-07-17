// lib/duel-import/nvidiaExtract.ts
// SERVER-ONLY. Free first-pass extraction using NVIDIA NIM's hosted
// meta/llama-3.2-11b-vision-instruct, called via the OpenAI-compatible
// https://integrate.api.nvidia.com/v1/chat/completions endpoint.
//
// This replaces the earlier Tesseract.js OCR pre-pass. Tesseract has no
// semantic understanding of stylized game names (decorative Unicode,
// combined diacritics) and produced unusable results on real Last War
// screenshots. A real vision-language model — even a smaller free one —
// actually reads names the way a person would, which is the right kind
// of "cheap first pass" for this specific problem.
//
// Safety net, unchanged in spirit from the OCR version: NVIDIA's result
// is only trusted when EVERY row it found matches a real roster
// commander at a strict fuzzy-match confidence. The moment a single row
// looks uncertain, the ENTIRE image is escalated to Gemini instead of
// trying to salvage just that row.
//
// Requires NVIDIA_API_KEY in your environment. Get a free key (no
// credit card) at https://build.nvidia.com — free tier is 1,000
// inference credits + a 40 requests/minute rate limit.

import { matchCommander, type RosterCommander } from './textMatch'
import type { RawExtractedRow } from './types'

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'meta/llama-3.2-11b-vision-instruct'
const REQUEST_TIMEOUT_MS = 20000

// Same extraction rules as extract.ts's Gemini prompt, kept in sync
// deliberately — if NVIDIA and Gemini disagreed on what counts as "the
// name" (e.g. one stripped alliance tags and the other didn't), rows
// from the same batch would look inconsistent in the review table
// depending on which path produced them.
const EXTRACTION_PROMPT = `You read Last War: Survival "Dual" leaderboard screenshots and extract every row as structured data.

Each row has three fields you need: Rank (the row's position number, an integer), Commander Name, and Dual Score (integer, may contain commas/periods as thousands separators).

CRITICAL — Alliance tags:
Some rows may show an alliance tag or prefix immediately before the commander's own name — typically in brackets, e.g. "[IMC] Roy", "【7C】Xòm", "(GMG) Serfe". This tag identifies the alliance, not the commander. EXCLUDE it entirely from the name field — return ONLY the commander's own name, with no leading bracket, tag, or alliance identifier of any kind. "[IMC] Roy" must be returned as "Roy", not "[IMC] Roy" and not "IMC Roy".

CRITICAL — Unicode preservation:
Once the alliance tag (if any) is stripped, commander names frequently use stylized Unicode: diacritics (Š, Ø, Ò, etc.), decorative bracket glyphs (『』, ꧁꧂, 【】) THAT ARE PART OF THE NAME ITSELF (not an alliance tag), and other symbols. Transcribe the name exactly as shown, character for character, aside from the alliance-tag removal above. Do not simplify, translate, or convert to plain ASCII. Decorative brackets that are part of the commander's own styling (e.g. "꧁ROY꧂") are NOT alliance tags and must be kept — only a leading alliance-identifier prefix gets removed.

For every row, also return a confidence score from 0-100 reflecting how legible/certain you are about that row's name and score specifically (not the image as a whole). Use lower confidence for: blurry text, partially cut-off rows, ambiguous characters, or low contrast.

Respond with ONLY a JSON array, no other text before or after it, no markdown code fences. Each element:
{"rank": number | null, "name": string, "score": number | null, "confidence": number}

If the screenshot contains no readable leaderboard rows at all, respond with an empty array: []`

interface ExtractImageInput {
  sourceImageId: string
  sourceImageName: string
  base64Data: string
  mediaType: string
}

async function callNvidia(image: ExtractImageInput, apiKey: string): Promise<any[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        // Instructions are folded into the user message text rather than
        // a separate system role — Llama 3.2 Vision's image-attached
        // turns are documented as not reliably honoring system prompts,
        // so this sidesteps that entirely rather than gambling on it.
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${image.mediaType};base64,${image.base64Data}` },
              },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`NVIDIA API error (${response.status}): ${body.slice(0, 300)}`)
    }

    const data = await response.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content

    if (!text) throw new Error('No text response from NVIDIA vision API')

    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) throw new Error('NVIDIA response was not a JSON array')

    return parsed
  } finally {
    clearTimeout(timeoutId)
  }
}

export interface NvidiaAttemptResult {
  /** True if NVIDIA's results are trustworthy enough to skip Gemini entirely. */
  accepted: boolean
  rows: RawExtractedRow[]
}

/**
 * The minimum fuzzy-match confidence EVERY row must clear for NVIDIA's
 * result to be trusted. Deliberately strict — this is the safety valve
 * against silently matching a misread name to the wrong roster
 * commander. Below this bar, the WHOLE image escalates to Gemini rather
 * than trying to salvage individual rows.
 */
const NVIDIA_ACCEPT_THRESHOLD = 90

/** An image producing fewer real rows than this is treated as a failed
 *  read (blurry, cropped oddly, model refused, wrong content) and
 *  escalated rather than trusted as "genuinely only had 1-2 rows." */
const MIN_ROWS_TO_TRUST = 3

export async function attemptNvidiaExtraction(
  sourceImageId: string,
  sourceImageName: string,
  base64Data: string,
  mediaType: string,
  roster: RosterCommander[],
): Promise<NvidiaAttemptResult> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    // No key configured — treat as "not accepted" so every image just
    // falls through to Gemini, rather than hard-failing the batch.
    console.error(`[nvidia-extract] SKIPPED for "${sourceImageName}": NVIDIA_API_KEY is not set in this environment.`)
    return { accepted: false, rows: [] }
  }

  let parsed: any[]
  try {
    parsed = await callNvidia({ sourceImageId, sourceImageName, base64Data, mediaType }, apiKey)
  } catch (err) {
    console.error(`[nvidia-extract] API CALL FAILED for "${sourceImageName}": ${err instanceof Error ? err.message : err}`)
    return { accepted: false, rows: [] }
  }

  const candidateRows = parsed
    .map((row): RawExtractedRow => ({
      sourceImageId,
      sourceImageName,
      rank:          typeof row.rank === 'number' ? row.rank : null,
      detectedName:  typeof row.name === 'string' ? row.name : '',
      score:         typeof row.score === 'number' ? row.score : null,
      ocrConfidence: typeof row.confidence === 'number'
                       ? Math.max(0, Math.min(100, row.confidence))
                       : 50,
    }))
    .filter(row => row.detectedName.length > 0)

  if (candidateRows.length < MIN_ROWS_TO_TRUST) {
    console.error(`[nvidia-extract] REJECTED for "${sourceImageName}": only ${candidateRows.length} row(s) parsed (need ${MIN_ROWS_TO_TRUST}+) — escalating to Gemini.`)
    return { accepted: false, rows: [] }
  }

  for (const row of candidateRows) {
    const match = matchCommander(row.detectedName, roster)
    if (match.confidence < NVIDIA_ACCEPT_THRESHOLD) {
      // One weak match is enough to distrust the whole image's read.
      console.error(`[nvidia-extract] REJECTED for "${sourceImageName}": "${row.detectedName}" only matched roster at ${match.confidence}% (need ${NVIDIA_ACCEPT_THRESHOLD}+) — escalating to Gemini.`)
      return { accepted: false, rows: [] }
    }
  }

  console.log(`[nvidia-extract] ACCEPTED for "${sourceImageName}": ${candidateRows.length} row(s), all matched with high confidence.`)
  return { accepted: true, rows: candidateRows }
}