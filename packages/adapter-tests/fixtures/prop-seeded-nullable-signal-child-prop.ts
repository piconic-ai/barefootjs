import { createFixture } from '../src/types'

/**
 * Sibling of `prop-seeded-nullable-signal-attr` (#3323): a nullable signal
 * seeded from an optional prop, forwarded to a child's defaulted scalar
 * prop. An omitted prop reaches the child as `undefined`, so the child's
 * default renders; a supplied value renders as given.
 */
export const fixture = createFixture({
  id: 'prop-seeded-nullable-signal-child-prop',
  description: "A nullable signal seeded from an optional prop forwards to a child's defaulted prop: an omitted prop renders the child's default, a supplied one renders as given",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Child({ value = 'fallback' }: { value?: string }) {
  return <span>{value}</span>
}

export function PropSeededNullableSignalChildProp(props: { absent?: string; given?: string }) {
  const [a] = createSignal<string | undefined>(props.absent)
  const [g] = createSignal<string | undefined>(props.given)
  return (
    <div>
      <p className="absent"><Child value={a()} /></p>
      <p className="given"><Child value={g()} /></p>
    </div>
  )
}
`,
  props: { given: 'x' },
  expectedHtml: `
    <div bf-s="test">
      <p class="absent"><span bf-s="test_s0" bf="s1"><!--bf:s0-->fallback<!--/--></span></p>
      <p class="given"><span bf-s="test_s1" bf="s1"><!--bf:s0-->x<!--/--></span></p>
    </div>
  `,
})
