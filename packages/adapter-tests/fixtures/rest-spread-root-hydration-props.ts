import { createFixture } from '../src/types'

/**
 * #3845: the keys of a closed-type `...rest` spread onto the root element
 * reach the client only through that spread. The client reads each one live
 * as `_p.<key>` and drops the attribute when it reads nullish, so the
 * hydration payload (`bf-p`) must carry them: without them hydration removes
 * `tone` and `size` from the server-rendered button.
 *
 * The SSR HTML below was already right on every adapter. `bf-p` itself is
 * checked by the hydration payload conformance suite
 * (`src/hydration-payload-conformance.ts`), since `expectedHtml` comparison
 * strips it.
 */
export const fixture = createFixture({
  id: 'rest-spread-root-hydration-props',
  description: 'closed-type rest keys spread onto the root element travel in bf-p (#3845)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function RestSpreadRootHydrationProps({ label, ...rest }: { label: string; tone?: string; size?: number }) {
  const [on, setOn] = createSignal(false)
  return <button {...rest} onClick={() => setOn(!on())}>{label}{on() ? '!' : ''}</button>
}
`,
  props: { label: 'x', tone: 'info', size: 2 },
  expectedHtml: `
    <button bf-s="test" bf="s2" size="2" tone="info"><!--bf:s0-->x<!--/--><!--bf-cond-start:s1--><!--bf-cond-end:s1--></button>
  `,
})
