import { createFixture } from '../src/types'

/**
 * The relayed twin of `child-forwarded-omitted-optional-number`: an omitted
 * optional number prop held in a const (`const c = props.count`) or an
 * identity memo (`createMemo(() => props.count)`) and forwarded from there
 * into a child that reads it with `??`. The const and the memo hold JS
 * `undefined`, so the child still takes its fallback, while a present `0`
 * or fraction renders as a number. Both a `props` parent and a
 * destructured parent.
 */
export const fixture = createFixture({
  id: 'child-forwarded-omitted-optional-number-relay',
  description: 'an omitted optional number prop forwarded through a const or identity memo into a child\'s ?? read',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
function Show(props: { value?: number }) {
  return <i data-v={props.value ?? 'none'}>{props.value ?? 'none'}|{props.value ? 'y' : 'n'}</i>
}
function RelayD({ count }: { count?: number }) {
  const c = count
  const relayed = createMemo(() => count)
  return <p><Show value={c} /><Show value={relayed()} /></p>
}
export function ChildForwardedOmittedOptionalNumberRelay(props: { count?: number }) {
  const c = props.count
  const relayed = createMemo(() => props.count)
  return (
    <div>
      <Show value={c} />
      <Show value={relayed()} />
      <RelayD count={props.count} />
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s2" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></i>
      <i bf-s="test_s1" bf="s2" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></i>
      <p bf-s="test_s2">
        <i bf-s="test_s2_s0" bf="s2" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></i>
        <i bf-s="test_s2_s1" bf="s2" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></i>
      </p>
    </div>
  `,
  dataPoints: [
    { name: 'zero', props: { count: 0 } },
    { name: 'fraction', props: { count: 2.5 } },
  ],
})
