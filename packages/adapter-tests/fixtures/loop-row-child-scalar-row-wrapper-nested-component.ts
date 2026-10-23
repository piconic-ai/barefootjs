import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-scalar-row-wrapper`: a scalar array prop's
 * wrapper row forwards children that nest another component reading the
 * row (`props.picks.map(g => <Tag key={g}><Badge label={g} /></Tag>)`).
 * Every row renders its own wrapper with its own badge.
 */
export const fixture = createFixture({
  id: 'loop-row-child-scalar-row-wrapper-nested-component',
  description:
    "A wrapper component loop row over a string array prop whose forwarded children nest a component reading the row renders every row's component",
  source: `
'use client'
function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

function Tag({ children }: { children?: any }) {
  return <span class="tag">{children}</span>
}

export function LoopRowChildScalarRowWrapperNestedComponent(props: { picks: string[] }) {
  return (
    <p>{props.picks.map(g => <Tag key={g}><Badge label={g} /></Tag>)}</p>
  )
}
`,
  props: {
    picks: ['a', 'b'],
  },
  expectedHtml: `
    <p bf-s="test" bf="s2">
      <span bf-s="Tag_*" class="tag" data-key="a"><em bf-s="test_s0" bf="s1"><!--bf:s0-->a<!--/--></em></span>
      <span bf-s="Tag_*" class="tag" data-key="b"><em bf-s="test_s0" bf="s1"><!--bf:s0-->b<!--/--></em></span>
    </p>
  `,
})
