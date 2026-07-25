import { createFixture } from '../src/types'

/**
 * `Array.prototype.flatMap` with a JSX-returning EXPRESSION body — the
 * unbraced twin of the block-body form (`{ return it.tags.map(...) }`) that
 * rides the structured-segments carrier (`FlatMapCallback`).
 *
 * Pre-fix, this shape fell through every `transformMapCall` dispatch arm to
 * the IRExpression scalar path with ZERO diagnostics, splicing the raw
 * callback — JSX included — verbatim into the client bundle: the module was
 * invalid JS (`Unexpected token '<'`) and the whole component silently failed
 * to hydrate while SSR looked correct.
 *
 * Per `spec/callback-fidelity.md` the shape is adapter-gated like the other
 * segment-carried bodies:
 *   - JS-runtime adapters (Hono / CSR) run the projection verbatim and render
 *     the flattened leaves.
 *   - DSL adapters can't execute the body at SSR and surface BF021 with a
 *     `/* @client *\/` escape (declared via each adapter's `conformancePins`)
 *     — pre-gate they emitted an EMPTY loop body (silent divergence).
 *
 * Leaf text carries `<`, `&`, `"`, `'` to pin escaping through the leaf door.
 */
export const fixture = createFixture({
  id: 'flatmap-expression-body',
  description: 'JSX-returning `.flatMap()` expression body — segments carrier, adapter-gated on DSL',
  source: `
function TagList({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => it.tags.map((tag) => <li key={\`\${it.id}:\${tag}\`}>{tag}</li>))}</ul>
}
export { TagList }
`,
  props: {
    items: [
      { id: 'a', tags: ['<b>bold</b>', 'x & "y"'] },
      { id: 'b', tags: ["it's"] },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s0">
      <li>&lt;b&gt;bold&lt;/b&gt;</li>
      <li>x &amp; &quot;y&quot;</li>
      <li>it&#39;s</li>
    </ul>
  `,
})
