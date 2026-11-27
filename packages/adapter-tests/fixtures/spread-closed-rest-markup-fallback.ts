import { createFixture } from '../src/types'

/**
 * A literal attribute before a closed rest spread becomes the rest key's
 * fallback (`rest.title ?? "…"`). The fallback literal holds `<` and `>`;
 * with the caller omitting `title` it renders as written.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-markup-fallback',
  description: 'A closed rest key falls back to an earlier literal holding < and >',
  source: `
type P = { id?: string; title?: string }
export function SpreadClosedRestMarkupFallback({ ...rest }: P) {
  return <p title="a < b > c" {...rest}>x</p>
}
`,
  props: { id: 'i' },
  expectedHtml: `
    <p bf-s="test" id="i" title="a &lt; b &gt; c">x</p>
  `,
})
