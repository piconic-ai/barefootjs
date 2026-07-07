import { createFixture } from '../src/types'

/**
 * Back-to-back dynamic text expressions with NO separator
 * (`{h()}{m()}`) plus a mixed literal/dynamic run. Adjacent dynamic
 * text nodes need distinct slot markers — a lowering that merges
 * adjacent expressions into one slot can't update them independently
 * after hydration.
 */
export const fixture = createFixture({
  id: 'adjacent-dynamic-text',
  description: 'Adjacent dynamic text expressions with no separator',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function AdjacentDynamicText() {
  const [h, setH] = createSignal(12)
  const [m, setM] = createSignal(30)
  return (
    <div>
      <span>{h()}{m()}</span>
      <span>{h()}:{m()} on the clock</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf="s2"><!--bf:s0-->12<!--/--><!--bf:s1-->30<!--/--></span>
      <span bf="s5"><!--bf:s3-->12<!--/-->:<!--bf:s4-->30<!--/--> on the clock</span>
    </div>
  `,
})
