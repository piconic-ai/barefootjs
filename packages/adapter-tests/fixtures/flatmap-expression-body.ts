import { createFixture } from '../src/types'

/**
 * `Array.prototype.flatMap` with a JSX-returning EXPRESSION body — the
 * canonical nested-loop PROJECTION (`items.flatMap(it => it.tags.map(...))`).
 *
 * Pre-fix, this shape fell through every `transformMapCall` dispatch arm to
 * the IRExpression scalar path with ZERO diagnostics, splicing the raw
 * callback — JSX included — verbatim into the client bundle: the module was
 * invalid JS (`Unexpected token '<'`) and the whole component silently failed
 * to hydrate while SSR looked correct.
 *
 * Per `spec/callback-fidelity.md`'s fidelity table the projection lowers to
 * NEUTRAL IR — an inner `IRLoop` as the loop's only child — so EVERY SSR
 * adapter templatizes it natively (nested `{{range}}` on DSL backends; no
 * conformancePins entry, unlike statement-carrying flatMap bodies such as
 * `tag-cloud`). The client reconciles the flattened leaves through the
 * descriptor `mapArray` path synthesized from the same inner loop. Keys are
 * adversarial (`<`, `&`, `"`, `'`) to pin `data-key-1` attribute escaping in
 * both the SSR templates and the client string templates, plus leaf-text
 * escaping through the leaf door.
 */
export const fixture = createFixture({
  id: 'flatmap-expression-body',
  description: 'JSX-returning `.flatMap()` projection — neutral nested-loop IR on every adapter',
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
    <ul bf-s="test" bf="s1">
      <li data-key-1="a:&lt;b&gt;bold&lt;/b&gt;"><!--bf:s0-->&lt;b&gt;bold&lt;/b&gt;<!--/--></li>
      <li data-key-1="a:x &amp; &quot;y&quot;"><!--bf:s0-->x &amp; &quot;y&quot;<!--/--></li>
      <li data-key-1="b:it&#39;s"><!--bf:s0-->it&#39;s<!--/--></li>
    </ul>
  `,
})
