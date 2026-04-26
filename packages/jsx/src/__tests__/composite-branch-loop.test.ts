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
      import { createSignal } from '@barefootjs/client'

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

    // After O-1's mode-collapse PR, child component init goes through the
    // runtime `upsertChild` helper instead of an emit-side
    // createComponent/initChild dispatch. The helper resolves the SSR vs
    // CSR shape at runtime — see `packages/client/src/runtime/registry.ts`.
    expect(js).toContain("upsertChild(")
    expect(js).toContain("'Button'")

    // Should use placeholder template (data-bf-ph) instead of inline renderChild
    expect(js).toContain('data-bf-ph')
  })

  test('simple loop inside ternary (no components) uses basic reconciliation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

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
      import { createSignal } from '@barefootjs/client'

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
    expect(js).toContain(".addEventListener('click', (__bfEvt) => {")
    expect(js).toContain('target.closest')
    expect(js).toContain('handleDelete(item.id)')

    // Should NOT use createComponent (no child components)
    expect(js).not.toContain('createComponent(')
  })

  test('SSR hydration: composite branch loop initializes child components via initChild', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

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

    // After O-1's mode-collapse PR, the SSR initChild and CSR createComponent
    // emissions are unified into a single `upsertChild` runtime call that
    // resolves the shape at runtime — see registry.ts.
    expect(js).toContain("upsertChild(")
    expect(js).toContain("'Badge'")
  })
})

describe('direct map call as conditional branch (#783)', () => {
  test('logical AND with direct .map() does not emit jsxDEV calls', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Group { key: string; label: string; items: string[] }

      export function GroupList(props) {
        const [mode, setMode] = createSignal('flat')
        const [groups] = createSignal(props.initialGroups)

        return (
          <div>
            <button onClick={() => setMode(mode() === 'flat' ? 'grouped' : 'flat')}>
              Toggle
            </button>
            {mode() === 'grouped' &&
              groups().map((group) => (
                <div key={group.key} className="group">
                  <h2>{group.label}</h2>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'GroupList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Must NOT contain raw jsxDEV calls
    expect(js).not.toMatch(/jsxDEV/)

    // Template should contain inline .map() expression
    expect(js).toContain('.map(')
  })

  test('ternary with direct .map() in true branch', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ItemList(props) {
        const [items] = createSignal(props.initialItems)

        return (
          <div>
            {items().length > 0
              ? items().map((item) => (
                  <div key={item.id}>{item.name}</div>
                ))
              : <p>No items</p>
            }
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Must NOT contain raw jsxDEV calls
    expect(js).not.toMatch(/jsxDEV/)

    // Template should contain inline .map() expression
    expect(js).toContain('.map(')
  })

  test('parenthesized .map() in conditional branch', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TagList(props) {
        const [show] = createSignal(true)
        const [tags] = createSignal(props.tags)

        return (
          <div>
            {show() && (tags().map((tag) => (
              <span key={tag}>{tag}</span>
            )))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'TagList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Must NOT contain raw jsxDEV calls
    expect(js).not.toMatch(/jsxDEV/)

    // Template should contain inline .map() expression
    expect(js).toContain('.map(')
  })
})

describe('mapPreamble in event delegation handlers (#851)', () => {
  test('keyed loop with block body: preamble appears in event delegation handler', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal([{ id: '1', name: 'a' }])
        const handleClick = (label: string) => console.log(label)
        return (
          <ul>
            {items().map(item => {
              const label = item.name.toUpperCase()
              return <li key={item.id}><button onClick={() => handleClick(label)}>{label}</button></li>
            })}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Preamble must appear in event delegation handler (not only in renderItem)
    expect(js).toContain(".addEventListener('click', (__bfEvt) => {")
    const count = js.split('const label = item.name.toUpperCase()').length - 1
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('branch loop with block body: preamble appears in branch event delegation handler (#851)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal([{ id: '1', name: 'a' }])
        const [currentId, setCurrentId] = createSignal('')
        const handleClick = (id: string) => console.log('click', id)
        const handleClose = () => console.log('close')
        return (
          <ul>
            {items().length > 0 && (
              <div>
                {items().map(item => {
                  const isCurrent = item.id === currentId()
                  return (
                    <li key={item.id} onClick={() => (isCurrent ? handleClose() : handleClick(item.id))}>
                      {item.name}
                    </li>
                  )
                })}
              </div>
            )}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Preamble must appear inside the delegation handler
    expect(js).toContain(".addEventListener('click', (__bfEvt) => {")
    const count = js.split('const isCurrent = item.id === currentId()').length - 1
    expect(count).toBeGreaterThanOrEqual(2)
  })
})
