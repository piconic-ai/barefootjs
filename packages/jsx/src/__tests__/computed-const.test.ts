// A template reads a computed const as its initializer (#3494): the shared
// substitution every template adapter applies before lowering an
// expression, against metadata built by the real pipeline.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { parseExpression, stringifyParsedExpr } from '../expression-parser'
import { computedConstContext, inlineComputedConsts } from '../adapters/computed-const'

function inliner(source: string, shadowed: readonly string[] = [], adapterBound: readonly string[] = []) {
  const metadata = buildMetadata(analyzeComponent(source, 'test.tsx'))
  const ctx = computedConstContext(metadata, name => shadowed.includes(name), name => adapterBound.includes(name))
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

  test('a const the adapter binds itself stays as read, also inside another initializer', () => {
    const inline = inliner(source, [], ['cls'])
    expect(inline('cls')).toBe('cls')
    expect(inline('wide')).toBe('cls + " w-full"')
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

describe('a const hop resolved where each const is declared (#3696)', () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    const x = 'module'
    const a = x
    const base = 'm-base'
    const tag = base + '!'
    const alias = tag
    const k = 'mk'
    const ka = k
    function helper() { return 'h' }
    const viaHelper = helper
    export function C({ rows, base }: { rows: string[]; base: string }) {
      const [k] = createSignal('sig')
      const x = 'local'
      const b = a
      const c = alias
      const d = ka
      const helper = 'local-helper'
      const e = viaHelper
      return <ul>{rows.map((a, x) => <li key={a}>{b}{c}{d}{e}</li>)}</ul>
    }
  `

  test('a module const read under a row that shadows its name reads the module binding', () => {
    const inline = inliner(source, ['a', 'x'])
    expect(inline('b')).toBe('"module"')
  })

  test('a module const initializer reads module consts, not the component prop or const of the same name', () => {
    expect(inliner(source, ['alias', 'tag'])('c')).toBe('"m-base" + "!"')
    expect(inliner(source, ['ka'])('d')).toBe('"mk"')
  })

  test('the same module const read with nothing shadowed still reads the module binding', () => {
    const inline = inliner(source)
    expect(inline('b')).toBe('"module"')
    expect(inline('c')).toBe('"m-base" + "!"')
  })

  test('a component const shadows a module const of the same name', () => {
    expect(inliner(source)('x')).toBe('x')
  })

  test('a module binding with no const to read is left alone when the component rebinds its name', () => {
    expect(inliner(source, ['viaHelper'])('e')).toBe('e')
  })
})

describe('only names the component scope binds shadow a module const (#3696)', () => {
  const source = `
    'use client'
    const label = 'module' + '!'
    const tagged = label + '?'
    const title = 'm-title'
    const viaTitle = title
    const n = 1
    export function C(props: { label: string; title: string; n: number; rows: string[] }) {
      const { title } = props
      const n = props.n * 2
      const shown = label
      const hop = tagged
      const t = viaTitle
      const m = n
      return <ul>{props.rows.map(tagged => <li key={tagged}>{shown}{hop}{t}{m}</li>)}</ul>
    }
  `

  test('a prop reached only through the props object does not shadow a module const', () => {
    const inline = inliner(source)
    expect(inline('shown')).toBe('"module" + "!"')
    expect(inline('label')).toBe('"module" + "!"')
    expect(inliner(source, ['tagged'])('hop')).toBe('"module" + "!" + "?"')
  })

  test('a module const named like a props destructure binding is still the module const', () => {
    expect(inliner(source, ['viaTitle'])('t')).toBe('"m-title"')
  })

  test('a computed component const shadows a literal module const of the same name', () => {
    expect(inliner(source)('m')).toBe('props.n * 2')
  })
})
