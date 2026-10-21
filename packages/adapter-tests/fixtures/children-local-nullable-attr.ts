import { createFixture } from '../src/types'

/**
 * An optional prop bound to the local name `children` (`{ label: children }`)
 * read as an attribute, a condition and text, alone (`Solo`) and beside the
 * renamed children prop (`Pair`, `{ children: kids, label: children }`).
 * The attribute is present only when the label is passed, whether or not
 * children are passed; the label's markup-looking value is escaped and the
 * passed children render as markup (#3572). On Go the attribute's nil guard
 * used to test the children payload's `Children` field.
 */
export const fixture = createFixture({
  id: 'children-local-nullable-attr',
  description: 'An optional prop bound locally as children gates its attribute on its own value',
  source: `
'use client'
import { Solo, Pair } from './box'
import { Leaf } from './leaf'
export function Page() {
  return (
    <main>
      <Solo label="<i>a</i>" />
      <Solo />
      <Pair label="<i>b</i>"><Leaf /></Pair>
      <Pair><Leaf /></Pair>
      <Pair label="<i>c</i>" />
    </main>
  )
}
`,
  components: {
    './box.tsx': `
'use client'
export function Solo({ label: children }: { label?: string }) {
  return <p className="solo" title={children}>{children ? 'yes' : 'no'}{children}</p>
}
export function Pair({ children: kids, label: children }: { children?: unknown; label?: string }) {
  return <div className="pair" title={children}>{kids}{children ? 'yes' : 'no'}{children}</div>
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
      <p bf-s="test_s0" bf="s2" class="solo" title="&lt;i&gt;a&lt;/i&gt;"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--><!--bf:s1-->&lt;i&gt;a&lt;/i&gt;<!--/--></p>
      <p bf-s="test_s1" bf="s2" class="solo"><!--bf-cond-start:s0-->no<!--bf-cond-end:s0--><!--bf:s1--><!--/--></p>
      <div bf-s="test_s3" bf="s2" class="pair" title="&lt;i&gt;b&lt;/i&gt;"><span bf-s="test_s2" class="leaf">leaf</span><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--><!--bf:s1-->&lt;i&gt;b&lt;/i&gt;<!--/--></div>
      <div bf-s="test_s5" bf="s2" class="pair"><span bf-s="test_s4" class="leaf">leaf</span><!--bf-cond-start:s0-->no<!--bf-cond-end:s0--><!--bf:s1--><!--/--></div>
      <div bf-s="test_s6" bf="s2" class="pair" title="&lt;i&gt;c&lt;/i&gt;"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--><!--bf:s1-->&lt;i&gt;c&lt;/i&gt;<!--/--></div>
    </main>
  `,
})
