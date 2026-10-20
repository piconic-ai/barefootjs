import { createFixture } from '../src/types'

/**
 * The children prop renamed (`kids`) beside another prop bound to the local
 * name `children` (`label: children`) in the same destructure, in the
 * parameter (`Box`) and in the body (`BodyBox`, `const { children: kids,
 * label: children } = props`). The two stay separate values: the passed
 * children render as markup and the markup-looking label renders as escaped
 * text (#3572). On Go both used to read one field, and the client template
 * escaped `BodyBox`'s children.
 */
export const fixture = createFixture({
  id: 'children-renamed-beside-children-local',
  description: 'A renamed children prop and a local named children bound to another prop stay separate',
  source: `
'use client'
import { Box, BodyBox } from './box'
import { Leaf } from './leaf'
export function Page() {
  return (
    <main>
      <Box label="<i>label</i>"><Leaf /></Box>
      <Box label="<i>solo</i>" />
      <BodyBox label="<i>body</i>"><Leaf /></BodyBox>
    </main>
  )
}
`,
  components: {
    './box.tsx': `
'use client'
export function Box({ children: kids, label: children }: { children?: unknown; label?: string }) {
  return <div className="box"><p>{kids}</p><p>{children}</p></div>
}
export function BodyBox(props: { children?: unknown; label?: string }) {
  const { children: kids, label: children } = props
  return <div className="body-box"><p>{kids}</p><p>{children}</p></div>
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
      <div bf-s="test_s1" class="box">
        <p><span bf-s="test_s0" class="leaf">leaf</span></p>
        <p bf="s1"><!--bf:s0-->&lt;i&gt;label&lt;/i&gt;<!--/--></p>
      </div>
      <div bf-s="test_s2" class="box">
        <p></p>
        <p bf="s1"><!--bf:s0-->&lt;i&gt;solo&lt;/i&gt;<!--/--></p>
      </div>
      <div bf-s="test_s4" class="body-box">
        <p><span bf-s="test_s3" class="leaf">leaf</span></p>
        <p bf="s1"><!--bf:s0-->&lt;i&gt;body&lt;/i&gt;<!--/--></p>
      </div>
    </main>
  `,
})
