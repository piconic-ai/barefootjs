import { createFixture } from '../src/types'

/**
 * A literal `{{` in the text of a `<script>` whose type arrives through an
 * attribute spread (`raw-text-brace-delimiter-script-type`). The text prints
 * as written whatever the type.
 */
export const fixture = createFixture({
  id: 'raw-text-brace-delimiter-script-spread',
  description: 'A tag-opening brace in <script> text prints as written when the type comes from a spread',
  source: `
export function RawTextBraceDelimiterScriptSpread({ ...rest }: { [key: string]: any }) {
  return (
    <div>
      <script {...rest}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
    </div>
  )
}
`,
  props: { type: 'text/plain', id: 'spread' },
  expectedHtml: `
    <div bf-s="test"><script bf="s0" id="spread" type="text/plain">if (window.__no) {{ b("{{") }} // {</script></div>
  `,
})
