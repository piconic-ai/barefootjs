import { createFixture } from '../src/types'

/**
 * #3366: a `.map()` row param named like a signal shadows the signal only
 * inside the row. PHP's `foreach` leaves its loop variable set to the last
 * row after the loop, so a template that binds the row param to the same
 * variable as the signal must restore it: the read after the loop, and the
 * read in a later loop's row, still see the signal.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-signal-after-loop',
  description: 'A signal read after a loop whose row param has its name renders the signal',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function LoopParamShadowsSignalAfterLoop(props: { rows: string[] }) {
  const [s] = createSignal('outer')
  return (
    <div>
      <ul>{props.rows.map(s => <li key={s}>{s}</li>)}</ul>
      <p>{s()}</p>
      <ol>{props.rows.map(r => <li key={r}>{r}:{s()}</li>)}</ol>
    </div>
  )
}
`,
  props: { rows: ['x', 'y'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="x"><!--bf:s0-->x<!--/--></li>
        <li data-key="y"><!--bf:s0-->y<!--/--></li>
      </ul>
      <p bf="s3"><!--bf:s2-->outer<!--/--></p>
      <ol bf="s7">
        <li bf="s6" data-key="x"><!--bf:s4-->x<!--/-->:<!--bf:s5-->outer<!--/--></li>
        <li bf="s6" data-key="y"><!--bf:s4-->y<!--/-->:<!--bf:s5-->outer<!--/--></li>
      </ol>
    </div>
  `,
})
