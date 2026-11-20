// Which declarations the server render reads hold an array literal with an
// element no template lowers (`refuseUnloweredArrayElements`, #3954), against
// IR built by the real pipeline. The rendered contract is pinned by the
// conformance fixtures `destructure-default-spread-*`.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { jsxToIR } from '../jsx-to-ir'
import { refuseUnloweredArrayElements } from '../adapters/unlowered-array-element'
import type { CompilerError, ComponentIR } from '../types'

function irFor(body: string): ComponentIR {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    function Kid(props: { n?: number }) { return <b>{props.n}</b> }
    export function C(props: { b?: string[] }) {
      const { b = ['y'] } = props
      ${body}
    }
  `, 'C.tsx', 'C')
  return { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
}

/** The subject of each refusal, up to the shared wording. */
function refused(body: string): string[] {
  return errorsOf(body).map(e => e.message.slice(0, e.message.indexOf(' an array literal')))
}

function errorsOf(body: string): CompilerError[] {
  const errors: CompilerError[] = []
  refuseUnloweredArrayElements(irFor(body), { errors, componentName: 'C' })
  expect(errors.every(e => e.code === 'BF101')).toBe(true)
  return errors
}

/** The escape kinds each refusal claims. */
function escapes(body: string): string[][] {
  return errorsOf(body).map(e => (e.suggestion?.escape ?? []).map(x => x.kind))
}

describe('refuseUnloweredArrayElements', () => {
  test('a spread array the server render reads, through each kind of declaration', () => {
    expect(refused(`const local = [...b, 'z']; return <p>{local.length}</p>`)).toEqual([`'local' is initialized from`])
    // Refused at the const the memo reads, not again at the memo.
    expect(refused(`const local = [...b, 'z']; const n = createMemo(() => local.length); return <p>{n()}</p>`)).toEqual([
      `'local' is initialized from`,
    ])
    expect(refused(`const n = createMemo(() => [...b, 'z'].length); return <p>{n()}</p>`)).toEqual([`Memo 'n' computes`])
    expect(refused(`const [n] = createSignal([...b].length); return <p>{n()}</p>`)).toEqual([`Signal 'n' is seeded from`])
    expect(refused(`const local = [...b, 'z']; return <div><Kid n={local.length} /></div>`)).toEqual([`'local' is initialized from`])
  })

  test('only a declaration no child prop reads claims the /* @client */ escape', () => {
    expect(escapes(`const n = createMemo(() => [...b, 'z'].length); return <p>{n()}</p>`)).toEqual([['client-directive']])
    expect(escapes(`const local = [...b, 'z']; return <div><Kid n={local.length} /></div>`)).toEqual([[]])
    expect(escapes(`const local = [...b, 'z']; return <div>{local.length}<Kid n={local.length} /></div>`)).toEqual([[]])
  })

  test('a spread inside a callback the expression runs', () => {
    expect(refused(`const n = createMemo(() => b.map(x => [...b, x].length).join()); return <p>{n()}</p>`)).toEqual([`Memo 'n' computes`])
  })

  test('a read the server render does not perform is not refused', () => {
    expect(refused(`const local = [...b, 'z']; return <p>{/* @client */ local.length}</p>`)).toEqual([])
    expect(refused(`const n = createMemo(() => [...b, 'z'].length); return <p>{/* @client */ n()}</p>`)).toEqual([])
    expect(refused(`const local = [...b, 'z']; return <button onClick={() => console.log(local)}>x</button>`)).toEqual([])
    // A function stored in a literal const builds nothing until it is called.
    expect(refused(`const api = { label: 'x', add: (xs: string[]) => [...xs, 'z'] }; return <p>{api.label}</p>`)).toEqual([])
  })

  test('a module-scope declaration is out of scope', () => {
    const errors: CompilerError[] = []
    const ctx = analyzeComponent(`
      'use client'
      import { createMemo } from '@barefootjs/client'
      const BASE = ['y']
      const ALL = [...BASE, 'z']
      export function C() {
        const n = createMemo(() => ALL.length)
        return <p>{n()}</p>
      }
    `, 'C.tsx', 'C')
    refuseUnloweredArrayElements({ version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }, { errors, componentName: 'C' })
    expect(errors).toEqual([])
  })

  test('an array literal without a spread is not refused', () => {
    expect(refused(`const local = [b.length, 'z']; const n = createMemo(() => local.length); return <p>{n()}</p>`)).toEqual([])
  })
})
