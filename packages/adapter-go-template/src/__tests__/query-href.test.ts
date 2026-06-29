/**
 * `queryHref(base, { … })` → `bf_query` lowering for the Go adapter (#2042).
 *
 * The pure functional URL builder is a structured `call` + `object-literal` in
 * the IR, so the adapter lowers it directly — no block-body recognizer, no
 * re-parse. Values are strings; inclusion mirrors the client `if (value)` over
 * strings: plain `key: v` → `(ne v "") "key" v`; conditional `key: cond ? a :
 * undefined` ≡ client `if (cond ? a : undefined)` → `(and (cond) (ne a "")) "key"
 * a` (include iff `cond` AND `a` is non-empty — not just `cond`).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function generate(src: string) {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const ir = JSON.parse(irFile.content) as ComponentIR
  return adapter.generate(ir)
}

describe('queryHref → bf_query (#2042)', () => {
  test('a plain value becomes a value-truthiness include triple', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (ne .Tag "") "tag" .Tag')
    expect(template).not.toContain('.QueryHref')
  })

  test('a conditional include is `and (cond) (ne consequent "")` — matching client value-truthiness', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
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
      'bf_query .Base (and (ne (bf_string .Sort) "date") (ne .Sort "")) "sort" .Sort (ne .Tag "") "tag" .Tag',
    )
  })

  test('null / empty-string alternates are both treated as the omit branch', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; mode: string; a: string; b: string }) {
  return <a href={queryHref(props.base, {
    a: props.mode !== 'off' ? props.a : '',
    b: props.mode !== 'off' ? props.b : null,
  })}>x</a>
}
`
    const { template } = generate(src)
    // Both '' and null alternates fold to the same conditional-include form.
    expect(template).toContain('(and (ne (bf_string .Mode) "off") (ne .A "")) "a" .A')
    expect(template).toContain('(and (ne (bf_string .Mode) "off") (ne .B "")) "b" .B')
  })

  test('an aliased import is still recognised', () => {
    const src = `
'use client'
import { queryHref as qh } from '@barefootjs/client'
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
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string }) {
  const homeHref = () => queryHref(props.base, { view: 'home' })
  return <a href={homeHref()}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (ne "home" "") "view" "home"')
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
import { queryHref } from '@barefootjs/client'
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
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; q: Record<string, string> }) {
  return <a href={queryHref(props.base, props.q)}>x</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('bf_query')
  })
})
