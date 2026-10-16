// A template reads a computed const as its initializer (#3494): the shared
// substitution every template adapter applies before lowering an
// expression, against metadata built by the real pipeline.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { parseExpression, stringifyParsedExpr } from '../expression-parser'
import { computedConstContext, inlineComputedConsts } from '../adapters/computed-const'

function inliner(source: string, shadowed: readonly string[] = []) {
  const metadata = buildMetadata(analyzeComponent(source, 'test.tsx'))
  const ctx = computedConstContext(metadata, name => shadowed.includes(name))
  return (expr: string) => stringifyParsedExpr(inlineComputedConsts(parseExpression(expr), ctx))
}

describe('inlineComputedConsts (#3494)', () => {
  const source = `
    'use client'
    import { createSignal, useContext, createContext } from '@barefootjs/client'
    const Theme = createContext('light')
    function makeLabel() { return 'x' }
    export function C(props: { v: string; n: number; label?: string; labels: Record<string, string> }) {
      const [count] = createSignal(1)
      const cls = 'btn ' + props.v
      const wide = cls + ' w-full'
      const twice = props.n * 2
      const doubled = count() * 2
      const fallback = props.label ?? 'Default'
      const keys = Object.keys(props.labels)
      const total = 5
      const opaque = makeLabel()
      const theme = useContext(Theme)
      const format = (s: string) => s.trim()
      return <p class={wide}>{twice}{doubled}{fallback}{keys.length}{total}{opaque}{theme}{format('a')}</p>
    }
  `

  test('a const computed from props reads as its initializer, through a const of a const', () => {
    const inline = inliner(source)
    expect(inline('twice')).toBe('props.n * 2')
    expect(inline('wide')).toBe('"btn " + props.v + " w-full"')
    expect(inline('fallback')).toBe('props.label ?? "Default"')
  })

  test('a signal read stays a getter call inside the initializer', () => {
    expect(inliner(source)('doubled')).toBe('count() * 2')
  })

  test('an initializer no template lowers is still substituted, for the adapter to refuse', () => {
    expect(inliner(source)('keys.length')).toBe('Object.keys(props.labels).length')
  })

  test('a literal const, an opaque accessor, a context consumer and a function stay as read', () => {
    const inline = inliner(source)
    for (const name of ['total', 'opaque', 'theme']) expect(inline(name)).toBe(name)
    expect(inline("format('a')")).toBe('format("a")')
  })

  test('a name a loop row binds at the read site is the row, not the const', () => {
    expect(inliner(source, ['twice'])('twice')).toBe('twice')
  })

  test('an initializer whose free name the read site rebinds is left alone', () => {
    expect(inliner(source, ['props'])('twice')).toBe('twice')
  })

  test('a callback param shadowing the name keeps the param', () => {
    expect(inliner(source)('rows.map(twice => twice + 1)')).toBe('rows.map(twice => twice + 1)')
  })

  test('a props destructure binding stays as read: the adapter binds it as a props param', () => {
    const inline = inliner(`
      function A(props: { value: number; label?: string }) {
        const { value, label: text = 'none' } = props
        const shown = text + '!'
        return <div>{value}{text}{shown}</div>
      }
      export { A }
    `)
    expect(inline('text')).toBe('text')
    expect(inline('value')).toBe('value')
    expect(inline('shown')).toBe('text + "!"')
  })

  test('a const named like a prop with no default of its own still reads as its initializer', () => {
    const inline = inliner(`
      export function B(props: { label?: string }) {
        const label = props.label ?? 'Default'
        return <p>{label}</p>
      }
    `)
    expect(inline('label')).toBe('props.label ?? "Default"')
  })
})
