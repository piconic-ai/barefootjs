import { createFixture } from '../src/types'

/**
 * A stateless client component (no signal or memo) whose event handler
 * writes a destructured prop (`start++`). The init body owns `start` as a
 * local (`let start = _p.start ?? 0`); the registration template, which a
 * component like this used to get from the static fast path, reads the prop
 * (`_p.start ?? 0`) and never carries the write into module scope.
 */
export const fixture = createFixture({
  id: 'reassigned-prop-stateless',
  description: 'a stateless client component whose handler writes a destructured prop renders the prop',
  source: `
'use client'
export function ReassignedPropStateless({ start = 0 }: { start?: number }) {
  return <button onClick={() => start++}>{start}</button>
}
`,
  props: { start: 5 },
  expectedHtml: `
    <button bf-s="test" bf="s1"><!--bf:s0-->5<!--/--></button>
  `,
})
