/**
 * #3921 — two things a static array's `.map()` row and a `/* @client *\/`
 * conditional have to tell the client.
 *
 * - A child component imported from another file and rendered inside a static
 *   array row is named by an `@bf-child` import marker, so the bundler brings
 *   the child's client JS in. It used to be named only for loops reconciled
 *   as composite elements.
 * - The arms of a `/* @client *\/` conditional are written inside the marker
 *   pair the server emits, because the server renders no element for them to
 *   adopt. An ordinary conditional keeps the `bf-c` element form.
 *
 * Whether the child updates and the arm mounts in a real browser is the
 * `static-loop-row-child-signal-prop`, `static-loop-row-client-conditional`
 * and `client-conditional-element-arms` fixtures.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  return result.files.find((f) => f.type === 'clientJs')!.content
}

const withChild = (row: string) => `
  'use client'
  import { createSignal } from '@barefootjs/client'
  import { Badge } from './Badge'
  const rows = [{ id: 'a', kind: 'on' }, { id: 'b', kind: 'off' }]
  export function C() {
    const [n] = createSignal(0)
    return <ul>{rows.map(r => <li key={r.id}>${row}</li>)}</ul>
  }
`

describe('child component in a static array row (#3921)', () => {
  test('a child directly in the row is named by an @bf-child marker', () => {
    expect(clientJs(withChild('<Badge n={n()} />'))).toContain("@bf-child:Badge")
  })

  test('a child in a row-only conditional branch is named too', () => {
    expect(clientJs(withChild("{r.kind === 'on' ? <Badge n={n()} /> : <i>off</i>}"))).toContain("@bf-child:Badge")
  })
})

describe('/* @client */ conditional arms (#3921)', () => {
  const cond = (marker: string) => `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const [n] = createSignal(0)
      return <div>{${marker}n() > 0 ? <b>on</b> : <i>off</i>}</div>
    }
  `

  test('arms are wrapped in the marker pair', () => {
    const js = clientJs(cond('/* @client */ '))
    expect(js).toContain('<!--bf-cond-start:s0--><b>on</b><!--bf-cond-end:s0-->')
    expect(js).not.toContain('bf-c="s0"')
  })

  test('an ordinary conditional keeps the bf-c element form', () => {
    const js = clientJs(cond(''))
    expect(js).toContain('<b bf-c="s0">on</b>')
  })
})

describe('/* @client */ conditional in a static array row (#3921)', () => {
  const rowSource = (row: string) => `
    'use client'
    const rows = [{ id: 'a', kind: 'on' }, { id: 'b', kind: 'off' }]
    export function C() {
      return <ul>{rows.map(r => <li key={r.id}>${row}</li>)}</ul>
    }
  `

  test('literal arms and a row-only condition still reach an insert()', () => {
    const js = clientJs(rowSource("{/* @client */ r.kind === 'on' ? <b>on</b> : <i>off</i>}"))
    expect(js).toContain('insert(')
  })

  test('the same conditional without the directive stays baked', () => {
    const js = clientJs(rowSource("{r.kind === 'on' ? <b>on</b> : <i>off</i>}"))
    expect(js).not.toContain('insert(')
  })
})
