import { createFixture } from '../src/types'

/**
 * `+` and template-literal shapes whose JS answer needs the runtimes to
 * carry `undefined` apart from `null` (#3848; `spec/js-undefined-value.md`
 * §7 (4)). Until then the template adapters keep today's output, pinned
 * here so each U step can graduate it:
 *
 * - a string operand whose type admits both absence and `null`
 *   (`c?: string | null`), omitted: JS gives `"btn undefined"`; the adapters
 *   read the nil as the empty string;
 * - a `+` whose other operand Phase 1 cannot type, over an omitted optional
 *   number: JS gives `"undefinedx"` against a string; the runtime's `plus`
 *   reads the nil as `null` (`"nullx"`);
 * - a template-literal part Phase 1 cannot type (an out-of-range index
 *   read): JS gives `"undefined"`; the runtime's `to_string` reads the nil
 *   as `null`.
 */
export const fixture = createFixture({
  id: 'awaits-undefined-plus-shapes',
  description: 'A + or template literal over an either-nil string, a dynamic + over an omitted number, and an untyped nil part (await undefined support)',
  source: `
export function AwaitsUndefinedPlusShapes(props: { c?: string | null; n?: number; x: any; items: string[] }) {
  return (
    <p data-c={'btn ' + props.c} data-t={\`btn \${props.c}\`}>
      {'btn ' + props.c}|{props.n + props.x}|{\`\${props.items[5]}\`}
    </p>
  )
}
`,
  props: { x: 'x', items: ['a'] },
  expectedHtml: `
    <p bf-s="test" bf="s3" data-c="btn undefined" data-t="btn undefined"><!--bf:s0-->btn undefined<!--/-->|<!--bf:s1-->undefinedx<!--/-->|<!--bf:s2-->undefined<!--/--></p>
  `,
})
