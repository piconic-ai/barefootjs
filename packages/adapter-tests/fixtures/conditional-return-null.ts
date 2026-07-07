import { createFixture } from '../src/types'

/**
 * An early `return null` guard branch. The conditional-return family
 * (`conditional-return-button` / `-link`) pins element-vs-element
 * branches; this pins element-vs-NOTHING — the null branch must render
 * empty output, not the string "null" or a crash. The fixture renders
 * the non-null branch (hidden unset) so the visible path stays
 * comparable, while the null branch keeps every adapter honest at
 * compile time.
 */
export const fixture = createFixture({
  id: 'conditional-return-null',
  description: 'Early `return null` guard with the element branch rendered',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionalReturnNull(props: { hidden?: boolean }) {
  const [count, setCount] = createSignal(1)
  if (props.hidden) {
    return null
  }
  return <div>visible:{count()}</div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s1">visible:<!--bf:s0-->1<!--/--></div>
  `,
})
