import { createFixture } from '../src/types'

/**
 * A component-scope const whose initializer no template lowers
 * (`Object.keys(labels)`), read outside a loop. Every template adapter used
 * to read it as an unbound template variable and render a count of `0` and
 * empty text. It now reads as its initializer, and the method call refuses
 * with BF101, as the same const does as a loop source (#3494).
 */
export const fixture = createFixture({
  id: 'computed-const-read-unlowerable',
  description: 'A computed const whose initializer has no template lowering refuses (BF101) instead of reading an unbound name (#3494)',
  escapes: [
    { kind: 'prop-precompute', fixture: 'computed-const-read-unlowerable-precomputed' },
    { kind: 'client-directive', fixture: 'computed-const-read-unlowerable-client' },
  ],
  source: `
export function KeyCount({ labels }: { labels: Record<string, string> }) {
  const entries = Object.keys(labels)
  return <p data-count={entries.length}>{entries.join(',')}</p>
}
`,
  props: { labels: { x: '1' } },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-count="1"><!--bf:s0-->x<!--/--></p>
  `,
})
