import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'
import type { IRElement } from '../types'

const LAYOUT = `
  export function Layout({ title, children }) {
    return (
      <div>
        <h1>{title}</h1>
        <Region>{children}</Region>
      </div>
    )
  }
`

function regionEl(source: string, path: string): IRElement {
  const ir = jsxToIR(analyzeComponent(source, path))
  const root = ir as IRElement
  const region = root.children.find(
    (c): c is IRElement => c.type === 'element' && c.regionId !== undefined,
  )
  if (!region) throw new Error('no region element found')
  return region
}

function markedTemplate(source: string, path: string): string {
  const result = compileJSX(source, path, { adapter: new HonoAdapter() })
  expect(result.errors).toHaveLength(0)
  const marked = result.files.find(f => f.type === 'markedTemplate')
  if (!marked) throw new Error('no markedTemplate emitted')
  return marked.content
}

describe('<Region> page-lifecycle boundary', () => {
  test('lowers <Region>{children}</Region> to a div carrying a regionId', () => {
    const region = regionEl(LAYOUT, 'Layout.tsx')
    expect(region.tag).toBe('div')
    expect(region.regionId).toMatch(/^[0-9a-f]{8}:0$/)
    // The children passed to the region are preserved inside it.
    expect(region.children.length).toBeGreaterThan(0)
  })

  test('assigns sequential structural indices within a file', () => {
    const source = `
      export function Split() {
        return (
          <div>
            <Region><aside /></Region>
            <Region><main /></Region>
          </div>
        )
      }
    `
    const ir = jsxToIR(analyzeComponent(source, 'Split.tsx')) as IRElement
    const ids = ir.children
      .filter((c): c is IRElement => c.type === 'element' && c.regionId !== undefined)
      .map(c => c.regionId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(/:0$/)
    expect(ids[1]).toMatch(/:1$/)
  })

  test('Hono adapter emits bf-region on the boundary element', () => {
    expect(markedTemplate(LAYOUT, 'Layout.tsx')).toMatch(/bf-region="[0-9a-f]{8}:0"/)
  })

  test('region id is deterministic across compiles (not per-run random)', () => {
    // The load-bearing requirement: a layout compiled twice — as it would be
    // when two different pages each compose it — must emit the *same* id, so
    // the client router can match the same region across page documents.
    const a = regionEl(LAYOUT, '/app/shell.tsx').regionId
    const b = regionEl(LAYOUT, '/app/shell.tsx').regionId
    expect(a).toBe(b)
  })

  test('region id differs across layout files (cross-file uniqueness)', () => {
    const a = regionEl(LAYOUT, '/app/shell-a.tsx').regionId
    const b = regionEl(LAYOUT, '/app/shell-b.tsx').regionId
    expect(a).not.toBe(b)
  })
})
