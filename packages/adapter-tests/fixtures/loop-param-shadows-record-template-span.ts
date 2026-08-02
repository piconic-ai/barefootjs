import { createFixture } from '../src/types'

/**
 * A `.map()` callback param shadowing a module-scope RECORD const,
 * read via a dynamic-key element access INSIDE a template-literal span
 * (`` `t ${tone[k]}` ``) in the loop body.
 *
 * The template-span structurer (`tryResolveTemplateSpanFromConst`'s
 * `\${IDENT[KEY]}` arm, #2000/#2300 lineage) resolved the base
 * identifier against `localConstants` with no loop-scope check, folding
 * the OUTER record literal into a compile-time `lookup` part — every
 * row rendered from the frozen module const instead of its own item, on
 * every adapter including the Hono reference and the CSR bundle. Fixed
 * with the same `ctx.loopParams` guard the `\${IDENT}` arm family got
 * in #2222/#2235: inside the shadowing callback the span falls back to
 * the bare-expression path, which sees the row binding.
 *
 * The sibling of `loop-param-shadows-record-const` (#2237, adapter-side
 * property-access lookups) — this one pins the COMPILER-side fold that
 * happens before adapters ever see the IR.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-record-template-span',
  description: '.map() param shadowing a record const stays row-scoped inside a `${base[key]}` template span',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

const tone = { a: 'outer-a', b: 'outer-b' }

export function LoopParamShadowsRecordTemplateSpan({ items, k }: { items: { id: number; a: string; b: string }[]; k: 'a' | 'b' }) {
  const [n, setN] = createSignal(0)
  return (
    <div data-n={n()} onClick={() => setN(n() + 1)}>
      <ul>
        {items.map((tone) => (
          <li key={tone.id} data-t={\`t \${tone[k]}\`}>{tone.a}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { items: [{ id: 1, a: 'row1-a', b: 'row1-b' }, { id: 2, a: 'row2-a', b: 'row2-b' }], k: 'a' },
  expectedHtml: `
    <div bf-s="test" bf="s3" data-n="0"><ul bf="s2"><li bf="s1" data-key="1" data-t="t row1-a"><!--bf:s0-->row1-a<!--/--></li><li bf="s1" data-key="2" data-t="t row2-a"><!--bf:s0-->row2-a<!--/--></li></ul></div>
  `,
})
