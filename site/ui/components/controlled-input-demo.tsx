"use client"
/**
 * ControlledInputDemo Components
 *
 * Interactive demo for the createSignal + value/onInput controlled-input pattern.
 */

import { createSignal } from '@barefootjs/client'
import { Input } from '@ui/components/ui/input'

/**
 * Basic controlled input - simple two-way binding
 */
export function BasicControlledDemo() {
  const [text, setText] = createSignal('')
  return (
    <div className="space-y-2">
      <Input
        value={text()}
        onInput={(e) => setText(e.target.value)}
        placeholder="Type something..."
      />
      <p className="text-sm text-muted-foreground">
        Current value: <span className="current-value font-medium text-foreground">{text()}</span>
      </p>
    </div>
  )
}
