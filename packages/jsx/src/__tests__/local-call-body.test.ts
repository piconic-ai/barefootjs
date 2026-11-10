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

describe('uninlinableLocalCalls', () => {
  test('lists the functions a template cannot inline, not the ones it can', () => {
    const m = metadataFor('function a(n: number) { return n } function b() { const v = 1; return v } function c() { return 1 }')
    expect([...uninlinableLocalCalls(m)].sort()).toEqual(['a', 'b'])
  })

  test('a signal getter is not a function call to refuse', () => {
    expect([...uninlinableLocalCalls(metadataFor('const [n] = createSignal(0)'))]).toEqual([])
  })
})
