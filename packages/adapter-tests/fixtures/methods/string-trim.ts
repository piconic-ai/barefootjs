import { createFixture } from '../../src/types'

/**
 * `String.prototype.trim()` lowering (#1448 Tier A).
 *
 * The Go runtime already registers `bf_trim`; this fixture pins
 * the JS-method → helper wire-up. Mojo's regex-style strip is the
 * native equivalent. Padding both sides of the prop value so a
 * trim-front-only or trim-back-only lowering fails the assertion.
 */
export const fixture = createFixture({
  id: 'string-trim',
  description: '.trim() strips leading and trailing whitespace',
  source: `
function StringTrim({ value }: { value: string }) {
  return <div>[{value.trim()}]</div>
}
export { StringTrim }
`,
  props: { value: '   padded   ' },
  expectedHtml: `
    <div bf-s="test" bf="s1">[<!--bf:s0-->padded<!--/-->]</div>
  `,
})
