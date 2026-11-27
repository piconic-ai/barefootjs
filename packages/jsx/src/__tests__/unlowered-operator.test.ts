// Which values the server render reads apply an operator no template lowers
// (`refuseUnloweredOperators`, #3981), against IR built by the real
// pipeline. The rendered contract is pinned by the conformance fixtures of
// the `server-read-unlowered-operator` limitation.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { jsxToIR } from '../jsx-to-ir'
import { refuseUnloweredOperators } from '../adapters/unlowered-operator'
import { parseExpression, unloweredOperator } from '../expression-parser'
import type { CompilerError, ComponentIR } from '../types'

function irFor(body: string): ComponentIR {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    function Kid(props: { v?: unknown }) { return <b>{String(props.v)}</b> }
    export function C(props: { x?: string; n?: number; items?: unknown[] }) {
      ${body}
    }
  `, 'C.tsx', 'C')
  return { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
}

function errorsOf(body: string): CompilerError[] {
  const errors: CompilerError[] = []
  refuseUnloweredOperators(irFor(body), { errors, componentName: 'C' })
  expect(errors.every(e => e.code === 'BF101')).toBe(true)
  return errors
}

/** The subject of each refusal, up to the shared wording. */
function refused(body: string): string[] {
  return errorsOf(body).map(e => e.message.slice(0, e.message.indexOf(' an expression applying')))
}

/** The operator each refusal names. */
function operators(body: string): string[] {
  return errorsOf(body).map(e => e.message.slice(e.message.indexOf('applying ') + 'applying '.length, e.message.indexOf(', which')))
}

/** The escape kinds each refusal claims. */
function escapes(body: string): string[][] {
  return errorsOf(body).map(e => (e.suggestion?.escape ?? []).map(x => x.kind))
}

describe('unloweredOperator', () => {
  test('names the operators the support check refuses, and no other node', () => {
    const op = (src: string): string | null => unloweredOperator(parseExpression(src))
    expect(op('typeof x')).toBe('typeof')
    expect(op('a ** b')).toBe('unknown')
    expect(op('a | 0')).toBe('unknown')
    expect(op("'k' in o")).toBe('unknown')
    expect(op('~a')).toBe('~')
    for (const src of ['a + b', 'a % b', 'a === b', '-a', '!a', 'void 0', 'new Date()', 'a.localeCompare(b)']) {
      expect(op(src)).toBeNull()
    }
  })
})

describe('refuseUnloweredOperators', () => {
  test('an operator the server render reads, through each kind of declaration', () => {
    expect(refused(`const k = createMemo(() => typeof props.x); return <p>{k()}</p>`)).toEqual([`Memo 'k' computes`])
    expect(refused(`const [k] = createSignal(typeof props.x); return <p>{k()}</p>`)).toEqual([`Signal 'k' is seeded from`])
    expect(refused(`const k = typeof props.x; return <p>{k}</p>`)).toEqual([`'k' is initialized from`])
    expect(refused(`const k = createMemo(() => typeof props.x === 'string' ? 'y' : 'n'); return <p title={k()}>t</p>`)).toEqual([`Memo 'k' computes`])
    // Refused at the memo the outer memo reads, not again at the outer memo.
    expect(refused(`const k = createMemo(() => typeof props.x); const v = createMemo(() => k() + '!'); return <p>{v()}</p>`)).toEqual([
      `Memo 'k' computes`,
    ])
  })

  test('each operator no template lowers', () => {
    expect(operators(`const k = createMemo(() => typeof props.x); return <p>{k()}</p>`)).toEqual(['`typeof`'])
    expect(operators(`const k = createMemo(() => ~(props.n ?? 0)); return <p>{k()}</p>`)).toEqual(['`~`'])
    for (const expr of ['(props.n ?? 0) ** 2', '(props.n ?? 0) | 0', "String('x' in props)"]) {
      expect(operators(`const k = createMemo(() => ${expr}); return <p>{k()}</p>`)[0]).toStartWith('a binary operator other than')
    }
  })

  test('an operator inside a callback the expression runs', () => {
    expect(refused(`const k = createMemo(() => (props.items ?? []).filter(t => typeof t === 'string').length); return <p>{k()}</p>`)).toEqual([
      `Memo 'k' computes`,
    ])
  })

  test('a child prop: no /* @client */ escape', () => {
    expect(escapes(`const k = createMemo(() => typeof props.x); return <p>{k()}</p>`)).toEqual([['client-directive']])
    expect(escapes(`const k = createMemo(() => typeof props.x); return <div><Kid v={k()} /></div>`)).toEqual([[]])
    const inline = errorsOf(`return <div><Kid v={typeof props.x} /></div>`)
    expect(inline.map(e => e.message.slice(0, e.message.indexOf(' is passed')))).toEqual([`Child prop 'v'`])
    expect(inline[0].suggestion?.escape).toBeUndefined()
  })

  test('a read the server render does not perform is not refused', () => {
    expect(refused(`const k = createMemo(() => typeof props.x); return <p>{/* @client */ k()}</p>`)).toEqual([])
    expect(refused(`const k = createMemo(() => typeof props.x); return <button onClick={() => console.log(k())}>x</button>`)).toEqual([])
    expect(refused(`const k = createMemo(() => typeof props.x); return <p>hi</p>`)).toEqual([])
    // A function stored in the value applies nothing until it is called.
    expect(refused(`const k = createMemo(() => [() => typeof props.x].length); return <p>{k()}</p>`)).toEqual([])
  })

  test('an operator a template lowers is not refused', () => {
    expect(refused(`const k = createMemo(() => (props.n ?? 0) * 2 - 1); return <p>{k()}</p>`)).toEqual([])
    expect(refused(`const k = createMemo(() => !props.x && -(props.n ?? 0) > 0); return <p>{String(k())}</p>`)).toEqual([])
  })
})
