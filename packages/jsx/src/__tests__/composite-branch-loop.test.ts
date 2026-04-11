/**
 * BarefootJS Compiler - Composite loops inside conditional branches (#724)
 *
 * Verifies that loops with child components inside ternary conditionals
 * generate reconcileElements with createComponent in the branch's bindEvents.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('composite loops inside conditional branches (#724)', () => {
  test('loop with child component inside ternary generates composite reconciliation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      export function CartDemo() {
        const [items, setItems] = createSignal([
          { id: 1, name: 'Item A' },
          { id: 2, name: 'Item B' },
        ])

        const removeItem = (id: number) => {
          setItems(prev => prev.filter(item => item.id !== id))
        }

        return (
          <div>
            {items().length > 0 ? (
              <ul>
                {items().map(item => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <Button onClick={() => removeItem(item.id)}>Remove</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Empty</p>
            )}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'CartDemo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Should use reconcileElements inside the branch's bindEvents
    expect(js).toContain('mapArray(')

    // Should use createComponent for Button inside renderItem (CSR path)
    expect(js).toContain("createComponent('Button'")

    // Should use placeholder template (data-bf-ph) instead of inline renderChild
    expect(js).toContain('data-bf-ph')
  })

  test('simple loop inside ternary (no components) uses basic reconciliation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      export function SimpleList() {
        const [items, setItems] = createSignal(['a', 'b', 'c'])
        return (
          <div>
            {items().length > 0 ? (
              <ul>
                {items().map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>Empty</p>
            )}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'SimpleList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Should use mapArray for per-item reactivity
    expect(js).toContain('mapArray(')

    // Should NOT use createComponent (no child components)
    expect(js).not.toContain('createComponent(')
  })

  test('simple loop with onClick inside conditional generates event delegation (#766)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface Item { id: string; name: string }

      export function ItemList(props) {
        const [items, setItems] = createSignal(props.initialItems)

        const handleDelete = (id) => {
          setItems(items().filter(i => i.id !== id))
        }

        return (
          <div>
            {items().length > 0 && (
              <div className="list">
                {items().map(item => (
                  <div key={item.id}>
                    <span>{item.name}</span>
                    <button onClick={() => handleDelete(item.id)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Should use mapArray for the loop
    expect(js).toContain('mapArray(')

    // Should have event delegation (addEventListener + closest pattern)
    expect(js).toContain(".addEventListener('click', (e) => {")
    expect(js).toContain('target.closest')
    expect(js).toContain('handleDelete(item.id)')

    // Should NOT use createComponent (no child components)
    expect(js).not.toContain('createComponent(')
  })

  test('SSR hydration: composite branch loop initializes child components via initChild', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      export function TodoList() {
        const [todos, setTodos] = createSignal([
          { id: 1, text: 'Learn' },
        ])

        return (
          <div>
            {todos().length > 0 ? (
              <div>
                {todos().map(todo => (
                  <div key={todo.id}>
                    <Badge>{todo.text}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p>No todos</p>
            )}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'TodoList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // CSR path should call createComponent for elements (branch loops use CSR rendering)
    expect(js).toContain("createComponent('Badge'")
  })
})
