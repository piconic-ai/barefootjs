import { createFixture } from '../src/types'

/**
 * A literal `{{` in the text of a `<script>` whose type is a plain
 * expression or a ternary (`raw-text-brace-delimiter-script-type`): the
 * written type ends in a value computed at render time. The text prints as
 * written whatever the type.
 */
export const fixture = createFixture({
  id: 'raw-text-brace-delimiter-script-type-expression',
  description: 'A tag-opening brace in <script> text prints as written when the type is an expression or a ternary',
  source: `
export function RawTextBraceDelimiterScriptTypeExpression({ kind, on }: { kind: string; on: boolean }) {
  return (
    <div>
      <script type={kind}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
      <script type={on ? 'text/plain' : 'module'}>if (window.__no) &#123;&#123; b("&#123;&#123;") &#125;&#125; // &#123;</script>
    </div>
  )
}
`,
  props: { kind: 'text/plain', on: true },
  expectedHtml: `
    <div bf-s="test">
      <script bf="s0" type="text/plain">if (window.__no) {{ b("{{") }} // {</script>
      <script bf="s1" type="text/plain">if (window.__no) {{ b("{{") }} // {</script>
    </div>
  `,
})
