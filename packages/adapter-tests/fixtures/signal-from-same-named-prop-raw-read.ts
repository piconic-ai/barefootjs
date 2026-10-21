import { createFixture } from '../src/types'

/**
 * A signal seeded from its OWN same-named prop (`label` from
 * `props.label ?? 'D'`), with the raw `props.label` read beside it. The
 * template-stash backends keep such a signal on the prop's template
 * variable, so the raw read sees the derived value: an omitted prop renders
 * `D` where JS renders nothing. When the caller passes the prop, both
 * values agree. A signal seeded from a DIFFERENT prop is
 * `signal-named-like-prop`.
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
