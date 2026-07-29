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
    // The early return keeps this a STATEMENT-carrying body (segments
    // carrier) — a pure single-`return` projection now lowers to neutral
    // nested-loop IR instead (see the projection tests below).
    const src = `
function F({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => {
    if (it.tags.length > 9) return []
    return it.tags.map((t) => <li key={t}>{t}</li>)
  })}</ul>
}
export { F }
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // Escaped ONCE, by the template emitter reading `contentKind` (absent =
    // text). This used to read `escapeText((t))`: a pre-pass rewrote the IR
    // expression to add the wrapper because the emitter left un-slotted
    // expressions alone. With the emitter deciding from IR that pre-pass was
    // redundant and is gone, so the inner parens went with it. Exactly one
    // wrapper is the invariant — two would double-escape.
    expect(cj).toMatch(/escapeText\(t\)/)
    expect(cj).not.toContain('escapeText(escapeText(')
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

  test('projection expression bodies lower to neutral IR + descriptor client', () => {
    // `it => it.tags.map(...)` (no braces, no statements) is a pure
    // nested-loop PROJECTION: it lowers to neutral IR (inner IRLoop child)
    // that every SSR adapter templatizes — including DSL backends, per
    // spec/callback-fidelity.md's fidelity table — while the client
    // reconciles the flattened leaves through the descriptor mapArray path
    // synthesized from the same inner loop. Pre-fix it fell through to the
    // IRExpression scalar path and spliced raw JSX into the bundle.
    const src = `
function F({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => it.tags.map((t) => <li key={t}>{t}</li>))}</ul>
}
export { F }
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    // No raw JSX anywhere in the bundle.
    expect(cj).not.toMatch(/<li key=\{t\}>/)
    expect(cj).not.toMatch(/__BF_JSX_/)
    if (cj.includes('mapArray(')) {
      // Descriptor accessor flattens through the inner loop with the leaf key.
      expect(cj).toMatch(/\.flatMap\(\(it\) => it\.tags\.map\(\(t\) => \(\{ k: \(t\), h: `<li/)
      expect(cj).toMatch(/String\(__bfD\.k \?\? __bfI\)/)
    }
  })

  test('a member-expression tag leaf is a component, not a projection leaf', () => {
    // `<icons.Tag/>` starts lowercase but is a component per JSX semantics —
    // the wireless-leaf gate must not admit it to the projection route
    // (which cannot wire components). It falls to the segments carrier,
    // where a DSL-tier adapter refuses loudly instead of templatizing a
    // component tag as literal HTML.
    const src = `
import { icons } from './icons'
function F({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => it.tags.map((t) => <icons.Tag key={t} label={t} />))}</ul>
}
export { F }
`
    const dsl = new TestAdapter()
    ;(dsl as { acceptsCallbackBody?: () => boolean }).acceptsCallbackBody = () => false
    const r = compileJSX(src, 'F.tsx', { adapter: dsl })
    expect(r.errors.filter(e => e.severity === 'error').length).toBeGreaterThan(0)
  })

  test('single-return block projection lowers identically (DSL adapters accept it)', () => {
    const src = `
function F({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => {
    return it.tags.map((t) => <li key={t}>{t}</li>)
  })}</ul>
}
export { F }
`
    const dsl = new TestAdapter()
    ;(dsl as { acceptsCallbackBody?: () => boolean }).acceptsCallbackBody = () => false
    const r = compileJSX(src, 'F.tsx', { adapter: dsl })
    // Neutral IR — no BF021 gate on a DSL-tier adapter.
    expect(r.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })

  test('destructured prop refs rewrite to _p.xxx in expression-body hydrate templates', () => {
    const src = `
function F({ owner, items }: { owner: string; items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => it.tags.map((t) => <li key={t}>{t} ({owner})</li>))}</ul>
}
export { F }
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    expect(r.errors).toHaveLength(0)
    const cj = r.files.find(f => f.type === 'clientJs')!.content
    const tpl = cj.match(/template: \(_p\) => `[\s\S]*?` \}\)/)?.[0] ?? ''
    expect(tpl).toMatch(/_p\.owner/)
    expect(tpl).not.toMatch(/[^.\w]owner\b/)
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

  test('a fragment leaf refuses loudly (descriptor path is single-element)', () => {
    // The renderItem adopts `template.content.firstElementChild` and
    // patchLeaf patches ONE element root — a fragment leaf would silently
    // drop its siblings client-side while SSR renders them all.
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function F() {
  const [todos, setTodos] = createSignal<{ id: number; tags: string[] }[]>([])
  return <ul>{todos().flatMap((t) => {
    return t.tags.map((tag) => <><b>{tag}</b><i>{tag}</i></>)
  })}</ul>
}
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    const errs = r.errors.filter(e => e.severity === 'error')
    expect(errs.length).toBeGreaterThan(0)
    expect(errs.some(e => e.message.includes('must be a single'))).toBe(true)
  })

  test('the structural net stays armed when an unrelated diagnostic fired earlier', () => {
    // The scalar-fallthrough net de-dups against refusals fired during the
    // SAME map call (entry-count gate), never against diagnostics recorded
    // earlier in the file — a prior error in another loop must not let raw
    // JSX splice silently into the bundle.
    const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function F() {
  const [todos, setTodos] = createSignal<{ id: number; tags: string[] }[]>([])
  const wrap = (n: unknown) => n
  return <div>
    <ul>{todos().flatMap((t) => {
      return t.tags.map((tag) => <li key={tag} onClick={() => console.log(tag)}>{tag}</li>)
    })}</ul>
    <ol>{todos().map((t) => wrap(<li>{t.id}</li>))}</ol>
  </div>
}
`
    const r = compileJSX(src, 'F.tsx', { adapter: new TestAdapter() })
    const errs = r.errors.filter(e => e.severity === 'error')
    // One refusal per loop: the leaf-wiring refusal AND the structural net.
    expect(errs.some(e => e.message.includes('cannot carry'))).toBe(true)
    expect(errs.some(e => e.message.includes('would leak verbatim'))).toBe(true)
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
