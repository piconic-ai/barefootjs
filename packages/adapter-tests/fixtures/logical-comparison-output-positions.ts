import { createFixture } from '../src/types'

/**
 * A comparison result that `&&` / `||` / `??` returns prints `true` /
 * `false` as JS does: in an attribute, a template literal, string
 * concatenation, a ternary branch and a loop row; as a bare text child it
 * renders nothing. Perl has no boolean type, so a native comparison result
 * must not print as `1` / `0` / `''`.
 */
export const fixture = createFixture({
  id: 'logical-comparison-output-positions',
  description: 'A comparison returned by && / || prints true / false in attributes, template literals and concatenation',
  source: `
export function LogicalComparisonOutputPositions(props: { items: string[]; n: number }) {
  return (
    <div data-and={props.items.length > 0 && 'y'} data-eq={props.n === 1 && 'y'} data-not={!props.n && 'y'} data-or={props.n > 0 || 'y'} data-pick={props.n ? (props.n < 0 && 'y') : 'x'} data-tpl={\`v=\${props.items.length > 0 && 'y'}\`} data-cat={'v=' + (props.n === 1 && 'y')} data-nn={(props.n > 1) ?? 'y'} data-right={props.items.length || props.n > 5}>
      <span>{\`\${props.n > 5 && 'y'}|\${props.n >= 0 || 'y'}\`}</span>
      <span>{'v=' + (props.items.length > 0 && 'y')}</span>
      <span>{props.items.length > 0 && 'y'}</span>
      <ul>{[1, 2].map(k => <li key={k} data-v={k > props.n && 'y'}>{\`\${k === props.n && 'y'}\`}</li>)}</ul>
    </div>
  )
}
`,
  props: { items: [], n: 2 },
  dataPoints: [
    { name: 'empty', props: { items: [], n: 2 } },
    { name: 'truthy', props: { items: ['a'], n: 1 } },
    { name: 'zero', props: { items: [], n: 0 } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s9" data-and="false" data-cat="v=false" data-eq="false" data-nn="true" data-not="false" data-or="true" data-pick="false" data-right="false" data-tpl="v=false">
      <span bf="s1"><!--bf:s0-->false|true<!--/--></span>
      <span bf="s3"><!--bf:s2-->v=false<!--/--></span>
      <span bf="s5"><!--bf-cond-start:s4--><!--bf-cond-end:s4--></span>
      <ul bf="s8">
        <li bf="s7" data-key="1" data-v="false"><!--bf:s6-->false<!--/--></li>
        <li bf="s7" data-key="2" data-v="false"><!--bf:s6-->y<!--/--></li>
      </ul>
    </div>
  `,
})
