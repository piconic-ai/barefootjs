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
})
