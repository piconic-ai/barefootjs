/**
 * Codegen-shape pins for #2869: every eager reactive-attribute write must go
 * through `emitDedupedAttrUpdate` (`emit-reactive.ts`), never `emitAttrUpdate`
 * directly from an effect body. These are cheap shape assertions alongside
 * the behavioral regression test in
 * `packages/client/__tests__/runtime/issue-2869-attr-dedup-guard.test.ts`,
 * which is the one that actually proves the fix (this file cannot observe
 * write counts over time, only the emitted source shape).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string, options: Parameters<typeof compileJSX>[2] = { adapter }): string {
  const result = compileJSX(source, 'Repro.tsx', options)
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  return clientJs
}

// Non-loop per-slot reactive attrs (`emitReactiveAttributeUpdates`) — two
// attrs sharing one element, one of them wrapped in `untrack`.
const NON_LOOP_SOURCE = `'use client'
import { createSignal, untrack } from '@barefootjs/client'

function docFor(n: number): string {
  return 'doc-' + n
}

export function Repro() {
  const [count, setCount] = createSignal(0)
  const [step, setStep] = createSignal(1)
  return (
    <div>
      <button class="count" onClick={() => setCount(c => c + 1)}>count</button>
      <button class="step" onClick={() => setStep(s => s + 1)}>step</button>
      <p class="target" title={String(count())} data-doc={untrack(() => docFor(step()))}>x</p>
    </div>
  )
}
`

// Keyed \`.map()\` row whose bindings share one fused row effect
// (\`emitConsolidatedRowEffect\`). The loop source is a module-level function
// call (not a signal/prop/literal), so \`lazy-row-eligibility.ts\`'s §9.3(2)
// hydration-consistency gate refuses lazy adoption and the loop takes the
// eager \`stringifyPlainLoop\` -> \`emitConsolidatedRowEffect\` path — the
// primary site #2869 reports. Asserted below (\`mapArray(\` present,
// \`mapArrayLazy(\` absent) so a future eligibility widening fails this test
// loudly instead of silently moving the repro onto the already-guarded path.
const LOOP_SOURCE = `'use client'
import { createSignal, untrack } from '@barefootjs/client'

function seedItems() {
  return [{ id: 1, label: 'a' }, { id: 2, label: 'b' }]
}

function docFor(id: number): string {
  return 'doc-' + id
}

export function Repro() {
  const [items, setItems] = createSignal(seedItems())
  return (
    <div>
      <button onClick={() => setItems(items().map(it => ({ id: it.id, label: it.label + '!' })))}>bump</button>
      <ul>
        {items().map(item => (
          <li key={item.id} title={item.label} data-doc={untrack(() => docFor(item.id))}>{item.label}</li>
        ))}
      </ul>
    </div>
  )
}
`

describe('#2869 — every eager reactive-attr write goes through emitDedupedAttrUpdate', () => {
  test('non-loop reactive attrs: one shared __l store, sequential ordinals, guarded writes', () => {
    const clientJs = clientJsFor(NON_LOOP_SOURCE)

    expect(clientJs).toContain('const __l = []')
    expect(clientJs).toContain('!(0 in __l) || !Object.is(__l[0], __x)')
    expect(clientJs).toContain('!(1 in __l) || !Object.is(__l[1], __x)')
    expect(clientJs).toContain('__l[0] = __x')
    expect(clientJs).toContain('__l[1] = __x')

    // Exactly one store for this element's effect — not one per attr.
    const storeCount = clientJs.split('const __l = []').length - 1
    expect(storeCount).toBe(1)
  })

  test('fused row effect (emitConsolidatedRowEffect): eager mapArray path, guarded per binding', () => {
    const clientJs = clientJsFor(LOOP_SOURCE)

    // Pin the eager path — the whole point of this fixture is exercising
    // `emitConsolidatedRowEffect`, not the already-guarded lazy row graph.
    expect(clientJs).toContain('mapArray(')
    expect(clientJs).not.toContain('mapArrayLazy(')

    expect(clientJs).toContain('const __l = []')
    expect(clientJs).toContain('!(0 in __l) || !Object.is(__l[0], __x)')
    expect(clientJs).toContain('!(1 in __l) || !Object.is(__l[1], __x)')

    const storeCount = clientJs.split('const __l = []').length - 1
    expect(storeCount).toBe(1)
  })

  test('profile mode keeps one createEffect per attr, still guarded', () => {
    const clientJs = clientJsFor(LOOP_SOURCE, { adapter, profile: true })

    // Granularity preserved: two attrs on the row's slot -> two createEffect
    // calls (module docstring in reactive-effects.ts explains why profile
    // mode cannot consolidate — the profiler needs one bfId per binding).
    const effectCount = clientJs.split('createEffect(() => {').length - 1
    expect(effectCount).toBeGreaterThanOrEqual(2)
    expect(clientJs).toContain('const __l = []')
    expect(clientJs).toContain('!(0 in __l) || !Object.is(__l[0], __x)')
  })

  test('emitAttrUpdate is never called directly from an effect-body emitter outside emit-reactive.ts', () => {
    // Shrink-only ledger, same idea as binding-scope-ratchet.test.ts: every
    // eager call site must go through emitDedupedAttrUpdate. lazy-row.ts's
    // own dedup mechanism is unified onto the same helper (#2869), so this
    // is a plain, unconditional invariant now — no allowlist needed.
    const glob = new Bun.Glob('**/*.ts')
    const root = new URL('../ir-to-client-js/', import.meta.url).pathname
    const offenders: string[] = []
    for (const file of glob.scanSync({ cwd: root })) {
      if (file.endsWith('emit-reactive.ts')) continue
      if (file.includes('__tests__')) continue
      const text = require('node:fs').readFileSync(`${root}${file}`, 'utf8')
      if (/\bemitAttrUpdate\(/.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
