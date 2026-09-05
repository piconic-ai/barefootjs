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
  test('a plain value passes a `true` include — bf_query drops it if empty', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
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
import { queryHref } from '@barefootjs/client'
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
    expect(template).toContain('(ne (bf_string .Mode) "off") "a" .A')
    expect(template).toContain('(ne (bf_string .Mode) "off") "b" .B')
  })

  test('an array value lowers the slice expression; bf_query appends its members', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
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
import { queryHref } from '@barefootjs/client'
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

  // #2743: a `queryHref` value in an ATTRIBUTE position emits the whole
  // attribute via `bf_attr` (template.HTMLAttr) so html/template's
  // contextual URL-context autoescape (keyed off the attribute NAME) never
  // percent-encodes the base — see `lowerRegisteredAttrCall`.
  test('an href-attribute queryHref value routes through bf_attr, not `href="{{...}}"`', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('{{bf_attr "href" (bf_query .Base (true) "tag" .Tag)}}')
    expect(template).not.toContain('href="{{')
  })

  // The route is keyed on the neutral `helper === 'query'` fact, not on the
  // attribute name `href` — any attribute (e.g. `title`) gets the same
  // treatment, since `queryHref` returns a plain string with nothing
  // href-specific about it.
  test('a non-href attribute (title) with a queryHref value also routes through bf_attr', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a title={queryHref(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('{{bf_attr "title" (bf_query .Base (true) "tag" .Tag)}}')
    expect(template).not.toContain('title="{{')
  })

  // Text-position (non-attribute) use is unaffected — `bf_attr` only wraps
  // the whole-attribute case; a queryHref value read as text still lowers
  // to a bare `bf_query` pipeline.
  test('a queryHref value in text position is not wrapped in bf_attr', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <span>{queryHref(props.base, { tag: props.tag })}</span>
}
`
    const { template } = generate(src)
    expect(template).toContain('bf_query .Base (true) "tag" .Tag')
    expect(template).not.toContain('bf_attr')
  })

  // #2743 follow-up (pullfrog review on #2841): a ternary attribute value
  // with a real (non-`undefined`) alternate is syntactically valid and
  // already lowers both branches correctly via `bf_ternary` — but was still
  // wrapped in the ordinary `name="{{...}}"` form, leaving it exposed to
  // html/template's URL-context percent-encoding. This must route through
  // `bf_attr` too, wrapping the whole `bf_ternary` pipeline.
  test('a queryHref value in a ternary branch (non-undefined alternate) routes through bf_attr', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { ok: boolean; base: string; tag: string }) {
  return <a href={props.ok ? queryHref(props.base, { tag: props.tag }) : '/fallback'}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain(
      '{{bf_attr "href" (bf_ternary (bf_truthy .Ok) (bf_query .Base (true) "tag" .Tag) "/fallback")}}',
    )
    expect(template).not.toContain('href="{{')
  })

  // #2842: the `undefined`-alternate omission shape used to render only the
  // consequent via a registry-blind path, emitting invalid Go syntax
  // (`.QueryHref .Base bf_map "tag" .Tag`) with no diagnostic. The consequent
  // now routes through `lowerRegisteredAttrCall` (the same whole-attribute
  // `bf_attr` bypass the direct-call and non-undefined-ternary shapes use),
  // inside the `{{if}}` that implements the omission.
  test('the undefined-alternate omission shape routes the consequent through bf_attr inside the {{if}} (#2842)', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { ok: boolean; base: string; tag: string }) {
  return <a href={props.ok ? queryHref(props.base, { tag: props.tag }) : undefined}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('{{if .Ok}}{{bf_attr "href" (bf_query .Base (true) "tag" .Tag)}}{{end}}')
    expect(template).not.toContain('.QueryHref')
    expect(template).not.toContain('bf_map')
    expect(template).not.toContain('href="{{')
  })

  // #2842: a registered call nested in a template-literal interpolation
  // (not just a direct attribute value) is registry-lowered too — the fix
  // lives in the shared ParsedExpr `call()` dispatcher, so any nested
  // position benefits, not only the ternary/attribute cases above.
  test('a queryHref call nested in a template-literal interpolation is registry-lowered (#2842)', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a title={\`pre \${queryHref(props.base, { tag: props.tag })}\`}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('title="pre {{bf_query .Base (true) "tag" .Tag}}"')
    expect(template).not.toContain('.QueryHref')
  })

  // #2842: a nested ternary inside the undef-alternate consequent still
  // recurses correctly — `lowerRegisteredAttrCall`'s `conditional` arm
  // right-folds, matching `lowerTernary`'s own recursion.
  test('a nested ternary inside the undef-alternate consequent still routes through bf_attr (#2842)', () => {
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { a: boolean; b: boolean; base: string; tag: string }) {
  return <a href={props.a ? (props.b ? queryHref(props.base, { tag: props.tag }) : '/x') : undefined}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain(
      '{{if .A}}{{bf_attr "href" (bf_ternary (bf_truthy .B) (bf_query .Base (true) "tag" .Tag) "/x")}}{{end}}',
    )
  })
})
