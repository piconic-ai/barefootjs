"use client"

/**
 * Copy button for the landing-page quickstart command.
 *
 * A BarefootJS client component (the LP dogfoods its own compiler):
 * signal-based "copy → copied" feedback, no external deps.
 */

import { createSignal } from '@barefootjs/client'

export interface QuickstartCopyProps {
  command: string
}

export function QuickstartCopy(props: QuickstartCopyProps) {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(props.command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  return (
    <button type="button" className="copy-btn" onClick={handleCopy}>
      {copied() ? 'copied' : 'copy'}
    </button>
  )
}
