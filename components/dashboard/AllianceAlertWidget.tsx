// components/dashboard/AllianceAlertWidget.tsx
// Compact "Send Alert" card for the Dashboard, opening the full alert flow
// as a modal — matches the original mobile app UX (Home screen -> Send
// Alert modal) rather than navigating to a separate page.
'use client'

import { useState, useMemo } from 'react'
import { Bell, X } from 'lucide-react'
import { useAlertStatus } from '@/hooks/useAlertStatus'
import { ALERT_PRESET_MAP, type AlertPresetKey } from '@/lib/alerts/presets'
import AlertGrid          from '@/components/alerts/AlertGrid'
import CustomAlertDialog  from '@/components/alerts/CustomAlertDialog'
import NotificationPreview from '@/components/alerts/NotificationPreview'
import SendAlertButton    from '@/components/alerts/SendAlertButton'
import CooldownTimer      from '@/components/alerts/CooldownTimer'
import Toast              from '@/components/alerts/Toast'

interface AllianceAlertWidgetProps {
  allianceId: string
}

export default function AllianceAlertWidget({ allianceId }: AllianceAlertWidgetProps) {
  const { status, loading, error, refetch } = useAlertStatus(allianceId)
  const [open, setOpen] = useState(false)

  const [selected, setSelected]           = useState<AlertPresetKey | null>(null)
  const [customTitle, setCustomTitle]     = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [sending, setSending]             = useState(false)
  const [toast, setToast] = useState<{ message: string; detail?: string; variant: 'success' | 'error' } | null>(null)

  const preview = useMemo(() => {
    if (!selected) return { title: '', body: '' }
    if (selected === 'custom') {
      return { title: customTitle ? `📢 ${customTitle}` : '', body: customMessage }
    }
    const preset = ALERT_PRESET_MAP[selected]
    return { title: `${preset.icon} ${preset.title}`, body: preset.notificationBody }
  }, [selected, customTitle, customMessage])

  const canSend = useMemo(() => {
    if (!selected) return false
    if (selected === 'custom') return customTitle.trim().length > 0 && customMessage.trim().length > 0
    return true
  }, [selected, customTitle, customMessage])

  function resetForm() {
    setSelected(null)
    setCustomTitle('')
    setCustomMessage('')
  }

  async function handleSend() {
    if (!selected || !canSend || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allianceId,
          alertType: selected,
          ...(selected === 'custom'
            ? { customTitle: customTitle.trim(), customMessage: customMessage.trim() }
            : {}),
        }),
      })
      const data = await res.json()

      if (res.status === 429) {
        setToast({
          message: 'Please wait before sending another alert.',
          detail: `${data.secondsRemaining ?? 0}s remaining`,
          variant: 'error',
        })
        refetch()
        return
      }
      if (!res.ok) {
        setToast({ message: 'Unable to send notification.', detail: data.error ?? 'Retry.', variant: 'error' })
        return
      }

      setToast({
        message: 'Notification sent successfully.',
        detail: `Delivered to ${data.sent} Members`,
        variant: 'success',
      })
      resetForm()
      setOpen(false)
      refetch()
    } catch {
      setToast({ message: 'Unable to send notification.', detail: 'Retry.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const ready = status?.ready ?? true

  return (
    <>
      {/* ── Compact dashboard card ── */}
      <div className="glass-card p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-accent-deep" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-tactical-900">Alliance Alert</p>
            <p className="text-xs text-tactical-500 truncate">
              {loading
                ? 'Loading…'
                : error
                  ? <span className="text-red-500">{error}</span>
                  : ready
                    ? `Ready · ${status?.recipients ?? 0} members`
                    : <>Cooldown <CooldownTimer secondsRemaining={status?.secondsRemaining ?? 0} className="tabular-nums" /></>}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!!error}
          onClick={() => setOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-mid
                     active:scale-[0.97] transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send Alert
        </button>
      </div>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto
                       animate-[slideUp_0.2s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-tactical-900">Send Alert</h2>
                <p className="text-xs text-tactical-500 mt-0.5">Choose an alert to instantly notify every alliance member.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-tactical-400 hover:bg-tactical-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <AlertGrid selected={selected} disabled={!ready} onSelect={setSelected} />

            {selected === 'custom' && (
              <>
                <CustomAlertDialog
                  title={customTitle}
                  message={customMessage}
                  onTitleChange={setCustomTitle}
                  onMessageChange={setCustomMessage}
                />
                <NotificationPreview title={preview.title} body={preview.body} />
              </>
            )}

            <SendAlertButton
              ready={ready}
              secondsRemaining={status?.secondsRemaining ?? 0}
              sending={sending}
              disabled={!canSend}
              onClick={handleSend}
            />
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          detail={toast.detail}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  )
}