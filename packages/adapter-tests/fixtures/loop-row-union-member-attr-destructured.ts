import { createFixture } from '../src/types'

/**
 * A loop row's member typed `string | number | boolean | null` as an
 * attribute value, a text child and, behind `??`, a template-literal part
 * (#3789): a boolean prints `true` / `false` in the attribute and the
 * template literal and nothing as a text child, a number and a string print
 * as they are, and an absent or `null` member omits the attribute and takes
 * the fallback. Perl decodes a JSON
 * boolean to a value that prints `1` / `0`.
 *
 * The props-object twin is `loop-row-union-member-attr`.
 */
export const fixture = createFixture({
  id: 'loop-row-union-member-attr-destructured',
  description: 'A union-typed loop-row member renders a boolean as true / false in an attribute',
  source: `
type Row = { id: string; v?: string | number | boolean | null }
export function LoopRowUnionMemberAttrDestructured({ rows }: { rows: Row[] }) {
  return <ul>{rows.map(r => <li key={r.id} data-v={r.v} title={\`v=\${r.v ?? 'none'}\`}>{r.id}:{r.v}</li>)}</ul>
}
`,
  props: { rows: [{ id: 'a', v: false }, { id: 'b', v: true }, { id: 'c', v: 0 }, { id: 'd', v: 1.5 }, { id: 'e', v: 's' }, { id: 'f', v: '' }, { id: 'g', v: null }, { id: 'h' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="a" data-v="false" title="v=false"><!--bf:s0-->a<!--/-->:<!--bf:s1--><!--/--></li>
      <li bf="s2" data-key="b" data-v="true" title="v=true"><!--bf:s0-->b<!--/-->:<!--bf:s1--><!--/--></li>
      <li bf="s2" data-key="c" data-v="0" title="v=0"><!--bf:s0-->c<!--/-->:<!--bf:s1-->0<!--/--></li>
      <li bf="s2" data-key="d" data-v="1.5" title="v=1.5"><!--bf:s0-->d<!--/-->:<!--bf:s1-->1.5<!--/--></li>
      <li bf="s2" data-key="e" data-v="s" title="v=s"><!--bf:s0-->e<!--/-->:<!--bf:s1-->s<!--/--></li>
      <li bf="s2" data-key="f" data-v="" title="v="><!--bf:s0-->f<!--/-->:<!--bf:s1--><!--/--></li>
      <li bf="s2" data-key="g" title="v=none"><!--bf:s0-->g<!--/-->:<!--bf:s1--><!--/--></li>
      <li bf="s2" data-key="h" title="v=none"><!--bf:s0-->h<!--/-->:<!--bf:s1--><!--/--></li>
    </ul>
  `,
})
