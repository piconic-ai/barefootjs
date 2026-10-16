import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `computed-const-read-unlowerable`: both reads
 * are deferred to the browser, so the server renders neither and the
 * client runtime fills them at hydration.
 */
export const fixture = createFixture({
  id: 'computed-const-read-unlowerable-client',
  description: 'A /* @client */ read of a computed const with no template lowering defers to the browser (#3494)',
  source: `
'use client'

export function KeyCount({ labels }: { labels: Record<string, string> }) {
  const entries = Object.keys(labels)
  return <p data-count={/* @client */ entries.length}>{/* @client */ entries.join(',')}</p>
}
`,
  props: { labels: { x: '1' } },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
