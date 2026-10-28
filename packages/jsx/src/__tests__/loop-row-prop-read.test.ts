/**
 * `IRExpression.loopRowPropRead`: which child-position expressions inside a
 * loop row read one of the component's own props (other than `children`),
 * decided from the binding in Phase 1. The client claims and writes those row
 * slots as markup, so a caller's JSX element at that prop renders once
 * instead of as `[object Object]` beside a duplicate of the element.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

/** `[expr, loopRowPropRead]` of every expression child, in document order. */
function propReads(source: string): [string, boolean][] {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter: new TestAdapter(), outputIR: true })
  const ir = JSON.parse(result.files.find(f => f.type === 'ir')!.content)
  const out: [string, boolean][] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'expression') out.push([n.expr as string, n.loopRowPropRead === true])
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(ir.root)
  return out
}

/** The client JS of the first component in `source`. */
function clientJs(source: string): string {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter: new TestAdapter() })
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('loopRowPropRead', () => {
  test('a props-object member read in a row is flagged; the row item, children and an outside read are not', () => {
    expect(propReads(`
export function List(props: { items: string[]; footer?: unknown; children?: unknown }) {
  return (
    <div>
      {props.footer}
      <ul>{props.items.map(i => <li key={i}>{i}{props.footer}{props.children}</li>)}</ul>
    </div>
  )
}
`)).toEqual([
      ['props.footer', false],
      ['i', false],
      ['props.footer', true],
      ['props.children', false],
    ])
  })

  test('a destructured, renamed, aliased or body-destructured prop read in a row is flagged', () => {
    expect(propReads(`
export function List({ items, footer: foot, label }: { items: string[]; footer?: unknown; label: string }) {
  const alias = foot
  return <ul>{items.map(i => <li key={i}>{foot}{alias}{label}</li>)}</ul>
}
`)).toEqual([
      ['foot', true],
      ['alias', true],
      ['label', true],
    ])
    expect(propReads(`
export function List(props: { items: string[]; footer?: unknown }) {
  const { footer } = props
  const p = props
  return <ul>{props.items.map(i => <li key={i}>{footer}{p.footer}</li>)}</ul>
}
`)).toEqual([
      ['footer', true],
      ['p.footer', true],
    ])
  })

  test('a row binding that shadows the prop name or the props object is not flagged', () => {
    expect(propReads(`
export function List({ items, label }: { items: string[]; label: string }) {
  return <ul>{items.map(label => <li key={label}>{label}</li>)}</ul>
}
`)).toEqual([['label', false]])
    expect(propReads(`
export function List(props: { items: { footer: string }[] }) {
  return <ul>{props.items.map(props => <li key={props.footer}>{props.footer}</li>)}</ul>
}
`)).toEqual([['props.footer', false]])
    expect(propReads(`
export function List({ items, footer }: { items: string[]; footer?: unknown }) {
  return <ul>{items.map(i => { const footer = i + '!'; return <li key={i}>{footer}</li> })}</ul>
}
`)).toEqual([['footer', false]])
  })

  test('the client claims and writes a flagged row slot as markup, and splices it with escapeTextOrMarkup', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
export function List(props: { footer?: unknown }) {
  const [rows] = createSignal(['a'])
  return <ul>{rows().map(i => <li key={i}>{i}{props.footer}</li>)}</ul>
}
`)
    expect(js).toContain("{ id: 's1', kind: 'markup', path: [] }")
    expect(js).toContain("{ id: 's0', kind: 'text', path: [] }")
    expect(js).toContain('escapeTextOrNode(__x)')
    expect(js).toContain('escapeTextOrMarkup(_p.footer)')
    expect(js).toContain('escapeText(i)')
  })
})
