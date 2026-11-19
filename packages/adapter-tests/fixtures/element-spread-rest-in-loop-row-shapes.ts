import { createFixture } from '../src/types'

/**
 * Sibling shapes of `element-spread-props-in-signal-loop-row` (#3917): a
 * `{...rest}` bag spread on a row element (the destructured `label` stays out
 * of it), an explicit attribute written before and after the spread, and an inner
 * loop's row. Every row carries the caller's keys
 * the way Hono renders them.
 */
export const fixture = createFixture({
  id: 'element-spread-rest-in-loop-row-shapes',
  description: 'Rest-bag element spread in signal, static and nested loop rows with explicit attrs around it',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ElementSpreadRestInLoopRowShapes({ label, ...rest }: { label: string; title?: string; id?: string; [key: string]: unknown }) {
  const [rows] = createSignal([{ k: 'a' }, { k: 'b' }])
  const [groups] = createSignal([{ g: 'x', items: ['p', 'q'] }])
  return (
    <div data-label={label}>
      <ul>{rows().map(r => <li key={r.k} class="before" {...rest}>{r.k}</li>)}</ul>
      <ol>{rows().map(r => <li key={r.k} {...rest} class="after">{r.k}</li>)}</ol>
      <section>{groups().map(g => <div key={g.g}>{g.items.map(i => <i key={i} {...rest}>{i}</i>)}</div>)}</section>
    </div>
  )
}
`,
  props: { label: 'L', title: 'T', id: 'I' },
  expectedHtml: `
    <div bf-s="test" bf="s10" data-label="L">
      <ul bf="s2">
        <li bf="s1" class="before" data-key="a" id="I" title="T"><!--bf:s0-->a<!--/--></li>
        <li bf="s1" class="before" data-key="b" id="I" title="T"><!--bf:s0-->b<!--/--></li>
      </ul>
      <ol bf="s5">
        <li bf="s4" class="after" data-key="a" id="I" title="T"><!--bf:s3-->a<!--/--></li>
        <li bf="s4" class="after" data-key="b" id="I" title="T"><!--bf:s3-->b<!--/--></li>
      </ol>
      <section bf="s9"><div bf="s8" data-key="x"><i bf="s7" data-key-1="p" id="I" title="T"><!--bf:s6-->p<!--/--></i><i bf="s7" data-key-1="q" id="I" title="T"><!--bf:s6-->q<!--/--></i></div></section>
    </div>
  `,
})
