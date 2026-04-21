/**
 * Regression tests for #943: Solid-style wrap-by-default fallback for
 * `.map()` loops. Follow-up to #937 (architecture) and #939 (text
 * interpolation pilot).
 *
 * Before this change, `jsx-to-ir.ts` decided whether a loop needed
 * reconcileList via `isSignalOrMemoArray(array, ctx)` — a regex
 * allow-list of known signal getters and memos. Any array source the
 * analyzer couldn't prove reactive — e.g. `{getItems().map(...)}`
 * where `getItems` is an imported helper — flowed into the
 * `isStaticArray` branch. SSR rendered the list once; the client
 * never reconciled, so the list stayed frozen.
 *
 * The fix tracks the AST node alongside the `array` string and widens
 * the decision: if the analyzer can't prove the array reactive but the
 * AST contains a function call, force reconciliation. `exprHasFunctionCalls`
 * is the same AST helper used in the text-interpolation pilot (#939)
 * and the conditional follow-up (#941), so this loop widening closes
 * the divergence gap between the allow-list path and the AST-flag path.
 *
 * Over-reconciliation of a pure-call array has a real cost (reconcileList
 * is not a cheap primitive), so the fixture sweep in the accompanying
 * PR measures byte delta too; but the silent-drop bug this closes is
 * the expensive one — a frozen client list is a visible correctness
 * regression.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSXSync(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('Solid-style wrap-by-default fallback for loops (#943)', () => {
  test('known signal array still reconciles (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal<string[]>([])
        return (
          <ul onClick={() => setItems(prev => [...prev, 'x'])}>
            {items().map(item => <li key={item}>{item}</li>)}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'List.tsx')
    // Dynamic loops emit reconcileList / reconcileElements via mapArray.
    expect(clientJs).toMatch(/mapArray|reconcile/)
    expect(clientJs).toContain('items()')
  })

  test('unrecognised call array now reconciles (new behaviour)', () => {
    // `getItems` is an imported helper — the analyzer can't prove the
    // return value reactive. Before the fix the loop baked its SSR
    // output and never updated. With wrap-by-default the call shape on
    // the array expression forces reconciliation.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { getItems } from './data'

      export function List() {
        const [, setFoo] = createSignal(0)
        return (
          <ul onClick={() => setFoo(1)}>
            {getItems().map(item => <li key={item}>{item}</li>)}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'List.tsx')
    expect(clientJs).toMatch(/mapArray|reconcile/)
    expect(clientJs).toContain('getItems()')
  })

  test('inline literal array stays static (optimisation preserved)', () => {
    // `[1, 2, 3]` is an ArrayLiteralExpression with no calls — the
    // existing static-render path is the right call. No reconcileList /
    // mapArray should appear.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [, setFoo] = createSignal(0)
        return (
          <ul onClick={() => setFoo(1)}>
            {[1, 2, 3].map(n => <li key={n}>{n}</li>)}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'List.tsx')
    expect(clientJs).not.toMatch(/\bmapArray\s*\(/)
    expect(clientJs).not.toMatch(/\breconcileList\s*\(/)
  })

  test('static prop array stays static', () => {
    // `items` is a non-destructured prop; the AST is just an
    // Identifier, no calls. Should still take the static path.
    const source = `
      export function List(props: { items: string[] }) {
        return (
          <ul>
            {props.items.map(item => <li key={item}>{item}</li>)}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'List.tsx')
    expect(clientJs).not.toMatch(/\bmapArray\s*\(/)
    expect(clientJs).not.toMatch(/\breconcileList\s*\(/)
  })

  test('unrecognised-call chain with filter now reconciles', () => {
    // `computeItems().filter(t => t.done).map(...)`: the filter
    // predicate is extracted by Phase 1 so `array` normalises to
    // `computeItems()` — still a CallExpression at the AST level, so
    // the widened gate forces reconciliation. Without the widening the
    // extracted-chain path dropped the reactivity signal entirely.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { computeItems } from './data'

      export function DoneList() {
        const [, setFoo] = createSignal(0)
        return (
          <ul onClick={() => setFoo(1)}>
            {computeItems().filter(t => t.done).map(t => <li key={t.id}>{t.label}</li>)}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'DoneList.tsx')
    expect(clientJs).toMatch(/mapArray|reconcile/)
    expect(clientJs).toContain('computeItems()')
  })

  test('nested loop with unrecognised outer call reconciles', () => {
    // Outer `outer()` is an imported helper; inner loop iterates a
    // field on each outer item. The outer loop must reconcile (new
    // behaviour); the inner loop is handled by the existing
    // nested-loop metadata path.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { outer } from './data'

      export function Groups() {
        const [, setFoo] = createSignal(0)
        return (
          <ul onClick={() => setFoo(1)}>
            {outer().map(o => (
              <li key={o.id}>
                <ul>{o.children.map(c => <li key={c}>{c}</li>)}</ul>
              </li>
            ))}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'Groups.tsx')
    expect(clientJs).toMatch(/mapArray|reconcile/)
    expect(clientJs).toContain('outer()')
  })

  test('loop with child component on unrecognised-call array reconciles', () => {
    // Composite rendering path: the loop body is a single component.
    // Previously the `listOf()` silent-drop meant Items were rendered
    // once at SSR and never re-created on signal change. The widened
    // gate now drives the createComponent / reconcile path.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { listOf } from './data'
      import { Item } from './Item'

      export function Shelf() {
        const [, setFoo] = createSignal(0)
        return (
          <ul onClick={() => setFoo(1)}>
            {listOf().map(x => <Item key={x.id} label={x.label} />)}
          </ul>
        )
      }
    `

    const clientJs = getClientJs(source, 'Shelf.tsx')
    expect(clientJs).toMatch(/mapArray|reconcile/)
    expect(clientJs).toContain('listOf()')
  })
})
