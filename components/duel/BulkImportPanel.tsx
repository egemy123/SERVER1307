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
import { IMPORT_LIMITS, type ReviewRow, type DuplicateGroup, type FailedImage, type ImportSummary } from '@/lib/duel-import/types'

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
    const allRawRows: any[] = []
    const localFailedImages: { sourceImageId: string; sourceImageName: string; reason: string }[] = []
    let ocrCount = 0
    let aiCount = 0
    let completed = 0

    // Each image is its own small request — no giant batched payload
    // (fixes "Request Entity Too Large"), and no single long-lived
    // function processing the whole batch (fixes Vercel timeouts on
    // 15-20+ image batches). A slow or failed image never takes down
    // the rest — the loop just moves on. Limited concurrency (2 at a
    // time) keeps this polite to the OCR/AI backends without being as
    // fragile as one big request.
    const CONCURRENCY = 2
    let cursor = 0

    async function worker() {
      while (cursor < staged.length) {
        const myIndex = cursor++
        const staged_ = staged[myIndex]
        const sourceImageId = staged_.id

        try {
          const base64Data = await fileToBase64(staged_.file)
          const res = await fetch('/api/duel/import/extract-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alliance_id: allianceId,
              source_image_id: sourceImageId,
              name: staged_.file.name,
              mediaType: staged_.file.type,
              base64Data,
            }),
          })
          const data = await res.json()

          if (!res.ok) {
            localFailedImages.push({
              sourceImageId,
              sourceImageName: staged_.file.name,
              reason: data.error ?? `Server error (${res.status})`,
            })
          } else {
            allRawRows.push(...(data.rows ?? []))
            if (data.source === 'nvidia') ocrCount++
            else aiCount++
          }
        } catch (err) {
          localFailedImages.push({
            sourceImageId,
            sourceImageName: staged_.file.name,
            reason: err instanceof Error ? err.message : 'Failed to process image',
          })
        } finally {
          completed++
          setProgressIndex(completed)
          setProgressImageName(staged_.file.name)
          setFailedImages([...localFailedImages])
        }
      }
    }

    try {
      const workers = Array.from({ length: Math.min(CONCURRENCY, staged.length) }, () => worker())
      await Promise.all(workers)

      // Finalize — matching/dedupe on the aggregated rows. No images in
      // this payload, so it's always small and fast regardless of how
      // many screenshots were in the batch.
      const finalizeRes = await fetch('/api/duel/import/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alliance_id: allianceId, rows: allRawRows }),
      })
      const finalizeData = await finalizeRes.json()

      if (!finalizeRes.ok) {
        setProcessError(finalizeData.error ?? 'Failed to finalize import')
        setStage('upload')
        return
      }

      setRows(finalizeData.rows)
      setDuplicates(finalizeData.duplicates)
      setSummary({
        imagesUploaded:      staged.length,
        imagesProcessed:     staged.length - localFailedImages.length,
        imagesFailed:        localFailedImages.length,
        rowsExtracted:       finalizeData.rowsExtracted,
        uniqueCommanders:    finalizeData.uniqueCommanders,
        duplicateCommanders: finalizeData.duplicateCommanders,
        correctedNames:      finalizeData.correctedNames,
        reviewRequired:      finalizeData.reviewRequired,
        manualRequired:      finalizeData.manualRequired,
        failedRows:          finalizeData.failedRows,
        processingTimeMs:    Date.now() - startTime,
        // Transparency on the NVIDIA-first savings — how many screenshots
        // never needed to touch the paid Gemini path at all.
        imagesReadByOcr:     ocrCount,
        imagesReadByAi:      aiCount,
      } as ImportSummary)
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
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
          <button onClick={onClose} className="text-tactical-400 hover:text-tactical-700 text-xl leading-none px-2">×</button>
        </div>

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
                <p className="text-xs text-tactical-400 mt-3">PNG, JPG, JPEG, WEBP · up to 50 images · 10MB each</p>
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
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  ['Uploaded',   summary.imagesUploaded],
                  ['Processed',  summary.imagesProcessed],
                  ['Read by NVIDIA', summary.imagesReadByOcr ?? 0],
                  ['Read by AI',  summary.imagesReadByAi ?? 0],
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
              <p className="text-xs text-tactical-500 -mt-3">
                {summary.imagesReadByOcr ?? 0} screenshot{(summary.imagesReadByOcr ?? 0) !== 1 ? 's' : ''} read for free by NVIDIA — only {summary.imagesReadByAi ?? 0} needed the Gemini fallback.
              </p>

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
                      <th className="text-left py-2 pr-2 text-tactical-500 font-medium">Rank</th>
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
                      <tr key={row.rowId} className={`border-b border-tactical-50 ${row.rankFlag ? 'bg-amber-50/50' : ''}`}>
                        <td className="py-1.5 pr-2 text-tactical-400 truncate max-w-[100px]">{row.sourceImageName}</td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="number"
                            value={row.rank ?? ''}
                            onChange={e => updateRow(row.rowId, { rank: e.target.value ? parseInt(e.target.value) : null })}
                            className="w-14 px-1 py-0.5 rounded border border-tactical-200 font-mono"
                          />
                          {row.rankFlag && <span className="text-amber-500 ml-1" title="Rank inconsistency detected">⚠</span>}
                        </td>
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