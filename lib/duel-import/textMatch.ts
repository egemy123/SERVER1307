// lib/duel-import/textMatch.ts
//
// Unicode-aware fuzzy string matching for commander names.
// In-game names routinely use stylized Unicode: diacritics (Š, Ø, Ò),
// decorative bracket glyphs (『』, ꧁꧂), leetspeak-ish substitutions, etc.
// OCR often flattens these to plain ASCII, so matching has to normalize
// both sides before comparing rather than requiring an exact match.

/**
 * Strips decorative wrapper glyphs commonly used around in-game names
 * (e.g. "꧁ROY꧂", "『Roy』") without touching the letters themselves.
 */
function stripDecoration(input: string): string {
  return input
    .replace(/[꧁꧂『』【】«»〈〉《》「」〖〗]/g, '')
    .trim()
}

/**
 * Normalizes for comparison: Unicode NFKD decomposition to separate base
 * letters from diacritics, strips diacritics, strips decoration, lowercases,
 * and collapses whitespace. "ŠERFE" -> "serfe", "Xòm" -> "xom", "RØY" is a
 * special case (Ø doesn't decompose under NFKD) so it's mapped explicitly.
 */
export function normalizeName(input: string): string {
  const withoutDecoration = stripDecoration(input)
  const oSlashNormalized = withoutDecoration.replace(/[øØ]/g, 'o')
  return oSlashNormalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // deletion
        prev[j - 1] + cost,   // substitution
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/**
 * Similarity ratio between two names, 0-100, after Unicode-aware
 * normalization. 100 = identical after normalization.
 */
export function nameSimilarity(a: string, b: string): number {
  const normA = normalizeName(a)
  const normB = normalizeName(b)
  if (!normA || !normB) return 0
  if (normA === normB) return 100

  const maxLen = Math.max(normA.length, normB.length)
  const distance = levenshtein(normA, normB)
  const ratio = (1 - distance / maxLen) * 100
  return Math.max(0, Math.round(ratio))
}

export interface RosterCommander {
  uid: string
  name: string
}

export interface MatchResult {
  uid: string | null
  name: string | null
  confidence: number
}

/**
 * Finds the best-matching roster commander for a detected name.
 * Returns null uid/name if nothing clears the minimum bar (30) — in that
 * case the row still surfaces in Review with its raw detected name so a
 * human can pick the right commander manually.
 */
export function matchCommander(
  detectedName: string,
  roster: RosterCommander[],
  minimumConfidence = 30,
): MatchResult {
  let best: MatchResult = { uid: null, name: null, confidence: 0 }

  for (const commander of roster) {
    const score = nameSimilarity(detectedName, commander.name)
    if (score > best.confidence) {
      best = { uid: commander.uid, name: commander.name, confidence: score }
    }
  }

  if (best.confidence < minimumConfidence) {
    return { uid: null, name: null, confidence: best.confidence }
  }
  return best
}