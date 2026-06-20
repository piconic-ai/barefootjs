/**
 * bf-p Serialization Contract Tests (#1952)
 *
 * Verifies that both adapters agree on what goes into the bf-p attribute
 * (the JSON-serialized props the client reads at hydration time).
 *
 * The contract:
 *   - `children` (rendered HTML forwarded to a child component) MUST NOT
 *     appear in bf-p. Children are already in the DOM; serialising them
 *     leaks nested scope IDs and bloats the attribute.
 *   - Event handlers (`on*`) MUST NOT appear in bf-p.
 *   - Internal hydration props (`__*`, `BfIsRoot`, etc.) MUST NOT appear.
 *
 * Hono enforces this through runtime filtering (`propsToSerialize`).
 * Go enforces this through struct-tag exclusion (`json:"-"`).
 * This test verifies both sides of that contract from a single source.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'

const CHILD_COMPONENT_SOURCE = `
'use client'
export function Card(props: { children?: unknown }) {
  return <section>{props.children ?? ''}</section>
}
`

const PARENT_SOURCE = `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './card'
export function Page() {
  const [x, setX] = createSignal(0)
  return (
    <main data-x={x()}>
      <Card>
        <span>hello</span>
        <span>world</span>
      </Card>
    </main>
  )
}
`

describe('bf-p serialization contract (#1952)', () => {
  describe('children prop excluded from bf-p', () => {
    test('Hono: children prop is filtered out of __hydrateProps for components with JSX children', () => {
      const adapter = new HonoAdapter()
      const result = compileJSX(CHILD_COMPONENT_SOURCE.trimStart(), 'Card.tsx', { adapter })
      const template = result.files.find(f => f.type === 'markedTemplate')
      if (!template) return
      expect(template.content).not.toMatch(/__hydrateProps\[['"]children['"]\]/)
    })

    test('Go: Children struct field tagged json:"-"', () => {
      const adapter = new GoTemplateAdapter()
      const result = compileJSX(CHILD_COMPONENT_SOURCE.trimStart(), 'Card.tsx', {
        adapter,
        outputIR: true,
      })
      const irFile = result.files.find(f => f.type === 'ir')
      if (!irFile) return
      const ir = JSON.parse(irFile.content)
      const types = adapter.generateTypes(ir)
      expect(types).toBeDefined()
      expect(types!).toMatch(/Children\s+\S+\s+`json:"-"`/)
    })
  })

  describe('non-children props are serialized', () => {
    const SOURCE_WITH_DATA_PROP = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter(props: { initial: number }) {
  const [count, setCount] = createSignal(props.initial)
  return <button onClick={() => setCount(c => c + 1)}>{count()}</button>
}
`

    test('Hono: data props appear in __hydrateProps', () => {
      const adapter = new HonoAdapter()
      const result = compileJSX(SOURCE_WITH_DATA_PROP.trimStart(), 'Counter.tsx', { adapter })
      const template = result.files.find(f => f.type === 'markedTemplate')
      if (!template) return
      expect(template.content).toMatch(/__hydrateProps\[['"]initial['"]\]/)
    })

    test('Go: data props tagged with json:"<name>"', () => {
      const adapter = new GoTemplateAdapter()
      const result = compileJSX(SOURCE_WITH_DATA_PROP.trimStart(), 'Counter.tsx', {
        adapter,
        outputIR: true,
      })
      const irFile = result.files.find(f => f.type === 'ir')
      if (!irFile) return
      const ir = JSON.parse(irFile.content)
      const types = adapter.generateTypes(ir)
      expect(types).toBeDefined()
      expect(types!).toContain('`json:"initial"`')
    })
  })
})
