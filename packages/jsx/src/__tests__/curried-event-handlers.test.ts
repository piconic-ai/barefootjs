/**
 * BarefootJS Compiler - Curried event handlers in mapArray (#837)
 *
 * When an event handler attribute is a call expression that returns a function
 * (curried handler pattern), the compiler must:
 * - In the event delegation path: call the result with (e) → (handler(id))(e)
 * - In the direct addEventListener path (nested loops): pass the call expression
 *   directly as the handler value → addEventListener(event, handler(id))
 *
 * Previously, both paths wrapped the expression in (e) => { expr } which
 * discarded the returned function and never passed the event.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('curried event handlers in mapArray (#837)', () => {
  test('delegation path: curried handler result is called with event', () => {
    // onDragStart={handleDragStart(item.id)} where handleDragStart returns a function.
    // The delegation callback must call (handleDragStart(item.id))(__bfEvt), not just
    // evaluate handleDragStart(item.id) as a statement (which discards the result).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function handleDragStart(id: string) {
        return (e: DragEvent) => { e.dataTransfer?.setData("text/plain", id) }
      }

      type Item = { id: string; label: string }

      export function DragList() {
        const [items, setItems] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((item) => (
              <li key={item.id} onDragStart={handleDragStart(item.id)}>
                {item.label}
              </li>
            ))}
          </ul>
        )
      }
    `

    const result = compileJSXSync(source, 'DragList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Delegation callback must call the returned handler with (e)
    expect(content).toContain('(handleDragStart(item.id))(__bfEvt)')

    // The broken pattern (discards return value, never passes e) must not appear
    expect(content).not.toMatch(/if \(item\) handleDragStart\(item\.id\)(?!\()/)
  })

  test('delegation path: regular arrow function handler still works', () => {
    // onClick={() => removeItem(item.id)} — non-curried arrow function handler.
    // Must still generate correct delegation: (() => removeItem(item.id))(__bfEvt).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Item = { id: string }

      export function App() {
        const [items, setItems] = createSignal<Item[]>([])
        const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))
        return (
          <ul>
            {items().map((item) => (
              <li key={item.id} onClick={() => removeItem(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `

    const result = compileJSXSync(source, 'App.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Arrow function handler: called via (handler)(e)
    expect(content).toContain('(() => removeItem(item.id))(__bfEvt)')
  })

  test('direct addEventListener path: curried handler passed as value (nested loop)', () => {
    // In nested loops (outer + inner), events on inner items use direct addEventListener
    // (not delegation). The curried handler must be passed as the handler value:
    //   addEventListener('dragstart', handleDragStart(child().id))
    // NOT wrapped in (e) => { handleDragStart(child().id) } which discards the result.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function handleDragStart(id: string) {
        return (e: DragEvent) => { e.dataTransfer?.setData("text/plain", id) }
      }

      type Child = { id: string; label: string }
      type Group = { id: string; children: Child[] }

      export function NestedDragList() {
        const [groups, setGroups] = createSignal<Group[]>([])
        return (
          <div>
            {groups().map(group => (
              <div key={group.id}>
                {group.children.map(child => (
                  <div key={child.id} onDragStart={handleDragStart(child.id)}>
                    {child.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `

    const result = compileJSXSync(source, 'NestedDragList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Curried handler passed directly as addEventListener value (evaluated at item setup time)
    expect(content).toContain("addEventListener('dragstart', handleDragStart(child().id))")

    // The broken pattern (wraps in (e) => { } and discards return) must not appear
    expect(content).not.toContain('(e) => { handleDragStart(')
  })
})
