// lib/duel-import/dedupe.ts
// Resolves duplicate commanders across screenshots — keeps the highest
// score per commander, discards the rest. No rank logic — rank was
// dropped from extraction entirely (name + score only).

import type { MatchedRow, ReviewRow, DuplicateGroup } from './types'

function toReviewRow(row: MatchedRow): ReviewRow {
  return { ...row, userEdited: false }
}

/**
 * Groups rows by matched commander (or by normalized detected name for
 * unmatched rows, so obvious repeats still get deduped even before a
 * human assigns them to a roster commander), and keeps the highest-scoring
 * row per group, marking the rest as duplicates.
 */
export function resolveDuplicates(rows: MatchedRow[]): {
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

    const winnerReview: ReviewRow = { ...toReviewRow(winner), isDuplicate: false }
    finalRows.push(winnerReview)

    const loserReviews = losers.map(l => toReviewRow({ ...l, isDuplicate: true }))
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