import { createFixture } from '../src/types'

/**
 * #3845: a component that only spreads its whole props object onto a child
 * (`<Chip {...props} />`) names none of its props, but the client forwards
 * every key of `_p` to the child (`forwardProps`). The hydration payload
 * (`bf-p`) must carry the caller's whole bag; the reference emitted no
 * `bf-p` at all, so the child hydrated with an empty label and tone.
 *
 * `bf-p` itself is checked by the hydration payload conformance suite
 * (`src/hydration-payload-conformance.ts`), since `expectedHtml` comparison
 * strips it.
 */
export const fixture = createFixture({
  id: 'props-object-spread-child-hydration-props',
  description: 'a whole props-object spread onto a child travels in bf-p (#3845)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { label: string; tone?: string }) {
  const [on, setOn] = createSignal(false)
  return <button data-tone={props.tone} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

export function PropsObjectSpreadChildHydrationProps(props: { label: string; tone?: string }) {
  return <div><Chip {...props} /></div>
}
`,
  props: { label: 'x', tone: 'info' },
  expectedHtml: `
    <div bf-s="test"><button bf-s="test_s0" bf="s2" data-tone="info"><!--bf:s0-->x<!--/--><!--bf-cond-start:s1--><!--bf-cond-end:s1--></button></div>
  `,
})
