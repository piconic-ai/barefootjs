import { createFixture } from '../src/types'

/**
 * Sibling of `prop-seeded-nullable-signal-attr` (#3323): a nullable signal
 * seeded from an optional prop, forwarded to a child's defaulted scalar
 * prop and to a child's optional, default-less prop bound to an attribute.
 * An omitted prop reaches the child as `undefined`: the default renders,
 * and the attribute is omitted. A supplied value, `''` included, renders
 * as given.
 */
export const fixture = createFixture({
  id: 'prop-seeded-nullable-signal-child-prop',
  description: "A nullable signal seeded from an optional prop forwards to a child prop: an omitted prop renders the child's default or omits its attribute, a supplied one renders as given",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Child({ value = 'fallback' }: { value?: string }) {
  return <span>{value}</span>
}

function Titled({ value }: { value?: string }) {
  return <i title={value}>t</i>
}

export function PropSeededNullableSignalChildProp(props: { absent?: string; given?: string; empty?: string }) {
  const [a] = createSignal<string | undefined>(props.absent)
  const [g] = createSignal<string | undefined>(props.given)
  const [e] = createSignal<string | undefined>(props.empty)
  return (
    <div>
      <p className="absent"><Child value={a()} /></p>
      <p className="given"><Child value={g()} /></p>
      <p className="titled-absent"><Titled value={a()} /></p>
      <p className="titled-empty"><Titled value={e()} /></p>
    </div>
  )
}
`,
  props: { given: 'x', empty: '' },
  expectedHtml: `
    <div bf-s="test">
      <p class="absent"><span bf-s="test_s0" bf="s1"><!--bf:s0-->fallback<!--/--></span></p>
      <p class="given"><span bf-s="test_s1" bf="s1"><!--bf:s0-->x<!--/--></span></p>
      <p class="titled-absent"><i bf-s="test_s2" bf="s0">t</i></p>
      <p class="titled-empty"><i bf-s="test_s3" bf="s0" title="">t</i></p>
    </div>
  `,
})
