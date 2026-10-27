import { createFixture } from '../src/types'

/**
 * A component-scope const whose initializer reads a signal getter, read
 * inside a loop row that binds the getter's name: `const b = count()` read
 * as `{b}` in `rows.map(count => …)`. The initializer resolves in the
 * component scope, so every row renders the signal's value, not anything
 * the row binds. A prop read through a shadowed name is
 * `const-alias-hop-loop-shadow`.
 */
export const fixture = createFixture({
  id: 'const-getter-read-loop-shadowed',
  description: 'A const reading a signal getter, read in a loop row that shadows the getter, keeps the signal value',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ConstGetterReadLoopShadowed({ rows }: { rows: string[] }) {
  const [count] = createSignal(7)
  const b = count()
  return <ul>{rows.map(count => <li key={count}>{b}/{count}</li>)}</ul>
}
`,
  props: { rows: ['r1', 'r2'] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="r1"><!--bf:s0-->7<!--/-->/<!--bf:s1-->r1<!--/--></li>
      <li bf="s2" data-key="r2"><!--bf:s0-->7<!--/-->/<!--bf:s1-->r2<!--/--></li>
    </ul>
  `,
})
