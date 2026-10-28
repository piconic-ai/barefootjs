import { createFixture } from '../src/types'

/**
 * `signal-from-same-named-prop-raw-read` across derivation kinds: a
 * non-idempotent number seed (`(props.count ?? 1) * 2`), string and number
 * seeds read through a component-scope const, and a memo derived from its
 * own same-named prop. Each binding is read beside its raw prop, which
 * must keep the caller's value (empty when omitted).
 */
export const fixture = createFixture({
  id: 'signal-from-same-named-prop-raw-read-kinds',
  description: 'Signals and a memo seeded from their same-named props, read beside the raw props',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function SignalFromSameNamedPropRawReadKinds(props: { count?: number; title?: string; note?: string; total?: number }) {
  const mid = props.title
  const base = props.total
  const [count] = createSignal((props.count ?? 1) * 2)
  const [title] = createSignal(mid ?? 'T')
  const note = createMemo(() => (props.note ?? 'N') + '!')
  const [total] = createSignal((base ?? 1) * 3)
  return (
    <p data-c={count()} data-rc={props.count}>
      {count()}|{props.count}|{title()}|{props.title}|{note()}|{props.note}|{total()}|{props.total}
    </p>
  )
}
`,
  props: {},
  dataPoints: [
    { name: 'all', props: { count: 5, title: 'X', note: 'M', total: 4 } },
    { name: 'zero-and-empty', props: { count: 0, title: '', note: '', total: 0 } },
    { name: 'fraction', props: { count: 1.5, total: 0.5 } },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s8" data-c="2"><!--bf:s0-->2<!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2-->T<!--/-->|<!--bf:s3--><!--/-->|<!--bf:s4-->N!<!--/-->|<!--bf:s5--><!--/-->|<!--bf:s6-->3<!--/-->|<!--bf:s7--><!--/--></p>
  `,
})
