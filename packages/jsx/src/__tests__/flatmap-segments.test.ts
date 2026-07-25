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
