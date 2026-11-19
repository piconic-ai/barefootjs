import { createFixture } from '../src/types'

/**
 * Dynamic text in `<style>` / `<script>` is not HTML-escaped (#3934). The
 * HTML parser decodes no character reference in these elements, so
 * `a[href=&quot;x&quot;]` would reach the CSS parser with its entities. The
 * value prints as written; only the sequences that would end the element are
 * rewritten, in a form CSS / JS reads back as the same text: `</style`
 * becomes `<\/style`, and `<script` / `</script` become `<script` /
 * `</script`, in any letter case. A `<!--` cannot keep a `<script>` open
 * once no `<script` follows it, so it stays as written. The `<textarea>` is
 * the control: RCDATA decodes references and keeps the HTML escape.
 * go-template refuses a dynamic child of these elements (#3810).
 */
export const fixture = createFixture({
  id: 'raw-text-style-script-escape',
  description: 'Dynamic <style> / <script> text prints unescaped, with the element-ending sequences rewritten',
  source: `
export function RawTextStyleScriptEscape({ sel, name, json }: { sel: string; name: string; json: string }) {
  return (
    <div>
      <style>{sel + ' { color: red }'}</style>
      <style>{'.a > .b[title="'}{name}{'"] { content: "&" }'}</style>
      <script type="application/json">{json}</script>
      <script>{'var n = "' + name + '"; if (1 < 2 && n) {}'}</script>
      <textarea>{sel}</textarea>
    </div>
  )
}
`,
  props: {
    sel: 'a[href="x"] > b</style><i>',
    name: "</STYLE></ScRiPt><script>'é&amp;",
    json: '{"k":"</script><script>alert(1)</script><!-- </SCRIPT> 日本語 & \'q\'"}',
  },
  expectedHtml: `
    <div bf-s="test">
      <style bf="s1">a[href="x"]> b<\\/style><i> { color: red }</style>
      <style bf="s3">.a> .b[title="<\\/STYLE></ScRiPt><script>&#39;é&amp;"] { content: "&" }</style>
      <script bf="s5" type="application/json">{"k":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script><!-- \\u003c/SCRIPT> 日本語 & &#39;q&#39;"}</script>
      <script bf="s7">var n = "</STYLE>\\u003c/ScRiPt>\\u003cscript>&#39;é&amp;"; if (1 < 2 && n) {}</script>
      <textarea bf="s9">a[href=&quot;x&quot;] &gt; b&lt;/style&gt;&lt;i&gt;</textarea>
    </div>
  `,
})
