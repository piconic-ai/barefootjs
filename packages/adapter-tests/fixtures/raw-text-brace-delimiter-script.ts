import { createFixture } from '../src/types'

/**
 * A literal `{{` (and a `{` right before the end tag) in the text of a
 * `<script>` prints as written, whatever the script's type: a classic
 * script (a block, a string, a regular expression, a trailing comment), a
 * JSON-LD block, a non-JavaScript type whose text reads as markup, and a
 * module. A template engine that guards the brace
 * from its own tag lexer must not print the guard through an output
 * escaped as JavaScript.
 */
export const fixture = createFixture({
  id: 'raw-text-brace-delimiter-script',
  description: 'A tag-opening brace in <script> text prints as written for a classic, JSON-LD, non-JS and module script',
  source: `
export function RawTextBraceDelimiterScript() {
  return (
    <div>
      <script>if (window) &#123;&#123; window.__braceBlock = "&#123;&#123;é&#125;&#125;".length + /\\&#123;&#123;2&#125;/.source.length &#125;&#125; // &#123;</script>
      <script type="application/ld+json">&#123;"name":"&#123;&#123;name&#125;&#125;","n":&#123;"m":1&#125;&#125;</script>
      <script type="text/template">&lt;a href="/p&#123;&#123;id&#125;&#125;" title='&#123;&#123;t&#125;&#125;'&gt;&#123;&#123;label&#125;&#125; &amp;amp; &#123;&lt;/a&gt;</script>
      <script type="module">window.__braceModule = [&#123; a: &#123; b: "&#123;&#123;" &#125; &#125;].length // &#123;&#123;</script>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <script>if (window) {{ window.__braceBlock = "{{é}}".length + /\\{{2}/.source.length }} // {</script>
      <script type="application/ld+json">{"name":"{{name}}","n":{"m":1}}</script>
      <script type="text/template">\\u003ca href="/p{{id}}" title=&#39;{{t}}&#39;>{{label}} \\u0026amp; {\\u003c/a></script>
      <script type="module">window.__braceModule = [{ a: { b: "{{" } }].length // {{</script>
    </div>
  `,
})
