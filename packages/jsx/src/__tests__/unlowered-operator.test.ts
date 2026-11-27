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

function irFor(body: string, moduleScope = ''): ComponentIR {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    ${moduleScope}
    function Kid(props: { v?: unknown }) { return <b>{String(props.v)}</b> }
    export function C(props: { x?: string; n?: number; items?: unknown[] }) {
      ${body}
    }
  `, 'C.tsx', 'C')
  return { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
}

function errorsOf(body: string, moduleScope = ''): CompilerError[] {
  const errors: CompilerError[] = []
  refuseUnloweredOperators(irFor(body, moduleScope), { errors, componentName: 'C' })
  expect(errors.every(e => e.code === 'BF101')).toBe(true)
  return errors
}

/** The subject of each refusal, up to the shared wording. */
function refused(body: string): string[] {
  return errorsOf(body).map(e => e.message.slice(0, e.message.indexOf(' an expression applying')))
}

/** {@link refused} with module-scope declarations before the component. */
function refusedWith(moduleScope: string, body: string): string[] {
  return errorsOf(body, moduleScope).map(e => e.message.slice(0, e.message.indexOf(' an expression applying')))
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

  test('a block body that is one `return`, and an object literal body', () => {
    expect(refused(`const k = createMemo(() => { return typeof props.x }); return <p>{k()}</p>`)).toEqual([`Memo 'k' computes`])
    expect(refused(`const k = createMemo(function () { return typeof props.x }); return <p>{k()}</p>`)).toEqual([`Memo 'k' computes`])
    // A memo is computed whole, so any member of its object counts.
    expect(refused(`const k = createMemo(() => ({ kind: typeof props.x, n: 1 })); return <p>{k().n}</p>`)).toEqual([`Memo 'k' computes`])
    // A block with other statements is not modelled.
    expect(refused(`const k = createMemo(() => { const t = typeof props.x; return t }); return <p>{k()}</p>`)).toEqual([])
  })

  test('a const object literal: only the members a template position reaches', () => {
    const decl = `const o = { kind: typeof props.x, n: 1, a: { kind: typeof props.x, n: 2 }, ...{ m: typeof props.x } }`
    expect(refused(`${decl}; return <p>{o.n}{o.a.n}</p>`)).toEqual([])
    expect(refused(`${decl}; const label = o.n; return <p>{label}</p>`)).toEqual([])
    expect(refused(`${decl}; return <p>{/* @client */ o.kind}{o.n}</p>`)).toEqual([])
    for (const read of ['o.kind', 'o.a.kind', 'o.m', 'o.a', 'JSON.stringify(o)', 'o.kind.toUpperCase()']) {
      expect(refused(`${decl}; return <p>{${read}}</p>`)).toEqual([`'o' is initialized from`])
    }
    // A loop row named like the const is not the const.
    expect(refused(`${decl}; return <ul>{['a'].map(o => <li key={o}>{o}</li>)}{o.n}</ul>`)).toEqual([])
    // A memo or seed computes from the whole const, whatever tree its body has.
    expect(refused(`${decl}; const m = createMemo(() => o.n + 1); return <p>{m()}</p>`)).toEqual([`'o' is initialized from`])
    for (const memo of ['createMemo(() => ({ n: o.n }))', 'createMemo(() => { return { n: o.n } })', 'createMemo(() => { const v = o.n; return { n: v } })']) {
      expect(refused(`${decl}; const m = ${memo}; return <p>{m().n}</p>`)).toEqual([`'o' is initialized from`])
    }
    expect(refused(`${decl}; const [s] = createSignal({ n: o.n }); return <p>{s().n}</p>`)).toEqual([`'o' is initialized from`])
    // A block memo reads the const where its evaluation does: not in a
    // function it only creates, whose value the static evaluator computes.
    for (const body of ['const unused = () => o.kind; return false', 'function g() { return o.kind } return false']) {
      expect(refused(`${decl}; const m = createMemo(() => { ${body} }); return <p>{m() ? 'y' : 'n'}{o.n}</p>`)).toEqual([])
    }
    for (const body of ['const f = () => o.kind; return f()', 'function g() { return o.kind } return g()', 'const xs = [1].map(() => o.kind); return xs.join()', 'const cfg = { f: () => o.kind }; return cfg.f()']) {
      expect(refused(`${decl}; const m = createMemo(() => { ${body} }); return <p>{m()}{o.n}</p>`)).toEqual([`'o' is initialized from`])
    }
    // A block local the evaluator cannot resolve shadows an outer name of it:
    // the memo has no static value, so the const it reads is refused.
    for (const body of ['const label = o.kind; const unused = () => false; return label', 'const a = o.kind; const label = a; return label', 'const { kind: label } = o; return label']) {
      expect(refusedWith(`const label = 'fallback'`, `${decl}; const m = createMemo(() => { ${body} }); return <p>{m()}</p>`)).toEqual([`'o' is initialized from`])
    }
    expect(refusedWith(`const label = 'fallback'`, `${decl}; const m = createMemo(() => { const label = 'x'; const unused = () => o.kind; return label }); return <p>{m()}{o.n}</p>`)).toEqual([])
    // A block memo that does not name the const leaves it to the template reads.
    expect(refused(`${decl}; const m = createMemo(() => { const v = 2; return v }); return <p>{m()}{o.n}</p>`)).toEqual([])
    expect(refused(`${decl}; const m = createMemo(() => ({ n: o.n })); return <p>{/* @client */ m().n}</p>`)).toEqual([])
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
