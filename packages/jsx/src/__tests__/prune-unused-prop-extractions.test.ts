/**
 * Regression: the init body must not eagerly read props it never uses.
 *
 * Props arrive as getters over the parent's reactive state, and a
 * slot-children getter instantiates child components when read — so a
 * stray `const children = _p.children` in a wrapper's init creates a
 * SECOND child instance next to the parent's own `upsertChild` wiring
 * (double event listeners; a Checkbox toggle that cancels itself out).
 * Surfaced by #2537's site migration on site/ui's form-builder, where
 * `<Label><Checkbox onCheckedChange={…}/></Label>` stopped toggling:
 * Vite's ESM import order registers child components before the parent's
 * init runs, so the eager getter read instantiated eagerly instead of
 * hitting the legacy pipeline's pending-init queue.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../index.ts'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/index.ts'

function clientJsOf(source: string, path: string): string {
  const result = compileJSX(source, path, { adapter: new HonoAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  return result.files.find(f => f.type === 'clientJs')?.content ?? ''
}

describe('unused prop extractions are pruned from init', () => {
  test('template-only children/className props are not extracted', () => {
    // Label's real shape: className feeds a reactive class effect (read
    // via `_p.className` inside the effect), children render only in the
    // SSR-adopted template — neither local binding is used by init.
    const js = clientJsOf(
      `"use client"

interface WrapProps {
  className?: string
  children?: unknown
}

function Wrap({ className = '', children, ...props }: WrapProps) {
  return (
    <label data-slot="wrap" className={\`base \${className}\`} {...props}>
      {children}
    </label>
  )
}

export { Wrap }
`,
      '/virtual/wrap.tsx',
    )
    expect(js).toContain('export function initWrap')
    expect(js).not.toContain('const children = _p.children')
  })

  test('props the init genuinely reads keep their extraction', () => {
    // `config` is read by a handler, `items` by an init-scope constant —
    // both local bindings are real and must survive the prune.
    const js = clientJsOf(
      `"use client"

import { createSignal } from '@barefootjs/client'

interface P { config?: { startOpen?: boolean }, items?: string[] }

function Widget({ config = {}, items = [] }: P) {
  const [open, setOpen] = createSignal(false)
  const first = items.length > 0 ? items[0] : 'none'
  return <button onClick={() => setOpen(!!config.startOpen)}>{open() ? first : 'closed'}</button>
}

export { Widget }
`,
      '/virtual/widget.tsx',
    )
    expect(js).toContain('const config = _p.config ?? {}')
    expect(js).toContain('const items = _p.items ?? []')
  })
})
