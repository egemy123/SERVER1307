// lib/duel-import/commanderMatch.ts
// Runs every raw extracted row through fuzzy commander matching against
// the alliance roster, and computes each row's final confidence + status.

import { matchCommander, type RosterCommander } from './textMatch'
import { confidenceStatus, type RawExtractedRow, type MatchedRow } from './types'

let rowIdCounter = 0
function nextRowId(): string {
  rowIdCounter += 1
  return `row_${Date.now()}_${rowIdCounter}`
}

export function matchExtractedRows(
  rawRows: RawExtractedRow[],
  roster: RosterCommander[],
): MatchedRow[] {
  return rawRows.map((raw): MatchedRow => {
    const match = matchCommander(raw.detectedName, roster)

    // Conservative final confidence: the weaker of "could we read it" and
    // "are we sure who it is" — a crisp screenshot of an unmatched name is
    // still not something we should auto-accept.
    const confidence = Math.min(raw.ocrConfidence, match.confidence)

    return {
      ...raw,
      rowId: nextRowId(),
      matchedUid: match.uid,
      matchedName: match.name,
      matchConfidence: match.confidence,
      confidence,
      status: confidenceStatus(confidence),
      isDuplicate: false,
      rankFlag: false,
    }
  })
}