/**
 * flatMap block bodies ride the structured-segments carrier (flatMap
 * unification, spec/callback-fidelity.md root cure): the same
 * `renderPreamble()` door as `.map()` preambles, no `__BF_JSX_N__` sentinel.
 * Pins the two behavior fixes that ride the shared machinery:
 *
 * - leaf text interpolations escape like the SSR JSX runtime (`escapeText`),
 * - TS type annotations in the block body are stripped from the client
 *   bundle (the old raw-slice carrier spliced them verbatim — invalid JS).
 *
 * Byte-level SSR/CSR parity for flatMap block bodies is NOT pinned at the
 * conformance layer: the CSR string render and the Hono rawBody SSR have
 * pre-existing structural asymmetries (leaf `data-key` emitted client-side
 * only, with an unescaped attribute value; slot comment markers client-side
 * only) that predate the unification and need their own investigation —
 * see the known-limitation issue referenced in the changeset.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

describe('flatMap block bodies on structured segments', () => {
  test('leaf text interpolations are escapeText-wrapped in the client bundle', () => {
    const src = `
function F({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => {
    return it.tags.map((t) => <li key={t}>{t}</li>)
  })}</ul>
}
export { F }
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    expect(cj).toMatch(/escapeText\(\(t\)\)/)
    expect(cj).not.toMatch(/__BF_JSX_/)
  })

  test('destructured prop refs rewrite to _p.xxx in the hydrate template', () => {
    // The hydrate registration template is module scope (`template: (_p) =>`),
    // so a bare destructured-prop reference in the flatMap body would be a
    // runtime ReferenceError. Per-segment templateText (rewriteBarePropRefs)
    // + textVariant 'template' at the CSR-template site rewrite it.
    const src = `
function F({ limit, items }: { limit: number; items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => {
    if (it.tags.length > limit) return []
    return it.tags.map((t) => <li key={t}>{t}</li>)
  })}</ul>
}
export { F }
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    const tpl = cj.match(/template: \(_p\) => `[\s\S]*?` \}\)/)?.[0] ?? ''
    expect(tpl).toMatch(/_p\.limit/)
    expect(tpl).not.toMatch(/[^.\w]limit\b/)
  })

  test('client loop reconciles the FLATTENED descriptors, not the source items', () => {
    // The mapArray accessor flattens through the callback body — each leaf a
    // `({ k, h })` descriptor keyed by the leaf's own `key` — so hydration
    // adopts every SSR leaf (not one per source item), adds build real
    // elements from `h` (not an empty template), and the keyFn is the leaf
    // key (not null/index). This pins the client half of the flatMap loop;
    // pre-fix it emitted `mapArray(() => todos(), _sN, null, …innerHTML = ``…)`
    // — leaf loss at hydration and a cloneNode(null) crash on adds.
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function F() {
  const [todos, setTodos] = createSignal<{ id: number; tags: string[] }[]>([{ id: 1, tags: ['a'] }])
  return <ul>{todos().flatMap((t) => {
    if (t.tags.length > 5) return []
    const prefix = t.id + ':'
    return t.tags.map((tag) => <li key={\`\${t.id}:\${tag}\`}>{prefix}{tag}</li>)
  })}</ul>
}
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // Flattened source with descriptor leaves…
    expect(cj).toMatch(/mapArray\(\(\) => \(todos\(\)\)\.flatMap\(\(t\) => \{/)
    expect(cj).toMatch(/\(\{ k: \(`\$\{t\.id\}:\$\{tag\}`\), h: `<li>/)
    // …keyed on the leaf key with index fallback…
    expect(cj).toMatch(/\(__bfD, __bfI\) => String\(__bfD\.k \?\? __bfI\)/)
    // …renderItem builds from the descriptor HTML and patches on change…
    expect(cj).toMatch(/__tpl\.innerHTML = __bfD\(\)\.h/)
    expect(cj).toMatch(/patchLeaf\(__el, __html\)/)
    // …and the statements-before-return are NOT duplicated as a renderItem
    // preamble (the segments carrier is the single door).
    expect(cj).not.toMatch(/return \[\];* if \(__existing\)/)
    // Leaf data-key never rides the string templates — mapArray stamps it.
    expect(cj).not.toMatch(/data-key/)
  })

  test('a leaf with an event handler refuses loudly (no silent dead DOM)', () => {
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function F() {
  const [todos, setTodos] = createSignal<{ id: number; tags: string[] }[]>([])
  return <ul>{todos().flatMap((t) => {
    return t.tags.map((tag) => <li key={tag} onClick={() => console.log(tag)}>{tag}</li>)
  })}</ul>
}
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    const errs = r.errors.filter(e => e.severity === 'error')
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0].message).toContain('cannot carry')
  })

  test('TS type annotations in the block body are stripped from the client bundle', () => {
    const src = `
function F({ items }: { items: { id: string; labels: string[] }[] }) {
  return <ul>{items.flatMap((it) => {
    const upper: string[] = it.labels
    return upper.map((l) => <li key={l}>{l}</li>)
  })}</ul>
}
export { F }
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // The annotation must not survive into plain JS...
    expect(cj).not.toMatch(/upper: string\[\]/)
    // ...while the declaration itself does.
    expect(cj).toMatch(/const upper = it\.labels/)
  })
})
