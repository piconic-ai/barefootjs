import { createFixture } from '../../src/types'

/**
 * `String.prototype.replace(pattern, replacement)` lowering — string
 * pattern form (#1448 Tier B).
 *
 * The value contains two `o`s; JS's string-pattern `.replace` swaps
 * only the FIRST one (`hello world` → `hell0 world`), so a lowering
 * that replaced all occurrences (the `.replaceAll` semantic) would
 * fail the assertion. Renders at text position so the result is
 * directly observable.
 */
export const fixture = createFixture({
  id: 'string-replace',
  description: '.replace(old, new) swaps the first occurrence',
  source: `
function StringReplace({ value }: { value: string }) {
  return <div>[{value.replace('o', '0')}]</div>
}
export { StringReplace }
`,
  props: { value: 'hello world' },
  expectedHtml: `
    <div bf-s="test" bf="s1">[<!--bf:s0-->hell0 world<!--/-->]</div>
  `,
})
