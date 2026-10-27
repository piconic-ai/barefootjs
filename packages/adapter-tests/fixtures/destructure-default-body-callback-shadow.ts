import { createFixture } from '../src/types'

/**
 * A body destructure default holding a callback whose parameter has the
 * prop's own name (`const { b = ['y', '', 'z'].filter((b) => b !== '') } =
 * props`): inside the callback `b` is the element, so an omitted `b` takes
 * the filtered array, read from text, an attribute and a condition.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-callback-shadow',
  description: 'A body destructure default whose callback parameter shadows the prop name renders the filtered array',
  source: `
'use client'
export function DestructureDefaultBodyCallbackShadow(props: { b?: string[] }) {
  const { b = ['y', '', 'z'].filter((b) => b !== '') } = props
  return <div data-n={b.length}>{b.length}{b.length > 1 ? <i>many</i> : <s>few</s>}</div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s2" data-n="2"><!--bf:s0-->2<!--/--><i bf-c="s1">many</i></div>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p'] } },
    { name: 'b-empty', props: { b: [] } },
  ],
})
