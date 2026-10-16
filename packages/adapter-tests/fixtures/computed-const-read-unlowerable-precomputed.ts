import { createFixture } from '../src/types'

/**
 * prop-precompute twin of `computed-const-read-unlowerable`: the caller
 * passes the keys as a prop, which every adapter reads.
 */
export const fixture = createFixture({
  id: 'computed-const-read-unlowerable-precomputed',
  description: 'prop-precompute twin of computed-const-read-unlowerable — the keys arrive as a prop (#3494)',
  source: `
export function KeyCount({ entries }: { entries: string[] }) {
  return <p data-count={entries.length}>{entries.join(',')}</p>
}
`,
  props: { entries: ['x'] },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-count="1"><!--bf:s0-->x<!--/--></p>
  `,
})
