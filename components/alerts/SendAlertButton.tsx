// components/alerts/SendAlertButton.tsx
'use client'

import { Loader2, Send } from 'lucide-react'
import CooldownTimer from './CooldownTimer'

interface SendAlertButtonProps {
  ready: boolean
  secondsRemaining: number
  sending: boolean
  disabled: boolean // true if no preset selected yet, or custom fields incomplete
  quotaExhausted?: boolean
  onClick: () => void
}

export default function SendAlertButton({ ready, secondsRemaining, sending, disabled, quotaExhausted, onClick }: SendAlertButtonProps) {
  if (quotaExhausted) {
    return (
      <button
        type="button"
        disabled
        className="w-full py-4 rounded-2xl bg-tactical-100 text-tactical-500 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
      >
        Daily limit reached — resets at midnight UTC-2
      </button>
    )
  }

  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className="w-full py-4 rounded-2xl bg-tactical-100 text-tactical-500 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
      >
        Next Alert Available In&nbsp;<CooldownTimer secondsRemaining={secondsRemaining} className="tabular-nums" />
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled || sending}
      onClick={onClick}
      className={`w-full py-4 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all
        ${disabled || sending
          ? 'bg-accent-muted cursor-not-allowed'
          : 'bg-accent hover:bg-accent-mid active:scale-[0.98] shadow-sm'}`}
    >
      {sending
        ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
        : <><Send className="w-4 h-4" /> Send Notification</>}
    </button>
  )
}