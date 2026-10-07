import { createFixture } from '../src/types'

/**
 * A memo read inside a `.map()` row whose binding shadows a name the memo
 * reads (#3352). `label()` in the first loop reads the memo declared
 * outside it, so its body's `s` is the signal, not the row param `s`. The
 * second loop's row param `label` shadows the memo itself, so `label`
 * there is the row item.
 */
export const fixture = createFixture({
  id: 'memo-dependency-loop-shadow',
  description: 'A memo read in a loop row resolves its dependencies in its declaration scope, not against a shadowing row binding',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoLoopShadow(props: { rows: string[] }) {
  const [s] = createSignal('outer')
  const label = createMemo(() => s())
  return (
    <div>
      <ul>{props.rows.map(s => <li key={s} title={label()}>{s}</li>)}</ul>
      <ol>{props.rows.map(label => <li key={label} title={label}>{label}</li>)}</ol>
    </div>
  )
}
`,
  props: { rows: ['x', 'y'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li bf="s1" data-key="x" title="outer"><!--bf:s0-->x<!--/--></li>
        <li bf="s1" data-key="y" title="outer"><!--bf:s0-->y<!--/--></li>
      </ul>
      <ol bf="s5">
        <li bf="s4" data-key="x" title="x"><!--bf:s3-->x<!--/--></li>
        <li bf="s4" data-key="y" title="y"><!--bf:s3-->y<!--/--></li>
      </ol>
    </div>
  `,
})
