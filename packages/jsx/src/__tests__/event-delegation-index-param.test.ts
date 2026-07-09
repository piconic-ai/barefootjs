/**
 * Delegated handlers closing over the `.map((item, i) => ...)` index param
 * (#2189). The dispatcher re-derives the index at dispatch time and binds it
 * under the user's name, so a handler like `() => handle(i)` no longer throws
 * `ReferenceError: i is not defined`. Gating is byte-for-byte free of churn
 * when the handler doesn't reference the index.
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

  test('index named like a property is not bound when only the property is used', () => {
    // Index param `id` shadows nothing here — the handler reads `item.id`, a
    // property, not the index. Gating is AST-based (free identifiers), so no
    // spurious binding is emitted.
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; label: string }
      export function Repro() {
        const [items] = createSignal<Item[]>([])
        const handle = (n: number) => { console.log(n) }
        return (
          <ul>
            {items().map((item, id) => (
              <li key={item.id}>
                <button onClick={() => handle(item.id)}>{item.label}</button>
              </li>
            ))}
          </ul>
        )
      }
    `)

    expect(content).not.toContain('.findIndex(')
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
