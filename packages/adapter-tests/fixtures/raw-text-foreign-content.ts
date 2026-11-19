import { createFixture } from '../src/types'

/**
 * A `<style>` / `<script>` written in HTML but rendered inside foreign
 * content (#3934). `Css` and `Data` are HTML to their own template, and the
 * caller places them in an `<svg>`: there the HTML
 * parser reads the element's text as ordinary markup, not raw text, so a
 * value such as `<img onerror=…>` would be a real tag (one that breaks out
 * of the SVG), and `&quot;` would be decoded to a quote that ends the string
 * the value sits in. The component cannot know where its markup lands, so the
 * text never holds a `<` that could begin markup or an `&` that could begin
 * a character reference: each is written as its CSS / JS escape, which
 * reads the same under both parses. A `<` followed
 * by a space, a digit or `=` begins nothing and stays as written.
 * go-template refuses a dynamic child of these elements (#3810).
 */
export const fixture = createFixture({
  id: 'raw-text-foreign-content',
  description: 'A component-rooted <style> / <script> placed in an <svg> holds no markup',
  source: `
function Css({ css }: { css: string }) {
  return <style>{'<'}{css}</style>
}

function Data({ js }: { js: string }) {
  return <script type="text/plain">{js}</script>
}

export function RawTextForeignContent({ css, js }: { css: string; js: string }) {
  return (
    <div>
      <svg>
        <Css css={css} />
        <Data js={js} />
      </svg>
    </div>
  )
}
`,
  props: {
    css: 'img class="pwn"><i class="pwn"></style><!--<?x <![CDATA[ a < b <= 1',
    js: '<img class="pwn"></script><a class="pwn">&quot;+alert(1)+&#34; if (1 < 2 && 3 <= 4) {}',
  },
  expectedHtml: `
    <div bf-s="test"><svg><style bf-s="test_s0" bf="s1">\\3c img class="pwn">\\3c i class="pwn">\\3c /style>\\3c !--\\3c ?x \\3c ![CDATA[ a < b <= 1</style><script bf-s="test_s1" bf="s1" type="text/plain">\\u003cimg class="pwn">\\u003c/script>\\u003ca class="pwn">\\u0026quot;+alert(1)+\\u0026#34; if (1 < 2 && 3 <= 4) {}</script></svg></div>
  `,
})
