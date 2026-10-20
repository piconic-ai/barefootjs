import { createFixture } from '../src/types'

/**
 * The children prop read through a const alias hop: `const c = children`
 * over the destructured prop, `const p = props` read as `p.children`, and
 * `const c = props.children` hopped again (`const d = c`). Bare, `??` and
 * `||` reads. Present children render as markup; the absent case renders
 * nothing or the escaped fallback (#3572; the `alias-props` mutation of
 * the nightly sweep produces the first shape).
 */
export const fixture = createFixture({
  id: 'children-alias-hop',
  description: 'A const alias hop of the children prop keeps present children markup',
  source: `
'use client'
import { Hop, PropsHop, MemberHop } from './box'
import { Leaf } from './leaf'
export function Page() {
  return (
    <main>
      <Hop><Leaf /></Hop>
      <Hop />
      <PropsHop><Leaf /></PropsHop>
      <PropsHop />
      <MemberHop><Leaf /></MemberHop>
      <MemberHop />
    </main>
  )
}
`,
  components: {
    './box.tsx': `
'use client'
export function Hop({ children }: { children?: unknown }) {
  const c = children
  return <div className="hop"><p>{c}</p><p>{c ?? '<b>hop</b>'}</p></div>
}
export function PropsHop(props: { children?: unknown }) {
  const p = props
  return <div className="props-hop"><p>{p.children}</p><p>{p.children || '<b>props</b>'}</p></div>
}
export function MemberHop(props: { children?: unknown }) {
  const c = props.children
  const d = c
  return <div className="member-hop"><p>{d}</p><p>{d ?? '<b>member</b>'}</p></div>
}
`,
    './leaf.tsx': `
'use client'
export function Leaf() {
  return <span className="leaf">leaf</span>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <div bf-s="test_s1" class="hop">
        <p><span bf-s="test_s0" class="leaf">leaf</span></p>
        <p><span bf-s="test_s0" class="leaf">leaf</span></p>
      </div>
      <div bf-s="test_s2" class="hop">
        <p></p>
        <p>&lt;b&gt;hop&lt;/b&gt;</p>
      </div>
      <div bf-s="test_s4" class="props-hop">
        <p><span bf-s="test_s3" class="leaf">leaf</span></p>
        <p><span bf-s="test_s3" class="leaf">leaf</span></p>
      </div>
      <div bf-s="test_s5" class="props-hop">
        <p></p>
        <p>&lt;b&gt;props&lt;/b&gt;</p>
      </div>
      <div bf-s="test_s7" class="member-hop">
        <p><span bf-s="test_s6" class="leaf">leaf</span></p>
        <p><span bf-s="test_s6" class="leaf">leaf</span></p>
      </div>
      <div bf-s="test_s8" class="member-hop">
        <p></p>
        <p>&lt;b&gt;member&lt;/b&gt;</p>
      </div>
    </main>
  `,
})
