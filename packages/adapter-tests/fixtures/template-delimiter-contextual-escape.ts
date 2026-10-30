import { createFixture } from '../src/types'

/**
 * Brace-delimiter-shaped static content (`template-delimiter-static-text`)
 * where a template engine escapes output by context: a template-literal
 * URL attribute with a `{` right before an expression, and `{{` in the text
 * of a `<style>` element.
 */
export const fixture = createFixture({
  id: 'template-delimiter-contextual-escape',
  description: 'A tag-opening brace in a template-literal URL attribute and in style element text prints as written',
  source: `
export function TemplateDelimiterContextualEscape({ a }: { a: string }) {
  return (
    <div>
      <a href={\`/p{\${a}}\`}>y</a>
      <style>.b &#123;&#123;color:red&#125;&#125;</style>
    </div>
  )
}
`,
  props: { a: 'x' },
  expectedHtml: `
    <div bf-s="test">
      <a bf="s0" href="/p{x}">y</a>
      <style>.b {{color:red}}</style>
    </div>
  `,
})
