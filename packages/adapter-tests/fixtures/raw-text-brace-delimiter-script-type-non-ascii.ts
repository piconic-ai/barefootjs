import { createFixture } from '../src/types'

/**
 * A literal `{{` in the text of a `<script>` whose literal type holds a
 * character outside ASCII around a JavaScript type: a BOM and U+0085
 * (`raw-text-brace-delimiter-script`). The text prints as written whatever
 * the type. A template engine that trims and lower-cases the type by its own
 * Unicode rules to decide how to escape the script text reads these two the
 * opposite ways.
 */
export const fixture = createFixture({
  id: 'raw-text-brace-delimiter-script-type-non-ascii',
  description: 'A tag-opening brace in <script> text prints as written when the type holds a BOM or a NEL',
  source: `
export function RawTextBraceDelimiterScriptTypeNonAscii() {
  return (
    <div>
      <script type="module&#xFEFF;">if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
      <script type="module&#x85;">if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <script type="module ">if (window.__no) {{ b("{{") }} // {</script>
      <script type="module">if (window.__no) {{ b("{{") }} // {</script>
    </div>
  `,
})
