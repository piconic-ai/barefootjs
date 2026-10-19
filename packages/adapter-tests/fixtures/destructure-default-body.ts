import { createFixture } from '../src/types'

/**
 * A body destructure from `props` whose default reads an earlier binding of
 * the same pattern (`const { off = false, on = off } = props`): the omitted
 * prop takes the earlier prop's value, as the parameter form does.
 */
export const fixture = createFixture({
  id: 'destructure-default-body',
  description: 'A body destructure default reading an earlier binding renders the earlier prop for an omitted prop',
  source: `
'use client'
export function DestructureDefaultBody(props: { off?: boolean; on?: boolean }) {
  const { off = false, on = off } = props
  return <p>{String(on)}</p>
}
`,
  props: { off: true },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->true<!--/--></p>
  `,
})
