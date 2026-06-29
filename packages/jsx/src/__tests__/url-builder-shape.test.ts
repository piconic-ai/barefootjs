/**
 * Pins the analysis-time recognition of the `URLSearchParams` URL-query helper
 * idiom into `ConstantInfo.urlBuilder` (#2039). Carrying the shape as pure IR is
 * what lets the go-template adapter emit `bf_query` without re-parsing the
 * (block-bodied, `unsupported`-to-the-parser) arrow at emit time.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { ConstantInfo } from '../types'

const adapter = new TestAdapter()

function localConstants(source: string): ConstantInfo[] {
  const result = compileJSX(source, 'demo.tsx', { adapter, outputIR: true })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const ir = result.files.find(f => f.type === 'ir')!
  return JSON.parse(ir.content).metadata.localConstants as ConstantInfo[]
}

const SRC = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P(props: { base: string }) {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: sp.get('sort') ?? '', tag: sp.get('tag') ?? '' }
  })
  const root = (props.base ?? '') || '/'
  const hrefFor = (sort: string, tag: string) => {
    const u = new URLSearchParams()
    if (sort !== 'date') u.set('sort', sort)
    if (tag) u.set('tag', tag)
    const s = u.toString()
    return s ? \`\${root}?\${s}\` : root
  }
  const sortHref = (k) => hrefFor(k, params().tag)
  return <a href={sortHref('title')}>s</a>
}
`

describe('URL-builder shape recognition → ConstantInfo.urlBuilder (#2039)', () => {
  test('the URLSearchParams builder helper carries a `builder` shape', () => {
    const consts = localConstants(SRC)
    const hrefFor = consts.find(c => c.name === 'hrefFor')
    expect(hrefFor?.urlBuilder?.kind).toBe('builder')
    if (hrefFor?.urlBuilder?.kind === 'builder') {
      expect(hrefFor.urlBuilder.params).toEqual(['sort', 'tag'])
      // One guarded set per `if (g) u.set(...)`, in order.
      expect(hrefFor.urlBuilder.sets.map(s => s.key)).toEqual(['sort', 'tag'])
      // `if (sort !== 'date')` → a binary guard; `if (tag)` → a bare identifier.
      expect(hrefFor.urlBuilder.sets[0].guard?.kind).toBe('binary')
      expect(hrefFor.urlBuilder.sets[1].guard?.kind).toBe('identifier')
      // `return s ? ... : root` — the no-query branch (`root`) is the base.
      expect(hrefFor.urlBuilder.base.kind).toBe('identifier')
    }
  })

  test('a pass-through helper carries a `delegate` shape pointing at the builder', () => {
    const consts = localConstants(SRC)
    const sortHref = consts.find(c => c.name === 'sortHref')
    expect(sortHref?.urlBuilder?.kind).toBe('delegate')
    if (sortHref?.urlBuilder?.kind === 'delegate') {
      expect(sortHref.urlBuilder.params).toEqual(['k'])
      expect(sortHref.urlBuilder.target).toBe('hrefFor')
      // `hrefFor(k, params().tag)` — first arg is the param, second the memo read.
      expect(sortHref.urlBuilder.args.length).toBe(2)
      expect(sortHref.urlBuilder.args[0]).toEqual({ kind: 'identifier', name: 'k' })
    }
  })

  test('an ordinary const is not mistaken for a URL builder', () => {
    const consts = localConstants(SRC)
    expect(consts.find(c => c.name === 'root')?.urlBuilder).toBeUndefined()
    expect(consts.find(c => c.name === 'params')?.urlBuilder).toBeUndefined()
  })

  // #2041 review: a helper that builds a `URLSearchParams` and returns a
  // conditional whose condition is NOT the query-string truthiness is not a
  // query builder — it must be refused (fall back to the method-call lowering),
  // not mis-recognised and silently mis-lowered to `bf_query`.
  test('a conditional return over an unrelated predicate is refused', () => {
    const src = `
'use client'
export function P(props: { flag: boolean; base: string }) {
  const weird = (k: string) => {
    const u = new URLSearchParams()
    u.set('k', k)
    return props.flag ? 'yes' : props.base
  }
  return <a href={weird('x')}>x</a>
}
`
    const consts = localConstants(src)
    expect(consts.find(c => c.name === 'weird')?.urlBuilder).toBeUndefined()
  })

  // The direct `return u.toString() ? ... : base` form (no `const s`) is the
  // other accepted query-truthiness shape — keep it recognised.
  test('the inline `u.toString()` return condition is accepted', () => {
    const src = `
'use client'
import { searchParams } from '@barefootjs/client'
export function P() {
  const root = '/'
  const hrefFor = (tag: string) => {
    const u = new URLSearchParams()
    if (tag) u.set('tag', tag)
    return u.toString() ? \`\${root}?\${u}\` : root
  }
  return <a href={hrefFor('go')}>x</a>
}
`
    const consts = localConstants(src)
    expect(consts.find(c => c.name === 'hrefFor')?.urlBuilder?.kind).toBe('builder')
  })
})
