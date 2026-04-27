/**
 * BarefootJS Compiler - Non-bubbling event delegation (#852)
 *
 * Events like mouseenter/mouseleave do not bubble, so event delegation on a
 * container element must use capture-phase listeners (addEventListener(..., true)).
 * Without capture, the container never receives these events and handlers silently fail.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('non-bubbling event delegation (#852)', () => {
  test('onMouseEnter in dynamic loop uses capture-phase delegation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string }

      export function HoverList() {
        const [items, setItems] = createSignal<Item[]>([])
        const handleEnter = (id: string) => console.log('enter', id)

        return (
          <ul>
            {items().map(item => (
              <li key={item.id} onMouseEnter={() => handleEnter(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'HoverList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('mouseenter', (__bfEvt) => {")
    expect(content).toContain('}, true)')
    expect(content).toContain('target.closest')
    expect(content).toContain('handleEnter(item.id)')
  })

  test('onMouseLeave in static array loop uses capture-phase delegation', () => {
    const source = `
      'use client'

      export function HoverList() {
        const items = [{ id: '1' }, { id: '2' }]
        const handleLeave = (id: string) => console.log('leave', id)

        return (
          <ul>
            {items.map(item => (
              <li key={item.id} onMouseLeave={() => handleLeave(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'HoverList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('mouseleave', (__bfEvt) => {")
    expect(content).toContain('}, true)')
    expect(content).toContain('target.closest')
    expect(content).toContain('handleLeave(item.id)')
  })

  test('onPointerEnter in loop uses capture-phase delegation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string }

      export function PointerList() {
        const [items, setItems] = createSignal<Item[]>([])
        const handleEnter = (id: string) => console.log('enter', id)

        return (
          <ul>
            {items().map(item => (
              <li key={item.id} onPointerEnter={() => handleEnter(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'PointerList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('pointerenter', (__bfEvt) => {")
    expect(content).toContain('}, true)')
    expect(content).toContain('target.closest')
    expect(content).toContain('handleEnter(item.id)')
  })

  test('onPointerLeave in loop uses capture-phase delegation', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string }

      export function PointerList() {
        const [items, setItems] = createSignal<Item[]>([])
        const handleLeave = (id: string) => console.log('leave', id)

        return (
          <ul>
            {items().map(item => (
              <li key={item.id} onPointerLeave={() => handleLeave(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'PointerList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('pointerleave', (__bfEvt) => {")
    expect(content).toContain('}, true)')
    expect(content).toContain('target.closest')
    expect(content).toContain('handleLeave(item.id)')
  })

  test('onClick in loop does NOT use capture phase (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string }

      export function ClickList() {
        const [items, setItems] = createSignal<Item[]>([])
        const handleClick = (id: string) => console.log('click', id)

        return (
          <ul>
            {items().map(item => (
              <li key={item.id} onClick={() => handleClick(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'ClickList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('click', (__bfEvt) => {")
    // Bubble-phase listener closes without capture flag
    expect(content).toContain('})')
    // Must NOT have capture flag for click
    expect(content).not.toContain(".addEventListener('click', (__bfEvt) => {" + '\n' + '  }, true)')
  })

  test('onFocus in loop uses capture-phase delegation (existing behavior regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string }

      export function FocusList() {
        const [items, setItems] = createSignal<Item[]>([])
        const handleFocus = (id: string) => console.log('focus', id)

        return (
          <ul>
            {items().map(item => (
              <li key={item.id} onFocus={() => handleFocus(item.id)}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'FocusList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('focus', (__bfEvt) => {")
    expect(content).toContain('}, true)')
    expect(content).toContain('target.closest')
    expect(content).toContain('handleFocus(item.id)')
  })
})
