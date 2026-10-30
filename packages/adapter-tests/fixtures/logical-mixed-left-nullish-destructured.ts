import { createFixture } from '../src/types'

/**
 * `??` over a mixed left operand that can yield `false` (`(n > 0 && 'y')
 * ?? 'z'`) keeps that `false`, which is not nullish, and prints it as JS
 * does: in an attribute, a template literal and string concatenation, on
 * the short-circuited and the taken branch.
 */
export const fixture = createFixture({
  id: 'logical-mixed-left-nullish-destructured',
  description: 'A false yielded by a mixed ?? left operand is kept and prints false',
  source: `
export function LogicalMixedLeftNullishDestructured({ n }: { n: number }) {
  return (
    <div data-nullish={((n > 0) && 'y') ?? 'z'} data-ternary={(n ? 'y' : false) ?? 'z'}>
      <span>{\`\${((n > 0) && 'y') ?? 'z'}\`}</span>
      <span>{'v=' + (((n > 0) && 'y') ?? 'z')}</span>
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
    <div bf-s="test" bf="s4" data-nullish="false" data-ternary="false">
      <span bf="s1"><!--bf:s0-->false<!--/--></span>
      <span bf="s3"><!--bf:s2-->v=false<!--/--></span>
    </div>
  `,
})
