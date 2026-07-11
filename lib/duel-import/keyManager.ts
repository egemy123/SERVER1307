// lib/duel-import/keyManager.ts
// SERVER-ONLY. Loads every configured GEMINI_API_KEY_* environment variable
// and round-robins requests across them for resilience against per-key
// rate limits (429) and transient provider outages (503).
//
// This module does NOT generate keys, create accounts, or bypass Gemini's
// quotas/terms in any way — it only distributes load across keys you have
// manually created and configured yourself. If every configured key is
// exhausted or the provider is down, requests fail with a clear error;
// they are never silently dropped or worked around.
//
// Env vars, any of these forms:
//   GEMINI_API_KEY_1=...
//   GEMINI_API_KEY_2=...
//   GEMINI_API_KEY_3=...
//   ...up to GEMINI_API_KEY_50 (scanned range; gaps are fine, e.g. only
//   _1 and _3 set is OK — this does NOT stop at the first missing index)
//
// GEMINI_API_KEY (no suffix) is also picked up for backward compatibility
// with the single-key setup from before this refactor, and is treated as
// just one more key in the pool.

const MAX_SCAN_INDEX = 50

let cachedKeys: string[] | null = null

/**
 * Scans the environment once (cached after first call — env vars don't
 * change at runtime) and returns every non-empty configured Gemini key,
 * in ascending index order, deduplicated.
 */
function loadKeys(): string[] {
  if (cachedKeys) return cachedKeys

  const found: string[] = []
  const seen = new Set<string>()

  const legacy = process.env.GEMINI_API_KEY?.trim()
  if (legacy) {
    found.push(legacy)
    seen.add(legacy)
  }

  for (let i = 1; i <= MAX_SCAN_INDEX; i++) {
    const value = process.env[`GEMINI_API_KEY_${i}`]?.trim()
    if (value && !seen.has(value)) {
      found.push(value)
      seen.add(value)
    }
  }

  cachedKeys = found
  return found
}

// Synchronous counter — see file header re: why this is safe without a
// mutex on Node's single-threaded event loop.
let cursor = 0

export interface SelectedKey {
  key: string
  /** 1-based, for logging only — never log the key value itself. */
  index: number
}

/** Total number of configured keys currently available. */
export function getKeyCount(): number {
  return loadKeys().length
}

/**
 * Returns the next key in round-robin order. Synchronous read-modify-write
 * of `cursor` with no await in between — cannot race even under concurrent
 * callers, because Node never interleaves synchronous code.
 */
export function getNextKey(): SelectedKey {
  const keys = loadKeys()
  if (keys.length === 0) {
    throw new Error(
      'No Gemini API keys configured. Set GEMINI_API_KEY_1 (and optionally _2, _3, ...) in your environment.',
    )
  }
  const i = cursor % keys.length
  cursor = (cursor + 1) % keys.length
  return { key: keys[i], index: i + 1 }
}

/**
 * Returns up to `count` keys to try, starting from the next round-robin
 * position, cycling through the pool without repeating a key. Used to
 * build a per-request retry sequence (try key A, then B, then C, ...)
 * without ever reusing a key that already failed within the same request.
 */
export function getKeySequence(count: number): SelectedKey[] {
  const keys = loadKeys()
  if (keys.length === 0) {
    throw new Error(
      'No Gemini API keys configured. Set GEMINI_API_KEY_1 (and optionally _2, _3, ...) in your environment.',
    )
  }
  const sequence: SelectedKey[] = []
  const n = Math.min(count, keys.length)
  for (let step = 0; step < n; step++) {
    sequence.push(getNextKey())
  }
  return sequence
}

/** Test/ops helper: force a re-scan of env vars (e.g. after editing .env.local in dev). */
export function resetKeyCache(): void {
  cachedKeys = null
  cursor = 0
}