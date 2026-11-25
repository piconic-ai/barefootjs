import { createFixture } from '../src/types'

/**
 * A literal `{{` in the text of a `<script>` whose type is not written as a
 * string literal (`raw-text-brace-delimiter-script`): a plain expression, a
 * template literal ending in static text, a const and a ternary (the
 * spread is `raw-text-brace-delimiter-script-spread`). The text prints as written whatever the
 * type. A template engine that reads the type from the template text to
 * decide how to escape the script text must not print the brace guard
 * through an output escaped for that reading.
 */
export const fixture = createFixture({
  id: 'raw-text-brace-delimiter-script-type',
  description: 'A tag-opening brace in <script> text prints as written when the type is an expression, a template literal, a const or a ternary',
  source: `
const MODULE_TYPE = 'module'

export function RawTextBraceDelimiterScriptType({ kind, prefix, on }: { kind: string; prefix: string; on: boolean }) {
  return (
    <div>
      <script type={kind}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
      <script type={\`\${prefix}module\`}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
      <script type={MODULE_TYPE}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
      <script type={on ? 'module' : 'text/plain'}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
    </div>
  )
}
`,
  props: { kind: 'text/plain', prefix: 'text/plain; m=', on: true },
  expectedHtml: `
    <div bf-s="test">
      <script bf="s0" type="text/plain">if (window.__no) {{ b("{{") }} // {</script>
      <script bf="s1" type="text/plain; m=module">if (window.__no) {{ b("{{") }} // {</script>
      <script type="module">if (window.__no) {{ b("{{") }} // {</script>
      <script bf="s2" type="module">if (window.__no) {{ b("{{") }} // {</script>
    </div>
  `,
})
