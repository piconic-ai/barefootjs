import { createFixture } from '../../src/types'

/**
 * `String.prototype.toUpperCase()` lowering (#1448 Tier A).
 *
 * The Go runtime already registers `bf_upper`; this fixture pins
 * the JS-method → helper wire-up at the parser / adapter layer.
 * Mojo's `uc` builtin handles it natively.
 */
export const fixture = createFixture({
  id: 'string-toUpperCase',
  description: '.toUpperCase() uppercases the receiver string',
  source: `
function StringToUpperCase({ value }: { value: string }) {
  return <div>{value.toUpperCase()}</div>
}
export { StringToUpperCase }
`,
  props: { value: 'Hello World' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->HELLO WORLD<!--/--></div>
  `,
})
