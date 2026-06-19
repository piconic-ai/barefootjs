/**
 * Derived-state SSR for the Go adapter (PostList blocker, #1897 follow-up).
 *
 * Capability A: an object-returning block-body memo that derives from
 * `searchParams()` must compute a NON-nil `map[string]interface{}` in
 * `NewXxxProps`, so the template's `.Params.Sort` / `.Params.Tag` field
 * accesses resolve at execute time instead of reading a nil map.
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

describe('Capability A: object-returning searchParams memo → computed map field', () => {
  const SRC = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
const SORT_KEYS = ['date', 'title', 'tag']
const asSortKey = (raw) => (SORT_KEYS.includes(raw) ? raw : 'date')
export function P() {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: asSortKey(sp.get('sort')), tag: sp.get('tag') ?? '' }
  })
  return (
    <div>
      <span>{params().sort}</span>
      <span>{params().tag}</span>
    </div>
  )
}
`

  test('NewProps computes the map instead of nil', () => {
    const { types } = generate(SRC)
    expect(types).not.toContain('Params: nil')
    expect(types).toContain('Params: map[string]interface{}{')
  })

  test('object keys are capitalized to match template field access', () => {
    const { types } = generate(SRC)
    expect(types).toContain('"Sort":')
    expect(types).toContain('"Tag":')
  })

  test('searchParams().get is lowered to the SSR SearchParams field', () => {
    const { types } = generate(SRC)
    expect(types).toContain('in.SearchParams.Get("sort")')
    expect(types).toContain('in.SearchParams.Get("tag")')
  })

  test('module helper asSortKey is inlined with bf.Includes over the const array', () => {
    const { types } = generate(SRC)
    expect(types).toContain('bf.Includes([]string{"date", "title", "tag"}')
  })

  test('template still reads .Params.Sort / .Params.Tag (unchanged field access)', () => {
    const { template } = generate(SRC)
    expect(template).toContain('.Params.Sort')
    expect(template).toContain('.Params.Tag')
  })

  // A ternary whose condition is string-valued (`sp.get('tag') ? … : …`) is
  // truthy in JS but `if "<string>"` does not compile in Go. The lowerer must
  // fall back to nil rather than emit invalid code (#1941 review).
  test('string-valued ternary condition falls back to nil, never invalid Go', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P() {
  const params = createMemo(() => {
    const sp = searchParams()
    return { label: sp.get('tag') ? 'has' : 'none' }
  })
  return <div>{params().label}</div>
}
`
    const { types } = generate(src)
    expect(types).toContain('Params: nil')
    // Must NOT emit a string as a Go bool condition.
    expect(types).not.toContain('if in.SearchParams.Get')
  })

  // A block with control flow (an early `return` inside an `if`, plus the final
  // return) must fall back to nil — not silently lower the final return as if it
  // were unconditional, which would change SSR semantics (#1941 review).
  test('block-body memo with control flow falls back to nil', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P() {
  const params = createMemo(() => {
    const sp = searchParams()
    if (sp.get('x')) return { sort: 'early' }
    return { sort: sp.get('sort') ?? '' }
  })
  return <div>{params().sort}</div>
}
`
    const { types } = generate(src)
    expect(types).toContain('Params: nil')
    expect(types).not.toContain('Params: map[string]interface{}{')
  })
})

describe('Capability B: inline local pure helper calls at attribute call sites', () => {
  test('sortClass(k) inlines to a conditional, not a .SortClass method call', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
const SORT_KEYS = ['date', 'title', 'tag']
const asSortKey = (raw) => (SORT_KEYS.includes(raw) ? raw : 'date')
export function P() {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: asSortKey(sp.get('sort')), tag: sp.get('tag') ?? '' }
  })
  const sortClass = (k) => (params().sort === k ? 'sort on' : 'sort')
  return <a className={sortClass('date')}>date</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('.SortClass')
    // `.Params.Sort` is interface{} (a map value), so `eq` coerces it via
    // `bf_string` before comparing to the string literal.
    expect(template).toContain(
      'class="{{if eq (bf_string .Params.Sort) "date"}}sort on{{else}}sort{{end}}"',
    )
  })

  test('tagClass(t) inlines inside a loop, resolving the loop var and root memo', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P(props: { tags: string[] }) {
  const params = createMemo(() => {
    const sp = searchParams()
    return { tag: sp.get('tag') ?? '' }
  })
  const tagClass = (t) => (params().tag === t ? 'tag on' : 'tag')
  return <div>{props.tags.map((t) => <a key={t} className={tagClass(t)}>#{t}</a>)}</div>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('.TagClass')
    // params() is a root memo (→ $.Params) and t is the loop var (→ .)
    expect(template).toContain('{{if eq $.Params.Tag .}}tag on{{else}}tag{{end}}')
  })

  test('a helper that delegates to a non-URL-builder local helper is not inlined', () => {
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function P() {
  const [sig] = createSignal('x')
  const label = (k) => (sig() === k ? 'on' : 'off')
  const wrap = (k) => '[' + label(k) + ']'
  return <a className={wrap('y')}>x</a>
}
`
    const { template } = generate(src)
    // wrap delegates to label (a local helper) and isn't a URL builder → not
    // inlined; falls back to the method-call form.
    expect(template).toContain('.Wrap')
  })

  // A compound argument must keep its precedence when spliced into the body —
  // `sig() === <param>` with arg `a ?? b` must not become `sig() === a ?? b`
  // (#1943 review). The substituted arg is parenthesized.
  test('compound call argument is parenthesized (precedence preserved)', () => {
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function P(props: { a?: string; b?: string }) {
  const [sig] = createSignal('x')
  const cls = (k) => (sig() === k ? 'on' : 'off')
  return <a className={cls(props.a ?? props.b)}>x</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('.Cls')
    // `===` must stay the outer operation (`eq .Sig …`). Without parenthesizing
    // the arg, `sig() === props.a ?? props.b` would bind as
    // `(sig() === props.a) ?? props.b` → an outer `{{if or …}}`. This matches
    // what a direct `sig() === (props.a ?? props.b)` lowers to.
    expect(template).toContain('{{if eq .Sig')
    expect(template).not.toContain('{{if or')
  })

  // The splicer is scope-blind, so a helper whose body contains a nested
  // function is NOT inlined (avoids shadowing / param-position corruption) —
  // it falls back to the method-call form (#1943 review).
  test('helper with a nested function scope is not inlined', () => {
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function P(props: { xs: string[] }) {
  const [sig] = createSignal('x')
  const has = (k) => (props.xs.some((x) => x === k) ? 'on' : 'off')
  return <a className={has('y')}>x</a>
}
`
    const { template } = generate(src)
    // Not inlined → stays as the (un-backed) method-call form.
    expect(template).toContain('.Has')
  })
})

describe('Capability C2: URL-builder helpers → bf_query + derived Root field', () => {
  const SRC = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P(props: { base: string }) {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: sp.get('sort') ?? '', tag: sp.get('tag') ?? '' }
  })
  const base = (props.base ?? '').replace(/\\/+$/, '')
  const root = base || '/'
  const hrefFor = (sort: string, tag: string) => {
    const u = new URLSearchParams()
    if (sort !== 'date') u.set('sort', sort)
    if (tag) u.set('tag', tag)
    const s = u.toString()
    return s ? \`\${root}?\${s}\` : root
  }
  const sortHref = (k) => hrefFor(k, params().tag)
  const tagHref = (t) => hrefFor(params().sort, t)
  return (
    <div>
      <a href={sortHref('title')}>s</a>
      {props.base ? <a href={tagHref('go')}>t</a> : null}
    </div>
  )
}
`

  test('sortHref/tagHref lower to bf_query, not a .SortHref method call', () => {
    const { template } = generate(SRC)
    expect(template).not.toContain('.SortHref')
    expect(template).not.toContain('.TagHref')
    expect(template).toContain('bf_query .Root')
  })

  test('guarded set() calls become bool include triples', () => {
    const { template } = generate(SRC)
    // sort !== 'date' guard (runtime sort case via tagHref) + tag truthiness.
    expect(template).toContain('(ne (bf_string .Params.Sort) "date") "sort"')
    expect(template).toContain('(ne .Params.Tag "") "tag"')
  })

  test('derived `root` const becomes a computed Root field', () => {
    const { types } = generate(SRC)
    expect(types).toContain('Root string `json:"-"`')
    expect(types).toContain(
      'Root: func() string { v := strings.TrimRight(in.Base, "/"); if v != "" { return v }; return "/" }(),',
    )
    expect(types).toContain('"strings"')
  })

  // A `&&` guard is NOT a Go bool (Go's `and` returns an operand); it must be
  // truthiness-wrapped so `bf_query`'s `include` receives a real bool (#1945 review).
  test('a && guard is wrapped to a bool, not passed as bare `and`', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P(props: { base: string }) {
  const params = createMemo(() => { const sp = searchParams(); return { tag: sp.get('tag') ?? '' } })
  const root = (props.base ?? '') || '/'
  const hrefFor = (sort: string, tag: string) => {
    const u = new URLSearchParams()
    if (sort && tag) u.set('both', sort)
    return u.toString() ? \`\${root}?\${u}\` : root
  }
  const h = (k) => hrefFor(k, params().tag)
  return <a href={h('x')}>x</a>
}
`
    const { template } = generate(src)
    expect(template).toContain('(ne (and "x" .Params.Tag) "")')
  })

  // A URL-builder helper whose return isn't the conditional with-query/base
  // shape must not be lowered to bf_query (#1945 review) — it falls back to the
  // method-call form.
  test('a builder returning a non-conditional shape is not lowered to bf_query', () => {
    const src = `
'use client'
import { searchParams } from '@barefootjs/client'
export function P() {
  const bad = (sort: string) => { const u = new URLSearchParams(); u.set('s', sort); return u.toString() }
  return <a href={bad('x')}>x</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('bf_query')
    expect(template).toContain('.Bad')
  })

  // A non-string derived const referenced by the template must not be emitted
  // as a `string` field with a non-string initializer (#1945 review).
  test('a numeric derived const is not emitted as a string field', () => {
    const src = `
'use client'
export function P(props: { count: number }) {
  const n = props.count + 1
  return <span>{n}</span>
}
`
    const { types } = generate(src)
    expect(types).not.toContain('N string')
  })

  // `||`/`??` evaluate to one operand, so a non-string left makes the result
  // non-string even when the right is a string literal (#1945 review).
  test('a `?? ""` over a non-string is not emitted as a string field', () => {
    const src = `
'use client'
export function P(props: { count: number }) {
  const c = props.count ?? ''
  return <span>{c}</span>
}
`
    const { types } = generate(src)
    expect(types).not.toContain('C string')
  })
})
