import { createFixture } from '../src/types'

/**
 * `{...props}` on an element inside a signal-array `.map()` row (#3917).
 * Hono renders the component's props bag onto every row's element. The CSR
 * row template used to drop the spread, so the rows lacked `id` / `title`.
 */
export const fixture = createFixture({
  id: 'element-spread-props-in-signal-loop-row',
  description: 'Props-object element spread inside a signal-array loop row',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ElementSpreadPropsInSignalLoopRow(props: { title?: string; id?: string }) {
  const [rows] = createSignal([{ k: 'a' }, { k: 'b' }])
  return <div>{rows().map(r => <span key={r.k} {...props}>{r.k}</span>)}</div>
}
`,
  props: { title: 'T', id: 'I' },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <span bf="s1" data-key="a" id="I" title="T"><!--bf:s0-->a<!--/--></span>
      <span bf="s1" data-key="b" id="I" title="T"><!--bf:s0-->b<!--/--></span>
    </div>
  `,
})
