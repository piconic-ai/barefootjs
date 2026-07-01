/**
 * `queryHref(base, { … })` → `bf->query(...)` lowering for the Mojolicious
 * adapter (#2042). Parity with the go-template `bf_query` lowering: the call +
 * object literal are structured IR, so it lowers directly. The `bf->query`
 * runtime helper (BarefootJS.pm) includes a pair iff its guard is truthy AND its
 * value is a non-empty string, so a plain `key: v` passes guard `1` and a
 * conditional `key: cond ? v : undefined` passes the lowered condition.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, registerLoweringPlugin, type ComponentIR } from '@barefootjs/jsx'
// Register the `queryHref` lowering plugin (#2057) — now owned by the router
// layer; tests register it explicitly (a build declares it via config.plugins).
import { queryHrefPlugin } from '@barefootjs/router/plugins'
import { MojoAdapter } from '../adapter/mojo-adapter'

registerLoweringPlugin(queryHrefPlugin)

function template(src: string): string {
  const a = new MojoAdapter()
  const r = compileJSX(src.trimStart(), 'T.tsx', { adapter: a, outputIR: true })
  const ir = JSON.parse(r.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return a.generate(ir).template
}

describe('queryHref → bf->query (Mojo, #2042)', () => {
  test('a plain value passes guard 1', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("bf->query($base, 1, 'tag', $tag)")
  })

  test('a conditional include passes the lowered condition as the guard', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; sort: string; tag: string }) {
  return <a href={queryHref(props.base, { sort: props.sort !== 'date' ? props.sort : undefined, tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("bf->query($base, ($sort ne 'date'), 'sort', $sort, 1, 'tag', $tag)")
  })

  // A bare-value guard (`flag ? v : undefined`) is JS *string* truthiness — `'0'`
  // is a truthy string in JS but false under Perl's `unless`. The lowering must
  // normalise it to a non-empty-string test so SSR matches the client / go (where
  // `lowerUrlGuard` emits `ne <value> ""`), not pass the bare value as the guard.
  test('a bare-value guard is normalised to a non-empty-string test', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; flag: string; val: string }) {
  return <a href={queryHref(props.base, { q: props.flag ? props.val : undefined })}>x</a>
}
`)
    expect(t).toContain("bf->query($base, ($flag ne ''), 'q', $val)")
  })

  // An array value (`{ tag: props.tags }`) lowers to the bare slice expression;
  // the shared Perl `query` helper detects the arrayref at runtime and appends
  // one pair per non-empty member (#2048). No adapter-side change beyond passing
  // the value through.
  test('an array value passes the slice expression for the helper to append', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; tags: string[] }) {
  return <a href={queryHref(props.base, { tag: props.tags })}>x</a>
}
`)
    expect(t).toContain("bf->query($base, 1, 'tag', $tags)")
  })

  test('an aliased import is recognised', () => {
    const t = template(`
'use client'
import { queryHref as qh } from '@barefootjs/router'
export function P(props: { base: string; tag: string }) {
  return <a href={qh(props.base, { tag: props.tag })}>x</a>
}
`)
    expect(t).toContain("bf->query($base, 1, 'tag', $tag)")
  })

  test('a dynamic (non-literal) params object falls back (no bf->query)', () => {
    const t = template(`
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; q: Record<string, string> }) {
  return <a href={queryHref(props.base, props.q)}>x</a>
}
`)
    expect(t).not.toContain('bf->query')
  })
})
