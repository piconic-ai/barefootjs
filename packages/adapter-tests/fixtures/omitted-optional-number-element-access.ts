import { createFixture } from '../src/types'

/**
 * An optional number prop read only through a literal element access
 * (`props['count']`, `props?.['count']`), never through `props.count`. JS
 * reads both the same, so an omitted prop drops the attribute (also in a
 * loop row), renders empty text, takes the `??` fallback and tests falsy,
 * while a present `0` still renders `0`. A backend that types props by
 * value must give the prop the same nillable field a dot read gets.
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-element-access',
  description: 'An omitted optional number prop read only through props[\'x\']',
  source: `
export function OmittedOptionalNumberElementAccess(props: { count?: number; items: string[] }) {
  return (
    <div data-s={props['count']}>
      <span>{props['count']}</span>
      <span>{props?.['count']}</span>
      <span>{props['count'] ?? 'none'}</span>
      <span>{props['count'] ? 'yes' : 'no'}</span>
      {props['count'] && <b>{props['count']}</b>}
      <ul>
        {props.items.map(item => <li key={item} data-c={props['count']}>{item}</li>)}
      </ul>
    </div>
  )
}
`,
  props: { items: ['a'] },
  expectedHtml: `
    <div bf-s="test" bf="s14">
      <span bf="s1"><!--bf:s0--><!--/--></span>
      <span bf="s3"><!--bf:s2--><!--/--></span>
      <span bf="s5"><!--bf:s4-->none<!--/--></span>
      <span bf="s7"><!--bf-cond-start:s6-->no<!--bf-cond-end:s6--></span>
      <!--bf-cond-start:s8-->
      <!--bf-cond-end:s8-->
      <ul bf="s13"><li bf="s12" data-key="a"><!--bf:s11-->a<!--/--></li></ul>
    </div>
  `,
  dataPoints: [
    { name: 'zero', props: { count: 0, items: ['a'] } },
    { name: 'fraction', props: { count: 2.5, items: ['a'] } },
  ],
})
