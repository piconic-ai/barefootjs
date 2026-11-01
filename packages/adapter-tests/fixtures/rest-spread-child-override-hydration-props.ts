import { createFixture } from '../src/types'

/**
 * #3845 sibling: a closed-type `...rest` spread onto a child component,
 * before explicit props. The spread unrolls per key, and the client reads
 * each key as `_p.<key>` (`get tone() { return _p.tone }`), so the
 * hydration payload (`bf-p`) must carry the rest key too, even though the
 * explicit `tone="override"` written after it wins in the rendered child.
 *
 * `bf-p` itself is checked by the hydration payload conformance suite
 * (`src/hydration-payload-conformance.ts`), since `expectedHtml` comparison
 * strips it.
 */
export const fixture = createFixture({
  id: 'rest-spread-child-override-hydration-props',
  description: 'closed-type rest keys spread onto a child travel in bf-p (#3845)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { label: string; tone?: string }) {
  const [on, setOn] = createSignal(false)
  return <button data-tone={props.tone} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

export function RestSpreadChildOverrideHydrationProps({ label, ...rest }: { label: string; tone?: string }) {
  return <div><Chip {...rest} tone="override" label={label} /></div>
}
`,
  props: { label: 'x', tone: 'info' },
  expectedHtml: `
    <div bf-s="test"><button bf-s="test_s0" bf="s2" data-tone="override"><!--bf:s0-->x<!--/--><!--bf-cond-start:s1--><!--bf-cond-end:s1--></button></div>
  `,
})
