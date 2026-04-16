/**
 * BarefootJS Compiler - SSR loop markers for @client loops (#872)
 *
 * When a `@client` loop and a conditional sibling live in the same container,
 * the SSR output must include <!--bf-loop--><!--bf-/loop--> boundary markers
 * even when the initial array is empty.
 *
 * Without the markers, mapArray() on the client resolves anchor = null and
 * appends new elements after the conditional marker instead of before it.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { HonoAdapter } from '../../../../packages/hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()

describe('@client loop SSR markers (#872)', () => {
  test('emits bf-loop/bf-/loop markers in SSR output when @client loop has a conditional sibling', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client-runtime'
export function ChatList() {
  const [items, setItems] = createSignal<string[]>([])
  const [streaming, setStreaming] = createSignal(false)
  return (
    <div id="container">
      {/* @client */ items().map(item => (
        <div key={item} className="item">{item}</div>
      ))}
      {/* @client */ streaming() && (
        <div className="streaming">streaming...</div>
      )}
      <button onClick={() => setItems(prev => [...prev, 'new item'])}>Add</button>
    </div>
  )
}
`
    const result = compileJSXSync(source, 'ChatList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    expect(markedTemplate).toBeDefined()

    const content = markedTemplate!.content

    // The @client loop must emit both boundary markers so mapArray()
    // can locate the correct anchor node (endMarker) for insertions.
    expect(content).toContain("bfComment('loop')")
    expect(content).toContain("bfComment('/loop')")

    // Conditional markers must also be present (unrelated signal)
    expect(content).toContain('bfComment("cond-start:')
    expect(content).toContain('bfComment("cond-end:')

    // The loop markers must appear BEFORE the conditional markers in the output
    const loopMarkerPos = content.indexOf("bfComment('loop')")
    const condMarkerPos = content.indexOf('bfComment("cond-start:')
    expect(loopMarkerPos).toBeLessThan(condMarkerPos)
  })

  test('emits loop markers for @client loop with no conditional siblings', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client-runtime'
export function ItemList() {
  const [items, setItems] = createSignal<string[]>([])
  return (
    <ul>
      {/* @client */ items().map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
`
    const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    expect(markedTemplate).toBeDefined()

    const content = markedTemplate!.content

    // Even with no siblings, loop markers must be emitted for consistent behavior
    expect(content).toContain("bfComment('loop')")
    expect(content).toContain("bfComment('/loop')")
  })

  test('does not render items in SSR output for @client loop (items are rendered client-side only)', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client-runtime'
export function ItemList() {
  const [items, setItems] = createSignal<string[]>([])
  return (
    <ul>
      {/* @client */ items().map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
`
    const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    const content = markedTemplate!.content

    // SSR must not render actual list items (client-only means no server rendering of items)
    expect(content).not.toContain('<li')
    // But loop boundary markers must be present
    expect(content).toContain("bfComment('loop')")
    expect(content).toContain("bfComment('/loop')")
  })

  test('@client filter+map loop emits loop markers in SSR output', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client-runtime'
type Item = { name: string; tags: string[] }
export function ClientOnly() {
  const [items, setItems] = createSignal<Item[]>([])
  return (
    <ul>
      {/* @client */ items().filter(item => item.tags.includes('featured')).map(item => (
        <li>{item.name}</li>
      ))}
    </ul>
  )
}
`
    const result = compileJSXSync(source, 'Test.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    const content = markedTemplate!.content

    expect(content).toContain("bfComment('loop')")
    expect(content).toContain("bfComment('/loop')")
  })
})
