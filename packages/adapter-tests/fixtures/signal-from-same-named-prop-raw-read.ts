import { createFixture } from '../src/types'

/**
 * A signal seeded from its OWN same-named prop (`label` from
 * `props.label ?? 'D'`), with the raw `props.label` read beside it. The
 * raw read makes the analyzer separate the signal from the prop before IR
 * is built, so it keeps the caller's value: an omitted prop renders
 * nothing, not the signal's `D`. A signal seeded from a DIFFERENT prop is
 * `signal-named-like-prop`; other derivations and positions are
 * `signal-from-same-named-prop-raw-read-kinds` / `-positions`.
 */
export const fixture = createFixture({
  id: 'signal-from-same-named-prop-raw-read',
  description: 'A signal seeded from its same-named prop, read beside the raw prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalFromSameNamedPropRawRead(props: { label?: string }) {
  const [label] = createSignal(props.label ?? 'D')
  return <p data-l={label()}>{label()} / {props.label}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-l="D"><!--bf:s0-->D<!--/--> / <!--bf:s1--><!--/--></p>
  `,
})
