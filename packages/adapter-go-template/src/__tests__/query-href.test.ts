/**
 * `queryHref(base, { … })` → `bf_query` lowering for the Go adapter (#2042).
 *
 * The pure functional URL builder is a structured `call` + `object-literal` in
 * the IR, so the adapter lowers it directly — no block-body recognizer, no
 * re-parse. The lowering emits `(include) "key" value` triples and lets the
 * `bf_query` runtime helper own the non-empty check (so it can also append array
 * values member-by-member, #2048): a plain `key: v` → `(true) "key" v`; a
 * conditional `key: cond ? a : undefined` → `(cond) "key" a` (the helper drops an
 * empty `a`). The full value semantics are conformance-tested against
 * URLSearchParams in the shared golden vectors (TestHelperVectors, fn "query").
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, registerLoweringPlugin, type ComponentIR } from '@barefootjs/jsx'
// Register the `queryHref` lowering plugin (#2057) — now owned by the router
// layer; tests register it explicitly (a build declares it via config.plugins).
import { queryHrefPlugin } from '@barefootjs/router/plugins'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

registerLoweringPlugin(queryHrefPlugin)

function generate(src: string) {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const ir = JSON.parse(irFile.content) as ComponentIR
  return adapter.generate(ir)
}

describe('queryHref → bf_query (#2042)', () => {
  test('a plain value passes a `true` include — bf_query drops it if empty', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (true) "tag" .Tag')
    expect(template).not.toContain('.QueryHref')
  })

  test('a conditional include lowers to `(cond)` — the helper applies the non-empty check', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; sort: string; tag: string }) {
  return (
    <a href={queryHref(props.base, {
      sort: props.sort !== 'date' ? props.sort : undefined,
      tag: props.tag,
    })}>x</a>
  )
}
`
    const { template } = generate(src)
    expect(template).toContain(
      'bf_query .Base (ne (bf_string .Sort) "date") "sort" .Sort (true) "tag" .Tag',
    )
    // The `ne consequent ""` non-empty check is no longer folded into the
    // include — bf_query owns it (so it can also append array values).
    expect(template).not.toContain('(ne .Sort "")')
  })

  // A `&&` / `||` guard is NOT a comparison, so `lowerUrlGuard` can't emit it as
  // a bare Go bool — `and`/`or` return one of their operands (a string), which
  // `bf_query` type-asserts against. It must take the truthiness-wrap path,
  // `ne (and …) ""`, yielding a real bool.
  test('a `&&` guard is wrapped to a bool — `ne (and …) ""`, not a bare `and`', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; a: string; b: string }) {
  return <a href={queryHref(props.base, { both: props.a && props.b ? props.a : undefined })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (ne (and .A .B) "") "both" .A')
  })

  test('null / empty-string alternates are both treated as the omit branch', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; mode: string; a: string; b: string }) {
  return <a href={queryHref(props.base, {
    a: props.mode !== 'off' ? props.a : '',
    b: props.mode !== 'off' ? props.b : null,
  })}>x</a>
}
`
    const { template } = generate(src)
    // Both '' and null alternates fold to the same conditional-include form.
    expect(template).toContain('(ne (bf_string .Mode) "off") "a" .A')
    expect(template).toContain('(ne (bf_string .Mode) "off") "b" .B')
  })

  test('an array value lowers the slice expression; bf_query appends its members', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; tags: string[] }) {
  return <a href={queryHref(props.base, { tag: props.tags })}>x</a>
}
`
    const { template } = generate(src)
    // The value is the raw slice field; member-append + non-empty omit happen in
    // the helper at render time (verified against URLSearchParams in the golden
    // vectors). The old `ne value ""` fold would have been invalid Go here.
    expect(template).toContain('bf_query .Base (true) "tag" .Tags')
  })

  test('a conditional array value keeps the guard and passes the slice', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; on: string; tags: string[] }) {
  return <a href={queryHref(props.base, { tag: props.on !== '' ? props.tags : undefined })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (ne (bf_string .On) "") "tag" .Tags')
  })

  test('an aliased import is still recognised', () => {
    const src = `
'use client'
import { queryHref as qh } from '@barefootjs/router'
export function P(props: { base: string; tag: string }) {
  return <a href={qh(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base')
    expect(template).toContain('"tag" .Tag')
  })

  test('a param-free expression-bodied helper wrapping queryHref inlines + lowers', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string }) {
  const homeHref = () => queryHref(props.base, { view: 'home' })
  return <a href={homeHref()}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (true) "view" "home"')
    expect(template).not.toContain('.HomeHref')
  })

  // Known limitation (pre-existing, not queryHref-specific): the generic helper
  // inliner declines a body whose object literal references the helper's params,
  // because an object literal lowers opaquely from its `raw` source — so the
  // param can't be substituted. queryHref's idiom is the direct call, so this is
  // a minor gap; helper-delegation ergonomics are a follow-up (#2042).
  test('a helper whose params-object references a param is not yet inlined (falls back)', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string }) {
  const hrefFor = (s: string) => queryHref(props.base, { sort: s })
  return <a href={hrefFor('title')}>x</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('bf_query')
    expect(template).toContain('.HrefFor "title"')
  })

  test('a dynamic (non-literal) params object falls back to the generic lowering', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/router'
export function P(props: { base: string; q: Record<string, string> }) {
  return <a href={queryHref(props.base, props.q)}>x</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('bf_query')
  })
})
