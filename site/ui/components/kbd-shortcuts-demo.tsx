"use client"
/**
 * KbdShortcutsDemo Component
 *
 * Realistic scenario showing keyboard shortcuts in a settings-like UI.
 */

import { Kbd, KbdGroup } from '@ui/components/ui/kbd'

export function KbdShortcutsDemo() {
  return (
    <div className="w-full max-w-sm space-y-3" data-testid="kbd-shortcuts-demo">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Search</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Copy</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>C</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Paste</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>V</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Undo</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>Z</Kbd>
        </KbdGroup>
      </div>
    </div>
  )
}
