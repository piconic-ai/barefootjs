/**
 * `queryHref(base, { … })` → `$bf->query(...)` lowering for the Blade
 * adapter (#2042). Ported from
 * `packages/adapter-twig/src/__tests__/twig-query-href.test.ts`. Parity
 * with the go-template / Jinja / Twig / Xslate lowering: the call + object
 * literal are structured IR, so it lowers directly. The shared `query`
 * runtime helper (the PHP `Barefoot\BarefootJS` runtime) includes a pair iff
 * its guard is truthy AND its value is a non-empty string, so a plain
 * `key: v` passes guard `1` (true) and a conditional `key: cond ? v :
 * undefined` passes the lowered condition.
 *
 * One test (the `!==`-derived guard) diverges from the byte-for-byte Jinja
 * port (unchanged from the Twig port): Jinja's native `!=` is Python
 * value-equality, so it's safe to route straight through. PHP's own `!=`/
 * `!==` are either LOOSE inequality (`'0' != 0` is false, even though JS
 * `'0' !== 0` is true) or number-representation-sensitive (`1 !== 1.0` is
 * true in PHP; false in JS) — wrong for a JS strict-inequality source
 * operator either way. Per the adapter's uniform emit policy
 * (`expr/emitters.ts`'s file header, divergence 8), EVERY `===`/`!==` —
 * including ones the URL-guard lowering (`lowerUrlGuard`) synthesizes
 * internally for a bare-value guard's non-empty-string test — routes
 * through `$bf->eq`/`$bf->neq` regardless of operand type, so both
 * queryHref guard shapes below assert `$bf->neq(...)` rather than a bare
 * `!=`.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { BladeAdapter } from '../adapter/blade-adapter'

function template(src: string): string {
  const a = new BladeAdapter()
  const r = compileJSX(src.trimStart(), 'T.tsx', { adapter: a, outputIR: true })
  const ir = JSON.parse(r.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return a.generate(ir).template
}

describe('queryHref → $bf->query (Blade, #2042)', () => {
  test('a plain value passes guard true', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("$bf->query($base, 1, 'tag', $tag)")
  })

  test('a conditional include passes the lowered condition as the guard', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; sort: string; tag: string }) {
  return <a href={queryHref(props.base, { sort: props.sort !== 'date' ? props.sort : undefined, tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("$bf->query($base, ($bf->neq($sort, 'date')), 'sort', $sort, 1, 'tag', $tag)")
  })

  // A bare-value guard (`flag ? v : undefined`) is JS *string* truthiness —
  // `'0'` is a truthy string in JS. The lowering must normalise it to a
  // non-empty-string test so SSR matches the client / go (where
  // `lowerUrlGuard` emits `ne <value> ""`). The Blade adapter's uniform
  // strict-equality policy routes this synthesized inequality through
  // `$bf->neq` too, same as any other `!==`.
  test('a bare-value guard is normalised to a non-empty-string test', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; flag: string; val: string }) {
  return <a href={queryHref(props.base, { q: props.flag ? props.val : undefined })}>x</a>
}
`)
    expect(t).toContain("$bf->query($base, ($bf->neq($flag, '')), 'q', $val)")
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
    expect(t).toContain("$bf->query($base, 1, 'tag', $tags)")
  })

  test('an aliased import is recognised', () => {
    const t = template(`
'use client'
import { queryHref as qh } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={qh(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("$bf->query($base, 1, 'tag', $tag)")
  })

  test('a dynamic (non-literal) params object falls back (no $bf->query)', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; q: Record<string, string> }) {
  return <a href={queryHref(props.base, props.q)}>x</a>
}
`)
    expect(t).not.toContain('->query')
  })
})
