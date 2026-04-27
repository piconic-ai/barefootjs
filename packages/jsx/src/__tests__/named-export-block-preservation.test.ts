/**
 * Named-export specifier blocks (`export { A, B }` and `export { A } from './path'`)
 * must reach the marked template. Without this, re-exporting an imported symbol
 * from a "use client" barrel is impossible — the dist would import the symbol
 * but never publish it. Inline `export function/const` must not double-emit.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getMarkedTemplate(source: string): string {
  const result = compileJSXSync(source, 'index.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  const out = result.files.find(f => f.type === 'markedTemplate')
  expect(out).toBeDefined()
  return out!.content
}

describe('named-export block preservation', () => {
  test('export { Local, Imported } block re-exports an imported symbol', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
import { Bar } from './bar'

function ChartContainer(props: { children: unknown }) {
  return <div>{props.children}</div>
}

export {
  ChartContainer,
  Bar,
}
`
    const template = getMarkedTemplate(source)

    expect(template).toContain(`import { Bar } from './bar'`)
    expect(template).toMatch(/export\s*\{[^}]*\bBar\b[^}]*\}/)
    expect(template).toContain('export function ChartContainer')
  })

  test(`export { X } from './y' re-export is preserved verbatim`, () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'

function ChartContainer(props: { children: unknown }) {
  return <div>{props.children}</div>
}

export { Bar } from './bar'
export { ChartContainer }
`
    const template = getMarkedTemplate(source)

    expect(template).toMatch(/export\s*\{\s*Bar\s*\}\s*from\s*['"]\.\/bar['"]/)
    expect(
      /export function ChartContainer/.test(template) ||
        /export\s*\{[^}]*\bChartContainer\b[^}]*\}/.test(template)
    ).toBe(true)
  })

  test('aliased re-export is preserved even when local has inline export', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'

export function ChartContainer(props: { children: unknown }) {
  return <div>{props.children}</div>
}

export { ChartContainer as DefaultChartContainer }
`
    const template = getMarkedTemplate(source)

    // Aliased re-export adds a new external name; both the inline and the
    // alias must survive without duplicate-binding error.
    expect(template.match(/export function ChartContainer\b/g)?.length).toBe(1)
    expect(template).toMatch(/export\s*\{\s*ChartContainer\s+as\s+DefaultChartContainer\s*\}/)
  })

  test('inline-exported function is not double-emitted by trailing export block', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
import { Bar } from './bar'

export function ChartContainer(props: { children: unknown }) {
  return <div>{props.children}</div>
}

export { ChartContainer, Bar }
`
    const template = getMarkedTemplate(source)

    expect(template.match(/export function ChartContainer\b/g)?.length).toBe(1)
    expect(template).toMatch(/export\s*\{[^}]*\bBar\b[^}]*\}/)
    // The trailing block must filter ChartContainer out and emit `export { Bar }` only.
    expect(template).not.toMatch(/export\s*\{[^}]*ChartContainer[^}]*\}\s*(?!from)/)
  })

  test('type-only re-export survives', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'

function ChartContainer(props: { children: unknown }) {
  return <div>{props.children}</div>
}

export type { BarProps } from './bar'
`
    const template = getMarkedTemplate(source)

    expect(template).toMatch(/export\s+type\s*\{\s*BarProps\s*\}\s*from\s*['"]\.\/bar['"]/)
  })
})
