import { createFixture } from '../src/types'

/**
 * A boolean that a mixed left operand of `&&` / `||` yields (a
 * nested chain, a ternary with a boolean branch) prints `true` / `false`
 * as JS does, while the operand's own truthiness still decides the
 * result: in an attribute, a template literal and string concatenation,
 * on the short-circuited and the taken branch. Perl has no boolean type.
 * The `??` twin is `logical-mixed-left-nullish`.
 */
export const fixture = createFixture({
  id: 'logical-mixed-left-output',
  description: 'A boolean yielded by a mixed && / || left operand prints true / false',
  source: `
export function LogicalMixedLeftOutput(props: { n: number }) {
  return (
    <div data-direct={props.n > 0 && 'y'} data-chain={(props.n > 0 && 'y') && 'z'} data-ternary={(props.n ? 'y' : false) && 'z'} data-or={(props.n > 0 || 'y') || 'z'} data-or-ternary={(props.n ? true : '') || 'z'}>
      <span>{\`\${(props.n > 0 && 'y') && 'z'}|\${(props.n ? 'y' : false) && 'z'}|\${(props.n > 0 || 'y') || 'z'}\`}</span>
      <span>{'v=' + ((props.n > 0 && 'y') && 'z')}</span>
    </div>
  )
}
`,
  props: { n: 0 },
  dataPoints: [
    { name: 'short-circuited', props: { n: 0 } },
    { name: 'taken', props: { n: 2 } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s4" data-chain="false" data-direct="false" data-or-ternary="z" data-or="y" data-ternary="false">
      <span bf="s1"><!--bf:s0-->false|false|y<!--/--></span>
      <span bf="s3"><!--bf:s2-->v=false<!--/--></span>
    </div>
  `,
})
