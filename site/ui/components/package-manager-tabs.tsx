"use client"
/**
 * PackageManagerTabs Component
 *
 * A tabbed interface for displaying installation commands
 * for different package managers (npm, yarn, pnpm, bun).
 *
 * Uses value switching (single code display area) instead of
 * HTML switching (4 separate TabsContent panels) to minimize
 * serialized props and client JS complexity.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { CopyButton } from './copy-button'

interface PackageManagerTabsProps {
  command: string
}

const tabTriggerBase = 'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none'
const tabTriggerFocus = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const tabTriggerActive = 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30'
const tabTriggerInactive = 'text-foreground dark:text-muted-foreground'

export function PackageManagerTabs(props: PackageManagerTabsProps) {
  const [selected, setSelected] = createSignal('npm')

  const fullCommand = createMemo(() => {
    const prefix = selected() === 'bun' ? 'bunx --bun'
      : selected() === 'pnpm' ? 'pnpm dlx'
      : selected() === 'yarn' ? 'yarn dlx'
      : 'npx'
    return `${prefix} ${props.command}`
  })

  return (
    <div className="flex flex-col gap-2 w-full">
      <div role="tablist" className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
        <button role="tab" aria-selected={selected() === 'npm'} data-state={selected() === 'npm' ? 'active' : 'inactive'} onClick={() => setSelected('npm')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'npm' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'npm' ? 0 : -1}>npm</button>
        <button role="tab" aria-selected={selected() === 'yarn'} data-state={selected() === 'yarn' ? 'active' : 'inactive'} onClick={() => setSelected('yarn')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'yarn' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'yarn' ? 0 : -1}>yarn</button>
        <button role="tab" aria-selected={selected() === 'pnpm'} data-state={selected() === 'pnpm' ? 'active' : 'inactive'} onClick={() => setSelected('pnpm')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'pnpm' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'pnpm' ? 0 : -1}>pnpm</button>
        <button role="tab" aria-selected={selected() === 'bun'} data-state={selected() === 'bun' ? 'active' : 'inactive'} onClick={() => setSelected('bun')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'bun' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'bun' ? 0 : -1}>bun</button>
      </div>
      <div className="relative group">
        <pre className="p-4 pr-12 bg-muted rounded-lg overflow-x-auto text-sm font-mono border">
          <code>{fullCommand()}</code>
        </pre>
        <CopyButton code={fullCommand()} />
      </div>
    </div>
  )
}
