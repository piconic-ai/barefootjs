/**
 * BarefootJS Compiler — Plain `.map()` inside a conditional branch (#1065)
 *
 * Sibling file of `composite-branch-loop.test.ts`. Covers the **plain**
 * branch-loop emission path: a `.map()` whose body is a single native
 * element with no child components and no nested inner loops (so
 * `useElementReconciliation` is false and `BranchPlainLoopPlan` is built
 * instead of `BranchCompositeLoopPlan`).
 *
 * Issue #1065: the plain path's `mapPreambleRaw` field carried the inner
 * `.map()` callback's block-body locals **without** rewriting loop-param
 * references to signal-accessor form. The renderItem callback then read
 * `cell.flag` instead of `cell().flag` — bare `cell` inside the renderItem
 * is the signal accessor function, so `cell.flag === undefined` and the
 * preamble produced wrong values silently. The composite path used
 * `mapPreambleWrapped` correctly.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('plain `.map()` inside a conditional branch (#1065)', () => {
  test('regression #1065: branch-plain mapPreamble references the loop param via signal accessor', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; value: string; flag: boolean }

      export function CondList() {
        const [show] = createSignal(true)
        const [items, setItems] = createSignal<Cell[]>([
          { id: 1, value: 'a', flag: true },
        ])
        return (
          <div onClick={() => setItems(prev => [...prev])}>
            {show() ? (
              <ul>
                {items().map((cell) => {
                  const cls = cell.flag ? 'on' : 'off'
                  return <li key={cell.id} className={cls}>{cell.value}</li>
                })}
              </ul>
            ) : null}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'CondList.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The branch-plain renderItem must rewrite preamble references to
    // `cell()` — `cell` inside the renderItem is the signal accessor, so
    // bare `cell.flag` would resolve to `undefined`. Composite-loop's
    // `${cell().id}` template references are already wrapped; the
    // preamble must match.
    const renderItemSection = js.slice(
      js.indexOf('__disposers.push(createDisposableEffect'),
      js.indexOf('return () => __disposers'),
    )
    expect(renderItemSection.length).toBeGreaterThan(0)
    expect(renderItemSection).toMatch(/const\s+cls\s*=\s*cell\(\)\.flag/)
    expect(renderItemSection).not.toMatch(/const\s+cls\s*=\s*cell\.flag/)
  })

  test('regression #1065: destructured branch-plain mapPreamble rewrites bindings to __bfItem()', () => {
    // Destructured callback param (#951): the wrap pass must rewrite each
    // binding name (here `flag`) to `__bfItem().flag`, matching the
    // template-literal references that already use the destructured form.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; value: string; flag: boolean }

      export function CondListD() {
        const [show] = createSignal(true)
        const [items, setItems] = createSignal<Cell[]>([
          { id: 1, value: 'a', flag: true },
        ])
        return (
          <div onClick={() => setItems(prev => [...prev])}>
            {show() ? (
              <ul>
                {items().map(({ id, value, flag }) => {
                  const cls = flag ? 'on' : 'off'
                  return <li key={id} className={cls}>{value}</li>
                })}
              </ul>
            ) : null}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'CondListD.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    const renderItemSection = js.slice(
      js.indexOf('__disposers.push(createDisposableEffect'),
      js.indexOf('return () => __disposers'),
    )
    // Destructured bindings inside the preamble must read via __bfItem().
    expect(renderItemSection).toMatch(/const\s+cls\s*=\s*__bfItem\(\)\.flag/)
    expect(renderItemSection).not.toMatch(/const\s+cls\s*=\s*flag\b/)
  })
})
