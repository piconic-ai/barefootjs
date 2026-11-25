import { createFixture } from '../src/types'

/**
 * A literal `{{` (and a `{` right before the end tag) in the text of a
 * `<style>`, in HTML and in SVG content, prints as written: inside a CSS
 * string, as a doubled block brace, and as the last character. A template
 * engine that guards the brace from its own tag lexer must not print the
 * guard through an output escaped as CSS.
 */
export const fixture = createFixture({
  id: 'raw-text-brace-delimiter-style',
  description: 'A tag-opening brace in <style> text prints as written, in HTML and SVG content',
  source: `
export function RawTextBraceDelimiterStyle() {
  return (
    <div>
      <style>.s::after &#123; content: "&#123;&#123;é&#125;&#125;" &#125; .t &#123;&#123;color:red&#125;&#125; .w &#123;</style>
      <svg><style>.v &#123;&#123;fill:red&#125;&#125;</style></svg>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <style>.s::after { content: "{{é}}" } .t {{color:red}} .w {</style>
      <svg><style>.v {{fill:red}}</style></svg>
    </div>
  `,
})
