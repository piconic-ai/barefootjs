/**
 * `queryHref(base, { … })` → `bf.query(...)` lowering for the minijinja
 * adapter (#2042). Near-verbatim port of
 * `packages/adapter-jinja/src/__tests__/jinja-query-href.test.ts` (itself
 * ported from `packages/adapter-xslate/src/__tests__/query-href.test.ts`).
 * Parity with the go-template / Xslate lowering: the call + object literal
 * are structured IR, so it lowers directly. The shared `query` runtime
 * helper (the Rust runtime's `query` method on `bf`) includes a pair iff its
 * guard is truthy AND its value is a non-empty string, so a plain `key: v`
 * passes guard `true` and a conditional `key: cond ? v : undefined` passes
 * the lowered condition.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { MinijinjaAdapter } from '../adapter/minijinja-adapter'

function template(src: string): string {
  const a = new MinijinjaAdapter()
  const r = compileJSX(src.trimStart(), 'T.tsx', { adapter: a, outputIR: true })
  const ir = JSON.parse(r.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return a.generate(ir).template
}

describe('queryHref → bf.query (Jinja, #2042)', () => {
  test('a plain value passes guard true', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("bf.query(base, 1, 'tag', tag)")
  })

  test('a conditional include passes the lowered condition as the guard', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; sort: string; tag: string }) {
  return <a href={queryHref(props.base, { sort: props.sort !== 'date' ? props.sort : undefined, tag: props.tag })}>x</a>
}
`)
    // Jinja's `!=` handles string inequality directly (like Kolon's `!=`;
    // unlike Perl's `ne`).
    expect(t).toContain("bf.query(base, (sort != 'date'), 'sort', sort, 1, 'tag', tag)")
  })

  // A bare-value guard (`flag ? v : undefined`) is JS *string* truthiness —
  // `'0'` is a truthy string in JS. The lowering must normalise it to a
  // non-empty-string test so SSR matches the client / go (where
  // `lowerUrlGuard` emits `ne <value> ""`). Jinja renders the `!== ''` test
  // as `!= ''` (its string inequality), matching the comparison guard above.
  test('a bare-value guard is normalised to a non-empty-string test', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; flag: string; val: string }) {
  return <a href={queryHref(props.base, { q: props.flag ? props.val : undefined })}>x</a>
}
`)
    expect(t).toContain("bf.query(base, (flag != ''), 'q', val)")
  })

  // An array value (`{ tag: props.tags }`) lowers to the bare receiver
  // expression; the shared `query` runtime helper detects the list at
  // runtime and appends one pair per non-empty member (#2048). No
  // adapter-side change beyond passing the value through.
  test('an array value passes the receiver expression for the helper to append', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tags: string[] }) {
  return <a href={queryHref(props.base, { tag: props.tags })}>x</a>
}
`)
    expect(t).toContain("bf.query(base, 1, 'tag', tags)")
  })

  test('an aliased import is recognised', () => {
    const t = template(`
'use client'
import { queryHref as qh } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={qh(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("bf.query(base, 1, 'tag', tag)")
  })

  test('a dynamic (non-literal) params object falls back (no bf.query)', () => {
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
