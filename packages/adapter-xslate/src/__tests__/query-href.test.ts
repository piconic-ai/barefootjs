/**
 * `queryHref(base, { … })` → `$bf.query(...)` lowering for the Xslate adapter
 * (#2042). Parity with the go-template / Mojo lowering: the call + object literal
 * are structured IR, so it lowers directly. The shared `query` runtime helper
 * (BarefootJS.pm) includes a pair iff its guard is truthy AND its value is a
 * non-empty string, so a plain `key: v` passes guard `1` and a conditional
 * `key: cond ? v : undefined` passes the lowered condition.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { XslateAdapter } from '../adapter/xslate-adapter'

function template(src: string): string {
  const a = new XslateAdapter()
  const r = compileJSX(src.trimStart(), 'T.tsx', { adapter: a, outputIR: true })
  const ir = JSON.parse(r.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return a.generate(ir).template
}

describe('queryHref → $bf.query (Xslate, #2042)', () => {
  test('a plain value passes guard 1', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("$bf.query($base, 1, 'tag', $tag)")
  })

  test('a conditional include passes the lowered condition as the guard', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; sort: string; tag: string }) {
  return <a href={queryHref(props.base, { sort: props.sort !== 'date' ? props.sort : undefined, tag: props.tag })}>x</a>
}
`)
    // Kolon uses `!=` for string inequality (no `ne` operator).
    expect(t).toContain("$bf.query($base, ($sort != 'date'), 'sort', $sort, 1, 'tag', $tag)")
  })

  test('an aliased import is recognised', () => {
    const t = template(`
'use client'
import { queryHref as qh } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={qh(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("$bf.query($base, 1, 'tag', $tag)")
  })

  test('a dynamic (non-literal) params object falls back (no $bf.query)', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; q: Record<string, string> }) {
  return <a href={queryHref(props.base, props.q)}>x</a>
}
`)
    expect(t).not.toContain('.query')
  })
})
