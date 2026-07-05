'use client'
// components/dashboard/AllianceOverviewCard.tsx
//
// Members + Gift Level, editable in place for R4/R5/Supreme. Tag/Name
// rename is a separate, higher permission bar — R5 and Supreme only —
// shown in the same edit panel but gated independently.

import { useState } from 'react'

interface Props {
  allianceId:       string
  activeCount:      number
  initialGiftLevel: number | null
  initialTag:       string
  initialName:      string
  canEdit:          boolean   // r4, r5, supreme — gift level
  canRename:        boolean   // r5, supreme only — tag + name
}

export default function AllianceOverviewCard({
  allianceId,
  activeCount,
  initialGiftLevel,
  initialTag,
  initialName,
  canEdit,
  canRename,
}: Props) {
  const [editing,    setEditing]    = useState(false)
  const [giftLevel,  setGiftLevel]  = useState(initialGiftLevel ?? 1)
  const [tag,        setTag]        = useState(initialTag)
  const [name,       setName]       = useState(initialName)
  const [savedGift,  setSavedGift]  = useState(giftLevel)
  const [savedTag,   setSavedTag]   = useState(initialTag)
  const [savedName,  setSavedName]  = useState(initialName)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const canOpenEdit = canEdit || canRename

  const startEdit = () => {
    setGiftLevel(savedGift)
    setTag(savedTag)
    setName(savedName)
    setError('')
    setEditing(true)
  }

  const cancel = () => {
    setGiftLevel(savedGift)
    setTag(savedTag)
    setName(savedName)
    setError('')
    setEditing(false)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      // Two independent endpoints since permissions differ: gift level is
      // R4+, renaming is R5+. Only call each if that field actually changed
      // and the person is allowed to change it.
      if (canEdit && giftLevel !== savedGift) {
        const res  = await fetch('/api/alliance/settings', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ alliance_id: allianceId, gift_level: giftLevel }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Failed to save gift level'); return }
        setSavedGift(giftLevel)
      }

      if (canRename && (tag !== savedTag || name !== savedName)) {
        const res  = await fetch('/api/alliance/rename', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ alliance_id: allianceId, tag, name }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Failed to rename'); return }
        setSavedTag(data.tag ?? tag)
        setSavedName(data.name ?? name)
      }

      setEditing(false)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-tactical-500">Alliance Overview</p>
          <p className="font-semibold text-tactical-900">
            {savedTag ? `[${savedTag}] ${savedName}` : 'Command Center'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canOpenEdit && !editing && (
            <button
              onClick={startEdit}
              className="text-xs px-2.5 py-1 rounded-lg border border-tactical-200 text-tactical-500 hover:border-accent hover:text-accent transition-colors"
            >
              ✏ Edit
            </button>
          )}
          <span className="text-3xl">🏰</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {editing && canRename && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1">Tag</label>
            <input
              type="text"
              maxLength={5}
              className="input-base font-mono uppercase"
              value={tag}
              onChange={e => setTag(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1">Name</label>
            <input
              type="text"
              className="input-base"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-overlay p-3 text-center">
          <p className="text-xs text-tactical-500">Members</p>
          <p className="text-xl font-semibold text-tactical-900">
            {activeCount}/100
          </p>
        </div>

        <div className="rounded-xl bg-surface-overlay p-3 text-center">
          <p className="text-xs text-tactical-500 mb-1">Gift Level</p>
          {editing && canEdit ? (
            <input
              type="number"
              min={1}
              className="w-full text-center text-xl font-semibold text-tactical-900 bg-white rounded-lg border border-accent/40 py-0.5"
              value={giftLevel}
              onChange={e => setGiftLevel(Number(e.target.value))}
            />
          ) : (
            <p className="text-xl font-semibold text-tactical-900">{savedGift}</p>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={cancel} disabled={saving} className="btn-secondary text-xs py-1.5 px-3">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn-primary text-xs py-1.5 px-3">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

