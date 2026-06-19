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

  test('a helper that delegates to another local helper is NOT inlined (left for Capability C)', () => {
    const src = `
'use client'
import { createMemo, searchParams } from '@barefootjs/client'
export function P(props: { base: string }) {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: sp.get('sort') ?? '' }
  })
  const hrefFor = (sort: string, tag: string) => {
    const u = new URLSearchParams()
    if (sort !== 'date') u.set('sort', sort)
    if (tag) u.set('tag', tag)
    const s = u.toString()
    return s ? '/' + '?' + s : '/'
  }
  const sortHref = (k) => hrefFor(k, params().sort)
  return <a href={sortHref('date')}>date</a>
}
`
    const { template } = generate(src)
    // sortHref delegates to hrefFor (a local helper) → not inlined here.
    expect(template).toContain('.SortHref')
  })
})
