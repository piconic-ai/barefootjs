// Which zero-argument calls a template reads as the called function's
// returned expression (`localCallBodies`) and which it refuses
// (`uninlinableLocalCalls`), against metadata built by the real pipeline. The
// rendered values are asserted by the conformance fixtures
// `memo-local-function-named-like-prop`, `signal-seed-local-function-named-like-prop`,
// `markup-local-function-named-like-prop` and `local-bindings-named-like-props`.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { localCallBodies, uninlinableLocalCalls } from '../local-call-body'
import { stringifyParsedExpr } from '../expression-parser'

function metadataFor(body: string, signature = 'props: { value?: number }', preamble = '') {
  return buildMetadata(analyzeComponent(`
    'use client'
    import { createSignal } from '@barefootjs/client'
    ${preamble}
    export function C(${signature}) {
      ${body}
      return <p>x</p>
    }
  `, 'C.tsx'))
}

function bodies(metadata: ReturnType<typeof metadataFor>): Record<string, string> {
  return Object.fromEntries([...localCallBodies(metadata)].map(([name, c]) => [`${name}@${c.scope}`, stringifyParsedExpr(c.body)]))
}

describe('localCallBodies', () => {
  test('a component function named like a typed prop the body never binds', () => {
    expect(bodies(metadataFor('function value() { return 1 }'))).toEqual({ 'value@component': '1' })
  })

  test('a zero-param arrow const and a module function', () => {
    const m = metadataFor('const value = () => 1', 'props: { value?: number }', "function tag() { return 'T' }")
    expect(bodies(m)).toEqual({ 'value@component': '1', 'tag@module': '"T"' })
  })

  test('a function with a parameter or a multi-statement body is not listed', () => {
    expect(bodies(metadataFor('function a(n: number) { return n } function b() { const v = 1; return v }'))).toEqual({})
  })

  test('a module function a destructured parameter of the same name hides', () => {
    expect(bodies(metadataFor('', '{ tag }: { tag?: string }', "function tag() { return 'T' }"))).toEqual({})
  })

  test('a module function a body destructure of the prop hides', () => {
    expect(bodies(metadataFor('const { tag } = props', 'props: { tag?: string }', "function tag() { return 'T' }"))).toEqual({})
  })
})

describe('lexical resolution', () => {
  // The rendered refusal is `signal-seed-uninlinable-local-function-hides-module-function`.
  test('a component function a template cannot inline hides the module function of its name', () => {
    const m = metadataFor('function value() { const x = 2; return x }', 'props: { value?: number }', 'function value() { return 1 }')
    expect(bodies(m)).toEqual({})
    expect([...uninlinableLocalCalls(m)]).toEqual(['value'])
    // A module function's body still calls the module's.
    expect(Object.fromEntries([...localCallBodies(m, 'module')].map(([n, c]) => [n, stringifyParsedExpr(c.body)]))).toEqual({ value: '1' })
  })

  test('a component arrow const with a parameter hides the module function of its name', () => {
    const m = metadataFor('const value = (a?: number) => 2', 'props: { value?: number }', 'function value() { return 1 }')
    expect(bodies(m)).toEqual({})
    expect([...uninlinableLocalCalls(m)]).toEqual(['value'])
  })

  test('a function declared inside a nested function hides nothing', () => {
    const m = metadataFor("function inner() { function tag() { return 'X' } return tag() }", 'props: {}', "function tag() { return 'T' }")
    expect(bodies(m)['tag@module']).toBe('"T"')
  })

  test("a module function's call of another function is the module's, inlined in module scope", () => {
    const m = metadataFor("function inner() { return 'component' }", 'props: {}', "function inner() { return 'module' } function outer() { return inner() }")
    expect(bodies(m)).toEqual({ 'inner@component': '"component"', 'outer@module': '"module"' })
  })

  test('a module function calling one a template cannot inline is not inlinable either', () => {
    const m = metadataFor('', 'props: {}', 'function inner() { const x = 1; return x } function outer() { return inner() }')
    expect(bodies(m)).toEqual({})
    expect([...uninlinableLocalCalls(m)].sort()).toEqual(['inner', 'outer'])
  })

  test('a module function calling itself is not inlinable', () => {
    const m = metadataFor('', 'props: {}', 'function loop(): number { return loop() }')
    expect(bodies(m)).toEqual({})
    expect([...uninlinableLocalCalls(m)]).toEqual(['loop'])
  })
})

describe('uninlinableLocalCalls', () => {
  test('lists the functions a template cannot inline, not the ones it can', () => {
    const m = metadataFor('function a(n: number) { return n } function b() { const v = 1; return v } function c() { return 1 }')
    expect([...uninlinableLocalCalls(m)].sort()).toEqual(['a', 'b'])
  })

  test('a signal getter is not a function call to refuse', () => {
    expect([...uninlinableLocalCalls(metadataFor('const [n] = createSignal(0)'))]).toEqual([])
  })
})
