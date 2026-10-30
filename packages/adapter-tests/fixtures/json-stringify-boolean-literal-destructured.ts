import { createFixture } from '../src/types'

/**
 * A boolean inside the array `JSON.stringify` writes (a `true` /
 * `false` literal, a comparison, `!`) prints as a JSON boolean, not as
 * `1` / `0`: nested, in an attribute, text, a template literal and a loop
 * row. Perl holds a boolean as `1` / `''` / `0`.
 */
export const fixture = createFixture({
  id: 'json-stringify-boolean-literal-destructured',
  description: 'A boolean inside JSON.stringify prints true / false',
  source: `
export function JsonStringifyBooleanLiteralDestructured({ n, items }: { n: number; items: string[] }) {
  return (
    <div data-j={JSON.stringify([n, true, false])}>
      <span>{JSON.stringify([n, true, false])}</span>
      <span>{JSON.stringify([n > 0, [n === 2, !n]])}</span>
      <span>{\`j=\${JSON.stringify([false])}\`}</span>
      <span>{JSON.stringify(true)}|{JSON.stringify(false)}</span>
      <ul>{items.map(item => <li key={item}>{JSON.stringify([item, true, item === 'a'])}</li>)}</ul>
    </div>
  )
}
`,
  props: { n: 1, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s9" data-j="[1,true,false]">
      <span bf="s1"><!--bf:s0-->[1,true,false]<!--/--></span>
      <span bf="s3"><!--bf:s2-->[true,[false,false]]<!--/--></span>
      <span><!--bf:s4-->j=[false]<!--/--></span>
      <span><!--bf:s5-->true<!--/-->|<!--bf:s6-->false<!--/--></span>
      <ul bf="s8">
        <li data-key="a"><!--bf:s7-->[&quot;a&quot;,true,true]<!--/--></li>
        <li data-key="b"><!--bf:s7-->[&quot;b&quot;,true,false]<!--/--></li>
      </ul>
    </div>
  `,
})
