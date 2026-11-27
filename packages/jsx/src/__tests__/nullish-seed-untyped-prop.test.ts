/**
 * #3987: a signal seeded `<prop> ?? <fallback>` over a prop declared
 * `unknown` / `any` holds whatever the caller passes, so it is not typed as
 * the fallback. A prop with a concrete type, an explicit type argument, an
 * untyped props object and a module binding named like a prop keep the
 * fallback's type.
 */
import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'

function seedType(params: string, init: string, prelude = ''): string {
  const source = `
'use client'
import { createSignal } from '@barefootjs/client'
${prelude}
export function T(${params}) {
  const [v] = createSignal(${init})
  return <p>{String(v())}</p>
}
`
  const ctx = analyzeComponent(source, 'T.tsx')
  return ctx.signals[0].type.raw
}

describe('?? seed over an unknown-typed prop (#3987)', () => {
  test.each([
    ['props: { children?: unknown }', "props.children ?? 'missing'"],
    ['props: { children?: any }', "props.children ?? 'missing'"],
    ['props: { x?: unknown }', "(props.x) ?? 0"],
    ['{ children }: { children?: unknown }', "children ?? 'missing'"],
    ['{ children: kids }: { children?: unknown }', "kids ?? 'missing'"],
  ])('%s: %s is unknown', (params, init) => {
    expect(seedType(params, init)).toBe('unknown')
  })

  test.each([
    ['props: { label?: string }', "props.label ?? 'missing'", 'string'],
    ['props: { n?: number }', 'props.n ?? 0', 'number'],
    ['props', "props.children ?? 'missing'", 'string'],
  ])('%s: %s keeps the fallback type', (params, init, raw) => {
    expect(seedType(params, init)).toBe(raw)
  })

  test('an explicit type argument wins', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function T(props: { children?: unknown }) {
  const [v] = createSignal<string>(props.children as string ?? 'missing')
  return <p>{v()}</p>
}
`
    expect(analyzeComponent(source, 'T.tsx').signals[0].type.raw).toBe('string')
  })

  test('a module binding named like a prop of a props object is not the prop', () => {
    expect(seedType('props: { children?: unknown }', "children ?? 'missing'", "const children = 'module'")).toBe('string')
  })
})
