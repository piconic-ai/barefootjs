import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'signal-literal-prop-name-collision',
  description: 'A literal-seeded signal and same-named prop keep independent values',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalLiteralPropNameCollision(props: { rows: number[] }) {
  const [rows] = createSignal<number[]>([7])
  return <div>
    <ul>{props.rows.map(n => <li key={n}>{n}</li>)}</ul>
    <ul>{rows().map(n => <li key={n}>{n}</li>)}</ul>
  </div>
}
`,
  props: { rows: [2] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"><li data-key="2"><!--bf:s0-->2<!--/--></li></ul>
      <ul bf="s3"><li data-key="7"><!--bf:s2-->7<!--/--></li></ul>
    </div>
  `,
})
