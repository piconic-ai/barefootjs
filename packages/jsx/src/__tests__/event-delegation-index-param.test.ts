/**
 * BarefootJS Compiler — delegated handlers may close over the `.map()` index
 * param (#2189).
 *
 * When a list-item event handler references the `.map((item, i) => ...)` index
 * parameter, the compiler lowers the per-item handler into a single delegated
 * listener on the container. That dispatcher re-derives the item from
 * `data-key` / DOM position but historically dropped the index, so the handler
 * closure referenced a dangling `i` and threw `ReferenceError: i is not
 * defined` the first time it fired.
 *
 * Fix (#2189): re-derive the index at dispatch time from the same runtime
 * source the item comes from — `arr.findIndex(...)` for keyed lookups, the
 * already-computed DOM position for the index shapes — and bind it under the
 * user's param name so the reference resolves.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('delegated handler closing over the .map() index (#2189)', () => {
  test('keyed loop: index is re-derived via findIndex and bound', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; label: string }
      export function Repro() {
        const [items] = createSignal<Item[]>([])
        const handle = (index: number) => { console.log(index) }
        return (
          <ul>
            {items().map((item, i) => (
              <li key={item.id}>
                <button onClick={() => handle(i)}>{item.label}</button>
              </li>
            ))}
          </ul>
        )
      }
    `)

    // The index param `i` must be bound inside the delegation dispatcher.
    expect(content).toContain('const i = items().findIndex(item => String(item.id) === key)')
    // ...and the handler is still invoked with the synthetic event.
    expect(content).toContain('(() => handle(i))(__bfEvt)')
    // No dangling reference: `i` is declared before the handler call runs.
    const idxDecl = content.indexOf('const i = items().findIndex')
    const idxCall = content.indexOf('handle(i))(__bfEvt)')
    expect(idxDecl).toBeGreaterThanOrEqual(0)
    expect(idxCall).toBeGreaterThan(idxDecl)
  })

  test('index binding is omitted when no handler references the index', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; label: string }
      export function Repro() {
        const [items] = createSignal<Item[]>([])
        const handle = (id: number) => { console.log(id) }
        return (
          <ul>
            {items().map((item, i) => (
              <li key={item.id}>
                <button onClick={() => handle(item.id)}>{item.label}</button>
              </li>
            ))}
          </ul>
        )
      }
    `)

    // Nothing references `i`, so the dispatcher must not emit an index binding.
    expect(content).not.toContain('const i = items().findIndex')
    expect(content).toContain('(() => handle(item.id))(__bfEvt)')
  })

  test('index param also works alongside item access in the same handler', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; label: string }
      export function Repro() {
        const [items] = createSignal<Item[]>([])
        const handle = (id: number, index: number) => { console.log(id, index) }
        return (
          <ul>
            {items().map((item, i) => (
              <li key={item.id}>
                <button onClick={() => handle(item.id, i)}>{item.label}</button>
              </li>
            ))}
          </ul>
        )
      }
    `)

    expect(content).toContain('const i = items().findIndex(item => String(item.id) === key)')
    expect(content).toContain('handle(item.id, i))(__bfEvt)')
  })
})
