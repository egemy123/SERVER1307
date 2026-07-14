'use client'
// components/duel/BulkImportPanel.tsx
//
// Bulk Dual Screenshot Import — Upload -> live progress -> Review -> merge.
//
// This panel ONLY produces a { commander_uid, score } map for Detailed
// Mode's score grid via onImport(). It never saves to the database
// itself and never touches Victory/Defeat — the parent entry page still
// requires the normal "Next: Alliance Result" step before locking the day.

import { useState, useRef, useCallback, useMemo } from 'react'
import { IMPORT_LIMITS, type ReviewRow, type DuplicateGroup, type FailedImage, type ImportSummary, type ImportProgressEvent, type MatchedRow } from '@/lib/duel-import/types'
import { resolveDuplicates } from '@/lib/duel-import/dedupe'

// Vercel Hobby caps serverless functions at 60s. A single request handling
// many images (each needing a Gemini call, sometimes with retries) can
// blow past that with no clean error — the connection just goes dead
// mid-stream. Splitting into smaller sequential requests keeps every
// individual request comfortably under the limit even in a bad case.
const CHUNK_SIZE = 6

interface RosterCommander { uid: string; name: string }

interface Props {
  allianceId: string
  roster: RosterCommander[]
  onImport: (scores: Record<string, string>) => void
  onClose: () => void
}

interface StagedImage {
  id: string
  file: File
  previewUrl: string
}

type Stage = 'upload' | 'processing' | 'review'

export default function BulkImportPanel({ allianceId, roster, onImport, onClose }: Props) {
  const [stage, setStage]           = useState<Stage>('upload')
  const [staged, setStaged]         = useState<StagedImage[]>([])
  const [dragOver, setDragOver]     = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [progressIndex, setProgressIndex] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [progressImageName, setProgressImageName] = useState('')

  const [rows, setRows]             = useState<ReviewRow[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [failedImages, setFailedImages] = useState<FailedImage[]>([])
  const [summary, setSummary]       = useState<ImportSummary | null>(null)
  const [processError, setProcessError] = useState('')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const rosterByUid = useMemo(
    () => Object.fromEntries(roster.map(r => [r.uid, r.name])),
    [roster],
  )

  // ── Upload / staging ───────────────────────────────────────────────────

  const validateAndStageFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files)
    setUploadError('')

    if (staged.length + incoming.length > IMPORT_LIMITS.maxImages) {
      setUploadError(`Maximum ${IMPORT_LIMITS.maxImages} images per batch (you're adding ${staged.length + incoming.length}).`)
      return
    }

    const accepted: StagedImage[] = []
    for (const file of incoming) {
      if (!IMPORT_LIMITS.acceptedTypes.includes(file.type as any)) {
        setUploadError(`${file.name}: unsupported format (use PNG, JPG, JPEG, or WEBP)`)
        continue
      }
      if (file.size > IMPORT_LIMITS.maxSizeBytes) {
        setUploadError(`${file.name}: exceeds 10MB limit`)
        continue
      }
      accepted.push({
        id: `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }

    setStaged(prev => [...prev, ...accepted])
  }, [staged.length])

  const removeStaged = useCallback((id: string) => {
    setStaged(prev => {
      const target = prev.find(s => s.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter(s => s.id !== id)
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) validateAndStageFiles(e.dataTransfer.files)
  }, [validateAndStageFiles])

  // ── Processing ─────────────────────────────────────────────────────────

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })

  const startProcessing = useCallback(async () => {
    if (staged.length === 0) return
    setStage('processing')
    setProgressIndex(0)
    setProgressTotal(staged.length)
    setProcessError('')
    setFailedImages([])

    const startTime = Date.now()
    const chunks: StagedImage[][] = []
    for (let i = 0; i < staged.length; i += CHUNK_SIZE) {
      chunks.push(staged.slice(i, i + CHUNK_SIZE))
    }

    // Accumulated across all chunks. rowsAcc holds every row from every
    // chunk exactly as the server returned it (already deduped WITHIN its
    // own chunk) — cross-chunk duplicates get resolved in one merge pass
    // after the loop, not per-chunk.
    let completedSoFar = 0
    const rowsAcc: ReviewRow[] = []
    const duplicatesAcc: DuplicateGroup[] = []
    const failedImagesAcc: FailedImage[] = []
    let imagesUploaded = 0, imagesProcessed = 0, imagesFailed = 0, rowsExtracted = 0

    try {
      for (const chunk of chunks) {
        const images = await Promise.all(chunk.map(async s => ({
          name: s.file.name,
          mediaType: s.file.type,
          base64Data: await fileToBase64(s.file),
        })))

        const res = await fetch('/api/duel/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alliance_id: allianceId, images }),
        })

        if (!res.body) throw new Error('No response stream from server')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const chunkBaseIndex = completedSoFar

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue
            const event: ImportProgressEvent = JSON.parse(line)

            if (event.type === 'progress') {
              setProgressIndex(chunkBaseIndex + event.imageIndex)
              setProgressTotal(staged.length)
              setProgressImageName(event.imageName)
            } else if (event.type === 'image_failed') {
              setFailedImages(prev => [...prev, {
                sourceImageId: event.sourceImageId,
                sourceImageName: event.sourceImageName,
                reason: event.reason,
              }])
            } else if (event.type === 'done') {
              rowsAcc.push(...event.rows)
              duplicatesAcc.push(...event.duplicates)
              failedImagesAcc.push(...event.failedImages)
              imagesUploaded  += event.summary.imagesUploaded
              imagesProcessed += event.summary.imagesProcessed
              imagesFailed    += event.summary.imagesFailed
              rowsExtracted   += event.summary.rowsExtracted
              completedSoFar  += chunk.length
              setProgressIndex(completedSoFar)
            } else if (event.type === 'error') {
              // One chunk failing outright shouldn't nuke everything the
              // other chunks already extracted — record it and move on.
              failedImagesAcc.push(...chunk.map(s => ({
                sourceImageId: s.id,
                sourceImageName: s.file.name,
                reason: event.message,
              })))
              imagesUploaded += chunk.length
              imagesFailed   += chunk.length
              completedSoFar += chunk.length
              setProgressIndex(completedSoFar)
            }
          }
        }
      }

      // ── Cross-chunk duplicate merge ──────────────────────────────────
      // Each chunk already deduped WITHIN itself. Now catch duplicates
      // that span chunk boundaries: take only each chunk's surviving
      // winners (isDuplicate === false), run them through the same
      // resolveDuplicates logic used server-side, and splice the result
      // back in alongside the untouched chunk-local losers.
      const winners = rowsAcc.filter(r => !r.isDuplicate)
      const chunkLocalLosers = rowsAcc.filter(r => r.isDuplicate)
      const { rows: mergedWinners, duplicates: crossChunkDuplicates } =
        resolveDuplicates(winners as MatchedRow[])

      const finalRows = [...mergedWinners, ...chunkLocalLosers]
      const finalDuplicates = [...duplicatesAcc, ...crossChunkDuplicates]

      const summary: ImportSummary = {
        imagesUploaded,
        imagesProcessed,
        imagesFailed,
        rowsExtracted,
        uniqueCommanders:    new Set(finalRows.filter(r => !r.isDuplicate).map(r => r.matchedUid ?? r.rowId)).size,
        duplicateCommanders: finalDuplicates.length,
        correctedNames:      finalRows.filter(r => r.matchedName && r.matchedName !== r.detectedName).length,
        reviewRequired:      finalRows.filter(r => r.status === 'review').length,
        manualRequired:      finalRows.filter(r => r.status === 'manual').length,
        failedRows:          rowsExtracted - finalRows.length,
        processingTimeMs:    Date.now() - startTime,
      }

      setRows(finalRows)
      setDuplicates(finalDuplicates)
      setFailedImages(failedImagesAcc)
      setSummary(summary)
      setStage('review')
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Import failed')
      setStage('upload')
    }
  }, [staged, allianceId])

  // ── Review editing ─────────────────────────────────────────────────────

  const updateRow = useCallback((rowId: string, patch: Partial<ReviewRow>) => {
    setRows(prev => prev.map(r => r.rowId === rowId ? { ...r, ...patch, userEdited: true } : r))
  }, [])

  const removeRow = useCallback((rowId: string) => {
    setRows(prev => prev.filter(r => r.rowId !== rowId))
  }, [])

  const visibleRows = rows.filter(r => !r.isDuplicate)
  const duplicateRows = rows.filter(r => r.isDuplicate)

  const handleConfirm = useCallback(() => {
    const scores: Record<string, string> = {}
    for (const row of visibleRows) {
      if (row.matchedUid && row.score !== null) {
        scores[row.matchedUid] = String(row.score)
      }
    }
    onImport(scores)
  }, [visibleRows, onImport])

  const readyCount = visibleRows.filter(r => r.matchedUid && r.score !== null).length

  // ── Render ──────────────────────────────────────────────────────────────

  // ── Close confirmation ───────────────────────────────────────────────
  // "Nothing to lose" only when the panel is empty and idle — anything
  // beyond that (files staged, actively processing, or extracted results
  // sitting unreviewed) means closing throws real work away silently.
  const hasUnsavedProgress =
    stage === 'processing' ||
    stage === 'review' ||
    (stage === 'upload' && staged.length > 0)

  const closeWarningText = (() => {
    if (stage === 'processing') {
      return `Import is still running (image ${progressIndex} of ${progressTotal}). Closing now will stop it — nothing processed so far will be saved.`
    }
    if (stage === 'review') {
      return `You have ${rows.length} extracted score${rows.length !== 1 ? 's' : ''} waiting for review. Closing now will discard ${rows.length !== 1 ? 'them' : 'it'} — none of it will be added to the entry.`
    }
    return `You have ${staged.length} screenshot${staged.length !== 1 ? 's' : ''} selected. Closing now will clear ${staged.length !== 1 ? 'them' : 'it'}.`
  })()

  const requestClose = useCallback(() => {
    if (hasUnsavedProgress) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }, [hasUnsavedProgress, onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={requestClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-tactical-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="font-semibold text-tactical-900">Bulk Screenshot Import</p>
            <p className="text-xs text-tactical-500 mt-0.5">
              {stage === 'upload' && 'Upload Dual leaderboard screenshots'}
              {stage === 'processing' && 'Reading screenshots…'}
              {stage === 'review' && 'Review extracted scores before adding them'}
            </p>
          </div>
          <button onClick={requestClose} className="text-tactical-400 hover:text-tactical-700 text-xl leading-none px-2">×</button>
        </div>

        {showCloseConfirm && (
          <div
            className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center p-4"
            onClick={() => setShowCloseConfirm(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div>
                <p className="font-semibold text-tactical-900">Close this import?</p>
                <p className="text-sm text-tactical-500 mt-1.5">{closeWarningText}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  className="flex-1 btn-secondary"
                >
                  Keep Going
                </button>
                <button
                  onClick={() => { setShowCloseConfirm(false); onClose() }}
                  className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  Discard &amp; Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-5">

          {/* ── UPLOAD STAGE ── */}
          {stage === 'upload' && (
            <div className="flex flex-col gap-4">
              {uploadError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{uploadError}</div>
              )}
              {processError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{processError}</div>
              )}

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors
                  ${dragOver ? 'border-accent bg-accent-light' : 'border-tactical-200 hover:border-tactical-300 bg-surface-overlay'}`}
              >
                <p className="text-3xl mb-2">📷</p>
                <p className="font-medium text-tactical-900">Drag & drop screenshots here</p>
                <p className="text-sm text-tactical-500 mt-1">or click to select multiple images</p>
                <p className="text-xs text-tactical-400 mt-3">PNG, JPG, JPEG, WEBP · up to {IMPORT_LIMITS.maxImages} images · 10MB each</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={e => e.target.files && validateAndStageFiles(e.target.files)}
                />
              </div>

              {staged.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-tactical-700">{staged.length} image{staged.length !== 1 ? 's' : ''} ready</p>
                    <button onClick={() => { staged.forEach(s => URL.revokeObjectURL(s.previewUrl)); setStaged([]) }}
                            className="text-xs text-tactical-500 hover:text-red-600">
                      Clear all
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                    {staged.map(s => (
                      <div key={s.id} className="relative rounded-lg overflow-hidden border border-tactical-200 aspect-square group">
                        <img src={s.previewUrl} alt={s.file.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeStaged(s.id)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={startProcessing} className="btn-primary w-full">
                    Process {staged.length} Screenshot{staged.length !== 1 ? 's' : ''} →
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── PROCESSING STAGE ── */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="font-medium text-tactical-900">
                Processing image {progressIndex} of {progressTotal}…
              </p>
              {progressImageName && (
                <p className="text-xs text-tactical-500">{progressImageName}</p>
              )}
              <div className="w-full max-w-sm h-2 rounded-full bg-tactical-100 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progressTotal > 0 ? (progressIndex / progressTotal) * 100 : 0}%` }}
                />
              </div>
              {failedImages.length > 0 && (
                <p className="text-xs text-amber-600">{failedImages.length} image(s) failed so far — continuing with the rest</p>
              )}
            </div>
          )}

          {/* ── REVIEW STAGE ── */}
          {stage === 'review' && summary && (
            <div className="flex flex-col gap-5">

              {/* Summary */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  ['Uploaded',   summary.imagesUploaded],
                  ['Processed',  summary.imagesProcessed],
                  ['Rows',       summary.rowsExtracted],
                  ['Unique',     summary.uniqueCommanders],
                  ['Duplicates', summary.duplicateCommanders],
                  ['Corrected',  summary.correctedNames],
                  ['Review',     summary.reviewRequired],
                  ['Manual',     summary.manualRequired],
                  ['Failed',     summary.failedRows + summary.imagesFailed],
                  ['Time',       `${(summary.processingTimeMs / 1000).toFixed(1)}s`],
                ].map(([label, value]) => (
                  <div key={label as string} className="text-center p-2 rounded-lg bg-surface-overlay">
                    <p className="text-sm font-bold text-tactical-900">{value}</p>
                    <p className="text-[10px] text-tactical-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {failedImages.length > 0 && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-xs font-semibold text-red-700 mb-1">{failedImages.length} screenshot(s) failed to process:</p>
                  {failedImages.map(f => (
                    <p key={f.sourceImageId} className="text-xs text-red-600">{f.sourceImageName} — {f.reason}</p>
                  ))}
                </div>
              )}

              {/* Review table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-tactical-100">
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Screenshot</th>
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Detected</th>
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Matched</th>
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Score</th>
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Confidence</th>
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Status</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(row => (
                      <tr key={row.rowId} className="border-b border-tactical-50">
                        <td className="py-1.5 pr-2 text-tactical-400 truncate max-w-[100px]">{row.sourceImageName}</td>
                        <td className="py-1.5 pr-2 text-tactical-600">{row.detectedName}</td>
                        <td className="py-1.5 pr-2">
                          <select
                            value={row.matchedUid ?? ''}
                            onChange={e => {
                              const uid = e.target.value || null
                              updateRow(row.rowId, { matchedUid: uid, matchedName: uid ? rosterByUid[uid] : null })
                            }}
                            className="px-1 py-0.5 rounded border border-tactical-200 max-w-[140px]"
                          >
                            <option value="">— unmatched —</option>
                            {roster.map(r => (
                              <option key={r.uid} value={r.uid}>{r.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="number"
                            value={row.score ?? ''}
                            onChange={e => updateRow(row.rowId, { score: e.target.value ? parseInt(e.target.value) : null })}
                            className="w-24 px-1 py-0.5 rounded border border-tactical-200 font-mono"
                          />
                        </td>
                        <td className="py-1.5 pr-2 font-mono">{row.confidence}%</td>
                        <td className="py-1.5 pr-2">
                          {row.status === 'auto_accept' && <span className="text-accent-deep">✅ Auto</span>}
                          {row.status === 'review'      && <span className="text-amber-600">⚠ Review</span>}
                          {row.status === 'manual'       && <span className="text-red-600">❌ Manual</span>}
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removeRow(row.rowId)} className="text-tactical-400 hover:text-red-600">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {duplicateRows.length > 0 && (
                <details className="text-xs text-tactical-500">
                  <summary className="cursor-pointer font-medium">
                    {duplicateRows.length} duplicate row(s) discarded (lower score kept out) — click to view
                  </summary>
                  <div className="mt-2 flex flex-col gap-1">
                    {duplicateRows.map(row => (
                      <p key={row.rowId}>
                        {row.matchedName ?? row.detectedName} — {row.score?.toLocaleString() ?? '—'} from {row.sourceImageName} (discarded, lower than kept duplicate)
                      </p>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStage('upload')} className="flex-1 btn-secondary">← Start Over</button>
                <button onClick={handleConfirm} disabled={readyCount === 0} className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                  Add {readyCount} Score{readyCount !== 1 ? 's' : ''} to Entry →
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}