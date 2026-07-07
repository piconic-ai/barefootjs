import { createFixture } from '../src/types'

/**
 * `<pre>` / `<code>` content where interior whitespace is meaningful.
 * The conformance normalizer collapses whitespace on BOTH sides, so
 * this can't pin exact newlines — what it does pin is that adapters
 * don't inject template-syntax artifacts (block delimiters, extra
 * indentation actions) into a whitespace-sensitive element, and that a
 * dynamic expression inside `<pre>` still gets its slot markers.
 */
export const fixture = createFixture({
  id: 'pre-whitespace',
  description: '<pre>/<code> with interior spacing and a dynamic slot',
  source: `
function PreWhitespace({ snippet }: { snippet: string }) {
  return (
    <pre><code>const x = 1;  {snippet}</code></pre>
  )
}
export { PreWhitespace }
`,
  props: { snippet: 'const y = 2;' },
  expectedHtml: `
    <pre bf-s="test"><code bf="s1">const x = 1; <!--bf:s0-->const y = 2;<!--/--></code></pre>
  `,
})
