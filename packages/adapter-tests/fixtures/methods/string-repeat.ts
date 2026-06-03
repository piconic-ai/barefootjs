import { createFixture } from '../../src/types'

/**
 * `String.prototype.repeat(n)` lowering (#1448 Tier B).
 *
 * Renders at text position. A repeat count > 1 with a 2-char receiver
 * makes an off-by-one (`n` vs `n-1`) or a no-op lowering visible in the
 * output (`ab` × 3 = `ababab`).
 */
export const fixture = createFixture({
  id: 'string-repeat',
  description: '.repeat(n) concatenates the string n times',
  source: `
function StringRepeat({ value }: { value: string }) {
  return <div>[{value.repeat(3)}]</div>
}
export { StringRepeat }
`,
  props: { value: 'ab' },
  expectedHtml: `
    <div bf-s="test" bf="s1">[<!--bf:s0-->ababab<!--/-->]</div>
  `,
})
