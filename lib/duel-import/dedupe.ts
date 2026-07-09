// lib/duel-import/dedupe.ts
// Resolves duplicate commanders across screenshots (keep highest score)
// and flags rank inconsistencies for review.

import type { MatchedRow, ReviewRow, DuplicateGroup } from './types'

function toReviewRow(row: MatchedRow): ReviewRow {
  return { ...row, userEdited: false }
}

/**
 * Groups rows by matched commander (or by normalized detected name for
 * unmatched rows, so obvious repeats still get deduped even before a
 * human assigns them to a roster commander), keeps the highest-scoring
 * row per group, and marks the rest as duplicates.
 *
 * Rank validation: if two rows for the SAME commander have different
 * ranks AND their scores are within 1% of each other, that's very likely
 * a genuine OCR misread (the leaderboard shouldn't have moved that little
 * between two screenshots yet show different ranks) — flagged for review.
 * Large score gaps between duplicates are treated as two different
 * snapshots in time and not flagged, since the leaderboard legitimately
 * changes between screenshots.
 */
export function resolveDuplicatesAndRanks(rows: MatchedRow[]): {
  rows: ReviewRow[]
  duplicates: DuplicateGroup[]
} {
  const groups = new Map<string, MatchedRow[]>()

  for (const row of rows) {
    const key = row.matchedUid ?? `unmatched:${row.detectedName.toLowerCase().trim()}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const finalRows: ReviewRow[] = []
  const duplicateGroups: DuplicateGroup[] = []

  for (const [, groupRows] of groups) {
    if (groupRows.length === 1) {
      finalRows.push(toReviewRow(groupRows[0]))
      continue
    }

    // Highest score wins. Rows with a null score sort last.
    const sorted = [...groupRows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    const winner = sorted[0]
    const losers = sorted.slice(1)

    // Rank consistency check across the group.
    const distinctRanks = new Set(groupRows.map(r => r.rank).filter(r => r !== null))
    let rankFlag = false
    if (distinctRanks.size > 1 && winner.score !== null) {
      for (const loser of losers) {
        if (loser.score === null) continue
        const pctDiff = Math.abs(winner.score - loser.score) / Math.max(winner.score, 1)
        if (loser.rank !== winner.rank && pctDiff < 0.01) {
          rankFlag = true
          break
        }
      }
    }

    const winnerReview: ReviewRow = { ...toReviewRow(winner), isDuplicate: false, rankFlag }
    finalRows.push(winnerReview)

    const loserReviews = losers.map(l => toReviewRow({ ...l, isDuplicate: true, rankFlag }))
    finalRows.push(...loserReviews)

    if (winner.matchedUid) {
      duplicateGroups.push({
        matchedUid: winner.matchedUid,
        matchedName: winner.matchedName ?? winner.detectedName,
        kept: winnerReview,
        discarded: loserReviews,
      })
    }
  }

  return { rows: finalRows, duplicates: duplicateGroups }
}