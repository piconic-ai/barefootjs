import { createFixture } from '../src/types'

/**
 * The un-negated twin of `negated-empty-array-condition`: an empty array is
 * truthy in JS, so a ternary testing `tags()` directly takes the first branch
 * when `tags()` is `[]`.
 */
export const fixture = createFixture({
  id: 'empty-array-condition',
  description: 'An empty-array signal is true in a ternary test, so the first branch renders',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function TagSummary(props: { tags?: string[] }) {
  const [tags] = createSignal(props.tags)
  return <p>{tags() ? 'has tags' : 'no tags'}</p>
}
`,
  props: { tags: [] },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf-cond-start:s0--><!--bf:s1-->has tags<!--/--><!--bf-cond-end:s0--></p>
  `,
})
