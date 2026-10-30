/**
 * #3736: a component-scope const read in a loop row whose bindings shadow a
 * name the const's initializer reads (`const b = a` read as `{b}` in
 * `rows.map(a => …)`). `expandConstantForReactivity` /
 * `expandDynamicPropValue` (`prop-handling.ts`) used to splice the
 * initializer text (`a`) into the row, where it re-resolved to the row's own
 * binding, so a client-built or updated row read the row value (`a()`).
 * The initializer resolves in the component scope; when a row binding would
 * capture one of its free names, the row reads the const itself, which init
 * declares.
 *
 * The emitted client JS is read with the TypeScript AST: every per-row slot
 * value is a `const __x = <expr>` declaration inside a row function.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/** The initializer text of every `const __x = …` slot-value declaration. */
function slotValues(js: string): string[] {
  const sf = ts.createSourceFile('out.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const values: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === '__x' && node.initializer) {
      values.push(node.initializer.getText(sf))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return values
}

describe('a const read in a loop row that shadows a name its initializer reads (#3736)', () => {
  test('destructured prop hop: the row reads the const, not the row value', () => {
    const values = slotValues(clientJsFor(`
      'use client'
      export function C({ a, rows }: { a: string; rows: string[] }) {
        const b = a
        return <ul>{rows.map(a => <li key={a} title={b}>{b}/{a}</li>)}</ul>
      }
    `))
    // `title={b}` and `{b}` read the const; only `{a}` reads the row.
    expect(values).toContain('b')
    expect(values).toContain('a()')
    expect(values.every(v => v === 'b' || v === 'a()')).toBe(true)
  })

  test('a two-hop alias whose middle name the row binds', () => {
    const values = slotValues(clientJsFor(`
      'use client'
      export function C({ label, rows }: { label: string; rows: string[] }) {
        const a = label
        const b = a
        return <ul>{rows.map(a => <li key={a}>{b}</li>)}</ul>
      }
    `))
    expect(values.length).toBeGreaterThan(0)
    expect(values.every(v => v === 'b')).toBe(true)
  })

  test('a row that binds the prop itself', () => {
    const values = slotValues(clientJsFor(`
      'use client'
      export function C({ label, rows }: { label: string; rows: string[] }) {
        const c = label
        return <ul>{rows.map(label => <li key={label} title={c}>{c}</li>)}</ul>
      }
    `))
    expect(values.length).toBeGreaterThan(0)
    expect(values.every(v => v === 'c')).toBe(true)
  })

  test('an index param and a callback preamble local shadow the name too', () => {
    const indexValues = slotValues(clientJsFor(`
      'use client'
      export function C({ a, rows }: { a: string; rows: string[] }) {
        const b = a
        return <ul>{rows.map((r, a) => <li key={r}>{b}</li>)}</ul>
      }
    `))
    expect(indexValues.length).toBeGreaterThan(0)
    expect(indexValues.every(v => v === 'b')).toBe(true)

    const preambleValues = slotValues(clientJsFor(`
      'use client'
      export function C({ a, rows }: { a: string; rows: string[] }) {
        const b = a
        return <ul>{rows.map(r => { const a = r + '!'; return <li key={r} title={a}>{b}</li> })}</ul>
      }
    `))
    expect(preambleValues).toContain('b')
    expect(preambleValues).not.toContain('_p.a')
  })

  test('function C(props) with a renamed body destructure', () => {
    const values = slotValues(clientJsFor(`
      'use client'
      export function C(props: { label: string; rows: string[] }) {
        const { label: text } = props
        const c = text
        return <ul>{props.rows.map(text => <li key={text} title={c}>{c}/{text}</li>)}</ul>
      }
    `))
    expect(values).toContain('c')
    expect(values.filter(v => v !== 'c').every(v => v === 'text()')).toBe(true)
  })

  test('a const reading a signal getter the row shadows', () => {
    const values = slotValues(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function C({ rows }: { rows: string[] }) {
        const [count] = createSignal(7)
        const b = count()
        return <ul>{rows.map(count => <li key={count}>{b}/{count}</li>)}</ul>
      }
    `))
    expect(values).toContain('b')
    expect(values).toContain('count()')
    expect(values.every(v => v === 'b' || v === 'count()')).toBe(true)
  })

  test('a row that shadows nothing the initializer reads still expands it', () => {
    const values = slotValues(clientJsFor(`
      'use client'
      export function C({ a, rows }: { a: string; rows: string[] }) {
        const b = a
        return <ul>{rows.map(r => <li key={r}>{b}</li>)}</ul>
      }
    `))
    expect(values.length).toBeGreaterThan(0)
    expect(values.every(v => v === '_p.a')).toBe(true)
  })
})
