import { createFixture } from '../src/types'

/**
 * A later attribute spread overrides an earlier literal attribute of the same
 * key, so the key renders once with the spread's value, as the Hono reference
 * renders it. The rest type is open (`[key: string]: unknown`), so the keys the
 * spread holds are unknown at compile time and nothing can expand it into
 * per-key fallbacks; a closed rest type is expanded that way and is not this
 * limitation. The element is a hyphenated name inside `<math>`
 * (`annotation-xml`). With the prop absent the literal stays.
 */
export const fixture = createFixture({
  id: 'spread-overrides-literal-attr',
  description: 'A later attribute spread overrides an earlier literal attribute of the same key',
  source: `
export function SpreadOverridesLiteralAttr({ ...rest }: { encoding?: string; [key: string]: unknown }) {
  return <math><annotation-xml className="plain" encoding="application/x-tex" {...rest}><title>t</title></annotation-xml></math>
}
`,
  props: { encoding: 'text/html' },
  expectedHtml: `
    <math bf-s="test"><annotation-xml bf="s0" class="plain" encoding="text/html"><title>t</title></annotation-xml></math>
  `,
  dataPoints: [
    { name: 'override', props: { encoding: 'text/html' } },
    { name: 'absent', props: {} },
  ],
})
