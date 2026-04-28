/**
 * BarefootJS Compiler — mapArray key extraction across ternary branches (#1098).
 *
 * `.map(item => cond ? <A key={X}/> : <B key={X}/>)` used to fall through to
 * mapArray's index-based reconciliation because the IR-side key extractor
 * only inspected the loop body's first child as a single element/component.
 * A conditional first child slipped past the lookup, the keyFn was emitted
 * as `null`, and a `kind: 'a' → 'b'` flip mutated attributes on the wrong
 * tag instead of replacing the DOM node. Surfaced by `PolarGrid` on
 * #1086 step 2 of #1080 (`<polygon>` → `<circle>` switch never took
 * effect).
 *
 * Fix: when every branch of an `IRConditional` declares the same key
 * expression (string-equal after whitespace normalisation), lift it out
 * to mapArray's keyFn argument.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string, file = 'CondKey.tsx'): string {
  const result = compileJSXSync(source, file, { adapter })
  expect(result.errors.filter((e) => (e as { severity?: string }).severity === 'error')).toHaveLength(0)
  const cjs = result.files.find((f) => f.type === 'clientJs')
  expect(cjs).toBeDefined()
  return cjs!.content
}

function mapArrayCalls(content: string): string[] {
  return content
    .split('\n')
    .map((ln) => ln.trim())
    .filter((ln) => ln.startsWith('mapArray('))
}

describe('mapArray key extraction across conditional branches (#1098)', () => {
  test('two-branch ternary, both branches share `key={item.key}`', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { key: string; kind: 'a' | 'b' }
      export function CondMap() {
        const [items] = createSignal<Item[]>([])
        return (
          <div>
            {items().map((it) =>
              it.kind === 'a'
                ? <span key={it.key} data-kind="a" />
                : <span key={it.key} data-kind="b" />
            )}
          </div>
        )
      }
    `
    const calls = mapArrayCalls(clientJs(source))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('(it) => String(it.key)')
    expect(calls[0]).not.toContain('null,')
  })

  test('three-way nested ternary (PolarGrid: polygon | circle | line)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Shape = { key: string; kind: 'circle' | 'polygon' | 'line' }
      export function PolarLike() {
        const [items] = createSignal<Shape[]>([])
        return (
          <svg>
            {items().map((s) =>
              s.kind === 'circle'
                ? <circle key={s.key} cx="0" cy="0" r="10" />
                : s.kind === 'polygon'
                  ? <polygon key={s.key} points="0,0" />
                  : <line key={s.key} x1="0" y1="0" x2="1" y2="1" />
            )}
          </svg>
        )
      }
    `
    const calls = mapArrayCalls(clientJs(source))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('(s) => String(s.key)')
  })

  test('whitespace-only differences in the key expression still unify', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { key: string; kind: 'a' | 'b' }
      export function CondMap() {
        const [items] = createSignal<Item[]>([])
        return (
          <div>
            {items().map((it) =>
              it.kind === 'a'
                ? <span key={ it.key } />
                : <span key={it.key} />
            )}
          </div>
        )
      }
    `
    const calls = mapArrayCalls(clientJs(source))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('String(')
    expect(calls[0]).not.toMatch(/_s\d+, null,/)
  })

  test('mismatched key expressions fall back to null reconciliation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { id: string; otherId: string; kind: 'a' | 'b' }
      export function CondMap() {
        const [items] = createSignal<Item[]>([])
        return (
          <div>
            {items().map((it) =>
              it.kind === 'a'
                ? <span key={it.id} />
                : <span key={it.otherId} />
            )}
          </div>
        )
      }
    `
    const calls = mapArrayCalls(clientJs(source))
    expect(calls).toHaveLength(1)
    // No key extracted — heterogeneous branches must not over-unify.
    expect(calls[0]).toMatch(/_s\d+, null,/)
  })

  // Note: a ternary with one branch missing `key` is a hard BF023/BF024 error
  // (`checkLoopKey` walks each branch independently). Users see the diagnostic
  // before reaching the IR-side `extractLoopKey`, so the "missing-on-one-side"
  // case never compiles and isn't asserted here.

  test('non-conditional bodies still extract keys (no regression)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Item = { key: string; label: string }
      export function PlainMap() {
        const [items] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((it) => <li key={it.key}>{it.label}</li>)}
          </ul>
        )
      }
    `
    const calls = mapArrayCalls(clientJs(source))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('(it) => String(it.key)')
  })
})
