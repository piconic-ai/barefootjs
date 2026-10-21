/**
 * The client template reads a renamed body destructure binding that holds
 * its prop (`const { b: local = d } = props`) as that prop with its default,
 * like the parameter form (#3579). A binding that no longer holds the prop
 * (a `let` reassigned before the return, a folded reassignment, a value
 * mutated in place) stays a local: the template leaves its slot empty and
 * defers a child that receives it, instead of reading `_p.b ?? d`.
 *
 * The reassigned shapes have no conformance fixture: the reference adapter
 * itself drops the reassignment of a destructured binding, so these pin the
 * client template only.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()
const transpiler = new Bun.Transpiler({ loader: 'js' })

const CHILD = 'function Child(props: { xs: string[] }) { return <i>{props.xs.length}</i> }'

/** The `template: (_p) => …` lambda the client registers for `C`. */
function templateOf(body: string, jsx: string, propsType = '{ b?: string[] | null }'): string {
  const source = `
    'use client'
    ${CHILD}
    export function C(props: ${propsType}) {
      ${body}
      return ${jsx}
    }
  `
  const result = compileJSX(source, 'C.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const js = result.files.find(f => f.type === 'clientJs')!.content
  expect(() => transpiler.transformSync(js)).not.toThrow()
  const line = js.split('\n').find(l => l.includes("hydrate('C'") && l.includes('template: (_p) =>'))
  expect(line).toBeDefined()
  return line!
}

describe('renamed body destructure binding in the client template (#3579)', () => {
  test('a default holding a callback reads the prop with its default', () => {
    const t = templateOf("const { b: local = ['y', ''].filter((x) => x !== '') } = props", '<p>{local.length}</p>')
    expect(t).toContain("_p.b ?? (['y', ''].filter((x) => x !== ''))")
    expect(t).not.toContain("${''}")
  })

  test('a child prop holding it renders the child in place', () => {
    const t = templateOf("const { b: local = ['y', ''].filter((x) => x !== '') } = props", '<p><Child xs={local} /></p>')
    expect(t).toContain("renderChild('Child")
    expect(t).not.toContain('data-bf-ph')
  })

  test('a let reassigned before the return keeps the child deferred', () => {
    const t = templateOf("let { b: local = null } = props\n      local = ['changed']", '<p><Child xs={local} /></p>')
    expect(t).toContain('data-bf-ph')
    expect(t).not.toContain('_p.b ?? null')
  })

  test('a let reassigned before the return is not read as the prop in text or an attribute', () => {
    const t = templateOf("let { b: local = 'x' } = props\n      local = local + '!'", '<p data-v={local}>{local}</p>', '{ b?: string }')
    expect(t).not.toContain("_p.b ?? 'x'")
  })

  test('a folded conditional reassignment is not read as the prop', () => {
    const t = templateOf("let { b: local = 'x' } = props\n      if (!local) local = 'y'", '<p>{local}</p>', '{ b?: string }')
    expect(t).not.toContain("_p.b ?? 'x'")
  })

  test('an un-renamed let reassigned before the return keeps the child deferred too', () => {
    const t = templateOf("let { b = null } = props\n      b = ['changed']", '<p><Child xs={b} /></p>')
    expect(t).toContain('data-bf-ph')
    expect(t).not.toContain('_p.b ?? null')
  })

  test('an un-renamed binding with a callback default renders the child in place', () => {
    const t = templateOf("const { b = ['y', ''].filter((x) => x !== '') } = props", '<p><Child xs={b} /></p>')
    expect(t).toContain("renderChild('Child")
  })

  test('a value mutated in place is not read as the prop', () => {
    const t = templateOf("const { b: local = ['x'] } = props\n      local.push('y')", '<p>{local.length}</p>', '{ b?: string[] }')
    expect(t).not.toContain("_p.b ?? ['x']")
  })
})
