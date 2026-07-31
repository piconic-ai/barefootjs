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
import { compileJSX } from '../compiler'
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
    const result = compileJSX(source, 'CondList.tsx', { adapter })
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
    const result = compileJSX(source, 'CondListD.tsx', { adapter })
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

  test('regression #1065: a reactive-effect-free branch loop wraps its preamble', () => {
    // The #1065 obligation is that the preamble goes through
    // `wrapLoopParamAsAccessor`, so a bare item read (`cell.flag`) becomes
    // `cell().flag` and stays consistent with the already-wrapped template
    // literal. `mapPreambleWrapped` is computed once in
    // `plan/build-branch-loop.ts` and feeds every emission shape, so that is
    // what this asserts.
    //
    // The SHAPE this source takes moved with the §9.5 preamble widening: a
    // call-free `const` preamble no longer refuses the lazy row graph, so
    // this loop now emits `mapArrayLazy` with the preamble in `createRow`
    // rather than the eager single-line `mapArray(...)` body. The wrap is
    // asserted where the preamble actually lands.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; flag: boolean }

      export function CondListSL() {
        const [show] = createSignal(true)
        const [items, setItems] = createSignal<Cell[]>([
          { id: 1, flag: true },
        ])
        return (
          <div onClick={() => setItems(prev => [...prev])}>
            {show() ? (
              <ul>
                {items().map((cell) => {
                  const cls = cell.flag ? 'on' : 'off'
                  return <li key={cell.id} className={cls}>x</li>
                })}
              </ul>
            ) : null}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'CondListSL.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    const createRow = js.slice(js.indexOf('createRow:'), js.indexOf('applyItem:'))
    expect(createRow.length).toBeGreaterThan(0)
    expect(createRow).toContain('cell().flag')
    expect(createRow).not.toContain(' cell.flag')
    // The preamble must precede the clone: the row template interpolates
    // `cls`.
    expect(createRow.indexOf('const cls =')).toBeLessThan(createRow.indexOf('const __el ='))
  })

  test('regression #1065: a destructured param rewrites preamble bindings to __bfItem()', () => {
    // Cross-product of the two sub-features: destructured callback param
    // (#951) AND a reactive-effect-free loop item. Both wrap pathways must
    // compose so the preamble stays consistent with the template literal's
    // already-wrapped reads. Same shape note as the test above — this loop
    // is lazy-eligible since the §9.5 preamble widening.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; flag: boolean }

      export function CondListSLD() {
        const [show] = createSignal(true)
        const [items, setItems] = createSignal<Cell[]>([
          { id: 1, flag: true },
        ])
        return (
          <div onClick={() => setItems(prev => [...prev])}>
            {show() ? (
              <ul>
                {items().map(({ id, flag }) => {
                  const cls = flag ? 'on' : 'off'
                  return <li key={id} className={cls}>x</li>
                })}
              </ul>
            ) : null}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'CondListSLD.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    const createRow = js.slice(js.indexOf('createRow:'), js.indexOf('applyItem:'))
    expect(createRow.length).toBeGreaterThan(0)
    expect(createRow).toContain('__bfItem().flag')
    // Bare `flag` reference (without `__bfItem().` prefix) would mean the
    // wrap pass missed the destructured binding.
    expect(createRow).not.toMatch(/\bcls\s*=\s*flag\b/)
  })
})
