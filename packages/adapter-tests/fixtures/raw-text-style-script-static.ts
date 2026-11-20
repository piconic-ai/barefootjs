import { createFixture } from '../src/types'

/**
 * Static text in `<style>` / `<script>` is not HTML-escaped either (#3934):
 * JSX text (character references decoded) and a string literal child print
 * as written, with each markup-opening `<` rewritten as it is for a
 * dynamic value (`raw-text-style-script-escape`). The `<p>` is the control:
 * ordinary text keeps the HTML escape.
 */
export const fixture = createFixture({
  id: 'raw-text-style-script-static',
  description: 'Static <style> / <script> text prints unescaped, with each markup-opening < rewritten',
  source: `
export function RawTextStyleScriptStatic() {
  return (
    <div>
      <style>.c &gt; .d[title=&quot;x&quot;]::after &#123; content: &quot;&lt;/style&gt; &amp;&quot; &#125;</style>
      <script>var s = &quot;&lt;/script&gt;&lt;SCRIPT&gt;&quot;; if (1 &lt; 2 &amp;&amp; s) window.__rawTextStatic = s</script>
      <p>.c &gt; .d &amp; &quot;x&quot;</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <style>.c> .d[title="x"]::after { content: "\\3c /style> &" }</style>
      <script>var s = "\\u003c/script>\\u003cSCRIPT>"; if (1 < 2 && s) window.__rawTextStatic = s</script>
      <p>.c &gt; .d &amp; &quot;x&quot;</p>
    </div>
  `,
})
