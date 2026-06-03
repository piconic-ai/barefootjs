import { createFixture } from '../../src/types'

/**
 * `String.prototype.padStart(target, pad)` lowering (#1448 Tier B).
 *
 * Renders at text position. A 2-char receiver padded to width 5 with
 * `0` exercises the repeat-and-truncate fill (`42` → `00042`); a
 * lowering that padded the wrong side, or off-by-one on the fill
 * width, would fail the assertion.
 */
export const fixture = createFixture({
  id: 'string-padStart',
  description: '.padStart(target, pad) left-pads to the target width',
  source: `
function StringPadStart({ value }: { value: string }) {
  return <div>[{value.padStart(5, '0')}]</div>
}
export { StringPadStart }
`,
  props: { value: '42' },
  expectedHtml: `
    <div bf-s="test" bf="s1">[<!--bf:s0-->00042<!--/-->]</div>
  `,
})
