import { createFixture } from '../../src/types'

/**
 * `String.prototype.padEnd(target, pad)` lowering (#1448 Tier B).
 *
 * Sibling of `string-padStart` — pads on the right (`42` → `42...`).
 * The distinct pad char (`.`) and right side catch a lowering that
 * shared the wrong helper or padded the wrong end.
 */
export const fixture = createFixture({
  id: 'string-padEnd',
  description: '.padEnd(target, pad) right-pads to the target width',
  source: `
function StringPadEnd({ value }: { value: string }) {
  return <div>[{value.padEnd(5, '.')}]</div>
}
export { StringPadEnd }
`,
  props: { value: '42' },
  expectedHtml: `
    <div bf-s="test" bf="s1">[<!--bf:s0-->42...<!--/-->]</div>
  `,
})
