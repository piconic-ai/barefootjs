/**
 * BarefootJS Compiler - .flatMap() support (#1554 / #1448 Tier C)
 *
 * flatMap callbacks containing JSX must compile to valid JS for
 * JavaScript runtime adapters (Hono, CSR). Template-language adapters
 * (Go, Mojo) do not support flatMap — the workaround is .map() + Fragment.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new TestAdapter()

describe('.flatMap() — simple arrow with array literal', () => {
  test('arrow body returning [<A/>, <B/>] compiles to flatMap with valid JS', () => {
    const source = `
      'use client'

      export function DL(props: { items: { term: string; def: string }[] }) {
        return (
          <dl>
            {props.items.flatMap((item, i) => [
              <dt key={\`dt-\${i}\`}>{item.term}</dt>,
              <dd key={\`dd-\${i}\`}>{item.def}</dd>
            ])}
          </dl>
        )
      }
    `
    const result = compileJSX(source, 'DL.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs.content).toContain('.flatMap(')
    expect(clientJs.content).toContain('.join(')
    // Template contains compiled HTML (not raw JSX)
    expect(clientJs.content).toContain('item.term')
    expect(clientJs.content).toContain('item.def')
  })
})

describe('.flatMap() — complex block body with conditional returns', () => {
  test('block body with variable JSX and conditional returns produces valid client JS', () => {
    const source = `
      'use client'

      export function Timeline(props: { frames: { label: string }[] }) {
        return (
          <div>
            {props.frames.flatMap((frame, i) => {
              const panel = (
                <ResizablePanel key={\`p-\${i}\`}>
                  {i + 1}
                </ResizablePanel>
              )
              if (i === 0) return [panel]
              return [<ResizableHandle key={\`h-\${i}\`} />, panel]
            })}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Timeline.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs.content).toContain('.flatMap(')
    expect(clientJs.content).toContain('.join(')
    // JSX should be compiled to renderChild calls, not raw JSX
    expect(clientJs.content).toContain("renderChild('ResizablePanel'")
    expect(clientJs.content).toContain("renderChild('ResizableHandle'")
    expect(clientJs.content).not.toContain('<ResizablePanel')
    expect(clientJs.content).not.toContain('<ResizableHandle')
  })
})

describe('.flatMap() — Hono adapter', () => {
  test('Hono preserves JSX in flatMap callback', () => {
    const source = `
      'use client'

      export function Timeline(props: { frames: { label: string }[] }) {
        return (
          <div>
            {props.frames.flatMap((frame, i) => {
              const panel = (
                <ResizablePanel key={\`p-\${i}\`}>
                  {i + 1}
                </ResizablePanel>
              )
              if (i === 0) return [panel]
              return [<ResizableHandle key={\`h-\${i}\`} />, panel]
            })}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Timeline.tsx', { adapter: new HonoAdapter() })
    expect(result.errors).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')!
    // Hono should use flatMap (not map)
    expect(markedTemplate.content).toContain('.flatMap(')
    // Hono preserves JSX natively
    expect(markedTemplate.content).toContain('<ResizablePanel')
    expect(markedTemplate.content).toContain('<ResizableHandle')
  })

  test('simple flatMap arrow with array literal works in Hono', () => {
    const source = `
      'use client'

      export function DL(props: { items: { term: string; def: string }[] }) {
        return (
          <dl>
            {props.items.flatMap((item, i) => [
              <dt key={\`dt-\${i}\`}>{item.term}</dt>,
              <dd key={\`dd-\${i}\`}>{item.def}</dd>
            ])}
          </dl>
        )
      }
    `
    const result = compileJSX(source, 'DL.tsx', { adapter: new HonoAdapter() })
    expect(result.errors).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')!
    expect(markedTemplate.content).toContain('.flatMap(')
  })
})

describe('.flatMap() — single JSX return (same as map)', () => {
  test('flatMap with single JSX return compiles like map', () => {
    const source = `
      'use client'

      export function List(props: { items: string[] }) {
        return (
          <ul>
            {props.items.flatMap((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs.content).toContain('.flatMap(')
    // Template contains compiled HTML template literal, not raw JSX
    expect(clientJs.content).toContain('data-key')
  })
})

describe('.flatMap() — variable-assigned result (#1554 comment)', () => {
  test('flatMap stored in const, then used in JSX, compiles without raw JSX', () => {
    const source = `
      'use client'

      export function TimelineBar(props: { items: string[] }) {
        const children = props.items.flatMap((item, i) => {
          const panel = (
            <ResizablePanel key={item} defaultSize={50} className="segment">
              <span>{i + 1}</span>
            </ResizablePanel>
          )
          if (i === 0) return [panel]
          return [<ResizableHandle key={\`h-\${item}\`} />, panel]
        })

        return (
          <ResizablePanelGroup direction="horizontal">
            {children}
          </ResizablePanelGroup>
        )
      }
    `
    const result = compileJSX(source, 'TimelineBar.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    // flatMap should be used (not map)
    expect(clientJs.content).toContain('.flatMap(')
    // JSX should be compiled to renderChild calls, not raw JSX
    expect(clientJs.content).toContain("renderChild('ResizablePanel'")
    expect(clientJs.content).toContain("renderChild('ResizableHandle'")
    expect(clientJs.content).not.toContain('<ResizablePanel')
    expect(clientJs.content).not.toContain('<ResizableHandle')
    // The raw const declaration should not appear in the init function
    expect(clientJs.content).not.toContain('const children = ')
  })

  test('map() stored in const with JSX also gets inlined', () => {
    const source = `
      'use client'

      export function List(props: { items: string[] }) {
        const rendered = props.items.map((item, i) => (
          <ListItem key={i} label={item} />
        ))

        return (
          <ul>{rendered}</ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs.content).not.toContain('<ListItem')
    expect(clientJs.content).not.toContain('const rendered = ')
  })
})
