"use client"
/**
 * KbdDemo Component
 *
 * Basic demo showing Kbd and KbdGroup usage for keyboard shortcuts.
 */

import { Kbd, KbdGroup } from '@ui/components/ui/kbd'

export function KbdDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="kbd-demo">
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>

      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>C</Kbd>
      </KbdGroup>

      <Kbd>Enter</Kbd>
      <Kbd>Shift</Kbd>
      <Kbd>Esc</Kbd>
    </div>
  )
}
