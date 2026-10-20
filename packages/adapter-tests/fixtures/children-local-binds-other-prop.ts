import { createFixture } from '../src/types'

/**
 * The reverse of `children-renamed-param`: a destructure that binds another
 * prop under the local name `children` (`{ label: children }`). The local is
 * that prop, not the children prop, so it is a reactive text read whose
 * markup-looking value renders as escaped text (#3572).
 */
export const fixture = createFixture({
  id: 'children-local-binds-other-prop',
  description: 'A local named children that binds another prop is that prop, read as escaped text',
  source: `
'use client'
import { Labelled } from './labelled'
export function Page() {
  return <main><Labelled label="<b>x</b>" /><Labelled /></main>
}
`,
  components: {
    './labelled.tsx': `
'use client'
export function Labelled({ label: children }: { label?: string }) {
  return <p className="labelled">{children}</p>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <p bf-s="test_s0" bf="s1" class="labelled"><!--bf:s0-->&lt;b&gt;x&lt;/b&gt;<!--/--></p>
      <p bf-s="test_s1" bf="s1" class="labelled"><!--bf:s0--><!--/--></p>
    </main>
  `,
})
