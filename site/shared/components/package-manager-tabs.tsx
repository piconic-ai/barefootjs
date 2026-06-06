"use client"

import { createSignal, createMemo } from '@barefootjs/client'

// Two modes:
//   dlx    — run a one-shot binary (default). `command` is the bare CLI;
//            tabs render `npx <cmd>` / `bunx --bun <cmd>` / etc.
//   create — `npm create <starter>` family. `command` is the part after
//            `create`, e.g. `barefootjs@latest` (no positional — the
//            scaffolder prompts for the target dir). The npm tab keeps
//            `@latest`; the others strip it (only npm honours that
//            suffix in the create-* flow).
export interface PackageManagerTabsProps {
  command: string
  mode?: 'dlx' | 'create'
  defaultPm?: 'npm' | 'bun' | 'pnpm' | 'yarn' | 'deno'
}

const tabTriggerBase = 'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none'
const tabTriggerFocus = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const tabTriggerActive = 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30'
const tabTriggerInactive = 'text-foreground dark:text-muted-foreground'

export function PackageManagerTabs(props: PackageManagerTabsProps) {
  const [selected, setSelected] = createSignal(props.defaultPm ?? 'npm')
  const [copied, setCopied] = createSignal(false)

  const fullCommand = createMemo(() => {
    const pm = selected()
    const mode = props.mode ?? 'dlx'
    if (mode === 'create') {
      const stripped = props.command.replace(/@[^\s]+/, '')
      if (pm === 'npm') return `npm create ${props.command}`
      if (pm === 'bun') return `bun create ${stripped}`
      if (pm === 'pnpm') return `pnpm create ${stripped}`
      // Deno has no `create` shorthand — it runs the `create-*` package
      // straight from npm via `deno x` + the `npm:` specifier (e.g.
      // `create barefootjs@latest` → `deno x npm:create-barefootjs`).
      if (pm === 'deno') return `deno x npm:create-${stripped}`
      return `yarn create ${stripped}`
    }
    if (pm === 'bun') return `bunx --bun ${props.command}`
    if (pm === 'pnpm') return `pnpm dlx ${props.command}`
    if (pm === 'yarn') return `yarn dlx ${props.command}`
    // `deno x npm:<cmd>` (Deno 2.6+) is Deno's one-shot-binary form
    // (mirrors `npx <cmd>`); `deno x` defaults to `--allow-all`, so it
    // already has the access the CLI needs to write files.
    if (pm === 'deno') return `deno x npm:${props.command}`
    return `npx ${props.command}`
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCommand()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div role="tablist" className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
        <button role="tab" aria-selected={selected() === 'npm'} data-state={selected() === 'npm' ? 'active' : 'inactive'} onClick={() => setSelected('npm')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'npm' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'npm' ? 0 : -1}>npm</button>
        <button role="tab" aria-selected={selected() === 'yarn'} data-state={selected() === 'yarn' ? 'active' : 'inactive'} onClick={() => setSelected('yarn')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'yarn' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'yarn' ? 0 : -1}>yarn</button>
        <button role="tab" aria-selected={selected() === 'pnpm'} data-state={selected() === 'pnpm' ? 'active' : 'inactive'} onClick={() => setSelected('pnpm')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'pnpm' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'pnpm' ? 0 : -1}>pnpm</button>
        <button role="tab" aria-selected={selected() === 'bun'} data-state={selected() === 'bun' ? 'active' : 'inactive'} onClick={() => setSelected('bun')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'bun' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'bun' ? 0 : -1}>bun</button>
        <button role="tab" aria-selected={selected() === 'deno'} data-state={selected() === 'deno' ? 'active' : 'inactive'} onClick={() => setSelected('deno')} className={`${tabTriggerBase} ${tabTriggerFocus} ${selected() === 'deno' ? tabTriggerActive : tabTriggerInactive}`} tabindex={selected() === 'deno' ? 0 : -1}>deno</button>
      </div>
      <div className="relative group">
        <pre className="!m-0 p-4 pr-12 bg-muted rounded-lg overflow-x-auto text-sm font-mono border">
          <code>{fullCommand()}</code>
        </pre>
        <button
          type="button"
          className="absolute top-2 right-2 p-2 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Copy command"
          onClick={handleCopy}
        >
          {copied() ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          )}
        </button>
      </div>
    </div>
  )
}
