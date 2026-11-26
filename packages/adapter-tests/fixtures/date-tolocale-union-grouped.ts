import { createFixture } from '../src/types'

/**
 * A union-typed locale whose type groups some members in parentheses lowers
 * exactly like the flat union `'en-US' | 'ja-JP' | 'en-GB'`. (#3973)
 */
export const fixture = createFixture({
  id: 'date-tolocale-union-grouped',
  description: 'toLocaleDateString with a locale typed as a grouped string-literal union lowers like the flat union',
  source: `
function DateToLocaleUnionGrouped({ createdAt, locale }: { createdAt: Date; locale: ('en-US' | 'ja-JP') | 'en-GB' }) {
  return (
    <div>
      <time>{createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</time>
    </div>
  )
}
export { DateToLocaleUnionGrouped }
`,
  props: { createdAt: new Date('2024-03-05T12:00:00.000Z'), locale: 'en-GB' },
  dataPoints: [
    { name: 'en-us-arm', props: { createdAt: new Date('2024-03-05T12:00:00.000Z'), locale: 'en-US' } },
    { name: 'ja-jp-arm', props: { createdAt: new Date('2024-03-05T12:00:00.000Z'), locale: 'ja-JP' } },
  ],
  expectedHtml: `
    <div bf-s="test"><time bf="s1"><!--bf:s0-->05/03/2024<!--/--></time></div>
  `,
})
