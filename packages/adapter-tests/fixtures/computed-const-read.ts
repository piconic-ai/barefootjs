import { createFixture } from '../src/types'

/**
 * Component-scope consts computed from props and signals, read in an
 * attribute, text, a condition, a memo and a loop row, chained through a
 * const of a const, and shadowed by a loop param of the same name.
 *
 * A template backend receives the props, not the component's locals, so
 * every template adapter read such a const as a template variable nothing
 * defines: `cls` rendered empty and Go failed the render on a missing
 * field. Each now reads the
 * const as its initializer (#3494).
 */
export const fixture = createFixture({
  id: 'computed-const-read',
  description: 'computed consts read in attribute, text, condition, memo and loop positions render their value (#3494)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function ComputedConstRead(props: { variant: string; n: number; label?: string; items: string[] }) {
  const [count] = createSignal(2)
  const cls = 'btn ' + props.variant
  const wide = cls + ' w-full'
  const twice = props.n * 2
  const doubled = count() * 3
  const shown = props.label ?? 'Default'
  const isLarge = props.n > 5
  const viaMemo = createMemo(() => twice)
  return (
    <div class={wide} data-twice={twice}>
      <span>{shown}</span>
      <span>{doubled}</span>
      <span>{viaMemo() + 1}</span>
      {isLarge ? <b>large</b> : <i>small</i>}
      <ul>{props.items.map((item) => <li key={item}>{item}-{twice}</li>)}</ul>
      <ol>{props.items.map((twice) => <li key={twice}>{twice}</li>)}</ol>
    </div>
  )
}
`,
  props: { variant: 'primary', n: 3, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s14" class="btn primary w-full" data-twice="6">
      <span bf="s1"><!--bf:s0-->Default<!--/--></span>
      <span bf="s3"><!--bf:s2-->6<!--/--></span>
      <span bf="s5"><!--bf:s4-->7<!--/--></span>
      <i bf-c="s6">small</i>
      <ul bf="s10">
        <li bf="s9" data-key="a"><!--bf:s7-->a<!--/-->-<!--bf:s8-->6<!--/--></li>
        <li bf="s9" data-key="b"><!--bf:s7-->b<!--/-->-<!--bf:s8-->6<!--/--></li>
      </ul>
      <ol bf="s13">
        <li bf="s12" data-key="a"><!--bf:s11-->a<!--/--></li>
        <li bf="s12" data-key="b"><!--bf:s11-->b<!--/--></li>
      </ol>
    </div>
  `,
})
