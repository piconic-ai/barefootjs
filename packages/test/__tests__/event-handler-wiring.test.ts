/**
 * Tests for EventHandler wiring on TestNode (#1625).
 *
 * Verifies that renderToTest exposes per-event setter information
 * so tests can assert which event handler calls which setter.
 */

import { describe, test, expect } from 'bun:test'
import { renderToTest } from '../src/index'

describe('EventHandler wiring on TestNode', () => {
  test('onClick exposes direct setter call', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(n => n + 1)}>+</button>
      }
    `
    const result = renderToTest(source, 'Counter.tsx')
    const btn = result.find({ tag: 'button' })
    expect(btn).not.toBeNull()
    expect(btn!.onClick).toBeDefined()
    expect(btn!.onClick!.setters).toContain('setCount')
    expect(btn!.onClick!.via).toHaveLength(0)
  })

  test('onClick exposes indirect setter via local function', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoApp() {
        const [todos, setTodos] = createSignal([])
        function addTodo(text: string) {
          setTodos(prev => [...prev, { text }])
        }
        return <button onClick={() => addTodo('new')}>Add</button>
      }
    `
    const result = renderToTest(source, 'TodoApp.tsx')
    const btn = result.find({ tag: 'button' })
    expect(btn!.onClick!.setters).toContain('setTodos')
    expect(btn!.onClick!.via).toContain('addTodo')
  })

  test('multiple events on same element are resolved independently', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Panel() {
        const [selected, setSelected] = createSignal(0)
        const [hovered, setHovered] = createSignal(0)
        return (
          <div
            onClick={() => setSelected(1)}
            onMouseEnter={() => setHovered(1)}
          >content</div>
        )
      }
    `
    const result = renderToTest(source, 'Panel.tsx')
    const div = result.find({ tag: 'div' })
    expect(div!.onClick!.setters).toContain('setSelected')
    expect(div!.onClick!.setters).not.toContain('setHovered')
    expect(div!.on('mouseenter')!.setters).toContain('setHovered')
    expect(div!.on('mouseenter')!.setters).not.toContain('setSelected')
  })

  test('onInput shorthand works', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Search() {
        const [query, setQuery] = createSignal('')
        return <input onInput={(e) => setQuery(e.target.value)} />
      }
    `
    const result = renderToTest(source, 'Search.tsx')
    const input = result.find({ tag: 'input' })
    expect(input!.onInput).toBeDefined()
    expect(input!.onInput!.setters).toContain('setQuery')
  })

  test('onChange shorthand works', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Select() {
        const [value, setValue] = createSignal('a')
        return <select onChange={(e) => setValue(e.target.value)}>
          <option value="a">A</option>
        </select>
      }
    `
    const result = renderToTest(source, 'Select.tsx')
    const sel = result.find({ tag: 'select' })
    expect(sel!.onChange).toBeDefined()
    expect(sel!.onChange!.setters).toContain('setValue')
  })

  test('onSubmit shorthand works', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Form() {
        const [submitted, setSubmitted] = createSignal(false)
        return <form onSubmit={() => setSubmitted(true)}>
          <button type="submit">Go</button>
        </form>
      }
    `
    const result = renderToTest(source, 'Form.tsx')
    const form = result.find({ tag: 'form' })
    expect(form!.onSubmit).toBeDefined()
    expect(form!.onSubmit!.setters).toContain('setSubmitted')
  })

  test('on() fallback returns handler for non-shorthand events', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Keyboard() {
        const [key, setKey] = createSignal('')
        return <input onKeyDown={(e) => setKey(e.key)} />
      }
    `
    const result = renderToTest(source, 'Keyboard.tsx')
    const input = result.find({ tag: 'input' })
    expect(input!.on('keydown')).not.toBeNull()
    expect(input!.on('keydown')!.setters).toContain('setKey')
  })

  test('on() returns null for unregistered events', () => {
    const source = `
      export function Static() {
        return <button>Click</button>
      }
    `
    const result = renderToTest(source, 'Static.tsx')
    const btn = result.find({ tag: 'button' })
    expect(btn!.onClick).toBeUndefined()
    expect(btn!.on('click')).toBeNull()
  })

  test('handler with no setter calls returns empty setters', () => {
    const source = `
      export function Logger() {
        return <button onClick={() => console.log('clicked')}>Log</button>
      }
    `
    const result = renderToTest(source, 'Logger.tsx')
    const btn = result.find({ tag: 'button' })
    expect(btn!.onClick).toBeDefined()
    expect(btn!.onClick!.setters).toHaveLength(0)
  })

  test('stateless component without signals still resolves events', () => {
    const source = `
      interface Props { onSort: () => void }
      export function SortHeader({ onSort }: Props) {
        return <th onClick={onSort}>Name</th>
      }
    `
    const result = renderToTest(source, 'SortHeader.tsx')
    const th = result.find({ tag: 'th' })
    expect(th!.events).toContain('click')
    expect(th!.onClick).toBeDefined()
    expect(th!.onClick!.setters).toHaveLength(0)
  })
})
