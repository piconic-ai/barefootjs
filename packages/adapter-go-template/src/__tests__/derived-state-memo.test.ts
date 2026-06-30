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

describe('Derived string-const → computed Go struct field (#1945)', () => {
  // The trailing-slash strip `(props.base ?? '').replace(/\/+$/, '')` lowers in
  // the `NewXxxProps` constructor to `strings.TrimRight`, and `base || '/'`
  // becomes a computed `Root` field referenced by the template. (The former
  // `URLSearchParams` href-builder recognizer that shared this fixture was
  // retired in #2042 once `queryHref` replaced it.)
  test('derived `root` const (trailing-slash strip) becomes a computed Root field', () => {
    const src = `
'use client'
export function P(props: { base: string }) {
  const base = (props.base ?? '').replace(/\\/+$/, '')
  const root = base || '/'
  return <a href={root}>home</a>
}
`
    const { types } = generate(src)
    expect(types).toContain('Root string `json:"-"`')
    expect(types).toContain(
      'Root: func() string { v := strings.TrimRight(in.Base, "/"); if v != "" { return v }; return "/" }(),',
    )
    expect(types).toContain('"strings"')
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

describe('Capability D: array-memo .length → handler-filled loop slice count', () => {
  test('visible().length lowers to len .<Slice>, not the nil memo field', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
import { Row } from './Row'
export function P(props: { items: { id: string }[] }) {
  const params = createMemo(() => {
    const sp = searchParams()
    return { tag: sp.get('tag') ?? '' }
  })
  const visible = createMemo(() => {
    const { tag } = params()
    return props.items.filter((p) => !tag || p.id === tag)
  })
  return (
    <div>
      <span>{visible().length} / {props.items.length} shown</span>
      <ul>
        {visible().map((p) => (
          <Row key={p.id} id={p.id} />
        ))}
      </ul>
    </div>
  )
}
`
    const { template } = generate(src)
    expect(template).not.toContain('len .Visible')
    // The loop over visible() is handler-filled as `.Rows`; the count reuses it.
    expect(template).toContain('len .Rows')
    // props.items.length is unaffected.
    expect(template).toContain('len .Items')
  })
})

describe('typed memo bodies parse from the type-stripped computation (#1976 review)', () => {
  const mk = (body: string) => `
"use client"
import { createSignal, createMemo } from '@barefootjs/client'
export function T() {
  const [count, setCount] = createSignal(3)
  const doubled = createMemo(() => ${body})
  return <div>{doubled()}</div>
}`

  // `MemoInfo.parsed` is parsed from the type-STRIPPED body (`ctx.getJS`), not
  // the raw source — otherwise TypeScript-only syntax (`as T`, `!`, satisfies)
  // would make `parseExpression` bail, `parsed` would be undefined, and the
  // adapter would lose the arithmetic shape it used to match on the stripped
  // `computation` (changing the SSR default).
  test('a TS-annotated memo body yields the same SSR as the untyped form', () => {
    const typed = generate(mk('(count() as number) * 2'))
    const untyped = generate(mk('count() * 2'))
    expect(typed.types).toContain('Doubled: 3 * 2,')
    expect(typed.types).toBe(untyped.types)
  })
})

// #2040 PR-B: guard-and-return-const block memos lower via the analyzer fold
// (`MemoInfo.parsed`), with a tolerant `parsedBlock` fallback for blocks the
// fold refuses (so the SSR const bake never regresses vs. the old statement
// walker).
describe('Capability C: guard-const block memo via fold (#2040 PR-B)', () => {
  test('folded guard memo bakes the module-const array (not nil)', () => {
    const { types } = generate(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"
const ALL = ['a', 'b', 'c']
export function Tags() {
  const [sel, setSel] = createSignal<string | null>(null)
  const visible = createMemo(() => {
    const k = sel()
    if (!k) return ALL
    return ALL.filter(t => t === k)
  })
  return <ul>{visible().map(t => (<li key={t}>{t}</li>))}</ul>
}
`)
    expect(types).toContain(`[]interface{}{"a", "b", "c"}`)
  })

  test('guard memo with an impure tail binding still bakes the const (fallback path)', () => {
    // `const n = ext()` is impure (not a reactive getter) and used more than
    // once in the tail, so `foldBlockToExpr` refuses → `parsed` is unset. The
    // tolerant `parsedBlock` fallback must still bake `ALL`; otherwise the first
    // server render is an empty list (regression vs. main). (PR #2053 review #1)
    const { types } = generate(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"
const ALL = ['a', 'b', 'c']
function ext() { return 1 }
export function Tags() {
  const [sel, setSel] = createSignal<string | null>(null)
  const visible = createMemo(() => {
    const k = sel()
    const n = ext()
    if (!k) return ALL
    return ALL.filter(t => t.length === n).concat(ALL.slice(n))
  })
  return <ul>{visible().map(t => (<li key={t}>{t}</li>))}</ul>
}
`)
    expect(types).toContain(`[]interface{}{"a", "b", "c"}`)
  })

  test('early-return string-const block memo bakes the initial branch (#2040 scope)', () => {
    // `() => { if (vert()) return A; return B }` folds to `vert() ? A : B`; with
    // `vert` starting false the SSR value is B. Now lowered via the general
    // `memoInitialFromParsedBody` conditional path. (PR #2053 review #2)
    const { types } = generate(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"
const A = 'flex-col'
const B = 'flex'
export function Box() {
  const [vert, setVert] = createSignal(false)
  const cls = createMemo(() => {
    if (vert()) return A
    return B
  })
  return <div className={cls()}>x</div>
}
`)
    expect(types).toContain('"flex"')
  })
})
