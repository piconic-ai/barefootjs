// Which declarations a component's server render reads (`walkServerReads`),
// against IR built by the real pipeline. The refusals built on it are
// rendered by the conformance fixtures
// `signal-seed-const-from-uninlinable-local-function`,
// `signal-seed-wrapped-uninlinable-local-function` and
// `loop-row-named-like-uninlinable-memo`.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { jsxToIR } from '../jsx-to-ir'
import { walkServerReads } from '../server-read-walk'
import type { ComponentIR } from '../types'

const UNINLINABLE = 'function value() { const x = 1; return x }'

function reads(body: string, signature = '', preamble = ''): string[] {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    function Child(props: { onPick?: () => void; f?: () => number }) { return <b>x</b> }
    ${preamble}
    export function C(${signature}) {
      ${body}
    }
  `, 'C.tsx', 'C')
  const ir: ComponentIR = { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
  const out: string[] = []
  walkServerReads(ir, r => out.push(`${r.kind} ${r.name}@${r.scope}${r.refusedCalls.length ? ` !${r.refusedCalls.join(',')}` : ''}`))
  return out.sort()
}

describe('walkServerReads', () => {
  test('a signal seeded from a const whose initializer calls an uninlinable function', () => {
    expect(reads(`${UNINLINABLE}
      const initial = value()
      const [n] = createSignal(initial)
      return <p>{n()}</p>`)).toEqual(['const initial@component !value', 'signal n@component'])
  })

  test('a signal seeded through an inlinable wrapper, a function declaration or an arrow const', () => {
    expect(reads(`${UNINLINABLE}
      function wrap() { return value() }
      const [n] = createSignal(wrap())
      return <p>{n()}</p>`)).toEqual(['function wrap@component !value', 'signal n@component'])
    expect(reads(`${UNINLINABLE}
      const wrap = () => value()
      const [n] = createSignal(wrap())
      return <p>{n()}</p>`)).toEqual(['function wrap@component !value', 'signal n@component'])
  })

  test('a memo of a memo reports the call on the memo that makes it', () => {
    expect(reads(`${UNINLINABLE}
      const a = createMemo(() => value())
      const b = createMemo(() => a() + 1)
      return <p>{b()}</p>`)).toEqual(['memo a@component !value', 'memo b@component'])
  })

  test('a loop row named like a memo is not a read of the memo', () => {
    expect(reads(`${UNINLINABLE}
      const n = createMemo(() => value())
      return <ul>{['row'].map(n => <li key={n} title={n}>{n}</li>)}</ul>`)).toEqual([])
  })

  test('a callback param and a preamble local named like a memo are not reads of it', () => {
    expect(reads(`${UNINLINABLE}
      const n = createMemo(() => value())
      return <p>{['a'].filter(n => n !== '').length}</p>`)).toEqual([])
    expect(reads(`${UNINLINABLE}
      const n = createMemo(() => value())
      return <ul>{['a'].map(item => { const n = item + '!'; return <li key={item}>{n}</li> })}</ul>`)).toEqual([])
  })

  test('the loop array is read outside the row', () => {
    expect(reads(`${UNINLINABLE}
      const n = createMemo(() => [value()])
      return <ul>{n().map(n => <li key={n}>{n}</li>)}</ul>`)).toEqual(['memo n@component !value'])
  })

  test('a /* @client */ read and an event handler prop read nothing', () => {
    expect(reads(`${UNINLINABLE}
      const initial = value()
      const [n] = createSignal(initial)
      const m = createMemo(() => value())
      return <p>{/* @client */ n()}{/* @client */ initial}<Child onPick={() => console.log(m())} /></p>`)).toEqual([])
  })

  test('a function passed on uncalled is not read', () => {
    expect(reads(`${UNINLINABLE}
      const wrap = () => value()
      return <p><Child f={wrap} /></p>`)).toEqual([])
  })

  test('a destructured prop named like a module function is the prop', () => {
    expect(reads(`const [n] = createSignal(value())
      return <p>{n()}</p>`, '{ value }: { value: () => number }', UNINLINABLE)).toEqual(['signal n@component'])
  })

  test("a module function's body reads the module's names, not the component's", () => {
    expect(reads(`${UNINLINABLE}
      const [n] = createSignal(outer())
      return <p>{n()}</p>`, '', 'function value() { return 1 } function outer() { return value() }'))
      .toEqual(['function outer@module', 'function value@module', 'signal n@component'])
  })

  test('a module const initialized by an uninlinable module function', () => {
    expect(reads(`const [n] = createSignal(initial)
      return <p>{n()}</p>`, '', `${UNINLINABLE}\nconst initial = value()`))
      .toEqual(['const initial@module !value', 'signal n@component'])
  })
})
