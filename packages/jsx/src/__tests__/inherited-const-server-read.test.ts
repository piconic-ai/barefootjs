// Which inherited literal-const reads (`R.toString`) the server render of a
// component performs (`refuseInheritedConstServerReads`), against IR built by
// the real pipeline. The rendered contract is pinned by the conformance
// fixtures `module-const-inherited-key*`.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { jsxToIR } from '../jsx-to-ir'
import { refuseInheritedConstServerReads } from '../adapters/inherited-const-server-read'
import type { CompilerError, ComponentIR } from '../types'

const R = `const R = { k: 'v' }`
const READ = `(R.toString ? 'y' : 'n')`

function refused(body: string, preamble = ''): string[] {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    function Child(props: { v?: string; f?: () => string }) { return <b>{props.v}</b> }
    ${preamble}
    export function C() {
      ${body}
    }
  `, 'C.tsx', 'C')
  const ir: ComponentIR = { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
  const errors: CompilerError[] = []
  refuseInheritedConstServerReads(ir, { errors, componentName: 'C' })
  expect(errors.every(e => e.code === 'BF101')).toBe(true)
  return errors.map(e => e.message.slice(0, e.message.indexOf(' reads ')))
}

describe('refuseInheritedConstServerReads', () => {
  test('a read in each kind of server-rendered position', () => {
    expect(refused(`${R}; return <p>{${READ}}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; return <p data-a={R['valueOf'] ? 'y' : 'n'}>t</p>`)).toEqual(['`R.valueOf`'])
    expect(refused(`${R}; return <p>{R.toString ? <b>y</b> : <i>n</i>}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; return <p><Child v={${READ}} /></p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; return <ul>{['a'].map(i => <li key={i}>{R.toString ? i : 'n'}</li>)}</ul>`)).toEqual(['`R.toString`'])
  })

  test('a read in a declaration the server render reads', () => {
    expect(refused(`${R}; const [s] = createSignal(${READ}); return <p>{s()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; const m = createMemo(() => ${READ}); return <p>{m()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; const c = ${READ}; const m = createMemo(() => c); return <p>{m()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; function value() { return ${READ} }; return <p>{value()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; const m = createMemo(() => ${READ}); function value() { return m() }; return <p>{value()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`return <p>{value()}</p>`, `${R}\nfunction value() { return ${READ} }`)).toEqual(['`R.toString`'])
  })

  test('a read only a /* @client */ position reaches is not refused', () => {
    expect(refused(`${R}; return <p>{/* @client */ ${READ}}</p>`)).toEqual([])
    expect(refused(`${R}; const m = createMemo(() => ${READ}); return <p>{/* @client */ m()}</p>`)).toEqual([])
    expect(refused(`${R}; const [s] = createSignal(${READ}); return <p>{/* @client */ s()}</p>`)).toEqual([])
    expect(refused(`${R}; function value() { return ${READ} }; return <p>{/* @client */ value()}</p>`)).toEqual([])
  })

  test('a loop row or callback param named like a declaration is not that declaration', () => {
    expect(refused(`${R}; function value() { return ${READ} }
      return <p>{['ok'].map(value => <span key={value}>{value}</span>)}{/* @client */ value()}</p>`)).toEqual([])
    expect(refused(`${R}; const m = createMemo(() => ${READ})
      return <p>{['ok'].map(m => <span key={m}>{m}</span>)}{/* @client */ m()}</p>`)).toEqual([])
    expect(refused(`${R}; return <ul>{[{ toString: 'x' }].map(R => <li key={R.toString}>{R.toString}</li>)}</ul>`)).toEqual([])
    expect(refused(`${R}; const m = createMemo(() => [{ toString: 1 }].filter(R => R.toString).length); return <p>{m()}</p>`)).toEqual([])
  })

  test('a function is entered where it is called, not where it is stored', () => {
    const H = `const H = { safe: 'ok', get: () => ${READ} }`
    expect(refused(`${R}; ${H}; return <p>{H.safe}|{/* @client */ H.get()}</p>`)).toEqual([])
    expect(refused(`${R}; ${H}; const m = createMemo(() => H.safe); return <p>{m()}</p>`)).toEqual([])
    expect(refused(`${R}; ${H}; return <p>{H.get()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; ${H}; const m = createMemo(() => H.get()); return <p>{m()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; return <p>{(() => ${READ})()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; return <p><Child f={() => ${READ}} /></p>`)).toEqual([])
    expect(refused(`${R}; const [s, setS] = createSignal('a'); return <button onClick={() => setS(${READ})}>{s()}</button>`)).toEqual([])
  })

  test('an arrow const called with arguments is entered', () => {
    expect(refused(`${R}; const f = (x: string) => (R.toString ? x : 'n'); const m = createMemo(() => f('a')); return <p>{m()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; const f = (R: { toString: string }) => R.toString; const m = createMemo(() => f({ toString: 'a' })); return <p>{m()}</p>`)).toEqual([])
    expect(refused(`${R}; const f = (x: string) => (R.toString ? x : 'n'); const m = createMemo(() => ['a'].map(f => f).length); return <p>{m()}</p>`)).toEqual([])
  })

  test('a const that only names another is read as that one', () => {
    expect(refused(`${R}; const A = R; const m = createMemo(() => (A.toString ? 'y' : 'n')); return <p>{m()}</p>`)).toEqual(['`R.toString`'])
    expect(refused(`${R}; const A = R; const m = createMemo(() => A.k + (A.nope ?? '')); return <p>{m()}</p>`)).toEqual([])
    expect(refused(`${R}; const A = R; const m = createMemo(() => ['a'].map(A => A.toString).length); return <p>{m()}</p>`)).toEqual([])
  })

  test('a block-bodied memo is read through the expression it folds to', () => {
    expect(refused(`${R}; const m = createMemo(() => { const x = R.toString; if (x) { return 'y' } return 'n' }); return <p>{m()}</p>`)).toEqual(['`R.toString`'])
  })

  test('a method that calls itself ends', () => {
    expect(refused(`${R}; const H = { get: () => (R.toString ? H.get() : 'n') }; return <p>{H.get()}</p>`)).toEqual(['`R.toString`'])
  })

  test('a listed or provably missing key is not refused', () => {
    expect(refused(`${R}; const m = createMemo(() => R.k + (R.nope ?? '')); return <p data-a={R.nope}>{R.k}{m()}</p>`)).toEqual([])
  })
})
