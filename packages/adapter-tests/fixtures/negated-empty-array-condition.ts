import { createFixture } from '../src/types'

/**
 * An empty array is truthy in JS, so `!tags()` is false when `tags()` is `[]`
 * and the second branch renders. `createQuery`'s mode B relies on this: an
 * empty result list renders the (empty) list, not the loading skeleton
 * (`create-query-optional-initial`'s `gen:posts:empty` data point).
 */
export const fixture = createFixture({
  id: 'negated-empty-array-condition',
  description: 'A negated empty-array signal is false in a ternary test, so the second branch renders',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function TagSummary(props: { tags?: string[] }) {
  const [tags] = createSignal(props.tags)
  return <p>{!tags() ? 'no tags' : 'has tags'}</p>
}
`,
  props: { tags: [] },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf-cond-start:s0--><!--bf:s2-->has tags<!--/--><!--bf-cond-end:s0--></p>
  `,
})
