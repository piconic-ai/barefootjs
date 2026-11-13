/**
 * A computed destructure default reading a const is applied in the props
 * constructor as the expression it stands for (`appliedPropDefaults`,
 * #3725): the const's value for a component const (body destructure) or a
 * module const (either form), after every prop the expression reads. One
 * the constructor can't build is refused, as one reading an earlier prop is.
 *
 * Rendered coverage: the `destructure-default-local-const*`,
 * `destructure-default-param-module-scope` and
 * `module-const-destructure-default` conformance fixtures.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function compile(src: string): { types: string; errors: string[] } {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new GoTemplateAdapter() })
  return {
    types: result.files.find(f => f.type === 'types')?.content ?? '',
    errors: result.errors.filter(e => e.severity === 'error').map(e => `${e.code} ${e.message}`),
  }
}

describe('a destructure default reading a const, in the props constructor', () => {
  test('a component const hides the module const of its name in a body destructure', () => {
    const { types, errors } = compile(`
const DEF = 'm'
export function T(props: { b?: string }) {
  const DEF = 'z'
  const { b = DEF } = props
  return <p>{b}</p>
}
`)
    expect(errors).toEqual([])
    expect(types).toContain('if bf.IsUndefined(in.B) {\n\t\tin.B = bf.EvalExpr("{\\"kind\\":\\"literal\\",\\"value\\":\\"z\\"}"')
  })

  test('a default reading an earlier prop through a const is applied after that prop', () => {
    const { types, errors } = compile(`
export function T(props: { b?: string; a?: string }) {
  const { a = 'x'.toUpperCase() } = props
  const L = a + '!'
  const { b = L } = props
  return <p>{a}{b}</p>
}
`)
    expect(errors).toEqual([])
    const a = types.indexOf('if bf.IsUndefined(in.A) {')
    const b = types.indexOf('if bf.IsUndefined(in.B) {')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
  })

  test('a default reading a const that the constructor cannot build is refused', () => {
    const { errors } = compile(`
export function T(props: { b?: string }) {
  const L = 'x'
  const { b = (L + '!').toUpperCase() + L } = props
  return <p>{b}</p>
}
`)
    expect(errors).toEqual([
      "BF101 The default of prop 'b' reads an earlier prop, a const or a function in a shape the Go template adapter can't apply in the props constructor",
    ])
  })

  test('a default naming a function is left to the client, not refused', () => {
    const { errors } = compile(`
'use client'
const noop = () => {}
export function T({ onDone = noop }: { onDone?: () => void }) {
  return <button onClick={onDone}>x</button>
}
`)
    expect(errors).toEqual([])
  })
})
