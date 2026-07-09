// lib/duel-import/types.ts
//
// Shared types for the Bulk Dual Screenshot Import feature.
// Pipeline: Upload -> Extract (OCR/AI) -> Match -> Dedupe/Rank-validate
// -> Review (editable) -> merge into Detailed Mode score grid.
//
// IMPORTANT: this feature only ever populates SCORES for Detailed Mode
// entry. It never writes to duel_entries/duel_day_results directly and
// never sets Victory/Defeat — that stays a manual leadership decision,
// same as every other Duel entry path in this app.

export type ConfidenceStatus = 'auto_accept' | 'review' | 'manual'

/** A single rank/name/score triplet as read off one screenshot, pre-matching. */
export interface RawExtractedRow {
  sourceImageId: string
  sourceImageName: string
  rank: number | null
  detectedName: string
  score: number | null
  /** 0-100 — how legible/confident the model was reading this row. */
  ocrConfidence: number
}

/** A raw row after being matched against the alliance roster. */
export interface MatchedRow extends RawExtractedRow {
  rowId: string
  /** uid of the best-matching roster commander, or null if no confident match. */
  matchedUid: string | null
  matchedName: string | null
  /** 0-100 — string similarity between detectedName and matchedName. */
  matchConfidence: number
  /** min(ocrConfidence, matchConfidence) — the number actually shown to the user. */
  confidence: number
  status: ConfidenceStatus
  /** Set once this row has been superseded by a higher-scoring duplicate. */
  isDuplicate: boolean
  /** Set if this row's rank disagrees with another same-commander row in a
   *  way that looks like a genuine reading error rather than just two
   *  different screenshots of a moving leaderboard. */
  rankFlag: boolean
}

/** Final, reviewable/editable row shown in the Review Screen. */
export interface ReviewRow extends MatchedRow {
  /** True once the user has manually edited this row in the Review Screen. */
  userEdited: boolean
}

export interface DuplicateGroup {
  matchedUid: string
  matchedName: string
  kept: ReviewRow
  discarded: ReviewRow[]
}

export interface ImportSummary {
  imagesUploaded: number
  imagesProcessed: number
  imagesFailed: number
  rowsExtracted: number
  uniqueCommanders: number
  duplicateCommanders: number
  correctedNames: number
  reviewRequired: number
  manualRequired: number
  failedRows: number
  processingTimeMs: number
}

export interface FailedImage {
  sourceImageId: string
  sourceImageName: string
  reason: string
}

/** NDJSON progress events streamed from /api/duel/import while processing. */
export type ImportProgressEvent =
  | { type: 'progress'; imageIndex: number; totalImages: number; imageName: string }
  | { type: 'image_failed'; sourceImageId: string; sourceImageName: string; reason: string }
  | { type: 'done'; rows: ReviewRow[]; duplicates: DuplicateGroup[]; failedImages: FailedImage[]; summary: ImportSummary }
  | { type: 'error'; message: string }

export const CONFIDENCE_THRESHOLDS = {
  autoAccept: 95,
  review: 90,
} as const

export function confidenceStatus(confidence: number): ConfidenceStatus {
  if (confidence >= CONFIDENCE_THRESHOLDS.autoAccept) return 'auto_accept'
  if (confidence >= CONFIDENCE_THRESHOLDS.review) return 'review'
  return 'manual'
}

export const IMPORT_LIMITS = {
  maxImages: 50,
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  acceptedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const,
}