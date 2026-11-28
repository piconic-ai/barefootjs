import { createFixture } from '../src/types'

/**
 * `signal-seed-same-named-transform` for memos: each memo transforms the
 * prop it shares a name with (a concatenation through `String`, a
 * template literal, a method call), beside a memo of a same-named
 * transforming signal. Each renders its transformed value.
 */
export const fixture = createFixture({
  id: 'memo-same-named-transform',
  description: 'Memos computed by transforming their same-named props keep each transformation',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoSameNamedTransform(props: { seed?: string; tpl?: string; up?: string; count?: number }) {
  const seed = createMemo(() => String(props.seed ?? 'none') + '!')
  const tpl = createMemo(() => \`\${props.tpl ?? 'none'}!\`)
  const up = createMemo(() => (props.up ?? 'none').toUpperCase())
  const [count] = createSignal((props.count ?? 1) * 3)
  const doubled = createMemo(() => count() * 2)
  return <p data-seed={seed()}>{seed()}|{tpl()}|{up()}|{count()}|{doubled()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s5" data-seed="none!"><!--bf:s0-->none!<!--/-->|<!--bf:s1-->none!<!--/-->|<!--bf:s2-->NONE<!--/-->|<!--bf:s3-->3<!--/-->|<!--bf:s4-->6<!--/--></p>
  `,
  dataPoints: [
    { name: 'supplied', props: { seed: 'a', tpl: 'b', up: 'abc', count: 2 } },
  ],
})
